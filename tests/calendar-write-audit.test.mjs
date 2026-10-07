import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const edge=await readFile(new URL('../supabase/functions/manage-catalogs/index.ts',import.meta.url),'utf8');
const sql=await readFile(new URL('../supabase/migrations/20261005170000_unit_request_workflow.sql',import.meta.url),'utf8');
test('gravação de calendário encaminha identidade autenticada e valida data real',()=>{
  assert.match(edge,/scoped\.from\('calendar_events'\)\.upsert/);
  assert.match(edge,/toISOString\(\)\.slice\(0,10\) !== eventDate/);
  assert.match(edge,/name.length>200/);
});
test('consulta do RH isola lotação interna mesmo com CNES compartilhado',()=>{
  assert.match(edge,/assignments = location.is_internal_allocation \? assignments.eq\('internal_lotacao_id', context.lotacaoId\) : assignments.is\('internal_lotacao_id', null\)/);
  assert.match(edge,/assignments.in\('cnes_unit_id', cnesIds\)/);
  assert.match(edge,/if \(!cnesIds.length\) return \[\]/);
});
test('auditoria de calendário exige administrador ativo e registra antes/depois sem noop',()=>{
  const trigger=sql.slice(sql.indexOf('create function private.audit_calendar_event_change()'));
  assert.match(trigger,/new is not distinct from old/);
  assert.match(trigger,/AUDIT_CALENDAR_ADMIN_REQUIRED/);
  assert.match(trigger,/not p.must_change_password/);
  assert.match(trigger,/previous_value,new_value/);
  assert.match(trigger,/revoke all.*from public,anon,authenticated/);
});
