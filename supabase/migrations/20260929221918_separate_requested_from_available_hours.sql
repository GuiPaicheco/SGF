-- O saldo declarado e as horas solicitadas sao valores distintos.
do $$
declare
  definition text;
  old_expression text := 'then nullif(payload->>''availableHours'', '''')::numeric';
  new_expression text := 'then nullif(payload->>''requestedHours'', '''')::numeric';
begin
  select pg_get_functiondef('public.register_vacation_submission(jsonb)'::regprocedure)
    into definition;
  if position(old_expression in definition) = 0 then
    raise exception 'Definicao de register_vacation_submission inesperada';
  end if;
  execute replace(definition, old_expression, new_expression);
end $$;

-- Corrige pedidos de banco de horas ainda passíveis de conclusão.
-- Pedidos já concluídos exigem conferência do extrato antes de qualquer ajuste manual.
update public.vacation_requests request
set requested_hours = periods.total_hours
from (
  select request_id, sum(hours) as total_hours
  from public.request_periods
  where hours is not null
  group by request_id
) periods
where request.id = periods.request_id
  and request.type = 'banco_horas'
  and request.status not in ('concluida', 'cancelada', 'rejeitada')
  and request.requested_hours is distinct from periods.total_hours;
