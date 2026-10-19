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

test('rota Lançar Férias despacha a tela correta no RH institucional',()=>{
 const start=source.indexOf('function render() {'),end=source.indexOf("  document.addEventListener('click'",start);
 const body=source.slice(start,end);
 for(const institutional of [true]){
  let launches=0,home=0;const role=institutional?'rh':'administrador';
  const context={state:{route:'rh-launch',session:{},profile:{role},activeContext:{institutional}},SGFAccessPolicy:{resolve:r=>r},client:{},sessionAction:{classList:{toggle(){}}},renderHeaderUser(){},renderWorkspaceNav(){},app:{focus(){}},renderRhLaunch(){launches++;},renderHome(){home++;}};
  for(const name of body.matchAll(/:\s*(render\w+)/g))if(!context[name[1]])context[name[1]]=()=>{};
  vm.runInNewContext(body+';render();',context);assert.equal(launches,1);assert.equal(home,0);
 }
});

test('abas ocultas antes de identificar operador e lançamento ausente no administrador',()=>{
 const start=source.indexOf('  function renderWorkspaceNav()'),end=source.indexOf('  function renderHome()',start),body=source.slice(start,end);
 function nav(role,operator){const hidden=[],workspaceNav={innerHTML:'',classList:{toggle:(name,value)=>hidden.push(value)}},state={session:{},profile:{role},route:'rh-workspace',accessContexts:[],activeContext:{institutional:role==='rh'},rhState:operator?{operator:{id:'operator'}}:null};vm.runInNewContext(body+';renderWorkspaceNav();',{workspaceNav,state,esc:String});return {html:workspaceNav.innerHTML,hidden:hidden.at(-1)};}
 assert.equal(nav('rh',false).html,'');assert.equal(nav('rh',false).hidden,true);
 assert.match(nav('rh',true).html,/Lançar Férias/);assert.equal(nav('rh',true).hidden,false);
 assert.doesNotMatch(nav('administrador',false).html,/Lançar Férias|rh-launch/);
});
