-- Fixtures exclusivamente sintéticas; executar na mesma transação com ROLLBACK.
BEGIN;
create temporary table block_three_checks(name text,passed boolean);
insert into auth.users(id,email,aud,role) values
 ('f3000000-0000-0000-0000-000000000001','block3-admin@example.invalid','authenticated','authenticated'),
 ('f3000000-0000-0000-0000-000000000002','block3-owner@example.invalid','authenticated','authenticated');
insert into public.profiles(id,full_name,role,roles,must_change_password) values
 ('f3000000-0000-0000-0000-000000000001','TESTE Bloco 03 gestão','administrador',array['administrador','rh']::public.app_role[],false),
 ('f3000000-0000-0000-0000-000000000002','TESTE Bloco 03 titular','servidor',array['servidor']::public.app_role[],false);
insert into public.cnes_units(id,code,name) values
 ('f3000000-0000-0000-0000-000000000901','9999994','TESTE Bloco 03 Unidade A'),
 ('f3000000-0000-0000-0000-000000000902','9999995','TESTE Bloco 03 Unidade B');
insert into public.lotacoes(id,name,code,unit_type) values
 ('f3000000-0000-0000-0000-000000000101','TESTE Bloco 03 Unidade A','9999994','unidade'),
 ('f3000000-0000-0000-0000-000000000102','TESTE Bloco 03 Unidade B','9999995','unidade');
insert into public.lotacao_cnes_units(lotacao_id,cnes_unit_id) values
 ('f3000000-0000-0000-0000-000000000101','f3000000-0000-0000-0000-000000000901'),
 ('f3000000-0000-0000-0000-000000000102','f3000000-0000-0000-0000-000000000902');
insert into public.profile_scopes(profile_id,lotacao_id) values('f3000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000101');
insert into public.servidores(id,profile_id,matricula,full_name,birth_date,employment_type,active) values
 ('f3000000-0000-0000-0000-000000000201','f3000000-0000-0000-0000-000000000002','BLOCK3-M1','TESTE Bloco 03 titular','1990-01-01','estatutario',true);
insert into public.employment_bonds(id,servidor_id,registration,employment_type,valid_from) values
 ('f3000000-0000-0000-0000-000000000301','f3000000-0000-0000-0000-000000000201','BLOCK3-M1','estatutario','2020-01-01');
insert into public.employment_bond_units(id,bond_id,cnes_unit_id,valid_from) values
 ('f3000000-0000-0000-0000-000000000401','f3000000-0000-0000-0000-000000000301','f3000000-0000-0000-0000-000000000901','2020-01-01'),
 ('f3000000-0000-0000-0000-000000000402','f3000000-0000-0000-0000-000000000301','f3000000-0000-0000-0000-000000000902','2020-01-01');
select set_config('request.headers','{"x-sgf-role":"administrador","x-sgf-actor":"f3000000-0000-0000-0000-000000000001"}',true);
insert into public.vacation_requests(id,servidor_id,type,status,start_date,end_date,return_date,context_bond_id,requested_hours,protocol)
 values('f3000000-0000-0000-0000-000000000501','f3000000-0000-0000-0000-000000000201','banco_horas','enviada','2026-11-03','2026-11-04','2026-11-05','f3000000-0000-0000-0000-000000000301',8,'TESTE-BLOCO03-ORIGINAL');
insert into public.request_periods(request_id,sequence,start_date,end_date,return_date,days,hours,counting_mode)
 values('f3000000-0000-0000-0000-000000000501',1,'2026-11-03','2026-11-04','2026-11-05',2,8,'uteis');
insert into public.request_day_responsibilities(request_id,responsibility_date,bond_unit_id,cnes_unit_id,assigned_by) values
 ('f3000000-0000-0000-0000-000000000501','2026-11-03','f3000000-0000-0000-0000-000000000401','f3000000-0000-0000-0000-000000000901','f3000000-0000-0000-0000-000000000001'),
 ('f3000000-0000-0000-0000-000000000501','2026-11-04','f3000000-0000-0000-0000-000000000402','f3000000-0000-0000-0000-000000000902','f3000000-0000-0000-0000-000000000001');
select public.manage_bond_time_bank('f3000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000301',600,'Crédito sintético','2026-10-08',0,gen_random_uuid());
do $$
declare actor uuid:='f3000000-0000-0000-0000-000000000001'; req uuid:='f3000000-0000-0000-0000-000000000501'; a uuid; b uuid;
  plan jsonb; days jsonb; result jsonb; replacement uuid; old_plan jsonb;
