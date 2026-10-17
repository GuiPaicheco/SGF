-- Cadastro CNES separado do legado: não inventar CPF, matrícula ou conta Auth.
-- Somente Edge Function autenticada como Administrador acessa estas operações.
create table private.cnes_registry_state (
  cnes_unit_id uuid primary key references public.cnes_units(id) on delete restrict,
  revision bigint not null default 0 check(revision>=0),
  last_collected_at timestamptz
);
create table private.cnes_registry_entries (
  id uuid primary key default gen_random_uuid(),
  cnes_unit_id uuid not null references public.cnes_units(id) on delete restrict,
  source_id text not null check(source_id ~ '^[a-f0-9]{64}$'),
  source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
  source_data jsonb not null check(jsonb_typeof(source_data)='object'),
  local_data jsonb not null default '{}' check(jsonb_typeof(local_data)='object'),
  servidor_id uuid references public.servidores(id) on delete restrict,
  review_status text not null default 'pending' check(review_status in ('pending','reviewed')),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(cnes_unit_id,source_id)
);
create index cnes_registry_legacy_idx on private.cnes_registry_entries(servidor_id) where servidor_id is not null;
create index cnes_registry_page_idx on private.cnes_registry_entries(cnes_unit_id,created_at,id);
create table private.cnes_import_runs (
  id uuid primary key default gen_random_uuid(),
  cnes_unit_id uuid not null references public.cnes_units(id) on delete restrict,
  digest text not null check(digest ~ '^[a-f0-9]{64}$'),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  collected_at timestamptz not null,
  competence text check(competence is null or competence ~ '^[0-9]{4}(0[1-9]|1[0-2])$'),
  added integer not null, changed integer not null, absent integer not null,
  created_at timestamptz not null default now(),
  unique(cnes_unit_id,digest)
);
create index cnes_import_actor_idx on private.cnes_import_runs(actor_id);
alter table private.cnes_registry_state enable row level security;
alter table private.cnes_registry_entries enable row level security;
alter table private.cnes_import_runs enable row level security;
revoke all on private.cnes_registry_state,private.cnes_registry_entries,private.cnes_import_runs from public,anon,authenticated;
grant select,insert,update on private.cnes_registry_state,private.cnes_registry_entries to service_role;
grant select,insert on private.cnes_import_runs to service_role;

