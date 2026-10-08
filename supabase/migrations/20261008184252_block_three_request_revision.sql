-- Uma reprogramação é um novo ciclo, não uma alteração silenciosa de decisões.
alter table public.vacation_requests add column replaces_request_id uuid
  references public.vacation_requests(id) on delete restrict;
create unique index vacation_requests_one_replacement_idx on public.vacation_requests(replaces_request_id)
  where replaces_request_id is not null;

create function public.prepare_request_revision(actor_id uuid,target_request uuid,target_starts jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.vacation_requests%rowtype; p record; planned jsonb; periods jsonb:='[]'; days jsonb:='[]';
  excluded date[]; birth date; starts date[]; wanted date[]; d date; candidates jsonb; last_end date;
  snapshot jsonb; period_count integer;
begin
  if private.actor_role(actor_id) is distinct from 'administrador' or not exists(
    select 1 from public.profiles where id=actor_id and disabled_at is null and not must_change_password)
    then raise exception 'ACTOR_NOT_ALLOWED' using errcode='42501'; end if;
  select * into r from public.vacation_requests where id=target_request;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if r.context_bond_id is null or r.status in ('cancelada','concluida') or exists(
    select 1 from public.vacation_requests where replaces_request_id=r.id) then raise exception 'REVISION_NOT_ALLOWED'; end if;
  if jsonb_typeof(target_starts) is distinct from 'array' then raise exception 'PERIODS_INVALID'; end if;
  select count(*) into period_count from public.request_periods where request_id=r.id;
  if period_count not between 1 and 2 or jsonb_array_length(target_starts)<>period_count then raise exception 'PERIODS_INVALID'; end if;
  if (select sum(rp.days) from public.request_periods rp where rp.request_id=r.id)>90 then raise exception 'PERIODS_INVALID'; end if;
  select array_agg(value::date order by ordinal) into starts from jsonb_array_elements_text(target_starts) with ordinality x(value,ordinal);
  select birth_date into birth from public.servidores where id=r.servidor_id and active;
  if not found then raise exception 'RESPONSIBILITY_UNIT_INVALID'; end if;
  select coalesce(array_agg(event_date order by event_date),'{}') into excluded from public.calendar_events where active;
  for p in select *,row_number() over(order by sequence) as ordinal from public.request_periods where request_id=r.id order by sequence loop
    if starts[p.ordinal] is null or starts[p.ordinal]<current_date
      or p.counting_mode is null then raise exception 'PERIODS_INVALID'; end if;
    if r.type='regulamentar' and r.acquisition_end is not null and starts[p.ordinal]<=r.acquisition_end then raise exception 'REVISION_ACQUISITION_RULE'; end if;
    planned:=private.calculate_preserved_period(starts[p.ordinal],p.days,p.counting_mode,birth,excluded);
    if last_end is not null and starts[p.ordinal]<=last_end then raise exception 'PERIODS_INVALID'; end if;
    last_end:=(planned->>'end_date')::date;
    periods:=periods||jsonb_build_array(planned||jsonb_build_object('sequence',p.sequence,'hours',p.hours));
  end loop;
  select coalesce(array_agg(distinct day::date order by day::date),'{}') into wanted
    from jsonb_array_elements(periods) x cross join lateral generate_series((x->>'start_date')::date,(x->>'end_date')::date,'1 day') day
    where extract(dow from day) not in (0,6) and not day::date=any(excluded)
      and (birth is null or to_char(day,'MM-DD')<>to_char(birth,'MM-DD'));
  if cardinality(wanted)=0 then raise exception 'PERIODS_INVALID'; end if;
  foreach d in array wanted loop
    select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'cnes_unit_id',u.cnes_unit_id,'lotacao_id',u.internal_lotacao_id,
      'name',c.name,'location',l.name) order by c.name,u.id),'[]') into candidates
      from private.eligible_day_units(r.context_bond_id,d) u join public.cnes_units c on c.id=u.cnes_unit_id
      left join public.lotacoes l on l.id=u.internal_lotacao_id;
    if jsonb_array_length(candidates)=0 then raise exception 'RESPONSIBILITY_UNIT_INVALID'; end if;
    days:=days||jsonb_build_array(jsonb_build_object('date',d,'candidates',candidates));
  end loop;
  snapshot:=jsonb_build_object('request',to_jsonb(r),'reviews',(select jsonb_agg(to_jsonb(v) order by id) from public.request_unit_reviews v where request_id=r.id),
    'old_periods',(select jsonb_agg(to_jsonb(v) order by sequence) from public.request_periods v where request_id=r.id),
    'periods',periods,'days',days,'birth',birth,'excluded',excluded);
  return jsonb_build_object('request_id',r.id,'version',r.distribution_version,'fingerprint',md5(snapshot::text),'periods',periods,'days',days);
