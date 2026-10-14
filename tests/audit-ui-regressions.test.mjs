import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import '../assets/scale-conflicts.js';
const app=readFileSync(new URL('../assets/app.js',import.meta.url),'utf8');
const lines=app.split(/\r?\n/);
const helpers=app.slice(app.indexOf('  function syncResponsibilityDraft()'),app.indexOf('  function renderConfirm()'));

test('conflitos usam períodos reais, mesmo CNES, equipe e lotação interna',()=>{
  const person=(id,unit='U',team='Equipe')=>({id,cnes:{id:unit},cargo:{id:'C'},team_name:team});
  const target={id:'A',row_id:'a',servidor:person('A'),periods:[{start_date:'2027-04-01',end_date:'2027-04-02'},{start_date:'2027-04-29',end_date:'2027-04-30'}]};
  const gap={id:'B',row_id:'b',servidor:person('B'),periods:[{start_date:'2027-04-15',end_date:'2027-04-16'}]};
  const outside={id:'C',row_id:'c',servidor:person('C','V'),periods:target.periods};
  const otherTeam={id:'D',row_id:'d',servidor:person('D','U','Outra'),periods:target.periods};
  const actual={id:'E',row_id:'e',servidor:person('E'),periods:target.periods};
  const onLeave=(r,day)=>r.assigned_dates ? r.assigned_dates.includes(day) : r.periods.some(p=>p.start_date<=day&&p.end_date>=day);
  const list=[target,gap,outside,otherTeam,actual];
  assert.deepEqual(globalThis.SGFScaleConflicts.overlaps(target,list,'position',onLeave).map(r=>r.id),['D','E']);
  assert.deepEqual(globalThis.SGFScaleConflicts.overlaps(target,list,'position_team',onLeave).map(r=>r.id),['E']);
  assert.deepEqual(globalThis.SGFScaleConflicts.overlaps({...target,assigned_dates:['2027-04-05']},list,'unit',onLeave),[]);
  assert.match(app,/batches.push\(await operationRequest\(\{action:'unit-calendar',month\}\)\)/);
});

test('cadastros oferecem três acessos e não recriam opção Diretor independente',()=>{
  assert.match(app,/\[\['servidor', 'Servidor'\], \['rh', 'RH\/Diretor'\], \['administrador', 'Administrador'\]\]/);
  assert.doesNotMatch(app,/name="(?:profile-role|create-role|access-role)" value="diretor"/);
  assert.match(app,/diretor: 'Diretor \(legado\)', rh: 'RH\/Diretor'/);
});

test('migração normaliza o papel legado sem alterar escopos ou apagar autoria',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261014153031_unify_management_profile.sql',import.meta.url),'utf8');
  assert.match(sql,/security invoker set search_path=''/);
  assert.match(sql,/before insert or update of role,roles/);
  assert.match(sql,/cardinality\(roles\)<=3/);
  assert.match(sql,/case when item='diretor' then 'rh'::public.app_role/);
  assert.doesNotMatch(sql,/(?:update|delete from|insert into) public\.(?:profile_scopes|audit_events|request_unit_reviews)/i);
});

test('busca encontra a matrícula do vínculo moderno e o CNES contextual',()=>{
  const line=lines.find(line=>line.includes('const searchable ='));
  const r={protocol:'P',bond:{registration:'M2'},context_cnes:{name:'CNES Y'},servidor:{matricula:'M1'}};
  const result=runInNewContext(`${line}\nsearchable`,{r});
  assert.ok(result.includes('m2'));assert.ok(result.includes('cnes y'));
  const row=lines.find(line=>line.includes('Painel administrativo')&&line.includes('rows.map'));
  assert.match(row,/esc\(r\.bond\?\.registration \|\| r\.servidor\?\.matricula/);
});

test('atribuições preservam dias válidos, removendo somente dias ou unidades inválidas',()=>{
  const state={request:{dayResponsibilities:[{date:'2027-04-05',bond_unit_id:'X'},{date:'2027-04-06',bond_unit_id:'Y'},{date:'2027-04-07',bond_unit_id:'X'}]}};
  const result=runInNewContext(`${helpers}\npreserveResponsibilities([])`,{state,
    requestWorkDays:()=>['2027-04-05','2027-04-06'],responsibilityContexts:()=>[{bond_unit_id:'X',cnes_unit_id:'C'}]});
  assert.equal(result.length,1);assert.equal(result[0].date,'2027-04-05');
  const dates=lines.find(line=>line.includes('state.request.mode = document.querySelector')&&line.includes('calculatePeriods'));
  assert.match(dates,/preserveResponsibilities\(state\.request\.periods\)/);
});

test('preenchimento rápido sincroniza o rascunho e permite envio imediato',()=>{
  const bulk=app.slice(app.indexOf("    if (['responsibility-fill-all', 'responsibility-fill-weekday'].includes(action))"),app.indexOf("    if (action === 'dashboard-clear')"));
  const selects=[{dataset:{responsibilityDate:'2027-04-05'},value:''},{dataset:{responsibilityDate:'2027-04-06'},value:''}];
  const state={request:{dayResponsibilities:[]}};
  runInNewContext(`${helpers}\nfunction apply(){${bulk}} apply();`,{state,action:'responsibility-fill-all',
    responsibilityContexts:()=>[{bond_unit_id:'X',cnes_unit_id:'C'}],document:{querySelector:()=>({value:'X'}),querySelectorAll:()=>selects},dateFrom:date=>new Date(date),showToast:()=>{}});
  assert.equal(state.request.dayResponsibilities.length,2);assert.equal(state.request.dayResponsibilities[1].cnes_unit_id,'C');
  assert.match(app,/event\.target\.id === 'notes'\) state\.request\.notes = event\.target\.value/);
});

