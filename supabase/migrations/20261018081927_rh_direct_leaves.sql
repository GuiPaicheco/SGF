create table private.rh_leaves (
 id uuid primary key default gen_random_uuid(),
 cnes_unit_id uuid not null references public.cnes_units(id),
 entry_id uuid not null references private.cnes_registry_entries(id),
 bond_id uuid not null references public.employment_bonds(id),
 created_by uuid not null references public.profiles(id),
 operator_grant_id uuid references private.rh_operator_grants(id),
 operator_name text not null,
 operator_declared boolean not null,
 request_key uuid not null,
 input_digest text not null,
 preview_digest text not null,
 status text not null default 'programada' check(status in ('programada','cancelada','concluida')),
 version integer not null default 1,
 snapshot jsonb not null,
 plan jsonb not null,
 created_at timestamptz not null default now(),
 unique(created_by,request_key)
);
create index rh_leaves_unit_date_idx on private.rh_leaves(cnes_unit_id,created_at desc);
create index rh_leaves_bond_idx on private.rh_leaves(bond_id);
create index rh_leaves_entry_idx on private.rh_leaves(entry_id);
create index rh_leaves_operator_idx on private.rh_leaves(operator_grant_id);
alter table private.rh_leaves enable row level security;
revoke all on private.rh_leaves from public,anon,authenticated;
grant select,insert,update on private.rh_leaves to service_role;

