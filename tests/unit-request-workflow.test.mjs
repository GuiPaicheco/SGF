import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20261005170000_unit_request_workflow.sql', 'utf8');
const operations = fs.readFileSync('supabase/functions/manage-operations/index.ts', 'utf8');
const app = fs.readFileSync('assets/app.js', 'utf8');

test('workflow por CNES separa revisão, aprovação e calendário', () => {
  assert.match(migration, /create table public\.request_unit_reviews/);
  assert.match(migration, /status text not null default 'pendente'/);
  assert.match(migration, /status in \('pendente', 'aprovada', 'rejeitada', 'programada'\)/);
  assert.match(migration, /expected_version/);
  assert.match(migration, /REVIEW_VERSION_CONFLICT/);
  assert.match(migration, /REJECTION_REASON_REQUIRED/);
  assert.match(migration, /manage_unit_request_review/);
  assert.match(migration, /request_day_responsibilities/);
});

test('gestão operacional expõe ações explícitas do fluxo', () => {
  assert.match(operations, /action === 'unit-review'/);
  assert.match(operations, /review_action/);
  assert.match(operations, /manage_unit_request_review/);
  assert.match(app, /data-unit-review-action/);
  assert.match(app, /Aprovar/);
  assert.match(app, /Recusar/);
  assert.match(app, /Adicionar ao Calendário/);
  assert.match(app, /updateUnitReview/);
});
