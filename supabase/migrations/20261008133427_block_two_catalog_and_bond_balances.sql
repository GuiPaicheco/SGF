-- Bloco 02: estrutura explícita e saldos por matrícula, sem inferir dados institucionais.
alter table public.lotacoes add column version integer not null default 1;
alter table public.cnes_units add column version integer not null default 1;
alter table public.teams add column version integer not null default 1;
alter table public.teams add column source_reference text;
alter table public.employment_bonds add column version integer not null default 1;

create function public.save_organization_registry(actor_id uuid, registry_kind text, item jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  result_id uuid := nullif(item->>'id','')::uuid;
  previous jsonb; parent uuid := nullif(item->>'parent_id','')::uuid;
  cnes uuid := nullif(item->>'cnes_unit_id','')::uuid;
  reason text := btrim(item->>'reason'); internal boolean := coalesce((item->>'is_internal_allocation')::boolean,false);
  responsible uuid[]; current_version integer;
begin
  if private.actor_role(actor_id) is distinct from 'administrador' then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sgf:organization-registry',0));
  if reason is null or char_length(reason) not between 3 and 2000 then raise exception 'REASON_REQUIRED' using errcode='22023'; end if;
  if nullif(btrim(item->>'name'),'') is null then raise exception 'NAME_REQUIRED' using errcode='22023'; end if;
  if registry_kind='location' then
    select to_jsonb(l),l.version into previous,current_version from public.lotacoes l where id=result_id for update;
    if result_id is not null and (previous is null or current_version is distinct from (item->>'version')::integer) then raise exception 'REGISTRY_VERSION_CONFLICT' using errcode='40001'; end if;
    if cnes is null or not exists(select 1 from public.cnes_units where id=cnes and active) then raise exception 'CNES_REQUIRED' using errcode='22023'; end if;
    if internal and (parent is null or not exists(select 1 from public.lotacoes where id=parent and unit_type='secretaria' and active)) then raise exception 'INTERNAL_ALLOCATION_REQUIRES_SECRETARIAT' using errcode='22023'; end if;
    if parent is not null and not exists(select 1 from public.lotacoes where id=parent and active) then raise exception 'PARENT_NOT_FOUND' using errcode='22023'; end if;
    if result_id is not null and (select count(*) from public.lotacao_cnes_units where lotacao_id=result_id)>1 then raise exception 'ALLOCATION_IN_USE' using errcode='22023'; end if;
    if parent=result_id or exists(with recursive ancestors as (
      select id,parent_id from public.lotacoes where id=parent
      union select l.id,l.parent_id from public.lotacoes l join ancestors a on l.id=a.parent_id
    ) select 1 from ancestors where id=result_id) then raise exception 'PARENT_CYCLE' using errcode='22023'; end if;
    -- Não invalidar atuações já cadastradas ao trocar o CNES ou o tipo de lotação.
    if result_id is not null and exists(select 1 from public.employment_bond_units u where u.internal_lotacao_id=result_id
      and (not internal or u.cnes_unit_id<>cnes)) then raise exception 'ALLOCATION_IN_USE' using errcode='22023'; end if;
    if result_id is not null and exists(select 1 from public.lotacoes l where l.parent_id=result_id and l.is_internal_allocation)
       and item->>'unit_type'<>'secretaria' then raise exception 'SECRETARIAT_IN_USE' using errcode='22023'; end if;
    select coalesce(array_agg(distinct value::uuid),'{}') into responsible from jsonb_array_elements_text(coalesce(item->'responsible_ids','[]'));
    if exists(select 1 from unnest(responsible) r where not exists(select 1 from public.profiles p where p.id=r
      and p.disabled_at is null and p.roles && array['rh','diretor']::public.app_role[])) then raise exception 'INVALID_RESPONSIBLE' using errcode='22023'; end if;
    if result_id is null then
      insert into public.lotacoes(name,code,unit_type,parent_id,active,is_internal_allocation)
      select btrim(item->>'name'),case when internal then null else u.code end,(item->>'unit_type')::public.unit_type,parent,coalesce((item->>'active')::boolean,true),internal
      from public.cnes_units u where u.id=cnes returning id into result_id;
    else
      update public.lotacoes set name=btrim(item->>'name'),code=case when internal then null else (select code from public.cnes_units where id=cnes) end,
        unit_type=(item->>'unit_type')::public.unit_type,parent_id=parent,active=coalesce((item->>'active')::boolean,true),
        is_internal_allocation=internal,version=version+1 where id=result_id;
    end if;
    delete from public.lotacao_cnes_units where lotacao_id=result_id;
    insert into public.lotacao_cnes_units(lotacao_id,cnes_unit_id) values(result_id,cnes);
    delete from public.profile_scopes where lotacao_id=result_id;
    insert into public.profile_scopes(profile_id,lotacao_id) select r,result_id from unnest(responsible) r;
  elsif registry_kind='cnes' then
    select to_jsonb(u),u.version into previous,current_version from public.cnes_units u where id=result_id for update;
    if result_id is not null and (previous is null or current_version is distinct from (item->>'version')::integer) then raise exception 'REGISTRY_VERSION_CONFLICT' using errcode='40001'; end if;
    if item->>'code' !~ '^\d{7}$' or item->>'code' is null then raise exception 'CNES_INVALID' using errcode='22023'; end if;
    if result_id is null then insert into public.cnes_units(code,name,active) values(item->>'code',btrim(item->>'name'),coalesce((item->>'active')::boolean,true)) returning id into result_id;
    else
      if previous->>'code'<>item->>'code' then raise exception 'CNES_CODE_IMMUTABLE' using errcode='22023'; end if;
      update public.cnes_units set name=btrim(item->>'name'),active=coalesce((item->>'active')::boolean,true),version=version+1,updated_at=now() where id=result_id;
    end if;
  elsif registry_kind='team' then
    select to_jsonb(t),t.version into previous,current_version from public.teams t where id=result_id for update;
    if result_id is not null and (previous is null or current_version is distinct from (item->>'version')::integer) then raise exception 'REGISTRY_VERSION_CONFLICT' using errcode='40001'; end if;
    if not exists(select 1 from public.cnes_units where id=cnes and active) then raise exception 'CNES_REQUIRED' using errcode='22023'; end if;
    if not exists(select 1 from public.team_types where code=item->>'type_code' and active and code<>'nao_se_aplica') then raise exception 'TEAM_TYPE_INVALID' using errcode='22023'; end if;
    if exists(select 1 from public.teams where cnes_unit_id=cnes and type_code=item->>'type_code' and team_number=(item->>'team_number')::smallint and id is distinct from result_id) then raise exception 'TEAM_DUPLICATED' using errcode='23505'; end if;
    if nullif(item->>'ine_code','') is not null and (item->>'ine_code' !~ '^\d{6,10}$'
      or ((previous->>'ine_code') is distinct from (item->>'ine_code') and nullif(btrim(item->>'source_reference'),'') is null)) then raise exception 'INE_SOURCE_REQUIRED' using errcode='22023'; end if;
    if result_id is not null and previous->>'cnes_unit_id'<>cnes::text and exists(select 1 from public.employment_bond_teams where team_id=result_id) then raise exception 'TEAM_IN_USE' using errcode='22023'; end if;
    if result_id is null then
      insert into public.teams(cnes_unit_id,type_code,team_number,ine_code,name,needs_review,active,source_reference)
      values(cnes,item->>'type_code',(item->>'team_number')::smallint,nullif(item->>'ine_code',''),btrim(item->>'name'),nullif(item->>'ine_code','') is null,coalesce((item->>'active')::boolean,true),nullif(btrim(item->>'source_reference'),'')) returning id into result_id;
    else update public.teams set cnes_unit_id=cnes,type_code=item->>'type_code',team_number=(item->>'team_number')::smallint,
      ine_code=nullif(item->>'ine_code',''),name=btrim(item->>'name'),needs_review=nullif(item->>'ine_code','') is null,
      active=coalesce((item->>'active')::boolean,true),source_reference=nullif(btrim(item->>'source_reference'),''),version=version+1,updated_at=now() where id=result_id; end if;
  else raise exception 'REGISTRY_KIND_INVALID' using errcode='22023'; end if;
  insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,reason,previous_value,new_value)
  values(actor_id,'administrador','organization_registry_saved',registry_kind,result_id,reason,previous,item);
  return result_id;
