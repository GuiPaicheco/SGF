import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const asciiJson = (body: unknown) => JSON.stringify(body).replace(/[\u007f-\uffff]/g, char =>
  `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`
);
const json = (body: unknown, status = 200) => new Response(asciiJson(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const allowedTypes = new Set(['regulamentar', 'premio', 'banco_horas']);
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'M\u00e9todo n\u00e3o permitido.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) return json({ error: 'Servi\u00e7o temporariamente indispon\u00edvel.' }, 503);
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const payload = await request.json();
    const cpf = digits(payload.cpf);
    const registration = String(payload.registration ?? '').trim();
    const birthDate = String(payload.birthDate ?? '');
    const type = String(payload.type ?? '');
    const periods = Array.isArray(payload.periods) ? payload.periods : [];
    const name = String(payload.name ?? '').trim();
    const admissionDate = String(payload.admissionDate ?? '');
    const employmentType = String(payload.employmentType ?? '').trim();
    const unit = String(payload.unit ?? '').trim();
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const { data: identity } = token ? await db.auth.getUser(token) : { data: { user: null } };

    if (cpf.length !== 11 || !registration || !name || !unit || !employmentType ||
        !isoDate.test(birthDate) || !isoDate.test(admissionDate) || !allowedTypes.has(type)) {
      return json({ error: 'Dados de identifica\u00e7\u00e3o ou modalidade inv\u00e1lidos.' }, 400);
    }
    if (!periods.length || periods.length > 2 || periods.some((p: Record<string, unknown>) =>
      !isoDate.test(String(p.start_date)) || !isoDate.test(String(p.end_date)) ||
      !isoDate.test(String(p.return_date)) || Number(p.days) < 1 || Number(p.days) > 90)) {
      return json({ error: 'Per\u00edodo solicitado inv\u00e1lido.' }, 400);
    }

    const [{ data: byRegistration }, { data: byCpf }] = await Promise.all([
      db.from('servidores').select('id,profile_id').eq('matricula', registration).maybeSingle(),
      db.from('servidores').select('id,profile_id').eq('cpf', cpf).maybeSingle(),
    ]);
    const existingEmployee = byRegistration || byCpf;
    if (existingEmployee) {
      if (!identity.user) return json({ error: 'Este servidor já possui cadastro. Entre na sua conta para solicitar.' }, 401);
      if (!existingEmployee.profile_id || existingEmployee.profile_id !== identity.user.id) {
        return json({ error: 'A sessão não está vinculada a este cadastro funcional.' }, 403);
      }
    } else if (identity.user) {
      return json({ error: 'A conta autenticada não corresponde aos dados funcionais informados.' }, 403);
    } else if (type === 'banco_horas') {
      return json({ error: 'Folga por banco de horas exige acesso autenticado e saldo validado pelo RH.' }, 401);
    }

    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(forwarded));
    const ipHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await db.from('submission_attempts')
      .select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('attempted_at', since);
    if ((count ?? 0) >= 10) return json({ error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' }, 429);
    const { data: attempt } = await db.from('submission_attempts').insert({ ip_hash: ipHash, accepted: false }).select('id').single();

    payload.cpf = cpf;
    payload.registration = registration;
    payload.addBankHours = identity.user && Number(payload.addBankHours) > 0 ? Number(payload.addBankHours) : null;
    if (!identity.user) payload.availableHours = null;
    payload.periods = periods.map((p: Record<string, unknown>, index: number) => ({ ...p, sequence: index + 1 }));
    const { data: created, error: createError } = await db.rpc('register_vacation_submission', { payload });
    if (createError) {
      if (createError.message?.includes('IDENTITY_CONFLICT')) {
        return json({ error: 'J\u00e1 existe um cadastro com este CPF ou matr\u00edcula e dados divergentes. Procure o RH para regulariza\u00e7\u00e3o.' }, 409);
      }
      throw createError;
    }
    if (identity.user && created?.id) {
      const { error: ownerError } = await db.from('vacation_requests')
        .update({ created_by: identity.user.id }).eq('id', created.id);
      if (ownerError) throw ownerError;
    }
    if (attempt?.id) await db.from('submission_attempts').update({ accepted: true }).eq('id', attempt.id);
    return json(created, 201);
  } catch (error) {
    console.error('submit-request', error);
    return json({ error: 'N\u00e3o foi poss\u00edvel registrar a solicita\u00e7\u00e3o. Tente novamente ou procure o RH.' }, 500);
  }
});
