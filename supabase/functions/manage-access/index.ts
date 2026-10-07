import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { contextHeaders, validateAccessContext } from '../_shared/access-context.ts';
import { accessRequestInScope } from '../_shared/employee-scope.ts';
import { actionAllowed } from '../_shared/action-policy.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sgf-role, x-sgf-bond, x-sgf-cnes, x-sgf-lotacao',
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
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Sessão inválida.' }, 401);
    const { data: identity, error: identityError } = await admin.auth.getUser(token);
    if (identityError || !identity.user) return json({ error: 'Sessão inválida ou expirada.' }, 401);
    const { data: actor } = await admin.from('profiles').select('roles,must_change_password,disabled_at').eq('id', identity.user.id).single();
    const actorRole = request.headers.get('x-sgf-role') || '';
    if (!actor?.roles?.includes(actorRole) || !['administrador','rh'].includes(actorRole) || actor.must_change_password || actor.disabled_at) return json({ error: 'Acesso exclusivo do administrador e RH.' }, 403);
    const context = await validateAccessContext(admin, request, identity.user.id, actor.roles || []);
    const scoped = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { ...contextHeaders(context), 'x-sgf-actor': identity.user.id } } });
    const {data: activeLocation,error: activeLocationError} = context.global ? {data:null,error:null}
      : await admin.from('lotacoes').select('is_internal_allocation').eq('id',context.lotacaoId).single();
    if(activeLocationError) throw activeLocationError;
    const { data: scopedLocations } = actorRole === 'rh'
      ? await admin.from('profile_scopes').select('lotacao_id,lotacao:lotacoes!profile_scopes_lotacao_id_fkey(id,code,name)').eq('profile_id', identity.user.id).eq('lotacao_id', context.lotacaoId)
      : { data: [] };
    const allowedLocationIds = new Set((scopedLocations || []).map(item => item.lotacao_id));
    let scopedCnesQuery = admin.from('lotacao_cnes_units').select('cnes_unit_id').in('lotacao_id', [...allowedLocationIds]);
    if (context.cnesUnitId) scopedCnesQuery = scopedCnesQuery.eq('cnes_unit_id', context.cnesUnitId);
    const { data: scopedCnesRows } = actorRole === 'rh' && allowedLocationIds.size ? await scopedCnesQuery : { data: [] };
    const allowedCnesIds = new Set((scopedCnesRows || []).map(item => item.cnes_unit_id));
    const scopedNames = new Set((scopedLocations || []).flatMap(item => {
      const location = Array.isArray(item.lotacao) ? item.lotacao[0] : item.lotacao;
      return [location?.name, location?.code].filter(Boolean).map(value => String(value).trim().toLocaleLowerCase('pt-BR'));
    }));
    const inRhScope = (unit: string) => scopedNames.has(String(unit || '').trim().toLocaleLowerCase('pt-BR'));
    const requestInRhScope = (item: any) => item.model_version === 2
      ? accessRequestInScope(item,allowedCnesIds,context.lotacaoId!,Boolean(activeLocation?.is_internal_allocation))
      : inRhScope(item.requested_unit);
    const payload = await request.json();
    const action = String(payload.action ?? 'list');
    if(!actionAllowed('access',action,context.role)) return json({error:'Seu perfil não permite executar esta ação.'},403);

    if (action === 'list') {
      const [{ data: requests, error: requestError }, { data: locations, error: locationError }] = await Promise.all([
        admin.from('access_requests').select('id,full_name,registration,cpf,birth_date,email,requested_position,requested_unit,requested_team,model_version,status,notes,created_at,access_request_bonds(id,registration,employment_type,weekly_hours,sequence,cargo:cargos(id,name),pole:cnes_units!access_request_bonds_pole_cnes_unit_id_fkey(id,code,name),units:access_request_bond_units(id,cnes_unit_id,internal_lotacao_id,weekly_hours,sequence,not_applicable,cnes:cnes_units(id,code,name),allocation:lotacoes(id,name),team:teams(id,type_code,name,ine_code,needs_review)))').order('created_at', { ascending: false }),
        admin.from('lotacoes').select('id,code,name,unit_type').eq('active', true).order('name'),
      ]);
      if (requestError || locationError) throw requestError || locationError;
      if (actorRole === 'rh') {
        return json({ requests: (requests || []).filter(item => item.status === 'pendente' && requestInRhScope(item)), locations: (locations || []).filter(item => allowedLocationIds.has(item.id)) });
      }
      return json({ requests, locations });
    }

    const requestId = String(payload.id ?? '');
    if (!requestId) return json({ error: 'Solicitação inválida.' }, 400);
    if(actorRole==='rh') {
      const {data: requested,error} = await admin.from('access_requests').select('model_version,requested_unit,access_request_bonds(units:access_request_bond_units(cnes_unit_id,internal_lotacao_id))').eq('id',requestId).maybeSingle();
      if(error) throw error;
      if(!requested || !requestInRhScope(requested)) return json({error:'Este pedido contém vínculos fora do contexto ativo. Encaminhe a análise ao Administrador.'},403);
    }
    if (action === 'reject') {
      const notes = String(payload.notes ?? '').trim();
      if (actorRole === 'rh') {
        const { data: access } = await admin.from('access_requests').select('id,status,requested_unit,model_version').eq('id', requestId).maybeSingle();
        if (!access || access.status !== 'pendente' || (access.model_version!==2 && !inRhScope(access.requested_unit)) || !notes) return json({ error: 'Confira a lotação solicitada e a justificativa.' }, 400);
        const { data: rejected, error } = await admin.from('access_requests').update({ status: 'rejeitada', notes, reviewed_by: identity.user.id, reviewed_at: new Date().toISOString() }).eq('id', requestId).eq('status', 'pendente').select('id').maybeSingle();
        if (error) throw error;
        if (!rejected) return json({ error: 'Esta solicitação já foi analisada.' }, 409);
        await admin.from('audit_events').insert({ actor_id: identity.user.id, action: 'access_request_rejected', entity_type: 'access_request', entity_id: requestId, new_value: { requested_unit: access.requested_unit } });
        return json({ ok: true });
      }
      const { error } = await scoped.rpc('reject_access_request', {
        actor_id: identity.user.id, target_request_id: requestId, target_notes: notes,
      });
      if (error) throw error;
      return json({ ok: true });
    }
    if (action !== 'approve') return json({ error: 'Ação inválida.' }, 400);

    const roles: string[] = Array.isArray(payload.roles) ? [...new Set<string>(payload.roles.map((value: unknown) => String(value)))] : [];
    if (!roles.length || roles.some(role => !['servidor', 'diretor', 'rh', 'administrador'].includes(role))) return json({ error: 'Selecione acessos válidos.' }, 400);
    if (actorRole === 'rh' && (roles.length !== 1 || roles[0] !== 'servidor')) return json({ error: 'O RH pode aprovar somente acesso de Servidor.' }, 403);
    const scopes = Array.isArray(payload.scope_ids) ? [...new Set(payload.scope_ids.map(String))] : [];
    const { data: accessRequest } = await admin.from('access_requests')
      .select('email,full_name,cpf,status,requested_unit,model_version').eq('id', requestId).single();
    if (!accessRequest || accessRequest.status !== 'pendente') return json({ error: 'Esta solicitação já foi analisada.' }, 409);
    if (!/^[^\s@]+@betim\.mg\.gov\.br$/i.test(accessRequest.email)) return json({ error: 'O solicitante precisa usar e-mail institucional @betim.mg.gov.br.' }, 400);
    const locationId = String(payload.lotacao_id || '');
    if (accessRequest.model_version !== 2) {
      const { data: location } = await admin.from('lotacoes').select('id').eq('id', locationId).eq('active', true).maybeSingle();
      if (!location) return json({ error: 'Selecione a lotação CNES do servidor.' }, 400);
      if (actorRole === 'rh' && !allowedLocationIds.has(locationId)) return json({ error: 'Lotação fora do seu escopo.' }, 403);
      if (actorRole === 'rh' && !inRhScope(accessRequest.requested_unit)) return json({ error: 'Solicitação fora do seu escopo.' }, 403);
    }

    const { data: existing } = await admin.from('profiles').select('id').eq('cpf', accessRequest.cpf).maybeSingle();
    const initialPassword = '123456';
    const created = existing ? null : await admin.auth.admin.createUser({
      email: accessRequest.email, password: initialPassword, email_confirm: true,
      user_metadata: { full_name: accessRequest.full_name }, app_metadata: { app_roles: roles },
    });
    if (!existing && (created?.error || !created?.data.user)) return json({ error: created?.error?.message || 'Não foi possível criar a conta. Verifique se o e-mail já possui uma conta.' }, 409);
    const accountId = existing?.id || created!.data.user!.id;
    const { error: finalizeError } = accessRequest.model_version === 2
      ? await scoped.rpc('approve_multi_bond_access', {
        actor_id: identity.user.id,
        target_request_id: requestId,
        account_id: accountId,
        target_roles: roles,
        target_scope_ids: actorRole === 'rh' ? [] : scopes,
      })
      : await scoped.rpc('approve_cpf_access_with_location', {
        actor_id: identity.user.id,
        target_request_id: requestId,
        account_id: accountId,
        target_roles: roles,
        target_scope_ids: actorRole === 'rh' ? [locationId] : scopes,
        target_lotacao_id: locationId,
      });
    if (finalizeError) {
      if (created?.data.user) await admin.auth.admin.deleteUser(created.data.user.id);
      if (finalizeError.message.includes('IDENTITY_CONFLICT')) return json({ error: 'CPF, matrícula ou nascimento divergem do cadastro funcional.' }, 409);
      if (finalizeError.message.includes('ACCOUNT_EXISTS')) return json({ error: 'Este servidor já possui uma conta vinculada.' }, 409);
      if (finalizeError.message.includes('SCOPE_REQUIRED')) return json({ error: 'Selecione ao menos uma lotação para Diretor ou RH.' }, 400);
      throw finalizeError;
    }
    const [{ data: account }, { data: granted }] = await Promise.all([
      admin.auth.admin.getUserById(accountId),
      admin.from('profiles').select('roles').eq('id', accountId).single(),
    ]);
    await admin.auth.admin.updateUserById(accountId, { app_metadata: { ...(account.user?.app_metadata || {}), app_roles: granted?.roles || roles } });
    if (!existing) {
      const { error: flagError } = await admin.from('profiles').update({ must_change_password: true }).eq('id', accountId);
      if (flagError) throw flagError;
    }
    return json({ ok: true, existing: Boolean(existing), ...(!existing ? { temporary_password: initialPassword } : {}) });
  } catch (error) {
    console.error('manage-access', error);
    if (error instanceof Error && error.message === 'INVALID_ACCESS_CONTEXT') return json({ error: 'Selecione novamente o perfil e o local de atuação.' }, 403);
    return json({ error: 'Não foi possível analisar a solicitação de acesso.' }, 500);
  }
});
