-- Análise independente por CNES: aprovar, recusar e adicionar ao calendário.

create table public.request_rejection_reasons (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{2,63}$'),
  label text not null check (char_length(btrim(label)) between 3 and 160),
  input_mode text not null check (input_mode in ('bank','conflict','other')),
  active boolean not null default true,
  display_order integer not null default 0 check (display_order between 0 and 10000),
  version integer not null default 1 check (version > 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.request_rejection_reasons(code,label,input_mode,display_order) values
  ('insufficient_time_bank','Banco de Horas Insuficiente','bank',1),
  ('employee_conflict','Conflito com Funcionário','conflict',2),
  ('other','Outros','other',3);
alter table public.request_rejection_reasons enable row level security;
revoke all on public.request_rejection_reasons from public,anon,authenticated;
grant select,insert,update on public.request_rejection_reasons to service_role;

create table public.request_unit_reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.vacation_requests(id) on delete cascade,
  cnes_unit_id uuid not null references public.cnes_units(id) on delete restrict,
  lotacao_id uuid references public.lotacoes(id) on delete restrict,
  status text not null default 'pendente'
    check (status in ('pendente', 'aprovada', 'rejeitada', 'programada')),
  notes text,
  rejection_code text references public.request_rejection_reasons(code),
  rejection_label text,
  rejection_data jsonb,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  scheduled_by uuid references public.profiles(id) on delete set null,
  scheduled_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (request_id, cnes_unit_id, lotacao_id)
);

create index request_unit_reviews_cnes_status_idx
  on public.request_unit_reviews (cnes_unit_id, status, created_at desc);
create index request_unit_reviews_rejection_idx on public.request_unit_reviews(rejection_code) where rejection_code is not null;

alter table public.request_unit_reviews enable row level security;
revoke all on public.request_unit_reviews from public, anon, authenticated;
grant select on public.request_unit_reviews to authenticated;
grant select, insert, update, delete on public.request_unit_reviews to service_role;

create or replace function private.current_context_cnes()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare value text;
begin
  value := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb) ->> 'x-sgf-cnes';
  return nullif(value, '')::uuid;
exception when invalid_text_representation then
  return null;
end
$$;

create or replace function private.current_context_internal_lotacao()
returns uuid
language plpgsql stable security invoker set search_path = ''
as $$
declare selected_id uuid;
begin
  selected_id := nullif(coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb) ->> 'x-sgf-lotacao', '')::uuid;
  return (select id from public.lotacoes where id = selected_id and is_internal_allocation);
exception when invalid_text_representation then
  return null;
end
$$;

create policy request_unit_reviews_read_scoped
on public.request_unit_reviews
for select to authenticated
using (
  exists (
    select 1
    from public.vacation_requests request
    where request.id = request_id
      and (
        exists (
          select 1 from public.servidores employee
          where employee.id = request.servidor_id
            and employee.profile_id = (select auth.uid())
        )
        or (
          private.can_manage_servidor(request.servidor_id)
          and (
            private.actor_role((select auth.uid())) = 'administrador'
            or (cnes_unit_id = private.current_context_cnes() and lotacao_id is not distinct from private.current_context_internal_lotacao())
          )
        )
      )
  )
);

drop policy if exists request_day_responsibilities_read_scoped
  on public.request_day_responsibilities;
create policy request_day_responsibilities_read_scoped
on public.request_day_responsibilities
for select to authenticated
using (
  exists (
    select 1
    from public.vacation_requests request
    where request.id = request_id
      and (
        exists (
          select 1 from public.servidores employee
          where employee.id = request.servidor_id
            and employee.profile_id = (select auth.uid())
        )
        or (
          private.can_manage_servidor(request.servidor_id)
          and (
            private.actor_role((select auth.uid())) = 'administrador'
            or (cnes_unit_id = private.current_context_cnes() and lotacao_id is not distinct from private.current_context_internal_lotacao())
          )
        )
      )
  )
);

create or replace function private.ensure_request_unit_review()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.request_unit_reviews (request_id, cnes_unit_id, lotacao_id)
  values (new.request_id, new.cnes_unit_id, new.lotacao_id)
  on conflict (request_id, cnes_unit_id, lotacao_id) do nothing;
  return new;
end
$$;

drop trigger if exists request_day_responsibility_review on public.request_day_responsibilities;
create trigger request_day_responsibility_review
after insert on public.request_day_responsibilities
for each row execute function private.ensure_request_unit_review();

insert into public.request_unit_reviews (request_id, cnes_unit_id, lotacao_id)
select distinct responsibility.request_id, responsibility.cnes_unit_id, responsibility.lotacao_id
from public.request_day_responsibilities responsibility
on conflict (request_id, cnes_unit_id, lotacao_id) do nothing;

create or replace function public.manage_unit_request_review(
  actor_id uuid,
  target_review_id uuid,
  target_action text,
  target_notes text default null,
  expected_version integer default null,
  target_rejection jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_role public.app_role := private.actor_role(actor_id);
  selected_cnes uuid;
  selected_lotacao uuid;
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  review_row public.request_unit_reviews%rowtype;
  previous_request_status public.request_status;
  aggregate_status public.request_status;
  rejection public.request_rejection_reasons%rowtype;
  rejection_details jsonb;
  available numeric;
  required_hours numeric;
  conflict_start date;
  conflict_end date;
begin
  if actor_role not in ('diretor', 'rh', 'administrador') or actor_role is null then
    raise exception using message = 'STAFF_REQUIRED', errcode = '42501';
  end if;
  if target_action not in ('approve', 'reject', 'schedule') then
    raise exception using message = 'REVIEW_ACTION_INVALID', errcode = '22023';
  end if;
  if target_action = 'reject' and nullif(btrim(target_notes), '') is null then
    raise exception using message = 'REJECTION_REASON_REQUIRED', errcode = '22023';
  end if;
  if target_action='reject' then
    if target_notes is null or char_length(btrim(target_notes)) not between 3 and 2000 then
      raise exception 'REJECTION_DATA_INVALID' using errcode='22023'; end if;
    select * into rejection from public.request_rejection_reasons
      where code=target_rejection->>'code' and active;
    if not found then raise exception 'REJECTION_REASON_INACTIVE' using errcode='22023'; end if;
    if rejection.input_mode='bank' then
      if jsonb_typeof(target_rejection->'available_hours') is distinct from 'number'
         or jsonb_typeof(target_rejection->'required_hours') is distinct from 'number' then
        raise exception 'REJECTION_DATA_INVALID' using errcode='22023'; end if;
      available := (target_rejection->>'available_hours')::numeric;
      required_hours := (target_rejection->>'required_hours')::numeric;
      if available<0 or required_hours<=available or required_hours>100000 then
        raise exception 'REJECTION_DATA_INVALID' using errcode='22023'; end if;
      rejection_details := jsonb_build_object('available_hours',available,'required_hours',required_hours);
      target_notes := rejection.label||'. Saldo informado pelo RH: '||available||' h; necessário: '||required_hours||' h. '||btrim(target_notes);
    elsif rejection.input_mode='conflict' then
      begin
        conflict_start := (target_rejection->>'start_date')::date;
        conflict_end := (target_rejection->>'end_date')::date;
      exception when others then raise exception 'REJECTION_DATA_INVALID' using errcode='22023'; end;
      if conflict_start is null or conflict_end is null or conflict_end<conflict_start then
        raise exception 'REJECTION_DATA_INVALID' using errcode='22023'; end if;
      rejection_details := private.resolve_rejection_conflict_member(target_review_id,
        nullif(target_rejection->>'bond_unit_id','')::uuid,conflict_start,conflict_end);
      target_rejection := target_rejection || rejection_details;
      rejection_details := rejection_details || jsonb_build_object('start_date',conflict_start,'end_date',conflict_end);
      target_notes := rejection.label||'. Funcionário selecionado: '||(target_rejection->>'employee_name')||
        '; período: '||to_char(conflict_start,'DD/MM/YYYY')||' a '||to_char(conflict_end,'DD/MM/YYYY')||'. '||btrim(target_notes);
    else rejection_details := '{}'::jsonb; target_notes := rejection.label||'. '||btrim(target_notes);
    end if;
  end if;

  select * into review_row
  from public.request_unit_reviews
  where id = target_review_id
  for update;
  if not found then
    raise exception using message = 'REQUEST_NOT_FOUND', errcode = 'P0002';
  end if;
  if expected_version is null or review_row.version <> expected_version then
    raise exception using message = 'REVIEW_VERSION_CONFLICT', errcode = '40001';
  end if;

  if actor_role <> 'administrador' then
    begin
      selected_cnes := nullif(headers ->> 'x-sgf-cnes', '')::uuid;
      selected_lotacao := nullif(headers ->> 'x-sgf-lotacao', '')::uuid;
    exception when invalid_text_representation then
      raise exception using message = 'INVALID_ACCESS_CONTEXT', errcode = '42501';
    end;
    if selected_cnes is distinct from review_row.cnes_unit_id
       or selected_lotacao is null
       or not exists (
         select 1 from public.lotacoes location
         where location.id = selected_lotacao
           and review_row.lotacao_id is not distinct from
             case when location.is_internal_allocation then location.id else null end
       )
       or not exists (
         select 1
         from public.profile_scopes scope
         join public.lotacao_cnes_units mapping
           on mapping.lotacao_id = scope.lotacao_id
          and mapping.cnes_unit_id = review_row.cnes_unit_id
         where scope.profile_id = actor_id
           and scope.lotacao_id = selected_lotacao
       ) then
      raise exception using message = 'REQUEST_OUT_OF_SCOPE', errcode = '42501';
    end if;
  end if;

  if target_action = 'approve' and review_row.status <> 'pendente' then
    raise exception using message = 'REVIEW_TRANSITION_INVALID', errcode = '22023';
  elsif target_action = 'reject' and review_row.status not in ('pendente', 'aprovada') then
    raise exception using message = 'REVIEW_TRANSITION_INVALID', errcode = '22023';
  elsif target_action = 'schedule' and review_row.status <> 'aprovada' then
    raise exception using message = 'APPROVAL_REQUIRED', errcode = '22023';
  end if;

  update public.request_unit_reviews
  set status = case target_action when 'approve' then 'aprovada' when 'reject' then 'rejeitada' else 'programada' end,
      rejection_code = case when target_action='reject' then rejection.code else rejection_code end,
      rejection_label = case when target_action='reject' then rejection.label else rejection_label end,
      rejection_data = case when target_action='reject' then rejection_details else rejection_data end,
      notes = case when target_action = 'schedule' then notes else nullif(btrim(target_notes), '') end,
      decided_by = case when target_action in ('approve', 'reject') then actor_id else decided_by end,
      decided_at = case when target_action in ('approve', 'reject') then now() else decided_at end,
      scheduled_by = case when target_action = 'schedule' then actor_id else scheduled_by end,
      scheduled_at = case when target_action = 'schedule' then now() else scheduled_at end,
      version = version + 1,
      updated_at = now()
  where id = target_review_id and version = expected_version;
  if not found then
    raise exception using message = 'REVIEW_VERSION_CONFLICT', errcode = '40001';
  end if;

  select status into previous_request_status
  from public.vacation_requests where id = review_row.request_id for update;
  select case
    when bool_or(status = 'rejeitada') then 'rejeitada'::public.request_status
    when bool_and(status = 'programada') then 'programada'::public.request_status
    when bool_and(status in ('aprovada', 'programada')) then 'aprovada'::public.request_status
    else 'em_analise'::public.request_status
  end into aggregate_status
  from public.request_unit_reviews
  where request_id = review_row.request_id;

  update public.vacation_requests
  set status = aggregate_status,
      updated_at = now()
  where id = review_row.request_id;

  if previous_request_status is distinct from aggregate_status then
    insert into public.request_status_history (
      request_id, previous_status, new_status, actor_id, notes
    ) values (
      review_row.request_id, previous_request_status, aggregate_status, actor_id,
      nullif(btrim(target_notes), '')
    );
  end if;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_type, entity_id,
    context_cnes_unit_id, context_lotacao_id, reason, previous_value, new_value
  ) values (
    actor_id, actor_role,
    case target_action when 'approve' then 'request_unit_approved' when 'reject' then 'request_unit_rejected' else 'request_unit_scheduled' end,
    'request_unit_review', review_row.id,
    review_row.cnes_unit_id, selected_lotacao, nullif(btrim(target_notes), ''),
    jsonb_build_object('status', review_row.status, 'version', review_row.version),
    jsonb_build_object('status', case target_action when 'approve' then 'aprovada' when 'reject' then 'rejeitada' else 'programada' end, 'version', review_row.version + 1,
      'rejection_code',rejection.code,'rejection_label',rejection.label,'rejection_data',rejection_details)
  );

  return jsonb_build_object(
    'review_status', case target_action when 'approve' then 'aprovada' when 'reject' then 'rejeitada' else 'programada' end,
    'request_status', aggregate_status,
    'version', review_row.version + 1
  );
