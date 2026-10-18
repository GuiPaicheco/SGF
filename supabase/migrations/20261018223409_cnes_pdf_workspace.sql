-- CNES obrigatório; matrícula municipal opcional. Histórico e snapshots não são reescritos.
alter table public.servidores alter column matricula drop not null;
alter table public.employment_bonds alter column registration drop not null;
alter table public.employment_bonds drop constraint employment_bonds_registration_present;
alter table private.cnes_registry_entries add column source_competence text, add column source_metadata jsonb not null default '{}';
create table private.cnes_people(cns text primary key check(cns ~ '^[0-9]{15}$'),servidor_id uuid not null references public.servidores(id));
alter table private.cnes_people enable row level security;
revoke all on private.cnes_people from public,anon,authenticated;
grant select,insert on private.cnes_people to service_role;
revoke execute on function public.create_manual_registry_entry(uuid,uuid,uuid,text,jsonb,text) from service_role;
create or replace function private.rh_calendar_employees(target_cnes uuid)
returns table(row_id uuid,entry_id uuid,bond_id uuid,full_name text,registration text,"position" text,cbo text,team text,
 weekly_hours numeric,origin text,review_pending boolean,binding_confirmed boolean)
language sql stable security invoker set search_path='' as $$
 select e.id,e.id,coalesce(m.bond_id,legacy.id),coalesce(e.source_data->>'fullName',e.local_data->>'fullName'),
 e.local_data->>'registration',coalesce(e.source_data->>'occupation',e.local_data->>'municipalPosition'),e.source_data->>'cbo',
 coalesce(e.local_data->>'teamLabel',(select string_agg(t->>'name',', ' order by t->>'name') from jsonb_array_elements(coalesce(e.source_data->'teams','[]')) t)),
 coalesce(e.local_data->>'weeklyHours',e.source_data->>'weeklyHours')::numeric,'cnes',e.review_status<>'reviewed',
 m.bond_id is not null and m.entry_version=e.version and e.review_status='reviewed' and lower(e.source_data->>'status')='ativo' and nullif(e.source_data->>'deactivationCompetence','') is null and b.active and b.pole_cnes_unit_id=target_cnes
 from private.cnes_registry_entries e left join private.rh_registry_bonds m on m.entry_id=e.id
 left join public.employment_bonds b on b.id=m.bond_id
 left join public.employment_bonds legacy on m.bond_id is null and legacy.servidor_id=e.servidor_id
   and upper(legacy.registration)=upper(e.local_data->>'registration') and legacy.active
 where coalesce(e.source_data->>'origin','')<>'manual' and e.cnes_unit_id=target_cnes 
 union all
 select b.id,null,b.id,s.full_name,b.registration,coalesce(c.name,s.declared_position),null,s.team_name,u.weekly_hours::numeric,'legado',true,false
 from public.employment_bonds b join public.servidores s on s.id=b.servidor_id and s.active
 left join public.cargos c on c.id=b.cargo_id
 join lateral(select x.weekly_hours from public.employment_bond_units x where x.bond_id=b.id and x.cnes_unit_id=target_cnes and x.active order by x.id limit 1) u on true
 where b.active and not exists(select 1 from private.cnes_registry_entries e left join private.rh_registry_bonds m on m.entry_id=e.id
  where coalesce(e.source_data->>'origin','')<>'manual' and e.cnes_unit_id=target_cnes 
    and (m.bond_id=b.id or (e.servidor_id=b.servidor_id and upper(e.local_data->>'registration')=upper(b.registration))));
$$;

