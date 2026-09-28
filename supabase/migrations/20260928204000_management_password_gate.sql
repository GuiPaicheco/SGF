create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security invoker
set search_path = ''
as $$
  select role
  from public.profiles
  where id = (select auth.uid())
    and not must_change_password
$$;

comment on function private.current_app_role() is
  'Retorna o perfil somente depois da troca obrigatória da senha inicial.';
