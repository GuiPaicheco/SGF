reset role;
insert into auth.sessions(id,user_id) values('fa000000-0000-0000-0000-000000000100','f6000000-0000-0000-0000-000000000001');
set local role service_role;
do $$
declare actor uuid:='f6000000-0000-0000-0000-000000000001';unit_id uuid:='f6000000-0000-0000-0000-000000000100';
 entry uuid;bond uuid;person uuid;result jsonb;preview jsonb;leave_id uuid;historical jsonb;rev bigint;profile uuid;grant_id uuid;prize jsonb;prize_id uuid;right_id uuid;
 source jsonb:='{"cns":"900000000000001","cbo":"123456","fullName":"CNES PESSOA FICTÍCIA","occupation":"CARGO DA FONTE","weeklyHours":40,"hoursOther":0,"hoursAmbulatory":40,"hoursHospital":0,"relationship":"VINCULO EMPREGATICIO","relationshipType":"ESTATUTARIO EFETIVO","relationshipSubtype":"PROPRIO","status":"ativo","teams":[]}';
 items jsonb;item jsonb:='{"type":"regulamentar","regime":"efetivo","startDate":"2027-03-01","admissionDate":"2020-01-01","acquisitionStart":"2025-01-01","acquisitionEnd":"2025-12-31","absenceCount":0,"familyLeaveDays":0,"personalLeaveDays":0,"spouseLeaveDays":0,"healthLeaveDays":0,"suspended":false,"cltLoss":false,"regularLicenseLoss":false,"managerConsent":true,"eligibilityConfirmed":true,"protocolDate":"2026-01-01","recognitionReference":"Processo sintético"}';
