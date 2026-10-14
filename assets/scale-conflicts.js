(() => {
  'use strict';
  const labels = { position: 'Mesmo cargo', team: 'Mesma equipe', position_team: 'Mesmo cargo e equipe', function: 'Mesma função', unit: 'Qualquer afastamento simultâneo na unidade' };
  const same = (a, b) => Boolean(a && b && a === b);
  const sameTeam = (a, b) => same(a.team_name, b.team_name) && a.team_name !== 'Não se aplica';
  function matches(a, b, criterion) {
    if (!a || !b || a.id === b.id || !same(a.cnes?.id, b.cnes?.id)
      || (a.internal_lotacao_id || null) !== (b.internal_lotacao_id || null)) return false;
    switch (criterion) {
      case 'unit': return true;
      case 'team': return sameTeam(a, b);
      case 'position_team': return same(a.cargo?.id, b.cargo?.id) && sameTeam(a, b);
      case 'function': return same(a.funcao?.id, b.funcao?.id);
      default: return same(a.cargo?.id, b.cargo?.id);
    }
  }
  function conflictsFor(request, day, requests, criterion, onLeave) {
    if (!onLeave(request, day)) return [];
    const seen = new Set();
    return requests.filter(other => {
      if (!matches(request.servidor, other.servidor, criterion) || !onLeave(other, day) || seen.has(other.row_id)) return false;
      seen.add(other.row_id);
      return true;
    });
  }
  function manualFor(employee, day, conflicts) {
    return conflicts.filter(row => row.status === 'active' && row.start_date <= day && row.end_date >= day
      && row.cnes_unit_id === employee.cnes?.id
      && (row.lotacao_id || null) === (employee.internal_lotacao_id || null)
      && (!row.bond_unit_id || row.bond_unit_id === employee.row_id));
  }
  function overlaps(request, requests, criterion, onLeave) {
    const days = request.assigned_dates || (request.periods || []).flatMap(period => {
      const count = (Date.parse(period.end_date) - Date.parse(period.start_date)) / 86400000 + 1;
      if (!Number.isInteger(count) || count < 1 || count > 3660) throw new Error('Período indisponível para conferir conflitos. Consulte o calendário.');
      return Array.from({length:count},(_,i)=>new Date(Date.parse(period.start_date)+i*86400000).toISOString().slice(0,10));
    });
    return [...new Map(days.flatMap(day=>conflictsFor(request,day,requests,criterion,onLeave)).map(other=>[other.id,other])).values()];
  }
  globalThis.SGFScaleConflicts = Object.freeze({ labels, matches, conflictsFor, manualFor, overlaps });
})();