end $$;
revoke all on function public.prepare_request_revision(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.prepare_request_revision(uuid,uuid,jsonb) to service_role;

create function public.commit_request_revision(actor_id uuid,target_request uuid,target_starts jsonb,
  target_days jsonb,expected_fingerprint text,target_reason text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare plan jsonb; r public.vacation_requests%rowtype; replacement public.vacation_requests%rowtype;
  period jsonb; day jsonb; unit_row public.employment_bond_units%rowtype; reviews jsonb; scope record; owner_id uuid;
begin
  perform private.planning_lock();
  select * into r from public.vacation_requests where id=target_request for update;
  perform id from public.request_unit_reviews where request_id=target_request order by id for update;
  -- Congela elegibilidade até terminar; alterações cadastrais concorrentes aguardam.
  perform u.id from public.employment_bond_units u join public.employment_bonds b on b.id=u.bond_id
    join public.servidores s on s.id=b.servidor_id join public.cnes_units c on c.id=u.cnes_unit_id
    where u.bond_id=r.context_bond_id order by u.id for share of u,b,s,c;
  perform l.id from public.lotacoes l where l.id in(select internal_lotacao_id from public.employment_bond_units where bond_id=r.context_bond_id)
    order by l.id for share;
  plan:=public.prepare_request_revision(actor_id,target_request,target_starts);
  if expected_fingerprint is null or plan->>'fingerprint'<>expected_fingerprint then raise exception 'REVISION_VERSION_CONFLICT' using errcode='40001'; end if;
  if target_reason is null or char_length(btrim(target_reason)) not between 3 and 2000 then raise exception 'NOTES_REQUIRED'; end if;
  if jsonb_typeof(target_days) is distinct from 'array' or jsonb_array_length(target_days)<>jsonb_array_length(plan->'days')
    or exists(select 1 from jsonb_array_elements(target_days) x group by x->>'date' having count(*)<>1)
    or exists(select 1 from jsonb_array_elements(target_days) x where not exists(select 1 from jsonb_array_elements(plan->'days') y
      where y->>'date'=x->>'date' and exists(select 1 from jsonb_array_elements(y->'candidates') c where c->>'id'=x->>'bond_unit_id')))
    then raise exception 'RESPONSIBILITY_DAYS_INCOMPLETE'; end if;
  if exists(select 1 from jsonb_array_elements(plan->'periods') p join public.vacation_requests other on other.context_bond_id=r.context_bond_id
    and other.id<>r.id and other.status not in ('rejeitada','cancelada') join public.request_periods op on op.request_id=other.id
    where op.start_date<=(p->>'end_date')::date and op.end_date>=(p->>'start_date')::date) then raise exception 'REVISION_PERIOD_CONFLICT'; end if;
  select jsonb_agg(to_jsonb(v) order by id) into reviews from public.request_unit_reviews v where request_id=r.id;
  -- O cancelamento ativa os eventos compensatórios já existentes, inclusive estorno.
  update public.vacation_requests set status='cancelada',distribution_version=distribution_version+1,updated_at=now() where id=r.id;
  insert into public.vacation_requests(servidor_id,right_id,type,status,start_date,end_date,return_date,notes,protocol,requested_hours,
    acquisition_end,submitted_at,created_by,context_bond_id,context_cnes_unit_id,context_lotacao_id,replaces_request_id)
    values(r.servidor_id,r.right_id,r.type,'enviada',(plan->'periods'->0->>'start_date')::date,
      (plan->'periods'->(jsonb_array_length(plan->'periods')-1)->>'end_date')::date,
      (plan->'periods'->(jsonb_array_length(plan->'periods')-1)->>'return_date')::date,btrim(target_reason),
      'SGF-'||to_char(current_date,'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),r.requested_hours,
      r.acquisition_end,now(),actor_id,r.context_bond_id,r.context_cnes_unit_id,r.context_lotacao_id,r.id) returning * into replacement;
  for period in select value from jsonb_array_elements(plan->'periods') loop
    insert into public.request_periods(request_id,sequence,start_date,end_date,return_date,days,hours,counting_mode)
      values(replacement.id,(period->>'sequence')::smallint,(period->>'start_date')::date,(period->>'end_date')::date,
        (period->>'return_date')::date,(period->>'days')::integer,(period->>'hours')::numeric,period->>'counting_mode');
  end loop;
  for day in select value from jsonb_array_elements(target_days) loop
    select * into unit_row from private.eligible_day_units(r.context_bond_id,(day->>'date')::date) where id=(day->>'bond_unit_id')::uuid;
    if not found then raise exception 'RESPONSIBILITY_UNIT_INVALID'; end if;
    insert into public.request_day_responsibilities(request_id,responsibility_date,bond_unit_id,cnes_unit_id,lotacao_id,assigned_by)
      values(replacement.id,(day->>'date')::date,unit_row.id,unit_row.cnes_unit_id,unit_row.internal_lotacao_id,actor_id);
  end loop;
  insert into public.request_status_history(request_id,previous_status,new_status,actor_id,notes)
    values(r.id,r.status,'cancelada',actor_id,'Substituído por '||replacement.protocol||'. '||btrim(target_reason));
  insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_bond_id,previous_value,new_value,reason)
    values(actor_id,'administrador','request_replaced','vacation_request',r.id,r.context_bond_id,
      jsonb_build_object('request',to_jsonb(r),'reviews',reviews),jsonb_build_object('replacement_id',replacement.id,'protocol',replacement.protocol,'plan',plan),btrim(target_reason));
  select profile_id into owner_id from public.servidores where id=r.servidor_id;
  for scope in select cnes_unit_id,lotacao_id from public.request_unit_reviews where request_id in (r.id,replacement.id)
    group by cnes_unit_id,lotacao_id loop
    perform private.emit_unit_notification('replacement:'||replacement.id,scope.cnes_unit_id,scope.lotacao_id,
      'Solicitação reprogramada — nova análise necessária',r.protocol||' foi substituído por '||replacement.protocol||
      '. A confirmação anterior foi retirada; o novo pedido exige aprovação e inclusão no calendário. Motivo: '||btrim(target_reason),replacement.id,owner_id,r.context_bond_id);
  end loop;
  return jsonb_build_object('id',replacement.id,'protocol',replacement.protocol,'replaces_request_id',r.id);
end $$;
revoke all on function public.commit_request_revision(uuid,uuid,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.commit_request_revision(uuid,uuid,jsonb,jsonb,text,text) to service_role;

-- Uma versão de revisão antiga não deve reativar um pedido cancelado/substituído.
alter function public.manage_unit_request_review(uuid,uuid,text,text,integer,jsonb) rename to manage_unit_review_before_revision;
alter function public.manage_unit_review_before_revision(uuid,uuid,text,text,integer,jsonb) set schema private;
create function public.manage_unit_request_review(actor_id uuid,target_review_id uuid,target_action text,target_notes text default null,
  expected_version integer default null,target_rejection jsonb default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; request_id_value uuid; r public.vacation_requests%rowtype;
begin
  perform private.planning_lock();
  select request_id into request_id_value from public.request_unit_reviews where id=target_review_id;
  select * into r from public.vacation_requests where id=request_id_value for update;
  if r.status in ('cancelada','concluida','rejeitada') then raise exception 'REVIEW_TRANSITION_INVALID'; end if;
  result:=private.manage_unit_review_before_revision(actor_id,target_review_id,target_action,target_notes,expected_version,target_rejection);
  update public.vacation_requests set distribution_version=distribution_version+1 where id=request_id_value;
  return result;
end $$;
revoke all on function private.manage_unit_review_before_revision(uuid,uuid,text,text,integer,jsonb) from public,anon,authenticated;
grant execute on function private.manage_unit_review_before_revision(uuid,uuid,text,text,integer,jsonb) to service_role;
revoke all on function public.manage_unit_request_review(uuid,uuid,text,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.manage_unit_request_review(uuid,uuid,text,text,integer,jsonb) to service_role;
