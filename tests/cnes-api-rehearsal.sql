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
update private.cnes_registry_entries set source_data=source_data||'{"cns":"900000000000031","cbo":"2231F9","relationshipType":"ESTATUTARIO EFETIVO","occupation":"OCUPAÇÃO TESTE","weeklyHours":40,"hoursOther":0,"hoursAmbulatory":40,"hoursHospital":0,"sourceEntryDate":"2020-01-01"}'
where id='f6000000-0000-0000-0000-000000000300';
set local role service_role;
do $test$
declare actor uuid:='f6000000-0000-0000-0000-000000000001';unit_id uuid:='f6000000-0000-0000-0000-000000000100';
entry_id uuid:='f6000000-0000-0000-0000-000000000300';profile uuid;session uuid:='f6000000-0000-0000-0000-000000000200';
grant_id uuid;result jsonb;leave_id uuid;before_count bigint;items jsonb;payload jsonb;revision bigint;
begin
 perform private.integrate_cnes_entry(actor,entry_id);
 select profile_id into profile from private.rh_unit_accounts where cnes_unit_id=unit_id;
 grant_id:=(public.rh_grant_operator(actor,unit_id,entry_id,true,0)->>'id')::uuid;
 perform public.rh_select_operator(profile,session,grant_id);
 result:=public.rh_create_occurrence(profile,session,entry_id,'fc000000-0000-0000-0000-000000000001','dayoff','2028-04-03','2028-04-03','AUTORIZAÇÃO TESTE','');
 leave_id:=(result->>'id')::uuid;
 if result->>'version'<>'1' then raise exception 'OCCURRENCE_FAILED';end if;
 result:=public.rh_create_occurrence(profile,session,entry_id,'fc000000-0000-0000-0000-000000000001','dayoff','2028-04-03','2028-04-03','AUTORIZAÇÃO TESTE','');
 if result->>'already_applied'<>'true' then raise exception 'DUPLICATED_OCCURRENCE';end if;
 begin perform public.rh_create_occurrence(profile,session,entry_id,'fc000000-0000-0000-0000-000000000002','folga','2028-04-03','2028-04-04','AUTORIZAÇÃO TESTE','');raise exception 'OVERLAP_ALLOWED';
 exception when others then if sqlerrm<>'RH_LEAVE_OVERLAP' then raise;end if;end;
 result:=public.rh_calendar_window(profile,session,null,'2028-04-01','2028-04-30',0,'','{}');
 if not exists(select 1 from jsonb_array_elements(result->'absences') x where x->>'id'=leave_id::text and x->>'type'='dayoff') then raise exception 'DAYOFF_MISSING_CALENDAR';end if;
 perform public.rh_close_leave(profile,session,null,leave_id,1,'cancelada','Cancelamento de teste');
 if not exists(select 1 from private.rh_leaves where id=leave_id and status='cancelada') then raise exception 'CANCELLATION_FAILED';end if;
 perform public.rh_create_occurrence(profile,session,entry_id,'fc000000-0000-0000-0000-000000000003','folga','2028-05-02','2028-05-03','AUTORIZAÇÃO TESTE','');
 select count(*) into before_count from private.rh_leaves;
 select coalesce(jsonb_agg(jsonb_build_object('sourceId',e.source_id,'sourceHash',e.source_hash,'sourceData',e.source_data)),'[]') into items from private.cnes_registry_entries e where e.cnes_unit_id=unit_id;
 select coalesce((select s.revision from private.cnes_registry_state s where s.cnes_unit_id=unit_id),0) into revision;
 payload:='{"cnes":"9999994","estabelecimento":{"cnes":"9999994","nome":"UNIDADE ATUALIZADA"},"profissionais":[],"equipes":[],"metadados":{"completo_no_escopo_solicitado":true}}';
 perform public.apply_cnes_api_update(actor,unit_id,items,jsonb_build_array(repeat('a',64)),repeat('e',64),now(),revision,payload);
 if (select count(*) from private.rh_leaves)<>before_count then raise exception 'LEAVES_CHANGED';end if;
 if (select source_data->>'cbo' from private.cnes_registry_entries where id=entry_id)<>'2231F9' then raise exception 'ALPHANUMERIC_CBO_CHANGED';end if;
 if (select name from public.cnes_units where id=unit_id)<>'UNIDADE ATUALIZADA' then raise exception 'UNIT_NOT_UPDATED';end if;
 if public.view_cnes_source(actor,unit_id)->'source' is null then raise exception 'SOURCE_NOT_STORED';end if;
 begin perform public.apply_cnes_api_update(actor,unit_id,'[]','[]',repeat('f',64),now(),revision+1,payload);
 raise exception 'MISSING_REMOVED';exception when others then if sqlerrm<>'CNES_COLLECTION_INVALID' then raise;end if;end;
 begin perform public.archive_cnes_employee(profile,entry_id,1,'Tentativa RH');raise exception 'RH_CHANGED_REGISTRY';
 exception when insufficient_privilege then null;end;
 perform public.archive_cnes_employee(actor,entry_id,(select version from private.cnes_registry_entries where id=entry_id),'Remoção explícita de teste');
 if (select count(*) from private.rh_leaves)<>before_count then raise exception 'ARCHIVE_DELETED_HISTORY';end if;
 if (select active from private.rh_operator_grants where id=grant_id) then raise exception 'ARCHIVED_OPERATOR_ACTIVE';end if;
 if has_function_privilege('authenticated','public.rh_create_occurrence(uuid,uuid,uuid,uuid,text,date,date,text,text)','EXECUTE') then raise exception 'DIRECT_RPC_ALLOWED';end if;
end $test$;
reset role;
select 'Atualização sem remoção; dayoff/folga; calendário; idempotência; autorização; arquivo sem perda: OK' as result;

