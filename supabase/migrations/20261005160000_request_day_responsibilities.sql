-- Um CNES autorizador para cada dia útil abrangido pela solicitação.

-- Não inferir a contagem de registros antigos pelo tipo ou quantidade de dias.
alter table public.request_periods add column counting_mode text
  check (counting_mode in ('uteis','corridos'));

create table public.request_day_responsibilities (
  request_id uuid not null references public.vacation_requests(id) on delete cascade,
  responsibility_date date not null,
  bond_unit_id uuid not null references public.employment_bond_units(id) on delete restrict,
  cnes_unit_id uuid not null references public.cnes_units(id) on delete restrict,
  lotacao_id uuid references public.lotacoes(id) on delete restrict,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (request_id, responsibility_date)
);

create index request_day_responsibilities_cnes_date_idx
  on public.request_day_responsibilities (cnes_unit_id, responsibility_date, request_id);
create index request_day_responsibilities_bond_unit_idx
  on public.request_day_responsibilities (bond_unit_id, responsibility_date);

alter table public.request_day_responsibilities enable row level security;
revoke all on public.request_day_responsibilities from public, anon, authenticated;
grant select on public.request_day_responsibilities to authenticated;
grant select, insert, update, delete on public.request_day_responsibilities to service_role;

create policy request_day_responsibilities_read_scoped
on public.request_day_responsibilities
for select to authenticated
using (
  exists (
    select 1 from public.vacation_requests request
    where request.id = request_id
      and (
        exists (
          select 1 from public.servidores employee
          where employee.id = request.servidor_id
            and employee.profile_id = (select auth.uid())
        )
        or private.can_manage_servidor(request.servidor_id)
      )
  )
);

create or replace function public.register_contextual_vacation_submission(
  payload jsonb,
  target_bond_id uuid,
  target_cnes_unit_id uuid,
  target_lotacao_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result jsonb;
  created_request_id uuid;
  authenticated_actor uuid := nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb)->>'x-sgf-actor','')::uuid;
  employee_id uuid;
  employee_birth_date date;
  assignment jsonb;
  assignment_date date;
  assignment_unit public.employment_bond_units%rowtype;
  expected_dates date[];
  submitted_dates date[];
