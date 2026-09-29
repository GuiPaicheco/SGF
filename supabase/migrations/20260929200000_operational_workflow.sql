-- Fluxo operacional, banco de horas e notificacoes internas.

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid references public.vacation_requests(id) on delete cascade,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_created_idx on public.notifications(recipient_id, created_at desc);
create index if not exists notifications_request_id_idx on public.notifications(request_id);
alter table public.notifications enable row level security;
create policy "notifications_read_own" on public.notifications for select to authenticated using (recipient_id = (select auth.uid()));
create policy "notifications_update_own" on public.notifications for update to authenticated using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
revoke all on public.notifications from public, anon;
grant select, update(read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;
grant usage, select on sequence public.notifications_id_seq to service_role;

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
      select profile.id from public.profiles profile where profile.role = 'administrador'
    ) recipients where recipient is not null;
  end if;
  return new;
end $$;
revoke all on function private.notify_request_status() from public, anon, authenticated;
drop trigger if exists notify_request_status on public.vacation_requests;
create trigger notify_request_status after insert or update of status on public.vacation_requests for each row execute function private.notify_request_status();

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
  select role into actor_role from public.profiles where id = actor_id and not must_change_password;
  select * into request_row from public.vacation_requests where id = target_request_id for update;
  if not found then raise exception using message='REQUEST_NOT_FOUND',errcode='P0002'; end if;
  select * into employee_row from public.servidores where id = request_row.servidor_id;
  if actor_role is null then raise exception using message='ACTOR_NOT_ALLOWED',errcode='42501'; end if;
  if actor_role = 'servidor' and employee_row.profile_id <> actor_id then raise exception using message='REQUEST_NOT_ALLOWED',errcode='42501'; end if;
  if actor_role in ('diretor','rh') and not exists(select 1 from public.profile_scopes where profile_id=actor_id and lotacao_id=employee_row.lotacao_id) then raise exception using message='REQUEST_OUT_OF_SCOPE',errcode='42501'; end if;

  if target_action = 'devolver' and actor_role in ('diretor','rh','administrador') and request_row.status in ('enviada','em_analise') then next_status := 'devolvida';
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
revoke all on function public.manage_request_operation(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_request_operation(uuid,uuid,text,text,jsonb) to service_role;

create unique index if not exists time_bank_request_consumption_key on public.time_bank_entries(request_id) where request_id is not null and minutes < 0 and validated;

create or replace function public.manage_time_bank(actor_id uuid,target_servidor_id uuid,target_minutes integer,target_description text,target_date date default current_date)
returns integer language plpgsql security invoker set search_path='' as $$
declare role_value public.app_role; location_value uuid; balance integer;
begin
  select role into role_value from public.profiles where id=actor_id and not must_change_password;
  select lotacao_id into location_value from public.servidores where id=target_servidor_id;
  if role_value not in ('rh','administrador') or (role_value='rh' and not exists(select 1 from public.profile_scopes where profile_id=actor_id and lotacao_id=location_value)) then raise exception using message='TIME_BANK_NOT_ALLOWED',errcode='42501'; end if;
  if target_minutes=0 or nullif(btrim(target_description),'') is null then raise exception using message='ENTRY_INVALID',errcode='22023'; end if;
  insert into public.time_bank_accounts(servidor_id,updated_by) values(target_servidor_id,actor_id) on conflict do nothing;
  update public.time_bank_accounts set validated_minutes=validated_minutes+target_minutes,updated_by=actor_id,updated_at=now()
    where servidor_id=target_servidor_id and validated_minutes+target_minutes>=0 returning validated_minutes into balance;
  if not found then raise exception using message='INSUFFICIENT_VALIDATED_BALANCE',errcode='22023'; end if;
  insert into public.time_bank_entries(servidor_id,minutes,description,occurred_on,validated,created_by) values(target_servidor_id,target_minutes,btrim(target_description),coalesce(target_date,current_date),true,actor_id);
  return balance;
end $$;
revoke all on function public.manage_time_bank(uuid,uuid,integer,text,date) from public,anon,authenticated;
grant execute on function public.manage_time_bank(uuid,uuid,integer,text,date) to service_role;

create or replace function private.guard_request_update()
returns trigger language plpgsql security invoker set search_path='' as $$
declare actor_role public.app_role := private.current_app_role();
begin
  if new.id<>old.id or new.servidor_id<>old.servidor_id or new.created_at<>old.created_at then raise exception 'Campos de identificacao da solicitacao nao podem ser alterados'; end if;
  if actor_role='servidor' and (old.status not in ('rascunho','devolvida') or new.status not in ('rascunho','enviada')) then raise exception 'Transicao nao permitida para o servidor';
  elsif actor_role='diretor' and new.status not in ('em_analise','devolvida','aprovada','rejeitada','cancelada') then raise exception 'Transicao nao permitida para a diretoria';
  elsif actor_role='rh' and new.status not in ('em_analise','devolvida','aprovada','rejeitada','programada','reprogramada','cancelada','concluida') then raise exception 'Transicao nao permitida para o RH';
  elsif actor_role is null and current_user not in ('service_role','postgres') then raise exception 'Perfil sem permissao para alterar solicitacoes'; end if;
  new.updated_at:=now(); if new.status='enviada' and old.status<>'enviada' then new.submitted_at:=now(); end if; return new;
end $$;
