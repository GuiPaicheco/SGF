-- Conflitos de versão são erros de domínio, não serialization_failure.
-- SQLSTATE 40001 dispara retries de transação no PostgREST e pode não retornar.
-- https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
-- Preservar corpos, assinatura, proprietário e ACL; mudar apenas o código explícito.
do $migration$
declare target record; definition text; changed text; expected integer;
begin
  for target in select p.oid,n.nspname,p.proname from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where p.prokind='f' and (n.nspname,p.proname) in (
      ('private','manage_unit_request_review_before_planning'),
      ('public','commit_request_revision'),
      ('public','save_organization_registry'),
      ('public','manage_bond_time_bank'),
      ('public','save_bond_vacation_right'),
      ('public','save_bond_registry'),
      ('public','set_unit_minimum_scale'),
      ('public','manage_manual_calendar_conflict'))
    order by n.nspname,p.proname
  loop
    definition:=pg_get_functiondef(target.oid);
    changed:=regexp_replace(definition,'errcode\s*=\s*''40001''','errcode=''P0001''','gi');
    if changed is distinct from definition then execute changed; end if;
  end loop;
  select count(*) into expected from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.prokind='f' and n.nspname in ('public','private')
      and pg_get_functiondef(p.oid) ~* 'errcode\s*=\s*''40001''';
  if expected<>0 then raise exception 'DOMAIN_SERIALIZATION_CODE_REMAINS'; end if;
end $migration$;
