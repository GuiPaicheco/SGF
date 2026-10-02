alter table public.profiles drop constraint if exists profiles_roles_allowed;
alter table public.profiles add constraint profiles_roles_allowed check (
  cardinality(roles) between 1 and 4
  and roles <@ array['servidor','diretor','rh','administrador']::public.app_role[]
);

create or replace function private.actor_role(actor_id uuid)
returns public.app_role
language plpgsql stable security definer
set search_path = ''
as $$
declare selected text; granted public.app_role[];
begin
  select roles into granted from public.profiles
  where id=actor_id and disabled_at is null and not must_change_password;
  if granted is null then return null; end if;
  selected := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-sgf-role';
  if selected in ('servidor','diretor','rh','administrador')
    and selected::public.app_role = any(granted)
    then return selected::public.app_role;
  end if;
  if selected is null and cardinality(granted)=1 then return granted[1]; end if;
  return null;
end $$;

create or replace function public.set_profile_access(
  actor_id uuid, target_profile_id uuid, target_roles public.app_role[],
  target_cpf text, target_scope_ids uuid[] default '{}'
) returns void language plpgsql security invoker set search_path = '' as $$
declare clean_roles public.app_role[]; old_roles public.app_role[];
  clean_cpf text := regexp_replace(coalesce(target_cpf,''), '\D','','g');
begin
  if private.actor_role(actor_id) is distinct from 'administrador' then raise exception using message='ADMIN_REQUIRED',errcode='42501'; end if;
  if actor_id=target_profile_id then raise exception using message='SELF_ROLE_CHANGE_BLOCKED',errcode='22023'; end if;
  select roles into old_roles from public.profiles where id=target_profile_id for update;
  if not found then raise exception using message='PROFILE_NOT_FOUND',errcode='P0002'; end if;
  select array_agg(distinct value) into clean_roles from unnest(target_roles) value;
  if clean_roles is null or not (clean_roles <@ array['servidor','diretor','rh','administrador']::public.app_role[])
    then raise exception using message='ROLE_NOT_ALLOWED',errcode='22023'; end if;
  if clean_cpf !~ '^\d{11}$' then raise exception using message='CPF_REQUIRED',errcode='22023'; end if;
  if clean_roles && array['diretor','rh']::public.app_role[] and coalesce(cardinality(target_scope_ids),0)=0
    then raise exception using message='SCOPE_REQUIRED',errcode='22023'; end if;
  if exists(select 1 from unnest(coalesce(target_scope_ids,'{}')) scope_id
    where not exists(select 1 from public.lotacoes where id=scope_id and active))
    then raise exception using message='INVALID_SCOPE',errcode='22023'; end if;
  if 'servidor'=any(clean_roles) and not exists(select 1 from public.servidores where profile_id=target_profile_id)
    then raise exception using message='EMPLOYEE_REQUIRED',errcode='22023'; end if;
  if exists(select 1 from public.servidores where profile_id=target_profile_id and cpf is distinct from clean_cpf)
    then raise exception using message='IDENTITY_CONFLICT',errcode='22023'; end if;
  update public.profiles set cpf=clean_cpf,roles=clean_roles,
    role=case when 'administrador'=any(clean_roles) then 'administrador'::public.app_role
      when 'rh'=any(clean_roles) then 'rh'::public.app_role
      when 'diretor'=any(clean_roles) then 'diretor'::public.app_role
      else 'servidor'::public.app_role end,
    must_change_password=case
      when old_roles && array['diretor','rh','administrador']::public.app_role[] then must_change_password
      else clean_roles && array['diretor','rh','administrador']::public.app_role[] end
    where id=target_profile_id;
  delete from public.profile_scopes where profile_id=target_profile_id;
  if clean_roles && array['diretor','rh']::public.app_role[] then
    insert into public.profile_scopes(profile_id,lotacao_id)
    select target_profile_id,scope_id from unnest(target_scope_ids) scope_id on conflict do nothing;
  end if;
  insert into public.audit_events(actor_id,action,entity_type,entity_id,new_value)
  values(actor_id,'profile_access_updated','profile',target_profile_id,
    jsonb_build_object('roles',clean_roles,'cpf_last4',right(clean_cpf,4),'scopes',target_scope_ids));
end $$;

create or replace function public.approve_cpf_access(
  actor_id uuid, target_request_id uuid, account_id uuid,
  target_roles public.app_role[], target_scope_ids uuid[] default '{}'
) returns void language plpgsql security invoker set search_path = '' as $$
declare access_row public.access_requests%rowtype; employee_row public.servidores%rowtype;
  clean_roles public.app_role[]; existing_profile public.profiles%rowtype; merged_roles public.app_role[];
