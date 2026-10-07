import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20261005112507_multi_unit_employment_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);

test("a fundação separa pessoa, vínculo, CNES, lotação e equipe", () => {
  for (const table of [
    "cnes_units",
    "lotacao_cnes_units",
    "team_types",
    "teams",
    "employment_bonds",
    "employment_bond_units",
    "employment_bond_teams",
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}\\b`));
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security;`),
    );
    assert.match(
      migration,
      new RegExp(`revoke all on public\\.${table} from public, anon, authenticated;`),
    );
  }
});

test("uma matrícula identifica o vínculo, não a pessoa", () => {
  assert.match(
    migration,
    /employment_bonds_registration_upper_key[\s\S]*upper\(registration\)/,
  );
  assert.match(
    migration,
    /servidor_id uuid not null references public\.servidores/,
  );
  assert.match(
    migration,
    /employment_bond_units[\s\S]*bond_id uuid not null[\s\S]*cnes_unit_id uuid not null/,
  );
});

test("a equipe é única por atuação e precisa pertencer ao mesmo CNES", () => {
  assert.match(
    migration,
    /bond_unit_id uuid primary key references public\.employment_bond_units/,
  );
  assert.match(migration, /TEAM_OUT_OF_CNES/);
  assert.match(migration, /employment_bond_teams_exactly_one_value/);
  assert.match(migration, /'nao_se_aplica', 'Não se aplica'/);
});

test("lotação interna somente pode existir sob uma Secretaria", () => {
  assert.match(migration, /INTERNAL_ALLOCATION_REQUIRES_SECRETARIAT/);
  assert.match(migration, /secretariat\.unit_type = 'secretaria'/);
  assert.match(migration, /INVALID_SECRETARIAT_ALLOCATION_CONTEXT/);
});

test("a migração preserva os registros legados", () => {
  assert.match(
    migration,
    /insert into public\.employment_bonds[\s\S]*from public\.servidores employee/,
  );
  assert.match(migration, /'migracao_legada'/);
  assert.doesNotMatch(migration, /drop table public\.servidores/i);
  assert.doesNotMatch(migration, /drop column (matricula|lotacao_id|team_name)/i);
});

test("a auditoria recebe o contexto funcional da ação", () => {
  for (const column of [
    "actor_role",
    "context_bond_id",
    "context_cnes_unit_id",
    "context_lotacao_id",
    "reason",
  ]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}\\b`));
  }
});
