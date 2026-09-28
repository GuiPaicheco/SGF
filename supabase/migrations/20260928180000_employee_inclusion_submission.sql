-- A solicitacao de ferias tambem pode iniciar o cadastro funcional.

create table if not exists public.employee_inclusion_requests (
  id uuid primary key default gen_random_uuid(),
  servidor_id uuid not null references public.servidores(id) on delete cascade,
  request_id uuid not null unique references public.vacation_requests(id) on delete cascade,
  status text not null default 'pendente'
    check (status in ('pendente', 'em_analise', 'aprovada', 'rejeitada')),
  requested_name text not null,
  requested_unit text not null,
  requested_position text,
  requested_function text,
  requested_employment_type text not null,
  notes text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employee_inclusion_status_created_idx
  on public.employee_inclusion_requests(status, created_at desc);
create index if not exists employee_inclusion_servidor_idx
  on public.employee_inclusion_requests(servidor_id);

alter table public.employee_inclusion_requests enable row level security;

create policy "employee_inclusion_read_rh" on public.employee_inclusion_requests
  for select to authenticated using (private.is_admin_or_rh());
create policy "employee_inclusion_manage_rh" on public.employee_inclusion_requests
  for update to authenticated using (private.is_admin_or_rh())
  with check (private.is_admin_or_rh());

revoke all on public.employee_inclusion_requests from public, anon, authenticated;
grant select, update on public.employee_inclusion_requests to authenticated;
grant select, insert, update, delete on public.employee_inclusion_requests to service_role;

create or replace function public.register_vacation_submission(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cpf text := payload->>'cpf';
  v_registration text := btrim(payload->>'registration');
  v_birth_date date := (payload->>'birthDate')::date;
  v_employee public.servidores%rowtype;
  v_request public.vacation_requests%rowtype;
  v_period jsonb;
  v_inclusion_pending boolean := false;
  v_declared_hours numeric := coalesce(nullif(payload->>'availableHours', '')::numeric, nullif(payload->>'addBankHours', '')::numeric, 0);
begin
  -- Serializa envios para o mesmo CPF ou matricula e evita cadastros duplicados.
  perform pg_advisory_xact_lock(hashtextextended('cpf:' || v_cpf, 0));
  perform pg_advisory_xact_lock(hashtextextended('matricula:' || v_registration, 0));

  select s.* into v_employee
  from public.servidores s
  where s.matricula = v_registration or s.cpf = v_cpf
  order by case when s.matricula = v_registration and s.cpf = v_cpf then 0 else 1 end
  limit 1;

  if found then
    if v_employee.matricula <> v_registration
       or v_employee.cpf is distinct from v_cpf
       or v_employee.birth_date is distinct from v_birth_date then
      raise exception using message = 'IDENTITY_CONFLICT', errcode = 'P0001';
    end if;
    v_inclusion_pending := not v_employee.active;
  else
    insert into public.servidores (
      full_name, matricula, cpf, birth_date, admission_date, employment_type, active
    ) values (
      nullif(btrim(payload->>'name'), ''), v_registration, v_cpf, v_birth_date,
      nullif(payload->>'admissionDate', '')::date, btrim(payload->>'employmentType'), false
    ) returning * into v_employee;
    v_inclusion_pending := true;
  end if;

  insert into public.vacation_requests (
    servidor_id, type, status, protocol, start_date, end_date, return_date,
    acquisition_end, requested_hours, notes, submitted_at
  ) values (
    v_employee.id,
    (payload->>'type')::public.vacation_type,
    'enviada',
    'SGF-' || to_char(clock_timestamp(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
    ((payload->'periods'->0)->>'start_date')::date,
    ((payload->'periods'->(jsonb_array_length(payload->'periods') - 1))->>'end_date')::date,
    ((payload->'periods'->(jsonb_array_length(payload->'periods') - 1))->>'return_date')::date,
    nullif(payload->>'acquisitionEnd', '')::date,
    case when payload->>'type' = 'banco_horas' then nullif(payload->>'availableHours', '')::numeric
         else nullif(payload->>'addBankHours', '')::numeric end,
    nullif(left(btrim(payload->>'notes'), 2000), ''),
    now()
  ) returning * into v_request;

  for v_period in select value from jsonb_array_elements(payload->'periods') loop
    insert into public.request_periods (
      request_id, sequence, start_date, end_date, return_date, days, hours
    ) values (
      v_request.id, (v_period->>'sequence')::smallint, (v_period->>'start_date')::date,
      (v_period->>'end_date')::date, (v_period->>'return_date')::date,
      (v_period->>'days')::integer,
      case when payload->>'type' = 'banco_horas'
        then (payload->>'dailyHours')::numeric * (v_period->>'days')::integer else null end
    );
  end loop;

  insert into public.request_approvals(request_id, stage)
  values (v_request.id, 'chefia_imediata'), (v_request.id, 'rh');

  if v_inclusion_pending then
    insert into public.employee_inclusion_requests (
      servidor_id, request_id, requested_name, requested_unit, requested_position,
      requested_function, requested_employment_type, notes
    ) values (
      v_employee.id, v_request.id, btrim(payload->>'name'), btrim(payload->>'unit'),
      nullif(btrim(payload->>'position'), ''), nullif(btrim(payload->>'functionName'), ''),
      btrim(payload->>'employmentType'), 'Cadastro funcional iniciado pela propria solicitacao.'
    );
  end if;

  if v_declared_hours > 0 then
    insert into public.time_bank_accounts(servidor_id, declared_minutes, updated_at)
    values (v_employee.id, round(v_declared_hours * 60), now())
    on conflict (servidor_id) do update
      set declared_minutes = excluded.declared_minutes, updated_at = excluded.updated_at;
  end if;

  return jsonb_build_object(
    'id', v_request.id,
    'protocol', v_request.protocol,
    'inclusion_pending', v_inclusion_pending
  );
end
$$;

revoke all on function public.register_vacation_submission(jsonb) from public, anon, authenticated;
grant execute on function public.register_vacation_submission(jsonb) to service_role;

comment on table public.employee_inclusion_requests is
  'Pendencias de inclusao funcional abertas junto com solicitacoes de ferias.';
comment on function public.register_vacation_submission(jsonb) is
  'Registra servidor provisório, solicitacao, periodos e inclusao em uma unica transacao.';