end
$$;

revoke all on function public.manage_unit_request_review(uuid, uuid, text, text, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.manage_unit_request_review(uuid, uuid, text, text, integer, jsonb)
  to service_role;

revoke all on function private.ensure_request_unit_review() from public, anon, authenticated;
revoke all on function private.current_context_cnes() from public, anon;
grant execute on function private.current_context_cnes() to authenticated, service_role;
revoke all on function private.current_context_internal_lotacao() from public, anon;
grant execute on function private.current_context_internal_lotacao() to authenticated, service_role;
-- Escala nominal por atuação. Estrutura nova: registros legados permanecem intactos.
create table public.unit_minimum_scale_days (
  id uuid primary key default gen_random_uuid(),
  cnes_unit_id uuid not null references public.cnes_units(id),
  lotacao_id uuid references public.lotacoes(id),
  scale_date date not null,
  source_date date check (source_date < scale_date),
  version integer not null default 0,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (cnes_unit_id, lotacao_id, scale_date)
);
create table public.unit_minimum_scale_assignments (
  day_id uuid not null references public.unit_minimum_scale_days(id) on delete cascade,
  bond_unit_id uuid not null references public.employment_bond_units(id),
  primary key(day_id, bond_unit_id)
);
create index unit_minimum_scale_assignment_unit_idx on public.unit_minimum_scale_assignments(bond_unit_id);
alter table public.unit_minimum_scale_days enable row level security;
alter table public.unit_minimum_scale_assignments enable row level security;
revoke all on public.unit_minimum_scale_days, public.unit_minimum_scale_assignments from public, anon, authenticated;
grant select, insert, update, delete on public.unit_minimum_scale_days, public.unit_minimum_scale_assignments to service_role;

create function public.set_unit_minimum_scale(
  actor_id uuid, target_cnes_id uuid, target_lotacao_id uuid, target_date date,
  target_bond_unit_ids uuid[], expected_version integer,
  target_source_date date default null
) returns integer language plpgsql security invoker set search_path = '' as $$
declare
  actor_role public.app_role := private.actor_role(actor_id);
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  day_row public.unit_minimum_scale_days%rowtype;
  previous_ids uuid[];
begin
  if actor_role is null or actor_role not in ('rh', 'administrador') then
    raise exception 'STAFF_REQUIRED' using errcode='42501';
  end if;
  if target_date is null or expected_version is null or expected_version < 0
     or (target_source_date is not null and target_source_date >= target_date) then
    raise exception 'SCALE_INPUT_INVALID' using errcode='22023';
  end if;
  if not exists(select 1 from public.cnes_units where id=target_cnes_id and active)
     or (target_lotacao_id is not null and not exists(
       select 1 from public.lotacoes l join public.lotacao_cnes_units m on m.lotacao_id=l.id
       where l.id=target_lotacao_id and l.active and l.is_internal_allocation and m.cnes_unit_id=target_cnes_id
     )) then raise exception 'TARGET_SCOPE_REQUIRED' using errcode='42501'; end if;
  if actor_role <> 'administrador' and (
    target_cnes_id is distinct from nullif(headers->>'x-sgf-cnes','')::uuid
    or target_lotacao_id is distinct from private.current_context_internal_lotacao()
    or not exists(select 1 from public.profile_scopes s join public.lotacao_cnes_units m on m.lotacao_id=s.lotacao_id
      where s.profile_id=actor_id and s.lotacao_id=nullif(headers->>'x-sgf-lotacao','')::uuid and m.cnes_unit_id=target_cnes_id)
  ) then raise exception 'TARGET_SCOPE_REQUIRED' using errcode='42501'; end if;
  if exists(select 1 from unnest(coalesce(target_bond_unit_ids,'{}')) chosen(id)
    where not exists(select 1 from public.employment_bond_units u
      join public.employment_bonds b on b.id=u.bond_id
      join public.servidores s on s.id=b.servidor_id
      where u.id=chosen.id and u.active and b.active and s.active
        and u.cnes_unit_id=target_cnes_id and u.internal_lotacao_id is not distinct from target_lotacao_id
        and (u.valid_from is null or u.valid_from<=target_date) and (u.valid_until is null or u.valid_until>=target_date)
        and (b.valid_from is null or b.valid_from<=target_date) and (b.valid_until is null or b.valid_until>=target_date)
    )) then raise exception 'BOND_UNIT_OUT_OF_CONTEXT' using errcode='22023'; end if;
  if exists(select 1 from public.request_day_responsibilities d
    join public.request_unit_reviews r on r.request_id=d.request_id and r.cnes_unit_id=d.cnes_unit_id
      and r.lotacao_id is not distinct from d.lotacao_id
    join public.vacation_requests v on v.id=d.request_id
    where d.bond_unit_id=any(coalesce(target_bond_unit_ids,'{}')) and d.responsibility_date=target_date
      and r.status='programada' and v.status<>'cancelada'
      and not exists(select 1 from public.calendar_events e where e.active and e.event_date=target_date)
  ) then raise exception 'CONFIRMED_ABSENCE_ON_SCALE' using errcode='22023'; end if;
  if target_source_date is not null and not exists(select 1 from public.unit_minimum_scale_days
    where cnes_unit_id=target_cnes_id and lotacao_id is not distinct from target_lotacao_id and scale_date=target_source_date)
    then raise exception 'SOURCE_DATE_INVALID' using errcode='22023'; end if;
  -- A linha do dia serializa gestores concorrentes, inclusive no primeiro salvamento.
  insert into public.unit_minimum_scale_days(cnes_unit_id,lotacao_id,scale_date)
    values(target_cnes_id,target_lotacao_id,target_date) on conflict do nothing;
  select * into day_row from public.unit_minimum_scale_days
    where cnes_unit_id=target_cnes_id and lotacao_id is not distinct from target_lotacao_id and scale_date=target_date for update;
  if day_row.version<>expected_version then raise exception 'SCALE_VERSION_CONFLICT' using errcode='40001'; end if;
  select coalesce(array_agg(bond_unit_id),'{}') into previous_ids from public.unit_minimum_scale_assignments where day_id=day_row.id;
  delete from public.unit_minimum_scale_assignments where day_id=day_row.id;
  insert into public.unit_minimum_scale_assignments(day_id,bond_unit_id)
    select day_row.id,id from (select distinct unnest(coalesce(target_bond_unit_ids,'{}')) id) chosen;
  update public.unit_minimum_scale_days set source_date=target_source_date,version=version+1,updated_by=actor_id,updated_at=now() where id=day_row.id;
  insert into public.audit_events(actor_id,actor_role,context_cnes_unit_id,context_lotacao_id,action,entity_type,previous_value,new_value)
    values(actor_id,actor_role,target_cnes_id,target_lotacao_id,'unit_minimum_scale_updated','unit_minimum_scale',
      jsonb_build_object('bond_unit_ids',previous_ids,'version',day_row.version,'source_date',day_row.source_date),
      jsonb_build_object('cnes_unit_id',target_cnes_id,'lotacao_id',target_lotacao_id,'date',target_date,
        'source_date',target_source_date,'bond_unit_ids',target_bond_unit_ids,'version',day_row.version+1,'role',actor_role));
  return day_row.version+1;
end $$;
revoke all on function public.set_unit_minimum_scale(uuid,uuid,uuid,date,uuid[],integer,date) from public,anon,authenticated;
grant execute on function public.set_unit_minimum_scale(uuid,uuid,uuid,date,uuid[],integer,date) to service_role;

-- Conflitos excepcionais são alertas, não decisões sobre solicitações.
create table public.manual_calendar_conflicts (
  id uuid primary key,
  cnes_unit_id uuid not null references public.cnes_units(id),
  lotacao_id uuid references public.lotacoes(id),
  bond_unit_id uuid references public.employment_bond_units(id),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  justification text not null check (char_length(btrim(justification)) between 3 and 2000),
  status text not null default 'active' check (status in ('active','resolved','cancelled')),
  version integer not null default 1,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  closed_by uuid references public.profiles(id),
  closed_at timestamptz,
  closure_reason text,
  check ((status='active' and closed_by is null and closed_at is null and closure_reason is null)
    or (status<>'active' and closed_by is not null and closed_at is not null and closure_reason is not null and char_length(btrim(closure_reason)) between 3 and 2000))
);
create index manual_calendar_conflicts_scope_idx on public.manual_calendar_conflicts(cnes_unit_id,lotacao_id,start_date,end_date);
create index manual_calendar_conflicts_bond_idx on public.manual_calendar_conflicts(bond_unit_id) where bond_unit_id is not null;
create index manual_calendar_conflicts_author_idx on public.manual_calendar_conflicts(created_by);
create index manual_calendar_conflicts_closer_idx on public.manual_calendar_conflicts(closed_by) where closed_by is not null;
alter table public.manual_calendar_conflicts enable row level security;
revoke all on public.manual_calendar_conflicts from public,anon,authenticated;
grant select,insert,update on public.manual_calendar_conflicts to service_role;

create function public.manage_manual_calendar_conflict(
  actor_id uuid, target_id uuid, target_action text, target_cnes_id uuid,
  target_lotacao_id uuid, target_bond_unit_id uuid, target_start date,
  target_end date, target_reason text, expected_version integer
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  actor_role public.app_role := private.actor_role(actor_id);
  headers jsonb := coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  previous public.manual_calendar_conflicts%rowtype;
  updated public.manual_calendar_conflicts%rowtype;
  scope_cnes uuid := target_cnes_id;
  scope_lotacao uuid := target_lotacao_id;
begin
  if actor_role is null or actor_role not in ('diretor','rh','administrador') then
    raise exception 'STAFF_REQUIRED' using errcode='42501'; end if;
  if target_id is null or target_action is null or target_action not in ('create','resolve','cancel')
     or target_reason is null or char_length(btrim(target_reason)) not between 3 and 2000 then
    raise exception 'CONFLICT_INPUT_INVALID' using errcode='22023'; end if;
  if target_action<>'create' then
    select * into previous from public.manual_calendar_conflicts where id=target_id for update;
    if not found then raise exception 'CONFLICT_NOT_FOUND' using errcode='P0002'; end if;
    scope_cnes := previous.cnes_unit_id; scope_lotacao := previous.lotacao_id;
  end if;
  if actor_role<>'administrador' and (
    scope_cnes is distinct from nullif(headers->>'x-sgf-cnes','')::uuid
    or scope_lotacao is distinct from private.current_context_internal_lotacao()
    or not exists(select 1 from public.profile_scopes s join public.lotacao_cnes_units m on m.lotacao_id=s.lotacao_id
      where s.profile_id=actor_id and s.lotacao_id=nullif(headers->>'x-sgf-lotacao','')::uuid and m.cnes_unit_id=scope_cnes)
  ) then raise exception 'TARGET_SCOPE_REQUIRED' using errcode='42501'; end if;
  if target_action='create' then
    if target_start is null or target_end is null or target_end<target_start or expected_version is distinct from 0
      or not exists(select 1 from public.cnes_units where id=scope_cnes and active)
      or (scope_lotacao is not null and not exists(select 1 from public.lotacoes l join public.lotacao_cnes_units m on m.lotacao_id=l.id
        where l.id=scope_lotacao and l.active and l.is_internal_allocation and m.cnes_unit_id=scope_cnes)) then
      raise exception 'CONFLICT_INPUT_INVALID' using errcode='22023'; end if;
    if target_bond_unit_id is not null and not exists(select 1 from public.employment_bond_units u
      join public.employment_bonds b on b.id=u.bond_id join public.servidores s on s.id=b.servidor_id
      where u.id=target_bond_unit_id and u.cnes_unit_id=scope_cnes and u.internal_lotacao_id is not distinct from scope_lotacao
        and u.active and b.active and s.active
        and (u.valid_from is null or u.valid_from<=target_start) and (u.valid_until is null or u.valid_until>=target_end)
        and (b.valid_from is null or b.valid_from<=target_start) and (b.valid_until is null or b.valid_until>=target_end)) then
      raise exception 'BOND_UNIT_OUT_OF_CONTEXT' using errcode='22023'; end if;
    insert into public.manual_calendar_conflicts(id,cnes_unit_id,lotacao_id,bond_unit_id,start_date,end_date,justification,created_by)
      values(target_id,scope_cnes,scope_lotacao,target_bond_unit_id,target_start,target_end,btrim(target_reason),actor_id)
      on conflict(id) do nothing returning * into updated;
    if not found then raise exception 'CONFLICT_ALREADY_CREATED' using errcode='22023'; end if;
  else
    if expected_version is distinct from previous.version then raise exception 'CONFLICT_VERSION_CONFLICT' using errcode='40001'; end if;
    if previous.status<>'active' then raise exception 'CONFLICT_ALREADY_CLOSED' using errcode='22023'; end if;
    update public.manual_calendar_conflicts set status=case when target_action='resolve' then 'resolved' else 'cancelled' end,
      version=version+1,closed_by=actor_id,closed_at=now(),closure_reason=btrim(target_reason)
      where id=target_id returning * into updated;
  end if;
  insert into public.audit_events(actor_id,actor_role,context_cnes_unit_id,context_lotacao_id,action,entity_type,previous_value,new_value)
    values(actor_id,actor_role,scope_cnes,scope_lotacao,'manual_conflict_'||target_action,'manual_calendar_conflict',
      case when target_action='create' then null else to_jsonb(previous) end,to_jsonb(updated));
  return to_jsonb(updated);
end $$;
revoke all on function public.manage_manual_calendar_conflict(uuid,uuid,text,uuid,uuid,uuid,date,date,text,integer) from public,anon,authenticated;
grant execute on function public.manage_manual_calendar_conflict(uuid,uuid,text,uuid,uuid,uuid,date,date,text,integer) to service_role;

-- Canais separados: pessoa, RH, Diretor e Administrador.
alter table public.notifications
  add column recipient_role text check (recipient_role in ('servidor','rh','diretor','administrador')),
  add column context_cnes_unit_id uuid references public.cnes_units(id),
  add column context_lotacao_id uuid references public.lotacoes(id),
  add column context_bond_id uuid references public.employment_bonds(id),
  add column event_key text;
create unique index notifications_event_recipient_idx on public.notifications(event_key,recipient_id,recipient_role) where event_key is not null;
create index notifications_context_idx on public.notifications(recipient_id,recipient_role,context_cnes_unit_id,context_lotacao_id,created_at desc);
-- A leitura/escrita passa exclusivamente pela Edge Function que valida contexto.
revoke all on public.notifications from authenticated;
update public.notifications n set recipient_role='servidor'
where exists(select 1 from public.vacation_requests r join public.servidores s on s.id=r.servidor_id
  where r.id=n.request_id and s.profile_id=n.recipient_id);
update public.notifications n set recipient_role='administrador'
where n.recipient_role is null and exists(select 1 from public.profiles p where p.id=n.recipient_id and 'administrador'=any(p.roles));

create function private.emit_unit_notification(
  target_key text, target_cnes uuid, target_lotacao uuid, target_title text, target_message text,
  target_request uuid default null, target_owner uuid default null, target_bond uuid default null
) returns void language plpgsql security invoker set search_path='' as $$
begin
  insert into public.notifications(recipient_id,recipient_role,context_cnes_unit_id,context_lotacao_id,
    context_bond_id,request_id,title,message,event_key)
  select distinct recipients.id,recipients.role,target_cnes,target_lotacao,
    case when recipients.role='servidor' then target_bond else null end,target_request,target_title,target_message,
    target_key||':'||target_cnes||':'||coalesce(target_lotacao::text,'unit')
  from (
    select p.id,'administrador'::text role from public.profiles p where 'administrador'=any(p.roles) and p.disabled_at is null
    union
    select p.id,granted.role::text from public.profiles p
      cross join lateral unnest(p.roles) granted(role)
      join public.profile_scopes s on s.profile_id=p.id
      join public.lotacao_cnes_units m on m.lotacao_id=s.lotacao_id
      join public.lotacoes l on l.id=s.lotacao_id
    where p.disabled_at is null and granted.role::text in ('rh','diretor') and l.active
      and m.cnes_unit_id=target_cnes
      and (case when l.is_internal_allocation then l.id else null end) is not distinct from target_lotacao
    union
    select p.id,'servidor'::text from public.profiles p
      where p.id=target_owner and 'servidor'=any(p.roles) and p.disabled_at is null
  ) recipients
  on conflict do nothing;
end $$;
revoke all on function private.emit_unit_notification(text,uuid,uuid,text,text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function private.emit_unit_notification(text,uuid,uuid,text,text,uuid,uuid,uuid) to service_role;

create function private.notify_unit_review()
returns trigger language plpgsql security invoker set search_path='' as $$
declare owner_id uuid; bond_id uuid; unit_name text; status_label text;
begin
  if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
  select s.profile_id,r.context_bond_id into owner_id,bond_id
    from public.vacation_requests r join public.servidores s on s.id=r.servidor_id where r.id=new.request_id;
  select name into unit_name from public.cnes_units where id=new.cnes_unit_id;
  status_label := case new.status when 'pendente' then 'aguardando análise' when 'aprovada' then 'aprovada, aguardando inclusão no calendário'
    when 'rejeitada' then 'recusada' when 'programada' then 'adicionada ao calendário' end;
  perform private.emit_unit_notification('review:'||new.id||':'||new.version,new.cnes_unit_id,new.lotacao_id,
    case when tg_op='INSERT' then 'Nova análise na unidade' else 'Análise da unidade atualizada' end,
    unit_name||': '||status_label||case when new.notes is not null then '. Justificativa: '||new.notes else '.' end,
    new.request_id,owner_id,bond_id);
  return new;
end $$;
create trigger request_unit_review_notify after insert or update of status on public.request_unit_reviews
  for each row execute function private.notify_unit_review();
revoke all on function private.notify_unit_review() from public,anon,authenticated;
grant execute on function private.notify_unit_review() to service_role;

create function private.notify_manual_conflict()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
  perform private.emit_unit_notification('conflict:'||new.id||':'||new.version,new.cnes_unit_id,new.lotacao_id,
    case when tg_op='INSERT' then 'Conflito manual registrado' else 'Conflito manual encerrado' end,
    to_char(new.start_date,'DD/MM/YYYY')||' a '||to_char(new.end_date,'DD/MM/YYYY')||'. '||
    case when tg_op='INSERT' then new.justification else new.closure_reason end);
  return new;
end $$;
create trigger manual_conflict_notify after insert or update of status on public.manual_calendar_conflicts
  for each row execute function private.notify_manual_conflict();
revoke all on function private.notify_manual_conflict() from public,anon,authenticated;
grant execute on function private.notify_manual_conflict() to service_role;

-- Evitar duplicar avisos do estado agregado com os das análises modernas.
create or replace function private.notify_request_status()
returns trigger language plpgsql security invoker set search_path='' as $$
declare owner_id uuid; review public.request_unit_reviews%rowtype;
begin
  if tg_op='INSERT' and nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb)->>'x-sgf-bond','') is not null then return new; end if;
  if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
  select profile_id into owner_id from public.servidores where id=new.servidor_id;
  if new.context_bond_id is not null then
    if new.status in ('cancelada','concluida') then
      for review in select * from public.request_unit_reviews where request_id=new.id loop
        perform private.emit_unit_notification('request:'||new.id||':'||new.status||':'||new.updated_at,
          review.cnes_unit_id,review.lotacao_id,'Solicitação atualizada',
          'Solicitação '||coalesce(new.protocol,new.id::text)||': '||new.status||'.',new.id,owner_id,new.context_bond_id);
      end loop;
    end if;
    return new;
  end if;
  -- Pedidos legados continuam notificando seu titular, sem inferir um novo escopo.
  if owner_id is not null then
    insert into public.notifications(recipient_id,recipient_role,request_id,title,message)
      values(owner_id,'servidor',new.id,'Solicitação atualizada','Situação: '||replace(new.status::text,'_',' ')||'.');
  end if;
  return new;
end $$;
revoke all on function private.notify_request_status() from public,anon,authenticated;
grant execute on function private.notify_request_status() to service_role;

create or replace function private.notify_calendar_change()
returns trigger language plpgsql security invoker set search_path='' as $$
declare affected record; review record; previous_date date;
begin
  if tg_op='UPDATE' then
    previous_date := old.event_date;
    if new.active is not distinct from old.active and new.event_date is not distinct from old.event_date
      and new.name is not distinct from old.name and new.type is not distinct from old.type then return new; end if;
  end if;
  if tg_op='INSERT' and not new.active then return new; end if;
  for affected in
    select distinct r.id,r.context_bond_id,s.profile_id from public.vacation_requests r
      join public.request_periods period on period.request_id=r.id join public.servidores s on s.id=r.servidor_id
    where r.status not in ('rascunho','cancelada','concluida')
      and (new.event_date between period.start_date and period.return_date
        or previous_date between period.start_date and period.return_date)
  loop
    for review in select * from public.request_unit_reviews where request_id=affected.id loop
      perform private.emit_unit_notification('calendar:'||new.id||':'||txid_current(),review.cnes_unit_id,review.lotacao_id,
        'Calendário alterado durante afastamento',
        'Evento "'||new.name||'" em '||to_char(new.event_date,'DD/MM/YYYY')||
        case when new.active then ' incluído/alterado.' else ' desativado.' end||
        ' Atualize o calendário e confira o período e o retorno com o RH. A decisão registrada não foi alterada.',
        affected.id,affected.profile_id,affected.context_bond_id);
    end loop;
    if affected.context_bond_id is null and affected.profile_id is not null then
      insert into public.notifications(recipient_id,recipient_role,request_id,title,message)
        values(affected.profile_id,'servidor',affected.id,'Calendário alterado durante afastamento',
          'Evento "'||new.name||'" alterado. Atualize o calendário e confira o período e o retorno com o RH.');
    end if;
  end loop;
  return new;
end $$;
revoke all on function private.notify_calendar_change() from public,anon,authenticated;
grant execute on function private.notify_calendar_change() to service_role;

-- Complementa somente o contexto comprovável. Dados antigos sem contexto não são inferidos.
create function private.fill_audit_access_context()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  headers jsonb := coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  selected_cnes uuid := nullif(headers->>'x-sgf-cnes','')::uuid;
  selected_lotacao uuid := nullif(headers->>'x-sgf-lotacao','')::uuid;
  selected_bond uuid := nullif(headers->>'x-sgf-bond','')::uuid;
  role_value public.app_role;
begin
  if new.actor_id is null then return new; end if;
  role_value := private.actor_role(new.actor_id);
  new.actor_role := coalesce(new.actor_role,role_value);
  if role_value in ('rh','diretor') and exists(
    select 1 from public.profile_scopes s join public.lotacao_cnes_units m on m.lotacao_id=s.lotacao_id
    where s.profile_id=new.actor_id and s.lotacao_id=selected_lotacao and m.cnes_unit_id=selected_cnes
  ) then
    new.context_cnes_unit_id := coalesce(new.context_cnes_unit_id,selected_cnes);
    new.context_lotacao_id := coalesce(new.context_lotacao_id,selected_lotacao);
  elsif role_value='servidor' and exists(
    select 1 from public.employment_bonds b join public.servidores s on s.id=b.servidor_id
      join public.employment_bond_units u on u.bond_id=b.id
    where b.id=selected_bond and s.profile_id=new.actor_id and u.cnes_unit_id=selected_cnes
      and u.internal_lotacao_id is not distinct from selected_lotacao
  ) then
    new.context_bond_id := coalesce(new.context_bond_id,selected_bond);
    new.context_cnes_unit_id := coalesce(new.context_cnes_unit_id,selected_cnes);
    new.context_lotacao_id := coalesce(new.context_lotacao_id,selected_lotacao);
  end if;
  new.reason := coalesce(new.reason,new.new_value->>'justification',new.new_value->>'notes',new.new_value->>'closure_reason');
  return new;
end $$;
create trigger audit_fill_access_context before insert on public.audit_events
  for each row execute function private.fill_audit_access_context();
revoke all on function private.fill_audit_access_context() from public,anon;
grant execute on function private.fill_audit_access_context() to authenticated,service_role;
-- Impedir leitura direta que ignore o contexto validado da Edge Function.
revoke select on public.audit_events from authenticated;

-- Catálogo global: alterações atômicas e auditadas; motivos usados nunca são apagados.
create or replace function public.manage_rejection_reason(
  actor_id uuid, target_code text, target_label text, target_mode text,
  target_active boolean, target_order integer, expected_version integer, target_justification text
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  before_row public.request_rejection_reasons;
  after_row public.request_rejection_reasons;
begin
  if private.actor_role(actor_id) is distinct from 'administrador'::public.app_role then
    raise exception 'NOT_ALLOWED';
  end if;
  if target_code is null or target_code !~ '^[a-z][a-z0-9_]{2,63}$'
    or target_label is null or char_length(btrim(target_label)) not between 3 and 160
    or target_mode is null or target_mode not in ('bank','conflict','other')
    or target_active is null or target_order is null or target_order not between 0 and 10000
    or expected_version is null or expected_version < 0
    or target_justification is null or char_length(btrim(target_justification)) not between 3 and 2000 then
    raise exception 'REASON_CATALOG_INVALID';
  end if;
  -- Serialize catalog writes, including concurrent creation and last-active protection.
  perform pg_catalog.pg_advisory_xact_lock(6100517, 9);
  select * into before_row from public.request_rejection_reasons where code = target_code for update;
  if (before_row.code is null and expected_version <> 0)
    or (before_row.code is not null and expected_version <> before_row.version) then
    raise exception 'REASON_VERSION_CONFLICT';
  end if;
  if before_row.code is not null and before_row.input_mode <> target_mode then
    raise exception 'REASON_MODE_IMMUTABLE';
  end if;
  if not target_active and not exists (
    select 1 from public.request_rejection_reasons where active and code <> target_code
  ) then raise exception 'REASON_LAST_ACTIVE'; end if;
  insert into public.request_rejection_reasons(code,label,input_mode,active,display_order,version,updated_by)
    values(target_code,btrim(target_label),target_mode,target_active,target_order,1,actor_id)
    on conflict (code) do update set label = excluded.label, active = excluded.active,
      display_order = excluded.display_order, version = request_rejection_reasons.version + 1,
      updated_by = actor_id, updated_at = now()
    returning * into after_row;
  insert into public.audit_events(actor_id,actor_role,action,entity_type,previous_value,new_value,reason)
    values(actor_id,'administrador','rejection_reason_save','request_rejection_reasons',
      case when before_row.code is null then null else to_jsonb(before_row) end,
      to_jsonb(after_row),btrim(target_justification));
  return to_jsonb(after_row);
end $$;
revoke all on function public.manage_rejection_reason(uuid,text,text,text,boolean,integer,integer,text) from public,anon,authenticated;
grant execute on function public.manage_rejection_reason(uuid,text,text,text,boolean,integer,integer,text) to service_role;
-- Recusas estruturadas para solicitações legadas; somente a Edge Function autenticada chama esta rotina.
alter table public.request_approvals
  add column rejection_code text references public.request_rejection_reasons(code),
  add column rejection_label text,
  add column rejection_data jsonb,
  add column version integer not null default 1 check (version > 0);
create index request_approvals_rejection_idx on public.request_approvals(rejection_code) where rejection_code is not null;

create or replace function public.manage_legacy_request_approval(
  actor_id uuid, target_request_id uuid, target_stage public.approval_stage,
  target_decision public.approval_decision, target_notes text,
  expected_version integer, target_rejection jsonb default null
) returns public.request_status language plpgsql security invoker set search_path = ''
as $$
declare
  role_value public.app_role := private.actor_role(actor_id);
  request_row public.vacation_requests%rowtype;
  approval_row public.request_approvals%rowtype;
  next_status public.request_status;
  location_id uuid;
  selected_cnes uuid := private.current_context_cnes();
  selected_location uuid := nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb)->>'x-sgf-lotacao','')::uuid;
  rejection public.request_rejection_reasons%rowtype;
  rejection_details jsonb;
  available numeric;
  required_hours numeric;
  conflict_start date;
  conflict_end date;
