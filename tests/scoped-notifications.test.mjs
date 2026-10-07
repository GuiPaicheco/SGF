import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const code = stripTypeScriptTypes(await read('supabase/functions/_shared/scoped-notifications.ts'));
const {applyNotificationContext, notificationInternalLocation} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const recorder = () => {
  const calls = [];
  const query = {eq: (...args) => {calls.push(['eq', ...args]); return query;},
    is: (...args) => {calls.push(['is', ...args]); return query;},
    or: (...args) => {calls.push(['or', ...args]); return query;}};
  return {calls, query};
};
const staff = {role: 'rh', global: false, cnesUnitId: 'X', lotacaoId: 'D1'};

test('avisos do RH são filtrados pelo destinatário, papel, CNES e lotação interna', () => {
  const {calls, query} = recorder();
  applyNotificationContext(query, 'actor', staff, 'D1');
  assert.deepEqual(calls, [['eq','recipient_id','actor'],['eq','recipient_role','rh'],['eq','context_cnes_unit_id','X'],['eq','context_lotacao_id','D1']]);
});

test('unidade sem subdivisão não recebe avisos de diretoria com o mesmo CNES', () => {
  const {calls, query} = recorder();
  applyNotificationContext(query, 'actor', {...staff, role: 'diretor'}, null);
  assert.ok(calls.some(call => call.join() === 'is,context_lotacao_id,'));
  assert.ok(calls.some(call => call.join() === 'eq,recipient_role,diretor'));
});

test('administrador vê o próprio canal global, não os avisos de outro destinatário', () => {
  const {calls, query} = recorder();
  applyNotificationContext(query, 'actor', {role:'administrador',global:true}, null);
  assert.deepEqual(calls, [['eq','recipient_id','actor'],['eq','recipient_role','administrador']]);
});

test('servidor recebe avisos do vínculo/contexto e avisos pessoais legados sem inferir escopo', () => {
  const {calls, query} = recorder();
  applyNotificationContext(query, 'owner', {role:'servidor',global:false,cnesUnitId:'X',bondId:'bond'}, null);
  assert.deepEqual(calls.slice(0,2), [['eq','recipient_id','owner'],['eq','recipient_role','servidor']]);
  assert.match(calls[2][1], /context_bond_id.eq.bond/);
  assert.match(calls[2][1], /and\(context_cnes_unit_id.is.null,context_bond_id.is.null,context_lotacao_id.is.null\)/);
  assert.throws(() => applyNotificationContext(query, 'owner', {role:'servidor',global:false,cnesUnitId:'X'}, null), /INVALID_ACCESS_CONTEXT/);
});

test('metadados institucionais determinam se a lotação é interna', async () => {
  const admin = internal => ({from: () => ({select: () => ({eq: () => ({single: async () => ({data:{id:'D1',is_internal_allocation:internal}})})})})});
  assert.equal(await notificationInternalLocation(admin(true),staff), 'D1');
  assert.equal(await notificationInternalLocation(admin(false),staff), null);
});

test('leitura e marcação usam a mesma restrição, sem acesso direto do navegador', async () => {
  const [operation, sql] = await Promise.all([read('supabase/functions/manage-operations/index.ts'),read('supabase/migrations/20261005170000_unit_request_workflow.sql')]);
  assert.equal((operation.match(/applyNotificationContext\(admin.from\('notifications'\)/g) || []).length, 2);
  assert.match(sql, /revoke all on public.notifications from authenticated/);
  assert.match(sql, /notifications_event_recipient_idx/);
  assert.match(sql, /granted.role::text in \('rh','diretor'\)/);
  assert.match(sql, /p.disabled_at is null/);
  assert.match(sql, /l.is_internal_allocation then l.id else null/);
  assert.match(sql, /request_unit_review_notify after insert or update of status/);
  assert.match(sql, /manual_conflict_notify after insert or update of status/);
});

test('feriado alterado considera datas antiga/nova, desativação e retorno sem mudar decisão', async () => {
  const sql = await read('supabase/migrations/20261005170000_unit_request_workflow.sql');
  const start = sql.lastIndexOf('create or replace function private.notify_calendar_change()');
  const holiday = sql.slice(start, sql.indexOf('revoke all on function private.notify_calendar_change()',start));
  assert.match(holiday, /previous_date := old.event_date/);
  assert.match(holiday, /previous_date between period.start_date and period.return_date/);
  assert.match(holiday, /desativado/);
  assert.match(holiday, /A decisão registrada não foi alterada/);
  assert.doesNotMatch(holiday, /update public.vacation_requests/);
});
