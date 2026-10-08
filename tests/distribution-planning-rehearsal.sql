-- Executar após fixtures iniciais de acesso e release de calendário, com rollback.
select set_config('request.headers','{"x-sgf-role":"administrador","x-sgf-actor":"f0000000-0000-0000-0000-000000000001"}',true);
update public.vacation_requests set status='enviada' where id::text like 'f0000000%';
insert into public.request_day_responsibilities(request_id,responsibility_date,bond_unit_id,cnes_unit_id,lotacao_id,assigned_by)
select r.id,'2026-10-08',u.id,u.cnes_unit_id,u.internal_lotacao_id,'f0000000-0000-0000-0000-000000000001'::uuid
from public.vacation_requests r join public.employment_bond_units u on u.bond_id=r.context_bond_id
where r.id in ('f0000000-0000-0000-0000-000000000501','f0000000-0000-0000-0000-000000000503') and u.internal_lotacao_id='f0000000-0000-0000-0000-000000000101';
grant insert,select on access_checks to service_role;
set local role service_role;
do $$
declare actor uuid:='f0000000-0000-0000-0000-000000000001'; owner uuid:='f0000000-0000-0000-0000-000000000002';
  req uuid:='f0000000-0000-0000-0000-000000000501'; a uuid; b uuid; editor jsonb; v integer; review_id uuid;
begin
  select id into a from public.employment_bond_units where bond_id='f0000000-0000-0000-0000-000000000301' and internal_lotacao_id='f0000000-0000-0000-0000-000000000101';
  select id into b from public.employment_bond_units where bond_id='f0000000-0000-0000-0000-000000000301' and internal_lotacao_id='f0000000-0000-0000-0000-000000000102';
  perform set_config('request.headers','{"x-sgf-role":"servidor","x-sgf-actor":"f0000000-0000-0000-0000-000000000002","x-sgf-bond":"f0000000-0000-0000-0000-000000000301"}',true);
  editor:=public.pending_distribution_editor(owner,req);
  insert into access_checks values('employee edits own pending distribution',(editor->>'editable')::boolean);
  begin
    perform public.pending_distribution_editor(owner,'f0000000-0000-0000-0000-000000000503');
    raise exception 'EXPECTED_OTHER_BOND_DENIED';
  exception when others then if sqlerrm<>'REQUEST_OUT_OF_SCOPE' then raise; end if;
    insert into access_checks values('employee cannot edit different selected bond',true); end;
  v:=public.change_pending_day_responsibility(owner,req,'2026-10-08',b,1,'Unidade responsável conferida pelo titular');
  insert into access_checks values('employee saves versioned redistribution',v=2);
  insert into access_checks select 'empty pending review removed without losing snapshot',not exists(select 1 from public.request_unit_reviews where request_id=req and lotacao_id='f0000000-0000-0000-0000-000000000101');
  insert into access_checks select 'new scope gets independent pending review',exists(select 1 from public.request_unit_reviews where request_id=req and lotacao_id='f0000000-0000-0000-0000-000000000102' and status='pendente');
  insert into access_checks select 'redistribution retains prior review in audit',exists(select 1 from public.audit_events where entity_id=req and action='pending_distribution_changed' and actor_id=owner and jsonb_array_length(previous_value->'reviews')=1);
  perform set_config('request.headers','{"x-sgf-role":"rh","x-sgf-actor":"f0000000-0000-0000-0000-000000000001","x-sgf-cnes":"f0000000-0000-0000-0000-000000000901","x-sgf-lotacao":"f0000000-0000-0000-0000-000000000101"}',true);
  begin perform public.pending_distribution_editor(actor,req); raise exception 'EXPECTED_RH_SCOPE_DENIED';
    exception when others then if sqlerrm<>'REQUEST_OUT_OF_SCOPE' then raise; end if;
      insert into access_checks values('RH loses access when its scope leaves request',true); end;
  perform set_config('request.headers','{"x-sgf-role":"administrador","x-sgf-actor":"f0000000-0000-0000-0000-000000000001"}',true);
  v:=public.change_pending_day_responsibility(actor,req,'2026-10-08',a,2,'Retorno à unidade após conferência administrativa');
  select id into review_id from public.request_unit_reviews where request_id=req;
  perform public.manage_unit_request_review(actor,review_id,'approve',null,2);
  select distribution_version into v from public.vacation_requests where id=req;
  begin perform public.change_pending_day_responsibility(actor,req,'2026-10-08',b,v,'Tentativa após decisão'); raise exception 'EXPECTED_DECISION_PRESERVED';
    exception when others then if sqlerrm<>'DISTRIBUTION_ALREADY_DECIDED' then raise; end if;
      insert into access_checks values('decision preserved blocks silent redistribution',true); end;
end $$;
reset role;
select * from access_checks order by name;
do $$ begin if (select count(*) from access_checks)<>8 or exists(select 1 from access_checks where passed is distinct from true) then raise exception 'DISTRIBUTION_ASSERTIONS_FAILED'; end if; end $$;
