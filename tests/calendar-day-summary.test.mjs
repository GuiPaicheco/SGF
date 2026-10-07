import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import '../assets/scale-range.js';
const {activeOn,daySummary}=globalThis.SGFScaleRange;
const day='2026-10-06';
test('vigência considera limites inclusivos e vínculos sem data final',()=>{
  assert.equal(activeOn({valid_from:day,valid_until:day},day),true);
  assert.equal(activeOn({valid_from:'2026-10-07'},day),false);
  assert.equal(activeOn({valid_until:'2026-10-05'},day),false);
  assert.equal(activeOn({},day),true);
});
test('resumo diário exclui atuações futuras e encerradas do denominador',()=>{
  const result=daySummary([{employee:{row_id:'a',valid_from:'2026-10-07'},requests:[]},{employee:{row_id:'b',valid_until:'2026-10-05'},requests:[]},{employee:{row_id:'c'},requests:[]}],day,()=>true);
  assert.equal(result.active.length,1);assert.equal(result.withoutConfirmed,1);
});
test('afastamento confirmado prevalece sobre planejamento na mesma atuação',()=>{
  const result=daySummary([{employee:{row_id:'a'},requests:[{id:'planned',calendar_confirmed:false},{id:'confirmed',calendar_confirmed:true}]}],day,()=>true);
  assert.equal(result.absences[0].request.id,'confirmed');
  assert.equal(result.confirmed,1);assert.equal(result.withoutConfirmed,0);
});
test('mesma pessoa em duas atuações mantém contagem por atuação',()=>{
  const result=daySummary([{employee:{id:'person',row_id:'x'},requests:[{calendar_confirmed:true}]},{employee:{id:'person',row_id:'y'},requests:[]}],day,()=>true);
  assert.equal(result.active.length,2);assert.equal(result.confirmed,1);assert.equal(result.withoutConfirmed,1);
});
test('planejamento não conta como ausência confirmada e dia vazio não produz negativos',()=>{
  assert.equal(daySummary([{employee:{},requests:[{calendar_confirmed:false}]}],day,()=>true).withoutConfirmed,1);
  assert.equal(daySummary([],day,()=>false).withoutConfirmed,0);
});
test('interface protege eventos por vigência e descarta carregamento de contexto anterior',async()=>{
  const app=await readFile(new URL('../assets/app.js',import.meta.url),'utf8');
  assert.match(app,/if \(!SGFScaleRange.activeOn\(group.employee,day\)\)/);
  assert.match(app,/focusBirthdays = daily.active.filter/);
  assert.match(app,/focusMinimum = daily.active.filter/);
  assert.match(app,/isReturn = .*SGFScaleRange.activeOn/);
  assert.match(app,/absent.group.employee.row_id === item.group.employee.row_id/);
  assert.match(app,/if \(!stillCurrent\(\)\) return/);
  assert.match(app,/state.scaleLoadSequence === loadSequence/);
  assert.match(app,/Não indica disponibilidade de trabalho/);
});
