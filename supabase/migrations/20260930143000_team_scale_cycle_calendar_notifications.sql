-- Equipes funcionais, ciclos da escala minima e notificacoes de calendario.
alter table public.servidores
  add column if not exists team_name text not null default 'Não se aplica';
alter table public.servidores
  add constraint servidores_team_name_valid
  check (char_length(btrim(team_name)) between 1 and 120);

alter table public.access_requests add column if not exists requested_team text;
alter table public.employee_inclusion_requests add column if not exists requested_team text;
alter table public.employee_assignment_history
  add column if not exists previous_team text,
  add column if not exists new_team text;

create table if not exists public.minimum_scale_days (
  lotacao_id uuid not null references public.lotacoes(id) on delete cascade,
  scale_date date not null,
  source_date date,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (lotacao_id, scale_date),
  constraint minimum_scale_days_source_before_date check (source_date is null or source_date < scale_date)
);
create index if not exists minimum_scale_days_date_idx
  on public.minimum_scale_days(scale_date, lotacao_id);
create index if not exists minimum_scale_days_updated_by_idx
  on public.minimum_scale_days(updated_by) where updated_by is not null;
alter table public.minimum_scale_days enable row level security;
revoke all on public.minimum_scale_days from public, anon, authenticated;
grant select, insert, update, delete on public.minimum_scale_days to service_role;

insert into public.minimum_scale_days(lotacao_id, scale_date, updated_by, updated_at)
select lotacao_id, scale_date, (array_agg(created_by order by created_at desc))[1], max(created_at)
from public.minimum_scale_assignments
group by lotacao_id, scale_date
on conflict (lotacao_id, scale_date) do nothing;

create or replace function public.set_minimum_scale(
  actor_id uuid, target_lotacao_id uuid, target_date date,
  target_servidor_ids uuid[], target_source_date date default null
) returns void language plpgsql security invoker set search_path='' as $$
declare actor_role public.app_role;
begin
  actor_role := private.actor_role(actor_id);
  if actor_role not in ('administrador','rh') or actor_role is null
    then raise exception using message='STAFF_REQUIRED',errcode='42501'; end if;
  if actor_role='rh' and not exists(select 1 from public.profile_scopes where profile_id=actor_id and lotacao_id=target_lotacao_id)
    then raise exception using message='TARGET_SCOPE_REQUIRED',errcode='42501'; end if;
  if target_source_date is not null and target_source_date >= target_date
    then raise exception using message='SOURCE_DATE_INVALID',errcode='22023'; end if;
  if exists(select 1 from unnest(coalesce(target_servidor_ids,'{}')) servidor_id
    where not exists(select 1 from public.servidores s where s.id=servidor_id and s.lotacao_id=target_lotacao_id and s.active))
    then raise exception using message='EMPLOYEE_OUT_OF_LOCATION',errcode='22023'; end if;
  insert into public.minimum_scale_days(lotacao_id,scale_date,source_date,updated_by,updated_at)
  values(target_lotacao_id,target_date,target_source_date,actor_id,now())
  on conflict(lotacao_id,scale_date) do update set source_date=excluded.source_date,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  delete from public.minimum_scale_assignments where lotacao_id=target_lotacao_id and scale_date=target_date;
  insert into public.minimum_scale_assignments(lotacao_id,scale_date,servidor_id,created_by)
    select target_lotacao_id,target_date,servidor_id,actor_id from unnest(coalesce(target_servidor_ids,'{}')) servidor_id;
  insert into public.audit_events(actor_id,action,entity_type,new_value)
    values(actor_id,'minimum_scale_updated','lotacao',jsonb_build_object('lotacao_id',target_lotacao_id,'date',target_date,'source_date',target_source_date,'servidor_ids',target_servidor_ids));
end $$;
revoke all on function public.set_minimum_scale(uuid,uuid,date,uuid[],date) from public,anon,authenticated;
grant execute on function public.set_minimum_scale(uuid,uuid,date,uuid[],date) to service_role;

drop function if exists public.manage_employee_registry(uuid,uuid,text,text,text,date,date,text,uuid,uuid,uuid,integer,boolean,text);
create function public.manage_employee_registry(
  actor_id uuid, target_id uuid, target_full_name text, target_registration text,
  target_cpf text, target_birth_date date, target_admission_date date,
  target_employment_type text, target_lotacao_id uuid, target_cargo_id uuid,
  target_funcao_id uuid, target_weekly_hours integer, target_active boolean,
  target_reason text, target_team text
) returns uuid language plpgsql security invoker set search_path='' as $$
declare actor_role public.app_role; old_row public.servidores%rowtype; result_id uuid;
  clean_cpf text:=regexp_replace(target_cpf,'\D','','g'); clean_team text:=coalesce(nullif(btrim(target_team),''),'Não se aplica');
