import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8');
const profiles = readFileSync(new URL('../supabase/functions/manage-profiles/index.ts', import.meta.url), 'utf8');

test('senhas temporárias são fortes, aleatórias e exibidas uma única vez ao administrador', () => {
  assert.match(profiles, /crypto\.getRandomValues\(new Uint8Array\(12\)\)/);
  assert.match(profiles, /return `Sg1!\$\{/);
  assert.match(profiles, /temporary_password: initialPassword/g);
  assert.doesNotMatch(profiles, /'1234'|'123456'|'12345678'/);
  assert.match(app, /presentTemporaryPassword\(result\.temporary_password\)/g);
  assert.match(app, /não será exibida novamente/);
});
