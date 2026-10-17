-- Exclusivamente BEGIN/ROLLBACK: nenhum usuário fictício persiste.
insert into auth.users(id,email,aud,role) values('f6000000-0000-0000-0000-000000000001','rh-admin-fixture@example.invalid','authenticated','authenticated');
insert into public.profiles(id,full_name,role,roles,must_change_password) values('f6000000-0000-0000-0000-000000000001','RH ADMIN TESTE','administrador',array['administrador']::public.app_role[],false);
insert into public.cnes_units(id,code,name) values('f6000000-0000-0000-0000-000000000100','9999994','RH UNIDADE TESTE');
insert into public.lotacoes(id,code,name,is_internal_allocation) values('f6000000-0000-0000-0000-000000000101','9999994','RH LOTAÇÃO TESTE',false);
insert into public.lotacao_cnes_units(lotacao_id,cnes_unit_id) values('f6000000-0000-0000-0000-000000000101','f6000000-0000-0000-0000-000000000100');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('request.headers','{"x-sgf-role":"administrador","x-sgf-actor":"f6000000-0000-0000-0000-000000000001"}',true);
set local role service_role;
select public.prepare_rh_unit('f6000000-0000-0000-0000-000000000001','f6000000-0000-0000-0000-000000000100','RH TESTE');
reset role;
insert into auth.users(id,email,aud,role,raw_app_meta_data)
select auth_user_id,internal_email,'authenticated','authenticated','{"sgf_rh_cnes":"9999994"}'::jsonb from private.rh_unit_accounts where cnes_unit_id='f6000000-0000-0000-0000-000000000100';
set local role service_role;
select public.finish_rh_unit('f6000000-0000-0000-0000-000000000001','f6000000-0000-0000-0000-000000000100',(select auth_user_id from private.rh_unit_accounts where cnes_unit_id='f6000000-0000-0000-0000-000000000100'));
reset role;
insert into auth.sessions(id,user_id) select 'f6000000-0000-0000-0000-000000000200',profile_id from private.rh_unit_accounts where cnes_unit_id='f6000000-0000-0000-0000-000000000100';
insert into private.cnes_registry_entries(id,cnes_unit_id,source_id,source_hash,source_data)
values('f6000000-0000-0000-0000-000000000300','f6000000-0000-0000-0000-000000000100',repeat('a',64),repeat('b',64),'{"fullName":"OPERADOR FICTÍCIO","status":"ativo","cbo":"123456","teams":[]}');
set local role service_role;
do $$
declare actor uuid:='f6000000-0000-0000-0000-000000000001';unit_id uuid:='f6000000-0000-0000-0000-000000000100';
profile uuid;session uuid:='f6000000-0000-0000-0000-000000000200';grant_id uuid;result jsonb;
begin
 select profile_id into profile from private.rh_unit_accounts where cnes_unit_id=unit_id;
 if private.actor_role(profile) is not null then raise exception 'LEGACY_ROUTE_ALLOWED';end if;
 result:=public.rh_session_state(profile,session);
 if result->'operator'<>'null'::jsonb then raise exception 'AUTOMATIC_OPERATOR';end if;
 begin perform public.rh_unit_registry(profile,session,0);raise exception 'UNSELECTED_ALLOWED';exception when others then if sqlerrm<>'RH_OPERATOR_REQUIRED' then raise;end if;end;
 result:=public.rh_grant_operator(actor,unit_id,'f6000000-0000-0000-0000-000000000300',true,0);grant_id:=(result->>'id')::uuid;
 perform public.rh_select_operator(profile,session,grant_id);
 if jsonb_array_length(public.rh_unit_registry(profile,session,0)->'entries')<>1 then raise exception 'REGISTRY_FAILED';end if;
 perform public.rh_grant_operator(actor,unit_id,'f6000000-0000-0000-0000-000000000300',false,1);
 if public.rh_session_state(profile,session)->'operator'<>'null'::jsonb then raise exception 'REVOKED_ALLOWED';end if;
 perform public.rh_grant_operator(actor,unit_id,'f6000000-0000-0000-0000-000000000300',true,2);
 if public.rh_session_state(profile,session)->'operator'<>'null'::jsonb then raise exception 'OLD_SELECTION_RESTORED';end if;
 perform public.rh_select_operator(profile,session,grant_id);perform public.rh_clear_operator(profile,session);
 if public.rh_session_state(profile,session)->'operator'<>'null'::jsonb then raise exception 'CLEAR_FAILED';end if;
 perform public.rh_invalidate_sessions(actor,unit_id);
 begin perform public.rh_session_state(profile,session);raise exception 'REVOKED_SESSION_ALLOWED';exception when others then if sqlerrm<>'RH_SESSION_INVALID' then raise;end if;end;
 if has_function_privilege('authenticated','public.rh_session_state(uuid,uuid)','execute') or has_table_privilege('authenticated','private.rh_operator_grants','select') then raise exception 'DIRECT_API_ALLOWED';end if;
end $$;
reset role;
select 'RH: provisionamento, seleção, isolamento legado, revogação, retomada e sessão aprovados' as result;
