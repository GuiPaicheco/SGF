-- Executar somente com BEGIN/ROLLBACK: nenhum dado de teste permanece.
BEGIN;
create temporary table block_two_checks(name text,passed boolean);
insert into auth.users(id,email,aud,role) values
 ('f1000000-0000-0000-0000-000000000001','block2-manager@example.invalid','authenticated','authenticated'),
 ('f1000000-0000-0000-0000-000000000002','block2-owner@example.invalid','authenticated','authenticated');
insert into public.profiles(id,full_name,role,roles,must_change_password) values
 ('f1000000-0000-0000-0000-000000000001','TESTE bloco 02 gestão','administrador',array['administrador','rh','diretor']::public.app_role[],false),
 ('f1000000-0000-0000-0000-000000000002','TESTE bloco 02 titular','servidor',array['servidor']::public.app_role[],false)
on conflict(id) do update set roles=excluded.roles,must_change_password=false;
select set_config('request.headers','{"x-sgf-role":"administrador","x-sgf-actor":"f1000000-0000-0000-0000-000000000001"}',true);
create temporary table block_two_ids(name text,id uuid);
insert into block_two_ids values('cnes',public.save_organization_registry('f1000000-0000-0000-0000-000000000001','cnes',
 '{"code":"9999997","name":"TESTE CNES bloco 02 rollback","reason":"Ensaio autorizado"}'));
insert into block_two_ids values('secretaria',public.save_organization_registry('f1000000-0000-0000-0000-000000000001','location',
 jsonb_build_object('name','TESTE Secretaria bloco 02','unit_type','secretaria','cnes_unit_id',(select id from block_two_ids where name='cnes'),'reason','Ensaio autorizado')));
insert into block_two_ids values('diretoria-a',public.save_organization_registry('f1000000-0000-0000-0000-000000000001','location',
 jsonb_build_object('name','TESTE Diretoria A bloco 02','unit_type','diretoria','is_internal_allocation',true,'parent_id',(select id from block_two_ids where name='secretaria'),
 'cnes_unit_id',(select id from block_two_ids where name='cnes'),'responsible_ids',jsonb_build_array('f1000000-0000-0000-0000-000000000001'),'reason','Ensaio autorizado')));
insert into block_two_ids values('diretoria-b',public.save_organization_registry('f1000000-0000-0000-0000-000000000001','location',
 jsonb_build_object('name','TESTE Diretoria B bloco 02','unit_type','diretoria','is_internal_allocation',true,'parent_id',(select id from block_two_ids where name='secretaria'),
 'cnes_unit_id',(select id from block_two_ids where name='cnes'),'reason','Ensaio autorizado')));
insert into block_two_checks select 'secretaria e diretorias compartilham CNES sem duplicar unidade',count(*)=3 from public.lotacao_cnes_units where cnes_unit_id=(select id from block_two_ids where name='cnes');
insert into block_two_ids values('team',public.save_organization_registry('f1000000-0000-0000-0000-000000000001','team',
 jsonb_build_object('name','TESTE eMulti bloco 02','type_code','emulti','team_number',999,'cnes_unit_id',(select id from block_two_ids where name='cnes'),'reason','Ensaio autorizado')));
insert into block_two_checks select 'INE ausente permanece pendente',needs_review and ine_code is null from public.teams where id=(select id from block_two_ids where name='team');
do $$ begin
  begin perform public.save_organization_registry('f1000000-0000-0000-0000-000000000001','team',jsonb_build_object('id',(select id from block_two_ids where name='team'),
    'version',1,'name','TESTE eMulti bloco 02','type_code','emulti','team_number',999,'cnes_unit_id',(select id from block_two_ids where name='cnes'),'ine_code','9999999999','reason','Ensaio autorizado'));
    raise exception 'EXPECTED_INE_SOURCE_ERROR'; exception when others then if sqlerrm<>'INE_SOURCE_REQUIRED' then raise; end if; end;
  insert into block_two_checks values('INE não pode ser preenchido sem fonte',true);
  begin perform public.save_organization_registry('f1000000-0000-0000-0000-000000000001','location',jsonb_build_object('name','TESTE inválido','unit_type','diretoria','is_internal_allocation',true,
    'parent_id',(select id from block_two_ids where name='diretoria-a'),'cnes_unit_id',(select id from block_two_ids where name='cnes'),'reason','Ensaio autorizado'));
    raise exception 'EXPECTED_SECRETARIAT_ERROR'; exception when others then if sqlerrm<>'INTERNAL_ALLOCATION_REQUIRES_SECRETARIAT' then raise; end if; end;
  insert into block_two_checks values('lotação interna exige Secretaria superior',true);
