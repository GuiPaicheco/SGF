-- Integração cadastral e calendário de leitura. Modalidades/saldos aguardam decisão.
create table private.rh_registry_bonds (
 entry_id uuid primary key references private.cnes_registry_entries(id) on delete restrict,
 bond_id uuid not null references public.employment_bonds(id) on delete restrict,
 entry_version integer not null,
 version integer not null default 1,
 confirmed_by uuid not null references public.profiles(id),
 confirmed_at timestamptz not null default now()
);
create index rh_registry_bonds_bond_idx on private.rh_registry_bonds(bond_id);
create index rh_registry_bonds_actor_idx on private.rh_registry_bonds(confirmed_by);
alter table private.rh_registry_bonds enable row level security;
revoke all on private.rh_registry_bonds from public,anon,authenticated;
grant select,insert,update on private.rh_registry_bonds to service_role;

create function public.rh_registry_bond_options(actor_id uuid,target_entry uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare entry private.cnes_registry_entries%rowtype;
begin
 perform private.require_cnes_import_admin(actor_id);
 select * into entry from private.cnes_registry_entries where id=target_entry;
 if not found then raise exception 'RH_ENTRY_INVALID';end if;
 return jsonb_build_object('entry_id',entry.id,'entry_version',entry.version,'review_status',entry.review_status,
  'full_name',coalesce(entry.local_data->>'fullName',entry.source_data->>'fullName'),
  'registration',entry.local_data->>'registration','position',entry.local_data->>'municipalPosition',
  'admission_date',entry.local_data->>'admissionDate','employment_type',entry.local_data->>'employmentType',
  'binding',(select to_jsonb(x) from private.rh_registry_bonds x where x.entry_id=target_entry),
  'bonds',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'registration',b.registration,
    'full_name',s.full_name,'pole_cnes_unit_id',b.pole_cnes_unit_id)) from public.employment_bonds b
    join public.servidores s on s.id=b.servidor_id where upper(b.registration)=upper(entry.local_data->>'registration')
      and b.active and s.active and exists(select 1 from public.employment_bond_units u where u.bond_id=b.id and u.cnes_unit_id=entry.cnes_unit_id and u.active)),'[]'));
end $$;

