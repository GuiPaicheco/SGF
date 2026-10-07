-- Release transacional: calendário, revisão e redistribuição usam a mesma trava.
alter table public.calendar_events add column version integer not null default 1 check(version>0);
alter table public.vacation_requests
  add column calendar_adjustment_state text not null default 'clear'
    check(calendar_adjustment_state in ('clear','pending_distribution','requires_review')),
  add column calendar_pending_dates date[] not null default '{}',
  add column calendar_adjustment_reason text;

create function private.planning_lock() returns void language sql security invoker set search_path='' as $$
  select pg_advisory_xact_lock(20261007,1);
$$;
revoke all on function private.planning_lock() from public,anon,authenticated;
grant execute on function private.planning_lock() to service_role;

create function private.calendar_write_lock() returns trigger language plpgsql security invoker set search_path='' as $$
begin perform private.planning_lock(); return new; end $$;
revoke all on function private.calendar_write_lock() from public,anon,authenticated;
grant execute on function private.calendar_write_lock() to service_role;
create trigger calendar_00_write_lock before insert or update on public.calendar_events
for each row execute function private.calendar_write_lock();

create function private.eligible_day_units(bond uuid,day_date date) returns setof public.employment_bond_units
language sql stable security invoker set search_path='' as $$
  select u.* from public.employment_bond_units u
  join public.employment_bonds b on b.id=u.bond_id join public.servidores s on s.id=b.servidor_id
  join public.cnes_units c on c.id=u.cnes_unit_id left join public.lotacoes l on l.id=u.internal_lotacao_id
  where u.bond_id=bond and u.active and u.approval_responsible and b.active and s.active and c.active
    and (u.internal_lotacao_id is null or l.active)
    and day_date>=u.valid_from and (u.valid_until is null or day_date<=u.valid_until)
    and day_date>=b.valid_from and (b.valid_until is null or day_date<=b.valid_until);
$$;
revoke all on function private.eligible_day_units(uuid,date) from public,anon,authenticated;
grant execute on function private.eligible_day_units(uuid,date) to service_role;

create function private.reconcile_calendar_requests() returns trigger language plpgsql security invoker set search_path='' as $$
declare r record; p record; planned jsonb; plans jsonb; excluded date[]; wanted date[]; missing date[];
  before_periods jsonb; prior_end date; changed boolean; blocked text; d date; candidates integer;
  assignment public.employment_bond_units%rowtype; scope record; who uuid;
begin
  if tg_op='UPDATE' and (new.event_date,new.active,new.type) is not distinct from (old.event_date,old.active,old.type) then return new; end if;
  if tg_op='INSERT' and not new.active then return new; end if;
  who := nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}')->>'x-sgf-actor','')::uuid;
  if private.actor_role(who) is distinct from 'administrador' then raise exception 'AUDIT_CALENDAR_ADMIN_REQUIRED'; end if;
  select coalesce(array_agg(distinct event_date),'{}') into excluded from public.calendar_events where active;
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
end $$;
revoke all on function private.reconcile_calendar_requests() from public,anon,authenticated;
grant execute on function private.reconcile_calendar_requests() to service_role;
create trigger calendar_request_reconcile after insert or update on public.calendar_events for each row execute function private.reconcile_calendar_requests();