begin
 items:=jsonb_build_array(jsonb_build_object('sourceId',repeat('e',64),'sourceHash',repeat('f',64),'sourceData',source));
 result:=public.apply_cnes_reviewed(actor,unit_id,items,repeat('1',64),now(),'202610',0,'[]',jsonb_build_array(repeat('e',64)),'{"origin":"CNES_PDF"}');
 select e.id,e.servidor_id,m.bond_id into entry,person,bond from private.cnes_registry_entries e join private.rh_registry_bonds m on m.entry_id=e.id where e.source_id=repeat('e',64);
 if entry is null or (select registration from public.employment_bonds where id=bond) is not null then raise exception 'MATRICULA_REQUIRED_OR_FABRICATED';end if;
 if not exists(select 1 from private.rh_calendar_employees(unit_id) where entry_id=entry and position='CARGO DA FONTE' and binding_confirmed) then raise exception 'SOURCE_POSITION_MISSING';end if;
 preview:=public.rh_preview_leave(actor,'fa000000-0000-0000-0000-000000000100',unit_id,entry,item);
 result:=public.rh_create_leave(actor,'fa000000-0000-0000-0000-000000000100',unit_id,entry,item,'fa000000-0000-0000-0000-000000000001',preview->>'digest');leave_id:=(result->>'id')::uuid;
 result:=public.rh_create_leave(actor,'fa000000-0000-0000-0000-000000000100',unit_id,entry,item,'fa000000-0000-0000-0000-000000000001',preview->>'digest');
 if result->>'replayed'<>'true' then raise exception 'IDEMPOTENCY_FAILED';end if;
 begin perform public.rh_preview_leave(actor,'fa000000-0000-0000-0000-000000000100',unit_id,entry,item||'{"type":"banco_horas"}');raise exception 'BANK_ALLOWED';exception when others then if sqlerrm<>'RH_LEAVE_MODALITY_DISABLED' then raise;end if;end;
 select profile_id into profile from private.rh_unit_accounts where cnes_unit_id=unit_id;
 begin perform public.rh_leave_resources(profile,'f6000000-0000-0000-0000-000000000200',null,entry);raise exception 'OPERATOR_NOT_REQUIRED';exception when others then if sqlerrm<>'RH_OPERATOR_REQUIRED' then raise;end if;end;
 result:=public.rh_grant_operator(actor,unit_id,entry,true,0);grant_id:=(result->>'id')::uuid;
 perform public.rh_select_operator(profile,'f6000000-0000-0000-0000-000000000200',grant_id);
 perform public.rh_leave_resources(profile,'f6000000-0000-0000-0000-000000000200',null,entry);
 begin perform public.rh_leave_resources(profile,'f6000000-0000-0000-0000-000000000200',null,'f6000000-0000-0000-0000-000000000301');raise exception 'UNIT_SCOPE_BROKEN';exception when others then if sqlerrm<>'RH_BOND_OUT_OF_UNIT' then raise;end if;end;
 item:=item||'{"startDate":"2027-03-08"}';
 preview:=public.rh_preview_leave_revision(actor,'fa000000-0000-0000-0000-000000000100',unit_id,leave_id,1,item);
 result:=public.rh_revise_leave(actor,'fa000000-0000-0000-0000-000000000100',unit_id,leave_id,1,item,'fa000000-0000-0000-0000-000000000002',preview->>'digest','Reprogramação sintética');
 if result->>'version'<>'2' then raise exception 'REVISION_FAILED';end if;
 select to_jsonb(l) into historical from private.rh_leaves l where l.id=leave_id;
 source:=source||'{"fullName":"NOME ATUALIZADO FICTÍCIO","weeklyHours":30,"hoursAmbulatory":30}';
 items:=jsonb_build_array(jsonb_build_object('sourceId',repeat('e',64),'sourceHash',repeat('a',64),'sourceData',source));
 select revision into rev from private.cnes_registry_state where cnes_unit_id=unit_id;
 perform public.apply_cnes_reviewed(actor,unit_id,items,repeat('2',64),now(),'202611',rev,'[]',jsonb_build_array(repeat('e',64)),'{}');
 if (select bond_id from private.rh_registry_bonds where entry_id=entry)<>bond then raise exception 'BOND_REPLACED';end if;
 if (select to_jsonb(l) from private.rh_leaves l where l.id=leave_id)<>historical then raise exception 'LEAVE_REWRITTEN';end if;
 result:=public.rh_calendar_window(actor,null,unit_id,'2027-02-25','2027-03-10',0,'NOME ATUALIZADO','{}');
 if jsonb_array_length(result->'absences')<>1 then raise exception 'RANGE_LOST_LEAVE';end if;
 select revision into rev from private.cnes_registry_state where cnes_unit_id=unit_id;
 perform public.apply_cnes_reviewed(actor,unit_id,items,repeat('3',64),now(),'202612',rev,jsonb_build_array(repeat('e',64)),'[]','{}');
 result:=public.rh_calendar_window(actor,null,unit_id,'2027-02-25','2027-03-10',0,'NOME ATUALIZADO','{}');
 if jsonb_array_length(result->'absences')<>1 then raise exception 'ABSENT_EMPLOYEE_HISTORY_HIDDEN';end if;
 begin perform public.rh_leave_resources(actor,'fa000000-0000-0000-0000-000000000100',unit_id,entry);raise exception 'ABSENT_ALLOWED_TO_PROGRAM';exception when others then if sqlerrm<>'RH_ENTRY_REVIEW_REQUIRED' then raise;end if;end;
 if (select to_jsonb(l) from private.rh_leaves l where l.id=leave_id)<>historical then raise exception 'ABSENCE_REWROTE_LEAVE';end if;
 select revision into rev from private.cnes_registry_state where cnes_unit_id=unit_id;
 perform public.apply_cnes_reviewed(actor,unit_id,items,repeat('4',64),now(),'202701',rev,'[]',jsonb_build_array(repeat('e',64)),'{}');
 if not exists(select 1 from private.rh_calendar_employees(unit_id) where entry_id=entry and binding_confirmed) then raise exception 'REACTIVATION_FAILED';end if;
 if (select to_jsonb(l) from private.rh_leaves l where l.id=leave_id)<>historical then raise exception 'REACTIVATION_REWROTE_LEAVE';end if;
 select revision into rev from private.cnes_registry_state where cnes_unit_id=unit_id;
 begin perform public.apply_cnes_reviewed(actor,unit_id,items,repeat('5',64),now(),'202601',rev,'[]',jsonb_build_array(repeat('e',64)),'{}');raise exception 'OLDER_COMPETENCE_ACCEPTED';
 exception when others then if sqlerrm<>'CNES_STALE_COLLECTION' then raise;end if;end;
 prize:=item||'{"type":"premio","acquisitionStart":"2020-01-01","acquisitionEnd":"2024-12-31","prizeCycle":1,"split":"30-60","secondStartDate":"2028-06-01","startDate":"2027-06-01","employeeConsent":true,"historicalUsedDays":0}';
 preview:=public.rh_preview_leave(actor,'fa000000-0000-0000-0000-000000000100',unit_id,entry,prize);
 result:=public.rh_create_leave(actor,'fa000000-0000-0000-0000-000000000100',unit_id,entry,prize,'fa000000-0000-0000-0000-000000000003',preview->>'digest');prize_id:=(result->>'id')::uuid;
 begin perform public.rh_preview_leave(actor,'fa000000-0000-0000-0000-000000000100',unit_id,entry,prize);raise exception 'PRIZE_BALANCE_REUSED';exception when others then if sqlerrm<>'RH_LEAVE_RIGHT_INVALID' then raise;end if;end;
 begin perform public.rh_close_leave(actor,'fa000000-0000-0000-0000-000000000100',unit_id,prize_id,2,'cancelada','Versão desatualizada');raise exception 'STALE_CANCEL_ALLOWED';exception when others then if sqlerrm<>'RH_VERSION_CONFLICT' then raise;end if;end;
 begin perform public.rh_close_leave(actor,'fa000000-0000-0000-0000-000000000100',unit_id,prize_id,1,'concluida','Conclusão futura');raise exception 'FUTURE_COMPLETION_ALLOWED';exception when others then if sqlerrm<>'RH_LEAVE_NOT_ENDED' then raise;end if;end;
 perform public.rh_close_leave(actor,'fa000000-0000-0000-0000-000000000100',unit_id,prize_id,1,'cancelada','Cancelamento sintético');
 if not exists(select 1 from private.rh_leaves where id=prize_id and status='cancelada' and plan->'legal'->>'version'='betim-2026-10-18') then raise exception 'CANCEL_REMOVED_LEGAL_HISTORY';end if;
 if not exists(select 1 from private.rh_leave_revisions r where r.leave_id=(historical->>'id')::uuid and r.version=1 and r.plan->'legal'->>'version'='betim-2026-10-18') then raise exception 'REVISION_SNAPSHOT_LOST';end if;
 perform public.rh_preview_leave(actor,'fa000000-0000-0000-0000-000000000100',unit_id,entry,prize);
 insert into public.vacation_rights(servidor_id,bond_id,type,acquisition_start,acquisition_end,available_days,source_reference)
 values(person,bond,'premio','2020-01-01','2024-12-31',30,'Fixture saldo conhecido') returning id into right_id;
 begin perform public.rh_preview_leave(actor,'fa000000-0000-0000-0000-000000000100',unit_id,entry,prize);raise exception 'KNOWN_BALANCE_IGNORED';exception when others then if sqlerrm<>'RH_LEAVE_RIGHT_INVALID' then raise;end if;end;
 begin perform public.rh_calendar_window(actor,null,unit_id,'2027-01-01','2028-01-01',0,'','{}');raise exception 'UNBOUNDED_RANGE';exception when others then if sqlerrm<>'RH_INPUT_INVALID' then raise;end if;end;
