-- Trilhas transacionais; tabelas e funções internas continuam sem acesso do cliente.
alter table public.audit_events add column affected_names text[] not null default '{}',
  add column affected_search text, add column actor_name_at_event text, add column actor_search text,
  add column bond_registration_at_event text,add column registration_search text;
alter table public.notifications add column scope_resolution text not null default 'unresolved_legacy'
  check(scope_resolution in ('scoped','personal_legacy','global','unresolved_legacy'));
update public.notifications set scope_resolution=case
  when context_cnes_unit_id is not null then 'scoped'
  when recipient_role='servidor' and context_bond_id is null and context_lotacao_id is null then 'personal_legacy'
  when recipient_role='administrador' then 'global' else 'unresolved_legacy' end;

create function private.classify_notification_scope() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  new.title:=private.sanitize_audit_json(to_jsonb(new.title))#>>'{}';
  new.message:=private.sanitize_audit_json(to_jsonb(new.message))#>>'{}';
  new.scope_resolution:=case when new.context_cnes_unit_id is not null then 'scoped'
    when new.recipient_role='servidor' and new.context_bond_id is null and new.context_lotacao_id is null then 'personal_legacy'
    when new.recipient_role='administrador' then 'global' else 'unresolved_legacy' end;
  return new;
end $$;
create trigger notification_scope_classify before insert on public.notifications
for each row execute function private.classify_notification_scope();

create function private.sanitize_audit_json(value jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb; k text; v jsonb;
begin
  if value is null then return null; end if;
  if jsonb_typeof(value)='object' then
    result:='{}';
    for k,v in select entries.key,entries.item from jsonb_each(value) as entries(key,item) loop
      if k !~* 'password|senha|token|secret|api.?key|authorization|credential|cookie' then
        result:=result||jsonb_build_object(k,private.sanitize_audit_json(v));
      end if;
    end loop;
    return result;
  elsif jsonb_typeof(value)='array' then
    select coalesce(jsonb_agg(private.sanitize_audit_json(item)),'[]') into result from jsonb_array_elements(value) item;
    return result;
  elsif jsonb_typeof(value)='string' and value::text ~* 'Bearer[[:space:]]|sb_secret_|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.' then
    return to_jsonb('[credencial removida]'::text);
  end if;
  return value;
end $$;

create function private.complete_audit_subjects() returns trigger
language plpgsql security invoker set search_path='' as $$
declare units jsonb; names text[];
begin
  select full_name into new.actor_name_at_event from public.profiles where id=new.actor_id;
  new.actor_search:=new.actor_name_at_event;
  select registration into new.bond_registration_at_event from public.employment_bonds where id=new.context_bond_id;
  new.registration_search:=new.bond_registration_at_event;
  new.previous_value:=private.sanitize_audit_json(new.previous_value);
  new.new_value:=private.sanitize_audit_json(new.new_value);
  new.reason:=private.sanitize_audit_json(to_jsonb(new.reason))#>>'{}';
  if new.affected_name is not null then names:=array[new.affected_name];
  elsif new.action='unit_minimum_scale_updated' then
    units:=coalesce(new.previous_value->'bond_unit_ids','[]')||coalesce(new.new_value->'bond_unit_ids','[]');
    select array_agg(distinct s.full_name order by s.full_name) into names
    from jsonb_array_elements_text(units) item
      join public.employment_bond_units u on u.id::text=item
      join public.employment_bonds b on b.id=u.bond_id join public.servidores s on s.id=b.servidor_id
    where u.cnes_unit_id=new.context_cnes_unit_id and u.internal_lotacao_id is not distinct from new.context_lotacao_id;
  elsif new.entity_type='profile' and new.context_cnes_unit_id is null then
    select array_agg(distinct full_name order by full_name) into names from public.servidores where profile_id=new.entity_id;
  end if;
  new.affected_names:=coalesce(names,'{}');
  new.affected_search:=array_to_string(new.affected_names,' | ');
  return new;
end $$;
create trigger audit_fill_subject_collection before insert on public.audit_events
for each row execute function private.complete_audit_subjects();
-- Reconciliação de nomes já comprovados; não altera autoria nem escopos históricos.
update public.audit_events set affected_names=array[affected_name],affected_search=affected_name where affected_name is not null;
update public.audit_events a set actor_search=p.full_name from public.profiles p where p.id=a.actor_id;
update public.audit_events a set registration_search=b.registration from public.employment_bonds b where b.id=a.context_bond_id;

create function private.audit_domain_mutation() returns trigger
language plpgsql security invoker set search_path='' as $$
declare before_data jsonb; after_data jsonb; item jsonb; actor uuid; role_value public.app_role;
  headers jsonb:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}');
  person uuid; bond uuid; unit uuid; target uuid; kind text; scope record; scopes jsonb:='[]';
  owner_id uuid; audit_id bigint; location uuid;
