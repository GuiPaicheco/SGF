alter table public.profiles add column institutional_cnes_unit_id uuid unique references public.cnes_units(id) on delete restrict;
create table private.rh_unit_accounts (
  cnes_unit_id uuid primary key references public.cnes_units(id) on delete restrict,
  login_name text not null unique,
  auth_user_id uuid not null unique default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete restrict,
  lotacao_id uuid not null references public.lotacoes(id) on delete restrict,
  internal_email text not null unique,
  enabled boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now()
);
create index rh_accounts_location_idx on private.rh_unit_accounts(lotacao_id);
create table private.rh_operator_grants (
  id uuid primary key default gen_random_uuid(),
  cnes_unit_id uuid not null references public.cnes_units(id) on delete restrict,
  entry_id uuid not null references private.cnes_registry_entries(id) on delete restrict,
  active boolean not null default true,
  version integer not null default 1,
  granted_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique(cnes_unit_id,entry_id)
);
create index rh_grants_entry_idx on private.rh_operator_grants(entry_id);
create index rh_grants_actor_idx on private.rh_operator_grants(granted_by);
create table private.rh_operator_sessions (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  grant_id uuid not null references private.rh_operator_grants(id) on delete restrict,
  grant_version integer not null,
  operator_name text not null,
  selected_at timestamptz not null default now()
);
create index rh_sessions_profile_idx on private.rh_operator_sessions(profile_id);
create index rh_sessions_grant_idx on private.rh_operator_sessions(grant_id);
alter table private.rh_unit_accounts enable row level security;
alter table private.rh_operator_grants enable row level security;
alter table private.rh_operator_sessions enable row level security;
revoke all on private.rh_unit_accounts,private.rh_operator_grants,private.rh_operator_sessions from public,anon,authenticated;
grant select,insert,update on private.rh_unit_accounts,private.rh_operator_grants,private.rh_operator_sessions to service_role;