create function public.save_planning_calendar_event(actor_id uuid,target_id uuid,target_date date,target_type text,
  target_name text,target_active boolean,expected_version integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare event_row public.calendar_events%rowtype;
begin
  perform private.planning_lock();
  if private.actor_role(actor_id) is distinct from 'administrador' then raise exception 'ADMIN_REQUIRED'; end if;
  if target_date is null or target_type not in ('feriado','ponto_facultativo') or target_name is null or char_length(btrim(target_name)) not between 1 and 200 then raise exception 'CALENDAR_INPUT_INVALID'; end if;
  if target_id is null then
    insert into public.calendar_events(event_date,type,name,active) values(target_date,target_type::public.calendar_event_type,btrim(target_name),coalesce(target_active,true)) returning * into event_row;
  else
    select * into event_row from public.calendar_events where id=target_id for update;
    if not found then raise exception 'CALENDAR_NOT_FOUND'; end if;
    if expected_version is distinct from event_row.version then raise exception 'CALENDAR_VERSION_CONFLICT'; end if;
    if (event_row.event_date,event_row.type::text,event_row.name,event_row.active) is not distinct from (target_date,target_type,btrim(target_name),target_active) then return to_jsonb(event_row); end if;
    update public.calendar_events set event_date=target_date,type=target_type::public.calendar_event_type,name=btrim(target_name),active=target_active,version=version+1 where id=target_id returning * into event_row;
  end if;
  return to_jsonb(event_row);
end $$;
revoke all on function public.save_planning_calendar_event(uuid,uuid,date,text,text,boolean,integer) from public,anon,authenticated;
grant execute on function public.save_planning_calendar_event(uuid,uuid,date,text,text,boolean,integer) to service_role;

-- Trava antes de qualquer linha; elimina a inversão revisão/pedido entre gestores.
alter function public.manage_unit_request_review(uuid,uuid,text,text,integer,jsonb) rename to manage_unit_request_review_before_planning;
alter function public.manage_unit_request_review_before_planning(uuid,uuid,text,text,integer,jsonb) set schema private;
create function public.manage_unit_request_review(actor_id uuid,target_review_id uuid,target_action text,target_notes text default null,
  expected_version integer default null,target_rejection jsonb default null) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  perform private.planning_lock();
  if target_action in ('approve','schedule') and exists(select 1 from public.request_unit_reviews v join public.vacation_requests r on r.id=v.request_id
    where v.id=target_review_id and r.calendar_adjustment_state<>'clear') then raise exception 'CALENDAR_REVIEW_REQUIRED'; end if;
  return private.manage_unit_request_review_before_planning(actor_id,target_review_id,target_action,target_notes,expected_version,target_rejection);
end $$;
revoke all on function public.manage_unit_request_review(uuid,uuid,text,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.manage_unit_request_review(uuid,uuid,text,text,integer,jsonb) to service_role;

alter function public.change_pending_day_responsibility(uuid,uuid,date,uuid,integer,text) rename to change_pending_day_before_planning;
alter function public.change_pending_day_before_planning(uuid,uuid,date,uuid,integer,text) set schema private;
create function public.change_pending_day_responsibility(actor_id uuid,target_request uuid,target_date date,target_assignment uuid,
  expected_version integer,target_reason text) returns integer language plpgsql security invoker set search_path='' as $$
declare r public.vacation_requests%rowtype; u public.employment_bond_units%rowtype;
begin
  perform private.planning_lock();
  select * into r from public.vacation_requests where id=target_request;
  if not found then raise exception 'REQUEST_OUT_OF_SCOPE'; end if;
  if target_date=any(r.calendar_pending_dates) then
    if private.actor_role(actor_id) is distinct from 'administrador' then raise exception 'STAFF_REQUIRED'; end if;
    if r.distribution_version is distinct from expected_version then raise exception 'DISTRIBUTION_VERSION_CONFLICT'; end if;
    if target_reason is null or char_length(btrim(target_reason)) not between 3 and 2000 then raise exception 'DISTRIBUTION_INPUT_INVALID'; end if;
    select * into u from private.eligible_day_units(r.context_bond_id,target_date) where id=target_assignment;
    if not found then raise exception 'RESPONSIBILITY_UNIT_INVALID'; end if;
    insert into public.request_day_responsibilities(request_id,responsibility_date,bond_unit_id,cnes_unit_id,lotacao_id,assigned_by)
      values(r.id,target_date,u.id,u.cnes_unit_id,u.internal_lotacao_id,actor_id);
    update public.vacation_requests set calendar_pending_dates=array_remove(calendar_pending_dates,target_date),distribution_version=distribution_version+1,
      calendar_adjustment_state=case when cardinality(array_remove(calendar_pending_dates,target_date))=0 then 'clear' else 'pending_distribution' end,
      calendar_adjustment_reason=case when cardinality(array_remove(calendar_pending_dates,target_date))=0 then null else calendar_adjustment_reason end where id=r.id;
    update public.request_unit_reviews set version=version+1,updated_at=now() where request_id=r.id;
    insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_bond_id,context_cnes_unit_id,context_lotacao_id,new_value,reason)
      values(actor_id,'administrador','calendar_pending_day_assigned','vacation_request',r.id,r.context_bond_id,u.cnes_unit_id,u.internal_lotacao_id,
        jsonb_build_object('date',target_date,'bond_unit_id',u.id),btrim(target_reason));
    perform private.emit_unit_notification('pending-date:'||txid_current()||':'||r.id,u.cnes_unit_id,u.internal_lotacao_id,
      'CNES do dia adicional definido','O dia '||to_char(target_date,'DD/MM/YYYY')||' recebeu uma unidade responsável. Confira o planejamento.',r.id,
      (select profile_id from public.servidores where id=r.servidor_id),r.context_bond_id);
    return expected_version+1;
  end if;
  return private.change_pending_day_before_planning(actor_id,target_request,target_date,target_assignment,expected_version,target_reason);
end $$;
revoke all on function public.change_pending_day_responsibility(uuid,uuid,date,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.change_pending_day_responsibility(uuid,uuid,date,uuid,integer,text) to service_role;

alter function public.pending_distribution_editor(uuid,uuid) rename to pending_distribution_editor_before_planning;
alter function public.pending_distribution_editor_before_planning(uuid,uuid) set schema private;
create function public.pending_distribution_editor(actor_id uuid,target_request uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; r public.vacation_requests%rowtype; days jsonb;
begin
  result := private.pending_distribution_editor_before_planning(actor_id,target_request);
  select * into r from public.vacation_requests where id=target_request;
  select coalesce(jsonb_agg(jsonb_build_object('date',d,'current_assignment',null,'current_unit','CNES pendente após ajuste do calendário',
    'candidates',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'unit',c.name,'location',l.name)),'[]')
      from private.eligible_day_units(r.context_bond_id,d) u join public.cnes_units c on c.id=u.cnes_unit_id
      left join public.lotacoes l on l.id=u.internal_lotacao_id)) order by d),'[]') into days from unnest(r.calendar_pending_dates) d;
  if cardinality(r.calendar_pending_dates)>0 then result := result||jsonb_build_object('editable',true,'days',days,'calendar_pending',true); end if;
  if r.calendar_adjustment_state='requires_review' then result := result||jsonb_build_object('editable',false); end if;
  return result;
