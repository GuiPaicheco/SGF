import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = path => readFile(new URL(`../${path}`,import.meta.url),'utf8');
const sql = await read('supabase/migrations/20261005170000_unit_request_workflow.sql');
const routine = name => {
  const start = sql.indexOf(`create function private.${name}(`);
  return sql.slice(start,sql.indexOf('end $$;',start)+7);
};

test('envio usa identidade e contexto validados, sem aceitar autoria do navegador', async () => {
  const [submit,operation] = await Promise.all([read('supabase/functions/submit-request/index.ts'),read('supabase/functions/manage-operations/index.ts')]);
  assert.match(submit,/\.\.\.contextHeaders\(context\), 'x-sgf-actor': identity.user.id/);
  assert.match(submit,/await scoped.rpc\('register_contextual_vacation_submission'/);
  assert.match(submit,/profile.must_change_password \|\| profile.disabled_at/);
  assert.match(operation,/'x-sgf-actor': profile.id/);
  assert.doesNotMatch(submit,/request.headers.get\('x-sgf-actor'\)/);
});

test('auditoria inicial agrupa por pedido/CNES/lotação e não duplica avisos de revisão', () => {
  const fn = routine('audit_initial_day_distribution');
  assert.match(fn,/group by d.request_id,d.cnes_unit_id,d.lotacao_id,r.context_bond_id/);
  assert.match(fn,/jsonb_agg.*order by d.responsibility_date/);
  assert.match(fn,/AUDIT_ACTOR_REQUIRED/);
  assert.match(fn,/request_day_distribution_created/);
  assert.doesNotMatch(fn,/emit_.*notification/);
  assert.match(sql,/referencing new table as new_distribution for each statement/);
});

test('redistribuição ignora alterações sem efeito e preserva identidade pedido/data', () => {
  const fn = routine('audit_responsibility_change');
  assert.match(fn,/is not distinct from \(old.request_id,old.responsibility_date,old.bond_unit_id/);
  assert.match(fn,/RESPONSIBILITY_IDENTITY_IMMUTABLE/);
  assert.match(fn,/if not found then return old/);
  assert.match(fn,/role_value := private.actor_role\(who\)/);
  assert.match(fn,/disabled_at is null/);
  assert.match(fn,/before_data := to_jsonb\(old\)/);
  assert.match(fn,/after_data := to_jsonb\(new\)/);
});

test('redistribuição audita e notifica escopos anterior/novo sem modificar decisões', () => {
  const fn = routine('audit_responsibility_change');
  assert.match(fn,/select old.cnes_unit_id as cnes_id,old.lotacao_id as location_id/);
  assert.match(fn,/union select \(after_data->>'cnes_unit_id'\)::uuid/);
  assert.match(fn,/request_responsibility_changed/);
  assert.match(fn,/'responsibility:'\|\|txid_current\(\)\|\|':'\|\|old.request_id/);
  assert.doesNotMatch(fn,/update public.request_unit_reviews|update public.vacation_requests/);
});

test('alertas de afastamento dependem de coincidência real de dia e escopo, excluindo a própria pessoa', () => {
  const fn = routine('notify_absence_neighbors');
  assert.match(fn,/theirs.responsibility_date=mine.responsibility_date/);
  assert.match(fn,/theirs.lotacao_id is not distinct from mine.lotacao_id/);
  assert.match(fn,/other.servidor_id<>changed_employee/);
  assert.match(fn,/review.status in \('pendente','aprovada','programada'\)/);
  assert.match(fn,/extract\(dow from mine.responsibility_date\) not in \(0,6\)/);
  assert.match(fn,/calendar_events e where e.active/);
  assert.match(fn,/to_char\(changed_birth,'MM-DD'\)/);
  assert.match(fn,/to_char\(s.birth_date,'MM-DD'\)/);
  assert.doesNotMatch(fn,/s.full_name|s.cpf|update public.vacation_requests/);
});

test('confirmação e cancelamento de ausências confirmadas acionam avisos relacionados', () => {
  assert.match(routine('notify_related_absence_change'),/new.status<>'programada' and old.status<>'programada'/);
  const fn = routine('notify_cancelled_absence_neighbors');
  assert.match(fn,/new.status<>'cancelada' or new.context_bond_id is null/);
  assert.match(fn,/where request_id=new.id and status='programada'/);
  assert.match(fn,/notify_absence_neighbors/);
  assert.match(fn,/'cancelled-absence:'\|\|new.id/);
});

test('novas funções são invoker, com busca restrita e execução não pública', () => {
  for (const name of ['audit_responsibility_change','notify_absence_neighbors','notify_related_absence_change','notify_cancelled_absence_neighbors','audit_initial_day_distribution']) {
    assert.match(routine(name),/security invoker set search_path = ''/);
    assert.match(sql,new RegExp(`revoke all on function private\\.${name}\\([^;]+from public,anon,authenticated`));
  }
});
