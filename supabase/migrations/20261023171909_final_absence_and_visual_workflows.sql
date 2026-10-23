-- Mantém os registros existentes e suas versões. Datas sem retorno permanecem nulas.
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
    and (z->>'start_date')::date<=coalesce((p->>'end_date')::date,date '2100-12-31') and coalesce((z->>'end_date')::date,date '2100-12-31')>=(p->>'start_date')::date)
    or exists(select 1 from public.vacation_requests v join public.request_periods z on z.request_id=v.id
      where v.context_bond_id=target_bond and v.status not in ('cancelada','rejeitada','rascunho','devolvida')
      and z.start_date<=coalesce((p->>'end_date')::date,date '2100-12-31') and z.end_date>=(p->>'start_date')::date)
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
CREATE OR REPLACE FUNCTION public.manage_scoped_calendar_event(actor_id uuid, operation text, target_id uuid, expected_version integer, item jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
 SET statement_timeout TO '15s'
AS $function$
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
  v_scope:=item->>'scope';v_jurisdiction:=coalesce(previous.jurisdiction,'nao_informada');v_type:=item->>'type';v_name:=btrim(item->>'name');target_day:=(item->>'event_date')::date;
  if v_scope is null or v_scope not in ('general','units') 
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
  start_day:=(p->>'start_date')::date;end_day:=coalesce((p->>'end_date')::date,date '2100-12-31');
  if exists(select 1 from private.rh_leaves l cross join lateral jsonb_array_elements(l.plan->'periods') z
     where l.bond_id=bound_bond and l.status<>'cancelada' and not (l.plan->>'type'='dayoff' and leave_plan->>'counting_mode'='uteis') and (z->>'start_date')::date<=end_day and coalesce((z->>'end_date')::date,date '2100-12-31')>=start_day)
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
 if next_status='concluida' and entry.plan->'periods'->-1->>'end_date' is null then raise exception 'RH_ABSENCE_RETURN_REQUIRED';end if;
 if next_status='concluida' and (entry.plan->'periods'->-1->>'end_date')::date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'RH_LEAVE_NOT_ENDED';end if;
 update private.rh_leaves set status=next_status,version=version+1 where id=entry.id;
 insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_bond_id,context_cnes_unit_id,reason,previous_value,new_value)
 values(target_profile,(actor->>'role')::public.app_role,'rh_leave_'||next_status,'rh_leave',entry.id,entry.bond_id,entry.cnes_unit_id,btrim(target_reason),
 jsonb_build_object('status',entry.status),jsonb_build_object('status',next_status,'operator_name',actor->'operator'->>'name','operator_grant_id',actor->'operator'->>'id','declared_identity',actor->'declared'));
 if entry.plan->>'type'='dayoff' and next_status='cancelada' then perform private.rh_recalculate_dayoffs(entry.bond_id,target_profile,actor->'operator'->>'name',coalesce((actor->>'declared')::boolean,false));end if;
 return jsonb_build_object('ok',true);
