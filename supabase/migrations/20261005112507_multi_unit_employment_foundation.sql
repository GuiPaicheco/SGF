-- Fundação retrocompatível para identidade por CPF, múltiplos vínculos e atuação em vários CNES.
-- As colunas legadas de servidores permanecem durante a transição dos fluxos existentes.

alter table public.profiles
  add column if not exists email text;

update public.profiles profile
set email = lower(btrim(account.email))
from auth.users account
where account.id = profile.id
  and account.email is not null
  and profile.email is null;

create unique index if not exists profiles_email_lower_key
  on public.profiles (lower(email))
  where email is not null;

alter table public.profiles
  drop constraint if exists profiles_email_format;
alter table public.profiles
  add constraint profiles_email_format
  check (email is null or email = lower(btrim(email)));

alter table public.lotacoes
  add column if not exists is_internal_allocation boolean not null default false;

create or replace function private.validate_internal_allocation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_internal_allocation then
    if new.parent_id is null or not exists (
      select 1
      from public.lotacoes parent
      where parent.id = new.parent_id
        and parent.unit_type = 'secretaria'
    ) then
      raise exception using message = 'INTERNAL_ALLOCATION_REQUIRES_SECRETARIAT', errcode = '23514';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists lotacoes_validate_internal_allocation on public.lotacoes;
create trigger lotacoes_validate_internal_allocation
before insert or update of is_internal_allocation, parent_id on public.lotacoes
for each row execute function private.validate_internal_allocation();

create table public.cnes_units (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cnes_units_code_format check (code ~ '^\d{7}$'),
  constraint cnes_units_name_present check (nullif(btrim(name), '') is not null)
);

create unique index cnes_units_code_key on public.cnes_units (code);
create unique index cnes_units_name_lower_key on public.cnes_units (lower(name));

create table public.lotacao_cnes_units (
  lotacao_id uuid not null references public.lotacoes(id) on delete cascade,
  cnes_unit_id uuid not null references public.cnes_units(id) on delete restrict,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (lotacao_id, cnes_unit_id)
);

create unique index lotacao_cnes_units_primary_key
  on public.lotacao_cnes_units (lotacao_id)
  where is_primary;
create index lotacao_cnes_units_cnes_idx
  on public.lotacao_cnes_units (cnes_unit_id, lotacao_id);

insert into public.cnes_units (code, name, active)
select btrim(location.code), btrim(location.name), location.active
from public.lotacoes location
where location.code ~ '^\d{7}$'
on conflict (code) do update
set name = excluded.name,
    active = excluded.active,
    updated_at = now();

insert into public.lotacao_cnes_units (lotacao_id, cnes_unit_id, is_primary)
select location.id, unit.id, true
from public.lotacoes location
join public.cnes_units unit on unit.code = btrim(location.code)
where location.code ~ '^\d{7}$'
on conflict (lotacao_id, cnes_unit_id) do nothing;

create table public.team_types (
  code text primary key,
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint team_types_code_allowed
    check (code in ('esf', 'emulti', 'esb', 'eapp', 'ecr', 'nao_se_aplica'))
);

insert into public.team_types (code, name)
values
  ('esf', 'eSF'),
  ('emulti', 'eMulti'),
  ('esb', 'eSB'),
  ('eapp', 'eAPP'),
  ('ecr', 'eCR'),
  ('nao_se_aplica', 'Não se aplica')
on conflict (code) do update
set name = excluded.name,
    active = true;

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  cnes_unit_id uuid not null references public.cnes_units(id) on delete restrict,
  type_code text not null references public.team_types(code) on delete restrict,
  team_number smallint,
  ine_code text,
  name text not null,
  source_label text,
  needs_review boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_number_positive check (team_number is null or team_number > 0),
  constraint teams_ine_format check (ine_code is null or ine_code ~ '^\d{6,10}$'),
  constraint teams_name_present check (nullif(btrim(name), '') is not null),
  constraint teams_not_applicable_not_catalogued check (type_code <> 'nao_se_aplica')
);

create unique index teams_cnes_type_number_key
  on public.teams (cnes_unit_id, type_code, team_number)
  where team_number is not null;
create unique index teams_ine_code_key
  on public.teams (ine_code)
  where ine_code is not null;
create unique index teams_source_label_key
  on public.teams (source_label)
  where source_label is not null;
create index teams_filter_idx
  on public.teams (cnes_unit_id, type_code, active, name);

