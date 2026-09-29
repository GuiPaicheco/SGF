-- Solicitações de acesso aprovadas por administrador antes da criação da conta.

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  registration text not null,
  cpf text not null check (cpf ~ '^\d{11}$'),
  birth_date date not null,
  email text not null,
  requested_identifier text not null,
  requested_position text,
  requested_unit text,
  status text not null default 'pendente'
    check (status in ('pendente', 'aprovada', 'rejeitada')),
  notes text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  auth_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index access_requests_pending_registration_key
  on public.access_requests (upper(registration)) where status = 'pendente';
create unique index access_requests_pending_cpf_key
  on public.access_requests (cpf) where status = 'pendente';
create unique index access_requests_pending_email_key
  on public.access_requests (lower(email)) where status = 'pendente';
create index access_requests_status_created_idx
  on public.access_requests (status, created_at desc);

alter table public.access_requests enable row level security;
revoke all on public.access_requests from public, anon, authenticated;
grant select, insert, update, delete on public.access_requests to service_role;

create or replace function public.finalize_access_request(
  actor_id uuid,
  target_request_id uuid,
  account_id uuid,
  target_role public.app_role,
  target_identifier text,
  target_scope_ids uuid[] default '{}'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  access_row public.access_requests%rowtype;
  employee_row public.servidores%rowtype;
  identifier_value text := lower(btrim(target_identifier));
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_id and role = 'administrador' and not must_change_password
  ) then raise exception using message = 'ADMIN_REQUIRED', errcode = '42501'; end if;
  if target_role not in ('servidor', 'diretor', 'rh') then
    raise exception using message = 'ROLE_NOT_ALLOWED', errcode = '22023';
  end if;
  if identifier_value !~ '^[a-z0-9._-]{3,40}$' then
    raise exception using message = 'INVALID_IDENTIFIER', errcode = '22023';
  end if;
  if target_role in ('diretor', 'rh') and coalesce(cardinality(target_scope_ids), 0) = 0 then
    raise exception using message = 'SCOPE_REQUIRED', errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(target_scope_ids, '{}')) scope_id
    where not exists (select 1 from public.lotacoes where id = scope_id and active)
  ) then raise exception using message = 'INVALID_SCOPE', errcode = '22023'; end if;

  select * into access_row from public.access_requests
  where id = target_request_id and status = 'pendente' for update;
  if not found then raise exception using message = 'ACCESS_REQUEST_NOT_PENDING', errcode = 'P0002'; end if;

  perform pg_advisory_xact_lock(hashtextextended('cpf:' || access_row.cpf, 0));
  perform pg_advisory_xact_lock(hashtextextended('matricula:' || upper(access_row.registration), 0));
  select * into employee_row from public.servidores
  where upper(matricula) = upper(access_row.registration) or cpf = access_row.cpf
  order by case when upper(matricula) = upper(access_row.registration) and cpf = access_row.cpf then 0 else 1 end
  limit 1;

  if found then
    if upper(employee_row.matricula) <> upper(access_row.registration)
       or employee_row.cpf is distinct from access_row.cpf
       or employee_row.birth_date is distinct from access_row.birth_date then
      raise exception using message = 'IDENTITY_CONFLICT', errcode = 'P0001';
    end if;
    if employee_row.profile_id is not null then
      raise exception using message = 'ACCOUNT_EXISTS', errcode = 'P0001';
    end if;
  end if;

  insert into public.profiles(id, full_name, role, login_identifier, must_change_password)
  values (account_id, btrim(access_row.full_name), target_role, identifier_value, false);

  if employee_row.id is not null then
    update public.servidores set
      profile_id = account_id,
      full_name = coalesce(nullif(full_name, ''), btrim(access_row.full_name)),
      declared_position = coalesce(declared_position, nullif(btrim(access_row.requested_position), '')),
      declared_unit = coalesce(declared_unit, nullif(btrim(access_row.requested_unit), '')),
      updated_at = now()
    where id = employee_row.id;
  else
    insert into public.servidores(
      profile_id, full_name, matricula, cpf, birth_date, employment_type, active,
      declared_position, declared_unit
    ) values (
      account_id, btrim(access_row.full_name), upper(btrim(access_row.registration)),
      access_row.cpf, access_row.birth_date, 'pendente', false,
      nullif(btrim(access_row.requested_position), ''), nullif(btrim(access_row.requested_unit), '')
    );
  end if;

  if target_role in ('diretor', 'rh') then
    insert into public.profile_scopes(profile_id, lotacao_id)
    select account_id, scope_id from unnest(target_scope_ids) scope_id;
  end if;

  update public.access_requests set status = 'aprovada', reviewed_by = actor_id,
    reviewed_at = now(), auth_user_id = account_id, updated_at = now()
  where id = target_request_id;
  insert into public.audit_events(actor_id, action, entity_type, entity_id, new_value)
  values (actor_id, 'access_request_approved', 'access_request', target_request_id,
    jsonb_build_object('account_id', account_id, 'role', target_role, 'identifier', identifier_value));
end
$$;

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
    where id = actor_id and role = 'administrador' and not must_change_password
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

revoke all on function public.finalize_access_request(uuid, uuid, uuid, public.app_role, text, uuid[]) from public, anon, authenticated;
revoke all on function public.reject_access_request(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.finalize_access_request(uuid, uuid, uuid, public.app_role, text, uuid[]) to service_role;
grant execute on function public.reject_access_request(uuid, uuid, text) to service_role;

comment on table public.access_requests is
  'Fila administrativa de solicitações de acesso; a conta Auth só é criada após aprovação.';
