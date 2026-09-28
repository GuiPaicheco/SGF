create table if not exists public.submission_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  attempted_at timestamptz not null default now(),
  accepted boolean not null default false
);
create index if not exists submission_attempts_ip_time_idx
  on public.submission_attempts(ip_hash, attempted_at desc);
alter table public.submission_attempts enable row level security;
revoke all on public.submission_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.submission_attempts to service_role;
grant usage, select on sequence public.submission_attempts_id_seq to service_role;
