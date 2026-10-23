reset role;
insert into auth.sessions(id,user_id) values('f6000000-0000-0000-0000-000000000202','f6000000-0000-0000-0000-000000000001');
set local role service_role;
do $$
declare actor uuid:='f6000000-0000-0000-0000-000000000001';unit_id uuid:='f6000000-0000-0000-0000-000000000100';
 entry_id uuid:='f6000000-0000-0000-0000-000000000300';session_id uuid:='f6000000-0000-0000-0000-000000000200';
 profile uuid;grant_id uuid;data jsonb;preview jsonb;result jsonb;resources jsonb;candidate jsonb;forward jsonb;inverse jsonb;
 leave_id uuid;bad_day text;
begin
 select profile_id into profile from private.rh_unit_accounts where cnes_unit_id=unit_id;
 perform public.review_cnes_registry_entry(actor,entry_id,1,'{"registration":"RH-RETURN-001","municipalPosition":"CARGO TESTE","admissionDate":"2020-01-01","employmentType":"efetivo","weeklyHours":32.5,"teamLabel":"EQUIPE TESTE"}',null);
 result:=public.rh_bind_registry_bond(actor,entry_id,2,null,0,true,'Ensaio fictício');
 result:=public.rh_grant_operator(actor,unit_id,entry_id,true,0);grant_id:=(result->>'id')::uuid;
 perform public.rh_select_operator(profile,session_id,grant_id);
 resources:=public.rh_leave_resources(profile,session_id,null,entry_id);
 -- Cenário sintético controlado, revertido pela transação externa.
 update public.calendar_events set active=false where event_date between '2027-03-01' and '2027-03-10';
 insert into public.calendar_events(event_date,type,name,active) values('2027-03-04','feriado','FERIADO FICTÍCIO',true)
 on conflict(event_date,type,scope,unit_ids) do update set active=true;
 data:='{"type":"banco_horas","dateMode":"return","returnDate":"2027-03-09","days":2,"availableHours":15,"dailyHours":7.5,"birthDate":"1990-03-05","eligibilityConfirmed":true}';
 preview:=public.rh_preview_leave(profile,session_id,null,entry_id,data);
 if preview->'plan'->'periods'->0->>'start_date'<>'2027-03-03' or preview->'plan'->'periods'->0->>'return_date'<>'2027-03-09'
  or preview->'plan'->'bank'->>'required_minutes'<>'900' then raise exception 'RETURN_WORKDAYS_HOLIDAY_BIRTHDAY';end if;
 foreach bad_day in array array['2027-03-04','2027-03-05','2027-03-06','2027-03-07'] loop
  begin
   perform public.rh_preview_leave(profile,session_id,null,entry_id,data||jsonb_build_object('returnDate',bad_day));raise exception 'RETURN_NONWORKDAY_ALLOWED';
  exception when others then if sqlerrm<>'RH_LEAVE_RETURN_INVALID' then raise;end if;end;
 end loop;
 if public.rh_preview_leave(profile,session_id,null,entry_id,data||'{"availableHours":0}')->'plan'->>'can_save'<>'false' then raise exception 'RETURN_SHORTAGE_LOST';end if;
 begin
  insert into public.calendar_events(event_date,type,name,active) values('2027-03-03','feriado','OUTRO FERIADO FICTÍCIO',true) on conflict(event_date,type,scope,unit_ids) do update set active=true;
  perform public.rh_create_leave(profile,session_id,null,entry_id,data,'fa000000-0000-0000-0000-000000000009',preview->>'digest');raise exception 'RETURN_STALE_CALENDAR';
 exception when others then if sqlerrm<>'RH_LEAVE_PREVIEW_CHANGED' then raise;end if;end;
 result:=public.rh_create_leave(profile,session_id,null,entry_id,data,'fa000000-0000-0000-0000-000000000001',preview->>'digest');leave_id:=(result->>'id')::uuid;
 result:=public.rh_create_leave(profile,session_id,null,entry_id,data,'fa000000-0000-0000-0000-000000000001',preview->>'digest');
 if result->>'replayed'<>'true' then raise exception 'RETURN_REPLAY';end if;
 data:=data||'{"returnDate":"2027-03-16"}';preview:=public.rh_preview_leave_revision(profile,session_id,null,leave_id,1,data);
 perform public.rh_revise_leave(profile,session_id,null,leave_id,1,data,'fa000000-0000-0000-0000-000000000002',preview->>'digest','Novo retorno fictício');
 result:=public.rh_leave_detail(profile,session_id,null,leave_id);
 if result->'plan'->>'requested_return'<>'2027-03-16' or result->'revisions'->0->'plan'->>'requested_return'<>'2027-03-09' then raise exception 'RETURN_REVISION_HISTORY';end if;
 -- Mesmas modalidades/regimes/quantidades no cálculo direto e inverso.
 for candidate in select value from jsonb_array_elements('[
  {"type":"regulamentar","acquisitionEnd":"2026-12-31","unjustifiedAbsences":"no"},
  {"type":"regulamentar","acquisitionEnd":"2026-12-31","unjustifiedAbsences":"yes"},
  {"type":"regulamentar","acquisitionEnd":"2024-12-31","unjustifiedAbsences":"no"},
  {"type":"regulamentar","acquisitionEnd":"2026-12-31","unjustifiedAbsences":"no","extraHours":15,"dailyHours":7.5,"availableHours":15},
  {"type":"regulamentar","acquisitionEnd":"2026-12-31","unjustifiedAbsences":"no","split":"15-10","secondStartDate":"2027-09-01"},
  {"type":"regulamentar","acquisitionEnd":"2026-12-31","unjustifiedAbsences":"no","split":"10-15","secondStartDate":"2027-09-01"},
  {"type":"premio","days":30},{"type":"premio","days":60},{"type":"premio","days":90},
  {"type":"banco_horas","days":3,"availableHours":0,"dailyHours":8,"override":true,"overrideReason":"Exceção fictícia"}
 ]') loop
  candidate:=candidate||'{"startDate":"2027-07-05","birthDate":"1990-07-07","eligibilityConfirmed":true}';
  forward:=private.rh_make_leave_plan(resources,candidate);
  inverse:=private.rh_make_leave_plan(resources,(candidate-'startDate')||jsonb_build_object('dateMode','return','returnDate',forward->'periods'->0->>'return_date'));
  if (forward->>'counting_mode'='uteis' and inverse->'periods'<>forward->'periods') or inverse->'periods'->0->>'return_date'<>forward->'periods'->0->>'return_date' or inverse->'bank'<>forward->'bank' or inverse->'vacation_days'<>forward->'vacation_days' then raise exception 'RETURN_ROUNDTRIP_MISMATCH: %',candidate->>'type';end if;
 end loop;
 inverse:=private.rh_make_leave_plan(resources,'{"type":"premio","days":30,"dateMode":"return","returnDate":"2100-12-31","birthDate":"1990-06-15","eligibilityConfirmed":true}');
 if inverse->'periods'->0->>'return_date'<>'2100-12-31' then raise exception 'RETURN_UPPER_BOUND';end if;
 begin
  perform private.rh_make_leave_plan(resources,'{"type":"regulamentar","dateMode":"return","returnDate":"2027-01-04","acquisitionEnd":"2026-12-31","unjustifiedAbsences":"no","birthDate":"1990-06-15","eligibilityConfirmed":true}');raise exception 'RETURN_ACQUISITION_BYPASSED';
 exception when others then if sqlerrm<>'RH_LEAVE_ACQUISITION_INVALID' then raise;end if;end;
 begin
  perform private.rh_make_leave_plan(resources,'{"type":"banco_horas","dateMode":"return","returnDate":"2020-01-02","days":2,"availableHours":16,"dailyHours":8,"birthDate":"1990-06-15","eligibilityConfirmed":true}');raise exception 'RETURN_ADMISSION_BYPASSED';
 exception when others then if sqlerrm<>'RH_LEAVE_DATES_INVALID' then raise;end if;end;
end $$;
