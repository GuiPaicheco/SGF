-- Uma nova captura de PDF antigo não pode regredir a competência já incorporada.
create function private.cnes_import_competence_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.competence is not null and exists(select 1 from private.cnes_import_runs r
   where r.cnes_unit_id=new.cnes_unit_id and r.competence>new.competence) then raise exception 'CNES_STALE_COLLECTION';end if;
 return new;
end $$;
revoke all on function private.cnes_import_competence_guard() from public,anon,authenticated;
grant execute on function private.cnes_import_competence_guard() to service_role;
create trigger cnes_competence_guard before insert on private.cnes_import_runs for each row execute function private.cnes_import_competence_guard();