-- Curta transação de gravação: uma revogação não passa entre conferir e gravar.
create function private.rh_lock_auth_session(target_profile uuid,target_session uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'RH_NOT_ALLOWED';end if;
 perform 1 from auth.sessions where id=target_session and user_id=target_profile and (not_after is null or not_after>now()) for share;
 if not found then raise exception 'RH_SESSION_INVALID';end if;
end $$;

create function private.rh_leave_actor(target_profile uuid,target_session uuid,target_cnes uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare selection jsonb;context jsonb;
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'RH_NOT_ALLOWED';end if;
 perform 1 from private.rh_unit_accounts where profile_id=target_profile for share;
 perform 1 from public.profiles where id=target_profile for share;
 perform private.rh_lock_auth_session(target_profile,target_session);
 context:=public.rh_account_context(target_profile);
 if context is not null then
  perform 1 from private.rh_unit_accounts where profile_id=target_profile for share;
  perform 1 from private.rh_operator_sessions s join private.rh_operator_grants g on g.id=s.grant_id
   where s.profile_id=target_profile and s.session_id=target_session for share of s,g;
  selection:=public.rh_session_state(target_profile,target_session);
  if selection->'operator'='null'::jsonb then raise exception 'RH_OPERATOR_REQUIRED';end if;
  if target_cnes is not null and target_cnes<>(context->>'cnes_unit_id')::uuid then raise exception 'RH_BOND_OUT_OF_UNIT';end if;
  return jsonb_build_object('context',selection->'context','operator',selection->'operator','role','rh','declared',true);
 end if;
 perform private.require_cnes_import_admin(target_profile);
 if not exists(select 1 from public.cnes_units where id=target_cnes and active) then raise exception 'RH_UNIT_INVALID';end if;
 return jsonb_build_object('context',jsonb_build_object('cnes_unit_id',target_cnes),'operator',
  jsonb_build_object('name',(select full_name from public.profiles where id=target_profile)), 'role','administrador','declared',false);
end $$;

create function public.rh_leave_resources(target_profile uuid,target_session uuid,target_cnes uuid,target_entry uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor jsonb;entry private.cnes_registry_entries%rowtype;binding private.rh_registry_bonds%rowtype;bond public.employment_bonds%rowtype;
begin
 actor:=private.rh_leave_actor(target_profile,target_session,target_cnes);
 select * into entry from private.cnes_registry_entries where id=target_entry and cnes_unit_id=(actor->'context'->>'cnes_unit_id')::uuid;
 if not found then raise exception 'RH_BOND_OUT_OF_UNIT';end if;
 select * into binding from private.rh_registry_bonds where entry_id=entry.id;
 select * into bond from public.employment_bonds where id=binding.bond_id;
 if binding.entry_version is distinct from entry.version or entry.review_status<>'reviewed' or not coalesce(bond.active,false)
  or bond.pole_cnes_unit_id is distinct from entry.cnes_unit_id or lower(entry.source_data->>'status') is distinct from 'ativo'
  or nullif(entry.source_data->>'deactivationCompetence','') is not null
  or not exists(select 1 from public.servidores where id=bond.servidor_id and active)
  or not exists(select 1 from public.employment_bond_units where bond_id=bond.id and cnes_unit_id=entry.cnes_unit_id and active)
  then raise exception 'RH_ENTRY_REVIEW_REQUIRED';end if;
 return jsonb_build_object('entry_id',entry.id,'entry_version',entry.version,'binding_version',binding.version,'bond_id',bond.id,'bond_version',bond.version,
  'full_name',coalesce(entry.local_data->>'fullName',entry.source_data->>'fullName'),'registration',bond.registration,
  'position',entry.local_data->>'municipalPosition','cbo',entry.source_data->>'cbo',
  'weekly_hours',coalesce(entry.local_data->'weeklyHours',entry.source_data->'weeklyHours'),
  'team',coalesce(entry.local_data->>'teamLabel',(select string_agg(t->>'name',', ' order by t->>'name') from jsonb_array_elements(coalesce(entry.source_data->'teams','[]')) t)),
  'birth_date',(select birth_date from public.servidores where id=bond.servidor_id),'admission_date',bond.admission_date,'employment_type',bond.employment_type,
  'cnes_code',(select code from public.cnes_units where id=entry.cnes_unit_id),'unit',(select name from public.cnes_units where id=entry.cnes_unit_id),
  'rights',coalesce((select jsonb_agg(jsonb_build_object('id',id,'type',type,'acquisition_end',acquisition_end,'available_days',available_days,'version',version)) from public.vacation_rights where bond_id=bond.id),'[]'));
end $$;

create function private.rh_make_leave_plan(resources jsonb,item jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare kind text:=item->>'type';birth date;admission date;acquisition date;start_day date;second_start date;mode text;quantity integer;first_days integer;
 daily numeric;available numeric;requested_extra numeric;required_minutes integer:=0;available_minutes integer:=0;extra_days integer:=0;
 excluded date[];periods jsonb:='[]';p jsonb;split text:=coalesce(item->>'split','none');deficit integer:=0;notes text;
begin
 if jsonb_typeof(item) is distinct from 'object' or octet_length(item::text)>8000 or kind is null or kind not in ('regulamentar','premio','banco_horas')
  or (item->>'eligibilityConfirmed')::boolean is distinct from true then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 birth:=coalesce(nullif(resources->>'birth_date','')::date,nullif(item->>'birthDate','')::date);
 admission:=nullif(resources->>'admission_date','')::date;
 if birth is null or admission is null or birth>admission or birth<date '1900-01-01' then raise exception 'RH_LEAVE_IDENTITY_REQUIRED';end if;
 if nullif(item->>'birthDate','') is not null and birth<>(item->>'birthDate')::date then raise exception 'RH_LEAVE_IDENTITY_REQUIRED';end if;
 start_day:=(item->>'startDate')::date;
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
 select coalesce(array_agg(event_date),'{}') into excluded from public.calendar_events where active and event_date between start_day and start_day+1100;
 first_days:=quantity;
 if split<>'none' then
  if kind<>'regulamentar' or resources->>'employment_type'<>'efetivo' or item->>'unjustifiedAbsences'<>'no'
   or mode<>'uteis' or quantity<>25 or split not in ('15-10','10-15') then raise exception 'RH_LEAVE_SPLIT_INVALID';end if;
  first_days:=split_part(split,'-',1)::integer;
 end if;
 p:=private.calculate_preserved_period(start_day,first_days,mode,birth,excluded);periods:=periods||jsonb_build_array(p||jsonb_build_object('sequence',1));
 if split<>'none' then
  second_start:=nullif(item->>'secondStartDate','')::date;
  if second_start is null or second_start<(p->>'return_date')::date or second_start>start_day+730 then raise exception 'RH_LEAVE_SPLIT_INVALID';end if;
  p:=private.calculate_preserved_period(second_start,split_part(split,'-',2)::integer,mode,birth,excluded);
  periods:=periods||jsonb_build_array(p||jsonb_build_object('sequence',2));
 end if;
 if (periods->-1->>'end_date')::date>date '2100-12-31' then raise exception 'RH_LEAVE_DATES_INVALID';end if;
 return jsonb_build_object('type',kind,'periods',periods,'days',quantity,'vacation_days',case when kind='banco_horas' then 0 else quantity-extra_days end,'counting_mode',mode,'acquisition_end',acquisition,'birth_date',birth,
  'bank',jsonb_build_object('declared_minutes',available_minutes,'daily_minutes',daily*60,'required_minutes',required_minutes,'missing_minutes',deficit,
   'possible_days',case when daily>0 then floor(available/daily) else null end,'override',deficit>0 and coalesce((item->>'override')::boolean,false),
   'override_reason',case when deficit>0 and (item->>'override')::boolean then btrim(item->>'overrideReason') else null end),
  'can_save',deficit=0 or coalesce((item->>'override')::boolean,false),'notes',notes,'eligibility_confirmed',true);
exception when invalid_text_representation or division_by_zero or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then raise exception 'RH_LEAVE_INPUT_INVALID';
end $$;

create function public.rh_preview_leave(target_profile uuid,target_session uuid,target_cnes uuid,target_entry uuid,item jsonb) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
declare resources jsonb;plan jsonb;actor jsonb;result jsonb;selected_right jsonb;
begin
 actor:=private.rh_leave_actor(target_profile,target_session,target_cnes);
 resources:=public.rh_leave_resources(target_profile,target_session,target_cnes,target_entry);
 plan:=private.rh_make_leave_plan(resources,item);
 if nullif(item->>'rightId','') is not null then
  select value into selected_right from jsonb_array_elements(resources->'rights') where value->>'id'=item->>'rightId';
  if selected_right is null or selected_right->>'type'<>plan->>'type'
   or (plan->>'type'='regulamentar' and selected_right->>'acquisition_end'<>plan->>'acquisition_end')
   or (selected_right->>'available_days')::integer<(plan->>'vacation_days')::integer then raise exception 'RH_LEAVE_RIGHT_INVALID';end if;
  plan:=plan||jsonb_build_object('right_id',selected_right->>'id','right_version',selected_right->'version');
 end if;
 result:=jsonb_build_object('resources',resources-'rights','plan',plan,'actor',actor,'entry_id',target_entry);
 return result||jsonb_build_object('digest',encode(extensions.digest(result::text,'sha256'),'hex'));
end $$;

create function public.rh_create_leave(target_profile uuid,target_session uuid,target_cnes uuid,target_entry uuid,item jsonb,
 request_key uuid,expected_digest text) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
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
     where l.bond_id=bound_bond and l.status<>'cancelada' and (z->>'start_date')::date<=end_day and (z->>'end_date')::date>=start_day)
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
end $$;

create function public.rh_leave_detail(target_profile uuid,target_session uuid,target_cnes uuid,target_leave uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor jsonb;result private.rh_leaves%rowtype;
begin
 actor:=private.rh_leave_actor(target_profile,target_session,target_cnes);
 select * into result from private.rh_leaves where id=target_leave and cnes_unit_id=(actor->'context'->>'cnes_unit_id')::uuid;
 if not found then raise exception 'RH_LEAVE_NOT_FOUND';end if;
 return (to_jsonb(result)-'input_digest'-'preview_digest'-'request_key')||jsonb_build_object('history',coalesce((select jsonb_agg(to_jsonb(h) order by h.occurred_at,h.id) from (
  select a.id,a.occurred_at,a.action,a.reason,a.actor_name_at_event account_name,a.new_value->>'operator_name' operator_name,
   a.new_value->>'declared_identity' declared_identity
  from public.audit_events a where a.entity_type='rh_leave' and a.entity_id=result.id and a.context_cnes_unit_id=result.cnes_unit_id
  order by a.occurred_at desc,a.id desc limit 50) h),'[]'));
end $$;

create function public.rh_close_leave(target_profile uuid,target_session uuid,target_cnes uuid,target_leave uuid,expected_version integer,
 next_status text,target_reason text) returns jsonb
language plpgsql security invoker set search_path='' as $$
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
 return jsonb_build_object('ok',true);
end $$;

-- Acrescenta lançamentos RH à projeção mensal, sem repetir ou converter legado.
alter function public.rh_calendar_month(uuid,uuid,uuid,date,integer,text) rename to rh_calendar_legacy_month;
create function public.rh_calendar_month(target_profile uuid,target_session uuid,target_cnes uuid,target_month date,page_index integer default 0,search_text text default '') returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
declare result jsonb;unit_id uuid;ids uuid[];extra jsonb;records jsonb;
begin
 result:=public.rh_calendar_legacy_month(target_profile,target_session,target_cnes,target_month,page_index,search_text);
 unit_id:=(result->'context'->>'cnes_unit_id')::uuid;
 select array_agg((r->>'bond_id')::uuid) into ids from jsonb_array_elements(result->'employees') r where r->>'bond_id' is not null;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into extra from (
  select l.id,l.bond_id,'RH-'||upper(left(replace(l.id::text,'-',''),12)) protocol,l.plan->>'type' type,l.status,
   (p->>'sequence')::integer sequence,p->>'start_date' start_date,p->>'end_date' end_date,p->>'return_date' return_date,
   'rh'::text origin,false distributed,'[]'::jsonb assigned_dates
  from private.rh_leaves l cross join lateral jsonb_array_elements(l.plan->'periods') p
  where l.cnes_unit_id=unit_id and l.bond_id=any(coalesce(ids,'{}'::uuid[])) and l.status<>'cancelada'
   and (p->>'start_date')::date<(target_month+interval '1 month')::date and (p->>'end_date')::date>=target_month limit 1001) q;
 if jsonb_array_length(extra)+jsonb_array_length(result->'absences')>1000 then raise exception 'RH_CALENDAR_LIMIT';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id),'[]') into records from (
  select l.id,'RH-'||upper(left(replace(l.id::text,'-',''),12)) protocol,l.snapshot->>'full_name' full_name,
   l.snapshot->>'registration' registration,l.plan->>'type' type,l.status,l.created_at
  from private.rh_leaves l where l.cnes_unit_id=unit_id and l.bond_id=any(coalesce(ids,'{}'::uuid[]))
   and exists(select 1 from jsonb_array_elements(l.plan->'periods') p where (p->>'start_date')::date<(target_month+interval '1 month')::date and (p->>'end_date')::date>=target_month)
  order by l.created_at desc,l.id limit 51) q;
 return jsonb_set(result,'{absences}',(result->'absences')||extra)||jsonb_build_object('records',case when jsonb_array_length(records)>50 then records-50 else records end,
  'records_has_more',jsonb_array_length(records)>50);
end $$;

do $$ declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname in ('rh_leave_resources','rh_preview_leave','rh_create_leave','rh_leave_detail','rh_close_leave','rh_calendar_month','rh_calendar_legacy_month'))
  or (n.nspname='private' and p.proname in ('rh_lock_auth_session','rh_leave_actor','rh_make_leave_plan')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);
  execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
