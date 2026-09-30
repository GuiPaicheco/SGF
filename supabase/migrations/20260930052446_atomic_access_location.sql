-- Aprovação e vínculo CNES na mesma transação.
create or replace function public.approve_cpf_access_with_location(
  actor_id uuid, target_request_id uuid, account_id uuid,
  target_roles public.app_role[], target_scope_ids uuid[], target_lotacao_id uuid
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if target_lotacao_id is null or not exists (
    select 1 from public.lotacoes where id = target_lotacao_id and active
  ) then raise exception using message='INVALID_SCOPE',errcode='22023'; end if;
  perform public.approve_cpf_access(actor_id,target_request_id,account_id,target_roles,target_scope_ids);
  update public.profiles set primary_lotacao_id=target_lotacao_id where id=account_id;
  update public.servidores set lotacao_id=target_lotacao_id,active=true where profile_id=account_id;
end $$;
revoke all on function public.approve_cpf_access_with_location(uuid,uuid,uuid,public.app_role[],uuid[],uuid) from public,anon,authenticated;
grant execute on function public.approve_cpf_access_with_location(uuid,uuid,uuid,public.app_role[],uuid[],uuid) to service_role;
