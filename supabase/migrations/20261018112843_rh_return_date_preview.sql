-- Cálculo inverso compartilha as regras da programação e da revisão. Não altera registros históricos.
create or replace function private.rh_make_leave_plan(resources jsonb,item jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare kind text:=item->>'type';birth date;admission date;acquisition date;start_day date;second_start date;mode text;quantity integer;first_days integer;
 daily numeric;available numeric;requested_extra numeric;required_minutes integer:=0;available_minutes integer:=0;extra_days integer:=0;
 excluded date[];periods jsonb:='[]';p jsonb;split text:=coalesce(item->>'split','none');deficit integer:=0;notes text;date_mode text:=coalesce(item->>'dateMode','start');desired_return date;cursor_day date;used integer:=0;scanned integer:=0;
begin
 if jsonb_typeof(item) is distinct from 'object' or octet_length(item::text)>8000 or kind is null or kind not in ('regulamentar','premio','banco_horas')
  or (item->>'eligibilityConfirmed')::boolean is distinct from true then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 birth:=coalesce(nullif(resources->>'birth_date','')::date,nullif(item->>'birthDate','')::date);
 admission:=nullif(resources->>'admission_date','')::date;
 if birth is null or admission is null or birth>admission or birth<date '1900-01-01' then raise exception 'RH_LEAVE_IDENTITY_REQUIRED';end if;
 if nullif(item->>'birthDate','') is not null and birth<>(item->>'birthDate')::date then raise exception 'RH_LEAVE_IDENTITY_REQUIRED';end if;
 if date_mode not in ('start','return') then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 if date_mode='return' then
  if nullif(item->>'startDate','') is not null then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
  desired_return:=nullif(item->>'returnDate','')::date;start_day:=desired_return;
 else
  if nullif(item->>'returnDate','') is not null then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
  start_day:=(item->>'startDate')::date;
 end if;
 if start_day is null or start_day<admission or start_day not between date '1900-01-01' and date '2100-12-31' then raise exception 'RH_LEAVE_DATES_INVALID';end if;
 notes:=coalesce(item->>'notes','');if length(notes)>1000 then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 available:=coalesce(nullif(item->>'availableHours','')::numeric,0);daily:=coalesce(nullif(item->>'dailyHours','')::numeric,0);
 requested_extra:=coalesce(nullif(item->>'extraHours','')::numeric,0);
 if available not between 0 and 2160 or requested_extra not between 0 and 2160 or available*60<>trunc(available*60)
  or requested_extra*60<>trunc(requested_extra*60) then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 if kind='banco_horas' or requested_extra>0 then
  if daily<=0 or daily>24 or daily*60<>trunc(daily*60) then raise exception 'RH_LEAVE_DAILY_HOURS_REQUIRED';end if;
 end if;
 if kind='banco_horas' then quantity:=(item->>'days')::integer;mode:='uteis';required_minutes:=quantity*daily*60;
 elsif kind='premio' then
  quantity:=(item->>'days')::integer;mode:='corridos';
  if quantity is null or quantity not in (30,60,90) or requested_extra<>0 then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 else
  acquisition:=nullif(item->>'acquisitionEnd','')::date;
  if acquisition is null or acquisition<admission or start_day<=acquisition then raise exception 'RH_LEAVE_ACQUISITION_INVALID';end if;
  if admission>=date '2025-12-02' or acquisition>=date '2025-12-02' then
   mode:='uteis';
   if item->>'unjustifiedAbsences'='yes' then quantity:=16;
   elsif item->>'unjustifiedAbsences'='no' then quantity:=25;
   else raise exception 'RH_LEAVE_INPUT_INVALID';end if;
   if quantity=25 and requested_extra>0 then extra_days:=floor(requested_extra/daily)::integer;end if;
   if requested_extra=0 then extra_days:=0;end if;
   if requested_extra>0 and quantity<>25 then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
   quantity:=quantity+coalesce(extra_days,0);required_minutes:=extra_days*daily*60;
  else mode:='corridos';quantity:=30;if requested_extra>0 then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
  end if;
 end if;
 if quantity is null or quantity not between 1 and 90 or daily not between 0 and 24 then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 available_minutes:=available*60;deficit:=greatest(required_minutes-available_minutes,0);
 if (item->>'override')::boolean is true and (deficit=0 or length(btrim(coalesce(item->>'overrideReason',''))) not between 3 and 500) then raise exception 'RH_LEAVE_OVERRIDE_INVALID';end if;
 if length(coalesce(item->>'overrideReason',''))>500 then raise exception 'RH_LEAVE_OVERRIDE_INVALID';end if;
 select coalesce(array_agg(event_date),'{}') into excluded from public.calendar_events where active and event_date between (case when date_mode='return' then start_day-730 else start_day end) and start_day+1100;
 first_days:=quantity;
 if split<>'none' then
  if kind<>'regulamentar' or resources->>'employment_type'<>'efetivo' or item->>'unjustifiedAbsences'<>'no'
   or mode<>'uteis' or quantity<>25 or split not in ('15-10','10-15') then raise exception 'RH_LEAVE_SPLIT_INVALID';end if;
  first_days:=split_part(split,'-',1)::integer;
 end if;
 if date_mode='return' then
  if extract(dow from desired_return) in (0,6) or desired_return=any(excluded)
   or to_char(desired_return,'MM-DD')=to_char(birth,'MM-DD') then raise exception 'RH_LEAVE_RETURN_INVALID';end if;
  if mode='corridos' then start_day:=desired_return-first_days;
  else
   cursor_day:=desired_return-1;
   while used<first_days loop
    scanned:=scanned+1;if scanned>730 then raise exception 'RH_LEAVE_RETURN_INVALID';end if;
    if extract(dow from cursor_day) not in (0,6) and not cursor_day=any(excluded)
     and to_char(cursor_day,'MM-DD')<>to_char(birth,'MM-DD') then used:=used+1;end if;
    if used<first_days then cursor_day:=cursor_day-1;end if;
   end loop;
   start_day:=cursor_day;
  end if;
  if start_day<admission or start_day not between date '1900-01-01' and date '2100-12-31' then raise exception 'RH_LEAVE_DATES_INVALID';end if;
  if kind='regulamentar' and start_day<=acquisition then raise exception 'RH_LEAVE_ACQUISITION_INVALID';end if;
 end if;
 p:=private.calculate_preserved_period(start_day,first_days,mode,birth,excluded);
 if date_mode='return' and (p->>'return_date')::date<>desired_return then raise exception 'RH_LEAVE_RETURN_INVALID';end if;periods:=periods||jsonb_build_array(p||jsonb_build_object('sequence',1));
 if split<>'none' then
  second_start:=nullif(item->>'secondStartDate','')::date;
  if second_start is null or second_start<(p->>'return_date')::date or second_start>start_day+730 then raise exception 'RH_LEAVE_SPLIT_INVALID';end if;
  p:=private.calculate_preserved_period(second_start,split_part(split,'-',2)::integer,mode,birth,excluded);
  periods:=periods||jsonb_build_array(p||jsonb_build_object('sequence',2));
 end if;
 if (periods->-1->>'end_date')::date>date '2100-12-31' then raise exception 'RH_LEAVE_DATES_INVALID';end if;
 return (case when date_mode='return' then jsonb_build_object('date_mode','return','requested_return',desired_return) else '{}'::jsonb end)||jsonb_build_object('type',kind,'periods',periods,'days',quantity,'vacation_days',case when kind='banco_horas' then 0 else quantity-extra_days end,'counting_mode',mode,'acquisition_end',acquisition,'birth_date',birth,
  'bank',jsonb_build_object('declared_minutes',available_minutes,'daily_minutes',daily*60,'required_minutes',required_minutes,'missing_minutes',deficit,
   'possible_days',case when daily>0 then floor(available/daily) else null end,'override',deficit>0 and coalesce((item->>'override')::boolean,false),
   'override_reason',case when deficit>0 and (item->>'override')::boolean then btrim(item->>'overrideReason') else null end),
  'can_save',deficit=0 or coalesce((item->>'override')::boolean,false),'notes',notes,'eligibility_confirmed',true);
exception when invalid_text_representation or division_by_zero or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then raise exception 'RH_LEAVE_INPUT_INVALID';
end $$;
