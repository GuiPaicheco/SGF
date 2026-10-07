import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const sandbox = {};
vm.runInNewContext(await read('assets/scale-conflicts.js'), sandbox);
const { matches, conflictsFor } = sandbox.SGFScaleConflicts;
const person = (id, fields = {}) => ({id, cnes: {id: 'X'}, internal_lotacao_id: null, cargo: {id: 'p'}, funcao: {id: 'f'}, team_name: 'eMulti 001', ...fields});
const request = (employee, row = employee.id) => ({row_id: row, servidor: employee});

test('critério cargo, equipe, função e combinação não equivale a qualquer simultaneidade', () => {
  const a = person('a'), b = person('b', {cargo: {id: 'q'}});
  assert.equal(matches(a, b, 'position'), false);
  assert.equal(matches(a, b, 'team'), true);
  assert.equal(matches(a, b, 'position_team'), false);
  assert.equal(matches(a, b, 'function'), true);
  assert.equal(matches(a, b, 'unit'), true);
  assert.equal(matches(a, person('c'), 'position_team'), true);
});

test('CNES e lotações internas são limites do conflito mesmo para administrador global', () => {
  const a = person('a');
  assert.equal(matches(a, person('b', {cnes: {id: 'Y'}}), 'unit'), false);
  assert.equal(matches(a, person('b', {internal_lotacao_id: 'Diretoria'}), 'unit'), false);
  assert.equal(matches(person('a', {internal_lotacao_id: 'D1'}), person('b', {internal_lotacao_id: 'D2'}), 'position'), false);
});

test('campos ausentes e Não se aplica não criam conflitos por equipe ou função', () => {
  assert.equal(matches(person('a', {team_name: 'Não se aplica'}), person('b', {team_name: 'Não se aplica'}), 'team'), false);
  assert.equal(matches(person('a', {funcao: null}), person('b', {funcao: null}), 'function'), false);
  assert.equal(matches(person('a', {cargo: null}), person('b', {cargo: null}), 'position'), false);
});

test('mesma pessoa em vários vínculos não conflita consigo mesma', () => {
  assert.equal(matches(person('a'), person('a'), 'unit'), false);
});

test('alerta usa apenas pedidos do recorte e dias efetivamente afastados e deduplica atuação', () => {
  const a = request(person('a')), b = request(person('b')), c = request(person('c'));
  const away = (item, day) => day === '2026-10-06' && item.servidor.id !== 'c';
  assert.equal(conflictsFor(a, '2026-10-06', [a, b, b, c], 'position', away).length, 1);
  assert.equal(conflictsFor(a, '2026-10-07', [a, b], 'position', away).length, 0);
  assert.equal(conflictsFor(a, '2026-10-06', [a], 'position', away).length, 0);
});

test('frontend carrega o motor antes do app e exibe equipe, critério e explicação dos alertas', async () => {
  const [html, app] = await Promise.all([read('index.html'), read('assets/app.js')]);
  assert.ok(html.indexOf('assets/scale-conflicts.js') < html.indexOf('assets/app.js'));
  assert.match(app, /SGFScaleConflicts\.conflictsFor/);
  assert.match(app, /id="scale-team"/);
  assert.match(app, /id="scale-conflict-criterion"/);
  assert.match(app, /não impedimentos legais ou recusas automáticas/);
  assert.match(app, /simultâneo com/);
});
