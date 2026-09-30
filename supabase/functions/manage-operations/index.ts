import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sgf-role', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
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
    const { data: profile } = await admin.from('profiles').select('id,roles,must_change_password,disabled_at').eq('id', identity.user.id).single();
    const actorRole = request.headers.get('x-sgf-role') || '';
    if (!profile?.roles?.includes(actorRole) || profile.must_change_password || profile.disabled_at) return json({ error: 'Perfil indisponivel.' }, 403);
    const scoped = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { 'x-sgf-role': actorRole } } });
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
    if (action === 'archives') {
      const { data, error } = await admin.from('request_archives').select('request_id').eq('profile_id', profile.id);
      if (error) throw error;
      return json({ request_ids: (data || []).map(item => item.request_id) });
    }
    if (action === 'archive-request') {
      if (!['rh', 'administrador'].includes(actorRole)) return json({ error: 'Apenas RH e administrador podem organizar a fila.' }, 403);
      const requestId = String(payload.request_id || '');
      const { data: target } = await admin.from('vacation_requests').select('id,servidor_id').eq('id', requestId).maybeSingle();
      if (!target) return json({ error: 'Solicitacao nao encontrada.' }, 404);
      if (actorRole === 'rh') {
        const { data: employee } = await admin.from('servidores').select('lotacao_id').eq('id', target.servidor_id).maybeSingle();
        const { data: scope } = await admin.from('profile_scopes').select('lotacao_id').eq('profile_id', profile.id).eq('lotacao_id', employee?.lotacao_id).maybeSingle();
        if (!scope) return json({ error: 'Solicitacao fora do seu escopo.' }, 403);
      }
      const archive = payload.archived !== false;
      const result = archive
        ? await admin.from('request_archives').upsert({ profile_id: profile.id, request_id: requestId })
        : await admin.from('request_archives').delete().eq('profile_id', profile.id).eq('request_id', requestId);
      if (result.error) throw result.error;
      return json({ ok: true });
    }
    if (action === 'scale-list') {
      if (!['rh', 'administrador'].includes(actorRole)) return json({ error: 'Acesso indisponivel.' }, 403);
      const month = String(payload.month || '');
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return json({ error: 'Mes invalido.' }, 400);
      const [year, monthNumber] = month.split('-').map(Number);
      const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
      let locationQuery = admin.from('lotacoes').select('id,code,name').eq('active', true).order('name');
      if (actorRole === 'rh') {
        const { data: scopes } = await admin.from('profile_scopes').select('lotacao_id').eq('profile_id', profile.id);
        locationQuery = locationQuery.in('id', scopes?.length ? scopes.map(item => item.lotacao_id) : ['00000000-0000-0000-0000-000000000000']);
      }
      const [locations, assignments] = await Promise.all([
        locationQuery,
        admin.from('minimum_scale_assignments').select('lotacao_id,scale_date,servidor_id').gte('scale_date', `${month}-01`).lt('scale_date', nextMonth),
      ]);
      if (locations.error || assignments.error) throw locations.error || assignments.error;
      const allowed = new Set((locations.data || []).map(item => item.id));
      return json({ locations: locations.data || [], assignments: (assignments.data || []).filter(item => allowed.has(item.lotacao_id)) });
    }
    if (action === 'scale-save') {
      if (!['rh', 'administrador'].includes(actorRole)) return json({ error: 'Acesso indisponivel.' }, 403);
      const { error } = await scoped.rpc('set_minimum_scale', {
        actor_id: profile.id, target_lotacao_id: payload.lotacao_id,
        target_date: payload.date, target_servidor_ids: Array.isArray(payload.servidor_ids) ? payload.servidor_ids : [],
      });
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === 'time-bank') {
      if (!['rh', 'administrador'].includes(actorRole)) return json({ error: 'Somente RH ou administrador pode lancar saldo.' }, 403);
      const minutes = Math.round(Number(payload.hours) * 60);
      if (!Number.isFinite(minutes) || minutes === 0) return json({ error: 'Informe uma quantidade de horas diferente de zero.' }, 400);
      const { data, error } = await scoped.rpc('manage_time_bank', { actor_id: profile.id, target_servidor_id: payload.servidor_id, target_minutes: minutes, target_description: payload.description, target_date: payload.occurred_on || null });
      if (error) throw error; return json({ balance_minutes: data });
    }
    if (action === 'operation') {
      const { data, error } = await scoped.rpc('manage_request_operation', { actor_id: profile.id, target_request_id: payload.request_id, target_action: payload.operation, target_notes: payload.notes || null, target_periods: payload.periods || null });
      if (error) throw error; return json({ status: data });
    }
    return json({ error: 'Acao invalida.' }, 400);
  } catch (error) {
    console.error('manage-operations', error);
    const message = error instanceof Error ? error.message : 'Falha operacional.';
    const known: Record<string,string> = { TRANSITION_NOT_ALLOWED: 'Esta transicao nao e permitida.', NOTES_REQUIRED: 'Informe uma justificativa.', INSUFFICIENT_VALIDATED_BALANCE: 'Saldo validado insuficiente.', REQUEST_OUT_OF_SCOPE: 'Solicitacao fora do seu escopo.', PERIODS_INVALID: 'Periodos informados sao invalidos.' };
    return json({ error: known[message] || message }, /NOT_ALLOWED|OUT_OF_SCOPE/.test(message) ? 403 : 400);
  }
});