end $$;
insert into public.servidores(id,profile_id,matricula,employment_type,full_name,cpf,birth_date,active)
values('f1000000-0000-0000-0000-000000000201','f1000000-0000-0000-0000-000000000002','BLOCK2-M1','estatutario','TESTE bloco 02 titular','91801880352','1990-01-01',true);
insert into public.employment_bonds(id,servidor_id,registration,employment_type,admission_date) values
 ('f1000000-0000-0000-0000-000000000301','f1000000-0000-0000-0000-000000000201','BLOCK2-M1','estatutario','2020-01-01'),
 ('f1000000-0000-0000-0000-000000000302','f1000000-0000-0000-0000-000000000201','BLOCK2-M2','estatutario','2022-01-01');
insert into public.employment_bond_units(id,bond_id,cnes_unit_id,internal_lotacao_id,valid_from) values
 ('f1000000-0000-0000-0000-000000000401','f1000000-0000-0000-0000-000000000301',(select id from block_two_ids where name='cnes'),(select id from block_two_ids where name='diretoria-a'),'2020-01-01'),
 ('f1000000-0000-0000-0000-000000000402','f1000000-0000-0000-0000-000000000301',(select id from block_two_ids where name='cnes'),(select id from block_two_ids where name='diretoria-b'),'2020-01-01'),
 ('f1000000-0000-0000-0000-000000000403','f1000000-0000-0000-0000-000000000302',(select id from block_two_ids where name='cnes'),(select id from block_two_ids where name='diretoria-b'),'2022-01-01');
select public.manage_bond_time_bank('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000301',480,'Crédito ensaio','2026-10-08',0,'f1000000-0000-0000-0000-000000000601');
select public.manage_bond_time_bank('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000301',480,'Crédito ensaio','2026-10-08',0,'f1000000-0000-0000-0000-000000000601');
select public.manage_bond_time_bank('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000302',120,'Outro vínculo','2026-10-08',0,'f1000000-0000-0000-0000-000000000602');
insert into block_two_checks select 'reenvio idempotente não duplica saldo',validated_minutes=480 and version=1 from public.bond_time_bank_accounts where bond_id='f1000000-0000-0000-0000-000000000301';
insert into block_two_checks select 'matrículas têm saldos independentes',validated_minutes=120 from public.bond_time_bank_accounts where bond_id='f1000000-0000-0000-0000-000000000302';
do $$ begin
  begin perform public.manage_bond_time_bank('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000301',60,'Versão antiga','2026-10-08',0,gen_random_uuid()); raise exception 'EXPECTED_BANK_VERSION_ERROR';
    exception when others then if sqlerrm<>'BANK_VERSION_CONFLICT' then raise; end if; end;
  insert into block_two_checks values('versão antiga não altera saldo',true);
  begin perform public.manage_bond_time_bank('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000301',-600,'Débito insuficiente','2026-10-08',1,gen_random_uuid()); raise exception 'EXPECTED_BANK_BALANCE_ERROR';
    exception when others then if sqlerrm<>'INSUFFICIENT_VALIDATED_BALANCE' then raise; end if; end;
  insert into block_two_checks values('saldo negativo é bloqueado atomicamente',true);
end $$;
insert into block_two_ids values('right',public.save_bond_vacation_right('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000301',
 '{"type":"regulamentar","acquisition_start":"2025-01-01","acquisition_end":"2025-12-31","available_days":25,"source_reference":"Documento fictício de teste","reason":"Ensaio autorizado"}'));