create function public.rh_bind_registry_bond(actor_id uuid,target_entry uuid,expected_entry_version integer,
 target_bond uuid,expected_binding_version integer,confirm_pole boolean,target_reason text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare entry private.cnes_registry_entries%rowtype; binding private.rh_registry_bonds%rowtype;
 bond public.employment_bonds%rowtype;person uuid;location uuid;unit_id uuid;canonical_registration text;
begin
 perform private.require_cnes_import_admin(actor_id);
 if confirm_pole is distinct from true or target_reason is null or length(btrim(target_reason)) not between 3 and 500
   or expected_entry_version is null or expected_binding_version is null then raise exception 'RH_BINDING_INPUT_INVALID';end if;
 select cnes_unit_id into unit_id from private.cnes_registry_entries where id=target_entry;
 if unit_id is null then raise exception 'RH_ENTRY_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('cnes-registry:'||unit_id::text,0));
 select * into entry from private.cnes_registry_entries where id=target_entry for update;
 if entry.version<>expected_entry_version then raise exception 'RH_VERSION_CONFLICT';end if;
 if entry.review_status<>'reviewed' or lower(entry.source_data->>'status') is distinct from 'ativo'
   or nullif(entry.source_data->>'deactivationCompetence','') is not null then raise exception 'RH_ENTRY_REVIEW_REQUIRED';end if;
 canonical_registration:=upper(nullif(btrim(entry.local_data->>'registration'),''));
 if canonical_registration is null or nullif(btrim(entry.local_data->>'municipalPosition'),'') is null
  or nullif(entry.local_data->>'admissionDate','') is null or nullif(btrim(entry.local_data->>'employmentType'),'') is null
  or nullif(btrim(coalesce(entry.local_data->>'fullName',entry.source_data->>'fullName')),'') is null
  then raise exception 'RH_ENTRY_REVIEW_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('cnes-registration:'||canonical_registration,0));
 select * into binding from private.rh_registry_bonds where entry_id=target_entry for update;
 if coalesce(binding.version,0)<>expected_binding_version then raise exception 'RH_VERSION_CONFLICT';end if;
 if binding.bond_id is not null and target_bond is distinct from binding.bond_id then raise exception 'RH_BINDING_IMMUTABLE';end if;
 if target_bond is null then
  if entry.servidor_id is not null or exists(select 1 from public.servidores where upper(matricula)=canonical_registration)
    or exists(select 1 from public.employment_bonds where upper(public.employment_bonds.registration)=canonical_registration)
    then raise exception 'RH_EXISTING_BOND_REQUIRED';end if;
  select a.lotacao_id into location from private.rh_unit_accounts a where a.cnes_unit_id=unit_id and a.profile_id is not null;
  if location is null then raise exception 'RH_UNIT_INVALID';end if;
  insert into public.servidores(full_name,matricula,admission_date,employment_type,lotacao_id,declared_position)
  values(coalesce(entry.local_data->>'fullName',entry.source_data->>'fullName'),canonical_registration,
   (entry.local_data->>'admissionDate')::date,entry.local_data->>'employmentType',location,entry.local_data->>'municipalPosition') returning id into person;
  insert into public.employment_bonds(servidor_id,registration,admission_date,employment_type,pole_cnes_unit_id,source)
  values(person,canonical_registration,(entry.local_data->>'admissionDate')::date,entry.local_data->>'employmentType',unit_id,'cadastro_administrativo') returning * into bond;
  insert into public.employment_bond_units(bond_id,cnes_unit_id,source) values(bond.id,unit_id,'cadastro_administrativo');
 else
  select * into bond from public.employment_bonds where id=target_bond for update;
  if not found or not bond.active or upper(bond.registration)<>canonical_registration
    or (entry.servidor_id is not null and entry.servidor_id<>bond.servidor_id)
    or not exists(select 1 from public.servidores where id=bond.servidor_id and active)
    or not exists(select 1 from public.employment_bond_units where bond_id=bond.id and cnes_unit_id=unit_id and active)
    then raise exception 'RH_BOND_OUT_OF_UNIT';end if;
  if bond.pole_cnes_unit_id is not null and bond.pole_cnes_unit_id<>unit_id then raise exception 'RH_POLE_CONFLICT';end if;
  if bond.pole_cnes_unit_id is null then
   update public.employment_bonds set pole_cnes_unit_id=unit_id,version=version+1 where id=bond.id;
  end if;
  person:=bond.servidor_id;
 end if;
 update private.cnes_registry_entries set servidor_id=person,version=version+1,updated_at=now() where id=target_entry;
 update private.cnes_registry_state set revision=revision+1 where cnes_unit_id=unit_id;
 insert into private.rh_registry_bonds(entry_id,bond_id,entry_version,confirmed_by)
 values(target_entry,bond.id,entry.version+1,actor_id)
 on conflict(entry_id) do update set entry_version=excluded.entry_version,version=rh_registry_bonds.version+1,confirmed_by=actor_id,confirmed_at=now()
 returning * into binding;
 insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_bond_id,context_cnes_unit_id,reason,new_value)
 values(actor_id,'administrador','rh_registry_bond_confirmed','cnes_registry',target_entry,bond.id,unit_id,btrim(target_reason),
  jsonb_build_object('bond_id',bond.id,'registration',canonical_registration,'pole_cnes_unit_id',unit_id,'binding_version',binding.version));
 return jsonb_build_object('bond_id',bond.id,'entry_version',entry.version+1,'binding_version',binding.version);
end $$;

-- Projeção sem CNS/CPF e sem criar vínculo por semelhança de nome.
create function private.rh_calendar_employees(target_cnes uuid)
returns table(row_id uuid,entry_id uuid,bond_id uuid,full_name text,registration text,"position" text,cbo text,team text,
 weekly_hours numeric,origin text,review_pending boolean,binding_confirmed boolean)
language sql stable security invoker set search_path='' as $$
 select e.id,e.id,coalesce(m.bond_id,legacy.id),coalesce(e.local_data->>'fullName',e.source_data->>'fullName'),
 e.local_data->>'registration',e.local_data->>'municipalPosition',e.source_data->>'cbo',
 coalesce(e.local_data->>'teamLabel',(select string_agg(t->>'name',', ' order by t->>'name') from jsonb_array_elements(coalesce(e.source_data->'teams','[]')) t)),
 coalesce(e.local_data->>'weeklyHours',e.source_data->>'weeklyHours')::numeric,'cnes',e.review_status<>'reviewed',
 m.bond_id is not null and m.entry_version=e.version and e.review_status='reviewed' and b.active and b.pole_cnes_unit_id=target_cnes
 from private.cnes_registry_entries e left join private.rh_registry_bonds m on m.entry_id=e.id
 left join public.employment_bonds b on b.id=m.bond_id
 left join public.employment_bonds legacy on m.bond_id is null and legacy.servidor_id=e.servidor_id
   and upper(legacy.registration)=upper(e.local_data->>'registration') and legacy.active
 where e.cnes_unit_id=target_cnes and lower(e.source_data->>'status')='ativo' and nullif(e.source_data->>'deactivationCompetence','') is null
 union all
 select b.id,null,b.id,s.full_name,b.registration,coalesce(c.name,s.declared_position),null,s.team_name,u.weekly_hours::numeric,'legado',true,false
 from public.employment_bonds b join public.servidores s on s.id=b.servidor_id and s.active
 left join public.cargos c on c.id=b.cargo_id
 join lateral(select x.weekly_hours from public.employment_bond_units x where x.bond_id=b.id and x.cnes_unit_id=target_cnes and x.active order by x.id limit 1) u on true
 where b.active and not exists(select 1 from private.cnes_registry_entries e left join private.rh_registry_bonds m on m.entry_id=e.id
  where e.cnes_unit_id=target_cnes and lower(e.source_data->>'status')='ativo' and nullif(e.source_data->>'deactivationCompetence','') is null
    and (m.bond_id=b.id or (e.servidor_id=b.servidor_id and upper(e.local_data->>'registration')=upper(b.registration))));
