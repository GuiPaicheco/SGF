import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const asciiJson = (body: unknown) => JSON.stringify(body).replace(/[\u007f-\uffff]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
const json = (body: unknown, status = 200) => new Response(asciiJson(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return json({ error: 'Servico indisponivel.' }, 503);
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Sessao obrigatoria.' }, 401);
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: identity, error: authError } = await admin.auth.getUser(token);
    if (authError || !identity.user) return json({ error: 'Sessao invalida.' }, 401);
    const { data: profile } = await admin.from('profiles').select('id,role,must_change_password').eq('id', identity.user.id).single();
    if (!profile || profile.must_change_password) return json({ error: 'Perfil indisponivel.' }, 403);
    const payload = await request.json(), action = String(payload.action || '');

    if (action === 'notifications') {
      const { data, error } = await admin.from('notifications').select('id,request_id,title,message,read_at,created_at').eq('recipient_id', profile.id).order('created_at', { ascending: false }).limit(30);
      if (error) throw error;
      return json({ notifications: data || [] });
    }
    if (action === 'read-notifications') {
      const query = admin.from('notifications').update({ read_at: new Date().toISOString() }).eq('recipient_id', profile.id).is('read_at', null);
      if (payload.id) query.eq('id', Number(payload.id));
      const { error } = await query; if (error) throw error; return json({ ok: true });
    }
    if (action === 'time-bank') {
      if (!['rh', 'administrador'].includes(profile.role)) return json({ error: 'Somente RH ou administrador pode lancar saldo.' }, 403);
      const minutes = Math.round(Number(payload.hours) * 60);
      if (!Number.isFinite(minutes) || minutes === 0) return json({ error: 'Informe uma quantidade de horas diferente de zero.' }, 400);
      const { data, error } = await admin.rpc('manage_time_bank', { actor_id: profile.id, target_servidor_id: payload.servidor_id, target_minutes: minutes, target_description: payload.description, target_date: payload.occurred_on || null });
      if (error) throw error; return json({ balance_minutes: data });
    }
    if (action === 'operation') {
      const { data, error } = await admin.rpc('manage_request_operation', { actor_id: profile.id, target_request_id: payload.request_id, target_action: payload.operation, target_notes: payload.notes || null, target_periods: payload.periods || null });
      if (error) throw error; return json({ status: data });
    }
    return json({ error: 'Acao invalida.' }, 400);
  } catch (error) {
    console.error('manage-operations', error);
    const message = String(error?.message || 'Falha operacional.');
    const known: Record<string,string> = { TRANSITION_NOT_ALLOWED: 'Esta transicao nao e permitida.', NOTES_REQUIRED: 'Informe uma justificativa.', INSUFFICIENT_VALIDATED_BALANCE: 'Saldo validado insuficiente.', REQUEST_OUT_OF_SCOPE: 'Solicitacao fora do seu escopo.', PERIODS_INVALID: 'Periodos informados sao invalidos.' };
    return json({ error: known[message] || message }, /NOT_ALLOWED|OUT_OF_SCOPE/.test(message) ? 403 : 400);
  }
});
