-- Critérios de afastamento aplicados antes de contar/paginar os profissionais.
create function private.rh_calendar_bond_matches(target_cnes uuid,target_bond uuid,target_month date,target_status text,target_type text)
returns boolean language sql stable security invoker set search_path='' as $$
 select case when target_status='todos' and target_type='todos' then true else
  (exists (
   select 1 from private.rh_leaves l where l.cnes_unit_id=target_cnes and l.bond_id=target_bond
    and (target_type='todos' or l.plan->>'type'=target_type)
    and case when target_status='todos' then true when target_status='cancelada' then l.status='cancelada' when target_status in ('programada','concluida') then l.status=target_status else l.status<>'cancelada' end
    and exists(select 1 from jsonb_array_elements(l.plan->'periods') p where (p->>'start_date')::date<target_month+interval '1 month' and (p->>'end_date')::date>=target_month)
   union all
   select 1 from public.vacation_requests v join public.request_periods p on p.request_id=v.id
   where v.context_bond_id=target_bond and (target_type='todos' or v.type::text=target_type)
    and v.status not in ('cancelada','rejeitada','rascunho','devolvida') and target_status<>'cancelada'
    and (target_status not in ('programada','concluida') or case when target_status='concluida' then v.status='concluida' else v.status<>'concluida' end)
    and p.start_date<target_month+interval '1 month' and p.end_date>=target_month
    and ((v.context_cnes_unit_id=target_cnes and v.status in ('programada','reprogramada','concluida'))
     or exists(select 1 from public.request_unit_reviews r where r.request_id=v.id and r.cnes_unit_id=target_cnes and r.status='programada'))
    and (not exists(select 1 from public.request_day_responsibilities d where d.request_id=v.id)
     or exists(select 1 from public.request_day_responsibilities d where d.request_id=v.id and d.cnes_unit_id=target_cnes
      and d.responsibility_date between greatest(target_month,p.start_date) and least((target_month+interval '1 month')::date-1,p.end_date)))
  )) is distinct from (target_status='sem_afastamento') end;
$$;
revoke all on function private.rh_calendar_bond_matches(uuid,uuid,date,text,text) from public,anon,authenticated;
grant execute on function private.rh_calendar_bond_matches(uuid,uuid,date,text,text) to service_role;