begin
  if role_value is null or role_value not in ('rh','administrador') then raise exception 'ROLE_NOT_ALLOWED'; end if;
  if target_decision is null or target_decision not in ('aprovada','rejeitada')
    or target_stage is null then raise exception 'DECISION_NOT_ALLOWED'; end if;
  select * into request_row from public.vacation_requests where id=target_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if request_row.context_bond_id is not null or exists(
    select 1 from public.request_unit_reviews where request_id=target_request_id
  ) then raise exception 'UNIT_REVIEW_REQUIRED'; end if;
  select lotacao_id into location_id from public.servidores where id=request_row.servidor_id;
  if role_value <> 'administrador' and (
    location_id is distinct from selected_location or selected_location is null
    or not exists(select 1 from public.profile_scopes where profile_id=actor_id and lotacao_id=selected_location)
    or (selected_cnes is not null and not exists(select 1 from public.lotacao_cnes_units where lotacao_id=selected_location and cnes_unit_id=selected_cnes))
  ) then raise exception 'REQUEST_OUT_OF_SCOPE'; end if;
  if request_row.status not in ('enviada','em_analise') then raise exception 'REQUEST_ALREADY_DECIDED'; end if;
  select * into approval_row from public.request_approvals
    where request_id=target_request_id and stage=target_stage for update;
  if not found or approval_row.decision <> 'pendente' then raise exception 'STAGE_ALREADY_DECIDED'; end if;
  if expected_version is null or expected_version <> approval_row.version then raise exception 'REVIEW_VERSION_CONFLICT'; end if;
  if target_stage='rh' and not exists(select 1 from public.request_approvals
    where request_id=target_request_id and stage='chefia_imediata' and decision='aprovada')
    then raise exception 'MANAGER_APPROVAL_REQUIRED'; end if;
  if target_decision='rejeitada' then
    if target_notes is null or char_length(btrim(target_notes)) not between 3 and 2000 then
      raise exception 'REJECTION_DATA_INVALID' using errcode='22023'; end if;
    select * into rejection from public.request_rejection_reasons
      where code=target_rejection->>'code' and active for share;
    if not found then raise exception 'REJECTION_REASON_INACTIVE' using errcode='22023'; end if;
    if rejection.input_mode='bank' then
      if jsonb_typeof(target_rejection->'available_hours') is distinct from 'number'
         or jsonb_typeof(target_rejection->'required_hours') is distinct from 'number' then
        raise exception 'REJECTION_DATA_INVALID' using errcode='22023'; end if;
      available := (target_rejection->>'available_hours')::numeric;
      required_hours := (target_rejection->>'required_hours')::numeric;
      if available<0 or required_hours<=available or required_hours>100000 then
        raise exception 'REJECTION_DATA_INVALID' using errcode='22023'; end if;
      rejection_details := jsonb_build_object('available_hours',available,'required_hours',required_hours);
      target_notes := rejection.label||'. Saldo informado pelo RH: '||available||' h; necessário: '||required_hours||' h. '||btrim(target_notes);
    elsif rejection.input_mode='conflict' then
      if jsonb_typeof(target_rejection->'employee_name') is distinct from 'string'
        or nullif(btrim(target_rejection->>'employee_name'),'') is null
        or char_length(btrim(target_rejection->>'employee_name')) not between 3 and 200 then
        raise exception 'REJECTION_DATA_INVALID' using errcode='22023'; end if;
      begin
        conflict_start := (target_rejection->>'start_date')::date;
        conflict_end := (target_rejection->>'end_date')::date;
      exception when others then raise exception 'REJECTION_DATA_INVALID' using errcode='22023'; end;
      if conflict_start is null or conflict_end is null or conflict_end<conflict_start then
        raise exception 'REJECTION_DATA_INVALID' using errcode='22023'; end if;
      rejection_details := jsonb_build_object('employee_name',btrim(target_rejection->>'employee_name'),'start_date',conflict_start,'end_date',conflict_end);
      target_notes := rejection.label||'. Funcionário informado: '||btrim(target_rejection->>'employee_name')||
        '; período: '||to_char(conflict_start,'DD/MM/YYYY')||' a '||to_char(conflict_end,'DD/MM/YYYY')||'. '||btrim(target_notes);
    else rejection_details := '{}'::jsonb; target_notes := rejection.label||'. '||btrim(target_notes);
    end if;
  end if;
  update public.request_approvals set decision=target_decision,decided_by=actor_id,
    notes=nullif(btrim(target_notes),''),decided_at=now(),version=version+1,
    rejection_code=rejection.code,rejection_label=rejection.label,rejection_data=rejection_details
    where id=approval_row.id;
  next_status := case when target_decision='rejeitada' then 'rejeitada'::public.request_status
    when target_stage='chefia_imediata' then 'em_analise'::public.request_status else 'aprovada'::public.request_status end;
  update public.vacation_requests set status=next_status,notes=coalesce(nullif(btrim(target_notes),''),notes) where id=target_request_id;
  update public.request_status_history set actor_id=manage_legacy_request_approval.actor_id,notes=nullif(btrim(target_notes),'')
    where id=(select max(id) from public.request_status_history where request_id=target_request_id);
  insert into public.audit_events(actor_id,actor_role,entity_type,entity_id,action,context_cnes_unit_id,context_lotacao_id,previous_value,new_value,reason)
    values(actor_id,role_value,'request_approval',approval_row.id,
      case when target_decision='rejeitada' then 'legacy_request_rejected' else 'legacy_request_approved' end,
      selected_cnes,location_id,to_jsonb(approval_row),
      jsonb_build_object('status',next_status,'stage',target_stage,'decision',target_decision,'rejection_code',rejection.code,'rejection_label',rejection.label,'rejection_data',rejection_details,'version',approval_row.version+1),
      nullif(btrim(target_notes),''));
  return next_status;
