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
declare actor uuid:='f6000000-0000-0000-0000-000000000001';entry uuid:='f6000000-0000-0000-0000-000000000300';
 unit_id uuid:='f6000000-0000-0000-0000-000000000100';other uuid:='f6000000-0000-0000-0000-000000000102';profile uuid;operator_id uuid;preview jsonb;vacation uuid;bond uuid;old_end text;event_id uuid;data jsonb;result jsonb;
 item jsonb:='{"entryMode":"simplified","type":"regulamentar","regime":"efetivo","acquisitionEnd":"2027-12-31","startDate":"2028-06-05","recognitionReference":"Teste feriado por unidade","absenceCount":0,"familyLeaveDays":0,"personalLeaveDays":0,"spouseLeaveDays":0,"healthLeaveDays":0,"suspended":false,"cltLoss":false,"regularLicenseLoss":false,"split":"none"}';
begin
 perform private.integrate_cnes_entry(actor,entry);
 select profile_id into profile from private.rh_unit_accounts where cnes_unit_id=unit_id;
 operator_id:=(public.rh_grant_operator(actor,unit_id,entry,true,0)->>'id')::uuid;
 perform public.rh_select_operator(profile,'f6000000-0000-0000-0000-000000000200',operator_id);
 preview:=public.rh_preview_leave(profile,'f6000000-0000-0000-0000-000000000200',null,entry,item);
 old_end:=preview->'plan'->'periods'->0->>'end_date';
 result:=public.rh_create_leave(profile,'f6000000-0000-0000-0000-000000000200',null,entry,item,'fd000000-0000-0000-0000-000000000001',preview->>'digest');vacation:=(result->>'id')::uuid;
 data:=jsonb_build_object('event_date','2028-06-06','type','feriado','name','Feriado de outra unidade','scope','units','unit_ids',jsonb_build_array(other),'jurisdiction','institucional','source_url','https://example.invalid/synthetic-holiday');
 result:=public.manage_scoped_calendar_event(actor,'save',null,null,(data || jsonb_build_object('preview_digest',(public.preview_scoped_calendar_event(actor,'save',null,null,data))->>'digest')));
 if date '2028-06-06'=any(private.rh_holiday_dates(unit_id)) or not date '2028-06-06'=any(private.rh_holiday_dates(other)) then raise exception 'SCOPE_LEAK';end if;
 if (select plan->'periods'->0->>'end_date' from private.rh_leaves where id=vacation)<>old_end then raise exception 'OTHER_UNIT_CHANGED';end if;
 -- Mesma data em unidades diferentes é permitida.
 result:=public.manage_scoped_calendar_event(actor,'save',null,null,(data||jsonb_build_object('unit_ids',jsonb_build_array(unit_id)) || jsonb_build_object('preview_digest',(public.preview_scoped_calendar_event(actor,'save',null,null,data||jsonb_build_object('unit_ids',jsonb_build_array(unit_id))))->>'digest')));
 event_id:=(result->>'id')::uuid;
 if (select plan->'periods'->0->>'end_date' from private.rh_leaves where id=vacation)<=old_end then raise exception 'OWN_HOLIDAY_NOT_COUNTED';end if;
 result:=public.rh_calendar_window(profile,'f6000000-0000-0000-0000-000000000200',null,'2028-01-01','2028-12-31',0,'','{}');
 if (select count(*) from jsonb_array_elements(result->'holidays') e where e->>'date'='2028-06-06')<>1 then raise exception 'HOLIDAY_NOT_FILTERED';end if;
 begin perform public.manage_scoped_calendar_event(actor,'delete',event_id,2,('{}' || jsonb_build_object('preview_digest',(public.preview_scoped_calendar_event(actor,'delete',event_id,2,'{}'))->>'digest')));raise exception 'STALE_DELETE_ALLOWED';
 exception when others then if sqlerrm<>'CALENDAR_VERSION_CONFLICT' then raise;end if;end;
 result:=public.manage_scoped_calendar_event(actor,'save',event_id,1,(data||'{"scope":"general","unit_ids":[],"jurisdiction":"municipal"}' || jsonb_build_object('preview_digest',(public.preview_scoped_calendar_event(actor,'save',event_id,1,data||'{"scope":"general","unit_ids":[],"jurisdiction":"municipal"}'))->>'digest')));
 if not date '2028-06-06'=any(private.rh_holiday_dates(unit_id)) then raise exception 'GENERAL_NOT_INCLUDED';end if;
 perform public.manage_scoped_calendar_event(actor,'delete',event_id,2,('{}' || jsonb_build_object('preview_digest',(public.preview_scoped_calendar_event(actor,'delete',event_id,2,'{}'))->>'digest')));
 if exists(select 1 from public.calendar_events where id=event_id) then raise exception 'SOFT_DELETE';end if;
 if not exists(select 1 from public.audit_events where entity_id=event_id and action='calendar_event_deleted' and previous_value->>'name' is not null) then raise exception 'DELETE_AUDIT_LOST';end if;
 if (select plan->'periods'->0->>'end_date' from private.rh_leaves where id=vacation)<>old_end then raise exception 'DELETE_DID_NOT_RECALCULATE';end if;
 result:=public.manage_scoped_calendar_event(actor,'save',null,null,(data||jsonb_build_object('event_date','2028-06-07','unit_ids',jsonb_build_array(unit_id,other)) || jsonb_build_object('preview_digest',(public.preview_scoped_calendar_event(actor,'save',null,null,data||jsonb_build_object('event_date','2028-06-07','unit_ids',jsonb_build_array(unit_id,other))))->>'digest')));
 event_id:=(result->>'id')::uuid;
 if not date '2028-06-07'=any(private.rh_holiday_dates(unit_id)) or not date '2028-06-07'=any(private.rh_holiday_dates(other)) then raise exception 'GROUP_NOT_APPLIED';end if;
 perform public.manage_scoped_calendar_event(actor,'delete',event_id,1,('{}' || jsonb_build_object('preview_digest',(public.preview_scoped_calendar_event(actor,'delete',event_id,1,'{}'))->>'digest')));
 begin perform public.manage_scoped_calendar_event(actor,'save',null,null,(data||'{"unit_ids":[]}' || jsonb_build_object('preview_digest',(public.preview_scoped_calendar_event(actor,'save',null,null,data||'{"unit_ids":[]}'))->>'digest')));raise exception 'EMPTY_SCOPE_ALLOWED';
 exception when others then if sqlerrm<>'CALENDAR_SCOPE_INVALID' then raise;end if;end;
 begin perform public.manage_scoped_calendar_event(profile,'save',null,null,(data || jsonb_build_object('preview_digest',(public.preview_scoped_calendar_event(profile,'save',null,null,data))->>'digest')));raise exception 'RH_MANAGED_HOLIDAYS';
 exception when insufficient_privilege then null;end;
 if has_function_privilege('authenticated','public.manage_scoped_calendar_event(uuid,text,uuid,integer,jsonb)','execute') then raise exception 'PUBLIC_WRITE';end if;
end $test$;
reset role;
select 'Escopos, mesma data, cálculo isolado, exclusão física, versão e auditoria: OK' result;
