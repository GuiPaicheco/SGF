import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import '../assets/access-policy.js';
const source=readFileSync(new URL('../assets/rh-launch-ui.js',import.meta.url),'utf8');
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function harness(){const nodes=new Map(),opened=[],app={innerHTML:'',querySelector:s=>{if(!nodes.has(s))nodes.set(s,{});return nodes.get(s);},querySelectorAll:()=>[...app.innerHTML.matchAll(/data-launch-entry="([^"]+)"/g)].map(m=>{const id=m[1];if(!nodes.has(id))nodes.set(id,{dataset:{launchEntry:id}});return nodes.get(id);})},root={SGFRhLeave:{open:x=>opened.push(x)}};runInNewContext(source,{globalThis:root,Date});return {app,nodes,opened,mount:root.SGFRhLaunch.mount};}
const employee={entry_id:'entry-1',full_name:'Ana',position:'ADMINISTRATIVO',binding_confirmed:true,cbo:'123',weekly_hours:40};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('lançamento pertence apenas ao RH autenticado',()=>{
 assert.equal(SGFAccessPolicy.allowed('rh-launch','rh',true),true);
 for(const role of ['administrador','servidor','diretor'])assert.equal(SGFAccessPolicy.allowed('rh-launch',role,true),false);
 assert.equal(SGFAccessPolicy.allowed('rh-launch','rh',false),false);
});
test('lista mostra funcionários e abre lançamento por linha, sem seleção de unidade ou ordenação',async()=>{
 const h=harness(),calls=[];
 await h.mount({app:h.app,esc,isCurrent:()=>true,request:async q=>{calls.push(q);return {employees:[employee,{...employee,entry_id:'entry-2',full_name:'Zélia'}],total:2};}});
 assert.equal(calls[0].action,'launch-employees');assert.equal(Object.hasOwn(calls[0],'cnes'),false);assert.equal(Object.hasOwn(calls[0],'month'),false);
 assert.ok(h.app.innerHTML.indexOf('Ana')<h.app.innerHTML.indexOf('Zélia'));assert.match(h.app.innerHTML,/Ordem alfabética/);assert.match(h.app.innerHTML,/Folga e Afastamento/);assert.match(h.app.innerHTML,/Cadastrar dayoff/);assert.doesNotMatch(h.app.innerHTML,/40h/);assert.doesNotMatch(h.app.innerHTML,/<select|Ordenar|rh-launch-unit/);
 h.nodes.get('entry-1').onclick();assert.equal(h.opened[0].entryId,'entry-1');assert.equal(h.opened[0].cnes,null);
});
test('registro indisponível não cria botão nem contorna validação do servidor',async()=>{
 const h=harness();await h.mount({app:h.app,esc,isCurrent:()=>true,request:async()=>({employees:[{...employee,binding_confirmed:false,full_name:'<script>teste'}],total:1})});
 assert.match(h.app.innerHTML,/Cadastro indisponível/);assert.doesNotMatch(h.app.innerHTML,/data-launch-entry|<script>/);assert.equal(h.opened.length,0);
});
test('busca e paginação preservam estado entre abas e busca explícita atualiza dados',async()=>{
 const h=harness(),saved={},calls=[];
 const request=async(q,options)=>{calls.push({q,options});return {employees:[employee],total:51};};
 await h.mount({app:h.app,esc,isCurrent:()=>true,request,viewState:saved});
 h.app.querySelector('#rh-launch-name').value='Ana';h.nodes.get('#rh-launch-search').onsubmit({preventDefault(){}});await tick();assert.equal(calls.at(-1).options.fresh,true);
 h.nodes.get('#rh-launch-next').onclick();await tick();assert.equal(saved.page,1);
 await h.mount({app:h.app,esc,isCurrent:()=>true,request,viewState:saved});assert.equal(calls.at(-1).q.search,'Ana');assert.equal(calls.at(-1).q.page,1);
});
test('resposta atrasada não substitui outra tela',async()=>{
 const h=harness();let current=true,finish;
 const pending=h.mount({app:h.app,esc,isCurrent:()=>current,request:()=>new Promise(resolve=>{finish=resolve;})});
 current=false;h.app.innerHTML='Outra tela';finish({employees:[employee],total:1});await pending;assert.equal(h.app.innerHTML,'Outra tela');
});