async function sendScenario(change=false,failure=false){
  const source=app.slice(app.indexOf('  async function submitRequest()'),app.indexOf('  function receiptData('));
  let finish;const response=new Promise(resolve=>{finish=resolve;});
  const original={type:'banco_horas',cpf:'00000000000',periods:[]};
  const state={request:original,session:{}};let active=true;
  const button={disabled:false,textContent:'Enviar'},routes=[],messages=[];
  const send=runInNewContext(`${source}\nsubmitRequest`,{state,captureView:()=>()=>active,
    responsibilityContexts:()=>[{bond_unit_id:'X',cnes_unit_id:'C'}],requestWorkDays:()=>['2027-04-05'],
    document:{querySelectorAll:()=>[{dataset:{responsibilityDate:'2027-04-05'},value:'X'}],querySelector:selector=>selector==='#notes'?{value:''}:button},
    digits:value=>value,sessionHeaders:()=>({}),SUPABASE_URL:'https://example.invalid',SUPABASE_KEY:'fictício',fetch:()=>response,
    go:route=>routes.push(route),showToast:message=>messages.push(message)});
  const pending=send();if(change){state.request={protocol:'NOVO'};active=false;}
  finish({ok:!failure,json:async()=>failure?{error:'Falha'}:{protocol:'ANTERIOR',id:'A'}});await pending;
  return {state,original,routes,messages,button};
}
test('resposta antiga não sobrescreve novo rascunho nem muda a rota',async()=>{
  const result=await sendScenario(true);assert.equal(result.state.request.protocol,'NOVO');assert.equal(result.original.protocol,'ANTERIOR');assert.equal(result.routes.length,0);
});
test('erro de envio antigo não aparece no contexto posterior',async()=>{
  const result=await sendScenario(true,true);assert.equal(result.messages.length,0);assert.equal(result.state.request.protocol,'NOVO');
});
test('envio atual ainda abre comprovante e libera o botão em caso de erro',async()=>{
  const ok=await sendScenario();assert.equal(ok.routes[0],'receipt');
  const fail=await sendScenario(false,true);assert.equal(fail.button.disabled,false);assert.equal(fail.messages[0],'Falha');
});

test('operação duplicada é bloqueada e resposta antiga não muda a tela',async()=>{
  const source=app.slice(app.indexOf('  let operationBusy = false;'),app.indexOf('function render()'));
  let finish,calls=0,active=true;const response=new Promise(resolve=>{finish=resolve;});
  const state={selected:{id:'A'},profile:{role:'rh'}};const routes=[],messages=[],buttons=[{disabled:false}];
  const update=runInNewContext(`${source}\nupdateOperation`,{state,captureView:()=>()=>active,
    document:{querySelector:()=>({value:'Justificativa'}),querySelectorAll:()=>buttons},
    operationRequest:()=>{calls++;return response;},showToast:text=>messages.push(text),go:route=>routes.push(route)});
  const pending=update('cancelar');await update('cancelar');assert.equal(calls,1);
  state.selected={id:'B'};active=false;finish({});await pending;
  assert.equal(messages.length,0);assert.equal(routes.length,0);
});

test('detalhe consulta projeção por unidade, em vez de conflito por intervalo global',async()=>{
  const source=app.slice(app.indexOf('  async function requestConflicts('),app.indexOf('  async function prepareEmployeeRequest('));
  const target={id:'A',row_id:'a',calendar_confirmed:true,servidor:{id:'A',cnes:{id:'U'},cargo:{id:'C'}},periods:[{start_date:'2027-04-01',end_date:'2027-04-02',return_date:'2027-04-05'}]};
  const other={...target,id:'B',row_id:'b',servidor:{...target.servidor,id:'B'},assigned_dates:['2027-04-01']};
  const months=[];
  const conflict=runInNewContext(`${source}\nrequestConflicts`,{state:{scale:{mode:'confirmed',conflictCriterion:'position'}},captureView:()=>()=>true,
    operationRequest:async input=>{months.push(input.month);return {requests:[target,other]};},SGFScaleConflicts:globalThis.SGFScaleConflicts,
    SGFScaleRange:{activeOn:()=>true},CALENDAR_EVENTS:new Map()});
  const result=await conflict(target);assert.deepEqual(months,['2027-04']);assert.equal(result[0].id,'B');
});
