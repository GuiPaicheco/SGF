-- Preserva CBOs legados publicados no CNES (ex.: 2231F9, médico residente).
-- Somente a validação do código muda; autorização, locks e retenção permanecem iguais.
CREATE OR REPLACE FUNCTION public.apply_cnes_registry_import(actor_id uuid, target_cnes uuid, items jsonb, collection_digest text, collected_at timestamp with time zone, competence text, expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare state_row private.cnes_registry_state%rowtype; item jsonb; existing_id uuid;
  added_count integer:=0;changed_count integer:=0;absent_count integer;run_id uuid;affected integer;
begin
  perform private.require_cnes_import_admin(actor_id);
  if not exists(select 1 from public.cnes_units where id=target_cnes and active) then raise exception 'CNES_UNIT_INVALID';end if;
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 5000
    or octet_length(items::text)>4000000 or collection_digest !~ '^[a-f0-9]{64}$' or collection_digest is null
    or expected_revision is null or expected_revision<0 or collected_at is null or collected_at>now()+interval '5 minutes'
    or (competence is not null and competence !~ '^[0-9]{4}(0[1-9]|1[0-2])$') then raise exception 'CNES_COLLECTION_INVALID';end if;
  if exists(select 1 from jsonb_array_elements(items) row_item where jsonb_typeof(row_item) is distinct from 'object'
    or coalesce(row_item->>'sourceId','') !~ '^[a-f0-9]{64}$' or coalesce(row_item->>'sourceHash','') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(row_item->'sourceData') is distinct from 'object'
    or coalesce(row_item->'sourceData'->>'cns','') !~ '^[0-9]{15}$'
    or coalesce(row_item->'sourceData'->>'cbo','') !~ '^[0-9]{4}[0-9A-Z]{2}$'
    or length(coalesce(row_item->'sourceData'->>'fullName','')) not between 1 and 180)
    or (select count(distinct row_item->>'sourceId') from jsonb_array_elements(items) row_item)<>jsonb_array_length(items)
    then raise exception 'CNES_COLLECTION_INVALID';end if;
  -- Mesmo lock para importação e conferência: resposta antiga nunca sobrescreve edição nova.
  perform pg_advisory_xact_lock(hashtextextended('cnes-registry:'||target_cnes::text,0));
  select id into run_id from private.cnes_import_runs where cnes_unit_id=target_cnes and digest=collection_digest;
  if found then return jsonb_build_object('status','already_applied','run_id',run_id);end if;
  insert into private.cnes_registry_state(cnes_unit_id) values(target_cnes) on conflict do nothing;
  select * into state_row from private.cnes_registry_state where cnes_unit_id=target_cnes for update;
  if state_row.revision<>expected_revision then raise exception 'CNES_VERSION_CONFLICT';end if;
  if state_row.last_collected_at is not null and collected_at<state_row.last_collected_at then raise exception 'CNES_STALE_COLLECTION';end if;
  select count(*) into absent_count from private.cnes_registry_entries e where e.cnes_unit_id=target_cnes
    and not exists(select 1 from jsonb_array_elements(items) row_item where row_item->>'sourceId'=e.source_id);
  if (select count(*) from private.cnes_registry_entries where cnes_unit_id=target_cnes)
    +(select count(*) from jsonb_array_elements(items) row_item where not exists(select 1 from private.cnes_registry_entries e
      where e.cnes_unit_id=target_cnes and e.source_id=row_item->>'sourceId'))>5000 then raise exception 'CNES_REGISTRY_LIMIT';end if;
  for item in select value from jsonb_array_elements(items) loop
    insert into private.cnes_registry_entries(cnes_unit_id,source_id,source_hash,source_data)
      values(target_cnes,item->>'sourceId',item->>'sourceHash',item->'sourceData')
      on conflict(cnes_unit_id,source_id) do nothing returning id into existing_id;
    if found then added_count:=added_count+1;
    else
      update private.cnes_registry_entries set source_hash=item->>'sourceHash',source_data=item->'sourceData',
        review_status='pending',version=version+1,updated_at=now()
        where cnes_unit_id=target_cnes and source_id=item->>'sourceId' and source_hash<>item->>'sourceHash';
      get diagnostics affected=row_count;changed_count:=changed_count+affected;
    end if;
  end loop;
  -- Nenhuma exclusão/desativação automática; local_data e servidor_id nunca são sobrescritos.
  update private.cnes_registry_state set revision=revision+1,last_collected_at=collected_at where cnes_unit_id=target_cnes;
  insert into private.cnes_import_runs(cnes_unit_id,digest,actor_id,collected_at,competence,added,changed,absent)
    values(target_cnes,collection_digest,actor_id,collected_at,competence,added_count,changed_count,absent_count) returning id into run_id;
  return jsonb_build_object('status','applied','run_id',run_id,'added',added_count,'changed',changed_count,
    'absent_preserved',absent_count,'revision',state_row.revision+1);
end $function$
;
