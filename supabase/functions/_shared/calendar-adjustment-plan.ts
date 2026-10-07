// Plano puro, sem gravações: períodos legados e sobreposições exigem revisão explícita.
// O chamador deve carregar dados confiáveis e persistir o plano numa única transação.
import { resolveAddedDay } from './added-day-responsibility.ts';

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0,10) === value;
}
function nextDate(value: string) {
  return new Date(Date.parse(value) + 86400000).toISOString().slice(0,10);
}

export function planCalendarAdjustment(input: {
  bondId: string; birthDate?: string | null; excludedDates: string[];
  periods: {id: string; start_date: string; end_date: string; return_date: string;
    days: number; counting_mode: string | null}[];
  responsibilities: any[]; assignments: any[]; schedule: any[];
}) {
  if (!input.bondId || !input.periods.length || input.periods.length>10
    || input.excludedDates.some(date=>!validDate(date))
    || (input.birthDate && !validDate(input.birthDate))) throw new Error('CALENDAR_PLAN_INVALID');
  if (input.periods.some(period=>period.counting_mode == null))
    return {status:'requires_review',reason:'LEGACY_COUNTING_UNKNOWN'};
  const holidays=new Set(input.excludedDates);
  const working=(date: string)=>{
    const weekday=new Date(date).getUTCDay();
    return weekday!==0 && weekday!==6 && !holidays.has(date)
      && (!input.birthDate || date.slice(5)!==input.birthDate.slice(5));
  };
  const periodIds=new Set<string>();
  const periods=input.periods.map(period=>{
    if (!period.id || periodIds.has(period.id) || !validDate(period.start_date)
      || !validDate(period.end_date) || !validDate(period.return_date)
      || period.end_date<period.start_date || period.return_date<=period.end_date
      || !Number.isInteger(period.days) || period.days<1 || period.days>90
      || !['uteis','corridos'].includes(period.counting_mode || '')) throw new Error('CALENDAR_PLAN_INVALID');
    periodIds.add(period.id);
    let date=period.start_date, consumed=0, scanned=0, end=date;
    while(consumed<period.days) {
      if(++scanned>730) throw new Error('CALENDAR_SCAN_LIMIT');
      if(period.counting_mode==='corridos' || working(date)) {consumed++;end=date;}
      date=nextDate(date);
    }
    while(!working(date)) {
      if(++scanned>730) throw new Error('CALENDAR_SCAN_LIMIT');
      date=nextDate(date);
    }
    return {...period,end_date:end,return_date:date};
  }).sort((a,b)=>a.start_date.localeCompare(b.start_date));
  if(periods.some((period,index)=>index>0 && period.start_date<=periods[index-1].end_date))
    return {status:'requires_review',reason:'PERIOD_OVERLAP'};
  const required=new Set<string>();
  for(const period of periods) {
    for(let date=period.start_date;date<=period.end_date;date=nextDate(date))
      if(working(date)) required.add(date);
  }
  const existing=new Map<string,any>();
  for(const day of input.responsibilities) {
    if(!validDate(day.responsibility_date) || existing.has(day.responsibility_date))
      throw new Error('CALENDAR_DISTRIBUTION_INVALID');
    existing.set(day.responsibility_date,day);
  }
  // Dias remanescentes preservam a atribuição original, nunca a escala inferida.
  const retained=[...required].filter(date=>existing.has(date)).map(date=>existing.get(date));
  if(retained.some(day=>resolveAddedDay(day.responsibility_date,input.bondId,
    input.assignments.filter(unit=>unit.id===day.bond_unit_id),[]).status!=='assigned'))
    return {status:'requires_review',reason:'EXISTING_ASSIGNMENT_INELIGIBLE'};
  const removed=[...existing.values()].filter(day=>!required.has(day.responsibility_date));
  const added=[...required].filter(date=>!existing.has(date)).sort()
    .map(date=>resolveAddedDay(date,input.bondId,input.assignments,input.schedule));
  return {status:'planned',periods,retained,removed,added,
    pending:added.filter(day=>day.status==='pending_rh'),
    changed:removed.length>0 || added.length>0 || periods.some(period=>{
      const previous=input.periods.find(item=>item.id===period.id)!;
      return previous.end_date!==period.end_date || previous.return_date!==period.return_date;
    })};
}
