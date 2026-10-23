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
declare actor uuid:='f6000000-0000-0000-0000-000000000001';unit_id uuid:='f6000000-0000-0000-0000-000000000100';
entry uuid:='f6000000-0000-0000-0000-000000000300';session uuid:='f6000000-0000-0000-0000-000000000200';profile uuid;result jsonb;g uuid;k uuid:=gen_random_uuid();a uuid;f uuid;
item jsonb:='{"type":"folga","dates":["2030-01-02","2030-01-04","2030-01-02"],"reference":"Fixture folga"}';
begin
perform public.apply_cnes_reviewed(actor,unit_id,jsonb_build_array(jsonb_build_object('sourceId',repeat('a',64),'sourceHash',repeat('b',64),'sourceData',(select source_data from private.cnes_registry_entries where id=entry))),repeat('1',64),now(),'202610',0,'[]',jsonb_build_array(repeat('a',64)),'{}');
select profile_id into profile from private.rh_unit_accounts where cnes_unit_id=unit_id;
result:=public.rh_grant_operator(actor,unit_id,entry,true,0);g:=(result->>'id')::uuid;
perform public.rh_select_operator(profile,session,g);
result:=public.rh_record_absence(profile,session,entry,k,item);f:=(result->>'id')::uuid;
if (select jsonb_array_length(plan->'periods') from private.rh_leaves where id=f)<>2 then raise exception 'NONCONSECUTIVE_MERGED';end if;
result:=public.rh_record_absence(profile,session,entry,k,item||'{"dates":["2030-01-04","2030-01-02"]}');
if result->>'replayed'<>'true' or result->>'id'<>f::text then raise exception 'IDEMPOTENCY';end if;
begin perform public.rh_record_absence(profile,session,entry,k,item||'{"dates":["2030-01-05"]}');raise exception 'BAD_RETRY';exception when others then if sqlerrm<>'RH_LEAVE_IDEMPOTENCY_CONFLICT' then raise;end if;end;
result:=public.rh_record_absence(profile,session,entry,gen_random_uuid(),'{"type":"afastamento","start":"2031-01-01","returnDate":null,"reference":"Fixture afastamento"}');a:=(result->>'id')::uuid;
if (select plan->'periods'->0->'end_date' from private.rh_leaves where id=a)<>'null'::jsonb then raise exception 'FAKE_END_DATE';end if;
result:=public.rh_calendar_window(profile,session,null,'2032-01-01','2032-01-31',0,'','{"type":"afastamento"}');
if not exists(select 1 from jsonb_array_elements(result->'absences') z where z->>'id'=a::text) then raise exception 'OPEN_ABSENCE_MISSING_FUTURE';end if;
begin perform public.rh_close_leave(profile,session,null,a,1,'concluida','Fixture conclusão');raise exception 'OPEN_COMPLETED';exception when others then if sqlerrm<>'RH_ABSENCE_RETURN_REQUIRED' then raise;end if;end;
begin perform public.rh_record_absence(profile,session,entry,gen_random_uuid(),'{"type":"folga","dates":["2032-01-05"],"reference":"Fixture conflito"}');raise exception 'OVERLAP_ALLOWED';exception when others then if sqlerrm<>'RH_LEAVE_OVERLAP' then raise;end if;end;
perform public.rh_set_absence_return(profile,session,a,1,'2031-01-10','Fixture retorno');
if not exists(select 1 from private.rh_leaves where id=a and version=2 and plan->'periods'->0->>'end_date'='2031-01-09') then raise exception 'RETURN_EXCLUSIVITY';end if;
if not exists(select 1 from private.rh_leave_revisions where leave_id=a and version=1 and plan->'periods'->0->'end_date'='null') then raise exception 'HISTORY_LOST';end if;
begin perform public.rh_set_absence_return(profile,session,a,1,'2031-01-11','Fixture versão');raise exception 'STALE_ALLOWED';exception when others then if sqlerrm<>'RH_VERSION_CONFLICT' then raise;end if;end;
perform public.rh_set_absence_return(profile,session,a,2,null,'Fixture sem previsão');
begin perform public.rh_record_absence(profile,session,'f6000000-0000-0000-0000-000000000301',gen_random_uuid(),item);raise exception 'SCOPE_BROKEN';exception when others then if sqlerrm<>'RH_BOND_OUT_OF_UNIT' then raise;end if;end;
if has_function_privilege('authenticated','public.rh_record_absence(uuid,uuid,uuid,uuid,jsonb)','execute') then raise exception 'DIRECT_ACCESS';end if;
if not exists(select 1 from public.audit_events where entity_id=a and action='rh_absence_return_updated' and new_value->>'operator_name'='OPERADOR FICTÍCIO') then raise exception 'AUDIT_MISSING';end if;
end $test$;
