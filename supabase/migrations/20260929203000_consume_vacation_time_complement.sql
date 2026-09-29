do $$
declare definition text;
begin
  select pg_get_functiondef('public.manage_request_operation(uuid,uuid,text,text,jsonb)'::regprocedure) into definition;
  definition := replace(definition, 'if target_action=''concluir'' and request_row.type=''banco_horas'' then', 'if target_action=''concluir'' and coalesce(request_row.requested_hours,0)>0 then');
  execute definition;
end $$;
