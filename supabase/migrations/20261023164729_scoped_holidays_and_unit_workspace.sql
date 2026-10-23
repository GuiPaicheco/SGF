
alter table public.calendar_events add column scope text not null default 'general' check(scope in ('general','units')),
 add column unit_ids uuid[] not null default '{}'::uuid[],
 add column jurisdiction text not null default 'nao_informada' check(jurisdiction in ('municipal','estadual','federal','institucional','nao_informada')),
 add constraint calendar_scope_valid check((scope='general' and cardinality(unit_ids)=0) or (scope='units' and cardinality(unit_ids) between 1 and 100));
alter table public.calendar_events drop constraint calendar_events_event_date_type_key;
alter table public.calendar_events add constraint calendar_events_scope_key unique(event_date,type,scope,unit_ids);
create index calendar_events_date_active_idx on public.calendar_events(event_date) where active;
create function private.rh_holiday_dates(target_unit uuid) returns date[]
language sql stable security invoker set search_path='' as $$
 select coalesce(array_agg(distinct event_date),'{}'::date[]) from public.calendar_events where active and type='feriado'
 and (scope='general' or target_unit=any(unit_ids));
$$;
revoke all on function private.rh_holiday_dates(uuid) from public,anon,authenticated;
grant execute on function private.rh_holiday_dates(uuid) to service_role;
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
 excluded:=private.rh_holiday_dates((select pole_cnes_unit_id from public.employment_bonds where id=nullif(resources->>'bond_id','')::uuid));
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
CREATE OR REPLACE FUNCTION private.rh_apply_dayoffs(target_bond uuid, original_plan jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare off_days date[];holidays date[];periods jsonb:='[]';used_off date[]:='{}';p jsonb;
 cursor_day date;end_day date;return_day date;used integer;scanned integer;quantity integer;previous_end date;
begin
 if original_plan->>'type'<>'regulamentar' or original_plan->>'counting_mode'<>'uteis' then return original_plan;end if;
 off_days:=private.rh_dayoff_dates(target_bond);
 holidays:=private.rh_holiday_dates((select pole_cnes_unit_id from public.employment_bonds where id=target_bond));
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
  'holidays',coalesce((select jsonb_agg(jsonb_build_object('date',event_date,'name',name,'type',type) order by event_date) from public.calendar_events where active and (scope='general' or unit_id=any(unit_ids)) and event_date between range_start and last_day),'[]'));
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
CREATE OR REPLACE FUNCTION private.rh_recalculate_dayoffs(target_bond uuid, actor_id uuid, operator_label text, declared boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
   values(l.id,l.version,l.snapshot,l.plan,l.status,actor_id,operator_label,declared,'Recálculo por alteração de calendário ou day-off');
  update private.rh_leaves set plan=updated_plan,version=version+1 where id=l.id;
  insert into public.audit_events(actor_id,action,entity_type,entity_id,context_bond_id,context_cnes_unit_id,reason,previous_value,new_value)
   values(actor_id,'rh_leave_calendar_recalculated','rh_leave',l.id,l.bond_id,l.cnes_unit_id,
    'Contagem de férias úteis atualizada conforme feriados da unidade e day-off',
    jsonb_build_object('version',l.version,'periods',l.plan->'periods','day_offs',l.plan->'day_offs'),
    jsonb_build_object('version',l.version+1,'periods',updated_plan->'periods','day_offs',updated_plan->'day_offs','operator_name',operator_label));
  changed:=changed+1;
 end loop;
 return changed;
end $function$
;
CREATE OR REPLACE FUNCTION private.audit_calendar_event_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  who uuid := nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb)->>'x-sgf-actor','')::uuid;
  before_data jsonb;
