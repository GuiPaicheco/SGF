-- Aprovação atômica de solicitações de acesso com vários vínculos e CNES.

create or replace function public.approve_multi_bond_access(
  actor_id uuid,
  target_request_id uuid,
  account_id uuid,
  target_roles public.app_role[],
  target_scope_ids uuid[] default '{}'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_role public.app_role := private.actor_role(actor_id);
  request_row public.access_requests%rowtype;
  profile_row public.profiles%rowtype;
  employee_row public.servidores%rowtype;
  requested_bond record;
  requested_unit record;
  clean_roles public.app_role[];
  merged_roles public.app_role[];
  primary_role public.app_role;
  employee_id uuid;
  current_bond_id uuid;
  existing_bond_servidor_id uuid;
  assignment_id uuid;
  legacy_lotacao_id uuid;
  legacy_team_name text;
begin
  select array_agg(distinct role_value)
  into clean_roles
  from unnest(target_roles) role_value;

  if clean_roles is null
     or not (clean_roles <@ array['servidor','diretor','rh','administrador']::public.app_role[]) then
    raise exception using message = 'ROLE_NOT_ALLOWED', errcode = '22023';
  end if;
  if actor_role = 'rh' and clean_roles is distinct from array['servidor'::public.app_role] then
    raise exception using message = 'RH_SERVER_ROLE_ONLY', errcode = '42501';
  elsif actor_role not in ('rh', 'administrador') or actor_role is null then
    raise exception using message = 'STAFF_REQUIRED', errcode = '42501';
  end if;
  if clean_roles && array['diretor','rh']::public.app_role[]
     and coalesce(cardinality(target_scope_ids), 0) = 0 then
    raise exception using message = 'SCOPE_REQUIRED', errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(target_scope_ids, '{}')) scope_id
    where not exists (select 1 from public.lotacoes where id = scope_id and active)
  ) then
    raise exception using message = 'INVALID_SCOPE', errcode = '22023';
  end if;

  select * into request_row
  from public.access_requests
  where id = target_request_id
    and status = 'pendente'
    and model_version = 2
  for update;
  if not found then
    raise exception using message = 'MULTI_ACCESS_REQUEST_NOT_PENDING', errcode = 'P0002';
  end if;

  if actor_role = 'rh' and exists (
    select 1
    from public.access_request_bond_units requested
    join public.access_request_bonds bond on bond.id = requested.access_request_bond_id
    where bond.access_request_id = target_request_id
      and not exists (
        select 1
        from public.profile_scopes scope
        join public.lotacao_cnes_units mapping on mapping.lotacao_id = scope.lotacao_id
        where scope.profile_id = actor_id
          and mapping.cnes_unit_id = requested.cnes_unit_id
      )
  ) then
    raise exception using message = 'REQUEST_OUT_OF_SCOPE', errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cpf:' || request_row.cpf, 0));
  select * into profile_row from public.profiles where cpf = request_row.cpf for update;
  if found and profile_row.id <> account_id then
    raise exception using message = 'ACCOUNT_EXISTS', errcode = '23505';
  end if;

  select * into employee_row
  from public.servidores
  where cpf = request_row.cpf
  limit 1
  for update;
  if found and (employee_row.birth_date is distinct from request_row.birth_date
    or (employee_row.profile_id is not null and employee_row.profile_id <> account_id)) then
    raise exception using message = 'IDENTITY_CONFLICT', errcode = 'P0001';
  end if;

  primary_role := case
    when 'administrador' = any(clean_roles) then 'administrador'::public.app_role
    when 'rh' = any(clean_roles) then 'rh'::public.app_role
    when 'diretor' = any(clean_roles) then 'diretor'::public.app_role
    else 'servidor'::public.app_role
  end;

  if profile_row.id is null then
    insert into public.profiles (
      id, full_name, role, roles, cpf, email, must_change_password
    ) values (
      account_id, btrim(request_row.full_name), primary_role, clean_roles,
      request_row.cpf, lower(btrim(request_row.email)), false
    );
  else
    select array_agg(distinct role_value)
    into merged_roles
    from unnest(profile_row.roles || clean_roles) role_value;
    primary_role := case
      when 'administrador' = any(merged_roles) then 'administrador'::public.app_role
      when 'rh' = any(merged_roles) then 'rh'::public.app_role
      when 'diretor' = any(merged_roles) then 'diretor'::public.app_role
      else 'servidor'::public.app_role
    end;
    update public.profiles
    set full_name = btrim(request_row.full_name),
        role = primary_role,
        roles = merged_roles,
        email = lower(btrim(request_row.email))
    where id = account_id;
  end if;

  select coalesce(requested.internal_lotacao_id, mapping.lotacao_id),
         case when requested.not_applicable then 'Não se aplica' else team.name end
  into legacy_lotacao_id, legacy_team_name
  from public.access_request_bond_units requested
  join public.access_request_bonds bond on bond.id = requested.access_request_bond_id
  left join public.lotacao_cnes_units mapping
    on mapping.cnes_unit_id = requested.cnes_unit_id and mapping.is_primary
  left join public.teams team on team.id = requested.team_id
  where bond.access_request_id = target_request_id
  order by bond.sequence, requested.sequence
  limit 1;

  select bond.* into requested_bond
  from public.access_request_bonds bond
  where bond.access_request_id = target_request_id
  order by bond.sequence
  limit 1;

  if employee_row.id is null then
    if exists (
      select 1 from public.servidores
      where upper(matricula) = upper(requested_bond.registration)
        and cpf is distinct from request_row.cpf
    ) then
      raise exception using message = 'IDENTITY_CONFLICT', errcode = 'P0001';
    end if;
    insert into public.servidores (
      profile_id, full_name, matricula, cpf, birth_date, admission_date,
      employment_type, lotacao_id, cargo_id, weekly_hours, team_name, active
    ) values (
      account_id, btrim(request_row.full_name), requested_bond.registration,
      request_row.cpf, request_row.birth_date, null, requested_bond.employment_type,
      legacy_lotacao_id, requested_bond.cargo_id, requested_bond.weekly_hours,
      coalesce(legacy_team_name, 'Não se aplica'), true
    ) returning id into employee_id;
  else
    employee_id := employee_row.id;
    update public.servidores
    set profile_id = account_id,
        full_name = btrim(request_row.full_name),
        lotacao_id = coalesce(lotacao_id, legacy_lotacao_id),
        team_name = case when team_name = 'Não se aplica' then coalesce(legacy_team_name, team_name) else team_name end,
        active = true,
        updated_at = now()
    where id = employee_id;
  end if;

  update public.profiles
  set primary_lotacao_id = coalesce(primary_lotacao_id, legacy_lotacao_id)
  where id = account_id;

  for requested_bond in
    select bond.* from public.access_request_bonds bond
    where bond.access_request_id = target_request_id
    order by bond.sequence
  loop
    perform pg_advisory_xact_lock(hashtextextended('matricula:' || upper(requested_bond.registration), 0));
    current_bond_id := null;
    existing_bond_servidor_id := null;
    select bond.id, bond.servidor_id into current_bond_id, existing_bond_servidor_id
    from public.employment_bonds bond
    where upper(bond.registration) = upper(requested_bond.registration)
    for update;

    if current_bond_id is not null and existing_bond_servidor_id <> employee_id then
      raise exception using message = 'REGISTRATION_BELONGS_TO_ANOTHER_PERSON', errcode = '23505';
    elsif current_bond_id is null then
      insert into public.employment_bonds (
        servidor_id, registration, cargo_id, employment_type, weekly_hours,
        pole_cnes_unit_id, valid_from, active, source
      ) values (
        employee_id, requested_bond.registration, requested_bond.cargo_id,
        requested_bond.employment_type, requested_bond.weekly_hours,
        requested_bond.pole_cnes_unit_id, current_date, true, 'solicitacao_acesso'
      ) returning id into current_bond_id;
    end if;

    for requested_unit in
      select requested.*
      from public.access_request_bond_units requested
      where requested.access_request_bond_id = requested_bond.id
      order by requested.sequence
    loop
      select id into assignment_id
      from public.employment_bond_units assignment
      where assignment.bond_id = current_bond_id
        and assignment.cnes_unit_id = requested_unit.cnes_unit_id
        and assignment.internal_lotacao_id is not distinct from requested_unit.internal_lotacao_id
      for update;

      if assignment_id is null then
        insert into public.employment_bond_units (
          bond_id, cnes_unit_id, internal_lotacao_id, weekly_hours,
          approval_responsible, valid_from, active, source
        ) values (
          current_bond_id, requested_unit.cnes_unit_id, requested_unit.internal_lotacao_id,
          requested_unit.weekly_hours, true, current_date, true, 'solicitacao_acesso'
        ) returning id into assignment_id;
      end if;

      insert into public.employment_bond_teams (
        bond_unit_id, team_id, not_applicable, valid_from, assigned_by
      ) values (
        assignment_id, requested_unit.team_id, requested_unit.not_applicable,
        current_date, actor_id
      )
      on conflict (bond_unit_id) do update
      set team_id = excluded.team_id,
          not_applicable = excluded.not_applicable,
          legacy_team_name = null,
          valid_from = excluded.valid_from,
          valid_until = null,
          assigned_by = excluded.assigned_by,
          updated_at = now();
    end loop;
  end loop;

  if clean_roles && array['diretor','rh']::public.app_role[] then
    insert into public.profile_scopes (profile_id, lotacao_id)
    select account_id, scope_id
    from unnest(target_scope_ids) scope_id
    on conflict do nothing;
  end if;

  update public.access_requests
  set status = 'aprovada', reviewed_by = actor_id, reviewed_at = now(),
      auth_user_id = account_id, updated_at = now()
  where id = target_request_id;

  insert into public.audit_events (
    actor_id, actor_role, action, entity_type, entity_id,
    context_lotacao_id, reason, new_value
  ) values (
    actor_id, actor_role, 'multi_bond_access_approved', 'access_request', target_request_id,
    legacy_lotacao_id, 'Aprovação de cadastro com múltiplos vínculos',
    jsonb_build_object(
      'account_id', account_id,
      'servidor_id', employee_id,
      'roles', clean_roles,
      'bond_count', (select count(*) from public.access_request_bonds where access_request_id = target_request_id)
    )
  );
end
$$;

revoke all on function public.approve_multi_bond_access(uuid, uuid, uuid, public.app_role[], uuid[])
  from public, anon, authenticated;
grant execute on function public.approve_multi_bond_access(uuid, uuid, uuid, public.app_role[], uuid[])
  to service_role;
