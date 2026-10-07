import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const source = await read('supabase/functions/_shared/unit-minimum-scale.ts');
const code = stripTypeScriptTypes(source.replace("import { loadUnitCalendar } from './unit-calendar.ts';", 'const loadUnitCalendar = async () => ({employees: []});'));
const { scaleContexts, scaleCandidates } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const employee = (row, cnes, location = null, validity = {}) => ({row_id: row, id: 'same-person', cnes: {id: cnes, name: cnes, code: '001'}, internal_lotacao_id: location, lotacao: {name: location}, ...validity});

test('escala distingue atuações da mesma pessoa e lotações de um CNES compartilhado', () => {
  const roster = [employee('a', 'X'), employee('b', 'Y'), employee('c', 'X', 'Diretoria'), employee('d', 'X')];
  assert.equal(scaleContexts(roster).length, 3);
  assert.deepEqual(scaleCandidates(roster, 'X:', '2026-10-06').map(item => item.row_id), ['a', 'd']);
  assert.deepEqual(scaleCandidates(roster, 'X:Diretoria', '2026-10-06').map(item => item.row_id), ['c']);
});

test('sugestão nominal remove atuações ainda não iniciadas ou encerradas', () => {
  const roster = [employee('a', 'X', null, {valid_from: '2026-10-07'}), employee('b', 'X', null, {valid_until: '2026-10-05'}), employee('c', 'X', null, {valid_from: '2026-10-06', valid_until: '2026-10-06'})];
  assert.deepEqual(scaleCandidates(roster, 'X:', '2026-10-06').map(item => item.row_id), ['c']);
});

test('gravação atômica valida escopo, vigência, afastamento e versão e registra auditoria', async () => {
  const sql = await read('supabase/migrations/20261005170000_unit_request_workflow.sql');
  assert.match(sql, /unit_minimum_scale_days enable row level security/);
  assert.match(sql, /unit_minimum_scale_assignments enable row level security/);
  assert.match(sql, /target_lotacao_id is distinct from private\.current_context_internal_lotacao/);
  assert.match(sql, /BOND_UNIT_OUT_OF_CONTEXT/);
  assert.match(sql, /CONFIRMED_ABSENCE_ON_SCALE/);
  assert.match(sql, /SCALE_VERSION_CONFLICT/);
  assert.match(sql, /scale_date=target_date for update/);
  assert.match(sql, /unit_minimum_scale_updated/);
  assert.match(sql, /coalesce\(target_bond_unit_ids,'\{\}'\)/);
  assert.match(sql, /set_unit_minimum_scale[^;]+from public,anon,authenticated/);
});

test('interface envia atuação e versão e não oferece edição ao diretor', async () => {
  const app = await read('assets/app.js');
  assert.match(app, /bond_unit_ids: \[\.\.\.document/);
  assert.match(app, /data-version="\$\{exactDay\?\.version \|\| 0\}"/);
  assert.match(app, /value="\$\{employee\.row_id\}"/);
  assert.match(app, /if \(!\['rh', 'administrador'\]\.includes\(state\.profile\?\.role\)\) return;/);
});
