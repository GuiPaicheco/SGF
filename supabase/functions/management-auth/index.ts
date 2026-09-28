import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const sha256 = async (value: string) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map(byte => byte.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const payload = await request.json();
    const action = String(payload.action ?? 'login');

    if (action === 'change-password') {
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      const password = String(payload.password ?? '');
      if (!token) return json({ error: 'Sessão inválida.' }, 401);
      if (password.length < 10 || password.length > 72) {
        return json({ error: 'A nova senha deve ter entre 10 e 72 caracteres.' }, 400);
      }
      const { data: identity, error: identityError } = await admin.auth.getUser(token);
      if (identityError || !identity.user) return json({ error: 'Sessão inválida ou expirada.' }, 401);
      const { data: profile } = await admin.from('profiles').select('role').eq('id', identity.user.id).single();
      if (!profile || profile.role === 'servidor') return json({ error: 'Acesso não autorizado.' }, 403);
      const { error: passwordError } = await admin.auth.admin.updateUserById(identity.user.id, { password });
      if (passwordError) throw passwordError;
      const { error: profileError } = await admin.from('profiles').update({ must_change_password: false }).eq('id', identity.user.id);
      if (profileError) throw profileError;
      return json({ ok: true });
    }

    if (action !== 'login') return json({ error: 'Ação inválida.' }, 400);
    const identifier = String(payload.identifier ?? '').trim().toLowerCase();
    const password = String(payload.password ?? '');
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const attemptKey = `management-auth:${await sha256(`${ip}:${identifier}`)}`;
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await admin.from('submission_attempts').select('id', { count: 'exact', head: true })
      .eq('ip_hash', attemptKey).eq('accepted', false).gte('attempted_at', since);
    if ((count ?? 0) >= 8) return json({ error: 'Muitas tentativas. Aguarde 15 minutos.' }, 429);
    const { data: attempt } = await admin.from('submission_attempts')
      .insert({ ip_hash: attemptKey, accepted: false }).select('id').single();

    const { data: profile } = await admin.from('profiles')
      .select('id,role,must_change_password').ilike('login_identifier', identifier).maybeSingle();
    if (!profile || profile.role === 'servidor') return json({ error: 'Identificador ou senha inválidos.' }, 401);
    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(profile.id);
    if (authUserError || !authUser.user?.email) return json({ error: 'Identificador ou senha inválidos.' }, 401);

    const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({
      email: authUser.user.email,
      password,
    });
    if (signInError || !signedIn.session) return json({ error: 'Identificador ou senha inválidos.' }, 401);
    if (attempt?.id) await admin.from('submission_attempts').update({ accepted: true }).eq('id', attempt.id);
    return json({
      access_token: signedIn.session.access_token,
      refresh_token: signedIn.session.refresh_token,
      must_change_password: Boolean(profile.must_change_password),
    });
  } catch (error) {
    console.error('management-auth', error);
    return json({ error: 'Não foi possível concluir o acesso.' }, 500);
  }
});
