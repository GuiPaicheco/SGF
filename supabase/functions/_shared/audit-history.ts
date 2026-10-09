import type { AccessContext } from './access-context.ts';
import { notificationInternalLocation } from './scoped-notifications.ts';

export function sanitizeAudit(value: any): any {
  if (Array.isArray(value)) return value.map(sanitizeAudit);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key,item]) => (key === 'must_change_password' && typeof item === 'boolean') || !/password|senha|token|secret|api.?key|authorization|credential|cookie/i.test(key))
    .map(([key, item]) => [key, sanitizeAudit(item)]));
  if(typeof value === 'string' && /Bearer\s|sb_secret_|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./i.test(value)) return '[credencial removida]';
  return value;
}

export function auditInScope(row: any, context: AccessContext, internal: string | null) {
  return context.global || (row.context_cnes_unit_id === context.cnesUnitId
    && (internal ? row.context_lotacao_id === internal : !row.context_lotacao_id || row.context_lotacao_id === context.lotacaoId));
}

export function auditDTO(row: any, global: boolean) {
  const summary=(value:any)=>({status:value?.status??null,...Object.fromEntries(
    ['active','weekly_hours','valid_from','valid_until','start_date','end_date','return_date','days','minutes','available_days','acquisition_start','acquisition_end','type','not_applicable','date','source_date','version']
      .filter(key=>value&&Object.hasOwn(value,key)).map(key=>[key,value[key]]))});
  const before = global ? sanitizeAudit(row.previous_value) : summary(row.previous_value);
  const after = global ? sanitizeAudit(row.new_value) : summary(row.new_value);
  return sanitizeAudit({id: row.id, actor_id: row.actor_id, actor_name: row.actor_name_at_event || row.actor?.full_name || null, role: row.actor_role,
    action: row.action, entity_type: row.entity_type, entity_id: row.entity_id, occurred_at: row.occurred_at,
    bond: row.bond_registration_at_event || row.bond?.registration || null, cnes: row.cnes?.name || null, location: row.location?.name || null,
    affected_name: row.affected_name || null, affected_source: row.affected_source || null,
    affected_names: Array.isArray(row.affected_names) ? row.affected_names.map(sanitizeAudit) : [],
    reason: sanitizeAudit(row.reason) || null, before, after});
}

export function auditSearchPattern(value: unknown) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new Error('AUDIT_FILTER_INVALID');
  const text = value.trim();
  if (!text) return null;
  if (text.length < 2 || text.length > 120 || /[\u0000-\u001f\u007f]/.test(text)) throw new Error('AUDIT_FILTER_INVALID');
  // Search literal text, not user-supplied SQL wildcard expressions.
  return `%${text.replace(/[\\%_]/g, '\\$&')}%`;
}

export async function loadAuditHistory(admin: any, context: AccessContext, payload: any) {
  if (!['administrador','rh','diretor'].includes(context.role)) throw new Error('AUDIT_ACCESS_DENIED');
  const start = String(payload.start_date || ''), end = String(payload.end_date || '');
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(value).valueOf()) && new Date(value).toISOString().slice(0,10) === value;
  if (!validDate(start) || !validDate(end) || end < start || (Date.parse(end)-Date.parse(start))/86400000 > 366) throw new Error('AUDIT_PERIOD_INVALID');
  const page = Number(payload.page || 0);
  if (!Number.isInteger(page) || page < 0 || page > 10000) throw new Error('AUDIT_FILTER_INVALID');
  const action = String(payload.event || '').trim();
  if (action && !/^[a-zA-Z0-9_]{1,100}$/.test(action)) throw new Error('AUDIT_FILTER_INVALID');
  const actorPattern = auditSearchPattern(payload.actor_name);
  const registrationPattern = auditSearchPattern(payload.registration);
  const affectedPattern = auditSearchPattern(payload.affected_name);
  const internal = await notificationInternalLocation(admin, context);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Left joins preserve historical events even when their actor or bond is unavailable.
  let query = admin.from('audit_events').select(`id,actor_id,actor_role,actor_name_at_event,bond_registration_at_event,action,entity_type,entity_id,occurred_at,reason,previous_value,new_value,affected_name,affected_names,affected_source,context_cnes_unit_id,context_lotacao_id,actor:profiles!audit_events_actor_id_fkey(full_name),bond:employment_bonds!audit_events_context_bond_id_fkey(registration),cnes:cnes_units!audit_events_context_cnes_unit_id_fkey(name),location:lotacoes!audit_events_context_lotacao_id_fkey(name)`)
    .gte('occurred_at', `${start}T00:00:00-03:00`).lte('occurred_at', `${end}T23:59:59.999999-03:00`);
  if (!context.global) {
    if (!context.cnesUnitId) throw new Error('INVALID_ACCESS_CONTEXT');
    query = query.eq('context_cnes_unit_id', context.cnesUnitId);
    query = internal ? query.eq('context_lotacao_id', internal) : query.or(`context_lotacao_id.is.null,context_lotacao_id.eq.${context.lotacaoId}`);
  }
  if (action) query = query.eq('action', action);
  if (actorPattern) query = query.ilike('actor_search', actorPattern);
  if (registrationPattern) query = query.ilike('registration_search', registrationPattern);
  if (affectedPattern) query = query.ilike('affected_search', affectedPattern);
  for (const [input, column] of [['actor_id','actor_id'],['entity_id','entity_id'],['bond_id','context_bond_id'],['cnes_id','context_cnes_unit_id'],['location_id','context_lotacao_id']] as const) {
    if (payload[input]) {
      if (!uuid.test(String(payload[input]))) throw new Error('AUDIT_FILTER_INVALID');
      query = query.eq(column, payload[input]);
    }
  }
  const {data, error} = await query.order('occurred_at',{ascending:false}).order('id',{ascending:false}).range(page*50,page*50+50);
  if (error) throw error;
  return {events: (data || []).slice(0,50).filter((row: any) => auditInScope(row,context,internal)).map((row: any) => auditDTO(row,context.global)), has_more: (data || []).length>50, page};
}
