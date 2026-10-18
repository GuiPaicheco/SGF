-- Alternativa administrativa identificada; não simula identidade/competência CNES.
create function public.create_manual_registry_entry(actor_id uuid,target_cnes uuid,request_id uuid,
  target_cbo text,local_values jsonb,target_reason text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare entry private.cnes_registry_entries%rowtype; source_key text; content_hash text; canonical_registration text;
begin
  perform private.require_cnes_import_admin(actor_id);
  if not exists(select 1 from public.cnes_units where id=target_cnes and active) then raise exception 'CNES_UNIT_INVALID';end if;
  if request_id is null or target_cbo is null or target_cbo !~ '^[0-9]{6}$'
    or target_reason is null or length(btrim(target_reason)) not between 3 and 500
    or jsonb_typeof(local_values) is distinct from 'object' or octet_length(local_values::text)>4000 then
    raise exception 'CNES_LOCAL_DATA_INVALID';end if;
  if exists(select 1 from jsonb_object_keys(local_values) k where k not in
    ('fullName','registration','municipalPosition','weeklyHours','teamLabel','admissionDate','employmentType'))
    or length(btrim(coalesce(local_values->>'fullName',''))) not between 1 and 180
    or length(btrim(coalesce(local_values->>'registration',''))) not between 1 and 60
    or exists(select 1 from jsonb_each_text(local_values) v where length(v.value)>180)
    then raise exception 'CNES_LOCAL_DATA_INVALID';end if;
  if local_values ? 'weeklyHours' and (jsonb_typeof(local_values->'weeklyHours')<>'number'
    or (local_values->>'weeklyHours')::numeric not between 0 and 168) then raise exception 'CNES_LOCAL_DATA_INVALID';end if;
  if local_values ? 'admissionDate' and (local_values->>'admissionDate')::date>current_date then raise exception 'CNES_LOCAL_DATA_INVALID';end if;
  canonical_registration:=upper(btrim(local_values->>'registration'));
  local_values:=jsonb_set(local_values,'{registration}',to_jsonb(canonical_registration));
  source_key:=encode(sha256(convert_to('manual:'||request_id::text,'UTF8')),'hex');
  content_hash:=encode(sha256(convert_to(jsonb_build_object('cbo',target_cbo,'values',local_values,'reason',btrim(target_reason))::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('cnes-registry:'||target_cnes::text,0));
  select * into entry from private.cnes_registry_entries where cnes_unit_id=target_cnes and source_id=source_key;
  if found then
    if entry.source_hash<>content_hash then raise exception 'CNES_VERSION_CONFLICT';end if;
    return jsonb_build_object('id',entry.id,'status','already_created');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cnes-registration:'||canonical_registration,0));
  if exists(select 1 from private.cnes_registry_entries e where upper(e.local_data->>'registration')=canonical_registration)
    or exists(select 1 from public.employment_bonds b where upper(b.registration)=canonical_registration)
    or exists(select 1 from public.servidores s where upper(s.matricula)=canonical_registration)
    then raise exception 'CNES_MANUAL_DUPLICATE';end if;
  if (select count(*) from private.cnes_registry_entries where cnes_unit_id=target_cnes)>=5000 then raise exception 'CNES_REGISTRY_LIMIT';end if;
  insert into private.cnes_registry_entries(cnes_unit_id,source_id,source_hash,source_data,local_data)
    values(target_cnes,source_key,content_hash,jsonb_build_object('origin','manual','fullName',local_values->>'fullName',
      'cbo',target_cbo,'status','ativo','teams','[]'::jsonb),local_values) returning * into entry;
  insert into private.cnes_registry_state(cnes_unit_id,revision) values(target_cnes,1)
    on conflict(cnes_unit_id) do update set revision=cnes_registry_state.revision+1;
  insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_cnes_unit_id,reason,new_value)
    values(actor_id,'administrador','manual_registry_created','cnes_registry',entry.id,target_cnes,btrim(target_reason),
      jsonb_build_object('origin','manual','registration',canonical_registration));
  return jsonb_build_object('id',entry.id,'status','created');
end $$;
revoke all on function public.create_manual_registry_entry(uuid,uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.create_manual_registry_entry(uuid,uuid,uuid,text,jsonb,text) to service_role;
