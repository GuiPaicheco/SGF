import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../assets/rh-employee-ui.js',import.meta.url),'utf8');
function harness(){let html='';const nodes=new Map(),app={get innerHTML(){return html;},set innerHTML(v){html=v;nodes.clear();},querySelector(s){if(!html.includes('id="'+s.slice(1)+'"'))return null;if(!nodes.has(s)){const value=html.match(new RegExp('id="'+s.slice(1)+'"[^>]*value="([^"]*)"'))?.[1]||'';nodes.set(s,{value});}return nodes.get(s);}};const root={};runInNewContext(source,{globalThis:root});return {app,api:root.SGFRhEmployee};}
const esc=s=>String(s??'').replaceAll('<','&lt;').replaceAll('"','&quot;'),dto={full_name:'TESTE <script>',position:'ADMINISTRATIVO',birthday:null,version:0},tick=()=>new Promise(r=>setImmediate(r));
test('cadastro pede apenas dia e mês e salva sob a versão atual sem alterar CNES',async()=>{
 const {app,api}=harness(),calls=[];await api.open({app,esc,entryId:'entry',isCurrent:()=>true,onBack(){},request:async p=>{calls.push(p);return p.action==='employee-profile'?dto:{...dto,birthday:'02-29',version:1};}});
 assert.match(app.innerHTML,/DD\/MM/);assert.doesNotMatch(app.innerHTML,/<script>|Ano de nascimento|type="date"/);
 app.querySelector('#rh-birthday').value='29/02';await app.querySelector('#rh-birthday-form').onsubmit({preventDefault(){}});
 assert.equal(calls[1].month,2);assert.equal(calls[1].day,29);assert.equal(calls[1].version,0);assert.equal(calls[1].operatorId,undefined);assert.match(app.innerHTML,/Cadastro salvo/);
});
test('conflito de versão conserva valor digitado e não repete alteração',async()=>{
 const {app,api}=harness();let writes=0;await api.open({app,esc,entryId:'entry',isCurrent:()=>true,onBack(){},request:async p=>{if(p.action==='employee-profile')return dto;writes++;throw Object.assign(Error('Conflito'),{code:'RH_VERSION_CONFLICT'});}});
 app.querySelector('#rh-birthday').value='01/03';await app.querySelector('#rh-birthday-form').onsubmit({preventDefault(){}});assert.equal(writes,1);assert.equal(app.querySelector('#rh-birthday').value,'01/03');assert.match(app.innerHTML,/outra sessão/);
});
test('resposta cadastral atrasada não sobrescreve outra tela',async()=>{
 const {app,api}=harness();let current=true,finish;const pending=api.open({app,esc,entryId:'entry',isCurrent:()=>current,onBack(){},request:()=>new Promise(r=>{finish=r;})});current=false;app.innerHTML='Outra tela';finish(dto);await pending;assert.equal(app.innerHTML,'Outra tela');
});
