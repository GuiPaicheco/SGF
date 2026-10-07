import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../assets/access-policy.js', import.meta.url), 'utf8') + '\n' + readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8');

async function openQuick() {
  const listeners = {};
  const elements = new Map();
  const classList = { toggle() {}, add() {}, remove() {} };
  const app = { innerHTML: '', focus() {} };
  const progress = { style: { setProperty() {} } };
  const toast = { textContent: '', classList };
  const sessionAction = { classList, addEventListener() {} };
  const client = {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from(table) {
      assert.equal(table, 'calendar_events');
      return {
        select() { return this; },
        eq() { return this; },
        order: async () => ({ data: [{ event_date: '2026-10-12', type: 'feriado', name: 'Feriado' }], error: null }),
      };
    },
  };
  runInNewContext(source, {
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { supabase: { createClient: () => client }, location: { hash: '', search: '' }, scrollTo() {} },
    document: {
      querySelector(selector) {
        return ({ '#app': app, '#progress': progress, '#toast': toast, '#session-action': sessionAction })[selector]
          || elements.get(selector) || null;
      },
      addEventListener(name, listener) { listeners[name] = listener; },
    },
    setTimeout() {},
    console,
  });
  await new Promise(resolve => setImmediate(resolve));
  await listeners.click({ target: { closest: selector => selector === '[data-go]' ? { dataset: { go: 'quick' } } : null } });
  assert.match(app.innerHTML, /Simulação Rápida/);
  assert.doesNotMatch(app.innerHTML, /CPF|Matrícula|Data de nascimento/);
  return { app, elements, listeners, classList, toast };
}

function setFields(ui, values) {
  for (const [name, value] of Object.entries({ unit: 'uteis', mode: 'start', ...values })) ui.elements.set(`#quick-${name}`, { value, required: false });
  for (const name of ['days', 'hours', 'daily']) ui.elements.set(`#quick-${name}-group`, { classList: ui.classList });
}

test('simulação pública desconta feriado e ignora day-off', async () => {
  const ui = await openQuick();
  setFields(ui, { type: 'vacation', date: '2026-10-09', days: '3', hours: '', daily: '8' });
  await ui.listeners.submit({ target: { id: 'quick-form' }, preventDefault() {} });
  assert.match(ui.app.innerHTML, /14\/10\/2026/);
  assert.match(ui.app.innerHTML, /15\/10\/2026/);
  assert.doesNotMatch(ui.app.innerHTML, /legend-birthday|Enviar solicitação/);
});

test('dias corridos contam fim de semana e feriado dentro do período', async () => {
  const ui = await openQuick();
  setFields(ui, { type: 'vacation', unit: 'corridos', date: '2026-10-10', days: '3', hours: '', daily: '8' });
  await ui.listeners.submit({ target: { id: 'quick-form' }, preventDefault() {} });
  assert.match(ui.app.innerHTML, /Férias em dias corridos/);
  assert.match(ui.app.innerHTML, /Início<\/span><strong>10\/10\/2026/);
  assert.match(ui.app.innerHTML, /Último dia do período<\/span><strong>12\/10\/2026/);
  assert.match(ui.app.innerHTML, /Retorno ao trabalho<\/span><strong>13\/10\/2026/);
  assert.doesNotMatch(ui.app.innerHTML, /ajustada para o próximo dia útil/);
});

test('folga pública converte saldo em dias sem registrar pedido', async () => {
  const ui = await openQuick();
  setFields(ui, { type: 'bank', date: '2026-10-09', days: '', hours: '20', daily: '8' });
  await ui.listeners.submit({ target: { id: 'quick-form' }, preventDefault() {} });
  assert.match(ui.app.innerHTML, /16 h de 20 h informadas/);
  assert.match(ui.app.innerHTML, /4\.0 h/);
  assert.doesNotMatch(ui.app.innerHTML, /Enviar solicitação/);
});

test('data de retorno calcula o início com dias corridos', async () => {
  const ui = await openQuick();
  setFields(ui, { type: 'vacation', unit: 'corridos', mode: 'return', date: '2026-10-13', days: '3', hours: '', daily: '8' });
  await ui.listeners.submit({ target: { id: 'quick-form' }, preventDefault() {} });
  assert.match(ui.app.innerHTML, /Início<\/span><strong>10\/10\/2026/);
  assert.match(ui.app.innerHTML, /Último dia do período<\/span><strong>12\/10\/2026/);
  assert.match(ui.app.innerHTML, /Retorno ao trabalho<\/span><strong>13\/10\/2026/);
});

test('data de retorno calcula o início com dias úteis', async () => {
  const ui = await openQuick();
  setFields(ui, { type: 'vacation', mode: 'return', date: '2026-10-13', days: '3', hours: '', daily: '8' });
  await ui.listeners.submit({ target: { id: 'quick-form' }, preventDefault() {} });
  assert.match(ui.app.innerHTML, /Início<\/span><strong>07\/10\/2026/);
  assert.match(ui.app.innerHTML, /Último dia do período<\/span><strong>09\/10\/2026/);
  assert.match(ui.app.innerHTML, /Retorno ao trabalho<\/span><strong>13\/10\/2026/);
});

test('folga também permite dias corridos', async () => {
  const ui = await openQuick();
  setFields(ui, { type: 'bank', unit: 'corridos', date: '2026-10-10', days: '', hours: '20', daily: '8' });
  await ui.listeners.submit({ target: { id: 'quick-form' }, preventDefault() {} });
  assert.match(ui.app.innerHTML, /Dias corridos simulados<\/span><strong>2/);
  assert.match(ui.app.innerHTML, /Último dia do período<\/span><strong>11\/10\/2026/);
  assert.match(ui.app.innerHTML, /Retorno ao trabalho<\/span><strong>13\/10\/2026/);
});

test('retorno informado precisa ser dia útil', async () => {
  const ui = await openQuick();
  setFields(ui, { type: 'vacation', unit: 'corridos', mode: 'return', date: '2026-10-12', days: '3', hours: '', daily: '8' });
  await ui.listeners.submit({ target: { id: 'quick-form' }, preventDefault() {} });
  assert.match(ui.toast.textContent, /Escolha um dia útil/);
  assert.doesNotMatch(ui.app.innerHTML, /Resultado da simulação/);
});
