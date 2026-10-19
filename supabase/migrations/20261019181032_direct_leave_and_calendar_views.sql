-- Formulário simplificado: fim da aquisição como referência; sem aceite fictício.
-- Contrato anterior preservado para clientes e revisões já existentes.
create or replace function private.rh_make_leave_plan(resources jsonb,item jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
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
  'acquisition_start',acquisition_start,'acquisition_end',acquisition_end,'admission_date',admission,'date_mode',coalesce(item->>'dateMode','start'),'requested_return',desired_return,
  'bank',jsonb_build_object('declared_minutes',0,'daily_minutes',0,'required_minutes',0,'missing_minutes',0,'override',false),
  'can_save',true,'notes',coalesce(item->>'notes',''),'eligibility_confirmed',case when simplified then null else true end,
  'confirmation_collection',case when simplified then 'not_collected_in_sgf' else 'legacy_checkboxes' end,
  'notice_verified',protocol is not null,
  'legal',jsonb_build_object('version',case when simplified then 'betim-2026-10-19-direct' else 'betim-2026-10-18' end,'basis',basis,'regime',regime,'reference',reference,'protocol_date',protocol,'evidence',item-array['startDate','returnDate','secondStartDate','thirdStartDate','revision'],'warnings',warnings));
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then raise exception 'RH_LEAVE_INPUT_INVALID';
end $$;


