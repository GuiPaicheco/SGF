import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-sgf-role',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const inclusionLocation = (item: { servidor?: { lotacao_id?: string | null } | { lotacao_id?: string | null }[] | null }) => {
  const employee = Array.isArray(item.servidor) ? item.servidor[0] : item.servidor;
  return employee?.lotacao_id || null;
};

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
    const { data: profile } = await admin.from('profiles').select('roles,must_change_password').eq('id', identity.user.id).single();
    const actorRole = request.headers.get('x-sgf-role') || '';
    if (!profile?.roles?.includes(actorRole) || !['administrador', 'rh'].includes(actorRole) || profile.must_change_password) {
      return json({ error: 'Acesso não autorizado.' }, 403);
    }
    const payload = await request.json();
    const action = String(payload.action ?? 'list');

    if (action === 'list') {
      const { data: ownScopes } = actorRole === 'rh'
        ? await admin.from('profile_scopes').select('lotacao_id').eq('profile_id', identity.user.id)
        : { data: [] };
      const scopeIds = new Set((ownScopes || []).map(scope => scope.lotacao_id));
      const [{ data: inclusions, error: inclusionError }, { data: locations, error: locationError }] = await Promise.all([
        admin.from('employee_inclusion_requests')
          .select('id,status,requested_name,requested_unit,requested_position,requested_function,requested_team,requested_employment_type,notes,created_at,servidor:servidores(id,matricula,cpf,birth_date,profile_id,lotacao_id),request:vacation_requests(protocol)')
          .order('created_at', { ascending: false }),
        admin.from('lotacoes').select('id,code,name,unit_type').eq('active', true).order('name'),
      ]);
      if (inclusionError || locationError) throw inclusionError || locationError;
      return json({
        inclusions: actorRole === 'rh' ? (inclusions || []).filter(item => {
          const location = inclusionLocation(item);
          return location && scopeIds.has(location);
        }) : inclusions,
        locations: actorRole === 'rh' ? (locations || []).filter(location => scopeIds.has(location.id)) : locations,
      });
    }

    const id = String(payload.id ?? '');
    const notes = String(payload.notes ?? '').trim();
    const { data: inclusion } = await admin.from('employee_inclusion_requests')
      .select('id,status,servidor_id,requested_position,requested_team,requested_employment_type').eq('id', id).single();
    if (!inclusion || !['pendente', 'em_analise'].includes(inclusion.status)) {
      return json({ error: 'Pendência não encontrada ou já concluída.' }, 409);
    }
    if (actorRole === 'rh') {
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
    const team = String(payload.team ?? inclusion.requested_team ?? '').trim() || 'Não se aplica';
    if (action === 'approve' && (!locationId || !positionName || !employmentType)) return json({ error: 'Informe lotação, cargo e vínculo.' }, 400);
    if (action === 'approve' && actorRole === 'rh') {
      const { data: allowedScope } = await admin.from('profile_scopes').select('lotacao_id').eq('profile_id', identity.user.id).eq('lotacao_id', locationId).maybeSingle();
      if (!allowedScope) return json({ error: 'A lotação selecionada não pertence ao seu escopo.' }, 403);
    }
    if (action === 'approve') {
      const { error: teamError } = await admin.from('employee_inclusion_requests').update({ requested_team: team }).eq('id', id);
      if (teamError) throw teamError;
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