end $$;
revoke all on function public.save_organization_registry(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_organization_registry(uuid,text,jsonb) to service_role;

create table public.bond_time_bank_accounts (
  bond_id uuid primary key references public.employment_bonds(id),
  declared_minutes integer not null default 0 check(declared_minutes>=0),
  validated_minutes integer not null default 0 check(validated_minutes>=0),
  version integer not null default 0, updated_by uuid references public.profiles(id), updated_at timestamptz not null default now()
);
create table public.bond_time_bank_entries (
  id uuid primary key default gen_random_uuid(),bond_id uuid not null references public.employment_bonds(id),
  request_id uuid references public.vacation_requests(id),minutes integer not null check(minutes<>0),
  description text not null,occurred_on date not null,created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),entry_key uuid not null unique,
  legacy_entry_id uuid unique references public.time_bank_entries(id),
  kind text not null default 'manual' check(kind in ('manual','consumption','refund'))
);
create unique index bond_bank_request_event_key on public.bond_time_bank_entries(request_id,kind) where request_id is not null;
create index bond_time_bank_entries_bond_idx on public.bond_time_bank_entries(bond_id,occurred_on desc);
create index bond_time_bank_entries_request_idx on public.bond_time_bank_entries(request_id);
create index bond_time_bank_entries_author_idx on public.bond_time_bank_entries(created_by);
create index bond_time_bank_accounts_author_idx on public.bond_time_bank_accounts(updated_by);
alter table public.bond_time_bank_accounts enable row level security;
alter table public.bond_time_bank_entries enable row level security;
revoke all on public.bond_time_bank_accounts,public.bond_time_bank_entries from public,anon,authenticated;
grant select,insert,update on public.bond_time_bank_accounts,public.bond_time_bank_entries to service_role;

