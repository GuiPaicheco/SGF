import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const read = path => readFile(new URL(`../${path}`,import.meta.url),'utf8');
const app = await read('assets/app.js');
const sql = await read('supabase/migrations/20261005170000_unit_request_workflow.sql');
const inputCode = app.slice(app.indexOf('  function readRejectionInput('),app.indexOf('  function updateRejectionFields('));
function input(id) {
  const values = {'rejection-employee':id,'rejection-start':'2026-10-07','rejection-end':'2026-10-09'};
  const sandbox = {state:{rejectionUsesAssignment:true,rejectionReasons:[{code:'conflict',input_mode:'conflict'}],conflictEmployees:[{id:'assignment',full_name:'Nome cadastrado'}]},document:{querySelector:()=>({value:'conflict'}),getElementById:key=>({value:values[key],reportValidity:()=>true})}};
  vm.createContext(sandbox); vm.runInContext(`${inputCode}; this.run=readRejectionInput`,sandbox);
  return sandbox.run('Cobertura insuficiente');
}
test('formulário envia identidade da atuação e nome cadastrado, não nome livre',()=>{
  const result=input('assignment');
  assert.equal(result.bond_unit_id,'assignment');
  assert.equal(result.employee_name,'Nome cadastrado');
  assert.throws(()=>input('forged'),/atuação válida/);
});
test('consulta limita candidatos ao escopo da revisão e não projeta dados pessoais sensíveis',()=>{
  const fn=sql.slice(sql.indexOf('create function public.list_rejection_conflict_candidates'),sql.indexOf('create function private.resolve_rejection_conflict_member'));
  assert.match(fn,/p.profile_id=actor_id/);
  assert.match(fn,/v.request_id=target_request_id/);
  assert.match(fn,/v.cnes_unit_id=selected_cnes/);
  assert.match(fn,/v.lotacao_id is not distinct from internal_location/);
  assert.match(fn,/r.servidor_id<>s.id/);
  assert.doesNotMatch(fn,/'cpf'|'email'|'birth_date'/);
  assert.match(fn,/to service_role/);
});
test('SQL confere unidade, vigência completa e nome canônico sob bloqueio',()=>{
  const fn=sql.slice(sql.indexOf('create function private.resolve_rejection_conflict_member'));
  for(const pattern of [/u.id=target_assignment/,/u.cnes_unit_id=v.cnes_unit_id/,/u.internal_lotacao_id is not distinct from v.lotacao_id/,/u.valid_from<=start_day/,/b.valid_until>=end_day/,/for share of u,b,s,c/,/'employee_name',canonical_name/]) assert.match(fn,pattern);
  assert.match(sql,/private.resolve_rejection_conflict_member\(target_review_id/);
});
test('endpoint e interface exigem seleção no fluxo por CNES',async()=>{
  const endpoint=await read('supabase/functions/manage-operations/index.ts');
  assert.match(endpoint,/action === 'conflict-employees'/);
  assert.match(endpoint,/list_rejection_conflict_candidates/);
  assert.match(endpoint,/!rejection.bond_unit_id/);
  assert.match(app,/unitReviews.length \? operationRequest\(\{action:'conflict-employees'/);
  assert.match(app,/esc\(\[employee.full_name,employee.registration,employee.position,employee.cnes_name,employee.location_name\]/);
});
