import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8');
const initialize = source.slice(source.indexOf('  async function initializeAuthSession()'), source.indexOf('  async function loadSession()'));
function harness(hash, auth) {
  const calls = [];
  const state = { session: null, profile: null, recoveryError: '' };
  const callbackParams = new URLSearchParams(hash);
  const context = vm.createContext({ state, callbackParams, passwordCallback: ['recovery', 'invite'].includes(callbackParams.get('type')), callbackError: callbackParams.has('error'), client: { auth }, sessionStorage: { removeItem: key => calls.push(key) }, history: { replaceState: (...args) => calls.push(args) }, document: { title: 'SGF' }, window: { location: { pathname: '/' } }, loadSession: async () => calls.push('loadSession') });
  vm.runInContext(initialize, context);
  return { context, state, calls, run: () => context.initializeAuthSession() };
}
test('persists recovery session before loading profile and strips URL tokens', async () => {
  let resolveSession;
  const session = { user: { id: 'test-only' } };
  const h = harness('type=recovery&access_token=fake-access&refresh_token=fake-refresh', { setSession: tokens => { assert.equal(tokens.access_token, 'fake-access'); return new Promise(resolve => { resolveSession = resolve; }); } });
  const pending = h.run();
  assert.equal(h.calls.length, 0);
  resolveSession({ data: { session }, error: null });
  await pending;
  assert.equal(h.state.session, session);
  assert.equal(h.calls.at(-1), 'loadSession');
  assert.equal(h.context.callbackParams.has('access_token'), false);
  assert.equal(JSON.stringify(h.calls.at(-2)), JSON.stringify([{}, 'SGF', '/']));
});
test('incomplete callback does not reuse stored account', async () => {
  const h = harness('type=recovery&access_token=fake', { setSession: () => assert.fail('not allowed') });
  await h.run();
  assert.equal(h.state.session, null);
  assert.match(h.state.recoveryError, /incompleto/);
  assert.ok(!h.calls.includes('loadSession'));
});
test('provider error rejects callback without exposing error description', async () => {
  const h = harness('error=access_denied&error_description=SECRET', {});
  await h.run();
  assert.ok(h.state.recoveryError);
  assert.ok(!h.state.recoveryError.includes('SECRET'));
  assert.ok(!h.calls.includes('loadSession'));
});
test('failed or thrown session validation does not render a usable recovery session', async () => {
  for (const setSession of [async () => ({ data: {}, error: { message: 'SECRET' } }), async () => { throw new Error('SECRET'); }]) {
    const h = harness('type=recovery&access_token=fake&refresh_token=fake', { setSession });
    await h.run();
    assert.equal(h.state.session, null);
    assert.ok(h.state.recoveryError && !h.state.recoveryError.includes('SECRET'));
    assert.ok(!h.calls.includes('loadSession'));
  }
});
test('ordinary startup keeps existing session flow', async () => {
  const h = harness('', {});
  await h.run();
  assert.deepEqual(h.calls, ['loadSession']);
});
test('Auth client is constructed after state and callback bootstrap replaces implicit race', () => {
  assert.ok(source.indexOf('const state =') < source.indexOf('client = window.supabase'));
  assert.match(source, /detectSessionInUrl: !\(passwordCallback \|\| callbackError\)/);
  assert.match(source, /Promise\.allSettled\(\[initializeAuthSession\(\)/);
});