end $$;
revoke all on function public.manage_legacy_request_approval(uuid,uuid,public.approval_stage,public.approval_decision,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.manage_legacy_request_approval(uuid,uuid,public.approval_stage,public.approval_decision,text,integer,jsonb) to service_role;
-- Não permitir contornar os campos obrigatórios pela antiga RPC ou pela edição direta da etapa.
revoke execute on function public.decide_request_approval(uuid,public.approval_stage,public.approval_decision,text) from public,anon,authenticated;
revoke insert,update on public.request_approvals from authenticated;

-- Servidor afetado é diferente do ator e do vínculo de acesso usado na ação.
alter table public.audit_events
  add column affected_servidor_id uuid references public.servidores(id) on delete set null,
  add column affected_name text,
  add column affected_source text check (affected_source in ('at_event','reconciled_current'));
create index audit_events_affected_servidor_idx on public.audit_events(affected_servidor_id,occurred_at desc)
  where affected_servidor_id is not null;

create function private.resolve_audit_subject(kind text, target_id uuid, payload jsonb)
returns uuid language plpgsql stable security invoker set search_path = ''
as $$
declare person_id uuid; people uuid[]; assignment_id uuid;
begin
  if kind in ('servidor','employee') then
    select id into person_id from public.servidores where id=target_id;
  elsif kind in ('vacation_request','request') then
    select servidor_id into person_id from public.vacation_requests where id=target_id;
  elsif kind='request_unit_review' then
    select r.servidor_id into person_id from public.request_unit_reviews v
      join public.vacation_requests r on r.id=v.request_id where v.id=target_id;
  elsif kind='request_approval' then
    select r.servidor_id into person_id from public.request_approvals a
      join public.vacation_requests r on r.id=a.request_id where a.id=target_id;
  elsif kind='employment_bond' then
    select servidor_id into person_id from public.employment_bonds where id=target_id;
  elsif kind='employment_bond_unit' then
    select b.servidor_id into person_id from public.employment_bond_units u
      join public.employment_bonds b on b.id=u.bond_id where u.id=target_id;
  elsif kind='profile' then
    select array_agg(id) into people from public.servidores where profile_id=target_id;
    if cardinality(people)=1 then person_id := people[1]; end if;
  elsif kind='manual_calendar_conflict' then
    -- Estas gravações possuem entidade sem UUID, mas payload auditado de uma atuação única.
    begin assignment_id := nullif(payload->>'bond_unit_id','')::uuid;
    exception when invalid_text_representation then return null; end;
    select b.servidor_id into person_id from public.employment_bond_units u
      join public.employment_bonds b on b.id=u.bond_id where u.id=assignment_id;
  end if;
  -- Não derivar sujeito a partir de actor_id, context_bond_id, CPF ou nomes soltos.
  return person_id;
end $$;
revoke all on function private.resolve_audit_subject(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.resolve_audit_subject(text,uuid,jsonb) to service_role;

create function private.fill_audit_affected_subject()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  new.affected_servidor_id := private.resolve_audit_subject(new.entity_type,new.entity_id,new.new_value);
  new.affected_name := null;
  new.affected_source := null;
  if new.affected_servidor_id is not null then
    select full_name into new.affected_name from public.servidores where id=new.affected_servidor_id;
    new.affected_source := 'at_event';
  end if;
  return new;
end $$;
create trigger audit_fill_affected_subject before insert on public.audit_events
  for each row execute function private.fill_audit_affected_subject();
revoke all on function private.fill_audit_affected_subject() from public,anon,authenticated;
grant execute on function private.fill_audit_affected_subject() to service_role;

-- Reconciliação explícita: nome atual, não um nome histórico presumido. Não ampliar escopos.
with subjects as (
  select id,private.resolve_audit_subject(entity_type,entity_id,new_value) as person_id from public.audit_events
)
update public.audit_events a set affected_servidor_id=s.id,affected_name=s.full_name,affected_source='reconciled_current'
  from subjects x join public.servidores s on s.id=x.person_id where a.id=x.id;

-- Avisos pessoais não devem repetir os canais de gestão já notificados pelo mesmo evento.
create function private.emit_employee_planning_notification(
  target_key text,target_owner uuid,target_bond uuid,target_cnes uuid,target_lotacao uuid,
  target_title text,target_message text,target_request uuid default null
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.notifications(recipient_id,recipient_role,context_bond_id,context_cnes_unit_id,
    context_lotacao_id,request_id,title,message,event_key)
  select p.id,'servidor',target_bond,target_cnes,target_lotacao,target_request,target_title,target_message,
    target_key||':'||target_bond||':'||target_cnes||':'||coalesce(target_lotacao::text,'unit')
  from public.profiles p where p.id=target_owner and p.disabled_at is null and 'servidor'=any(p.roles)
    and exists(select 1 from public.employment_bonds b join public.servidores s on s.id=b.servidor_id
      join public.employment_bond_units u on u.bond_id=b.id
      where b.id=target_bond and s.profile_id=p.id and u.cnes_unit_id=target_cnes
        and u.internal_lotacao_id is not distinct from target_lotacao)
  on conflict do nothing;
end $$;
revoke all on function private.emit_employee_planning_notification(text,uuid,uuid,uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function private.emit_employee_planning_notification(text,uuid,uuid,uuid,uuid,text,text,uuid) to service_role;

create function private.notify_minimum_scale_audit()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  previous_ids uuid[]; current_ids uuid[]; day_date date;
  person record; affected record; description text;
begin
  select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}') into previous_ids
    from jsonb_array_elements_text(coalesce(new.previous_value->'bond_unit_ids','[]'::jsonb));
  select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}') into current_ids
    from jsonb_array_elements_text(coalesce(nullif(new.new_value->'bond_unit_ids','null'::jsonb),'[]'::jsonb));
  -- Salvar novamente a mesma seleção não é uma mudança de planejamento.
  if previous_ids=current_ids and (new.previous_value->>'version')::integer>0
    and new.previous_value->>'source_date' is not distinct from new.new_value->>'source_date' then return new; end if;
  day_date := (new.new_value->>'date')::date;
  description := 'Escala mínima de '||to_char(day_date,'DD/MM/YYYY')||' atualizada. Confira a nova composição e o planejamento da unidade. Aprovações e saldos não foram alterados automaticamente.';
  perform private.emit_unit_notification('minimum-scale:'||new.id,new.context_cnes_unit_id,new.context_lotacao_id,
    'Escala mínima atualizada',description);
  -- Apenas atuações incluídas/retiradas recebem o aviso nominal, sem expor a lista de colegas.
  for person in select distinct b.id bond_id,s.profile_id,u.id assignment_id from public.employment_bond_units u
    join public.employment_bonds b on b.id=u.bond_id join public.servidores s on s.id=b.servidor_id
    where u.cnes_unit_id=new.context_cnes_unit_id and u.internal_lotacao_id is not distinct from new.context_lotacao_id
      and ((u.id=any(previous_ids) and not u.id=any(current_ids)) or (u.id=any(current_ids) and not u.id=any(previous_ids)))
  loop
    perform private.emit_employee_planning_notification('minimum-member:'||new.id,person.profile_id,person.bond_id,
      new.context_cnes_unit_id,new.context_lotacao_id,'Sua participação na escala mínima mudou',
      'Em '||to_char(day_date,'DD/MM/YYYY')||', sua atuação foi '||case when person.assignment_id=any(current_ids) then 'incluída na' else 'retirada da' end||
      ' escala mínima deste contexto. Em caso de dúvida, consulte o RH.');
  end loop;
  -- Pedidos já analisados/aguardando análise no dia e escopo também precisam de conferência.
  for affected in select distinct r.id,r.context_bond_id,s.profile_id from public.vacation_requests r
    join public.servidores s on s.id=r.servidor_id
    join public.request_day_responsibilities d on d.request_id=r.id
    join public.request_unit_reviews v on v.request_id=r.id and v.cnes_unit_id=d.cnes_unit_id
      and v.lotacao_id is not distinct from d.lotacao_id
    where d.responsibility_date=day_date and d.cnes_unit_id=new.context_cnes_unit_id
      and d.lotacao_id is not distinct from new.context_lotacao_id
      and v.status in ('pendente','aprovada','programada')
      and r.status not in ('rascunho','cancelada','concluida')
      and not exists(select 1 from public.calendar_events e where e.active and e.event_date=day_date)
  loop
    perform private.emit_employee_planning_notification('minimum-request:'||new.id||':'||affected.id,
      affected.profile_id,affected.context_bond_id,new.context_cnes_unit_id,new.context_lotacao_id,
      'Escala alterada durante seu planejamento',description||' Sua solicitação coincide com esta data; em caso de dúvida, consulte o RH.',affected.id);
  end loop;
  return new;
end $$;
create trigger minimum_scale_audit_notify after insert on public.audit_events
  for each row when (new.action='unit_minimum_scale_updated') execute function private.notify_minimum_scale_audit();
revoke all on function private.notify_minimum_scale_audit() from public,anon,authenticated;
grant execute on function private.notify_minimum_scale_audit() to service_role;

-- Mudanças de responsabilidade: marca digital e avisos dos escopos anterior/novo.
-- Não disponibiliza edição pública nem altera/reabre decisões já registradas.
create function private.audit_responsibility_change()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  who uuid := nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb)->>'x-sgf-actor','')::uuid;
  role_value public.app_role;
  request_row public.vacation_requests%rowtype;
  owner_id uuid; scope record; before_data jsonb; after_data jsonb;
