-- Evita colisão entre variável PL/pgSQL e coluna do histórico de férias.
create or replace function public.rh_preview_leave(target_profile uuid,target_session uuid,target_cnes uuid,target_entry uuid,item jsonb) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='8s' as $$
declare resources jsonb;leave_plan jsonb;actor jsonb;result jsonb;selected_right jsonb;known_limit integer;scheduled integer;legacy_days integer;editing_id uuid:=nullif(item->>'_revisionLeave','')::uuid;
begin
 actor:=private.rh_leave_actor(target_profile,target_session,target_cnes);
 resources:=public.rh_leave_resources(target_profile,target_session,target_cnes,target_entry);
 leave_plan:=private.rh_make_leave_plan(resources,item);
 if leave_plan->>'type'='premio' then
  select coalesce(sum((l.plan->>'vacation_days')::integer),0) into scheduled from private.rh_leaves l
   where l.bond_id=(resources->>'bond_id')::uuid and l.status<>'cancelada' and l.plan->>'type'='premio'
    and l.plan->>'acquisition_end'=leave_plan->>'acquisition_end' and l.id is distinct from editing_id;
  select coalesce(sum(p.days),0) into legacy_days from public.vacation_requests v join public.request_periods p on p.request_id=v.id
   where v.context_bond_id=(resources->>'bond_id')::uuid and v.type='premio' and v.acquisition_end=(leave_plan->>'acquisition_end')::date
    and v.status not in ('cancelada','rejeitada','rascunho','devolvida');
  if scheduled+legacy_days+(leave_plan->>'vacation_days')::integer+coalesce((item->>'historicalUsedDays')::integer,0)>90 then raise exception 'RH_LEAVE_RIGHT_INVALID';end if;
 end if;
 -- Um direito já cadastrado não pode ser ignorado omitindo o seu ID na requisição.
 select min((v->>'available_days')::integer) into known_limit from jsonb_array_elements(resources->'rights') v
  where v->>'type'=leave_plan->>'type' and v->>'acquisition_end'=leave_plan->>'acquisition_end';
 if known_limit is not null then
  select coalesce(sum((l.plan->>'vacation_days')::integer),0) into scheduled from private.rh_leaves l
   where l.bond_id=(resources->>'bond_id')::uuid and l.status<>'cancelada' and l.plan->>'type'=leave_plan->>'type'
    and l.plan->>'acquisition_end'=leave_plan->>'acquisition_end' and l.id is distinct from editing_id;
  select coalesce(sum(p.days),0) into legacy_days from public.vacation_requests v join public.request_periods p on p.request_id=v.id
   where v.context_bond_id=(resources->>'bond_id')::uuid and v.type::text=leave_plan->>'type' and v.acquisition_end=(leave_plan->>'acquisition_end')::date
    and v.status not in ('cancelada','rejeitada','rascunho','devolvida');
  if scheduled+legacy_days+(leave_plan->>'vacation_days')::integer>known_limit then raise exception 'RH_LEAVE_RIGHT_INVALID';end if;
 end if;
 if nullif(item->>'rightId','') is not null then
  select value into selected_right from jsonb_array_elements(resources->'rights') where value->>'id'=item->>'rightId';
  if selected_right is null or selected_right->>'type'<>leave_plan->>'type' or selected_right->>'acquisition_end'<>leave_plan->>'acquisition_end'
   or (selected_right->>'available_days')::integer<(leave_plan->>'vacation_days')::integer then raise exception 'RH_LEAVE_RIGHT_INVALID';end if;
  leave_plan:=leave_plan||jsonb_build_object('right_id',selected_right->>'id','right_version',selected_right->'version');
 end if;
 result:=jsonb_build_object('resources',resources-'rights','plan',leave_plan,'actor',actor,'entry_id',target_entry);
 return result||jsonb_build_object('digest',encode(extensions.digest(result::text,'sha256'),'hex'));
end $$;
