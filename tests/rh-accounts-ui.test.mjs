import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import '../assets/access-policy.js';
const source=readFileSync(new URL('../assets/rh-accounts-ui.js',import.meta.url),'utf8');
function harness(){const nodes=new Map();const app={innerHTML:'',querySelector:selector=>{if(!nodes.has(selector))nodes.set(selector,{});return nodes.get(selector);},querySelectorAll:()=>[]};const root={};runInNewContext(source,{globalThis:root});return {app,api:root.SGFRhAccounts,nodes};}
const esc=value=>String(value??'').replaceAll('<','&lt;').replaceAll('"','&quot;');
test('painel institucional não pertence aos outros perfis',()=>{
 assert.equal(SGFAccessPolicy.allowed('rh-accounts','administrador',true),true);
 for(const role of ['rh','servidor','diretor'])assert.equal(SGFAccessPolicy.allowed('rh-accounts',role,true),false);
 assert.equal(SGFAccessPolicy.allowed('choose-operator','rh',false),false);
});
test('unidade sem autorizados bloqueia continuar e explica configuração',async()=>{
 const {app,api}=harness();let saved;
 await api.workspace({app,esc,isCurrent:()=>true,onState:value=>{saved=value;},request:async()=>({context:{login_name:'UBS TESTE'},operator:null,operators:[]})});
 assert.equal(saved.operator,null);assert.match(app.innerHTML,/disabled>Continuar/);assert.match(app.innerHTML,/Nenhum operador autorizado/);
});
test('lista usa DTO da unidade e colunas funcionais, sem renderizar HTML do cadastro',async()=>{
 const {app,api}=harness();const state={context:{login_name:'UBS TESTE'},operator:{name:'OPERADOR TESTE'}};const calls=[];
 await api.workspace({app,esc,isCurrent:()=>true,onState:()=>{},request:async payload=>{calls.push(payload);return payload.action==='session'?state:{...state,total:1,entries:[{full_name:'<script>teste</script>',cbo:'123456',weekly_hours:40,teams:[]}]};}});
 assert.deepEqual(calls.map(row=>row.action),['session','registry']);assert.equal(calls[1].page,0);
 for(const heading of ['Nome do funcionário','Cargo','CBO','Equipe','Carga horária'])assert.ok(app.innerHTML.includes(heading));
 assert.ok(!app.innerHTML.includes('<script>teste'));assert.match(app.innerHTML,/Pendente de conferência/);
});
