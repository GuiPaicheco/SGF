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
const resources={entry_id:id,full_name:'<script>FICTÍCIO</script>',registration:'TESTE-001',position:'CARGO',cbo:'123456',weekly_hours:32.5,team:'EQUIPE',unit:'UNIDADE TESTE',birth_date:'1990-06-15',rights:[]};
function preview(item){const missing=Math.max(0,item.days*item.dailyHours-item.availableHours)*60;
 return {resources,actor:{operator:{name:'OPERADOR TESTE'},declared:true},digest:'a'.repeat(64),plan:{type:item.type,
  periods:[{sequence:1,start_date:'2027-03-01',end_date:'2027-03-02',return_date:'2027-03-03',days:2,counting_mode:'uteis'}],
  bank:{declared_minutes:item.availableHours*60,required_minutes:960,missing_minutes:missing,possible_days:Math.floor(item.availableHours/item.dailyHours),override:item.override,override_reason:item.overrideReason},can_save:!missing||item.override}};
}
async function bankForm(ui,request){await ui.api.open({app:ui.app,esc,request,isCurrent:()=>true,entryId:id,onBack:()=>{}});
 ui.set('#rh-leave-type','banco_horas');ui.change('#rh-leave-type');ui.set('#rh-leave-startDate','2027-03-01');ui.set('#rh-leave-days','2');ui.set('#rh-leave-dailyHours','8');ui.set('#rh-leave-availableHours','8');
 // Checkbox sem ID: localizar por nome no formulário.
 const checkbox=ui.app.querySelector('#rh-leave-form').querySelectorAll('[name]').find(node=>node.name==='eligibilityConfirmed');checkbox.checked=true;
}
test('horas insuficientes exigem exceção explícita e outra prévia antes de programar',async()=>{
 const ui=harness(),calls=[];let saved;
 const request=async payload=>{calls.push(payload);if(payload.action==='leave-resources')return resources;if(payload.action==='preview-leave')return preview(payload.item);
  if(payload.action==='create-leave'){saved=payload;return {id};}if(payload.action==='leave-detail')return {id,status:'programada',snapshot:resources,operator_name:'OPERADOR TESTE',operator_declared:true,created_at:'2026-10-18T12:00:00Z',plan:preview(saved.item).plan};assert.fail(payload.action);};
 await bankForm(ui,request);await ui.submit('#rh-leave-form');assert.match(ui.app.innerHTML,/Faltam 8 h/);assert.equal(ui.app.querySelector('#rh-leave-confirm'),null);
 assert.equal(ui.app.querySelector('#rh-leave-override').checked,false);ui.set('#rh-leave-override',true);ui.set('#rh-leave-override-reason','Exceção fictícia conferida');await ui.submit('#rh-leave-exception');
 assert.ok(ui.app.querySelector('#rh-leave-confirm'));assert.match(ui.app.innerHTML,/Exceção confirmada pelo RH/);
 await ui.submit('#rh-leave-confirm');assert.equal(saved.requestKey,id);assert.equal(saved.item.override,true);assert.match(ui.app.innerHTML,/Registro de afastamento/);
 assert.ok(!ui.app.innerHTML.includes('<script>FICTÍCIO'));assert.equal(calls.filter(row=>row.action==='create-leave').length,1);
});
test('erro de conexão preserva chave e payload no reenvio e bloqueia edição incerta',async()=>{
 const ui=harness(),creates=[];let stored;
 const request=async payload=>{if(payload.action==='leave-resources')return resources;if(payload.action==='preview-leave')return preview(payload.item);
  if(payload.action==='create-leave'){creates.push(payload);stored=payload;if(creates.length===1)throw Error('Conexão interrompida');return {id,replayed:true};}
  if(payload.action==='leave-detail')return {id,status:'programada',snapshot:resources,operator_name:'TESTE',created_at:'2026-10-18T12:00:00Z',plan:preview(stored.item).plan};};
 await bankForm(ui,request);ui.set('#rh-leave-availableHours','16');await ui.submit('#rh-leave-form');await ui.submit('#rh-leave-confirm');
 assert.match(ui.app.innerHTML,/Repita esta mesma prévia/);assert.equal(ui.app.querySelector('#rh-leave-edit').disabled,true);
 await ui.submit('#rh-leave-confirm');assert.equal(creates.length,2);assert.deepEqual(creates[0],creates[1]);assert.match(ui.app.innerHTML,/Registro de afastamento/);
});
test('resposta de cadastro não sobrescreve tela depois de navegar',async()=>{
 const ui=harness();let finish,current=true;
 const pending=ui.api.open({app:ui.app,esc,isCurrent:()=>current,entryId:id,onBack:()=>{},request:()=>new Promise(resolve=>{finish=resolve;})});
 current=false;ui.app.innerHTML='OUTRA TELA';finish(resources);await pending;assert.equal(ui.app.innerHTML,'OUTRA TELA');
});

 test('emissão consulta novamente o registro para refletir cancelamento feito em outra sessão',async()=>{
 const ui=harness();let calls=0,shown;const record={id,status:'programada',version:1,snapshot:resources,operator_name:'TESTE',created_at:'2026-10-18T12:00:00Z',plan:preview({type:'banco_horas',days:2,dailyHours:8,availableHours:16}).plan};
 ui.root.SGFRhReceipt={fromLeave:data=>data,show:({data})=>{shown=data;}};
 await ui.api.detail({app:ui.app,esc,isCurrent:()=>true,leaveId:id,onBack:()=>{},request:async()=>({...record,status:++calls===1?'programada':'cancelada'})});
 await ui.app.querySelector('#rh-detail-receipt').onclick();assert.equal(calls,2);assert.equal(shown.status,'cancelada');
 });