create table public.employment_bonds (
  id uuid primary key default gen_random_uuid(),
  servidor_id uuid not null references public.servidores(id) on delete restrict,
  registration text not null,
  cargo_id uuid references public.cargos(id) on delete restrict,
  funcao_id uuid references public.funcoes(id) on delete restrict,
  categoria_id uuid references public.categorias_profissionais(id) on delete restrict,
  admission_date date,
  employment_type text not null,
  weekly_hours integer,
  pole_cnes_unit_id uuid references public.cnes_units(id) on delete restrict,
  valid_from date not null default current_date,
  valid_until date,
  active boolean not null default true,
  source text not null default 'novo_modelo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employment_bonds_registration_present
    check (nullif(btrim(registration), '') is not null),
  constraint employment_bonds_registration_normalized
    check (registration = upper(btrim(registration))),
  constraint employment_bonds_type_present
    check (nullif(btrim(employment_type), '') is not null),
  constraint employment_bonds_weekly_hours_valid
    check (weekly_hours is null or weekly_hours between 1 and 80),
  constraint employment_bonds_validity
    check (valid_until is null or valid_until >= valid_from),
  constraint employment_bonds_source_allowed
    check (source in ('novo_modelo', 'migracao_legada', 'solicitacao_acesso', 'cadastro_administrativo'))
);

create unique index employment_bonds_registration_upper_key
  on public.employment_bonds (upper(registration));
create index employment_bonds_servidor_idx
  on public.employment_bonds (servidor_id, active, valid_from, valid_until);
create index employment_bonds_cargo_idx
  on public.employment_bonds (cargo_id)
  where cargo_id is not null;
create index employment_bonds_pole_idx
  on public.employment_bonds (pole_cnes_unit_id)
  where pole_cnes_unit_id is not null;

create table public.employment_bond_units (
  id uuid primary key default gen_random_uuid(),
  bond_id uuid not null references public.employment_bonds(id) on delete restrict,
  cnes_unit_id uuid not null references public.cnes_units(id) on delete restrict,
  internal_lotacao_id uuid references public.lotacoes(id) on delete restrict,
  weekly_hours integer,
  approval_responsible boolean not null default true,
  valid_from date not null default current_date,
  valid_until date,
  active boolean not null default true,
  source text not null default 'novo_modelo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employment_bond_units_weekly_hours_valid
    check (weekly_hours is null or weekly_hours between 1 and 80),
  constraint employment_bond_units_validity
    check (valid_until is null or valid_until >= valid_from),
  constraint employment_bond_units_source_allowed
    check (source in ('novo_modelo', 'migracao_legada', 'solicitacao_acesso', 'cadastro_administrativo'))
);

