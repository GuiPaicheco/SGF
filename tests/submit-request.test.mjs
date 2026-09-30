import assert from 'node:assert/strict';
import test from 'node:test';
import { requestedBankHours, validSubmissionPeriods } from '../supabase/functions/submit-request/validate.ts';

const period = { start_date: '2026-10-01', end_date: '2026-10-05', return_date: '2026-10-06', days: 3 };

test('aceita períodos coerentes e saldo suficiente', () => {
  assert.equal(validSubmissionPeriods([period], 'regulamentar'), true);
  assert.equal(validSubmissionPeriods([period], 'banco_horas', 8, 24), true);
});

test('rejeita datas impossíveis, invertidas e períodos sobrepostos', () => {
  assert.equal(validSubmissionPeriods([{ ...period, start_date: '2026-02-30' }], 'regulamentar'), false);
  assert.equal(validSubmissionPeriods([{ ...period, return_date: '2026-10-05' }], 'regulamentar'), false);
  assert.equal(validSubmissionPeriods([period, { ...period, start_date: '2026-10-05' }], 'regulamentar'), false);
  assert.equal(validSubmissionPeriods([period, { ...period, start_date: '2026-10-05', end_date: '2026-10-08', return_date: '2026-10-09' }], 'regulamentar'), false);
});

test('rejeita quantidade de dias incompatível e saldo insuficiente', () => {
  assert.equal(validSubmissionPeriods([{ ...period, days: 6 }], 'regulamentar'), false);
  assert.equal(validSubmissionPeriods([period], 'banco_horas', 8, 23.5), false);
  assert.equal(validSubmissionPeriods([period], 'banco_horas', 0, 24), false);
});

test('consome somente as horas dos dias pedidos, não todo o saldo disponível', () => {
  const requested = requestedBankHours([{ ...period, days: 2 }], 8);
  assert.equal(requested, 16);
  assert.equal(validSubmissionPeriods([{ ...period, days: 2 }], 'banco_horas', 8, 20), true);
});
