-- SGF - fundacao segura para solicitacoes e autorizacoes
-- Projeto remoto: ijhvbzomakbbxverqfqh

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

do $$ begin
  alter type public.vacation_type add value if not exists 'banco_horas';
  alter type public.vacation_type add value if not exists 'dayoff_aniversario';
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.unit_type as enum ('secretaria', 'diretoria', 'unidade', 'setor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.approval_stage as enum ('chefia_imediata', 'rh');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.approval_decision as enum ('pendente', 'aprovada', 'rejeitada', 'devolvida');
exception when duplicate_object then null; end $$;

alter table public.lotacoes
  add column if not exists parent_id uuid references public.lotacoes(id),
  add column if not exists unit_type public.unit_type not null default 'unidade',
  add column if not exists code text;

create unique index if not exists lotacoes_code_key
  on public.lotacoes (code) where code is not null;
create index if not exists lotacoes_parent_id_idx on public.lotacoes(parent_id);

alter table public.servidores
  add column if not exists full_name text,
  add column if not exists weekly_hours integer,
  add column if not exists updated_at timestamptz not null default now(),
  add constraint servidores_weekly_hours_check check (weekly_hours is null or weekly_hours between 1 and 80);

create table if not exists public.profile_scopes (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  lotacao_id uuid not null references public.lotacoes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, lotacao_id)
);

create table if not exists public.request_periods (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.vacation_requests(id) on delete cascade,
  sequence smallint not null check (sequence between 1 and 10),
  start_date date not null,
  end_date date not null,
  return_date date,
  days integer not null check (days > 0),
  hours numeric(8,2) check (hours is null or hours > 0),
  created_at timestamptz not null default now(),
  unique (request_id, sequence),
  check (end_date >= start_date)
);

alter table public.vacation_requests
  add column if not exists protocol text,
  add column if not exists requested_hours numeric(8,2),
  add column if not exists acquisition_end date,
  add column if not exists birthday_year integer,
  add column if not exists submitted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid references public.profiles(id),
  add constraint vacation_requests_hours_check check (requested_hours is null or requested_hours > 0),
  add constraint vacation_requests_birthday_year_check check (birthday_year is null or birthday_year between 2000 and 2200);

create unique index if not exists vacation_requests_protocol_key
  on public.vacation_requests(protocol) where protocol is not null;
create index if not exists vacation_requests_servidor_id_idx on public.vacation_requests(servidor_id);
create index if not exists vacation_requests_right_id_idx on public.vacation_requests(right_id);
create index if not exists vacation_requests_status_created_idx on public.vacation_requests(status, created_at desc);
create index if not exists request_periods_request_id_idx on public.request_periods(request_id);

create table if not exists public.request_approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.vacation_requests(id) on delete cascade,
  stage public.approval_stage not null,
  decision public.approval_decision not null default 'pendente',
  decided_by uuid references public.profiles(id),
  notes text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (request_id, stage)
);

create index if not exists request_approvals_request_id_idx on public.request_approvals(request_id);
create index if not exists request_approvals_decision_idx on public.request_approvals(decision, stage);

