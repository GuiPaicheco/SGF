do $$
declare definition text;
begin
  select pg_get_functiondef('public.manage_request_operation(uuid,uuid,text,text,jsonb)'::regprocedure) into definition;
  definition := replace(definition, 'period_count integer;', 'period_count integer; v_actor uuid := actor_id;');
  definition := replace(definition, 'set actor_id=actor_id,notes=', 'set actor_id=v_actor,notes=');
  execute definition;
end $$;
