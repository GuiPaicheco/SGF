import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sgf-role',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const sha256 = async (value: string) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map(byte => byte.toString(16).padStart(2, '0')).join('');
};
const validCpf = (value: string) => {
  if (value.length !== 11 || /^(\d)\1+$/.test(value)) return false;
  const check = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index++) sum += Number(value[index]) * (length + 1 - index);
    const result = (sum * 10) % 11;
    return (result === 10 ? 0 : result) === Number(value[length]);
  };
  return check(9) && check(10);
};
const missingColumn = (error: { code?: string; message?: string } | null, column: string) =>
  error?.code === '42703' && Boolean(error.message?.includes(column));

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !serviceKey || !anonKey) return json({ error: 'Serviço temporariamente indisponível.' }, 503);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const findProfile = async (identifier: string, cpf: string, cpfInput: boolean) => {
      if (!cpfInput) {
        const { data, error } = await admin.from('profiles').select('id,role,must_change_password,disabled_at')
          .eq('login_identifier', identifier).maybeSingle();
        if (error) throw error;
        return data;
      }
      const modern = await admin.from('profiles').select('id,role,must_change_password,disabled_at').eq('cpf', cpf).maybeSingle();
      if (!modern.error) return modern.data;
      if (!missingColumn(modern.error, 'cpf')) throw modern.error;
      const employee = await admin.from('servidores').select('profile_id').eq('cpf', cpf).not('profile_id', 'is', null).limit(2);
      if (employee.error) throw employee.error;
      const ids = [...new Set((employee.data || []).map(row => row.profile_id))];
      if (ids.length !== 1) return null;
      const legacy = await admin.from('profiles').select('id,role,must_change_password,disabled_at').eq('id', ids[0]).maybeSingle();
      if (legacy.error) throw legacy.error;
      return legacy.data;
    };
    const payload = await request.json();
    const action = String(payload.action ?? 'login');
    if (action === 'locations') {
      const { data, error } = await admin.from('lotacoes').select('code,name').eq('active', true).not('code', 'is', null).order('name').limit(300);
      if (error) throw error;
      return json({ locations: data || [] });
    }
    const identifier = String(payload.identifier ?? payload.cpf ?? '').trim().toLowerCase();
    const cpf = digits(identifier);
    const cpfInput = /^[\d.\-\s]+$/.test(identifier) && validCpf(cpf);
    const loginInput = /^[a-z0-9._-]{3,40}$/.test(identifier);
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const attemptKey = `access-auth:${await sha256(`${ip}:${action}:${cpfInput ? cpf : identifier}`)}`;
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await admin.from('submission_attempts').select('id', { count: 'exact', head: true })
      .eq('ip_hash', attemptKey).eq('accepted', false).gte('attempted_at', since);
    if ((count ?? 0) >= 8) return json({ error: 'Muitas tentativas. Aguarde 15 minutos.' }, 429);
    const { data: attempt } = await admin.from('submission_attempts')
      .insert({ ip_hash: attemptKey, accepted: false }).select('id').single();

    if (action === 'request-access') {
      const cpf = digits(payload.cpf);
      const fullName = String(payload.name ?? '').trim();
      const registration = String(payload.registration ?? '').trim().toUpperCase();
      const birthDate = String(payload.birthDate ?? '');
      const email = String(payload.email ?? '').trim().toLowerCase();
      const position = String(payload.position ?? '').trim();
      const unit = String(payload.unit ?? '').trim();
      const team = String(payload.team ?? '').trim() || 'Não se aplica';
      if (!fullName || !registration || !position || !unit || team.length > 120 || !validCpf(cpf) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !/^[^\s@]+@betim\.mg\.gov\.br$/.test(email)) {
        return json({ error: 'Confira os dados da solicitação de acesso.' }, 400);
      }
      const { error } = await admin.from('access_requests').insert({
        full_name: fullName, registration, cpf, birth_date: birthDate, email,
        requested_identifier: registration.toLowerCase(), requested_position: position, requested_unit: unit, requested_team: team,
      });
      if (error) {
        if (error.code === '23505') return json({ error: 'Já existe uma solicitação de acesso pendente para estes dados.' }, 409);
        throw error;
      }
      if (attempt?.id) await admin.from('submission_attempts').update({ accepted: true }).eq('id', attempt.id);
      return json({ ok: true }, 202);
    }

    if (action === 'recover') {
      if (cpfInput || loginInput) {
        const profile = await findProfile(identifier, cpf, cpfInput);
        if (profile) {
          const { data: account } = await admin.auth.admin.getUserById(profile.id);
          if (account.user?.email) {
            const redirectTo = String(payload.redirectTo ?? '').startsWith('https://')
              ? String(payload.redirectTo) : undefined;
            await auth.auth.resetPasswordForEmail(account.user.email, redirectTo ? { redirectTo } : undefined);
          }
        }
      }
      if (attempt?.id) await admin.from('submission_attempts').update({ accepted: true }).eq('id', attempt.id);
      return json({ ok: true, message: 'Se o acesso existir e possuir e-mail válido, enviaremos as instruções.' });
    }

    if (action === 'change-password') {
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      const password = String(payload.password ?? '');
      if (!token) return json({ error: 'Sessão inválida.' }, 401);
      if (password.length < 4 || password.length > 72) return json({ error: 'A senha deve ter entre 4 e 72 caracteres.' }, 400);
      const { data: identity, error: identityError } = await admin.auth.getUser(token);
      if (identityError || !identity.user) return json({ error: 'Sessão inválida ou expirada.' }, 401);
      const { data: passwordProfile } = await admin.from('profiles').select('roles,disabled_at').eq('id', identity.user.id).single();
      if (!passwordProfile || passwordProfile.disabled_at) return json({ error: 'Conta indisponível.' }, 403);
      const min = passwordProfile.roles?.includes('administrador') ? 8 : passwordProfile.roles?.includes('rh') ? 6 : 4;
      if (password.length < min) return json({ error: `Esta conta exige pelo menos ${min} caracteres.` }, 400);
      const { error: updateError } = await admin.auth.admin.updateUserById(identity.user.id, { password });
      if (updateError) throw updateError;
      await admin.from('profiles').update({ must_change_password: false }).eq('id', identity.user.id);
      return json({ ok: true });
    }

    if (action !== 'login') return json({ error: 'Ação inválida.' }, 400);
    const password = String(payload.password ?? '');
    if ((!cpfInput && !loginInput) || password.length < 4 || password.length > 72) return json({ error: 'Login, CPF ou senha inválidos.' }, 401);
    const profile = await findProfile(identifier, cpf, cpfInput);
    if (!profile || profile.disabled_at) return json({ error: 'Login, CPF ou senha inválidos.' }, 401);
    const { data: account } = await admin.auth.admin.getUserById(profile.id);
    if (!account.user?.email) return json({ error: 'Login, CPF ou senha inválidos.' }, 401);
    const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({
      email: account.user.email, password,
    });
    if (signInError || !signedIn.session) return json({ error: 'Login, CPF ou senha inválidos.' }, 401);
    const access = await admin.from('profiles').select('roles').eq('id', profile.id).single();
    if (access.error && !missingColumn(access.error, 'roles')) throw access.error;
    const roles = Array.isArray(access.data?.roles) && access.data.roles.length ? access.data.roles : [profile.role];
    if (attempt?.id) await admin.from('submission_attempts').update({ accepted: true }).eq('id', attempt.id);
    return json({
      access_token: signedIn.session.access_token,
      refresh_token: signedIn.session.refresh_token,
      roles,
      must_change_password: Boolean(profile.must_change_password),
    });
  } catch (error) {
    console.error('access-auth', error);
    return json({ error: 'Não foi possível concluir a operação de acesso.' }, 500);
  }
});