begin
  if tg_op='UPDATE' and (new.request_id,new.responsibility_date,new.bond_unit_id,new.cnes_unit_id,new.lotacao_id)
    is not distinct from (old.request_id,old.responsibility_date,old.bond_unit_id,old.cnes_unit_id,old.lotacao_id) then return new; end if;
  select * into request_row from public.vacation_requests where id=old.request_id;
  -- Exclusão em cascata de um pai já removido não pode ser interpretada como redistribuição.
  if not found then return old; end if;
  if tg_op='UPDATE' and (new.request_id,new.responsibility_date) is distinct from (old.request_id,old.responsibility_date)
    then raise exception 'RESPONSIBILITY_IDENTITY_IMMUTABLE'; end if;
  role_value := private.actor_role(who);
  if who is null or role_value is null or not exists(select 1 from public.profiles where id=who and disabled_at is null)
    then raise exception 'AUDIT_ACTOR_REQUIRED'; end if;
  select profile_id into owner_id from public.servidores where id=request_row.servidor_id;
  -- A autoria vem da identidade autenticada encaminhada pelo servidor, nunca do assigned_by antigo.
  before_data := to_jsonb(old);
  if tg_op='UPDATE' then after_data := to_jsonb(new); end if;
  for scope in select old.cnes_unit_id as cnes_id,old.lotacao_id as location_id
    union select (after_data->>'cnes_unit_id')::uuid,(after_data->>'lotacao_id')::uuid where after_data is not null
  loop
    insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,
      context_bond_id,context_cnes_unit_id,context_lotacao_id,previous_value,new_value,reason)
    values(who,role_value,'request_responsibility_changed','vacation_request',old.request_id,
      request_row.context_bond_id,scope.cnes_id,scope.location_id,before_data,after_data,
      'Distribuição diária alterada; conferir responsabilidade e análise.');
    perform private.emit_unit_notification('responsibility:'||txid_current()||':'||old.request_id,
      scope.cnes_id,scope.location_id,'Distribuição diária alterada',
      'A responsabilidade dos dias desta solicitação mudou. Atualize a distribuição e confira a análise. Decisões anteriores não foram alteradas automaticamente.',
      old.request_id,owner_id,request_row.context_bond_id);
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger responsibility_change_audit after update or delete on public.request_day_responsibilities
  for each row execute function private.audit_responsibility_change();
