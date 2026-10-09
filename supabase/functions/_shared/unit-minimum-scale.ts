import { loadUnitCalendar } from './unit-calendar.ts';
import type { AccessContext } from './access-context.ts';

export function scaleContexts(employees: any[]) {
  return [...new Map(employees.map(employee => {
    const id = `${employee.cnes.id}:${employee.internal_lotacao_id || ''}`;
    return [id, { id, cnes_unit_id: employee.cnes.id, lotacao_id: employee.internal_lotacao_id,
      name: employee.internal_lotacao_id ? `${employee.cnes.name} · ${employee.lotacao.name}` : employee.cnes.name,
      code: employee.cnes.code }];
  })).values()];
}

export function scaleCandidates(employees: any[], contextId: string, date: string) {
  return employees.filter(employee => `${employee.cnes.id}:${employee.internal_lotacao_id || ''}` === contextId
    && (!employee.valid_from || employee.valid_from <= date) && (!employee.valid_until || employee.valid_until >= date));
}

export async function loadUnitMinimumScale(admin: any, context: AccessContext, month: string) {
  const calendar = await loadUnitCalendar(admin, context, month);
  const locations = scaleContexts(calendar.employees);
  const [year, number] = month.split('-').map(Number);
  const end = new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10);
  const allowed = new Set(locations.map(location => location.id));
  const days: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = admin.from('unit_minimum_scale_days').select('id,cnes_unit_id,lotacao_id,scale_date,source_date,version,updated_at')
      .lt('scale_date', end).order('scale_date', { ascending: false }).order('id');
    if (!context.global) query = query.eq('cnes_unit_id', context.cnesUnitId);
    const { data, error } = await query.range(offset, offset + 999);
    if (error) throw error;
    days.push(...(data || []).filter((day: any) => allowed.has(`${day.cnes_unit_id}:${day.lotacao_id || ''}`)));
    if (!data || data.length < 1000) break;
  }
  const assignments: any[] = [];
  for (let chunk = 0; chunk < days.length; chunk += 100) {
    const subset = days.slice(chunk, chunk + 100);
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.from('unit_minimum_scale_assignments').select('day_id,bond_unit_id')
        .in('day_id', subset.map(day => day.id)).order('day_id').order('bond_unit_id').range(offset, offset + 999);
      if (error) throw error;
      assignments.push(...(data || []).map((item: any) => {
        const day = subset.find(day => day.id === item.day_id);
        return { ...item, lotacao_id: `${day.cnes_unit_id}:${day.lotacao_id || ''}`, scale_date: day.scale_date };
      }));
      if (!data || data.length < 1000) break;
    }
  }
  return { locations, assignments, planned_days: days.map(day => ({ ...day, lotacao_id: `${day.cnes_unit_id}:${day.lotacao_id || ''}` })) };
}
