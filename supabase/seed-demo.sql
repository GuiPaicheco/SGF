-- Massa fictícia para apresentação do SGF.
-- Idempotente: os registros são identificados pelos prefixos DEMO e SGF-DEMO.

insert into public.funcoes(name) values
  ('Atenção Primária'),
  ('Clínica Geral'),
  ('Enfermagem'),
  ('Gestão Administrativa')
on conflict (name) do nothing;

insert into public.categorias_profissionais(name) values
  ('Assistência'),
  ('Apoio administrativo'),
  ('Corpo clínico')
on conflict (name) do nothing;

update public.servidores s
set admission_date = case s.matricula
      when 'DEMO001' then date '2016-03-01'
      when 'DEMO002' then date '2019-08-12'
      when 'DEMO003' then date '2013-02-04'
      when 'DEMO004' then date '2021-06-14'
      when 'DEMO005' then date '2010-05-10'
      when 'DEMO006' then date '2014-10-20'
    end,
    weekly_hours = case when s.matricula in ('DEMO003') then 20 else 40 end,
    cargo_id = c.id,
    funcao_id = f.id,
    updated_at = now()
from public.cargos c, public.funcoes f
where s.matricula like 'DEMO%'
  and c.name = coalesce(nullif(s.declared_position, ''), 'Administrativo')
  and f.name = case
    when s.declared_position ilike '%Médico%' then 'Clínica Geral'
    when s.declared_position ilike '%Enferm%' then 'Enfermagem'
    when s.declared_position ilike '%Comunitário%' then 'Atenção Primária'
    else 'Gestão Administrativa'
  end;

insert into public.servidores
  (full_name, matricula, birth_date, admission_date, employment_type, lotacao_id,
   cargo_id, funcao_id, weekly_hours, team_name, declared_position, declared_unit, active)
values
  ('Gabriela Souza Demo', 'DEMO007', '1990-01-16', '2018-04-02', 'Efetivo',
   (select id from public.lotacoes where code='2126028'),
   (select id from public.cargos where name='Técnico de Enfermagem'),
   (select id from public.funcoes where name='Enfermagem'), 40, 'Equipe Azul',
   'Técnico de Enfermagem', 'UBS ALCIDES BRAZ', true),
  ('Henrique Alves Demo', 'DEMO008', '1984-04-27', '2012-09-17', 'Efetivo',
   (select id from public.lotacoes where code='2126028'),
   (select id from public.cargos where name='Médico'),
   (select id from public.funcoes where name='Clínica Geral'), 20, 'Equipe Verde',
   'Médico', 'UBS ALCIDES BRAZ', true),
  ('Isabela Freitas Demo', 'DEMO009', '1995-08-08', '2022-01-10', 'Contratado',
   (select id from public.lotacoes where code='2126028'),
   (select id from public.cargos where name='Agente Comunitário de Saúde (ACS)'),
   (select id from public.funcoes where name='Atenção Primária'), 40, 'Equipe Verde',
   'Agente Comunitário de Saúde (ACS)', 'UBS ALCIDES BRAZ', true),
  ('João Victor Demo', 'DEMO010', '1989-05-19', '2017-07-03', 'Efetivo',
   (select id from public.lotacoes where code='2126060'),
   (select id from public.cargos where name='Enfermeiro'),
   (select id from public.funcoes where name='Enfermagem'), 40, 'Equipe Amarela',
   'Enfermeiro', 'UBS ALTEROSAS ANTONIO JOSE SALOMAO', true),
  ('Karen Oliveira Demo', 'DEMO011', '1992-10-11', '2020-02-03', 'Efetivo',
   (select id from public.lotacoes where code='2126060'),
   (select id from public.cargos where name='Técnico de Enfermagem'),
   (select id from public.funcoes where name='Enfermagem'), 40, 'Equipe Azul',
   'Técnico de Enfermagem', 'UBS ALTEROSAS ANTONIO JOSE SALOMAO', true),
  ('Lucas Martins Demo', 'DEMO012', '1983-12-23', '2011-03-21', 'Efetivo',
   (select id from public.lotacoes where code='2126060'),
   (select id from public.cargos where name='Médico'),
   (select id from public.funcoes where name='Clínica Geral'), 20, 'Equipe Amarela',
   'Médico', 'UBS ALTEROSAS ANTONIO JOSE SALOMAO', true),
  ('Mariana Costa Demo', 'DEMO013', '1994-06-02', '2020-11-09', 'Contratado',
   (select id from public.lotacoes where code='2126486'),
   (select id from public.cargos where name='Administrativo'),
   (select id from public.funcoes where name='Gestão Administrativa'), 40, 'Não se aplica',
   'Administrativo', 'SECRETARIA MUNICIPAL DE SAÚDE DE BETIM', true),
  ('Nicolas Ferreira Demo', 'DEMO014', '1986-03-30', '2015-06-01', 'Efetivo',
   (select id from public.lotacoes where code='2126486'),
   (select id from public.cargos where name='Administrativo'),
   (select id from public.funcoes where name='Gestão Administrativa'), 40, 'Não se aplica',
   'Administrativo', 'SECRETARIA MUNICIPAL DE SAÚDE DE BETIM', true),
  ('Olívia Ribeiro Demo', 'DEMO015', '1996-09-14', '2023-01-16', 'Contratado',
   (select id from public.lotacoes where code='2126494'),
   (select id from public.cargos where name='Auxiliar de Enfermagem'),
   (select id from public.funcoes where name='Enfermagem'), 40, 'Equipe Plantão A',
   'Auxiliar de Enfermagem', 'HOSPITAL PÚBLICO REGIONAL PREFEITO OSVALDO REZENDE FRANCO', true),
  ('Paulo Henrique Demo', 'DEMO016', '1981-02-07', '2009-08-03', 'Efetivo',
   (select id from public.lotacoes where code='2126494'),
   (select id from public.cargos where name='Médico'),
   (select id from public.funcoes where name='Clínica Geral'), 24, 'Equipe Plantão B',
   'Médico', 'HOSPITAL PÚBLICO REGIONAL PREFEITO OSVALDO REZENDE FRANCO', true),
  ('Renata Moura Demo', 'DEMO017', '1991-11-28', '2018-12-10', 'Efetivo',
   (select id from public.lotacoes where code='2126494'),
   (select id from public.cargos where name='Enfermeiro'),
   (select id from public.funcoes where name='Enfermagem'), 40, 'Equipe Plantão A',
   'Enfermeiro', 'HOSPITAL PÚBLICO REGIONAL PREFEITO OSVALDO REZENDE FRANCO', true),
  ('Samuel Barros Demo', 'DEMO018', '1988-07-04', '2016-05-23', 'Efetivo',
   (select id from public.lotacoes where code='2126494'),
   (select id from public.cargos where name='Técnico de Enfermagem'),
   (select id from public.funcoes where name='Enfermagem'), 40, 'Equipe Plantão B',
   'Técnico de Enfermagem', 'HOSPITAL PÚBLICO REGIONAL PREFEITO OSVALDO REZENDE FRANCO', true)
