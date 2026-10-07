-- Solicitação de acesso com uma pessoa, vários vínculos e vários CNES por vínculo.
-- Os campos legados permanecem preenchidos com o primeiro vínculo durante a transição da gestão.

alter table public.access_requests
  add column if not exists model_version smallint not null default 1;

alter table public.access_requests
  drop constraint if exists access_requests_model_version_valid;
alter table public.access_requests
  add constraint access_requests_model_version_valid
  check (model_version in (1, 2));

create table public.access_request_bonds (
  id uuid primary key default gen_random_uuid(),
  access_request_id uuid not null references public.access_requests(id) on delete cascade,
  registration text not null,
  cargo_id uuid not null references public.cargos(id) on delete restrict,
  employment_type text not null,
  weekly_hours integer,
  pole_cnes_unit_id uuid references public.cnes_units(id) on delete restrict,
  sequence smallint not null,
  created_at timestamptz not null default now(),
  constraint access_request_bonds_registration_present
    check (nullif(btrim(registration), '') is not null),
  constraint access_request_bonds_registration_normalized
    check (registration = upper(btrim(registration))),
  constraint access_request_bonds_employment_type_present
    check (nullif(btrim(employment_type), '') is not null),
  constraint access_request_bonds_weekly_hours_valid
    check (weekly_hours is null or weekly_hours between 1 and 80),
  constraint access_request_bonds_sequence_valid
    check (sequence between 1 and 10),
  unique (access_request_id, sequence)
);

create unique index access_request_bonds_request_registration_key
  on public.access_request_bonds (access_request_id, upper(registration));
create index access_request_bonds_registration_idx
  on public.access_request_bonds (upper(registration));
create index access_request_bonds_cargo_idx
  on public.access_request_bonds (cargo_id);
create index access_request_bonds_pole_idx
  on public.access_request_bonds (pole_cnes_unit_id)
  where pole_cnes_unit_id is not null;

create table public.access_request_bond_units (
  id uuid primary key default gen_random_uuid(),
  access_request_bond_id uuid not null references public.access_request_bonds(id) on delete cascade,
  cnes_unit_id uuid not null references public.cnes_units(id) on delete restrict,
  internal_lotacao_id uuid references public.lotacoes(id) on delete restrict,
  team_id uuid references public.teams(id) on delete restrict,
  not_applicable boolean not null default false,
  weekly_hours integer,
  sequence smallint not null,
  created_at timestamptz not null default now(),
  constraint access_request_bond_units_team_choice check (
    ((team_id is not null)::integer + not_applicable::integer) = 1
  ),
  constraint access_request_bond_units_weekly_hours_valid
    check (weekly_hours is null or weekly_hours between 1 and 80),
  constraint access_request_bond_units_sequence_valid
    check (sequence between 1 and 20),
  unique (access_request_bond_id, sequence)
);

