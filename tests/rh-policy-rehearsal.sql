-- Executar em transação de teste. Somente dados sintéticos; nenhum direito real é criado.
do $$
declare r jsonb:='{"admission_date":"2020-01-01"}';i jsonb; p jsonb; patch jsonb;expected text;baseline text;
begin
 i:='{"type":"regulamentar","regime":"efetivo","admissionDate":"2020-01-01","acquisitionStart":"2025-01-01","acquisitionEnd":"2025-12-31","startDate":"2027-03-01","protocolDate":"2026-01-01","recognitionReference":"TESTE SINTETICO","absenceCount":0,"familyLeaveDays":0,"personalLeaveDays":0,"spouseLeaveDays":0,"healthLeaveDays":0,"suspended":false,"cltLoss":false,"regularLicenseLoss":false,"eligibilityConfirmed":true,"managerConsent":true,"employeeConsent":true,"split":"none"}';
 p:=private.rh_make_leave_plan(r,i);baseline:=p->'periods'->0->>'end_date';
 insert into public.calendar_events(event_date,type,name,active) values('2027-03-02','ponto_facultativo','TESTE PONTO',true);
 p:=private.rh_make_leave_plan(r||'{"birth_date":"1990-03-03"}',i);if p->'periods'->0->>'end_date'<>baseline then raise exception 'POINT_OR_BIRTHDAY_EXTENDED_LEAVE';end if;
 insert into public.calendar_events(event_date,type,name,active) values('2027-03-03','feriado','TESTE FERIADO',true);
 p:=private.rh_make_leave_plan(r,i);if p->'periods'->0->>'end_date'=baseline then raise exception 'HOLIDAY_WAS_COUNTED';end if;
 delete from public.calendar_events where name in ('TESTE PONTO','TESTE FERIADO');
 p:=private.rh_make_leave_plan(r,i);if p->>'vacation_days'<>'25' or p->>'counting_mode'<>'uteis' then raise exception 'NEW_RULE_FAILED';end if;
 p:=private.rh_make_leave_plan(r,i||'{"absenceCount":10}');if p->>'vacation_days'<>'16' then raise exception 'REDUCTION_16_FAILED';end if;
 p:=private.rh_make_leave_plan(r,i||'{"acquisitionStart":"2024-12-01","acquisitionEnd":"2025-11-30"}');if p->>'vacation_days'<>'30' then raise exception 'OLD_RULE_FAILED';end if;
 p:=private.rh_make_leave_plan(r,i||'{"acquisitionStart":"2024-12-01","acquisitionEnd":"2025-11-30","absenceCount":10}');if p->>'vacation_days'<>'20' then raise exception 'REDUCTION_20_FAILED';end if;
 p:=private.rh_make_leave_plan(r,i||'{"split":"10-15","secondStartDate":"2027-06-01"}');if jsonb_array_length(p->'periods')<>2 then raise exception 'SPLIT_FAILED';end if;
 p:=private.rh_make_leave_plan(r,i||'{"acquisitionStart":"2024-12-01","acquisitionEnd":"2025-11-30","split":"15-15","secondStartDate":"2027-05-03"}');if p->'periods'->1->>'days'<>'15' then raise exception 'OLD_SPLIT_FAILED';end if;
 -- A virada da regra é inclusiva em 02/12/2025.
 p:=private.rh_make_leave_plan(r,i||'{"acquisitionStart":"2024-12-03","acquisitionEnd":"2025-12-02"}');if p->>'vacation_days'<>'25' then raise exception 'CUTOVER_FAILED';end if;
 for patch,expected in select * from (values
  ('{"type":"banco_horas"}'::jsonb,'RH_LEAVE_MODALITY_DISABLED'),('{"extraHours":8}'::jsonb,'RH_LEAVE_MODALITY_DISABLED'),
  ('{"regime":"especial"}'::jsonb,'RH_LEAVE_REGIME_REQUIRED'),('{"managerConsent":false}'::jsonb,'RH_LEAVE_CONFIRMATION_REQUIRED'),
  ('{"split":"10-15","regime":"comissionado","secondStartDate":"2027-06-01"}'::jsonb,'RH_LEAVE_SPLIT_INVALID'),
  ('{"split":"10-15","absenceCount":10,"secondStartDate":"2027-06-01"}'::jsonb,'RH_LEAVE_SPLIT_INVALID'),
  ('{"regularLicenseLoss":true}'::jsonb,'RH_LEAVE_REGULAR_INELIGIBLE'),
  ('{"protocolDate":"2027-02-28"}'::jsonb,'RH_LEAVE_ACQUISITION_INVALID'),
  ('{"protocolDate":"2026-10-01","startDate":"2026-11-01"}'::jsonb,'RH_LEAVE_NOTICE_REQUIRED'),
  ('{"acquisitionStart":"2025-08-01"}'::jsonb,'RH_LEAVE_ACQUISITION_INVALID')) v(a,b) loop
  begin perform private.rh_make_leave_plan(r,i||patch);raise exception 'BLOCK_MISSING_%',expected;exception when others then if sqlerrm<>expected then raise;end if;end;
 end loop;
 -- CLT exige confirmação de escala e aplica a tabela de faltas, sem adotar os 25 úteis municipais.
 p:=private.rh_make_leave_plan(r,i||'{"regime":"celetista","scheduleConfirmed":true,"absenceCount":6,"parts":[14,10],"secondStartDate":"2027-06-01"}');
 if p->>'vacation_days'<>'24' then raise exception 'CLT_REDUCTION_FAILED';end if;
 p:=private.rh_make_leave_plan(r,i||'{"regime":"celetista","scheduleConfirmed":true,"parts":[14,8,8],"secondStartDate":"2027-06-01","thirdStartDate":"2027-09-01"}');if jsonb_array_length(p->'periods')<>3 then raise exception 'CLT_THIRD_PART_FAILED';end if;
 begin perform private.rh_make_leave_plan(r,i||'{"regime":"celetista","scheduleConfirmed":true,"parts":[10,10,10],"secondStartDate":"2027-06-01","thirdStartDate":"2027-09-01"}');raise exception 'CLT_SMALL_PART_ACCEPTED';exception when others then if sqlerrm<>'RH_LEAVE_SPLIT_INVALID' then raise;end if;end;
 i:=i||'{"type":"premio","acquisitionStart":"2020-01-01","acquisitionEnd":"2024-12-31","prizeCycle":1,"split":"30-60","secondStartDate":"2028-03-01","historicalUsedDays":0}';
 p:=private.rh_make_leave_plan(r,i);if p->>'vacation_days'<>'90' or p->'periods'->0->>'days'<>'30' or p->'periods'->1->>'days'<>'60' then raise exception 'PRIZE_SPLIT_FAILED';end if;
 for patch,expected in select * from (values
  ('{"split":"none"}'::jsonb,'RH_LEAVE_SPLIT_INVALID'),('{"regime":"comissionado"}'::jsonb,'RH_LEAVE_PRIZE_INELIGIBLE'),
  ('{"absenceCount":11}'::jsonb,'RH_LEAVE_PRIZE_INELIGIBLE'),('{"healthLeaveDays":181}'::jsonb,'RH_LEAVE_PRIZE_INELIGIBLE'),
  ('{"familyLeaveDays":121}'::jsonb,'RH_LEAVE_PRIZE_INELIGIBLE'),('{"personalLeaveDays":1}'::jsonb,'RH_LEAVE_PRIZE_INELIGIBLE'),
  ('{"spouseLeaveDays":91}'::jsonb,'RH_LEAVE_PRIZE_INELIGIBLE'),('{"suspended":true}'::jsonb,'RH_LEAVE_PRIZE_INELIGIBLE'),
  ('{"prizeCycle":8}'::jsonb,'RH_LEAVE_ACQUISITION_INVALID'),('{"secondStartDate":"2027-09-01"}'::jsonb,'RH_LEAVE_PRIZE_YEAR_INVALID'))v(a,b)loop
  begin perform private.rh_make_leave_plan(r,i||patch);raise exception 'PRIZE_BLOCK_MISSING_%',expected;exception when others then if sqlerrm<>expected then raise;end if;end;
 end loop;
 p:=private.rh_make_leave_plan(r,i||'{"split":"none","historicalUsedDays":60,"previousPrizeStart":"2026-03-01"}');if p->>'vacation_days'<>'30' then raise exception 'REMAINING_FAILED';end if;
end $$;