do $$ begin
  begin perform public.save_bond_vacation_right('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000301',
    '{"type":"regulamentar","acquisition_start":"2025-01-01","acquisition_end":"2025-12-31","available_days":25,"source_reference":"Teste","reason":"Ensaio autorizado"}'); raise exception 'EXPECTED_RIGHT_DUPLICATE';
    exception when unique_violation then if sqlerrm<>'RIGHT_DUPLICATED' then raise; end if; end;
  insert into block_two_checks values('período aquisitivo não duplica entre CNES',true);
  begin insert into public.vacation_requests(servidor_id,right_id,type,status,start_date,end_date,context_bond_id)
    values('f1000000-0000-0000-0000-000000000201',(select id from block_two_ids where name='right'),'regulamentar','enviada','2026-11-03','2026-11-04','f1000000-0000-0000-0000-000000000302'); raise exception 'EXPECTED_RIGHT_BOND_MISMATCH';
    exception when check_violation then if sqlerrm<>'RIGHT_BOND_MISMATCH' then raise; end if; end;
  insert into block_two_checks values('direito de outra matrícula não sustenta pedido',true);
end $$;
select set_config('request.headers',jsonb_build_object('x-sgf-role','rh','x-sgf-actor','f1000000-0000-0000-0000-000000000001','x-sgf-cnes',(select id from block_two_ids where name='cnes'),
 'x-sgf-lotacao',(select id from block_two_ids where name='diretoria-a'))::text,true);
insert into block_two_checks select 'RH acessa apenas vínculo de seu contexto',public.bond_context_allowed('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000301',true)
 and not public.bond_context_allowed('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000302',true);
do $$ begin
  begin perform public.manage_bond_time_bank('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000302',60,'Escopo incorreto','2026-10-08',1,gen_random_uuid()); raise exception 'EXPECTED_BOND_SCOPE';
    exception when insufficient_privilege then if sqlerrm<>'BOND_SCOPE_REQUIRED' then raise; end if; end;
  insert into block_two_checks values('mesma pessoa não amplia escopo para outra matrícula',true);
end $$;
select set_config('request.headers','{"x-sgf-role":"administrador","x-sgf-actor":"f1000000-0000-0000-0000-000000000001"}',true);
insert into public.vacation_requests(id,servidor_id,type,status,start_date,end_date,return_date,context_bond_id,requested_hours)
values('f1000000-0000-0000-0000-000000000501','f1000000-0000-0000-0000-000000000201','banco_horas','enviada','2026-11-03','2026-11-04','2026-11-05','f1000000-0000-0000-0000-000000000301',4);
insert into public.request_unit_reviews(id,request_id,cnes_unit_id,lotacao_id) values
 ('f1000000-0000-0000-0000-000000000701','f1000000-0000-0000-0000-000000000501',(select id from block_two_ids where name='cnes'),(select id from block_two_ids where name='diretoria-a')),
 ('f1000000-0000-0000-0000-000000000702','f1000000-0000-0000-0000-000000000501',(select id from block_two_ids where name='cnes'),(select id from block_two_ids where name='diretoria-b'));
select public.manage_unit_request_review('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000701','approve',null,1,null);
select public.manage_unit_request_review('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000702','approve',null,1,null);
insert into block_two_checks select 'aprovação não debita banco',validated_minutes=480 from public.bond_time_bank_accounts where bond_id='f1000000-0000-0000-0000-000000000301';
select public.manage_unit_request_review('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000701','schedule',null,2,null);
select public.manage_unit_request_review('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000702','schedule',null,2,null);
insert into block_two_checks select 'duas unidades debitam apenas uma vez',validated_minutes=240 from public.bond_time_bank_accounts where bond_id='f1000000-0000-0000-0000-000000000301';
update public.vacation_requests set status='cancelada' where id='f1000000-0000-0000-0000-000000000501';
insert into block_two_checks select 'cancelamento estorna uma única vez',validated_minutes=480 from public.bond_time_bank_accounts where bond_id='f1000000-0000-0000-0000-000000000301';
insert into block_two_checks select 'autoria e vínculo auditados',count(*)>=3 from public.audit_events where actor_id='f1000000-0000-0000-0000-000000000001' and context_bond_id='f1000000-0000-0000-0000-000000000301';
insert into block_two_checks select 'cliente não pode manipular saldos',not has_table_privilege('authenticated','public.bond_time_bank_accounts','UPDATE')
 and not has_function_privilege('anon','public.manage_bond_time_bank(uuid,uuid,integer,text,date,integer,uuid)','EXECUTE');
