(function (root) {
  'use strict';
  function range(filter) {
    const valid = value => typeof value === 'string' && /^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
    let start, end;
    if (filter.rangeMode === 'range') { start = filter.rangeStart; end = filter.rangeEnd; }
    else {
      if (!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(filter.month || '')) throw new Error('Selecione um mês válido.');
      start = `${filter.month}-01`;
      const [year, month] = filter.month.split('-').map(Number);
      end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0,10);
    }
    if (!valid(start) || !valid(end) || end < start) throw new Error('Informe início e fim válidos, em ordem cronológica.');
    const count = (Date.parse(end)-Date.parse(start))/86400000+1;
    if (count > 93) throw new Error('Escolha um intervalo de até 93 dias para manter o calendário legível.');
    const days = Array.from({length:count},(_,i)=>new Date(Date.parse(start)+i*86400000).toISOString().slice(0,10));
    return {start,end,days,months:[...new Set(days.map(day=>day.slice(0,7)))]};
  }
  function merge(batches, window) {
    const unique = (values,key) => [...new Map(values.map(value=>[key(value),value])).values()];
    const employees = unique(batches.flatMap(batch=>batch.calendar.employees || []),item=>item.row_id);
    const requests = new Map();
    for (const item of batches.flatMap(batch=>batch.calendar.requests || [])) {
      const key = `${item.id}:${item.row_id}`, old = requests.get(key);
      requests.set(key, old ? {...item,periods:unique([...old.periods,...item.periods],p=>`${p.start_date}:${p.end_date}:${p.return_date}`),assigned_dates:item.assigned_dates ? [...new Set([...(old.assigned_dates || []),...item.assigned_dates])].sort() : null} : item);
    }
    return {
      employees,
      requests:[...requests.values()].filter(item=>item.assigned_dates ? item.assigned_dates.some(day=>day>=window.start && day<=window.end) || item.periods.some(p=>p.return_date>=window.start && p.return_date<=window.end) : item.periods.some(p=>p.start_date<=window.end && p.return_date>=window.start)),
      assignments:unique(batches.flatMap(batch=>batch.minimum.assignments || []),item=>`${item.lotacao_id}:${item.scale_date}:${item.bond_unit_id}`),
      planned_days:unique(batches.flatMap(batch=>batch.minimum.planned_days || []),item=>`${item.lotacao_id}:${item.scale_date}`).sort((a,b)=>b.scale_date.localeCompare(a.scale_date)),
      locations:unique(batches.flatMap(batch=>batch.minimum.locations || []),item=>item.id),
      conflicts:unique(batches.flatMap(batch=>batch.manual.conflicts || []),item=>item.id).filter(item=>item.start_date<=window.end && item.end_date>=window.start)
    };
  }
  function activeOn(employee, day) {
    return (!employee.valid_from || employee.valid_from <= day) && (!employee.valid_until || employee.valid_until >= day);
  }
  function daySummary(groups, day, onLeave) {
    const active = groups.filter(group=>activeOn(group.employee,day));
    const absences = active.map(group=>({group,request:group.requests.filter(request=>onLeave(request,day)).sort((a,b)=>Number(b.calendar_confirmed)-Number(a.calendar_confirmed))[0]})).filter(item=>item.request);
    const confirmed = absences.filter(item=>item.request.calendar_confirmed).length;
    return {active,absences,confirmed,withoutConfirmed:active.length-confirmed};
  }
  root.SGFScaleRange = {range,merge,activeOn,daySummary};
})(globalThis);
