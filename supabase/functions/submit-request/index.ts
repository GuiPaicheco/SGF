import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const allowedTypes = new Set(['regulamentar', 'premio', 'banco_horas', 'dayoff_aniversario']);
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return json({ error: 'Serviço temporariamente indisponível.' }, 503);
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const payload = await request.json();
    const cpf = digits(payload.cpf);
    const registration = String(payload.registration ?? '').trim();
    const birthDate = String(payload.birthDate ?? '');
    const type = String(payload.type ?? '');
    const periods = Array.isArray(payload.periods) ? payload.periods : [];

    if (cpf.length !== 11 || !registration || !isoDate.test(birthDate) || !allowedTypes.has(type)) {
      return json({ error: 'Dados de identificação ou modalidade inválidos.' }, 400);
    }
    if (!periods.length || periods.length > 2 || periods.some((p: Record<string, unknown>) =>
      !isoDate.test(String(p.start_date)) || !isoDate.test(String(p.end_date)) ||
      !isoDate.test(String(p.return_date)) || Number(p.days) < 1 || Number(p.days) > 90)) {
      return json({ error: 'Período solicitado inválido.' }, 400);
    }

    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(forwarded));
    const ipHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await db.from('submission_attempts')
      .select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('attempted_at', since);
    if ((count ?? 0) >= 10) return json({ error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' }, 429);
    const { data: attempt } = await db.from('submission_attempts').insert({ ip_hash: ipHash, accepted: false }).select('id').single();

    const { data: servidor, error: lookupError } = await db.from('servidores')
      .select('id,full_name,active,birth_date,matricula,cpf').eq('matricula', registration).eq('cpf', cpf)
      .eq('birth_date', birthDate).eq('active', true).maybeSingle();
    if (lookupError) throw lookupError;
    if (!servidor) return json({ error: 'Não foi possível confirmar os dados funcionais. Procure o RH da sua lotação.' }, 404);

    const now = new Date();
    const protocol = `SGF-${now.getFullYear()}-${now.getTime().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    const first = periods[0], last = periods[periods.length - 1];
    const requestRow = {
      servidor_id: servidor.id, type, status: 'enviada', protocol,
      start_date: first.start_date, end_date: last.end_date, return_date: last.return_date,
      acquisition_end: payload.acquisitionEnd || null,
      requested_hours: type === 'banco_horas' ? Number(payload.availableHours) : (Number(payload.addBankHours) || null),
      birthday_year: type === 'dayoff_aniversario' ? Number(payload.birthdayYear) : null,
      notes: String(payload.notes ?? '').slice(0, 2000) || null,
      submitted_at: new Date().toISOString(),
    };
    const { data: created, error: createError } = await db.from('vacation_requests').insert(requestRow).select('id,protocol').single();
    if (createError) throw createError;

    const periodRows = periods.map((p: Record<string, unknown>, index: number) => ({
      request_id: created.id, sequence: index + 1, start_date: p.start_date, end_date: p.end_date,
      return_date: p.return_date, days: Number(p.days),
      hours: type === 'banco_horas' ? Number(payload.dailyHours) * Number(p.days) : null,
    }));
    const { error: periodError } = await db.from('request_periods').insert(periodRows);
    if (periodError) { await db.from('vacation_requests').delete().eq('id', created.id); throw periodError; }
    await db.from('request_approvals').insert([
      { request_id: created.id, stage: 'chefia_imediata' }, { request_id: created.id, stage: 'rh' },
    ]);

    const declaredHours = Number(payload.availableHours || payload.addBankHours || 0);
    if (declaredHours > 0) await db.from('time_bank_accounts').upsert({
      servidor_id: servidor.id, declared_minutes: Math.round(declaredHours * 60), updated_at: new Date().toISOString(),
    }, { onConflict: 'servidor_id' });
    if (attempt?.id) await db.from('submission_attempts').update({ accepted: true }).eq('id', attempt.id);
    return json({ id: created.id, protocol: created.protocol }, 201);
  } catch (error) {
    console.error('submit-request', error);
    return json({ error: 'Não foi possível registrar a solicitação. Tente novamente ou procure o RH.' }, 500);
  }
});
