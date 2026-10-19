import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../assets/rh-receipt.js',import.meta.url),'utf8');const root={};runInNewContext(source,{globalThis:root,Date,Set});const api=root.SGFRhReceipt;
const record={id:'f7000000-0000-0000-0000-000000000001',status:'programada',version:1,created_at:'2026-10-18T12:00:00Z',snapshot:{full_name:'PESSOA FICTÍCIA <img src=x>',registration:'TESTE-001',unit:'POLO TESTE',position:'CARGO TESTE',cbo:'123456',weekly_hours:32.5,team:'EQUIPE TESTE'},operator_name:'OPERADOR TESTE',operator_declared:true,plan:{type:'banco_horas',birth_date:'1990-03-02',periods:[{start_date:'2027-03-01',end_date:'2027-03-03',return_date:'2027-03-04'}],bank:{declared_minutes:480,required_minutes:960,missing_minutes:480,override:true,override_reason:'Exceção fictícia'},notes:'<script>alert(1)</script>'}};
test('comprovante RH preserva snapshot, datas, horas e exceção em tela e texto',()=>{const data=api.fromLeave(record),html=api.document(data),text=api.text(data);for(const value of ['CBO','123456','32,5 h/semana','EQUIPE TESTE','01/03/2027','04/03/2027','Exceção fictícia','OPERADOR TESTE']){assert.ok(html.includes(value),value);assert.ok(text.includes(value),value);}assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x>'));assert.equal(data.dayOffs[0],'2027-03-02');assert.match(text,/Horas faltantes: 8 h/);});
test('cancelamento fica explícito e campos históricos ausentes não são inventados',()=>{const data={...api.fromLeave(record),status:'cancelada',cbo:null,weeklyHours:null,team:'',responsibilities:[{date:'2027-03-01',cnes:{name:'DISTRIBUIÇÃO REMOVIDA'}}]};for(const output of [api.document(data),api.text(data,true)]){assert.match(output,/REGISTRO CANCELADO/);assert.match(output,/Não informado/);assert.doesNotMatch(output,/DISTRIBUIÇÃO REMOVIDA|responsável por dia|Responsabilidade por dia/);}});
test('reimpressão do legado usa título próprio sem perder protocolo ou período',()=>{const data={...api.fromLeave(record),legacy:true,protocol:'SGF-LEGADO-001',bank:null};for(const output of [api.document(data),api.text(data,true)]){assert.match(output,/COMPROVANTE DE SOLICITAÇÃO — LEGADO/);assert.match(output,/SGF-LEGADO-001/);assert.match(output,/04\/03\/2027/);}});

test('comprovante de versão anterior é identificado como substituído em todas as saídas',()=>{const data=api.fromLeave({...record,superseded:true});for(const output of [api.document(data),api.text(data),api.text(data,true)])assert.match(output,/VERSÃO SUBSTITUÍDA/);assert.match(api.text(data),/Versão: 1/);});
const statutory={...record,status:'programada',version:3,plan:{type:'regulamentar',acquisition_start:'2025-01-01',acquisition_end:'2025-12-31',birth_date:'1990-03-02',periods:[{sequence:1,start_date:'2027-03-01',end_date:'2027-04-05',return_date:'2027-04-06',days:25,counting_mode:'uteis'}],bank:{required_minutes:0},legal:{version:'betim-2026-10-18',basis:'Lei 7.989/2025; Decreto 51.744/2025',regime:'efetivo',reference:'Processo <img src=x> 123',protocol_date:'2026-10-01',evidence:{healthLeaveDays:123,privateNote:'DADO FUNCIONAL RESTRITO'}}}};
test('comprovante normativo mostra referência, aquisição, duração e versão sem expor impedimentos pessoais',()=>{
 const data=api.fromLeave(statutory);assert.equal(data.dayOffs.length,0);
 for(const out of [api.document(data),api.text(data),api.text(data,true)]){
  for(const value of ['Lei 7.989/2025','Estatutário — efetivo','01/01/2025 a 31/12/2025','01/10/2026','betim-2026-10-18','25 dia(s) úteis'])assert.ok(out.includes(value),value);
  assert.doesNotMatch(out,/healthLeaveDays|DADO FUNCIONAL RESTRITO|Day-off de aniversário/);
 }
 assert.doesNotMatch(api.document(data),/<img src=x>/);assert.match(api.document(data),/Processo &lt;img/);
});
function screen(){
 let html='',nodes=new Map(),prints=0,copies=[];
 const app={querySelector:s=>nodes.get(s),setAttribute(){}};Object.defineProperty(app,'innerHTML',{get:()=>html,set:v=>{html=v;nodes=new Map(['print','copy','email','back','feedback'].map(k=>['#rh-receipt-'+k,{disabled:false}]));}});
 const root={print(){prints++;},navigator:{clipboard:{async writeText(v){copies.push(v);}}}};runInNewContext(source,{globalThis:root,Date,Set});
 return {app,root,get prints(){return prints;},copies,open:props=>root.SGFRhReceipt.show({app,data:root.SGFRhReceipt.fromLeave(statutory),onBack(){app.innerHTML='CALENDÁRIO';},...props}),click:kind=>app.querySelector('#rh-receipt-'+kind).onclick()};
}
test('alteração ou cancelamento remoto atualiza o documento antes de permitir impressão',async()=>{
 const ui=screen();let checks=0;const latest=api.fromLeave({...statutory,status:'cancelada',version:4});ui.open({refresh:async()=>{checks++;return latest;}});
 await ui.click('print');assert.equal(ui.prints,0);assert.match(ui.app.innerHTML,/REGISTRO CANCELADO/);assert.match(ui.app.innerHTML,/O registro mudou/);
 await ui.click('print');assert.equal(ui.prints,1);assert.equal(checks,2);
});
test('falha de conferência impede impressão e cópia de documento desatualizado',async()=>{
 const ui=screen();ui.open({refresh:async()=>{throw Error('Sem conexão');}});await ui.click('print');await ui.click('copy');assert.equal(ui.prints,0);assert.equal(ui.copies.length,0);assert.match(ui.app.innerHTML,/Não foi possível conferir/);
});
test('cópia de texto usa o mesmo documento normativo verificado',async()=>{
 const ui=screen();ui.open({refresh:async()=>api.fromLeave(statutory)});await ui.click('email');assert.equal(ui.copies.length,1);assert.match(ui.copies[0],/Lei 7.989\/2025/);assert.match(ui.copies[0],/Versão: 3/);assert.doesNotMatch(ui.copies[0],/DADO FUNCIONAL RESTRITO/);
});
test('voltar durante uma conferência pendente impede impressão e não reabre a tela antiga',async()=>{
 const ui=screen();let finish;ui.open({refresh:()=>new Promise(r=>{finish=r;})});const pending=ui.click('print');await ui.click('back');finish(api.fromLeave(statutory));await pending;assert.equal(ui.prints,0);assert.equal(ui.app.innerHTML,'CALENDÁRIO');
});
test('comprovante histórico permanece identificado e usa o snapshot de sua própria versão',async()=>{
 const ui=screen();ui.open({data:api.fromLeave({...statutory,superseded:true,version:1})});await ui.click('print');assert.equal(ui.prints,1);assert.match(ui.app.innerHTML,/VERSÃO SUBSTITUÍDA/);assert.match(ui.app.innerHTML,/Versão 1/);
});
