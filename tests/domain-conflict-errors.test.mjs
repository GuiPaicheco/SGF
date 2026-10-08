import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const migration=await read('supabase/migrations/20261008185900_domain_conflict_error_codes.sql');
test('conflitos de domínio deixam de disparar retry de serialization_failure',()=>{
  const pattern=/errcode\s*=\s*'40001'/gi;
  assert.equal("raise exception 'REVIEW_VERSION_CONFLICT' using errcode='40001';".replace(pattern,"errcode='P0001'"),"raise exception 'REVIEW_VERSION_CONFLICT' using errcode='P0001';");
  assert.match(migration,/regexp_replace\(definition/);
  assert.match(migration,/DOMAIN_SERIALIZATION_CODE_REMAINS/);
  for(const fn of ['manage_unit_request_review_before_planning','commit_request_revision','save_organization_registry','manage_bond_time_bank','save_bond_vacation_right','save_bond_registry','set_unit_minimum_scale','manage_manual_calendar_conflict']) assert.ok(migration.includes(fn));
  assert.doesNotMatch(migration,/drop function|grant .*authenticated|security definer/i);
});
test('Edge Function conserva aviso 409 para decisões e substituições antigas',async()=>{
  const edge=await read('supabase/functions/manage-operations/index.ts');
  assert.match(edge,/message === 'REVISION_VERSION_CONFLICT'[\s\S]*?409/);
  assert.match(edge,/message.includes\('REVIEW_VERSION_CONFLICT'\) \? 409/);
});