alter table public.vacation_rights add column bond_id uuid references public.employment_bonds(id),
  add column version integer not null default 1,add column updated_by uuid references public.profiles(id),
  add column updated_at timestamptz not null default now();
create index vacation_rights_bond_idx on public.vacation_rights(bond_id,acquisition_end);
create index vacation_rights_author_idx on public.vacation_rights(updated_by);
revoke all on public.vacation_rights from anon,authenticated;
grant select,insert,update on public.vacation_rights to service_role;
-- A migração não copia saldo para várias matrículas. Casos ambíguos permanecem legados.
update public.vacation_rights r set bond_id=b.id from public.employment_bonds b
 where b.servidor_id=r.servidor_id and (select count(*) from public.employment_bonds x where x.servidor_id=b.servidor_id)=1;
insert into public.bond_time_bank_accounts(bond_id,declared_minutes,validated_minutes,updated_by,updated_at)
select b.id,a.declared_minutes,a.validated_minutes,a.updated_by,a.updated_at from public.time_bank_accounts a
join public.employment_bonds b on b.servidor_id=a.servidor_id
where (select count(*) from public.employment_bonds x where x.servidor_id=a.servidor_id)=1;

create function public.bond_context_allowed(actor_id uuid,target_bond uuid,write_access boolean default false)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare role_value public.app_role:=private.actor_role(actor_id);
 h jsonb:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');
begin
  if role_value is null or (write_access and role_value not in ('rh','administrador')) then return false; end if;
  if not exists(select 1 from public.employment_bonds b join public.servidores s on s.id=b.servidor_id where b.id=target_bond and b.active and s.active) then return false; end if;
  if role_value='administrador' then return true; end if;
  if role_value='servidor' then return h->>'x-sgf-bond'=target_bond::text and exists(select 1 from public.employment_bonds b join public.servidores s on s.id=b.servidor_id where b.id=target_bond and s.profile_id=actor_id); end if;
  return exists(select 1 from public.employment_bond_units u join public.lotacoes l on l.id=nullif(h->>'x-sgf-lotacao','')::uuid and l.active
    join public.cnes_units c on c.id=u.cnes_unit_id and c.active
    join public.profile_scopes ps on ps.profile_id=actor_id and ps.lotacao_id=l.id
    join public.lotacao_cnes_units m on m.lotacao_id=l.id and m.cnes_unit_id=u.cnes_unit_id
    where u.bond_id=target_bond and u.active and u.cnes_unit_id::text=h->>'x-sgf-cnes'
      and u.internal_lotacao_id is not distinct from case when l.is_internal_allocation then l.id else null end);
