-- Fixture sintética, executar exclusivamente dentro de BEGIN/ROLLBACK.
insert into auth.users(id,email,aud,role) values
 ('f5000000-0000-0000-0000-000000000001','cnes-admin-fixture@example.invalid','authenticated','authenticated'),
 ('f5000000-0000-0000-0000-000000000002','cnes-rh-fixture@example.invalid','authenticated','authenticated');
insert into public.profiles(id,full_name,role,roles,must_change_password) values
 ('f5000000-0000-0000-0000-000000000001','CNES TESTE ADMIN','administrador',array['administrador']::public.app_role[],false),
 ('f5000000-0000-0000-0000-000000000002','CNES TESTE RH','rh',array['rh']::public.app_role[],false);
insert into public.cnes_units(id,code,name) values('f5000000-0000-0000-0000-000000000100','9999996','CNES TESTE ROLLBACK');
insert into public.cnes_units(id,code,name) values('f5000000-0000-0000-0000-000000000101','9999995','CNES TESTE OUTRA UNIDADE');
insert into public.servidores(id,full_name,matricula,employment_type) values
 ('f5000000-0000-0000-0000-000000000201','LEGADO FICTÍCIO 1','LEGACY-CNES-M1','estatutario'),
 ('f5000000-0000-0000-0000-000000000202','LEGADO FICTÍCIO 2','LEGACY-CNES-M2','estatutario');
insert into public.employment_bonds(id,servidor_id,registration,employment_type) values
 ('f5000000-0000-0000-0000-000000000301','f5000000-0000-0000-0000-000000000201','LEGACY-CNES-M1','estatutario'),
 ('f5000000-0000-0000-0000-000000000302','f5000000-0000-0000-0000-000000000202','LEGACY-CNES-M2','estatutario');
insert into public.employment_bond_units(bond_id,cnes_unit_id) values
 ('f5000000-0000-0000-0000-000000000301','f5000000-0000-0000-0000-000000000100'),
 ('f5000000-0000-0000-0000-000000000302','f5000000-0000-0000-0000-000000000101');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('request.headers','{"x-sgf-role":"administrador","x-sgf-actor":"f5000000-0000-0000-0000-000000000001"}',true);
set local role service_role;
do $$
declare actor uuid:='f5000000-0000-0000-0000-000000000001';unit_id uuid:='f5000000-0000-0000-0000-000000000100';
 data jsonb;changed jsonb;result jsonb;entry_id uuid;revision bigint;
