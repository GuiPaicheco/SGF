import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8');
const profiles = readFileSync(new URL('../supabase/functions/manage-profiles/index.ts', import.meta.url), 'utf8');

test('versão estável usa senha provisória solicitada e exige troca no primeiro acesso', () => {
  assert.match(profiles, /const temporaryPassword = \(\) => '123456'/);
  assert.match(profiles, /temporary_password: initialPassword/g);
  assert.match(profiles, /must_change_password: true/);
  assert.match(app, /presentTemporaryPassword\(result\.temporary_password\)/g);
  assert.match(app, /não será exibida novamente/);
  const access = readFileSync(new URL('../supabase/functions/manage-access/index.ts', import.meta.url), 'utf8');
  assert.match(access, /password: initialPassword, email_confirm: true/);
  assert.doesNotMatch(access, /inviteUserByEmail/);
  const auth = readFileSync(new URL('../supabase/functions/access-auth/index.ts', import.meta.url), 'utf8');
  assert.match(auth, /password === '123456'/);
});