end $function$
;
CREATE OR REPLACE FUNCTION public.rh_calendar_month(target_profile uuid, target_session uuid, target_cnes uuid, target_month date, page_index integer DEFAULT 0, search_text text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
 SET statement_timeout TO '8s'
AS $function$
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
   and (p->>'start_date')::date<(target_month+interval '1 month')::date and coalesce((p->>'end_date')::date,date '2100-12-31')>=target_month limit 1001) q;
 if jsonb_array_length(extra)+jsonb_array_length(result->'absences')>1000 then raise exception 'RH_CALENDAR_LIMIT';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id),'[]') into records from (
  select l.id,'RH-'||upper(left(replace(l.id::text,'-',''),12)) protocol,l.snapshot->>'full_name' full_name,
   l.snapshot->>'registration' registration,l.plan->>'type' type,l.status,l.created_at
  from private.rh_leaves l where l.cnes_unit_id=unit_id and l.bond_id=any(coalesce(ids,'{}'::uuid[]))
   and exists(select 1 from jsonb_array_elements(l.plan->'periods') p where (p->>'start_date')::date<(target_month+interval '1 month')::date and coalesce((p->>'end_date')::date,date '2100-12-31')>=target_month)
  order by l.created_at desc,l.id limit 51) q;
 return jsonb_set(result,'{absences}',(result->'absences')||extra)||jsonb_build_object('records',case when jsonb_array_length(records)>50 then records-50 else records end,
  'records_has_more',jsonb_array_length(records)>50);
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
  start_day:=(p->>'start_date')::date;end_day:=coalesce((p->>'end_date')::date,date '2100-12-31');
  if exists(select 1 from private.rh_leaves l cross join lateral jsonb_array_elements(l.plan->'periods') z where l.id<>entry.id and l.bond_id=bound_bond and l.status<>'cancelada' and not (l.plan->>'type'='dayoff' and leave_plan->>'counting_mode'='uteis')
    and (z->>'start_date')::date<=end_day and coalesce((z->>'end_date')::date,date '2100-12-31')>=start_day)
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
CREATE OR REPLACE FUNCTION private.rh_calendar_bond_matches(target_cnes uuid, target_bond uuid, target_month date, target_status text, target_type text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select case when target_status='todos' and target_type='todos' then true else
  (exists (
   select 1 from private.rh_leaves l where l.cnes_unit_id=target_cnes and l.bond_id=target_bond
    and (target_type='todos' or l.plan->>'type'=target_type)
    and case when target_status='todos' then true when target_status='cancelada' then l.status='cancelada' when target_status in ('programada','concluida') then l.status=target_status else l.status<>'cancelada' end
    and exists(select 1 from jsonb_array_elements(l.plan->'periods') p where (p->>'start_date')::date<target_month+interval '1 month' and coalesce((p->>'end_date')::date,date '2100-12-31')>=target_month)
   union all
   select 1 from public.vacation_requests v join public.request_periods p on p.request_id=v.id
   where v.context_bond_id=target_bond and (target_type='todos' or v.type::text=target_type)
    and v.status not in ('cancelada','rejeitada','rascunho','devolvida') and target_status<>'cancelada'
    and (target_status not in ('programada','concluida') or case when target_status='concluida' then v.status='concluida' else v.status<>'concluida' end)
    and p.start_date<target_month+interval '1 month' and p.end_date>=target_month
    and ((v.context_cnes_unit_id=target_cnes and v.status in ('programada','reprogramada','concluida'))
     or exists(select 1 from public.request_unit_reviews r where r.request_id=v.id and r.cnes_unit_id=target_cnes and r.status='programada'))
    and (not exists(select 1 from public.request_day_responsibilities d where d.request_id=v.id)
     or exists(select 1 from public.request_day_responsibilities d where d.request_id=v.id and d.cnes_unit_id=target_cnes
      and d.responsibility_date between greatest(target_month,p.start_date) and least((target_month+interval '1 month')::date-1,p.end_date)))
  )) is distinct from (target_status='sem_afastamento') end;
$function$
;
CREATE OR REPLACE FUNCTION public.rh_calendar_filtered(target_profile uuid, target_session uuid, target_cnes uuid, target_month date, page_index integer DEFAULT 0, search_text text DEFAULT ''::text, filter_json jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
 SET statement_timeout TO '8s'
AS $function$
declare selection jsonb;context jsonb;unit_id uuid;employees jsonb;bond_ids uuid[];rows_count integer;last_day date;result jsonb;ids uuid[];extra jsonb;records jsonb;
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'RH_NOT_ALLOWED';end if;
 if target_month is null or target_month<>date_trunc('month',target_month)::date or target_month not between date '1900-01-01' and date '2100-12-01'
  or page_index is null or page_index not between 0 and 100 or search_text is null or length(search_text)>120 then raise exception 'RH_INPUT_INVALID';end if;

 if filter_json is null or jsonb_typeof(filter_json)<>'object' or octet_length(filter_json::text)>2000 then raise exception 'RH_INPUT_INVALID';end if;
 if exists(select 1 from jsonb_each(filter_json) kv where kv.key not in ('position','cbo','team','review','type','status') or jsonb_typeof(kv.value)<>'string' or length(kv.value#>>'{}')>120) then raise exception 'RH_INPUT_INVALID';end if;
 filter_json:=jsonb_build_object('position','','cbo','','team','','review','todos','type','todos','status','todos')||filter_json;
 if filter_json->>'review' not in ('todos','pendente','conferido') or filter_json->>'type' not in ('todos','regulamentar','premio','banco_horas','folga','dayoff','afastamento')
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
 last_day:=(target_month+interval '1 month')::date-1;
 select count(*) into rows_count from private.rh_calendar_employees(unit_id) r where (search_text='' or position(lower(search_text) in lower(concat_ws(' ',r.full_name,r.registration,r.position,r.cbo,r.team)))>0)
  and position(lower(filter_json->>'position') in lower(coalesce(r.position,'')))>0
  and position(lower(filter_json->>'cbo') in lower(coalesce(r.cbo,'')))>0
  and position(lower(filter_json->>'team') in lower(coalesce(r.team,'')))>0
  and (filter_json->>'review'='todos' or case when filter_json->>'review'='conferido' then r.binding_confirmed else not coalesce(r.binding_confirmed,false) end)
  and private.rh_calendar_bond_matches(unit_id,r.bond_id,target_month,filter_json->>'status',filter_json->>'type');
 select coalesce(jsonb_agg(to_jsonb(r) order by r.full_name,r.row_id),'[]'),array_agg(distinct r.bond_id) filter(where r.bond_id is not null)
 into employees,bond_ids from (select * from private.rh_calendar_employees(unit_id) r where (search_text='' or position(lower(search_text) in lower(concat_ws(' ',r.full_name,r.registration,r.position,r.cbo,r.team)))>0)
  and position(lower(filter_json->>'position') in lower(coalesce(r.position,'')))>0
  and position(lower(filter_json->>'cbo') in lower(coalesce(r.cbo,'')))>0
  and position(lower(filter_json->>'team') in lower(coalesce(r.team,'')))>0
  and (filter_json->>'review'='todos' or case when filter_json->>'review'='conferido' then r.binding_confirmed else not coalesce(r.binding_confirmed,false) end)
  and private.rh_calendar_bond_matches(unit_id,r.bond_id,target_month,filter_json->>'status',filter_json->>'type')
  order by r.full_name,r.row_id limit 50 offset page_index*50) r;
 result:=jsonb_build_object('context',context,'operator',selection->'operator','month',target_month,'employees',employees,'total',rows_count,
  'absences',coalesce((select jsonb_agg(to_jsonb(a) order by a.start_date,a.id,a.sequence) from (
   select v.id,v.context_bond_id bond_id,v.protocol,v.type,v.status,p.sequence,p.start_date,p.end_date,p.return_date,'legado'::text origin,
    coalesce((select jsonb_agg(d.responsibility_date order by d.responsibility_date) from public.request_day_responsibilities d
     where d.request_id=v.id and d.cnes_unit_id=unit_id and d.responsibility_date between target_month and last_day),'[]') assigned_dates,
    exists(select 1 from public.request_day_responsibilities d where d.request_id=v.id) distributed
   from public.vacation_requests v join public.request_periods p on p.request_id=v.id
   where v.context_bond_id=any(coalesce(bond_ids,'{}'::uuid[])) and (filter_json->>'type'='todos' or v.type::text=filter_json->>'type') and v.status not in ('cancelada','rejeitada','rascunho','devolvida')
    and p.start_date<=last_day and p.end_date>=target_month
    and ((v.context_cnes_unit_id=unit_id and v.status in ('programada','reprogramada','concluida'))
      or exists(select 1 from public.request_unit_reviews r where r.request_id=v.id and r.cnes_unit_id=unit_id and r.status='programada'))
   order by p.start_date,v.id,p.sequence limit 1001) a),'[]'),
  'holidays',coalesce((select jsonb_agg(jsonb_build_object('date',event_date,'name',name,'type',type) order by event_date) from public.calendar_events where active and event_date between target_month and last_day),'[]'));
 if jsonb_array_length(result->'absences')>1000 then raise exception 'RH_CALENDAR_LIMIT';end if;
 unit_id:=(result->'context'->>'cnes_unit_id')::uuid;
 select array_agg((r->>'bond_id')::uuid) into ids from jsonb_array_elements(result->'employees') r where r->>'bond_id' is not null;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into extra from (
  select l.id,l.bond_id,'RH-'||upper(left(replace(l.id::text,'-',''),12)) protocol,l.plan->>'type' type,l.status,
   (p->>'sequence')::integer sequence,p->>'start_date' start_date,p->>'end_date' end_date,p->>'return_date' return_date,
   'rh'::text origin,false distributed,'[]'::jsonb assigned_dates
  from private.rh_leaves l cross join lateral jsonb_array_elements(l.plan->'periods') p
  where l.cnes_unit_id=unit_id and l.bond_id=any(coalesce(ids,'{}'::uuid[])) and l.status<>'cancelada' and (filter_json->>'type'='todos' or l.plan->>'type'=filter_json->>'type')
   and (p->>'start_date')::date<(target_month+interval '1 month')::date and coalesce((p->>'end_date')::date,date '2100-12-31')>=target_month limit 1001) q;
 if jsonb_array_length(extra)+jsonb_array_length(result->'absences')>1000 then raise exception 'RH_CALENDAR_LIMIT';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id),'[]') into records from (
  select l.id,'RH-'||upper(left(replace(l.id::text,'-',''),12)) protocol,l.snapshot->>'full_name' full_name,
   l.snapshot->>'registration' registration,l.plan->>'type' type,l.status,l.created_at
  from private.rh_leaves l where l.cnes_unit_id=unit_id and l.bond_id=any(coalesce(ids,'{}'::uuid[])) and (filter_json->>'type'='todos' or l.plan->>'type'=filter_json->>'type') and (filter_json->>'status' not in ('programada','concluida','cancelada') or l.status=filter_json->>'status')
   and exists(select 1 from jsonb_array_elements(l.plan->'periods') p where (p->>'start_date')::date<(target_month+interval '1 month')::date and coalesce((p->>'end_date')::date,date '2100-12-31')>=target_month)
  order by l.created_at desc,l.id limit 51) q;
 if filter_json->>'type'<>'todos' then
  result:=jsonb_set(result,'{absences}',coalesce((select jsonb_agg(a) from jsonb_array_elements(result->'absences') a where a->>'type'=filter_json->>'type'),'[]'));
  extra:=coalesce((select jsonb_agg(a) from jsonb_array_elements(extra) a where a->>'type'=filter_json->>'type'),'[]');
  records:=coalesce((select jsonb_agg(a) from jsonb_array_elements(records) a where a->>'type'=filter_json->>'type'),'[]');
 end if;
 return jsonb_set(result,'{absences}',(result->'absences')||extra)||jsonb_build_object('records',case when jsonb_array_length(records)>50 then records-50 else records end,
  'records_has_more',jsonb_array_length(records)>50,'filters',filter_json);
end $function$
;
CREATE OR REPLACE FUNCTION private.rh_calendar_window_matches(target_cnes uuid, target_bond uuid, range_start date, range_end date, target_status text, target_type text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select case when target_status='todos' and target_type='todos' then true else
  (exists (
   select 1 from private.rh_leaves l where l.cnes_unit_id=target_cnes and l.bond_id=target_bond
    and (target_type='todos' or l.plan->>'type'=target_type)
    and case when target_status='todos' then true when target_status='cancelada' then l.status='cancelada' when target_status in ('programada','concluida') then l.status=target_status else l.status<>'cancelada' end
    and exists(select 1 from jsonb_array_elements(l.plan->'periods') p where (p->>'start_date')::date<range_end+1 and coalesce((p->>'end_date')::date,date '2100-12-31')>=range_start)
   union all
   select 1 from public.vacation_requests v join public.request_periods p on p.request_id=v.id
   where v.context_bond_id=target_bond and (target_type='todos' or v.type::text=target_type)
    and v.status not in ('cancelada','rejeitada','rascunho','devolvida') and target_status<>'cancelada'
    and (target_status not in ('programada','concluida') or case when target_status='concluida' then v.status='concluida' else v.status<>'concluida' end)
    and p.start_date<range_end+1 and p.end_date>=range_start
    and ((v.context_cnes_unit_id=target_cnes and v.status in ('programada','reprogramada','concluida'))
     or exists(select 1 from public.request_unit_reviews r where r.request_id=v.id and r.cnes_unit_id=target_cnes and r.status='programada'))
    and (not exists(select 1 from public.request_day_responsibilities d where d.request_id=v.id)
     or exists(select 1 from public.request_day_responsibilities d where d.request_id=v.id and d.cnes_unit_id=target_cnes
      and d.responsibility_date between greatest(range_start,p.start_date) and least((range_end+1)::date-1,p.end_date)))
  )) is distinct from (target_status='sem_afastamento') end;
$function$
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
 if filter_json->>'review' not in ('todos','pendente','conferido') or filter_json->>'type' not in ('todos','regulamentar','premio','banco_horas','folga','dayoff','afastamento') or filter_json->>'status' not in ('todos','com_afastamento','sem_afastamento','programada','concluida','cancelada') then raise exception 'RH_INPUT_INVALID';end if;
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
 select l.bond_id,(p->>'start_date')::date first_day,coalesce((p->>'end_date')::date,date '2100-12-31') last_day,null::uuid legacy_id from private.rh_leaves l
 cross join lateral jsonb_array_elements(l.plan->'periods') p where l.cnes_unit_id=unit_id and l.status<>'cancelada'
 and (filter_json->>'type'='todos' or l.plan->>'type'=filter_json->>'type')
 and (p->>'start_date')::date<=range_end and coalesce((p->>'end_date')::date,date '2100-12-31')>=range_start
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
   and (p->>'start_date')::date<(range_end+1)::date and coalesce((p->>'end_date')::date,date '2100-12-31')>=range_start limit 1001) q;
 if jsonb_array_length(extra)+jsonb_array_length(result->'absences')>1000 then raise exception 'RH_CALENDAR_LIMIT';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id),'[]') into records from (
  select l.id,'RH-'||upper(left(replace(l.id::text,'-',''),12)) protocol,l.snapshot->>'full_name' full_name,
   l.snapshot->>'registration' registration,l.plan->>'type' type,l.status,l.created_at
  from private.rh_leaves l where l.cnes_unit_id=unit_id and l.bond_id=any(coalesce(ids,'{}'::uuid[])) and (filter_json->>'type'='todos' or l.plan->>'type'=filter_json->>'type') and (filter_json->>'status' not in ('programada','concluida','cancelada') or l.status=filter_json->>'status')
   and exists(select 1 from jsonb_array_elements(l.plan->'periods') p where (p->>'start_date')::date<(range_end+1)::date and coalesce((p->>'end_date')::date,date '2100-12-31')>=range_start)
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
 and (p->>'start_date')::date<=end_day and coalesce((p->>'end_date')::date,date '2100-12-31')>=start_day) then raise exception 'RH_LEAVE_OVERLAP';end if;
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