end $$;
revoke all on function public.pending_distribution_editor(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pending_distribution_editor(uuid,uuid) to service_role;

alter function public.manage_request_operation(uuid,uuid,text,text,jsonb) rename to manage_request_operation_before_planning;
alter function public.manage_request_operation_before_planning(uuid,uuid,text,text,jsonb) set schema private;
create function public.manage_request_operation(actor_id uuid,target_request_id uuid,target_action text,target_notes text default null,target_periods jsonb default null)
returns public.request_status language plpgsql security invoker set search_path='' as $$
begin perform private.planning_lock(); return private.manage_request_operation_before_planning(actor_id,target_request_id,target_action,target_notes,target_periods); end $$;
revoke all on function public.manage_request_operation(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_request_operation(uuid,uuid,text,text,jsonb) to service_role;

alter function public.register_contextual_vacation_submission(jsonb,uuid,uuid,uuid) rename to register_contextual_before_planning;
alter function public.register_contextual_before_planning(jsonb,uuid,uuid,uuid) set schema private;
create function public.register_contextual_vacation_submission(payload jsonb,target_bond_id uuid,target_cnes_unit_id uuid,target_lotacao_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin perform private.planning_lock(); return private.register_contextual_before_planning(payload,target_bond_id,target_cnes_unit_id,target_lotacao_id); end $$;
revoke all on function public.register_contextual_vacation_submission(jsonb,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.register_contextual_vacation_submission(jsonb,uuid,uuid,uuid) to service_role;

create function private.distribution_access(actor uuid,target_request uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.vacation_requests r join public.servidores s on s.id=r.servidor_id
    where r.id=target_request and s.active and (
      private.actor_role(actor)='administrador'
      or (private.actor_role(actor)='servidor' and s.profile_id=actor
        and r.context_bond_id=nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}')->>'x-sgf-bond','')::uuid)
      or (private.actor_role(actor)='rh' and exists(select 1 from public.request_unit_reviews v
        join public.profile_scopes ps on ps.profile_id=actor
        join public.lotacao_cnes_units m on m.lotacao_id=ps.lotacao_id and m.cnes_unit_id=v.cnes_unit_id
        join public.lotacoes l on l.id=ps.lotacao_id and l.active
        where v.request_id=r.id and v.cnes_unit_id=private.current_context_cnes()
          and ps.lotacao_id=nullif(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}')->>'x-sgf-lotacao','')::uuid
          and v.lotacao_id is not distinct from private.current_context_internal_lotacao()))));
$$;
revoke all on function private.distribution_access(uuid,uuid) from public,anon,authenticated;
grant execute on function private.distribution_access(uuid,uuid) to service_role;

create or replace function public.change_pending_day_responsibility(actor_id uuid,target_request uuid,target_date date,target_assignment uuid,
  expected_version integer,target_reason text) returns integer language plpgsql security invoker set search_path='' as $$
declare r public.vacation_requests%rowtype; u public.employment_bond_units%rowtype; old_day public.request_day_responsibilities%rowtype;
  pending boolean; role_value public.app_role:=private.actor_role(actor_id); prior_reviews jsonb; owner_id uuid;
begin
  perform private.planning_lock();
  if not private.distribution_access(actor_id,target_request) then raise exception 'REQUEST_OUT_OF_SCOPE'; end if;
  perform id from public.request_unit_reviews where request_id=target_request order by id for update;
  select * into r from public.vacation_requests where id=target_request for update;
  if r.distribution_version is distinct from expected_version then raise exception 'DISTRIBUTION_VERSION_CONFLICT'; end if;
  if target_reason is null or char_length(btrim(target_reason)) not between 3 and 2000 then raise exception 'DISTRIBUTION_INPUT_INVALID'; end if;
  if r.calendar_adjustment_state='requires_review' then raise exception 'CALENDAR_REVIEW_REQUIRED'; end if;
  pending:=target_date=any(r.calendar_pending_dates);
  if not pending and (r.status not in ('enviada','em_analise') or exists(select 1 from public.request_unit_reviews where request_id=r.id and status<>'pendente'))
    then raise exception 'DISTRIBUTION_ALREADY_DECIDED'; end if;
  if pending and role_value='servidor' then raise exception 'STAFF_REQUIRED'; end if;
  select * into u from private.eligible_day_units(r.context_bond_id,target_date) where id=target_assignment;
  if not found then raise exception 'RESPONSIBILITY_UNIT_INVALID'; end if;
  if role_value='rh' and (u.cnes_unit_id is distinct from private.current_context_cnes()
    or u.internal_lotacao_id is distinct from private.current_context_internal_lotacao()) then raise exception 'REQUEST_OUT_OF_SCOPE'; end if;
  select * into old_day from public.request_day_responsibilities where request_id=r.id and responsibility_date=target_date for update;
  if not found and not pending then raise exception 'DISTRIBUTION_DAY_INVALID'; end if;
  if not pending and role_value='rh' and (old_day.cnes_unit_id is distinct from private.current_context_cnes()
    or old_day.lotacao_id is distinct from private.current_context_internal_lotacao()) then raise exception 'REQUEST_OUT_OF_SCOPE'; end if;
  if not pending and old_day.bond_unit_id=u.id then return r.distribution_version; end if;
  select jsonb_agg(to_jsonb(v)) into prior_reviews from public.request_unit_reviews v where request_id=r.id;
  if pending then
    insert into public.request_day_responsibilities(request_id,responsibility_date,bond_unit_id,cnes_unit_id,lotacao_id,assigned_by)
      values(r.id,target_date,u.id,u.cnes_unit_id,u.internal_lotacao_id,actor_id);
  else
    update public.request_day_responsibilities set bond_unit_id=u.id,cnes_unit_id=u.cnes_unit_id,lotacao_id=u.internal_lotacao_id,assigned_by=actor_id
      where request_id=r.id and responsibility_date=target_date;
    insert into public.request_unit_reviews(request_id,cnes_unit_id,lotacao_id) values(r.id,u.cnes_unit_id,u.internal_lotacao_id) on conflict do nothing;
    -- Somente revisões sem decisão são removidas; o snapshot integral fica na auditoria.
    delete from public.request_unit_reviews v where v.request_id=r.id and v.status='pendente'
      and not exists(select 1 from public.request_day_responsibilities d where d.request_id=r.id and d.cnes_unit_id=v.cnes_unit_id and d.lotacao_id is not distinct from v.lotacao_id);
  end if;
  update public.vacation_requests set calendar_pending_dates=array_remove(calendar_pending_dates,target_date),distribution_version=distribution_version+1,
    calendar_adjustment_state=case when cardinality(array_remove(calendar_pending_dates,target_date))=0 then 'clear' else 'pending_distribution' end,
    calendar_adjustment_reason=case when cardinality(array_remove(calendar_pending_dates,target_date))=0 then null else calendar_adjustment_reason end,
    status=(select case when bool_or(status='rejeitada') then 'rejeitada'::public.request_status when bool_and(status='programada') then 'programada'::public.request_status
      when bool_and(status in ('aprovada','programada')) then 'aprovada'::public.request_status else 'em_analise'::public.request_status end from public.request_unit_reviews where request_id=r.id),updated_at=now()
    where id=r.id;
  update public.request_unit_reviews set version=version+1,updated_at=now() where request_id=r.id;
  insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_bond_id,context_cnes_unit_id,context_lotacao_id,previous_value,new_value,reason)
    values(actor_id,role_value,case when pending then 'calendar_pending_day_assigned' else 'pending_distribution_changed' end,'vacation_request',r.id,
      r.context_bond_id,u.cnes_unit_id,u.internal_lotacao_id,jsonb_build_object('day',to_jsonb(old_day),'reviews',prior_reviews,'version',r.distribution_version),
      jsonb_build_object('date',target_date,'bond_unit_id',u.id,'version',expected_version+1),btrim(target_reason));
  select profile_id into owner_id from public.servidores where id=r.servidor_id;
  perform private.emit_unit_notification('distribution-save:'||txid_current()||':'||r.id,u.cnes_unit_id,u.internal_lotacao_id,
    'Distribuição de responsabilidade atualizada','O dia '||to_char(target_date,'DD/MM/YYYY')||' teve a responsabilidade conferida. Atualize o calendário e a análise.',r.id,owner_id,r.context_bond_id);
  return expected_version+1;
end $$;

create or replace function public.pending_distribution_editor(actor_id uuid,target_request uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.vacation_requests%rowtype; days jsonb; editable boolean; role_value public.app_role:=private.actor_role(actor_id);
begin
  if not private.distribution_access(actor_id,target_request) then raise exception 'REQUEST_OUT_OF_SCOPE'; end if;
  select * into r from public.vacation_requests where id=target_request;
  editable:=r.calendar_adjustment_state<>'requires_review' and ((r.status in ('enviada','em_analise') and not exists(select 1 from public.request_unit_reviews where request_id=r.id and status<>'pendente'))
    or (cardinality(r.calendar_pending_dates)>0 and role_value in ('rh','administrador')));
  select coalesce(jsonb_agg(jsonb_build_object('date',x.day,'current_assignment',x.bond_unit_id,
    'current_unit',coalesce(c.name,'CNES pendente após ajuste do calendário'),'current_location',l.name,
    'candidates',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'unit',uc.name,'location',ul.name) order by uc.name),'[]')
      from private.eligible_day_units(r.context_bond_id,x.day) u join public.cnes_units uc on uc.id=u.cnes_unit_id left join public.lotacoes ul on ul.id=u.internal_lotacao_id
      where role_value<>'rh' or (u.cnes_unit_id=private.current_context_cnes() and u.internal_lotacao_id is not distinct from private.current_context_internal_lotacao()))) order by x.day),'[]') into days
    from (select responsibility_date as day,bond_unit_id,cnes_unit_id,lotacao_id from public.request_day_responsibilities where request_id=r.id
      and (role_value<>'rh' or (cnes_unit_id=private.current_context_cnes() and lotacao_id is not distinct from private.current_context_internal_lotacao()))
      union all select unnest(r.calendar_pending_dates),null::uuid,null::uuid,null::uuid where role_value<>'servidor') x
    left join public.cnes_units c on c.id=x.cnes_unit_id left join public.lotacoes l on l.id=x.lotacao_id;
  return jsonb_build_object('request_id',r.id,'version',r.distribution_version,'editable',editable,'calendar_pending',cardinality(r.calendar_pending_dates)>0,'days',days);
end $$;
