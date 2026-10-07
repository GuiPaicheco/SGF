-- Usar fixtures do ensaio de acesso, numa única transação BEGIN/ROLLBACK.
insert into auth.users(id,email,aud,role) values
 ('f0000000-0000-0000-0000-000000000004','sgf-registration-rollback@betim.mg.gov.br','authenticated','authenticated');
insert into public.cargos(id,name) values ('f0000000-0000-0000-0000-000000000801','Cargo cadastro rollback');
select set_config('request.headers','{"x-sgf-role":"administrador","x-sgf-actor":"f0000000-0000-0000-0000-000000000001"}',true);
grant insert,select on access_checks to service_role;
set local role service_role;
do $$
declare request_id uuid; second_id uuid; person_id uuid; bonds jsonb; result_count integer;
begin
 bonds:=jsonb_build_array(
  jsonb_build_object('registration','REG-ROLLBACK-01','employment_type','estatutario','weekly_hours',40,'units',jsonb_build_array(
   jsonb_build_object('cnes_unit_id','f0000000-0000-0000-0000-000000000901','internal_lotacao_id','f0000000-0000-0000-0000-000000000101','not_applicable',true,'weekly_hours',20),
   jsonb_build_object('cnes_unit_id','f0000000-0000-0000-0000-000000000901','internal_lotacao_id','f0000000-0000-0000-0000-000000000102','not_applicable',true,'weekly_hours',20))),
  jsonb_build_object('registration','REG-ROLLBACK-02','employment_type','estatutario','weekly_hours',20,'units',jsonb_build_array(
   jsonb_build_object('cnes_unit_id','f0000000-0000-0000-0000-000000000901','internal_lotacao_id','f0000000-0000-0000-0000-000000000101','not_applicable',true,'weekly_hours',20))));
 select jsonb_agg(value || jsonb_build_object('cargo_id','f0000000-0000-0000-0000-000000000801')) into bonds from jsonb_array_elements(bonds);
 request_id:=public.submit_multi_bond_access_request('Cadastro transacional rollback','91991991926','1990-01-01','SGF-REGISTRATION-ROLLBACK@BETIM.MG.GOV.BR',bonds);
 insert into access_checks select 'request stores two registrations',count(*)=2 from public.access_request_bonds where access_request_id=request_id;
 insert into access_checks select 'request normalizes email',email='sgf-registration-rollback@betim.mg.gov.br' from public.access_requests where id=request_id;
 begin
  perform public.submit_multi_bond_access_request('Duplicado rollback','91991991926','1990-01-01','sgf-registration-rollback@betim.mg.gov.br',bonds);
  raise exception 'EXPECTED_DUPLICATE_REQUEST';
 exception when others then
  if sqlerrm<>'ACCESS_REQUEST_ALREADY_PENDING' then raise; end if;
  insert into access_checks values('duplicate pending identity rejected',true);
 end;
 perform public.approve_multi_bond_access('f0000000-0000-0000-0000-000000000001',request_id,'f0000000-0000-0000-0000-000000000004',array['servidor','rh','diretor','administrador']::public.app_role[],array['f0000000-0000-0000-0000-000000000101']::uuid[]);
 select id into person_id from public.servidores where profile_id='f0000000-0000-0000-0000-000000000004';
 insert into access_checks select 'approval creates exactly one person',count(*)=1 from public.servidores where cpf='91991991926';
 insert into access_checks select 'approval creates two bonds',count(*)=2 from public.employment_bonds where servidor_id=person_id;
 insert into access_checks select 'approval preserves three unit contexts',count(*)=3 from public.employment_bond_units u join public.employment_bonds b on b.id=u.bond_id where b.servidor_id=person_id;
 insert into access_checks select 'approval persists four roles',cardinality(roles)=4 from public.profiles where id='f0000000-0000-0000-0000-000000000004';
 insert into access_checks select 'administrative scope recorded',exists(select 1 from public.profile_scopes where profile_id='f0000000-0000-0000-0000-000000000004' and lotacao_id='f0000000-0000-0000-0000-000000000101');
 insert into access_checks select 'approval audit identifies actor',exists(select 1 from public.audit_events where entity_id=request_id and actor_id='f0000000-0000-0000-0000-000000000001' and action='multi_bond_access_approved');
 begin
  perform public.approve_multi_bond_access('f0000000-0000-0000-0000-000000000001',request_id,'f0000000-0000-0000-0000-000000000004',array['servidor']::public.app_role[],'{}');
  raise exception 'EXPECTED_ALREADY_REVIEWED';
 exception when others then
  if sqlerrm<>'MULTI_ACCESS_REQUEST_NOT_PENDING' then raise; end if;
  insert into access_checks values('double approval rejected',true);
 end;
end $$;
reset role;
select * from access_checks order by name;
do $$ begin
 if (select count(*) from access_checks)<>10 or exists(select 1 from access_checks where passed is distinct from true) then raise exception 'REGISTRATION_ASSERTIONS_FAILED'; end if;
end $$;
