create table if not exists public.system_secrets (
  key text primary key,
  secret_value text not null,
  updated_at timestamptz not null default now()
);

alter table public.system_secrets enable row level security;
revoke all on public.system_secrets from public, anon, authenticated;
grant select, insert, update, delete on public.system_secrets to service_role;

create policy "system_secrets_service_only"
on public.system_secrets
for all to service_role
using (true)
with check (true);

comment on table public.system_secrets is
  'Segredos operacionais gravados fora das migrations. Nunca expor pela Data API.';
