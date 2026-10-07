-- Usar fixtures iniciais do ensaio de acesso, após calendar_planning.sql, com rollback.
update public.vacation_requests set status='enviada' where id::text like 'f0000000%';
insert into public.request_periods(request_id,sequence,start_date,end_date,return_date,days,counting_mode)
select id,1,start_date,end_date,return_date,2,case when id='f0000000-0000-0000-0000-000000000502' then null else 'uteis' end
from public.vacation_requests where id::text like 'f0000000%';
select set_config('request.headers','{"x-sgf-role":"administrador","x-sgf-actor":"f0000000-0000-0000-0000-000000000001"}',true);
insert into public.request_day_responsibilities(request_id,responsibility_date,bond_unit_id,cnes_unit_id,lotacao_id,assigned_by)
select r.id,d.day,u.id,u.cnes_unit_id,u.internal_lotacao_id,'f0000000-0000-0000-0000-000000000002'::uuid
from public.vacation_requests r join public.employment_bond_units u on u.bond_id=r.context_bond_id
cross join (values ('2026-10-08'::date),('2026-10-09'::date)) d(day)
where r.id::text like 'f0000000%' and u.internal_lotacao_id=case when r.id='f0000000-0000-0000-0000-000000000502' then 'f0000000-0000-0000-0000-000000000102'::uuid else 'f0000000-0000-0000-0000-000000000101'::uuid end;
select set_config('request.headers','{"x-sgf-role":"administrador","x-sgf-actor":"f0000000-0000-0000-0000-000000000001"}',true);
grant insert,select on access_checks to service_role;
set local role service_role;
do $$
declare actor uuid:='f0000000-0000-0000-0000-000000000001'; saved jsonb; saved2 jsonb; expected jsonb; r record;
  review_id uuid; editor jsonb; unit_id uuid; version_before integer; notices integer; next_day date;
begin
  saved:=public.save_planning_calendar_event(actor,null,'2026-10-08','feriado','Feriado fixture transacional',true,null);
  expected:=private.calculate_preserved_period('2026-10-08',2,'uteis',null,(select array_agg(event_date) from public.calendar_events where active));
  select * into r from public.vacation_requests where id='f0000000-0000-0000-0000-000000000503';
  insert into access_checks values('holiday preserves start and business day quantity',r.start_date='2026-10-08' and r.end_date=(expected->>'end_date')::date);
  insert into access_checks values('holiday updates return date',r.return_date=(expected->>'return_date')::date);
  insert into access_checks select 'holiday preserves period entitlement',days=2 and counting_mode='uteis' from public.request_periods where request_id=r.id;
  insert into access_checks values('single unit receives added day',r.calendar_adjustment_state='clear');
  insert into access_checks select 'holiday removed from responsibilities',not exists(select 1 from public.request_day_responsibilities where request_id=r.id and responsibility_date='2026-10-08');
  insert into access_checks select 'legacy counting requires explicit review',calendar_adjustment_state='requires_review' and end_date='2026-10-09' from public.vacation_requests where id='f0000000-0000-0000-0000-000000000502';
  select * into r from public.vacation_requests where id='f0000000-0000-0000-0000-000000000501';
  insert into access_checks values('multiple units do not infer added day',r.calendar_adjustment_state='pending_distribution' and cardinality(r.calendar_pending_dates)=1);
  select id into review_id from public.request_unit_reviews where request_id=r.id;
  begin
    perform public.manage_unit_request_review(actor,review_id,'approve',null,2);
    raise exception 'EXPECTED_PENDING_CALENDAR';
  exception when others then
    if sqlerrm<>'CALENDAR_REVIEW_REQUIRED' then raise; end if;
    insert into access_checks values('pending dates block approval',true);
  end;
  editor:=public.pending_distribution_editor(actor,r.id);
  insert into access_checks values('pending date editor lists eligible units',(editor->>'editable')::boolean and jsonb_array_length(editor->'days'->0->'candidates')=2);
  next_day:=r.calendar_pending_dates[1];
  select id into unit_id from private.eligible_day_units(r.context_bond_id,next_day) where internal_lotacao_id='f0000000-0000-0000-0000-000000000101';
  perform public.change_pending_day_responsibility(actor,r.id,next_day,unit_id,r.distribution_version,'Responsável conferido para este dia');
  insert into access_checks select 'explicit pending assignment clears warning',calendar_adjustment_state='clear' and cardinality(calendar_pending_dates)=0 from public.vacation_requests where id=r.id;
  insert into access_checks select 'calendar adjustment and assignment audited',count(*)>=2 from public.audit_events where entity_id=r.id and action in ('calendar_request_reconciled','calendar_pending_day_assigned');
  insert into access_checks select 'employee receives recalculation notification',exists(select 1 from public.notifications where request_id=r.id and recipient_id='f0000000-0000-0000-0000-000000000002' and title='Calendário do pedido atualizado');
  select count(*) into notices from public.notifications where request_id=r.id;
  saved2:=public.save_planning_calendar_event(actor,(saved->>'id')::uuid,'2026-10-08','feriado','Feriado fixture transacional',true,1);
  insert into access_checks values('saving identical calendar is idempotent',(saved2->>'version')::integer=1);
  insert into access_checks select 'identical save does not duplicate notices',count(*)=notices from public.notifications where request_id=r.id;
  saved2:=public.save_planning_calendar_event(actor,(saved->>'id')::uuid,'2026-10-08','feriado','Feriado fixture transacional',false,1);
  insert into access_checks select 'holiday removal shortens period preserving start',start_date='2026-10-08' and end_date='2026-10-09' from public.vacation_requests where id='f0000000-0000-0000-0000-000000000503';
  begin
    perform public.save_planning_calendar_event(actor,(saved->>'id')::uuid,'2026-10-08','feriado','Tentativa desatualizada',true,1);
    raise exception 'EXPECTED_STALE_CALENDAR';
  exception when others then
    if sqlerrm<>'CALENDAR_VERSION_CONFLICT' then raise; end if;
    insert into access_checks values('calendar edit rejects stale version',true);
  end;
end $$;
reset role;
select * from access_checks order by name;
do $$ begin
  if (select count(*) from access_checks)<>16 or exists(select 1 from access_checks where passed is distinct from true) then raise exception 'CALENDAR_ASSERTIONS_FAILED'; end if;
end $$;