end $$;

-- Criação e reprogramação simplificadas passam pelas mesmas transações e saldos.
do $$
declare actor uuid:='f6000000-0000-0000-0000-000000000001';unit_id uuid:='f6000000-0000-0000-0000-000000000100';entry uuid;preview jsonb;result jsonb;leave_id uuid;
item jsonb:='{"entryMode":"simplified","type":"regulamentar","regime":"efetivo","acquisitionEnd":"2026-12-31","startDate":"2028-03-01","recognitionReference":"Processo sintético simplificado","absenceCount":0,"familyLeaveDays":0,"personalLeaveDays":0,"spouseLeaveDays":0,"healthLeaveDays":0,"suspended":false,"cltLoss":false,"regularLicenseLoss":false,"split":"none"}';
begin
 select id into strict entry from private.cnes_registry_entries where cnes_unit_id=unit_id and source_id=repeat('e',64);
 preview:=public.rh_preview_leave(actor,'fa000000-0000-0000-0000-000000000100',unit_id,entry,item);
 result:=public.rh_create_leave(actor,'fa000000-0000-0000-0000-000000000100',unit_id,entry,item,'fa000000-0000-0000-0000-000000000004',preview->>'digest');leave_id:=(result->>'id')::uuid;
 if not exists(select 1 from private.rh_leaves where id=leave_id and plan->>'acquisition_start'='2026-01-01' and plan->'admission_date'='null'::jsonb and plan->>'confirmation_collection'='not_collected_in_sgf' and plan->'legal'->'protocol_date'='null'::jsonb and plan->>'notice_verified'='false') then raise exception 'SIMPLIFIED_CREATE_INVENTED_DATA';end if;
 item:=item||'{"startDate":"2028-05-02"}';
 preview:=public.rh_preview_leave_revision(actor,'fa000000-0000-0000-0000-000000000100',unit_id,leave_id,1,item);
 perform public.rh_revise_leave(actor,'fa000000-0000-0000-0000-000000000100',unit_id,leave_id,1,item,'fa000000-0000-0000-0000-000000000005',preview->>'digest','Reprogramação sintética simplificada');
 if not exists(select 1 from private.rh_leave_revisions where private.rh_leave_revisions.leave_id=(result->>'id')::uuid and version=1 and plan->'eligibility_confirmed'='null'::jsonb) then raise exception 'SIMPLIFIED_REVISION_LOST_HISTORY';end if;
