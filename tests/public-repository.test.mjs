import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPublicFile } from '../scripts/public-repository-policy.mjs';

test('bloqueia arquivos privados, mas permite modelo e migrations', () => {
  for (const name of ['.env', '.env.local', '.sgf-backups/snapshot.json', '.vscode/mcp.json', 'output/export.xlsx', 'db.dump', 'secret.pem']) {
    assert.ok(inspectPublicFile(name).length, name);
  }
  for (const name of ['.env.example', 'supabase/migrations/20260101000000_initial.sql', 'docs/README.md']) {
    assert.deepEqual(inspectPublicFile(name), []);
  }
});

test('diferencia chaves publicáveis e palavras de configuração de segredos', () => {
  assert.deepEqual(inspectPublicFile('example.js', "const key='sb_publishable_example'; // SUPABASE_SERVICE_ROLE_KEY fica no servidor"), []);
  const secret = 'sb_secret_' + 'x'.repeat(25);
  const issues = inspectPublicFile('example.js', `// exemplo\nconst key='${secret}';`);
  assert.equal(issues[0].line, 2);
  assert.equal(issues[0].kind, 'segredo Supabase');
  assert.ok(!JSON.stringify(issues).includes(secret));
});

test('identifica JWT com papel privilegiado sem divulgar seu conteúdo', () => {
  const jwt = (role) => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.assinaturaFicticia';
  assert.equal(inspectPublicFile('a.js', jwt('service_role'))[0].kind, 'JWT privilegiado Supabase');
  assert.deepEqual(inspectPublicFile('a.js', jwt('anon')), []);
});

test('bloqueia URL autenticada e chave privada sem imprimir o segredo', () => {
  const url = 'postgresql://' + 'usuario:segredo@localhost/banco';
  assert.equal(inspectPublicFile('config.js', url)[0].kind, 'credencial em URL');
  assert.equal(inspectPublicFile('config.js', '-----BEGIN ' + 'PRIVATE KEY-----')[0].kind, 'chave privada');
});
