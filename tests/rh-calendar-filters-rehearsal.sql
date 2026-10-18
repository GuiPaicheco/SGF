reset role;
insert into auth.sessions(id,user_id) values('f6000000-0000-0000-0000-000000000202','f6000000-0000-0000-0000-000000000001');
set local role service_role;
do $$
declare actor uuid:='f6000000-0000-0000-0000-000000000001';unit_id uuid:='f6000000-0000-0000-0000-000000000100';
 entry_id uuid:='f6000000-0000-0000-0000-000000000300';session_id uuid:='f6000000-0000-0000-0000-000000000200';
 profile uuid;grant_id uuid;data jsonb;preview jsonb;result jsonb;leave_id uuid;
begin
 select profile_id into profile from private.rh_unit_accounts where cnes_unit_id=unit_id;
 perform public.review_cnes_registry_entry(actor,entry_id,1,'{"registration":"RH-FILTER-001","municipalPosition":"CARGO TESTE","admissionDate":"2020-01-01","employmentType":"efetivo","weeklyHours":32.5,"teamLabel":"EQUIPE TESTE"}',null);
 perform public.rh_bind_registry_bond(actor,entry_id,2,null,0,true,'Ensaio fictício');
 result:=public.rh_grant_operator(actor,unit_id,entry_id,true,0);grant_id:=(result->>'id')::uuid;
 perform public.rh_select_operator(profile,session_id,grant_id);
 insert into private.cnes_registry_entries(id,cnes_unit_id,source_id,source_hash,source_data,local_data)
 select md5('filter-fixture-'||g)::uuid,unit_id,md5(g::text)||md5(g::text),md5(g::text)||md5(g::text),
  jsonb_build_object('fullName','FICTÍCIO '||lpad(g::text,3,'0'),'status','ativo','cbo',case when g=65 then '654321' else '111111' end),
  jsonb_build_object('municipalPosition',case when g=65 then 'CARGO RARO %' else 'CARGO COMUM' end,'teamLabel',case when g=65 then 'EQUIPE RARA' else 'EQUIPE COMUM' end)
 from generate_series(1,65) g;
 result:=public.rh_calendar_filtered(profile,session_id,null,'2027-03-01',0,'','{}');
 if result->>'total'<>'66' or jsonb_array_length(result->'employees')<>50 then raise exception 'FILTER_PAGE_TOTAL';end if;
 result:=public.rh_calendar_filtered(profile,session_id,null,'2027-03-01',1,'','{}');
 if jsonb_array_length(result->'employees')<>16 then raise exception 'FILTER_SECOND_PAGE';end if;
 result:=public.rh_calendar_filtered(profile,session_id,null,'2027-03-01',0,'','{"position":"raro","cbo":"654","team":"rara"}');
 if result->>'total'<>'1' or result->'employees'->0->>'full_name'<>'FICTÍCIO 065' then raise exception 'FILTER_NOT_BEFORE_PAGINATION';end if;
 result:=public.rh_calendar_filtered(profile,session_id,null,'2027-03-01',0,'','{"position":"%"}');
 if result->>'total'<>'1' then raise exception 'FILTER_WILDCARD_EXPANDED';end if;
 if public.rh_calendar_filtered(profile,session_id,null,'2027-03-01',0,'','{"review":"conferido"}')->>'total'<>'1'
  or public.rh_calendar_filtered(profile,session_id,null,'2027-03-01',0,'','{"review":"pendente"}')->>'total'<>'65' then raise exception 'FILTER_REVIEW';end if;
 data:='{"type":"banco_horas","startDate":"2027-03-01","days":2,"availableHours":16,"dailyHours":8,"birthDate":"1990-06-15","eligibilityConfirmed":true}';
 preview:=public.rh_preview_leave(profile,session_id,null,entry_id,data);
 result:=public.rh_create_leave(profile,session_id,null,entry_id,data,'f9000000-0000-0000-0000-000000000001',preview->>'digest');leave_id:=(result->>'id')::uuid;
 if public.rh_calendar_filtered(profile,session_id,null,'2027-03-01',0,'','{"status":"com_afastamento","type":"banco_horas"}')->>'total'<>'1'
  or public.rh_calendar_filtered(profile,session_id,null,'2027-03-01',0,'','{"status":"sem_afastamento"}')->>'total'<>'65'
  or public.rh_calendar_filtered(profile,session_id,null,'2027-03-01',0,'','{"type":"premio"}')->>'total'<>'0' then raise exception 'FILTER_ACTIVE_TYPE';end if;
 perform public.rh_close_leave(profile,session_id,null,leave_id,1,'cancelada','Cancelamento fictício');
 result:=public.rh_calendar_filtered(profile,session_id,null,'2027-03-01',0,'','{"status":"cancelada"}');
 if result->>'total'<>'1' or jsonb_array_length(result->'absences')<>0 or result->'records'->0->>'status'<>'cancelada' then raise exception 'FILTER_CANCELLED';end if;
 if public.rh_calendar_filtered(profile,session_id,null,'2027-03-01',0,'','{"type":"banco_horas"}')->>'total'<>'1' then raise exception 'FILTER_TYPE_LOST_CANCELLED';end if;
 if public.rh_calendar_filtered(profile,session_id,null,'2027-04-01',0,'','{"status":"cancelada"}')->>'total'<>'0' then raise exception 'FILTER_WRONG_MONTH';end if;
 begin
  perform public.rh_calendar_filtered(profile,session_id,null,'2027-03-01',0,'','{"status":"inexistente"}');raise exception 'FILTER_INVALID_ALLOWED';
 exception when others then if sqlerrm<>'RH_INPUT_INVALID' then raise;end if;end;
 begin
  perform public.rh_calendar_filtered(profile,session_id,'f6000000-0000-0000-0000-000000000102','2027-03-01',0,'','{}');raise exception 'FILTER_CROSS_UNIT';
 exception when others then if sqlerrm<>'RH_BOND_OUT_OF_UNIT' then raise;end if;end;
 if has_function_privilege('authenticated','public.rh_calendar_filtered(uuid,uuid,uuid,date,integer,text,jsonb)','execute') then raise exception 'FILTER_DIRECT_CLIENT';end if;
end $$;