begin
  if tg_op='DELETE' then new:=old;before_data:=to_jsonb(old);end if;
  if tg_op='UPDATE' then
    if new is not distinct from old then return new; end if;
    before_data := to_jsonb(old);
  end if;
  if who is null or private.actor_role(who) is distinct from 'administrador'::public.app_role
    or not exists(select 1 from public.profiles p where p.id=who and p.disabled_at is null and not p.must_change_password)
    then raise exception 'AUDIT_CALENDAR_ADMIN_REQUIRED'; end if;
  insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,previous_value,new_value)
    values(who,'administrador',case when tg_op='INSERT' then 'calendar_event_created' when tg_op='DELETE' then 'calendar_event_deleted' else 'calendar_event_updated' end,
      'calendar_event',new.id,before_data,case when tg_op='DELETE' then null else to_jsonb(new) end);
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.notify_calendar_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare affected record; review record; previous_date date;
begin
  if tg_op='DELETE' then new:=old;new.active:=false;end if;
  if new.scope='units' and (tg_op in ('INSERT','DELETE') or old.scope='units') then return new;end if;
  if tg_op='UPDATE' then
    previous_date := old.event_date;
    if new.active is not distinct from old.active and new.event_date is not distinct from old.event_date
      and new.name is not distinct from old.name and new.type is not distinct from old.type and new.scope is not distinct from old.scope and new.unit_ids is not distinct from old.unit_ids then return new; end if;
  end if;
  if tg_op='INSERT' and not new.active then return new; end if;
  for affected in
    select distinct r.id,r.context_bond_id,s.profile_id from public.vacation_requests r
      join public.request_periods period on period.request_id=r.id join public.servidores s on s.id=r.servidor_id
    where r.status not in ('rascunho','cancelada','concluida')
      and (new.event_date between period.start_date and period.return_date
        or previous_date between period.start_date and period.return_date)
  loop
    for review in select * from public.request_unit_reviews where request_id=affected.id loop
      perform private.emit_unit_notification('calendar:'||new.id||':'||txid_current()||':'||affected.id,review.cnes_unit_id,review.lotacao_id,
        'Calendário alterado durante afastamento',
        'Evento "'||new.name||'" em '||to_char(new.event_date,'DD/MM/YYYY')||
        case when new.active then ' incluído/alterado.' else ' desativado.' end||
        ' Atualize o calendário e confira o período e o retorno com o RH. A decisão registrada não foi alterada.',
        affected.id,affected.profile_id,affected.context_bond_id);
    end loop;
    if affected.context_bond_id is null and affected.profile_id is not null then
      insert into public.notifications(recipient_id,recipient_role,request_id,title,message)
        values(affected.profile_id,'servidor',affected.id,'Calendário alterado durante afastamento',
          'Evento "'||new.name||'" alterado. Atualize o calendário e confira o período e o retorno com o RH.');
    end if;
  end loop;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.reconcile_calendar_requests()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r record; p record; planned jsonb; plans jsonb; excluded date[]; wanted date[]; missing date[];
  before_periods jsonb; prior_end date; changed boolean; blocked text; d date; candidates integer;
  assignment public.employment_bond_units%rowtype; scope record; who uuid;
