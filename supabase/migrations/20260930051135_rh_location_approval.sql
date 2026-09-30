-- Permite que o RH aprove acesso de servidor somente na propria lotacao.
create or replace function public.approve_cpf_access(
  actor_id uuid, target_request_id uuid, account_id uuid, target_roles public.app_role[], target_scope_ids uuid[] default '{}'
) returns void language plpgsql security invoker set search_path = '' as $$
declare access_row public.access_requests%rowtype; employee_row public.servidores%rowtype;
  clean_roles public.app_role[]; existing_profile public.profiles%rowtype;
begin
  select array_agg(distinct value) into clean_roles from unnest(target_roles) value;
  if clean_roles is null or not (clean_roles <@ array['servidor','rh','administrador']::public.app_role[])
    then raise exception using message='ROLE_NOT_ALLOWED',errcode='22023'; end if;
  if private.actor_role(actor_id) = 'rh' then
    if clean_roles is distinct from array['servidor'::public.app_role]
      or coalesce(cardinality(target_scope_ids),0) <> 1
      or not exists(select 1 from public.profile_scopes where profile_id=actor_id and lotacao_id=target_scope_ids[1])
      then raise exception using message='SCOPE_REQUIRED',errcode='42501'; end if;
  elsif private.actor_role(actor_id) is distinct from 'administrador' then
    raise exception using message='ADMIN_REQUIRED',errcode='42501';
  end if;
  if 'rh'=any(clean_roles) and coalesce(cardinality(target_scope_ids),0)=0
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
        case when 'administrador'=any(clean_roles) then 'administrador'::public.app_role when 'rh'=any(clean_roles) then 'rh'::public.app_role else 'servidor'::public.app_role end,
        clean_roles,access_row.cpf,false);
  else
    update public.profiles set roles=(select array_agg(distinct value) from unnest(existing_profile.roles||clean_roles) value),
      role=case when 'administrador'=any(existing_profile.roles||clean_roles) then 'administrador'::public.app_role
        when 'rh'=any(existing_profile.roles||clean_roles) then 'rh'::public.app_role else 'servidor'::public.app_role end
      where id=account_id;
  end if;
  if employee_row.id is not null then
    update public.servidores set profile_id=account_id,updated_at=now() where id=employee_row.id;
  else
    insert into public.servidores(profile_id,full_name,matricula,cpf,birth_date,employment_type,active,declared_position,declared_unit)
      values(account_id,btrim(access_row.full_name),upper(btrim(access_row.registration)),access_row.cpf,
        access_row.birth_date,'pendente',false,nullif(btrim(access_row.requested_position),''),nullif(btrim(access_row.requested_unit),''));
  end if;
  if 'rh'=any(clean_roles) then insert into public.profile_scopes(profile_id,lotacao_id)
    select account_id,scope_id from unnest(target_scope_ids) scope_id on conflict do nothing; end if;
  update public.access_requests set status='aprovada',reviewed_by=actor_id,reviewed_at=now(),auth_user_id=account_id,updated_at=now()
    where id=target_request_id;
  insert into public.audit_events(actor_id,action,entity_type,entity_id,new_value)
    values(actor_id,'access_request_approved','access_request',target_request_id,
      jsonb_build_object('account_id',account_id,'roles',clean_roles,'existing',existing_profile.id is not null));
end $$;
