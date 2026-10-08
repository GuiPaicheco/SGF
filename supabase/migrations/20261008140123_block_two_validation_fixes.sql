create or replace function public.get_bond_resources(actor_id uuid,target_bond uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if not public.bond_context_allowed(actor_id,target_bond,false) then raise exception 'BOND_SCOPE_REQUIRED' using errcode='42501'; end if;
  return jsonb_build_object('bond',(select to_jsonb(b) from public.employment_bonds b where id=target_bond),
    'units',coalesce((select jsonb_agg(to_jsonb(u)) from (select distinct c.id,c.code,c.name from public.employment_bond_units a join public.cnes_units c on c.id=a.cnes_unit_id where a.bond_id=target_bond and a.active) u),'[]'),
    'account',coalesce((select to_jsonb(a) from public.bond_time_bank_accounts a where bond_id=target_bond),jsonb_build_object('bond_id',target_bond,'validated_minutes',0,'declared_minutes',0,'version',0)),
    'rights',coalesce((select jsonb_agg(to_jsonb(r) order by acquisition_end desc) from public.vacation_rights r where bond_id=target_bond),'[]'),
    'entries',coalesce((select jsonb_agg(to_jsonb(e) order by created_at desc) from (select e.*,p.full_name author_name from public.bond_time_bank_entries e left join public.profiles p on p.id=e.created_by where bond_id=target_bond order by e.created_at desc limit 100) e),'[]'),
    'legacy_pending',exists(select 1 from public.employment_bonds b where b.id=target_bond and (
      exists(select 1 from public.time_bank_accounts a where a.servidor_id=b.servidor_id and (a.validated_minutes>0 or a.declared_minutes>0)
        and (not exists(select 1 from public.bond_time_bank_accounts x where x.bond_id=b.id) or (select count(*) from public.employment_bonds x where x.servidor_id=b.servidor_id)>1))
      or exists(select 1 from public.vacation_rights r where r.servidor_id=b.servidor_id and r.bond_id is null))));
end $$;
revoke all on function public.get_bond_resources(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_bond_resources(uuid,uuid) to service_role;

create or replace function public.save_bond_registry(actor_id uuid,target_bond uuid,item jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare previous public.employment_bonds%rowtype; pole uuid:=nullif(item->>'pole_cnes_unit_id','')::uuid;
begin
  if not public.bond_context_allowed(actor_id,target_bond,true) then raise exception 'BOND_SCOPE_REQUIRED' using errcode='42501'; end if;
  if item->>'reason' is null or char_length(btrim(item->>'reason')) not between 3 and 2000
    or nullif(btrim(item->>'employment_type'),'') is null then raise exception 'BOND_DATA_INVALID' using errcode='22023'; end if;
  select * into previous from public.employment_bonds where id=target_bond for update;
  if previous.version is distinct from (item->>'version')::integer then raise exception 'BOND_VERSION_CONFLICT' using errcode='40001'; end if;
  if pole is not null and not exists(select 1 from public.employment_bond_units where bond_id=target_bond and cnes_unit_id=pole and active)
    then raise exception 'POLE_OUT_OF_BOND' using errcode='22023'; end if;
  if nullif(item->>'weekly_hours','')::integer < (select coalesce(sum(weekly_hours),0) from public.employment_bond_units where bond_id=target_bond and active)
    then raise exception 'WEEKLY_HOURS_INVALID' using errcode='22023'; end if;
  update public.employment_bonds set admission_date=nullif(item->>'admission_date','')::date,employment_type=btrim(item->>'employment_type'),
    weekly_hours=nullif(item->>'weekly_hours','')::integer,cargo_id=nullif(item->>'cargo_id','')::uuid,funcao_id=nullif(item->>'funcao_id','')::uuid,
    pole_cnes_unit_id=pole,version=version+1,updated_at=now() where id=target_bond;
  insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_bond_id,reason,previous_value,new_value)
    values(actor_id,private.actor_role(actor_id),'bond_registry_saved','employment_bond',target_bond,target_bond,item->>'reason',to_jsonb(previous),item);
  return target_bond;
end $$;
revoke all on function public.save_bond_registry(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_bond_registry(uuid,uuid,jsonb) to service_role;
