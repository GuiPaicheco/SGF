import type { AccessContext } from './access-context.ts';

export function applyNotificationContext(query: any, profileId: string, context: AccessContext, internalLocation: string | null) {
  query = query.eq('recipient_id', profileId).eq('recipient_role', context.role);
  if (context.global) return query;
  if (!context.cnesUnitId) throw new Error('INVALID_ACCESS_CONTEXT');
  if (context.role === 'servidor') {
    if (!context.bondId) throw new Error('INVALID_ACCESS_CONTEXT');
    const location = internalLocation ? `context_lotacao_id.eq.${internalLocation}` : 'context_lotacao_id.is.null';
    // O canal legado da própria pessoa não possui escopo inferido.
    return query.or(`and(context_cnes_unit_id.eq.${context.cnesUnitId},context_bond_id.eq.${context.bondId},${location}),and(context_cnes_unit_id.is.null,context_bond_id.is.null,context_lotacao_id.is.null)`);
  }
  query = query.eq('context_cnes_unit_id', context.cnesUnitId);
  query = internalLocation ? query.eq('context_lotacao_id', internalLocation) : query.is('context_lotacao_id', null);
  return query;
}

export async function notificationInternalLocation(admin: any, context: AccessContext) {
  if (context.global) return null;
  if (context.role === 'servidor') return context.lotacaoId;
  if (!context.lotacaoId) throw new Error('INVALID_ACCESS_CONTEXT');
  const { data, error } = await admin.from('lotacoes').select('id,is_internal_allocation').eq('id', context.lotacaoId).single();
  if (error || !data) throw error || new Error('INVALID_ACCESS_CONTEXT');
  return data.is_internal_allocation ? data.id : null;
}
