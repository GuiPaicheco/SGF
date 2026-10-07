import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("cada dia útil possui exatamente um CNES responsável", async () => {
  const migration = await read("supabase/migrations/20261005160000_request_day_responsibilities.sql");
  assert.match(migration, /create table public\.request_day_responsibilities/);
  assert.match(migration, /primary key \(request_id, responsibility_date\)/);
  assert.match(migration, /RESPONSIBILITY_DAYS_INCOMPLETE/);
  assert.match(migration, /RESPONSIBILITY_UNIT_INELIGIBLE/);
  assert.match(migration, /extract\(dow from generated\.day\) not in \(0, 6\)/);
  assert.match(migration, /calendar_events event/);
  assert.match(migration, /employee_birth_date/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /private\.can_manage_servidor/);
});

test('envio exige titular ativo e identidade comprovada pelo servidor', async()=>{
  const sql=await read('supabase/migrations/20261005160000_request_day_responsibilities.sql');
  assert.match(sql,/SUBMISSION_ACTOR_INVALID/);assert.match(sql,/profile.id=authenticated_actor/);
  assert.match(sql,/employee.active/);assert.match(sql,/not profile.must_change_password/);
  assert.match(sql,/payload->>'createdBy'.*is distinct from authenticated_actor/);
});
test('atribuição inicial confere autorização e vigência de unidade e vínculo', async()=>{
  const sql=await read('supabase/migrations/20261005160000_request_day_responsibilities.sql');
  assert.match(sql,/unit.approval_responsible/);assert.match(sql,/unit.valid_until>=assignment_date/);
  assert.match(sql,/bond.valid_until>=assignment_date/);assert.match(sql,/cnes.active/);
  assert.match(sql,/having count\(\*\)>1/);assert.match(sql,/RESPONSIBILITY_DAY_DUPLICATED/);
});
test('autoria do pedido é persistida atomicamente sem update posterior na Edge Function', async()=>{
  const [sql,edge]=await Promise.all([read('supabase/migrations/20261005160000_request_day_responsibilities.sql'),read('supabase/functions/submit-request/index.ts')]);
  assert.match(sql,/set created_by = authenticated_actor/);
  assert.match(sql,/p.request_id=created_request_id/);
  assert.doesNotMatch(edge,/ownerError|update\(\{ created_by:/);
  assert.match(edge,/RESPONSIBILITY_UNIT_INELIGIBLE/);
});
test('catálogos transmitem autoria verificada e não copiam cabeçalho do navegador', async()=>{
  const edge=await read('supabase/functions/manage-catalogs/index.ts');
  assert.match(edge,/'x-sgf-actor': identity.user.id/);
  assert.doesNotMatch(edge,/request.headers.get\('x-sgf-actor'\)/);
});

test("planejador diário filtra as unidades pelo vínculo ativo", async () => {
  const app = await read("assets/app.js");
  assert.match(app, /function responsibilityContexts\(\)/);
  assert.match(app, /context\.bond_id === bondId/);
  assert.match(app, /function requestWorkDays/);
  assert.match(app, /data-responsibility-date/);
  assert.match(app, /responsibility-fill-weekday/);
  assert.match(app, /responsibility-fill-all/);
  assert.match(app, /Defina o CNES responsável por todos os dias úteis/);
});

test("comprovante e acompanhamento carregam a distribuição diária", async () => {
  const app = await read("assets/app.js");
  assert.match(app, /request_day_responsibilities/);
  assert.match(app, /CNES responsável por dia/);
  assert.match(app, /Responsabilidade por dia:/);
  assert.match(app, /source\.bond\?\.registration/);
});