end $$;

-- Cadastro de aniversário pelo RH: escopo, versão, privacidade e histórico.
do $$
declare actor uuid:='f6000000-0000-0000-0000-000000000001';unit_id uuid:='f6000000-0000-0000-0000-000000000100';entry uuid;profile uuid;result jsonb;grant_id uuid;before_history jsonb;after_history jsonb;
session uuid:='f6000000-0000-0000-0000-000000000200';
begin
 select id into strict entry from private.cnes_registry_entries where cnes_unit_id=unit_id and source_id=repeat('e',64);
 select profile_id into profile from private.rh_unit_accounts where cnes_unit_id=unit_id;
 begin perform public.rh_employee_profile(profile,'f6000000-0000-0000-0000-000000000201',entry);raise exception 'NO_OPERATOR_PROFILE_ALLOWED';exception when others then if sqlerrm<>'RH_OPERATOR_REQUIRED' then raise;end if;end;
 result:=public.rh_grant_operator(actor,unit_id,'f6000000-0000-0000-0000-000000000300',true,0);grant_id:=(result->>'id')::uuid;
 perform public.rh_select_operator(profile,session,grant_id);
 select coalesce(jsonb_agg(to_jsonb(l) order by id),'[]') into before_history from private.rh_leaves l where cnes_unit_id=unit_id;
 result:=public.rh_employee_profile(profile,session,entry);if result ? 'birth_date' or result->>'version'<>'0' then raise exception 'PROFILE_LEAK_OR_WRONG_VERSION';end if;
 result:=public.rh_save_employee_birthday(profile,session,entry,0,2,29);
 if result->>'birthday'<>'02-29' or result->>'version'<>'1' then raise exception 'BIRTHDAY_SAVE_FAILED';end if;
 begin perform public.rh_save_employee_birthday(profile,session,entry,0,3,1);raise exception 'BIRTHDAY_CONFLICT_IGNORED';exception when others then if sqlerrm<>'RH_VERSION_CONFLICT' then raise;end if;end;
 begin perform public.rh_save_employee_birthday(profile,session,entry,1,4,31);raise exception 'INVALID_BIRTHDAY_ALLOWED';exception when others then if sqlerrm<>'RH_INPUT_INVALID' then raise;end if;end;
 begin perform public.rh_employee_profile(profile,session,'f6000000-0000-0000-0000-000000000301');raise exception 'OTHER_UNIT_PROFILE_ALLOWED';exception when others then if sqlerrm<>'RH_BOND_OUT_OF_UNIT' then raise;end if;end;
 result:=public.rh_calendar_window(profile,session,null,'2028-02-01','2028-02-29',0,'','{}');
 if not exists(select 1 from jsonb_array_elements(result->'employees') r where (r->>'entry_id')::uuid=entry and r->>'birth_month_day'='02-29' and not r ? 'birth_date') then raise exception 'BIRTHDAY_CALENDAR_MISSING';end if;
 if result->>'source_competence' is null then raise exception 'COMPETENCE_MISSING';end if;
 perform public.rh_save_employee_birthday(profile,session,entry,1,null,null);
 if public.rh_employee_profile(profile,session,entry)->'birthday'<>'null'::jsonb then raise exception 'BIRTHDAY_CLEAR_FAILED';end if;
 select coalesce(jsonb_agg(to_jsonb(l) order by id),'[]') into after_history from private.rh_leaves l where cnes_unit_id=unit_id;
 if before_history is distinct from after_history then raise exception 'BIRTHDAY_REWROTE_LEAVE';end if;
 if has_table_privilege('authenticated','private.rh_employee_birthdays','select') or has_function_privilege('authenticated','public.rh_save_employee_birthday(uuid,uuid,uuid,integer,integer,integer)','execute') then raise exception 'BIRTHDAY_DIRECT_ACCESS';end if;
