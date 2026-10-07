import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const code=stripTypeScriptTypes(await readFile(new URL('../supabase/functions/_shared/added-day-responsibility.ts',import.meta.url),'utf8'));
const {resolveAddedDay,planAddedDays}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const date='2026-10-09', bond='bond';
const unit=(id,cnes=id)=>({id,cnes_unit_id:cnes,bond_id:bond,active:true,approval_responsible:true,bond_active:true,employee_active:true,cnes_active:true});
const schedule=(id,extra={})=>({date,bond_id:bond,active:true,source:'functional_schedule',bond_unit_id:id,...extra});
test('uma única unidade elegível recebe o dia automaticamente',()=>{
  assert.equal(resolveAddedDay(date,bond,[unit('x')],[]).source,'single_unit');
});
test('múltiplas unidades seguem a escala funcional explícita da data',()=>{
  assert.equal(resolveAddedDay(date,bond,[unit('x'),unit('y')],[schedule('y')]).bond_unit_id,'y');
});
test('sexta alternada sem definição da data fica para o RH',()=>{
  const result=resolveAddedDay(date,bond,[unit('x'),unit('y')],[schedule('x',{date:'2026-10-02'})]);
  assert.equal(result.status,'pending_rh');assert.equal(result.bond_unit_id,null);
});
test('escala mínima e pedidos anteriores não são considerados escala funcional',()=>{
  for(const source of ['minimum_scale','previous_request']) assert.equal(resolveAddedDay(date,bond,[unit('x'),unit('y')],[schedule('x',{source})]).status,'pending_rh');
});
test('escala ambígua, inativa ou de outro vínculo não autoriza escolha automática',()=>{
  for(const rows of [[schedule('x'),schedule('y')],[schedule('x',{active:false})],[schedule('x',{bond_id:'other'})]]) assert.equal(resolveAddedDay(date,bond,[unit('x'),unit('y')],rows).status,'pending_rh');
});
test('vigência, vínculo e estados ativos são obrigatórios',()=>{
  for(const override of [{bond_id:'other'},{active:false},{bond_active:false},{employee_active:false},{cnes_active:false},{approval_responsible:false},{valid_from:'2026-10-10'},{valid_until:'2026-10-08'},{bond_valid_until:'2026-10-08'}]) assert.equal(resolveAddedDay(date,bond,[{...unit('x'),...override}],[]).reason,'NO_ELIGIBLE_ASSIGNMENT');
});
test('lotações diferentes do mesmo CNES não são misturadas e dias são deduplicados',()=>{
  const units=[{...unit('x','shared'),internal_lotacao_id:'dir-x'},{...unit('y','shared'),internal_lotacao_id:'dir-y'}];
  assert.equal(resolveAddedDay(date,bond,units,[]).status,'pending_rh');
  assert.equal(planAddedDays([date,date],bond,units,[]).length,1);
});
test('datas impossíveis não viram pendências silenciosas',()=>{
  assert.throws(()=>resolveAddedDay('2026-02-30',bond,[],[]),/RESPONSIBILITY_DAY_INVALID/);
});
