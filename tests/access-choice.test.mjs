import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8');

test('um CPF com três acessos escolhe a área e troca o contexto das consultas', async () => {
  const listeners = {};
  const headers = [];
  let roleFetch;
  let clientsCreated = 0;
  const saved = new Map();
  const session = { user: { id: 'user-1' }, access_token: 'access', refresh_token: 'refresh' };
  const app = { innerHTML: '', focus() {} };
  const classList = { toggle() {}, add() {}, remove() {} };
  const clientFor = options => {
    clientsCreated++;
    roleFetch = options.global.fetch;
    return {
      auth: {
        getSession: async () => ({ data: { session } }),
        setSession: async () => ({ data: { session }, error: null }),
        stopAutoRefresh() {},
      },
      from(table) {
        if (table === 'profiles') return { select() { return this; }, eq() { return this; }, single: async () => ({ data: { id: 'user-1', full_name: 'Maria Silva', roles: ['servidor', 'rh', 'administrador'], must_change_password: false } }) };
        if (table === 'calendar_events') return { select() { return this; }, eq() { return this; }, order: async () => ({ data: [], error: null }) };
        if (table === 'vacation_requests') return { select() { return this; }, order: async () => ({ data: [], error: null }) };
        throw new Error(`Unexpected table ${table}`);
      },
    };
  };
  runInNewContext(source, {
    window: { supabase: { createClient: (_url, _key, options) => clientFor(options) }, location: { hash: '', search: '' }, scrollTo() {} },
    sessionStorage: { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) },
    document: {
      querySelector: selector => ({ '#app': app, '#progress': { style: { setProperty() {} } }, '#toast': { classList }, '#session-action': { classList, addEventListener() {} } })[selector] || null,
      addEventListener: (name, callback) => { listeners[name] = callback; },
    },
    setTimeout() {}, console,
    Headers,
    fetch: async (_input, init) => { if (init.headers instanceof Headers) headers.push(init.headers.get('x-sgf-role')); return { ok: true, json: async () => ({ request_ids: [] }) }; },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(app.innerHTML, /Escolha seu acesso/);
  for (const role of ['Servidor', 'RH', 'Administrador']) assert.match(app.innerHTML, new RegExp(role));
  await listeners.click({ target: { closest: selector => selector === '[data-access-role]' ? { dataset: { accessRole: 'servidor' } } : null } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saved.get('sgf-access-role'), 'servidor');
  await roleFetch('/rest/v1/vacation_requests');
  assert.equal(headers.at(-1), 'servidor');
  assert.match(app.innerHTML, /Meus pedidos/);
  await listeners.click({ target: { closest: selector => selector === '[data-go]' ? { dataset: { go: 'choose-access' } } : null } });
  await listeners.click({ target: { closest: selector => selector === '[data-access-role]' ? { dataset: { accessRole: 'rh' } } : null } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saved.get('sgf-access-role'), 'rh');
  await roleFetch('/rest/v1/vacation_requests');
  assert.equal(headers.at(-1), 'rh');
  assert.equal(clientsCreated, 1, 'a troca de acesso preserva a sessão do cliente');
  assert.match(app.innerHTML, /Solicitações/);
  await listeners.click({ target: { closest: selector => selector === '[data-go]' ? { dataset: { go: 'choose-access' } } : null } });
  await listeners.click({ target: { closest: selector => selector === '[data-access-role]' ? { dataset: { accessRole: 'administrador' } } : null } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saved.get('sgf-access-role'), 'administrador');
  await roleFetch('/rest/v1/vacation_requests');
  assert.equal(headers.at(-1), 'administrador');
  assert.match(app.innerHTML, /Painel administrativo/);
});