begin
  if tg_op='DELETE' then new:=old;new.active:=false;end if;
  if new.scope='units' and (tg_op in ('INSERT','DELETE') or old.scope='units') then return new;end if;
  if tg_op='UPDATE' and (new.event_date,new.active,new.type,new.scope,new.unit_ids) is not distinct from (old.event_date,old.active,old.type,old.scope,old.unit_ids) then return new; end if;
  if tg_op='INSERT' and not new.active then return new; end if;
  who := nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}')->>'x-sgf-actor','')::uuid;
  if private.actor_role(who) is distinct from 'administrador' then raise exception 'AUDIT_CALENDAR_ADMIN_REQUIRED'; end if;
  select coalesce(array_agg(distinct event_date),'{}') into excluded from public.calendar_events ce where ce.active and ce.scope='general';
  for r in select q.*,s.birth_date,s.profile_id from public.vacation_requests q join public.servidores s on s.id=q.servidor_id
    where q.status in ('enviada','em_analise','aprovada','programada','reprogramada')
      and ((new.event_date between q.start_date and q.return_date)
        or (tg_op='UPDATE' and old.event_date between q.start_date and q.return_date)) order by q.id
  loop
    perform id from public.request_unit_reviews where request_id=r.id order by id for update;
    perform id from public.vacation_requests where id=r.id for update;
    before_periods := null; plans := '[]'; wanted := '{}'; missing := '{}'; prior_end := null; changed := false; blocked := null;
    select jsonb_agg(to_jsonb(x) order by x.sequence) into before_periods from public.request_periods x where x.request_id=r.id;
    if r.context_bond_id is null or before_periods is null then blocked := 'LEGACY_COUNTING_UNKNOWN'; end if;
    for p in select * from public.request_periods where request_id=r.id order by start_date,id for update loop
      if p.counting_mode is null then blocked := 'LEGACY_COUNTING_UNKNOWN'; exit; end if;
      planned := private.calculate_preserved_period(p.start_date,p.days,p.counting_mode,r.birth_date,excluded)||jsonb_build_object('id',p.id);
      if prior_end is not null and p.start_date<=prior_end then blocked := 'PERIOD_OVERLAP'; exit; end if;
      prior_end := (planned->>'end_date')::date;
      plans := plans||jsonb_build_array(planned);
      changed := changed or p.end_date<>(planned->>'end_date')::date or p.return_date<>(planned->>'return_date')::date;
      for d in select dt::date from generate_series(p.start_date::timestamp,prior_end::timestamp,interval '1 day') dt
        where extract(dow from dt) not in (0,6) and not dt::date=any(excluded)
          and (r.birth_date is null or to_char(dt,'MM-DD')<>to_char(r.birth_date,'MM-DD')) loop
        wanted := array_append(wanted,d);
      end loop;
    end loop;
    if blocked is null and exists(
      select 1 from public.vacation_requests other_request
      join public.request_periods other_period on other_period.request_id=other_request.id
      cross join jsonb_array_elements(plans) planned_period
      where other_request.id<>r.id and other_request.context_bond_id=r.context_bond_id
        and other_request.status not in ('rascunho','cancelada','rejeitada')
        and other_period.start_date<=(planned_period->>'end_date')::date
        and other_period.end_date>=(planned_period->>'start_date')::date
    ) then blocked:='OTHER_REQUEST_OVERLAP'; end if;
    if blocked is null then
      if exists(select 1 from public.request_day_responsibilities x where x.request_id=r.id
        and x.responsibility_date=any(wanted) and not exists(select 1 from private.eligible_day_units(r.context_bond_id,x.responsibility_date) u where u.id=x.bond_unit_id))
        then blocked := 'EXISTING_ASSIGNMENT_INELIGIBLE'; end if;
      -- Não apagar silenciosamente uma revisão/decisão que perde todos os seus dias.
      if exists(select 1 from public.request_unit_reviews v where v.request_id=r.id
        and not exists(select 1 from public.request_day_responsibilities x where x.request_id=r.id and x.cnes_unit_id=v.cnes_unit_id
          and x.lotacao_id is not distinct from v.lotacao_id and x.responsibility_date=any(wanted))
        and not exists(select 1 from unnest(wanted) wd cross join lateral private.eligible_day_units(r.context_bond_id,wd) u
          where u.cnes_unit_id=v.cnes_unit_id and u.internal_lotacao_id is not distinct from v.lotacao_id
            and (select count(*) from private.eligible_day_units(r.context_bond_id,wd))=1))
        then blocked := 'REVIEW_SCOPE_REMOVED'; end if;
    end if;
    if blocked is not null then
      update public.vacation_requests set calendar_adjustment_state='requires_review',calendar_adjustment_reason=blocked,updated_at=now() where id=r.id;
    else
      changed := changed or exists(select 1 from public.request_day_responsibilities where request_id=r.id and not responsibility_date=any(wanted));
      for d in select unnest(wanted) except select responsibility_date from public.request_day_responsibilities where request_id=r.id loop
        changed := true;
        select count(*) into candidates from private.eligible_day_units(r.context_bond_id,d);
        if candidates=1 then
          select * into assignment from private.eligible_day_units(r.context_bond_id,d);
          insert into public.request_day_responsibilities(request_id,responsibility_date,bond_unit_id,cnes_unit_id,lotacao_id,assigned_by)
            values(r.id,d,assignment.id,assignment.cnes_unit_id,assignment.internal_lotacao_id,who);
        else missing:=array_append(missing,d); end if;
      end loop;
      delete from public.request_day_responsibilities where request_id=r.id and not responsibility_date=any(wanted);
      for planned in select value from jsonb_array_elements(plans) loop
        update public.request_periods set end_date=(planned->>'end_date')::date,return_date=(planned->>'return_date')::date where id=(planned->>'id')::uuid;
      end loop;
      update public.vacation_requests set
        end_date=(select max(end_date) from public.request_periods where request_id=r.id),
        return_date=(select max(return_date) from public.request_periods where request_id=r.id),
        distribution_version=distribution_version+case when changed then 1 else 0 end,
        calendar_pending_dates=missing,calendar_adjustment_state=case when cardinality(missing)>0 then 'pending_distribution' else 'clear' end,
        calendar_adjustment_reason=case when cardinality(missing)>0 then 'RESPONSIBILITY_AMBIGUOUS' else null end,updated_at=now()
        where id=r.id;
      if changed then update public.request_unit_reviews set version=version+1,updated_at=now() where request_id=r.id; end if;
    end if;
    if changed or blocked is not null or r.calendar_adjustment_state<>'clear' then
      insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_bond_id,previous_value,new_value,reason)
        values(who,'administrador','calendar_request_reconciled','vacation_request',r.id,r.context_bond_id,
          jsonb_build_object('periods',before_periods,'version',r.distribution_version),
          jsonb_build_object('periods',plans,'pending_dates',missing,'blocked_reason',blocked),
          'Calendário institucional alterado. Início, quantidade de direito e decisões anteriores preservados.');
      for scope in select cnes_unit_id,lotacao_id from public.request_unit_reviews where request_id=r.id
        union select cnes_unit_id,internal_lotacao_id from public.employment_bond_units where bond_id=r.context_bond_id and active loop
        perform private.emit_unit_notification('calendar-adjustment:'||txid_current()||':'||new.id||':'||r.id,scope.cnes_unit_id,scope.lotacao_id,
          'Calendário do pedido atualizado',case when blocked is not null then 'Alteração de calendário exige revisão do RH: '||blocked||'. As datas não foram alteradas automaticamente.'
            else 'As datas foram recalculadas preservando a quantidade de dias. Confira fim e retorno.'||case when cardinality(missing)>0 then ' Há dias novos aguardando indicação do CNES pelo RH.' else '' end end,
          r.id,r.profile_id,r.context_bond_id);
      end loop;
    end if;
  end loop;
  return new;