create unique index access_request_bond_units_context_key
  on public.access_request_bond_units (
    access_request_bond_id,
    cnes_unit_id,
    coalesce(internal_lotacao_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
create index access_request_bond_units_cnes_idx
  on public.access_request_bond_units (cnes_unit_id, access_request_bond_id);
create index access_request_bond_units_lotacao_idx
  on public.access_request_bond_units (internal_lotacao_id)
  where internal_lotacao_id is not null;
create index access_request_bond_units_team_idx
  on public.access_request_bond_units (team_id)
  where team_id is not null;

create or replace function private.validate_requested_bond_unit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.team_id is not null and not exists (
    select 1 from public.teams team
    where team.id = new.team_id
      and team.cnes_unit_id = new.cnes_unit_id
      and team.active
  ) then
    raise exception using message = 'TEAM_OUT_OF_CNES', errcode = '23514';
  end if;

  if new.internal_lotacao_id is not null and not exists (
    select 1
    from public.lotacoes allocation
    join public.lotacoes secretariat on secretariat.id = allocation.parent_id
    join public.lotacao_cnes_units mapping
      on mapping.lotacao_id = allocation.id
     and mapping.cnes_unit_id = new.cnes_unit_id
    where allocation.id = new.internal_lotacao_id
      and allocation.is_internal_allocation
      and secretariat.unit_type = 'secretaria'
      and allocation.active
  ) then
    raise exception using message = 'INVALID_SECRETARIAT_ALLOCATION_CONTEXT', errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists access_request_bond_units_validate on public.access_request_bond_units;
create trigger access_request_bond_units_validate
before insert or update of cnes_unit_id, internal_lotacao_id, team_id
on public.access_request_bond_units
for each row execute function private.validate_requested_bond_unit();

create or replace function public.submit_multi_bond_access_request(
  target_full_name text,
  target_cpf text,
  target_birth_date date,
  target_email text,
  target_bonds jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_id uuid;
  bond_id uuid;
  bond jsonb;
  unit jsonb;
  bond_index integer := 0;
  unit_index integer;
  clean_cpf text := regexp_replace(coalesce(target_cpf, ''), '\D', '', 'g');
  clean_email text := lower(btrim(coalesce(target_email, '')));
  registration_value text;
  first_registration text;
  first_position text;
  first_unit text;
  first_team text;
  cargo_value uuid;
  pole_value uuid;
  cnes_value uuid;
  allocation_value uuid;
  team_value uuid;
  not_applicable_value boolean;
begin
  if nullif(btrim(target_full_name), '') is null
     or clean_cpf !~ '^\d{11}$'
     or target_birth_date is null
     or clean_email !~ '^[^\s@]+@betim\.mg\.gov\.br$' then
    raise exception using message = 'ACCESS_PERSONAL_DATA_INVALID', errcode = '22023';
  end if;
  if jsonb_typeof(target_bonds) <> 'array'
     or jsonb_array_length(target_bonds) not between 1 and 10 then
    raise exception using message = 'ACCESS_BONDS_INVALID', errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('access-cpf:' || clean_cpf, 0));
  perform pg_advisory_xact_lock(hashtextextended('access-email:' || clean_email, 0));
  if exists (
    select 1 from public.access_requests
    where status = 'pendente'
      and (cpf = clean_cpf or lower(email) = clean_email)
  ) then
    raise exception using message = 'ACCESS_REQUEST_ALREADY_PENDING', errcode = '23505';
  end if;

  for bond in select value from jsonb_array_elements(target_bonds)
  loop
    bond_index := bond_index + 1;
    registration_value := upper(btrim(coalesce(bond ->> 'registration', '')));
    begin cargo_value := nullif(bond ->> 'cargo_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception using message = 'ACCESS_CARGO_INVALID', errcode = '22023';
    end;
    begin pole_value := nullif(bond ->> 'pole_cnes_unit_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception using message = 'ACCESS_POLE_INVALID', errcode = '22023';
    end;

    if registration_value = ''
       or cargo_value is null
       or nullif(btrim(bond ->> 'employment_type'), '') is null
       or jsonb_typeof(bond -> 'units') <> 'array'
       or jsonb_array_length(bond -> 'units') not between 1 and 20 then
      raise exception using message = 'ACCESS_BOND_DATA_INVALID', errcode = '22023';
    end if;
    if not exists (select 1 from public.cargos where id = cargo_value) then
      raise exception using message = 'ACCESS_CARGO_INVALID', errcode = '22023';
    end if;
    if pole_value is not null
       and not exists (select 1 from public.cnes_units where id = pole_value and active) then
      raise exception using message = 'ACCESS_POLE_INVALID', errcode = '22023';
    end if;
    if nullif(bond ->> 'weekly_hours', '') is not null
       and (bond ->> 'weekly_hours')::integer not between 1 and 80 then
      raise exception using message = 'ACCESS_WEEKLY_HOURS_INVALID', errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('access-registration:' || registration_value, 0));
    if exists (
      select 1
      from public.access_request_bonds requested_bond
      join public.access_requests request on request.id = requested_bond.access_request_id
      where request.status = 'pendente'
        and upper(requested_bond.registration) = registration_value
    ) then
      raise exception using message = 'ACCESS_REGISTRATION_ALREADY_PENDING', errcode = '23505';
    end if;

    if bond_index = 1 then
      first_registration := registration_value;
      select name into first_position from public.cargos where id = cargo_value;
    end if;

    if request_id is null then
      insert into public.access_requests (
        full_name, registration, cpf, birth_date, email,
        requested_identifier, requested_position, requested_unit,
        requested_team, model_version
      ) values (
        btrim(target_full_name), first_registration, clean_cpf, target_birth_date, clean_email,
        clean_email, first_position, 'Múltiplos CNES', 'Conforme vínculos', 2
      ) returning id into request_id;
    end if;

    insert into public.access_request_bonds (
      access_request_id, registration, cargo_id, employment_type,
      weekly_hours, pole_cnes_unit_id, sequence
    ) values (
      request_id, registration_value, cargo_value, btrim(bond ->> 'employment_type'),
      nullif(bond ->> 'weekly_hours', '')::integer, pole_value, bond_index
    ) returning id into bond_id;

    unit_index := 0;
    for unit in select value from jsonb_array_elements(bond -> 'units')
    loop
      unit_index := unit_index + 1;
      begin cnes_value := nullif(unit ->> 'cnes_unit_id', '')::uuid;
      exception when invalid_text_representation then
        raise exception using message = 'ACCESS_CNES_INVALID', errcode = '22023';
      end;
      begin allocation_value := nullif(unit ->> 'internal_lotacao_id', '')::uuid;
      exception when invalid_text_representation then
        raise exception using message = 'ACCESS_ALLOCATION_INVALID', errcode = '22023';
      end;
      begin team_value := nullif(unit ->> 'team_id', '')::uuid;
      exception when invalid_text_representation then
        raise exception using message = 'ACCESS_TEAM_INVALID', errcode = '22023';
      end;
      not_applicable_value := coalesce((unit ->> 'not_applicable')::boolean, false);

      if cnes_value is null
         or not exists (select 1 from public.cnes_units where id = cnes_value and active)
         or ((team_value is not null)::integer + not_applicable_value::integer) <> 1 then
        raise exception using message = 'ACCESS_UNIT_DATA_INVALID', errcode = '22023';
      end if;
      if nullif(unit ->> 'weekly_hours', '') is not null
         and (unit ->> 'weekly_hours')::integer not between 1 and 80 then
        raise exception using message = 'ACCESS_UNIT_HOURS_INVALID', errcode = '22023';
      end if;

      insert into public.access_request_bond_units (
        access_request_bond_id, cnes_unit_id, internal_lotacao_id,
        team_id, not_applicable, weekly_hours, sequence
      ) values (
        bond_id, cnes_value, allocation_value, team_value, not_applicable_value,
        nullif(unit ->> 'weekly_hours', '')::integer, unit_index
      );

      if bond_index = 1 and unit_index = 1 then
        select name into first_unit from public.cnes_units where id = cnes_value;
        if not_applicable_value then
          first_team := 'Não se aplica';
        else
          select name into first_team from public.teams where id = team_value;
        end if;
      end if;
    end loop;
  end loop;

  update public.access_requests
  set requested_unit = first_unit,
      requested_team = first_team,
      updated_at = now()
  where id = request_id;

  return request_id;
exception
  when invalid_text_representation then
    raise exception using message = 'ACCESS_NUMERIC_OR_BOOLEAN_INVALID', errcode = '22023';
end
$$;

alter table public.access_request_bonds enable row level security;
alter table public.access_request_bond_units enable row level security;

revoke all on public.access_request_bonds from public, anon, authenticated;
revoke all on public.access_request_bond_units from public, anon, authenticated;
grant select, insert, update, delete on public.access_request_bonds to service_role;
grant select, insert, update, delete on public.access_request_bond_units to service_role;

revoke all on function private.validate_requested_bond_unit() from public, anon, authenticated;
revoke all on function public.submit_multi_bond_access_request(text, text, date, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_multi_bond_access_request(text, text, date, text, jsonb)
  to service_role;

comment on table public.access_request_bonds is
  'Vínculos declarados em uma solicitação de acesso baseada na identidade única do CPF.';
comment on table public.access_request_bond_units is
  'CNES, lotação interna e equipe declarados para cada vínculo da solicitação de acesso.';
