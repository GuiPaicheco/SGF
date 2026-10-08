// Ensaio online autorizado do bloco 01. Cria somente contas identificadas como TESTE;
// não envia e-mails, não recupera senhas existentes e não remove dados.
// Credenciais são fornecidas por ambiente e nunca incluídas no relatório.
import assert from 'node:assert/strict';
const url = 'https://ijhvbzomakbbxverqfqh.supabase.co';
const key = 'sb_publishable_9upWl4mCzsfuaPE1_gOFkw_9Im-Y4sJ';
const password = process.env.SGF_REHEARSAL_PASSWORD;
if (!password || !process.env.SGF_TEST_ADMIN_PASSWORD) throw new Error('Configure as credenciais do ensaio por ambiente.');
const prefix = process.env.SGF_REHEARSAL_PREFIX || 'sgf-bloco01-20261008';
const results = [];
async function call(fn, payload, token, context) {
  const r = await fetch(`${url}/functions/v1/${fn}`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: key, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(context ? { 'x-sgf-role': context.role, ...(context.bond_id ? { 'x-sgf-bond': context.bond_id } : {}), ...(context.cnes_unit_id ? { 'x-sgf-cnes': context.cnes_unit_id } : {}), ...(context.lotacao_id ? { 'x-sgf-lotacao': context.lotacao_id } : {}) } : {}) }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30000) });
  return { status: r.status, body: await r.json() };
}
async function success(fn, payload, token, context) { const r = await call(fn, payload, token, context); assert.ok(r.status >= 200 && r.status < 300, `${fn}/${payload.action}: ${r.status} ${r.body.error || ''}`); return r.body; }
function cpf(base) { let value = base; for (let n = 9; n <= 10; n++) value += ([...value].reduce((s, d, i) => s + Number(d) * (n + 1 - i), 0) * 10 % 11) % 10; return value; }
const admin = await success('access-auth', { action: 'login', identifier: 'admin', password: process.env.SGF_TEST_ADMIN_PASSWORD });
const adminContext = { role: 'administrador' };
const catalog = await success('access-auth', { action: 'registration-catalogs' });
const profileList = await success('manage-profiles', { action: 'list' }, admin.access_token, adminContext);
const existingManual = profileList.profiles.find(p => p.email === `${prefix}-manual@betim.mg.gov.br`);
if (profileList.profiles.some(p => p.email?.startsWith(prefix)) && process.env.SGF_REHEARSAL_RESUME !== '1') throw new Error('Fixtures já existentes. Use retomada explícita, sem recriar ou redefinir a senha.');
const a = catalog.cnesUnits.find(u => u.code === '2126028'), b = catalog.cnesUnits.find(u => u.code === '2126060');
const cargo = catalog.positions.find(p => p.name === 'Apoio Administrativo');
const location = profileList.locations.find(l => l.code === a.code);
assert.ok(a && b && cargo && location);
const team = catalog.teams.find(t => t.cnes_unit_id === a.id && t.type_code === 'esf');
assert.ok(team);
function bond(registration, both = false) { return { registration, cargo_id: cargo.id, employment_type: 'estatutario', weekly_hours: both ? 40 : 20, pole_cnes_unit_id: a.id, units: [{ cnes_unit_id: a.id, team_id: team.id, not_applicable: false, weekly_hours: 20 }, ...(both ? [{ cnes_unit_id: b.id, not_applicable: true, weekly_hours: 20 }] : [])] }; }
const manualCpf = cpf('918018801'), publicCpf = cpf('918018802');
const manualEmail = `${prefix}-manual@betim.mg.gov.br`, publicEmail = `${prefix}-publico@betim.mg.gov.br`;
const created = existingManual || await success('manage-profiles', { action: 'create', full_name: 'TESTE BLOCO 01 — Quatro perfis', cpf: manualCpf, birth_date: '1990-01-01', email: manualEmail, roles: ['servidor', 'diretor', 'rh', 'administrador'], scope_ids: [location.id], bonds: [bond(`${prefix}-M1`, true), bond(`${prefix}-M2`)] }, admin.access_token, adminContext);
results.push('cadastro administrativo: duas matrículas, três CNES/contextos e quatro perfis');
if (!existingManual) {
  assert.equal(created.temporary_password, '123456');
  const first = await success('access-auth', { action: 'login', identifier: manualCpf, password: '123456' });
  assert.equal(first.must_change_password, true);
  assert.equal((await call('manage-profiles', { action: 'list' }, first.access_token, adminContext)).status, 403);
  results.push('login por CPF e bloqueio operacional antes da troca obrigatória');
  await success('access-auth', { action: 'change-password', password }, first.access_token);
}
await new Promise(r => setTimeout(r, 3100));
const signed = await success('access-auth', { action: 'login', identifier: manualEmail.toUpperCase(), password });
assert.equal(signed.must_change_password, false);
const contexts = (await success('access-auth', { action: 'contexts' }, signed.access_token)).contexts;
assert.equal(contexts.filter(c => c.role === 'servidor').length, 3);
for (const role of ['servidor', 'diretor', 'rh', 'administrador']) assert.ok(contexts.some(c => c.role === role));
for (const c of contexts.filter(c => c.role !== 'servidor')) await success('manage-operations', { action: 'archives' }, signed.access_token, c);
const rh = contexts.find(c => c.role === 'rh');
assert.equal((await call('manage-profiles', { action: 'list' }, signed.access_token, rh)).status, 403);
assert.equal((await call('manage-operations', { action: 'archives' }, signed.access_token, { ...rh, cnes_unit_id: b.id })).status, 403);
results.push('quatro contextos reais, e-mail normalizado, escopo alheio e administração bloqueados para RH');
const publicPayload = { action: 'request-access', name: 'TESTE BLOCO 01 — Cadastro público', cpf: publicCpf, birthDate: '1991-01-01', email: publicEmail, bonds: [bond(`${prefix}-P1`, true)] };
const previousRequests = (await success('manage-access', { action: 'list' }, admin.access_token, adminContext)).requests;
if (!previousRequests.some(r => r.email === publicEmail && r.status === 'pendente')) await success('access-auth', publicPayload);
const requests = (await success('manage-access', { action: 'list' }, admin.access_token, adminContext)).requests;
const request = requests.find(r => r.email === publicEmail && r.status === 'pendente'); assert.ok(request);
const approval = await success('manage-access', { action: 'approve', id: request.id, roles: ['servidor'], scope_ids: [] }, admin.access_token, adminContext);
assert.equal(approval.temporary_password, '123456');
const publicFirst = await success('access-auth', { action: 'login', identifier: publicEmail, password: '123456' }); assert.equal(publicFirst.must_change_password, true);
await success('access-auth', { action: 'change-password', password }, publicFirst.access_token);
results.push('pedido público, aprovação, senha provisória e troca obrigatória reais');
await new Promise(r => setTimeout(r, 5100));
await success('access-auth', { ...publicPayload, bonds: [bond(`${prefix}-P2`)] });
const added = (await success('manage-access', { action: 'list' }, admin.access_token, adminContext)).requests.find(r => r.email === publicEmail && r.status === 'pendente'); assert.ok(added);
const approval2 = await success('manage-access', { action: 'approve', id: added.id, roles: ['servidor'], scope_ids: [] }, admin.access_token, adminContext);
assert.equal(approval2.existing, true); assert.equal(approval2.temporary_password, undefined);
const publicLogin = await success('access-auth', { action: 'login', identifier: publicCpf, password }); assert.equal(publicLogin.must_change_password, false);
assert.equal((await success('access-auth', { action: 'contexts' }, publicLogin.access_token)).contexts.length, 3);
results.push('acesso adicional mantém identidade/senha e acrescenta vínculo sem duplicação');
console.log(JSON.stringify({ results, fixtures: { manual: { id: created.id, email: manualEmail, cpf: manualCpf, contexts }, public: { email: publicEmail, cpf: publicCpf }, requestIds: [request.id, added.id] } }));
