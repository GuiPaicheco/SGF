-- Executar após scoped-holidays-rehearsal.sql, na mesma transação BEGIN/ROLLBACK.
reset role;
insert into auth.sessions(id,user_id) values('f6000000-0000-0000-0000-000000000202','f6000000-0000-0000-0000-000000000001');
set local role service_role;
do $$
declare actor uuid:='f6000000-0000-0000-0000-000000000001';
 unit_id uuid:='f6000000-0000-0000-0000-000000000100';
 item jsonb;preview jsonb;result jsonb;before_events bigint;before_audit bigint;entry private.rh_leaves%rowtype;profile uuid;
begin
 item:=jsonb_build_object('event_date','2028-02-29','type','feriado','name','TESTE SINTÉTICO — PRÉVIA',
 'scope','units','unit_ids',jsonb_build_array(unit_id),'jurisdiction','institucional','source_url','https://example.invalid/synthetic-holiday');
 select count(*) into before_events from public.calendar_events;
 select count(*) into before_audit from public.audit_events;
 preview:=public.preview_scoped_calendar_event(actor,'save',null,null,item||'{"action":"calendar-preview","operation":"save"}');
 if (select count(*) from public.calendar_events)<>before_events or (select count(*) from public.audit_events)<>before_audit then raise exception 'PREVIEW_WROTE_DATA';end if;
 begin
  perform public.manage_scoped_calendar_event(actor,'save',null,null,item);
  raise exception 'MISSING_PREVIEW_ALLOWED';
 exception when others then if sqlerrm<>'CALENDAR_PREVIEW_CHANGED' then raise;end if;end;
 begin
  perform public.manage_scoped_calendar_event(actor,'save',null,null,item||jsonb_build_object('name','CHANGED','preview_digest',preview->>'digest'));
  raise exception 'CHANGED_PAYLOAD_ALLOWED';
 exception when others then if sqlerrm<>'CALENDAR_PREVIEW_CHANGED' then raise;end if;end;
 result:=public.manage_scoped_calendar_event(actor,'save',null,null,item||jsonb_build_object('action','calendar-save','preview_digest',preview->>'digest'));
 if not exists(select 1 from public.calendar_events where id=(result->>'id')::uuid and jurisdiction='institucional' and source_url=item->>'source_url') then raise exception 'CLASSIFICATION_SOURCE_LOST';end if;
 begin
  perform public.manage_scoped_calendar_event(actor,'save',null,null,item||jsonb_build_object('preview_digest',preview->>'digest'));
  raise exception 'STALE_PREVIEW_ALLOWED';
 exception when others then if sqlerrm<>'CALENDAR_PREVIEW_CHANGED' then raise;end if;end;
 begin
  perform public.preview_scoped_calendar_event(actor,'save',null,null,item||'{"jurisdiction":"nao_informada"}');
  raise exception 'UNCLASSIFIED_NEW_ALLOWED';
 exception when others then if sqlerrm<>'CALENDAR_INPUT_INVALID' then raise;end if;end;
 -- Dados sintéticos: simula um período iniciado sem modificar registros existentes.
 select * into entry from private.rh_leaves where entry_id='f6000000-0000-0000-0000-000000000300' limit 1;
 if entry.id is null then raise exception 'MISSING_FIXTURE';end if;
 update private.rh_leaves set plan=jsonb_set(plan,'{periods}',jsonb_build_array(
 jsonb_build_object('sequence',1,'start_date',current_date-2,'end_date',current_date+30,'return_date',current_date+31,'days',25,'counting_mode','uteis')))
 where id=entry.id;
 select profile_id into profile from private.rh_unit_accounts where cnes_unit_id=unit_id;
 begin
  perform public.rh_close_leave(profile,'f6000000-0000-0000-0000-000000000200',null,entry.id,entry.version,'cancelada','Teste de bloqueio');
  raise exception 'STARTED_CANCEL_ALLOWED';
 exception when others then if sqlerrm<>'RH_LEAVE_STARTED_REVIEW_REQUIRED' then raise;end if;end;
 begin
  perform public.rh_preview_leave_revision(profile,'f6000000-0000-0000-0000-000000000200',null,entry.id,entry.version,'{}');
  raise exception 'STARTED_REVISION_ALLOWED';
 exception when others then if sqlerrm<>'RH_LEAVE_STARTED_REVIEW_REQUIRED' then raise;end if;end;
 begin
  perform public.preview_scoped_calendar_event(actor,'save',null,null,item||jsonb_build_object('event_date',current_date+5));
  raise exception 'STARTED_CALENDAR_REWRITE_ALLOWED';
 exception when others then if sqlerrm<>'RH_CALENDAR_STARTED_REVIEW_REQUIRED' then raise;end if;end;
 update private.rh_leaves set plan=jsonb_set(plan,'{periods,0,end_date}',to_jsonb((current_date-1)::text)) where id=entry.id;
 result:=public.rh_reconciliation_report(actor,'f6000000-0000-0000-0000-000000000202',unit_id,0);
 if not exists(select 1 from jsonb_array_elements(result->'items') r where r->>'id'=entry.id::text and r->'issues' ? 'past_programmed') then raise exception 'PAST_NOT_FLAGGED';end if;
 result:=public.rh_reconciliation_report(actor,'f6000000-0000-0000-0000-000000000202','f6000000-0000-0000-0000-000000000102',0);
 if (result->>'total_records')::integer<>0 then raise exception 'RECONCILIATION_SCOPE_LEAK';end if;
 begin
  perform public.rh_reconciliation_report(profile,'f6000000-0000-0000-0000-000000000200','f6000000-0000-0000-0000-000000000102',0);
  raise exception 'OTHER_UNIT_ALLOWED';
 exception when others then if sqlerrm<>'RH_BOND_OUT_OF_UNIT' then raise;end if;end;
 begin
  perform public.rh_reconciliation_report(profile,'f6000000-0000-0000-0000-000000000299',null,0);
  raise exception 'INVALID_SESSION_ALLOWED';
 exception when others then if sqlerrm<>'RH_SESSION_INVALID' then raise;end if;end;
 perform public.rh_grant_operator(actor,unit_id,'f6000000-0000-0000-0000-000000000300',false,(select version from private.rh_operator_grants where entry_id='f6000000-0000-0000-0000-000000000300'));
 begin
  perform public.rh_reconciliation_report(profile,'f6000000-0000-0000-0000-000000000200',null,0);
  raise exception 'REVOKED_OPERATOR_ALLOWED';
 exception when others then if sqlerrm<>'RH_OPERATOR_REQUIRED' then raise;end if;end;
 if has_function_privilege('anon','public.preview_scoped_calendar_event(uuid,text,uuid,integer,jsonb)','execute')
 or has_function_privilege('authenticated','private.perform_calendar_event_change(uuid,text,uuid,integer,jsonb)','execute') then raise exception 'PUBLIC_WRITE';end if;
end $$;
reset role;
select 'Prévia sem escrita, digest, fonte, classificação, fases temporais e grants: OK' as result;
