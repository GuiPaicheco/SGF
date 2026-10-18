import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../assets/access-policy.js', import.meta.url), 'utf8') + '\n' + readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8');

for (const schema of ['atual', 'múltiplos acessos']) test(`login administrativo sem CPF funciona no esquema ${schema}`, async () => {
  const listeners = {};
  const saved = new Map();
  const app = { innerHTML: '', focus() {} };
  const classList = { toggle() {}, add() {}, remove() {} };
  const session = { user: { id: 'admin-id' }, access_token: 'token', refresh_token: 'refresh' };
  let currentSession = null;
  let loginPayload;
  const clientFor = () => ({
    auth: {
      getSession: async () => ({ data: { session: currentSession } }),
      setSession: async () => { currentSession = session; return { data: { session }, error: null }; },
      stopAutoRefresh() {},
    },
    from(table) {
      if (table === 'profiles') return { selection: '', select(columns) { this.selection = columns; return this; }, eq() { return this; }, single: async function () {
        if (schema === 'atual' && this.selection.includes('roles')) return { data: null, error: { code: '42703', message: 'column profiles.roles does not exist' } };
        return { data: { id: 'admin-id', full_name: 'Admin', ...(schema === 'atual' ? { role: 'administrador' } : { roles: ['administrador'] }), must_change_password: false }, error: null };
      } };
      if (table === 'calendar_events') return { select() { return this; }, eq() { return this; }, order: async () => ({ data: [], error: null }) };
      if (table === 'vacation_requests') return { select() { return this; }, order: async () => ({ data: [], error: null }) };
      throw new Error(`Unexpected table ${table}`);
    },
  });
  const inputs = {
    '#access-identifier': { value: 'admin' },
    '#access-password': { value: 'senha-segura' },
  };
  runInNewContext(source, {
    SGFRhCalendar: { mount: async ({app,admin}) => { assert.equal(admin,true); app.innerHTML = "Calendário RH"; } },
    URLSearchParams,
    window: { supabase: { createClient: clientFor }, location: { hash: '', search: '' }, scrollTo() {} },
    sessionStorage: { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) },
    document: {
      querySelector: selector => ({ '#app': app, '#progress': { style: { setProperty() {} } }, '#toast': { classList }, '#session-action': { classList, addEventListener() {} }, ...inputs })[selector] || null,
      addEventListener: (name, callback) => { listeners[name] = callback; },
    },
    fetch: async (_url, options) => {
      const payload = JSON.parse(options.body);
      if (payload.action === 'archives') return { ok: true, json: async () => ({ request_ids: [] }) };
      if (payload.action === 'contexts') return { ok: true, json: async () => ({ contexts: [{ role: 'administrador', global: true }] }) };
      loginPayload = payload;
      return { ok: true, json: async () => ({ access_token: 'token', refresh_token: 'refresh', roles: ['administrador'], must_change_password: false }) };
    },
    setTimeout() {}, console,
  });
  await new Promise(resolve => setImmediate(resolve));
  await listeners.click({ target: { closest: selector => selector === '[data-go]' ? { dataset: { go: 'login' } } : null } });
  assert.match(app.innerHTML, /CPF ou e-mail/);
  const button = { disabled: false, textContent: 'Entrar no SGF' };
  await listeners.submit({ target: { id: 'login-form' }, submitter: button, preventDefault() {} });
  assert.deepEqual(loginPayload, { action: 'login', identifier: 'admin', password: 'senha-segura' });
  assert.equal(saved.get('sgf-access-role'), 'administrador');
  await new Promise(resolve => setImmediate(resolve));
  assert.match(app.innerHTML, /Calendário RH/);
});
