// Execução manual autenticada. A conta temporária deve ser removida após o teste.
import assert from 'node:assert/strict';
const url = 'https://ijhvbzomakbbxverqfqh.supabase.co';
const key = 'sb_publishable_9upWl4mCzsfuaPE1_gOFkw_9Im-Y4sJ';
if (!process.env.SGF_TEST_ADMIN_PASSWORD) throw new Error('Informe SGF_TEST_ADMIN_PASSWORD para executar.');
const pause = () => new Promise(resolve => setTimeout(resolve, 3200));
async function call(fn, payload, token) {
  const response = await fetch(`${url}/functions/v1/${fn}`, {
    method: 'POST', headers: { 'content-type': 'application/json', apikey: key,
      ...(token ? { Authorization: `Bearer ${token}`, 'x-sgf-role': 'administrador' } : {}) },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(20000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${fn}: ${response.status} ${body.error || body.message}`);
  return body;
}
let cpf = '919919919';
for (let length = 9; length <= 10; length++) {
  const sum = [...cpf].reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
  cpf += (sum * 10 % 11) % 10;
}
const marker = `SGF-VERIFY-${Date.now()}`;
await pause();
const admin = await call('access-auth', { action: 'login', identifier: 'admin', password: process.env.SGF_TEST_ADMIN_PASSWORD });
const catalog = await call('manage-access', { action: 'list' }, admin.access_token);
const location = catalog.locations.find(item => item.code);
assert.ok(location);
await call('access-auth', { action: 'request-access', name: marker, registration: marker, cpf,
  birthDate: '1990-01-01', email: `${marker.toLowerCase()}@betim.mg.gov.br`, position: 'Verificação temporária', unit: location.code, team: 'Não se aplica' });
const listed = await call('manage-access', { action: 'list' }, admin.access_token);
const request = listed.requests.find(item => item.full_name === marker);
assert.ok(request);
console.log(JSON.stringify({ cleanup_request_id: request.id, marker }));
const approved = await call('manage-access', { action: 'approve', id: request.id, roles: ['servidor'], scope_ids: [], lotacao_id: location.id }, admin.access_token);
assert.equal(approved.temporary_password, '123456');
await pause();
const login = await call('access-auth', { action: 'login', identifier: cpf, password: '123456' });
assert.equal(login.must_change_password, true);
const profiles = await call('manage-profiles', { action: 'list' }, admin.access_token);
const profile = profiles.profiles.find(item => item.full_name === marker);
assert.ok(profile);
console.log(JSON.stringify({ cleanup_profile_id: profile.id, approval: 'ok', first_login: 'ok', forced_change: true }));
await call('access-auth', { action: 'change-password', password: 'Temporaria!Verificacao987' }, login.access_token);
await pause();
const changed = await call('access-auth', { action: 'login', identifier: cpf, password: 'Temporaria!Verificacao987' });
assert.equal(changed.must_change_password, false);
const reset = await call('manage-profiles', { action: 'reset-password', profile_id: profile.id }, admin.access_token);
assert.equal(reset.temporary_password, '123456');
await pause();
const resetLogin = await call('access-auth', { action: 'login', identifier: cpf, password: '123456' });
assert.equal(resetLogin.must_change_password, true);
console.log(JSON.stringify({ password_change: 'ok', administrative_reset: 'ok', reset_login: 'ok' }));
