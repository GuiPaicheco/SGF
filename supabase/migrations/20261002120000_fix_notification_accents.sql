create or replace function private.notify_request_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_protocol text := coalesce(new.protocol, left(new.id::text, 8));
  v_status_label text := case new.status
    when 'rascunho' then 'rascunho'
    when 'enviada' then 'enviada'
    when 'em_analise' then 'em análise'
    when 'devolvida' then 'devolvida para correção'
    when 'aprovada' then 'aprovada'
    when 'rejeitada' then 'rejeitada'
    when 'programada' then 'programada'
    when 'reprogramada' then 'reprogramada'
    when 'cancelada' then 'cancelada'
    when 'concluida' then 'concluída'
    else replace(new.status::text, '_', ' ')
  end;
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.notifications(recipient_id, request_id, title, message)
    select recipient, new.id, 'Solicitação ' || v_protocol,
      'Situação atualizada para ' || v_status_label || '.'
    from (
      select servidor.profile_id recipient
      from public.servidores servidor
      where servidor.id = new.servidor_id
      union
      select scope.profile_id
      from public.servidores servidor
      join public.profile_scopes scope on scope.lotacao_id = servidor.lotacao_id
      where servidor.id = new.servidor_id
      union
      select profile.id
      from public.profiles profile
      where 'administrador'=any(profile.roles)
    ) recipients
    where recipient is not null;
  end if;
  return new;
end $$;

update public.notifications
set title = replace(title, 'Solicitacao ', 'Solicitação '),
    message = replace(
      replace(
        replace(
          replace(message, 'Situacao ', 'Situação '),
          'em analise', 'em análise'
        ),
        'devolvida', 'devolvida para correção'
      ),
      'concluida', 'concluída'
    )
where title like 'Solicitacao %' or message like 'Situacao %';
