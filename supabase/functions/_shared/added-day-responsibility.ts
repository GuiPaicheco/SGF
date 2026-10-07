// Planejamento puro: o chamador deve carregar atuações/escala pelo vínculo no servidor.
// Escala mínima e distribuição de pedidos anteriores NÃO definem a jornada habitual.
export function resolveAddedDay(date: string, bondId: string, assignments: any[], schedule: any[]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))
    || new Date(date).toISOString().slice(0,10)!==date || !bondId) throw new Error('RESPONSIBILITY_DAY_INVALID');
  const eligible = assignments.filter(unit => unit.bond_id===bondId && unit.active && unit.approval_responsible
    && unit.bond_active && unit.employee_active && unit.cnes_active && unit.id && unit.cnes_unit_id
    && (!unit.valid_from || unit.valid_from<=date) && (!unit.valid_until || unit.valid_until>=date)
    && (!unit.bond_valid_from || unit.bond_valid_from<=date) && (!unit.bond_valid_until || unit.bond_valid_until>=date));
  const scopes = new Map<string,any[]>();
  for (const unit of eligible) {
    const key = `${unit.cnes_unit_id}:${unit.internal_lotacao_id || ''}`;
    scopes.set(key,[...(scopes.get(key) || []),unit]);
  }
  const result = (unit: any, source: string) => ({date,status:'assigned',source,bond_unit_id:unit.id,
    cnes_unit_id:unit.cnes_unit_id,lotacao_id:unit.internal_lotacao_id || null});
  if (scopes.size===1 && eligible.length===1) return result(eligible[0],'single_unit');
  // Apenas escala funcional explícita para a data; não extrapolar sextas alternadas.
  const scheduled = [...new Set(schedule.filter(entry=>entry.date===date && entry.bond_id===bondId && entry.active
    && entry.source==='functional_schedule').map(entry=>entry.bond_unit_id))];
  if (scheduled.length===1) {
    const unit = eligible.find(item=>item.id===scheduled[0]);
    if (unit) return result(unit,'functional_schedule');
  }
  return {date,status:'pending_rh',source:null,bond_unit_id:null,cnes_unit_id:null,lotacao_id:null,
    reason:eligible.length ? 'RESPONSIBILITY_AMBIGUOUS' : 'NO_ELIGIBLE_ASSIGNMENT'};
}

export function planAddedDays(dates: string[], bondId: string, assignments: any[], schedule: any[]) {
  return [...new Set(dates)].sort().map(date=>resolveAddedDay(date,bondId,assignments,schedule));
}
