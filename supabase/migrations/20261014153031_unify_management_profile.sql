-- Perfil funcional único RH/Diretor. Valores históricos do enum não são apagados.
-- Nenhuma mudança em profile_scopes, pedidos, decisões, sessões ou senhas.
create or replace function private.normalize_management_profile()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  new.role := case when new.role='diretor' then 'rh'::public.app_role else new.role end;
  new.roles := (
    select array_agg(value order by first_position)
    from (
      select case when item='diretor' then 'rh'::public.app_role else item end value,
        min(position) first_position
      from unnest(new.roles) with ordinality as role_item(item,position)
      group by case when item='diretor' then 'rh'::public.app_role else item end
    ) normalized
  );
  return new;
end $$;
revoke all on function private.normalize_management_profile() from public,anon,authenticated;
grant execute on function private.normalize_management_profile() to service_role;
create trigger profiles_normalize_management
before insert or update of role,roles on public.profiles
for each row execute function private.normalize_management_profile();

update public.profiles set role=role,roles=roles
where role='diretor' or 'diretor'=any(roles);

alter table public.profiles drop constraint profiles_roles_allowed;
alter table public.profiles add constraint profiles_roles_allowed check (
  cardinality(roles)>=1 and cardinality(roles)<=3
  and roles <@ array['servidor','rh','administrador']::public.app_role[]
);
