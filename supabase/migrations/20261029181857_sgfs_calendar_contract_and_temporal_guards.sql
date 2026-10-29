-- Exclusivamente homologação; contrato explícito e proteção de versões históricas.
CREATE OR REPLACE FUNCTION private.perform_calendar_event_change(actor_id uuid, operation text, target_id uuid, expected_version integer, item jsonb)
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
  v_scope:=item->>'scope';v_jurisdiction:=item->>'jurisdiction';v_type:=item->>'type';v_name:=btrim(item->>'name');target_day:=(item->>'event_date')::date;
  if v_jurisdiction is null or v_jurisdiction not in ('municipal','estadual','federal','institucional') or coalesce(item->>'source_url','') !~ '^https?://[^[:space:]]+$' or length(item->>'source_url')>2000 or v_scope is null or v_scope not in ('general','units')
   or target_day is null or target_day not between date '1900-01-01' and date '2100-12-31'
   or v_type is null or v_type not in ('feriado','ponto_facultativo') or v_name is null or length(v_name) not between 1 and 200
   or jsonb_typeof(item->'unit_ids') is distinct from 'array' or jsonb_array_length(item->'unit_ids')>100 then raise exception 'CALENDAR_INPUT_INVALID';end if;
  select coalesce(array_agg(distinct x::uuid order by x::uuid),'{}') into ids from jsonb_array_elements_text(item->'unit_ids') x;
  if (v_scope='general' and cardinality(ids)<>0) or (v_scope='units' and cardinality(ids)=0)
   or exists(select 1 from unnest(ids) id where not exists(select 1 from public.cnes_units u where u.id=id and u.active)) then raise exception 'CALENDAR_SCOPE_INVALID';end if;
  if exists(select 1 from public.calendar_events e where e.id is distinct from target_id and e.event_date=target_day and e.type::text=v_type and e.scope=v_scope and e.unit_ids=ids) then raise exception 'CALENDAR_DUPLICATED';end if;
  if target_id is null then
   insert into public.calendar_events(event_date,type,name,scope,unit_ids,jurisdiction,source_url) values(target_day,v_type::public.calendar_event_type,v_name,v_scope,ids,v_jurisdiction,item->>'source_url') returning * into result;
  else
   update public.calendar_events set event_date=target_day,type=v_type::public.calendar_event_type,name=v_name,scope=v_scope,unit_ids=ids,jurisdiction=v_jurisdiction,source_url=item->>'source_url',active=true,version=version+1 where id=target_id returning * into result;
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
  if exists(select 1 from jsonb_array_elements(l.plan->'periods') x where (x->>'start_date')::date <= (now() at time zone 'America/Sao_Paulo')::date) then raise exception 'RH_CALENDAR_STARTED_REVIEW_REQUIRED';end if;
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
 if next_status='cancelada' and entry.plan->>'type' in ('regulamentar','premio') and exists(select 1 from jsonb_array_elements(entry.plan->'periods') p where (p->>'start_date')::date <= (now() at time zone 'America/Sao_Paulo')::date) then raise exception 'RH_LEAVE_STARTED_REVIEW_REQUIRED';end if;
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
CREATE OR REPLACE FUNCTION public.rh_preview_leave_revision(target_profile uuid, target_session uuid, target_cnes uuid, target_leave uuid, expected_version integer, item jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
 SET statement_timeout TO '8s'
AS $function$
declare actor jsonb;entry private.rh_leaves%rowtype;preview jsonb;
begin
 actor:=private.rh_leave_actor(target_profile,target_session,target_cnes);
 select * into entry from private.rh_leaves where id=target_leave and cnes_unit_id=(actor->'context'->>'cnes_unit_id')::uuid for share;
 if not found then raise exception 'RH_LEAVE_NOT_FOUND';end if;
 if expected_version is null or expected_version<>entry.version or entry.status<>'programada' then raise exception 'RH_VERSION_CONFLICT';end if;
 if exists(select 1 from jsonb_array_elements(entry.plan->'periods') p where (p->>'start_date')::date <= (now() at time zone 'America/Sao_Paulo')::date) then raise exception 'RH_LEAVE_STARTED_REVIEW_REQUIRED';end if;
 preview:=public.rh_preview_leave(target_profile,target_session,target_cnes,entry.entry_id,(item-'revision'-'_revisionLeave')||jsonb_build_object('revision',true,'_revisionLeave',entry.id));
 if (preview->'resources'->>'bond_id')::uuid<>entry.bond_id then raise exception 'RH_BINDING_IMMUTABLE';end if;
 preview:=(preview-'digest')||jsonb_build_object('leave_id',entry.id,'version',entry.version,'previous_plan',entry.plan);
 return preview||jsonb_build_object('digest',encode(extensions.digest(preview::text,'sha256'),'hex'));
end $function$
;

create or replace function private.calendar_change_digest(actor_id uuid,operation text,target_id uuid,expected_version integer,item jsonb) returns text
language sql security invoker set search_path='' as $$
 select encode(extensions.digest(jsonb_build_object('actor',actor_id,'operation',operation,'id',target_id,'version',expected_version,
 'item',item-'action'-'operation'-'preview_digest',
 'calendar',(select coalesce(jsonb_agg(to_jsonb(c) order by id),'[]') from public.calendar_events c),
 'leaves',(select coalesce(jsonb_agg(jsonb_build_array(id,version,status) order by id),'[]') from private.rh_leaves))::text,'sha256'),'hex')
$$;

create or replace function public.preview_scoped_calendar_event(actor_id uuid,operation text,target_id uuid,expected_version integer,item jsonb) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='15s' as $$
declare result jsonb;digest text;
begin
 perform private.require_cnes_import_admin(actor_id);
 perform private.planning_lock();
 digest:=private.calendar_change_digest(actor_id,operation,target_id,expected_version,item);
 begin
  result:=private.perform_calendar_event_change(actor_id,operation,target_id,expected_version,item);
  raise exception using errcode='ZP001',message='ROLLBACK_CALENDAR_PREVIEW';
 exception when sqlstate 'ZP001' then null;
 end;
 return result||jsonb_build_object('digest',digest,'preview_only',true);
end $$;

create or replace function public.manage_scoped_calendar_event(actor_id uuid,operation text,target_id uuid,expected_version integer,item jsonb) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='15s' as $$
begin
 perform private.require_cnes_import_admin(actor_id);
 perform private.planning_lock();
 if item->>'preview_digest' is distinct from private.calendar_change_digest(actor_id,operation,target_id,expected_version,item)
 then raise exception 'CALENDAR_PREVIEW_CHANGED';end if;
 return private.perform_calendar_event_change(actor_id,operation,target_id,expected_version,item);
end $$;
revoke all on function private.perform_calendar_event_change(uuid,text,uuid,integer,jsonb),private.calendar_change_digest(uuid,text,uuid,integer,jsonb),public.preview_scoped_calendar_event(uuid,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function private.perform_calendar_event_change(uuid,text,uuid,integer,jsonb),private.calendar_change_digest(uuid,text,uuid,integer,jsonb),public.preview_scoped_calendar_event(uuid,text,uuid,integer,jsonb) to service_role;