begin
  actor_role := private.actor_role(actor_id);
  if actor_role not in ('administrador','rh') then actor_role := null; end if;
  if actor_role is null then raise exception using message='STAFF_REQUIRED',errcode='42501'; end if;
  if nullif(btrim(target_full_name),'') is null or nullif(btrim(target_registration),'') is null or nullif(btrim(target_employment_type),'') is null then raise exception using message='REQUIRED_FIELDS',errcode='22023'; end if;
  if clean_cpf!~'^\d{11}$' then raise exception using message='CPF_INVALID',errcode='22023'; end if;
  if char_length(clean_team)>120 then raise exception using message='TEAM_INVALID',errcode='22023'; end if;
  if nullif(btrim(target_reason),'') is null then raise exception using message='REASON_REQUIRED',errcode='22023'; end if;
  if target_weekly_hours is not null and (target_weekly_hours<1 or target_weekly_hours>80) then raise exception using message='WEEKLY_HOURS_INVALID',errcode='22023'; end if;
  if target_lotacao_id is not null and not exists(select 1 from public.lotacoes where id=target_lotacao_id and active) then raise exception using message='LOCATION_INVALID',errcode='22023'; end if;
  if actor_role='rh' and (target_lotacao_id is null or not exists(select 1 from public.profile_scopes where profile_id=actor_id and lotacao_id=target_lotacao_id)) then raise exception using message='TARGET_SCOPE_REQUIRED',errcode='42501'; end if;
  if target_id is null then
    insert into public.servidores(full_name,matricula,cpf,birth_date,admission_date,employment_type,lotacao_id,cargo_id,funcao_id,weekly_hours,active,team_name)
    values(btrim(target_full_name),upper(btrim(target_registration)),clean_cpf,target_birth_date,target_admission_date,btrim(target_employment_type),target_lotacao_id,target_cargo_id,target_funcao_id,target_weekly_hours,target_active,clean_team)
    returning id into result_id;
    insert into public.employee_assignment_history(servidor_id,new_lotacao_id,new_cargo_id,new_funcao_id,new_employment_type,new_active,new_team,reason,changed_by)
    values(result_id,target_lotacao_id,target_cargo_id,target_funcao_id,btrim(target_employment_type),target_active,clean_team,btrim(target_reason),actor_id);
  else
    select * into old_row from public.servidores where id=target_id for update;
    if not found then raise exception using message='EMPLOYEE_NOT_FOUND',errcode='P0002'; end if;
    if actor_role='rh' and not exists(select 1 from public.profile_scopes where profile_id=actor_id and lotacao_id=old_row.lotacao_id) then raise exception using message='SOURCE_SCOPE_REQUIRED',errcode='42501'; end if;
    update public.servidores set full_name=btrim(target_full_name),matricula=upper(btrim(target_registration)),cpf=clean_cpf,birth_date=target_birth_date,admission_date=target_admission_date,employment_type=btrim(target_employment_type),lotacao_id=target_lotacao_id,cargo_id=target_cargo_id,funcao_id=target_funcao_id,weekly_hours=target_weekly_hours,active=target_active,team_name=clean_team,updated_at=now() where id=target_id returning id into result_id;
    if (old_row.lotacao_id,old_row.cargo_id,old_row.funcao_id,old_row.employment_type,old_row.active,old_row.team_name) is distinct from (target_lotacao_id,target_cargo_id,target_funcao_id,btrim(target_employment_type),target_active,clean_team) then
      insert into public.employee_assignment_history(servidor_id,previous_lotacao_id,new_lotacao_id,previous_cargo_id,new_cargo_id,previous_funcao_id,new_funcao_id,previous_employment_type,new_employment_type,previous_active,new_active,previous_team,new_team,reason,changed_by)
      values(result_id,old_row.lotacao_id,target_lotacao_id,old_row.cargo_id,target_cargo_id,old_row.funcao_id,target_funcao_id,old_row.employment_type,btrim(target_employment_type),old_row.active,target_active,old_row.team_name,clean_team,btrim(target_reason),actor_id);
    end if;
  end if;
  update public.servidores s set profile_id=p.id from public.profiles p where s.id=result_id and s.profile_id is null and p.cpf=clean_cpf;
  update public.profiles set cpf=clean_cpf where id=(select profile_id from public.servidores where id=result_id);
  insert into public.audit_events(actor_id,action,entity_type,entity_id,new_value)
  values(actor_id,'employee_registry_saved','servidor',result_id,jsonb_build_object('lotacao_id',target_lotacao_id,'cargo_id',target_cargo_id,'funcao_id',target_funcao_id,'team',clean_team,'employment_type',target_employment_type,'active',target_active));
  return result_id;
