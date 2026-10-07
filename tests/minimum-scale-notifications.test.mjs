import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql = await readFile(new URL('../supabase/migrations/20261005170000_unit_request_workflow.sql',import.meta.url),'utf8');
const personal = sql.slice(sql.indexOf('create function private.emit_employee_planning_notification'),sql.indexOf('revoke all on function private.emit_employee_planning_notification'));
const minimum = sql.slice(sql.indexOf('create function private.notify_minimum_scale_audit'),sql.indexOf('revoke all on function private.notify_minimum_scale_audit'));

test('aviso nasce da auditoria da gravação concluída e usa uma chave por evento', () => {
  assert.match(minimum,/after insert on public.audit_events/);
  assert.match(minimum,/when \(new.action='unit_minimum_scale_updated'\)/);
  assert.match(minimum,/'minimum-scale:'\|\|new.id/);
  assert.match(minimum,/private.emit_unit_notification/);
});

test('regravar mesma composição não avisa; primeiro dia vazio e alteração da origem são preservados', () => {
  assert.equal((minimum.match(/array_agg\(distinct value::uuid order by value::uuid\)/g) || []).length,2);
  assert.match(minimum,/previous_ids=current_ids and \(new.previous_value->>'version'\)::integer>0/);
  assert.match(minimum,/new.previous_value->>'source_date' is not distinct from new.new_value->>'source_date'/);
  assert.match(sql,/'version',day_row.version,'source_date',day_row.source_date/);
  assert.match(minimum,/nullif\(new.new_value->'bond_unit_ids','null'::jsonb\)/);
});

test('aviso nominal alcança somente adicionados/retirados no CNES e lotação exatos', () => {
  assert.match(minimum,/u.cnes_unit_id=new.context_cnes_unit_id and u.internal_lotacao_id is not distinct from new.context_lotacao_id/);
  assert.match(minimum,/u.id=any\(previous_ids\) and not u.id=any\(current_ids\)/);
  assert.match(minimum,/u.id=any\(current_ids\) and not u.id=any\(previous_ids\)/);
  assert.match(minimum,/incluída na.*retirada da/);
  assert.doesNotMatch(minimum,/s.full_name|s.cpf|s.email/);
});

test('avisos de solicitações dependem de data/distribuição e revisão do mesmo escopo', () => {
  assert.match(minimum,/d.responsibility_date=day_date and d.cnes_unit_id=new.context_cnes_unit_id/);
  assert.match(minimum,/d.lotacao_id is not distinct from new.context_lotacao_id/);
  assert.match(minimum,/v.lotacao_id is not distinct from d.lotacao_id/);
  assert.match(minimum,/v.status in \('pendente','aprovada','programada'\)/);
  assert.match(minimum,/calendar_events e where e.active and e.event_date=day_date/);
  assert.doesNotMatch(minimum,/update public.vacation_requests|update public.request_unit_reviews|update public.time_bank/);
});

test('aviso pessoal verifica dono e vínculo e não replica os canais de gestão', () => {
  assert.match(personal,/p.id=target_owner and p.disabled_at is null and 'servidor'=any\(p.roles\)/);
  assert.match(personal,/b.id=target_bond and s.profile_id=p.id/);
  assert.match(personal,/u.internal_lotacao_id is not distinct from target_lotacao/);
  assert.match(personal,/target_key\|\|':'\|\|target_bond/);
  assert.match(personal,/on conflict do nothing/);
  assert.doesNotMatch(personal,/emit_unit_notification|union/);
  assert.match(sql,/private.notify_minimum_scale_audit\(\) from public,anon,authenticated/);
});