create function public.prepare_rh_unit(actor_id uuid,target_cnes uuid,unit_login text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare unit public.cnes_units%rowtype; location_id uuid; slot private.rh_unit_accounts%rowtype;
begin
 perform private.require_cnes_import_admin(actor_id);
 select * into unit from public.cnes_units where id=target_cnes and active;
 if not found or length(unit_login) not between 3 and 80 then raise exception 'RH_UNIT_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('rh-unit:'||target_cnes::text,0));
 select l.id into location_id from public.lotacoes l join public.lotacao_cnes_units m on m.lotacao_id=l.id
 where m.cnes_unit_id=target_cnes and l.active and not l.is_internal_allocation and l.code=unit.code;
 if location_id is null then raise exception 'RH_LOCATION_REVIEW_REQUIRED';end if;
 insert into private.rh_unit_accounts(cnes_unit_id,login_name,lotacao_id,internal_email)
 values(target_cnes,unit_login,location_id,'sgf-rh-'||unit.code||'@accounts.invalid') on conflict(cnes_unit_id) do nothing;
 select * into slot from private.rh_unit_accounts where cnes_unit_id=target_cnes;
 if slot.login_name<>unit_login then raise exception 'RH_ACCOUNT_CONFLICT';end if;
 return to_jsonb(slot)||jsonb_build_object('code',unit.code);
end $$;

create function private.rh_auth_account_matches(actor_id uuid,target_user uuid,target_email text,target_cnes uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_cnes_import_admin(actor_id);
 return exists(select 1 from auth.users u join private.rh_unit_accounts a on a.auth_user_id=u.id
 join public.cnes_units c on c.id=a.cnes_unit_id where u.id=target_user and a.cnes_unit_id=target_cnes
 and u.email=target_email and a.internal_email=target_email and u.raw_app_meta_data->>'sgf_rh_cnes'=c.code);
end $$;

create function public.finish_rh_unit(actor_id uuid,target_cnes uuid,target_auth_user uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare slot private.rh_unit_accounts%rowtype;
begin
 perform private.require_cnes_import_admin(actor_id);
 perform pg_advisory_xact_lock(hashtextextended('rh-unit:'||target_cnes::text,0));
 select * into slot from private.rh_unit_accounts where cnes_unit_id=target_cnes for update;
 if not found or slot.auth_user_id<>target_auth_user or not private.rh_auth_account_matches(actor_id,target_auth_user,slot.internal_email,target_cnes) then raise exception 'RH_ACCOUNT_CONFLICT';end if;
 if slot.profile_id is not null then return jsonb_build_object('status','already_exists');end if;
 insert into public.profiles(id,full_name,role,roles,cpf,login_identifier,must_change_password,primary_lotacao_id,institutional_cnes_unit_id,email)
 values(target_auth_user,slot.login_name,'rh',array['rh']::public.app_role[],null,'rh-'||(select code from public.cnes_units where id=target_cnes),false,slot.lotacao_id,target_cnes,slot.internal_email)
 on conflict(id) do update set full_name=excluded.full_name,role='rh',roles=excluded.roles,cpf=null,
   login_identifier=excluded.login_identifier,must_change_password=false,primary_lotacao_id=excluded.primary_lotacao_id,
   institutional_cnes_unit_id=target_cnes,email=excluded.email;
 insert into public.profile_scopes(profile_id,lotacao_id) values(target_auth_user,slot.lotacao_id) on conflict do nothing;
 update private.rh_unit_accounts set profile_id=target_auth_user,version=version+1 where cnes_unit_id=target_cnes;
 insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_cnes_unit_id,new_value)
 values(actor_id,'administrador','rh_unit_provisioned','profile',target_auth_user,target_cnes,jsonb_build_object('login',slot.login_name));
 return jsonb_build_object('status','ready');
end $$;

create function public.rh_account_directory(actor_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 perform private.require_cnes_import_admin(actor_id);
 return coalesce((select jsonb_agg(jsonb_build_object('cnes',c.code,'cnes_id',c.id,'login',a.login_name,
   'profile_id',a.profile_id,'enabled',a.enabled,'version',a.version,'disabled',p.disabled_at is not null)
   order by c.name) from private.rh_unit_accounts a join public.cnes_units c on c.id=a.cnes_unit_id
   left join public.profiles p on p.id=a.profile_id),'[]');
end $$;

create function public.rh_account_context(target_profile uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'RH_NOT_ALLOWED';end if;
 return (select jsonb_build_object('role','rh','institutional',true,'cnes_unit_id',c.id,'cnes_code',c.code,
   'cnes_name',c.name,'lotacao_id',a.lotacao_id,'login_name',a.login_name)
   from private.rh_unit_accounts a join public.cnes_units c on c.id=a.cnes_unit_id and c.active
   join public.profiles p on p.id=a.profile_id and p.disabled_at is null and not p.must_change_password
   where a.profile_id=target_profile and a.enabled and p.institutional_cnes_unit_id=c.id and p.roles=array['rh']::public.app_role[]);
end $$;

create function private.rh_verified_session(target_profile uuid,target_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare context jsonb;
begin
 if (select auth.jwt()->>'role') is distinct from 'service_role' or not exists(select 1 from auth.sessions
   where id=target_session and user_id=target_profile and (not_after is null or not_after>now())) then raise exception 'RH_SESSION_INVALID';end if;
 context:=public.rh_account_context(target_profile);
 if context is null then raise exception 'RH_NOT_ALLOWED';end if;
 return context;
end $$;

create function public.rh_grant_operator(actor_id uuid,target_cnes uuid,target_entry uuid,grant_active boolean,expected_version integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare grant_row private.rh_operator_grants%rowtype;
begin
 perform private.require_cnes_import_admin(actor_id);
 if grant_active is null or expected_version is null then raise exception 'RH_INPUT_INVALID';end if;
 if not exists(select 1 from private.cnes_registry_entries e where e.id=target_entry and e.cnes_unit_id=target_cnes
   and (not grant_active or (lower(e.source_data->>'status')='ativo' and nullif(e.source_data->>'deactivationCompetence','') is null))) then raise exception 'RH_OPERATOR_OUT_OF_UNIT';end if;
 perform pg_advisory_xact_lock(hashtextextended('rh-grant:'||target_entry::text,0));
 select * into grant_row from private.rh_operator_grants where cnes_unit_id=target_cnes and entry_id=target_entry for update;
 if coalesce(grant_row.version,0)<>expected_version then raise exception 'RH_VERSION_CONFLICT';end if;
 insert into private.rh_operator_grants(cnes_unit_id,entry_id,active,granted_by)
 values(target_cnes,target_entry,grant_active,actor_id)
 on conflict(cnes_unit_id,entry_id) do update set active=excluded.active,granted_by=excluded.granted_by,
   version=rh_operator_grants.version+1,updated_at=now() returning * into grant_row;
 insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_cnes_unit_id,new_value)
 values(actor_id,'administrador','rh_operator_permission','cnes_registry',target_entry,target_cnes,jsonb_build_object('active',grant_active,'grant_id',grant_row.id));
 return jsonb_build_object('id',grant_row.id,'version',grant_row.version,'active',grant_row.active);
end $$;

create function public.rh_operator_candidates(actor_id uuid,target_cnes uuid,page_index integer default 0) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 perform private.require_cnes_import_admin(actor_id);
 if page_index is null or page_index not between 0 and 100 then raise exception 'RH_INPUT_INVALID';end if;
 return jsonb_build_object('entries',coalesce((select jsonb_agg(to_jsonb(r)) from (
   select e.id,coalesce(e.local_data->>'fullName',e.source_data->>'fullName') full_name,e.source_data->>'cbo' cbo,
     coalesce(g.active,false) authorized,coalesce(g.version,0) version,g.id grant_id
   from private.cnes_registry_entries e left join private.rh_operator_grants g on g.entry_id=e.id and g.cnes_unit_id=e.cnes_unit_id
   where e.cnes_unit_id=target_cnes and lower(e.source_data->>'status')='ativo'
     and nullif(e.source_data->>'deactivationCompetence','') is null order by e.created_at,e.id limit 50 offset page_index*50) r),'[]'),
   'total',(select count(*) from private.cnes_registry_entries e where e.cnes_unit_id=target_cnes
     and lower(e.source_data->>'status')='ativo' and nullif(e.source_data->>'deactivationCompetence','') is null));
end $$;

create function public.rh_session_state(target_profile uuid,target_session uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare context jsonb; operator_data jsonb;
begin
 context:=private.rh_verified_session(target_profile,target_session);
 select jsonb_build_object('id',g.id,'entry_id',e.id,'name',s.operator_name,'version',g.version) into operator_data
 from private.rh_operator_sessions s join private.rh_operator_grants g on g.id=s.grant_id and g.active and g.version=s.grant_version
 join private.cnes_registry_entries e on e.id=g.entry_id and e.cnes_unit_id=(context->>'cnes_unit_id')::uuid
 where s.session_id=target_session and s.profile_id=target_profile and lower(e.source_data->>'status')='ativo'
   and nullif(e.source_data->>'deactivationCompetence','') is null;
 return jsonb_build_object('context',context,'operator',operator_data,
   'operators',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',coalesce(e.local_data->>'fullName',e.source_data->>'fullName'),'cbo',e.source_data->>'cbo') order by e.source_data->>'fullName')
     from private.rh_operator_grants g join private.cnes_registry_entries e on e.id=g.entry_id and e.cnes_unit_id=g.cnes_unit_id
     where g.cnes_unit_id=(context->>'cnes_unit_id')::uuid and g.active and lower(e.source_data->>'status')='ativo'
       and nullif(e.source_data->>'deactivationCompetence','') is null),'[]'));
end $$;

create function public.rh_select_operator(target_profile uuid,target_session uuid,target_grant uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare context jsonb; chosen record;
begin
 context:=private.rh_verified_session(target_profile,target_session);
 select g.id,g.version,coalesce(e.local_data->>'fullName',e.source_data->>'fullName') full_name into chosen
 from private.rh_operator_grants g join private.cnes_registry_entries e on e.id=g.entry_id and e.cnes_unit_id=g.cnes_unit_id
 where g.id=target_grant and g.active and g.cnes_unit_id=(context->>'cnes_unit_id')::uuid
 and lower(e.source_data->>'status')='ativo' and nullif(e.source_data->>'deactivationCompetence','') is null for share of g;
 if not found then raise exception 'RH_OPERATOR_OUT_OF_UNIT';end if;
 insert into private.rh_operator_sessions(session_id,profile_id,grant_id,grant_version,operator_name)
 values(target_session,target_profile,chosen.id,chosen.version,chosen.full_name)
 on conflict(session_id) do update set grant_id=excluded.grant_id,grant_version=excluded.grant_version,operator_name=excluded.operator_name,selected_at=now();
 insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_cnes_unit_id,new_value)
 values(target_profile,'rh','rh_operator_selected','rh_operator',chosen.id,(context->>'cnes_unit_id')::uuid,
 jsonb_build_object('operator_name',chosen.full_name,'operator_grant_id',chosen.id,'declared_identity',true));
 return public.rh_session_state(target_profile,target_session);
end $$;

create function public.rh_unit_registry(target_profile uuid,target_session uuid,page_index integer default 0) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare selection jsonb; unit_id uuid;
begin
 selection:=public.rh_session_state(target_profile,target_session);
 if selection->'operator'='null'::jsonb then raise exception 'RH_OPERATOR_REQUIRED';end if;
 if page_index is null or page_index not between 0 and 100 then raise exception 'RH_INPUT_INVALID';end if;
 unit_id:=(selection->'context'->>'cnes_unit_id')::uuid;
 return jsonb_build_object('operator',selection->'operator','context',selection->'context',
   'entries',coalesce((select jsonb_agg(to_jsonb(r)) from (
     select e.id,coalesce(e.local_data->>'fullName',e.source_data->>'fullName') full_name,e.local_data->>'registration' registration,
       e.local_data->>'municipalPosition' position,e.source_data->>'cbo' cbo,coalesce(e.local_data->'weeklyHours',e.source_data->'weeklyHours') weekly_hours,
       e.local_data->>'teamLabel' team_label,e.source_data->'teams' teams,e.review_status
     from private.cnes_registry_entries e where e.cnes_unit_id=unit_id order by e.created_at,e.id limit 50 offset page_index*50) r),'[]'),
   'total',(select count(*) from private.cnes_registry_entries where cnes_unit_id=unit_id));
end $$;

grant delete on private.rh_operator_sessions to service_role;
create function public.rh_clear_operator(target_profile uuid,target_session uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 perform private.rh_verified_session(target_profile,target_session);
 insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,new_value)
 select target_profile,'rh','rh_operator_cleared','rh_operator',grant_id,
 jsonb_build_object('operator_name',operator_name,'declared_identity',true)
 from private.rh_operator_sessions where session_id=target_session and profile_id=target_profile;
 delete from private.rh_operator_sessions where session_id=target_session and profile_id=target_profile;
 return public.rh_session_state(target_profile,target_session);
end $$;

create function private.rh_revoke_auth_sessions(actor_id uuid,target_cnes uuid) returns void
language plpgsql security definer set search_path='' as $$
declare target_user uuid;
begin
 perform private.require_cnes_import_admin(actor_id);
 select a.profile_id into target_user from private.rh_unit_accounts a join public.profiles p on p.id=a.profile_id
 and p.institutional_cnes_unit_id=a.cnes_unit_id where a.cnes_unit_id=target_cnes for update of a;
 if target_user is null then raise exception 'RH_UNIT_INVALID';end if;
 delete from auth.sessions where user_id=target_user;
end $$;
create function public.rh_invalidate_sessions(actor_id uuid,target_cnes uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 perform private.rh_revoke_auth_sessions(actor_id,target_cnes);
 insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_cnes_unit_id)
 values(actor_id,'administrador','rh_sessions_revoked','cnes_unit',target_cnes,target_cnes);
 return jsonb_build_object('ok',true);
end $$;
create function public.rh_set_account_status(actor_id uuid,target_cnes uuid,target_enabled boolean,expected_version integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare account private.rh_unit_accounts%rowtype;
begin
 perform private.require_cnes_import_admin(actor_id);
 select * into account from private.rh_unit_accounts where cnes_unit_id=target_cnes for update;
 if not found or account.profile_id is null or target_enabled is null then raise exception 'RH_UNIT_INVALID';end if;
 if account.version<>expected_version then raise exception 'RH_VERSION_CONFLICT';end if;
 perform private.rh_revoke_auth_sessions(actor_id,target_cnes);
 update private.rh_unit_accounts set enabled=target_enabled,version=version+1 where cnes_unit_id=target_cnes;
 update public.profiles set disabled_at=case when target_enabled then null else now() end where id=account.profile_id;
 insert into public.audit_events(actor_id,actor_role,action,entity_type,entity_id,context_cnes_unit_id,new_value)
 values(actor_id,'administrador','rh_account_status','profile',account.profile_id,target_cnes,jsonb_build_object('enabled',target_enabled));
 return jsonb_build_object('ok',true);
end $$;

-- Contas institucionais nunca executam o fluxo legado, mesmo com cabeçalho forjado.
create or replace function private.actor_role(actor_id uuid) returns public.app_role
language plpgsql stable security definer set search_path='' as $$
declare selected text; granted public.app_role[];
begin
 select roles into granted from public.profiles where id=actor_id and disabled_at is null and not must_change_password and institutional_cnes_unit_id is null;
 if granted is null then return null;end if;
 selected:=nullif(current_setting('request.headers',true),'')::jsonb->>'x-sgf-role';
 if selected in ('servidor','diretor','rh','administrador') and selected::public.app_role=any(granted) then return selected::public.app_role;end if;
 if selected is null and cardinality(granted)=1 then return granted[1];end if;return null;
end $$;

create function private.protect_institutional_profile() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.institutional_cnes_unit_id is not null and (new.institutional_cnes_unit_id is distinct from old.institutional_cnes_unit_id
   or new.roles<>array['rh']::public.app_role[] or new.role<>'rh' or new.cpf is not null
   or new.must_change_password or new.login_identifier is distinct from old.login_identifier
   or new.primary_lotacao_id is distinct from old.primary_lotacao_id) then raise exception 'RH_ACCOUNT_MANAGED_SEPARATELY';end if;
 return new;
end $$;
create trigger protect_institutional_profile before update on public.profiles for each row execute function private.protect_institutional_profile();

-- Todas as RPCs novas só podem ser chamadas pelo backend, após getUser e revalidação.
do $$ declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where (n.nspname='public' and p.proname in ('prepare_rh_unit','finish_rh_unit','rh_account_directory','rh_account_context','rh_grant_operator','rh_operator_candidates','rh_session_state','rh_select_operator','rh_unit_registry','rh_clear_operator','rh_invalidate_sessions','rh_set_account_status'))
     or (n.nspname='private' and p.proname in ('rh_verified_session','rh_auth_account_matches','rh_revoke_auth_sessions','protect_institutional_profile')) loop
   execute format('revoke all on function %s from public,anon,authenticated',f.sig);
   execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