end $$;
revoke all on function public.manage_employee_registry(uuid,uuid,text,text,text,date,date,text,uuid,uuid,uuid,integer,boolean,text,text) from public,anon,authenticated;
grant execute on function public.manage_employee_registry(uuid,uuid,text,text,text,date,date,text,uuid,uuid,uuid,integer,boolean,text,text) to service_role;

create or replace function private.fill_requested_team()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.requested_team is null then
    select team_name into new.requested_team from public.servidores where id=new.servidor_id;
  end if;
  new.requested_team := coalesce(nullif(btrim(new.requested_team),''),'Não se aplica');
  return new;
end $$;
drop trigger if exists employee_inclusion_fill_team on public.employee_inclusion_requests;
create trigger employee_inclusion_fill_team before insert on public.employee_inclusion_requests
for each row execute function private.fill_requested_team();

create or replace function private.sync_approved_team()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='access_requests' and new.status='aprovada' and old.status is distinct from new.status then
    update public.servidores set team_name=coalesce(nullif(btrim(new.requested_team),''),'Não se aplica'),updated_at=now()
      where profile_id=new.auth_user_id;
  elsif tg_table_name='employee_inclusion_requests' and new.status='aprovada' and old.status is distinct from new.status then
    update public.servidores set team_name=coalesce(nullif(btrim(new.requested_team),''),'Não se aplica'),updated_at=now()
      where id=new.servidor_id;
  end if;
  return new;
end $$;
drop trigger if exists access_request_sync_team on public.access_requests;
create trigger access_request_sync_team after update on public.access_requests
for each row execute function private.sync_approved_team();
drop trigger if exists employee_inclusion_sync_team on public.employee_inclusion_requests;
create trigger employee_inclusion_sync_team after update on public.employee_inclusion_requests
for each row execute function private.sync_approved_team();

create or replace function private.notify_calendar_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare event_label text := case when new.type='feriado' then 'Feriado' else 'Ponto facultativo' end;
begin
  if new.active and (tg_op='INSERT' or old.active is distinct from new.active or old.event_date is distinct from new.event_date or old.type is distinct from new.type or old.name is distinct from new.name) then
    insert into public.notifications(recipient_id,request_id,title,message)
    select distinct recipient, affected.request_id, 'Calendário alterado durante afastamento',
      event_label || ' "' || new.name || '" em ' || to_char(new.event_date,'DD/MM/YYYY') || '. Confira o período e a data de retorno.'
    from (
      select request.id request_id, servidor.profile_id recipient
      from public.vacation_requests request join public.request_periods period on period.request_id=request.id
      join public.servidores servidor on servidor.id=request.servidor_id
      where request.status in ('enviada','em_analise','devolvida','aprovada','programada','reprogramada') and new.event_date between period.start_date and period.end_date
      union
      select request.id, scope.profile_id
      from public.vacation_requests request join public.request_periods period on period.request_id=request.id
      join public.servidores servidor on servidor.id=request.servidor_id
      join public.profile_scopes scope on scope.lotacao_id=servidor.lotacao_id
      where request.status in ('enviada','em_analise','devolvida','aprovada','programada','reprogramada') and new.event_date between period.start_date and period.end_date
      union
      select request.id, profile.id
      from public.vacation_requests request join public.request_periods period on period.request_id=request.id
      cross join public.profiles profile
      where 'administrador'=any(profile.roles) and request.status in ('enviada','em_analise','devolvida','aprovada','programada','reprogramada') and new.event_date between period.start_date and period.end_date
    ) affected where recipient is not null;
  end if;
  return new;
end $$;
drop trigger if exists calendar_events_notify_affected on public.calendar_events;
create trigger calendar_events_notify_affected after insert or update on public.calendar_events
for each row execute function private.notify_calendar_change();

comment on table public.minimum_scale_days is 'Dias de escala minima explicitamente planejados, inclusive quando a lista nominal fica vazia.';
comment on column public.servidores.team_name is 'Equipe operacional informada pelo servidor ou RH; use Não se aplica quando inexistente.';