create function public.rh_record_absence(target_profile uuid,target_session uuid,target_entry uuid,request_key uuid,item jsonb) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='10s' as $$
declare actor jsonb;resources jsonb;kind text;reference text;notes text;dates date[];start_day date;return_day date;end_day date;
 periods jsonb:='[]';p jsonb;input_hash text;previous private.rh_leaves%rowtype;new_id uuid;plan jsonb;g record;seq integer:=0;bond uuid;
begin
 actor:=private.rh_leave_actor(target_profile,target_session,null);
 if actor->>'role'<>'rh' then raise exception 'RH_NOT_ALLOWED';end if;
 if request_key is null or jsonb_typeof(item) is distinct from 'object' or octet_length(item::text)>20000 then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 kind:=item->>'type';reference:=btrim(item->>'reference');notes:=coalesce(item->>'notes','');
 if kind is null or kind not in ('folga','afastamento') or reference is null or length(reference) not between 3 and 300 or length(notes)>1000 then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 if kind='folga' then
  if jsonb_typeof(item->'dates') is distinct from 'array' or jsonb_array_length(item->'dates') not between 1 and 366 then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
  select array_agg(distinct d::date order by d::date) into dates from jsonb_array_elements_text(item->'dates') d;
  if exists(select 1 from unnest(dates) d where d is null or d not between date '1900-01-01' and date '2100-12-31') then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
  for g in select min(d) first_day,max(d) last_day,count(*) n from (select d,d-(row_number() over(order by d))::integer grp from unnest(dates) d) t group by grp order by first_day loop
   seq:=seq+1;periods:=periods||jsonb_build_array(jsonb_build_object('sequence',seq,'start_date',g.first_day,'end_date',g.last_day,'return_date',null,'days',g.n,'counting_mode','corridos'));
  end loop;
 else
  start_day:=(item->>'start')::date;return_day:=nullif(item->>'returnDate','')::date;
  if start_day is null or start_day not between date '1900-01-01' and date '2100-12-31' or return_day<=start_day or return_day>date '2100-12-31' then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
  end_day:=return_day-1;
  periods:=jsonb_build_array(jsonb_build_object('sequence',1,'start_date',start_day,'end_date',end_day,'return_date',return_day,'days',return_day-start_day,'counting_mode','corridos'));
 end if;
 input_hash:=encode(sha256(convert_to(jsonb_build_object('entry',target_entry,'type',kind,'periods',periods,'reference',reference,'notes',notes)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('rh-absence-key:'||target_profile::text||':'||request_key::text,0));
 select * into previous from private.rh_leaves l where l.created_by=target_profile and l.request_key=rh_record_absence.request_key;
 if found then
  if previous.input_digest<>input_hash then raise exception 'RH_LEAVE_IDEMPOTENCY_CONFLICT';end if;
  return jsonb_build_object('id',previous.id,'version',previous.version,'replayed',true);
 end if;
 perform private.planning_lock();
 resources:=public.rh_leave_resources(target_profile,target_session,null,target_entry);bond:=(resources->>'bond_id')::uuid;
 perform 1 from public.employment_bonds where id=bond for update;
 if (select count(*) from private.rh_leaves where created_by=target_profile and created_at>now()-interval '1 minute')>=30 then raise exception 'RH_LEAVE_RATE_LIMIT';end if;
 for p in select value from jsonb_array_elements(periods) loop
  start_day:=(p->>'start_date')::date;end_day:=coalesce((p->>'end_date')::date,date '2100-12-31');
  if exists(select 1 from private.rh_leaves l cross join lateral jsonb_array_elements(l.plan->'periods') z
   where l.bond_id=bond and l.status<>'cancelada' and (z->>'start_date')::date<=end_day and coalesce((z->>'end_date')::date,date '2100-12-31')>=start_day)
   or exists(select 1 from public.vacation_requests v join public.request_periods z on z.request_id=v.id
    where v.context_bond_id=bond and v.status not in ('cancelada','rejeitada','rascunho','devolvida') and z.start_date<=end_day and z.end_date>=start_day) then raise exception 'RH_LEAVE_OVERLAP';end if;
 end loop;
 plan:=jsonb_build_object('type',kind,'periods',periods,'counting_mode','corridos','days',case when kind='folga' then cardinality(dates) else return_day-(item->>'start')::date end,
  'recognition_reference',reference,'notes',notes,'open_ended',kind='afastamento' and return_day is null,'bank',jsonb_build_object('required_minutes',0));
 insert into private.rh_leaves(cnes_unit_id,entry_id,bond_id,created_by,operator_grant_id,operator_name,operator_declared,request_key,input_digest,preview_digest,snapshot,plan)
 values((actor->'context'->>'cnes_unit_id')::uuid,target_entry,bond,target_profile,(actor->'operator'->>'id')::uuid,actor->'operator'->>'name',true,request_key,input_hash,input_hash,resources,plan) returning id into new_id;
 insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_bond_id,context_cnes_unit_id,reason,new_value)
 values(target_profile,'rh','rh_absence_created','rh_leave',new_id,bond,(actor->'context'->>'cnes_unit_id')::uuid,reference,
 jsonb_build_object('operator_name',actor->'operator'->>'name','operator_grant_id',actor->'operator'->>'id','type',kind,'periods',periods,'declared_identity',true));
 return jsonb_build_object('id',new_id,'version',1,'replayed',false);
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then raise exception 'RH_LEAVE_INPUT_INVALID';
end $$;

create function public.rh_set_absence_return(target_profile uuid,target_session uuid,target_leave uuid,expected_version integer,return_day date,target_reason text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor jsonb;l private.rh_leaves%rowtype;start_day date;end_day date;new_plan jsonb;
begin
 actor:=private.rh_leave_actor(target_profile,target_session,null);
 if actor->>'role'<>'rh' then raise exception 'RH_NOT_ALLOWED';end if;
 if length(btrim(coalesce(target_reason,''))) not between 3 and 500 then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 perform private.planning_lock();
 select * into l from private.rh_leaves where id=target_leave and cnes_unit_id=(actor->'context'->>'cnes_unit_id')::uuid for update;
 if not found then raise exception 'RH_LEAVE_NOT_FOUND';end if;
 if l.version is distinct from expected_version or l.status<>'programada' then raise exception 'RH_VERSION_CONFLICT';end if;
 if l.plan->>'type'<>'afastamento' then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 start_day:=(l.plan->'periods'->0->>'start_date')::date;end_day:=coalesce(return_day-1,date '2100-12-31');
 if return_day<=start_day or return_day>date '2100-12-31' then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 if exists(select 1 from private.rh_leaves other cross join lateral jsonb_array_elements(other.plan->'periods') p
  where other.id<>l.id and other.bond_id=l.bond_id and other.status<>'cancelada' and (p->>'start_date')::date<=end_day and coalesce((p->>'end_date')::date,date '2100-12-31')>=start_day)
  or exists(select 1 from public.vacation_requests v join public.request_periods p on p.request_id=v.id where v.context_bond_id=l.bond_id and v.status not in ('cancelada','rejeitada','rascunho','devolvida') and p.start_date<=end_day and p.end_date>=start_day) then raise exception 'RH_LEAVE_OVERLAP';end if;
 new_plan:=l.plan||jsonb_build_object('open_ended',return_day is null,'days',return_day-start_day,'periods',jsonb_build_array((l.plan->'periods'->0)||jsonb_build_object('end_date',return_day-1,'return_date',return_day,'days',return_day-start_day)));
 insert into private.rh_leave_revisions(leave_id,version,snapshot,plan,status,changed_by,operator_name,operator_declared,reason)
 values(l.id,l.version,l.snapshot,l.plan,l.status,target_profile,actor->'operator'->>'name',true,btrim(target_reason));
 update private.rh_leaves set plan=new_plan,version=version+1 where id=l.id;
 insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_bond_id,context_cnes_unit_id,reason,previous_value,new_value)
 values(target_profile,'rh','rh_absence_return_updated','rh_leave',l.id,l.bond_id,l.cnes_unit_id,btrim(target_reason),jsonb_build_object('periods',l.plan->'periods'),jsonb_build_object('periods',new_plan->'periods','operator_name',actor->'operator'->>'name','declared_identity',true));
 return jsonb_build_object('id',l.id,'version',l.version+1);
end $$;
revoke all on function public.rh_record_absence(uuid,uuid,uuid,uuid,jsonb),public.rh_set_absence_return(uuid,uuid,uuid,integer,date,text) from public,anon,authenticated;
grant execute on function public.rh_record_absence(uuid,uuid,uuid,uuid,jsonb),public.rh_set_absence_return(uuid,uuid,uuid,integer,date,text) to service_role;

CREATE OR REPLACE FUNCTION public.view_cnes_source(actor_id uuid, target_cnes uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 perform private.require_cnes_import_admin(actor_id);
 return jsonb_build_object('source',(select jsonb_build_object('payload',s.payload,'collected_at',s.collected_at) from private.cnes_unit_sources s where s.cnes_unit_id=target_cnes),
 'dayoffs',coalesce((select jsonb_agg(jsonb_build_object('entry_id',e.id,'name',e.source_data->>'fullName','birthday_month',d.birthday_month,'birthday_day',d.birthday_day))
 from private.cnes_registry_entries e join private.rh_registry_bonds b on b.entry_id=e.id
 join private.rh_employee_birthdays d on d.bond_id=b.bond_id where e.cnes_unit_id=target_cnes),'[]'),
 'occurrences',coalesce((select jsonb_agg(jsonb_build_object('name',l.snapshot->>'full_name','type',l.plan->>'type','periods',l.plan->'periods','status',l.status))
 from private.rh_leaves l where l.cnes_unit_id=target_cnes and l.plan->>'type' in ('dayoff','folga','afastamento')),'[]'));
end $function$
;