end $$;
revoke all on function public.bond_context_allowed(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.bond_context_allowed(uuid,uuid,boolean) to service_role;

create function public.list_bond_registry(actor_id uuid)
returns setof public.employment_bonds language sql stable security invoker set search_path='' as $$
 select b.* from public.employment_bonds b where public.bond_context_allowed(actor_id,b.id,false) order by b.registration
$$;
revoke all on function public.list_bond_registry(uuid) from public,anon,authenticated;
grant execute on function public.list_bond_registry(uuid) to service_role;

create function public.manage_bond_time_bank(actor_id uuid,target_bond uuid,target_minutes integer,
 target_description text,target_date date,expected_version integer,target_entry_key uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare account public.bond_time_bank_accounts%rowtype; previous_entry public.bond_time_bank_entries%rowtype;
begin
  if not public.bond_context_allowed(actor_id,target_bond,true) then raise exception 'BOND_SCOPE_REQUIRED' using errcode='42501'; end if;
  if target_minutes is null or target_minutes=0 or abs(target_minutes::bigint)>6000000 or target_date is null
    or char_length(btrim(target_description)) not between 3 and 2000 or target_description is null or target_entry_key is null then raise exception 'ENTRY_INVALID' using errcode='22023'; end if;
  insert into public.bond_time_bank_accounts(bond_id) values(target_bond) on conflict do nothing;
  select * into account from public.bond_time_bank_accounts where bond_id=target_bond for update;
  select * into previous_entry from public.bond_time_bank_entries where entry_key=target_entry_key;
  if found then
    if previous_entry.bond_id<>target_bond or previous_entry.minutes<>target_minutes or previous_entry.description<>btrim(target_description)
      or previous_entry.occurred_on<>target_date or previous_entry.created_by<>actor_id then raise exception 'ENTRY_KEY_CONFLICT' using errcode='40001'; end if;
    return jsonb_build_object('balance_minutes',account.validated_minutes,'version',account.version,'replayed',true);
  end if;
  if expected_version is null or account.version<>expected_version then raise exception 'BANK_VERSION_CONFLICT' using errcode='40001'; end if;
  if account.validated_minutes::bigint+target_minutes<0 then raise exception 'INSUFFICIENT_VALIDATED_BALANCE' using errcode='22023'; end if;
  update public.bond_time_bank_accounts set validated_minutes=validated_minutes+target_minutes,version=version+1,updated_by=actor_id,updated_at=now() where bond_id=target_bond;
  insert into public.bond_time_bank_entries(bond_id,minutes,description,occurred_on,created_by,entry_key)
    values(target_bond,target_minutes,btrim(target_description),target_date,actor_id,target_entry_key);
  insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_bond_id,reason,previous_value,new_value)
    values(actor_id,private.actor_role(actor_id),'bond_time_bank_entry','employment_bond',target_bond,target_bond,btrim(target_description),to_jsonb(account),jsonb_build_object('minutes',target_minutes,'entry_key',target_entry_key));
  return jsonb_build_object('balance_minutes',account.validated_minutes+target_minutes,'version',account.version+1);
end $$;
revoke all on function public.manage_bond_time_bank(uuid,uuid,integer,text,date,integer,uuid) from public,anon,authenticated;
grant execute on function public.manage_bond_time_bank(uuid,uuid,integer,text,date,integer,uuid) to service_role;

create function public.save_bond_vacation_right(actor_id uuid,target_bond uuid,item jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result_id uuid:=nullif(item->>'id','')::uuid; previous public.vacation_rights%rowtype; employee uuid;
begin
  if not public.bond_context_allowed(actor_id,target_bond,true) then raise exception 'BOND_SCOPE_REQUIRED' using errcode='42501'; end if;
  if item->>'type' not in ('regulamentar','premio') or item->>'type' is null or (item->>'available_days')::integer not between 0 and 3650 then raise exception 'RIGHT_DATA_INVALID' using errcode='22023'; end if;
  if nullif(btrim(item->>'source_reference'),'') is null or char_length(btrim(item->>'reason')) not between 3 and 2000
    or item->>'reason' is null or (item->>'acquisition_end')::date < (item->>'acquisition_start')::date then raise exception 'RIGHT_DATA_INVALID' using errcode='22023'; end if;
  select servidor_id into employee from public.employment_bonds where id=target_bond;
  select * into previous from public.vacation_rights where id=result_id for update;
  if result_id is not null and (previous.id is null or previous.bond_id is distinct from target_bond or previous.version is distinct from (item->>'version')::integer) then raise exception 'RIGHT_VERSION_CONFLICT' using errcode='40001'; end if;
  if result_id is not null and exists(select 1 from public.vacation_requests where right_id=result_id) then raise exception 'RIGHT_IN_USE' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('bond-right:'||target_bond::text,0));
  if exists(select 1 from public.vacation_rights where bond_id=target_bond and type=(item->>'type')::public.vacation_type
    and acquisition_start=(item->>'acquisition_start')::date and acquisition_end=(item->>'acquisition_end')::date
    and id is distinct from result_id) then raise exception 'RIGHT_DUPLICATED' using errcode='23505'; end if;
  if result_id is null then
    insert into public.vacation_rights(servidor_id,bond_id,type,acquisition_start,acquisition_end,available_days,source_reference,updated_by)
    values(employee,target_bond,(item->>'type')::public.vacation_type,(item->>'acquisition_start')::date,(item->>'acquisition_end')::date,(item->>'available_days')::integer,btrim(item->>'source_reference'),actor_id) returning id into result_id;
  else update public.vacation_rights set type=(item->>'type')::public.vacation_type,acquisition_start=(item->>'acquisition_start')::date,
    acquisition_end=(item->>'acquisition_end')::date,available_days=(item->>'available_days')::integer,source_reference=btrim(item->>'source_reference'),version=version+1,updated_by=actor_id,updated_at=now() where id=result_id; end if;
  insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_bond_id,reason,previous_value,new_value)
  values(actor_id,private.actor_role(actor_id),'bond_vacation_right_saved','vacation_right',result_id,target_bond,item->>'reason',to_jsonb(previous),item);
  return result_id;
