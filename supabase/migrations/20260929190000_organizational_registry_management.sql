-- Gestão transacional da estrutura organizacional e dos cadastros funcionais.

create table public.employee_assignment_history (
  id bigint generated always as identity primary key,
  servidor_id uuid not null references public.servidores(id) on delete cascade,
  previous_lotacao_id uuid references public.lotacoes(id),
  new_lotacao_id uuid references public.lotacoes(id),
  previous_cargo_id uuid references public.cargos(id),
  new_cargo_id uuid references public.cargos(id),
  previous_funcao_id uuid references public.funcoes(id),
  new_funcao_id uuid references public.funcoes(id),
  previous_employment_type text,
  new_employment_type text,
  previous_active boolean,
  new_active boolean,
  reason text not null,
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default now()
);

create index employee_assignment_history_servidor_idx
  on public.employee_assignment_history (servidor_id, changed_at desc);
create index employee_assignment_history_changed_by_idx
  on public.employee_assignment_history (changed_by);
alter table public.employee_assignment_history enable row level security;
create policy employee_assignment_history_client_read on public.employee_assignment_history
  for select to authenticated
  using (private.can_manage_servidor(servidor_id));
revoke all on public.employee_assignment_history from public, anon, authenticated;
grant select, insert, update, delete on public.employee_assignment_history to service_role;
grant usage, select on sequence public.employee_assignment_history_id_seq to service_role;

create or replace function public.manage_location_registry(
  actor_id uuid, target_id uuid, target_name text, target_code text,
  target_unit_type public.unit_type, target_parent_id uuid, target_active boolean,
  responsible_ids uuid[] default '{}'
) returns uuid language plpgsql security invoker set search_path='' as $$
declare result_id uuid;
begin
  if not exists(select 1 from public.profiles where id=actor_id and role='administrador' and not must_change_password)
    then raise exception using message='ADMIN_REQUIRED',errcode='42501'; end if;
  if nullif(btrim(target_name),'') is null then raise exception using message='NAME_REQUIRED',errcode='22023'; end if;
  if target_parent_id=target_id then raise exception using message='PARENT_CYCLE',errcode='22023'; end if;
  if target_parent_id is not null and not exists(select 1 from public.lotacoes where id=target_parent_id) then raise exception using message='PARENT_NOT_FOUND',errcode='P0002'; end if;
  if exists(select 1 from unnest(coalesce(responsible_ids,'{}')) responsible where not exists(select 1 from public.profiles where id=responsible and role in ('diretor','rh'))) then raise exception using message='INVALID_RESPONSIBLE',errcode='22023'; end if;
  if target_id is null then
    insert into public.lotacoes(name,code,unit_type,parent_id,active)
    values(btrim(target_name),nullif(upper(btrim(target_code)),''),target_unit_type,target_parent_id,target_active)
    returning id into result_id;
  else
    update public.lotacoes set name=btrim(target_name),code=nullif(upper(btrim(target_code)),''),unit_type=target_unit_type,parent_id=target_parent_id,active=target_active where id=target_id returning id into result_id;
    if result_id is null then raise exception using message='LOCATION_NOT_FOUND',errcode='P0002'; end if;
  end if;
  delete from public.profile_scopes where lotacao_id=result_id;
  insert into public.profile_scopes(profile_id,lotacao_id) select responsible,result_id from unnest(coalesce(responsible_ids,'{}')) responsible on conflict do nothing;
  insert into public.audit_events(actor_id,action,entity_type,entity_id,new_value)
  values(actor_id,'location_registry_saved','lotacao',result_id,jsonb_build_object('name',btrim(target_name),'code',target_code,'unit_type',target_unit_type,'parent_id',target_parent_id,'active',target_active,'responsibles',responsible_ids));
  return result_id;
end $$;

