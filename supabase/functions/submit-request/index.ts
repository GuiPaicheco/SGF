import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { requestedBankHours, validSubmissionPeriods } from './validate.ts';
import { contextHeaders, validateAccessContext } from '../_shared/access-context.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sgf-role, x-sgf-bond, x-sgf-cnes, x-sgf-lotacao',
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
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Entre no SGF para registrar uma solicitação.' }, 401);
    const { data: identity, error: identityError } = await db.auth.getUser(token);
    if (identityError || !identity.user) return json({ error: 'Sessão inválida ou expirada. Entre novamente.' }, 401);
    const { data: profile, error: profileError } = await db.from('profiles')
      .select('roles,must_change_password,disabled_at').eq('id', identity.user.id).single();
    if (profileError || !profile?.roles?.includes('servidor') || request.headers.get('x-sgf-role') !== 'servidor' || profile.must_change_password || profile.disabled_at) {
      return json({ error: 'A conta ainda não está liberada para solicitações.' }, 403);
    }
    const context = await validateAccessContext(db, request, identity.user.id, profile.roles || []);
    const scoped = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { ...contextHeaders(context), 'x-sgf-actor': identity.user.id } } });
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
    if (cpf.length !== 11 || !registration || !name || !unit || !employmentType ||
        !isoDate.test(birthDate) || !isoDate.test(admissionDate) || !allowedTypes.has(type)) {
      return json({ error: 'Dados de identifica\u00e7\u00e3o ou modalidade inv\u00e1lidos.' }, 400);
    }
    if (!validSubmissionPeriods(periods, type, payload.dailyHours, payload.availableHours)
        || periods.some((period: any) => !['uteis','corridos'].includes(period.counting_mode))) {
      return json({ error: 'Per\u00edodo solicitado inv\u00e1lido.' }, 400);
    }

    const { data: byCpf } = await db.from('servidores').select('id,profile_id,matricula').eq('cpf', cpf).maybeSingle();
    if (!byCpf || byCpf.id !== context.servidorId || byCpf.profile_id !== identity.user.id ||
        registration.toUpperCase() !== context.registration) {
      return json({ error: 'A conta não está vinculada aos dados funcionais informados.' }, 403);
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
    payload.registration = byCpf.matricula;
    payload.requestedHours = type === 'banco_horas' ? requestedBankHours(periods, Number(payload.dailyHours)) : null;
      payload.addBankHours = Number(payload.addBankHours) > 0 ? Number(payload.addBankHours) : null;
      payload.periods = periods.map((p: Record<string, unknown>, index: number) => ({ ...p, sequence: index + 1 }));
      payload.createdBy = identity.user.id;
    const { data: created, error: createError } = await scoped.rpc('register_contextual_vacation_submission', {
      payload,
      target_bond_id: context.bondId,
      target_cnes_unit_id: context.cnesUnitId,
      target_lotacao_id: context.lotacaoId,
    });
    if (createError) {
      if (createError.message?.includes('IDENTITY_CONFLICT')) {
        return json({ error: 'J\u00e1 existe um cadastro com este CPF ou matr\u00edcula e dados divergentes. Procure o RH para regulariza\u00e7\u00e3o.' }, 409);
      }
      throw createError;
    }
    if (attempt?.id) await db.from('submission_attempts').update({ accepted: true }).eq('id', attempt.id);
    return json(created, 201);
  } catch (error) {
    console.error('submit-request', error);
    if (error instanceof Error && error.message === 'INVALID_ACCESS_CONTEXT') return json({ error: 'Selecione novamente o vínculo e o CNES de atuação.' }, 403);
    if (error instanceof Error && error.message.includes('RESPONSIBILITY_DAYS_INCOMPLETE')) return json({ error: 'Defina o CNES responsável por todos os dias úteis do período.' }, 400);
    if (error instanceof Error && error.message.includes('RESPONSIBILITY_UNIT_INVALID')) return json({ error: 'Um dos CNES informados não pertence ao vínculo selecionado.' }, 403);
    const code = error instanceof Error ? error.message : String((error as any)?.message || '');
    if (code.includes('RESPONSIBILITY_DAY_DUPLICATED')) return json({ error: 'Cada dia deve possuir apenas um CNES responsável. Revise a distribuição.' }, 400);
    if (code.includes('RESPONSIBILITY_UNIT_INELIGIBLE')) return json({ error: 'Uma das atuações não está ativa, autorizada ou vigente para o dia escolhido. Confira o cadastro com o RH.' }, 400);
    if (code.includes('SUBMISSION_ACTOR_INVALID')) return json({ error: 'A sessão não corresponde ao titular do vínculo. Entre novamente e selecione o vínculo correto.' }, 403);
    return json({ error: 'N\u00e3o foi poss\u00edvel registrar a solicita\u00e7\u00e3o. Tente novamente ou procure o RH.' }, 500);
  }
});
