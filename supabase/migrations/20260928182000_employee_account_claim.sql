-- Vincula uma conta do Supabase Auth a um servidor existente ou provisório.

alter table public.servidores
  add column if not exists declared_position text,
  add column if not exists declared_unit text;

create or replace function public.claim_employee_account(
  account_id uuid,
  registration text,
  document_cpf text,
  employee_birth_date date,
  employee_name text,
  employee_position text,
  employee_unit text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_registration text := upper(btrim(registration));
  v_cpf text := regexp_replace(document_cpf, '\D', '', 'g');
  v_employee public.servidores%rowtype;
  v_employee_exists boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('cpf:' || v_cpf, 0));
  perform pg_advisory_xact_lock(hashtextextended('matricula:' || v_registration, 0));

  select s.* into v_employee
  from public.servidores s
  where upper(s.matricula) = v_registration or s.cpf = v_cpf
  order by case when upper(s.matricula) = v_registration and s.cpf = v_cpf then 0 else 1 end
  limit 1;
  v_employee_exists := found;

  if v_employee_exists then
    if upper(v_employee.matricula) <> v_registration
       or v_employee.cpf is distinct from v_cpf
       or v_employee.birth_date is distinct from employee_birth_date then
      raise exception using message = 'IDENTITY_CONFLICT', errcode = 'P0001';
    end if;
    if v_employee.profile_id is not null then
      raise exception using message = 'ACCOUNT_EXISTS', errcode = 'P0001';
    end if;
  end if;

  insert into public.profiles(id, full_name, role)
  values (account_id, btrim(employee_name), 'servidor');

  if v_employee_exists then
    update public.servidores
      set profile_id = account_id,
          full_name = coalesce(nullif(full_name, ''), btrim(employee_name)),
          declared_position = nullif(btrim(employee_position), ''),
          declared_unit = nullif(btrim(employee_unit), ''),
          updated_at = now()
      where id = v_employee.id
      returning * into v_employee;
  else
    insert into public.servidores(
      profile_id, matricula, cpf, birth_date, employment_type, active, full_name,
      declared_position, declared_unit
    ) values (
      account_id, v_registration, v_cpf, employee_birth_date, 'pendente', false, btrim(employee_name),
      nullif(btrim(employee_position), ''), nullif(btrim(employee_unit), '')
    ) returning * into v_employee;
  end if;

  return v_employee.id;
end
$$;

drop function if exists public.claim_employee_account(uuid, text, text, date, text);

revoke all on function public.claim_employee_account(uuid, text, text, date, text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_employee_account(uuid, text, text, date, text, text, text)
  to service_role;

comment on function public.claim_employee_account(uuid, text, text, date, text, text, text) is
  'Vincula com atomicidade uma conta Auth ao servidor validado no primeiro acesso.';
