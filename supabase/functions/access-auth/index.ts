import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { recoveryRedirect } from '../_shared/recovery-redirect.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sgf-role, x-sgf-bond, x-sgf-cnes, x-sgf-lotacao',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
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
    const findProfile = async (identifier: string, cpf: string, cpfInput: boolean, emailInput: boolean) => {
      if (emailInput) {
        const { data, error } = await admin.from('profiles').select('id,role,must_change_password,disabled_at')
          .eq('email', identifier).maybeSingle();
        if (error) throw error;
        return data;
      }
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
    if (action === 'registration-catalogs') {
      const [unitsResult, teamsResult, typesResult, positionsResult, allocationsResult] = await Promise.all([
        admin.from('cnes_units').select('id,code,name').eq('active', true).order('name').limit(500),
        admin.from('teams').select('id,cnes_unit_id,type_code,team_number,ine_code,name,needs_review').eq('active', true).order('name').limit(1000),
        admin.from('team_types').select('code,name').eq('active', true).neq('code', 'nao_se_aplica').order('name'),
        admin.from('cargos').select('id,name').order('name').limit(500),
        admin.from('lotacoes').select('id,name,parent_id,lotacao_cnes_units(cnes_unit_id)').eq('active', true).eq('is_internal_allocation', true).order('name').limit(500),
      ]);
      const error = unitsResult.error || teamsResult.error || typesResult.error || positionsResult.error || allocationsResult.error;
      if (error) throw error;
      return json({
        cnesUnits: unitsResult.data || [],
        teams: teamsResult.data || [],
        teamTypes: typesResult.data || [],
        positions: positionsResult.data || [],
        internalAllocations: allocationsResult.data || [],
      });
    }
    if (action === 'contexts') {
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (!token) return json({ error: 'Sessão inválida.' }, 401);
      const { data: identity, error: identityError } = await admin.auth.getUser(token);
      if (identityError || !identity.user) return json({ error: 'Sessão inválida ou expirada.' }, 401);
      const { data: contextProfile, error: profileError } = await admin.from('profiles')
        .select('id,roles,disabled_at,servidor:servidores(id,active)')
        .eq('id', identity.user.id).single();
      if (profileError || !contextProfile || contextProfile.disabled_at) return json({ error: 'Conta indisponível.' }, 403);
      const employee = Array.isArray(contextProfile.servidor) ? contextProfile.servidor[0] : contextProfile.servidor;
      const contexts: Record<string, unknown>[] = [];
      if (contextProfile.roles?.includes('servidor') && employee?.id && employee.active) {
        const { data: bonds, error } = await admin.from('employment_bonds')
          .select('id,registration,cargo:cargos(name),units:employment_bond_units(id,active,internal_lotacao_id,cnes:cnes_units(id,code,name,active),lotacao:lotacoes(id,code,name,active),team:employment_bond_teams(not_applicable,team:teams(name)))')
          .eq('servidor_id', employee.id).eq('active', true);
        if (error) throw error;
        for (const bond of bonds || []) for (const unit of bond.units || []) {
          if(!unit.active || !unit.cnes?.active || (unit.internal_lotacao_id && !unit.lotacao?.active)) continue;
          contexts.push({
          role: 'servidor', servidor_id: employee.id, bond_id: bond.id, bond_unit_id: unit.id, registration: bond.registration,
          position: bond.cargo?.name || '', cnes_unit_id: unit.cnes?.id, cnes_code: unit.cnes?.code,
          cnes_name: unit.cnes?.name, lotacao_id: unit.internal_lotacao_id || null,
          lotacao_name: unit.lotacao?.name || null,
          team_name: unit.team?.not_applicable ? 'Não se aplica' : unit.team?.team?.name || null,
        });
        }
      }
      if (contextProfile.roles?.some((role: string) => ['diretor', 'rh'].includes(role))) {
        const { data: scopes, error } = await admin.from('profile_scopes')
          .select('lotacao:lotacoes(id,code,name,active,lotacao_cnes_units(cnes:cnes_units(id,code,name,active)))')
          .eq('profile_id', identity.user.id);
        if (error) throw error;
        for (const role of contextProfile.roles.filter((value: string) => ['diretor', 'rh'].includes(value))) {
          for (const scope of scopes || []) {
            if(!scope.lotacao?.active) continue;
            const mappings = (scope.lotacao?.lotacao_cnes_units || []).filter((mapping:any)=>mapping.cnes?.active);
            for (const mapping of mappings) contexts.push({ role, lotacao_id: scope.lotacao?.id, lotacao_name: scope.lotacao?.name, cnes_unit_id: mapping.cnes?.id, cnes_code: mapping.cnes?.code, cnes_name: mapping.cnes?.name });
          }
        }
      }
      if (contextProfile.roles?.includes('administrador')) contexts.push({ role: 'administrador', global: true });
      return json({ contexts });
    }
    const identifier = String(payload.identifier ?? payload.cpf ?? '').trim().toLowerCase();
    const cpf = digits(identifier);
    const cpfInput = /^[\d.\-\s]+$/.test(identifier) && validCpf(cpf);
    const emailInput = /^[^\s@]+@[^\s@]+$/.test(identifier);
    const loginInput = /^[a-z0-9._-]{3,40}$/.test(identifier);
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const identityKey = `access-auth:${await sha256(`${ip}:${action}:${cpfInput ? cpf : identifier}`)}`;
    const ipKey = `access-auth-ip:${await sha256(`${ip}:${action}`)}`;
    const beginAttempt = async (key: string, windowSeconds: number, maxFailures: number, cooldownSeconds: number) => {
      const { data, error } = await admin.rpc('begin_access_attempt', {
        target_key: key, target_window_seconds: windowSeconds,
        target_max_failures: maxFailures, target_cooldown_seconds: cooldownSeconds,
      });
      if (error) throw error;
      return data as { allowed: boolean; attempt_id?: number; retry_after?: number; reason?: string };
    };
    const attempts: number[] = [];
    const attempt = action === 'login'
      ? await beginAttempt(ipKey, 60, 0, 3)
      : await beginAttempt(identityKey, 15 * 60, 8, 5);
    if (!attempt.allowed) {
      const retryAfter = Math.max(1, Number(attempt.retry_after) || 1);
      const error = action === 'login'
        ? `Aguarde ${retryAfter} segundo(s) antes de tentar novamente.`
        : `Muitas tentativas. Tente novamente em ${retryAfter} segundo(s).`;
      return json({ error, retry_after: retryAfter }, 429, { 'Retry-After': String(retryAfter) });
    }
    if (attempt.attempt_id) attempts.push(attempt.attempt_id);
    const acceptAttempts = async () => {
      if (attempts.length) await admin.from('submission_attempts').update({ accepted: true }).in('id', attempts);
    };

    if (action === 'request-access') {
      const cpf = digits(payload.cpf);
      const fullName = String(payload.name ?? '').trim();
      const birthDate = String(payload.birthDate ?? '');
      const email = String(payload.email ?? '').trim().toLowerCase();
      if (Array.isArray(payload.bonds)) {
        if (!fullName || !validCpf(cpf) || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ||
          !/^[^\s@]+@betim\.mg\.gov\.br$/.test(email) || !payload.bonds.length || payload.bonds.length > 10) {
          return json({ error: 'Confira os dados pessoais e os vínculos da solicitação.' }, 400);
        }
        const { data, error } = await admin.rpc('submit_multi_bond_access_request', {
          target_full_name: fullName,
          target_cpf: cpf,
          target_birth_date: birthDate,
          target_email: email,
          target_bonds: payload.bonds,
        });
        if (error) {
          if (error.message.includes('ALREADY_PENDING') || error.code === '23505') {
            return json({ error: 'Já existe uma solicitação pendente para este CPF, e-mail ou matrícula.' }, 409);
          }
          if (error.message.includes('TEAM_OUT_OF_CNES')) return json({ error: 'A equipe escolhida não pertence ao CNES informado.' }, 400);
          if (error.message.includes('ALLOCATION')) return json({ error: 'A lotação interna não pertence à Secretaria/CNES selecionados.' }, 400);
          if (error.message.includes('ACCESS_')) return json({ error: 'Confira os vínculos, CNES, equipes e cargas horárias informados.' }, 400);
          throw error;
        }
        await acceptAttempts();
        return json({ ok: true, id: data }, 202);
      }
      const registration = String(payload.registration ?? '').trim().toUpperCase();
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
      await acceptAttempts();
      return json({ ok: true }, 202);
    }

    if (action === 'recover') {
      let redirectTo: string;
      try { redirectTo = recoveryRedirect(payload.redirectTo, Deno.env.get('SGF_RECOVERY_URLS') || ''); }
      catch { return json({ error: 'Endereço de recuperação inválido. Abra o SGF no endereço oficial e tente novamente.' }, 400); }
      if (cpfInput || emailInput || loginInput) {
        const profile = await findProfile(identifier, cpf, cpfInput, emailInput);
        if (profile) {
          const { data: account } = await admin.auth.admin.getUserById(profile.id);
          if (account.user?.email) {
            const { error: recoveryError } = await auth.auth.resetPasswordForEmail(account.user.email, { redirectTo });
            if (recoveryError) {
              console.error('access-auth recovery delivery failed', recoveryError.code);
              return json({ error: 'Não foi possível enviar as instruções. Peça ao Administrador ou à TI que redefina sua senha provisória.' }, 503);
            }
          }
        }
      }
      await acceptAttempts();
      return json({ ok: true, message: 'Se o acesso existir e possuir e-mail válido, enviaremos as instruções.' });
    }

    if (action === 'change-password') {
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      const password = String(payload.password ?? '');
      if (!token) return json({ error: 'Sessão inválida.' }, 401);
      if (password === '123456') return json({ error: 'Escolha uma senha pessoal diferente da senha provisória 123456.' }, 400);
      if (password.length < 6 || password.length > 72) return json({ error: 'A senha deve ter entre 6 e 72 caracteres.' }, 400);
      const { data: identity, error: identityError } = await admin.auth.getUser(token);
      if (identityError || !identity.user) return json({ error: 'Sessão inválida ou expirada.' }, 401);
      const { data: passwordProfile } = await admin.from('profiles').select('roles,disabled_at').eq('id', identity.user.id).single();
      if (!passwordProfile || passwordProfile.disabled_at) return json({ error: 'Conta indisponível.' }, 403);
      const min = passwordProfile.roles?.includes('administrador') ? 8 : 6;
      if (password.length < min) return json({ error: `Esta conta exige pelo menos ${min} caracteres.` }, 400);
      const { error: updateError } = await admin.auth.admin.updateUserById(identity.user.id, { password });
      if (updateError?.code === 'weak_password') return json({ error: 'A senha não atende aos requisitos de segurança. Use pelo menos 6 caracteres e escolha uma senha pessoal mais forte.' }, 400);
      if (updateError?.code === 'same_password') return json({ error: 'Escolha uma senha diferente da senha atual.' }, 400);
      if (updateError) throw updateError;
      const { error: flagError } = await admin.from('profiles').update({ must_change_password: false }).eq('id', identity.user.id);
      if (flagError) throw flagError;
      return json({ ok: true });
    }

    if (action !== 'login') return json({ error: 'Ação inválida.' }, 400);
    const password = String(payload.password ?? '');
    if ((!cpfInput && !emailInput && !loginInput) || password.length < 4 || password.length > 72) return json({ error: 'CPF, e-mail ou senha inválidos.' }, 401);
    const profile = await findProfile(identifier, cpf, cpfInput, emailInput);
    if (!profile || profile.disabled_at) return json({ error: 'CPF, e-mail ou senha inválidos.' }, 401);
    const { data: account } = await admin.auth.admin.getUserById(profile.id);
    if (!account.user?.email) return json({ error: 'CPF, e-mail ou senha inválidos.' }, 401);
    const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({
      email: account.user.email, password,
    });
    if (signInError || !signedIn.session) return json({ error: 'CPF, e-mail ou senha inválidos.' }, 401);
    const access = await admin.from('profiles').select('roles').eq('id', profile.id).single();
    if (access.error && !missingColumn(access.error, 'roles')) throw access.error;
    const roles = Array.isArray(access.data?.roles) && access.data.roles.length ? access.data.roles : [profile.role];
    await acceptAttempts();
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
