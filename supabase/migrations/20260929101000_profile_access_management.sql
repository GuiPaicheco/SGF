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
        and private.current_app_role() in ('gerencia', 'diretor')
    ), false
  )
$$;

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
    if old.status <> 'rascunho' or new.status not in ('rascunho', 'enviada') then raise exception 'Servidor somente pode editar ou enviar um rascunho'; end if;
  elsif actor_role in ('gerencia', 'diretor') then
    if new.status not in ('em_analise', 'aprovada', 'rejeitada') then raise exception 'Transicao nao permitida para a chefia'; end if;
  elsif actor_role = 'rh' then
    if new.status not in ('em_analise', 'aprovada', 'rejeitada', 'programada', 'reprogramada', 'cancelada', 'concluida') then raise exception 'Transicao nao permitida para o RH'; end if;
  elsif actor_role <> 'administrador' then
    raise exception 'Perfil sem permissao para alterar solicitacoes';
  end if;
  new.updated_at := now();
  if new.status = 'enviada' and old.status <> 'enviada' then new.submitted_at := now(); end if;
  return new;
end
$$;

create or replace function public.manage_profile_access(
  actor_id uuid,
  target_profile_id uuid,
  target_role public.app_role,
  target_identifier text,
  target_scope_ids uuid[] default '{}'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare v_identifier text := lower(nullif(btrim(target_identifier), ''));
begin
  if not exists (
    select 1 from public.profiles
    where id = actor_id and role = 'administrador' and not must_change_password
  ) then raise exception using message = 'ADMIN_REQUIRED', errcode = '42501'; end if;
  if actor_id = target_profile_id then raise exception using message = 'SELF_ROLE_CHANGE_BLOCKED', errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = target_profile_id) then raise exception using message = 'PROFILE_NOT_FOUND', errcode = 'P0002'; end if;
  if target_role <> 'servidor' and v_identifier is null then raise exception using message = 'IDENTIFIER_REQUIRED', errcode = '22023'; end if;
  if v_identifier is not null and v_identifier !~ '^[a-z0-9._-]{3,40}$' then raise exception using message = 'INVALID_IDENTIFIER', errcode = '22023'; end if;
  if target_role in ('gerencia', 'diretor') and coalesce(cardinality(target_scope_ids), 0) = 0 then raise exception using message = 'SCOPE_REQUIRED', errcode = '22023'; end if;
  if exists (select 1 from unnest(coalesce(target_scope_ids, '{}')) scope_id where not exists (select 1 from public.lotacoes l where l.id = scope_id and l.active)) then raise exception using message = 'INVALID_SCOPE', errcode = '22023'; end if;

  update public.profiles
  set role = target_role,
      login_identifier = case when target_role = 'servidor' then null else v_identifier end,
      must_change_password = case when role = 'servidor' and target_role <> 'servidor' then true else must_change_password end
  where id = target_profile_id;

  delete from public.profile_scopes where profile_id = target_profile_id;
  if target_role in ('gerencia', 'diretor') then
    insert into public.profile_scopes(profile_id, lotacao_id)
    select target_profile_id, scope_id from unnest(target_scope_ids) scope_id
    on conflict do nothing;
  end if;

  insert into public.audit_events(actor_id, action, entity_type, entity_id, new_value)
  values (actor_id, 'profile_access_updated', 'profile', target_profile_id,
    jsonb_build_object('role', target_role, 'identifier', case when target_role = 'servidor' then null else v_identifier end, 'scopes', target_scope_ids));
end
$$;

revoke all on function public.manage_profile_access(uuid, uuid, public.app_role, text, uuid[])
  from public, anon, authenticated;
grant execute on function public.manage_profile_access(uuid, uuid, public.app_role, text, uuid[])
  to service_role;
