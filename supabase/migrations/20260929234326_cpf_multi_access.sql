-- Uma identidade Auth por CPF, com acessos acumuláveis e contexto por requisição.
alter table public.profiles add column cpf text;
update public.profiles p set cpf = s.cpf from public.servidores s where s.profile_id = p.id and s.cpf ~ '^\d{11}$';
create unique index profiles_cpf_unique on public.profiles(cpf) where cpf is not null;
alter table public.profiles add constraint profiles_cpf_format check (cpf is null or cpf ~ '^\d{11}$');

alter table public.profiles add column roles public.app_role[] not null default array['servidor'::public.app_role];
update public.profiles set roles = array[case when role in ('diretor','gerencia') then 'rh'::public.app_role else role end],
  role = case when role in ('diretor','gerencia') then 'rh'::public.app_role else role end;
alter table public.profiles add constraint profiles_roles_allowed check (
  cardinality(roles) between 1 and 3 and roles <@ array['servidor','rh','administrador']::public.app_role[]
);
alter table public.profiles add constraint profiles_primary_role_granted check (role = any(roles));
drop policy if exists profiles_update_own on public.profiles;
revoke insert, update, delete on public.profiles from public, anon, authenticated;
grant insert, update, delete on public.profiles to service_role;

create or replace function private.actor_role(actor_id uuid)
returns public.app_role language plpgsql stable security definer set search_path = '' as $$
declare selected text; granted public.app_role[];
begin
  select roles into granted from public.profiles where id = actor_id and not must_change_password;
  if granted is null then return null; end if;
  selected := (nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-sgf-role');
  if selected in ('servidor','rh','administrador') then
    if selected::public.app_role = any(granted) then return selected::public.app_role; end if;
  end if;
  if selected is null and cardinality(granted) = 1 then return granted[1]; end if;
  return null;
end $$;

create or replace function public.set_profile_access(
  actor_id uuid, target_profile_id uuid, target_roles public.app_role[],
  target_cpf text, target_scope_ids uuid[] default '{}'
) returns void language plpgsql security invoker set search_path = '' as $$
declare clean_roles public.app_role[]; old_roles public.app_role[]; clean_cpf text := regexp_replace(coalesce(target_cpf,''), '\D','','g');
begin
  if private.actor_role(actor_id) is distinct from 'administrador' then raise exception using message='ADMIN_REQUIRED',errcode='42501'; end if;
  if actor_id=target_profile_id then raise exception using message='SELF_ROLE_CHANGE_BLOCKED',errcode='22023'; end if;
  select roles into old_roles from public.profiles where id=target_profile_id for update;
  if not found then raise exception using message='PROFILE_NOT_FOUND',errcode='P0002'; end if;
  select array_agg(distinct value) into clean_roles from unnest(target_roles) value;
  if clean_roles is null or not (clean_roles <@ array['servidor','rh','administrador']::public.app_role[])
    then raise exception using message='ROLE_NOT_ALLOWED',errcode='22023'; end if;
  if clean_cpf !~ '^\d{11}$' then raise exception using message='CPF_REQUIRED',errcode='22023'; end if;
  if 'rh' = any(clean_roles) and coalesce(cardinality(target_scope_ids),0)=0
    then raise exception using message='SCOPE_REQUIRED',errcode='22023'; end if;
  if exists(select 1 from unnest(coalesce(target_scope_ids,'{}')) scope_id
    where not exists(select 1 from public.lotacoes where id=scope_id and active))
    then raise exception using message='INVALID_SCOPE',errcode='22023'; end if;
  if 'servidor' = any(clean_roles) and not exists(select 1 from public.servidores where profile_id=target_profile_id)
    then raise exception using message='EMPLOYEE_REQUIRED',errcode='22023'; end if;
  if exists(select 1 from public.servidores where profile_id=target_profile_id and cpf is distinct from clean_cpf)
    then raise exception using message='IDENTITY_CONFLICT',errcode='22023'; end if;
  update public.profiles set cpf=clean_cpf,roles=clean_roles,
    role=case when 'administrador'=any(clean_roles) then 'administrador'::public.app_role
      when 'rh'=any(clean_roles) then 'rh'::public.app_role else 'servidor'::public.app_role end,
    must_change_password=case when old_roles && array['rh','administrador']::public.app_role[] then must_change_password
      else ('rh'=any(clean_roles) or 'administrador'=any(clean_roles)) end
    where id=target_profile_id;
  delete from public.profile_scopes where profile_id=target_profile_id;
  if 'rh'=any(clean_roles) then insert into public.profile_scopes(profile_id,lotacao_id)
    select target_profile_id,scope_id from unnest(target_scope_ids) scope_id on conflict do nothing; end if;
  insert into public.audit_events(actor_id,action,entity_type,entity_id,new_value)
    values(actor_id,'profile_access_updated','profile',target_profile_id,
      jsonb_build_object('roles',clean_roles,'cpf_last4',right(clean_cpf,4),'scopes',target_scope_ids));
end $$;
revoke all on function public.manage_profile_access(uuid,uuid,public.app_role,text,uuid[]) from service_role;
revoke all on function public.set_profile_access(uuid,uuid,public.app_role[],text,uuid[]) from public,anon,authenticated;
grant execute on function public.set_profile_access(uuid,uuid,public.app_role[],text,uuid[]) to service_role;

create or replace function public.approve_cpf_access(
  actor_id uuid, target_request_id uuid, account_id uuid, target_roles public.app_role[], target_scope_ids uuid[] default '{}'
) returns void language plpgsql security invoker set search_path = '' as $$
declare access_row public.access_requests%rowtype; employee_row public.servidores%rowtype;
  clean_roles public.app_role[]; existing_profile public.profiles%rowtype;
begin
  if private.actor_role(actor_id) is distinct from 'administrador' then raise exception using message='ADMIN_REQUIRED',errcode='42501'; end if;
  select array_agg(distinct value) into clean_roles from unnest(target_roles) value;
  if clean_roles is null or not (clean_roles <@ array['servidor','rh','administrador']::public.app_role[])
    then raise exception using message='ROLE_NOT_ALLOWED',errcode='22023'; end if;
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
revoke all on function public.finalize_access_request(uuid,uuid,uuid,public.app_role,text,uuid[]) from service_role;
revoke all on function public.claim_employee_account(uuid,text,text,date,text,text,text) from service_role;
revoke all on function public.approve_cpf_access(uuid,uuid,uuid,public.app_role[],uuid[]) from public,anon,authenticated;
grant execute on function public.approve_cpf_access(uuid,uuid,uuid,public.app_role[],uuid[]) to service_role;

create or replace function private.current_app_role()
returns public.app_role language sql stable security definer set search_path = ''
as $$ select private.actor_role((select auth.uid())) $$;

create or replace function private.is_admin_or_rh()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(private.current_app_role() = 'administrador', false) $$;

create or replace function private.can_manage_servidor(target_servidor uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_app_role() = 'administrador' or exists (
    select 1 from public.servidores s join public.profile_scopes ps on ps.lotacao_id = s.lotacao_id
    where s.id = target_servidor and ps.profile_id = (select auth.uid())
      and private.current_app_role() = 'rh'
  ), false)
$$;
revoke all on function private.actor_role(uuid) from public, anon;
grant execute on function private.actor_role(uuid) to authenticated, service_role;

-- RH executa as duas etapas, preservando a ordem e o histórico de cada decisão.
create or replace function public.decide_request_approval(
  target_request_id uuid, target_stage public.approval_stage,
  target_decision public.approval_decision, target_notes text default null
) returns public.request_status language plpgsql security invoker set search_path = '' as $$
declare actor_role public.app_role := private.current_app_role(); request_row public.vacation_requests%rowtype;
  next_status public.request_status;
begin
  if target_decision not in ('aprovada','rejeitada') then raise exception using message='DECISION_NOT_ALLOWED',errcode='P0001'; end if;
  if target_decision='rejeitada' and nullif(btrim(target_notes),'') is null then raise exception using message='REJECTION_REASON_REQUIRED',errcode='P0001'; end if;
  if actor_role not in ('rh','administrador') or actor_role is null then raise exception using message='ROLE_NOT_ALLOWED',errcode='P0001'; end if;
  select request.* into request_row from public.vacation_requests request
    where request.id=target_request_id and private.can_manage_servidor(request.servidor_id) for update;
  if not found then raise exception using message='REQUEST_NOT_FOUND',errcode='P0001'; end if;
  if request_row.status not in ('enviada','em_analise') then raise exception using message='REQUEST_ALREADY_DECIDED',errcode='P0001'; end if;
  if target_stage='rh' and not exists(select 1 from public.request_approvals approval
    where approval.request_id=target_request_id and approval.stage='chefia_imediata' and approval.decision='aprovada')
    then raise exception using message='MANAGER_APPROVAL_REQUIRED',errcode='P0001'; end if;
  update public.request_approvals set decision=target_decision,decided_by=(select auth.uid()),
    notes=nullif(btrim(target_notes),''),decided_at=now()
    where request_id=target_request_id and stage=target_stage and decision='pendente';
  if not found then raise exception using message='STAGE_ALREADY_DECIDED',errcode='P0001'; end if;
  next_status := case when target_decision='rejeitada' then 'rejeitada'::public.request_status
    when target_stage='chefia_imediata' then 'em_analise'::public.request_status else 'aprovada'::public.request_status end;
  update public.vacation_requests set status=next_status where id=target_request_id;
  return next_status;
end $$;

-- Rotinas de gestão usam o acesso escolhido e conferido no banco.
create or replace function public.manage_location_registry(
  actor_id uuid, target_id uuid, target_name text, target_code text,
  target_unit_type public.unit_type, target_parent_id uuid, target_active boolean,
  responsible_ids uuid[] default '{}'
) returns uuid language plpgsql security invoker set search_path='' as $$
declare result_id uuid;
begin
  if private.actor_role(actor_id) is distinct from 'administrador'
    then raise exception using message='ADMIN_REQUIRED',errcode='42501'; end if;
  if nullif(btrim(target_name),'') is null then raise exception using message='NAME_REQUIRED',errcode='22023'; end if;
  if target_parent_id=target_id then raise exception using message='PARENT_CYCLE',errcode='22023'; end if;
  if target_parent_id is not null and not exists(select 1 from public.lotacoes where id=target_parent_id) then raise exception using message='PARENT_NOT_FOUND',errcode='P0002'; end if;
  if exists(select 1 from unnest(coalesce(responsible_ids,'{}')) responsible where not exists(select 1 from public.profiles where id=responsible and 'rh'=any(roles))) then raise exception using message='INVALID_RESPONSIBLE',errcode='22023'; end if;
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
  if private.actor_role(actor_id) not in ('administrador','rh') or private.actor_role(actor_id) is null
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
  actor_role := private.actor_role(actor_id);
  if actor_role not in ('administrador','rh') then actor_role := null; end if;
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
    if actor_role='rh' and not exists(select 1 from public.profile_scopes where profile_id=actor_id and lotacao_id=old_row.lotacao_id) then raise exception using message='SOURCE_SCOPE_REQUIRED',errcode='42501'; end if;
    update public.servidores set full_name=btrim(target_full_name),matricula=upper(btrim(target_registration)),cpf=clean_cpf,birth_date=target_birth_date,admission_date=target_admission_date,employment_type=btrim(target_employment_type),lotacao_id=target_lotacao_id,cargo_id=target_cargo_id,funcao_id=target_funcao_id,weekly_hours=target_weekly_hours,active=target_active,updated_at=now() where id=target_id returning id into result_id;
    if (old_row.lotacao_id,old_row.cargo_id,old_row.funcao_id,old_row.employment_type,old_row.active) is distinct from (target_lotacao_id,target_cargo_id,target_funcao_id,btrim(target_employment_type),target_active) then
      insert into public.employee_assignment_history(servidor_id,previous_lotacao_id,new_lotacao_id,previous_cargo_id,new_cargo_id,previous_funcao_id,new_funcao_id,previous_employment_type,new_employment_type,previous_active,new_active,reason,changed_by)
      values(result_id,old_row.lotacao_id,target_lotacao_id,old_row.cargo_id,target_cargo_id,old_row.funcao_id,target_funcao_id,old_row.employment_type,btrim(target_employment_type),old_row.active,target_active,btrim(target_reason),actor_id);
    end if;
  end if;
  update public.servidores s set profile_id=p.id from public.profiles p
    where s.id=result_id and s.profile_id is null and p.cpf=clean_cpf;
  update public.profiles set cpf=clean_cpf where id=(select profile_id from public.servidores where id=result_id);
  insert into public.audit_events(actor_id,action,entity_type,entity_id,new_value)
  values(actor_id,'employee_registry_saved','servidor',result_id,jsonb_build_object('lotacao_id',target_lotacao_id,'cargo_id',target_cargo_id,'funcao_id',target_funcao_id,'employment_type',target_employment_type,'active',target_active));
  return result_id;
end $$;

create or replace function private.notify_request_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_protocol text := coalesce(new.protocol, left(new.id::text, 8));
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.notifications(recipient_id, request_id, title, message)
    select recipient, new.id, 'Solicitacao ' || v_protocol,
      'Situacao atualizada para ' || replace(new.status::text, '_', ' ') || '.'
    from (
      select servidor.profile_id recipient from public.servidores servidor where servidor.id = new.servidor_id
      union
      select scope.profile_id from public.servidores servidor join public.profile_scopes scope on scope.lotacao_id = servidor.lotacao_id where servidor.id = new.servidor_id
      union
      select profile.id from public.profiles profile where 'administrador'=any(profile.roles)
    ) recipients where recipient is not null;
  end if;
  return new;
end $$;

create or replace function public.manage_request_operation(
  actor_id uuid, target_request_id uuid, target_action text, target_notes text default null, target_periods jsonb default null
) returns public.request_status language plpgsql security invoker set search_path = '' as $$
declare
  actor_role public.app_role;
  request_row public.vacation_requests%rowtype;
  employee_row public.servidores%rowtype;
  next_status public.request_status;
  consumed integer;
  period_count integer;
  v_actor uuid := actor_id;
begin
  actor_role := private.actor_role(actor_id);
  select * into request_row from public.vacation_requests where id = target_request_id for update;
  if not found then raise exception using message='REQUEST_NOT_FOUND',errcode='P0002'; end if;
  select * into employee_row from public.servidores where id = request_row.servidor_id;
  if actor_role is null then raise exception using message='ACTOR_NOT_ALLOWED',errcode='42501'; end if;
  if actor_role = 'servidor' and employee_row.profile_id <> actor_id then raise exception using message='REQUEST_NOT_ALLOWED',errcode='42501'; end if;
  if actor_role in ('rh') and not exists(select 1 from public.profile_scopes where profile_id=actor_id and lotacao_id=employee_row.lotacao_id) then raise exception using message='REQUEST_OUT_OF_SCOPE',errcode='42501'; end if;

  if target_action = 'devolver' and actor_role in ('rh','administrador') and request_row.status in ('enviada','em_analise') then next_status := 'devolvida';
  elsif target_action = 'reenviar' and actor_role='servidor' and request_row.status='devolvida' then next_status := 'enviada';
  elsif target_action = 'programar' and actor_role in ('rh','administrador') and request_row.status='aprovada' then next_status := 'programada';
  elsif target_action = 'reprogramar' and actor_role in ('rh','administrador') and request_row.status in ('programada','reprogramada') then next_status := 'reprogramada';
  elsif target_action = 'cancelar' and ((actor_role in ('rh','administrador') and request_row.status in ('enviada','em_analise','devolvida','aprovada','programada','reprogramada')) or (actor_role='servidor' and request_row.status in ('enviada','devolvida'))) then next_status := 'cancelada';
  elsif target_action = 'concluir' and actor_role in ('rh','administrador') and request_row.status in ('programada','reprogramada') then next_status := 'concluida';
  else raise exception using message='TRANSITION_NOT_ALLOWED',errcode='22023'; end if;
  if target_action in ('devolver','cancelar','reprogramar') and nullif(btrim(target_notes),'') is null then raise exception using message='NOTES_REQUIRED',errcode='22023'; end if;

  if target_periods is not null then
    select count(*) into period_count from jsonb_array_elements(target_periods) p
      where (p->>'start_date')::date <= (p->>'end_date')::date and (p->>'end_date')::date < (p->>'return_date')::date and (p->>'days')::integer > 0;
    if period_count <> jsonb_array_length(target_periods) or period_count not between 1 and 2 then raise exception using message='PERIODS_INVALID',errcode='22023'; end if;
    delete from public.request_periods where request_id=target_request_id;
    insert into public.request_periods(request_id,sequence,start_date,end_date,return_date,days,hours)
      select target_request_id, ordinality, (p->>'start_date')::date,(p->>'end_date')::date,(p->>'return_date')::date,(p->>'days')::integer,nullif(p->>'hours','')::numeric
      from jsonb_array_elements(target_periods) with ordinality as item(p,ordinality);
    update public.vacation_requests set start_date=(target_periods->0->>'start_date')::date,end_date=(target_periods->(jsonb_array_length(target_periods)-1)->>'end_date')::date,return_date=(target_periods->(jsonb_array_length(target_periods)-1)->>'return_date')::date where id=target_request_id;
  end if;

  if target_action='concluir' and coalesce(request_row.requested_hours,0)>0 then
    consumed := round(request_row.requested_hours * 60);
    if consumed is null or consumed <= 0 then raise exception using message='REQUEST_HOURS_INVALID',errcode='22023'; end if;
    insert into public.time_bank_accounts(servidor_id) values(request_row.servidor_id) on conflict do nothing;
    update public.time_bank_accounts set validated_minutes=validated_minutes-consumed,updated_by=actor_id,updated_at=now()
      where servidor_id=request_row.servidor_id and validated_minutes>=consumed;
    if not found then raise exception using message='INSUFFICIENT_VALIDATED_BALANCE',errcode='22023'; end if;
    insert into public.time_bank_entries(servidor_id,request_id,minutes,description,validated,created_by)
      values(request_row.servidor_id,target_request_id,-consumed,'Consumo na conclusao da solicitacao '||coalesce(request_row.protocol,target_request_id::text),true,actor_id)
      on conflict do nothing;
  end if;
  update public.vacation_requests set status=next_status,notes=coalesce(nullif(btrim(target_notes),''),notes) where id=target_request_id;
  update public.request_status_history set actor_id=v_actor,notes=nullif(btrim(target_notes),'') where id=(select max(id) from public.request_status_history where request_id=target_request_id);
  if target_action='reenviar' then update public.request_approvals set decision='pendente',decided_by=null,notes=null,decided_at=null where request_id=target_request_id; end if;
  return next_status;
end $$;

create or replace function public.manage_time_bank(actor_id uuid,target_servidor_id uuid,target_minutes integer,target_description text,target_date date default current_date)
returns integer language plpgsql security invoker set search_path='' as $$
declare role_value public.app_role; location_value uuid; balance integer;
begin
  role_value := private.actor_role(actor_id);
  select lotacao_id into location_value from public.servidores where id=target_servidor_id;
  if role_value is null or role_value not in ('rh','administrador') or (role_value='rh' and not exists(select 1 from public.profile_scopes where profile_id=actor_id and lotacao_id=location_value)) then raise exception using message='TIME_BANK_NOT_ALLOWED',errcode='42501'; end if;
  if target_minutes=0 or nullif(btrim(target_description),'') is null then raise exception using message='ENTRY_INVALID',errcode='22023'; end if;
  insert into public.time_bank_accounts(servidor_id,updated_by) values(target_servidor_id,actor_id) on conflict do nothing;
  update public.time_bank_accounts set validated_minutes=validated_minutes+target_minutes,updated_by=actor_id,updated_at=now()
    where servidor_id=target_servidor_id and validated_minutes+target_minutes>=0 returning validated_minutes into balance;
  if not found then raise exception using message='INSUFFICIENT_VALIDATED_BALANCE',errcode='22023'; end if;
  insert into public.time_bank_entries(servidor_id,minutes,description,occurred_on,validated,created_by) values(target_servidor_id,target_minutes,btrim(target_description),coalesce(target_date,current_date),true,actor_id);
  return balance;
end $$;

create or replace function public.reject_access_request(
  actor_id uuid,
  target_request_id uuid,
  target_notes text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_id and private.actor_role(actor_id) = 'administrador'
  ) then raise exception using message = 'ADMIN_REQUIRED', errcode = '42501'; end if;
  if nullif(btrim(target_notes), '') is null then
    raise exception using message = 'REJECTION_REASON_REQUIRED', errcode = '22023';
  end if;
  update public.access_requests set status = 'rejeitada', notes = btrim(target_notes),
    reviewed_by = actor_id, reviewed_at = now(), updated_at = now()
  where id = target_request_id and status = 'pendente';
  if not found then raise exception using message = 'ACCESS_REQUEST_NOT_PENDING', errcode = 'P0002'; end if;
  insert into public.audit_events(actor_id, action, entity_type, entity_id, new_value)
  values (actor_id, 'access_request_rejected', 'access_request', target_request_id,
    jsonb_build_object('notes', btrim(target_notes)));
end
$$;