create function private.require_cnes_import_admin(actor_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare headers jsonb := coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role'
    or headers->>'x-sgf-role' is distinct from 'administrador'
    or headers->>'x-sgf-actor' is distinct from actor_id::text
    or not exists(select 1 from public.profiles p where p.id=actor_id and p.disabled_at is null
      and not p.must_change_password and 'administrador'=any(p.roles)) then
    raise exception 'CNES_ADMIN_REQUIRED' using errcode='42501';
  end if;
end $$;
revoke all on function private.require_cnes_import_admin(uuid) from public,anon,authenticated;
grant execute on function private.require_cnes_import_admin(uuid) to service_role;

create function public.cnes_registry_snapshot(actor_id uuid,target_cnes uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
  perform private.require_cnes_import_admin(actor_id);
  if not exists(select 1 from public.cnes_units where id=target_cnes and active) then raise exception 'CNES_UNIT_INVALID';end if;
  if (select count(*) from private.cnes_registry_entries where cnes_unit_id=target_cnes)>5000 then raise exception 'CNES_REGISTRY_LIMIT';end if;
  select jsonb_build_object('revision',coalesce((select revision from private.cnes_registry_state where cnes_unit_id=target_cnes),0),
    'entries',coalesce((select jsonb_agg(jsonb_build_object('source_id',e.source_id,'source_hash',e.source_hash,
      'source_data',e.source_data,'local_data',e.local_data) order by e.source_id)
      from private.cnes_registry_entries e where e.cnes_unit_id=target_cnes),'[]'::jsonb)) into result;
  return result;
end $$;

create function public.apply_cnes_registry_import(actor_id uuid,target_cnes uuid,items jsonb,
  collection_digest text,collected_at timestamptz,competence text,expected_revision bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare state_row private.cnes_registry_state%rowtype; item jsonb; existing_id uuid;
  added_count integer:=0;changed_count integer:=0;absent_count integer;run_id uuid;affected integer;
begin
  perform private.require_cnes_import_admin(actor_id);
  if not exists(select 1 from public.cnes_units where id=target_cnes and active) then raise exception 'CNES_UNIT_INVALID';end if;
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 5000
    or octet_length(items::text)>4000000 or collection_digest !~ '^[a-f0-9]{64}$' or collection_digest is null
    or expected_revision is null or expected_revision<0 or collected_at is null or collected_at>now()+interval '5 minutes'
    or (competence is not null and competence !~ '^[0-9]{4}(0[1-9]|1[0-2])$') then raise exception 'CNES_COLLECTION_INVALID';end if;
  if exists(select 1 from jsonb_array_elements(items) row_item where jsonb_typeof(row_item) is distinct from 'object'
    or coalesce(row_item->>'sourceId','') !~ '^[a-f0-9]{64}$' or coalesce(row_item->>'sourceHash','') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(row_item->'sourceData') is distinct from 'object'
    or coalesce(row_item->'sourceData'->>'cns','') !~ '^[0-9]{15}$'
    or coalesce(row_item->'sourceData'->>'cbo','') !~ '^[0-9]{6}$'
    or length(coalesce(row_item->'sourceData'->>'fullName','')) not between 1 and 180)
    or (select count(distinct row_item->>'sourceId') from jsonb_array_elements(items) row_item)<>jsonb_array_length(items)
    then raise exception 'CNES_COLLECTION_INVALID';end if;
  -- Mesmo lock para importação e conferência: resposta antiga nunca sobrescreve edição nova.
  perform pg_advisory_xact_lock(hashtextextended('cnes-registry:'||target_cnes::text,0));
  select id into run_id from private.cnes_import_runs where cnes_unit_id=target_cnes and digest=collection_digest;
  if found then return jsonb_build_object('status','already_applied','run_id',run_id);end if;
  insert into private.cnes_registry_state(cnes_unit_id) values(target_cnes) on conflict do nothing;
  select * into state_row from private.cnes_registry_state where cnes_unit_id=target_cnes for update;
  if state_row.revision<>expected_revision then raise exception 'CNES_VERSION_CONFLICT';end if;
  if state_row.last_collected_at is not null and collected_at<state_row.last_collected_at then raise exception 'CNES_STALE_COLLECTION';end if;
  select count(*) into absent_count from private.cnes_registry_entries e where e.cnes_unit_id=target_cnes
    and not exists(select 1 from jsonb_array_elements(items) row_item where row_item->>'sourceId'=e.source_id);
  if (select count(*) from private.cnes_registry_entries where cnes_unit_id=target_cnes)
    +(select count(*) from jsonb_array_elements(items) row_item where not exists(select 1 from private.cnes_registry_entries e
      where e.cnes_unit_id=target_cnes and e.source_id=row_item->>'sourceId'))>5000 then raise exception 'CNES_REGISTRY_LIMIT';end if;
  for item in select value from jsonb_array_elements(items) loop
    insert into private.cnes_registry_entries(cnes_unit_id,source_id,source_hash,source_data)
      values(target_cnes,item->>'sourceId',item->>'sourceHash',item->'sourceData')
      on conflict(cnes_unit_id,source_id) do nothing returning id into existing_id;
    if found then added_count:=added_count+1;
    else
      update private.cnes_registry_entries set source_hash=item->>'sourceHash',source_data=item->'sourceData',
        review_status='pending',version=version+1,updated_at=now()
        where cnes_unit_id=target_cnes and source_id=item->>'sourceId' and source_hash<>item->>'sourceHash';
      get diagnostics affected=row_count;changed_count:=changed_count+affected;
    end if;
  end loop;
  -- Nenhuma exclusão/desativação automática; local_data e servidor_id nunca são sobrescritos.
  update private.cnes_registry_state set revision=revision+1,last_collected_at=collected_at where cnes_unit_id=target_cnes;
  insert into private.cnes_import_runs(cnes_unit_id,digest,actor_id,collected_at,competence,added,changed,absent)
    values(target_cnes,collection_digest,actor_id,collected_at,competence,added_count,changed_count,absent_count) returning id into run_id;
  return jsonb_build_object('status','applied','run_id',run_id,'added',added_count,'changed',changed_count,
    'absent_preserved',absent_count,'revision',state_row.revision+1);
end $$;

create function public.list_cnes_registry(actor_id uuid,target_cnes uuid,page_index integer default 0) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
  perform private.require_cnes_import_admin(actor_id);
  if page_index is null or page_index<0 or page_index>100 then raise exception 'CNES_PAGE_INVALID';end if;
  return jsonb_build_object('entries',coalesce((select jsonb_agg(to_jsonb(r)) from (
    select id,source_data,local_data,servidor_id,review_status,version from private.cnes_registry_entries
    where cnes_unit_id=target_cnes order by created_at,id limit 50 offset page_index*50) r),'[]'::jsonb),
    'total',(select count(*) from private.cnes_registry_entries where cnes_unit_id=target_cnes),'page',page_index);
end $$;

create function public.review_cnes_registry_entry(actor_id uuid,target_entry uuid,expected_version integer,
  local_values jsonb,legacy_servidor uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare entry private.cnes_registry_entries%rowtype; cnes_id uuid;
begin
  perform private.require_cnes_import_admin(actor_id);
  if jsonb_typeof(local_values) is distinct from 'object' or octet_length(local_values::text)>4000
    or exists(select 1 from jsonb_object_keys(local_values) field where field not in
      ('fullName','registration','municipalPosition','weeklyHours','teamLabel','admissionDate','employmentType'))
    then raise exception 'CNES_LOCAL_DATA_INVALID';end if;
  select cnes_unit_id into cnes_id from private.cnes_registry_entries where id=target_entry;
  if cnes_id is null then raise exception 'CNES_ENTRY_NOT_FOUND';end if;
  perform pg_advisory_xact_lock(hashtextextended('cnes-registry:'||cnes_id::text,0));
  select * into entry from private.cnes_registry_entries where id=target_entry for update;
  if expected_version is null or entry.version<>expected_version then raise exception 'CNES_VERSION_CONFLICT';end if;
  if nullif(local_values->>'registration','') is not null then
    perform pg_advisory_xact_lock(hashtextextended('cnes-registration:'||upper(local_values->>'registration'),0));
    if exists(select 1 from private.cnes_registry_entries other where other.id<>target_entry
      and upper(other.local_data->>'registration')=upper(local_values->>'registration')
      and coalesce(other.source_data->>'principalCns',other.source_data->>'cns')
        is distinct from coalesce(entry.source_data->>'principalCns',entry.source_data->>'cns')) then raise exception 'CNES_REGISTRATION_CONFLICT';end if;
    if exists(select 1 from public.employment_bonds b where upper(b.registration)=upper(local_values->>'registration')
      and b.servidor_id is distinct from legacy_servidor) then raise exception 'CNES_LEGACY_LINK_REQUIRED';end if;
  end if;
  if legacy_servidor is not null and not exists(select 1 from public.servidores s
    where s.id=legacy_servidor and exists(select 1 from public.employment_bonds b
      join public.employment_bond_units u on u.bond_id=b.id
      where b.servidor_id=s.id and u.cnes_unit_id=cnes_id
        and upper(b.registration)=upper(local_values->>'registration'))) then raise exception 'CNES_LEGACY_OUT_OF_UNIT';end if;
  update private.cnes_registry_entries set local_data=local_values,servidor_id=legacy_servidor,
    review_status='reviewed',version=version+1,updated_at=now() where id=target_entry;
  update private.cnes_registry_state set revision=revision+1 where cnes_unit_id=cnes_id;
  insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_cnes_unit_id,previous_value,new_value)
    values(actor_id,'administrador','cnes_registry_reviewed','cnes_registry',target_entry,cnes_id,
      jsonb_build_object('local_data',entry.local_data,'servidor_id',entry.servidor_id),
      jsonb_build_object('cnes_unit_id',cnes_id,'fields',array(select jsonb_object_keys(local_values)),'legacy_linked',legacy_servidor is not null));
  return jsonb_build_object('ok',true,'version',entry.version+1);
end $$;

create function public.cnes_legacy_candidates(actor_id uuid,target_cnes uuid,target_registration text) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
  perform private.require_cnes_import_admin(actor_id);
  if target_registration is null or length(btrim(target_registration)) not between 1 and 60 then raise exception 'CNES_LOCAL_DATA_INVALID';end if;
  return coalesce((select jsonb_agg(to_jsonb(candidate)) from (
    select distinct s.id,s.full_name,b.registration from public.servidores s
    join public.employment_bonds b on b.servidor_id=s.id
    join public.employment_bond_units u on u.bond_id=b.id
    where u.cnes_unit_id=target_cnes and upper(b.registration)=upper(btrim(target_registration))
    order by s.full_name,s.id limit 10) candidate),'[]'::jsonb);
end $$;

revoke all on function public.cnes_registry_snapshot(uuid,uuid),public.apply_cnes_registry_import(uuid,uuid,jsonb,text,timestamptz,text,bigint),
  public.list_cnes_registry(uuid,uuid,integer),public.review_cnes_registry_entry(uuid,uuid,integer,jsonb,uuid),public.cnes_legacy_candidates(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.cnes_registry_snapshot(uuid,uuid),public.apply_cnes_registry_import(uuid,uuid,jsonb,text,timestamptz,text,bigint),
  public.list_cnes_registry(uuid,uuid,integer),public.review_cnes_registry_entry(uuid,uuid,integer,jsonb,uuid),public.cnes_legacy_candidates(uuid,uuid,text) to service_role;
