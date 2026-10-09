-- Fundação sintética do bloco 03, sem decisões, na mesma transação com rollback.
do $$
declare actor uuid:='f3000000-0000-0000-0000-000000000001'; owner uuid:='f3000000-0000-0000-0000-000000000002';
  bond uuid:='f3000000-0000-0000-0000-000000000301'; unit uuid:='f3000000-0000-0000-0000-000000000401';
  cnes uuid:='f3000000-0000-0000-0000-000000000901'; req uuid:='f3000000-0000-0000-0000-000000000501';
  before_count bigint; saved jsonb; event jsonb; entry bigint;
begin
  update public.employment_bonds set weekly_hours=32 where id=bond;
  insert into block_three_checks select 'matrícula auditada nos dois escopos',count(*)=2 from public.audit_events where entity_id=bond and action='employment_bonds_update';
  insert into block_three_checks select 'autor e papel vêm da sessão',bool_and(actor_id=actor and actor_role='administrador') from public.audit_events where entity_id=bond and action='employment_bonds_update';
  insert into block_three_checks select 'antes depois vínculo e pessoa preservados',bool_and((previous_value->'weekly_hours') is distinct from (new_value->'weekly_hours') and context_bond_id=bond and affected_name='TESTE Bloco 03 titular') from public.audit_events where entity_id=bond and action='employment_bonds_update';
  select count(*) into before_count from public.audit_events where entity_id=bond and action='employment_bonds_update';
  update public.employment_bonds set weekly_hours=32 where id=bond;
  insert into block_three_checks select 'gravação idêntica não duplica trilha',count(*)=before_count from public.audit_events where entity_id=bond and action='employment_bonds_update';
  insert into block_three_checks select 'titular avisado nos dois contextos',count(*)=2 from public.notifications where recipient_id=owner and title='Cadastro funcional atualizado' and event_key like '%employment_bonds:%';
  insert into block_three_checks select 'RH recebe apenas seu CNES',count(*)=1 and bool_and(context_cnes_unit_id=cnes and context_lotacao_id is null) from public.notifications where recipient_id=actor and recipient_role='rh' and event_key like '%employment_bonds:%';
  insert into public.employment_bond_teams(bond_unit_id,not_applicable,assigned_by) values(unit,true,actor);
  insert into block_three_checks select 'equipe identifica servidor sem confundir com ator',affected_servidor_id='f3000000-0000-0000-0000-000000000201' and actor_id=actor from public.audit_events where entity_id=unit and action='employment_bond_teams_insert';
  insert into public.audit_events(actor_id,actor_role,entity_type,action,new_value,reason) values(actor,'administrador','teste','block5_secret',
    '{"nested":{"password":"secret","cookie":"session","ok":"normal"},"text":"Bearer not-for-log"}','Bearer private-token') returning id into entry;
  insert into block_three_checks select 'segredos removidos antes da persistência',not(new_value->'nested'?'password') and not(new_value->'nested'?'cookie') and new_value->>'text'='[credencial removida]' and reason='[credencial removida]' from public.audit_events where id=entry;
  insert into public.notifications(recipient_id,recipient_role,title,message) values(actor,'rh','TESTE legado sem escopo','Preservar sem inferência');
  insert into block_three_checks select 'aviso antigo de gestão preservado como não resolvido',scope_resolution='unresolved_legacy' and context_cnes_unit_id is null from public.notifications where title='TESTE legado sem escopo';
  insert into public.notifications(recipient_id,recipient_role,title,message) values(owner,'servidor','TESTE legado pessoal','Somente titular');
  insert into block_three_checks select 'aviso pessoal legado mantém destinatário',scope_resolution='personal_legacy' from public.notifications where title='TESTE legado pessoal';
  insert into auth.users(id,email,aud,role) values('f3000000-0000-0000-0000-000000000003','block5-second@example.invalid','authenticated','authenticated');
  insert into public.profiles(id,full_name,role,roles,must_change_password) values('f3000000-0000-0000-0000-000000000003','TESTE Bloco 05 segundo','servidor',array['servidor']::public.app_role[],false);
  insert into public.servidores(id,profile_id,matricula,full_name,birth_date,employment_type,active) values('f3000000-0000-0000-0000-000000000203','f3000000-0000-0000-0000-000000000003','BLOCK5-M2','TESTE Bloco 05 segundo','1990-02-02','estatutario',true);
  insert into public.employment_bonds(id,servidor_id,registration,employment_type,valid_from) values('f3000000-0000-0000-0000-000000000303','f3000000-0000-0000-0000-000000000203','BLOCK5-M2','estatutario','2020-01-01');
  insert into public.employment_bond_units(id,bond_id,cnes_unit_id,valid_from) values('f3000000-0000-0000-0000-000000000403','f3000000-0000-0000-0000-000000000303',cnes,'2020-01-01');
  perform set_config('request.headers','{"x-sgf-role":"rh","x-sgf-actor":"f3000000-0000-0000-0000-000000000001","x-sgf-cnes":"f3000000-0000-0000-0000-000000000901","x-sgf-lotacao":"f3000000-0000-0000-0000-000000000101"}',true);
  perform public.set_unit_minimum_scale(actor,cnes,null,'2026-11-20',array[unit,'f3000000-0000-0000-0000-000000000403'::uuid],0);
  insert into block_three_checks select 'evento coletivo não inventa um único sujeito',affected_name is null and cardinality(affected_names)=2 and context_lotacao_id is null and affected_search like '%segundo%' from public.audit_events where action='unit_minimum_scale_updated' and actor_id=actor;
  insert into block_three_checks select 'escala geral usa canal RH sem lotação interna fictícia',exists(select 1 from public.notifications where recipient_id=actor and recipient_role='rh' and title='Escala mínima atualizada' and context_lotacao_id is null);
  saved:=public.manage_manual_calendar_conflict(actor,'f3000000-0000-0000-0000-000000000801','create',cnes,null,unit,'2026-11-20','2026-11-20','Alerta sintético',0);
  insert into block_three_checks select 'conflito nominal avisa titular',exists(select 1 from public.notifications where recipient_id=owner and title='Alerta de planejamento atualizado' and context_cnes_unit_id=cnes);
  perform set_config('request.headers','{"x-sgf-role":"administrador","x-sgf-actor":"f3000000-0000-0000-0000-000000000001"}',true);
  update public.request_periods set return_date='2026-11-06' where request_id=req;
  insert into block_three_checks select 'alteração de período avisa titular e gestão',exists(select 1 from public.notifications where recipient_id=owner and request_id=req and title='Período da solicitação atualizado');
  insert into public.vacation_requests(id,servidor_id,type,status,start_date,end_date,return_date,context_bond_id,protocol) values('f3000000-0000-0000-0000-000000000502','f3000000-0000-0000-0000-000000000203','regulamentar','enviada','2026-11-03','2026-11-04','2026-11-05','f3000000-0000-0000-0000-000000000303','TESTE-BLOCO05-SEGUNDO');
  insert into public.request_periods(request_id,sequence,start_date,end_date,return_date,days,counting_mode) values('f3000000-0000-0000-0000-000000000502',1,'2026-11-03','2026-11-04','2026-11-05',2,'uteis');
  insert into public.request_day_responsibilities(request_id,responsibility_date,bond_unit_id,cnes_unit_id,assigned_by) values('f3000000-0000-0000-0000-000000000502','2026-11-03','f3000000-0000-0000-0000-000000000403',cnes,actor),('f3000000-0000-0000-0000-000000000502','2026-11-04','f3000000-0000-0000-0000-000000000403',cnes,actor);
  event:=public.save_planning_calendar_event(actor,null,'2026-11-03','feriado','TESTE transacional blocos 05',true,null);
  insert into block_three_checks select 'mesmo feriado gera aviso para cada pedido da unidade',count(distinct request_id)=2 from public.notifications where recipient_id=actor and recipient_role='administrador' and context_cnes_unit_id=cnes and title='Calendário alterado durante afastamento' and event_key like 'calendar:'||(event->>'id')||':%';
  insert into block_three_checks select 'avisos possuem chaves sem colisão entre protocolos',count(*)=count(distinct event_key) from public.notifications where recipient_id=actor and recipient_role='administrador' and title='Calendário alterado durante afastamento';
