-- Restringe as políticas RLS ao perfil, CNES e lotação escolhidos na sessão.

create or replace function private.can_manage_servidor(target_servidor uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_role public.app_role := private.actor_role((select auth.uid()));
  selected_cnes uuid;
  selected_lotacao uuid;
  request_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
begin
  if selected_role = 'administrador' then
    return true;
  end if;
  if selected_role is null or selected_role not in ('diretor', 'rh') or (select auth.uid()) is null then
    return false;
  end if;

  begin
    selected_lotacao := nullif(request_headers ->> 'x-sgf-lotacao', '')::uuid;
    selected_cnes := nullif(request_headers ->> 'x-sgf-cnes', '')::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  if selected_lotacao is null or not exists (
    select 1 from public.profile_scopes scope
    where scope.profile_id = (select auth.uid())
      and scope.lotacao_id = selected_lotacao
  ) then
    return false;
  end if;

  if selected_cnes is null then return false; end if;

  return exists (
    select 1
    from public.lotacao_cnes_units scope_unit
    join public.lotacoes context_location on context_location.id = scope_unit.lotacao_id
      and context_location.active
    join public.cnes_units cnes on cnes.id=scope_unit.cnes_unit_id and cnes.active
    join public.servidores employee on employee.id=target_servidor and employee.active
    join public.employment_bonds bond
      on bond.servidor_id = target_servidor
     and bond.active
    join public.employment_bond_units assignment
      on assignment.bond_id = bond.id
     and assignment.cnes_unit_id = selected_cnes
     and assignment.active
     and assignment.internal_lotacao_id is not distinct from
       case when context_location.is_internal_allocation then context_location.id else null end
    where scope_unit.lotacao_id = selected_lotacao
      and scope_unit.cnes_unit_id = selected_cnes
  );
end
$$;

revoke all on function private.can_manage_servidor(uuid) from public, anon;
grant execute on function private.can_manage_servidor(uuid) to authenticated, service_role;

comment on function private.can_manage_servidor(uuid) is
  'Autoriza gestão somente no papel e contexto CNES/lotação selecionados e validados para o usuário.';

alter table public.vacation_requests
  add column if not exists context_bond_id uuid references public.employment_bonds(id) on delete restrict,
  add column if not exists context_cnes_unit_id uuid references public.cnes_units(id) on delete restrict,
  add column if not exists context_lotacao_id uuid references public.lotacoes(id) on delete restrict;

create index if not exists vacation_requests_context_bond_idx
  on public.vacation_requests (context_bond_id, created_at desc)
  where context_bond_id is not null;
create index if not exists vacation_requests_context_cnes_idx
  on public.vacation_requests (context_cnes_unit_id, created_at desc)
  where context_cnes_unit_id is not null;

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
  request_id uuid;
  employee_id uuid;
begin
  if not exists (
    select 1
    from public.employment_bonds bond
    join public.employment_bond_units assignment
      on assignment.bond_id = bond.id
     and assignment.cnes_unit_id = target_cnes_unit_id
     and assignment.internal_lotacao_id is not distinct from target_lotacao_id
     and assignment.active
    where bond.id = target_bond_id
      and bond.active
  ) then
    raise exception using message = 'INVALID_ACCESS_CONTEXT', errcode = '42501';
  end if;

  result := public.register_vacation_submission(payload);
  request_id := (result ->> 'id')::uuid;

  select request.servidor_id into employee_id
  from public.vacation_requests request
  where request.id = request_id;
  if not exists (
    select 1 from public.employment_bonds bond
    where bond.id = target_bond_id and bond.servidor_id = employee_id
  ) then
    raise exception using message = 'INVALID_ACCESS_CONTEXT', errcode = '42501';
  end if;

  update public.vacation_requests
  set context_bond_id = target_bond_id,
      context_cnes_unit_id = target_cnes_unit_id,
      context_lotacao_id = target_lotacao_id
  where id = request_id;
  return result;
end
$$;

revoke all on function public.register_contextual_vacation_submission(jsonb, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.register_contextual_vacation_submission(jsonb, uuid, uuid, uuid)
  to service_role;
