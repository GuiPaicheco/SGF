-- Executar com fixtures iniciais de access-rls-rehearsal.sql e BEGIN/ROLLBACK.
-- Não é migration nem seed: todos os registros devem ser revertidos.
grant insert,select on access_checks to service_role;
insert into public.request_unit_reviews(request_id,cnes_unit_id,lotacao_id)
values ('f0000000-0000-0000-0000-000000000501','f0000000-0000-0000-0000-000000000901','f0000000-0000-0000-0000-000000000102');
select set_config('request.jwt.claim.sub','f0000000-0000-0000-0000-000000000001',true);
select set_config('request.headers','{"x-sgf-role":"rh","x-sgf-cnes":"f0000000-0000-0000-0000-000000000901","x-sgf-lotacao":"f0000000-0000-0000-0000-000000000101"}',true);
set local role service_role;
do $$
declare
  actor uuid := 'f0000000-0000-0000-0000-000000000001';
  review_a uuid;
  review_b uuid;
  review_reject uuid;
  result jsonb;
  notices integer;
begin
  select id into strict review_a from public.request_unit_reviews
    where request_id='f0000000-0000-0000-0000-000000000501' and lotacao_id='f0000000-0000-0000-0000-000000000101';
  select id into strict review_b from public.request_unit_reviews
    where request_id='f0000000-0000-0000-0000-000000000501' and lotacao_id='f0000000-0000-0000-0000-000000000102';
  select id into strict review_reject from public.request_unit_reviews
    where request_id='f0000000-0000-0000-0000-000000000503';
  begin
    perform public.manage_unit_request_review(actor,review_a,'schedule',null,1);
    raise exception 'TEST_EXPECTED_APPROVAL_REQUIRED';
  exception when invalid_parameter_value then
    insert into access_checks values ('calendar requires prior approval',sqlerrm='APPROVAL_REQUIRED');
  end;
  begin
    perform public.manage_unit_request_review(actor,review_b,'approve',null,1);
    raise exception 'TEST_EXPECTED_SCOPE_DENIAL';
  exception when insufficient_privilege then
    insert into access_checks values ('RH cannot decide another directorate',sqlerrm='REQUEST_OUT_OF_SCOPE');
  end;
  result := public.manage_unit_request_review(actor,review_a,'approve',null,1);
  insert into access_checks values ('approval does not schedule',result->>'review_status'='aprovada');
  insert into access_checks values ('other pending unit keeps aggregate under review',result->>'request_status'='em_analise');
  insert into access_checks select 'approval preserves separate calendar action',scheduled_by is null and decided_by=actor and version=2
    from public.request_unit_reviews where id=review_a;
  select count(*) into notices from public.notifications where request_id='f0000000-0000-0000-0000-000000000501';
  begin
    perform public.manage_unit_request_review(actor,review_a,'schedule',null,1);
    raise exception 'TEST_EXPECTED_STALE_VERSION';
  exception when raise_exception then
    insert into access_checks values ('stale version rejected',sqlerrm='REVIEW_VERSION_CONFLICT');
  end;
  insert into access_checks select 'stale action produces no notification',count(*)=notices from public.notifications
    where request_id='f0000000-0000-0000-0000-000000000501';
  result := public.manage_unit_request_review(actor,review_a,'schedule',null,2);
  insert into access_checks values ('explicit calendar action schedules unit',result->>'review_status'='programada');
  insert into access_checks select 'calendar author and version recorded',scheduled_by=actor and scheduled_at is not null and version=3
    from public.request_unit_reviews where id=review_a;
  perform set_config('request.headers','{"x-sgf-role":"administrador"}',true);
  result := public.manage_unit_request_review(actor,review_b,'approve',null,1);
  insert into access_checks values ('all approved aggregate not yet scheduled',result->>'request_status'='aprovada');
  result := public.manage_unit_request_review(actor,review_b,'schedule',null,2);
  insert into access_checks values ('all units scheduled aggregate scheduled',result->>'request_status'='programada');
  begin
    perform public.manage_unit_request_review(actor,review_reject,'reject','',1,'{"code":"other"}');
    raise exception 'TEST_EXPECTED_REASON';
  exception when invalid_parameter_value then
    insert into access_checks values ('rejection requires justification',sqlerrm='REJECTION_REASON_REQUIRED');
  end;
  begin
    perform public.manage_unit_request_review(actor,review_reject,'reject','Saldo insuficiente',1,
      '{"code":"insufficient_time_bank","available_hours":8,"required_hours":4}');
    raise exception 'TEST_EXPECTED_INVALID_BALANCE';
  exception when invalid_parameter_value then
    insert into access_checks values ('bank rejection rejects inconsistent hours',sqlerrm='REJECTION_DATA_INVALID');
  end;
  result := public.manage_unit_request_review(actor,review_reject,'reject','Saldo conferido pelo RH',1,
    '{"code":"insufficient_time_bank","available_hours":4,"required_hours":8}');
  insert into access_checks values ('structured rejection changes aggregate',result->>'request_status'='rejeitada');
  insert into access_checks select 'rejection preserves reason label and hours',rejection_code='insufficient_time_bank'
    and rejection_label='Banco de Horas Insuficiente' and rejection_data->>'available_hours'='4' and decided_by=actor
    from public.request_unit_reviews where id=review_reject;
  insert into access_checks select 'decisions audited with actor and CNES',count(*)=5 and bool_and(actor_id=actor and context_cnes_unit_id is not null)
    from public.audit_events where entity_id in (review_a,review_b,review_reject)
      and action in ('request_unit_approved','request_unit_scheduled','request_unit_rejected');
  insert into access_checks select 'employee receives unit decision notice',exists(select 1 from public.notifications
    where request_id='f0000000-0000-0000-0000-000000000503' and recipient_id='f0000000-0000-0000-0000-000000000002'
      and recipient_role='servidor' and message like '%Saldo conferido pelo RH%');
end $$;
reset role;
select * from access_checks order by name;
do $$ begin
  if (select count(*) from access_checks)<>17 or exists(select 1 from access_checks where passed is distinct from true)
    then raise exception 'UNIT_WORKFLOW_ASSERTION_FAILED'; end if;
end $$;
