-- Revisões preservam o documento anterior; reenvio não repete a alteração.
create table private.rh_leave_revisions (
 leave_id uuid not null references private.rh_leaves(id),
 version integer not null check(version>0),
 snapshot jsonb not null,
 plan jsonb not null,
 status text not null,
 changed_at timestamptz not null default now(),
 changed_by uuid not null references public.profiles(id),
 operator_name text not null,
 operator_declared boolean not null,
 reason text not null check(length(reason) between 3 and 500),
 primary key(leave_id,version)
);
create index rh_leave_revisions_actor on private.rh_leave_revisions(changed_by);
create table private.rh_leave_edit_requests (
 actor_id uuid not null references public.profiles(id),
 request_key uuid not null,
 leave_id uuid not null references private.rh_leaves(id),
 input_digest text not null,
 preview_digest text not null,
 result_version integer not null,
 created_at timestamptz not null default now(),
 primary key(actor_id,request_key)
);
create index rh_leave_edit_requests_leave on private.rh_leave_edit_requests(leave_id);
create index rh_leave_edit_requests_rate on private.rh_leave_edit_requests(actor_id,created_at);
alter table private.rh_leave_revisions enable row level security;
alter table private.rh_leave_edit_requests enable row level security;
revoke all on private.rh_leave_revisions,private.rh_leave_edit_requests from public,anon,authenticated;
grant select,insert on private.rh_leave_revisions,private.rh_leave_edit_requests to service_role;

create function public.rh_preview_leave_revision(target_profile uuid,target_session uuid,target_cnes uuid,target_leave uuid,
 expected_version integer,item jsonb) returns jsonb language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
declare actor jsonb;entry private.rh_leaves%rowtype;preview jsonb;
begin
 actor:=private.rh_leave_actor(target_profile,target_session,target_cnes);
 select * into entry from private.rh_leaves where id=target_leave and cnes_unit_id=(actor->'context'->>'cnes_unit_id')::uuid for share;
 if not found then raise exception 'RH_LEAVE_NOT_FOUND';end if;
 if expected_version is null or expected_version<>entry.version or entry.status<>'programada' then raise exception 'RH_VERSION_CONFLICT';end if;
 preview:=public.rh_preview_leave(target_profile,target_session,target_cnes,entry.entry_id,item);
 if (preview->'resources'->>'bond_id')::uuid<>entry.bond_id then raise exception 'RH_BINDING_IMMUTABLE';end if;
 preview:=(preview-'digest')||jsonb_build_object('leave_id',entry.id,'version',entry.version,'previous_plan',entry.plan);
 return preview||jsonb_build_object('digest',encode(extensions.digest(preview::text,'sha256'),'hex'));
end $$;

create function public.rh_revise_leave(target_profile uuid,target_session uuid,target_cnes uuid,target_leave uuid,
 expected_version integer,item jsonb,request_key uuid,expected_digest text,target_reason text) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
declare actor jsonb;entry private.rh_leaves%rowtype;previous private.rh_leave_edit_requests%rowtype;
 preview jsonb;resources jsonb;leave_plan jsonb;input_hash text;unit_id uuid;bound_bond uuid;
 right_row public.vacation_rights%rowtype;p jsonb;start_day date;end_day date;
