import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { contextHeaders, validateAccessContext } from '../_shared/access-context.ts';
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

    if (action === 'calendar-list') {
      if (actorRole !== 'administrador') return json({ error: 'Acesso exclusivo do administrador.' }, 403);
      const { data, error } = await admin.from('calendar_events').select('id,event_date,type,name,active,version').order('event_date', { ascending: false }).limit(150);
      if (error) throw error;
      return json({ events: data || [] });
    }
    if (action === 'calendar-save') {
      if (actorRole !== 'administrador') return json({ error: 'Acesso exclusivo do administrador.' }, 403);
      const eventDate = String(payload.event_date || ''), type = String(payload.type || ''), name = String(payload.name || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !Number.isFinite(Date.parse(eventDate)) || new Date(eventDate).toISOString().slice(0,10) !== eventDate || !['feriado', 'ponto_facultativo'].includes(type) || !name || name.length>200) return json({ error: 'Informe uma data válida, tipo e nome do evento (até 200 caracteres).' }, 400);
      const { data, error } = await scoped.rpc('save_planning_calendar_event', {
        actor_id: identity.user.id, target_id: payload.id || null, target_date: eventDate,
        target_type: type, target_name: name, target_active: payload.active !== false,
        expected_version: payload.version || null,
      });
      if (error) throw error;
      return json({ id: data.id });
    }

    if (action === 'list') {
      let employeeQuery = admin.from('servidores').select('id,full_name,matricula,cpf,birth_date,admission_date,employment_type,weekly_hours,team_name,active,profile_id,lotacao:lotacoes!servidores_lotacao_id_fkey(id,code,name),cargo:cargos(id,name),funcao:funcoes(id,name)').order('full_name');
      let locationQuery = admin.from('lotacoes').select('id,code,name,unit_type,parent_id,active').order('name');
      if (actorRole === 'rh') {
        const employeeIds = await employeesInContext();
        employeeQuery = employeeQuery.in('id', employeeIds?.length ? employeeIds : ['00000000-0000-0000-0000-000000000000']);
        locationQuery = locationQuery.eq('id', context.lotacaoId);
      }
      const [employeesResult, locationsResult, positionsResult, functionsResult, profilesResult, scopesResult] = await Promise.all([
        employeeQuery, locationQuery,
        admin.from('cargos').select('id,name').order('name'),
        admin.from('funcoes').select('id,name').order('name'),
        actorRole === 'administrador' ? admin.from('profiles').select('id,full_name,roles').contains('roles', ['rh']).order('full_name') : Promise.resolve({ data: [] }),
        actorRole === 'administrador' ? admin.from('profile_scopes').select('profile_id,lotacao_id') : Promise.resolve({ data: [] }),
      ]);
      const error = employeesResult.error || locationsResult.error || positionsResult.error || functionsResult.error;
      if (error) throw error;
      return json({ employees: employeesResult.data, locations: locationsResult.data, positions: positionsResult.data, functions: functionsResult.data, managers: profilesResult.data, managerScopes: scopesResult.data, actorRole });
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
      const { data, error } = await scoped.rpc('manage_location_registry', { actor_id: identity.user.id, target_id: payload.id || null, target_name: String(payload.name ?? ''), target_code: String(payload.code ?? ''), target_unit_type: String(payload.unit_type ?? 'unidade'), target_parent_id: payload.parent_id || null, target_active: payload.active !== false, responsible_ids: Array.isArray(payload.responsible_ids) ? payload.responsible_ids : [] });
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
    console.error('manage-catalogs', error);
    const message = error instanceof Error ? error.message : String((error as {message?:string})?.message || '');
    if (message.includes('CALENDAR_VERSION_CONFLICT')) return json({ error: 'Outro administrador alterou esta data. Atualize o calendário antes de salvar.' }, 409);
    if (message === 'INVALID_ACCESS_CONTEXT') return json({ error: 'Selecione novamente o perfil e o local de atuação.' }, 403);
    if (message.includes('duplicate key')) return json({ error: 'Já existe um cadastro com estes dados.' }, 409);
    if (message.includes('SCOPE')) return json({ error: 'A lotação informada está fora do seu escopo.' }, 403);
    if (message.includes('REASON_REQUIRED')) return json({ error: 'Informe o motivo da alteração.' }, 400);
    if (message.includes('ADMIN_REQUIRED')) return json({ error: 'Somente o administrador pode alterar lotações.' }, 403);
    return json({ error: 'Não foi possível salvar o cadastro.' }, 500);
  }
});
