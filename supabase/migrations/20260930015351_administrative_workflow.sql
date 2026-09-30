-- Identidade funcional, arquivo individual e escala minima nominal.
alter table public.profiles
  add column if not exists primary_lotacao_id uuid references public.lotacoes(id),
  add column if not exists disabled_at timestamptz;
update public.profiles p set primary_lotacao_id = s.lotacao_id
from public.servidores s
where s.profile_id = p.id and s.lotacao_id is not null and p.primary_lotacao_id is null;

create table if not exists public.request_archives (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null references public.vacation_requests(id) on delete cascade,
  archived_at timestamptz not null default now(),
  primary key (profile_id, request_id)
);
alter table public.request_archives enable row level security;
revoke all on public.request_archives from public, anon, authenticated;
grant select, insert, update, delete on public.request_archives to service_role;

create table if not exists public.minimum_scale_assignments (
  lotacao_id uuid not null references public.lotacoes(id),
  scale_date date not null,
  servidor_id uuid not null references public.servidores(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (lotacao_id, scale_date, servidor_id)
);
create index if not exists minimum_scale_assignments_date_idx on public.minimum_scale_assignments(scale_date,lotacao_id);
alter table public.minimum_scale_assignments enable row level security;
revoke all on public.minimum_scale_assignments from public, anon, authenticated;
grant select, insert, update, delete on public.minimum_scale_assignments to service_role;

create or replace function public.set_minimum_scale(
  actor_id uuid, target_lotacao_id uuid, target_date date, target_servidor_ids uuid[]
) returns void language plpgsql security invoker set search_path = '' as $$
declare actor_role public.app_role;
begin
  actor_role := private.actor_role(actor_id);
  if actor_role not in ('rh','administrador') then raise exception using message='MANAGER_REQUIRED',errcode='42501'; end if;
  if target_date is null or not exists(select 1 from public.lotacoes where id=target_lotacao_id and active)
    then raise exception using message='INVALID_SCALE_DATE_OR_LOCATION',errcode='22023'; end if;
  if actor_role='rh' and not exists(select 1 from public.profile_scopes where profile_id=actor_id and lotacao_id=target_lotacao_id)
    then raise exception using message='SCOPE_REQUIRED',errcode='42501'; end if;
  if exists(select 1 from unnest(coalesce(target_servidor_ids,'{}')) employee_id
    where not exists(select 1 from public.servidores where id=employee_id and active and lotacao_id=target_lotacao_id))
    then raise exception using message='EMPLOYEE_OUT_OF_LOCATION',errcode='22023'; end if;
  delete from public.minimum_scale_assignments where lotacao_id=target_lotacao_id and scale_date=target_date;
  insert into public.minimum_scale_assignments(lotacao_id,scale_date,servidor_id,created_by)
    select target_lotacao_id,target_date,employee_id,actor_id
    from (select distinct employee_id from unnest(coalesce(target_servidor_ids,'{}')) employee_id) unique_ids;
  insert into public.audit_events(actor_id,action,entity_type,new_value)
    values(actor_id,'minimum_scale_updated','lotacao',jsonb_build_object('lotacao_id',target_lotacao_id,'date',target_date,'servidor_ids',target_servidor_ids));
end $$;
revoke all on function public.set_minimum_scale(uuid,uuid,date,uuid[]) from public,anon,authenticated;
grant execute on function public.set_minimum_scale(uuid,uuid,date,uuid[]) to service_role;

-- Bloqueia contas desativadas inclusive durante a validade de um token antigo.
create or replace function private.account_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id=(select auth.uid()) and disabled_at is null)
$$;
create or replace function private.actor_role(actor_id uuid)
returns public.app_role language plpgsql stable security definer set search_path = '' as $$
declare selected text; granted public.app_role[];
begin
  select roles into granted from public.profiles where id=actor_id and disabled_at is null and not must_change_password;
  if granted is null then return null; end if;
  selected := (nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-sgf-role');
  if selected in ('servidor','rh','administrador') then
    if selected::public.app_role = any(granted) then return selected::public.app_role; end if;
  end if;
  if selected is null and cardinality(granted)=1 then return granted[1]; end if;
  return null;
end $$;

-- Politicas preexistentes de dados internos passam a consultar a situacao da conta.
do $$
declare p record;
begin
  for p in select tablename,policyname,cmd,qual,with_check
    from pg_policies where schemaname='public' and 'authenticated'=any(roles)
      and tablename in ('audit_events','employee_assignment_history','employee_inclusion_requests',
        'notifications','profile_scopes','profiles','request_approvals','request_periods',
        'request_status_history','servidores','time_bank_accounts','time_bank_entries',
        'vacation_requests','vacation_rights')
  loop
    if p.qual is not null then
      execute format('alter policy %I on public.%I using (private.account_active() and (%s))', p.policyname,p.tablename,p.qual);
    end if;
    if p.with_check is not null then
      execute format('alter policy %I on public.%I with check (private.account_active() and (%s))', p.policyname,p.tablename,p.with_check);
    end if;
  end loop;
end $$;
