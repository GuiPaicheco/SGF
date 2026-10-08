-- Recusa do pedido completo remove a ausência confirmada de todas as unidades.
-- As revisões programadas permanecem no histórico, não como bloqueio de escala.
do $migration$
declare target record; definition text; changed text;
begin
  for target in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.prokind='f' and (n.nspname,p.proname) in (
      ('public','set_unit_minimum_scale'),('private','notify_request_status'),
      ('private','notify_cancelled_absence_neighbors'))
  loop
    definition:=pg_get_functiondef(target.oid);
    changed:=case target.proname
      when 'set_unit_minimum_scale' then replace(definition,'v.status<>''cancelada''','v.status not in (''cancelada'',''rejeitada'')')
      when 'notify_request_status' then replace(definition,'new.status in (''cancelada'',''concluida'')','new.status in (''cancelada'',''concluida'',''rejeitada'')')
      when 'notify_cancelled_absence_neighbors' then replace(definition,'new.status<>''cancelada''','new.status not in (''cancelada'',''rejeitada'')')
      end;
    if changed is not distinct from definition then raise exception 'REJECTION_CLEANUP_TARGET_UNEXPECTED'; end if;
    execute changed;
  end loop;
end $migration$;
