-- Consulta sem escrita; não corrige automaticamente dados históricos.
create or replace function public.rh_reconciliation_report(target_profile uuid,target_session uuid,target_cnes uuid,page_index integer default 0) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
declare actor jsonb;unit_id uuid;result jsonb;
begin
 if page_index is null or page_index not between 0 and 10000 then raise exception 'RH_INPUT_INVALID';end if;
 actor:=private.rh_leave_actor(target_profile,target_session,target_cnes);
 unit_id:=(actor->'context'->>'cnes_unit_id')::uuid;
 with records as (
 select l.id,'rh'::text origin,l.status,l.plan,l.version from private.rh_leaves l where l.cnes_unit_id=unit_id
 union all
 select q.id,'legado',q.status::text,jsonb_build_object('type',q.type,'notes',q.notes,
 'periods',coalesce((select jsonb_agg(to_jsonb(p) order by sequence) from public.request_periods p where p.request_id=q.id),'[]')),null::integer
 from public.vacation_requests q where q.context_cnes_unit_id=unit_id
 ), checked as (
 select r.*,array_remove(array[
 case when plan->>'type' in ('regulamentar','premio') and (nullif(plan->>'acquisition_start','') is null or nullif(plan->>'acquisition_end','') is null) then 'acquisition_unstructured' end,
 case when plan->>'type' in ('regulamentar','premio') and nullif(coalesce(plan->'legal'->'evidence'->>'regime',plan->>'regime'),'') is null then 'regime_unknown' end,
 case when exists(select 1 from jsonb_array_elements(plan->'periods') p where nullif(p->>'return_date','') is null) then 'return_unknown' end,
 case when exists(select 1 from jsonb_array_elements(plan->'periods') p where p->>'counting_mode'='corridos' and p->>'end_date' is not null and p->>'days' is not null and (p->>'end_date')::date-(p->>'start_date')::date+1<>(p->>'days')::integer) then 'calendar_day_mismatch' end,
 case when status in ('programada','reprogramada') and not exists(select 1 from jsonb_array_elements(plan->'periods') p where p->>'end_date' is null or (p->>'end_date')::date>=(now() at time zone 'America/Sao_Paulo')::date) then 'past_programmed' end,
 case when origin='legado' or (plan->>'notes') ~* '[0-9]+[[:space:]]*dias' then 'source_review_required' end
 ],null) issues from records r
 ), flagged as (select * from checked where cardinality(issues)>0)
 select jsonb_build_object('total_records',(select count(*) from records),'total_flagged',(select count(*) from flagged),
 'calendar_population',(select count(*) from private.rh_calendar_employees(unit_id)),
 'cnes_population',(select count(*) from private.cnes_registry_entries where cnes_unit_id=unit_id and source_data->>'status'='ativo'),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'origin',origin,'status',status,'version',version,'issues',issues) order by origin,id)
 from (select * from flagged order by origin,id limit 50 offset page_index*50) x),'[]')) into result;
 return result;
end $$;
revoke all on function public.rh_reconciliation_report(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.rh_reconciliation_report(uuid,uuid,uuid,integer) to service_role;