test('edição pede horas novamente, preserva motivo e repete o mesmo envio após falha de rede',async()=>{
 const ui=harness(),creates=[];const oldPlan={...preview({type:'banco_horas',days:2,dailyHours:8,availableHours:16}).plan,days:2,bank:{daily_minutes:480,declared_minutes:960,required_minutes:960}};
 const editing={id,entry_id:id,version:4,status:'programada',snapshot:resources,plan:oldPlan};
 const request=async payload=>{if(payload.action==='leave-resources')return resources;if(payload.action==='preview-revision'){assert.equal(payload.version,4);assert.equal(payload.leaveId,id);return {...preview(payload.item),previous_plan:oldPlan};}
  if(payload.action==='revise-leave'){creates.push(payload);if(creates.length===1)throw Error('Conexão perdida');return {id,version:5};}
  if(payload.action==='leave-detail')return {...editing,version:5,operator_name:'TESTE',created_at:'2026-10-18T12:00:00Z'};assert.fail(payload.action);};
 await ui.api.open({app:ui.app,esc,request,isCurrent:()=>true,entryId:id,editing,onBack:()=>{}});
 assert.equal(ui.app.querySelector('#rh-leave-availableHours').value,'');assert.equal(ui.app.querySelector('#rh-leave-form').querySelectorAll('[name]').find(n=>n.name==='eligibilityConfirmed').checked,false);
 ui.set('#rh-leave-availableHours','16');ui.set('#rh-leave-startDate','2027-03-08');ui.set('#rh-leave-reason','Reprogramação fictícia conferida');ui.app.querySelector('#rh-leave-form').querySelectorAll('[name]').find(n=>n.name==='eligibilityConfirmed').checked=true;
 await ui.submit('#rh-leave-form');assert.match(ui.app.innerHTML,/Versão atual · 4/);assert.match(ui.app.innerHTML,/Nova proposta/);assert.match(ui.app.innerHTML,/Reprogramação fictícia conferida/);
 await ui.submit('#rh-leave-confirm');assert.equal(ui.app.querySelector('#rh-leave-edit').disabled,true);await ui.submit('#rh-leave-confirm');assert.equal(creates.length,2);assert.deepEqual(creates[0],creates[1]);assert.equal(creates[0].version,4);assert.equal(creates[0].reason,'Reprogramação fictícia conferida');assert.equal(creates[0].entryId,undefined);
});

test('versão anterior abre comprovante histórico com seu próprio snapshot',async()=>{
 const ui=harness();let shown;const plan=preview({type:'banco_horas',days:2,dailyHours:8,availableHours:16}).plan;
 const data={id,entry_id:id,version:2,status:'programada',snapshot:resources,plan,created_at:'2026-10-18T12:00:00Z',operator_name:'TESTE',revisions:[{version:1,snapshot:{...resources,position:'CARGO ANTERIOR'},plan,status:'programada',reason:'Mudança fictícia',operator_name:'OUTRO OPERADOR',changed_at:'2026-10-18T13:00:00Z'}],history:[{action:'rh_leave_revised',occurred_at:'2026-10-18T13:00:00Z'}]};
 ui.root.SGFRhReceipt={fromLeave:value=>value,show:({data})=>{shown=data;}};await ui.api.detail({app:ui.app,esc,request:async()=>data,isCurrent:()=>true,leaveId:id,onBack:()=>{}});
 assert.match(ui.app.innerHTML,/Alterado/);ui.app.querySelector('#rh-revision-receipt-1').onclick();assert.equal(shown.superseded,true);assert.equal(shown.version,1);assert.equal(shown.snapshot.position,'CARGO ANTERIOR');
});

test('retorno envia apenas a data ativa e preserva o modo ao reprogramar',async()=>{
 const ui=harness();let received;const p={...preview({type:'banco_horas',days:2,dailyHours:8,availableHours:16}).plan,date_mode:'return',requested_return:'2027-03-09',days:2,bank:{daily_minutes:480,required_minutes:960}};
 const editing={id,version:3,entry_id:id,plan:p};const request=async payload=>{if(payload.action==='leave-resources')return resources;if(payload.action==='preview-revision'){received=payload;return {...preview(payload.item),plan:p,previous_plan:p};}assert.fail(payload.action);};
 await ui.api.open({app:ui.app,esc,request,isCurrent:()=>true,entryId:id,editing,onBack:()=>{}});assert.equal(ui.app.querySelector('#rh-leave-dateMode').value,'return');assert.equal(ui.app.querySelector('#rh-leave-returnDate').value,'2027-03-09');assert.equal(ui.app.querySelector('#rh-leave-startDate'),null);
 ui.set('#rh-leave-returnDate','2027-03-16');ui.set('#rh-leave-availableHours','16');ui.set('#rh-leave-reason','Novo retorno fictício');ui.app.querySelector('#rh-leave-form').querySelectorAll('[name]').find(n=>n.name==='eligibilityConfirmed').checked=true;
 await ui.submit('#rh-leave-form');assert.equal(received.item.returnDate,'2027-03-16');assert.equal(received.item.dateMode,'return');assert.equal(received.item.startDate,undefined);assert.equal(received.version,3);assert.match(ui.app.innerHTML,/Calculado pelo retorno/);
});

test('erro no detalhe permite voltar sem reabrir a tela antiga',async()=>{const ui=harness();let back=0;await ui.api.detail({app:ui.app,esc,request:async()=>{throw Error('Falha fictícia');},isCurrent:()=>true,leaveId:id,onBack:()=>{back++;ui.app.innerHTML='CALENDÁRIO';}});ui.app.querySelector('#rh-detail-back').onclick();assert.equal(back,1);assert.equal(ui.app.innerHTML,'CALENDÁRIO');});