begin
  if tg_op<>'INSERT' then before_data:=to_jsonb(old); end if;
  if tg_op<>'DELETE' then after_data:=to_jsonb(new); end if;
  if tg_op='UPDATE' and (before_data-'updated_at'-'version')=(after_data-'updated_at'-'version') then return new; end if;
  item:=coalesce(after_data,before_data);
  actor:=coalesce(nullif(headers->>'x-sgf-actor','')::uuid,nullif(current_setting('sgf.audit_actor',true),'')::uuid);
  role_value:=private.actor_role(actor);
  target:=nullif(item->>'id','')::uuid;
  kind:=case tg_table_name when 'servidores' then 'servidor' when 'employment_bonds' then 'employment_bond'
    when 'employment_bond_units' then 'employment_bond_unit' when 'profiles' then 'profile'
    when 'vacation_requests' then 'vacation_request' else tg_table_name end;
  if tg_table_name='servidores' then person:=target;
  elsif tg_table_name='profiles' then select min(id::text)::uuid into person from public.servidores where profile_id=target having count(*)=1;
  elsif tg_table_name='employment_bonds' then person:=(item->>'servidor_id')::uuid; bond:=target;
  elsif tg_table_name in ('employment_bond_units','employment_bond_teams') then
    if tg_table_name='employment_bond_teams' then unit:=(item->>'bond_unit_id')::uuid; target:=unit; kind:='employment_bond_unit';
      select bond_id into bond from public.employment_bond_units where id=unit;
    else unit:=target; bond:=(item->>'bond_id')::uuid; end if;
  elsif tg_table_name in ('bond_time_bank_entries','bond_time_bank_accounts','vacation_rights') then bond:=(item->>'bond_id')::uuid;
  elsif tg_table_name in ('time_bank_entries','time_bank_accounts','employee_inclusion_requests') then
    person:=(item->>'servidor_id')::uuid;
    if tg_table_name='employee_inclusion_requests' then kind:='employee_inclusion_request';
      select context_bond_id into bond from public.vacation_requests where id=(item->>'request_id')::uuid;
    end if;
  elsif tg_table_name in ('vacation_requests','request_periods') then
    if tg_table_name='request_periods' then target:=(item->>'request_id')::uuid; kind:='vacation_request'; end if;
    select servidor_id,context_bond_id into person,bond from public.vacation_requests where id=target;
  elsif tg_table_name='profile_scopes' then
    target:=(item->>'profile_id')::uuid; kind:='profile'; location:=(item->>'lotacao_id')::uuid;
    select coalesce(jsonb_agg(jsonb_build_object('cnes',m.cnes_unit_id,'location',case when l.is_internal_allocation then l.id end)),'[]') into scopes
      from public.lotacao_cnes_units m join public.lotacoes l on l.id=m.lotacao_id where m.lotacao_id=location;
  elsif tg_table_name in ('access_requests','access_request_bonds','access_request_bond_units') then
    if tg_table_name='access_request_bonds' then target:=(item->>'access_request_id')::uuid;
    elsif tg_table_name='access_request_bond_units' then
      select access_request_id into target from public.access_request_bonds where id=(item->>'access_request_bond_id')::uuid;
    end if;
    kind:='access_request';
    select coalesce(jsonb_agg(distinct jsonb_build_object('cnes',u.cnes_unit_id,'location',u.internal_lotacao_id)),'[]') into scopes
      from public.access_request_bond_units u join public.access_request_bonds b on b.id=u.access_request_bond_id where b.access_request_id=target;
  end if;
  if bond is not null and person is null then select servidor_id into person from public.employment_bonds where id=bond; end if;
  if person is not null then select profile_id into owner_id from public.servidores where id=person; end if;
  if tg_table_name in ('employment_bond_units','employment_bond_teams') then
    if tg_table_name='employment_bond_units' then
      select coalesce(jsonb_agg(distinct value),'[]') into scopes from jsonb_array_elements(
        jsonb_build_array(jsonb_build_object('cnes',before_data->>'cnes_unit_id','location',before_data->>'internal_lotacao_id'),
                          jsonb_build_object('cnes',after_data->>'cnes_unit_id','location',after_data->>'internal_lotacao_id'))) value
        where value->>'cnes' is not null;
    else select jsonb_build_array(jsonb_build_object('cnes',cnes_unit_id,'location',internal_lotacao_id)) into scopes from public.employment_bond_units where id=unit; end if;
  elsif jsonb_array_length(scopes)=0 and (bond is not null or person is not null) then
    select coalesce(jsonb_agg(distinct jsonb_build_object('cnes',u.cnes_unit_id,'location',u.internal_lotacao_id,'bond',b.id)),'[]') into scopes
      from public.employment_bond_units u join public.employment_bonds b on b.id=u.bond_id
      where (bond is not null and b.id=bond) or (bond is null and b.servidor_id=person);
  end if;
  if jsonb_array_length(coalesce(scopes,'[]'))=0 then scopes:='[{"cnes":null,"location":null}]'; end if;
  for scope in select (value->>'cnes')::uuid cnes,(value->>'location')::uuid location,coalesce((value->>'bond')::uuid,bond) bond_id from jsonb_array_elements(scopes) loop
    insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_bond_id,context_cnes_unit_id,context_lotacao_id,previous_value,new_value,reason)
    values(actor,role_value,tg_table_name||'_'||lower(tg_op),kind,target,scope.bond_id,scope.cnes,scope.location,
      before_data,after_data,coalesce(item->>'notes',item->>'description',item->>'justification')) returning id into audit_id;
    -- Avisos cadastrais são resumos, não incluem CPF, e-mail ou snapshots de outra unidade.
    if tg_table_name in ('servidores','employment_bonds','employment_bond_units','employment_bond_teams','bond_time_bank_entries','vacation_rights') and scope.cnes is not null then
      perform private.emit_unit_notification('domain:'||txid_current()||':'||tg_table_name||':'||coalesce(target::text,bond::text)||':'||coalesce(scope.bond_id::text,'legacy'),scope.cnes,scope.location,
        case when tg_table_name='bond_time_bank_entries' then 'Banco de horas atualizado' else 'Cadastro funcional atualizado' end,
        'Há alterações no cadastro ou nos recursos funcionais. Confira o histórico deste contexto. Em dúvidas sobre direitos, procure o RH; sobre o sistema, os Administradores/TI.',null,owner_id,scope.bond_id);
    elsif tg_table_name in ('access_requests','access_request_bonds','access_request_bond_units','employee_inclusion_requests','profiles','profile_scopes') then
      perform private.emit_unit_notification('access-domain:'||txid_current()||':'||tg_table_name||':'||target,scope.cnes,scope.location,
        'Cadastro ou acesso atualizado','Há uma criação, revisão ou alteração cadastral/de acesso. Confira a fila correspondente e o histórico autorizado. Nenhuma alteração concede acesso fora das permissões cadastradas.',null,null,null);
    end if;
  end loop;
  if tg_op='DELETE' then return old; end if; return new;
