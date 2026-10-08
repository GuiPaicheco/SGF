import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const seed = readFileSync(
  new URL(
    "../supabase/migrations/20261005120000_team_catalog_seed.sql",
    import.meta.url,
  ),
  "utf8",
);

const entries = [...seed.matchAll(
  /^\s*\('(esf|emulti|esb|eapp|ecr)',\s*(\d+),\s*'(\d{7})',\s*(null|'\d{6,10}'),\s*'([^']+)',\s*(true|false)\)[,]?$/gm,
)].map((match) => ({
  type: match[1],
  number: Number(match[2]),
  cnes: match[3],
  ine: match[4] === "null" ? null : match[4].slice(1, -1),
  label: match[5],
  needsReview: match[6] === "true",
}));

test("o catálogo contém todas as 176 equipes fornecidas", () => {
  assert.equal(entries.length, 176);
  assert.deepEqual(
    Object.fromEntries(
      [...new Set(entries.map(({ type }) => type))]
        .sort()
        .map((type) => [type, entries.filter((entry) => entry.type === type).length]),
    ),
    { eapp: 2, ecr: 1, emulti: 18, esb: 41, esf: 114 },
  );
});

test("importação histórica preserva os dois INE não fornecidos, sem inventar códigos", () => {
  const pending = entries.filter(({ needsReview }) => needsReview);
  assert.deepEqual(
    pending.map(({ label }) => label),
    ["EMULTI 004 BUENO FRANCO", "EMULTI 018 VILA CRISTINA"],
  );
  assert.ok(pending.every(({ ine }) => ine === null));
  assert.ok(entries.filter(({ ine }) => ine !== null).every(({ needsReview }) => !needsReview));
});

test("cada equipe está associada a um CNES e nenhum INE se repete", () => {
  assert.ok(entries.every(({ cnes }) => /^\d{7}$/.test(cnes)));
  const ineCodes = entries.flatMap(({ ine }) => ine ? [ine] : []);
  assert.equal(new Set(ineCodes).size, 174);
});

test("a importação é idempotente e valida a contagem final", () => {
  assert.match(seed, /on conflict \(source_label\).*do update/);
  assert.match(seed, /if imported_count <> 176/);
  assert.match(seed, /if review_count <> 2/);
});
