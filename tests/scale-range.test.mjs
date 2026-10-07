import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/scale-range.js';
const {range,merge}=globalThis.SGFScaleRange;
test('visão mensal preserva mês completo e ano bissexto',()=>{
  assert.equal(range({month:'2028-02'}).days.length,29);
  assert.equal(range({month:'2026-02'}).end,'2026-02-28');
});
test('intervalo atravessa mês e ano sem perder extremos',()=>{
  const result=range({rangeMode:'range',rangeStart:'2026-12-30',rangeEnd:'2027-01-02'});
  assert.deepEqual(result.months,['2026-12','2027-01']);
  assert.deepEqual(result.days,['2026-12-30','2026-12-31','2027-01-01','2027-01-02']);
});
test('intervalo rejeita datas impossíveis, ordem invertida e mais de 93 dias',()=>{
  for(const [start,end] of [['2026-02-30','2026-03-01'],['2026-10-02','2026-10-01'],['2026-01-01','2026-04-04'],['','2026-10-01']]) assert.throws(()=>range({rangeMode:'range',rangeStart:start,rangeEnd:end}));
  assert.equal(range({rangeMode:'range',rangeStart:'2026-01-01',rangeEnd:'2026-04-03'}).days.length,93);
});
test('um único dia e travessia de horário de verão usam dias UTC',()=>{
  assert.equal(range({rangeMode:'range',rangeStart:'2026-10-06',rangeEnd:'2026-10-06'}).days.length,1);
  assert.equal(range({rangeMode:'range',rangeStart:'2026-03-07',rangeEnd:'2026-03-09'}).days.length,3);
});
const period={start_date:'2026-10-30',end_date:'2026-11-04',return_date:'2026-11-05'};
const batch=(row,dates)=>({calendar:{employees:[{row_id:row,id:'person'}],requests:[{id:'request',row_id:row,periods:[period],assigned_dates:dates}]},minimum:{assignments:[{lotacao_id:'unit',scale_date:'2026-10-30',bond_unit_id:row}],planned_days:[{lotacao_id:'unit',scale_date:'2026-10-30'}],locations:[{id:'unit'}]},manual:{conflicts:[{id:'conflict',start_date:'2026-10-30',end_date:'2026-11-02'}]}});
const window=range({rangeMode:'range',rangeStart:'2026-10-30',rangeEnd:'2026-11-04'});
test('meses reunidos não duplicam solicitações e preservam dias e períodos',()=>{
  const result=merge([batch('row',['2026-10-30']),batch('row',['2026-11-02'])],window);
  assert.equal(result.requests.length,1);assert.equal(result.employees.length,1);
  assert.deepEqual(result.requests[0].assigned_dates,['2026-10-30','2026-11-02']);
  assert.equal(result.requests[0].periods.length,1);
  assert.equal(result.assignments.length,1);assert.equal(result.conflicts.length,1);
});
test('atuações da mesma pessoa em unidades diferentes não são colapsadas',()=>{
  const result=merge([batch('unit-x',['2026-10-30']),batch('unit-y',['2026-11-02'])],window);
  assert.equal(result.employees.length,2);assert.equal(result.requests.length,2);
});
test('solicitação fora do intervalo não entra no resumo; retorno no intervalo é preservado',()=>{
  const result=merge([batch('row',['2026-10-30'])],range({rangeMode:'range',rangeStart:'2026-11-03',rangeEnd:'2026-11-04'}));
  assert.equal(result.requests.length,0);
  assert.equal(merge([batch('row',['2026-10-30'])],range({rangeMode:'range',rangeStart:'2026-11-05',rangeEnd:'2026-11-05'})).requests.length,1);
});
