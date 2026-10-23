-- Evolução aditiva: não apaga cadastros, credenciais, concessões ou histórico.
create table private.cnes_unit_sources (
 cnes_unit_id uuid primary key references public.cnes_units(id) on delete restrict,
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 collected_at timestamptz not null, updated_by uuid not null references public.profiles(id),
 digest text not null check(digest ~ '^[a-f0-9]{64}$')
);
create index cnes_unit_sources_actor_idx on private.cnes_unit_sources(updated_by);
alter table private.cnes_unit_sources enable row level security;
revoke all on private.cnes_unit_sources from public,anon,authenticated;
grant select,insert,update on private.cnes_unit_sources to service_role;
create table private.cnes_source_history (
 id bigint generated always as identity primary key,
 cnes_unit_id uuid not null references public.cnes_units(id),
 payload jsonb not null, collected_at timestamptz not null,
 actor_id uuid not null references public.profiles(id), digest text not null,
 unique(cnes_unit_id,digest)
);
create index cnes_source_history_actor_idx on private.cnes_source_history(actor_id);
alter table private.cnes_source_history enable row level security;
revoke all on private.cnes_source_history from public,anon,authenticated;
grant select,insert on private.cnes_source_history to service_role;
grant usage,select on sequence private.cnes_source_history_id_seq to service_role;

