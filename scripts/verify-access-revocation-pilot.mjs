// Ensaio final do bloco 01: revoga somente os privilégios da fixture explicitamente identificada.
// SGF_REHEARSAL_CLEANUP=1 desativa as duas contas técnicas; preserva o histórico de auditoria.
import assert from 'node:assert/strict';
const url = 'https://ijhvbzomakbbxverqfqh.supabase.co';
const key = 'sb_publishable_9upWl4mCzsfuaPE1_gOFkw_9Im-Y4sJ';
if (!process.env.SGF_TEST_ADMIN_PASSWORD || !process.env.SGF_REHEARSAL_PASSWORD) throw new Error('Credenciais de ensaio ausentes.');
const fixtures = [
  { id: 'ffd4a4d7-1a76-46fc-999f-b80f4b04f73d', email: 'sgf-bloco01-20261008-manual@betim.mg.gov.br', cpf: '91801880107' },
  { id: '97085491-6d6c-4100-89a0-814b0e8202a9', email: 'sgf-bloco01-20261008-publico@betim.mg.gov.br' },
];
async function call(fn, payload, token, context) {
  const r = await fetch(`${url}/functions/v1/${fn}`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: key, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(context ? { 'x-sgf-role': context.role, ...(context.bond_id ? { 'x-sgf-bond': context.bond_id } : {}), ...(context.cnes_unit_id ? { 'x-sgf-cnes': context.cnes_unit_id } : {}), ...(context.lotacao_id ? { 'x-sgf-lotacao': context.lotacao_id } : {}) } : {}) }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30000) });
  return { status: r.status, body: await r.json() };
}
function ok(r) { assert.ok(r.status >= 200 && r.status < 300, `HTTP ${r.status}: ${r.body.error || ''}`); return r.body; }
const admin = ok(await call('access-auth', { action: 'login', identifier: 'admin', password: process.env.SGF_TEST_ADMIN_PASSWORD }));
const adminContext = { role: 'administrador' };
const list = ok(await call('manage-profiles', { action: 'list' }, admin.access_token, adminContext));
for (const f of fixtures) {
  const p = list.profiles.find(p => p.id === f.id);
  assert.equal(p?.email, f.email); assert.ok(p.full_name.startsWith('TESTE BLOCO 01'));
}
const session = ok(await call('access-auth', { action: 'login', identifier: fixtures[0].email, password: process.env.SGF_REHEARSAL_PASSWORD }));
const contexts = ok(await call('access-auth', { action: 'contexts' }, session.access_token)).contexts;
const management = contexts.find(c => c.role === 'rh');
if (!process.env.SGF_REHEARSAL_CLEANUP) {
  assert.ok(management);
  ok(await call('manage-profiles', { action: 'update', profile_id: fixtures[0].id, cpf: fixtures[0].cpf, roles: ['servidor'], scope_ids: [], lotacao_id: management.lotacao_id }, admin.access_token, adminContext));
  assert.equal((await call('manage-operations', { action: 'archives' }, session.access_token, management)).status, 403);
  const after = ok(await call('access-auth', { action: 'contexts' }, session.access_token)).contexts;
  assert.ok(after.length === 3 && after.every(c => c.role === 'servidor'));
  assert.equal((await call('manage-profiles', { action: 'list' }, session.access_token, adminContext)).status, 403);
  console.log('PASS: JWT já emitido perde RH/Administrador imediatamente; apenas três contextos de servidor permanecem.');
} else {
  const employee = contexts.find(c => c.role === 'servidor'); assert.ok(employee);
  for (const f of fixtures) ok(await call('manage-profiles', { action: 'deactivate', profile_id: f.id }, admin.access_token, adminContext));
  assert.ok((await call('access-auth', { action: 'contexts' }, session.access_token)).status >= 400);
  assert.ok((await call('manage-operations', { action: 'archives' }, session.access_token, employee)).status >= 400);
  await new Promise(r => setTimeout(r, 3100));
  assert.ok((await call('access-auth', { action: 'login', identifier: fixtures[0].email, password: process.env.SGF_REHEARSAL_PASSWORD })).status >= 400);
  console.log('PASS: duas fixtures desativadas; sessão emitida e novo login bloqueados. Nenhuma conta real alterada.');
}
