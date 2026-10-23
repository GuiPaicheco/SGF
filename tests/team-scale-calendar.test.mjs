import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('histórico das equipes preserva Não se aplica sem reabrir o autocadastro', async () => {
  const [app, auth, catalogs, migration, multiMigration] = await Promise.all([
    read('assets/app.js'), read('supabase/functions/access-auth/index.ts'),
    read('supabase/functions/manage-catalogs/index.ts'),
    read('supabase/migrations/20260930143000_team_scale_cycle_calendar_notifications.sql'),
    read('supabase/migrations/20261005130000_multi_bond_access_requests.sql'),
  ]);
  assert.match(app, /class="control access-team-type"/);
  assert.match(app, /<option value="nao_se_aplica">Não se aplica<\/option>/);
  assert.match(app, /team\.cnes_unit_id === cnesId && team\.type_code === type/);
  assert.match(auth, /autocadastro foi encerrado/);
  assert.doesNotMatch(auth, /if \(action === 'request-access'\)/);
  assert.match(catalogs, /target_team:/);
  assert.match(migration, /team_name text not null default 'Não se aplica'/);
  assert.match(migration, /previous_team text/);
  assert.match(multiMigration, /ACCESS_UNIT_DATA_INVALID/);
});

test('escala mínima mantém dias vazios, origem do ciclo e edição nominal', async () => {
  const [app, operation, migration] = await Promise.all([
    read('assets/app.js'), read('supabase/functions/manage-operations/index.ts'),
    read('supabase/migrations/20260930143000_team_scale_cycle_calendar_notifications.sql'),
  ]);
  assert.match(app, /dateFrom\(item\.scale_date\)\.getDay\(\) === dateFrom\(minimumDate\)\.getDay\(\)/);
  assert.match(app, /source_date: event\.target\.dataset\.sourceDate/);
  assert.match(app, /cargo\?\.name[^\n]+team_name[^\n]+funcao\?\.name[^\n]+full_name/);
  assert.match(operation, /loadUnitMinimumScale/);
  assert.match(migration, /primary key \(lotacao_id, scale_date\)/);
});

test('calendário de escala oferece leitura mensal e detalhamento do dia', async () => {
  const [app, scale] = await Promise.all([read('assets/app.js'), read('assets/scale.css')]);
  assert.match(app, /class="scale-day-panel" aria-live="polite"/);
  assert.match(app, /Afastamentos e retornos/);
  assert.match(app, /Escala mínima e eventos/);
  assert.match(app, /data-scale-date=/);
  assert.match(app, /cargo\?\.name[^\n]+team_name[^\n]+funcao\?\.name/);
  assert.match(scale, /\.scale-day\.is-start/);
  assert.match(scale, /\.scale-person-tags/);
  assert.match(scale, /\.scale-grid thead \.is-today/);
});

test('feriado novo notifica todos os envolvidos em afastamentos afetados', async () => {
  const migration = await read('supabase/migrations/20260930143000_team_scale_cycle_calendar_notifications.sql');
  assert.match(migration, /calendar_events_notify_affected/);
  assert.match(migration, /new\.event_date between period\.start_date and period\.end_date/g);
  assert.match(migration, /join public\.profile_scopes/);
  assert.match(migration, /'administrador'=any\(profile\.roles\)/);
});