-- Critérios de afastamento aplicados antes de contar/paginar os profissionais.
create function private.rh_calendar_window_matches(target_cnes uuid,target_bond uuid,range_start date,range_end date,target_status text,target_type text)
returns boolean language sql stable security invoker set search_path='' as $$
 select case when target_status='todos' and target_type='todos' then true else
  (exists (
   select 1 from private.rh_leaves l where l.cnes_unit_id=target_cnes and l.bond_id=target_bond
    and (target_type='todos' or l.plan->>'type'=target_type)
    and case when target_status='todos' then true when target_status='cancelada' then l.status='cancelada' when target_status in ('programada','concluida') then l.status=target_status else l.status<>'cancelada' end
    and exists(select 1 from jsonb_array_elements(l.plan->'periods') p where (p->>'start_date')::date<range_end+1 and (p->>'end_date')::date>=range_start)
   union all
   select 1 from public.vacation_requests v join public.request_periods p on p.request_id=v.id
   where v.context_bond_id=target_bond and (target_type='todos' or v.type::text=target_type)
    and v.status not in ('cancelada','rejeitada','rascunho','devolvida') and target_status<>'cancelada'
    and (target_status not in ('programada','concluida') or case when target_status='concluida' then v.status='concluida' else v.status<>'concluida' end)
    and p.start_date<range_end+1 and p.end_date>=range_start
    and ((v.context_cnes_unit_id=target_cnes and v.status in ('programada','reprogramada','concluida'))
     or exists(select 1 from public.request_unit_reviews r where r.request_id=v.id and r.cnes_unit_id=target_cnes and r.status='programada'))
    and (not exists(select 1 from public.request_day_responsibilities d where d.request_id=v.id)
     or exists(select 1 from public.request_day_responsibilities d where d.request_id=v.id and d.cnes_unit_id=target_cnes
      and d.responsibility_date between greatest(range_start,p.start_date) and least((range_end+1)::date-1,p.end_date)))
  )) is distinct from (target_status='sem_afastamento') end;
$$;
revoke all on function private.rh_calendar_window_matches(uuid,uuid,date,date,text,text) from public,anon,authenticated;
grant execute on function private.rh_calendar_window_matches(uuid,uuid,date,date,text,text) to service_role;

