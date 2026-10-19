import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../assets/rh-leave-ui.js',import.meta.url),'utf8');
const id='f7000000-0000-0000-0000-000000000001';
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 let html='',nodes=new Map();const app={querySelector:selector=>nodes.get(selector)||null,
  querySelectorAll:()=>[...nodes.values()].filter(node=>node.tag!=='form')};
 Object.defineProperty(app,'innerHTML',{get:()=>html,set:value=>{html=value;nodes=new Map();
  for(const match of html.matchAll(/<(input|select|textarea|button|form)\b([^>]*)>/g)){
   const attributes={};for(const a of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))attributes[a[1]]=a[2]??true;
   const body=html.slice(match.index+match[0].length,html.indexOf('</'+match[1]+'>',match.index));
   const node={...attributes,tag:match[1],name:attributes.name,value:attributes.value??'',type:attributes.type,
    checked:attributes.checked===true,disabled:attributes.disabled===true,listeners:{},addEventListener(name,handler){this.listeners[name]=handler;},
    querySelectorAll:()=>[...nodes.values()].filter(child=>child.name&&body.includes('name="'+child.name+'"'))};
   if(match[1]==='textarea')node.value=body;
   if(match[1]==='select'){const options=[...body.matchAll(/<option([^>]*)>/g)];const option=options.find(item=>/\bselected\b/.test(item[1]))||options[0];node.value=option?.[1].match(/value="([^"]*)"/)?.[1]??'';}
   nodes.set(attributes.id?'#'+attributes.id:'@'+match.index,node);
  }
 }});
 const root={};runInNewContext(source,{globalThis:root,crypto:{randomUUID:()=>id},Date});
 return {app,root,api:root.SGFRhLeave,set:(name,value)=>{const node=app.querySelector(name);assert.ok(node,name);if(typeof value==='boolean')node.checked=value;else node.value=value;},
  submit:async selector=>{const form=app.querySelector(selector);assert.ok(form,selector);form.onsubmit({preventDefault(){}});await settle();},
  change:selector=>app.querySelector(selector).listeners.change()};
}
const resources={full_name:'PESSOA <script>FICTÍCIA',position:'CARGO',unit:'UNIDADE',cbo:'123456',weekly_hours:40,admission_date:'2020-01-01'};
const plan={type:'regulamentar',days:25,vacation_days:25,counting_mode:'uteis',periods:[{sequence:1,start_date:'2027-03-01',end_date:'2027-04-02',return_date:'2027-04-05',days:25,counting_mode:'uteis'}],bank:{required_minutes:0},legal:{basis:'Lei 7.989/2025',reference:'Processo sintético',warnings:['Conferência do RH']}};
const preview={digest:'a'.repeat(64),plan,actor:{operator:{name:'OPERADOR FICTÍCIO'}}};
async function form(ui,request,editing){await ui.api.open({app:ui.app,esc,request,isCurrent:()=>true,entryId:id,onBack:()=>{},editing});
 for(const [key,value] of Object.entries({regime:'efetivo',acquisitionStart:'2025-01-01',acquisitionEnd:'2025-12-31',startDate:'2027-03-01',absenceCount:'0',regularLicenseLoss:'no',protocolDate:'2026-10-01',recognitionReference:'Processo sintético'}))if(ui.app.querySelector('#rh-leave-'+key))ui.set('#rh-leave-'+key,value);
 for(const node of ui.app.querySelector('#rh-leave-form').querySelectorAll('[name]'))if(node.type==='checkbox')node.checked=true;
}
test('formulário não oferece banco, horas extras, matrícula ou nascimento obrigatório',async()=>{
 const ui=harness();await form(ui,async()=>resources);assert.doesNotMatch(ui.app.innerHTML,/value="banco_horas"|availableHours|extraHours|Matrícula|name="birthDate"/);assert.match(ui.app.innerHTML,/CNES não comprova/);assert.ok(ui.app.querySelector('#rh-leave-acquisitionStart'));
});
test('prévia normativa mostra base e confirmação antes da gravação',async()=>{
 const ui=harness(),calls=[];const request=async p=>{calls.push(p);return p.action==='leave-resources'?resources:preview;};await form(ui,request);await ui.submit('#rh-leave-form');assert.match(ui.app.innerHTML,/Lei 7.989\/2025/);assert.match(ui.app.innerHTML,/Processo sintético/);assert.ok(ui.app.querySelector('#rh-leave-confirm'));assert.equal(calls[1].item.regime,'efetivo');assert.equal(calls[1].item.availableHours,undefined);assert.equal(calls.filter(x=>x.action==='create-leave').length,0);
});
test('reenvio após falha de conexão mantém chave e payload, bloqueando edição incerta',async()=>{
 const ui=harness(),creates=[];const request=async p=>{if(p.action==='leave-resources')return resources;if(p.action==='preview-leave')return preview;if(p.action==='create-leave'){creates.push(p);if(creates.length===1)throw Error('Falha de conexão');return{id};}if(p.action==='leave-detail')return{id,status:'programada',snapshot:resources,plan,operator_name:'TESTE',created_at:'2026-10-18T12:00:00Z'};};
 await form(ui,request);await ui.submit('#rh-leave-form');await ui.submit('#rh-leave-confirm');assert.equal(ui.app.querySelector('#rh-leave-edit').disabled,true);await ui.submit('#rh-leave-confirm');assert.deepEqual(creates[0],creates[1]);assert.match(ui.app.innerHTML,/Registro de afastamento/);assert.doesNotMatch(ui.app.innerHTML,/<script>FICTÍCIA/);
});
test('trocar modalidade revela quinquênio, parcelas 30/60 e conferência de impedimentos',async()=>{
 const ui=harness();await form(ui,async()=>resources);ui.set('#rh-leave-type','premio');ui.change('#rh-leave-type');assert.equal(ui.app.querySelector('#rh-leave-split').value,'30-60');assert.ok(ui.app.querySelector('#rh-leave-prizeCycle'));assert.ok(ui.app.querySelector('#rh-leave-healthLeaveDays'));assert.doesNotMatch(ui.app.innerHTML,/90 dias corridos/);
});
test('CLT permite três períodos explícitos e requer confirmação da escala atendida',async()=>{
 const ui=harness();await form(ui,async()=>resources);ui.set('#rh-leave-regime','celetista');ui.change('#rh-leave-regime');ui.set('#rh-leave-partsCount','3');ui.change('#rh-leave-partsCount');assert.ok(ui.app.querySelector('#rh-leave-thirdStartDate'));assert.ok(ui.app.querySelector('#rh-leave-thirdDays'));assert.match(ui.app.innerHTML,/Outra escala exige/);
});
test('resposta tardia não sobrescreve outra tela',async()=>{
 const ui=harness();let finish,current=true;const pending=ui.api.open({app:ui.app,esc,isCurrent:()=>current,entryId:id,onBack:()=>{},request:()=>new Promise(resolve=>{finish=resolve;})});current=false;ui.app.innerHTML='OUTRA TELA';finish(resources);await pending;assert.equal(ui.app.innerHTML,'OUTRA TELA');
});
test('retorno e revisão preservam contexto e obrigam reconferência',async()=>{
 const ui=harness();let received;const editing={id,version:3,plan:{...plan,date_mode:'return',requested_return:'2027-04-05',admission_date:'2020-01-01',acquisition_start:'2025-01-01',acquisition_end:'2025-12-31',legal:{...plan.legal,evidence:{regime:'efetivo',regularLicenseLoss:false}}}};
 await ui.api.open({app:ui.app,esc,isCurrent:()=>true,entryId:id,editing,onBack:()=>{},request:async p=>{if(p.action==='leave-resources')return resources;received=p;return preview;}});assert.equal(ui.app.querySelector('#rh-leave-startDate'),null);assert.equal(ui.app.querySelector('#rh-leave-returnDate').value,'2027-04-05');ui.set('#rh-leave-reason','Reprogramação conferida');await ui.submit('#rh-leave-form');assert.equal(received.item.startDate,undefined);assert.equal(received.version,3);assert.equal(received.item.eligibilityConfirmed,false);
});
test('folga histórica continua consultável e cancelável, sem nova programação',async()=>{
 const ui=harness();const data={id,status:'programada',snapshot:resources,plan:{...plan,type:'banco_horas'},created_at:'2026-10-18T12:00:00Z'};await ui.api.detail({app:ui.app,esc,isCurrent:()=>true,leaveId:id,onBack:()=>{},request:async()=>data});assert.equal(ui.app.querySelector('#rh-detail-edit'),null);assert.ok(ui.app.querySelector('#rh-close-form'));
});
test('comprovante atual é reconsultado para refletir cancelamento de outra sessão',async()=>{
 const ui=harness();let n=0,shown;ui.root.SGFRhReceipt={fromLeave:x=>x,show:({data})=>{shown=data;}};await ui.api.detail({app:ui.app,esc,isCurrent:()=>true,leaveId:id,onBack:()=>{},request:async()=>({id,status:++n===1?'programada':'cancelada',snapshot:resources,plan,created_at:'2026-10-18T12:00:00Z'})});await ui.app.querySelector('#rh-detail-receipt').onclick();assert.equal(shown.status,'cancelada');
});

test('conflito ao encerrar recarrega a versão atual sem repetir a ação automaticamente',async()=>{
 const ui=harness();let reads=0,closes=0;const request=async p=>{
  if(p.action==='leave-detail')return{id,version:++reads===1?1:2,status:'programada',snapshot:resources,plan,created_at:'2026-10-18T12:00:00Z'};
  if(p.action==='close-leave'){closes++;throw Object.assign(Error('Versão alterada'),{code:'RH_VERSION_CONFLICT'});}
 };
 await ui.api.detail({app:ui.app,esc,isCurrent:()=>true,leaveId:id,onBack(){},request});ui.set('#rh-close-reason','Motivo sintético');await ui.submit('#rh-close-form');assert.equal(reads,2);assert.equal(closes,1);assert.match(ui.app.innerHTML,/Versão 2/);assert.match(ui.app.innerHTML,/outra sessão/);assert.equal(ui.app.querySelector('#rh-close-reason').value,'Motivo sintético');
});
