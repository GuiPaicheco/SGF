-- Fundação RH sintética, exclusivamente BEGIN/ROLLBACK.
reset role;
insert into auth.sessions(id,user_id) values('f6000000-0000-0000-0000-000000000202','f6000000-0000-0000-0000-000000000001');
set local role service_role;
do $$
declare actor uuid:='f6000000-0000-0000-0000-000000000001';unit_id uuid:='f6000000-0000-0000-0000-000000000100';
 entry_id uuid:='f6000000-0000-0000-0000-000000000300';session_id uuid:='f6000000-0000-0000-0000-000000000200';
 admin_session uuid:='f6000000-0000-0000-0000-000000000202';profile uuid;bond uuid;grant_id uuid;data jsonb;preview jsonb;result jsonb;
 leave_id uuid;bank_before jsonb;count_before integer;resources jsonb;vacation jsonb;
begin
 select profile_id into profile from private.rh_unit_accounts where cnes_unit_id=unit_id;
 perform public.review_cnes_registry_entry(actor,entry_id,1,'{"registration":"RH-LEAVE-001","municipalPosition":"CARGO TESTE","admissionDate":"2020-01-01","employmentType":"efetivo","weeklyHours":32.5,"teamLabel":"EQUIPE TESTE"}',null);
 result:=public.rh_bind_registry_bond(actor,entry_id,2,null,0,true,'Ensaio fictício');bond:=(result->>'bond_id')::uuid;
 result:=public.rh_grant_operator(actor,unit_id,entry_id,true,0);grant_id:=(result->>'id')::uuid;
 perform public.rh_select_operator(profile,session_id,grant_id);
 select coalesce(jsonb_agg(to_jsonb(a) order by bond_id),'[]') into bank_before from public.bond_time_bank_accounts a;
 select count(*) into count_before from public.vacation_requests;
 resources:=public.rh_leave_resources(profile,session_id,null,entry_id);
 if resources->>'bond_id'<>bond::text then raise exception 'LEAVE_RESOURCES_FAILED';end if;
 data:='{"type":"banco_horas","startDate":"2027-03-01","days":2,"availableHours":8,"dailyHours":8,"birthDate":"1990-06-15","eligibilityConfirmed":true}';
 preview:=public.rh_preview_leave(profile,session_id,null,entry_id,data);
 if preview->'plan'->'bank'->>'missing_minutes'<>'480' or preview->'plan'->>'can_save'<>'false' then raise exception 'SHORTAGE_NOT_DETECTED';end if;
 begin
  perform public.rh_create_leave(profile,session_id,null,entry_id,data,'f7000000-0000-0000-0000-000000000001',preview->>'digest');raise exception 'SHORTAGE_AUTO_APPROVED';
 exception when others then if sqlerrm<>'RH_LEAVE_HOURS_INSUFFICIENT' then raise;end if;end;
 begin
  perform public.rh_preview_leave(profile,session_id,null,entry_id,data||'{"override":true}');raise exception 'OVERRIDE_WITHOUT_REASON';
 exception when others then if sqlerrm<>'RH_LEAVE_OVERRIDE_INVALID' then raise;end if;end;
 data:=data||'{"override":true,"overrideReason":"Exceção fictícia confirmada pelo RH"}';
 preview:=public.rh_preview_leave(profile,session_id,null,entry_id,data);
 result:=public.rh_create_leave(profile,session_id,null,entry_id,data,'f7000000-0000-0000-0000-000000000001',preview->>'digest');leave_id:=(result->>'id')::uuid;
 if result->>'status'<>'programada' then raise exception 'NOT_IMMEDIATELY_SCHEDULED';end if;
 result:=public.rh_create_leave(profile,session_id,null,entry_id,data,'f7000000-0000-0000-0000-000000000001',preview->>'digest');
 if result->>'replayed'<>'true' or (select count(*) from private.rh_leaves where bond_id=bond)<>1 then raise exception 'DUPLICATE_LEAVE';end if;
 begin
  perform public.rh_create_leave(profile,session_id,null,entry_id,data||'{"days":3}','f7000000-0000-0000-0000-000000000001',preview->>'digest');raise exception 'REUSED_KEY_WITH_DIFFERENT_DATA';
 exception when others then if sqlerrm<>'RH_LEAVE_IDEMPOTENCY_CONFLICT' then raise;end if;end;
 result:=public.rh_calendar_month(profile,session_id,null,'2027-03-01',0,'');
 if jsonb_array_length(result->'absences')<>1 or result->'absences'->0->>'origin'<>'rh' then raise exception 'NEW_LEAVE_MISSING_FROM_CALENDAR';end if;
 result:=public.rh_leave_detail(profile,session_id,null,leave_id);
 if result->>'operator_name'<>'OPERADOR FICTÍCIO' or result->'plan'->'bank'->>'declared_minutes'<>'480'
  or result->'snapshot'->>'cbo'<>'123456' or result->'snapshot'->>'weekly_hours'<>'32.5' then raise exception 'LEAVE_SNAPSHOT_MISSING';end if;
 begin
  perform public.rh_close_leave(profile,session_id,null,leave_id,1,'concluida','Conclusão prematura');raise exception 'FUTURE_LEAVE_CONCLUDED';
 exception when others then if sqlerrm<>'RH_LEAVE_NOT_ENDED' then raise;end if;end;
 perform public.rh_close_leave(profile,session_id,null,leave_id,1,'cancelada','Cancelamento fictício');
 begin
  perform public.rh_close_leave(profile,session_id,null,leave_id,1,'cancelada','Cancelamento repetido');raise exception 'STALE_CANCELLATION';
 exception when others then if sqlerrm<>'RH_VERSION_CONFLICT' then raise;end if;end;
 if jsonb_array_length(public.rh_calendar_month(profile,session_id,null,'2027-03-01',0,'')->'absences')<>0 then raise exception 'CANCELLED_REMAINS_IN_CALENDAR';end if;
 data:='{"type":"banco_horas","startDate":"2027-03-01","days":2,"availableHours":15,"dailyHours":7.5,"birthDate":"1990-06-15","eligibilityConfirmed":true}';
 preview:=public.rh_preview_leave(profile,session_id,null,entry_id,data);
 if preview->'plan'->'bank'->>'required_minutes'<>'900' or preview->'plan'->>'can_save'<>'true' then raise exception 'FRACTIONAL_HOURS_FAILED';end if;
 perform public.rh_create_leave(profile,session_id,null,entry_id,data,'f7000000-0000-0000-0000-000000000002',preview->>'digest');
 begin
  perform public.rh_create_leave(profile,session_id,null,entry_id,data,'f7000000-0000-0000-0000-000000000003',preview->>'digest');raise exception 'OVERLAP_ALLOWED';
 exception when others then if sqlerrm<>'RH_LEAVE_OVERLAP' then raise;end if;end;
 vacation:='{"type":"regulamentar","startDate":"2027-05-03","acquisitionEnd":"2026-12-31","unjustifiedAbsences":"no","split":"15-10","secondStartDate":"2027-07-05","birthDate":"1990-06-15","eligibilityConfirmed":true}';
 preview:=public.rh_preview_leave(profile,session_id,null,entry_id,vacation);
 if preview->'plan'->>'days'<>'25' or jsonb_array_length(preview->'plan'->'periods')<>2 then raise exception 'REGULAR_SPLIT_CHANGED';end if;
 perform public.rh_create_leave(profile,session_id,null,entry_id,vacation,'f7000000-0000-0000-0000-000000000004',preview->>'digest');
 vacation:=vacation||'{"startDate":"2027-09-01","split":"none"}';preview:=public.rh_preview_leave(profile,session_id,null,entry_id,vacation);
 begin
  perform public.rh_create_leave(profile,session_id,null,entry_id,vacation,'f7000000-0000-0000-0000-000000000005',preview->>'digest');raise exception 'DUPLICATE_CYCLE';
 exception when others then if sqlerrm<>'RH_LEAVE_CYCLE_IN_USE' then raise;end if;end;
 vacation:=vacation||'{"acquisitionEnd":"2024-12-31","startDate":"2025-02-03"}';
 preview:=public.rh_preview_leave(profile,session_id,null,entry_id,vacation);
 if preview->'plan'->>'days'<>'30' or preview->'plan'->>'counting_mode'<>'corridos' then raise exception 'OLD_REGULAR_RULE_CHANGED';end if;
 vacation:=vacation||'{"type":"premio","days":60}';preview:=public.rh_preview_leave(profile,session_id,null,entry_id,vacation);
 if preview->'plan'->>'days'<>'60' or preview->'plan'->>'counting_mode'<>'corridos' then raise exception 'PRIZE_RULE_CHANGED';end if;
 if (select coalesce(jsonb_agg(to_jsonb(a) order by bond_id),'[]') from public.bond_time_bank_accounts a)<>bank_before
  or (select count(*) from public.vacation_requests)<>count_before then raise exception 'LEGACY_BANK_OR_REQUEST_MUTATED';end if;
 if not exists(select 1 from public.audit_events where entity_id=leave_id and action='rh_leave_programmed'
  and new_value->>'operator_name'='OPERADOR FICTÍCIO' and new_value->'bank'->>'override'='true') then raise exception 'OVERRIDE_AUDIT_MISSING';end if;
 data:=data||'{"startDate":"2027-10-04"}';preview:=public.rh_preview_leave(profile,session_id,null,entry_id,data);
 perform public.rh_clear_operator(profile,session_id);
 begin
  perform public.rh_create_leave(profile,session_id,null,entry_id,data,'f7000000-0000-0000-0000-000000000006',preview->>'digest');raise exception 'NO_OPERATOR_SAVED';
 exception when others then if sqlerrm<>'RH_LEAVE_OPERATOR_REQUIRED' and sqlerrm<>'RH_OPERATOR_REQUIRED' then raise;end if;end;
 perform public.rh_select_operator(profile,session_id,grant_id);
 update private.cnes_registry_entries set version=version+1,review_status='pending' where id=entry_id;
 result:=public.rh_leave_detail(profile,session_id,null,leave_id);
 if result->'snapshot'->>'position'<>'CARGO TESTE' then raise exception 'HISTORICAL_SNAPSHOT_CHANGED';end if;
 begin
  perform public.rh_create_leave(profile,session_id,null,entry_id,data,'f7000000-0000-0000-0000-000000000006',preview->>'digest');raise exception 'STALE_REGISTRY_SAVED';
 exception when others then if sqlerrm<>'RH_ENTRY_REVIEW_REQUIRED' then raise;end if;end;
 result:=public.rh_leave_detail(actor,admin_session,unit_id,leave_id);
 if result->>'id'<>leave_id::text then raise exception 'ADMIN_DETAIL_FAILED';end if;
 begin
  perform public.rh_leave_detail(actor,admin_session,'f6000000-0000-0000-0000-000000000102',leave_id);raise exception 'OTHER_UNIT_DETAIL_ALLOWED';
 exception when others then if sqlerrm<>'RH_LEAVE_NOT_FOUND' then raise;end if;end;
 if has_table_privilege('authenticated','private.rh_leaves','select')
  or has_function_privilege('authenticated','private.rh_lock_auth_session(uuid,uuid)','execute') then raise exception 'DIRECT_LEAVE_API_ALLOWED';end if;
end $$;
reset role;
select 'RH leaves: programação, horas declaradas/exceção, repetição, fracionamento, cancelamento, histórico e isolamento aprovados' result;
