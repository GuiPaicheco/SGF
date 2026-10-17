import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {calendarQuery,bindingInput} from '../supabase/functions/_shared/rh-calendar.mjs';
import '../assets/access-policy.js';
const source=readFileSync(new URL('../assets/rh-calendar-ui.js',import.meta.url),'utf8');
const uuid='a0000000-0000-0000-0000-000000000001';
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function harness(){const nodes=new Map(),app={innerHTML:'',querySelector:selector=>{if(!nodes.has(selector))nodes.set(selector,{});return nodes.get(selector);}};const root={};runInNewContext(source,{globalThis:root,Date});return {app,nodes,api:root.SGFRhCalendar};}
test('consulta aceita mês delimitado e busca literal; rejeita páginas e entradas excessivas',()=>{
 assert.deepEqual(calendarQuery({month:'2026-11',page:0,search:'  UBS %  '}),{target_month:'2026-11-01',page_index:0,search_text:'UBS %'});
 for(const patch of [{month:'2026-13'},{month:'2026-11-01'},{month:'2101-01'},{page:101},{page:-1},{page:'0'},{search:'x'.repeat(121)},{search:null}])assert.throws(()=>calendarQuery({month:'2026-11',page:0,search:'',...patch}),/RH_INPUT_INVALID/);
});
test('integração exige polo explícito, versões e justificativa sem aceitar vínculo arbitrário',()=>{
 const payload={entryId:uuid,entryVersion:2,bindingVersion:0,bondId:null,confirmPole:true,reason:' Conferência '};
 assert.equal(bindingInput(payload).target_reason,'Conferência');
 for(const patch of [{confirmPole:false},{entryVersion:0},{bindingVersion:-1},{bondId:'inventado'},{reason:'x'},{entryId:'invalid'}])assert.throws(()=>bindingInput({...payload,...patch}),/RH_BINDING_INPUT_INVALID/);
});
test('calendário respeita ano bissexto e distribuição legada por data',()=>{
 const {api}=harness();assert.equal(api.daysInMonth('2024-02'),29);assert.equal(api.daysInMonth('2026-02'),28);
 const row={bond_id:uuid},absence={bond_id:uuid,start_date:'2026-11-03',end_date:'2026-11-05',distributed:true,assigned_dates:['2026-11-04']};
 assert.equal(api.visibleAbsences(row,'2026-11-03',[absence]).length,0);assert.equal(api.visibleAbsences(row,'2026-11-04',[absence]).length,1);
 assert.equal(api.visibleAbsences({bond_id:'other'},'2026-11-04',[absence]).length,0);
});
test('visão RH renderiza colunas, conserva cadastro incompleto e não expande HTML da fonte',async()=>{
 const {api,app}=harness();const calls=[];
 await api.mount({app,esc,isCurrent:()=>true,request:async payload=>{calls.push(payload);return {context:{cnes_name:'UNIDADE TESTE'},total:1,employees:[{row_id:uuid,full_name:'<script>FICTÍCIO</script>',origin:'cnes',weekly_hours:32.5}],absences:[],holidays:[]};}});
 assert.equal(calls.length,1);assert.equal(calls[0].action,'calendar');assert.equal(calls[0].page,0);assert.equal(calls[0].cnes,undefined);
 for(const label of ['Nome do funcionário','Cargo','CBO','Equipe','Conferência pendente','32.5 h/semana'])assert.ok(app.innerHTML.includes(label));
 assert.ok(!app.innerHTML.includes('<script>FICTÍCIO'));assert.match(app.innerHTML,/tabindex="0"/);
});
test('Administrador consulta uma unidade explícita e RH não tem acesso à rota global',async()=>{
 const {api,app}=harness();let queried;
 await api.mount({app,esc,admin:true,isCurrent:()=>true,request:async payload=>payload.action==='directory'?{units:[{cnes:'6305245',login:'UBS AMAZONAS'}]}:(queried=payload,{context:{cnes_name:'UBS AMAZONAS'},total:0,employees:[],absences:[],holidays:[]})});
 assert.equal(queried.cnes,'6305245');assert.equal(SGFAccessPolicy.allowed('rh-calendar','administrador',true),true);
 for(const role of ['rh','diretor','servidor'])assert.equal(SGFAccessPolicy.allowed('rh-calendar',role,true),false);
});
test('resposta atrasada não substitui tela após navegação',async()=>{
 const {api,app}=harness();let finish,current=true;
 const pending=api.mount({app,esc,isCurrent:()=>current,request:()=>new Promise(resolve=>{finish=resolve;})});
 current=false;app.innerHTML='OUTRA TELA';finish({context:{cnes_name:'ATRASADA'},employees:[],absences:[],holidays:[],total:0});await pending;
 assert.equal(app.innerHTML,'OUTRA TELA');
});
