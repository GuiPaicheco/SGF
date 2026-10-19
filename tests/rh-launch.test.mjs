import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import '../assets/access-policy.js';
const source=readFileSync(new URL('../assets/rh-launch-ui.js',import.meta.url),'utf8');
function harness(){const nodes=new Map(),opened=[],app={innerHTML:'',querySelector:s=>{if(!nodes.has(s))nodes.set(s,{});return nodes.get(s);}},root={SGFRhLeave:{open:x=>opened.push(x)}};runInNewContext(source,{globalThis:root,Date});return {app,nodes,opened,mount:root.SGFRhLaunch.mount};}
const employee={entry_id:'entry-1',full_name:'Ana',binding_confirmed:true,cbo:'123'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('aba de lançamento restrita a RH e administrador autenticados',()=>{
 for(const role of ['rh','administrador'])assert.equal(SGFAccessPolicy.allowed('rh-launch',role,true),true);
 for(const role of ['servidor','diretor'])assert.equal(SGFAccessPolicy.allowed('rh-launch',role,true),false);
 assert.equal(SGFAccessPolicy.allowed('rh-launch','administrador',false),false);
});
test('admin escolhe unidade antes de buscar, sem selecionar Amazonas automaticamente',async()=>{
 const h=harness(),calls=[];
 await h.mount({app:h.app,esc:String,isCurrent:()=>true,admin:true,request:async q=>{calls.push(q);return q.action==='directory'?{units:[{cnes:'2126486',login:'DAPS'},{cnes:'2',login:'UBS Z'},{cnes:'1',login:'UBS A'}]}:{employees:[employee],total:1};}});
 assert.equal(calls.length,1);assert.match(h.app.innerHTML,/Selecione uma unidade/);
 assert.ok(h.app.innerHTML.indexOf('UBS A')<h.app.innerHTML.indexOf('UBS Z'));
 assert.ok(h.app.innerHTML.indexOf('UBS Z')<h.app.innerHTML.indexOf('SECRETARIA'));
 h.app.querySelector('#rh-launch-unit').value='1';h.app.querySelector('#rh-launch-name').value='Ana';
 h.nodes.get('#rh-launch-search').onsubmit({preventDefault(){}});await tick();
 assert.equal(calls[1].cnes,'1');assert.equal(calls[1].search,'Ana');
 h.app.querySelector('#rh-launch-employee').value='entry-1';h.nodes.get('#rh-launch-form').onsubmit({preventDefault(){}});
 assert.equal(h.opened[0].entryId,'entry-1');assert.equal(h.opened[0].cnes,'1');
});
test('RH mantém escopo do servidor e não permite vínculo sem conferência',async()=>{
 const h=harness(),calls=[];
 await h.mount({app:h.app,esc:String,isCurrent:()=>true,request:async q=>{calls.push(q);return {employees:[{...employee,binding_confirmed:false}],total:51};}});
 assert.equal(Object.hasOwn(calls[0],'cnes'),false);assert.match(h.app.innerHTML,/Aguardando conferência CNES/);assert.match(h.app.innerHTML,/administrador precisa conferir e aplicar a importação CNES/);
 h.app.querySelector('#rh-launch-employee').value='entry-1';h.nodes.get('#rh-launch-form').onsubmit({preventDefault(){}});assert.equal(h.opened.length,0);
 h.nodes.get('#rh-launch-next').onclick();await tick();assert.equal(calls[1].page,1);
});
test('consulta concluída após navegação não substitui a outra tela',async()=>{
 const h=harness();let current=true,finish;
 const pending=h.mount({app:h.app,esc:String,isCurrent:()=>current,request:()=>new Promise(resolve=>{finish=resolve;})});
 current=false;h.app.innerHTML='Outra tela';finish({employees:[employee],total:1});await pending;assert.equal(h.app.innerHTML,'Outra tela');
});


test('trocar unidade carrega funcionários e retornar à aba preserva unidade e seleção',async()=>{
 const h=harness(),saved={},calls=[];
 const request=async q=>{calls.push(q);return q.action==='directory'?{units:[{cnes:'1',login:'UBS A'}]}:{employees:[employee],total:1};};
 await h.mount({app:h.app,esc:String,isCurrent:()=>true,admin:true,request,viewState:saved});
 h.app.querySelector('#rh-launch-name').value='Ana';h.app.querySelector('#rh-launch-unit').onchange({target:{value:'1'}});await tick();
 h.app.querySelector('#rh-launch-employee').onchange({target:{value:employee.entry_id}});
 assert.equal(saved.unit,'1');assert.equal(saved.search,'Ana');assert.equal(saved.selected,employee.entry_id);
 await h.mount({app:h.app,esc:String,isCurrent:()=>true,admin:true,request,viewState:saved});
 assert.equal(calls.at(-1).cnes,'1');assert.equal(calls.at(-1).search,'Ana');assert.match(h.app.innerHTML,/value="entry-1" selected/);
});