create table if not exists public.time_bank_accounts (
  servidor_id uuid primary key references public.servidores(id) on delete cascade,
  declared_minutes integer not null default 0 check (declared_minutes >= 0),
  validated_minutes integer not null default 0 check (validated_minutes >= 0),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.time_bank_entries (
  id uuid primary key default gen_random_uuid(),
  servidor_id uuid not null references public.servidores(id) on delete cascade,
  request_id uuid references public.vacation_requests(id) on delete set null,
  minutes integer not null check (minutes <> 0),
  description text not null,
  occurred_on date not null default current_date,
  validated boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists time_bank_entries_servidor_date_idx
  on public.time_bank_entries(servidor_id, occurred_on desc);

create table if not exists public.request_status_history (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.vacation_requests(id) on delete cascade,
  previous_status public.request_status,
  new_status public.request_status not null,
  actor_id uuid references public.profiles(id),
  notes text,
  occurred_at timestamptz not null default now()
);

create index if not exists request_status_history_request_idx
  on public.request_status_history(request_id, occurred_at desc);

create index if not exists audit_events_actor_id_idx on public.audit_events(actor_id);
create index if not exists servidores_lotacao_id_idx on public.servidores(lotacao_id);
create index if not exists servidores_cargo_id_idx on public.servidores(cargo_id);
create index if not exists servidores_funcao_id_idx on public.servidores(funcao_id);
create index if not exists servidores_categoria_id_idx on public.servidores(categoria_id);

create or replace function private.current_app_role()
returns public.app_role
language sql stable security definer
set search_path = ''
as $$ select role from public.profiles where id = (select auth.uid()) $$;

create or replace function private.is_admin_or_rh()
returns boolean
language sql stable security definer
set search_path = ''
as $$ select coalesce(private.current_app_role() in ('rh', 'administrador'), false) $$;

create or replace function private.can_manage_servidor(target_servidor uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    private.current_app_role() in ('rh', 'administrador')
    or exists (
      select 1
      from public.servidores s
      join public.profile_scopes ps on ps.lotacao_id = s.lotacao_id
      where s.id = target_servidor
        and ps.profile_id = (select auth.uid())
        and private.current_app_role() = 'gerencia'
    ), false
  )
$$;

revoke all on all functions in schema private from public, anon;
grant execute on function private.current_app_role() to authenticated, service_role;
grant execute on function private.is_admin_or_rh() to authenticated, service_role;
grant execute on function private.can_manage_servidor(uuid) to authenticated, service_role;

drop policy if exists "profile own or staff" on public.profiles;
drop policy if exists "server own or staff" on public.servidores;
drop policy if exists "rights own or staff" on public.vacation_rights;
drop policy if exists "requests own or staff read" on public.vacation_requests;
drop policy if exists "requests own or staff create" on public.vacation_requests;
drop policy if exists "requests own or staff update" on public.vacation_requests;
drop policy if exists "calendar readable by authenticated" on public.calendar_events;
drop function if exists public.is_staff();
drop function if exists public.current_role();

alter table public.profile_scopes enable row level security;
alter table public.request_periods enable row level security;
alter table public.request_approvals enable row level security;
alter table public.time_bank_accounts enable row level security;
alter table public.time_bank_entries enable row level security;
alter table public.request_status_history enable row level security;

create policy "profiles_select_scoped" on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or private.is_admin_or_rh()
  or exists (
    select 1 from public.servidores s
    where s.profile_id = profiles.id and private.can_manage_servidor(s.id)
  )
);

create policy "profiles_update_own" on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "reference_lotacoes_read" on public.lotacoes for select to authenticated using (active);
create policy "reference_cargos_read" on public.cargos for select to authenticated using (true);
create policy "reference_funcoes_read" on public.funcoes for select to authenticated using (true);
create policy "reference_categorias_read" on public.categorias_profissionais for select to authenticated using (true);
create policy "calendar_read" on public.calendar_events for select to authenticated using (active);

create policy "scopes_read" on public.profile_scopes for select to authenticated
using (profile_id = (select auth.uid()) or private.is_admin_or_rh());

create policy "servidores_read_scoped" on public.servidores for select to authenticated
using (profile_id = (select auth.uid()) or private.can_manage_servidor(id));

create policy "rights_read_scoped" on public.vacation_rights for select to authenticated
using (
  exists (select 1 from public.servidores s where s.id = servidor_id and s.profile_id = (select auth.uid()))
  or private.can_manage_servidor(servidor_id)
);

create policy "requests_read_scoped" on public.vacation_requests for select to authenticated
using (
  exists (select 1 from public.servidores s where s.id = servidor_id and s.profile_id = (select auth.uid()))
  or private.can_manage_servidor(servidor_id)
);

create policy "requests_create_own" on public.vacation_requests for insert to authenticated
with check (
  exists (select 1 from public.servidores s where s.id = servidor_id and s.profile_id = (select auth.uid()))
);

create policy "requests_update_scoped" on public.vacation_requests for update to authenticated
using (
  exists (select 1 from public.servidores s where s.id = servidor_id and s.profile_id = (select auth.uid()))
  or private.can_manage_servidor(servidor_id)
)
with check (
  exists (select 1 from public.servidores s where s.id = servidor_id and s.profile_id = (select auth.uid()))
  or private.can_manage_servidor(servidor_id)
);

create policy "periods_read_scoped" on public.request_periods for select to authenticated
using (exists (select 1 from public.vacation_requests r where r.id = request_id));
create policy "periods_create_own" on public.request_periods for insert to authenticated
with check (exists (
  select 1 from public.vacation_requests r join public.servidores s on s.id = r.servidor_id
  where r.id = request_id and s.profile_id = (select auth.uid()) and r.status = 'rascunho'
));

create policy "approvals_read_scoped" on public.request_approvals for select to authenticated
using (exists (select 1 from public.vacation_requests r where r.id = request_id));
create policy "approvals_manage_staff" on public.request_approvals for all to authenticated
using (exists (select 1 from public.vacation_requests r where r.id = request_id and private.can_manage_servidor(r.servidor_id)))
with check (exists (select 1 from public.vacation_requests r where r.id = request_id and private.can_manage_servidor(r.servidor_id)));

create policy "time_accounts_read_scoped" on public.time_bank_accounts for select to authenticated
using (
  exists (select 1 from public.servidores s where s.id = servidor_id and s.profile_id = (select auth.uid()))
  or private.can_manage_servidor(servidor_id)
);
create policy "time_accounts_staff_manage" on public.time_bank_accounts for all to authenticated
using (private.can_manage_servidor(servidor_id)) with check (private.can_manage_servidor(servidor_id));

create policy "time_entries_read_scoped" on public.time_bank_entries for select to authenticated
using (
  exists (select 1 from public.servidores s where s.id = servidor_id and s.profile_id = (select auth.uid()))
  or private.can_manage_servidor(servidor_id)
);
create policy "time_entries_own_declare" on public.time_bank_entries for insert to authenticated
with check (
  validated = false and created_by = (select auth.uid())
  and exists (select 1 from public.servidores s where s.id = servidor_id and s.profile_id = (select auth.uid()))
);
create policy "time_entries_staff_manage" on public.time_bank_entries for all to authenticated
using (private.can_manage_servidor(servidor_id)) with check (private.can_manage_servidor(servidor_id));

create policy "history_read_scoped" on public.request_status_history for select to authenticated
using (exists (select 1 from public.vacation_requests r where r.id = request_id));

create policy "audit_read_admin_rh" on public.audit_events for select to authenticated
using (private.is_admin_or_rh());

create or replace function private.guard_request_update()
returns trigger
language plpgsql security invoker
set search_path = ''
as $$
declare actor_role public.app_role := private.current_app_role();
begin
  if new.id <> old.id or new.servidor_id <> old.servidor_id or new.created_at <> old.created_at then
    raise exception 'Campos de identificacao da solicitacao nao podem ser alterados';
  end if;

  if actor_role = 'servidor' then
    if old.status <> 'rascunho' or new.status not in ('rascunho', 'enviada') then
      raise exception 'Servidor somente pode editar ou enviar um rascunho';
    end if;
  elsif actor_role = 'gerencia' then
    if new.status not in ('em_analise', 'aprovada', 'rejeitada') then
      raise exception 'Transicao nao permitida para a chefia';
    end if;
  elsif actor_role = 'rh' then
    if new.status not in ('em_analise', 'aprovada', 'rejeitada', 'programada', 'reprogramada', 'cancelada', 'concluida') then
      raise exception 'Transicao nao permitida para o RH';
    end if;
  elsif actor_role <> 'administrador' then
    raise exception 'Perfil sem permissao para alterar solicitacoes';
  end if;

  new.updated_at := now();
  if new.status = 'enviada' and old.status <> 'enviada' then new.submitted_at := now(); end if;
  return new;
end $$;

drop trigger if exists guard_request_update on public.vacation_requests;
create trigger guard_request_update before update on public.vacation_requests
for each row execute function private.guard_request_update();

create or replace function private.record_request_status()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.request_status_history(request_id, previous_status, new_status, actor_id)
    values (new.id, case when tg_op = 'INSERT' then null else old.status end, new.status, (select auth.uid()));
  end if;
  return new;
end $$;

revoke all on function private.guard_request_update() from public, anon, authenticated;
revoke all on function private.record_request_status() from public, anon, authenticated;

drop trigger if exists record_request_status on public.vacation_requests;
create trigger record_request_status after insert or update of status on public.vacation_requests
for each row execute function private.record_request_status();

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select on public.profiles, public.lotacoes, public.cargos, public.funcoes,
  public.categorias_profissionais, public.servidores, public.calendar_events,
  public.vacation_rights, public.vacation_requests, public.request_periods,
  public.request_approvals, public.time_bank_accounts, public.time_bank_entries,
  public.request_status_history to authenticated;
grant update(full_name) on public.profiles to authenticated;
grant insert, update on public.vacation_requests to authenticated;
grant insert on public.request_periods to authenticated;
grant insert, update on public.request_approvals to authenticated;
grant insert, update on public.time_bank_accounts, public.time_bank_entries to authenticated;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

comment on table public.profile_scopes is 'Escopo organizacional de chefias por lotacao.';
comment on column public.time_bank_accounts.declared_minutes is 'Saldo informado pelo servidor, ainda nao validado pelo RH.';
comment on column public.time_bank_accounts.validated_minutes is 'Saldo oficial validado pelo RH.';
