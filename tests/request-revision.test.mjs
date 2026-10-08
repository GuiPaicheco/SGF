import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const root={};runInNewContext(await read('assets/request-revision.js'),root);
const ui=root.SGFRequestRevision;
const request={id:'original',context_bond_id:'bond',status:'programada',periods:[{start_date:'2026-11-03',days:2,counting_mode:'uteis'}],responsibilities:[{responsibility_date:'2026-12-01',bond_unit_id:'a'}]};
test('nova análise global aparece só ao Administrador e nunca em pedido encerrado',()=>{
  for(const role of ['servidor','rh','diretor']) assert.equal(ui.panel(request,role),'');
  for(const status of ['cancelada','concluida']) assert.equal(ui.panel({...request,status},'administrador'),'');
  assert.match(ui.panel(request,'administrador'),/pedido anterior será cancelado/);
  assert.match(ui.panel(request,'administrador'),/novo protocolo exigirá análise de todas as unidades/);
});
test('simulação preserva quantidade, mostra retorno e só oferece início editável',()=>{
  const html=ui.panel(request,'administrador');
  assert.match(html,/2 dias/);assert.match(html,/data-revision-start/);
  assert.doesNotMatch(html,/type="number"/);
});
test('redistribuição conserva atribuição válida e não escolhe CNES em dia ambíguo novo',()=>{
  const plan={periods:[{sequence:1,days:2,start_date:'2026-12-01',end_date:'2026-12-02',return_date:'2026-12-03'}],days:[
    {date:'2026-12-01',candidates:[{id:'a',name:'A'},{id:'b',name:'B'}]},
    {date:'2026-12-02',candidates:[{id:'a',name:'A'},{id:'b',name:'B'}]}]};
  const html=ui.planView(plan,request);
  assert.match(html,/value="a" selected/);assert.equal((html.match(/ selected/g)||[]).length,1);
  assert.match(html,/retorno 03\/12\/2026/);assert.match(html,/id="revision-confirm" required/);
});
test('nome de unidade e datas são escapados, sem HTML executável',()=>{
  const html=ui.planView({periods:[],days:[{date:'2026-12-01',candidates:[{id:'a',name:'<img src=x onerror=1>'}]}]},request);
  assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);
});
test('reprogramação usa travas, fingerprint e substituição única sem apagar períodos ou decisões',async()=>{
  const sql=await read('supabase/migrations/20261008184252_block_three_request_revision.sql');
  assert.match(sql,/unique index vacation_requests_one_replacement_idx/);
  assert.match(sql,/perform private\.planning_lock\(\)/);
  assert.match(sql,/REVISION_VERSION_CONFLICT/);
  assert.match(sql,/status='cancelada'/);assert.match(sql,/'request_replaced'/);
  assert.doesNotMatch(sql,/delete from public\.(request_periods|request_unit_reviews)/);
  assert.match(sql,/from public,anon,authenticated/);
});
test('função privilegiada recusa cliente, identifica ator autenticado e valida todos os dias',async()=>{
  const edge=await read('supabase/functions/manage-operations/index.ts');
  assert.match(edge,/action === 'revision-plan' \|\| action === 'revision-commit'/);
  assert.match(edge,/actor_id:profile.id,target_request:payload.request_id/);
  const sql=await read('supabase/migrations/20261008184252_block_three_request_revision.sql');
  assert.match(sql,/private\.eligible_day_units/);assert.match(sql,/RESPONSIBILITY_DAYS_INCOMPLETE/);
  assert.match(sql,/r.status in \('cancelada','concluida','rejeitada'\)/);
});
