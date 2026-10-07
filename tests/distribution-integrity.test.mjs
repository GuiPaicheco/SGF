import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const sql=await read('supabase/migrations/20261005170000_unit_request_workflow.sql');
test('redistribuição atualiza atuação e escopo na mesma gravação',()=>{
  const fn=sql.slice(sql.indexOf('create function public.change_pending_day_responsibility'),sql.indexOf('create function public.pending_distribution_editor'));
  assert.match(fn,/set bond_unit_id=unit_row.id,cnes_unit_id=unit_row.cnes_unit_id,\s+lotacao_id=unit_row.internal_lotacao_id,assigned_by=actor_id/);
});
test('operação legada bloqueia reprogramação e decisões globais de pedidos novos',()=>{
  const fn=sql.slice(sql.indexOf('create function public.manage_request_operation(actor_id'),sql.indexOf('create function private.notify_redistribution_neighbors'));
  assert.match(fn,/disabled_at is null/);
  assert.match(fn,/target_periods is not null and target_action<>'reprogramar'/);
  assert.match(fn,/request_row.context_bond_id is not null or exists/);
  assert.match(fn,/target_action<>'cancelar' or target_periods is not null/);
  assert.match(fn,/private.actor_role\(actor_id\)<>'administrador'/);
  assert.match(fn,/CONTEXTUAL_OPERATION_REQUIRED/);
  assert.match(fn,/return private.manage_request_operation_legacy/);
});
test('rotina interna legada permanece fora do acesso público',()=>{
  assert.match(sql,/alter function public.manage_request_operation_legacy\(uuid,uuid,text,text,jsonb\) set schema private/);
  assert.match(sql,/revoke all on function private.manage_request_operation_legacy\(uuid,uuid,text,text,jsonb\) from public,anon,authenticated/);
});
test('avisos de redistribuição usam escopo do evento, coincidência real e excluem a própria pessoa',()=>{
  const fn=sql.slice(sql.indexOf('create function private.notify_redistribution_neighbors'));
  for(const pattern of [/new.previous_value->>'responsibility_date'/,/d.cnes_unit_id=new.context_cnes_unit_id/,/d.lotacao_id is not distinct from new.context_lotacao_id/,/r.servidor_id<>changed_person/,/v.status in \('pendente','aprovada','programada'\)/,/extract\(dow from day_date\) in \(0,6\)/,/active and event_date=day_date/,/s.birth_date/,/txid_current\(\)/]) assert.match(fn,pattern);
  assert.doesNotMatch(fn,/s.full_name/);
  assert.match(fn,/when \(new.action='request_responsibility_changed'\)/);
});
test('API explica bloqueio do fluxo legado em pedidos por CNES',async()=>{
  const endpoint=await read('supabase/functions/manage-operations/index.ts');
  assert.match(endpoint,/message === 'CONTEXTUAL_OPERATION_REQUIRED'/);
  assert.match(endpoint,/cancelamento global é restrito ao Administrador/);
});
