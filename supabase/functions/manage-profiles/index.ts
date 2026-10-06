import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-sgf-role',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const allowedRoles = ['servidor', 'diretor', 'rh', 'administrador'];
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const validCPF = (value: string) => {
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  for (let length = 9; length <= 10; length++) {
    const sum = [...value.slice(0, length)].reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    if (Number(value[length]) !== (sum * 10 % 11) % 10) return false;
  }
  return true;
};
const institutionalEmail = (value: string) => /^[^\s@]+@betim\.mg\.gov\.br$/i.test(value);
const temporaryPassword = () => '123456';

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
    if (!actor?.roles?.includes('administrador') || request.headers.get('x-sgf-role') !== 'administrador' || actor.must_change_password || actor.disabled_at) return json({ error: 'Acesso exclusivo do administrador.' }, 403);
    const payload = await request.json();
    const action = String(payload.action ?? 'list');

    if (action === 'list') {
      const [{ data: profiles, error: profileError }, { data: locations, error: locationError }] = await Promise.all([
        admin.from('profiles').select('id,full_name,cpf,roles,must_change_password,disabled_at,primary_lotacao_id,primary_lotacao:lotacoes!profiles_primary_lotacao_id_fkey(id,code,name),servidor:servidores(matricula,active,lotacao:lotacoes!servidores_lotacao_id_fkey(id,code,name)),scopes:profile_scopes(lotacao:lotacoes!profile_scopes_lotacao_id_fkey(id,code,name))').order('full_name'),
        admin.from('lotacoes').select('id,code,name,unit_type').eq('active', true).order('name'),
      ]);
      if (profileError || locationError) throw profileError || locationError;
      const enriched = await Promise.all((profiles || []).map(async profile => {
        const { data } = await admin.auth.admin.getUserById(profile.id);
        return { ...profile, email: data.user?.email || '' };
      }));
      return json({ profiles: enriched, locations });
    }

    if (action === 'set-my-location') {
      const locationId = String(payload.lotacao_id || '');
      const { data: location } = await admin.from('lotacoes').select('id').eq('id', locationId).eq('active', true).maybeSingle();
      if (!location) return json({ error: 'Selecione uma lotação ativa.' }, 400);
      const { error } = await admin.from('profiles').update({ primary_lotacao_id: location.id }).eq('id', identity.user.id);
      if (error) throw error;
      await admin.from('audit_events').insert({ actor_id: identity.user.id, action: 'own_location_set', entity_type: 'profile', entity_id: identity.user.id, new_value: { lotacao_id: location.id } });
      return json({ ok: true });
    }

    if (action === 'create') {
      const name = String(payload.full_name || '').trim(), email = String(payload.email || '').trim().toLowerCase();
      const cpf = digits(payload.cpf), registration = String(payload.registration || '').trim().toUpperCase();
      const birthDate = String(payload.birth_date || ''), locationId = String(payload.lotacao_id || '');
      const roles: string[] = Array.isArray(payload.roles) ? [...new Set<string>(payload.roles.map(String))] : [];
      if (!name || !institutionalEmail(email) || !validCPF(cpf) || !registration || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !roles.length || roles.some(role => !allowedRoles.includes(role))) return json({ error: 'Confira nome, e-mail institucional, CPF, matrícula, nascimento e acessos.' }, 400);
      const { data: location } = await admin.from('lotacoes').select('id').eq('id', locationId).eq('active', true).maybeSingle();
      if (!location) return json({ error: 'Selecione uma lotação ativa.' }, 400);
      const { data: duplicate } = await admin.from('profiles').select('id').eq('cpf', cpf).maybeSingle();
      if (duplicate) return json({ error: 'Este CPF já possui conta. Edite os acessos da conta existente.' }, 409);
      const initialPassword = temporaryPassword();
      const { data: created, error: authError } = await admin.auth.admin.createUser({ email, password: initialPassword, email_confirm: true, user_metadata: { full_name: name }, app_metadata: { app_roles: roles } });
      if (authError || !created.user) return json({ error: authError?.message || 'Não foi possível criar a conta. Confira a política de senhas do Supabase.' }, 400);
      const accountId = created.user.id;
      try {
        const primaryRole = roles.includes('administrador') ? 'administrador' : roles.includes('rh') ? 'rh' : roles.includes('diretor') ? 'diretor' : 'servidor';
        const { error: profileError } = await admin.from('profiles').insert({ id: accountId, full_name: name, cpf, role: primaryRole, roles, login_identifier: registration.toLowerCase(), primary_lotacao_id: locationId, must_change_password: true });
        if (profileError) throw profileError;
        const { error: employeeError } = await admin.from('servidores').insert({ profile_id: accountId, full_name: name, matricula: registration, cpf, birth_date: birthDate, lotacao_id: locationId, employment_type: String(payload.employment_type || 'pendente'), team_name: String(payload.team || 'Não se aplica').trim() || 'Não se aplica', active: true, declared_position: String(payload.position || '') });
        if (employeeError) throw employeeError;
        if (roles.some(role => ['diretor', 'rh'].includes(role))) {
          const { error: scopeError } = await admin.from('profile_scopes').insert({ profile_id: accountId, lotacao_id: locationId });
          if (scopeError) throw scopeError;
        }
        await admin.from('audit_events').insert({ actor_id: identity.user.id, action: 'user_created', entity_type: 'profile', entity_id: accountId, new_value: { roles, lotacao_id: locationId } });
        return json({ ok: true, id: accountId, temporary_password: initialPassword });
      } catch (error) {
        await admin.auth.admin.deleteUser(accountId);
        throw error;
      }
    }

    if (action === 'reset-password' || action === 'deactivate') {
      const targetId = String(payload.profile_id || '');
      if (!targetId || targetId === identity.user.id) return json({ error: 'Não é possível executar esta ação na própria conta.' }, 400);
      const { data: target } = await admin.from('profiles').select('id,roles,disabled_at').eq('id', targetId).maybeSingle();
      if (!target || target.disabled_at) return json({ error: 'Conta indisponível.' }, 404);
      if (action === 'reset-password') {
        const initialPassword = temporaryPassword();
        const { error } = await admin.auth.admin.updateUserById(targetId, { password: initialPassword });
        if (error) return json({ error: error.message }, 400);
        const { error: profileError } = await admin.from('profiles').update({ must_change_password: true }).eq('id', targetId);
        if (profileError) throw profileError;
        await admin.from('audit_events').insert({ actor_id: identity.user.id, action: 'password_reset', entity_type: 'profile', entity_id: targetId });
        return json({ ok: true, temporary_password: initialPassword });
      }
      if (target.roles?.includes('administrador')) {
        const { data: others } = await admin.from('profiles').select('id').contains('roles', ['administrador']).is('disabled_at', null).neq('id', targetId);
        if (!others?.length) return json({ error: 'Mantenha ao menos um administrador ativo.' }, 409);
      }
      const { error: banError } = await admin.auth.admin.updateUserById(targetId, { ban_duration: '876000h' });
      if (banError) throw banError;
      const { error } = await admin.from('profiles').update({ disabled_at: new Date().toISOString() }).eq('id', targetId);
      if (error) throw error;
      await admin.from('servidores').update({ active: false }).eq('profile_id', targetId);
      await admin.from('audit_events').insert({ actor_id: identity.user.id, action: 'user_deactivated', entity_type: 'profile', entity_id: targetId });
      return json({ ok: true });
    }

    if (action !== 'update') return json({ error: 'Ação inválida.' }, 400);
    const targetId = String(payload.profile_id ?? '');
    const roles: string[] = Array.isArray(payload.roles) ? [...new Set<string>(payload.roles.map((value: unknown) => String(value)))] : [];
    const cpf = digits(payload.cpf);
    const scopes = Array.isArray(payload.scope_ids) ? [...new Set(payload.scope_ids.map(String))] : [];
    if (!targetId || !roles.length || roles.some(role => !allowedRoles.includes(role)) || !validCPF(cpf)) return json({ error: 'CPF ou acessos inválidos.' }, 400);
    const locationId = String(payload.lotacao_id || '');
    const { data: location } = await admin.from('lotacoes').select('id').eq('id', locationId).eq('active', true).maybeSingle();
    if (!location) return json({ error: 'Selecione uma lotação ativa.' }, 400);
    const scoped = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { 'x-sgf-role': 'administrador' } },
    });
    const { error } = await scoped.rpc('set_profile_access', {
      actor_id: identity.user.id,
      target_profile_id: targetId,
      target_roles: roles,
      target_cpf: cpf,
      target_scope_ids: scopes,
    });
    if (error) {
      if (error.message.includes('SELF_ROLE_CHANGE_BLOCKED')) return json({ error: 'O administrador não pode alterar o próprio perfil por esta tela.' }, 409);
      if (error.message.includes('CPF_REQUIRED')) return json({ error: 'Informe um CPF válido.' }, 400);
      if (error.message.includes('SCOPE_REQUIRED')) return json({ error: 'Selecione ao menos uma lotação para RH.' }, 400);
      if (error.message.includes('duplicate key')) return json({ error: 'Este CPF já está vinculado a outra conta.' }, 409);
      throw error;
    }
    const { error: locationError } = await admin.from('profiles').update({ primary_lotacao_id: locationId }).eq('id', targetId);
    if (locationError) throw locationError;
    const { error: employeeLocationError } = await admin.from('servidores').update({ lotacao_id: locationId }).eq('profile_id', targetId);
    if (employeeLocationError) throw employeeLocationError;
    const { data: authUser } = await admin.auth.admin.getUserById(targetId);
    if (authUser.user) {
      const current = authUser.user.app_metadata || {};
      await admin.auth.admin.updateUserById(targetId, { app_metadata: { ...current, app_roles: roles } });
    }
    return json({ ok: true });
  } catch (error) {
    console.error('manage-profiles', error);
    return json({ error: 'Não foi possível atualizar o perfil.' }, 500);
  }
});
