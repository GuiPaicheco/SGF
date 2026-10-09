-- Apenas identificadores reservados DEMO07. Nenhuma associação inferida de pessoa real.
insert into public.employment_bonds(id,servidor_id,registration,employment_type,admission_date,weekly_hours,valid_from)
values('d7000000-0000-0000-0000-000000000302','d7000000-0000-0000-0000-000000000201','SGF-DEMO07-M2','estatutario','2020-01-01',20,'2020-01-01');
insert into public.employment_bond_units(id,bond_id,cnes_unit_id,valid_from)
values('d7000000-0000-0000-0000-000000000403','d7000000-0000-0000-0000-000000000302','d7000000-0000-0000-0000-000000000902','2020-01-01');
update public.vacation_requests set protocol='SGF-DEMO07-PENDENTE' where id='d7000000-0000-0000-0000-000000000501';
insert into public.vacation_requests(id,servidor_id,type,status,start_date,end_date,return_date,context_bond_id,protocol)
values
('d7000000-0000-0000-0000-000000000502','d7000000-0000-0000-0000-000000000201','regulamentar','enviada','2027-01-04','2027-01-05','2027-01-06','d7000000-0000-0000-0000-000000000301','SGF-DEMO07-APROVADA'),
('d7000000-0000-0000-0000-000000000503','d7000000-0000-0000-0000-000000000201','premio','enviada','2027-02-01','2027-02-02','2027-02-03','d7000000-0000-0000-0000-000000000302','SGF-DEMO07-CALENDARIO');
insert into public.request_periods(request_id,sequence,start_date,end_date,return_date,days,counting_mode)
values
('d7000000-0000-0000-0000-000000000502',1,'2027-01-04','2027-01-05','2027-01-06',2,'uteis'),
('d7000000-0000-0000-0000-000000000503',1,'2027-02-01','2027-02-02','2027-02-03',2,'corridos');
insert into public.request_day_responsibilities(request_id,responsibility_date,bond_unit_id,cnes_unit_id,assigned_by)
values
('d7000000-0000-0000-0000-000000000502','2027-01-04','d7000000-0000-0000-0000-000000000401','d7000000-0000-0000-0000-000000000901','d7000000-0000-0000-0000-000000000001'),
('d7000000-0000-0000-0000-000000000502','2027-01-05','d7000000-0000-0000-0000-000000000402','d7000000-0000-0000-0000-000000000902','d7000000-0000-0000-0000-000000000001'),
('d7000000-0000-0000-0000-000000000503','2027-02-01','d7000000-0000-0000-0000-000000000403','d7000000-0000-0000-0000-000000000902','d7000000-0000-0000-0000-000000000001'),
('d7000000-0000-0000-0000-000000000503','2027-02-02','d7000000-0000-0000-0000-000000000403','d7000000-0000-0000-0000-000000000902','d7000000-0000-0000-0000-000000000001');
do $$ declare v record; actor uuid:='d7000000-0000-0000-0000-000000000001';begin
 for v in select id,request_id from public.request_unit_reviews where request_id in ('d7000000-0000-0000-0000-000000000502','d7000000-0000-0000-0000-000000000503') loop
  perform public.manage_unit_request_review(actor,v.id,'approve',null,1);
  if v.request_id='d7000000-0000-0000-0000-000000000503' then perform public.manage_unit_request_review(actor,v.id,'schedule',null,2);end if;
 end loop;
 if (select count(*) from public.employment_bonds where servidor_id='d7000000-0000-0000-0000-000000000201')<>2
 or (select count(*) from public.request_day_responsibilities where request_id::text like 'd7000000%')<>6
 then raise exception 'DEMO_DATA_INVALID';end if;
end $$;
select 'DEMO07: uma pessoa, duas matrículas, dois CNES, seis atribuições diárias; pendente, aprovado e programado' as result;