end $$;


-- Alertas entre pessoas: critérios em interseção, equipes múltiplas e paginação.
-- Toda esta fixture é executada em BEGIN/ROLLBACK.
do $$
declare actor uuid:='f6000000-0000-0000-0000-000000000001';unit_id uuid:='f6000000-0000-0000-0000-000000000100';
 entry uuid;other_entry uuid;third_entry uuid;bond uuid;other_bond uuid;third_bond uuid;source jsonb;items jsonb;rev bigint;result jsonb;preview jsonb;second_leave uuid;
 item jsonb:='{"entryMode":"simplified","type":"regulamentar","regime":"efetivo","acquisitionEnd":"2028-12-31","startDate":"2029-05-02","recognitionReference":"Fixture conflito","absenceCount":0,"familyLeaveDays":0,"personalLeaveDays":0,"spouseLeaveDays":0,"healthLeaveDays":0,"suspended":false,"cltLoss":false,"regularLicenseLoss":false,"split":"none"}';
begin
 select id,source_data into strict entry,source from private.cnes_registry_entries where cnes_unit_id=unit_id and source_id=repeat('e',64);
 update private.cnes_registry_entries set source_data=source_data||'{"teams":[{"name":"EQUIPE A"},{"name":"EQUIPE B"}]}' where id=entry;
 source:=source||'{"fullName":"ZZZ SEGUNDA PESSOA","cns":"900000000000002","teams":[{"name":"EQUIPE B"}]}';
 items:=jsonb_build_array(jsonb_build_object('sourceId',repeat('2',64),'sourceHash',repeat('2',64),'sourceData',source),jsonb_build_object('sourceId',repeat('3',64),'sourceHash',repeat('3',64),'sourceData',source||'{"fullName":"ZZZ TERCEIRA PESSOA","cns":"900000000000003","cbo":"654321"}'));
 select revision into rev from private.cnes_registry_state where cnes_unit_id=unit_id;
 perform public.apply_cnes_reviewed(actor,unit_id,items,repeat('5',64),now(),'202701',rev,'[]',jsonb_build_array(repeat('2',64),repeat('3',64)),'{}');
 select e.id,m.bond_id into other_entry,other_bond from private.cnes_registry_entries e join private.rh_registry_bonds m on m.entry_id=e.id where e.source_id=repeat('2',64);
 select e.id,m.bond_id into third_entry,third_bond from private.cnes_registry_entries e join private.rh_registry_bonds m on m.entry_id=e.id where e.source_id=repeat('3',64);
 select bond_id into bond from private.rh_registry_bonds where entry_id=entry;
 for entry in select unnest(array[entry,other_entry,third_entry]) loop
  preview:=public.rh_preview_leave(actor,'fa000000-0000-0000-0000-000000000100',unit_id,entry,item);
  result:=public.rh_create_leave(actor,'fa000000-0000-0000-0000-000000000100',unit_id,entry,item,pg_catalog.gen_random_uuid(),preview->>'digest');
  if entry=other_entry then second_leave:=(result->>'id')::uuid;end if;
 end loop;
 -- A segunda pessoa está além da primeira página; o catálogo e o alerta a incluem.
 insert into private.cnes_registry_entries(cnes_unit_id,source_id,source_hash,source_data)
 select unit_id,md5('facet-'||g)||md5('facet-'||g),repeat('6',64),jsonb_build_object('fullName','AAA PESSOA '||g,'status','ativo','occupation','CARGO SEM FÉRIAS','cbo','000001','teams','[]'::jsonb) from generate_series(1,55) g;
 result:=public.rh_calendar_window(actor,null,unit_id,'2029-05-02','2029-05-03',0,'','{"conflict_criteria":["cbo"]}');
 if jsonb_array_length(result->'employees')<>50 or jsonb_array_length(result->'facets'->'full_name')<58 or not result->'facets'->'team' ? 'Não se aplica' then raise exception 'UNIT_FACETS_INCOMPLETE';end if;
 if jsonb_array_length(result->'conflicts')<>2 or jsonb_array_length(result->'conflicts'->0->'bond_ids')<>2 then raise exception 'CBO_CONFLICT_WRONG';end if;
 result:=public.rh_calendar_window(actor,null,unit_id,'2029-05-02','2029-05-03',0,'','{"conflict_criteria":["position","cbo","team"],"conflict_only":true}');
 if result->>'total'<>'2' then raise exception 'CONFLICT_NOT_BEFORE_PAGINATION_OR_NOT_AND';end if;
 result:=public.rh_calendar_window(actor,null,unit_id,'2029-05-02','2029-05-03',0,'','{"conflict_criteria":["team"],"conflict_only":true}');
 if result->>'total'<>'3' then raise exception 'MULTITEAM_CONFLICT_LOST';end if;
 result:=public.rh_calendar_window(actor,null,unit_id,'2029-05-02','2029-05-03',0,'ZZZ SEGUNDA','{"conflict_criteria":["cbo"]}');
 if result->>'total'<>'1' or jsonb_array_length(result->'conflicts'->0->'bond_ids')<>2 then raise exception 'SEARCH_HID_CONFLICT_PEER';end if;
 result:=public.rh_calendar_window(actor,null,unit_id,'2029-05-02','2029-05-03',0,'','{"team":["EQUIPE A"],"cbo":["123456"]}');
 if result->>'total'<>'1' then raise exception 'EXACT_MULTISELECT_TEAM_LOST';end if;
 result:=public.rh_calendar_window(actor,null,unit_id,'2029-05-02','2029-05-03',0,'','{"team":["EQUIPE"]}');
 if result->>'total'<>'0' then raise exception 'CHECKBOX_FILTER_NOT_EXACT';end if;
 perform public.rh_close_leave(actor,'fa000000-0000-0000-0000-000000000100',unit_id,second_leave,1,'cancelada','Fixture cancelamento conflito');
 result:=public.rh_calendar_window(actor,null,unit_id,'2029-05-02','2029-05-03',0,'','{"conflict_criteria":["cbo"]}');
 if result->'conflicts'<>'[]'::jsonb then raise exception 'CANCELLED_LEAVE_CAUSED_CONFLICT';end if;
 -- Dois vínculos da mesma pessoa não representam dois profissionais afastados.
 update public.employment_bonds set servidor_id=(select servidor_id from public.employment_bonds where id=bond) where id=third_bond;
 result:=public.rh_calendar_window(actor,null,unit_id,'2029-05-02','2029-05-03',0,'','{"conflict_criteria":["position"]}');
 if result->'conflicts'<>'[]'::jsonb then raise exception 'SAME_PERSON_COUNTED_TWICE';end if;
 begin perform public.rh_calendar_window(actor,null,unit_id,'2029-05-02','2029-05-03',0,'','{"conflict_criteria":["invalid"]}');raise exception 'BAD_CRITERION_ALLOWED';exception when others then if sqlerrm<>'RH_INPUT_INVALID' then raise;end if;end;
end $$;