begin
 actor:=private.rh_leave_actor(target_profile,target_session,target_cnes);unit_id:=(actor->'context'->>'cnes_unit_id')::uuid;
 if length(btrim(coalesce(target_reason,''))) not between 3 and 500 or expected_version is null or expected_version<1 then raise exception 'RH_LEAVE_INPUT_INVALID';end if;
 if request_key is null or expected_digest is null or expected_digest!~'^[a-f0-9]{64}$' then raise exception 'RH_LEAVE_PREVIEW_REQUIRED';end if;
 input_hash:=encode(extensions.digest(jsonb_build_object('leave',target_leave,'version',expected_version,'item',item,'reason',btrim(target_reason),'unit',unit_id)::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('rh-edit-key:'||target_profile::text||request_key::text,0));
 select * into previous from private.rh_leave_edit_requests x where x.actor_id=target_profile and x.request_key=rh_revise_leave.request_key;
 if found then
  if previous.input_digest<>input_hash or previous.preview_digest<>expected_digest then raise exception 'RH_LEAVE_IDEMPOTENCY_CONFLICT';end if;
  return jsonb_build_object('id',previous.leave_id,'version',previous.result_version,'replayed',true);
 end if;
 perform private.planning_lock();
 select * into entry from private.rh_leaves where id=target_leave and cnes_unit_id=unit_id for update;
 if not found then raise exception 'RH_LEAVE_NOT_FOUND';end if;
 if entry.version<>expected_version or entry.status<>'programada' then raise exception 'RH_VERSION_CONFLICT';end if;
 if (select count(*) from private.rh_leave_edit_requests where actor_id=target_profile and created_at>now()-interval '1 minute')>=20 then raise exception 'RH_LEAVE_RATE_LIMIT';end if;
 perform 1 from private.cnes_registry_entries where id=entry.entry_id for share;
 perform 1 from private.rh_registry_bonds where entry_id=entry.entry_id for share;
 bound_bond:=entry.bond_id;
 perform 1 from public.employment_bonds where id=bound_bond for share;
 perform 1 from public.servidores where id=(select servidor_id from public.employment_bonds where id=bound_bond) for share;
 perform 1 from public.employment_bond_units where bond_id=bound_bond and cnes_unit_id=unit_id for share;
 perform 1 from public.cnes_units where id=unit_id for share;
 preview:=public.rh_preview_leave_revision(target_profile,target_session,target_cnes,target_leave,expected_version,item);
 if preview->>'digest'<>expected_digest then raise exception 'RH_LEAVE_PREVIEW_CHANGED';end if;
 resources:=preview->'resources';leave_plan:=preview->'plan';
 if (leave_plan->>'can_save')::boolean is distinct from true then raise exception 'RH_LEAVE_HOURS_INSUFFICIENT';end if;
 -- O próprio registro é excluído das reservas/conflitos, sem apagar ou cancelar temporariamente.
 if nullif(item->>'rightId','') is not null then
  select * into right_row from public.vacation_rights where id=(item->>'rightId')::uuid and bond_id=bound_bond for update;
  if not found or right_row.type::text<>leave_plan->>'type'
   or (leave_plan->>'type'='regulamentar' and right_row.acquisition_end is distinct from nullif(leave_plan->>'acquisition_end','')::date) then raise exception 'RH_LEAVE_RIGHT_INVALID';end if;
  if right_row.version is distinct from (leave_plan->>'right_version')::integer then raise exception 'RH_LEAVE_PREVIEW_CHANGED';end if;
  if right_row.available_days < (leave_plan->>'vacation_days')::integer
   +coalesce((select sum((l.plan->>'vacation_days')::integer) from private.rh_leaves l where l.id<>entry.id and l.status<>'cancelada' and l.plan->>'right_id'=right_row.id::text),0)
   +coalesce((select sum(r.days) from public.vacation_requests v join public.request_periods r on r.request_id=v.id where v.right_id=right_row.id and v.status not in ('cancelada','rejeitada','rascunho','devolvida')),0) then raise exception 'RH_LEAVE_RIGHT_INVALID';end if;
 end if;
 for p in select value from jsonb_array_elements(leave_plan->'periods') loop
  start_day:=(p->>'start_date')::date;end_day:=(p->>'end_date')::date;
  if exists(select 1 from private.rh_leaves l cross join lateral jsonb_array_elements(l.plan->'periods') z where l.id<>entry.id and l.bond_id=bound_bond and l.status<>'cancelada'
    and (z->>'start_date')::date<=end_day and (z->>'end_date')::date>=start_day)
   or exists(select 1 from public.vacation_requests v join public.request_periods r on r.request_id=v.id where v.context_bond_id=bound_bond
    and v.status not in ('cancelada','rejeitada','rascunho','devolvida') and r.start_date<=end_day and r.end_date>=start_day) then raise exception 'RH_LEAVE_OVERLAP';end if;
 end loop;
 if leave_plan->>'type'='regulamentar' and (exists(select 1 from private.rh_leaves l where l.id<>entry.id and l.bond_id=bound_bond and l.status<>'cancelada'
   and l.plan->>'type'='regulamentar' and l.plan->>'acquisition_end'=leave_plan->>'acquisition_end')
  or exists(select 1 from public.vacation_requests where context_bond_id=bound_bond and type='regulamentar' and acquisition_end=(leave_plan->>'acquisition_end')::date
   and status not in ('cancelada','rejeitada','rascunho','devolvida'))) then raise exception 'RH_LEAVE_CYCLE_IN_USE';end if;
 insert into private.rh_leave_revisions(leave_id,version,snapshot,plan,status,changed_by,operator_name,operator_declared,reason)
 values(entry.id,entry.version,entry.snapshot,entry.plan,entry.status,target_profile,actor->'operator'->>'name',(actor->>'declared')::boolean,btrim(target_reason));
 update private.rh_leaves set snapshot=resources||jsonb_build_object('account_name',entry.snapshot->>'account_name'),plan=leave_plan,version=version+1 where id=entry.id;
 insert into private.rh_leave_edit_requests(actor_id,request_key,leave_id,input_digest,preview_digest,result_version)
 values(target_profile,request_key,entry.id,input_hash,expected_digest,entry.version+1);
 insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_bond_id,context_cnes_unit_id,reason,previous_value,new_value)
 values(target_profile,(actor->>'role')::public.app_role,'rh_leave_revised','rh_leave',entry.id,bound_bond,unit_id,btrim(target_reason),
  jsonb_build_object('version',entry.version,'periods',entry.plan->'periods','bank',entry.plan->'bank','type',entry.plan->>'type'),
  jsonb_build_object('version',entry.version+1,'periods',leave_plan->'periods','bank',leave_plan->'bank','type',leave_plan->>'type',
   'operator_name',actor->'operator'->>'name','operator_grant_id',actor->'operator'->>'id','declared_identity',actor->'declared'));
 return jsonb_build_object('id',entry.id,'version',entry.version+1,'replayed',false);
