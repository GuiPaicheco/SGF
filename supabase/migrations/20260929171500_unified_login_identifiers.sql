-- Mantém matrícula/identificador para todos os perfis no login unificado.

update public.profiles profile
set login_identifier = candidate.value
from (
  select servidor.profile_id,
         left(regexp_replace(lower(servidor.matricula), '[^a-z0-9._-]', '', 'g'), 40) as value
  from public.servidores servidor
  where servidor.profile_id is not null
) candidate
where profile.id = candidate.profile_id
  and profile.login_identifier is null
  and length(candidate.value) >= 3
  and not exists (
    select 1 from public.profiles other
    where other.id <> profile.id and lower(other.login_identifier) = candidate.value
  );

create or replace function public.manage_profile_access(actor_id uuid,target_profile_id uuid,target_role public.app_role,target_identifier text,target_scope_ids uuid[] default '{}')
returns void language plpgsql security invoker set search_path='' as $$
declare v_identifier text := lower(nullif(btrim(target_identifier), ''));
begin
  if not exists(select 1 from public.profiles where id=actor_id and role='administrador' and not must_change_password) then raise exception using message='ADMIN_REQUIRED',errcode='42501'; end if;
  if actor_id=target_profile_id then raise exception using message='SELF_ROLE_CHANGE_BLOCKED',errcode='22023'; end if;
  if not exists(select 1 from public.profiles where id=target_profile_id) then raise exception using message='PROFILE_NOT_FOUND',errcode='P0002'; end if;
  if target_role='gerencia' then raise exception using message='LEGACY_ROLE_DISABLED',errcode='22023'; end if;
  if v_identifier is null then raise exception using message='IDENTIFIER_REQUIRED',errcode='22023'; end if;
  if v_identifier !~ '^[a-z0-9._-]{3,40}$' then raise exception using message='INVALID_IDENTIFIER',errcode='22023'; end if;
  if target_role in ('diretor','rh') and coalesce(cardinality(target_scope_ids),0)=0 then raise exception using message='SCOPE_REQUIRED',errcode='22023'; end if;
  if exists(select 1 from unnest(coalesce(target_scope_ids,'{}')) scope_id where not exists(select 1 from public.lotacoes l where l.id=scope_id and l.active)) then raise exception using message='INVALID_SCOPE',errcode='22023'; end if;
  update public.profiles set role=target_role,login_identifier=v_identifier,must_change_password=case when role='servidor' and target_role<>'servidor' then true else must_change_password end where id=target_profile_id;
  delete from public.profile_scopes where profile_id=target_profile_id;
  if target_role in ('diretor','rh') then insert into public.profile_scopes(profile_id,lotacao_id) select target_profile_id,scope_id from unnest(target_scope_ids) scope_id on conflict do nothing; end if;
  insert into public.audit_events(actor_id,action,entity_type,entity_id,new_value) values(actor_id,'profile_access_updated','profile',target_profile_id,jsonb_build_object('role',target_role,'identifier',v_identifier,'scopes',target_scope_ids));
end $$;

revoke all on function public.manage_profile_access(uuid,uuid,public.app_role,text,uuid[]) from public,anon,authenticated;
grant execute on function public.manage_profile_access(uuid,uuid,public.app_role,text,uuid[]) to service_role;
