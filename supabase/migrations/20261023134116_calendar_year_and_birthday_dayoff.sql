-- Calendário: limite inclusivo até a véspera do aniversário de 12 meses.

-- Day-off: aniversário confirmado pelo RH (anual) ou data específica registrada pelo RH.
create function private.rh_dayoff_dates(target_bond uuid) returns date[]
language sql stable security invoker set search_path='' as $$
 select coalesce(array_agg(distinct d order by d),'{}'::date[]) from (
 select (p->>'start_date')::date d from private.rh_leaves l cross join lateral jsonb_array_elements(l.plan->'periods') p
 where l.bond_id=target_bond and l.status<>'cancelada' and l.plan->>'type'='dayoff'
 union
 select candidate::date from private.rh_employee_birthdays b cross join generate_series(1900,2100) y
 cross join lateral (select make_date(y,b.birthday_month,1)+(b.birthday_day-1) candidate) c
 where b.bond_id=target_bond and b.birthday_month is not null and extract(month from candidate)=b.birthday_month
 ) days;
$$;

-- Recalcula apenas a duração em dias úteis, conservando início, quantidade e aquisição.
create function private.rh_apply_dayoffs(target_bond uuid,original_plan jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare off_days date[];holidays date[];periods jsonb:='[]';used_off date[]:='{}';p jsonb;
 cursor_day date;end_day date;return_day date;used integer;scanned integer;quantity integer;previous_end date;
begin
 if original_plan->>'type'<>'regulamentar' or original_plan->>'counting_mode'<>'uteis' then return original_plan;end if;
 off_days:=private.rh_dayoff_dates(target_bond);
 select coalesce(array_agg(event_date),'{}') into holidays from public.calendar_events where active and type='feriado';
 for p in select value from jsonb_array_elements(original_plan->'periods') loop
  cursor_day:=(p->>'start_date')::date;quantity:=(p->>'days')::integer;used:=0;scanned:=0;
  if quantity not between 1 and 90 then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
  if previous_end is not null and cursor_day<=previous_end then raise exception 'RH_DAYOFF_RECALC_CONFLICT';end if;
  loop
   scanned:=scanned+1;if scanned>730 then raise exception 'RH_LEAVE_DATES_INVALID';end if;
   if extract(dow from cursor_day) not in (0,6) and not cursor_day=any(holidays) and not cursor_day=any(off_days) then used:=used+1;end if;
   exit when used=quantity;cursor_day:=cursor_day+1;
  end loop;
  end_day:=cursor_day;return_day:=end_day+1;scanned:=0;
  while extract(dow from return_day) in (0,6) or return_day=any(holidays) or return_day=any(off_days) loop
   scanned:=scanned+1;if scanned>730 then raise exception 'RH_LEAVE_DATES_INVALID';end if;return_day:=return_day+1;
  end loop;
  if return_day>date '2100-12-31' then raise exception 'RH_LEAVE_DATES_INVALID';end if;
  select coalesce(array_agg(distinct d order by d),'{}') into used_off from unnest(used_off||off_days) d
   where d=any(used_off) or (d>=(p->>'start_date')::date and d<return_day);
  periods:=periods||jsonb_build_array(p||jsonb_build_object('end_date',end_day,'return_date',return_day));
  previous_end:=end_day;
 end loop;
 return original_plan||jsonb_build_object('periods',periods,'day_offs',to_jsonb(used_off),'dayoff_policy','explicit_rh_business_days_v1');
end $$;

create function private.rh_recalculate_dayoffs(target_bond uuid,actor_id uuid,operator_label text,declared boolean) returns integer
language plpgsql security invoker set search_path='' as $$
declare l private.rh_leaves%rowtype;updated_plan jsonb;p jsonb;changed integer:=0;
begin
 perform private.planning_lock();
 for l in select * from private.rh_leaves where bond_id=target_bond and status='programada'
  and plan->>'type'='regulamentar' and plan->>'counting_mode'='uteis' order by id for update loop
  updated_plan:=private.rh_apply_dayoffs(target_bond,l.plan);
  -- Metadado vazio não altera versões nem regrava férias não afetadas.
  if updated_plan->'periods'=l.plan->'periods' and coalesce(updated_plan->'day_offs','[]')=coalesce(l.plan->'day_offs','[]') then continue;end if;
  for p in select value from jsonb_array_elements(updated_plan->'periods') loop
   if exists(select 1 from private.rh_leaves other cross join lateral jsonb_array_elements(other.plan->'periods') z
    where other.id<>l.id and other.bond_id=target_bond and other.status<>'cancelada' and other.plan->>'type'<>'dayoff'
    and (z->>'start_date')::date<=(p->>'end_date')::date and (z->>'end_date')::date>=(p->>'start_date')::date)
    or exists(select 1 from public.vacation_requests v join public.request_periods z on z.request_id=v.id
      where v.context_bond_id=target_bond and v.status not in ('cancelada','rejeitada','rascunho','devolvida')
      and z.start_date<=(p->>'end_date')::date and z.end_date>=(p->>'start_date')::date)
    then raise exception 'RH_DAYOFF_RECALC_CONFLICT';end if;
  end loop;
  insert into private.rh_leave_revisions(leave_id,version,snapshot,plan,status,changed_by,operator_name,operator_declared,reason)
   values(l.id,l.version,l.snapshot,l.plan,l.status,actor_id,operator_label,declared,'Recálculo por cadastro/cancelamento de day-off de aniversário');
  update private.rh_leaves set plan=updated_plan,version=version+1 where id=l.id;
  insert into public.audit_events(actor_id,action,entity_type,entity_id,context_bond_id,context_cnes_unit_id,reason,previous_value,new_value)
   values(actor_id,'rh_leave_dayoff_recalculated','rh_leave',l.id,l.bond_id,l.cnes_unit_id,
    'Day-off de aniversário excluído da contagem de férias úteis',
    jsonb_build_object('version',l.version,'periods',l.plan->'periods','day_offs',l.plan->'day_offs'),
    jsonb_build_object('version',l.version+1,'periods',updated_plan->'periods','day_offs',updated_plan->'day_offs','operator_name',operator_label));
  changed:=changed+1;
 end loop;
 return changed;
end $$;
revoke all on function private.rh_dayoff_dates(uuid),private.rh_apply_dayoffs(uuid,jsonb),private.rh_recalculate_dayoffs(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function private.rh_dayoff_dates(uuid),private.rh_apply_dayoffs(uuid,jsonb),private.rh_recalculate_dayoffs(uuid,uuid,text,boolean) to service_role;

CREATE OR REPLACE FUNCTION private.rh_make_leave_plan(resources jsonb, item jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 kind text:=item->>'type'; regime text:=item->>'regime'; admission date; acquisition_start date; acquisition_end date;
 protocol date; start_day date; desired_return date; cursor_day date; end_day date; return_day date; previous_end date;
 quantity integer; mode text; split text:=coalesce(item->>'split','none'); parts integer[]; starts date[]; idx integer;
 absences integer; family_days integer; personal_days integer; spouse_days integer; health_days integer; historical integer; cycle integer;
 excluded date[]; periods jsonb:='[]'; p jsonb; warnings jsonb:='[]'; basis text; used integer; scanned integer; reference text; is_revision boolean:=coalesce((item->>'revision')::boolean,false); simplified boolean:=coalesce(item->>'entryMode','')='simplified';
begin
 if jsonb_typeof(item) is distinct from 'object' or octet_length(item::text)>10000 then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 if kind is null or kind not in ('regulamentar','premio') then raise exception 'RH_LEAVE_MODALITY_DISABLED';end if;
 if regime is null or regime not in ('efetivo','comissionado','contratado_estatutario','acs_ace_estatutario','celetista') then raise exception 'RH_LEAVE_REGIME_REQUIRED';end if;
 if ((not simplified) and ((item->>'eligibilityConfirmed')::boolean is distinct from true or (item->>'managerConsent')::boolean is distinct from true))
  or jsonb_typeof(item->'suspended') is distinct from 'boolean' or jsonb_typeof(item->'cltLoss') is distinct from 'boolean' then raise exception 'RH_LEAVE_CONFIRMATION_REQUIRED';end if;
 reference:=btrim(coalesce(item->>'recognitionReference',''));
 if length(reference) not between (case when simplified then 1 else 3 end) and 300 then raise exception 'RH_LEAVE_EVIDENCE_REQUIRED';end if;
 -- O enquadramento é conferido pelo RH, não inferido de CBO, nome ou simples vínculo CNES.
 admission:=coalesce(nullif(resources->>'admission_date','')::date,nullif(item->>'admissionDate','')::date);
 if ((not simplified) and (admission is null or admission<>nullif(item->>'admissionDate','')::date))
  or (nullif(item->>'admissionDate','') is not null and admission<>nullif(item->>'admissionDate','')::date) then raise exception 'RH_LEAVE_IDENTITY_REQUIRED';end if;
 acquisition_start:=nullif(item->>'acquisitionStart','')::date;acquisition_end:=nullif(item->>'acquisitionEnd','')::date;
 if simplified and acquisition_start is null and acquisition_end is not null then
  acquisition_start:=((acquisition_end+1)-case when kind='premio' then interval '5 years' else interval '1 year' end)::date;
 end if;
 protocol:=nullif(item->>'protocolDate','')::date;
 if acquisition_start is null or acquisition_end is null or acquisition_start<admission or acquisition_end<acquisition_start
  or (not simplified and protocol is null) or protocol>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'RH_LEAVE_ACQUISITION_INVALID';end if;
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
 if not simplified and (kind='premio' or cardinality(parts)>1) and (item->>'employeeConsent')::boolean is distinct from true then raise exception 'RH_LEAVE_CONFIRMATION_REQUIRED';end if;
 select coalesce(array_agg(event_date),'{}') into excluded from public.calendar_events where active and type='feriado';
 if mode='uteis' then excluded:=excluded||private.rh_dayoff_dates(nullif(resources->>'bond_id','')::uuid);end if;
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
 if protocol is null then warnings:=warnings||jsonb_build_array('Prazo de comunicação não verificado no SGF; conferir no processo ou memorando.');end if;
 warnings:=warnings||jsonb_build_array('Conferência baseada nos assentamentos declarados pelo RH; CNES não comprova saldo, faltas ou licenças.');
 if regime in ('comissionado','contratado_estatutario','acs_ace_estatutario') then warnings:=warnings||jsonb_build_array('Conferir alcance do vínculo municipal; contratado, comissionado sem vínculo efetivo e função pública não podem acumular dois períodos.');end if;
 if kind='regulamentar' and regime<>'celetista' then warnings:=warnings||jsonb_build_array('Conferir acúmulo: programar antes da abertura do terceiro período aquisitivo.');end if;
 return jsonb_build_object('type',kind,'periods',periods,'days',quantity,'vacation_days',quantity,'counting_mode',mode,
  'day_offs',case when mode='uteis' then (select coalesce(jsonb_agg(d order by d),'[]') from unnest(private.rh_dayoff_dates(nullif(resources->>'bond_id','')::uuid)) d where exists(select 1 from jsonb_array_elements(periods) q where d>=(q->>'start_date')::date and d<(q->>'return_date')::date)) else '[]'::jsonb end,
  'acquisition_start',acquisition_start,'acquisition_end',acquisition_end,'admission_date',admission,'date_mode',coalesce(item->>'dateMode','start'),'requested_return',desired_return,
  'bank',jsonb_build_object('declared_minutes',0,'daily_minutes',0,'required_minutes',0,'missing_minutes',0,'override',false),
  'can_save',true,'notes',coalesce(item->>'notes',''),'eligibility_confirmed',case when simplified then null else true end,
  'confirmation_collection',case when simplified then 'not_collected_in_sgf' else 'legacy_checkboxes' end,
  'notice_verified',protocol is not null,
  'legal',jsonb_build_object('version',case when simplified then 'betim-2026-10-19-direct' else 'betim-2026-10-18' end,'basis',basis,'regime',regime,'reference',reference,'protocol_date',protocol,'evidence',item-array['startDate','returnDate','secondStartDate','thirdStartDate','revision'],'warnings',warnings));
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then raise exception 'RH_LEAVE_INPUT_INVALID';
end $function$
;
CREATE OR REPLACE FUNCTION public.rh_calendar_window(target_profile uuid, target_session uuid, target_cnes uuid, range_start date, range_end date, page_index integer DEFAULT 0, search_text text DEFAULT ''::text, filter_json jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
 SET statement_timeout TO '8s'
AS $function$
declare selection jsonb;context jsonb;unit_id uuid;employees jsonb;bond_ids uuid[];rows_count integer;last_day date;result jsonb;ids uuid[];extra jsonb;records jsonb;facets jsonb;conflicts jsonb;conflict_bonds uuid[];
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'RH_NOT_ALLOWED';end if;
 if range_start is null or range_start not between date '1900-01-01' and date '2100-12-31' or range_end is null or range_end<range_start or range_end >= (range_start+interval '1 year')::date
  or page_index is null or page_index not between 0 and 100 or search_text is null or length(search_text)>120 then raise exception 'RH_INPUT_INVALID';end if;

 if filter_json is null or jsonb_typeof(filter_json)<>'object' or octet_length(filter_json::text)>32000 then raise exception 'RH_INPUT_INVALID';end if;
 if exists(select 1 from jsonb_each(filter_json) kv where kv.key not in ('full_name','position','cbo','team','review','type','status','conflict_criteria','conflict_only')
 or case when kv.key='conflict_only' then jsonb_typeof(kv.value)<>'boolean'
 when kv.key in ('full_name','position','cbo','team','conflict_criteria') and jsonb_typeof(kv.value)='array' then jsonb_array_length(kv.value)>200 or exists(select 1 from jsonb_array_elements(kv.value) x where jsonb_typeof(x)<>'string' or length(x#>>'{}')>240)
 else jsonb_typeof(kv.value)<>'string' or length(kv.value#>>'{}')>120 end) then raise exception 'RH_INPUT_INVALID';end if;
 if filter_json ? 'conflict_criteria' and (jsonb_typeof(filter_json->'conflict_criteria')<>'array' or exists(select 1 from jsonb_array_elements_text(filter_json->'conflict_criteria') x where x not in ('position','cbo','team'))) then raise exception 'RH_INPUT_INVALID';end if;
 filter_json:=jsonb_build_object('position','','cbo','','team','','review','todos','type','todos','status','todos','conflict_criteria','[]'::jsonb,'conflict_only',false)||filter_json;
 if filter_json->>'review' not in ('todos','pendente','conferido') or filter_json->>'type' not in ('todos','regulamentar','premio','banco_horas') or filter_json->>'status' not in ('todos','com_afastamento','sem_afastamento','programada','concluida','cancelada') then raise exception 'RH_INPUT_INVALID';end if;
 context:=public.rh_account_context(target_profile);
 if context is not null then
  selection:=public.rh_session_state(target_profile,target_session);
  if selection->'operator'='null'::jsonb then raise exception 'RH_OPERATOR_REQUIRED';end if;
  unit_id:=(context->>'cnes_unit_id')::uuid;
  if target_cnes is not null and target_cnes<>unit_id then raise exception 'RH_BOND_OUT_OF_UNIT';end if;
 else
  perform private.require_cnes_import_admin(target_profile);
  unit_id:=target_cnes;
  if not exists(select 1 from public.cnes_units where id=unit_id and active) then raise exception 'RH_UNIT_INVALID';end if;
  context:=(select jsonb_build_object('cnes_unit_id',id,'cnes_code',code,'cnes_name',name,'role','administrador') from public.cnes_units where id=unit_id);
 end if;

 -- Catálogos da unidade inteira, independentes dos filtros e da paginação.
 select jsonb_object_agg(key,values) into facets from (
 select key,jsonb_agg(value order by value collate "pt-BR-x-icu") values from (
 select distinct key,value from private.rh_calendar_employees(unit_id) r
 cross join lateral (values ('full_name',r.full_name),('position',r.position),('cbo',r.cbo)) v(key,value) where nullif(btrim(value),'') is not null
 union select 'team',t from private.rh_calendar_employees(unit_id) r cross join lateral unnest(private.rh_calendar_teams(r.entry_id,r.team)) t
 ) choices group by key) catalog;
 -- Cada pessoa é contada uma vez por dia; cancelados e dias não atribuídos são excluídos.
 if filter_json->'conflict_criteria'<>'[]'::jsonb then
 with roster as materialized(select r.*,b.servidor_id person_id,private.rh_calendar_teams(r.entry_id,r.team) teams from private.rh_calendar_employees(unit_id) r join public.employment_bonds b on b.id=r.bond_id),
 periods as (
 select l.bond_id,(p->>'start_date')::date first_day,(p->>'end_date')::date last_day,null::uuid legacy_id from private.rh_leaves l
 cross join lateral jsonb_array_elements(l.plan->'periods') p where l.cnes_unit_id=unit_id and l.status<>'cancelada'
 and (filter_json->>'type'='todos' or l.plan->>'type'=filter_json->>'type')
 and (p->>'start_date')::date<=range_end and (p->>'end_date')::date>=range_start
 union all select v.context_bond_id,p.start_date,p.end_date,v.id from public.vacation_requests v join public.request_periods p on p.request_id=v.id
 where v.status not in ('cancelada','rejeitada','rascunho','devolvida') and p.start_date<=range_end and p.end_date>=range_start
 and (filter_json->>'type'='todos' or v.type::text=filter_json->>'type')
 and ((v.context_cnes_unit_id=unit_id and v.status in ('programada','reprogramada','concluida')) or exists(select 1 from public.request_unit_reviews u where u.request_id=v.id and u.cnes_unit_id=unit_id and u.status='programada'))
 ), days as materialized(
 select distinct r.bond_id,r.person_id,r.full_name,r.position,r.cbo,r.teams,d::date calendar_day from periods p join roster r on r.bond_id=p.bond_id
 cross join lateral generate_series(greatest(p.first_day,range_start)::timestamp,least(p.last_day,range_end)::timestamp,interval '1 day') d
 where p.legacy_id is null or not exists(select 1 from public.request_day_responsibilities x where x.request_id=p.legacy_id)
 or exists(select 1 from public.request_day_responsibilities x where x.request_id=p.legacy_id and x.cnes_unit_id=unit_id and x.responsibility_date=d::date)
 ), pairs as (
 select a.calendar_day,a.bond_id a,b.bond_id b from days a join days b on a.calendar_day=b.calendar_day and a.bond_id<b.bond_id and a.person_id<>b.person_id
 where filter_json->'conflict_criteria'<>'[]'::jsonb
 and (not (filter_json->'conflict_criteria' ? 'position') or (nullif(btrim(a.position),'') is not null and lower(a.position)=lower(b.position)))
 and (not (filter_json->'conflict_criteria' ? 'cbo') or (nullif(btrim(a.cbo),'') is not null and a.cbo=b.cbo))
 and (not (filter_json->'conflict_criteria' ? 'team') or a.teams && b.teams)
 ), participants as (select calendar_day,a bond_id from pairs union select calendar_day,b from pairs), grouped as (
 select calendar_day,jsonb_agg(bond_id order by bond_id) bond_ids from participants group by calendar_day)
 select coalesce(jsonb_agg(jsonb_build_object('date',calendar_day,'bond_ids',g.bond_ids) order by calendar_day),'[]') into conflicts from grouped g;
 else conflicts:='[]'::jsonb;end if;
 select array_agg(distinct x::uuid) into conflict_bonds from jsonb_array_elements(conflicts) c cross join lateral jsonb_array_elements_text(c->'bond_ids') x;

 last_day:=range_end;
 select count(*) into rows_count from private.rh_calendar_employees(unit_id) r where (search_text='' or position(lower(search_text) in lower(concat_ws(' ',r.full_name,r.registration,r.position,r.cbo,r.team)))>0)
  and private.rh_calendar_row_selected(to_jsonb(r),filter_json)
  and (not (filter_json->>'conflict_only')::boolean or r.bond_id=any(coalesce(conflict_bonds,'{}'::uuid[])))
  and (filter_json->>'review'='todos' or case when filter_json->>'review'='conferido' then r.binding_confirmed else not coalesce(r.binding_confirmed,false) end)
  and private.rh_calendar_window_matches(unit_id,r.bond_id,range_start,range_end,filter_json->>'status',filter_json->>'type');
 select coalesce(jsonb_agg(to_jsonb(r) order by r.full_name collate "pt-BR-x-icu",r.row_id),'[]'),array_agg(distinct r.bond_id) filter(where r.bond_id is not null)
 into employees,bond_ids from (select * from private.rh_calendar_employees(unit_id) r where (search_text='' or position(lower(search_text) in lower(concat_ws(' ',r.full_name,r.registration,r.position,r.cbo,r.team)))>0)
  and private.rh_calendar_row_selected(to_jsonb(r),filter_json)
  and (not (filter_json->>'conflict_only')::boolean or r.bond_id=any(coalesce(conflict_bonds,'{}'::uuid[])))
  and (filter_json->>'review'='todos' or case when filter_json->>'review'='conferido' then r.binding_confirmed else not coalesce(r.binding_confirmed,false) end)
  and private.rh_calendar_window_matches(unit_id,r.bond_id,range_start,range_end,filter_json->>'status',filter_json->>'type')
  order by r.full_name collate "pt-BR-x-icu",r.row_id limit 50 offset page_index*50) r;
 result:=jsonb_build_object('context',context,'operator',selection->'operator','month',range_start,'range_start',range_start,'range_end',range_end,'employees',employees,'total',rows_count,
  'absences',coalesce((select jsonb_agg(to_jsonb(a) order by a.start_date,a.id,a.sequence) from (
   select v.id,v.context_bond_id bond_id,v.protocol,v.type,v.status,p.sequence,p.start_date,p.end_date,p.return_date,'legado'::text origin,
    coalesce((select jsonb_agg(d.responsibility_date order by d.responsibility_date) from public.request_day_responsibilities d
     where d.request_id=v.id and d.cnes_unit_id=unit_id and d.responsibility_date between range_start and last_day),'[]') assigned_dates,
    exists(select 1 from public.request_day_responsibilities d where d.request_id=v.id) distributed
   from public.vacation_requests v join public.request_periods p on p.request_id=v.id
   where v.context_bond_id=any(coalesce(bond_ids,'{}'::uuid[])) and (filter_json->>'type'='todos' or v.type::text=filter_json->>'type') and v.status not in ('cancelada','rejeitada','rascunho','devolvida')
    and p.start_date<=last_day and p.end_date>=range_start
    and ((v.context_cnes_unit_id=unit_id and v.status in ('programada','reprogramada','concluida'))
      or exists(select 1 from public.request_unit_reviews r where r.request_id=v.id and r.cnes_unit_id=unit_id and r.status='programada'))
   order by p.start_date,v.id,p.sequence limit 1001) a),'[]'),
  'holidays',coalesce((select jsonb_agg(jsonb_build_object('date',event_date,'name',name,'type',type) order by event_date) from public.calendar_events where active and event_date between range_start and last_day),'[]'));
 if jsonb_array_length(result->'absences')>1000 then raise exception 'RH_CALENDAR_LIMIT';end if;
 unit_id:=(result->'context'->>'cnes_unit_id')::uuid;
 select array_agg((r->>'bond_id')::uuid) into ids from jsonb_array_elements(result->'employees') r where r->>'bond_id' is not null;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into extra from (
  select l.id,l.bond_id,'RH-'||upper(left(replace(l.id::text,'-',''),12)) protocol,l.plan->>'type' type,l.status,
   (p->>'sequence')::integer sequence,p->>'start_date' start_date,p->>'end_date' end_date,p->>'return_date' return_date,
   p->>'counting_mode' counting_mode,'rh'::text origin,false distributed,'[]'::jsonb assigned_dates
  from private.rh_leaves l cross join lateral jsonb_array_elements(l.plan->'periods') p
  where l.cnes_unit_id=unit_id and l.bond_id=any(coalesce(ids,'{}'::uuid[])) and l.status<>'cancelada' and (filter_json->>'type'='todos' or l.plan->>'type'=filter_json->>'type')
   and (p->>'start_date')::date<(range_end+1)::date and (p->>'end_date')::date>=range_start limit 1001) q;
 if jsonb_array_length(extra)+jsonb_array_length(result->'absences')>1000 then raise exception 'RH_CALENDAR_LIMIT';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id),'[]') into records from (
  select l.id,'RH-'||upper(left(replace(l.id::text,'-',''),12)) protocol,l.snapshot->>'full_name' full_name,
   l.snapshot->>'registration' registration,l.plan->>'type' type,l.status,l.created_at
  from private.rh_leaves l where l.cnes_unit_id=unit_id and l.bond_id=any(coalesce(ids,'{}'::uuid[])) and (filter_json->>'type'='todos' or l.plan->>'type'=filter_json->>'type') and (filter_json->>'status' not in ('programada','concluida','cancelada') or l.status=filter_json->>'status')
   and exists(select 1 from jsonb_array_elements(l.plan->'periods') p where (p->>'start_date')::date<(range_end+1)::date and (p->>'end_date')::date>=range_start)
  order by l.created_at desc,l.id limit 51) q;
 if filter_json->>'type'<>'todos' then
  result:=jsonb_set(result,'{absences}',coalesce((select jsonb_agg(a) from jsonb_array_elements(result->'absences') a where a->>'type'=filter_json->>'type'),'[]'));
  extra:=coalesce((select jsonb_agg(a) from jsonb_array_elements(extra) a where a->>'type'=filter_json->>'type'),'[]');
  records:=coalesce((select jsonb_agg(a) from jsonb_array_elements(records) a where a->>'type'=filter_json->>'type'),'[]');
 end if;
 result:=jsonb_set(result,'{employees}',coalesce((select jsonb_agg(r||jsonb_build_object('birthday_dayoff',birthday.birthday_month is not null,'birth_month_day',case when birthday.bond_id is not null then case when birthday.birthday_month is not null then lpad(birthday.birthday_month::text,2,'0')||'-'||lpad(birthday.birthday_day::text,2,'0') end else to_char(s.birth_date,'MM-DD') end) order by ord)
  from jsonb_array_elements(result->'employees') with ordinality rows(r,ord)
  left join public.employment_bonds b on b.id=(r->>'bond_id')::uuid
  left join public.servidores s on s.id=b.servidor_id left join private.rh_employee_birthdays birthday on birthday.bond_id=b.id),'[]'::jsonb));
 result:=result||jsonb_build_object('source_competence',(select competence from private.cnes_import_runs where cnes_unit_id=unit_id order by created_at desc,id desc limit 1));
 return jsonb_set(result,'{absences}',(result->'absences')||extra)||jsonb_build_object('records',case when jsonb_array_length(records)>50 then records-50 else records end,
  'records_has_more',jsonb_array_length(records)>50,'filters',filter_json,'facets',coalesce(facets,'{}'::jsonb),'conflicts',conflicts);
end $function$
;
CREATE OR REPLACE FUNCTION public.rh_create_leave(target_profile uuid, target_session uuid, target_cnes uuid, target_entry uuid, item jsonb, request_key uuid, expected_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
 SET statement_timeout TO '8s'
AS $function$
declare actor jsonb;preview jsonb;resources jsonb;leave_plan jsonb;previous private.rh_leaves%rowtype;result private.rh_leaves%rowtype;
 input_hash text;bound_bond uuid;unit_id uuid;p jsonb;start_day date;end_day date;right_row public.vacation_rights%rowtype;
begin
 actor:=private.rh_leave_actor(target_profile,target_session,target_cnes);unit_id:=(actor->'context'->>'cnes_unit_id')::uuid;
 if request_key is null or expected_digest is null or expected_digest!~'^[a-f0-9]{64}$' then raise exception 'RH_LEAVE_PREVIEW_REQUIRED';end if;
 input_hash:=encode(extensions.digest(jsonb_build_object('entry',target_entry,'item',item,'unit',unit_id)::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('rh-leave-key:'||target_profile::text||request_key::text,0));
 select * into previous from private.rh_leaves x where x.created_by=target_profile and x.request_key=rh_create_leave.request_key;
 if found then
  if previous.input_digest<>input_hash or previous.preview_digest<>expected_digest then raise exception 'RH_LEAVE_IDEMPOTENCY_CONFLICT';end if;
  return jsonb_build_object('id',previous.id,'status',previous.status,'replayed',true);
 end if;
 -- Mesmo bloqueio das gravações legadas: não disputar calendário com elas.
 perform private.planning_lock();
 perform 1 from private.cnes_registry_entries where id=target_entry for share;
 perform 1 from private.rh_registry_bonds where entry_id=target_entry for share;
 select bond_id into bound_bond from private.rh_registry_bonds where entry_id=target_entry;
 perform 1 from public.employment_bonds where id=bound_bond for share;
 perform 1 from public.servidores where id=(select servidor_id from public.employment_bonds where id=bound_bond) for share;
 perform 1 from public.employment_bond_units where bond_id=bound_bond and cnes_unit_id=unit_id for share;
 perform 1 from public.cnes_units where id=unit_id for share;
 preview:=public.rh_preview_leave(target_profile,target_session,target_cnes,target_entry,item);
 if preview->>'digest'<>expected_digest then raise exception 'RH_LEAVE_PREVIEW_CHANGED';end if;
 resources:=preview->'resources';leave_plan:=preview->'plan';
 if (leave_plan->>'can_save')::boolean is distinct from true then raise exception 'RH_LEAVE_HOURS_INSUFFICIENT';end if;
 if (select count(*) from private.rh_leaves where created_by=target_profile and created_at>now()-interval '1 minute')>=20 then raise exception 'RH_LEAVE_RATE_LIMIT';end if;
 if nullif(item->>'rightId','') is not null then
  select * into right_row from public.vacation_rights where id=(item->>'rightId')::uuid and bond_id=bound_bond for update;
  if not found or right_row.type::text<>leave_plan->>'type' or right_row.acquisition_end is distinct from nullif(leave_plan->>'acquisition_end','')::date
   and leave_plan->>'type'='regulamentar' then raise exception 'RH_LEAVE_RIGHT_INVALID';end if;
  if right_row.available_days < (leave_plan->>'vacation_days')::integer
    +coalesce((select sum((l.plan->>'vacation_days')::integer) from private.rh_leaves l where l.status<>'cancelada' and l.plan->>'right_id'=right_row.id::text),0)
    +coalesce((select sum(r.days) from public.vacation_requests v join public.request_periods r on r.request_id=v.id where v.right_id=right_row.id
      and v.status not in ('cancelada','rejeitada','rascunho','devolvida')),0) then raise exception 'RH_LEAVE_RIGHT_INVALID';end if;
 end if;
 for p in select value from jsonb_array_elements(leave_plan->'periods') loop
  start_day:=(p->>'start_date')::date;end_day:=(p->>'end_date')::date;
  if exists(select 1 from private.rh_leaves l cross join lateral jsonb_array_elements(l.plan->'periods') z
     where l.bond_id=bound_bond and l.status<>'cancelada' and not (l.plan->>'type'='dayoff' and leave_plan->>'counting_mode'='uteis') and (z->>'start_date')::date<=end_day and (z->>'end_date')::date>=start_day)
   or exists(select 1 from public.vacation_requests v join public.request_periods r on r.request_id=v.id where v.context_bond_id=bound_bond
    and v.status not in ('cancelada','rejeitada','rascunho','devolvida') and r.start_date<=end_day and r.end_date>=start_day)
   then raise exception 'RH_LEAVE_OVERLAP';end if;
 end loop;
 if leave_plan->>'type'='regulamentar' and (exists(select 1 from private.rh_leaves where bond_id=bound_bond and status<>'cancelada' and
   private.rh_leaves.plan->>'type'='regulamentar' and private.rh_leaves.plan->>'acquisition_end'=leave_plan->>'acquisition_end')
  or exists(select 1 from public.vacation_requests where context_bond_id=bound_bond and type='regulamentar' and acquisition_end=(leave_plan->>'acquisition_end')::date
   and status not in ('cancelada','rejeitada','rascunho','devolvida'))) then raise exception 'RH_LEAVE_CYCLE_IN_USE';end if;
 insert into private.rh_leaves(cnes_unit_id,entry_id,bond_id,created_by,operator_grant_id,operator_name,operator_declared,request_key,input_digest,preview_digest,snapshot,plan)
 values(unit_id,target_entry,bound_bond,target_profile,nullif(actor->'operator'->>'id','')::uuid,actor->'operator'->>'name',(actor->>'declared')::boolean,
  request_key,input_hash,expected_digest,resources||jsonb_build_object('account_name',(select full_name from public.profiles where id=target_profile)),leave_plan) returning * into result;
 insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_bond_id,context_cnes_unit_id,reason,new_value)
 values(target_profile,(actor->>'role')::public.app_role,'rh_leave_programmed','rh_leave',result.id,bound_bond,unit_id,
  leave_plan->'bank'->>'override_reason',jsonb_build_object('operator_name',result.operator_name,'operator_grant_id',result.operator_grant_id,
   'declared_identity',result.operator_declared,'bank',leave_plan->'bank','periods',leave_plan->'periods','type',leave_plan->>'type'));
 return jsonb_build_object('id',result.id,'status',result.status,'replayed',false);
end $function$
;
CREATE OR REPLACE FUNCTION public.rh_revise_leave(target_profile uuid, target_session uuid, target_cnes uuid, target_leave uuid, expected_version integer, item jsonb, request_key uuid, expected_digest text, target_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
 SET statement_timeout TO '8s'
AS $function$
declare actor jsonb;entry private.rh_leaves%rowtype;previous private.rh_leave_edit_requests%rowtype;
 preview jsonb;resources jsonb;leave_plan jsonb;input_hash text;unit_id uuid;bound_bond uuid;
 right_row public.vacation_rights%rowtype;p jsonb;start_day date;end_day date;
begin
 actor:=private.rh_leave_actor(target_profile,target_session,target_cnes);unit_id:=(actor->'context'->>'cnes_unit_id')::uuid;
 if length(btrim(coalesce(target_reason,''))) not between 3 and 500 or expected_version is null or expected_version<1 then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 if request_key is null or expected_digest is null or expected_digest!~'^[a-f0-9]{64}$' then raise exception 'RH_LEAVE_PREVIEW_REQUIRED';end if;
 input_hash:=encode(extensions.digest(jsonb_build_object('leave',target_leave,'version',expected_version,'item',item,'reason',btrim(target_reason),'unit',unit_id)::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('rh-edit-key:'||target_profile::text||request_key::text,0));
 select * into previous from private.rh_leave_edit_requests x where x.actor_id=target_profile and x.request_key=rh_revise_leave.request_key;
 if found then
  if previous.input_digest<>input_hash or previous.preview_digest<>expected_digest then raise exception 'RH_LEAVE_IDEMPOTENCY_CONFLICT';end if;
  return jsonb_build_object('id',previous.leave_id,'version',previous.result_version,'replayed',true);
 end if;
 perform private.planning_lock();
 select * into entry from private.rh_leaves where id=target_leave and cnes_unit_id=unit_id for update;
 if not found then raise exception 'RH_LEAVE_NOT_FOUND';end if;
 if entry.version<>expected_version or entry.status<>'programada' then raise exception 'RH_VERSION_CONFLICT';end if;
 if (select count(*) from private.rh_leave_edit_requests where actor_id=target_profile and created_at>now()-interval '1 minute')>=20 then raise exception 'RH_LEAVE_RATE_LIMIT';end if;
 perform 1 from private.cnes_registry_entries where id=entry.entry_id for share;
 perform 1 from private.rh_registry_bonds where entry_id=entry.entry_id for share;
 bound_bond:=entry.bond_id;
 perform 1 from public.employment_bonds where id=bound_bond for share;
 perform 1 from public.servidores where id=(select servidor_id from public.employment_bonds where id=bound_bond) for share;
 perform 1 from public.employment_bond_units where bond_id=bound_bond and cnes_unit_id=unit_id for share;
 perform 1 from public.cnes_units where id=unit_id for share;
 preview:=public.rh_preview_leave_revision(target_profile,target_session,target_cnes,target_leave,expected_version,item);
 if preview->>'digest'<>expected_digest then raise exception 'RH_LEAVE_PREVIEW_CHANGED';end if;
 resources:=preview->'resources';leave_plan:=preview->'plan';
 if (leave_plan->>'can_save')::boolean is distinct from true then raise exception 'RH_LEAVE_HOURS_INSUFFICIENT';end if;
 -- O próprio registro é excluído das reservas/conflitos, sem apagar ou cancelar temporariamente.
 if nullif(item->>'rightId','') is not null then
  select * into right_row from public.vacation_rights where id=(item->>'rightId')::uuid and bond_id=bound_bond for update;
  if not found or right_row.type::text<>leave_plan->>'type'
   or (leave_plan->>'type'='regulamentar' and right_row.acquisition_end is distinct from nullif(leave_plan->>'acquisition_end','')::date) then raise exception 'RH_LEAVE_RIGHT_INVALID';end if;
  if right_row.version is distinct from (leave_plan->>'right_version')::integer then raise exception 'RH_LEAVE_PREVIEW_CHANGED';end if;
  if right_row.available_days < (leave_plan->>'vacation_days')::integer
   +coalesce((select sum((l.plan->>'vacation_days')::integer) from private.rh_leaves l where l.id<>entry.id and l.status<>'cancelada' and l.plan->>'right_id'=right_row.id::text),0)
   +coalesce((select sum(r.days) from public.vacation_requests v join public.request_periods r on r.request_id=v.id where v.right_id=right_row.id and v.status not in ('cancelada','rejeitada','rascunho','devolvida')),0) then raise exception 'RH_LEAVE_RIGHT_INVALID';end if;
 end if;
 for p in select value from jsonb_array_elements(leave_plan->'periods') loop
  start_day:=(p->>'start_date')::date;end_day:=(p->>'end_date')::date;
  if exists(select 1 from private.rh_leaves l cross join lateral jsonb_array_elements(l.plan->'periods') z where l.id<>entry.id and l.bond_id=bound_bond and l.status<>'cancelada' and not (l.plan->>'type'='dayoff' and leave_plan->>'counting_mode'='uteis')
    and (z->>'start_date')::date<=end_day and (z->>'end_date')::date>=start_day)
   or exists(select 1 from public.vacation_requests v join public.request_periods r on r.request_id=v.id where v.context_bond_id=bound_bond
    and v.status not in ('cancelada','rejeitada','rascunho','devolvida') and r.start_date<=end_day and r.end_date>=start_day) then raise exception 'RH_LEAVE_OVERLAP';end if;
 end loop;
 if leave_plan->>'type'='regulamentar' and (exists(select 1 from private.rh_leaves l where l.id<>entry.id and l.bond_id=bound_bond and l.status<>'cancelada'
   and l.plan->>'type'='regulamentar' and l.plan->>'acquisition_end'=leave_plan->>'acquisition_end')
  or exists(select 1 from public.vacation_requests where context_bond_id=bound_bond and type='regulamentar' and acquisition_end=(leave_plan->>'acquisition_end')::date
   and status not in ('cancelada','rejeitada','rascunho','devolvida'))) then raise exception 'RH_LEAVE_CYCLE_IN_USE';end if;
 insert into private.rh_leave_revisions(leave_id,version,snapshot,plan,status,changed_by,operator_name,operator_declared,reason)
 values(entry.id,entry.version,entry.snapshot,entry.plan,entry.status,target_profile,actor->'operator'->>'name',(actor->>'declared')::boolean,btrim(target_reason));
 update private.rh_leaves set snapshot=resources||jsonb_build_object('account_name',entry.snapshot->>'account_name'),plan=leave_plan,version=version+1 where id=entry.id;
 insert into private.rh_leave_edit_requests(actor_id,request_key,leave_id,input_digest,preview_digest,result_version)
 values(target_profile,request_key,entry.id,input_hash,expected_digest,entry.version+1);
 insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_bond_id,context_cnes_unit_id,reason,previous_value,new_value)
 values(target_profile,(actor->>'role')::public.app_role,'rh_leave_revised','rh_leave',entry.id,bound_bond,unit_id,btrim(target_reason),
  jsonb_build_object('version',entry.version,'periods',entry.plan->'periods','bank',entry.plan->'bank','type',entry.plan->>'type'),
  jsonb_build_object('version',entry.version+1,'periods',leave_plan->'periods','bank',leave_plan->'bank','type',leave_plan->>'type',
   'operator_name',actor->'operator'->>'name','operator_grant_id',actor->'operator'->>'id','declared_identity',actor->'declared'));
 return jsonb_build_object('id',entry.id,'version',entry.version+1,'replayed',false);
end $function$
;
CREATE OR REPLACE FUNCTION public.rh_create_occurrence(target_profile uuid, target_session uuid, target_entry uuid, request_key uuid, occurrence_type text, start_day date, end_day date, reference text, notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare actor jsonb;resources jsonb;previous private.rh_leaves%rowtype; input_hash text;new_leave_id uuid;plan jsonb;
begin
 actor:=private.rh_leave_actor(target_profile,target_session,null);
 if actor->>'role'<>'rh' then raise exception 'RH_NOT_ALLOWED';end if;
 if occurrence_type not in ('dayoff','folga') or occurrence_type is null or start_day is null or end_day is null
 or start_day<date '1900-01-01' or end_day>date '2100-12-31' or end_day<start_day or end_day-start_day>92
 or (occurrence_type='dayoff' and start_day<>end_day) or request_key is null
 or length(btrim(coalesce(reference,''))) not between 3 and 300 or length(coalesce(notes,''))>1000 then raise exception 'RH_INPUT_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('rh-occurrence-request:'||target_profile::text||':'||request_key::text,0));
 perform private.planning_lock();
 perform 1 from private.cnes_registry_entries where id=target_entry for share;
 resources:=public.rh_leave_resources(target_profile,target_session,null,target_entry);
 perform pg_advisory_xact_lock(hashtextextended('rh-leave-bond:'||(resources->>'bond_id'),0));
 input_hash:=encode(sha256(convert_to(jsonb_build_array(target_entry,occurrence_type,start_day,end_day,reference,notes)::text,'UTF8')),'hex');
 select * into previous from private.rh_leaves l where l.created_by=target_profile and l.request_key=rh_create_occurrence.request_key;
 if found then
 if previous.input_digest<>input_hash then raise exception 'RH_LEAVE_IDEMPOTENCY_CONFLICT';end if;
 return jsonb_build_object('id',previous.id,'version',previous.version,'already_applied',true);end if;
 if (select count(*) from private.rh_leaves l where l.created_by=target_profile and l.created_at>now()-interval '1 minute')>=30 then raise exception 'RH_LEAVE_RATE_LIMIT';end if;
 -- Mesmo controle de concorrência dos lançamentos de férias, sem saldo de horas inventado.
 perform 1 from public.employment_bonds where id=(resources->>'bond_id')::uuid for update;
 if exists(select 1 from private.rh_leaves l cross join lateral jsonb_array_elements(l.plan->'periods') p
 where l.bond_id=(resources->>'bond_id')::uuid and l.status<>'cancelada' and not (occurrence_type='dayoff' and l.plan->>'type'='regulamentar' and l.plan->>'counting_mode'='uteis')
 and (p->>'start_date')::date<=end_day and (p->>'end_date')::date>=start_day) then raise exception 'RH_LEAVE_OVERLAP';end if;
 if exists(select 1 from public.vacation_requests r join public.request_periods p on p.request_id=r.id
 where r.context_bond_id=(resources->>'bond_id')::uuid and r.status not in ('cancelada','rejeitada','rascunho','devolvida')
 and p.start_date<=end_day and p.end_date>=start_day) then raise exception 'RH_LEAVE_OVERLAP';end if;
 plan:=jsonb_build_object('type',occurrence_type,'counting_mode','corridos','days',end_day-start_day+1,'notes',coalesce(notes,''),
 'recognition_reference',btrim(reference),'automatic_entitlement',false,'bank',jsonb_build_object('required_minutes',0),
 'periods',jsonb_build_array(jsonb_build_object('sequence',1,'start_date',start_day,'end_date',end_day,'return_date',null,'days',end_day-start_day+1,'counting_mode','corridos')));
 insert into private.rh_leaves(cnes_unit_id,entry_id,bond_id,created_by,operator_grant_id,operator_name,operator_declared,
 request_key,input_digest,preview_digest,snapshot,plan)
 values((actor->'context'->>'cnes_unit_id')::uuid,target_entry,(resources->>'bond_id')::uuid,target_profile,
 (actor->'operator'->>'id')::uuid,actor->'operator'->>'name',true,request_key,input_hash,input_hash,resources,plan) returning rh_leaves.id into new_leave_id;
 insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_bond_id,context_cnes_unit_id,reason,new_value)
 values(target_profile,'rh','rh_occurrence_created','rh_leave',new_leave_id,(resources->>'bond_id')::uuid,(actor->'context'->>'cnes_unit_id')::uuid,btrim(reference),
 jsonb_build_object('operator_name',actor->'operator'->>'name','operator_grant_id',actor->'operator'->>'id','declared_identity',true,'type',occurrence_type,'periods',plan->'periods'));
 if occurrence_type='dayoff' then perform private.rh_recalculate_dayoffs((resources->>'bond_id')::uuid,target_profile,actor->'operator'->>'name',true);end if;
 return jsonb_build_object('id',new_leave_id,'version',1);
end $function$
;
CREATE OR REPLACE FUNCTION public.rh_close_leave(target_profile uuid, target_session uuid, target_cnes uuid, target_leave uuid, expected_version integer, next_status text, target_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare actor jsonb;entry private.rh_leaves%rowtype;
begin
 actor:=private.rh_leave_actor(target_profile,target_session,target_cnes);
 if next_status is null or next_status not in ('cancelada','concluida') or length(btrim(coalesce(target_reason,''))) not between 3 and 500 then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 perform private.planning_lock();
 select * into entry from private.rh_leaves where id=target_leave and cnes_unit_id=(actor->'context'->>'cnes_unit_id')::uuid for update;
 if not found then raise exception 'RH_LEAVE_NOT_FOUND';end if;
 if expected_version is null or entry.version<>expected_version or entry.status<>'programada' then raise exception 'RH_VERSION_CONFLICT';end if;
 if actor->>'role'='rh' and not exists(select 1 from public.employment_bonds where id=entry.bond_id and pole_cnes_unit_id=entry.cnes_unit_id) then raise exception 'RH_POLE_CONFLICT';end if;
 if next_status='concluida' and (entry.plan->'periods'->-1->>'end_date')::date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'RH_LEAVE_NOT_ENDED';end if;
 update private.rh_leaves set status=next_status,version=version+1 where id=entry.id;
 insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_bond_id,context_cnes_unit_id,reason,previous_value,new_value)
 values(target_profile,(actor->>'role')::public.app_role,'rh_leave_'||next_status,'rh_leave',entry.id,entry.bond_id,entry.cnes_unit_id,btrim(target_reason),
 jsonb_build_object('status',entry.status),jsonb_build_object('status',next_status,'operator_name',actor->'operator'->>'name','operator_grant_id',actor->'operator'->>'id','declared_identity',actor->'declared'));
 if entry.plan->>'type'='dayoff' and next_status='cancelada' then perform private.rh_recalculate_dayoffs(entry.bond_id,target_profile,actor->'operator'->>'name',coalesce((actor->>'declared')::boolean,false));end if;
 return jsonb_build_object('ok',true);
end $function$
;

CREATE OR REPLACE FUNCTION public.rh_save_employee_birthday(target_profile uuid, target_session uuid, target_entry uuid, expected_version integer, target_month integer, target_day integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare actor jsonb;resources jsonb;bond uuid;previous private.rh_employee_birthdays%rowtype;
begin
 actor:=private.rh_leave_actor(target_profile,target_session,null);
 if actor->>'role'<>'rh' then raise exception 'RH_NOT_ALLOWED';end if;
 if expected_version is null or expected_version<0 or ((target_month is null)<>(target_day is null)) then raise exception 'RH_INPUT_INVALID';end if;
 if target_month is not null then
  if target_month not between 1 and 12 or target_day not between 1 and 31 then raise exception 'RH_INPUT_INVALID';end if;
  perform make_date(2000,target_month,target_day);
 end if;
 perform private.planning_lock();
 resources:=public.rh_leave_resources(target_profile,target_session,null,target_entry);bond:=(resources->>'bond_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('rh-birthday:'||bond::text,0));
 select * into previous from private.rh_employee_birthdays where bond_id=bond for update;
 if coalesce(previous.version,0)<>expected_version then raise exception 'RH_VERSION_CONFLICT';end if;
 insert into private.rh_employee_birthdays(bond_id,birthday_month,birthday_day,updated_by,operator_grant_id)
 values(bond,target_month,target_day,target_profile,(actor->'operator'->>'id')::uuid)
 on conflict(bond_id) do update set birthday_month=excluded.birthday_month,birthday_day=excluded.birthday_day,updated_by=excluded.updated_by,operator_grant_id=excluded.operator_grant_id,version=rh_employee_birthdays.version+1,updated_at=now();
 insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_bond_id,context_cnes_unit_id,previous_value,new_value)
 values(target_profile,'rh','rh_employee_birthday_updated','employment_bond',bond,bond,(actor->'context'->>'cnes_unit_id')::uuid,
  jsonb_build_object('month',previous.birthday_month,'day',previous.birthday_day,'version',coalesce(previous.version,0)),
  jsonb_build_object('month',target_month,'day',target_day,'version',expected_version+1,'operator_name',actor->'operator'->>'name','declared_identity',true));
 perform private.rh_recalculate_dayoffs(bond,target_profile,actor->'operator'->>'name',true);
 return public.rh_employee_profile(target_profile,target_session,target_entry);
exception when datetime_field_overflow then raise exception 'RH_INPUT_INVALID';
end $function$
;

-- Atualiza somente férias úteis programadas; mantém snapshots de qualquer versão substituída.
do $$ declare bond uuid;begin
 for bond in select distinct l.bond_id from private.rh_leaves l where l.status='programada' and l.plan->>'counting_mode'='uteis'
 and (exists(select 1 from private.rh_employee_birthdays b where b.bond_id=l.bond_id and b.birthday_month is not null)
  or exists(select 1 from private.rh_leaves d where d.bond_id=l.bond_id and d.plan->>'type'='dayoff' and d.status<>'cancelada')) loop
  perform private.rh_recalculate_dayoffs(bond,null,'Atualização do SGF',false);
 end loop;
end $$;
-- Recálculo de manutenção identifica o sistema sem atribuir a ação a um usuário fictício.
alter table private.rh_leave_revisions alter column changed_by drop not null;
