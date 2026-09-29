import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const allowedRoles = ['servidor', 'diretor', 'rh', 'administrador'];

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
    const { data: actor } = await admin.from('profiles').select('role,must_change_password').eq('id', identity.user.id).single();
    if (!actor || actor.role !== 'administrador' || actor.must_change_password) return json({ error: 'Acesso exclusivo do administrador.' }, 403);
    const payload = await request.json();
    const action = String(payload.action ?? 'list');

    if (action === 'list') {
      const [{ data: profiles, error: profileError }, { data: locations, error: locationError }] = await Promise.all([
        admin.from('profiles').select('id,full_name,role,login_identifier,must_change_password,servidor:servidores(matricula,active,lotacao:lotacoes(id,code,name)),scopes:profile_scopes(lotacao:lotacoes(id,code,name))').order('full_name'),
        admin.from('lotacoes').select('id,code,name,unit_type').eq('active', true).order('name'),
      ]);
      if (profileError || locationError) throw profileError || locationError;
      return json({ profiles, locations });
    }

    if (action !== 'update') return json({ error: 'Ação inválida.' }, 400);
    const targetId = String(payload.profile_id ?? '');
    const role = String(payload.role ?? '');
    const identifier = String(payload.identifier ?? '').trim().toLowerCase() || null;
    const scopes = Array.isArray(payload.scope_ids) ? [...new Set(payload.scope_ids.map(String))] : [];
    if (!targetId || !allowedRoles.includes(role)) return json({ error: 'Perfil ou papel inválido.' }, 400);
    const { error } = await admin.rpc('manage_profile_access', {
      actor_id: identity.user.id,
      target_profile_id: targetId,
      target_role: role,
      target_identifier: identifier,
      target_scope_ids: scopes,
    });
    if (error) {
      if (error.message.includes('SELF_ROLE_CHANGE_BLOCKED')) return json({ error: 'O administrador não pode alterar o próprio perfil por esta tela.' }, 409);
      if (error.message.includes('IDENTIFIER_REQUIRED')) return json({ error: 'Informe um identificador para o acesso à gestão.' }, 400);
      if (error.message.includes('SCOPE_REQUIRED')) return json({ error: 'Selecione ao menos uma lotação para diretor ou RH.' }, 400);
      if (error.message.includes('LEGACY_ROLE_DISABLED')) return json({ error: 'O perfil Gerência foi substituído por Diretor.' }, 400);
      if (error.message.includes('duplicate key')) return json({ error: 'Este identificador já está em uso.' }, 409);
      throw error;
    }
    const { data: authUser } = await admin.auth.admin.getUserById(targetId);
    if (authUser.user) {
      const current = authUser.user.app_metadata || {};
      await admin.auth.admin.updateUserById(targetId, { app_metadata: { ...current, app_role: role, role } });
    }
    return json({ ok: true });
  } catch (error) {
    console.error('manage-profiles', error);
    return json({ error: 'Não foi possível atualizar o perfil.' }, 500);
  }
});
