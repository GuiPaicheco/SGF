import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const esc=v=>String(v??'').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const tick=()=>new Promise(r=>setImmediate(r));
function harness(file){const nodes=new Map(),lists=new Map(),app={innerHTML:'',setAttribute(){},querySelector(s){if(!nodes.has(s))nodes.set(s,{});return nodes.get(s);},querySelectorAll(s){return lists.get(s)||[];}};const root={SGFCnesSource:{sourceView:()=>'<h3>Estabelecimento completo</h3>'}};runInNewContext(read(file),{globalThis:root});return {root,app,nodes,lists};}
test('login lista exatamente 42 estabelecimentos sem expor senhas e mantém admin',()=>{
 const root={};runInNewContext(read('assets/unit-login.js'),{globalThis:root});const api=root.SGFUnitLogin,html=api.options(esc);
 assert.equal(api.units.length,42);assert.equal(new Set(api.units.map(x=>x.cnes)).size,42);assert.equal((html.match(/CNES /g)||[]).length,42);assert.match(html,/value="admin"/);assert.doesNotMatch(html,/123456|0123456789|password/);
});
test('unidades mostram só Acessar CNES na lista e ficha/dados/dayoff dentro, sem PDF',async()=>{
 const h=harness('assets/rh-units-ui.js');await h.root.SGFRhUnits.mount({app:h.app,esc,isCurrent:()=>true,request:async()=>({units:[{cnes:'6305245',login:'UBS TESTE'}]}),cnesRequest:async()=>({}),collect:async()=>({})});
 assert.match(h.app.innerHTML,/Acessar CNES/);assert.doesNotMatch(h.app.innerHTML,/Redefinir senha|>Atualizar CNES<|Ver CNES|unit-pdf/);
 const calls=[];await h.root.SGFRhUnits.mount({app:h.app,esc,isCurrent:()=>true,initialUnit:'6305245',request:async()=>({units:[{cnes:'6305245',login:'UBS TESTE'}]}),collect:async()=>({}),cnesRequest:async p=>{calls.push(p.action);return p.action==='list'?{total:1,entries:[{id:'e',source_data:{fullName:'<script>TESTE',occupation:'Cargo',cns:'1',cbo:'2'},local_data:{}}]}:{dayoffs:[{entry_id:'e',birthday_day:7,birthday_month:6}]};}});
 assert.match(h.app.innerHTML,/Estabelecimento completo/);assert.match(h.app.innerHTML,/07\/06/);assert.match(h.app.innerHTML,/Todos os dados incorporados/);assert.doesNotMatch(h.app.innerHTML,/<script>|unit-pdf|Atualizar por arquivo/);assert.deepEqual(calls.sort(),['list','view-source']);
});
test('feriado específico exige unidade e exclusão envia id e versão, não active=false',async()=>{
 const h=harness('assets/holidays-ui.js'),calls=[],event={id:'event',version:4,event_date:'2028-06-06',name:'Data teste',type:'feriado',scope:'general',unit_ids:[],jurisdiction:'municipal'};
 await h.root.SGFHolidays.mount({app:h.app,esc,isCurrent:()=>true,request:async p=>{calls.push(p);return {events:[event],units:[{id:'u',name:'Unidade teste',code:'6305245'}]};}});
 assert.doesNotMatch(h.app.innerHTML,/Data ativa|Inativar/);assert.match(h.app.innerHTML,/Específico/);
 for(const [key,value] of Object.entries({event_date:'2028-06-06',type:'feriado',name:'Data teste',scope:'units',jurisdiction:'municipal'}))h.app.querySelector('#holiday-'+key).value=value;
 h.app.querySelector('#holiday-form').onsubmit({preventDefault(){}});assert.match(h.app.innerHTML,/Selecione pelo menos uma unidade/);assert.equal(calls.length,1);
 const button={dataset:{holidayDelete:'event'}};h.lists.set('[data-holiday-delete]',[button]);h.app.querySelector('#holiday-new').onclick();button.onclick();await h.app.querySelector('#holiday-confirm-delete').onclick();await tick();
 const deletion=calls.find(x=>x.action==='calendar-delete');assert.equal(deletion.id,'event');assert.equal(deletion.version,4);assert.equal(deletion.active,undefined);
});