end $$;

-- Mantém contrato do detalhe e acrescenta consulta limitada das versões substituídas.
alter function public.rh_leave_detail(uuid,uuid,uuid,uuid) rename to rh_leave_detail_base;
create function public.rh_leave_detail(target_profile uuid,target_session uuid,target_cnes uuid,target_leave uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 result:=public.rh_leave_detail_base(target_profile,target_session,target_cnes,target_leave);
 return result||jsonb_build_object('revisions',coalesce((select jsonb_agg(to_jsonb(r) order by r.version desc) from (
  select version,snapshot,plan,status,changed_at,operator_name,operator_declared,reason from private.rh_leave_revisions where leave_id=target_leave order by version desc limit 20) r),'[]'),
  'revisions_has_more',exists(select 1 from private.rh_leave_revisions where leave_id=target_leave offset 20 limit 1));
end $$;

revoke all on function public.rh_preview_leave_revision(uuid,uuid,uuid,uuid,integer,jsonb),public.rh_revise_leave(uuid,uuid,uuid,uuid,integer,jsonb,uuid,text,text),public.rh_leave_detail(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.rh_preview_leave_revision(uuid,uuid,uuid,uuid,integer,jsonb),public.rh_revise_leave(uuid,uuid,uuid,uuid,integer,jsonb,uuid,text,text),public.rh_leave_detail(uuid,uuid,uuid,uuid) to service_role;
