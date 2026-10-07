-- Executar após as migrations, dentro de BEGIN/ROLLBACK; nunca deixar fixtures em produção.
create temporary table access_checks(name text,passed boolean);
grant insert,select on access_checks to authenticated;
insert into auth.users(id,email,aud,role) values
 ('f0000000-0000-0000-0000-000000000001','sgf-rh-rollback@example.invalid','authenticated','authenticated'),
 ('f0000000-0000-0000-0000-000000000002','sgf-own-rollback@example.invalid','authenticated','authenticated');
insert into public.profiles(id,full_name,role,roles,must_change_password) values
 ('f0000000-0000-0000-0000-000000000001','Teste RH rollback','rh',array['rh','diretor','administrador']::public.app_role[],false),
 ('f0000000-0000-0000-0000-000000000002','Teste titular rollback','servidor',array['servidor']::public.app_role[],false)
on conflict(id) do update set roles=excluded.roles,must_change_password=false;
insert into public.lotacoes(id,name,unit_type) values ('f0000000-0000-0000-0000-000000000100','Secretaria fixture rollback','secretaria');
insert into public.lotacoes(id,name,unit_type,parent_id,is_internal_allocation) values
 ('f0000000-0000-0000-0000-000000000101','Diretoria A fixture rollback','diretoria','f0000000-0000-0000-0000-000000000100',true),
 ('f0000000-0000-0000-0000-000000000102','Diretoria B fixture rollback','diretoria','f0000000-0000-0000-0000-000000000100',true);
insert into public.cnes_units(id,code,name) values ('f0000000-0000-0000-0000-000000000901','9999998','CNES fixture rollback');
insert into public.lotacao_cnes_units(lotacao_id,cnes_unit_id) values
 ('f0000000-0000-0000-0000-000000000101','f0000000-0000-0000-0000-000000000901'),
 ('f0000000-0000-0000-0000-000000000102','f0000000-0000-0000-0000-000000000901');
insert into public.profile_scopes(profile_id,lotacao_id) values
 ('f0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000101');
insert into public.servidores(id,profile_id,matricula,employment_type,full_name,lotacao_id) values
 ('f0000000-0000-0000-0000-000000000201','f0000000-0000-0000-0000-000000000002','RLS-TEST-01','estatutario','Teste servidor rollback','f0000000-0000-0000-0000-000000000101');
insert into public.employment_bonds(id,servidor_id,registration,employment_type) values
 ('f0000000-0000-0000-0000-000000000301','f0000000-0000-0000-0000-000000000201','RLS-TEST-01','estatutario'),
 ('f0000000-0000-0000-0000-000000000303','f0000000-0000-0000-0000-000000000201','RLS-TEST-02','estatutario');
insert into public.employment_bond_units(bond_id,cnes_unit_id,internal_lotacao_id) values
 ('f0000000-0000-0000-0000-000000000301','f0000000-0000-0000-0000-000000000901','f0000000-0000-0000-0000-000000000101'),
 ('f0000000-0000-0000-0000-000000000301','f0000000-0000-0000-0000-000000000901','f0000000-0000-0000-0000-000000000102'),
 ('f0000000-0000-0000-0000-000000000303','f0000000-0000-0000-0000-000000000901','f0000000-0000-0000-0000-000000000101');
insert into public.vacation_requests(id,servidor_id,type,start_date,end_date,return_date,context_bond_id) values
 ('f0000000-0000-0000-0000-000000000501','f0000000-0000-0000-0000-000000000201','regulamentar','2026-10-08','2026-10-09','2026-10-13','f0000000-0000-0000-0000-000000000301'),
 ('f0000000-0000-0000-0000-000000000502','f0000000-0000-0000-0000-000000000201','regulamentar','2026-10-08','2026-10-09','2026-10-13','f0000000-0000-0000-0000-000000000301'),
 ('f0000000-0000-0000-0000-000000000503','f0000000-0000-0000-0000-000000000201','regulamentar','2026-10-08','2026-10-09','2026-10-13','f0000000-0000-0000-0000-000000000303');
insert into public.request_unit_reviews(request_id,cnes_unit_id,lotacao_id) values
 ('f0000000-0000-0000-0000-000000000501','f0000000-0000-0000-0000-000000000901','f0000000-0000-0000-0000-000000000101'),
 ('f0000000-0000-0000-0000-000000000502','f0000000-0000-0000-0000-000000000901','f0000000-0000-0000-0000-000000000102'),
 ('f0000000-0000-0000-0000-000000000503','f0000000-0000-0000-0000-000000000901','f0000000-0000-0000-0000-000000000101');
