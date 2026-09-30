import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20260929234326_cpf_multi_access.sql', import.meta.url), 'utf8');
const foundation = readFileSync(new URL('../supabase/migrations/20260928150000_sgf_foundation.sql', import.meta.url), 'utf8');

test('o acesso escolhido precisa estar concedido ao perfil e a troca de senha precisa estar concluída', () => {
  assert.match(migration, /select roles into granted from public\.profiles where id = actor_id and not must_change_password/);
  assert.match(migration, /if selected::public\.app_role = any\(granted\) then return selected::public\.app_role/);
  assert.match(migration, /if selected is null and cardinality\(granted\) = 1 then return granted\[1\]/);
  assert.match(migration, /return null/);
});

test('servidor acessa o próprio pedido e RH depende do escopo da lotação', () => {
  assert.match(foundation, /s\.profile_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /ps\.profile_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /private\.current_app_role\(\) = 'rh'/);
  assert.match(migration, /private\.current_app_role\(\) = 'administrador'/);
});

test('aprovações respeitam a ordem Chefia Imediata e RH', () => {
  assert.match(migration, /target_stage='rh' and not exists[\s\S]*stage='chefia_imediata'[\s\S]*decision='aprovada'/);
  assert.match(migration, /when target_stage='chefia_imediata' then 'em_analise'/);
  assert.match(migration, /else 'aprovada'/);
});

const allowedTransitions = [
  ['rh', 'enviada', 'devolver', 'devolvida'],
  ['administrador', 'em_analise', 'devolver', 'devolvida'],
  ['servidor', 'devolvida', 'reenviar', 'enviada'],
  ['rh', 'aprovada', 'programar', 'programada'],
  ['administrador', 'programada', 'reprogramar', 'reprogramada'],
  ['servidor', 'enviada', 'cancelar', 'cancelada'],
  ['rh', 'reprogramada', 'concluir', 'concluida'],
];

test('a matriz de transições operacionais permanece coberta pela função do banco', () => {
  const operation = migration.slice(migration.indexOf('create or replace function public.manage_request_operation'));
  for (const [role, status, action, result] of allowedTransitions) {
    assert.match(operation, new RegExp(`target_action ?= ?'${action}'[\\s\\S]{0,240}actor_role[\\s\\S]{0,160}'${role}'[\\s\\S]{0,260}'${status}'[\\s\\S]{0,180}next_status ?:= ?'${result}'`), `${role}: ${status} -> ${action} -> ${result}`);
  }
  assert.match(operation, /else raise exception using message='TRANSITION_NOT_ALLOWED'/);
  assert.match(operation, /target_action in \('devolver','cancelar','reprogramar'\)[\s\S]*NOTES_REQUIRED/);
});

test('funções privilegiadas não ficam executáveis pelos papéis públicos', () => {
  for (const name of ['set_profile_access', 'approve_cpf_access']) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}[\\s\\S]{0,180}from public,anon,authenticated`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}[\\s\\S]{0,180}to service_role`));
  }
});
