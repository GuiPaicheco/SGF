import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Sessão inválida.' }, 401);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: identity, error: identityError } = await admin.auth.getUser(token);
    if (identityError || !identity.user) return json({ error: 'Sessão inválida ou expirada.' }, 401);
    const { data: profile } = await admin.from('profiles').select('role,must_change_password').eq('id', identity.user.id).single();
    if (!profile || !['administrador', 'rh'].includes(profile.role) || profile.must_change_password) {
      return json({ error: 'Acesso não autorizado.' }, 403);
    }
    const payload = await request.json();
    const action = String(payload.action ?? 'list');

    if (action === 'list') {
      const { data: ownScopes } = profile.role === 'rh'
        ? await admin.from('profile_scopes').select('lotacao_id').eq('profile_id', identity.user.id)
        : { data: [] };
      const scopeIds = new Set((ownScopes || []).map(scope => scope.lotacao_id));
      const [{ data: inclusions, error: inclusionError }, { data: locations, error: locationError }] = await Promise.all([
        admin.from('employee_inclusion_requests')
          .select('id,status,requested_name,requested_unit,requested_position,requested_function,requested_employment_type,notes,created_at,servidor:servidores(id,matricula,cpf,birth_date,profile_id,lotacao_id),request:vacation_requests(protocol)')
          .order('created_at', { ascending: false }),
        admin.from('lotacoes').select('id,code,name,unit_type').eq('active', true).order('name'),
      ]);
      if (inclusionError || locationError) throw inclusionError || locationError;
      return json({
        inclusions: profile.role === 'rh' ? (inclusions || []).filter(item => item.servidor?.lotacao_id && scopeIds.has(item.servidor.lotacao_id)) : inclusions,
        locations: profile.role === 'rh' ? (locations || []).filter(location => scopeIds.has(location.id)) : locations,
      });
    }

    const id = String(payload.id ?? '');
    const notes = String(payload.notes ?? '').trim();
    const { data: inclusion } = await admin.from('employee_inclusion_requests')
      .select('id,status,servidor_id,requested_position,requested_employment_type').eq('id', id).single();
    if (!inclusion || !['pendente', 'em_analise'].includes(inclusion.status)) {
      return json({ error: 'Pendência não encontrada ou já concluída.' }, 409);
    }
    if (profile.role === 'rh') {
      const { data: employee } = await admin.from('servidores').select('lotacao_id').eq('id', inclusion.servidor_id).single();
      const { data: ownScope } = employee?.lotacao_id
        ? await admin.from('profile_scopes').select('lotacao_id').eq('profile_id', identity.user.id).eq('lotacao_id', employee.lotacao_id).maybeSingle()
        : { data: null };
      if (!ownScope) return json({ error: 'Esta inclusão não pertence ao seu escopo.' }, 403);
    }

    if (!['approve', 'reject'].includes(action)) return json({ error: 'Ação inválida.' }, 400);
    if (action === 'reject' && !notes) return json({ error: 'Informe a justificativa da rejeição.' }, 400);
    const locationId = String(payload.location_id ?? '');
    const positionName = String(payload.position ?? inclusion.requested_position ?? '').trim();
    const employmentType = String(payload.employment_type ?? inclusion.requested_employment_type ?? '').trim();
    if (action === 'approve' && (!locationId || !positionName || !employmentType)) return json({ error: 'Informe lotação, cargo e vínculo.' }, 400);
    if (action === 'approve' && profile.role === 'rh') {
      const { data: allowedScope } = await admin.from('profile_scopes').select('lotacao_id').eq('profile_id', identity.user.id).eq('lotacao_id', locationId).maybeSingle();
      if (!allowedScope) return json({ error: 'A lotação selecionada não pertence ao seu escopo.' }, 403);
    }
    const { error } = await admin.rpc('review_employee_inclusion', {
      inclusion_id: id,
      decision: action === 'approve' ? 'aprovada' : 'rejeitada',
      reviewer_id: identity.user.id,
      review_notes: notes || null,
      official_location_id: action === 'approve' ? locationId : null,
      official_position: action === 'approve' ? positionName : null,
      official_employment_type: action === 'approve' ? employmentType : null,
    });
    if (error) throw error;
    return json({ ok: true });
  } catch (error) {
    console.error('manage-inclusions', error);
    return json({ error: 'Não foi possível concluir a análise.' }, 500);
  }
});
