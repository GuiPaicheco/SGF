import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
test('períodos novos preservam explicitamente a unidade de contagem',async()=>{
  const [app,sql]=await Promise.all([read('assets/app.js'),read('supabase/migrations/20261005160000_request_day_responsibilities.sql')]);
  assert.match(app,/days, counting_mode: unit/);
  assert.match(sql,/add column counting_mode text/);
  assert.match(sql,/check \(counting_mode in \('uteis','corridos'\)\)/);
  assert.match(sql,/set counting_mode=entry.value->>'counting_mode'/);
  assert.doesNotMatch(sql,/counting_mode text not null default/);
});
test('Edge Function e SQL não aceitam contagem omitida nos pedidos novos',async()=>{
  const [endpoint,sql]=await Promise.all([read('supabase/functions/submit-request/index.ts'),read('supabase/migrations/20261005160000_request_day_responsibilities.sql')]);
  assert.match(endpoint,/periods.some.*period.counting_mode/);
  assert.match(sql,/p->>'counting_mode' is null/);
});
test('cálculo preserva início e quantidade, não soma um dia corrido cegamente',async()=>{
  const sql=await read('supabase/migrations/20261005170000_unit_request_workflow.sql');
  const fn=sql.slice(sql.indexOf('create function private.calculate_preserved_period'));
  assert.match(fn,/while consumed<target_days loop/);
  assert.match(fn,/extract\(dow from cursor_day\) not in \(0,6\)/);
  assert.match(fn,/excluded_dates/);
  assert.match(fn,/target_birth/);
  assert.match(fn,/'start_date',target_start/);
  assert.match(fn,/'days',target_days/);
});
test('dias corridos mantêm quantidade e retorno avança ao próximo dia útil',async()=>{
  const sql=await read('supabase/migrations/20261005170000_unit_request_workflow.sql');
  const fn=sql.slice(sql.indexOf('create function private.calculate_preserved_period'));
  assert.match(fn,/target_mode='corridos' then end_day := target_start\+target_days-1/);
  assert.match(fn,/return_day := end_day\+1/);
  assert.match(fn,/extract\(dow from return_day\) not in \(0,6\)/);
});
test('função interna tem limites para calendário inválido e não altera decisões ou registros',async()=>{
  const sql=await read('supabase/migrations/20261005170000_unit_request_workflow.sql');
  const fn=sql.slice(sql.indexOf('create function private.calculate_preserved_period'),sql.indexOf('-- Autoria obrigatória nas alterações de calendário'));
  assert.match(fn,/target_days not between 1 and 90/);
  assert.match(fn,/scanned>730/);
  assert.match(fn,/from public,anon,authenticated/);
  assert.doesNotMatch(fn,/update public|insert into public|delete from public/);
});