revoke all on function private.audit_responsibility_change() from public,anon,authenticated;
grant execute on function private.audit_responsibility_change() to service_role;

-- Alterar apenas responsáveis não garante consistência das revisões: a interface/RPC de
-- redistribuição segura deve ser homologada antes de habilitar edição após o envio.

create function private.notify_absence_neighbors(target_request uuid,target_cnes uuid,target_lotacao uuid,target_key text,became_confirmed boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare related record; changed_employee uuid; changed_birth date;
begin
  select r.servidor_id,s.birth_date into changed_employee,changed_birth from public.vacation_requests r
    join public.servidores s on s.id=r.servidor_id where r.id=target_request;
  if changed_employee is null then return; end if;
  for related in
    select distinct other.id,other.context_bond_id,s.profile_id from public.request_day_responsibilities mine
      join public.request_day_responsibilities theirs on theirs.responsibility_date=mine.responsibility_date
        and theirs.cnes_unit_id=mine.cnes_unit_id and theirs.lotacao_id is not distinct from mine.lotacao_id
      join public.vacation_requests other on other.id=theirs.request_id
      join public.servidores s on s.id=other.servidor_id
      join public.request_unit_reviews review on review.request_id=other.id and review.cnes_unit_id=theirs.cnes_unit_id
        and review.lotacao_id is not distinct from theirs.lotacao_id
    where mine.request_id=target_request and mine.cnes_unit_id=target_cnes
      and mine.lotacao_id is not distinct from target_lotacao
      and other.id<>target_request and other.servidor_id<>changed_employee
      and review.status in ('pendente','aprovada','programada')
      and other.status not in ('rascunho','cancelada','concluida')
      and extract(dow from mine.responsibility_date) not in (0,6)
      and not exists(select 1 from public.calendar_events e where e.active and e.event_date=mine.responsibility_date)
      and (changed_birth is null or to_char(mine.responsibility_date,'MM-DD')<>to_char(changed_birth,'MM-DD'))
      and (s.birth_date is null or to_char(mine.responsibility_date,'MM-DD')<>to_char(s.birth_date,'MM-DD'))
  loop
    perform private.emit_unit_notification(target_key||':'||related.id,
      target_cnes,target_lotacao,'Planejamento da unidade alterado',
      'Um afastamento com dias coincidentes neste contexto foi '||case when became_confirmed then 'adicionado ao calendário' else 'retirado da situação confirmada' end||
      '. Atualize o calendário e confira os filtros de cargo/equipe e a cobertura com o RH. Coincidência não significa impedimento legal ou recusa automática.',
      related.id,related.profile_id,related.context_bond_id);
  end loop;

end $$;
revoke all on function private.notify_absence_neighbors(uuid,uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function private.notify_absence_neighbors(uuid,uuid,uuid,text,boolean) to service_role;

create function private.notify_related_absence_change()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status<>'programada' and old.status<>'programada' then return new; end if;
  if new.status='programada' and exists(select 1 from public.vacation_requests where id=new.request_id and status='cancelada') then return new; end if;
  perform private.notify_absence_neighbors(new.request_id,new.cnes_unit_id,new.lotacao_id,
    'related-absence:'||new.id||':'||new.version,new.status='programada');
  return new;
end $$;
create trigger related_absence_notify after update of status on public.request_unit_reviews
  for each row execute function private.notify_related_absence_change();
revoke all on function private.notify_related_absence_change() from public,anon,authenticated;
grant execute on function private.notify_related_absence_change() to service_role;

create function private.notify_cancelled_absence_neighbors()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare review record;
begin
  if new.status is not distinct from old.status or new.status<>'cancelada' or new.context_bond_id is null then return new; end if;
  for review in select * from public.request_unit_reviews where request_id=new.id and status='programada' loop
    perform private.notify_absence_neighbors(new.id,review.cnes_unit_id,review.lotacao_id,
      'cancelled-absence:'||new.id||':'||new.updated_at,false);
  end loop;
  return new;
end $$;
create trigger cancelled_absence_neighbors after update of status on public.vacation_requests
  for each row execute function private.notify_cancelled_absence_neighbors();
revoke all on function private.notify_cancelled_absence_neighbors() from public,anon,authenticated;
grant execute on function private.notify_cancelled_absence_neighbors() to service_role;

-- Distribuição inicial auditada por escopo, sem repetir os avisos de nova revisão.
create function private.audit_initial_day_distribution()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  who uuid := nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb)->>'x-sgf-actor','')::uuid;
  role_value public.app_role; batch record;
begin
  if not exists(select 1 from new_distribution) then return null; end if;
  role_value := private.actor_role(who);
  if who is null or role_value is null then raise exception 'AUDIT_ACTOR_REQUIRED'; end if;
  for batch in select d.request_id,d.cnes_unit_id,d.lotacao_id,r.context_bond_id,
    jsonb_agg(jsonb_build_object('date',d.responsibility_date,'bond_unit_id',d.bond_unit_id) order by d.responsibility_date) days
    from new_distribution d join public.vacation_requests r on r.id=d.request_id
    group by d.request_id,d.cnes_unit_id,d.lotacao_id,r.context_bond_id
  loop
    insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,
      context_bond_id,context_cnes_unit_id,context_lotacao_id,new_value,reason)
    values(who,role_value,'request_day_distribution_created','vacation_request',batch.request_id,
      batch.context_bond_id,batch.cnes_unit_id,batch.lotacao_id,jsonb_build_object('days',batch.days),
      'Registro da distribuição diária pelo usuário autenticado.');
  end loop;
  return null;
end $$;
create trigger initial_day_distribution_audit after insert on public.request_day_responsibilities
  referencing new table as new_distribution for each statement execute function private.audit_initial_day_distribution();
revoke all on function private.audit_initial_day_distribution() from public,anon,authenticated;
grant execute on function private.audit_initial_day_distribution() to service_role;

-- Seleção nominal de conflito nas análises por CNES, sem expor CPF, e-mail ou DN.
create function public.list_rejection_conflict_candidates(actor_id uuid,target_request_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  role_value public.app_role := private.actor_role(actor_id);
  selected_cnes uuid := private.current_context_cnes();
  selected_location uuid := nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb)->>'x-sgf-lotacao','')::uuid;
  internal_location uuid := private.current_context_internal_lotacao();
  result jsonb;
