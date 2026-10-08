import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const app=await read('assets/app.js');
const source=app.slice(app.indexOf('  function canActOnUnitReview('),app.indexOf('  let unitReviewBusy='));
function allowed(role,context,review){const sandbox={state:{profile:{role},activeContext:context}};vm.createContext(sandbox);vm.runInContext(source+'; this.check=canActOnUnitReview;',sandbox);return sandbox.check(review);}
test('RH com perfil servidor não recebe ação de outra unidade',()=>{
  const context={role:'rh',cnes_unit_id:'A',lotacao_id:'UBS-A',internal_lotacao_id:null};
  assert.equal(allowed('rh',context,{cnes_unit_id:'A',lotacao_id:null}),true);
  assert.equal(allowed('rh',context,{cnes:{id:'A'},lotacao_id:null}),true);
  assert.equal(allowed('rh',context,{cnes:{id:'B'},lotacao_id:null}),false);
  assert.equal(allowed('rh',context,{cnes_unit_id:'B',lotacao_id:null}),false);
  assert.match(app,/!canActOnUnitReview\(review\)/);
});
test('diretorias no mesmo CNES permanecem separadas na interface',()=>{
  const context={role:'rh',cnes_unit_id:'X',lotacao_id:'D1',internal_lotacao_id:'D1'};
  assert.equal(allowed('rh',context,{cnes_unit_id:'X',lotacao_id:'D1'}),true);
  assert.equal(allowed('rh',context,{cnes_unit_id:'X',lotacao_id:'D2'}),false);
  assert.equal(allowed('rh',context,{cnes_unit_id:'X',lotacao_id:null}),false);
});
test('somente contexto administrativo global permite ação entre unidades',()=>{
  assert.equal(allowed('administrador',{role:'administrador',global:true},{cnes_unit_id:'B'}),true);
  assert.equal(allowed('administrador',{role:'rh',cnes_unit_id:'B'},{cnes_unit_id:'B'}),false);
  assert.equal(allowed('servidor',{role:'servidor',cnes_unit_id:'B'},{cnes_unit_id:'B'}),false);
});
test('RLS exige papel servidor para leitura como titular e Auth informa lotação interna',async()=>{
  const sql=await read('supabase/migrations/20261008191336_unit_review_active_role_scope.sql');
  assert.equal((sql.match(/actor_role\(\(select auth.uid\(\)\)\)='servidor'/g)||[]).length,2);
  assert.match(sql,/request_unit_reviews.lotacao_id is not distinct from private.current_context_internal_lotacao\(\)/);
  const auth=await read('supabase/functions/access-auth/index.ts');
  assert.match(auth,/internal_lotacao_id: scope.lotacao\?\.is_internal_allocation \? scope.lotacao.id : null/);
});