end $function$
;

drop trigger calendar_event_change_audit on public.calendar_events;
create trigger calendar_event_change_audit after insert or update or delete on public.calendar_events for each row execute function private.audit_calendar_event_change();
drop trigger calendar_events_notify_affected on public.calendar_events;
create trigger calendar_events_notify_affected after insert or update or delete on public.calendar_events for each row execute function private.notify_calendar_change();
drop trigger calendar_request_reconcile on public.calendar_events;
create trigger calendar_request_reconcile after insert or update or delete on public.calendar_events for each row execute function private.reconcile_calendar_requests();

create function public.manage_scoped_calendar_event(actor_id uuid,operation text,target_id uuid,expected_version integer,item jsonb) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='15s' as $$
declare previous public.calendar_events%rowtype;result public.calendar_events%rowtype;
 ids uuid[];v_scope text;v_jurisdiction text;target_day date;v_name text;v_type text;l record;affected integer:=0;
begin
 perform private.require_cnes_import_admin(actor_id);
 perform private.planning_lock();
 if operation not in ('save','delete') or operation is null then raise exception 'CALENDAR_INPUT_INVALID';end if;
 if target_id is not null then
  select * into previous from public.calendar_events where id=target_id for update;
  if not found then raise exception 'CALENDAR_NOT_FOUND';end if;
  if expected_version is distinct from previous.version then raise exception 'CALENDAR_VERSION_CONFLICT';end if;
 elsif operation='delete' then raise exception 'CALENDAR_NOT_FOUND';end if;
 if operation='delete' then
  delete from public.calendar_events where id=target_id;
 else
  if jsonb_typeof(item) is distinct from 'object' or octet_length(item::text)>32000 then raise exception 'CALENDAR_INPUT_INVALID';end if;
  v_scope:=item->>'scope';v_jurisdiction:=item->>'jurisdiction';v_type:=item->>'type';v_name:=btrim(item->>'name');target_day:=(item->>'event_date')::date;
  if v_scope is null or v_scope not in ('general','units') or v_jurisdiction is null or v_jurisdiction not in ('municipal','estadual','federal','institucional')
   or target_day is null or target_day not between date '1900-01-01' and date '2100-12-31'
   or v_type is null or v_type not in ('feriado','ponto_facultativo') or v_name is null or length(v_name) not between 1 and 200
   or jsonb_typeof(item->'unit_ids') is distinct from 'array' or jsonb_array_length(item->'unit_ids')>100 then raise exception 'CALENDAR_INPUT_INVALID';end if;
  select coalesce(array_agg(distinct x::uuid order by x::uuid),'{}') into ids from jsonb_array_elements_text(item->'unit_ids') x;
  if (v_scope='general' and cardinality(ids)<>0) or (v_scope='units' and cardinality(ids)=0)
   or exists(select 1 from unnest(ids) id where not exists(select 1 from public.cnes_units u where u.id=id and u.active)) then raise exception 'CALENDAR_SCOPE_INVALID';end if;
  if exists(select 1 from public.calendar_events e where e.id is distinct from target_id and e.event_date=target_day and e.type::text=v_type and e.scope=v_scope and e.unit_ids=ids) then raise exception 'CALENDAR_DUPLICATED';end if;
  if target_id is null then
   insert into public.calendar_events(event_date,type,name,scope,unit_ids,jurisdiction) values(target_day,v_type::public.calendar_event_type,v_name,v_scope,ids,v_jurisdiction) returning * into result;
  else
   update public.calendar_events set event_date=target_day,type=v_type::public.calendar_event_type,name=v_name,scope=v_scope,unit_ids=ids,jurisdiction=v_jurisdiction,active=true,version=version+1 where id=target_id returning * into result;
  end if;
 end if;
 -- Recalcula na mesma transação apenas os vínculos afetados pelo escopo anterior ou novo.
 for l in select distinct bond_id from private.rh_leaves where status='programada' and plan->>'counting_mode'='uteis'
  and (previous.scope='general' or result.scope='general' or cnes_unit_id=any(coalesce(previous.unit_ids,'{}')||coalesce(result.unit_ids,'{}'))) loop
  affected:=affected+private.rh_recalculate_dayoffs(l.bond_id,actor_id,'Administrador do calendário',false);
 end loop;
 return jsonb_build_object('id',coalesce(result.id,previous.id),'deleted',operation='delete','recalculated',affected);
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then raise exception 'CALENDAR_INPUT_INVALID';
end $$;
revoke all on function public.manage_scoped_calendar_event(uuid,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.manage_scoped_calendar_event(uuid,text,uuid,integer,jsonb) to service_role;