create or replace function public.manage_reference_registry(actor_id uuid, registry_kind text, target_id uuid, target_name text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result_id uuid;
begin
  if not exists(select 1 from public.profiles where id=actor_id and role in ('administrador','rh') and not must_change_password)
    then raise exception using message='STAFF_REQUIRED',errcode='42501'; end if;
  if nullif(btrim(target_name),'') is null then raise exception using message='NAME_REQUIRED',errcode='22023'; end if;
  if registry_kind='cargo' then
    if target_id is null then insert into public.cargos(name) values(btrim(target_name)) returning id into result_id;
    else update public.cargos set name=btrim(target_name) where id=target_id returning id into result_id; end if;
  elsif registry_kind='funcao' then
    if target_id is null then insert into public.funcoes(name) values(btrim(target_name)) returning id into result_id;
    else update public.funcoes set name=btrim(target_name) where id=target_id returning id into result_id; end if;
  else raise exception using message='REGISTRY_KIND_INVALID',errcode='22023'; end if;
  if result_id is null then raise exception using message='REGISTRY_NOT_FOUND',errcode='P0002'; end if;
  insert into public.audit_events(actor_id,action,entity_type,entity_id,new_value)
  values(actor_id,'reference_registry_saved',registry_kind,result_id,jsonb_build_object('name',btrim(target_name)));
  return result_id;
end $$;

create or replace function public.manage_employee_registry(
  actor_id uuid, target_id uuid, target_full_name text, target_registration text,
  target_cpf text, target_birth_date date, target_admission_date date,
  target_employment_type text, target_lotacao_id uuid, target_cargo_id uuid,
  target_funcao_id uuid, target_weekly_hours integer, target_active boolean, target_reason text
) returns uuid language plpgsql security invoker set search_path='' as $$
declare actor_role public.app_role; old_row public.servidores%rowtype; result_id uuid; clean_cpf text:=regexp_replace(target_cpf,'\D','','g');
begin
  select role into actor_role from public.profiles where id=actor_id and role in ('administrador','rh') and not must_change_password;
  if actor_role is null then raise exception using message='STAFF_REQUIRED',errcode='42501'; end if;
  if nullif(btrim(target_full_name),'') is null or nullif(btrim(target_registration),'') is null or nullif(btrim(target_employment_type),'') is null then raise exception using message='REQUIRED_FIELDS',errcode='22023'; end if;
  if clean_cpf!~'^\d{11}$' then raise exception using message='CPF_INVALID',errcode='22023'; end if;
  if nullif(btrim(target_reason),'') is null then raise exception using message='REASON_REQUIRED',errcode='22023'; end if;
  if target_weekly_hours is not null and (target_weekly_hours<1 or target_weekly_hours>80) then raise exception using message='WEEKLY_HOURS_INVALID',errcode='22023'; end if;
  if target_lotacao_id is not null and not exists(select 1 from public.lotacoes where id=target_lotacao_id and active) then raise exception using message='LOCATION_INVALID',errcode='22023'; end if;
  if actor_role='rh' and (target_lotacao_id is null or not exists(select 1 from public.profile_scopes where profile_id=actor_id and lotacao_id=target_lotacao_id)) then raise exception using message='TARGET_SCOPE_REQUIRED',errcode='42501'; end if;
  if target_id is null then
    insert into public.servidores(full_name,matricula,cpf,birth_date,admission_date,employment_type,lotacao_id,cargo_id,funcao_id,weekly_hours,active)
    values(btrim(target_full_name),upper(btrim(target_registration)),clean_cpf,target_birth_date,target_admission_date,btrim(target_employment_type),target_lotacao_id,target_cargo_id,target_funcao_id,target_weekly_hours,target_active)
    returning id into result_id;
    insert into public.employee_assignment_history(servidor_id,new_lotacao_id,new_cargo_id,new_funcao_id,new_employment_type,new_active,reason,changed_by)
    values(result_id,target_lotacao_id,target_cargo_id,target_funcao_id,btrim(target_employment_type),target_active,btrim(target_reason),actor_id);
  else
    select * into old_row from public.servidores where id=target_id for update;
    if not found then raise exception using message='EMPLOYEE_NOT_FOUND',errcode='P0002'; end if;
    if actor_role='rh' and not private.can_manage_servidor(target_id) then raise exception using message='SOURCE_SCOPE_REQUIRED',errcode='42501'; end if;
    update public.servidores set full_name=btrim(target_full_name),matricula=upper(btrim(target_registration)),cpf=clean_cpf,birth_date=target_birth_date,admission_date=target_admission_date,employment_type=btrim(target_employment_type),lotacao_id=target_lotacao_id,cargo_id=target_cargo_id,funcao_id=target_funcao_id,weekly_hours=target_weekly_hours,active=target_active,updated_at=now() where id=target_id returning id into result_id;
    if (old_row.lotacao_id,old_row.cargo_id,old_row.funcao_id,old_row.employment_type,old_row.active) is distinct from (target_lotacao_id,target_cargo_id,target_funcao_id,btrim(target_employment_type),target_active) then
      insert into public.employee_assignment_history(servidor_id,previous_lotacao_id,new_lotacao_id,previous_cargo_id,new_cargo_id,previous_funcao_id,new_funcao_id,previous_employment_type,new_employment_type,previous_active,new_active,reason,changed_by)
      values(result_id,old_row.lotacao_id,target_lotacao_id,old_row.cargo_id,target_cargo_id,old_row.funcao_id,target_funcao_id,old_row.employment_type,btrim(target_employment_type),old_row.active,target_active,btrim(target_reason),actor_id);
    end if;
  end if;
  insert into public.audit_events(actor_id,action,entity_type,entity_id,new_value)
  values(actor_id,'employee_registry_saved','servidor',result_id,jsonb_build_object('lotacao_id',target_lotacao_id,'cargo_id',target_cargo_id,'funcao_id',target_funcao_id,'employment_type',target_employment_type,'active',target_active));
  return result_id;
end $$;

revoke all on function public.manage_location_registry(uuid,uuid,text,text,public.unit_type,uuid,boolean,uuid[]) from public,anon,authenticated;
revoke all on function public.manage_reference_registry(uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.manage_employee_registry(uuid,uuid,text,text,text,date,date,text,uuid,uuid,uuid,integer,boolean,text) from public,anon,authenticated;
grant execute on function public.manage_location_registry(uuid,uuid,text,text,public.unit_type,uuid,boolean,uuid[]) to service_role;
grant execute on function public.manage_reference_registry(uuid,text,uuid,text) to service_role;
grant execute on function public.manage_employee_registry(uuid,uuid,text,text,text,date,date,text,uuid,uuid,uuid,integer,boolean,text) to service_role;
