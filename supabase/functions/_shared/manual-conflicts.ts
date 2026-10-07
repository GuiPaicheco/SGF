import type { AccessContext } from './access-context.ts';

export function conflictInScope(row: any, context: AccessContext, internalLocation: string | null) {
  return context.global || (row.cnes_unit_id === context.cnesUnitId && (row.lotacao_id || null) === internalLocation);
}

export async function loadManualConflicts(admin: any, context: AccessContext, month: string) {
  let internal: string | null = null;
  if (!context.global) {
    const { data, error } = await admin.from('lotacoes').select('id,is_internal_allocation').eq('id', context.lotacaoId).single();
    if (error || !data) throw error || new Error('INVALID_ACCESS_CONTEXT');
    internal = data.is_internal_allocation ? data.id : null;
  }
  const [year, number] = month.split('-').map(Number);
  const end = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
  const rows: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = admin.from('manual_calendar_conflicts')
      .select('id,cnes_unit_id,lotacao_id,bond_unit_id,start_date,end_date,justification,status,version,created_at,closed_at,closure_reason,cnes:cnes_units(code,name),location:lotacoes(name),unit:employment_bond_units(bond:employment_bonds(registration,employee:servidores(full_name))),author:profiles!manual_calendar_conflicts_created_by_fkey(full_name),closer:profiles!manual_calendar_conflicts_closed_by_fkey(full_name)')
      .lte('start_date', end).gte('end_date', `${month}-01`).order('created_at', {ascending: false}).order('id');
    if (!context.global) {
      query = query.eq('cnes_unit_id', context.cnesUnitId);
      query = internal ? query.eq('lotacao_id', internal) : query.is('lotacao_id', null);
    }
    const { data, error } = await query.range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data || []).filter((row: any) => conflictInScope(row, context, internal)));
    if (!data || data.length < 1000) return { conflicts: rows };
  }
}
