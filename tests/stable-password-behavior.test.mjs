import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

async function runAuth(payload, { deliveryError = null, signedIn = true, passwordError = null } = {}) {
  let handler;
  const updates = [];
  const admin = {
    rpc: async action => {if(action==='complete_password_change') updates.push({must_change_password:false}); return { data: { allowed: true }, error: null };},
    from() {
      const query = {
        select() { return this; }, eq() { return this; },
        maybeSingle: async () => ({ data: { id: 'user', role: 'servidor' } }),
        single: async () => ({ data: { roles: ['servidor'], disabled_at: null } }),
        update(value) { updates.push(value); return this; },
        then(resolve) { return Promise.resolve({ error: null }).then(resolve); },
      };
      return query;
    },
    auth: {
      getUser: async () => ({ data: { user: signedIn ? { id: 'user' } : null }, error: null }),
      admin: {
        getUserById: async () => ({ data: { user: { email: 'teste@betim.mg.gov.br' } } }),
        updateUserById: async (_id, value) => { updates.push(value); return { error: passwordError }; },
      },
    },
  };
  const redirectSource = readFileSync(new URL('../supabase/functions/_shared/recovery-redirect.ts', import.meta.url), 'utf8').replace('export function', 'function');
  const source = redirectSource + '\n' + readFileSync(new URL('../supabase/functions/access-auth/index.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
  let clients = 0;
  runInNewContext(stripTypeScriptTypes(source), {
    catalog: [], normalizeUnitLogin: value=>value,
    createClient: () => clients++ === 0 ? admin : { auth: { resetPasswordForEmail: async () => ({ error: deliveryError }) } },
    Deno: { env: { get: () => 'configured' }, serve: fn => { handler = fn; } },
    Request, Response, URL, crypto: globalThis.crypto, TextEncoder, console: { error() {} },
  });
  const response = await handler(new Request('https://example.test', {
    method: 'POST', headers: { authorization: 'Bearer session', 'content-type': 'application/json' }, body: JSON.stringify(payload),
  }));
  return { status: response.status, body: await response.json(), updates };
}

test('senha provisória não pode liberar a conta como senha definitiva', async () => {
  const result = await runAuth({ action: 'change-password', password: '123456' });
  assert.equal(result.status, 400);
  assert.equal(result.updates.length, 0);
});

test('troca autenticada salva senha pessoal e remove obrigatoriedade', async () => {
  const result = await runAuth({ action: 'change-password', password: 'Pessoal!987' });
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(result.updates)), [{ password: 'Pessoal!987' }, { must_change_password: false }]);
});

test('troca de senha rejeita sessão inválida', async () => {
  const result = await runAuth({ action: 'change-password', password: 'Pessoal!987' }, { signedIn: false });
  assert.equal(result.status, 401);
  assert.equal(result.updates.length, 0);
});

test('senha pessoal curta é rejeitada antes de alterar Auth ou perfil', async () => {
  for (const password of ['abcd', 'abcde']) {
    const result = await runAuth({ action: 'change-password', password });
    assert.equal(result.status, 400);
    assert.match(result.body.error, /6 e 72/);
    assert.equal(result.updates.length, 0);
  }
});

test('requisitos de senha e repetição retornam orientação sem liberar perfil', async () => {
  for (const code of ['weak_password', 'same_password']) {
    const result = await runAuth({ action: 'change-password', password: 'TestOnly!987' }, { passwordError: { code } });
    assert.equal(result.status, 400);
    assert.equal(result.updates.length, 1);
    assert.ok(!result.body.error.includes('concluir a operação'));
  }
});

test('recuperação reporta falha de entrega em vez de sucesso', async () => {
  const result = await runAuth({ action: 'recover', identifier: 'teste' }, { deliveryError: { code: 'smtp_failure' } });
  assert.equal(result.status, 503);
  assert.match(result.body.error, /Administrador ou à TI/);
});