select set_config('request.headers',jsonb_build_object('x-sgf-role','servidor','x-sgf-actor','f1000000-0000-0000-0000-000000000002',
 'x-sgf-bond','f1000000-0000-0000-0000-000000000302','x-sgf-cnes',(select id from block_two_ids where name='cnes'),'x-sgf-lotacao',(select id from block_two_ids where name='diretoria-b'))::text,true);
insert into block_two_ids values('submission',(public.register_contextual_vacation_submission(
 jsonb_build_object('cpf','91801880352','registration','BLOCK2-M2','birthDate','1990-01-01','name','TESTE bloco 02 titular',
 'admissionDate','2022-01-01','employmentType','estatutario','unit','Teste CNES','type','banco_horas','availableHours',10,'requestedHours',8,'dailyHours',8,
 'createdBy','f1000000-0000-0000-0000-000000000002','periods',jsonb_build_array(jsonb_build_object('start_date','2026-11-03','end_date','2026-11-03','return_date','2026-11-04','days',1,'sequence',1,'counting_mode','uteis')),
 'dayResponsibilities',jsonb_build_array(jsonb_build_object('date','2026-11-03','bond_unit_id','f1000000-0000-0000-0000-000000000403','cnes_unit_id',(select id from block_two_ids where name='cnes')))),
 'f1000000-0000-0000-0000-000000000302',(select id from block_two_ids where name='cnes'),(select id from block_two_ids where name='diretoria-b'))->>'id')::uuid);
insert into block_two_checks select 'solicitação de segunda matrícula mantém vínculo real',context_bond_id='f1000000-0000-0000-0000-000000000302' and requested_hours=8 from public.vacation_requests where id=(select id from block_two_ids where name='submission');
insert into block_two_checks select 'declaração fica na matrícula, não na pessoa',declared_minutes=600 and not exists(select 1 from public.time_bank_accounts where servidor_id='f1000000-0000-0000-0000-000000000201')
 from public.bond_time_bank_accounts where bond_id='f1000000-0000-0000-0000-000000000302';
insert into block_two_checks select 'servidor não pode consultar outra matrícula pelo identificador',not public.bond_context_allowed('f1000000-0000-0000-0000-000000000002','f1000000-0000-0000-0000-000000000301',false);
select set_config('request.headers','{"x-sgf-role":"administrador","x-sgf-actor":"f1000000-0000-0000-0000-000000000001"}',true);
do $$ declare review uuid; begin
  select id into review from public.request_unit_reviews where request_id=(select id from block_two_ids where name='submission');
  perform public.manage_unit_request_review('f1000000-0000-0000-0000-000000000001',review,'approve',null,1,null);
  begin perform public.manage_unit_request_review('f1000000-0000-0000-0000-000000000001',review,'schedule',null,2,null); raise exception 'EXPECTED_INSUFFICIENT_BANK';
    exception when others then if sqlerrm<>'INSUFFICIENT_VALIDATED_BALANCE' then raise; end if; end;
  insert into block_two_checks select 'saldo insuficiente reverte inclusão no calendário',status='aprovada' and version=2 from public.request_unit_reviews where id=review;
end $$;
insert into block_two_checks select 'falha não grava débito parcial',validated_minutes=120 and not exists(select 1 from public.bond_time_bank_entries where request_id=(select id from block_two_ids where name='submission'))
from public.bond_time_bank_accounts where bond_id='f1000000-0000-0000-0000-000000000302';
select public.save_bond_registry('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000301',
 '{"version":1,"employment_type":"estatutario","admission_date":"2021-01-01","weekly_hours":40,"reason":"Conferência da matrícula"}');
insert into block_two_checks select 'admissão é editada somente na matrícula selecionada',admission_date='2021-01-01' and version=2 from public.employment_bonds where id='f1000000-0000-0000-0000-000000000301';
insert into block_two_checks select 'outra matrícula conserva seus dados',admission_date='2022-01-01' and version=1 from public.employment_bonds where id='f1000000-0000-0000-0000-000000000302';
do $$ begin
  begin perform public.save_bond_registry('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000301',
    '{"version":1,"employment_type":"estatutario","admission_date":"2021-01-01","reason":"Versão antiga"}'); raise exception 'EXPECTED_BOND_VERSION';
    exception when raise_exception then if sqlerrm<>'BOND_VERSION_CONFLICT' then raise; end if; end;
  insert into block_two_checks values('edição concorrente do vínculo exige atualização',true);
