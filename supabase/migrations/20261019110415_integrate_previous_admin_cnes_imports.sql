-- Recupera somente a primeira importação administrativa do fluxo antigo, ainda intocada.
-- Não inventa competência, direitos ou documentos e não altera férias existentes.
do $$
declare row record; old_claims text:=current_setting('request.jwt.claims',true); old_headers text:=current_setting('request.headers',true);
begin
 for row in
  select e.id,e.cnes_unit_id,r.actor_id,r.id run_id
  from private.cnes_registry_entries e
  join private.cnes_import_runs r on r.cnes_unit_id=e.cnes_unit_id and r.created_at=e.created_at
  join public.profiles p on p.id=r.actor_id
  join public.cnes_units u on u.id=e.cnes_unit_id and u.active
  join private.rh_unit_accounts a on a.cnes_unit_id=e.cnes_unit_id
  where e.review_status='pending' and e.version=1 and e.updated_at=e.created_at
   and e.created_at < timestamptz '2026-10-18 22:34:09+00'
   and coalesce(e.source_data->>'origin','')<>'manual'
   and lower(e.source_data->>'status')='ativo' and nullif(e.source_data->>'deactivationCompetence','') is null
   and coalesce(e.source_data->>'principalCns',e.source_data->>'cns') ~ '^[0-9]{15}$'
   and p.disabled_at is null and not p.must_change_password and 'administrador'=any(p.roles)
   and not exists(select 1 from private.rh_registry_bonds m where m.entry_id=e.id)
   and not exists(select 1 from private.cnes_import_runs newer where newer.cnes_unit_id=e.cnes_unit_id and newer.created_at>r.created_at)
  order by e.cnes_unit_id,e.id for update of e
 loop
  perform pg_advisory_xact_lock(hashtextextended('cnes-registry:'||row.cnes_unit_id::text,0));
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.headers',jsonb_build_object('x-sgf-role','administrador','x-sgf-actor',row.actor_id)::text,true);
  perform private.integrate_cnes_entry(row.actor_id,row.id);
  insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_cnes_unit_id,new_value)
   values(row.actor_id,'administrador','cnes_previous_import_integrated','cnes_registry',row.id,row.cnes_unit_id,
    jsonb_build_object('import_run_id',row.run_id,'migration','integrate_previous_admin_cnes_imports','reason','Integração técnica da importação administrativa anterior; sem nova conferência ou concessão de férias.'));
 end loop;
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 perform set_config('request.headers',coalesce(old_headers,''),true);
end $$;

-- Lista exclusiva do RH, sem consulta de afastamentos ou datas do calendário.
create function public.rh_launch_employees(target_profile uuid,target_session uuid,page_index integer default 0,search_text text default '') returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
declare selection jsonb;unit_id uuid;result jsonb;
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'RH_NOT_ALLOWED';end if;
 selection:=public.rh_session_state(target_profile,target_session);
 if selection->'operator'='null'::jsonb then raise exception 'RH_OPERATOR_REQUIRED';end if;
 if page_index is null or page_index not between 0 and 100 or search_text is null or length(search_text)>120 then raise exception 'RH_INPUT_INVALID';end if;
 unit_id:=(selection->'context'->>'cnes_unit_id')::uuid;
 select jsonb_build_object('total',count(*),'employees',coalesce((select jsonb_agg(to_jsonb(q) order by q.full_name collate "pt-BR-x-icu",q.entry_id) from(
  select r.entry_id,r.full_name,r.position,r.cbo,r.team,r.weekly_hours,r.binding_confirmed
  from private.rh_calendar_employees(unit_id) r
  join private.cnes_registry_entries e on e.id=r.entry_id
  where lower(e.source_data->>'status')='ativo' and nullif(e.source_data->>'deactivationCompetence','') is null
   and position(lower(search_text) in lower(concat_ws(' ',r.full_name,r.position,r.cbo,r.team)))>0
  order by r.full_name collate "pt-BR-x-icu",r.entry_id limit 50 offset page_index*50
 ) q),'[]'::jsonb)) into result
 from private.rh_calendar_employees(unit_id) r
 join private.cnes_registry_entries e on e.id=r.entry_id
 where lower(e.source_data->>'status')='ativo' and nullif(e.source_data->>'deactivationCompetence','') is null
  and position(lower(search_text) in lower(concat_ws(' ',r.full_name,r.position,r.cbo,r.team)))>0;
 return result;
end $$;
revoke all on function public.rh_launch_employees(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.rh_launch_employees(uuid,uuid,integer,text) to service_role;
