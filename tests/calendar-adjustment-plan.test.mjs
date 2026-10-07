import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const encode=code=>`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const resolver=encode(stripTypeScriptTypes(await readFile(new URL('../supabase/functions/_shared/added-day-responsibility.ts',import.meta.url),'utf8')));
const source=stripTypeScriptTypes(await readFile(new URL('../supabase/functions/_shared/calendar-adjustment-plan.ts',import.meta.url),'utf8')).replace("'./added-day-responsibility.ts'",JSON.stringify(resolver));
const {planCalendarAdjustment:plan}=await import(encode(source));
const unit={id:'u',bond_id:'b',cnes_unit_id:'c',active:true,approval_responsible:true,bond_active:true,employee_active:true,cnes_active:true};
const base=()=>({bondId:'b',excludedDates:[],periods:[{id:'p',start_date:'2026-10-05',end_date:'2026-10-09',return_date:'2026-10-12',days:5,counting_mode:'uteis'}],responsibilities:[5,6,7,8,9].map(day=>({responsibility_date:`2026-10-0${day}`,bond_unit_id:'u'})),assignments:[unit],schedule:[]});
test('feriado preserva início e direito, estende fim e substitui apenas o dia excluído',()=>{
  const data=base();data.excludedDates=['2026-10-07'];const result=plan(data);
  assert.equal(result.periods[0].start_date,'2026-10-05');assert.equal(result.periods[0].days,5);
  assert.equal(result.periods[0].end_date,'2026-10-12');assert.equal(result.periods[0].return_date,'2026-10-13');
  assert.equal(result.retained.length,4);assert.equal(result.removed[0].responsibility_date,'2026-10-07');assert.equal(result.added[0].date,'2026-10-12');
});
test('feriado no retorno altera somente retorno',()=>{
  const data=base();data.excludedDates=['2026-10-12'];const result=plan(data);
  assert.equal(result.periods[0].end_date,'2026-10-09');assert.equal(result.periods[0].return_date,'2026-10-13');assert.equal(result.added.length,0);assert.equal(result.changed,true);
});
test('remoção do feriado encurta período e preserva atribuições remanescentes',()=>{
  const data=base();data.periods[0].end_date='2026-10-12';data.periods[0].return_date='2026-10-13';data.responsibilities.push({responsibility_date:'2026-10-12',bond_unit_id:'u'});
  const result=plan(data);assert.equal(result.removed[0].responsibility_date,'2026-10-12');assert.equal(result.added.length,0);
});
test('dias corridos não estendem fim por feriado e aniversário útil é excluído',()=>{
  const data=base();data.periods[0].counting_mode='corridos';data.excludedDates=['2026-10-07'];assert.equal(plan(data).periods[0].end_date,'2026-10-09');
  data.periods[0].counting_mode='uteis';data.excludedDates=[];data.birthDate='1990-10-07';assert.equal(plan(data).periods[0].end_date,'2026-10-12');
});
test('extensão com várias unidades não inferidas deixa responsabilidade pendente',()=>{
  const data=base();data.excludedDates=['2026-10-07'];data.assignments.push({...unit,id:'v',cnes_unit_id:'d'});const result=plan(data);
  assert.equal(result.pending.length,1);assert.equal(result.pending[0].bond_unit_id,null);assert.equal(result.retained[0].bond_unit_id,'u');
});
test('sobreposição após extensão bloqueia o plano inteiro',()=>{
  const data=base();data.excludedDates=['2026-10-07'];data.periods.push({...data.periods[0],id:'q',start_date:'2026-10-12',end_date:'2026-10-16',return_date:'2026-10-19'});
  assert.deepEqual(plan(data),{status:'requires_review',reason:'PERIOD_OVERLAP'});
});
test('período legado sem contagem registrada não é reinterpretado',()=>{
  const data=base();data.periods[0].counting_mode=null;assert.equal(plan(data).reason,'LEGACY_COUNTING_UNKNOWN');
});
test('atuação existente vencida exige revisão sem transferência silenciosa',()=>{
  const data=base();data.assignments[0]={...unit,valid_until:'2026-10-06'};
  assert.equal(plan(data).reason,'EXISTING_ASSIGNMENT_INELIGIBLE');
});
test('plano idêntico é noop e entradas inválidas são recusadas',()=>{
  assert.equal(plan(base()).changed,false);
  const data=base();data.excludedDates=['2026-02-30'];assert.throws(()=>plan(data),/CALENDAR_PLAN_INVALID/);
  const duplicated=base();duplicated.responsibilities.push(duplicated.responsibilities[0]);assert.throws(()=>plan(duplicated),/CALENDAR_DISTRIBUTION_INVALID/);
});
