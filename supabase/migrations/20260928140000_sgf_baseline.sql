-- SGF - baseline reproduzível das entidades existentes antes da fundação.
-- Deve ser a primeira migration aplicada em projetos Supabase vazios.

create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('servidor', 'gerencia', 'rh', 'administrador');
create type public.vacation_type as enum ('regulamentar', 'premio');
create type public.request_status as enum (
  'rascunho', 'enviada', 'em_analise', 'aprovada', 'rejeitada',
  'programada', 'reprogramada', 'cancelada', 'concluida'
);
create type public.calendar_event_type as enum ('feriado', 'ponto_facultativo');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'servidor',
  created_at timestamptz not null default now()
);

create table public.lotacoes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.cargos (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.funcoes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.categorias_profissionais (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.servidores (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  matricula text not null unique,
  cpf text unique,
  birth_date date,
  admission_date date,
  employment_type text not null,
  lotacao_id uuid references public.lotacoes(id),
  cargo_id uuid references public.cargos(id),
  funcao_id uuid references public.funcoes(id),
  categoria_id uuid references public.categorias_profissionais(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  type public.calendar_event_type not null,
  name text not null,
  source_url text,
  active boolean not null default true,
  unique (event_date, type)
);

create table public.vacation_rights (
  id uuid primary key default gen_random_uuid(),
  servidor_id uuid not null references public.servidores(id) on delete cascade,
  type public.vacation_type not null,
  acquisition_start date not null,
  acquisition_end date not null,
  available_days integer not null check (available_days >= 0),
  source_reference text
);

create table public.vacation_requests (
  id uuid primary key default gen_random_uuid(),
  servidor_id uuid not null references public.servidores(id) on delete cascade,
  right_id uuid references public.vacation_rights(id) on delete set null,
  type public.vacation_type not null,
  status public.request_status not null default 'rascunho',
  start_date date not null,
  end_date date not null,
  return_date date,
  notes text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  previous_value jsonb,
  new_value jsonb,
  occurred_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.lotacoes enable row level security;
alter table public.cargos enable row level security;
alter table public.funcoes enable row level security;
alter table public.categorias_profissionais enable row level security;
alter table public.servidores enable row level security;
alter table public.calendar_events enable row level security;
alter table public.vacation_rights enable row level security;
alter table public.vacation_requests enable row level security;
alter table public.audit_events enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