end $$;
select * from block_two_checks order by name;
-- Jornada opcional vazia, histórico da fonte e estrutura já utilizada.
select public.save_bond_registry('f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000301',
 '{"version":2,"employment_type":"estatutario","weekly_hours":"","reason":"Campo opcional vazio"}');
insert into block_two_checks select 'jornada opcional vazia é aceita',weekly_hours is null and version=3 from public.employment_bonds where id='f1000000-0000-0000-0000-000000000301';
select public.save_organization_registry('f1000000-0000-0000-0000-000000000001','team',jsonb_build_object('id',(select id from block_two_ids where name='team'),
 'version',1,'name','TESTE eMulti bloco 02','type_code','emulti','team_number',999,'cnes_unit_id',(select id from block_two_ids where name='cnes'),'ine_code','9999999999','source_reference','FONTE FICTÍCIA DO ENSAIO','reason','Conferência fictícia'));
select public.save_organization_registry('f1000000-0000-0000-0000-000000000001','team',jsonb_build_object('id',(select id from block_two_ids where name='team'),
 'version',2,'name','TESTE eMulti atualizado','type_code','emulti','team_number',999,'cnes_unit_id',(select id from block_two_ids where name='cnes'),'ine_code','9999999999','reason','Nome atualizado'));
insert into block_two_checks select 'edição de nome conserva a fonte do INE',source_reference='FONTE FICTÍCIA DO ENSAIO' from public.teams where id=(select id from block_two_ids where name='team');
insert into block_two_ids values('general-cnes',public.save_organization_registry('f1000000-0000-0000-0000-000000000001','cnes',
 '{"code":"9999996","name":"TESTE CNES geral","reason":"Unidade fictícia adicional"}'));
insert into block_two_ids values('general',public.save_organization_registry('f1000000-0000-0000-0000-000000000001','location',
 jsonb_build_object('name','TESTE Unidade geral','unit_type','unidade','cnes_unit_id',(select id from block_two_ids where name='general-cnes'),'reason','Unidade geral fictícia')));
insert into public.employment_bond_units(bond_id,cnes_unit_id,valid_from) values('f1000000-0000-0000-0000-000000000301',(select id from block_two_ids where name='general-cnes'),'2020-01-01');
do $$ begin
  begin perform public.save_organization_registry('f1000000-0000-0000-0000-000000000001','location',jsonb_build_object('id',(select id from block_two_ids where name='general'),
    'version',1,'name','TESTE Unidade geral','unit_type','diretoria','is_internal_allocation',true,'parent_id',(select id from block_two_ids where name='secretaria'),
    'cnes_unit_id',(select id from block_two_ids where name='cnes'),'reason','Tentativa incompatível')); raise exception 'EXPECTED_ALLOCATION_IN_USE';
    exception when invalid_parameter_value then if sqlerrm<>'ALLOCATION_IN_USE' then raise; end if; end;
  insert into block_two_checks values('unidade geral utilizada não vira diretoria silenciosamente',true);
  begin perform public.save_organization_registry('f1000000-0000-0000-0000-000000000001','cnes',jsonb_build_object('id',(select id from block_two_ids where name='cnes'),
    'version',0,'name','TESTE CNES','code','9999997','reason','Versão antiga')); raise exception 'EXPECTED_REGISTRY_VERSION';
    exception when raise_exception then if sqlerrm<>'REGISTRY_VERSION_CONFLICT' then raise; end if; end;
  insert into block_two_checks values('catálogo rejeita versão antiga',true);
end $$;
select * from block_two_checks order by name;
do $$ begin if (select count(*) from block_two_checks)<>29 or exists(select 1 from block_two_checks where passed is distinct from true) then raise exception 'BLOCK_TWO_ASSERTIONS_FAILED'; end if; end $$;
ROLLBACK;
