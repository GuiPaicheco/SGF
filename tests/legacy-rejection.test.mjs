import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const read = path => readFile(new URL(`../${path}`,import.meta.url),'utf8');
const app = await read('assets/app.js');
const inputCode = app.slice(app.indexOf('  function readRejectionInput('),app.indexOf('  function updateRejectionFields('));
function readInput(mode, values = {}, valid = true) {
  const nodes = Object.fromEntries(Object.entries(values).map(([key,value]) => [key,{value,reportValidity:() => valid}]));
  const sandbox = {state:{rejectionReasons:[{code:'reason',input_mode:mode}]},document:{querySelector:() => ({value:'reason'}),getElementById:id => nodes[id]}};
  vm.createContext(sandbox); vm.runInContext(`${inputCode}; this.run = readRejectionInput;`,sandbox);
  return sandbox.run;
}

test('ambos os fluxos usam a mesma validação e campos ausentes não causam TypeError', () => {
  assert.match(app,/rejection = readRejectionInput\(notes\)/);
  assert.throws(() => readInput('bank')('Motivo válido'),/Preencha os dados/);
  assert.equal(readInput('other')('Motivo válido').code,'reason');
  assert.throws(() => readInput('other')('ab'),/justificativa/);
});

test('frontend impede banco insuficiente invertido e datas de conflito invertidas', () => {
  assert.throws(() => readInput('bank',{'rejection-available':'10','rejection-required':'5'})('Saldo conferido'),/superar/);
  const result = readInput('bank',{'rejection-available':'5','rejection-required':'10'})('Saldo conferido');
  assert.equal(result.available_hours,5); assert.equal(result.required_hours,10);
  assert.throws(() => readInput('conflict',{'rejection-employee':'Servidor','rejection-start':'2026-10-09','rejection-end':'2026-10-08'})('Conflito confirmado'),/anterior/);
});

test('etapa legada usa Edge Function, identidade autenticada e validação de motivo', async () => {
  const operation = await read('supabase/functions/manage-operations/index.ts');
  assert.match(app,/action:'legacy-approval',request_id:selected.id,stage,decision,version:approval.version/);
  assert.doesNotMatch(app,/client.rpc\('decide_request_approval'/);
  const endpoint = operation.slice(operation.indexOf("action === 'legacy-approval'"),operation.indexOf("action === 'unit-review'"));
  assert.match(endpoint,/\['rh','administrador'\].includes\(actorRole\)/);
  assert.match(endpoint,/validateRejection\(reason,payload.rejection,payload.notes\)/);
  assert.match(endpoint,/actor_id:profile.id/);
});

test('SQL protege escopo legado e impede decidir pedidos novos pela rotina antiga', async () => {
  const sql = await read('supabase/migrations/20261005170000_unit_request_workflow.sql');
  const fn = sql.slice(sql.indexOf('create or replace function public.manage_legacy_request_approval'));
  assert.match(fn,/security invoker set search_path = ''/);
  assert.match(fn,/context_bond_id is not null/);
  assert.match(fn,/public.request_unit_reviews where request_id=target_request_id/);
  assert.match(fn,/location_id is distinct from selected_location/);
  assert.match(fn,/public.profile_scopes where profile_id=actor_id/);
  assert.match(fn,/REVIEW_VERSION_CONFLICT/);
  assert.match(fn,/MANAGER_APPROVAL_REQUIRED/);
  assert.match(fn,/revoke insert,update on public.request_approvals from authenticated/);
  assert.match(fn,/revoke execute on function public.decide_request_approval/);
});

test('SQL preserva motivos históricos, autoria, versão e auditoria na transação', async () => {
  const sql = await read('supabase/migrations/20261005170000_unit_request_workflow.sql');
  const fn = sql.slice(sql.indexOf('create or replace function public.manage_legacy_request_approval'));
  assert.match(fn,/active for share/);
  assert.match(fn,/decided_by=actor_id/);
  assert.match(fn,/rejection_code=rejection.code,rejection_label=rejection.label,rejection_data=rejection_details/);
  assert.match(fn,/actor_id=manage_legacy_request_approval.actor_id/);
  assert.match(fn,/previous_value,new_value,reason/);
  assert.match(fn,/to service_role/);
  assert.match(app,/approvals:request_approvals\(id,stage,decision,notes,rejection_code,rejection_label,version/);
});
