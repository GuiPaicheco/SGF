import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import '../assets/access-policy.js';
const load=async name=>import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(await readFile(new URL(`../supabase/functions/_shared/${name}.ts`,import.meta.url),'utf8'))).toString('base64')}`);
const {validateAccessContext}=await load('access-context');
const {employeeInAccessContext,accessRequestInScope}=await load('employee-scope');
const {actionAllowed}=await load('action-policy');

test('lista cadastral usa somente o contexto escolhido e não todas as unidades autorizadas',async()=>{
  const source=await readFile(new URL('../supabase/functions/manage-catalogs/index.ts',import.meta.url),'utf8');
  assert.match(source,/id===context\.cnesUnitId/);
  assert.match(source,/assignments\.eq\('internal_lotacao_id', context\.lotacaoId\)/);
  assert.match(source,/assignments\.is\('internal_lotacao_id', null\)/);
  assert.match(source,/employeeQuery = employeeQuery\.in\('id', employeeIds\?\.length \? employeeIds : \['00000000-0000-0000-0000-000000000000'\]\)/);
  assert.match(source,/locationQuery = locationQuery\.eq\('id', context\.lotacaoId\)/);
  const app=await readFile(new URL('../assets/app.js',import.meta.url),'utf8');
  assert.match(app,/Funcionários somente da unidade selecionada:/);
  assert.match(app,/Visão administrativa global/);
});
function fixtures() {return {
  profiles:[{id:'p',roles:['servidor','rh','administrador','diretor'],disabled_at:null,must_change_password:false}],
  lotacoes:[{id:'a',active:true,is_internal_allocation:true},{id:'b',active:true,is_internal_allocation:true},{id:'general',active:true,is_internal_allocation:false}],
  cnes_units:[{id:'c',active:true}],profile_scopes:[{profile_id:'p',lotacao_id:'a'}],lotacao_cnes_units:[{lotacao_id:'a',cnes_unit_id:'c'}],
  employment_bonds:[{id:'bond',active:true,servidor_id:'employee',registration:'M1',servidor:{profile_id:'p',active:true}}],
  employment_bond_units:[{id:'unit',active:true,bond_id:'bond',cnes_unit_id:'c',internal_lotacao_id:'a'}]
};}
function database(tables) {
  return {from(table) {
    let rows=tables[table] || [];
    const q={select(){return q;},eq(key,value){rows=rows.filter(row=>row[key]===value);return q;},
      is(key,value){rows=rows.filter(row=>(row[key]??null)===value);return q;},
      in(key,values){rows=rows.filter(row=>values.includes(row[key]));return q;},limit(n){rows=rows.slice(0,n);return q;},
      single(){return Promise.resolve({data:rows.length===1?rows[0]:null,error:rows.length===1?null:new Error('not single')});},
      maybeSingle(){return Promise.resolve({data:rows.length===1?rows[0]:null,error:rows.length>1?new Error('ambiguous'):null});},
      then(resolve,reject){return Promise.resolve({data:rows,error:null}).then(resolve,reject);}};return q;
  }};
}
const request=(role='rh',extra={})=>new Request('https://example.test',{headers:{'x-sgf-role':role,...(role!=='administrador'?{'x-sgf-cnes':'c','x-sgf-lotacao':'a'}:{}),...(role==='servidor'?{'x-sgf-bond':'bond'}:{}),...extra}});
test('conta revogada, bloqueada ou com senha obrigatória invalida contexto salvo',async()=>{
  for(const patch of [{roles:['servidor']},{disabled_at:'2026-10-07'},{must_change_password:true}]) {
    const data=fixtures();Object.assign(data.profiles[0],patch);
    await assert.rejects(validateAccessContext(database(data),request(),'p',['rh']),/INVALID_ACCESS_CONTEXT/);
  }
});
test('RH exige CNES, lotação ativa, mapeamento válido e escopo concedido',async()=>{
  assert.equal((await validateAccessContext(database(fixtures()),request(),'p',['rh'])).cnesUnitId,'c');
  for(const change of [data=>data.lotacoes[0].active=false,data=>data.cnes_units[0].active=false,data=>data.profile_scopes=[],data=>data.lotacao_cnes_units=[]]) {
    const data=fixtures();change(data);await assert.rejects(validateAccessContext(database(data),request(),'p',['rh']),/INVALID_ACCESS_CONTEXT/);
  }
  await assert.rejects(validateAccessContext(database(fixtures()),request('rh',{'x-sgf-cnes':''}),'p',['rh']),/INVALID_ACCESS_CONTEXT/);
});
test('servidor só seleciona vínculo próprio, pessoa ativa e unidade vigente no cadastro',async()=>{
  assert.equal((await validateAccessContext(database(fixtures()),request('servidor'),'p',['servidor'])).bondUnitId,'unit');
  for(const change of [data=>data.employment_bonds[0].servidor.profile_id='other',data=>data.employment_bonds[0].servidor.active=false,data=>data.employment_bonds[0].active=false,data=>data.employment_bond_units[0].active=false,data=>data.cnes_units[0].active=false]) {
    const data=fixtures();change(data);await assert.rejects(validateAccessContext(database(data),request('servidor'),'p',['servidor']),/INVALID_ACCESS_CONTEXT/);
  }
});
test('administrador não transporta escopo de RH para contexto global',async()=>{
  const context=await validateAccessContext(database(fixtures()),request('administrador'),'p',['administrador']);assert.equal(context.global,true);
  await assert.rejects(validateAccessContext(database(fixtures()),request('administrador',{'x-sgf-cnes':'c'}),'p',['administrador']),/INVALID_ACCESS_CONTEXT/);
});
test('mesmo CNES não concede acesso a funcionário de outra diretoria',async()=>{
  const context={role:'rh',global:false,cnesUnitId:'c',lotacaoId:'a'};
  assert.equal(await employeeInAccessContext(database(fixtures()),context,'employee'),true);
  const data=fixtures();data.employment_bond_units[0].internal_lotacao_id='b';
  assert.equal(await employeeInAccessContext(database(data),context,'employee'),false);
});
test('UBS geral exige atuação sem lotação interna e falha não amplia consulta',async()=>{
  const context={role:'rh',global:false,cnesUnitId:'c',lotacaoId:'general'};
  const data=fixtures();assert.equal(await employeeInAccessContext(database(data),context,'employee'),false);
  data.employment_bond_units[0].internal_lotacao_id=null;assert.equal(await employeeInAccessContext(database(data),context,'employee'),true);
  assert.equal(await employeeInAccessContext(database(data),{...context,cnesUnitId:null},'employee'),false);
});
test('pedido de acesso misto ou vazio não pode ser gerenciado pelo RH',()=>{
  const make=units=>({model_version:2,access_request_bonds:[{units}]});
  const own={cnes_unit_id:'c',internal_lotacao_id:'a'};
  assert.equal(accessRequestInScope(make([own]),new Set(['c']),'a',true),true);
  for(const units of [[],[own,{...own,cnes_unit_id:'other'}],[own,{...own,internal_lotacao_id:'b'}],[{...own,internal_lotacao_id:null}]])
    assert.equal(accessRequestInScope(make(units),new Set(['c']),'a',true),false);
  assert.equal(accessRequestInScope({model_version:2,access_request_bonds:[]},new Set(['c']),'a',true),false);
});
test('matriz de ações mantém privilégios separados e bloqueia ações desconhecidas',()=>{
  for(const role of ['servidor','diretor','rh','administrador','inventado']) {
    assert.equal(actionAllowed('operations','inventada',role),false);
    assert.equal(actionAllowed('catalogs','save-location',role),role==='administrador');
    assert.equal(actionAllowed('operations','scale-save',role),['rh','administrador'].includes(role));
    assert.equal(actionAllowed('operations','unit-review',role),['diretor','rh','administrador'].includes(role));
    assert.equal(actionAllowed('access','approve',role),['rh','administrador'].includes(role));
    assert.equal(actionAllowed('operations','notifications',role),role!=='inventado');
  }
  assert.equal(actionAllowed('inventado','list','administrador'),false);
  for(const key of ['__proto__','constructor','toString']) {
    assert.equal(actionAllowed(key,'list','administrador'),false);
    assert.equal(actionAllowed('operations',key,'administrador'),false);
  }
});
test('capacidades visuais correspondem a operações administrativas e de gestão',()=>{
  const {can}=globalThis.SGFAccessPolicy;
  for(const role of ['servidor','diretor','rh','administrador']) {
    assert.equal(can('structure',role),role==='administrador');
    assert.equal(can('timeBank',role),['rh','administrador'].includes(role));
    assert.equal(can('archive',role),['rh','administrador'].includes(role));
    assert.equal(can('review',role),role!=='servidor');
  }
  assert.equal(can('structure','administrador',false),false);
  for(const role of ['__proto__','constructor','toString']) {
    assert.equal(globalThis.SGFAccessPolicy.resolve('dashboard',role,true,false),'choose-access');
    assert.equal(can(role,'administrador'),false);
  }
});
test('funções operacionais aplicam matriz antes de executar ações',async()=>{
  for(const [name,service] of [['manage-operations','operations'],['manage-catalogs','catalogs'],['manage-access','access'],['manage-inclusions','inclusions']]) {
    const source=await readFile(new URL(`../supabase/functions/${name}/index.ts`,import.meta.url),'utf8');
    assert.match(source,new RegExp(`actionAllowed\\('${service}',action,context.role\\)`));
    assert.ok(source.indexOf('actionAllowed(')<source.indexOf("if (action ==="));
  }
});
test('troca de contexto limpa dados administrativos e botões têm guarda de capacidade',async()=>{
  const source=await readFile(new URL('../assets/app.js',import.meta.url),'utf8');
  assert.match(source,/state.accessRequests = \[\]; state.inclusions = \[\]; state.profiles = \[\]/);
  assert.match(source,/state.distributionEditor = null/);
  assert.match(source,/if\(!controlAllowed\(event.target\)\)/);
  assert.match(source,/MutationObserver\(applyControlPermissions\)/);
});
