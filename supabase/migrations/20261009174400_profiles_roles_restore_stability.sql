-- Versão aplicada no piloto: 20261009174400.
-- Mesma regra, sem BETWEEN: evitar reagrupamento de BoolExpr no dump/restore.
alter table public.profiles drop constraint profiles_roles_allowed;
alter table public.profiles add constraint profiles_roles_allowed check (
  cardinality(roles) >= 1
  and cardinality(roles) <= 4
  and roles <@ array['servidor','diretor','rh','administrador']::public.app_role[]
);
