-- Invariantes de dados e regra já aplicada à reprogramação; não introduz prazo legal novo.
create function private.validate_submission_dates(payload jsonb,target_bond_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare admission date; birth date; acquisition date; p jsonb; start_day date; end_day date; return_day date;
 previous_return date; quantity integer; total integer:=0;
begin
 if jsonb_typeof(payload->'periods') is distinct from 'array' or jsonb_array_length(payload->'periods') not between 1 and 2 then raise exception 'SUBMISSION_PERIOD_INVALID'; end if;
 select coalesce(b.admission_date,nullif(payload->>'admissionDate','')::date),s.birth_date into admission,birth
 from public.employment_bonds b join public.servidores s on s.id=b.servidor_id where b.id=target_bond_id;
 acquisition:=nullif(payload->>'acquisitionEnd','')::date;
 if admission is null or birth is null or admission<birth or (acquisition is not null and acquisition<admission) then raise exception 'SUBMISSION_ADMISSION_RULE'; end if;
 for p in select value from jsonb_array_elements(payload->'periods') loop
  start_day:=(p->>'start_date')::date; end_day:=(p->>'end_date')::date; return_day:=(p->>'return_date')::date;quantity:=(p->>'days')::integer;
  if start_day is null or end_day is null or return_day is null or quantity is null or quantity not between 1 and 90
    or end_day<start_day or return_day<=end_day or quantity>end_day-start_day+1 or start_day<previous_return
    or p->>'counting_mode' is null or p->>'counting_mode' not in ('uteis','corridos') then raise exception 'SUBMISSION_PERIOD_INVALID'; end if;
  if start_day<admission then raise exception 'SUBMISSION_ADMISSION_RULE'; end if;
  if payload->>'type'='regulamentar' and (acquisition is null or start_day<=acquisition) then raise exception 'SUBMISSION_ACQUISITION_RULE'; end if;
  total:=total+quantity;previous_return:=return_day;
 end loop;
 if total>90 then raise exception 'SUBMISSION_PERIOD_INVALID'; end if;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
 raise exception 'SUBMISSION_PERIOD_INVALID';
end $$;
revoke all on function private.validate_submission_dates(jsonb,uuid) from public,anon,authenticated;
grant execute on function private.validate_submission_dates(jsonb,uuid) to service_role;
do $$ declare definition text; patched text; begin
 definition:=pg_get_functiondef('public.register_contextual_vacation_submission(jsonb,uuid,uuid,uuid)'::regprocedure);
 patched:=replace(definition,'  perform private.planning_lock();',E'  perform private.planning_lock();\n  perform private.validate_submission_dates(payload,target_bond_id);');
 if patched=definition then raise exception 'SUBMISSION_GUARD_PATCH_NOT_APPLIED'; end if;
 execute patched;
end $$;