on conflict (matricula) do update set
  full_name=excluded.full_name, birth_date=excluded.birth_date,
  admission_date=excluded.admission_date, employment_type=excluded.employment_type,
  lotacao_id=excluded.lotacao_id, cargo_id=excluded.cargo_id,
  funcao_id=excluded.funcao_id, weekly_hours=excluded.weekly_hours,
  team_name=excluded.team_name, declared_position=excluded.declared_position,
  declared_unit=excluded.declared_unit, active=true, updated_at=now();

insert into public.vacation_rights
  (servidor_id, type, acquisition_start, acquisition_end, available_days, source_reference)
select s.id, 'regulamentar', date '2025-01-01', date '2025-12-31', 30,
       'SGF-DEMO-' || s.matricula || '-REG'
from public.servidores s
where s.matricula like 'DEMO%'
  and not exists (
    select 1 from public.vacation_rights r
    where r.source_reference='SGF-DEMO-' || s.matricula || '-REG'
  );

insert into public.time_bank_accounts(servidor_id, declared_minutes, validated_minutes, updated_by)
select s.id, 480 + (right(s.matricula, 2)::int % 4) * 120,
       360 + (right(s.matricula, 2)::int % 3) * 120,
       (select id from public.profiles where 'administrador'=any(roles) and disabled_at is null limit 1)
from public.servidores s where s.matricula like 'DEMO%'
on conflict (servidor_id) do update set
  declared_minutes=excluded.declared_minutes,
  validated_minutes=excluded.validated_minutes,
  updated_by=excluded.updated_by,
  updated_at=now();

do $$
declare
  employee record;
  v_request_id uuid;
  actor_id uuid := (select id from public.profiles where 'administrador'=any(roles) and disabled_at is null limit 1);
  serial integer;
  request_type public.vacation_type;
  request_status public.request_status;
  start_on date;
  end_on date;
  duration integer;
  decision_lead public.approval_decision;
  decision_rh public.approval_decision;
