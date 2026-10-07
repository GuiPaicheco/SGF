import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const read = path => readFile(new URL(`../${path}`,import.meta.url),'utf8');
const code = stripTypeScriptTypes(await read('supabase/functions/_shared/rejection-reasons.ts'));
const {validateReasonCatalog} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const valid = {code:'other',label:' Outros ',input_mode:'other',active:true,display_order:3,version:1,justification:' Ajuste autorizado '};

test('catálogo normaliza texto e descarta autoria e campos extras enviados pelo cliente', () => {
  const result = validateReasonCatalog({...valid,actor_id:'forjado',secret:'injetado'});
  assert.deepEqual(result,{...valid,label:'Outros',justification:'Ajuste autorizado'});
});

test('catálogo rejeita tipos, códigos, modos, limites e justificativa inválidos', () => {
  for (const patch of [{code:'UPPER'},{code:'ab'},{code:'x'.repeat(65)},{label:'ab'},{label:'x'.repeat(161)},
    {active:'true'},{input_mode:'arbitrary'},{display_order:-1},{display_order:10001},{display_order:1.5},
    {version:-1},{version:'1'},{justification:'ab'},{justification:'x'.repeat(2001)}]) {
    assert.throws(() => validateReasonCatalog({...valid,...patch}),/REASON_CATALOG_INVALID/);
  }
  assert.equal(validateReasonCatalog({...valid,version:0,active:false}).version,0);
});

test('API limita catálogo completo e alteração ao administrador e usa identidade autenticada', async () => {
  const source = await read('supabase/functions/manage-operations/index.ts');
  assert.match(source,/action === 'rejection-reason-save'[\s\S]*?!context.global \|\| actorRole !== 'administrador'/);
  assert.match(source,/validateReasonCatalog\(payload\)/);
  assert.match(source,/rpc\('manage_rejection_reason',[\s\S]*?actor_id:profile.id/);
  assert.match(source,/payload.include_inactive && !context.global/);
  assert.match(source,/if \(!payload.include_inactive\) query = query.eq\('active',true\)/);
});

test('SQL serializa catálogo, verifica versão, preserva modo e audita na mesma transação', async () => {
  const sql = await read('supabase/migrations/20261005170000_unit_request_workflow.sql');
  const fn = sql.slice(sql.indexOf('create or replace function public.manage_rejection_reason'));
  assert.match(fn,/security invoker set search_path = ''/);
  assert.match(fn,/private.actor_role\(actor_id\) is distinct from 'administrador'/);
  assert.match(fn,/pg_advisory_xact_lock/);
  assert.match(fn,/for update/);
  for (const error of ['REASON_VERSION_CONFLICT','REASON_MODE_IMMUTABLE','REASON_LAST_ACTIVE']) assert.ok(fn.includes(error));
  assert.match(fn,/public.audit_events\(actor_id,actor_role,action,entity_type,previous_value,new_value,reason\)/);
  assert.match(fn,/from public,anon,authenticated/);
  assert.match(fn,/to service_role/);
  assert.doesNotMatch(fn,/delete from/);
});

test('interface distingue ativo/inativo, exige motivo e conserva versão para edição concorrente', async () => {
  const app = await read('assets/app.js');
  assert.match(app,/'rejection-catalog': renderReasonCatalog/);
  assert.match(app,/action:'rejection-reasons',include_inactive:true/);
  assert.match(app,/item.active \? 'Ativo' : 'Inativo'/);
  assert.match(app,/id="reason-justification"[\s\S]*?minlength="3" maxlength="2000" required/);
  assert.match(app,/version:item\?\.version \|\| 0/);
  assert.match(app,/notice.textContent = error.message/);
});
