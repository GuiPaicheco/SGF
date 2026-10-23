-- Executar somente dentro de BEGIN/ROLLBACK.
-- Exclusivamente BEGIN/ROLLBACK: nenhum usuário fictício persiste.
insert into auth.users(id,email,aud,role) values('f6000000-0000-0000-0000-000000000001','rh-admin-fixture@example.invalid','authenticated','authenticated');
insert into public.profiles(id,full_name,role,roles,must_change_password) values('f6000000-0000-0000-0000-000000000001','RH ADMIN TESTE','administrador',array['administrador']::public.app_role[],false);
insert into public.cnes_units(id,code,name) values('f6000000-0000-0000-0000-000000000100','9999994','RH UNIDADE TESTE');
insert into public.lotacoes(id,code,name,is_internal_allocation) values('f6000000-0000-0000-0000-000000000101','9999994','RH LOTAÇÃO TESTE',false);
insert into public.lotacao_cnes_units(lotacao_id,cnes_unit_id) values('f6000000-0000-0000-0000-000000000101','f6000000-0000-0000-0000-000000000100');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('request.headers','{"x-sgf-role":"administrador","x-sgf-actor":"f6000000-0000-0000-0000-000000000001"}',true);
set local role service_role;
select public.prepare_rh_unit('f6000000-0000-0000-0000-000000000001','f6000000-0000-0000-0000-000000000100','RH TESTE');
reset role;
insert into auth.users(id,email,aud,role,raw_app_meta_data)
select auth_user_id,internal_email,'authenticated','authenticated','{"sgf_rh_cnes":"9999994"}'::jsonb from private.rh_unit_accounts where cnes_unit_id='f6000000-0000-0000-0000-000000000100';
set local role service_role;
select public.finish_rh_unit('f6000000-0000-0000-0000-000000000001','f6000000-0000-0000-0000-000000000100',(select auth_user_id from private.rh_unit_accounts where cnes_unit_id='f6000000-0000-0000-0000-000000000100'));
reset role;
insert into auth.sessions(id,user_id) select 'f6000000-0000-0000-0000-000000000200',profile_id from private.rh_unit_accounts where cnes_unit_id='f6000000-0000-0000-0000-000000000100';
insert into auth.sessions(id,user_id) select 'f6000000-0000-0000-0000-000000000201',profile_id from private.rh_unit_accounts where cnes_unit_id='f6000000-0000-0000-0000-000000000100';
insert into public.cnes_units(id,code,name) values('f6000000-0000-0000-0000-000000000102','9999993','OUTRO CNES TESTE');
insert into private.cnes_registry_entries(id,cnes_unit_id,source_id,source_hash,source_data)
values('f6000000-0000-0000-0000-000000000301','f6000000-0000-0000-0000-000000000102',repeat('c',64),repeat('d',64),'{"fullName":"OUTRO OPERADOR FICTÍCIO","status":"ativo"}');
insert into private.cnes_registry_entries(id,cnes_unit_id,source_id,source_hash,source_data)
values('f6000000-0000-0000-0000-000000000300','f6000000-0000-0000-0000-000000000100',repeat('a',64),repeat('b',64),'{"fullName":"OPERADOR FICTÍCIO","status":"ativo","cbo":"123456","teams":[]}');
set local role service_role;
reset role;
update private.cnes_registry_entries set source_data=source_data||'{"cns":"900000000000031","relationshipType":"ESTATUTARIO EFETIVO","occupation":"OCUPAÇÃO TESTE","weeklyHours":40,"hoursOther":0,"hoursAmbulatory":40,"hoursHospital":0,"sourceEntryDate":"2020-01-01"}'
where id='f6000000-0000-0000-0000-000000000300';
set local role service_role;

