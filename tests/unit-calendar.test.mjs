import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = readFileSync(new URL('../supabase/functions/_shared/unit-calendar.ts', import.meta.url), 'utf8');
const { projectUnitCalendar } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
const globalContext = { global: true, role: 'administrador' };
const employee = { id: 'person', full_name: 'Servidor exemplo', birth_date: '1990-01-01', active: true, cpf: 'NÃO EXPOR' };
const bond = { id: 'bond', registration: 'MAT-1', active: true, employee, position: { id: 'cargo', name: 'Educador físico' } };
const unit = (id, cnes, allocation = null) => ({ id, bond, active: true, cnes_unit_id: cnes, internal_lotacao_id: allocation,
  cnes: { id: cnes, code: cnes === 'X' ? '1111111' : '2222222', name: `UBS ${cnes}`, active: true } });
const mapping = (cnes, allocation, internal = false) => ({ cnes_unit_id: cnes, lotacao_id: allocation,
  location: { id: allocation, name: allocation, is_internal_allocation: internal } });
const period = { start_date: '2026-10-05', end_date: '2026-10-08', return_date: '2026-10-09' };
const request = { id: 'request', servidor_id: 'person', context_bond_id: 'bond', type: 'regulamentar', status: 'aprovada',
  periods: [period], responsibilities: [
    { bond_unit_id: 'uX', responsibility_date: '2026-10-05' },
    { bond_unit_id: 'uY', responsibility_date: '2026-10-06' },
  ], unit_reviews: [{ cnes_unit_id: 'X', lotacao_id: null, status: 'programada' }, { cnes_unit_id: 'Y', lotacao_id: null, status: 'aprovada' }] };
const project = (units, requests, mappings, context = globalContext) => projectUnitCalendar(units, requests, mappings, context, '2026-10-01', '2026-10-31');

test('cada unidade recebe somente seus dias, inclusive quando o estado geral ainda é aprovado', () => {
  const result = project([unit('uX', 'X'), unit('uY', 'Y')], [request], [mapping('X', 'UBS-X'), mapping('Y', 'UBS-Y')]);
  assert.equal(result.employees.length, 2);
  assert.deepEqual(result.requests.map(item => [item.row_id, item.assigned_dates, item.calendar_confirmed]), [
    ['uX', ['2026-10-05'], true], ['uY', ['2026-10-06'], false],
  ]);
  assert.equal(result.requests[0].global_status, 'aprovada');
  assert.ok(!JSON.stringify(result).includes('NÃO EXPOR'));
});

test('RH não recebe calendário ou nomes de outra unidade', () => {
  const result = project([unit('uX', 'X'), unit('uY', 'Y')], [request], [mapping('X', 'UBS-X'), mapping('Y', 'UBS-Y')], { global: false, role: 'rh', cnesUnitId: 'X', lotacaoId: 'UBS-X' });
  assert.deepEqual(result.employees.map(item => item.row_id), ['uX']);
  assert.deepEqual(result.requests.map(item => item.assigned_dates), [['2026-10-05']]);
});

test('diretorias com o mesmo CNES possuem revisões e calendários separados', () => {
  const sharedRequest = { ...request, responsibilities: [{ bond_unit_id: 'uA', responsibility_date: '2026-10-05' }, { bond_unit_id: 'uB', responsibility_date: '2026-10-06' }],
    unit_reviews: [{ cnes_unit_id: 'X', lotacao_id: 'A', status: 'programada' }, { cnes_unit_id: 'X', lotacao_id: 'B', status: 'aprovada' }] };
  const units = [unit('uA', 'X', 'A'), unit('uB', 'X', 'B')], maps = [mapping('X', 'A', true), mapping('X', 'B', true)];
  const rh = project(units, [sharedRequest], maps, { global: false, role: 'rh', cnesUnitId: 'X', lotacaoId: 'B' });
  assert.deepEqual(rh.employees.map(item => item.row_id), ['uB']);
  assert.equal(rh.requests[0].calendar_confirmed, false);
  assert.deepEqual(project(units, [sharedRequest], maps).requests.map(item => item.calendar_confirmed), [true, false]);
});

test('lotação interna não recebe atuação geral do mesmo CNES', () => {
  assert.equal(project([unit('uX', 'X')], [request], [mapping('X', 'A', true)], { global: false, cnesUnitId: 'X', lotacaoId: 'A' }).employees.length, 0);
});

test('pedido moderno sem responsabilidade correspondente não usa datas globais como fallback', () => {
  assert.equal(project([unit('uZ', 'X')], [request], [mapping('X', 'UBS-X')]).requests.length, 0);
});

test('solicitação cancelada e atuação fora da vigência não entram no calendário', () => {
  assert.equal(project([unit('uX', 'X')], [{ ...request, status: 'cancelada' }], [mapping('X', 'UBS-X')]).requests.length, 0);
  assert.equal(project([{ ...unit('uX', 'X'), valid_until: '2026-09-30' }], [request], [mapping('X', 'UBS-X')]).employees.length, 0);
});

test('pedidos legados aprovados são planejamento; somente programados são confirmados', () => {
  const legacy = { ...request, context_bond_id: null, responsibilities: [], unit_reviews: [], legacy_lotacao_id: 'UBS-X' };
  const units = [unit('uX', 'X')], maps = [mapping('X', 'UBS-X')];
  assert.equal(project(units, [legacy], maps).requests[0].calendar_confirmed, false);
  assert.equal(project(units, [{ ...legacy, status: 'programada' }], maps).requests[0].calendar_confirmed, true);
});
