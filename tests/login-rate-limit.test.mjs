import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('login aplica cooldown visual e respeita retry_after do servidor', async () => {
  const app = await read('assets/app.js');
  assert.match(app, /LOGIN_COOLDOWN_KEY/);
  assert.match(app, /applyLoginCooldown/);
  assert.match(app, /body\.retry_after/);
  assert.match(app, /Aguarde \$\{remaining\}s/);
});

test('limitação do login é atômica e protegida no banco', async () => {
  const [edge, migration] = await Promise.all([
    read('supabase/functions/access-auth/index.ts'),
    read('supabase/migrations/20260930160000_access_login_rate_limit.sql'),
  ]);
  assert.match(edge, /begin_access_attempt/);
  assert.match(edge, /target_max_failures: maxFailures/);
  assert.match(edge, /'Retry-After'/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /revoke all on function public\.begin_access_attempt/);
  assert.match(migration, /grant execute[^;]+service_role/s);
});