end $$;

-- Propagar a identidade já validada pelos RPCs; não usa identidade editável de user_metadata.
do $$ declare item record; definition text; patched text;
begin
  for item in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prolang=(select oid from pg_language where lanname='plpgsql')
      and 'actor_id'=any(p.proargnames)
  loop
    definition:=pg_get_functiondef(item.oid);
    patched:=regexp_replace(definition,E'\n[Bb][Ee][Gg][Ii][Nn][[:space:]]*\n',E'\nBEGIN\n  perform set_config(''sgf.audit_actor'',actor_id::text,true);\n');
    if patched is distinct from definition then execute patched; end if;
  end loop;
end $$;

do $$ declare table_name text;
begin
  foreach table_name in array array['profiles','profile_scopes','servidores','employment_bonds','employment_bond_units','employment_bond_teams',
    'access_requests','access_request_bonds','access_request_bond_units','employee_inclusion_requests','vacation_rights','bond_time_bank_entries','bond_time_bank_accounts','time_bank_entries','time_bank_accounts',
    'vacation_requests','request_periods','cnes_units','lotacoes','lotacao_cnes_units','teams','team_types','cargos','funcoes','categorias_profissionais']
  loop
    execute format('create trigger domain_mutation_audit after insert or update or delete on public.%I for each row execute function private.audit_domain_mutation()',table_name);
  end loop;
