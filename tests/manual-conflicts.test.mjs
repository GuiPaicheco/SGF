import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const sql = await read('supabase/migrations/20261005170000_unit_request_workflow.sql');
const source = stripTypeScriptTypes(await read('supabase/functions/_shared/manual-conflicts.ts'));
const {conflictInScope, loadManualConflicts} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const sandbox = {};
vm.runInNewContext(await read('assets/scale-conflicts.js'), sandbox);
const {manualFor} = sandbox.SGFScaleConflicts;
const context = {global: false, cnesUnitId: 'X', lotacaoId: 'D1'};
const row = {status: 'active', cnes_unit_id: 'X', lotacao_id: 'D1', bond_unit_id: 'u1', start_date: '2026-10-06', end_date: '2026-10-08'};
const employee = {row_id: 'u1', cnes: {id: 'X'}, internal_lotacao_id: 'D1'};

test('conflito manual não atravessa CNES ou lotação interna', () => {
  assert.equal(conflictInScope(row, context, 'D1'), true);
  assert.equal(conflictInScope({...row, cnes_unit_id: 'Y'}, context, 'D1'), false);
  assert.equal(conflictInScope({...row, lotacao_id: 'D2'}, context, 'D1'), false);
  assert.equal(conflictInScope({...row, lotacao_id: null}, context, 'D1'), false);
  assert.equal(conflictInScope(row, {global: true}, null), true);
});

test('somente conflitos ativos afetam o calendário, com limites inclusivos do período', () => {
  assert.equal(manualFor(employee, '2026-10-06', [row]).length, 1);
  assert.equal(manualFor(employee, '2026-10-08', [row]).length, 1);
  assert.equal(manualFor(employee, '2026-10-09', [row]).length, 0);
  assert.equal(manualFor(employee, '2026-10-07', [{...row, status: 'resolved'}, {...row, status: 'cancelled'}]).length, 0);
});

test('conflito pode referir-se à unidade toda ou a uma atuação específica', () => {
  assert.equal(manualFor({...employee, row_id: 'u2'}, '2026-10-07', [row]).length, 0);
  assert.equal(manualFor({...employee, row_id: 'u2'}, '2026-10-07', [{...row, bond_unit_id: null}]).length, 1);
  assert.equal(manualFor({...employee, cnes: {id: 'Y'}}, '2026-10-07', [{...row, bond_unit_id: null}]).length, 0);
});

test('leitura aplica filtro de lotação antes de retornar registros e não oculta encerrados', async () => {
  const calls = [];
  const query = {select: () => query, eq: (...args) => {calls.push(['eq', ...args]); return query;},
    is: (...args) => {calls.push(['is', ...args]); return query;}, lte: () => query, gte: () => query,
    order: () => query, single: async () => ({data: {id: 'D1', is_internal_allocation: true}}),
    range: async () => ({data: [row, {...row, lotacao_id: 'D2'}, {...row, status: 'resolved'}]})};
  const result = await loadManualConflicts({from: () => query}, context, '2026-10');
  assert.equal(result.conflicts.length, 2);
  assert.ok(calls.some(args => args.join() === 'eq,lotacao_id,D1'));
  assert.ok(result.conflicts.some(item => item.status === 'resolved'));
});

test('gravação protege escopo, justificativa, período, atuação, concorrência e histórico', () => {
  const manual = sql.slice(sql.indexOf('create table public.manual_calendar_conflicts'), sql.indexOf('revoke all on function public.manage_manual_calendar_conflict'));
  assert.match(manual, /enable row level security/);
  assert.match(manual, /revoke all on public.manual_calendar_conflicts from public,anon,authenticated/);
  assert.match(manual, /grant select,insert,update on/);
  assert.doesNotMatch(manual, /delete from/);
  assert.match(manual, /char_length\(btrim\(target_reason\)\) not between 3 and 2000/);
  assert.match(manual, /target_end<target_start/);
  assert.match(manual, /scope_lotacao is distinct from private.current_context_internal_lotacao/);
  assert.match(manual, /CONFLICT_VERSION_CONFLICT/);
  assert.match(manual, /CONFLICT_ALREADY_CLOSED/);
  assert.match(manual, /CONFLICT_ALREADY_CREATED/);
  assert.match(manual, /BOND_UNIT_OUT_OF_CONTEXT/);
  assert.match(manual, /to_jsonb\(previous\)/);
  assert.match(manual, /'manual_conflict_'\|\|target_action/);
  assert.doesNotMatch(manual, /update public.vacation_requests/);
});

test('interface exige justificativa na criação e no encerramento e escapa os textos', async () => {
  const app = await read('assets/app.js');
  assert.match(app, /id="manual-conflict-form"/);
  assert.match(app, /name="closure-reason" minlength="3" maxlength="2000" required/);
  assert.match(app, /esc\(row.justification\)/);
  assert.match(app, /esc\(row.closure_reason\)/);
  assert.match(app, /data-conflict-id="\$\{crypto.randomUUID\(\)\}"/);
  assert.match(app, /event.target.matches\?\.\('\.manual-conflict-close-form'\)/);
});