begin
  select array_agg(distinct value) into clean_roles from unnest(target_roles) value;
  if clean_roles is null or not (clean_roles <@ array['servidor','diretor','rh','administrador']::public.app_role[])
    then raise exception using message='ROLE_NOT_ALLOWED',errcode='22023'; end if;
  if private.actor_role(actor_id)='rh' then
    if clean_roles is distinct from array['servidor'::public.app_role]
      or coalesce(cardinality(target_scope_ids),0)<>1
      or not exists(select 1 from public.profile_scopes where profile_id=actor_id and lotacao_id=target_scope_ids[1])
      then raise exception using message='SCOPE_REQUIRED',errcode='42501'; end if;
  elsif private.actor_role(actor_id) is distinct from 'administrador' then
    raise exception using message='ADMIN_REQUIRED',errcode='42501';
  end if;
  if clean_roles && array['diretor','rh']::public.app_role[] and coalesce(cardinality(target_scope_ids),0)=0
    then raise exception using message='SCOPE_REQUIRED',errcode='22023'; end if;
  if exists(select 1 from unnest(coalesce(target_scope_ids,'{}')) scope_id
    where not exists(select 1 from public.lotacoes where id=scope_id and active))
    then raise exception using message='INVALID_SCOPE',errcode='22023'; end if;
  select * into access_row from public.access_requests where id=target_request_id and status='pendente' for update;
  if not found then raise exception using message='ACCESS_REQUEST_NOT_PENDING',errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('cpf:'||access_row.cpf,0));
  select * into existing_profile from public.profiles where cpf=access_row.cpf for update;
  if found and existing_profile.id<>account_id then raise exception using message='ACCOUNT_EXISTS',errcode='23505'; end if;
  select * into employee_row from public.servidores
    where upper(matricula)=upper(access_row.registration) or cpf=access_row.cpf
    order by case when upper(matricula)=upper(access_row.registration) and cpf=access_row.cpf then 0 else 1 end limit 1;
  if found and (upper(employee_row.matricula)<>upper(access_row.registration)
    or employee_row.cpf is distinct from access_row.cpf or employee_row.birth_date is distinct from access_row.birth_date
    or (employee_row.profile_id is not null and employee_row.profile_id<>account_id))
    then raise exception using message='IDENTITY_CONFLICT',errcode='P0001'; end if;
  if existing_profile.id is null then
    insert into public.profiles(id,full_name,role,roles,cpf,must_change_password)
    values(account_id,btrim(access_row.full_name),
      case when 'administrador'=any(clean_roles) then 'administrador'::public.app_role
        when 'rh'=any(clean_roles) then 'rh'::public.app_role
        when 'diretor'=any(clean_roles) then 'diretor'::public.app_role
        else 'servidor'::public.app_role end,
      clean_roles,access_row.cpf,false);
    merged_roles := clean_roles;
  else
    select array_agg(distinct value) into merged_roles from unnest(existing_profile.roles||clean_roles) value;
    update public.profiles set roles=merged_roles,
      role=case when 'administrador'=any(merged_roles) then 'administrador'::public.app_role
        when 'rh'=any(merged_roles) then 'rh'::public.app_role
        when 'diretor'=any(merged_roles) then 'diretor'::public.app_role
        else 'servidor'::public.app_role end
    where id=account_id;
  end if;
  if employee_row.id is not null then
    update public.servidores set profile_id=account_id,updated_at=now() where id=employee_row.id;
  else
    insert into public.servidores(profile_id,full_name,matricula,cpf,birth_date,employment_type,active,declared_position,declared_unit)
    values(account_id,btrim(access_row.full_name),upper(btrim(access_row.registration)),access_row.cpf,
      access_row.birth_date,'pendente',false,nullif(btrim(access_row.requested_position),''),nullif(btrim(access_row.requested_unit),''));
  end if;
  if clean_roles && array['diretor','rh']::public.app_role[] then
    insert into public.profile_scopes(profile_id,lotacao_id)
    select account_id,scope_id from unnest(target_scope_ids) scope_id on conflict do nothing;
  end if;
  update public.access_requests set status='aprovada',reviewed_by=actor_id,reviewed_at=now(),auth_user_id=account_id,updated_at=now()
  where id=target_request_id;
  insert into public.audit_events(actor_id,action,entity_type,entity_id,new_value)
  values(actor_id,'access_request_approved','access_request',target_request_id,
    jsonb_build_object('account_id',account_id,'roles',clean_roles,'existing',existing_profile.id is not null));
end $$;

revoke all on function public.set_profile_access(uuid,uuid,public.app_role[],text,uuid[]) from public,anon,authenticated;
revoke all on function public.approve_cpf_access(uuid,uuid,uuid,public.app_role[],uuid[]) from public,anon,authenticated;
grant execute on function public.set_profile_access(uuid,uuid,public.app_role[],text,uuid[]) to service_role;
grant execute on function public.approve_cpf_access(uuid,uuid,uuid,public.app_role[],uuid[]) to service_role;
