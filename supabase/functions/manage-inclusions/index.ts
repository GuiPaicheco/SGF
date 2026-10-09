import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { contextHeaders, validateAccessContext } from '../_shared/access-context.ts';
import { employeeInAccessContext } from '../_shared/employee-scope.ts';
import { actionAllowed } from '../_shared/action-policy.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-sgf-role, x-sgf-bond, x-sgf-cnes, x-sgf-lotacao',
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
    const { data: profile } = await admin.from('profiles').select('roles,must_change_password').eq('id', identity.user.id).single();
    const actorRole = request.headers.get('x-sgf-role') || '';
    if (!profile?.roles?.includes(actorRole) || !['administrador', 'rh'].includes(actorRole) || profile.must_change_password) {
      return json({ error: 'Acesso não autorizado.' }, 403);
    }
    const context = await validateAccessContext(admin, request, identity.user.id, profile.roles || []);
    const scoped = createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{...contextHeaders(context),'x-sgf-actor':identity.user.id}}});
    const payload = await request.json();
    const action = String(payload.action ?? 'list');
    if(!actionAllowed('inclusions',action,context.role)) return json({error:'Seu perfil não permite executar esta ação.'},403);
    const employeeInContext = async (employeeId: string) => {
      return employeeInAccessContext(admin,context,employeeId);
    };

    if (action === 'list') {
      const [{ data: inclusions, error: inclusionError }, { data: locations, error: locationError }] = await Promise.all([
        admin.from('employee_inclusion_requests')
          .select('id,status,requested_name,requested_unit,requested_position,requested_function,requested_team,requested_employment_type,notes,created_at,servidor:servidores(id,matricula,cpf,birth_date,profile_id,lotacao_id),request:vacation_requests(protocol)')
          .order('created_at', { ascending: false }),
        admin.from('lotacoes').select('id,code,name,unit_type').eq('active', true).order('name'),
      ]);
      if (inclusionError || locationError) throw inclusionError || locationError;
      const visible = actorRole === 'rh' ? [] : inclusions || [];
      if (actorRole === 'rh') for (const item of inclusions || []) {
        const employee = Array.isArray(item.servidor) ? item.servidor[0] : item.servidor;
        if (employee?.id && await employeeInContext(employee.id)) visible.push(item);
      }
      return json({
        inclusions: visible,
        locations: actorRole === 'rh' ? (locations || []).filter(location => location.id === context.lotacaoId) : locations,
      });
    }

    const id = String(payload.id ?? '');
    const notes = String(payload.notes ?? '').trim();
    const { data: inclusion } = await admin.from('employee_inclusion_requests')
      .select('id,status,servidor_id,requested_position,requested_team,requested_employment_type').eq('id', id).single();
    if (!inclusion || !['pendente', 'em_analise'].includes(inclusion.status)) {
      return json({ error: 'Pendência não encontrada ou já concluída.' }, 409);
    }
    if (!(await employeeInContext(inclusion.servidor_id))) return json({ error: 'Esta inclusão não pertence ao contexto ativo.' }, 403);

    if (!['approve', 'reject'].includes(action)) return json({ error: 'Ação inválida.' }, 400);
    if (action === 'reject' && !notes) return json({ error: 'Informe a justificativa da rejeição.' }, 400);
    const locationId = String(payload.location_id ?? '');
    const positionName = String(payload.position ?? inclusion.requested_position ?? '').trim();
    const employmentType = String(payload.employment_type ?? inclusion.requested_employment_type ?? '').trim();
    const team = String(payload.team ?? inclusion.requested_team ?? '').trim() || 'Não se aplica';
    if (action === 'approve' && (!locationId || !positionName || !employmentType)) return json({ error: 'Informe lotação, cargo e vínculo.' }, 400);
    if (action === 'approve' && actorRole === 'rh') {
      if (locationId !== context.lotacaoId) return json({ error: 'A lotação selecionada não pertence ao contexto ativo.' }, 403);
    }
    if (action === 'approve') {
      const { error: teamError } = await scoped.from('employee_inclusion_requests').update({ requested_team: team }).eq('id', id);
      if (teamError) throw teamError;
    }
    const { error } = await scoped.rpc('review_employee_inclusion', {
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
    if (error instanceof Error && error.message === 'INVALID_ACCESS_CONTEXT') return json({ error: 'Selecione novamente o perfil e o local de atuação.' }, 403);
    return json({ error: 'Não foi possível concluir a análise.' }, 500);
  }
});