begin
  if role_value is null or role_value not in ('diretor','rh','administrador') or not exists(
    select 1 from public.profiles where id=actor_id and disabled_at is null
  ) then raise exception 'STAFF_REQUIRED'; end if;
  if role_value<>'administrador' and not exists(
    select 1 from public.profile_scopes p join public.lotacao_cnes_units m on m.lotacao_id=p.lotacao_id
    join public.lotacoes l on l.id=p.lotacao_id
    where p.profile_id=actor_id and p.lotacao_id=selected_location and m.cnes_unit_id=selected_cnes and l.active
  ) then raise exception 'REQUEST_OUT_OF_SCOPE'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'full_name',s.full_name,'registration',b.registration,
    'cnes_id',u.cnes_unit_id,'cnes_name',c.name,'location_id',u.internal_lotacao_id,'location_name',l.name,
    'position',position.name) order by s.full_name,b.registration,c.name,u.id),'[]'::jsonb) into result
    from public.employment_bond_units u join public.employment_bonds b on b.id=u.bond_id
      join public.servidores s on s.id=b.servidor_id join public.cnes_units c on c.id=u.cnes_unit_id
      left join public.lotacoes l on l.id=u.internal_lotacao_id left join public.cargos position on position.id=b.cargo_id
    where u.active and b.active and s.active and c.active
      and exists(select 1 from public.request_unit_reviews v join public.vacation_requests r on r.id=v.request_id
        where v.request_id=target_request_id and r.servidor_id<>s.id and v.status in ('pendente','aprovada')
          and v.cnes_unit_id=u.cnes_unit_id and v.lotacao_id is not distinct from u.internal_lotacao_id
          and (role_value='administrador' or (v.cnes_unit_id=selected_cnes and v.lotacao_id is not distinct from internal_location)));
  return result;
end $$;
revoke all on function public.list_rejection_conflict_candidates(uuid,uuid) from public,anon,authenticated;
grant execute on function public.list_rejection_conflict_candidates(uuid,uuid) to service_role;

create function private.resolve_rejection_conflict_member(target_review uuid,target_assignment uuid,start_day date,end_day date)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare canonical_name text;
begin
  select s.full_name into canonical_name from public.request_unit_reviews v
    join public.vacation_requests r on r.id=v.request_id
    join public.employment_bond_units u on u.cnes_unit_id=v.cnes_unit_id
      and u.internal_lotacao_id is not distinct from v.lotacao_id
    join public.employment_bonds b on b.id=u.bond_id join public.servidores s on s.id=b.servidor_id
    join public.cnes_units c on c.id=u.cnes_unit_id
    where v.id=target_review and u.id=target_assignment and s.id<>r.servidor_id
      and u.active and b.active and s.active and c.active and start_day is not null and end_day>=start_day
      and (u.valid_from is null or u.valid_from<=start_day) and (u.valid_until is null or u.valid_until>=end_day)
      and (b.valid_from is null or b.valid_from<=start_day) and (b.valid_until is null or b.valid_until>=end_day)
    for share of u,b,s,c;
  if canonical_name is null then raise exception 'REJECTION_CONFLICT_MEMBER_INVALID'; end if;
  return jsonb_build_object('bond_unit_id',target_assignment,'employee_name',canonical_name);
end $$;
revoke all on function private.resolve_rejection_conflict_member(uuid,uuid,date,date) from public,anon,authenticated;
grant execute on function private.resolve_rejection_conflict_member(uuid,uuid,date,date) to service_role;

-- Primeira fase administrativa: redistribuição sem criar/remover revisões.
alter table public.vacation_requests add column distribution_version integer not null default 1
  check (distribution_version > 0);
create function public.change_pending_day_responsibility(actor_id uuid,target_request uuid,
  target_date date,target_assignment uuid,expected_version integer,target_reason text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  role_value public.app_role := private.actor_role(actor_id);
  request_row public.vacation_requests%rowtype;
  old_day public.request_day_responsibilities%rowtype;
  unit_row public.employment_bond_units%rowtype;
  selected_location uuid := nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb)->>'x-sgf-lotacao','')::uuid;
begin
  if role_value is distinct from 'administrador' or not exists(
    select 1 from public.profiles where id=actor_id and disabled_at is null
  ) then raise exception 'STAFF_REQUIRED'; end if;
  if target_date is null or expected_version is null or expected_version<1
    or target_reason is null or char_length(btrim(target_reason)) not between 3 and 2000
  then raise exception 'DISTRIBUTION_INPUT_INVALID'; end if;
  -- Mesma ordem das decisões: revisão antes do pedido. Todas ficam bloqueadas.
  perform id from public.request_unit_reviews where request_id=target_request order by id for update;
  select * into request_row from public.vacation_requests where id=target_request for update;
  if not found then raise exception 'REQUEST_OUT_OF_SCOPE'; end if;
  if request_row.context_bond_id is null or request_row.status not in ('enviada','em_analise')
    or not exists(select 1 from public.request_unit_reviews where request_id=target_request)
    or exists(select 1 from public.request_unit_reviews where request_id=target_request and status<>'pendente')
  then raise exception 'DISTRIBUTION_ALREADY_DECIDED'; end if;
  if request_row.distribution_version<>expected_version then raise exception 'DISTRIBUTION_VERSION_CONFLICT'; end if;
  select * into old_day from public.request_day_responsibilities
    where request_id=target_request and responsibility_date=target_date for update;
  if not found then raise exception 'DISTRIBUTION_DAY_INVALID'; end if;
  select u.* into unit_row from public.employment_bond_units u
    join public.employment_bonds b on b.id=u.bond_id
    join public.servidores s on s.id=b.servidor_id join public.cnes_units c on c.id=u.cnes_unit_id
    where u.id=target_assignment and u.bond_id=request_row.context_bond_id
      and b.servidor_id=request_row.servidor_id and u.active and u.approval_responsible
      and b.active and s.active and c.active
      and target_date>=u.valid_from and (u.valid_until is null or target_date<=u.valid_until)
      and target_date>=b.valid_from and (b.valid_until is null or target_date<=b.valid_until)
    for share of u,b,s,c;
  if not found then raise exception 'RESPONSIBILITY_UNIT_INVALID'; end if;
  -- Transferência só entre revisões existentes; nenhuma revisão pode ficar vazia.
  if unit_row.cnes_unit_id<>old_day.cnes_unit_id
    or unit_row.internal_lotacao_id is distinct from old_day.lotacao_id
  then
    if not exists(select 1 from public.request_unit_reviews where request_id=target_request
      and cnes_unit_id=unit_row.cnes_unit_id and lotacao_id is not distinct from unit_row.internal_lotacao_id)
      or not exists(select 1 from public.request_day_responsibilities where request_id=target_request
        and responsibility_date<>target_date and cnes_unit_id=old_day.cnes_unit_id
        and lotacao_id is not distinct from old_day.lotacao_id)
    then raise exception 'DISTRIBUTION_SCOPE_CHANGE_PENDING'; end if;
  end if;
  if role_value<>'administrador' and (
    old_day.cnes_unit_id is distinct from private.current_context_cnes()
    or old_day.lotacao_id is distinct from private.current_context_internal_lotacao()
    or not exists(select 1 from public.profile_scopes p
      join public.lotacao_cnes_units m on m.lotacao_id=p.lotacao_id
      join public.lotacoes l on l.id=p.lotacao_id
      where p.profile_id=actor_id and p.lotacao_id=selected_location
        and m.cnes_unit_id=old_day.cnes_unit_id and l.active)
  ) then raise exception 'REQUEST_OUT_OF_SCOPE'; end if;
  if unit_row.id=old_day.bond_unit_id then return request_row.distribution_version; end if;
  update public.request_day_responsibilities set bond_unit_id=unit_row.id,cnes_unit_id=unit_row.cnes_unit_id,
    lotacao_id=unit_row.internal_lotacao_id,assigned_by=actor_id
    where request_id=target_request and responsibility_date=target_date;
  update public.vacation_requests set distribution_version=distribution_version+1 where id=target_request;
  update public.request_unit_reviews set version=version+1,updated_at=now()
    where request_id=target_request;
  insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,
    context_bond_id,context_cnes_unit_id,context_lotacao_id,previous_value,new_value,reason)
  values(actor_id,role_value,'pending_distribution_changed','vacation_request',target_request,
    request_row.context_bond_id,old_day.cnes_unit_id,old_day.lotacao_id,
    jsonb_build_object('date',target_date,'bond_unit_id',old_day.bond_unit_id,'version',expected_version),
    jsonb_build_object('date',target_date,'bond_unit_id',unit_row.id,'version',expected_version+1),btrim(target_reason));
  return expected_version+1;
end $$;
revoke all on function public.change_pending_day_responsibility(uuid,uuid,date,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.change_pending_day_responsibility(uuid,uuid,date,uuid,integer,text) to service_role;

create function public.pending_distribution_editor(actor_id uuid,target_request uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  if private.actor_role(actor_id) is distinct from 'administrador' or not exists(
    select 1 from public.profiles where id=actor_id and disabled_at is null
  ) then raise exception 'STAFF_REQUIRED'; end if;
  select jsonb_build_object('request_id',r.id,'version',r.distribution_version,'editable',
    r.context_bond_id is not null and r.status in ('enviada','em_analise')
    and exists(select 1 from public.request_unit_reviews where request_id=r.id)
    and not exists(select 1 from public.request_unit_reviews where request_id=r.id and status<>'pendente'),
    'days',coalesce((select jsonb_agg(jsonb_build_object('date',d.responsibility_date,
      'current_assignment',d.bond_unit_id,'current_unit',c.name,'current_location',l.name,
      'candidates',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'unit',uc.name,'location',ul.name) order by uc.name,u.id)
        from public.employment_bond_units u join public.employment_bonds b on b.id=u.bond_id
        join public.servidores s on s.id=b.servidor_id join public.cnes_units uc on uc.id=u.cnes_unit_id
        left join public.lotacoes ul on ul.id=u.internal_lotacao_id
        where u.bond_id=r.context_bond_id and b.servidor_id=r.servidor_id
          and u.active and u.approval_responsible and b.active and s.active and uc.active
          and d.responsibility_date>=u.valid_from and (u.valid_until is null or d.responsibility_date<=u.valid_until)
          and d.responsibility_date>=b.valid_from and (b.valid_until is null or d.responsibility_date<=b.valid_until)
          and exists(select 1 from public.request_unit_reviews v where v.request_id=r.id
            and v.cnes_unit_id=u.cnes_unit_id and v.lotacao_id is not distinct from u.internal_lotacao_id)
          and (u.cnes_unit_id=d.cnes_unit_id and u.internal_lotacao_id is not distinct from d.lotacao_id
            or exists(select 1 from public.request_day_responsibilities other where other.request_id=r.id
              and other.responsibility_date<>d.responsibility_date and other.cnes_unit_id=d.cnes_unit_id
              and other.lotacao_id is not distinct from d.lotacao_id))),'[]'::jsonb)) order by d.responsibility_date)
      from public.request_day_responsibilities d join public.cnes_units c on c.id=d.cnes_unit_id
      left join public.lotacoes l on l.id=d.lotacao_id where d.request_id=r.id),'[]'::jsonb))
    into result from public.vacation_requests r where r.id=target_request;
  if result is null then raise exception 'REQUEST_OUT_OF_SCOPE'; end if;
  return result;