select set_config('request.jwt.claim.sub','f0000000-0000-0000-0000-000000000001',true);
select set_config('request.headers','{"x-sgf-role":"rh","x-sgf-cnes":"f0000000-0000-0000-0000-000000000901","x-sgf-lotacao":"f0000000-0000-0000-0000-000000000101"}',true);
set local role authenticated;
insert into access_checks select 'RH only own reviews',count(*)=2 from public.vacation_requests where id::text like 'f0000000%';
insert into access_checks select 'RH cannot read other directorate',count(*)=0 from public.vacation_requests where id='f0000000-0000-0000-0000-000000000502';
insert into access_checks select 'browser cannot update requests',not has_table_privilege('authenticated','public.vacation_requests','UPDATE');
select set_config('request.headers','{"x-sgf-role":"diretor","x-sgf-cnes":"f0000000-0000-0000-0000-000000000901","x-sgf-lotacao":"f0000000-0000-0000-0000-000000000101"}',true);
insert into access_checks select 'director same scope isolation',count(*)=2 from public.vacation_requests where id::text like 'f0000000%';
select set_config('request.headers','{"x-sgf-role":"administrador"}',true);
insert into access_checks select 'admin consolidated',count(*)=3 from public.vacation_requests where id::text like 'f0000000%';
select set_config('request.jwt.claim.sub','f0000000-0000-0000-0000-000000000002',true);
select set_config('request.headers','{"x-sgf-role":"servidor","x-sgf-bond":"f0000000-0000-0000-0000-000000000301","x-sgf-cnes":"f0000000-0000-0000-0000-000000000901","x-sgf-lotacao":"f0000000-0000-0000-0000-000000000101"}',true);
insert into access_checks select 'employee selected bond only',count(*)=2 from public.vacation_requests where id::text like 'f0000000%';
select set_config('request.headers','{"x-sgf-role":"administrador"}',true);
insert into access_checks select 'forged admin role denied',count(*)=0 from public.vacation_requests where id::text like 'f0000000%';
select set_config('request.headers','{"x-sgf-role":"servidor","x-sgf-bond":"f0000000-0000-0000-0000-000000000301","x-sgf-cnes":"f0000000-0000-0000-0000-000000000901","x-sgf-lotacao":"f0000000-0000-0000-0000-000000000101"}',true);
reset role;
update public.profiles set disabled_at=now() where id='f0000000-0000-0000-0000-000000000002';
set local role authenticated;
insert into access_checks select 'disabled account loses own read',count(*)=0 from public.vacation_requests where id::text like 'f0000000%';
reset role;
select set_config('request.jwt.claim.sub','f0000000-0000-0000-0000-000000000001',true);
select set_config('request.headers','{"x-sgf-role":"rh","x-sgf-cnes":"f0000000-0000-0000-0000-000000000901","x-sgf-lotacao":"f0000000-0000-0000-0000-000000000101"}',true);
update public.cnes_units set active=false where id='f0000000-0000-0000-0000-000000000901';
set local role authenticated;
insert into access_checks select 'inactive CNES denies management',count(*)=0 from public.vacation_requests where id::text like 'f0000000%';
reset role;
update public.cnes_units set active=true where id='f0000000-0000-0000-0000-000000000901';
select set_config('request.headers','{"x-sgf-role":"rh","x-sgf-lotacao":"f0000000-0000-0000-0000-000000000101"}',true);
set local role authenticated;
insert into access_checks select 'missing CNES denies management',count(*)=0 from public.vacation_requests where id::text like 'f0000000%';
reset role;
select set_config('request.headers','{"x-sgf-role":"rh","x-sgf-cnes":"f0000000-0000-0000-0000-000000000901","x-sgf-lotacao":"f0000000-0000-0000-0000-000000000101"}',true);
delete from public.profile_scopes where profile_id='f0000000-0000-0000-0000-000000000001';
set local role authenticated;
insert into access_checks select 'revoked scope immediately loses read',count(*)=0 from public.vacation_requests where id::text like 'f0000000%';
reset role;
select * from access_checks order by name;
do $$ begin
  if (select count(*) from access_checks)<>11 or exists(select 1 from access_checks where passed is distinct from true)
    then raise exception 'ACCESS_RLS_ASSERTION_FAILED'; end if;
end $$;
