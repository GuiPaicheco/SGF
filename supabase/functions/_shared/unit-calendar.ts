import type { AccessContext } from './access-context.ts';

const one = (value: any) => Array.isArray(value) ? value[0] : value;
const intersects = (value: any, start: string, end: string) =>
  (!value.valid_from || value.valid_from <= end) && (!value.valid_until || value.valid_until >= start);

// DTO sem CPF, e-mail, saldos ou dados de outras unidades. Cada linha é uma atuação.
export function projectUnitCalendar(units: any[], requests: any[], mappings: any[], context: AccessContext, start: string, end: string) {
  const employees = units.filter(unit => {
    const bond = one(unit.bond), employee = one(bond?.employee);
    if (!unit.active || !bond?.active || !employee?.active || !one(unit.cnes)?.active) return false;
    if (!intersects(unit, start, end) || !intersects(bond, start, end)) return false;
    if (context.global) return true;
    if (unit.cnes_unit_id !== context.cnesUnitId) return false;
    const scope = mappings.find(item => item.lotacao_id === context.lotacaoId && item.cnes_unit_id === unit.cnes_unit_id);
    if (!scope) return false;
    return one(scope.location)?.is_internal_allocation
      ? unit.internal_lotacao_id === context.lotacaoId
      : unit.internal_lotacao_id == null;
  }).map(unit => {
    const bond = one(unit.bond), employee = one(bond.employee), teamLink = one(unit.team_link);
    const location = one(unit.location) || one(mappings.find(item => item.cnes_unit_id === unit.cnes_unit_id && !one(item.location)?.is_internal_allocation)?.location);
    return {
      row_id: unit.id, bond_id: bond.id, internal_lotacao_id: unit.internal_lotacao_id || null,
      id: employee.id, full_name: employee.full_name, birth_date: employee.birth_date,
      matricula: bond.registration, cargo: one(bond.position), funcao: one(bond.function),
      team_name: one(teamLink?.team)?.name || teamLink?.legacy_team_name || 'Não se aplica',
      cnes: one(unit.cnes), lotacao: location || { id: null, name: one(unit.cnes)?.name },
      valid_from: [unit.valid_from, bond.valid_from].filter(Boolean).sort().at(-1) || null,
      valid_until: [unit.valid_until, bond.valid_until].filter(Boolean).sort()[0] || null,
    };
  });
  const legacyWarnings = requests.filter(request => !request.context_bond_id && !request.responsibilities?.length
    && !['rascunho', 'cancelada', 'rejeitada'].includes(request.status)
    && request.periods?.some((period: any) => period.start_date <= end && period.return_date >= start)
    && employees.filter(employee => request.servidor_id === employee.id && request.legacy_lotacao_id === employee.lotacao.id).length > 1
  ).map(request => ({ request_id: request.id, protocol: request.protocol, reason: 'legacy_assignment_ambiguous' }));
  const ambiguousLegacyIds = new Set(legacyWarnings.map(item => item.request_id));
  const calendarRequests = employees.flatMap(employee => requests.flatMap(request => {
    if (ambiguousLegacyIds.has(request.id)) return [];
    if (request.servidor_id !== employee.id || ['rascunho', 'cancelada', 'rejeitada'].includes(request.status)) return [];
    const responsibilities = (request.responsibilities || []).filter((item: any) => item.bond_unit_id === employee.row_id);
    const modern = Boolean(request.context_bond_id || request.responsibilities?.length);
    const review = (request.unit_reviews || []).find((item: any) => item.cnes_unit_id === employee.cnes.id
      && (item.lotacao_id || null) === employee.internal_lotacao_id);
    if (modern && !responsibilities.length) return [];
    if (!modern && (request.legacy_lotacao_id !== employee.lotacao.id || request.status === 'rejeitada')) return [];
    const status = modern ? review?.status || 'pendente' : request.status;
    if (status === 'rejeitada') return [];
    const periods = (request.periods || []).filter((period: any) => !modern || responsibilities.some((item: any) =>
      item.responsibility_date >= period.start_date && item.responsibility_date <= period.end_date))
      .sort((a: any, b: any) => a.start_date.localeCompare(b.start_date));
    if (!periods.some((period: any) => period.start_date <= end && period.return_date >= start)) return [];
    return [{
      id: request.id, row_id: employee.row_id, servidor: employee, protocol: request.protocol,
      type: request.type, status: status === 'pendente' ? 'em_analise' : status,
      global_status: request.status, calendar_confirmed: modern ? status === 'programada' : ['programada', 'reprogramada', 'concluida'].includes(status),
      assigned_dates: modern ? responsibilities.map((item: any) => item.responsibility_date).sort() : null,
      periods, start_date: periods[0]?.start_date, end_date: periods.at(-1)?.end_date, return_date: periods.at(-1)?.return_date,
      legacy: !modern,
    }];
  }));
  return { employees, requests: calendarRequests, legacy_warnings: legacyWarnings };
}

export async function loadUnitCalendar(admin: any, context: AccessContext, month: string) {
  const [year, number] = month.split('-').map(Number);
  const start = `${month}-01`, end = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
  // Paginação explícita: o limite padrão da API não pode esconder servidores.
  const all = async (build: () => any) => {
    const rows: any[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await build().range(offset, offset + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) return rows;
    }
  };
  const [units, mappings] = await Promise.all([
    all(() => {
      let query = admin.from('employment_bond_units').select('id,bond_id,cnes_unit_id,internal_lotacao_id,active,valid_from,valid_until,cnes:cnes_units(id,code,name,active),location:lotacoes(id,name,is_internal_allocation),team_link:employment_bond_teams(legacy_team_name,team:teams(name)),bond:employment_bonds!inner(id,registration,active,valid_from,valid_until,position:cargos(id,name),function:funcoes(id,name),employee:servidores!inner(id,full_name,birth_date,active))').eq('active', true).eq('bond.active', true).order('id');
      if (!context.global) query = query.eq('cnes_unit_id', context.cnesUnitId);
      return query;
    }),
    all(() => {
      let query = admin.from('lotacao_cnes_units').select('lotacao_id,cnes_unit_id,location:lotacoes(id,name,is_internal_allocation)').order('lotacao_id').order('cnes_unit_id');
      if (!context.global) query = query.eq('lotacao_id', context.lotacaoId).eq('cnes_unit_id', context.cnesUnitId);
      return query;
    }),
  ]);
  const allowed = projectUnitCalendar(units, [], mappings, context, start, end).employees;
  const employeeIds = [...new Set(allowed.map(item => item.id))];
  const requests: any[] = [];
  for (let offset = 0; offset < employeeIds.length; offset += 100) {
    requests.push(...await all(() => admin.from('vacation_requests').select('id,protocol,servidor_id,context_bond_id,type,status,start_date,return_date,employee:servidores(lotacao_id),periods:request_periods(start_date,end_date,return_date),responsibilities:request_day_responsibilities(bond_unit_id,responsibility_date),unit_reviews:request_unit_reviews(cnes_unit_id,lotacao_id,status)').in('servidor_id', employeeIds.slice(offset, offset + 100)).lte('start_date', end).gte('return_date', start).order('id')));
  }
  return projectUnitCalendar(units, requests.map(request => ({ ...request, legacy_lotacao_id: one(request.employee)?.lotacao_id })), mappings, context, start, end);
}
