alter table public.profiles
  add column if not exists login_identifier text,
  add column if not exists must_change_password boolean not null default false;

create unique index if not exists profiles_login_identifier_key
  on public.profiles (lower(login_identifier))
  where login_identifier is not null;

update public.profiles
set login_identifier = 'admin',
    must_change_password = true
where role = 'administrador'
  and login_identifier is null;

alter table public.profiles
  drop constraint if exists profiles_login_identifier_format;

alter table public.profiles
  add constraint profiles_login_identifier_format
  check (
    login_identifier is null
    or login_identifier ~ '^[A-Za-z0-9._-]{3,40}$'
  );

comment on column public.profiles.login_identifier is
  'Identificador público de entrada. O e-mail interno do Supabase Auth não é exposto no frontend.';

comment on column public.profiles.must_change_password is
  'Bloqueia o uso administrativo até que a senha inicial seja substituída.';