begin
  if not exists (
    select 1
    from public.employment_bonds bond
    join public.employment_bond_units unit
      on unit.bond_id = bond.id
     and unit.cnes_unit_id = target_cnes_unit_id
     and unit.internal_lotacao_id is not distinct from target_lotacao_id
     and unit.active
    where bond.id = target_bond_id and bond.active
  ) then
    raise exception using message = 'INVALID_ACCESS_CONTEXT', errcode = '42501';
  end if;

  select employee.id, employee.birth_date
  into employee_id, employee_birth_date
  from public.employment_bonds bond
  join public.servidores employee on employee.id = bond.servidor_id
  where bond.id = target_bond_id;

  if authenticated_actor is null or not exists (
    select 1 from public.servidores employee join public.profiles profile on profile.id=employee.profile_id
    where employee.id=employee_id and employee.active and profile.id=authenticated_actor
      and profile.disabled_at is null and not profile.must_change_password
      and 'servidor'=any(profile.roles)
  ) or nullif(payload->>'createdBy','')::uuid is distinct from authenticated_actor then
    raise exception 'SUBMISSION_ACTOR_INVALID';
  end if;
  if exists(select 1 from jsonb_array_elements(coalesce(payload->'dayResponsibilities','[]'::jsonb)) item
    group by (item->>'date')::date having count(*)>1) then raise exception 'RESPONSIBILITY_DAY_DUPLICATED'; end if;

  select array_agg(day::date order by day::date)
  into expected_dates
  from (
    select distinct generated.day
    from jsonb_array_elements(payload -> 'periods') period
    cross join lateral generate_series(
      (period ->> 'start_date')::date,
      (period ->> 'end_date')::date,
      interval '1 day'
    ) generated(day)
    where extract(dow from generated.day) not in (0, 6)
      and not exists (
        select 1 from public.calendar_events event
        where event.event_date = generated.day::date and event.active
      )
      and (employee_birth_date is null or not (
        extract(month from generated.day) = extract(month from employee_birth_date)
        and extract(day from generated.day) = extract(day from employee_birth_date)
      ))
  ) required_days;

  select array_agg(distinct (item ->> 'date')::date order by (item ->> 'date')::date)
  into submitted_dates
  from jsonb_array_elements(coalesce(payload -> 'dayResponsibilities', '[]'::jsonb)) item;
  if coalesce(expected_dates, '{}'::date[]) is distinct from coalesce(submitted_dates, '{}'::date[]) then
    raise exception using message = 'RESPONSIBILITY_DAYS_INCOMPLETE', errcode = '22023';
  end if;

  for assignment in
    select value from jsonb_array_elements(coalesce(payload -> 'dayResponsibilities', '[]'::jsonb))
  loop
    assignment_date := (assignment ->> 'date')::date;
    select unit.* into assignment_unit
    from public.employment_bond_units unit
    where unit.id = (assignment ->> 'bond_unit_id')::uuid
      and unit.bond_id = target_bond_id
      and unit.cnes_unit_id = (assignment ->> 'cnes_unit_id')::uuid
      and unit.active
      and unit.approval_responsible
      and unit.valid_from<=assignment_date and (unit.valid_until is null or unit.valid_until>=assignment_date)
      and exists(select 1 from public.employment_bonds bond where bond.id=unit.bond_id and bond.active
        and bond.valid_from<=assignment_date and (bond.valid_until is null or bond.valid_until>=assignment_date))
      and exists(select 1 from public.cnes_units cnes where cnes.id=unit.cnes_unit_id and cnes.active);
    if not found then
      raise exception using message = 'RESPONSIBILITY_UNIT_INELIGIBLE', errcode = '42501';
    end if;
  end loop;

  result := public.register_vacation_submission(payload);
  created_request_id := (result ->> 'id')::uuid;
  if not exists (
    select 1 from public.vacation_requests request
    where request.id = created_request_id and request.servidor_id = employee_id
  ) then
    raise exception using message = 'INVALID_ACCESS_CONTEXT', errcode = '42501';
  end if;

  if exists(select 1 from jsonb_array_elements(payload->'periods') p
    where p->>'counting_mode' is null or p->>'counting_mode' not in ('uteis','corridos'))
  then raise exception 'PERIODS_INVALID'; end if;
  update public.request_periods p set counting_mode=entry.value->>'counting_mode'
    from jsonb_array_elements(payload->'periods') with ordinality entry(value,number)
    where p.request_id=created_request_id and p.sequence=entry.number;

  update public.vacation_requests
  set created_by = authenticated_actor,
      context_bond_id = target_bond_id,
      context_cnes_unit_id = target_cnes_unit_id,
      context_lotacao_id = target_lotacao_id
  where id = created_request_id;

  insert into public.request_day_responsibilities (
    request_id, responsibility_date, bond_unit_id, cnes_unit_id, lotacao_id, assigned_by
  )
  select
    created_request_id,
    (item ->> 'date')::date,
    unit.id,
    unit.cnes_unit_id,
    unit.internal_lotacao_id,
    authenticated_actor
  from jsonb_array_elements(coalesce(payload -> 'dayResponsibilities', '[]'::jsonb)) item
  join public.employment_bond_units unit
    on unit.id = (item ->> 'bond_unit_id')::uuid;

  return result || jsonb_build_object('responsibility_count', cardinality(coalesce(expected_dates, '{}'::date[])));
end
$$;

revoke all on function public.register_contextual_vacation_submission(jsonb, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.register_contextual_vacation_submission(jsonb, uuid, uuid, uuid)
  to service_role;