end $$;

-- Corrigir deduplicação: um feriado pode afetar vários protocolos no mesmo contexto.
do $$ declare definition text;
begin
  definition:=pg_get_functiondef('private.notify_calendar_change()'::regprocedure);
  definition:=replace(definition,'''calendar:''||new.id||'':''||txid_current(),','''calendar:''||new.id||'':''||txid_current()||'':''||affected.id,');
  execute definition;
  definition:=pg_get_functiondef('private.emit_unit_notification(text,uuid,uuid,text,text,uuid,uuid,uuid)'::regprocedure);
  definition:=replace(definition,'target_key||'':''||target_cnes||'':''','target_key||'':''||coalesce(target_cnes::text,''global'')||'':''');
  execute definition;
  definition:=pg_get_functiondef('private.fill_audit_access_context()'::regprocedure);
  definition:=replace(definition,'coalesce(new.context_lotacao_id,selected_lotacao)','coalesce(new.context_lotacao_id,private.current_context_internal_lotacao())');
  execute definition;
  definition:=pg_get_functiondef('private.resolve_audit_subject(text,uuid,jsonb)'::regprocedure);
  definition:=replace(definition,'  elsif kind=''profile'' then',E'  elsif kind in (''bond_time_bank_entries'',''bond_time_bank_accounts'',''vacation_rights'') then\n    select servidor_id into person_id from public.employment_bonds where id=nullif(payload->>''bond_id'','''')::uuid;\n  elsif kind in (''time_bank_entries'',''time_bank_accounts'') then\n    select id into person_id from public.servidores where id=nullif(payload->>''servidor_id'','''')::uuid;\n  elsif kind=''employee_inclusion_request'' then\n    select servidor_id into person_id from public.employee_inclusion_requests where id=target_id;\n  elsif kind=''access_request'' then\n    select array_agg(s.id) into people from public.servidores s join public.access_requests a on a.auth_user_id=s.profile_id where a.id=target_id;\n    if cardinality(people)=1 then person_id:=people[1]; end if;\n  elsif kind=''profile'' then');
  execute definition;
end $$;

create function private.notify_period_mutation() returns trigger
language plpgsql security invoker set search_path='' as $$
declare req public.vacation_requests%rowtype; review record; owner_id uuid;
begin
  if tg_op='UPDATE' and (new.start_date,new.end_date,new.return_date,new.days) is not distinct from (old.start_date,old.end_date,old.return_date,old.days) then return new; end if;
  select * into req from public.vacation_requests where id=coalesce(new.request_id,old.request_id);
  if not found or req.status in ('rascunho','cancelada','rejeitada','concluida') then return coalesce(new,old); end if;
  select profile_id into owner_id from public.servidores where id=req.servidor_id;
  for review in select * from public.request_unit_reviews where request_id=req.id loop
    perform private.emit_unit_notification('period:'||txid_current()||':'||req.id,review.cnes_unit_id,review.lotacao_id,
      'Período da solicitação atualizado','O período foi alterado. Confira início, fim, retorno e responsabilidades; alterações não autorizam o afastamento automaticamente.',req.id,owner_id,req.context_bond_id);
  end loop;
  return coalesce(new,old);
end $$;
create trigger request_period_change_notify after update or delete on public.request_periods
for each row execute function private.notify_period_mutation();

create function private.notify_conflict_subjects() returns trigger
language plpgsql security invoker set search_path='' as $$
declare person record;
begin
  if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
  for person in select distinct s.profile_id,b.id bond_id from public.employment_bond_units u
    join public.employment_bonds b on b.id=u.bond_id join public.servidores s on s.id=b.servidor_id
    where u.cnes_unit_id=new.cnes_unit_id and u.internal_lotacao_id is not distinct from new.lotacao_id
      and (u.id=new.bond_unit_id or (new.bond_unit_id is null and exists(select 1 from public.request_day_responsibilities d
        join public.vacation_requests r on r.id=d.request_id where d.bond_unit_id=u.id
        and d.responsibility_date between new.start_date and new.end_date and r.status not in ('cancelada','rejeitada','rascunho','concluida'))))
  loop
    perform private.emit_employee_planning_notification('conflict-owner:'||new.id||':'||new.version,person.profile_id,person.bond_id,
      new.cnes_unit_id,new.lotacao_id,'Alerta de planejamento atualizado','A gestão registrou ou encerrou um alerta no seu contexto. Confira com o RH. O alerta não é recusa automática.',null);
  end loop;
  return new;
end $$;
create trigger manual_conflict_subjects_notify after insert or update of status on public.manual_calendar_conflicts
for each row execute function private.notify_conflict_subjects();

create index audit_scope_paging_idx on public.audit_events(context_cnes_unit_id,context_lotacao_id,occurred_at desc,id desc);
create index audit_event_paging_idx on public.audit_events(action,occurred_at desc,id desc);
create function public.complete_password_change(actor_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare before_data jsonb;
begin
  if not exists(select 1 from public.profiles where id=actor_id and disabled_at is null) then raise exception 'PASSWORD_ACCOUNT_UNAVAILABLE'; end if;
  perform set_config('sgf.audit_actor',actor_id::text,true);
  select jsonb_build_object('must_change_password',must_change_password) into before_data from public.profiles where id=actor_id for update;
  update public.profiles set must_change_password=false where id=actor_id;
  insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,previous_value,new_value)
    values(actor_id,private.actor_role(actor_id),'password_changed','profile',actor_id,before_data,'{"must_change_password":false}');
end $$;
revoke all on function public.complete_password_change(uuid) from public,anon,authenticated;
grant execute on function public.complete_password_change(uuid) to service_role;
-- Operações compostas do cadastro: se a trilha falhar, nenhuma parte é confirmada.
create function public.approve_admin_profile(actor_id uuid,target_request_id uuid,account_id uuid,target_roles public.app_role[],target_scope_ids uuid[]) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if private.actor_role(actor_id) is distinct from 'administrador'::public.app_role then raise exception 'ADMIN_REQUIRED'; end if;
  perform set_config('sgf.audit_actor',actor_id::text,true);
  perform public.approve_multi_bond_access(actor_id,target_request_id,account_id,target_roles,target_scope_ids);
  update public.profiles set must_change_password=true where id=account_id;
  insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,reason,new_value)
  values(actor_id,'administrador','user_created','profile',account_id,'Cadastro administrativo com múltiplos vínculos',jsonb_build_object('roles',target_roles,'scope_ids',target_scope_ids));
