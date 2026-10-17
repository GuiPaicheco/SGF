-- Preparar com a fundação de rh-accounts, sempre sob BEGIN/ROLLBACK.
do $$
declare actor uuid:='f6000000-0000-0000-0000-000000000001';unit_id uuid:='f6000000-0000-0000-0000-000000000100';
 entry uuid:='f6000000-0000-0000-0000-000000000300';profile uuid;session uuid:='f6000000-0000-0000-0000-000000000200';
 result jsonb;bond uuid;person uuid;grant_id uuid;request_id uuid;count_before integer;
begin
 select profile_id into profile from private.rh_unit_accounts where cnes_unit_id=unit_id;
 select count(*) into count_before from public.servidores;
 begin perform public.rh_bind_registry_bond(actor,entry,1,null,0,true,'Conferência fictícia');raise exception 'PENDING_ENTRY_ACCEPTED';
 exception when others then if sqlerrm<>'RH_ENTRY_REVIEW_REQUIRED' then raise;end if;end;
 perform public.review_cnes_registry_entry(actor,entry,1,'{"registration":"RH-CAL-001","municipalPosition":"CARGO TESTE","admissionDate":"2020-01-01","employmentType":"estatutario","weeklyHours":32.5,"teamLabel":"EQUIPE TESTE"}',null);
 begin perform public.rh_bind_registry_bond(actor,entry,2,null,0,false,'Conferência fictícia');raise exception 'IMPLICIT_POLE_ACCEPTED';
 exception when others then if sqlerrm<>'RH_BINDING_INPUT_INVALID' then raise;end if;end;
 result:=public.rh_bind_registry_bond(actor,entry,2,null,0,true,'Conferência fictícia');bond:=(result->>'bond_id')::uuid;
 select servidor_id into person from public.employment_bonds where id=bond;
 if (select profile_id from public.servidores where id=person) is not null or (select cpf from public.servidores where id=person) is not null then raise exception 'PERSON_FAKE_AUTH_IDENTITY';end if;
 if (select pole_cnes_unit_id from public.employment_bonds where id=bond)<>unit_id then raise exception 'POLE_NOT_EXPLICIT';end if;
 if (select count(*) from public.servidores)<>count_before+1 then raise exception 'PERSON_COUNT_CHANGED';end if;
 result:=public.rh_registry_bond_options(actor,entry);
 if jsonb_array_length(result->'bonds')<>1 or result->'binding'->>'bond_id'<>bond::text then raise exception 'BINDING_OPTIONS_FAILED';end if;
 begin perform public.rh_bind_registry_bond(actor,entry,2,bond,1,true,'Conferência fictícia');raise exception 'STALE_ENTRY_ACCEPTED';
 exception when others then if sqlerrm<>'RH_VERSION_CONFLICT' then raise;end if;end;
 result:=public.rh_bind_registry_bond(actor,entry,3,bond,1,true,'Reconfirmação fictícia');
 if (select count(*) from public.servidores)<>count_before+1 then raise exception 'DUPLICATE_PERSON';end if;
 result:=public.rh_grant_operator(actor,unit_id,entry,true,0);grant_id:=(result->>'id')::uuid;
 begin perform public.rh_calendar_month(profile,session,null,'2026-11-01',0,'');raise exception 'OPERATOR_NOT_REQUIRED';
 exception when others then if sqlerrm<>'RH_OPERATOR_REQUIRED' then raise;end if;end;
 perform public.rh_select_operator(profile,session,grant_id);
 result:=public.rh_calendar_month(profile,session,null,'2026-11-01',0,'');
 if jsonb_array_length(result->'employees')<>1 or result->'employees'->0->>'binding_confirmed'<>'true'
  or result->'employees'->0->>'weekly_hours'<>'32.5' then raise exception 'CALENDAR_BINDING_PROJECTION_FAILED';end if;
 if result::text like '%"cns"%' or result::text like '%"cpf"%' then raise exception 'CALENDAR_EXPOSES_IDENTIFIERS';end if;
 insert into public.vacation_requests(servidor_id,type,status,start_date,end_date,return_date,context_bond_id,context_cnes_unit_id,created_by)
 values(person,'regulamentar','programada','2026-11-03','2026-11-05','2026-11-06',bond,unit_id,actor) returning id into request_id;
 insert into public.request_periods(request_id,sequence,start_date,end_date,return_date,days,counting_mode)
 values(request_id,1,'2026-11-03','2026-11-05','2026-11-06',3,'corridos');
 result:=public.rh_calendar_month(profile,session,null,'2026-11-01',0,'CARGO TESTE');
 if jsonb_array_length(result->'absences')<>1 or result->'absences'->0->>'origin'<>'legado' then raise exception 'LEGACY_CALENDAR_MISSING';end if;
 result:=public.rh_calendar_month(profile,session,null,'2026-12-01',0,'');
 if jsonb_array_length(result->'absences')<>0 then raise exception 'MONTH_FILTER_FAILED';end if;
 result:=public.rh_calendar_month(profile,session,null,'2026-11-01',0,'%');
 if (result->>'total')::int<>0 then raise exception 'SEARCH_WILDCARD_EXPANDED';end if;
 begin perform public.rh_calendar_month(profile,session,'f6000000-0000-0000-0000-000000000102','2026-11-01',0,'');raise exception 'OTHER_UNIT_CALENDAR_ALLOWED';
 exception when others then if sqlerrm<>'RH_BOND_OUT_OF_UNIT' then raise;end if;end;
 begin perform public.rh_calendar_month(profile,session,null,'2026-11-02',0,'');raise exception 'UNBOUNDED_MONTH_ALLOWED';
 exception when others then if sqlerrm<>'RH_INPUT_INVALID' then raise;end if;end;
 result:=public.rh_calendar_month(actor,null,unit_id,'2026-11-01',0,'');
 if (result->>'total')::int<>1 then raise exception 'ADMIN_CALENDAR_FAILED';end if;
 update private.cnes_registry_entries set review_status='pending',version=version+1 where id=entry;
 result:=public.rh_calendar_month(profile,session,null,'2026-11-01',0,'');
 if result->'employees'->0->>'binding_confirmed'<>'false' or jsonb_array_length(result->'absences')<>1 then raise exception 'SOURCE_CHANGE_LOST_HISTORY';end if;
 perform public.rh_grant_operator(actor,unit_id,entry,false,1);
 begin perform public.rh_calendar_month(profile,session,null,'2026-11-01',0,'');raise exception 'REVOKED_CALENDAR_ALLOWED';
 exception when others then if sqlerrm<>'RH_OPERATOR_REQUIRED' then raise;end if;end;
 if has_table_privilege('authenticated','private.rh_registry_bonds','select')
  or has_function_privilege('authenticated','public.rh_calendar_month(uuid,uuid,uuid,date,integer,text)','execute') then raise exception 'DIRECT_CALENDAR_API_ALLOWED';end if;
end $$;
reset role;
select 'RH calendar: vínculo sem Auth, polo explícito, versão, dados fracionados, legado, mês, busca e isolamento aprovados' as result;
