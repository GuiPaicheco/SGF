import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8');
function extract(start, end) { return source.slice(source.indexOf(start), source.indexOf(end)); }
test('lotação interna oculta em UBS e seleção preservada ao mudar tipo de equipe', () => {
  const group = { hidden: false };
  const elements = { '.access-cnes': { value: 'c' }, '.access-team-type': { value: 'esf' }, '.access-team': { value: 'team' }, '.access-allocation': { value: 'allocation', closest: () => group } };
  const context = vm.createContext({ state: { registrationCatalogs: { teams: [{ id: 'team', cnes_unit_id: 'c', type_code: 'esf' }], internalAllocations: [{ id: 'allocation', lotacao_cnes_units: [{ cnes_unit_id: 'c' }] }] } }, catalogOptions: () => '', esc: String });
  vm.runInContext(extract('  function updateAccessUnitOptions', '  let accessCatalogLoad'), context);
  context.updateAccessUnitOptions({ querySelector: key => elements[key] });
  assert.equal(elements['.access-allocation'].value, 'allocation');
  assert.equal(elements['.access-team'].value, 'team');
  assert.equal(group.hidden, false);
  elements['.access-cnes'].value = 'ubs';
  context.updateAccessUnitOptions({ querySelector: key => elements[key] });
  assert.equal(group.hidden, true);
  assert.equal(elements['.access-allocation'].value, '');
  assert.equal(elements['.access-team'].value, '');
});
test('Não se aplica não exige equipe', () => {
  const elements = { '.access-cnes': { value: 'ubs' }, '.access-team-type': { value: 'nao_se_aplica' }, '.access-team': { value: '' }, '.access-allocation': { value: '', closest: () => ({}) } };
  const context = vm.createContext({ state: { registrationCatalogs: { teams: [], internalAllocations: [] } }, catalogOptions: () => '', esc: String });
  vm.runInContext(extract('  function updateAccessUnitOptions', '  let accessCatalogLoad'), context);
  context.updateAccessUnitOptions({ querySelector: key => elements[key] });
  assert.equal(elements['.access-team'].disabled, true);
  assert.equal(elements['.access-team'].required, false);
});
test('resposta de perfis atrasada não grava dados após troca de contexto', async () => {
  let finish;
  const state = { profiles: [], activeContext: { role: 'administrador' }, session: {}, route: 'profiles' };
  const previous = state.activeContext;
  const context = vm.createContext({ state, captureView: () => () => state.activeContext === previous, fetch: () => new Promise(resolve => { finish = resolve; }), sessionHeaders: () => ({}), SUPABASE_URL: 'https://example.invalid' });
  vm.runInContext(extract('  async function loadProfiles()', '  async function profileRequest('), context);
  const pending = context.loadProfiles();
  state.activeContext = { role: 'rh' };
  finish({ ok: true, json: async () => ({ profiles: [{ id: 'private' }] }) });
  await pending;
  assert.equal(state.profiles.length, 0);
});
test('editor de acessos inclui Diretor e redistribuição não usa permissão administrativa', () => {
  assert.match(extract('  function renderProfileDetail()', '  async function saveProfileAccess'), /\['diretor', 'Diretor'\]/);
  assert.match(source, /'\[data-distribution-save\]':'distribution'/);
});
test('escolha de contexto revalida privilégios atuais antes de ativar', () => {
  const code = extract('  async function activateAccess', '  async function renderDashboard');
  assert.ok(code.indexOf('await loadSession()') < code.indexOf('state.activeContext = context'));
});

test('consulta moderna sem escopos não inventa acesso legado', async () => {
  const state = {};
  const context = vm.createContext({ state, client: { auth: { getSession: async () => ({ data: { session: { user: { id: 'p' }, access_token: 'fake' } } }) }, from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: { roles: ['rh'], id: 'p' } }) }) }, fetch: async () => ({ ok: true, json: async () => ({ contexts: [] }) }), sessionStorage: { getItem: () => null, removeItem() {}, setItem() {} }, sessionAction: { classList: { remove() {} } }, SUPABASE_URL: '', SUPABASE_KEY: '', console });
  vm.runInContext(extract('  async function loadSession()', '  async function loadRequests()'), context);
  await context.loadSession();
  assert.equal(state.accessContexts.length, 0);
  assert.equal(state.profile.role, null);
});

test('falha na consulta de escopos não mantém acesso salvo', async () => {
  const state = { profile: { role: 'rh' }, activeContext: { role: 'rh' }, accessContexts: [{ role: 'rh' }] };
  const context = vm.createContext({ state, client: { auth: { getSession: async () => ({ data: { session: { user: { id: 'p' }, access_token: 'fake' } } }) }, from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: { roles: ['rh'], id: 'p' } }) }) }, fetch: async () => ({ ok: false, json: async () => ({}) }), sessionStorage: { removeItem() {} }, SUPABASE_URL: '', SUPABASE_KEY: '', console });
  vm.runInContext(extract('  async function loadSession()', '  async function loadRequests()'), context);
  await assert.rejects(context.loadSession(), /validar os acessos/);
  assert.equal(state.profile, null);
  assert.equal(state.activeContext, null);
  assert.equal(state.accessContexts.length, 0);
});

test('conta desativada encerra sessão e elimina contexto salvo', async () => {
  const removed = [];
  const state = { activeContext: { role: 'rh' }, accessContexts: [{ role: 'rh' }] };
  const context = vm.createContext({ state, client: { auth: { getSession: async () => ({ data: { session: { user: { id: 'p' } } } }), signOut: async () => {} }, from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: { roles: ['rh'], disabled_at: '2026-10-08' } }) }) }, sessionStorage: { removeItem: key => removed.push(key) }, console });
  vm.runInContext(extract('  async function loadSession()', '  async function loadRequests()'), context);
  await context.loadSession();
  assert.equal(state.session, null); assert.equal(state.activeContext, null);
  assert.equal(state.accessContexts.length, 0);
  assert.deepEqual(removed.sort(), ['sgf-access-context', 'sgf-access-role']);
});

test('cabeçalho usa o perfil de gestão ativo, não o cargo de servidor', () => {
  assert.match(extract('  function renderHeaderUser()', '  function renderNavigation'), /state\.profile\.role === 'servidor'/);
});
