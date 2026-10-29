-- Filtros administrativos sobre o cadastro completo, antes da paginação.
create or replace function public.cnes_unit_registry(actor_id uuid,target_cnes uuid,page_index integer,search_text text,filter_json jsonb) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
declare entries jsonb;total integer;facets jsonb;
begin
 perform private.require_cnes_import_admin(actor_id);
 if page_index is null or page_index not between 0 and 100 or search_text is null or length(search_text)>120
  or jsonb_typeof(filter_json) is distinct from 'object' or octet_length(filter_json::text)>2000 then raise exception 'CNES_PAGE_INVALID';end if;
 if exists(select 1 from jsonb_each(filter_json) x where x.key not in('cbo','team','position','team_name','weekly_hours') or jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>240) then raise exception 'CNES_LOCAL_DATA_INVALID';end if;
 with base as materialized (
  select e.*,coalesce(nullif(btrim(e.source_data->>'occupation'),''),'Cargo não informado') position_label,
   coalesce(nullif(btrim(e.source_data->>'weeklyHours'),''),'Não informada') hours_label,
   coalesce((select array_agg(distinct btrim(t->>'name')) from jsonb_array_elements(coalesce(e.source_data->'teams','[]')) t where nullif(btrim(t->>'name'),'') is not null),array['Não se aplica']) team_labels
  from private.cnes_registry_entries e where e.cnes_unit_id=target_cnes and coalesce(e.source_data->>'origin','')<>'manual'
 ), filtered as materialized (
  select e.* from base e
  where position(lower(search_text) in lower(concat_ws(' ',e.source_data->>'fullName',e.source_data->>'occupation',e.source_data->>'cbo',e.source_data->'teams')))>0
   and position(lower(coalesce(filter_json->>'cbo','')) in lower(coalesce(e.source_data->>'cbo','')))>0
   and position(lower(coalesce(filter_json->>'team','')) in lower(coalesce(e.source_data->'teams','[]')::text))>0
   and (coalesce(filter_json->>'position','')='' or e.position_label=filter_json->>'position')
   and (coalesce(filter_json->>'team_name','')='' or (filter_json->>'team_name')=any(e.team_labels))
   and (coalesce(filter_json->>'weekly_hours','')='' or e.hours_label=filter_json->>'weekly_hours')
 )
 select
  coalesce((select jsonb_agg(to_jsonb(q) order by q.full_name,q.id) from (
   select e.id,e.source_data,e.local_data,e.source_competence,e.source_metadata,e.review_status,e.version,
    e.source_data->>'fullName' full_name,coalesce(g.active,false) authorized,coalesce(g.version,0) grant_version,m.bond_id is not null integrated
   from filtered e left join private.rh_operator_grants g on g.entry_id=e.id left join private.rh_registry_bonds m on m.entry_id=e.id
   order by e.source_data->>'fullName',e.id limit 50 offset page_index*50) q),'[]'),
  (select count(*) from filtered),
  jsonb_build_object(
   'position',coalesce((select jsonb_agg(v order by v collate "pt-BR-x-icu") from (select distinct position_label v from base) x),'[]'),
   'team_name',coalesce((select jsonb_agg(v order by v collate "pt-BR-x-icu") from (select distinct unnest(team_labels) v from base) x),'[]'),
   'weekly_hours',coalesce((select jsonb_agg(v order by case when v ~ '^\d+(\.\d+)?$' then v::numeric end,v) from (select distinct hours_label v from base) x),'[]'))
 into entries,total,facets;
 return jsonb_build_object('entries',entries,'total',total,'page',page_index,'facets',facets,
  'last_import',(select jsonb_build_object('competence',r.competence,'collected_at',r.collected_at) from private.cnes_import_runs r where r.cnes_unit_id=target_cnes order by r.created_at desc,r.id desc limit 1));
end $$;
revoke all on function public.cnes_unit_registry(uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.cnes_unit_registry(uuid,uuid,integer,text,jsonb) to service_role;
