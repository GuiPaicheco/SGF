import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const read = path => readFile(new URL(`../${path}`,import.meta.url),'utf8');
const app=await read('assets/app.js');
const code=app.slice(app.indexOf('  function renderDistributionEditor('),app.indexOf('  function renderRejectionControls('));
function sandbox(editor,date='2026-10-07') {
  const select={};
  const context={state:{distributionEditor:editor},esc:value=>String(value).replaceAll('<','&lt;').replaceAll('"','&quot;'),formatDate:value=>value,document:{getElementById:id=>id==='distribution-day'?{value:date}:select}};
  vm.createContext(context); vm.runInContext(`${code};this.render=renderDistributionEditor;this.sync=syncDistributionCandidates;`,context);
  return {context,select};
}
const editor={request_id:'request',version:2,editable:true,days:[{date:'2026-10-07',current_assignment:'current',current_unit:'UBS <X>',candidates:[{id:'current',unit:'Atual'},{id:'new',unit:'UBS <Y>'}]}]};
test('interface escapa nomes e só mostra editor para distribuição pendente',()=>{
  assert.match(sandbox(editor).context.render(),/UBS &lt;X>/);
  assert.match(sandbox({...editor,editable:false}).context.render(),/Redistribuição bloqueada/);
  assert.equal(sandbox(null).context.render(),'');
});
test('seleção remove atuação atual e informa dia sem alternativa',()=>{
  const {context,select}=sandbox(editor);context.sync();
  assert.equal(select.disabled,false);
  assert.match(select.innerHTML,/value="new"/);
  assert.doesNotMatch(select.innerHTML,/value="current"/);
  assert.match(select.innerHTML,/UBS &lt;Y>/);
  const absent=sandbox(editor,'2026-10-08');absent.context.sync();assert.equal(absent.select.disabled,true);
});
test('consulta projeta versão, candidatos vigentes e preserva unidades participantes',async()=>{
  const sql=await read('supabase/migrations/20261005170000_unit_request_workflow.sql');
  const fn=sql.slice(sql.indexOf('create function public.pending_distribution_editor'));
  for(const pattern of [/is distinct from 'administrador'/,/'version',r.distribution_version/,/status<>'pendente'/,/u.bond_id=r.context_bond_id/,/u.approval_responsible/,/responsibility_date<=u.valid_until/,/other.responsibility_date<>d.responsibility_date/,/from public,anon,authenticated/]) assert.match(fn,pattern);
  assert.doesNotMatch(fn,/'cpf'|'email'|'birth_date'/);
});
test('salvamento usa versão consultada, valida candidato e recarrega pedido sem expor editor ao RH',()=>{
  assert.match(app,/staff === 'administrador' \? operationRequest\(\{action:'pending-distribution-editor'/);
  assert.match(code,/editor.request_id !== request\?\.id/);
  assert.match(code,/day\?\.candidates.some/);
  assert.match(code,/version:editor.version/);
  assert.match(code,/await loadRequests\(\)/);
  assert.match(code,/state.selected === request && state.route === 'detail'/);
});
