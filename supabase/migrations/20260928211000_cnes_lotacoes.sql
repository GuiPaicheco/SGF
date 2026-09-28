create unique index if not exists cargos_name_lower_key on public.cargos (lower(name));

insert into public.lotacoes (code, name, unit_type, active)
values
  ('2126028', 'UBS ALCIDES BRAZ', 'unidade', true),
  ('2126060', 'UBS ALTEROSAS ANTONIO JOSE SALOMAO', 'unidade', true),
  ('2126427', 'UBS ALVORADA JOAO GREGORIO FERREIRA', 'unidade', true),
  ('6305245', 'UBS AMAZONAS', 'unidade', true),
  ('2125919', 'UBS ANGOLA ROGERIO GUSTAVO REZENDE', 'unidade', true),
  ('3419371', 'UBS BANDEIRINHAS ROSA MIGUEL SALOMAO', 'unidade', true),
  ('2125935', 'UBS BUENO FRANCO MARIA OLIVEIRA E SILVA', 'unidade', true),
  ('2125994', 'UBS CACHOEIRA WILSON OLIVEIRA ANTUNES', 'unidade', true),
  ('5320348', 'UBS CAIC CAPELINHA', 'unidade', true),
  ('6213618', 'UBS CAMPOS ELISEOS', 'unidade', true),
  ('0856762', 'UBS CELSO ALVES PEDROSA', 'unidade', true),
  ('2125951', 'UBS CIDADE VERDE MARCIO FIRMIANO GALLO', 'unidade', true),
  ('2125978', 'UBS CITROLANDIA ANALIA MARQUES DE OLIVEIRA', 'unidade', true),
  ('5128218', 'UBS COLONIA', 'unidade', true),
  ('3419363', 'UBS CRUZEIRO DO SUL', 'unidade', true),
  ('2126087', 'UBS DOM BOSCO SEBASTIAO DA SILVA VIANA', 'unidade', true),
  ('7924097', 'UBS DUQUE DE CAXIAS ELIAS VIEIRA DE SA', 'unidade', true),
  ('5139074', 'UBS GUANABARA', 'unidade', true),
  ('2125927', 'UBS HOMERO GIL', 'unidade', true),
  ('2126192', 'UBS ICAIVERA', 'unidade', true),
  ('2126141', 'UBS IMBIRUCU ANTONIO SABINO DE SOUZA', 'unidade', true),
  ('2126176', 'UBS LARANJEIRAS ANTONIO CAETANO', 'unidade', true),
  ('2125900', 'UBS MARIMBA', 'unidade', true),
  ('4659031', 'UBS NITEROI', 'unidade', true),
  ('6935699', 'UBS NOSSA SENHORA DE FATIMA', 'unidade', true),
  ('5896002', 'UBS NOVA BADEN VIRGINIA MARIA DE CARVALHO', 'unidade', true),
  ('3910865', 'UBS PARQUE DO CEDRO CECILIA DE PAULA OLIVEIRA', 'unidade', true),
  ('6409296', 'UBS PAULO CAMILO', 'unidade', true),
  ('2125986', 'UBS PETROPOLIS ROSA CAPUCHE', 'unidade', true),
  ('2126095', 'UBS PETROVALE EDUARDO ANTONIO ROCHA', 'unidade', true),
  ('2126109', 'UBS PTB SANTA CRUZ', 'unidade', true),
  ('4702301', 'UBS SAO JOAO', 'unidade', true),
  ('4796020', 'UBS SAO LUIZ BETIM', 'unidade', true),
  ('2894912', 'UBS SITIO POCOES TEREZINHA DE JESUS LARA BRAGA', 'unidade', true),
  ('9860673', 'UBS TERESOPOLIS SONIA AUGUSTA DOS SANTOS SILVA', 'unidade', true),
  ('5307767', 'UBS TRINCHEIRA NEUSA MARIA BARBIZAN FERREIRA', 'unidade', true),
  ('5505844', 'UBS UNIVERSAL JOAO NARCIZIO DE BARROS', 'unidade', true),
  ('2126435', 'UBS VIANOPOLIS OSVALDO CRUZ', 'unidade', true),
  ('2126117', 'UBS VILA BEMGE CRISTOVINA C G DE SOUZA', 'unidade', true),
  ('2126168', 'UBS VILA CRISTINA', 'unidade', true),
  ('9814809', 'UBS VILA RECREIO GENI ROSA DOS SANTOS', 'unidade', true),
  ('2126052', 'UPA ALTEROSAS', 'unidade', true),
  ('2126133', 'UPA TERESÓPOLIS JOSÉ SABINO NETO', 'unidade', true),
  ('2126419', 'UPA GUANABARA NILDA NOGUEIRA DE ANDRADE', 'unidade', true),
  ('9804145', 'UPA NORTE BETIM', 'unidade', true),
  ('2126494', 'HOSPITAL PÚBLICO REGIONAL PREFEITO OSVALDO REZENDE FRANCO', 'unidade', true),
  ('2126486', 'SECRETARIA MUNICIPAL DE SAÚDE DE BETIM', 'secretaria', true),
  ('7175930', 'DIRETORIA DE REGULAÇÃO, CONTROLE E AVALIAÇÃO', 'diretoria', true)
on conflict (code) where code is not null do update
set name = excluded.name,
    unit_type = excluded.unit_type,
    active = true;

create or replace function public.review_employee_inclusion(
  inclusion_id uuid,
  decision text,
  reviewer_id uuid,
  review_notes text default null,
  official_location_id uuid default null,
  official_position text default null,
  official_employment_type text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inclusion public.employee_inclusion_requests%rowtype;
  v_position_id uuid;
begin
  select * into v_inclusion
  from public.employee_inclusion_requests
  where id = inclusion_id
  for update;

  if not found or v_inclusion.status not in ('pendente', 'em_analise') then
    raise exception using message = 'INCLUSION_ALREADY_REVIEWED', errcode = 'P0001';
  end if;
  if decision not in ('aprovada', 'rejeitada') then
    raise exception using message = 'INVALID_DECISION', errcode = '22023';
  end if;
  if decision = 'rejeitada' and nullif(btrim(review_notes), '') is null then
    raise exception using message = 'REJECTION_NOTES_REQUIRED', errcode = '22023';
  end if;

  if decision = 'aprovada' then
    if official_location_id is null
       or nullif(btrim(official_position), '') is null
       or nullif(btrim(official_employment_type), '') is null then
      raise exception using message = 'OFFICIAL_DATA_REQUIRED', errcode = '22023';
    end if;
    if not exists (select 1 from public.lotacoes where id = official_location_id and active) then
      raise exception using message = 'INVALID_LOCATION', errcode = '22023';
    end if;

    select id into v_position_id from public.cargos
    where lower(name) = lower(btrim(official_position));
    if v_position_id is null then
      insert into public.cargos(name) values (btrim(official_position))
      returning id into v_position_id;
    end if;

    update public.servidores
    set lotacao_id = official_location_id,
        cargo_id = v_position_id,
        employment_type = btrim(official_employment_type),
        active = true,
        declared_position = null,
        declared_unit = null,
        updated_at = now()
    where id = v_inclusion.servidor_id;
  end if;

  update public.employee_inclusion_requests
  set status = decision,
      notes = nullif(btrim(review_notes), ''),
      reviewed_by = reviewer_id,
      reviewed_at = now(),
      updated_at = now()
  where id = inclusion_id;
end
$$;

revoke all on function public.review_employee_inclusion(uuid, text, uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.review_employee_inclusion(uuid, text, uuid, text, uuid, text, text)
  to service_role;
