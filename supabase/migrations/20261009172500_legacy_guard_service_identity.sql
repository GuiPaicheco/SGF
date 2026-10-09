-- O proprietário de SECURITY DEFINER pode ser supabase_admin numa reconstrução.
-- O JWT de serviço é validado pelo PostgREST; não confiar em x-sgf-actor para bypass.
create or replace function private.guard_request_update()
returns trigger language plpgsql security invoker set search_path='' as $$
declare actor_role public.app_role := private.current_app_role();
begin
  if new.id<>old.id or new.servidor_id<>old.servidor_id or new.created_at<>old.created_at then raise exception 'Campos de identificacao da solicitacao nao podem ser alterados'; end if;
  if actor_role='servidor' and (old.status not in ('rascunho','devolvida') or new.status not in ('rascunho','enviada')) then raise exception 'Transicao nao permitida para o servidor';
  elsif actor_role='diretor' and new.status not in ('em_analise','devolvida','aprovada','rejeitada','cancelada') then raise exception 'Transicao nao permitida para a diretoria';
  elsif actor_role='rh' and new.status not in ('em_analise','devolvida','aprovada','rejeitada','programada','reprogramada','cancelada','concluida') then raise exception 'Transicao nao permitida para o RH';
  elsif actor_role is null and current_user not in ('service_role','postgres') and coalesce((select auth.role()),'')<>'service_role' then raise exception 'Perfil sem permissao para alterar solicitacoes'; end if;
  new.updated_at:=now(); if new.status='enviada' and old.status<>'enviada' then new.submitted_at:=now(); end if; return new;
end $$;
