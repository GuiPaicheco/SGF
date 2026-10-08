-- Acrescentar às fixtures iniciais do ensaio do bloco 03 e executar com rollback.
insert into public.vacation_requests(id,servidor_id,type,status,start_date,end_date,return_date,protocol,notes)
values('f3000000-0000-0000-0000-000000000601','f3000000-0000-0000-0000-000000000201','regulamentar','enviada','2027-02-01','2027-02-02','2027-02-03','TESTE-BLOCO03-LEGADO','Ensaio técnico legado');
insert into public.request_periods(request_id,sequence,start_date,end_date,return_date,days,counting_mode)
values('f3000000-0000-0000-0000-000000000601',1,'2027-02-01','2027-02-02','2027-02-03',2,'uteis');
insert into public.request_approvals(request_id,stage,decision)
values('f3000000-0000-0000-0000-000000000601','chefia_imediata','pendente'),('f3000000-0000-0000-0000-000000000601','rh','pendente') on conflict do nothing;
update public.servidores set lotacao_id='f3000000-0000-0000-0000-000000000101' where id='f3000000-0000-0000-0000-000000000201';
do $$
declare actor uuid:='f3000000-0000-0000-0000-000000000001'; owner_id uuid:='f3000000-0000-0000-0000-000000000002';
  req uuid:='f3000000-0000-0000-0000-000000000601'; v integer;
begin
  perform public.manage_request_operation(actor,req,'devolver','Conferir dados funcionais de teste');
  insert into block_three_checks select 'legado devolvido com justificativa',status='devolvida' from public.vacation_requests where id=req;
  perform set_config('request.headers','{"x-sgf-role":"servidor","x-sgf-actor":"f3000000-0000-0000-0000-000000000002","x-sgf-bond":"f3000000-0000-0000-0000-000000000301","x-sgf-cnes":"f3000000-0000-0000-0000-000000000901"}',true);
  perform public.manage_request_operation(owner_id,req,'reenviar','Dados conferidos pelo titular de teste');
  insert into block_three_checks select 'titular reenvia legado sem análise aprovada',status='enviada' and not exists(select 1 from public.request_approvals where request_id=req and decision<>'pendente') from public.vacation_requests where id=req;
  perform set_config('request.headers','{"x-sgf-role":"administrador","x-sgf-actor":"f3000000-0000-0000-0000-000000000001"}',true);
  select version into v from public.request_approvals where request_id=req and stage='rh';
  begin perform public.manage_legacy_request_approval(actor,req,'rh','aprovada',null,v,null); raise exception 'EXPECTED_MANAGER_REQUIRED';
    exception when others then if sqlerrm<>'MANAGER_APPROVAL_REQUIRED' then raise; end if; end;
  insert into block_three_checks values('legado exige chefia antes do RH',true);
  select version into v from public.request_approvals where request_id=req and stage='chefia_imediata';
  perform public.manage_legacy_request_approval(actor,req,'chefia_imediata','aprovada',null,v,null);
  begin perform public.manage_legacy_request_approval(actor,req,'chefia_imediata','aprovada',null,v,null); raise exception 'EXPECTED_STALE_LEGACY';
    exception when others then if sqlerrm not in ('REVIEW_VERSION_CONFLICT','STAGE_ALREADY_DECIDED') then raise; end if; end;
  insert into block_three_checks values('legado bloqueia decisão repetida',true);
  select version into v from public.request_approvals where request_id=req and stage='rh';
  perform public.manage_legacy_request_approval(actor,req,'rh','aprovada',null,v,null);
  insert into block_three_checks select 'aprovação legada não confirma calendário',status='aprovada' from public.vacation_requests where id=req;
  perform public.manage_request_operation(actor,req,'programar',null);
  insert into block_three_checks select 'legado entra no calendário explicitamente',status='programada' from public.vacation_requests where id=req;
  perform public.manage_request_operation(actor,req,'cancelar','Encerramento compensatório sintético');
  insert into block_three_checks select 'legado preserva decisões após cancelamento',status='cancelada' and (select count(*)=2 from public.request_approvals where request_id=req and decision='aprovada') from public.vacation_requests where id=req;
  begin perform public.manage_request_operation(actor,'f3000000-0000-0000-0000-000000000501','devolver','Não misturar modelos'); raise exception 'EXPECTED_MODERN_BLOCK';
    exception when others then if sqlerrm<>'CONTEXTUAL_OPERATION_REQUIRED' then raise; end if; end;
  insert into block_three_checks values('pedido moderno rejeita operação legada',true);
  begin perform public.manage_legacy_request_approval(actor,'f3000000-0000-0000-0000-000000000501','chefia_imediata','aprovada',null,1,null); raise exception 'EXPECTED_MODERN_DECISION_BLOCK';
    exception when others then if sqlerrm<>'UNIT_REVIEW_REQUIRED' then raise; end if; end;
  insert into block_three_checks values('pedido moderno rejeita aprovação legada',true);
end $$;
select * from block_three_checks order by name;
do $$ begin if (select count(*) from block_three_checks)<>9 or exists(select 1 from block_three_checks where passed is distinct from true) then raise exception 'LEGACY_CYCLE_FAILED'; end if; end $$;
