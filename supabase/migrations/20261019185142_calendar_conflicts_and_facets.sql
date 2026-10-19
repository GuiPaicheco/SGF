-- Calendário: filtros exatos, equipes normalizadas e alertas por cruzamento. Histórico preservado.
create or replace function private.rh_calendar_employees(target_cnes uuid)
returns table(row_id uuid,entry_id uuid,bond_id uuid,full_name text,registration text,"position" text,cbo text,team text,
 weekly_hours numeric,origin text,review_pending boolean,binding_confirmed boolean)
language sql stable security invoker set search_path='' as $$
 select e.id,e.id,coalesce(m.bond_id,legacy.id),coalesce(e.source_data->>'fullName',e.local_data->>'fullName'),
 e.local_data->>'registration',coalesce(e.source_data->>'occupation',e.local_data->>'municipalPosition'),e.source_data->>'cbo',
 coalesce(nullif(btrim(e.local_data->>'teamLabel'),''),(select string_agg(t->>'name',', ' order by t->>'name') from jsonb_array_elements(coalesce(e.source_data->'teams','[]')) t where nullif(btrim(t->>'name'),'') is not null),'Não se aplica'),
 coalesce(e.local_data->>'weeklyHours',e.source_data->>'weeklyHours')::numeric,'cnes',e.review_status<>'reviewed',
 m.bond_id is not null and m.entry_version=e.version and e.review_status='reviewed' and lower(e.source_data->>'status')='ativo' and nullif(e.source_data->>'deactivationCompetence','') is null and b.active and b.pole_cnes_unit_id=target_cnes
 from private.cnes_registry_entries e left join private.rh_registry_bonds m on m.entry_id=e.id
 left join public.employment_bonds b on b.id=m.bond_id
 left join public.employment_bonds legacy on m.bond_id is null and legacy.servidor_id=e.servidor_id
   and upper(legacy.registration)=upper(e.local_data->>'registration') and legacy.active
 where coalesce(e.source_data->>'origin','')<>'manual' and e.cnes_unit_id=target_cnes 
 union all
 select b.id,null,b.id,s.full_name,b.registration,coalesce(c.name,s.declared_position),null,coalesce(nullif(btrim(s.team_name),''),'Não se aplica'),u.weekly_hours::numeric,'legado',true,false
 from public.employment_bonds b join public.servidores s on s.id=b.servidor_id and s.active
 left join public.cargos c on c.id=b.cargo_id
 join lateral(select x.weekly_hours from public.employment_bond_units x where x.bond_id=b.id and x.cnes_unit_id=target_cnes and x.active order by x.id limit 1) u on true
 where b.active and not exists(select 1 from private.cnes_registry_entries e left join private.rh_registry_bonds m on m.entry_id=e.id
  where coalesce(e.source_data->>'origin','')<>'manual' and e.cnes_unit_id=target_cnes 
    and (m.bond_id=b.id or (e.servidor_id=b.servidor_id and upper(e.local_data->>'registration')=upper(b.registration))));
$$;


-- Equipes individuais: profissional de várias equipes participa de cada uma delas.
create or replace function private.rh_calendar_teams(entry uuid,fallback text) returns text[]
language sql stable security invoker set search_path='' as $$
 select coalesce(array_agg(distinct name order by name),array[coalesce(nullif(btrim(fallback),''),'Não se aplica')]) from (
 select nullif(btrim(t->>'name'),'') name from private.cnes_registry_entries e
 cross join lateral jsonb_array_elements(coalesce(e.source_data->'teams','[]')) t where e.id=entry
 ) q where name is not null;