create function public.rh_calendar_window(target_profile uuid,target_session uuid,target_cnes uuid,range_start date,range_end date,page_index integer default 0,search_text text default '',filter_json jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
declare selection jsonb;context jsonb;unit_id uuid;employees jsonb;bond_ids uuid[];rows_count integer;last_day date;result jsonb;ids uuid[];extra jsonb;records jsonb;
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'RH_NOT_ALLOWED';end if;
 if range_start is null or range_start not between date '1900-01-01' and date '2100-12-31' or range_end is null or range_end<range_start or range_end-range_start>92
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
 last_day:=range_end;
 select count(*) into rows_count from private.rh_calendar_employees(unit_id) r where (search_text='' or position(lower(search_text) in lower(concat_ws(' ',r.full_name,r.registration,r.position,r.cbo,r.team)))>0)
  and position(lower(filter_json->>'position') in lower(coalesce(r.position,'')))>0
  and position(lower(filter_json->>'cbo') in lower(coalesce(r.cbo,'')))>0
  and position(lower(filter_json->>'team') in lower(coalesce(r.team,'')))>0
  and (filter_json->>'review'='todos' or case when filter_json->>'review'='conferido' then r.binding_confirmed else not coalesce(r.binding_confirmed,false) end)
  and private.rh_calendar_window_matches(unit_id,r.bond_id,range_start,range_end,filter_json->>'status',filter_json->>'type');
 select coalesce(jsonb_agg(to_jsonb(r) order by r.full_name,r.row_id),'[]'),array_agg(distinct r.bond_id) filter(where r.bond_id is not null)
 into employees,bond_ids from (select * from private.rh_calendar_employees(unit_id) r where (search_text='' or position(lower(search_text) in lower(concat_ws(' ',r.full_name,r.registration,r.position,r.cbo,r.team)))>0)
  and position(lower(filter_json->>'position') in lower(coalesce(r.position,'')))>0
  and position(lower(filter_json->>'cbo') in lower(coalesce(r.cbo,'')))>0
  and position(lower(filter_json->>'team') in lower(coalesce(r.team,'')))>0
  and (filter_json->>'review'='todos' or case when filter_json->>'review'='conferido' then r.binding_confirmed else not coalesce(r.binding_confirmed,false) end)
  and private.rh_calendar_window_matches(unit_id,r.bond_id,range_start,range_end,filter_json->>'status',filter_json->>'type')
  order by r.full_name,r.row_id limit 50 offset page_index*50) r;
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
 return jsonb_set(result,'{absences}',(result->'absences')||extra)||jsonb_build_object('records',case when jsonb_array_length(records)>50 then records-50 else records end,
  'records_has_more',jsonb_array_length(records)>50,'filters',filter_json);
end $$;

revoke all on function public.rh_calendar_window(uuid,uuid,uuid,date,date,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.rh_calendar_window(uuid,uuid,uuid,date,date,integer,text,jsonb) to service_role;
create function private.integrate_cnes_entry(actor_id uuid,target_entry uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare e private.cnes_registry_entries%rowtype;m private.rh_registry_bonds%rowtype;person uuid;bond uuid;location uuid;canonical_cns text;
begin
 perform private.require_cnes_import_admin(actor_id);
 select * into e from private.cnes_registry_entries where id=target_entry for update;
 if not found or coalesce(e.source_data->>'origin','')='manual' or lower(e.source_data->>'status')<>'ativo' then raise exception 'RH_ENTRY_REVIEW_REQUIRED';end if;
 canonical_cns:=coalesce(e.source_data->>'principalCns',e.source_data->>'cns');
 if canonical_cns is null or canonical_cns !~ '^[0-9]{15}$' then raise exception 'CNES_COLLECTION_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('cnes-person:'||canonical_cns,0));
 select * into m from private.rh_registry_bonds where entry_id=e.id;
 person:=e.servidor_id;
 if person is null then select servidor_id into person from private.cnes_people where private.cnes_people.cns=canonical_cns;end if;
 select lotacao_id into location from private.rh_unit_accounts where cnes_unit_id=e.cnes_unit_id;
 if location is null then raise exception 'RH_UNIT_INVALID';end if;
 if person is null then
  insert into public.servidores(full_name,matricula,employment_type,lotacao_id,declared_position)
   values(e.source_data->>'fullName',null,case when upper(e.source_data->>'relationshipType') like '%EFETIVO%' then 'efetivo' else e.source_data->>'relationshipType' end,location,e.source_data->>'occupation') returning id into person;
 end if;
 insert into private.cnes_people(cns,servidor_id) values(canonical_cns,person) on conflict do nothing;
 if exists(select 1 from private.cnes_people p where p.cns=canonical_cns and p.servidor_id<>person) then raise exception 'CNES_AMBIGUOUS_SOURCE_IDENTITY';end if;
 bond:=m.bond_id;
 if bond is null and e.servidor_id is not null then
  select b.id into bond from public.employment_bonds b where b.servidor_id=e.servidor_id and b.active
   and exists(select 1 from public.employment_bond_units u where u.bond_id=b.id and u.cnes_unit_id=e.cnes_unit_id)
   and not exists(select 1 from private.rh_registry_bonds x where x.bond_id=b.id)
   and (select count(*) from public.employment_bonds b2 where b2.servidor_id=e.servidor_id and b2.active)=1;
  if bond is null then raise exception 'CNES_AMBIGUOUS_SOURCE_IDENTITY';end if;
 end if;
 if bond is null then
  insert into public.employment_bonds(servidor_id,registration,employment_type,pole_cnes_unit_id,source)
   values(person,null,case when upper(e.source_data->>'relationshipType') like '%EFETIVO%' then 'efetivo' else e.source_data->>'relationshipType' end,e.cnes_unit_id,'cadastro_administrativo') returning id into bond;
  insert into public.employment_bond_units(bond_id,cnes_unit_id,source) values(bond,e.cnes_unit_id,'cadastro_administrativo');
 end if;
 update public.servidores set full_name=e.source_data->>'fullName',declared_position=e.source_data->>'occupation',updated_at=now() where id=person;
 update private.cnes_registry_entries set servidor_id=person,review_status='reviewed' where id=e.id;
 insert into private.rh_registry_bonds(entry_id,bond_id,entry_version,confirmed_by) values(e.id,bond,e.version,actor_id)
  on conflict(entry_id) do update set entry_version=excluded.entry_version,version=rh_registry_bonds.version+1,confirmed_by=actor_id,confirmed_at=now();
end $$;
revoke all on function private.integrate_cnes_entry(uuid,uuid) from public,anon,authenticated;
grant execute on function private.integrate_cnes_entry(uuid,uuid) to service_role;

create function public.cnes_import_status(actor_id uuid,target_cnes uuid,target_digest text) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 perform private.require_cnes_import_admin(actor_id);
 return (select jsonb_build_object('status','already_applied','run_id',id) from private.cnes_import_runs where cnes_unit_id=target_cnes and digest=target_digest);
end $$;
revoke all on function public.cnes_import_status(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.cnes_import_status(uuid,uuid,text) to service_role;

create function public.apply_cnes_reviewed(actor_id uuid,target_cnes uuid,items jsonb,collection_digest text,collected_at timestamptz,
 competence text,expected_revision bigint,absent_ids jsonb,present_ids jsonb,metadata jsonb) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='15s' as $$
declare result jsonb;e private.cnes_registry_entries%rowtype;state_row private.cnes_registry_state%rowtype;run_id uuid;
begin
 perform private.require_cnes_import_admin(actor_id);
 if competence is null or competence !~ '^[0-9]{4}(0[1-9]|1[0-2])$' or jsonb_typeof(absent_ids)<>'array' or jsonb_typeof(present_ids)<>'array'
  or jsonb_typeof(metadata)<>'object' or octet_length(metadata::text)>1000 then raise exception 'CNES_COLLECTION_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('cnes-registry:'||target_cnes::text,0));
 result:=public.cnes_import_status(actor_id,target_cnes,collection_digest);
 if result is not null then return result;end if;
 if jsonb_array_length(items)=0 then
  if collection_digest is null or collection_digest !~ '^[a-f0-9]{64}$' or collected_at is null or collected_at>now()+interval '5 minutes'
   or not exists(select 1 from public.cnes_units where id=target_cnes and active) then raise exception 'CNES_COLLECTION_INVALID';end if;
  insert into private.cnes_registry_state(cnes_unit_id) values(target_cnes) on conflict do nothing;
  select * into state_row from private.cnes_registry_state where cnes_unit_id=target_cnes for update;
  if expected_revision is null or state_row.revision<>expected_revision then raise exception 'CNES_VERSION_CONFLICT';end if;
  if state_row.last_collected_at is not null and collected_at<state_row.last_collected_at then raise exception 'CNES_STALE_COLLECTION';end if;
  insert into private.cnes_import_runs(cnes_unit_id,digest,actor_id,collected_at,competence,added,changed,absent)
   values(target_cnes,collection_digest,actor_id,collected_at,competence,0,0,jsonb_array_length(absent_ids)) returning id into run_id;
  update private.cnes_registry_state set revision=revision+1,last_collected_at=collected_at where cnes_unit_id=target_cnes;
  result:=jsonb_build_object('status','applied','run_id',run_id);
 else
  result:=public.apply_cnes_registry_import(actor_id,target_cnes,items,collection_digest,collected_at,competence,expected_revision);
 end if;
 for e in select * from private.cnes_registry_entries where cnes_unit_id=target_cnes and source_id in (select jsonb_array_elements_text(present_ids)) loop
  update private.cnes_registry_entries set source_competence=competence,source_metadata=metadata where id=e.id;
  perform private.integrate_cnes_entry(actor_id,e.id);
 end loop;
 -- Ausência confirmada bloqueia novos lançamentos e operadores, preservando vínculo e todos os afastamentos.
 update private.cnes_registry_entries set source_data=jsonb_set(source_data,'{status}','"inativo"'),review_status='reviewed',version=version+1,
  source_competence=competence,source_metadata=metadata,updated_at=now()
  where cnes_unit_id=target_cnes and source_id in(select jsonb_array_elements_text(absent_ids));
 insert into public.audit_events(actor_id,actor_role,action,entity_type,context_cnes_unit_id,new_value)
  values(actor_id,'administrador','cnes_reviewed_import','cnes_registry',target_cnes,jsonb_build_object('competence',competence,'present',present_ids,'absent',absent_ids));
 return result;
end $$;
revoke all on function public.apply_cnes_reviewed(uuid,uuid,jsonb,text,timestamptz,text,bigint,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.apply_cnes_reviewed(uuid,uuid,jsonb,text,timestamptz,text,bigint,jsonb,jsonb,jsonb) to service_role;

create function public.cnes_unit_registry(actor_id uuid,target_cnes uuid,page_index integer,search_text text,filter_json jsonb) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
declare entries jsonb;total integer;
begin
 perform private.require_cnes_import_admin(actor_id);
 if page_index is null or page_index not between 0 and 100 or search_text is null or length(search_text)>120
  or jsonb_typeof(filter_json) is distinct from 'object' or octet_length(filter_json::text)>1000 then raise exception 'CNES_PAGE_INVALID';end if;
 if exists(select 1 from jsonb_each(filter_json) x where x.key not in('cbo','team') or jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>120) then raise exception 'CNES_LOCAL_DATA_INVALID';end if;
 select count(*) into total from private.cnes_registry_entries e where e.cnes_unit_id=target_cnes
  and coalesce(e.source_data->>'origin','')<>'manual'
  and position(lower(search_text) in lower(concat_ws(' ',e.source_data->>'fullName',e.source_data->>'occupation',e.source_data->>'cbo',e.source_data->'teams'))) >0
  and position(lower(coalesce(filter_json->>'cbo','')) in lower(e.source_data->>'cbo'))>0
  and position(lower(coalesce(filter_json->>'team','')) in lower(coalesce(e.source_data->'teams','[]')::text))>0;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.full_name,q.id),'[]') into entries from(
  select e.id,e.source_data,e.local_data,e.source_competence,e.source_metadata,e.review_status,e.version,
   e.source_data->>'fullName' full_name,coalesce(g.active,false) authorized,coalesce(g.version,0) grant_version,
   m.bond_id is not null integrated
  from private.cnes_registry_entries e left join private.rh_operator_grants g on g.entry_id=e.id
   left join private.rh_registry_bonds m on m.entry_id=e.id
  where e.cnes_unit_id=target_cnes and coalesce(e.source_data->>'origin','')<>'manual'
   and position(lower(search_text) in lower(concat_ws(' ',e.source_data->>'fullName',e.source_data->>'occupation',e.source_data->>'cbo',e.source_data->'teams'))) >0
   and position(lower(coalesce(filter_json->>'cbo','')) in lower(e.source_data->>'cbo'))>0
   and position(lower(coalesce(filter_json->>'team','')) in lower(coalesce(e.source_data->'teams','[]')::text))>0
  order by e.source_data->>'fullName',e.id limit 50 offset page_index*50) q;
 return jsonb_build_object('entries',entries,'total',total,'page',page_index,
  'last_import',(select jsonb_build_object('competence',r.competence,'collected_at',r.collected_at) from private.cnes_import_runs r where r.cnes_unit_id=target_cnes order by r.created_at desc,r.id desc limit 1));
end $$;
revoke all on function public.cnes_unit_registry(uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.cnes_unit_registry(uuid,uuid,integer,text,jsonb) to service_role;

create or replace function public.rh_leave_resources(target_profile uuid,target_session uuid,target_cnes uuid,target_entry uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor jsonb;entry private.cnes_registry_entries%rowtype;binding private.rh_registry_bonds%rowtype;bond public.employment_bonds%rowtype;
begin
 actor:=private.rh_leave_actor(target_profile,target_session,target_cnes);
 select * into entry from private.cnes_registry_entries where id=target_entry and cnes_unit_id=(actor->'context'->>'cnes_unit_id')::uuid;
 if not found then raise exception 'RH_BOND_OUT_OF_UNIT';end if;
 select * into binding from private.rh_registry_bonds where entry_id=entry.id;
 select * into bond from public.employment_bonds where id=binding.bond_id;
 if binding.entry_version is distinct from entry.version or entry.review_status<>'reviewed' or not coalesce(bond.active,false)
  or bond.pole_cnes_unit_id is distinct from entry.cnes_unit_id or lower(entry.source_data->>'status') is distinct from 'ativo'
  or nullif(entry.source_data->>'deactivationCompetence','') is not null or coalesce(entry.source_data->>'origin','')='manual'
  or not exists(select 1 from public.servidores where id=bond.servidor_id and active)
  or not exists(select 1 from public.employment_bond_units where bond_id=bond.id and cnes_unit_id=entry.cnes_unit_id and active)
  then raise exception 'RH_ENTRY_REVIEW_REQUIRED';end if;
 return jsonb_build_object('entry_id',entry.id,'entry_version',entry.version,'binding_version',binding.version,'bond_id',bond.id,'bond_version',bond.version,
  'full_name',coalesce(entry.local_data->>'fullName',entry.source_data->>'fullName'),'registration',bond.registration,
  'position',coalesce(entry.source_data->>'occupation',entry.local_data->>'municipalPosition'),'cbo',entry.source_data->>'cbo',
  'weekly_hours',coalesce(entry.local_data->'weeklyHours',entry.source_data->'weeklyHours'),
  'team',coalesce(entry.local_data->>'teamLabel',(select string_agg(t->>'name',', ' order by t->>'name') from jsonb_array_elements(coalesce(entry.source_data->'teams','[]')) t)),
  'birth_date',(select birth_date from public.servidores where id=bond.servidor_id),'admission_date',bond.admission_date,'employment_type',bond.employment_type,
  'cnes_code',(select code from public.cnes_units where id=entry.cnes_unit_id),'unit',(select name from public.cnes_units where id=entry.cnes_unit_id),
  'rights',coalesce((select jsonb_agg(jsonb_build_object('id',id,'type',type,'acquisition_end',acquisition_end,'available_days',available_days,'version',version)) from public.vacation_rights where bond_id=bond.id),'[]'));
end $$;


-- Cálculo inverso compartilha as regras da programação e da revisão. Não altera registros históricos.
create or replace function private.rh_make_leave_plan(resources jsonb,item jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare kind text:=item->>'type';birth date;admission date;acquisition date;start_day date;second_start date;mode text;quantity integer;first_days integer;
 daily numeric;available numeric;requested_extra numeric;required_minutes integer:=0;available_minutes integer:=0;extra_days integer:=0;
 excluded date[];periods jsonb:='[]';p jsonb;split text:=coalesce(item->>'split','none');deficit integer:=0;notes text;date_mode text:=coalesce(item->>'dateMode','start');desired_return date;cursor_day date;used integer:=0;scanned integer:=0;
begin
 if jsonb_typeof(item) is distinct from 'object' or octet_length(item::text)>8000 or kind is null or kind not in ('regulamentar','premio','banco_horas')
  or (item->>'eligibilityConfirmed')::boolean is distinct from true then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 birth:=coalesce(nullif(resources->>'birth_date','')::date,nullif(item->>'birthDate','')::date);
 admission:=coalesce(nullif(resources->>'admission_date','')::date,nullif(item->>'admissionDate','')::date);
 if birth is null or admission is null or birth>admission or birth<date '1900-01-01' then raise exception 'RH_LEAVE_IDENTITY_REQUIRED';end if;
 if nullif(item->>'birthDate','') is not null and birth<>(item->>'birthDate')::date then raise exception 'RH_LEAVE_IDENTITY_REQUIRED';end if;
 if date_mode not in ('start','return') then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 if date_mode='return' then
  if nullif(item->>'startDate','') is not null then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
  desired_return:=nullif(item->>'returnDate','')::date;start_day:=desired_return;
 else
  if nullif(item->>'returnDate','') is not null then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
  start_day:=(item->>'startDate')::date;
 end if;
 if start_day is null or start_day<admission or start_day not between date '1900-01-01' and date '2100-12-31' then raise exception 'RH_LEAVE_DATES_INVALID';end if;
 notes:=coalesce(item->>'notes','');if length(notes)>1000 then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 available:=coalesce(nullif(item->>'availableHours','')::numeric,0);daily:=coalesce(nullif(item->>'dailyHours','')::numeric,0);
 requested_extra:=coalesce(nullif(item->>'extraHours','')::numeric,0);
 if available not between 0 and 2160 or requested_extra not between 0 and 2160 or available*60<>trunc(available*60)
  or requested_extra*60<>trunc(requested_extra*60) then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 if kind='banco_horas' or requested_extra>0 then
  if daily<=0 or daily>24 or daily*60<>trunc(daily*60) then raise exception 'RH_LEAVE_DAILY_HOURS_REQUIRED';end if;
 end if;
 if kind='banco_horas' then quantity:=(item->>'days')::integer;mode:='uteis';required_minutes:=quantity*daily*60;
 elsif kind='premio' then
  quantity:=(item->>'days')::integer;mode:='corridos';
  if quantity is null or quantity not in (30,60,90) or requested_extra<>0 then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 else
  acquisition:=nullif(item->>'acquisitionEnd','')::date;
  if acquisition is null or acquisition<admission or start_day<=acquisition then raise exception 'RH_LEAVE_ACQUISITION_INVALID';end if;
  if admission>=date '2025-12-02' or acquisition>=date '2025-12-02' then
   mode:='uteis';
   if item->>'unjustifiedAbsences'='yes' then quantity:=16;
   elsif item->>'unjustifiedAbsences'='no' then quantity:=25;
   else raise exception 'RH_LEAVE_INPUT_INVALID';end if;
   if quantity=25 and requested_extra>0 then extra_days:=floor(requested_extra/daily)::integer;end if;
   if requested_extra=0 then extra_days:=0;end if;
   if requested_extra>0 and quantity<>25 then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
   quantity:=quantity+coalesce(extra_days,0);required_minutes:=extra_days*daily*60;
  else mode:='corridos';quantity:=30;if requested_extra>0 then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
  end if;
 end if;
 if quantity is null or quantity not between 1 and 90 or daily not between 0 and 24 then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 available_minutes:=available*60;deficit:=greatest(required_minutes-available_minutes,0);
 if (item->>'override')::boolean is true and (deficit=0 or length(btrim(coalesce(item->>'overrideReason',''))) not between 3 and 500) then raise exception 'RH_LEAVE_OVERRIDE_INVALID';end if;
 if length(coalesce(item->>'overrideReason',''))>500 then raise exception 'RH_LEAVE_OVERRIDE_INVALID';end if;
 select coalesce(array_agg(event_date),'{}') into excluded from public.calendar_events where active and event_date between (case when date_mode='return' then start_day-730 else start_day end) and start_day+1100;
 first_days:=quantity;
 if split<>'none' then
  if kind<>'regulamentar' or resources->>'employment_type'<>'efetivo' or item->>'unjustifiedAbsences'<>'no'
   or mode<>'uteis' or quantity<>25 or split not in ('15-10','10-15') then raise exception 'RH_LEAVE_SPLIT_INVALID';end if;
  first_days:=split_part(split,'-',1)::integer;
 end if;
 if date_mode='return' then
  if extract(dow from desired_return) in (0,6) or desired_return=any(excluded)
   or to_char(desired_return,'MM-DD')=to_char(birth,'MM-DD') then raise exception 'RH_LEAVE_RETURN_INVALID';end if;
  if mode='corridos' then start_day:=desired_return-first_days;
  else
   cursor_day:=desired_return-1;
   while used<first_days loop
    scanned:=scanned+1;if scanned>730 then raise exception 'RH_LEAVE_RETURN_INVALID';end if;
    if extract(dow from cursor_day) not in (0,6) and not cursor_day=any(excluded)
     and to_char(cursor_day,'MM-DD')<>to_char(birth,'MM-DD') then used:=used+1;end if;
    if used<first_days then cursor_day:=cursor_day-1;end if;
   end loop;
   start_day:=cursor_day;
  end if;
  if start_day<admission or start_day not between date '1900-01-01' and date '2100-12-31' then raise exception 'RH_LEAVE_DATES_INVALID';end if;
  if kind='regulamentar' and start_day<=acquisition then raise exception 'RH_LEAVE_ACQUISITION_INVALID';end if;
 end if;
 p:=private.calculate_preserved_period(start_day,first_days,mode,birth,excluded);
 if date_mode='return' and (p->>'return_date')::date<>desired_return then raise exception 'RH_LEAVE_RETURN_INVALID';end if;periods:=periods||jsonb_build_array(p||jsonb_build_object('sequence',1));
 if split<>'none' then
  second_start:=nullif(item->>'secondStartDate','')::date;
  if second_start is null or second_start<(p->>'return_date')::date or second_start>start_day+730 then raise exception 'RH_LEAVE_SPLIT_INVALID';end if;
  p:=private.calculate_preserved_period(second_start,split_part(split,'-',2)::integer,mode,birth,excluded);
  periods:=periods||jsonb_build_array(p||jsonb_build_object('sequence',2));
 end if;
 if (periods->-1->>'end_date')::date>date '2100-12-31' then raise exception 'RH_LEAVE_DATES_INVALID';end if;
 return (case when date_mode='return' then jsonb_build_object('date_mode','return','requested_return',desired_return) else '{}'::jsonb end)||jsonb_build_object('type',kind,'periods',periods,'days',quantity,'vacation_days',case when kind='banco_horas' then 0 else quantity-extra_days end,'counting_mode',mode,'acquisition_end',acquisition,'birth_date',birth,'admission_date',admission,
  'bank',jsonb_build_object('declared_minutes',available_minutes,'daily_minutes',daily*60,'required_minutes',required_minutes,'missing_minutes',deficit,
   'possible_days',case when daily>0 then floor(available/daily) else null end,'override',deficit>0 and coalesce((item->>'override')::boolean,false),
   'override_reason',case when deficit>0 and (item->>'override')::boolean then btrim(item->>'overrideReason') else null end),
  'can_save',deficit=0 or coalesce((item->>'override')::boolean,false),'notes',notes,'eligibility_confirmed',true);
exception when invalid_text_representation or division_by_zero or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then raise exception 'RH_LEAVE_INPUT_INVALID';
end $$;

create function private.cnes_only_operational_entry() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from private.cnes_registry_entries where id=new.entry_id and source_data->>'origin'='manual') then
  raise exception 'RH_ENTRY_REVIEW_REQUIRED';
 end if;
 return new;
end $$;
revoke all on function private.cnes_only_operational_entry() from public,anon,authenticated;
grant execute on function private.cnes_only_operational_entry() to service_role;
create trigger cnes_only_operator before insert or update on private.rh_operator_grants for each row execute function private.cnes_only_operational_entry();
create trigger cnes_only_binding before insert or update on private.rh_registry_bonds for each row execute function private.cnes_only_operational_entry();
