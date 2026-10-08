create or replace function public.save_organization_registry(actor_id uuid, registry_kind text, item jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  result_id uuid := nullif(item->>'id','')::uuid;
  previous jsonb; parent uuid := nullif(item->>'parent_id','')::uuid;
  cnes uuid := nullif(item->>'cnes_unit_id','')::uuid;
  reason text := btrim(item->>'reason'); internal boolean := coalesce((item->>'is_internal_allocation')::boolean,false);
  responsible uuid[]; current_version integer;
begin
  if private.actor_role(actor_id) is distinct from 'administrador' then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sgf:organization-registry',0));
  if reason is null or char_length(reason) not between 3 and 2000 then raise exception 'REASON_REQUIRED' using errcode='22023'; end if;
  if nullif(btrim(item->>'name'),'') is null then raise exception 'NAME_REQUIRED' using errcode='22023'; end if;
  if registry_kind='location' then
    select to_jsonb(l),l.version into previous,current_version from public.lotacoes l where id=result_id for update;
    if result_id is not null and (previous is null or current_version is distinct from (item->>'version')::integer) then raise exception 'REGISTRY_VERSION_CONFLICT' using errcode='40001'; end if;
    if cnes is null or not exists(select 1 from public.cnes_units where id=cnes and active) then raise exception 'CNES_REQUIRED' using errcode='22023'; end if;
    if internal and (parent is null or not exists(select 1 from public.lotacoes where id=parent and unit_type='secretaria' and active)) then raise exception 'INTERNAL_ALLOCATION_REQUIRES_SECRETARIAT' using errcode='22023'; end if;
    if parent is not null and not exists(select 1 from public.lotacoes where id=parent and active) then raise exception 'PARENT_NOT_FOUND' using errcode='22023'; end if;
    if result_id is not null and (select count(*) from public.lotacao_cnes_units where lotacao_id=result_id)>1 then raise exception 'ALLOCATION_IN_USE' using errcode='22023'; end if;
    if parent=result_id or exists(with recursive ancestors as (
      select id,parent_id from public.lotacoes where id=parent
      union select l.id,l.parent_id from public.lotacoes l join ancestors a on l.id=a.parent_id
    ) select 1 from ancestors where id=result_id) then raise exception 'PARENT_CYCLE' using errcode='22023'; end if;
    -- Não invalidar atuações já cadastradas ao trocar o CNES ou o tipo de lotação.
    if result_id is not null and exists(select 1 from public.employment_bond_units u where u.internal_lotacao_id=result_id
      and (not internal or u.cnes_unit_id<>cnes)) then raise exception 'ALLOCATION_IN_USE' using errcode='22023'; end if;
    if result_id is not null and exists(select 1 from public.lotacoes l where l.parent_id=result_id and l.is_internal_allocation)
       and item->>'unit_type'<>'secretaria' then raise exception 'SECRETARIAT_IN_USE' using errcode='22023'; end if;
    if previous is not null and not coalesce((previous->>'is_internal_allocation')::boolean,false)
      and (internal or exists(select 1 from public.lotacao_cnes_units m where m.lotacao_id=result_id and m.cnes_unit_id<>cnes))
      and exists(select 1 from public.employment_bond_units u join public.lotacao_cnes_units m on m.cnes_unit_id=u.cnes_unit_id
        where m.lotacao_id=result_id and u.internal_lotacao_id is null)
      then raise exception 'ALLOCATION_IN_USE' using errcode='22023'; end if;
    if previous is not null then previous=previous||jsonb_build_object(
      'cnes_mappings',coalesce((select jsonb_agg(to_jsonb(m)) from public.lotacao_cnes_units m where lotacao_id=result_id),'[]'),
      'responsible_ids',coalesce((select jsonb_agg(profile_id) from public.profile_scopes where lotacao_id=result_id),'[]')); end if;
    select coalesce(array_agg(distinct value::uuid),'{}') into responsible from jsonb_array_elements_text(coalesce(item->'responsible_ids','[]'));
    if exists(select 1 from unnest(responsible) r where not exists(select 1 from public.profiles p where p.id=r
      and p.disabled_at is null and p.roles && array['rh','diretor']::public.app_role[])) then raise exception 'INVALID_RESPONSIBLE' using errcode='22023'; end if;
    if result_id is null then
      insert into public.lotacoes(name,code,unit_type,parent_id,active,is_internal_allocation)
      select btrim(item->>'name'),case when internal then null else u.code end,(item->>'unit_type')::public.unit_type,parent,coalesce((item->>'active')::boolean,true),internal
      from public.cnes_units u where u.id=cnes returning id into result_id;
    else
      update public.lotacoes set name=btrim(item->>'name'),code=case when internal then null else (select code from public.cnes_units where id=cnes) end,
        unit_type=(item->>'unit_type')::public.unit_type,parent_id=parent,active=coalesce((item->>'active')::boolean,true),
        is_internal_allocation=internal,version=version+1 where id=result_id;
    end if;
    delete from public.lotacao_cnes_units where lotacao_id=result_id;
    insert into public.lotacao_cnes_units(lotacao_id,cnes_unit_id) values(result_id,cnes);
    delete from public.profile_scopes where lotacao_id=result_id;
    insert into public.profile_scopes(profile_id,lotacao_id) select r,result_id from unnest(responsible) r;
  elsif registry_kind='cnes' then
    select to_jsonb(u),u.version into previous,current_version from public.cnes_units u where id=result_id for update;
    if result_id is not null and (previous is null or current_version is distinct from (item->>'version')::integer) then raise exception 'REGISTRY_VERSION_CONFLICT' using errcode='40001'; end if;
    if item->>'code' !~ '^\d{7}$' or item->>'code' is null then raise exception 'CNES_INVALID' using errcode='22023'; end if;
    if result_id is null then insert into public.cnes_units(code,name,active) values(item->>'code',btrim(item->>'name'),coalesce((item->>'active')::boolean,true)) returning id into result_id;
    else
      if previous->>'code'<>item->>'code' then raise exception 'CNES_CODE_IMMUTABLE' using errcode='22023'; end if;
      update public.cnes_units set name=btrim(item->>'name'),active=coalesce((item->>'active')::boolean,true),version=version+1,updated_at=now() where id=result_id;
    end if;
  elsif registry_kind='team' then
    select to_jsonb(t),t.version into previous,current_version from public.teams t where id=result_id for update;
    if result_id is not null and (previous is null or current_version is distinct from (item->>'version')::integer) then raise exception 'REGISTRY_VERSION_CONFLICT' using errcode='40001'; end if;
    if not exists(select 1 from public.cnes_units where id=cnes and active) then raise exception 'CNES_REQUIRED' using errcode='22023'; end if;
    if not exists(select 1 from public.team_types where code=item->>'type_code' and active and code<>'nao_se_aplica') then raise exception 'TEAM_TYPE_INVALID' using errcode='22023'; end if;
    if exists(select 1 from public.teams where cnes_unit_id=cnes and type_code=item->>'type_code' and team_number=(item->>'team_number')::smallint and id is distinct from result_id) then raise exception 'TEAM_DUPLICATED' using errcode='23505'; end if;
    if nullif(item->>'ine_code','') is not null and (item->>'ine_code' !~ '^\d{6,10}$'
      or ((previous->>'ine_code') is distinct from (item->>'ine_code') and nullif(btrim(item->>'source_reference'),'') is null)) then raise exception 'INE_SOURCE_REQUIRED' using errcode='22023'; end if;
    if result_id is not null and previous->>'cnes_unit_id'<>cnes::text and exists(select 1 from public.employment_bond_teams where team_id=result_id) then raise exception 'TEAM_IN_USE' using errcode='22023'; end if;
    if result_id is null then
      insert into public.teams(cnes_unit_id,type_code,team_number,ine_code,name,needs_review,active,source_reference)
      values(cnes,item->>'type_code',(item->>'team_number')::smallint,nullif(item->>'ine_code',''),btrim(item->>'name'),nullif(item->>'ine_code','') is null,coalesce((item->>'active')::boolean,true),nullif(btrim(item->>'source_reference'),'')) returning id into result_id;
    else update public.teams set cnes_unit_id=cnes,type_code=item->>'type_code',team_number=(item->>'team_number')::smallint,
      ine_code=nullif(item->>'ine_code',''),name=btrim(item->>'name'),needs_review=nullif(item->>'ine_code','') is null,
      active=coalesce((item->>'active')::boolean,true),source_reference=case when previous->>'ine_code' is not distinct from nullif(item->>'ine_code','') then coalesce(nullif(btrim(item->>'source_reference'),''),previous->>'source_reference') else nullif(btrim(item->>'source_reference'),'') end,version=version+1,updated_at=now() where id=result_id; end if;
  else raise exception 'REGISTRY_KIND_INVALID' using errcode='22023'; end if;
  insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,reason,previous_value,new_value)
  values(actor_id,'administrador','organization_registry_saved',registry_kind,result_id,reason,previous,item);
  return result_id;
end $$;
revoke all on function public.save_organization_registry(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_organization_registry(uuid,text,jsonb) to service_role;