$$;
create or replace function private.rh_calendar_selected(actual text,choices jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
 select case when choices is null then true when jsonb_typeof(choices)='array' then choices='[]'::jsonb or choices ? actual
 else position(lower(choices#>>'{}') in lower(coalesce(actual,'')))>0 end;
$$;
create or replace function private.rh_calendar_row_selected(r jsonb,f jsonb) returns boolean
language sql stable security invoker set search_path='' as $$
 select private.rh_calendar_selected(r->>'full_name',f->'full_name')
 and private.rh_calendar_selected(r->>'position',f->'position') and private.rh_calendar_selected(r->>'cbo',f->'cbo')
 and case when jsonb_typeof(f->'team')='array' and f->'team'<>'[]'::jsonb then
 exists(select 1 from unnest(private.rh_calendar_teams((r->>'entry_id')::uuid,r->>'team')) t where f->'team' ? t)
 else private.rh_calendar_selected(r->>'team',f->'team') end;
$$;
revoke all on function private.rh_calendar_teams(uuid,text),private.rh_calendar_selected(text,jsonb),private.rh_calendar_row_selected(jsonb,jsonb) from public,anon,authenticated;
grant execute on function private.rh_calendar_teams(uuid,text),private.rh_calendar_selected(text,jsonb),private.rh_calendar_row_selected(jsonb,jsonb) to service_role;
create or replace function public.rh_calendar_window(target_profile uuid,target_session uuid,target_cnes uuid,range_start date,range_end date,page_index integer default 0,search_text text default '',filter_json jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
declare selection jsonb;context jsonb;unit_id uuid;employees jsonb;bond_ids uuid[];rows_count integer;last_day date;result jsonb;ids uuid[];extra jsonb;records jsonb;facets jsonb;conflicts jsonb;conflict_bonds uuid[];
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'RH_NOT_ALLOWED';end if;
 if range_start is null or range_start not between date '1900-01-01' and date '2100-12-31' or range_end is null or range_end<range_start or range_end-range_start>92
  or page_index is null or page_index not between 0 and 100 or search_text is null or length(search_text)>120 then raise exception 'RH_INPUT_INVALID';end if;

 if filter_json is null or jsonb_typeof(filter_json)<>'object' or octet_length(filter_json::text)>32000 then raise exception 'RH_INPUT_INVALID';end if;
 if exists(select 1 from jsonb_each(filter_json) kv where kv.key not in ('full_name','position','cbo','team','review','type','status','conflict_criteria','conflict_only')
 or case when kv.key='conflict_only' then jsonb_typeof(kv.value)<>'boolean'
 when kv.key in ('full_name','position','cbo','team','conflict_criteria') and jsonb_typeof(kv.value)='array' then jsonb_array_length(kv.value)>200 or exists(select 1 from jsonb_array_elements(kv.value) x where jsonb_typeof(x)<>'string' or length(x#>>'{}')>240)
 else jsonb_typeof(kv.value)<>'string' or length(kv.value#>>'{}')>120 end) then raise exception 'RH_INPUT_INVALID';end if;
 if filter_json ? 'conflict_criteria' and (jsonb_typeof(filter_json->'conflict_criteria')<>'array' or exists(select 1 from jsonb_array_elements_text(filter_json->'conflict_criteria') x where x not in ('position','cbo','team'))) then raise exception 'RH_INPUT_INVALID';end if;
 filter_json:=jsonb_build_object('position','','cbo','','team','','review','todos','type','todos','status','todos','conflict_criteria','[]'::jsonb,'conflict_only',false)||filter_json;
 if filter_json->>'review' not in ('todos','pendente','conferido') or filter_json->>'type' not in ('todos','regulamentar','premio','banco_horas') or filter_json->>'status' not in ('todos','com_afastamento','sem_afastamento','programada','concluida','cancelada') then raise exception 'RH_INPUT_INVALID';end if;
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

 -- Catálogos da unidade inteira, independentes dos filtros e da paginação.
 select jsonb_object_agg(key,values) into facets from (
 select key,jsonb_agg(value order by value collate "pt-BR-x-icu") values from (
 select distinct key,value from private.rh_calendar_employees(unit_id) r
 cross join lateral (values ('full_name',r.full_name),('position',r.position),('cbo',r.cbo)) v(key,value) where nullif(btrim(value),'') is not null
 union select 'team',t from private.rh_calendar_employees(unit_id) r cross join lateral unnest(private.rh_calendar_teams(r.entry_id,r.team)) t
 ) choices group by key) catalog;
 -- Cada pessoa é contada uma vez por dia; cancelados e dias não atribuídos são excluídos.
 if filter_json->'conflict_criteria'<>'[]'::jsonb then
 with roster as materialized(select r.*,b.servidor_id person_id,private.rh_calendar_teams(r.entry_id,r.team) teams from private.rh_calendar_employees(unit_id) r join public.employment_bonds b on b.id=r.bond_id),
 periods as (
 select l.bond_id,(p->>'start_date')::date first_day,(p->>'end_date')::date last_day,null::uuid legacy_id from private.rh_leaves l
 cross join lateral jsonb_array_elements(l.plan->'periods') p where l.cnes_unit_id=unit_id and l.status<>'cancelada'
 and (filter_json->>'type'='todos' or l.plan->>'type'=filter_json->>'type')
 and (p->>'start_date')::date<=range_end and (p->>'end_date')::date>=range_start
 union all select v.context_bond_id,p.start_date,p.end_date,v.id from public.vacation_requests v join public.request_periods p on p.request_id=v.id
 where v.status not in ('cancelada','rejeitada','rascunho','devolvida') and p.start_date<=range_end and p.end_date>=range_start
 and (filter_json->>'type'='todos' or v.type::text=filter_json->>'type')
 and ((v.context_cnes_unit_id=unit_id and v.status in ('programada','reprogramada','concluida')) or exists(select 1 from public.request_unit_reviews u where u.request_id=v.id and u.cnes_unit_id=unit_id and u.status='programada'))
 ), days as materialized(
 select distinct r.bond_id,r.person_id,r.full_name,r.position,r.cbo,r.teams,d::date calendar_day from periods p join roster r on r.bond_id=p.bond_id
 cross join lateral generate_series(greatest(p.first_day,range_start)::timestamp,least(p.last_day,range_end)::timestamp,interval '1 day') d
 where p.legacy_id is null or not exists(select 1 from public.request_day_responsibilities x where x.request_id=p.legacy_id)
 or exists(select 1 from public.request_day_responsibilities x where x.request_id=p.legacy_id and x.cnes_unit_id=unit_id and x.responsibility_date=d::date)
 ), pairs as (
 select a.calendar_day,a.bond_id a,b.bond_id b from days a join days b on a.calendar_day=b.calendar_day and a.bond_id<b.bond_id and a.person_id<>b.person_id
 where filter_json->'conflict_criteria'<>'[]'::jsonb
 and (not (filter_json->'conflict_criteria' ? 'position') or (nullif(btrim(a.position),'') is not null and lower(a.position)=lower(b.position)))
 and (not (filter_json->'conflict_criteria' ? 'cbo') or (nullif(btrim(a.cbo),'') is not null and a.cbo=b.cbo))
 and (not (filter_json->'conflict_criteria' ? 'team') or a.teams && b.teams)
 ), participants as (select calendar_day,a bond_id from pairs union select calendar_day,b from pairs), grouped as (
 select calendar_day,jsonb_agg(bond_id order by bond_id) bond_ids from participants group by calendar_day)
 select coalesce(jsonb_agg(jsonb_build_object('date',calendar_day,'bond_ids',g.bond_ids) order by calendar_day),'[]') into conflicts from grouped g;
 else conflicts:='[]'::jsonb;end if;
 select array_agg(distinct x::uuid) into conflict_bonds from jsonb_array_elements(conflicts) c cross join lateral jsonb_array_elements_text(c->'bond_ids') x;

 last_day:=range_end;
 select count(*) into rows_count from private.rh_calendar_employees(unit_id) r where (search_text='' or position(lower(search_text) in lower(concat_ws(' ',r.full_name,r.registration,r.position,r.cbo,r.team)))>0)
  and private.rh_calendar_row_selected(to_jsonb(r),filter_json)
  and (not (filter_json->>'conflict_only')::boolean or r.bond_id=any(coalesce(conflict_bonds,'{}'::uuid[])))
  and (filter_json->>'review'='todos' or case when filter_json->>'review'='conferido' then r.binding_confirmed else not coalesce(r.binding_confirmed,false) end)
  and private.rh_calendar_window_matches(unit_id,r.bond_id,range_start,range_end,filter_json->>'status',filter_json->>'type');
 select coalesce(jsonb_agg(to_jsonb(r) order by r.full_name collate "pt-BR-x-icu",r.row_id),'[]'),array_agg(distinct r.bond_id) filter(where r.bond_id is not null)
 into employees,bond_ids from (select * from private.rh_calendar_employees(unit_id) r where (search_text='' or position(lower(search_text) in lower(concat_ws(' ',r.full_name,r.registration,r.position,r.cbo,r.team)))>0)
  and private.rh_calendar_row_selected(to_jsonb(r),filter_json)
  and (not (filter_json->>'conflict_only')::boolean or r.bond_id=any(coalesce(conflict_bonds,'{}'::uuid[])))
  and (filter_json->>'review'='todos' or case when filter_json->>'review'='conferido' then r.binding_confirmed else not coalesce(r.binding_confirmed,false) end)
  and private.rh_calendar_window_matches(unit_id,r.bond_id,range_start,range_end,filter_json->>'status',filter_json->>'type')
  order by r.full_name collate "pt-BR-x-icu",r.row_id limit 50 offset page_index*50) r;
 result:=jsonb_build_object('context',context,'operator',selection->'operator','month',range_start,'range_start',range_start,'range_end',range_end,'employees',employees,'total',rows_count,
  'absences',coalesce((select jsonb_agg(to_jsonb(a) order by a.start_date,a.id,a.sequence) from (
   select v.id,v.context_bond_id bond_id,v.protocol,v.type,v.status,p.sequence,p.start_date,p.end_date,p.return_date,'legado'::text origin,
    coalesce((select jsonb_agg(d.responsibility_date order by d.responsibility_date) from public.request_day_responsibilities d
     where d.request_id=v.id and d.cnes_unit_id=unit_id and d.responsibility_date between range_start and last_day),'[]') assigned_dates,
    exists(select 1 from public.request_day_responsibilities d where d.request_id=v.id) distributed
   from public.vacation_requests v join public.request_periods p on p.request_id=v.id
   where v.context_bond_id=any(coalesce(bond_ids,'{}'::uuid[])) and (filter_json->>'type'='todos' or v.type::text=filter_json->>'type') and v.status not in ('cancelada','rejeitada','rascunho','devolvida')
    and p.start_date<=last_day and p.end_date>=range_start
    and ((v.context_cnes_unit_id=unit_id and v.status in ('programada','reprogramada','concluida'))
      or exists(select 1 from public.request_unit_reviews r where r.request_id=v.id and r.cnes_unit_id=unit_id and r.status='programada'))
   order by p.start_date,v.id,p.sequence limit 1001) a),'[]'),
  'holidays',coalesce((select jsonb_agg(jsonb_build_object('date',event_date,'name',name,'type',type) order by event_date) from public.calendar_events where active and event_date between range_start and last_day),'[]'));
 if jsonb_array_length(result->'absences')>1000 then raise exception 'RH_CALENDAR_LIMIT';end if;
 unit_id:=(result->'context'->>'cnes_unit_id')::uuid;
 select array_agg((r->>'bond_id')::uuid) into ids from jsonb_array_elements(result->'employees') r where r->>'bond_id' is not null;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into extra from (
  select l.id,l.bond_id,'RH-'||upper(left(replace(l.id::text,'-',''),12)) protocol,l.plan->>'type' type,l.status,
   (p->>'sequence')::integer sequence,p->>'start_date' start_date,p->>'end_date' end_date,p->>'return_date' return_date,
   'rh'::text origin,false distributed,'[]'::jsonb assigned_dates
  from private.rh_leaves l cross join lateral jsonb_array_elements(l.plan->'periods') p
  where l.cnes_unit_id=unit_id and l.bond_id=any(coalesce(ids,'{}'::uuid[])) and l.status<>'cancelada' and (filter_json->>'type'='todos' or l.plan->>'type'=filter_json->>'type')
   and (p->>'start_date')::date<(range_end+1)::date and (p->>'end_date')::date>=range_start limit 1001) q;
 if jsonb_array_length(extra)+jsonb_array_length(result->'absences')>1000 then raise exception 'RH_CALENDAR_LIMIT';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id),'[]') into records from (
  select l.id,'RH-'||upper(left(replace(l.id::text,'-',''),12)) protocol,l.snapshot->>'full_name' full_name,
   l.snapshot->>'registration' registration,l.plan->>'type' type,l.status,l.created_at
  from private.rh_leaves l where l.cnes_unit_id=unit_id and l.bond_id=any(coalesce(ids,'{}'::uuid[])) and (filter_json->>'type'='todos' or l.plan->>'type'=filter_json->>'type') and (filter_json->>'status' not in ('programada','concluida','cancelada') or l.status=filter_json->>'status')
   and exists(select 1 from jsonb_array_elements(l.plan->'periods') p where (p->>'start_date')::date<(range_end+1)::date and (p->>'end_date')::date>=range_start)
  order by l.created_at desc,l.id limit 51) q;
 if filter_json->>'type'<>'todos' then
  result:=jsonb_set(result,'{absences}',coalesce((select jsonb_agg(a) from jsonb_array_elements(result->'absences') a where a->>'type'=filter_json->>'type'),'[]'));
  extra:=coalesce((select jsonb_agg(a) from jsonb_array_elements(extra) a where a->>'type'=filter_json->>'type'),'[]');
  records:=coalesce((select jsonb_agg(a) from jsonb_array_elements(records) a where a->>'type'=filter_json->>'type'),'[]');
 end if;
 result:=jsonb_set(result,'{employees}',coalesce((select jsonb_agg(r||jsonb_build_object('birth_month_day',case when birthday.bond_id is not null then case when birthday.birthday_month is not null then lpad(birthday.birthday_month::text,2,'0')||'-'||lpad(birthday.birthday_day::text,2,'0') end else to_char(s.birth_date,'MM-DD') end) order by ord)
  from jsonb_array_elements(result->'employees') with ordinality rows(r,ord)
  left join public.employment_bonds b on b.id=(r->>'bond_id')::uuid
  left join public.servidores s on s.id=b.servidor_id left join private.rh_employee_birthdays birthday on birthday.bond_id=b.id),'[]'::jsonb));
 result:=result||jsonb_build_object('source_competence',(select competence from private.cnes_import_runs where cnes_unit_id=unit_id order by created_at desc,id desc limit 1));
 return jsonb_set(result,'{absences}',(result->'absences')||extra)||jsonb_build_object('records',case when jsonb_array_length(records)>50 then records-50 else records end,
  'records_has_more',jsonb_array_length(records)>50,'filters',filter_json,'facets',coalesce(facets,'{}'::jsonb),'conflicts',conflicts);
end $$;
