import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("contexto ativo é validado no servidor e não apenas no navegador", async () => {
  const helper = await read("supabase/functions/_shared/access-context.ts");
  assert.match(helper, /grantedRoles\.includes\(role\)/);
  assert.match(helper, /employment_bonds/);
  assert.match(helper, /employment_bond_units/);
  assert.match(helper, /profile_scopes/);
  assert.match(helper, /lotacao_cnes_units/);
  assert.match(helper, /INVALID_ACCESS_CONTEXT/);
});

test("funções operacionais aplicam o validador compartilhado", async () => {
  for (const path of [
    "supabase/functions/manage-operations/index.ts",
    "supabase/functions/manage-catalogs/index.ts",
    "supabase/functions/manage-access/index.ts",
    "supabase/functions/manage-inclusions/index.ts",
    "supabase/functions/manage-profiles/index.ts",
    "supabase/functions/submit-request/index.ts",
  ]) {
    const source = await read(path);
    assert.match(source, /validateAccessContext/);
    assert.match(source, /x-sgf-cnes/);
    assert.match(source, /INVALID_ACCESS_CONTEXT/);
  }
});

test("RLS e registro de solicitação preservam o contexto funcional", async () => {
  const migration = await read("supabase/migrations/20261005150000_context_aware_access.sql");
  assert.match(migration, /create or replace function private\.can_manage_servidor/);
  assert.match(migration, /request\.headers/);
  assert.match(migration, /x-sgf-lotacao/);
  assert.match(migration, /x-sgf-cnes/);
  assert.match(migration, /add column if not exists context_bond_id/);
  assert.match(migration, /register_contextual_vacation_submission/);
  assert.match(migration, /revoke all on function public\.register_contextual_vacation_submission/);
});