-- Aniversário informado pelo RH: somente dia e mês, separado do CNES.
create table private.rh_employee_birthdays(
 bond_id uuid primary key references public.employment_bonds(id) on delete restrict,
 birthday_month integer,birthday_day integer,version integer not null default 1,
 updated_by uuid not null references public.profiles(id),operator_grant_id uuid not null references private.rh_operator_grants(id),updated_at timestamptz not null default now(),
 check(version>0),check((birthday_month is null and birthday_day is null) or (birthday_month is not null and birthday_day is not null and birthday_month between 1 and 12 and birthday_day between 1 and extract(day from (make_date(2000,birthday_month,1)+interval '1 month -1 day'))::integer))
);
create index rh_employee_birthdays_actor_idx on private.rh_employee_birthdays(updated_by);
create index rh_employee_birthdays_operator_idx on private.rh_employee_birthdays(operator_grant_id);
alter table private.rh_employee_birthdays enable row level security;
revoke all on private.rh_employee_birthdays from public,anon,authenticated;
grant select,insert,update on private.rh_employee_birthdays to service_role;
create function public.rh_employee_profile(target_profile uuid,target_session uuid,target_entry uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor jsonb;resources jsonb;result jsonb;
begin
 actor:=private.rh_leave_actor(target_profile,target_session,null);
 if actor->>'role'<>'rh' then raise exception 'RH_NOT_ALLOWED';end if;
 resources:=public.rh_leave_resources(target_profile,target_session,null,target_entry);
 select jsonb_build_object('entry_id',target_entry,'full_name',resources->>'full_name','position',resources->>'position',
  'birthday',case when d.bond_id is not null then case when d.birthday_month is not null then lpad(d.birthday_month::text,2,'0')||'-'||lpad(d.birthday_day::text,2,'0') end else to_char(s.birth_date,'MM-DD') end,
  'version',coalesce(d.version,0)) into result
 from public.employment_bonds b join public.servidores s on s.id=b.servidor_id left join private.rh_employee_birthdays d on d.bond_id=b.id where b.id=(resources->>'bond_id')::uuid;
 return result;
end $$;
create function public.rh_save_employee_birthday(target_profile uuid,target_session uuid,target_entry uuid,expected_version integer,target_month integer,target_day integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor jsonb;resources jsonb;bond uuid;previous private.rh_employee_birthdays%rowtype;
begin
 actor:=private.rh_leave_actor(target_profile,target_session,null);
 if actor->>'role'<>'rh' then raise exception 'RH_NOT_ALLOWED';end if;
 if expected_version is null or expected_version<0 or ((target_month is null)<>(target_day is null)) then raise exception 'RH_INPUT_INVALID';end if;
 if target_month is not null then
  if target_month not between 1 and 12 or target_day not between 1 and 31 then raise exception 'RH_INPUT_INVALID';end if;
  perform make_date(2000,target_month,target_day);
 end if;
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
 return public.rh_employee_profile(target_profile,target_session,target_entry);
exception when datetime_field_overflow then raise exception 'RH_INPUT_INVALID';
end $$;
revoke all on function public.rh_employee_profile(uuid,uuid,uuid),public.rh_save_employee_birthday(uuid,uuid,uuid,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.rh_employee_profile(uuid,uuid,uuid),public.rh_save_employee_birthday(uuid,uuid,uuid,integer,integer,integer) to service_role;

-- Competência da importação e aniversário sem expor ano de nascimento.
create or replace function public.rh_calendar_window(target_profile uuid,target_session uuid,target_cnes uuid,range_start date,range_end date,page_index integer default 0,search_text text default '',filter_json jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
declare selection jsonb;context jsonb;unit_id uuid;employees jsonb;bond_ids uuid[];rows_count integer;last_day date;result jsonb;ids uuid[];extra jsonb;records jsonb;
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'RH_NOT_ALLOWED';end if;
 if range_start is null or range_start not between date '1900-01-01' and date '2100-12-31' or range_end is null or range_end<range_start or range_end-range_start>92
  or page_index is null or page_index not between 0 and 100 or search_text is null or length(search_text)>120 then raise exception 'RH_INPUT_INVALID';end if;

 if filter_json is null or jsonb_typeof(filter_json)<>'object' or octet_length(filter_json::text)>2000 then raise exception 'RH_INPUT_INVALID';end if;
 if exists(select 1 from jsonb_each(filter_json) kv where kv.key not in ('position','cbo','team','review','type','status') or jsonb_typeof(kv.value)<>'string' or length(kv.value#>>'{}')>120) then raise exception 'RH_INPUT_INVALID';end if;
 filter_json:=jsonb_build_object('position','','cbo','','team','','review','todos','type','todos','status','todos')||filter_json;
 if filter_json->>'review' not in ('todos','pendente','conferido') or filter_json->>'type' not in ('todos','regulamentar','premio','banco_horas')
  or filter_json->>'status' not in ('todos','com_afastamento','sem_afastamento','programada','concluida','cancelada') then raise exception 'RH_INPUT_INVALID';end if;
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
 last_day:=range_end;
 select count(*) into rows_count from private.rh_calendar_employees(unit_id) r where (search_text='' or position(lower(search_text) in lower(concat_ws(' ',r.full_name,r.registration,r.position,r.cbo,r.team)))>0)
  and position(lower(filter_json->>'position') in lower(coalesce(r.position,'')))>0
  and position(lower(filter_json->>'cbo') in lower(coalesce(r.cbo,'')))>0
  and position(lower(filter_json->>'team') in lower(coalesce(r.team,'')))>0
  and (filter_json->>'review'='todos' or case when filter_json->>'review'='conferido' then r.binding_confirmed else not coalesce(r.binding_confirmed,false) end)
  and private.rh_calendar_window_matches(unit_id,r.bond_id,range_start,range_end,filter_json->>'status',filter_json->>'type');
 select coalesce(jsonb_agg(to_jsonb(r) order by r.full_name,r.row_id),'[]'),array_agg(distinct r.bond_id) filter(where r.bond_id is not null)
 into employees,bond_ids from (select * from private.rh_calendar_employees(unit_id) r where (search_text='' or position(lower(search_text) in lower(concat_ws(' ',r.full_name,r.registration,r.position,r.cbo,r.team)))>0)
  and position(lower(filter_json->>'position') in lower(coalesce(r.position,'')))>0
  and position(lower(filter_json->>'cbo') in lower(coalesce(r.cbo,'')))>0
  and position(lower(filter_json->>'team') in lower(coalesce(r.team,'')))>0
  and (filter_json->>'review'='todos' or case when filter_json->>'review'='conferido' then r.binding_confirmed else not coalesce(r.binding_confirmed,false) end)
  and private.rh_calendar_window_matches(unit_id,r.bond_id,range_start,range_end,filter_json->>'status',filter_json->>'type')
  order by r.full_name,r.row_id limit 50 offset page_index*50) r;
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
   'rh'::text origin,false distributed,'[]'::jsonb assigned_dates
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
 result:=jsonb_set(result,'{employees}',coalesce((select jsonb_agg(r||jsonb_build_object('birth_month_day',case when birthday.bond_id is not null then case when birthday.birthday_month is not null then lpad(birthday.birthday_month::text,2,'0')||'-'||lpad(birthday.birthday_day::text,2,'0') end else to_char(s.birth_date,'MM-DD') end) order by ord)
  from jsonb_array_elements(result->'employees') with ordinality rows(r,ord)
  left join public.employment_bonds b on b.id=(r->>'bond_id')::uuid
  left join public.servidores s on s.id=b.servidor_id left join private.rh_employee_birthdays birthday on birthday.bond_id=b.id),'[]'::jsonb));
 result:=result||jsonb_build_object('source_competence',(select competence from private.cnes_import_runs where cnes_unit_id=unit_id order by created_at desc,id desc limit 1));
 return jsonb_set(result,'{absences}',(result->'absences')||extra)||jsonb_build_object('records',case when jsonb_array_length(records)>50 then records-50 else records end,
  'records_has_more',jsonb_array_length(records)>50,'filters',filter_json);
end $$;
