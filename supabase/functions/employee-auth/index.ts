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
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
};
const validCpf = (value: string) => {
  if (value.length !== 11 || /^(\d)\1+$/.test(value)) return false;
  const check = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index++) sum += Number(value[index]) * (length + 1 - index);
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };
  return check(9) === Number(value[9]) && check(10) === Number(value[10]);
};

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'M\u00e9todo n\u00e3o permitido.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !serviceKey || !anonKey) return json({ error: 'Servi\u00e7o temporariamente indispon\u00edvel.' }, 503);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const payload = await request.json();
    const action = String(payload.action ?? 'login');
    const registration = String(payload.registration ?? '').trim().toUpperCase();
    const password = String(payload.password ?? '');
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const ipHash = `employee-auth:${await sha256(`employee-auth:${ip}:${registration}`)}`;
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await admin.from('submission_attempts').select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash).gte('attempted_at', since);
    if ((count ?? 0) >= 8) return json({ error: 'Muitas tentativas. Aguarde 15 minutos.' }, 429);
    const { data: attempt } = await admin.from('submission_attempts')
      .insert({ ip_hash: ipHash, accepted: false }).select('id').single();

    if (!registration || password.length < 8 || password.length > 72) {
      return json({ error: 'Matr\u00edcula ou senha inv\u00e1lida.' }, 400);
    }

    const internalEmail = `${await sha256(registration)}@servidor.sgf.local`;
    if (action === 'register') {
      const cpf = digits(payload.cpf);
      const birthDate = String(payload.birthDate ?? '');
      const name = String(payload.name ?? '').trim();
      const position = String(payload.position ?? '').trim();
      const unit = String(payload.unit ?? '').trim();
      if (!name || !position || !unit || !validCpf(cpf) || !isoDate.test(birthDate)) {
        return json({ error: 'Confira os dados informados para o primeiro acesso.' }, 400);
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: internalEmail,
        password,
        email_confirm: true,
        app_metadata: { app_role: 'servidor' },
      });
      if (createError || !created.user) {
        return json({ error: 'N\u00e3o foi poss\u00edvel criar o acesso. Se ele j\u00e1 existir, use Entrar.' }, 409);
      }

      const { error: claimError } = await admin.rpc('claim_employee_account', {
        account_id: created.user.id,
        registration,
        document_cpf: cpf,
        employee_birth_date: birthDate,
        employee_name: name,
        employee_position: position,
        employee_unit: unit,
      });
      if (claimError) {
        await admin.auth.admin.deleteUser(created.user.id);
        if (claimError.message?.includes('ACCOUNT_EXISTS')) {
          return json({ error: 'Este servidor j\u00e1 possui acesso. Use Entrar.' }, 409);
        }
        if (claimError.message?.includes('IDENTITY_CONFLICT')) {
          return json({ error: 'Os dados n\u00e3o correspondem ao cadastro funcional. Procure o RH.' }, 409);
        }
        throw claimError;
      }
    } else if (action !== 'login') {
      return json({ error: 'A\u00e7\u00e3o inv\u00e1lida.' }, 400);
    }

    const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({
      email: internalEmail, password,
    });
    if (signInError || !signedIn.session) return json({ error: 'Matr\u00edcula ou senha inv\u00e1lida.' }, 401);
    if (attempt?.id) await admin.from('submission_attempts').update({ accepted: true }).eq('id', attempt.id);
    return json({
      access_token: signedIn.session.access_token,
      refresh_token: signedIn.session.refresh_token,
    });
  } catch (error) {
    console.error('employee-auth', error);
    return json({ error: 'N\u00e3o foi poss\u00edvel concluir o acesso. Tente novamente.' }, 500);
  }
});
