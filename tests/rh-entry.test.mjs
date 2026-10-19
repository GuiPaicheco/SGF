import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../assets/app.js',import.meta.url),'utf8');
function view(name,next,state={}) {
  const app={innerHTML:''}, destinations=[];
  const context={app,state,setProgress(){},go:route=>destinations.push(route),accessHome:role=>role==='administrador'?'rh-calendar':'rh-workspace',applyLoginCooldown(){}};
  vm.runInNewContext(source.slice(source.indexOf(`  function ${name}()`),source.indexOf(next,source.indexOf(`  function ${name}()`)))+`;${name}();`,context);
  return {html:app.innerHTML,destinations};
}
test('entrada pública apresenta somente login e simulação, sem solicitação ou cadastro',()=>{
  const {html}=view('renderHome','  function renderQuick');
  assert.match(html,/data-go="login"/);assert.match(html,/data-go="quick"/);
  assert.doesNotMatch(html,/data-go="access-request"|Nova solicitação|Solicitar acesso/);
});
test('tela inicial autenticada devolve o usuário ao trabalho operacional',()=>{
  assert.deepEqual(view('renderHome','  function renderQuick',{session:{},profile:{role:'administrador'}}).destinations,['rh-calendar']);
  assert.deepEqual(view('renderHome','  function renderQuick',{session:{},profile:{role:'rh'}}).destinations,['rh-workspace']);
});
test('login orienta acesso institucional sem oferecer senha provisória ou autocadastro',()=>{
  const {html}=view('renderLogin','  async function login');
  assert.match(html,/placeholder="Digite seu login"/);assert.doesNotMatch(html,/UBS AMAZONAS ou admin/);assert.match(html,/operador autorizado/);
  assert.doesNotMatch(html,/123456|Solicitar acesso|data-go="access-request"/);
});
