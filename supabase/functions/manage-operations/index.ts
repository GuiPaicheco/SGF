import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { contextHeaders, validateAccessContext } from '../_shared/access-context.ts';
import { loadUnitCalendar } from '../_shared/unit-calendar.ts';
import { loadUnitMinimumScale } from '../_shared/unit-minimum-scale.ts';
import { loadManualConflicts } from '../_shared/manual-conflicts.ts';
import { applyNotificationContext, notificationInternalLocation } from '../_shared/scoped-notifications.ts';
import { loadAuditHistory } from '../_shared/audit-history.ts';
import { employeeInAccessContext } from '../_shared/employee-scope.ts';
import { actionAllowed } from '../_shared/action-policy.ts';
import { validateRejection, validateReasonCatalog } from '../_shared/rejection-reasons.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sgf-role, x-sgf-bond, x-sgf-cnes, x-sgf-lotacao', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const asciiJson = (body: unknown) => JSON.stringify(body).replace(/[\u007f-\uffff]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
const json = (body: unknown, status = 200) => new Response(asciiJson(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return json({ error: 'Servico indisponivel.' }, 503);
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Sessao obrigatoria.' }, 401);
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: identity, error: authError } = await admin.auth.getUser(token);
    if (authError || !identity.user) return json({ error: 'Sessao invalida.' }, 401);
    const { data: profile } = await admin.from('profiles').select('id,roles,must_change_password,disabled_at').eq('id', identity.user.id).single();
    const actorRole = request.headers.get('x-sgf-role') || '';
    if (!profile?.roles?.includes(actorRole) || profile.must_change_password || profile.disabled_at) return json({ error: 'Perfil indisponivel.' }, 403);
    const context = await validateAccessContext(admin, request, profile.id, profile.roles || []);
    const scoped = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { ...contextHeaders(context), 'x-sgf-actor': profile.id } } });
    const payload = await request.json(), action = String(payload.action || '');
    if(!actionAllowed('operations',action,context.role)) return json({error:'Seu perfil não permite executar esta ação.'},403);
    const employeeInContext = async (employeeId: string) => {
      return employeeInAccessContext(admin,context,employeeId);
    };

    if (action === 'audit-history') return json(await loadAuditHistory(admin, context, payload));
    if (action === 'notifications') {
      const internal = await notificationInternalLocation(admin, context);
      const query = applyNotificationContext(admin.from('notifications').select('id,request_id,title,message,read_at,created_at,recipient_role,cnes:cnes_units(name,code),location:lotacoes(name)'), profile.id, context, internal);
      const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(30);
      if (error) throw error;
      return json({ notifications: data || [] });
    }
    if (action === 'read-notifications') {
      const internal = await notificationInternalLocation(admin, context);
      const query = applyNotificationContext(admin.from('notifications').update({ read_at: new Date().toISOString() }), profile.id, context, internal).is('read_at', null);
      if (payload.id) query.eq('id', Number(payload.id));
      const { error } = await query; if (error) throw error; return json({ ok: true });
    }
    if (action === 'archives') {
      const { data, error } = await admin.from('request_archives').select('request_id').eq('profile_id', profile.id);
      if (error) throw error;
      return json({ request_ids: (data || []).map(item => item.request_id) });
    }
    if (action === 'archive-request') {
      if (!['rh', 'administrador'].includes(actorRole)) return json({ error: 'Apenas RH e administrador podem organizar a fila.' }, 403);
      const requestId = String(payload.request_id || '');
      const { data: target } = await admin.from('vacation_requests').select('id,servidor_id').eq('id', requestId).maybeSingle();
      if (!target) return json({ error: 'Solicitacao nao encontrada.' }, 404);
      if (!(await employeeInContext(target.servidor_id))) return json({ error: 'Solicitacao fora do contexto ativo.' }, 403);
      const archive = payload.archived !== false;
      const result = archive
        ? await admin.from('request_archives').upsert({ profile_id: profile.id, request_id: requestId })
        : await admin.from('request_archives').delete().eq('profile_id', profile.id).eq('request_id', requestId);
      if (result.error) throw result.error;
      return json({ ok: true });
    }
    if (action === 'unit-calendar') {
      if (!['diretor', 'rh', 'administrador'].includes(actorRole)) return json({ error: 'Acesso indisponivel.' }, 403);
      const month = String(payload.month || '');
      if (!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(month)) return json({ error: 'Mes invalido.' }, 400);
      if (!context.global && !context.cnesUnitId) return json({ error: 'Selecione um contexto CNES para abrir o calendario.' }, 400);
      return json(await loadUnitCalendar(admin, context, month));
    }
    if (action === 'manual-conflicts') {
      if (!['diretor', 'rh', 'administrador'].includes(actorRole)) return json({ error: 'Acesso indisponivel.' }, 403);
      const month = String(payload.month || '');
      if (!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(month)) return json({ error: 'Mes invalido.' }, 400);
      if (!context.global && !context.cnesUnitId) return json({ error: 'Selecione o contexto CNES.' }, 400);
      return json(await loadManualConflicts(admin, context, month));
    }
    if (action === 'manual-conflict-save') {
      if (!['diretor', 'rh', 'administrador'].includes(actorRole)) return json({ error: 'Acesso indisponivel.' }, 403);
      if (!['create', 'resolve', 'cancel'].includes(payload.conflict_action) || !Number.isInteger(payload.version)) return json({ error: 'Acao ou versao invalida.' }, 400);
      const { data, error } = await scoped.rpc('manage_manual_calendar_conflict', {
        actor_id: profile.id, target_id: payload.id, target_action: payload.conflict_action,
        target_cnes_id: payload.cnes_unit_id || null, target_lotacao_id: payload.internal_lotacao_id || null,
        target_bond_unit_id: payload.bond_unit_id || null, target_start: payload.start_date || null,
        target_end: payload.end_date || null, target_reason: String(payload.justification || '').trim(), expected_version: payload.version,
      });
      if (error) throw error;
      return json({ conflict: data });
    }
    if (action === 'scale-list') {
      if (!['diretor', 'rh', 'administrador'].includes(actorRole)) return json({ error: 'Acesso indisponivel.' }, 403);
      const month = String(payload.month || '');
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return json({ error: 'Mes invalido.' }, 400);
      if (!context.global && !context.cnesUnitId) return json({ error: 'Selecione o contexto CNES.' }, 400);
      return json(await loadUnitMinimumScale(admin, context, month));
    }
    if (action === 'scale-save') {
      if (!['rh', 'administrador'].includes(actorRole)) return json({ error: 'Acesso indisponivel.' }, 403);
      if (!context.global && payload.cnes_unit_id !== context.cnesUnitId) return json({ error: 'CNES fora do contexto ativo.' }, 403);
      if (!Array.isArray(payload.bond_unit_ids) || !Number.isInteger(payload.version)) return json({ error: 'Escala ou versao invalida.' }, 400);
      const { error } = await scoped.rpc('set_unit_minimum_scale', {
        actor_id: profile.id, target_cnes_id: payload.cnes_unit_id, target_lotacao_id: payload.internal_lotacao_id || null,
        target_date: payload.date, target_bond_unit_ids: payload.bond_unit_ids, expected_version: payload.version,
        target_source_date: payload.source_date || null,
      });
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === 'time-bank') {
      if (!['rh', 'administrador'].includes(actorRole)) return json({ error: 'Somente RH ou administrador pode lancar saldo.' }, 403);
      const minutes = Math.round(Number(payload.hours) * 60);
      if (!Number.isFinite(minutes) || minutes === 0) return json({ error: 'Informe uma quantidade de horas diferente de zero.' }, 400);
      if (!(await employeeInContext(String(payload.servidor_id || '')))) return json({ error: 'Servidor fora do contexto ativo.' }, 403);
      const { data, error } = await scoped.rpc('manage_time_bank', { actor_id: profile.id, target_servidor_id: payload.servidor_id, target_minutes: minutes, target_description: payload.description, target_date: payload.occurred_on || null });
      if (error) throw error; return json({ balance_minutes: data });
    }
    if (action === 'conflict-employees') {
      if (!['diretor','rh','administrador'].includes(actorRole)) return json({error:'Acesso indisponível.'},403);
      const {data,error} = await scoped.rpc('list_rejection_conflict_candidates',{actor_id:profile.id,target_request_id:payload.request_id});
      if (error) throw error;
      return json({employees:data || []});
    }
    if (action === 'rejection-reason-save') {
      if (!context.global || actorRole !== 'administrador') return json({error:'Somente o Administrador pode alterar motivos.'},403);
      const item = validateReasonCatalog(payload);
      const {data,error} = await scoped.rpc('manage_rejection_reason', {actor_id:profile.id,target_code:item.code,
        target_label:item.label,target_mode:item.input_mode,target_active:item.active,target_order:item.display_order,
        expected_version:item.version,target_justification:item.justification});
      if (error) throw error;
      return json({reason:data});
    }
    if (action === 'rejection-reasons') {
      if (!['diretor', 'rh', 'administrador'].includes(actorRole)) return json({error:'Acesso indisponivel.'},403);
      if (payload.include_inactive && !context.global) return json({error:'Catálogo completo exclusivo do Administrador.'},403);
      let query = admin.from('request_rejection_reasons').select('code,label,input_mode,active,display_order,version');
      if (!payload.include_inactive) query = query.eq('active',true);
      const {data,error} = await query.order('display_order').order('code');
      if (error) throw error;
      return json({reasons:data || []});
    }
    if (action === 'legacy-approval') {
      if (!['rh','administrador'].includes(actorRole)) return json({error:'Análise legada exclusiva de RH/Administrador.'},403);
      if (!['chefia_imediata','rh'].includes(payload.stage) || !['aprovada','rejeitada'].includes(payload.decision)
        || !Number.isInteger(payload.version) || payload.version < 1) return json({error:'Etapa, decisão ou versão inválida.'},400);
      let rejection = null;
      if (payload.decision === 'rejeitada') {
        const {data:reason,error} = await admin.from('request_rejection_reasons').select('code,input_mode,active').eq('code',String(payload.rejection?.code || '')).maybeSingle();
        if (error) throw error;
        rejection = validateRejection(reason,payload.rejection,payload.notes);
      }
      const {data,error} = await scoped.rpc('manage_legacy_request_approval',{actor_id:profile.id,target_request_id:payload.request_id,
        target_stage:payload.stage,target_decision:payload.decision,target_notes:String(payload.notes || '').trim() || null,
        expected_version:payload.version,target_rejection:rejection});
      if (error) throw error;
      return json({status:data});
    }
    if (action === 'pending-distribution-editor') {
      if (!['servidor','rh','administrador'].includes(actorRole)) return json({error:'Seu perfil não permite corrigir a distribuição.'},403);
      const {data,error} = await scoped.rpc('pending_distribution_editor',{actor_id:profile.id,target_request:payload.request_id});
      if (error) throw error;
      return json({distribution:data});
    }
    if (action === 'redistribute-pending-day') {
      if (!['servidor','rh','administrador'].includes(actorRole)) return json({error:'Seu perfil não permite corrigir a distribuição.'},403);
      if (!Number.isInteger(payload.version) || payload.version<1 || typeof payload.justification!=='string'
        || payload.justification.trim().length<3 || payload.justification.trim().length>2000)
        return json({error:'Informe a versão atual e uma justificativa de 3 a 2000 caracteres.'},400);
      const {data,error} = await scoped.rpc('change_pending_day_responsibility',{
        actor_id:profile.id,target_request:payload.request_id,target_date:payload.date,
        target_assignment:payload.bond_unit_id,expected_version:payload.version,target_reason:payload.justification.trim()
      });
      if (error) throw error;
      return json({version:data});
    }
    if (action === 'unit-review') {
      if (!['diretor', 'rh', 'administrador'].includes(actorRole)) return json({ error: 'Acesso indisponivel.' }, 403);
      const reviewId = String(payload.review_id || '');
      const reviewAction = String(payload.review_action || '');
      const version = Number(payload.version);
      if (!reviewId || !['approve', 'reject', 'schedule'].includes(reviewAction) || !Number.isInteger(version)) return json({ error: 'Acao de analise invalida.' }, 400);
      let rejection = null;
      if (reviewAction === 'reject') {
        const {data:reason,error} = await admin.from('request_rejection_reasons').select('code,input_mode,active').eq('code',String(payload.rejection?.code || '')).maybeSingle();
        if (error) throw error;
        rejection = validateRejection(reason,payload.rejection,payload.notes);
        if (reason?.input_mode === 'conflict' && !rejection.bond_unit_id) return json({error:'Selecione uma atuação do funcionário no escopo da revisão.'},400);
      }
      const { data, error } = await scoped.rpc('manage_unit_request_review', {
        actor_id: profile.id,
        target_review_id: reviewId,
        target_action: reviewAction,
        target_notes: String(payload.notes || '').trim() || null,
        expected_version: version,
        target_rejection: rejection,
      });
      if (error) throw error;
      return json(data);
    }
    if (action === 'operation') {
      if(actorRole==='servidor' && payload.operation!=='reenviar') return json({error:'O Servidor pode apenas reenviar o próprio pedido devolvido.'},403);
      const { data: target } = await admin.from('vacation_requests').select('servidor_id').eq('id', String(payload.request_id || '')).maybeSingle();
      if (!target || !(await employeeInContext(target.servidor_id))) return json({ error: 'Solicitacao fora do contexto ativo.' }, 403);
      const { data, error } = await scoped.rpc('manage_request_operation', { actor_id: profile.id, target_request_id: payload.request_id, target_action: payload.operation, target_notes: payload.notes || null, target_periods: payload.periods || null });
      if (error) throw error; return json({ status: data });
    }
    return json({ error: 'Acao invalida.' }, 400);
  } catch (error) {
    console.error('manage-operations', error);
    if (error instanceof Error && error.message === 'INVALID_ACCESS_CONTEXT') return json({ error: 'Selecione novamente o perfil e o local de atuacao.' }, 403);
    const message = error instanceof Error ? error.message : String((error as {message?:string})?.message || 'Falha operacional.');
    if (message === 'CALENDAR_REVIEW_REQUIRED') return json({error:'O calendário deste pedido mudou. Resolva os dias sem CNES e as pendências de revisão antes de aprovar ou adicionar ao calendário.'},409);
    const known: Record<string,string> = { TRANSITION_NOT_ALLOWED: 'Esta transicao nao e permitida.', NOTES_REQUIRED: 'Informe uma justificativa.', REJECTION_REASON_REQUIRED: 'Informe a justificativa da recusa.', APPROVAL_REQUIRED: 'A solicitacao precisa ser aprovada antes de entrar no calendario.', REVIEW_TRANSITION_INVALID: 'Esta acao nao e permitida na situacao atual.', REVIEW_VERSION_CONFLICT: 'A solicitacao foi alterada por outro gestor. Atualize a tela antes de continuar.', INSUFFICIENT_VALIDATED_BALANCE: 'Saldo validado insuficiente.', REQUEST_OUT_OF_SCOPE: 'Solicitacao fora do seu escopo.', PERIODS_INVALID: 'Periodos informados sao invalidos.' };
    if (message === 'DISTRIBUTION_VERSION_CONFLICT') return json({error:'A distribuição foi alterada. Atualize o pedido antes de continuar.'},409);
    if (message === 'DISTRIBUTION_ALREADY_DECIDED') return json({error:'Só é possível redistribuir enquanto todas as análises estiverem pendentes.'},409);
    if (message === 'DISTRIBUTION_SCOPE_CHANGE_PENDING') return json({error:'Nesta fase, mantenha ao menos um dia em cada CNES e use apenas unidades já presentes na análise.'},400);
    if (['DISTRIBUTION_INPUT_INVALID','DISTRIBUTION_DAY_INVALID','RESPONSIBILITY_UNIT_INVALID'].includes(message)) return json({error:'Confira a data já distribuída, a atuação autorizadora vigente e a justificativa.'},400);
    if (message === 'SCALE_VERSION_CONFLICT') return json({ error: 'A escala foi alterada por outro gestor. Atualize a visão antes de salvar novamente.' }, 409);
    if (message === 'CONFLICT_VERSION_CONFLICT') return json({ error: 'O conflito foi alterado por outro gestor. Atualize a visão antes de continuar.' }, 409);
    if (message === 'CONFLICT_ALREADY_CLOSED') return json({ error: 'Este conflito já foi resolvido ou cancelado. O histórico foi preservado.' }, 400);
    if (message === 'CONFLICT_INPUT_INVALID') return json({ error: 'Confira unidade, período e justificativa (3 a 2000 caracteres).' }, 400);
    if (message === 'CONFLICT_ALREADY_CREATED') return json({ error: 'Este registro já foi enviado. Atualize a visão para consultar o conflito salvo.' }, 409);
    if (message === 'CONFLICT_NOT_FOUND') return json({ error: 'Conflito não encontrado no histórico.' }, 404);
    if (message === 'TARGET_SCOPE_REQUIRED') return json({ error: 'A ação não pertence ao CNES/lotação do seu acesso.' }, 403);
    if (message === 'AUDIT_ACCESS_DENIED') return json({ error: 'Seu perfil não permite consultar este histórico.' }, 403);
    if (message === 'AUDIT_PERIOD_INVALID') return json({ error: 'Informe datas válidas e um intervalo de até 366 dias.' }, 400);
    if (message === 'AUDIT_FILTER_INVALID') return json({ error: 'Confira os filtros e identificadores do histórico.' }, 400);
    if (message === 'UNIT_REVIEW_REQUIRED') return json({error:'Este pedido exige análise independente por CNES. Atualize a tela.'},400);
    if (message === 'CONTEXTUAL_OPERATION_REQUIRED') return json({error:'Este pedido usa distribuição por CNES. Alterações de período e decisões precisam do fluxo específico; cancelamento global é restrito ao Administrador.'},400);
    if (message === 'REQUEST_ALREADY_DECIDED' || message === 'STAGE_ALREADY_DECIDED') return json({error:'Esta etapa já foi decidida. Atualize a solicitação antes de continuar.'},409);
    if (message === 'MANAGER_APPROVAL_REQUIRED') return json({error:'A etapa da chefia deve ser aprovada antes da análise no RH.'},400);
    if (message === 'REASON_CATALOG_INVALID') return json({error:'Confira código, nome, modo, ordem e justificativa do motivo.'},400);
    if (message === 'REASON_VERSION_CONFLICT') return json({error:'Outro administrador alterou este motivo. Atualize o catálogo antes de salvar.'},409);
    if (message === 'REASON_MODE_IMMUTABLE') return json({error:'O modo de preenchimento não pode mudar. Crie outro motivo e desative o anterior.'},400);
    if (message === 'REASON_LAST_ACTIVE') return json({error:'Mantenha pelo menos um motivo ativo para permitir recusas.'},400);
    if (message === 'REJECTION_REASON_INACTIVE') return json({error:'Selecione um motivo de recusa ativo. Atualize a solicitação se necessário.'},400);
    if (message === 'REJECTION_DATA_INVALID') return json({error:'Informe a justificativa da recusa (3 a 2000 caracteres) e os dados exigidos pelo motivo.'},400);
    if (message === 'REJECTION_BANK_INVALID') return json({error:'Informe o saldo real conferido pelo RH e a quantidade necessária, que deve ser superior ao saldo.'},400);
    if (message === 'REJECTION_CONFLICT_MEMBER_INVALID') return json({error:'A atuação selecionada não pertence à revisão, não está ativa ou não é vigente em todo o período. Atualize o pedido e confira as datas.'},400);
    if (message === 'REJECTION_CONFLICT_INVALID') return json({error:'Especifique o funcionário e o período válido do conflito; explique o motivo na justificativa.'},400);
    if (message === 'CONFIRMED_ABSENCE_ON_SCALE') return json({ error: 'Uma atuação selecionada possui afastamento confirmado neste dia. Atualize a visão e revise a escala.' }, 400);
    if (message === 'BOND_UNIT_OUT_OF_CONTEXT') return json({ error: 'Uma atuação não pertence à unidade ou não está vigente nesta data.' }, 400);
    const status = message.includes('REVIEW_VERSION_CONFLICT') ? 409 : /NOT_ALLOWED|OUT_OF_SCOPE|INVALID_ACCESS_CONTEXT/.test(message) ? 403 : 400;
    return json({ error: known[message] || message }, status);
  }
});