$$;

create function public.rh_calendar_month(target_profile uuid,target_session uuid,target_cnes uuid,target_month date,page_index integer default 0,search_text text default '') returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
declare selection jsonb;context jsonb;unit_id uuid;employees jsonb;bond_ids uuid[];rows_count integer;last_day date;result jsonb;
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'RH_NOT_ALLOWED';end if;
 if target_month is null or target_month<>date_trunc('month',target_month)::date or target_month not between date '1900-01-01' and date '2100-12-01'
  or page_index is null or page_index not between 0 and 100 or search_text is null or length(search_text)>120 then raise exception 'RH_INPUT_INVALID';end if;
 context:=public.rh_account_context(target_profile);
 if context is not null then
  selection:=public.rh_session_state(target_profile,target_session);
  if selection->'operator'='null'::jsonb then raise exception 'RH_OPERATOR_REQUIRED';end if;
  unit_id:=(context->>'cnes_unit_id')::uuid;
  if target_cnes is not null and target_cnes<>unit_id then raise exception 'RH_BOND_OUT_OF_UNIT';end if;
 else
  perform private.require_cnes_import_admin(target_profile);
  unit_id:=target_cnes;
  if not exists(select 1 from public.cnes_units where id=unit_id and active) then raise exception 'RH_UNIT_INVALID';end if;
  context:=(select jsonb_build_object('cnes_unit_id',id,'cnes_code',code,'cnes_name',name,'role','administrador') from public.cnes_units where id=unit_id);
 end if;
 last_day:=(target_month+interval '1 month')::date-1;
 select count(*) into rows_count from private.rh_calendar_employees(unit_id) r where search_text='' or
  position(lower(search_text) in lower(concat_ws(' ',r.full_name,r.registration,r.position,r.cbo,r.team)))>0;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.full_name,r.row_id),'[]'),array_agg(distinct r.bond_id) filter(where r.bond_id is not null)
 into employees,bond_ids from (select * from private.rh_calendar_employees(unit_id) r where search_text='' or
  position(lower(search_text) in lower(concat_ws(' ',r.full_name,r.registration,r.position,r.cbo,r.team)))>0
  order by r.full_name,r.row_id limit 50 offset page_index*50) r;
 result:=jsonb_build_object('context',context,'operator',selection->'operator','month',target_month,'employees',employees,'total',rows_count,
  'absences',coalesce((select jsonb_agg(to_jsonb(a) order by a.start_date,a.id,a.sequence) from (
   select v.id,v.context_bond_id bond_id,v.protocol,v.type,v.status,p.sequence,p.start_date,p.end_date,p.return_date,'legado'::text origin,
    coalesce((select jsonb_agg(d.responsibility_date order by d.responsibility_date) from public.request_day_responsibilities d
     where d.request_id=v.id and d.cnes_unit_id=unit_id and d.responsibility_date between target_month and last_day),'[]') assigned_dates,
    exists(select 1 from public.request_day_responsibilities d where d.request_id=v.id) distributed
   from public.vacation_requests v join public.request_periods p on p.request_id=v.id
   where v.context_bond_id=any(coalesce(bond_ids,'{}'::uuid[])) and v.status not in ('cancelada','rejeitada','rascunho','devolvida')
    and p.start_date<=last_day and p.end_date>=target_month
    and ((v.context_cnes_unit_id=unit_id and v.status in ('programada','reprogramada','concluida'))
      or exists(select 1 from public.request_unit_reviews r where r.request_id=v.id and r.cnes_unit_id=unit_id and r.status='programada'))
   order by p.start_date,v.id,p.sequence limit 1001) a),'[]'),
  'holidays',coalesce((select jsonb_agg(jsonb_build_object('date',event_date,'name',name,'type',type) order by event_date) from public.calendar_events where active and event_date between target_month and last_day),'[]'));
 if jsonb_array_length(result->'absences')>1000 then raise exception 'RH_CALENDAR_LIMIT';end if;
 return result;
end $$;

do $$ declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname in ('rh_registry_bond_options','rh_bind_registry_bond','rh_calendar_month'))
  or (n.nspname='private' and p.proname='rh_calendar_employees') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);
  execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
