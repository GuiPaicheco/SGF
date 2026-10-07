import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("pedido de acesso armazena vários vínculos e CNES de forma atômica", async () => {
  const migration = await read("supabase/migrations/20261005130000_multi_bond_access_requests.sql");
  assert.match(migration, /create table public\.access_request_bonds/);
  assert.match(migration, /create table public\.access_request_bond_units/);
  assert.match(migration, /create or replace function public\.submit_multi_bond_access_request/);
  assert.match(migration, /jsonb_array_length\(target_bonds\) not between 1 and 10/);
  assert.match(migration, /jsonb_array_length\(bond -> 'units'\) not between 1 and 20/);
  assert.match(migration, /TEAM_OUT_OF_CNES/);
  assert.match(migration, /INVALID_SECRETARIAT_ALLOCATION_CONTEXT/);
  for (const table of ["access_request_bonds", "access_request_bond_units"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`));
  }
});

test("formulário público adiciona vínculos e CNES e filtra equipes", async () => {
  const [app, auth] = await Promise.all([
    read("assets/app.js"),
    read("supabase/functions/access-auth/index.ts"),
  ]);
  assert.match(auth, /action === 'registration-catalogs'/);
  assert.match(auth, /cnesUnits:/);
  assert.match(auth, /teams:/);
  assert.match(app, /data-access-add-bond/);
  assert.match(app, /data-access-add-unit/);
  assert.match(app, /pole_cnes_unit_id/);
  assert.match(app, /internal_lotacao_id/);
  assert.match(app, /team\.cnes_unit_id === cnesId/);
  assert.match(app, /bonds\.some\(bond =>/);
});

test("aprovação materializa pessoa, vínculos e atuações com auditoria", async () => {
  const [migration, management] = await Promise.all([
    read("supabase/migrations/20261005133000_approve_multi_bond_access.sql"),
    read("supabase/functions/manage-access/index.ts"),
  ]);
  assert.match(migration, /create or replace function public\.approve_multi_bond_access/);
  assert.match(migration, /insert into public\.employment_bonds/);
  assert.match(migration, /insert into public\.employment_bond_units/);
  assert.match(migration, /insert into public\.employment_bond_teams/);
  assert.match(migration, /REGISTRATION_BELONGS_TO_ANOTHER_PERSON/);
  assert.match(migration, /multi_bond_access_approved/);
  assert.match(migration, /actor_role, action, entity_type/);
  assert.match(management, /accessRequest\.model_version === 2/);
  assert.match(management, /approve_multi_bond_access/);
  assert.match(management, /requestInRhScope/);
});

test("login e recuperação reconhecem CPF ou e-mail sem expor a conta", async () => {
  const auth = await read("supabase/functions/access-auth/index.ts");
  assert.match(auth, /const emailInput =/);
  assert.match(auth, /\.eq\('email', identifier\)\.maybeSingle/);
  assert.match(auth, /cpfInput \|\| emailInput \|\| loginInput/);
  assert.match(auth, /Se o acesso existir e possuir e-mail válido/);
});
