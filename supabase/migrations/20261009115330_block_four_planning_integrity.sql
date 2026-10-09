-- Gravação de escala usa a mesma ordem global de planejamento que afastamentos.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.set_unit_minimum_scale(uuid,uuid,uuid,date,uuid[],integer,date)'::regprocedure);
  if position('perform private.planning_lock();' in definition)=0 then
    definition:=replace(definition,E'begin\n  if actor_role',E'begin\n  perform private.planning_lock();\n  if actor_role');
    if position('perform private.planning_lock();' in definition)=0 then raise exception 'SCALE_LOCK_PATCH_FAILED'; end if;
    execute definition;
  end if;
  definition:=pg_get_functiondef('private.reconcile_calendar_requests()'::regprocedure);
  if position('OTHER_REQUEST_OVERLAP' in definition)=0 then
    definition:=replace(definition,E'    if blocked is null then\n',E'    if blocked is null and exists(\n      select 1 from public.vacation_requests other_request\n      join public.request_periods other_period on other_period.request_id=other_request.id\n      cross join jsonb_array_elements(plans) planned_period\n      where other_request.id<>r.id and other_request.context_bond_id=r.context_bond_id\n        and other_request.status not in (''rascunho'',''cancelada'',''rejeitada'')\n        and other_period.start_date<=(planned_period->>''end_date'')::date\n        and other_period.end_date>=(planned_period->>''start_date'')::date\n    ) then blocked:=''OTHER_REQUEST_OVERLAP''; end if;\n    if blocked is null then\n');
    if position('OTHER_REQUEST_OVERLAP' in definition)=0 then raise exception 'CALENDAR_OVERLAP_PATCH_FAILED'; end if;
    execute definition;
  end if;
end $$;
