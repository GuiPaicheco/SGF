import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
test('escala cíclica não perde fonte anterior a três meses',async()=>{
  const source=await read('supabase/functions/_shared/unit-minimum-scale.ts');
  assert.doesNotMatch(source,/number - 4|gte\('scale_date', start\)/);
  assert.match(source,/allowed.has/);
});
test('histórico não confunde atuação antiga com escala vazia',async()=>{
  const source=await read('assets/app.js');
  assert.match(source,/Atuação histórica não disponível no cadastro atual/);
  assert.doesNotMatch(source,/minimumCandidates.find\(employee => employee.row_id === item.bond_unit_id\)/);
  assert.match(source,/!exactDay && sourceDate/);
});
test('calendário horizontal é acessível por teclado sem depender apenas das cores',async()=>{
  const app=await read('assets/app.js');
  assert.match(app,/role="region" aria-label="Calendário nominal; use as setas para percorrer as datas" tabindex="0"/);
  assert.match(app,/aria-label="Ver \$\{formatDate\(day\)\}"/);
});
test('reutilização rápida é limitada ao contexto, intervalo e trinta segundos',async()=>{
  const app=await read('assets/app.js');
  assert.match(app,/state\.scaleDataKey !== cacheKey/);
  assert.match(app,/Date\.now\(\) - \(state\.scaleLoadedAt \|\| 0\) > 30000/);
  assert.match(app,/state\.route === 'scale'/);
  assert.match(app,/await Promise\.all\(\[loadRequests\(\),loadCalendarEvents\(\)\]\)/);
});