begin
 data:=jsonb_build_array(jsonb_build_object('sourceId',repeat('a',64),'sourceHash',repeat('b',64),
   'sourceData',jsonb_build_object('fullName','PESSOA FICTÍCIA','cns','900000000000001','cbo','123456','weeklyHours',40,'teams','[]'::jsonb)));
 result:=public.cnes_registry_snapshot(actor,unit_id);
 if (result->>'revision')::int<>0 or jsonb_array_length(result->'entries')<>0 then raise exception 'EMPTY_SNAPSHOT_FAILED';end if;
 result:=public.apply_cnes_registry_import(actor,unit_id,data,repeat('a',64),now(),null,0);
 if result->>'added'<>'1' then raise exception 'ADD_FAILED';end if;
 select id into entry_id from private.cnes_registry_entries where cnes_unit_id=unit_id;
 if (select local_data from private.cnes_registry_entries where id=entry_id)<>'{}'::jsonb then raise exception 'FAKE_MUNICIPAL_DATA';end if;
 if (select count(*) from public.servidores where full_name='PESSOA FICTÍCIA')<>0 then raise exception 'LEGACY_MUTATED';end if;
 result:=public.apply_cnes_registry_import(actor,unit_id,data,repeat('a',64),now(),null,0);
 if result->>'status'<>'already_applied' or (select count(*) from private.cnes_import_runs where cnes_unit_id=unit_id)<>1 then raise exception 'IDEMPOTENCE_FAILED';end if;
 perform public.review_cnes_registry_entry(actor,entry_id,1,'{"registration":"MUNICIPAL-TESTE","municipalPosition":"CARGO CONFERIDO","weeklyHours":30}',null);
 if (select version from private.cnes_registry_entries where id=entry_id)<>2 then raise exception 'REVIEW_FAILED';end if;
 begin
   perform public.review_cnes_registry_entry(actor,entry_id,1,'{}',null);
   raise exception 'STALE_REVIEW_ACCEPTED';
 exception when others then if sqlerrm<>'CNES_VERSION_CONFLICT' then raise;end if;end;
 changed:=jsonb_set(jsonb_set(data,'{0,sourceHash}',to_jsonb(repeat('c',64))),'{0,sourceData,weeklyHours}','20');
 begin
   perform public.apply_cnes_registry_import(actor,unit_id,changed,repeat('c',64),now(),null,1);
   raise exception 'STALE_IMPORT_ACCEPTED';
 exception when others then if sqlerrm<>'CNES_VERSION_CONFLICT' then raise;end if;end;
 result:=public.apply_cnes_registry_import(actor,unit_id,changed,repeat('c',64),now(),null,2);
 if result->>'changed'<>'1' then raise exception 'SOURCE_UPDATE_FAILED';end if;
 if (select local_data->>'weeklyHours' from private.cnes_registry_entries where id=entry_id)<>'30'
   or (select local_data->>'municipalPosition' from private.cnes_registry_entries where id=entry_id)<>'CARGO CONFERIDO'
   or (select review_status from private.cnes_registry_entries where id=entry_id)<>'pending' then raise exception 'LOCAL_OVERRIDE_LOST';end if;
 begin
   perform public.apply_cnes_registry_import(actor,unit_id,changed,repeat('d',64),now()-interval '1 day',null,3);
   raise exception 'OLDER_COLLECTION_ACCEPTED';
 exception when others then if sqlerrm<>'CNES_STALE_COLLECTION' then raise;end if;end;
 changed:=jsonb_set(changed,'{0,sourceId}',to_jsonb(repeat('d',64)));
 result:=public.apply_cnes_registry_import(actor,unit_id,changed,repeat('d',64),now(),null,3);
 if result->>'absent_preserved'<>'1' or (select count(*) from private.cnes_registry_entries where cnes_unit_id=unit_id)<>2 then raise exception 'ABSENT_WAS_DELETED';end if;
 if jsonb_array_length(public.list_cnes_registry(actor,unit_id,0)->'entries')<>2 then raise exception 'PAGE_FAILED';end if;
 begin
   perform public.cnes_registry_snapshot('f5000000-0000-0000-0000-000000000002',unit_id);
   raise exception 'RH_ACCEPTED';
 exception when insufficient_privilege then if sqlerrm<>'CNES_ADMIN_REQUIRED' then raise;end if;end;
 if has_table_privilege('authenticated','private.cnes_registry_entries','SELECT')
   or has_table_privilege('anon','private.cnes_registry_entries','SELECT')
   or has_function_privilege('authenticated','public.cnes_registry_snapshot(uuid,uuid)','EXECUTE') then raise exception 'DIRECT_API_GRANTED';end if;
end $$;
do $$
declare actor uuid:='f5000000-0000-0000-0000-000000000001';unit_id uuid:='f5000000-0000-0000-0000-000000000100';entry record;
begin
 select id,version into entry from private.cnes_registry_entries where cnes_unit_id=unit_id and source_id=repeat('a',64);
 if jsonb_array_length(public.cnes_legacy_candidates(actor,unit_id,'LEGACY-CNES-M1'))<>1
   or jsonb_array_length(public.cnes_legacy_candidates(actor,unit_id,'LEGACY-CNES-M2'))<>0 then raise exception 'LEGACY_LOOKUP_SCOPE_FAILED';end if;
 begin
   perform public.review_cnes_registry_entry(actor,entry.id,entry.version,'{"registration":"LEGACY-CNES-M1"}',null);
   raise exception 'LEGACY_LINK_NOT_REQUIRED';
 exception when others then if sqlerrm<>'CNES_LEGACY_LINK_REQUIRED' then raise;end if;end;
 begin
   perform public.review_cnes_registry_entry(actor,entry.id,entry.version,'{"registration":"LEGACY-CNES-M2"}','f5000000-0000-0000-0000-000000000202');
   raise exception 'OTHER_UNIT_LINK_ACCEPTED';
 exception when others then if sqlerrm<>'CNES_LEGACY_OUT_OF_UNIT' then raise;end if;end;
 perform public.review_cnes_registry_entry(actor,entry.id,entry.version,'{"registration":"LEGACY-CNES-M1"}','f5000000-0000-0000-0000-000000000201');
 if (select servidor_id from private.cnes_registry_entries where id=entry.id)<>'f5000000-0000-0000-0000-000000000201'::uuid then raise exception 'EXPLICIT_LINK_FAILED';end if;
 if (select full_name from public.servidores where id='f5000000-0000-0000-0000-000000000201')<>'LEGADO FICTÍCIO 1' then raise exception 'LEGACY_OVERWRITTEN';end if;
end $$;
reset role;
select 'CNES registry: insertion, replay, local preservation, version, stale collection, absence, paging and isolation passed' as result;