begin
  for employee in
    select s.*, row_number() over(order by s.matricula)::int as position
    from public.servidores s where s.matricula like 'DEMO%'
  loop
    for serial in 1..2 loop
      request_type := case
        when serial=2 and employee.position % 5=0 then 'premio'::public.vacation_type
        when serial=2 and employee.position % 3=0 then 'banco_horas'::public.vacation_type
        when serial=2 and employee.position % 2=0 then 'premio'::public.vacation_type
        else 'regulamentar'::public.vacation_type
      end;
      request_status := (array[
        'enviada','em_analise','aprovada','programada','reprogramada',
        'concluida','rejeitada','cancelada'
      ]::public.request_status[])[1 + ((employee.position + serial - 2) % 8)];
      start_on := date '2026-10-05' + ((employee.position - 1) * 3 + (serial - 1) * 31);
      duration := case
        when request_type='dayoff_aniversario' then 1
        when request_type='banco_horas' then 2
        when request_type='premio' then 5
        else 10
      end;
      end_on := start_on + duration - 1;

      insert into public.vacation_requests
        (servidor_id, right_id, type, status, start_date, end_date, return_date,
         notes, protocol, requested_hours, acquisition_end, birthday_year,
         submitted_at, created_by, created_at, updated_at)
      values
        (employee.id,
         case when request_type in ('regulamentar','premio') then
           (select id from public.vacation_rights where servidor_id=employee.id order by acquisition_end desc limit 1)
         end,
         request_type, request_status, start_on, end_on, end_on + 1,
         '[DEMO] Solicitação preparada para treinamento e apresentação do SGF.',
         format('DEMO-2026-%s-%s', employee.matricula, serial),
         case when request_type='banco_horas' then duration * 8 else null end,
         date '2025-12-31',
         case when request_type='dayoff_aniversario' then 2026 else null end,
         now() - ((40 - employee.position - serial) || ' days')::interval,
         coalesce(employee.profile_id, actor_id),
         now() - ((40 - employee.position - serial) || ' days')::interval,
         now())
      on conflict (protocol) where protocol is not null do update set
        status=excluded.status, start_date=excluded.start_date, end_date=excluded.end_date,
        return_date=excluded.return_date, notes=excluded.notes, updated_at=now()
      returning id into v_request_id;

      insert into public.request_periods
        (request_id, sequence, start_date, end_date, return_date, days, hours)
      values
        (v_request_id, 1, start_on, end_on, end_on + 1, duration,
         case when request_type='banco_horas' then duration * 8 else null end)
      on conflict (request_id, sequence) do update set
        start_date=excluded.start_date, end_date=excluded.end_date,
        return_date=excluded.return_date, days=excluded.days, hours=excluded.hours;

      decision_lead := case
        when request_status='enviada' then 'pendente'
        when request_status='rejeitada' then 'rejeitada'
        else 'aprovada'
      end;
      decision_rh := case
        when request_status in ('enviada','em_analise','rejeitada') then 'pendente'
        else 'aprovada'
      end;

      insert into public.request_approvals(request_id,stage,decision,decided_by,notes,decided_at)
      values
        (v_request_id,'chefia_imediata',decision_lead,
         case when decision_lead='pendente' then null else actor_id end,
         case when decision_lead='rejeitada' then 'Período incompatível com a escala mínima. Exemplo de treinamento.' else '[DEMO] Análise da chefia.' end,
         case when decision_lead='pendente' then null else now() - interval '5 days' end),
        (v_request_id,'rh',decision_rh,
         case when decision_rh='pendente' then null else actor_id end,
         '[DEMO] Conferência documental do RH.',
         case when decision_rh='pendente' then null else now() - interval '3 days' end)
      on conflict (request_id,stage) do update set
        decision=excluded.decision, decided_by=excluded.decided_by,
        notes=excluded.notes, decided_at=excluded.decided_at;
    end loop;
  end loop;
end $$;

insert into public.time_bank_entries
  (servidor_id, minutes, description, occurred_on, validated, created_by)
select s.id, 120, '[DEMO] Plantão extraordinário validado', date '2026-09-18', true,
       (select id from public.profiles where 'administrador'=any(roles) and disabled_at is null limit 1)
from public.servidores s
where s.matricula like 'DEMO%'
  and not exists (
    select 1 from public.time_bank_entries e
    where e.servidor_id=s.id and e.description='[DEMO] Plantão extraordinário validado'
  );

insert into public.minimum_scale_days(lotacao_id, scale_date, updated_by, updated_at)
select distinct s.lotacao_id, d::date,
       (select id from public.profiles where 'administrador'=any(roles) and disabled_at is null limit 1), now()
from public.servidores s
cross join generate_series(date '2026-10-01', date '2026-11-30', interval '1 day') d
where s.matricula like 'DEMO%' and extract(isodow from d) between 1 and 5
on conflict (lotacao_id,scale_date) do update set updated_at=now();

insert into public.minimum_scale_assignments(lotacao_id,scale_date,servidor_id,created_by)
select d.lotacao_id, d.scale_date, chosen.id,
       (select id from public.profiles where 'administrador'=any(roles) and disabled_at is null limit 1)
from public.minimum_scale_days d
cross join lateral (
  select s.id from public.servidores s
  where s.lotacao_id=d.lotacao_id and s.matricula like 'DEMO%'
  order by md5(s.id::text || d.scale_date::text)
  limit 2
) chosen
where d.scale_date between date '2026-10-01' and date '2026-11-30'
on conflict (lotacao_id,scale_date,servidor_id) do nothing;

insert into public.notifications(recipient_id, request_id, title, message)
select s.profile_id, r.id, 'Solicitação em demonstração',
       'O pedido ' || r.protocol || ' possui uma atualização preparada para o treinamento.'
from public.servidores s
join public.vacation_requests r on r.servidor_id=s.id
where s.matricula like 'DEMO%' and s.profile_id is not null
  and r.protocol like '%-1'
  and not exists (
    select 1 from public.notifications n
    where n.recipient_id=s.profile_id and n.request_id=r.id
      and n.title='Solicitação em demonstração'
  );
