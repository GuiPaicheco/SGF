-- Reativação por nova importação; prioridade dos dados CNES aceitos sem reescrever afastamentos.
create or replace function private.integrate_cnes_entry(actor_id uuid,target_entry uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare e private.cnes_registry_entries%rowtype;m private.rh_registry_bonds%rowtype;person uuid;bond uuid;location uuid;canonical_cns text;
begin
 perform private.require_cnes_import_admin(actor_id);
 select * into e from private.cnes_registry_entries where id=target_entry for update;
 if not found or coalesce(e.source_data->>'origin','')='manual' or lower(e.source_data->>'status')<>'ativo' then raise exception 'RH_ENTRY_REVIEW_REQUIRED';end if;
 canonical_cns:=coalesce(e.source_data->>'principalCns',e.source_data->>'cns');
 if canonical_cns is null or canonical_cns !~ '^[0-9]{15}$' then raise exception 'CNES_COLLECTION_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('cnes-person:'||canonical_cns,0));
 select * into m from private.rh_registry_bonds where entry_id=e.id;
 person:=e.servidor_id;
 if person is null then select servidor_id into person from private.cnes_people where private.cnes_people.cns=canonical_cns;end if;
 select lotacao_id into location from private.rh_unit_accounts where cnes_unit_id=e.cnes_unit_id;
 if location is null then raise exception 'RH_UNIT_INVALID';end if;
 if person is null then
  insert into public.servidores(full_name,matricula,employment_type,lotacao_id,declared_position)
   values(e.source_data->>'fullName',null,case when upper(e.source_data->>'relationshipType') like '%EFETIVO%' then 'efetivo' else e.source_data->>'relationshipType' end,location,e.source_data->>'occupation') returning id into person;
 end if;
 insert into private.cnes_people(cns,servidor_id) values(canonical_cns,person) on conflict do nothing;
 if exists(select 1 from private.cnes_people p where p.cns=canonical_cns and p.servidor_id<>person) then raise exception 'CNES_AMBIGUOUS_SOURCE_IDENTITY';end if;
 bond:=m.bond_id;
 if bond is null and e.servidor_id is not null then
  select b.id into bond from public.employment_bonds b where b.servidor_id=e.servidor_id and b.active
   and exists(select 1 from public.employment_bond_units u where u.bond_id=b.id and u.cnes_unit_id=e.cnes_unit_id)
   and not exists(select 1 from private.rh_registry_bonds x where x.bond_id=b.id)
   and (select count(*) from public.employment_bonds b2 where b2.servidor_id=e.servidor_id and b2.active)=1;
  if bond is null then raise exception 'CNES_AMBIGUOUS_SOURCE_IDENTITY';end if;
 end if;
 if bond is null then
  insert into public.employment_bonds(servidor_id,registration,employment_type,pole_cnes_unit_id,source)
   values(person,null,case when upper(e.source_data->>'relationshipType') like '%EFETIVO%' then 'efetivo' else e.source_data->>'relationshipType' end,e.cnes_unit_id,'cadastro_administrativo') returning id into bond;
  insert into public.employment_bond_units(bond_id,cnes_unit_id,source) values(bond,e.cnes_unit_id,'cadastro_administrativo');
 end if;
 update public.servidores set full_name=e.source_data->>'fullName',declared_position=e.source_data->>'occupation',updated_at=now() where id=person;
 update private.cnes_registry_entries set servidor_id=person,review_status='reviewed',local_data=local_data-'fullName'-'municipalPosition'-'weeklyHours'-'teamLabel' where id=e.id;
 insert into private.rh_registry_bonds(entry_id,bond_id,entry_version,confirmed_by) values(e.id,bond,e.version,actor_id)
  on conflict(entry_id) do update set entry_version=excluded.entry_version,version=rh_registry_bonds.version+1,confirmed_by=actor_id,confirmed_at=now();
end $$;
create or replace function public.apply_cnes_reviewed(actor_id uuid,target_cnes uuid,items jsonb,collection_digest text,collected_at timestamptz,
 competence text,expected_revision bigint,absent_ids jsonb,present_ids jsonb,metadata jsonb) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='15s' as $$
declare result jsonb;e private.cnes_registry_entries%rowtype;state_row private.cnes_registry_state%rowtype;run_id uuid;
begin
 perform private.require_cnes_import_admin(actor_id);
 if competence is null or competence !~ '^[0-9]{4}(0[1-9]|1[0-2])$' or jsonb_typeof(absent_ids)<>'array' or jsonb_typeof(present_ids)<>'array'
  or jsonb_typeof(metadata)<>'object' or octet_length(metadata::text)>1000 then raise exception 'CNES_COLLECTION_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('cnes-registry:'||target_cnes::text,0));
 result:=public.cnes_import_status(actor_id,target_cnes,collection_digest);
 if result is not null then return result;end if;
 if jsonb_array_length(items)=0 then
  if collection_digest is null or collection_digest !~ '^[a-f0-9]{64}$' or collected_at is null or collected_at>now()+interval '5 minutes'
   or not exists(select 1 from public.cnes_units where id=target_cnes and active) then raise exception 'CNES_COLLECTION_INVALID';end if;
  insert into private.cnes_registry_state(cnes_unit_id) values(target_cnes) on conflict do nothing;
  select * into state_row from private.cnes_registry_state where cnes_unit_id=target_cnes for update;
  if expected_revision is null or state_row.revision<>expected_revision then raise exception 'CNES_VERSION_CONFLICT';end if;
  if state_row.last_collected_at is not null and collected_at<state_row.last_collected_at then raise exception 'CNES_STALE_COLLECTION';end if;
  insert into private.cnes_import_runs(cnes_unit_id,digest,actor_id,collected_at,competence,added,changed,absent)
   values(target_cnes,collection_digest,actor_id,collected_at,competence,0,0,jsonb_array_length(absent_ids)) returning id into run_id;
  update private.cnes_registry_state set revision=revision+1,last_collected_at=collected_at where cnes_unit_id=target_cnes;
  result:=jsonb_build_object('status','applied','run_id',run_id);
 else
  result:=public.apply_cnes_registry_import(actor_id,target_cnes,items,collection_digest,collected_at,competence,expected_revision);
 end if;
 for e in select * from private.cnes_registry_entries where cnes_unit_id=target_cnes and source_id in (select jsonb_array_elements_text(present_ids)) loop
  update private.cnes_registry_entries set source_competence=competence,source_metadata=metadata where id=e.id;
  perform private.integrate_cnes_entry(actor_id,e.id);
 end loop;
 -- Ausência confirmada bloqueia novos lançamentos e operadores, preservando vínculo e todos os afastamentos.
 update private.cnes_registry_entries set source_hash=encode(sha256(convert_to(jsonb_set(source_data,'{status}','"inativo"')::text,'UTF8')),'hex'),source_data=jsonb_set(source_data,'{status}','"inativo"'),review_status='reviewed',version=version+1,
  source_competence=competence,source_metadata=metadata,updated_at=now()
  where cnes_unit_id=target_cnes and source_id in(select jsonb_array_elements_text(absent_ids));
 insert into public.audit_events(actor_id,actor_role,action,entity_type,context_cnes_unit_id,new_value)
  values(actor_id,'administrador','cnes_reviewed_import','cnes_registry',target_cnes,jsonb_build_object('competence',competence,'present',present_ids,'absent',absent_ids));
 return result;
end $$;
