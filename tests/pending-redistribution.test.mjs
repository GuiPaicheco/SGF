import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = path => readFile(new URL(`../${path}`,import.meta.url),'utf8');
const sql = await read('supabase/migrations/20261005170000_unit_request_workflow.sql');
const fn=sql.slice(sql.indexOf('create function public.change_pending_day_responsibility'));
test('redistribuição inicial é administrativa, privada e exige perfil ativo e justificativa',()=>{
  assert.match(fn,/role_value is distinct from 'administrador'/);
  assert.match(fn,/disabled_at is null/);
  assert.match(fn,/char_length\(btrim\(target_reason\)\) not between 3 and 2000/);
  assert.match(fn,/security invoker set search_path = ''/);
  assert.match(fn,/from public,anon,authenticated/);
});
test('decisões e redistribuição usam bloqueio e revisão de versão',()=>{
  assert.match(fn,/order by id for update/);
  assert.match(fn,/request_row.distribution_version<>expected_version/);
  assert.match(fn,/status<>'pendente'/);
  assert.match(fn,/request_row.status not in \('enviada','em_analise'\)/);
  assert.match(fn,/set version=version\+1/);
});
test('somente data existente e atuação do vínculo vigente podem ser redistribuídas',()=>{
  for(const pattern of [/responsibility_date=target_date for update/,/u.bond_id=request_row.context_bond_id/,/b.servidor_id=request_row.servidor_id/,/u.approval_responsible/,/target_date>=u.valid_from/,/target_date<=b.valid_until/,/for share of u,b,s,c/]) assert.match(fn,pattern);
  assert.doesNotMatch(fn,/insert into public.request_day_responsibilities/);
});
test('transferência não cria revisão nem remove último dia de uma unidade',()=>{
  assert.match(fn,/cnes_unit_id=unit_row.cnes_unit_id and lotacao_id is not distinct from unit_row.internal_lotacao_id/);
  assert.match(fn,/responsibility_date<>target_date and cnes_unit_id=old_day.cnes_unit_id/);
  assert.match(fn,/DISTRIBUTION_SCOPE_CHANGE_PENDING/);
  assert.doesNotMatch(fn,/delete from public.request_unit_reviews/);
});
test('alteração grava autoria, justificativa e antes/depois, mas noop não aumenta versão',()=>{
  assert.match(fn,/unit_row.id=old_day.bond_unit_id then return request_row.distribution_version/);
  assert.match(fn,/assigned_by=actor_id/);
  assert.match(fn,/'pending_distribution_changed'/);
  assert.match(fn,/'bond_unit_id',old_day.bond_unit_id/);
  assert.match(fn,/btrim\(target_reason\)/);
});
test('Edge Function usa identidade autenticada e respostas de concorrência compreensíveis',async()=>{
  const endpoint=await read('supabase/functions/manage-operations/index.ts');
  const action=endpoint.slice(endpoint.indexOf("action === 'redistribute-pending-day'"),endpoint.indexOf("action === 'unit-review'"));
  assert.match(action,/!context.global/);
  assert.match(action,/actor_id:profile.id/);
  assert.match(action,/Number.isInteger\(payload.version\)/);
  assert.match(endpoint,/message === 'DISTRIBUTION_VERSION_CONFLICT'.*409/);
});