create function public.apply_cnes_api_update(actor_id uuid,target_cnes uuid,items jsonb,present_ids jsonb,collection_digest text,
 collected_at timestamptz,expected_revision bigint,source_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;e private.cnes_registry_entries%rowtype; code text; state_row private.cnes_registry_state%rowtype;
begin
 perform private.require_cnes_import_admin(actor_id);
 select u.code into code from public.cnes_units u where u.id=target_cnes and u.active;
 if collection_digest is null or collection_digest !~ '^[a-f0-9]{64}$' or collected_at is null or collected_at>now()+interval '5 minutes'
  or code is null or jsonb_typeof(source_payload) is distinct from 'object' or octet_length(source_payload::text)>3800000
  or source_payload->>'cnes' is distinct from code or source_payload->'estabelecimento'->>'cnes' is distinct from code
  or source_payload->'metadados'->>'completo_no_escopo_solicitado' is distinct from 'true'
  or jsonb_typeof(source_payload->'profissionais') is distinct from 'array'
  or jsonb_typeof(source_payload->'equipes') is distinct from 'array'
  or jsonb_typeof(present_ids) is distinct from 'array' then raise exception 'CNES_COLLECTION_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('cnes-registry:'||target_cnes::text,0));
 -- Ausentes são obrigatoriamente retidos: um cliente não pode convertê-los em exclusão.
 if exists(select 1 from private.cnes_registry_entries old where old.cnes_unit_id=target_cnes
  and not exists(select 1 from jsonb_array_elements(items) x where x->>'sourceId'=old.source_id)) then raise exception 'CNES_COLLECTION_INVALID';end if;
 if jsonb_typeof(items) is distinct from 'array' then raise exception 'CNES_COLLECTION_INVALID';end if;
 if jsonb_array_length(items)=0 then
  result:=public.cnes_import_status(actor_id,target_cnes,collection_digest);
  if result is not null then return result;end if;
  insert into private.cnes_registry_state(cnes_unit_id) values(target_cnes) on conflict do nothing;
  select * into state_row from private.cnes_registry_state where cnes_unit_id=target_cnes for update;
  if expected_revision is distinct from state_row.revision then raise exception 'CNES_VERSION_CONFLICT';end if;
  if state_row.last_collected_at is not null and collected_at<state_row.last_collected_at then raise exception 'CNES_STALE_COLLECTION';end if;
  insert into private.cnes_import_runs(cnes_unit_id,digest,actor_id,collected_at,added,changed,absent) values(target_cnes,collection_digest,actor_id,collected_at,0,0,0);
  update private.cnes_registry_state set revision=revision+1,last_collected_at=collected_at where cnes_unit_id=target_cnes;
  result:=jsonb_build_object('status','applied');
 else
  result:=public.apply_cnes_registry_import(actor_id,target_cnes,items,collection_digest,collected_at,null,expected_revision);
 end if;
 if result->>'status'='already_applied' then return result;end if;
 for e in select * from private.cnes_registry_entries where cnes_unit_id=target_cnes
  and source_id in(select jsonb_array_elements_text(present_ids)) loop
  if coalesce((e.local_data->>'archived')::boolean,false) then raise exception 'CNES_ENTRY_ARCHIVED';end if;
  if not exists(select 1 from private.rh_registry_bonds m where m.entry_id=e.id and m.entry_version=e.version)
  then perform private.integrate_cnes_entry(actor_id,e.id);end if;
 end loop;
 insert into private.cnes_source_history(cnes_unit_id,payload,collected_at,actor_id,digest)
 values(target_cnes,source_payload,collected_at,actor_id,collection_digest) on conflict(cnes_unit_id,digest) do nothing;
 insert into private.cnes_unit_sources values(target_cnes,source_payload,collected_at,actor_id,collection_digest)
 on conflict(cnes_unit_id) do update set payload=excluded.payload,collected_at=excluded.collected_at,updated_by=excluded.updated_by,digest=excluded.digest;
 update public.cnes_units set name=btrim(source_payload->'estabelecimento'->>'nome'),updated_at=now()
 where id=target_cnes and length(btrim(source_payload->'estabelecimento'->>'nome')) between 1 and 240
 and name is distinct from btrim(source_payload->'estabelecimento'->>'nome');
 insert into public.audit_events(actor_id,actor_role,action,entity_type,context_cnes_unit_id,new_value)
 values(actor_id,'administrador','cnes_api_updated','cnes_registry',target_cnes,jsonb_build_object('digest',collection_digest,'missing_preserved',true));
 return result;
end $$;

create function public.view_cnes_source(actor_id uuid,target_cnes uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 perform private.require_cnes_import_admin(actor_id);
 return jsonb_build_object('source',(select jsonb_build_object('payload',s.payload,'collected_at',s.collected_at) from private.cnes_unit_sources s where s.cnes_unit_id=target_cnes),
 'dayoffs',coalesce((select jsonb_agg(jsonb_build_object('entry_id',e.id,'name',e.source_data->>'fullName','birthday_month',d.birthday_month,'birthday_day',d.birthday_day))
 from private.cnes_registry_entries e join private.rh_registry_bonds b on b.entry_id=e.id
 join private.rh_employee_birthdays d on d.bond_id=b.bond_id where e.cnes_unit_id=target_cnes),'[]'),
 'occurrences',coalesce((select jsonb_agg(jsonb_build_object('name',l.snapshot->>'full_name','type',l.plan->>'type','periods',l.plan->'periods','status',l.status))
 from private.rh_leaves l where l.cnes_unit_id=target_cnes and l.plan->>'type' in ('dayoff','folga')),'[]'));
end $$;

create function public.archive_cnes_employee(actor_id uuid,target_entry uuid,expected_version integer,target_reason text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e private.cnes_registry_entries%rowtype;
begin
 perform private.require_cnes_import_admin(actor_id);
 if length(btrim(target_reason)) not between 3 and 500 then raise exception 'CNES_LOCAL_DATA_INVALID';end if;
 select * into e from private.cnes_registry_entries where id=target_entry for update;
 if not found then raise exception 'CNES_ENTRY_NOT_FOUND';end if;
 if expected_version is distinct from e.version then raise exception 'CNES_VERSION_CONFLICT';end if;
 update private.cnes_registry_entries set local_data=local_data||jsonb_build_object('archived',true),
 source_data=jsonb_set(source_data,'{status}','"inativo"'),version=version+1,updated_at=now() where id=e.id;
 update private.rh_operator_grants set active=false,version=version+1,updated_at=now() where entry_id=e.id and active;
 insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_cnes_unit_id,reason,previous_value,new_value)
 values(actor_id,'administrador','cnes_employee_archived','cnes_registry',e.id,e.cnes_unit_id,btrim(target_reason),e.source_data,jsonb_build_object('archived',true,'source_status_before',e.source_data->>'status'));
 return jsonb_build_object('archived',true,'history_preserved',true);
end $$;

create function public.rh_create_occurrence(target_profile uuid,target_session uuid,target_entry uuid,request_key uuid,
 occurrence_type text,start_day date,end_day date,reference text,notes text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor jsonb;resources jsonb;previous private.rh_leaves%rowtype; input_hash text;new_leave_id uuid;plan jsonb;
begin
 actor:=private.rh_leave_actor(target_profile,target_session,null);
 if actor->>'role'<>'rh' then raise exception 'RH_NOT_ALLOWED';end if;
 if occurrence_type not in ('dayoff','folga') or occurrence_type is null or start_day is null or end_day is null
 or start_day<date '1900-01-01' or end_day>date '2100-12-31' or end_day<start_day or end_day-start_day>92
 or (occurrence_type='dayoff' and start_day<>end_day) or request_key is null
 or length(btrim(coalesce(reference,''))) not between 3 and 300 or length(coalesce(notes,''))>1000 then raise exception 'RH_INPUT_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('rh-occurrence-request:'||target_profile::text||':'||request_key::text,0));
 perform private.planning_lock();
 perform 1 from private.cnes_registry_entries where id=target_entry for share;
 resources:=public.rh_leave_resources(target_profile,target_session,null,target_entry);
 perform pg_advisory_xact_lock(hashtextextended('rh-leave-bond:'||(resources->>'bond_id'),0));
 input_hash:=encode(sha256(convert_to(jsonb_build_array(target_entry,occurrence_type,start_day,end_day,reference,notes)::text,'UTF8')),'hex');
 select * into previous from private.rh_leaves l where l.created_by=target_profile and l.request_key=rh_create_occurrence.request_key;
 if found then
 if previous.input_digest<>input_hash then raise exception 'RH_LEAVE_IDEMPOTENCY_CONFLICT';end if;
 return jsonb_build_object('id',previous.id,'version',previous.version,'already_applied',true);end if;
 if (select count(*) from private.rh_leaves l where l.created_by=target_profile and l.created_at>now()-interval '1 minute')>=30 then raise exception 'RH_LEAVE_RATE_LIMIT';end if;
 -- Mesmo controle de concorrência dos lançamentos de férias, sem saldo de horas inventado.
 perform 1 from public.employment_bonds where id=(resources->>'bond_id')::uuid for update;
 if exists(select 1 from private.rh_leaves l cross join lateral jsonb_array_elements(l.plan->'periods') p
 where l.bond_id=(resources->>'bond_id')::uuid and l.status<>'cancelada'
 and (p->>'start_date')::date<=end_day and (p->>'end_date')::date>=start_day) then raise exception 'RH_LEAVE_OVERLAP';end if;
 if exists(select 1 from public.vacation_requests r join public.request_periods p on p.request_id=r.id
 where r.context_bond_id=(resources->>'bond_id')::uuid and r.status not in ('cancelada','rejeitada','rascunho','devolvida')
 and p.start_date<=end_day and p.end_date>=start_day) then raise exception 'RH_LEAVE_OVERLAP';end if;
 plan:=jsonb_build_object('type',occurrence_type,'counting_mode','corridos','days',end_day-start_day+1,'notes',coalesce(notes,''),
 'recognition_reference',btrim(reference),'automatic_entitlement',false,'bank',jsonb_build_object('required_minutes',0),
 'periods',jsonb_build_array(jsonb_build_object('sequence',1,'start_date',start_day,'end_date',end_day,'return_date',null,'days',end_day-start_day+1,'counting_mode','corridos')));
 insert into private.rh_leaves(cnes_unit_id,entry_id,bond_id,created_by,operator_grant_id,operator_name,operator_declared,
 request_key,input_digest,preview_digest,snapshot,plan)
 values((actor->'context'->>'cnes_unit_id')::uuid,target_entry,(resources->>'bond_id')::uuid,target_profile,
 (actor->'operator'->>'id')::uuid,actor->'operator'->>'name',true,request_key,input_hash,input_hash,resources,plan) returning rh_leaves.id into new_leave_id;
 insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_bond_id,context_cnes_unit_id,reason,new_value)
 values(target_profile,'rh','rh_occurrence_created','rh_leave',new_leave_id,(resources->>'bond_id')::uuid,(actor->'context'->>'cnes_unit_id')::uuid,btrim(reference),
 jsonb_build_object('operator_name',actor->'operator'->>'name','operator_grant_id',actor->'operator'->>'id','declared_identity',true,'type',occurrence_type,'periods',plan->'periods'));
 return jsonb_build_object('id',new_leave_id,'version',1);
end $$;

revoke all on function public.apply_cnes_api_update(uuid,uuid,jsonb,jsonb,text,timestamptz,bigint,jsonb),
 public.view_cnes_source(uuid,uuid),public.archive_cnes_employee(uuid,uuid,integer,text),
 public.rh_create_occurrence(uuid,uuid,uuid,uuid,text,date,date,text,text) from public,anon,authenticated;
grant execute on function public.apply_cnes_api_update(uuid,uuid,jsonb,jsonb,text,timestamptz,bigint,jsonb),
 public.view_cnes_source(uuid,uuid),public.archive_cnes_employee(uuid,uuid,integer,text),
 public.rh_create_occurrence(uuid,uuid,uuid,uuid,text,date,date,text,text) to service_role;