end $$;
revoke all on function public.pending_distribution_editor(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pending_distribution_editor(uuid,uuid) to service_role;

-- O fluxo legado não pode substituir períodos/distribuições de pedidos por CNES.
alter function public.manage_request_operation(uuid,uuid,text,text,jsonb) rename to manage_request_operation_legacy;
alter function public.manage_request_operation_legacy(uuid,uuid,text,text,jsonb) set schema private;
revoke all on function private.manage_request_operation_legacy(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function private.manage_request_operation_legacy(uuid,uuid,text,text,jsonb) to service_role;
create function public.manage_request_operation(actor_id uuid,target_request_id uuid,target_action text,
  target_notes text default null,target_periods jsonb default null)
returns public.request_status language plpgsql security invoker set search_path = '' as $$
declare request_row public.vacation_requests%rowtype;
begin
  if private.actor_role(actor_id) is null or not exists(select 1 from public.profiles where id=actor_id and disabled_at is null)
    then raise exception 'ACTOR_NOT_ALLOWED'; end if;
  select * into request_row from public.vacation_requests where id=target_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if target_periods is not null and target_action<>'reprogramar' then raise exception 'PERIODS_INVALID'; end if;
  if request_row.context_bond_id is not null or exists(select 1 from public.request_unit_reviews where request_id=target_request_id) then
    -- Cancelamento global somente administrativo; decisões seguem a rotina por unidade.
    if target_action<>'cancelar' or target_periods is not null or private.actor_role(actor_id)<>'administrador'
      then raise exception 'CONTEXTUAL_OPERATION_REQUIRED'; end if;
  end if;
  return private.manage_request_operation_legacy(actor_id,target_request_id,target_action,target_notes,target_periods);
end $$;
revoke all on function public.manage_request_operation(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_request_operation(uuid,uuid,text,text,jsonb) to service_role;

-- Coincidências nos escopos antigo/novo de uma redistribuição, sem expor colegas.
create function private.notify_redistribution_neighbors()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare day_date date; changed_person uuid; changed_birth date; related record;
begin
  day_date := (new.previous_value->>'responsibility_date')::date;
  select r.servidor_id,s.birth_date into changed_person,changed_birth from public.vacation_requests r
    join public.servidores s on s.id=r.servidor_id where r.id=new.entity_id;
  if day_date is null or changed_person is null or extract(dow from day_date) in (0,6)
    or exists(select 1 from public.calendar_events where active and event_date=day_date)
    or (changed_birth is not null and to_char(changed_birth,'MM-DD')=to_char(day_date,'MM-DD')) then return new; end if;
  for related in select distinct r.id,r.context_bond_id,s.profile_id
    from public.request_day_responsibilities d join public.vacation_requests r on r.id=d.request_id
    join public.servidores s on s.id=r.servidor_id
    join public.request_unit_reviews v on v.request_id=r.id and v.cnes_unit_id=d.cnes_unit_id
      and v.lotacao_id is not distinct from d.lotacao_id
    where d.responsibility_date=day_date and d.cnes_unit_id=new.context_cnes_unit_id
      and d.lotacao_id is not distinct from new.context_lotacao_id
      and r.id<>new.entity_id and r.servidor_id<>changed_person
      and r.context_bond_id is not null and r.status not in ('rascunho','cancelada','concluida')
      and v.status in ('pendente','aprovada','programada')
      and (s.birth_date is null or to_char(s.birth_date,'MM-DD')<>to_char(day_date,'MM-DD'))
  loop
    perform private.emit_unit_notification('redistribution-neighbor:'||txid_current()||':'||new.entity_id||':'||related.id,
      new.context_cnes_unit_id,new.context_lotacao_id,'Distribuição alterada no planejamento',
      'A distribuição de outro pedido coincidente em '||to_char(day_date,'DD/MM/YYYY')||
      ' mudou neste contexto. Atualize o calendário e confira a cobertura com o RH. Coincidência não é impedimento legal ou recusa automática.',
      related.id,related.profile_id,related.context_bond_id);
  end loop;
  return new;
end $$;
create trigger redistribution_neighbors_notify after insert on public.audit_events
  for each row when (new.action='request_responsibility_changed') execute function private.notify_redistribution_neighbors();
revoke all on function private.notify_redistribution_neighbors() from public,anon,authenticated;
grant execute on function private.notify_redistribution_neighbors() to service_role;

create function private.calculate_preserved_period(target_start date,target_days integer,target_mode text,
  target_birth date,excluded_dates date[])
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare cursor_day date := target_start; end_day date; return_day date; consumed integer := 0; scanned integer := 0; is_workday boolean;
begin
  if target_start is null or target_days is null or target_days not between 1 and 90
    or target_mode is null or target_mode not in ('uteis','corridos') then raise exception 'PERIODS_INVALID'; end if;
  if target_mode='corridos' then end_day := target_start+target_days-1;
  else
    while consumed<target_days loop
      scanned := scanned+1;
      if scanned>730 then raise exception 'CALENDAR_RECALCULATION_LIMIT'; end if;
      is_workday := extract(dow from cursor_day) not in (0,6)
        and not cursor_day=any(coalesce(excluded_dates,'{}'::date[]))
        and (target_birth is null or to_char(cursor_day,'MM-DD')<>to_char(target_birth,'MM-DD'));
      if is_workday then consumed:=consumed+1; end_day:=cursor_day; end if;
      cursor_day:=cursor_day+1;
    end loop;
  end if;
  return_day := end_day+1; scanned:=0;
  loop
    scanned:=scanned+1;
    if scanned>730 then raise exception 'CALENDAR_RECALCULATION_LIMIT'; end if;
    exit when extract(dow from return_day) not in (0,6)
      and not return_day=any(coalesce(excluded_dates,'{}'::date[]))
      and (target_birth is null or to_char(return_day,'MM-DD')<>to_char(target_birth,'MM-DD'));
    return_day:=return_day+1;
  end loop;
  return jsonb_build_object('start_date',target_start,'end_date',end_day,'return_date',return_day,
    'days',target_days,'counting_mode',target_mode);
end $$;
revoke all on function private.calculate_preserved_period(date,integer,text,date,date[]) from public,anon,authenticated;
grant execute on function private.calculate_preserved_period(date,integer,text,date,date[]) to service_role;

-- Autoria obrigatória nas alterações de calendário, na mesma transação dos avisos.
create function private.audit_calendar_event_change()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  who uuid := nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb)->>'x-sgf-actor','')::uuid;
  before_data jsonb;
begin
  if tg_op='UPDATE' then
    if new is not distinct from old then return new; end if;
    before_data := to_jsonb(old);
  end if;
  if who is null or private.actor_role(who) is distinct from 'administrador'::public.app_role
    or not exists(select 1 from public.profiles p where p.id=who and p.disabled_at is null and not p.must_change_password)
    then raise exception 'AUDIT_CALENDAR_ADMIN_REQUIRED'; end if;
  insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,previous_value,new_value)
    values(who,'administrador',case when tg_op='INSERT' then 'calendar_event_created' else 'calendar_event_updated' end,
      'calendar_event',new.id,before_data,to_jsonb(new));
  return new;
end $$;
revoke all on function private.audit_calendar_event_change() from public,anon,authenticated;
grant execute on function private.audit_calendar_event_change() to service_role;
create trigger calendar_event_change_audit after insert or update on public.calendar_events
for each row execute function private.audit_calendar_event_change();

-- A autorização de uma pessoa em um CNES não autoriza todos os pedidos dessa pessoa.
-- Lookup privado evita recursão entre RLS de pedido e revisão; não aceita ator informado.
create function private.can_read_contextual_request(target_request uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare selected_role public.app_role := private.actor_role((select auth.uid()));
  request_row public.vacation_requests%rowtype; employee public.servidores%rowtype;
  selected_bond uuid;
begin
  if (select auth.uid()) is null or selected_role is null then return false; end if;
  select * into request_row from public.vacation_requests where id=target_request;
  if not found then return false; end if;
  if selected_role='administrador' then return true; end if;
  select * into employee from public.servidores where id=request_row.servidor_id;
  if not found or not employee.active then return false; end if;
  if selected_role='servidor' then
    if employee.profile_id is distinct from (select auth.uid()) then return false; end if;
    begin
      selected_bond := nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb)->>'x-sgf-bond','')::uuid;
    exception when invalid_text_representation then return false; end;
    if selected_bond is null or not exists(select 1 from public.employment_bonds b
      join public.employment_bond_units u on u.bond_id=b.id and u.active
      join public.cnes_units c on c.id=u.cnes_unit_id and c.active
      where b.id=selected_bond and b.servidor_id=employee.id and b.active
        and u.cnes_unit_id=private.current_context_cnes()
        and u.internal_lotacao_id is not distinct from private.current_context_internal_lotacao()) then return false; end if;
    return request_row.context_bond_id is null or request_row.context_bond_id=selected_bond;
  end if;
  if not private.can_manage_servidor(employee.id) then return false; end if;
  if request_row.context_bond_id is null then
    return employee.lotacao_id=nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb)->>'x-sgf-lotacao','')::uuid;
  end if;
  return exists(select 1 from public.request_unit_reviews review where review.request_id=request_row.id
    and review.cnes_unit_id=private.current_context_cnes()
    and review.lotacao_id is not distinct from private.current_context_internal_lotacao());
exception when invalid_text_representation then return false;
end $$;
revoke all on function private.can_read_contextual_request(uuid) from public,anon;
grant execute on function private.can_read_contextual_request(uuid) to authenticated,service_role;
drop policy if exists requests_read_scoped on public.vacation_requests;
create policy requests_read_scoped on public.vacation_requests for select to authenticated
using (private.can_read_contextual_request(id));
drop policy if exists servidores_read_scoped on public.servidores;
create policy servidores_read_scoped on public.servidores for select to authenticated
using ((active and profile_id=(select auth.uid()) and private.actor_role((select auth.uid()))='servidor')
  or private.can_manage_servidor(id));
-- Todo envio/operação passa pela Edge Function autenticada e pela RPC de serviço.
revoke insert,update,delete on public.vacation_requests,public.request_periods from authenticated;

-- O painel embute nomes de CNES e matrícula no pedido. Somente leitura:
-- o catálogo CNES já é público via cadastro; vínculos exigem pedido legível.
grant select on public.cnes_units,public.employment_bonds to authenticated;
create policy cnes_units_authenticated_labels on public.cnes_units
for select to authenticated using (active or private.actor_role((select auth.uid()))='administrador');
create policy employment_bonds_request_labels on public.employment_bonds
for select to authenticated using (
  private.actor_role((select auth.uid()))='administrador'
  or exists(select 1 from public.vacation_requests request
    where request.context_bond_id=employment_bonds.id and private.can_read_contextual_request(request.id))
);
