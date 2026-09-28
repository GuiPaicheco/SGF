import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const asciiJson = (body: unknown) => JSON.stringify(body).replace(/[\u007f-\uffff]/g, char =>
  `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`
);
const respond = (body: unknown, status = 200) => new Response(asciiJson(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return respond({ error: 'M\u00e9todo n\u00e3o permitido.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const ipHash = `login:${await sha256(`login:${ip}`)}`;
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await admin.from('submission_attempts').select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash).gte('attempted_at', since);
    if ((count ?? 0) >= 10) return respond({ error: 'Muitas tentativas. Aguarde 15 minutos.' }, 429);
    const { data: attempt } = await admin.from('submission_attempts').insert({ ip_hash: ipHash, accepted: false }).select('id').single();

    const { password } = await request.json();
    const { data: secrets, error: secretError } = await admin.from('system_secrets')
      .select('key,secret_value').in('key', ['provisional_access_hash', 'provisional_admin_password']);
    if (secretError || !secrets || secrets.length !== 2) return respond({ error: 'Acesso temporariamente indispon\u00edvel.' }, 503);
    const secretMap = Object.fromEntries(secrets.map(item => [item.key, item.secret_value]));
    if (await sha256(String(password)) !== secretMap.provisional_access_hash) return respond({ error: 'Senha provis\u00f3ria inv\u00e1lida.' }, 401);

    const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await auth.auth.signInWithPassword({
      email: 'gestao@sgf.local', password: secretMap.provisional_admin_password,
    });
    if (error || !data.session) return respond({ error: 'Acesso temporariamente indispon\u00edvel.' }, 401);
    if (attempt?.id) await admin.from('submission_attempts').update({ accepted: true }).eq('id', attempt.id);
    return respond({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch {
    return respond({ error: 'Solicita\u00e7\u00e3o inv\u00e1lida.' }, 400);
  }
});