end $$;
create function public.update_admin_profile(actor_id uuid,target_profile_id uuid,target_roles public.app_role[],target_cpf text,target_scope_ids uuid[],target_location_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if private.actor_role(actor_id) is distinct from 'administrador'::public.app_role then raise exception 'ADMIN_REQUIRED'; end if;
  if not exists(select 1 from public.lotacoes where id=target_location_id and active) then raise exception 'INVALID_SCOPE'; end if;
  perform set_config('sgf.audit_actor',actor_id::text,true);
  perform public.set_profile_access(actor_id,target_profile_id,target_roles,target_cpf,target_scope_ids);
  update public.profiles set primary_lotacao_id=target_location_id where id=target_profile_id;
  update public.servidores set lotacao_id=target_location_id where profile_id=target_profile_id;
end $$;
revoke all on function public.approve_admin_profile(uuid,uuid,uuid,public.app_role[],uuid[]),public.update_admin_profile(uuid,uuid,public.app_role[],text,uuid[],uuid) from public,anon,authenticated;
grant execute on function public.approve_admin_profile(uuid,uuid,uuid,public.app_role[],uuid[]),public.update_admin_profile(uuid,uuid,public.app_role[],text,uuid[],uuid) to service_role;
create function private.protect_audit_history() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_user='service_role' then raise exception 'AUDIT_HISTORY_IMMUTABLE'; end if;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger audit_history_immutable before update or delete on public.audit_events
for each row execute function private.protect_audit_history();
revoke all on function private.protect_audit_history() from public,anon,authenticated;
grant execute on function private.protect_audit_history() to service_role;
revoke all on public.audit_events from public,anon,authenticated;
-- Funções internas não são endpoints públicos.
revoke all on function private.classify_notification_scope(),private.sanitize_audit_json(jsonb),private.complete_audit_subjects(),
  private.audit_domain_mutation(),private.notify_period_mutation(),private.notify_conflict_subjects() from public,anon,authenticated;
grant execute on function private.classify_notification_scope(),private.sanitize_audit_json(jsonb),private.complete_audit_subjects(),
  private.audit_domain_mutation(),private.notify_period_mutation(),private.notify_conflict_subjects() to service_role;
