import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=name=>readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');
test('RLS de gestão recusa papel nulo, contexto incompleto e cadastros desativados',async()=>{
  const sql=await read('20261005150000_context_aware_access.sql');
  assert.match(sql,/selected_role is null or selected_role not in/);
  assert.match(sql,/if selected_cnes is null then return false/);
  assert.match(sql,/context_location.active/);assert.match(sql,/cnes.active/);assert.match(sql,/employee.active/);
});
test('RLS do pedido usa revisão própria do escopo, não somente acesso à pessoa',async()=>{
  const sql=await read('20261005170000_unit_request_workflow.sql');
  const fn=sql.slice(sql.indexOf('create function private.can_read_contextual_request'));
  assert.match(fn,/selected_role is null then return false/);
  assert.match(fn,/review.cnes_unit_id=private.current_context_cnes/);
  assert.match(fn,/review.lotacao_id is not distinct from/);
  assert.match(fn,/request_row.context_bond_id=selected_bond/);
  assert.match(fn,/using \(private.can_read_contextual_request\(id\)\)/);
});
test('navegador não grava pedidos ou períodos diretamente',async()=>{
  const sql=await read('20261005170000_unit_request_workflow.sql');
  assert.match(sql,/revoke insert,update,delete on public.vacation_requests,public.request_periods from authenticated/);
});
