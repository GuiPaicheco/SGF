import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Sessão inválida.' }, 401);
    const { data: identity, error: identityError } = await admin.auth.getUser(token);
    if (identityError || !identity.user) return json({ error: 'Sessão inválida ou expirada.' }, 401);
    const { data: actor } = await admin.from('profiles').select('role,must_change_password').eq('id', identity.user.id).single();
    if (!actor || actor.role !== 'administrador' || actor.must_change_password) return json({ error: 'Acesso exclusivo do administrador.' }, 403);
    const payload = await request.json();
    const action = String(payload.action ?? 'list');

    if (action === 'list') {
      const [{ data: requests, error: requestError }, { data: locations, error: locationError }] = await Promise.all([
        admin.from('access_requests').select('id,full_name,registration,email,requested_identifier,requested_position,requested_unit,status,notes,created_at').order('created_at', { ascending: false }),
        admin.from('lotacoes').select('id,code,name,unit_type').eq('active', true).order('name'),
      ]);
      if (requestError || locationError) throw requestError || locationError;
      return json({ requests, locations });
    }

    const requestId = String(payload.id ?? '');
    if (!requestId) return json({ error: 'Solicitação inválida.' }, 400);
    if (action === 'reject') {
      const notes = String(payload.notes ?? '').trim();
      const { error } = await admin.rpc('reject_access_request', {
        actor_id: identity.user.id, target_request_id: requestId, target_notes: notes,
      });
      if (error) throw error;
      return json({ ok: true });
    }
    if (action !== 'approve') return json({ error: 'Ação inválida.' }, 400);

    const role = String(payload.role ?? 'servidor');
    const identifier = String(payload.identifier ?? '').trim().toLowerCase();
    const scopes = Array.isArray(payload.scope_ids) ? [...new Set(payload.scope_ids.map(String))] : [];
    const { data: accessRequest } = await admin.from('access_requests')
      .select('email,full_name,status').eq('id', requestId).single();
    if (!accessRequest || accessRequest.status !== 'pendente') return json({ error: 'Esta solicitação já foi analisada.' }, 409);

    const redirectTo = String(payload.redirectTo ?? '').startsWith('https://') ? String(payload.redirectTo) : undefined;
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      accessRequest.email,
      redirectTo ? { redirectTo, data: { full_name: accessRequest.full_name } } : { data: { full_name: accessRequest.full_name } },
    );
    if (inviteError || !invited.user) return json({ error: 'Não foi possível enviar o convite. Verifique se o e-mail já possui uma conta.' }, 409);
    const { error: finalizeError } = await admin.rpc('finalize_access_request', {
      actor_id: identity.user.id,
      target_request_id: requestId,
      account_id: invited.user.id,
      target_role: role,
      target_identifier: identifier,
      target_scope_ids: scopes,
    });
    if (finalizeError) {
      await admin.auth.admin.deleteUser(invited.user.id);
      if (finalizeError.message.includes('IDENTITY_CONFLICT')) return json({ error: 'CPF, matrícula ou nascimento divergem do cadastro funcional.' }, 409);
      if (finalizeError.message.includes('ACCOUNT_EXISTS')) return json({ error: 'Este servidor já possui uma conta vinculada.' }, 409);
      if (finalizeError.message.includes('SCOPE_REQUIRED')) return json({ error: 'Selecione ao menos uma lotação para diretor ou RH.' }, 400);
      throw finalizeError;
    }
    await admin.auth.admin.updateUserById(invited.user.id, { app_metadata: { app_role: role, role } });
    return json({ ok: true });
  } catch (error) {
    console.error('manage-access', error);
    return json({ error: 'Não foi possível analisar a solicitação de acesso.' }, 500);
  }
});