end $$;

-- Falha da trilha deve desfazer alteração e avisos na mesma transação.
create function pg_temp.reject_test_audit() returns trigger language plpgsql as $$ begin
 if new.action='employment_bonds_update' then raise exception 'TEST_AUDIT_FAILURE'; end if; return new; end $$;
create trigger reject_test_audit before insert on public.audit_events for each row execute function pg_temp.reject_test_audit();
do $$ declare hours integer; logs bigint; begin
 select weekly_hours into hours from public.employment_bonds where id='f3000000-0000-0000-0000-000000000301';
 select count(*) into logs from public.audit_events;
 begin update public.employment_bonds set weekly_hours=30 where id='f3000000-0000-0000-0000-000000000301'; raise exception 'EXPECTED';
 exception when others then if sqlerrm<>'TEST_AUDIT_FAILURE' then raise; end if; end;
 insert into block_three_checks select 'falha da auditoria desfaz mutação e trilha parcial',weekly_hours=hours and (select count(*) from public.audit_events)=logs from public.employment_bonds where id='f3000000-0000-0000-0000-000000000301';
end $$;
drop trigger reject_test_audit on public.audit_events;

do $$ begin
 insert into block_three_checks select 'banco identifica titular vínculo e autor',exists(select 1 from public.audit_events where action='bond_time_bank_entries_insert' and context_bond_id='f3000000-0000-0000-0000-000000000301' and affected_name='TESTE Bloco 03 titular' and actor_id='f3000000-0000-0000-0000-000000000001');
 update public.servidores set cpf='91809999057' where id='f3000000-0000-0000-0000-000000000201';
 update public.profiles set cpf='91809999057' where id='f3000000-0000-0000-0000-000000000002';
 perform public.update_admin_profile('f3000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000002',array['servidor']::public.app_role[],'91809999057','{}','f3000000-0000-0000-0000-000000000101');
 insert into block_three_checks select 'edição composta conserva perfil e pessoa sincronizados',p.primary_lotacao_id=s.lotacao_id from public.profiles p join public.servidores s on s.profile_id=p.id where p.id='f3000000-0000-0000-0000-000000000002';
 perform set_config('request.headers','{}',true);
 perform public.complete_password_change('f3000000-0000-0000-0000-000000000002');
 insert into block_three_checks select 'troca de senha registra titular sem gravar credencial',exists(select 1 from public.audit_events where action='password_changed' and actor_id='f3000000-0000-0000-0000-000000000002' and actor_name_at_event='TESTE Bloco 03 titular' and new_value='{"must_change_password":false}');
end $$;
grant select,insert on block_three_checks to service_role;
set local role service_role;
do $$ begin
 begin update public.audit_events set reason='Sobrescrever' where action='block5_secret'; raise exception 'EXPECTED'; exception when others then if sqlerrm<>'AUDIT_HISTORY_IMMUTABLE' then raise; end if; end;
 insert into block_three_checks values('API não sobrescreve histórico existente',true);
end $$;
reset role;
select * from block_three_checks order by name;
do $$ begin if (select count(*) from block_three_checks)<>21 or exists(select 1 from block_three_checks where passed is distinct from true) then raise exception 'BLOCK_FIVE_ASSERTIONS_FAILED'; end if; end $$;
