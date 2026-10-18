reset role;
insert into auth.sessions(id,user_id) values('f6000000-0000-0000-0000-000000000202','f6000000-0000-0000-0000-000000000001');
set local role service_role;
do $$
declare actor uuid:='f6000000-0000-0000-0000-000000000001';unit_id uuid:='f6000000-0000-0000-0000-000000000100';
 entry_id uuid:='f6000000-0000-0000-0000-000000000300';session_id uuid:='f6000000-0000-0000-0000-000000000200';
 admin_session uuid:='f6000000-0000-0000-0000-000000000202';profile uuid;bond uuid;grant_id uuid;data jsonb;preview jsonb;result jsonb;
 leave_id uuid;other_id uuid;regular_id uuid;before_banks jsonb;before_legacy integer;old_snapshot jsonb;
begin
 select profile_id into profile from private.rh_unit_accounts where cnes_unit_id=unit_id;
 perform public.review_cnes_registry_entry(actor,entry_id,1,'{"registration":"RH-REVISION-001","municipalPosition":"CARGO TESTE","admissionDate":"2020-01-01","employmentType":"efetivo","weeklyHours":32.5,"teamLabel":"EQUIPE TESTE"}',null);
 result:=public.rh_bind_registry_bond(actor,entry_id,2,null,0,true,'Ensaio fictício');bond:=(result->>'bond_id')::uuid;
 result:=public.rh_grant_operator(actor,unit_id,entry_id,true,0);grant_id:=(result->>'id')::uuid;
 perform public.rh_select_operator(profile,session_id,grant_id);
 select coalesce(jsonb_agg(to_jsonb(a) order by bond_id),'[]') into before_banks from public.bond_time_bank_accounts a;
 select count(*) into before_legacy from public.vacation_requests;
 data:='{"type":"banco_horas","startDate":"2027-03-01","days":2,"availableHours":16,"dailyHours":8,"birthDate":"1990-06-15","eligibilityConfirmed":true}';
 preview:=public.rh_preview_leave(profile,session_id,null,entry_id,data);
 result:=public.rh_create_leave(profile,session_id,null,entry_id,data,'f8000000-0000-0000-0000-000000000001',preview->>'digest');leave_id:=(result->>'id')::uuid;
 old_snapshot:=public.rh_leave_detail(profile,session_id,null,leave_id)->'snapshot';
 data:=data||'{"startDate":"2027-03-08","availableHours":0}';
 preview:=public.rh_preview_leave_revision(profile,session_id,null,leave_id,1,data);
 begin
  perform public.rh_revise_leave(profile,session_id,null,leave_id,1,data,'f8000000-0000-0000-0000-000000000002',preview->>'digest','Mudança fictícia');raise exception 'REVISION_SHORTAGE_APPROVED';
 exception when others then if sqlerrm<>'RH_LEAVE_HOURS_INSUFFICIENT' then raise;end if;end;
 data:=data||'{"override":true,"overrideReason":"Exceção fictícia reconferida"}';
 preview:=public.rh_preview_leave_revision(profile,session_id,null,leave_id,1,data);
 begin
  perform public.rh_revise_leave(profile,session_id,null,leave_id,1,data,'f8000000-0000-0000-0000-000000000002',preview->>'digest','');raise exception 'REVISION_NO_REASON';
 exception when others then if sqlerrm<>'RH_LEAVE_INPUT_INVALID' then raise;end if;end;
 result:=public.rh_revise_leave(profile,session_id,null,leave_id,1,data,'f8000000-0000-0000-0000-000000000002',preview->>'digest','Mudança fictícia');
 if result->>'id'<>leave_id::text or result->>'version'<>'2' then raise exception 'REVISION_NOT_SAME_RECORD';end if;
 result:=public.rh_revise_leave(profile,session_id,null,leave_id,1,data,'f8000000-0000-0000-0000-000000000002',preview->>'digest','Mudança fictícia');
 if result->>'replayed'<>'true' then raise exception 'REVISION_REPLAY_FAILED';end if;
 begin
  perform public.rh_revise_leave(profile,session_id,null,leave_id,1,data,'f8000000-0000-0000-0000-000000000002',preview->>'digest','Motivo diferente');raise exception 'REVISION_KEY_REUSED';
 exception when others then if sqlerrm<>'RH_LEAVE_IDEMPOTENCY_CONFLICT' then raise;end if;end;
 begin
  perform public.rh_preview_leave_revision(profile,session_id,null,leave_id,1,data);raise exception 'STALE_REVISION_ACCEPTED';
 exception when others then if sqlerrm<>'RH_VERSION_CONFLICT' then raise;end if;end;
 result:=public.rh_leave_detail(profile,session_id,null,leave_id);
 if jsonb_array_length(result->'revisions')<>1 or result->'revisions'->0->'snapshot'<>old_snapshot
  or result->'revisions'->0->'plan'->'periods'->0->>'start_date'<>'2027-03-01'
  or result->'plan'->'periods'->0->>'start_date'<>'2027-03-08'
  or result->'history'->-1->>'action'<>'rh_leave_revised' then raise exception 'PREVIOUS_DOCUMENT_LOST';end if;
 result:=public.rh_calendar_month(profile,session_id,null,'2027-03-01',0,'');
 if jsonb_array_length(result->'absences')<>1 or result->'absences'->0->>'start_date'<>'2027-03-08' then raise exception 'CALENDAR_REVISION_WRONG';end if;
 -- Outro afastamento continua impedindo a reprogramação para as mesmas datas.
 data:=data||'{"startDate":"2027-03-15","availableHours":16,"override":false}';
 preview:=public.rh_preview_leave(profile,session_id,null,entry_id,data);
 result:=public.rh_create_leave(profile,session_id,null,entry_id,data,'f8000000-0000-0000-0000-000000000003',preview->>'digest');other_id:=(result->>'id')::uuid;
 preview:=public.rh_preview_leave_revision(profile,session_id,null,leave_id,2,data);
 begin
  perform public.rh_revise_leave(profile,session_id,null,leave_id,2,data,'f8000000-0000-0000-0000-000000000004',preview->>'digest','Conflito fictício');raise exception 'REVISION_OVERLAP_ALLOWED';
 exception when others then if sqlerrm<>'RH_LEAVE_OVERLAP' then raise;end if;end;
 -- Reprogramar férias do próprio ciclo não deve conflitar consigo mesmo.
 insert into public.vacation_rights(id,servidor_id,bond_id,type,acquisition_start,acquisition_end,available_days)
 values('f8000000-0000-0000-0000-000000000010',(select servidor_id from public.employment_bonds where id=bond),bond,'regulamentar','2026-01-01','2026-12-31',25);
 data:='{"rightId":"f8000000-0000-0000-0000-000000000010","type":"regulamentar","startDate":"2027-05-03","acquisitionEnd":"2026-12-31","unjustifiedAbsences":"no","split":"none","birthDate":"1990-06-15","eligibilityConfirmed":true}';
 preview:=public.rh_preview_leave(profile,session_id,null,entry_id,data);
 result:=public.rh_create_leave(profile,session_id,null,entry_id,data,'f8000000-0000-0000-0000-000000000005',preview->>'digest');regular_id:=(result->>'id')::uuid;
 data:=data||'{"startDate":"2027-05-10"}';preview:=public.rh_preview_leave_revision(profile,session_id,null,regular_id,1,data);
 perform public.rh_revise_leave(profile,session_id,null,regular_id,1,data,'f8000000-0000-0000-0000-000000000006',preview->>'digest','Reprogramação fictícia de férias');
 begin
  perform public.rh_preview_leave_revision(actor,admin_session,'f6000000-0000-0000-0000-000000000102',regular_id,2,data);raise exception 'REVISION_CROSS_UNIT';
 exception when others then if sqlerrm<>'RH_LEAVE_NOT_FOUND' then raise;end if;end;
 preview:=public.rh_preview_leave_revision(profile,session_id,null,regular_id,2,data);
 begin
  update private.cnes_registry_entries set version=version+1,review_status='pending' where id=entry_id;
  perform public.rh_revise_leave(profile,session_id,null,regular_id,2,data,'f8000000-0000-0000-0000-000000000007',preview->>'digest','Cadastro mudou');raise exception 'REVISION_STALE_REGISTRY';
 exception when others then if sqlerrm<>'RH_ENTRY_REVIEW_REQUIRED' then raise;end if;end;
 begin
  perform public.rh_revise_leave(profile,session_id,null,regular_id,1,data,'f8000000-0000-0000-0000-000000000008',preview->>'digest','Versão antiga');raise exception 'REVISION_STALE_SAVE';
 exception when others then if sqlerrm<>'RH_VERSION_CONFLICT' then raise;end if;end;
 perform public.rh_close_leave(profile,session_id,null,regular_id,2,'cancelada','Cancelamento fictício');
 begin
  perform public.rh_preview_leave_revision(profile,session_id,null,regular_id,3,data);raise exception 'CANCELLED_REVISION_ALLOWED';
 exception when others then if sqlerrm<>'RH_VERSION_CONFLICT' then raise;end if;end;
 if before_banks is distinct from (select coalesce(jsonb_agg(to_jsonb(a) order by bond_id),'[]') from public.bond_time_bank_accounts a)
  or before_legacy<>(select count(*) from public.vacation_requests) then raise exception 'REVISION_CHANGED_LEGACY_BALANCES';end if;
 perform public.rh_clear_operator(profile,session_id);
 begin
  perform public.rh_preview_leave_revision(profile,session_id,null,leave_id,2,data);raise exception 'REVISION_NO_OPERATOR';
 exception when others then if sqlerrm<>'RH_OPERATOR_REQUIRED' then raise;end if;end;
 if has_function_privilege('authenticated','public.rh_revise_leave(uuid,uuid,uuid,uuid,integer,jsonb,uuid,text,text)','execute')
  or has_table_privilege('authenticated','private.rh_leave_revisions','select') then raise exception 'REVISION_CLIENT_PRIVILEGE';end if;
end $$;
