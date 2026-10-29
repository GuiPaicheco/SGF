import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { contextHeaders, validateAccessContext } from '../_shared/access-context.ts';
import { validCalendarInput } from '../_shared/calendar-input.mjs';
import { actionAllowed } from '../_shared/action-policy.ts';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sgf-role, x-sgf-bond, x-sgf-cnes, x-sgf-lotacao',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Sessão inválida.' }, 401);
    const { data: identity, error: identityError } = await admin.auth.getUser(token);
    if (identityError || !identity.user) return json({ error: 'Sessão inválida ou expirada.' }, 401);
    const { data: actor } = await admin.from('profiles').select('roles,must_change_password,disabled_at').eq('id', identity.user.id).single();
    const actorRole = request.headers.get('x-sgf-role') || '';
    if (!actor?.roles?.includes(actorRole) || !['administrador', 'rh'].includes(actorRole) || actor.must_change_password || actor.disabled_at) return json({ error: 'Acesso exclusivo do administrador e RH.' }, 403);
    const context = await validateAccessContext(admin, request, identity.user.id, actor.roles || []);
    const scoped = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { ...contextHeaders(context), 'x-sgf-actor': identity.user.id } } });
    const payload = await request.json();
    const action = String(payload.action ?? 'list');
    if(!['calendar-list','calendar-save','calendar-delete','calendar-preview'].includes(action))return json({error:'Esta configuração foi retirada. Utilize Cadastro das unidades para atualizar pelo CNES.'},410);
    if(!actionAllowed('catalogs',action,context.role)) return json({error:'Seu perfil não permite executar esta ação.'},403);
    const scopeIds = context.global ? [] : [context.lotacaoId!];
    const employeesInContext = async () => {
      if (context.global) return null;
      let assignments = admin.from('employment_bond_units').select('bond:employment_bonds!employment_bond_units_bond_id_fkey(servidor_id)').eq('active', true);
      const { data: location, error: locationError } = await admin.from('lotacoes').select('is_internal_allocation').eq('id', context.lotacaoId).single();
      if (locationError || !location) throw new Error('INVALID_ACCESS_CONTEXT');
      const { data: mappings, error: mappingsError } = await admin.from('lotacao_cnes_units').select('cnes_unit_id').eq('lotacao_id', context.lotacaoId);
      if (mappingsError) throw mappingsError;
      const cnesIds = (mappings || []).map(item=>item.cnes_unit_id).filter(id=>!context.cnesUnitId || id===context.cnesUnitId);
      if (!cnesIds.length) return [];
      assignments = assignments.in('cnes_unit_id', cnesIds);
      assignments = location.is_internal_allocation ? assignments.eq('internal_lotacao_id', context.lotacaoId) : assignments.is('internal_lotacao_id', null);
      const { data, error } = await assignments;
      if (error) throw error;
      return [...new Set((data || []).map(item => (Array.isArray(item.bond) ? item.bond[0] : item.bond)?.servidor_id).filter(Boolean))];
    };
    if (action === 'organization-list') {
      const [units, teams, types, mappings] = await Promise.all([
        admin.from('cnes_units').select('id,code,name,active,version').order('name'),
        admin.from('teams').select('id,cnes_unit_id,type_code,team_number,ine_code,name,active,needs_review,source_reference,version').order('name'),
        admin.from('team_types').select('code,name').eq('active',true),
        admin.from('lotacao_cnes_units').select('lotacao_id,cnes_unit_id,is_primary'),
      ]);
      if (units.error || teams.error || types.error || mappings.error) throw units.error || teams.error || types.error || mappings.error;
      return json({cnesUnits:units.data,teams:teams.data,teamTypes:types.data,mappings:mappings.data});
    }
    if (action === 'organization-save') {
      const {data,error}=await scoped.rpc('save_organization_registry',{actor_id:identity.user.id,registry_kind:payload.kind,item:payload.item});
      if(error) throw error;
      return json({id:data});
    }
    if(action==='calendar-list'){
      const [events,units]=await Promise.all([admin.from('calendar_events').select('id,event_date,type,name,active,version,scope,unit_ids,jurisdiction,source_url').order('event_date',{ascending:false}).limit(2001),admin.from('cnes_units').select('id,code,name').eq('active',true).order('name')]);
      if(events.error||units.error)throw events.error||units.error;
      if(events.data.length>2000)return json({error:'Há mais de 2000 datas. Solicite uma consulta segmentada à TI.'},400);
      return json({events:events.data,units:units.data});
    }
    if(action==='calendar-save'||(action==='calendar-preview'&&payload.operation==='save')){
      if(!validCalendarInput(payload))return json({error:'Confira a data, nome, classificação, fonte oficial e abrangência.'},400);
    }
    if(['calendar-save','calendar-delete','calendar-preview'].includes(action)){
      if(action==='calendar-preview'&&!['save','delete'].includes(payload.operation))return json({error:'Operação inválida.'},400);
      const {data,error}=await scoped.rpc(action==='calendar-preview'?'preview_scoped_calendar_event':'manage_scoped_calendar_event',{actor_id:identity.user.id,operation:action==='calendar-preview'?payload.operation:action==='calendar-delete'?'delete':'save',target_id:payload.id||null,expected_version:payload.version||null,item:payload});
      if(error)throw error;return json(data);
    }
    if (action === 'list') {
      let employeeQuery = admin.from('servidores').select('id,full_name,matricula,cpf,birth_date,admission_date,employment_type,weekly_hours,team_name,active,profile_id,lotacao:lotacoes!servidores_lotacao_id_fkey(id,code,name),cargo:cargos(id,name),funcao:funcoes(id,name)').order('full_name');
      let locationQuery = admin.from('lotacoes').select('id,code,name,unit_type,parent_id,is_internal_allocation,active,version').order('name');
      if (actorRole === 'rh') {
        const employeeIds = await employeesInContext();
        employeeQuery = employeeQuery.in('id', employeeIds?.length ? employeeIds : ['00000000-0000-0000-0000-000000000000']);
        locationQuery = locationQuery.eq('id', context.lotacaoId);
      }
      const [employeesResult, locationsResult, positionsResult, functionsResult, profilesResult, scopesResult] = await Promise.all([
        employeeQuery, locationQuery,
        admin.from('cargos').select('id,name').order('name'),
        admin.from('funcoes').select('id,name').order('name'),
        actorRole === 'administrador' ? admin.from('profiles').select('id,full_name,roles').overlaps('roles', ['rh','diretor']).is('disabled_at',null).order('full_name') : Promise.resolve({ data: [] }),
        actorRole === 'administrador' ? admin.from('profile_scopes').select('profile_id,lotacao_id') : Promise.resolve({ data: [] }),
      ]);
      const error = employeesResult.error || locationsResult.error || positionsResult.error || functionsResult.error;
      if (error) throw error;
      const employees = employeesResult.data || [];
      const {data:bonds,error:bondError}=await scoped.rpc('list_bond_registry',{actor_id:identity.user.id});
      if(bondError) throw bondError;
      return json({ employees, bonds:bonds || [], locations: locationsResult.data, positions: positionsResult.data, functions: functionsResult.data, managers: profilesResult.data, managerScopes: scopesResult.data, actorRole });
    }
    if (action === 'history') {
      const employeeId = String(payload.id ?? '');
      if (!employeeId) return json({ error: 'Servidor inválido.' }, 400);
      const allowedEmployees = await employeesInContext();
      if (actorRole === 'rh' && !allowedEmployees?.includes(employeeId)) return json({ error: 'Servidor fora do contexto ativo.' }, 403);
      const { data, error } = await admin.from('employee_assignment_history').select('id,previous_employment_type,new_employment_type,previous_team,new_team,previous_active,new_active,reason,changed_at,changed_by:profiles(full_name),previous_lotacao:lotacoes!employee_assignment_history_previous_lotacao_id_fkey(name),new_lotacao:lotacoes!employee_assignment_history_new_lotacao_id_fkey(name),previous_cargo:cargos!employee_assignment_history_previous_cargo_id_fkey(name),new_cargo:cargos!employee_assignment_history_new_cargo_id_fkey(name),previous_funcao:funcoes!employee_assignment_history_previous_funcao_id_fkey(name),new_funcao:funcoes!employee_assignment_history_new_funcao_id_fkey(name)').eq('servidor_id', employeeId).order('changed_at', { ascending: false });
      if (error) throw error;
      return json({ history: data || [] });
    }
    if (action === 'save-location') {
      const { data, error } = await scoped.rpc('save_organization_registry', { actor_id: identity.user.id, registry_kind:'location', item:payload });
      if (error) throw error; return json({ id: data });
    }
    if (action === 'save-reference') {
      const { data, error } = await scoped.rpc('manage_reference_registry', { actor_id: identity.user.id, registry_kind: String(payload.kind ?? ''), target_id: payload.id || null, target_name: String(payload.name ?? '') });
      if (error) throw error; return json({ id: data });
    }
    if (action === 'save-employee') {
      if (!context.global && payload.lotacao_id !== context.lotacaoId) return json({ error: 'A lotação informada está fora do contexto ativo.' }, 403);
      const { data, error } = await scoped.rpc('manage_employee_registry', {
        actor_id: identity.user.id, target_id: payload.id || null,
        target_full_name: String(payload.full_name ?? ''), target_registration: String(payload.registration ?? ''),
        target_cpf: digits(payload.cpf), target_birth_date: payload.birth_date || null,
        target_admission_date: payload.admission_date || null, target_employment_type: String(payload.employment_type ?? ''),
        target_lotacao_id: payload.lotacao_id || null, target_cargo_id: payload.cargo_id || null,
        target_funcao_id: payload.funcao_id || null, target_weekly_hours: payload.weekly_hours ? Number(payload.weekly_hours) : null,
        target_active: payload.active !== false, target_reason: String(payload.reason ?? ''),
        target_team: String(payload.team ?? 'Não se aplica'),
      });
      if (error) throw error; return json({ id: data });
    }
    return json({ error: 'Ação inválida.' }, 400);
  } catch (error) {
    console.error('manage-catalogs: operação recusada');
    const message = error instanceof Error ? error.message : String((error as {message?:string})?.message || '');
    if (message.includes('REGISTRY_VERSION_CONFLICT')) return json({error:'O cadastro mudou em outra sessão. Atualize antes de salvar.'},409);
    if (/CNES_REQUIRED|CNES_INVALID/.test(message)) return json({error:'Selecione um CNES ativo e válido (sete dígitos).'},400);
    if (message.includes('CNES_CODE_IMMUTABLE')) return json({error:'O código CNES identifica a unidade e não pode ser substituído. Cadastre a unidade correta.'},400);
    if (message.includes('INE_SOURCE_REQUIRED')) return json({error:'Informe o INE válido e a referência oficial usada na conferência.'},400);
    if (message.includes('TEAM_DUPLICATED')) return json({error:'Esta equipe já existe no CNES selecionado.'},409);
    if (/ALLOCATION_IN_USE|SECRETARIAT_IN_USE|TEAM_IN_USE/.test(message)) return json({error:'Esta alteração invalidaria atuações existentes. Regularize os vínculos antes de mudar a estrutura.'},409);
    if (/INTERNAL_ALLOCATION_REQUIRES_SECRETARIAT|PARENT_CYCLE|PARENT_NOT_FOUND|TEAM_TYPE_INVALID|INVALID_RESPONSIBLE/.test(message)) return json({error:'Confira Secretaria superior, hierarquia, tipo de equipe e responsáveis ativos.'},400);
    if (/CALENDAR_INPUT_INVALID|CALENDAR_SCOPE_INVALID/.test(message)) return json({error:'Confira a data, a classificação, a abrangência e as unidades selecionadas.'},400);
    if(message.includes('CALENDAR_PREVIEW_CHANGED'))return json({error:'O calendário ou os registros mudaram. Gere e confira outra prévia.'},409);
    if(message.includes('RH_CALENDAR_STARTED_REVIEW_REQUIRED'))return json({error:'A mudança afetaria férias iniciadas ou passadas. É necessária revisão administrativa; nenhuma alteração foi gravada.'},409);
    if (message.includes('RH_DAYOFF_RECALC_CONFLICT'))return json({error:'A alteração criaria conflito entre afastamentos ou parcelas. Ajuste a programação antes de salvar; nenhuma alteração foi gravada.'},409);
    if (message.includes('CALENDAR_DUPLICATED'))return json({error:'Já existe uma data desse tipo para a abrangência selecionada.'},409);
    if (message.includes('CALENDAR_NOT_FOUND'))return json({error:'Data não encontrada. Atualize a lista.'},404);
    if (message.includes('CALENDAR_VERSION_CONFLICT')) return json({ error: 'Outro administrador alterou esta data. Atualize o calendário antes de salvar.' }, 409);
    if (message === 'INVALID_ACCESS_CONTEXT') return json({ error: 'Selecione novamente o perfil e o local de atuação.' }, 403);
    if (message.includes('duplicate key')) return json({ error: 'Já existe um cadastro com estes dados.' }, 409);
    if (message.includes('SCOPE')) return json({ error: 'A lotação informada está fora do seu escopo.' }, 403);
    if (message.includes('REASON_REQUIRED')) return json({ error: 'Informe o motivo da alteração.' }, 400);
    if (message.includes('ADMIN_REQUIRED')) return json({ error: 'Somente o administrador pode alterar lotações.' }, 403);
    return json({ error: 'Não foi possível salvar o cadastro.' }, 500);
  }
});
