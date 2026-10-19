-- Art. 77: não cria prazo de caducidade; segunda parcela em ano posterior.
-- Requerimento do servidor também é conferido na parcela remanescente.
create or replace function private.rh_make_leave_plan(resources jsonb,item jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 kind text:=item->>'type'; regime text:=item->>'regime'; admission date; acquisition_start date; acquisition_end date;
 protocol date; start_day date; desired_return date; cursor_day date; end_day date; return_day date; previous_end date;
 quantity integer; mode text; split text:=coalesce(item->>'split','none'); parts integer[]; starts date[]; idx integer;
 absences integer; family_days integer; personal_days integer; spouse_days integer; health_days integer; historical integer; cycle integer;
 excluded date[]; periods jsonb:='[]'; p jsonb; warnings jsonb:='[]'; basis text; used integer; scanned integer; reference text; is_revision boolean:=coalesce((item->>'revision')::boolean,false);
begin
 if jsonb_typeof(item) is distinct from 'object' or octet_length(item::text)>10000 then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 if kind is null or kind not in ('regulamentar','premio') then raise exception 'RH_LEAVE_MODALITY_DISABLED';end if;
 if regime is null or regime not in ('efetivo','comissionado','contratado_estatutario','acs_ace_estatutario','celetista') then raise exception 'RH_LEAVE_REGIME_REQUIRED';end if;
 if (item->>'eligibilityConfirmed')::boolean is distinct from true or (item->>'managerConsent')::boolean is distinct from true
  or jsonb_typeof(item->'suspended') is distinct from 'boolean' or jsonb_typeof(item->'cltLoss') is distinct from 'boolean' then raise exception 'RH_LEAVE_CONFIRMATION_REQUIRED';end if;
 reference:=btrim(coalesce(item->>'recognitionReference',''));
 if length(reference) not between 3 and 300 then raise exception 'RH_LEAVE_EVIDENCE_REQUIRED';end if;
 -- O enquadramento é conferido pelo RH, não inferido de CBO, nome ou simples vínculo CNES.
 admission:=coalesce(nullif(resources->>'admission_date','')::date,nullif(item->>'admissionDate','')::date);
 if admission is null or admission<>nullif(item->>'admissionDate','')::date then raise exception 'RH_LEAVE_IDENTITY_REQUIRED';end if;
 acquisition_start:=nullif(item->>'acquisitionStart','')::date;acquisition_end:=nullif(item->>'acquisitionEnd','')::date;
 protocol:=nullif(item->>'protocolDate','')::date;
 if acquisition_start is null or acquisition_end is null or acquisition_start<admission or acquisition_end<acquisition_start
  or protocol is null or protocol>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'RH_LEAVE_ACQUISITION_INVALID';end if;
 absences:=coalesce((item->>'absenceCount')::integer,-1);family_days:=coalesce((item->>'familyLeaveDays')::integer,-1);
 personal_days:=coalesce((item->>'personalLeaveDays')::integer,-1);spouse_days:=coalesce((item->>'spouseLeaveDays')::integer,-1);health_days:=coalesce((item->>'healthLeaveDays')::integer,-1);
 if least(absences,family_days,personal_days,spouse_days,health_days)<0 or greatest(absences,family_days,personal_days,spouse_days,health_days)>3000 then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 if item ?| array['availableHours','dailyHours','extraHours','override','overrideReason'] then raise exception 'RH_LEAVE_MODALITY_DISABLED';end if;
 if kind='premio' then
  if regime<>'efetivo' then raise exception 'RH_LEAVE_PRIZE_INELIGIBLE';end if;
  cycle:=coalesce((item->>'prizeCycle')::integer,0);historical:=coalesce((item->>'historicalUsedDays')::integer,0);
  if cycle not between 1 and 7 or acquisition_end<(acquisition_start+interval '5 years')::date-1 or acquisition_end>(acquisition_start+interval '5 years')::date then raise exception 'RH_LEAVE_ACQUISITION_INVALID';end if;
  if absences>10 or (item->>'suspended')::boolean or health_days>180 or family_days>120 or personal_days>0 or spouse_days>90 then raise exception 'RH_LEAVE_PRIZE_INELIGIBLE';end if;
  if historical not in (0,30,60) then raise exception 'RH_LEAVE_RIGHT_INVALID';end if;
  quantity:=90-historical;mode:='corridos';basis:='Lei 884/1969, art. 75, redação da Lei 6.174/2017; Lei Orgânica, art. 56, III e §2º';
  if historical=0 then
   if split not in ('30-60','60-30') then raise exception 'RH_LEAVE_SPLIT_INVALID';end if;
   parts:=array[split_part(split,'-',1)::integer,split_part(split,'-',2)::integer];
  else
   if split<>'none' or nullif(item->>'previousPrizeStart','') is null then raise exception 'RH_LEAVE_SPLIT_INVALID';end if;
   parts:=array[quantity];
  end if;
 else
  if acquisition_end<(acquisition_start+interval '1 year')::date-1 or acquisition_end>(acquisition_start+interval '1 year')::date then raise exception 'RH_LEAVE_ACQUISITION_INVALID';end if;
  if regime='celetista' then
   if (item->>'cltLoss')::boolean or absences>32 then raise exception 'RH_LEAVE_REGULAR_INELIGIBLE';end if;
   if (item->>'scheduleConfirmed')::boolean is distinct from true then raise exception 'RH_LEAVE_SCHEDULE_REQUIRED';end if;
   quantity:=case when absences<=5 then 30 when absences<=14 then 24 when absences<=23 then 18 else 12 end;mode:='corridos';basis:='CLT, arts. 130, 133, 134 e 135 (vínculo CLT e jornada segunda a sexta confirmados)';
   if item ? 'parts' then select array_agg(v::integer order by ord) into parts from jsonb_array_elements_text(item->'parts') with ordinality x(v,ord);else parts:=array[quantity];end if;
   if cardinality(parts) not between 1 and 3 or (select sum(v) from unnest(parts) v)<>quantity or (select min(v) from unnest(parts) v)<1
    or (cardinality(parts)>1 and ((select max(v) from unnest(parts) v)<14 or (select min(v) from unnest(parts) v)<5)) then raise exception 'RH_LEAVE_SPLIT_INVALID';end if;
  else
   if jsonb_typeof(item->'regularLicenseLoss') is distinct from 'boolean' then raise exception 'RH_LEAVE_CONFIRMATION_REQUIRED';end if;
   if (item->>'regularLicenseLoss')::boolean then raise exception 'RH_LEAVE_REGULAR_INELIGIBLE';end if;
   if acquisition_end>=date '2025-12-02' then quantity:=case when absences>9 then 16 else 25 end;mode:='uteis';basis:='Lei 7.989/2025; Decreto 51.744/2025';
   else quantity:=case when absences>9 then 20 else 30 end;mode:='corridos';basis:='Lei 884/1969, art. 70 (redação anterior); Decreto 42.240/2020; transição oficial de 02/12/2025';end if;
   parts:=array[quantity];
   if split<>'none' then
    if regime<>'efetivo' or absences>9 then raise exception 'RH_LEAVE_SPLIT_INVALID';end if;
    if (mode='uteis' and split not in ('15-10','10-15')) or (mode='corridos' and split<>'15-15') then raise exception 'RH_LEAVE_SPLIT_INVALID';end if;
    parts:=array[split_part(split,'-',1)::integer,split_part(split,'-',2)::integer];
   end if;
  end if;
 end if;
 if (kind='premio' or cardinality(parts)>1) and (item->>'employeeConsent')::boolean is distinct from true then raise exception 'RH_LEAVE_CONFIRMATION_REQUIRED';end if;
 select coalesce(array_agg(event_date),'{}') into excluded from public.calendar_events where active and type='feriado';
 if coalesce(item->>'dateMode','start') not in ('start','return') then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 if item->>'dateMode'='return' then
  if nullif(item->>'startDate','') is not null then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
  desired_return:=nullif(item->>'returnDate','')::date;
  if desired_return is null or extract(dow from desired_return) in (0,6) or desired_return=any(excluded) then raise exception 'RH_LEAVE_RETURN_INVALID';end if;
  if mode='corridos' then start_day:=desired_return-parts[1];
  else
   cursor_day:=desired_return-1;used:=0;scanned:=0;
   while used<parts[1] loop
    scanned:=scanned+1;if scanned>730 then raise exception 'RH_LEAVE_RETURN_INVALID';end if;
    if extract(dow from cursor_day) not in (0,6) and not cursor_day=any(excluded) then used:=used+1;end if;
    if used<parts[1] then cursor_day:=cursor_day-1;end if;
   end loop;start_day:=cursor_day;
  end if;
 else
  if nullif(item->>'returnDate','') is not null then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
  start_day:=nullif(item->>'startDate','')::date;
 end if;
 if start_day is null or start_day<=acquisition_end or start_day<admission or start_day<date '1900-01-01' then raise exception 'RH_LEAVE_ACQUISITION_INVALID';end if;
 starts:=array[start_day,nullif(item->>'secondStartDate','')::date,nullif(item->>'thirdStartDate','')::date];
 if kind='premio' and historical>0 and extract(year from start_day)<=extract(year from (item->>'previousPrizeStart')::date) then raise exception 'RH_LEAVE_PRIZE_YEAR_INVALID';end if;
 for idx in 1..cardinality(parts) loop
  cursor_day:=starts[idx];
  if cursor_day is null or (idx>1 and cursor_day<=previous_end) or cursor_day<start_day or cursor_day>start_day+1100 then raise exception 'RH_LEAVE_SPLIT_INVALID';end if;
  if kind='premio' and idx=2 and extract(year from cursor_day)<=extract(year from start_day) then raise exception 'RH_LEAVE_PRIZE_YEAR_INVALID';end if;
  if kind='regulamentar' and mode='corridos' and regime<>'celetista' and idx=2 and date_trunc('month',cursor_day)=date_trunc('month',start_day) then raise exception 'RH_LEAVE_SPLIT_INVALID';end if;
  if protocol>cursor_day-(case when regime='celetista' then 30 when is_revision and kind='regulamentar' then 45 else 60 end) then raise exception 'RH_LEAVE_NOTICE_REQUIRED';end if;
  if regime='celetista' then
   if extract(dow from cursor_day) in (0,5,6) or cursor_day=any(excluded) or cursor_day+1=any(excluded) or cursor_day+2=any(excluded) then raise exception 'RH_LEAVE_CLT_START_INVALID';end if;
   if cursor_day>(acquisition_end+interval '1 year')::date then warnings:=warnings||jsonb_build_array('Período concessivo CLT ultrapassado: conferir repercussões do art. 137 com o RH.');end if;
  end if;
  if mode='corridos' then end_day:=cursor_day+parts[idx]-1;
  else
   used:=0;scanned:=0;
   loop
    scanned:=scanned+1;if scanned>730 then raise exception 'RH_LEAVE_DATES_INVALID';end if;
    if extract(dow from cursor_day) not in (0,6) and not cursor_day=any(excluded) then used:=used+1;end if;
    exit when used=parts[idx];cursor_day:=cursor_day+1;
   end loop;end_day:=cursor_day;
  end if;
  return_day:=end_day+1;scanned:=0;
  while extract(dow from return_day) in (0,6) or return_day=any(excluded) loop
   scanned:=scanned+1;if scanned>730 then raise exception 'RH_LEAVE_DATES_INVALID';end if;return_day:=return_day+1;
  end loop;
  if idx=1 and desired_return is not null and return_day<>desired_return then raise exception 'RH_LEAVE_RETURN_INVALID';end if;
  if end_day>date '2100-12-31' or return_day>date '2100-12-31' then raise exception 'RH_LEAVE_DATES_INVALID';end if;
  p:=jsonb_build_object('sequence',idx,'start_date',starts[idx],'end_date',end_day,'return_date',return_day,'days',parts[idx],'counting_mode',mode);
  periods:=periods||jsonb_build_array(p);previous_end:=end_day;
 end loop;
 warnings:=warnings||jsonb_build_array('Conferência baseada nos assentamentos declarados pelo RH; CNES não comprova saldo, faltas ou licenças.');
 if regime in ('comissionado','contratado_estatutario','acs_ace_estatutario') then warnings:=warnings||jsonb_build_array('Conferir alcance do vínculo municipal; contratado, comissionado sem vínculo efetivo e função pública não podem acumular dois períodos.');end if;
 if kind='regulamentar' and regime<>'celetista' then warnings:=warnings||jsonb_build_array('Conferir acúmulo: programar antes da abertura do terceiro período aquisitivo.');end if;
 return jsonb_build_object('type',kind,'periods',periods,'days',quantity,'vacation_days',quantity,'counting_mode',mode,
  'acquisition_start',acquisition_start,'acquisition_end',acquisition_end,'admission_date',admission,'date_mode',coalesce(item->>'dateMode','start'),'requested_return',desired_return,
  'bank',jsonb_build_object('declared_minutes',0,'daily_minutes',0,'required_minutes',0,'missing_minutes',0,'override',false),
  'can_save',true,'notes',coalesce(item->>'notes',''),'eligibility_confirmed',true,
  'legal',jsonb_build_object('version','betim-2026-10-18','basis',basis,'regime',regime,'reference',reference,'protocol_date',protocol,'evidence',item-array['startDate','returnDate','secondStartDate','thirdStartDate','revision'],'warnings',warnings));
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then raise exception 'RH_LEAVE_INPUT_INVALID';
end $$;