end $$;
revoke all on function public.save_bond_vacation_right(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_bond_vacation_right(uuid,uuid,jsonb) to service_role;

create function public.get_bond_resources(actor_id uuid,target_bond uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if not public.bond_context_allowed(actor_id,target_bond,false) then raise exception 'BOND_SCOPE_REQUIRED' using errcode='42501'; end if;
  return jsonb_build_object('bond',(select to_jsonb(b) from public.employment_bonds b where id=target_bond),
    'units',coalesce((select jsonb_agg(to_jsonb(u)) from (select distinct c.id,c.code,c.name from public.employment_bond_units a join public.cnes_units c on c.id=a.cnes_unit_id where a.bond_id=target_bond and a.active) u),'[]'),
    'account',coalesce((select to_jsonb(a) from public.bond_time_bank_accounts a where bond_id=target_bond),jsonb_build_object('bond_id',target_bond,'validated_minutes',0,'declared_minutes',0,'version',0)),
    'rights',coalesce((select jsonb_agg(to_jsonb(r) order by acquisition_end desc) from public.vacation_rights r where bond_id=target_bond),'[]'),
    'entries',coalesce((select jsonb_agg(to_jsonb(e) order by created_at desc) from (select e.*,p.full_name author_name from public.bond_time_bank_entries e left join public.profiles p on p.id=e.created_by where bond_id=target_bond order by e.created_at desc limit 100) e),'[]'),
    'legacy_pending',exists(select 1 from public.employment_bonds b where b.id=target_bond and (
      exists(select 1 from public.time_bank_accounts a where a.servidor_id=b.servidor_id and (a.validated_minutes>0 or a.declared_minutes>0)
        and not exists(select 1 from public.bond_time_bank_accounts x where x.bond_id=b.id))
      or exists(select 1 from public.vacation_rights r where r.servidor_id=b.servidor_id and r.bond_id is null))));
end $$;
revoke all on function public.get_bond_resources(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_bond_resources(uuid,uuid) to service_role;

create function public.save_bond_registry(actor_id uuid,target_bond uuid,item jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare previous public.employment_bonds%rowtype; pole uuid:=nullif(item->>'pole_cnes_unit_id','')::uuid;
begin
  if not public.bond_context_allowed(actor_id,target_bond,true) then raise exception 'BOND_SCOPE_REQUIRED' using errcode='42501'; end if;
  if item->>'reason' is null or char_length(btrim(item->>'reason')) not between 3 and 2000
    or nullif(btrim(item->>'employment_type'),'') is null then raise exception 'BOND_DATA_INVALID' using errcode='22023'; end if;
  select * into previous from public.employment_bonds where id=target_bond for update;
  if previous.version is distinct from (item->>'version')::integer then raise exception 'BOND_VERSION_CONFLICT' using errcode='40001'; end if;
  if pole is not null and not exists(select 1 from public.employment_bond_units where bond_id=target_bond and cnes_unit_id=pole and active)
    then raise exception 'POLE_OUT_OF_BOND' using errcode='22023'; end if;
  if (item->>'weekly_hours')::integer < (select coalesce(sum(weekly_hours),0) from public.employment_bond_units where bond_id=target_bond and active)
    then raise exception 'WEEKLY_HOURS_INVALID' using errcode='22023'; end if;
  update public.employment_bonds set admission_date=nullif(item->>'admission_date','')::date,employment_type=btrim(item->>'employment_type'),
    weekly_hours=nullif(item->>'weekly_hours','')::integer,cargo_id=nullif(item->>'cargo_id','')::uuid,funcao_id=nullif(item->>'funcao_id','')::uuid,
    pole_cnes_unit_id=pole,version=version+1,updated_at=now() where id=target_bond;
  insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_bond_id,reason,previous_value,new_value)
    values(actor_id,private.actor_role(actor_id),'bond_registry_saved','employment_bond',target_bond,target_bond,item->>'reason',to_jsonb(previous),item);
  return target_bond;
end $$;
revoke all on function public.save_bond_registry(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_bond_registry(uuid,uuid,jsonb) to service_role;

-- Associação estrita: nenhum direito de outra matrícula pode sustentar um pedido.
create function private.validate_right_bond() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.right_id is not null and not exists(select 1 from public.vacation_rights r where r.id=new.right_id
    and r.servidor_id=new.servidor_id and r.type=new.type and r.bond_id is not distinct from new.context_bond_id)
    then raise exception 'RIGHT_BOND_MISMATCH' using errcode='23514'; end if;
  return new;
end $$;
revoke all on function private.validate_right_bond() from public,anon,authenticated;
create trigger vacation_requests_validate_right_bond before insert or update of right_id,context_bond_id,servidor_id,type
on public.vacation_requests for each row execute function private.validate_right_bond();

-- O caminho moderno não grava declaração de saldo na conta legada da pessoa.
create or replace function public.register_contextual_vacation_submission(payload jsonb,target_bond_id uuid,target_cnes_unit_id uuid,target_lotacao_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; canonical_registration text; declared numeric:=coalesce(nullif(payload->>'availableHours','')::numeric,nullif(payload->>'addBankHours','')::numeric,0);
begin
  perform private.planning_lock();
  select s.matricula into canonical_registration from public.employment_bonds b join public.servidores s on s.id=b.servidor_id where b.id=target_bond_id;
  -- Compatibilidade da identidade legada; o vínculo real fica em context_bond_id.
  result:=private.register_contextual_before_planning(payload||jsonb_build_object('registration',canonical_registration,'availableHours',null,'addBankHours',null),target_bond_id,target_cnes_unit_id,target_lotacao_id);
  update public.vacation_requests set requested_hours=case when payload->>'type'='banco_horas' then nullif(payload->>'requestedHours','')::numeric else nullif(payload->>'addBankHours','')::numeric end,
    right_id=nullif(payload->>'rightId','')::uuid where id=(result->>'id')::uuid;
  if declared>0 then
    insert into public.bond_time_bank_accounts(bond_id,declared_minutes) values(target_bond_id,round(declared*60))
    on conflict(bond_id) do update set declared_minutes=excluded.declared_minutes,updated_at=now();
  end if;
  return result;
end $$;

-- Primeiro lançamento no calendário debita uma única vez por pedido/matrícula,
-- independentemente do número de CNES. Falha de saldo reverte a decisão na mesma transação.
alter function public.manage_unit_request_review(uuid,uuid,text,text,integer,jsonb) rename to manage_unit_review_before_bond_bank;
alter function public.manage_unit_review_before_bond_bank(uuid,uuid,text,text,integer,jsonb) set schema private;
create function public.manage_unit_request_review(actor_id uuid,target_review_id uuid,target_action text,
 target_notes text default null,expected_version integer default null,target_rejection jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; request_row public.vacation_requests%rowtype; amount integer; account public.bond_time_bank_accounts%rowtype;
begin
  perform private.planning_lock();
  select r.* into request_row from public.vacation_requests r join public.request_unit_reviews v on v.request_id=r.id where v.id=target_review_id for update of r;
  result:=private.manage_unit_review_before_bond_bank(actor_id,target_review_id,target_action,target_notes,expected_version,target_rejection);
  amount:=round(coalesce(request_row.requested_hours,0)*60);
  if target_action='schedule' and amount>0 and request_row.context_bond_id is not null then
    insert into public.bond_time_bank_accounts(bond_id) values(request_row.context_bond_id) on conflict do nothing;
    select * into account from public.bond_time_bank_accounts where bond_id=request_row.context_bond_id for update;
    if not exists(select 1 from public.bond_time_bank_entries where request_id=request_row.id and kind='consumption') then
      if account.validated_minutes<amount then raise exception 'INSUFFICIENT_VALIDATED_BALANCE' using errcode='22023'; end if;
      update public.bond_time_bank_accounts set validated_minutes=validated_minutes-amount,version=version+1,updated_by=actor_id,updated_at=now() where bond_id=request_row.context_bond_id;
      insert into public.bond_time_bank_entries(bond_id,request_id,minutes,description,occurred_on,created_by,entry_key,kind)
      values(request_row.context_bond_id,request_row.id,-amount,'Uso de horas no calendário — '||coalesce(request_row.protocol,request_row.id::text),current_date,actor_id,gen_random_uuid(),'consumption');
      insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_bond_id,previous_value,new_value)
      values(actor_id,private.actor_role(actor_id),'bond_bank_request_consumed','vacation_request',request_row.id,request_row.context_bond_id,to_jsonb(account),jsonb_build_object('minutes',-amount));
    end if;
  end if;
  return result;
end $$;
revoke all on function public.manage_unit_request_review(uuid,uuid,text,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.manage_unit_request_review(uuid,uuid,text,text,integer,jsonb) to service_role;

create function private.refund_bond_bank_on_request_end() returns trigger language plpgsql security invoker set search_path='' as $$
declare consumed public.bond_time_bank_entries%rowtype; who uuid:=nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}')->>'x-sgf-actor','')::uuid;
begin
  if new.status in ('rejeitada','cancelada') and new.status is distinct from old.status then
    select * into consumed from public.bond_time_bank_entries where request_id=new.id and kind='consumption';
    if found then
      perform 1 from public.bond_time_bank_accounts where bond_id=consumed.bond_id for update;
      if not exists(select 1 from public.bond_time_bank_entries where request_id=new.id and kind='refund') then
        if who is null then raise exception 'BANK_REFUND_ACTOR_REQUIRED'; end if;
        update public.bond_time_bank_accounts set validated_minutes=validated_minutes-consumed.minutes,version=version+1,updated_by=who,updated_at=now() where bond_id=consumed.bond_id;
        insert into public.bond_time_bank_entries(bond_id,request_id,minutes,description,occurred_on,created_by,entry_key,kind)
        values(consumed.bond_id,new.id,-consumed.minutes,'Estorno após encerramento do pedido',current_date,who,gen_random_uuid(),'refund');
        insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_bond_id,new_value)
        values(who,private.actor_role(who),'bond_bank_request_refunded','vacation_request',new.id,consumed.bond_id,jsonb_build_object('minutes',-consumed.minutes));
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function private.refund_bond_bank_on_request_end() from public,anon,authenticated;
create trigger vacation_requests_refund_bond_bank after update of status on public.vacation_requests
for each row execute function private.refund_bond_bank_on_request_end();