do $test$
declare actor uuid:='f6000000-0000-0000-0000-000000000001';target_entry_id uuid:='f6000000-0000-0000-0000-000000000300';
 unit_id uuid:='f6000000-0000-0000-0000-000000000100';session_id uuid:='f6000000-0000-0000-0000-000000000200';
 profile uuid;grant_id uuid;target_bond uuid;result jsonb;preview jsonb;vacation uuid;off_id uuid;original_plan jsonb;changed_plan jsonb;v integer;
 item jsonb:='{"entryMode":"simplified","type":"regulamentar","regime":"efetivo","acquisitionEnd":"2027-12-31","startDate":"2028-06-05","recognitionReference":"Teste dayoff","absenceCount":0,"familyLeaveDays":0,"personalLeaveDays":0,"spouseLeaveDays":0,"healthLeaveDays":0,"suspended":false,"cltLoss":false,"regularLicenseLoss":false,"split":"none"}';
begin
 perform private.integrate_cnes_entry(actor,target_entry_id);
 select profile_id into profile from private.rh_unit_accounts where cnes_unit_id=unit_id;
 grant_id:=(public.rh_grant_operator(actor,unit_id,target_entry_id,true,0)->>'id')::uuid;
 perform public.rh_select_operator(profile,session_id,grant_id);
 select m.bond_id into target_bond from private.rh_registry_bonds m where m.entry_id=target_entry_id;
 preview:=public.rh_preview_leave(profile,session_id,null,target_entry_id,item);original_plan:=preview->'plan';
 result:=public.rh_create_leave(profile,session_id,null,target_entry_id,item,'fb000000-0000-0000-0000-000000000001',preview->>'digest');vacation:=(result->>'id')::uuid;
 -- Day-off lançado depois das férias precisa recalcular na mesma transação.
 result:=public.rh_create_occurrence(profile,session_id,target_entry_id,'fb000000-0000-0000-0000-000000000002','dayoff','2028-06-06','2028-06-06','Aniversário fixture','');
 off_id:=(result->>'id')::uuid;
 select plan,version into changed_plan,v from private.rh_leaves where id=vacation;
 if v<>2 or changed_plan->'periods'->0->>'end_date'<=original_plan->'periods'->0->>'end_date' or changed_plan->>'vacation_days'<>'25'
  or not changed_plan->'day_offs' ? '2028-06-06' then raise exception 'DAYOFF_DID_NOT_EXTEND';end if;
 if not exists(select 1 from private.rh_leave_revisions where leave_id=vacation and version=1) then raise exception 'VERSION_LOST';end if;
 perform public.rh_create_occurrence(profile,session_id,target_entry_id,'fb000000-0000-0000-0000-000000000002','dayoff','2028-06-06','2028-06-06','Aniversário fixture','');
 if (select version from private.rh_leaves where id=vacation)<>2 then raise exception 'RETRY_RECALCULATED';end if;
 perform public.rh_close_leave(profile,session_id,null,off_id,1,'cancelada','Teste reversão');
 if (select plan->'periods' from private.rh_leaves where id=vacation)<>original_plan->'periods' then raise exception 'CANCEL_NOT_REVERSED';end if;
 -- Bloqueio atômico quando o novo fim colidir com uma folga existente.
 perform public.rh_create_occurrence(profile,session_id,target_entry_id,'fb000000-0000-0000-0000-000000000003','folga',
  (original_plan->'periods'->0->>'return_date')::date,(original_plan->'periods'->0->>'return_date')::date,'Folga fixture','');
 begin
  perform public.rh_create_occurrence(profile,session_id,target_entry_id,'fb000000-0000-0000-0000-000000000004','dayoff','2028-06-06','2028-06-06','Dayoff conflitante','');
  raise exception 'CONFLICT_ALLOWED';
 exception when others then if sqlerrm<>'RH_DAYOFF_RECALC_CONFLICT' then raise;end if;end;
 if exists(select 1 from private.rh_leaves where request_key='fb000000-0000-0000-0000-000000000004') then raise exception 'PARTIAL_SAVE';end if;
 -- Day-off antes de um novo lançamento: prévia, gravação e modo retorno concordam.
 perform public.rh_create_occurrence(profile,session_id,target_entry_id,'fb000000-0000-0000-0000-000000000005','dayoff','2029-06-05','2029-06-05','Aniversário futuro','');
 item:=item||'{"acquisitionEnd":"2028-12-31","startDate":"2029-06-04"}';
 preview:=public.rh_preview_leave(profile,session_id,null,target_entry_id,item);
 if not preview->'plan'->'day_offs' ? '2029-06-05' then raise exception 'PREVIEW_IGNORED_DAYOFF';end if;
 result:=public.rh_create_leave(profile,session_id,null,target_entry_id,item,'fb000000-0000-0000-0000-000000000006',preview->>'digest');
 if result->>'id' is null then raise exception 'DAYOFF_BLOCKED_CREATION';end if;
 result:=private.rh_make_leave_plan(jsonb_build_object('bond_id',target_bond),
   (item-'startDate')||jsonb_build_object('dateMode','return','returnDate',preview->'plan'->'periods'->0->>'return_date'));
 if result->'periods'<>preview->'plan'->'periods' then raise exception 'RETURN_MODE_DIVERGED';end if;
 -- Aniversário registrado pelo RH é anual, sem exigir nova solicitação de day-off.
 perform public.rh_close_leave(profile,session_id,null,vacation,3,'cancelada','Fim do cenário anterior');
 select version into v from private.rh_leaves where id=(result->>'id')::uuid;
 perform public.rh_save_employee_birthday(profile,session_id,target_entry_id,0,6,7);
 if not private.rh_dayoff_dates(target_bond) @> array[date '2029-06-07',date '2030-06-07'] then raise exception 'ANNUAL_BIRTHDAY_IGNORED';end if;
 if not exists(select 1 from private.rh_leaves where bond_id=target_bond and plan->'day_offs' ? '2029-06-07') then raise exception 'BIRTHDAY_DID_NOT_RECALCULATE';end if;
 perform public.rh_save_employee_birthday(profile,session_id,target_entry_id,1,null,null);
 if date '2030-06-07'=any(private.rh_dayoff_dates(target_bond)) then raise exception 'BIRTHDAY_CLEAR_FAILED';end if;
 perform public.rh_save_employee_birthday(profile,session_id,target_entry_id,2,2,29);
 if date '2029-03-01'=any(private.rh_dayoff_dates(target_bond)) or not date '2028-02-29'=any(private.rh_dayoff_dates(target_bond)) then raise exception 'LEAP_BIRTHDAY_INVALID';end if;
 perform public.rh_save_employee_birthday(profile,session_id,target_entry_id,3,null,null);
 -- Fim de semana não adiciona um segundo desconto; dias corridos não são alterados.
 result:=private.rh_apply_dayoffs(target_bond,jsonb_build_object('type','regulamentar','counting_mode','uteis','periods',
  jsonb_build_array(jsonb_build_object('start_date','2028-06-10','end_date','2028-06-12','return_date','2028-06-13','days',1))));
 if result->'periods'->0->>'end_date'<>'2028-06-12' then raise exception 'WEEKEND_EXTRA_DAY';end if;
 result:='{"type":"premio","counting_mode":"corridos","periods":[]}';
 if private.rh_apply_dayoffs(target_bond,result)<>result then raise exception 'CORRIDOS_CHANGED';end if;
 result:=public.rh_calendar_window(profile,session_id,null,'2027-03-01','2028-02-29',0,'','{}');
 if result->>'range_end'<>'2028-02-29' then raise exception 'YEAR_TRUNCATED';end if;
 begin perform public.rh_calendar_window(profile,session_id,null,'2027-03-01','2028-03-01',0,'','{}');raise exception 'YEAR_UNBOUNDED';
 exception when others then if sqlerrm<>'RH_INPUT_INVALID' then raise;end if;end;
 if has_function_privilege('authenticated','private.rh_recalculate_dayoffs(uuid,uuid,text,boolean)','execute') then raise exception 'DIRECT_RECALC_ALLOWED';end if;
end $test$;
reset role;
select 'Calendário anual, prévia, lançamento, recálculo, cancelamento, idempotência, histórico e conflito atômico: OK' result;