create function public.rh_calendar_filtered(target_profile uuid,target_session uuid,target_cnes uuid,target_month date,page_index integer default 0,search_text text default '',filter_json jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
declare selection jsonb;context jsonb;unit_id uuid;employees jsonb;bond_ids uuid[];rows_count integer;last_day date;result jsonb;ids uuid[];extra jsonb;records jsonb;
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'RH_NOT_ALLOWED';end if;
 if target_month is null or target_month<>date_trunc('month',target_month)::date or target_month not between date '1900-01-01' and date '2100-12-01'
  or page_index is null or page_index not between 0 and 100 or search_text is null or length(search_text)>120 then raise exception 'RH_INPUT_INVALID';end if;

 if filter_json is null or jsonb_typeof(filter_json)<>'object' or octet_length(filter_json::text)>2000 then raise exception 'RH_INPUT_INVALID';end if;
 if exists(select 1 from jsonb_each(filter_json) kv where kv.key not in ('position','cbo','team','review','type','status') or jsonb_typeof(kv.value)<>'string' or length(kv.value#>>'{}')>120) then raise exception 'RH_INPUT_INVALID';end if;
 filter_json:=jsonb_build_object('position','','cbo','','team','','review','todos','type','todos','status','todos')||filter_json;
 if filter_json->>'review' not in ('todos','pendente','conferido') or filter_json->>'type' not in ('todos','regulamentar','premio','banco_horas')
  or filter_json->>'status' not in ('todos','com_afastamento','sem_afastamento','programada','concluida','cancelada') then raise exception 'RH_INPUT_INVALID';end if;
 context:=public.rh_account_context(target_profile);
 if context is not null then
  selection:=public.rh_session_state(target_profile,target_session);
  if selection->'operator'='null'::jsonb then raise exception 'RH_OPERATOR_REQUIRED';end if;
  unit_id:=(context->>'cnes_unit_id')::uuid;
  if target_cnes is not null and target_cnes<>unit_id then raise exception 'RH_BOND_OUT_OF_UNIT';end if;
 else
  perform private.require_cnes_import_admin(target_profile);
  unit_id:=target_cnes;
  if not exists(select 1 from public.cnes_units where id=unit_id and active) then raise exception 'RH_UNIT_INVALID';end if;
  context:=(select jsonb_build_object('cnes_unit_id',id,'cnes_code',code,'cnes_name',name,'role','administrador') from public.cnes_units where id=unit_id);
 end if;
 last_day:=(target_month+interval '1 month')::date-1;
 select count(*) into rows_count from private.rh_calendar_employees(unit_id) r where (search_text='' or position(lower(search_text) in lower(concat_ws(' ',r.full_name,r.registration,r.position,r.cbo,r.team)))>0)
  and position(lower(filter_json->>'position') in lower(coalesce(r.position,'')))>0
  and position(lower(filter_json->>'cbo') in lower(coalesce(r.cbo,'')))>0
  and position(lower(filter_json->>'team') in lower(coalesce(r.team,'')))>0
  and (filter_json->>'review'='todos' or case when filter_json->>'review'='conferido' then r.binding_confirmed else not coalesce(r.binding_confirmed,false) end)
  and private.rh_calendar_bond_matches(unit_id,r.bond_id,target_month,filter_json->>'status',filter_json->>'type');
 select coalesce(jsonb_agg(to_jsonb(r) order by r.full_name,r.row_id),'[]'),array_agg(distinct r.bond_id) filter(where r.bond_id is not null)
 into employees,bond_ids from (select * from private.rh_calendar_employees(unit_id) r where (search_text='' or position(lower(search_text) in lower(concat_ws(' ',r.full_name,r.registration,r.position,r.cbo,r.team)))>0)
  and position(lower(filter_json->>'position') in lower(coalesce(r.position,'')))>0
  and position(lower(filter_json->>'cbo') in lower(coalesce(r.cbo,'')))>0
  and position(lower(filter_json->>'team') in lower(coalesce(r.team,'')))>0
  and (filter_json->>'review'='todos' or case when filter_json->>'review'='conferido' then r.binding_confirmed else not coalesce(r.binding_confirmed,false) end)
  and private.rh_calendar_bond_matches(unit_id,r.bond_id,target_month,filter_json->>'status',filter_json->>'type')
  order by r.full_name,r.row_id limit 50 offset page_index*50) r;
 result:=jsonb_build_object('context',context,'operator',selection->'operator','month',target_month,'employees',employees,'total',rows_count,
  'absences',coalesce((select jsonb_agg(to_jsonb(a) order by a.start_date,a.id,a.sequence) from (
   select v.id,v.context_bond_id bond_id,v.protocol,v.type,v.status,p.sequence,p.start_date,p.end_date,p.return_date,'legado'::text origin,
    coalesce((select jsonb_agg(d.responsibility_date order by d.responsibility_date) from public.request_day_responsibilities d
     where d.request_id=v.id and d.cnes_unit_id=unit_id and d.responsibility_date between target_month and last_day),'[]') assigned_dates,
    exists(select 1 from public.request_day_responsibilities d where d.request_id=v.id) distributed
   from public.vacation_requests v join public.request_periods p on p.request_id=v.id
   where v.context_bond_id=any(coalesce(bond_ids,'{}'::uuid[])) and (filter_json->>'type'='todos' or v.type::text=filter_json->>'type') and v.status not in ('cancelada','rejeitada','rascunho','devolvida')
    and p.start_date<=last_day and p.end_date>=target_month
    and ((v.context_cnes_unit_id=unit_id and v.status in ('programada','reprogramada','concluida'))
      or exists(select 1 from public.request_unit_reviews r where r.request_id=v.id and r.cnes_unit_id=unit_id and r.status='programada'))
   order by p.start_date,v.id,p.sequence limit 1001) a),'[]'),
  'holidays',coalesce((select jsonb_agg(jsonb_build_object('date',event_date,'name',name,'type',type) order by event_date) from public.calendar_events where active and event_date between target_month and last_day),'[]'));
 if jsonb_array_length(result->'absences')>1000 then raise exception 'RH_CALENDAR_LIMIT';end if;
 unit_id:=(result->'context'->>'cnes_unit_id')::uuid;
 select array_agg((r->>'bond_id')::uuid) into ids from jsonb_array_elements(result->'employees') r where r->>'bond_id' is not null;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into extra from (
  select l.id,l.bond_id,'RH-'||upper(left(replace(l.id::text,'-',''),12)) protocol,l.plan->>'type' type,l.status,
   (p->>'sequence')::integer sequence,p->>'start_date' start_date,p->>'end_date' end_date,p->>'return_date' return_date,
   'rh'::text origin,false distributed,'[]'::jsonb assigned_dates
  from private.rh_leaves l cross join lateral jsonb_array_elements(l.plan->'periods') p
  where l.cnes_unit_id=unit_id and l.bond_id=any(coalesce(ids,'{}'::uuid[])) and l.status<>'cancelada' and (filter_json->>'type'='todos' or l.plan->>'type'=filter_json->>'type')
   and (p->>'start_date')::date<(target_month+interval '1 month')::date and (p->>'end_date')::date>=target_month limit 1001) q;
 if jsonb_array_length(extra)+jsonb_array_length(result->'absences')>1000 then raise exception 'RH_CALENDAR_LIMIT';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id),'[]') into records from (
  select l.id,'RH-'||upper(left(replace(l.id::text,'-',''),12)) protocol,l.snapshot->>'full_name' full_name,
   l.snapshot->>'registration' registration,l.plan->>'type' type,l.status,l.created_at
  from private.rh_leaves l where l.cnes_unit_id=unit_id and l.bond_id=any(coalesce(ids,'{}'::uuid[])) and (filter_json->>'type'='todos' or l.plan->>'type'=filter_json->>'type') and (filter_json->>'status' not in ('programada','concluida','cancelada') or l.status=filter_json->>'status')
   and exists(select 1 from jsonb_array_elements(l.plan->'periods') p where (p->>'start_date')::date<(target_month+interval '1 month')::date and (p->>'end_date')::date>=target_month)
  order by l.created_at desc,l.id limit 51) q;
 if filter_json->>'type'<>'todos' then
  result:=jsonb_set(result,'{absences}',coalesce((select jsonb_agg(a) from jsonb_array_elements(result->'absences') a where a->>'type'=filter_json->>'type'),'[]'));
  extra:=coalesce((select jsonb_agg(a) from jsonb_array_elements(extra) a where a->>'type'=filter_json->>'type'),'[]');
  records:=coalesce((select jsonb_agg(a) from jsonb_array_elements(records) a where a->>'type'=filter_json->>'type'),'[]');
 end if;
 return jsonb_set(result,'{absences}',(result->'absences')||extra)||jsonb_build_object('records',case when jsonb_array_length(records)>50 then records-50 else records end,
  'records_has_more',jsonb_array_length(records)>50,'filters',filter_json);
end $$;

revoke all on function public.rh_calendar_filtered(uuid,uuid,uuid,date,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.rh_calendar_filtered(uuid,uuid,uuid,date,integer,text,jsonb) to service_role;
