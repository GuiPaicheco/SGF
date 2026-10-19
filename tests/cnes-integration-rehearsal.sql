reset role;
insert into private.cnes_import_runs(cnes_unit_id,digest,actor_id,collected_at,created_at,competence,added,changed,absent)
values('f6000000-0000-0000-0000-000000000100',repeat('1',64),'f6000000-0000-0000-0000-000000000001','2026-10-17 12:00Z','2026-10-17 12:00Z',null,2,0,0);
insert into private.cnes_registry_entries(id,cnes_unit_id,source_id,source_hash,source_data,created_at,updated_at)
select id,'f6000000-0000-0000-0000-000000000100',encode(sha256(convert_to(id::text,'UTF8')),'hex'),repeat(source,64),jsonb_build_object('fullName',name,'cns',cns,'occupation','CARGO TESTE','cbo','123456','weeklyHours',40,'relationshipType','ESTATUTARIO EFETIVO','status',status,'origin',origin,'teams','[]'::jsonb),'2026-10-17 12:00Z','2026-10-17 12:00Z'
from (values
 ('fb000000-0000-0000-0000-000000000001'::uuid,'a','INTEGRAÇÃO ZELIA','900000000000021','ativo','CNES'),
 ('fb000000-0000-0000-0000-000000000002'::uuid,'b','INTEGRAÇÃO ÁLVARO','900000000000022','ativo','CNES'),
 ('fb000000-0000-0000-0000-000000000003'::uuid,'c','EXCLUÍDO MANUAL','900000000000023','ativo','manual'),
 ('fb000000-0000-0000-0000-000000000004'::uuid,'d','EXCLUÍDO INATIVO','900000000000024','inativo','CNES'),
 ('fb000000-0000-0000-0000-000000000005'::uuid,'e','EXCLUÍDO ALTERADO','900000000000025','ativo','CNES')
) v(id,source,name,cns,status,origin);
update private.cnes_registry_entries set version=2 where id='fb000000-0000-0000-0000-000000000005';
create temp table preserved_history as select
 (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.vacation_requests x) requests,
 (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.request_periods x) periods,
 (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from private.rh_leaves x) leaves;
-- RUN_IMPORT_REPAIR
-- RUN_IMPORT_REPAIR
set local role service_role;
do $$
declare profile uuid;grant_id uuid;result jsonb;entry uuid;session uuid:='f6000000-0000-0000-0000-000000000200';
begin
 if (select count(*) from private.rh_registry_bonds where entry_id in('fb000000-0000-0000-0000-000000000001','fb000000-0000-0000-0000-000000000002'))<>2 then raise exception 'ADMIN_IMPORT_NOT_INTEGRATED';end if;
 if exists(select 1 from private.rh_registry_bonds where entry_id in('fb000000-0000-0000-0000-000000000003','fb000000-0000-0000-0000-000000000004','fb000000-0000-0000-0000-000000000005')) then raise exception 'UNCONFIRMED_CHANGE_OR_MANUAL_INTEGRATED';end if;
 if (select count(*) from public.audit_events where action='cnes_previous_import_integrated' and entity_id in('fb000000-0000-0000-0000-000000000001','fb000000-0000-0000-0000-000000000002'))<>2 then raise exception 'REPAIR_NOT_IDEMPOTENT';end if;
 select profile_id into profile from private.rh_unit_accounts where cnes_unit_id='f6000000-0000-0000-0000-000000000100';
 begin perform public.rh_launch_employees(profile,session,0,'');raise exception 'OPERATOR_BYPASSED';exception when others then if sqlerrm<>'RH_OPERATOR_REQUIRED' then raise;end if;end;
 result:=public.rh_grant_operator('f6000000-0000-0000-0000-000000000001','f6000000-0000-0000-0000-000000000100','f6000000-0000-0000-0000-000000000300',true,0);grant_id:=(result->>'id')::uuid;
 perform public.rh_select_operator(profile,session,grant_id);
 result:=public.rh_launch_employees(profile,session,0,'INTEGRAÇÃO');
 if (result->>'total')::integer<>2 or result->'employees'->0->>'full_name'<>'INTEGRAÇÃO ÁLVARO' then raise exception 'ALPHABETIC_ORDER_INVALID';end if;
 for entry in select (x->>'entry_id')::uuid from jsonb_array_elements(result->'employees') x loop
  perform public.rh_leave_resources(profile,session,null,entry);
 end loop;
 if (public.rh_launch_employees(profile,session,1,'INTEGRAÇÃO')->'employees')<>'[]'::jsonb then raise exception 'PAGINATION_FAILED';end if;
 if exists(select 1 from jsonb_array_elements(public.rh_launch_employees(profile,session,0,'INATIVO')->'employees')) then raise exception 'INACTIVE_INCLUDED';end if;
 if has_function_privilege('authenticated','public.rh_launch_employees(uuid,uuid,integer,text)','execute') or has_function_privilege('anon','public.rh_launch_employees(uuid,uuid,integer,text)','execute') then raise exception 'DIRECT_API_ALLOWED';end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from preserved_history where requests is distinct from (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.vacation_requests x)
 or periods is distinct from (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from public.request_periods x)
 or leaves is distinct from (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from private.rh_leaves x)) then raise exception 'HISTORY_CHANGED';end if;
end $$;
select 'CNES: integração anterior idempotente, lista alfabética RH, operador e histórico preservados' as result;