create unique index employment_bond_units_context_key
  on public.employment_bond_units (
    bond_id,
    cnes_unit_id,
    coalesce(internal_lotacao_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
create index employment_bond_units_cnes_idx
  on public.employment_bond_units (cnes_unit_id, active, bond_id);
create index employment_bond_units_lotacao_idx
  on public.employment_bond_units (internal_lotacao_id, active)
  where internal_lotacao_id is not null;

create table public.employment_bond_teams (
  bond_unit_id uuid primary key references public.employment_bond_units(id) on delete restrict,
  team_id uuid references public.teams(id) on delete restrict,
  not_applicable boolean not null default false,
  legacy_team_name text,
  valid_from date not null default current_date,
  valid_until date,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employment_bond_teams_exactly_one_value check (
    ((team_id is not null)::integer
      + not_applicable::integer
      + (legacy_team_name is not null)::integer) = 1
  ),
  constraint employment_bond_teams_legacy_present
    check (legacy_team_name is null or nullif(btrim(legacy_team_name), '') is not null),
  constraint employment_bond_teams_validity
    check (valid_until is null or valid_until >= valid_from)
);

create index employment_bond_teams_team_idx
  on public.employment_bond_teams (team_id)
  where team_id is not null;

create or replace function private.validate_bond_unit_context()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.internal_lotacao_id is not null then
    if not exists (
      select 1
      from public.lotacoes allocation
      join public.lotacoes secretariat on secretariat.id = allocation.parent_id
      join public.lotacao_cnes_units mapping
        on mapping.lotacao_id = allocation.id
       and mapping.cnes_unit_id = new.cnes_unit_id
      where allocation.id = new.internal_lotacao_id
        and allocation.is_internal_allocation
        and secretariat.unit_type = 'secretaria'
    ) then
      raise exception using message = 'INVALID_SECRETARIAT_ALLOCATION_CONTEXT', errcode = '23514';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists employment_bond_units_validate_context on public.employment_bond_units;
create trigger employment_bond_units_validate_context
before insert or update of cnes_unit_id, internal_lotacao_id on public.employment_bond_units
for each row execute function private.validate_bond_unit_context();

create or replace function private.validate_bond_team_context()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.team_id is not null and not exists (
    select 1
    from public.employment_bond_units assignment
    join public.teams team
      on team.id = new.team_id
     and team.cnes_unit_id = assignment.cnes_unit_id
     and team.active
    where assignment.id = new.bond_unit_id
  ) then
    raise exception using message = 'TEAM_OUT_OF_CNES', errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists employment_bond_teams_validate_context on public.employment_bond_teams;
create trigger employment_bond_teams_validate_context
before insert or update of bond_unit_id, team_id on public.employment_bond_teams
for each row execute function private.validate_bond_team_context();

insert into public.employment_bonds (
  servidor_id, registration, cargo_id, funcao_id, categoria_id,
  admission_date, employment_type, weekly_hours, pole_cnes_unit_id,
  valid_from, active, source
)
select
  employee.id,
  upper(btrim(employee.matricula)),
  employee.cargo_id,
  employee.funcao_id,
  employee.categoria_id,
  employee.admission_date,
  employee.employment_type,
  employee.weekly_hours,
  unit.id,
  coalesce(employee.admission_date, employee.created_at::date),
  employee.active,
  'migracao_legada'
from public.servidores employee
left join public.lotacoes location on location.id = employee.lotacao_id
left join public.cnes_units unit on unit.code = btrim(location.code)
on conflict do nothing;

insert into public.employment_bond_units (
  bond_id, cnes_unit_id, weekly_hours, approval_responsible,
  valid_from, active, source
)
select
  bond.id,
  unit.id,
  bond.weekly_hours,
  true,
  bond.valid_from,
  bond.active,
  'migracao_legada'
from public.employment_bonds bond
join public.servidores employee on employee.id = bond.servidor_id
join public.lotacoes location on location.id = employee.lotacao_id
join public.cnes_units unit on unit.code = btrim(location.code)
where bond.source = 'migracao_legada'
on conflict do nothing;

insert into public.employment_bond_teams (
  bond_unit_id, not_applicable, legacy_team_name, valid_from
)
select
  assignment.id,
  lower(btrim(employee.team_name)) = lower('Não se aplica'),
  case
    when lower(btrim(employee.team_name)) = lower('Não se aplica') then null
    else btrim(employee.team_name)
  end,
  assignment.valid_from
from public.employment_bond_units assignment
join public.employment_bonds bond on bond.id = assignment.bond_id
join public.servidores employee on employee.id = bond.servidor_id
where bond.source = 'migracao_legada'
  and nullif(btrim(employee.team_name), '') is not null
on conflict (bond_unit_id) do nothing;

alter table public.cnes_units enable row level security;
alter table public.lotacao_cnes_units enable row level security;
alter table public.team_types enable row level security;
alter table public.teams enable row level security;
alter table public.employment_bonds enable row level security;
alter table public.employment_bond_units enable row level security;
alter table public.employment_bond_teams enable row level security;

revoke all on function private.validate_internal_allocation() from public, anon, authenticated;
revoke all on function private.validate_bond_unit_context() from public, anon, authenticated;
revoke all on function private.validate_bond_team_context() from public, anon, authenticated;

revoke all on public.cnes_units from public, anon, authenticated;
revoke all on public.lotacao_cnes_units from public, anon, authenticated;
revoke all on public.team_types from public, anon, authenticated;
revoke all on public.teams from public, anon, authenticated;
revoke all on public.employment_bonds from public, anon, authenticated;
revoke all on public.employment_bond_units from public, anon, authenticated;
revoke all on public.employment_bond_teams from public, anon, authenticated;

grant select, insert, update, delete on public.cnes_units to service_role;
grant select, insert, update, delete on public.lotacao_cnes_units to service_role;
grant select, insert, update, delete on public.team_types to service_role;
grant select, insert, update, delete on public.teams to service_role;
grant select, insert, update, delete on public.employment_bonds to service_role;
grant select, insert, update, delete on public.employment_bond_units to service_role;
grant select, insert, update, delete on public.employment_bond_teams to service_role;

alter table public.audit_events
  add column if not exists actor_role public.app_role,
  add column if not exists context_bond_id uuid references public.employment_bonds(id) on delete set null,
  add column if not exists context_cnes_unit_id uuid references public.cnes_units(id) on delete set null,
  add column if not exists context_lotacao_id uuid references public.lotacoes(id) on delete set null,
  add column if not exists reason text;

create index if not exists audit_events_context_bond_idx
  on public.audit_events (context_bond_id, occurred_at desc)
  where context_bond_id is not null;
create index if not exists audit_events_context_cnes_idx
  on public.audit_events (context_cnes_unit_id, occurred_at desc)
  where context_cnes_unit_id is not null;
create index if not exists audit_events_context_lotacao_idx
  on public.audit_events (context_lotacao_id, occurred_at desc)
  where context_lotacao_id is not null;

comment on table public.cnes_units is
  'Estabelecimentos identificados por CNES, separados das lotações administrativas.';
comment on table public.lotacao_cnes_units is
  'Relaciona uma lotação administrativa a um CNES; lotações de Secretaria podem compartilhar o mesmo CNES.';
comment on table public.employment_bonds is
  'Vínculos funcionais de uma pessoa/servidor; cada matrícula corresponde a um vínculo.';
comment on table public.employment_bond_units is
  'Atuações de um vínculo em um ou mais CNES, com carga horária e responsabilidade de aprovação.';
comment on table public.employment_bond_teams is
  'Equipe única da atuação vínculo/CNES, inclusive Não se aplica e valores legados aguardando classificação.';
comment on column public.profiles.email is
  'E-mail normalizado usado como identificador alternativo de login.';
comment on column public.lotacoes.is_internal_allocation is
  'Indica subdivisão administrativa permitida somente sob uma Secretaria.';
