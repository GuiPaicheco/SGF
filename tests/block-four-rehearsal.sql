-- Usa a fundação sintética do bloco 03; sempre executar com rollback.
do $$
declare actor uuid:='f3000000-0000-0000-0000-000000000001';
  cnes uuid:='f3000000-0000-0000-0000-000000000901';
  unit_id uuid:='f3000000-0000-0000-0000-000000000401';
  req uuid:='f3000000-0000-0000-0000-000000000501';
  review_id uuid; alert_id uuid:=gen_random_uuid(); event jsonb; saved jsonb;
begin
  perform public.set_unit_minimum_scale(actor,cnes,null,'2026-11-06',array[unit_id],0);
  insert into block_three_checks select 'escala nominal gravada por atuação',count(*)=1 from public.unit_minimum_scale_assignments a join public.unit_minimum_scale_days d on d.id=a.day_id where d.cnes_unit_id=cnes and d.scale_date='2026-11-06';
  perform public.set_unit_minimum_scale(actor,cnes,null,'2026-11-13','{}',0,'2026-11-06');
  insert into block_three_checks select 'dia vazio explícito conserva fonte do ciclo',version=1 and source_date='2026-11-06' and not exists(select 1 from public.unit_minimum_scale_assignments where day_id=d.id) from public.unit_minimum_scale_days d where cnes_unit_id=cnes and scale_date='2026-11-13';
  begin perform public.set_unit_minimum_scale(actor,cnes,null,'2026-11-06','{}',0); raise exception 'EXPECTED'; exception when others then if sqlerrm<>'SCALE_VERSION_CONFLICT' then raise; end if; end;
  insert into block_three_checks values('versão antiga não sobrescreve escala',true);
  begin perform public.set_unit_minimum_scale(actor,cnes,null,'2026-11-20','{}',0,'2026-11-12'); raise exception 'EXPECTED'; exception when others then if sqlerrm<>'SOURCE_DATE_INVALID' then raise; end if; end;
  insert into block_three_checks values('ciclo exige fonte existente',true);
  begin perform public.set_unit_minimum_scale(actor,cnes,null,'2026-11-20',array['f3000000-0000-0000-0000-000000000402'::uuid],0); raise exception 'EXPECTED'; exception when others then if sqlerrm<>'BOND_UNIT_OUT_OF_CONTEXT' then raise; end if; end;
  insert into block_three_checks values('escala não aceita atuação de outro CNES',true);
  update public.employment_bond_units set valid_until='2026-11-19' where id=unit_id;
  begin perform public.set_unit_minimum_scale(actor,cnes,null,'2026-11-20',array[unit_id],0); raise exception 'EXPECTED'; exception when others then if sqlerrm<>'BOND_UNIT_OUT_OF_CONTEXT' then raise; end if; end;
  update public.employment_bond_units set valid_until=null where id=unit_id;
  insert into block_three_checks values('escala respeita vigência',true);
  select id into review_id from public.request_unit_reviews where request_id=req and cnes_unit_id=cnes;
  perform public.manage_unit_request_review(actor,review_id,'approve',null,1);
  perform public.manage_unit_request_review(actor,review_id,'schedule',null,2);
  begin perform public.set_unit_minimum_scale(actor,cnes,null,'2026-11-03',array[unit_id],0); raise exception 'EXPECTED'; exception when others then if sqlerrm<>'CONFIRMED_ABSENCE_ON_SCALE' then raise; end if; end;
  insert into block_three_checks values('afastamento confirmado impede escala sem gravação parcial',not exists(select 1 from public.unit_minimum_scale_days where cnes_unit_id=cnes and scale_date='2026-11-03'));
  begin perform public.manage_manual_calendar_conflict(actor,alert_id,'create',cnes,null,unit_id,'2026-11-06','2026-11-06','',0); raise exception 'EXPECTED'; exception when others then if sqlerrm<>'CONFLICT_INPUT_INVALID' then raise; end if; end;
  insert into block_three_checks values('conflito exige justificativa',true);
  saved:=public.manage_manual_calendar_conflict(actor,alert_id,'create',cnes,null,unit_id,'2026-11-06','2026-11-06','Ensaio técnico de indisponibilidade',0);
  insert into block_three_checks values('conflito conserva autor e não recusa pedido',saved->>'created_by'=actor::text and (select status from public.vacation_requests where id=req)='em_analise');
  begin perform public.manage_manual_calendar_conflict(actor,alert_id,'create',cnes,null,unit_id,'2026-11-06','2026-11-06','Clique repetido',0); raise exception 'EXPECTED'; exception when others then if sqlerrm<>'CONFLICT_ALREADY_CREATED' then raise; end if; end;
  insert into block_three_checks values('clique repetido não duplica conflito',true);
  begin perform public.manage_manual_calendar_conflict(actor,alert_id,'resolve',null,null,null,null,null,'Tentativa desatualizada',0); raise exception 'EXPECTED'; exception when others then if sqlerrm<>'CONFLICT_VERSION_CONFLICT' then raise; end if; end;
  insert into block_three_checks values('encerramento exige versão atual',true);
  saved:=public.manage_manual_calendar_conflict(actor,alert_id,'resolve',null,null,null,null,null,'Conferência encerrada',1);
  insert into block_three_checks values('resolução preserva motivo autor e histórico',saved->>'status'='resolved' and saved->>'closed_by'=actor::text and saved->>'justification'='Ensaio técnico de indisponibilidade');
  insert into block_three_checks select 'escala e conflito têm auditoria',count(*)=4 from public.audit_events where actor_id=actor and action in ('unit_minimum_scale_updated','manual_conflict_create','manual_conflict_resolve');
  -- Colisão entre pedidos da mesma matrícula: manter datas originais para revisão.
  insert into public.vacation_requests(id,servidor_id,type,status,start_date,end_date,return_date,context_bond_id,protocol) values
    ('f3000000-0000-0000-0000-000000000601','f3000000-0000-0000-0000-000000000201','regulamentar','enviada','2026-12-01','2026-12-03','2026-12-04','f3000000-0000-0000-0000-000000000301','TESTE-BLOCO04-1'),
    ('f3000000-0000-0000-0000-000000000602','f3000000-0000-0000-0000-000000000201','regulamentar','enviada','2026-12-04','2026-12-04','2026-12-07','f3000000-0000-0000-0000-000000000301','TESTE-BLOCO04-2');
  insert into public.request_periods(request_id,sequence,start_date,end_date,return_date,days,counting_mode) values
    ('f3000000-0000-0000-0000-000000000601',1,'2026-12-01','2026-12-03','2026-12-04',3,'uteis'),
    ('f3000000-0000-0000-0000-000000000602',1,'2026-12-04','2026-12-04','2026-12-07',1,'uteis');
  event:=public.save_planning_calendar_event(actor,null,'2026-12-02','feriado','TESTE transacional Bloco 04',true,null);
  insert into block_three_checks select 'feriado detecta colisão com outro pedido da matrícula',calendar_adjustment_state='requires_review' and calendar_adjustment_reason='OTHER_REQUEST_OVERLAP' and end_date='2026-12-03' from public.vacation_requests where id='f3000000-0000-0000-0000-000000000601';
  insert into block_three_checks select 'colisão gera aviso ao titular',exists(select 1 from public.notifications where request_id='f3000000-0000-0000-0000-000000000601' and recipient_id='f3000000-0000-0000-0000-000000000002' and title='Calendário do pedido atualizado');
  insert into public.vacation_requests(id,servidor_id,type,status,start_date,end_date,return_date,context_bond_id,protocol) values
    ('f3000000-0000-0000-0000-000000000603','f3000000-0000-0000-0000-000000000201','regulamentar','enviada','2026-12-10','2026-12-14','2026-12-15','f3000000-0000-0000-0000-000000000301','TESTE-BLOCO04-PARCELAS');
  insert into public.request_periods(request_id,sequence,start_date,end_date,return_date,days,counting_mode) values
    ('f3000000-0000-0000-0000-000000000603',1,'2026-12-10','2026-12-11','2026-12-14',2,'uteis'),
    ('f3000000-0000-0000-0000-000000000603',2,'2026-12-14','2026-12-14','2026-12-15',1,'uteis');
  event:=public.save_planning_calendar_event(actor,null,'2026-12-11','feriado','TESTE transacional parcelas',true,null);
  insert into block_three_checks select 'parcelas sobrepostas exigem revisão e preservam datas',calendar_adjustment_state='requires_review' and calendar_adjustment_reason='PERIOD_OVERLAP' and end_date='2026-12-14' from public.vacation_requests where id='f3000000-0000-0000-0000-000000000603';
end $$;
select * from block_three_checks order by name;
do $$ begin if (select count(*) from block_three_checks)<>16 or exists(select 1 from block_three_checks where passed is distinct from true) then raise exception 'BLOCK_FOUR_ASSERTIONS_FAILED'; end if; end $$;