begin
  select id into a from public.request_unit_reviews where request_id=req and cnes_unit_id='f3000000-0000-0000-0000-000000000901';
  select id into b from public.request_unit_reviews where request_id=req and cnes_unit_id='f3000000-0000-0000-0000-000000000902';
  old_plan:=public.prepare_request_revision(actor,req,'["2026-12-01"]');
  begin perform public.manage_unit_request_review(actor,a,'schedule',null,1); raise exception 'EXPECTED_APPROVAL';
    exception when others then if sqlerrm<>'APPROVAL_REQUIRED' then raise; end if; end;
  insert into block_three_checks values('inclusão exige aprovação prévia',true);
  perform public.manage_unit_request_review(actor,a,'approve',null,1);
  begin perform public.manage_unit_request_review(actor,a,'approve',null,1); raise exception 'EXPECTED_STALE_REVIEW';
    exception when others then if sqlerrm<>'REVIEW_VERSION_CONFLICT' then raise; end if; end;
  insert into block_three_checks values('clique repetido não duplica decisão',true);
  perform set_config('request.headers','{"x-sgf-role":"rh","x-sgf-actor":"f3000000-0000-0000-0000-000000000001","x-sgf-cnes":"f3000000-0000-0000-0000-000000000901","x-sgf-lotacao":"f3000000-0000-0000-0000-000000000101"}',true);
  begin perform public.manage_unit_request_review(actor,b,'approve',null,1); raise exception 'EXPECTED_SCOPE';
    exception when others then if sqlerrm<>'REQUEST_OUT_OF_SCOPE' then raise; end if; end;
  insert into block_three_checks values('RH não decide outra unidade',true);
  begin perform public.prepare_request_revision(actor,req,'["2026-12-01"]'); raise exception 'EXPECTED_ADMIN';
    exception when others then if sqlerrm<>'ACTOR_NOT_ALLOWED' then raise; end if; end;
  insert into block_three_checks values('RH não substitui decisão de outro CNES',true);
  perform set_config('request.headers','{"x-sgf-role":"administrador","x-sgf-actor":"f3000000-0000-0000-0000-000000000001"}',true);
  perform public.manage_unit_request_review(actor,b,'approve',null,1);
  insert into block_three_checks select 'aprovação não confirma calendário nem debita horas',validated_minutes=600 from public.bond_time_bank_accounts where bond_id='f3000000-0000-0000-0000-000000000301';
  perform public.manage_unit_request_review(actor,a,'schedule',null,2);
  perform public.manage_unit_request_review(actor,b,'schedule',null,2);
  insert into block_three_checks select 'duas inclusões debitam uma única vez',validated_minutes=120 from public.bond_time_bank_accounts where bond_id='f3000000-0000-0000-0000-000000000301';
  days:='[{"date":"2026-12-01","bond_unit_id":"f3000000-0000-0000-0000-000000000401"},{"date":"2026-12-02","bond_unit_id":"f3000000-0000-0000-0000-000000000402"}]';
  begin perform public.commit_request_revision(actor,req,'["2026-12-01"]',days,old_plan->>'fingerprint','Ensaio de versão antiga'); raise exception 'EXPECTED_REVISION_VERSION';
    exception when others then if sqlerrm<>'REVISION_VERSION_CONFLICT' then raise; end if; end;
  insert into block_three_checks values('decisões posteriores invalidam simulação antiga',true);
  plan:=public.prepare_request_revision(actor,req,'["2026-12-01"]');
  insert into block_three_checks values('simulação conserva quantidade e recalcula retorno',plan->'periods'->0->>'days'='2' and plan->'periods'->0->>'return_date'='2026-12-03');
  begin perform public.commit_request_revision(actor,req,'["2026-12-01"]','[]',plan->>'fingerprint','Distribuição incompleta'); raise exception 'EXPECTED_DAYS';
    exception when others then if sqlerrm<>'RESPONSIBILITY_DAYS_INCOMPLETE' then raise; end if; end;
  insert into block_three_checks select 'falha conserva confirmação e saldo',status='programada' and (select validated_minutes=120 from public.bond_time_bank_accounts where bond_id=context_bond_id) from public.vacation_requests where id=req;
  update public.employment_bond_units set active=false where id='f3000000-0000-0000-0000-000000000402';
  begin perform public.commit_request_revision(actor,req,'["2026-12-01"]',days,plan->>'fingerprint','Atuação desativada'); raise exception 'EXPECTED_CHANGED_UNITS';
    exception when others then if sqlerrm<>'REVISION_VERSION_CONFLICT' then raise; end if; end;
  insert into block_three_checks values('desativação concorrente exige nova simulação',true);
  update public.employment_bond_units set active=true where id='f3000000-0000-0000-0000-000000000402';
  plan:=public.prepare_request_revision(actor,req,'["2026-12-01"]');
  result:=public.commit_request_revision(actor,req,'["2026-12-01"]',days,plan->>'fingerprint','Reprogramação sintética autorizada'); replacement:=(result->>'id')::uuid;
  insert into block_three_checks select 'original cancelado sem apagar decisões',status='cancelada' and (select bool_and(status='programada') from public.request_unit_reviews where request_id=req) from public.vacation_requests where id=req;
  insert into block_three_checks select 'novo protocolo vinculado ao original',replaces_request_id=req and protocol<> 'TESTE-BLOCO03-ORIGINAL' and created_by=actor from public.vacation_requests where id=replacement;
  insert into block_three_checks select 'novo pedido aguarda todas as análises',count(*)=2 and bool_and(status='pendente' and scheduled_at is null) from public.request_unit_reviews where request_id=replacement;
  insert into block_three_checks select 'novo pedido tem distribuição diária exata',count(*)=2 from public.request_day_responsibilities where request_id=replacement;
  insert into block_three_checks select 'cancelamento compensatório estorna saldo',validated_minutes=600 from public.bond_time_bank_accounts where bond_id='f3000000-0000-0000-0000-000000000301';
  insert into block_three_checks select 'datas anteriores permanecem no histórico',start_date='2026-11-03' and end_date='2026-11-04' from public.request_periods where request_id=req;
  insert into block_three_checks select 'substituição auditada com autoria e snapshot',exists(select 1 from public.audit_events where entity_id=req and action='request_replaced' and actor_id=actor and jsonb_array_length(previous_value->'reviews')=2);
  insert into block_three_checks select 'servidor recebe aviso de nova análise',exists(select 1 from public.notifications where request_id=replacement and recipient_id='f3000000-0000-0000-0000-000000000002');
  begin perform public.manage_unit_request_review(actor,a,'schedule',null,3); raise exception 'EXPECTED_TERMINAL';
    exception when others then if sqlerrm<>'REVIEW_TRANSITION_INVALID' then raise; end if; end;
  insert into block_three_checks values('tela antiga não reativa original cancelado',true);
  begin perform public.commit_request_revision(actor,req,'["2026-12-01"]',days,plan->>'fingerprint','Repetição de confirmação'); raise exception 'EXPECTED_REPLAY';
    exception when others then if sqlerrm<>'REVISION_NOT_ALLOWED' then raise; end if; end;
  insert into block_three_checks values('repetição não cria segundo substituto',true);
  select id into a from public.request_unit_reviews where request_id=replacement and cnes_unit_id='f3000000-0000-0000-0000-000000000901';
  select id into b from public.request_unit_reviews where request_id=replacement and cnes_unit_id='f3000000-0000-0000-0000-000000000902';
  perform public.manage_unit_request_review(actor,a,'approve',null,1);
  perform public.manage_unit_request_review(actor,a,'schedule',null,2);
  perform public.manage_unit_request_review(actor,b,'reject','Justificativa sintética de recusa',1,'{"code":"other"}');
  insert into block_three_checks select 'recusa global retira confirmações e estorna novo débito',status='rejeitada' and (select validated_minutes=600 from public.bond_time_bank_accounts where bond_id=context_bond_id) from public.vacation_requests where id=replacement;
  perform public.set_unit_minimum_scale(actor,'f3000000-0000-0000-0000-000000000901',null,'2026-12-01',array['f3000000-0000-0000-0000-000000000401']::uuid[],0,null);
  insert into block_three_checks values('recusa global não deixa bloqueio fantasma na escala',true);
  insert into block_three_checks select 'todas as unidades recebem aviso de recusa global',exists(select 1 from public.notifications where request_id=replacement and context_cnes_unit_id='f3000000-0000-0000-0000-000000000901' and title='Solicitação atualizada');
  insert into block_three_checks select 'cliente não executa reprogramação privilegiada',not has_function_privilege('authenticated','public.commit_request_revision(uuid,uuid,jsonb,jsonb,text,text)','EXECUTE');
end $$;
select * from block_three_checks order by name;
do $$ begin if (select count(*) from block_three_checks)<>24 or exists(select 1 from block_three_checks where passed is distinct from true)
  then raise exception 'BLOCK_THREE_ASSERTIONS_FAILED'; end if; end $$;
ROLLBACK;
