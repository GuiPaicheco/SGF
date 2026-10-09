import test from 'node:test';
import assert from 'node:assert/strict';
import {demoSql} from '../scripts/prepare-demo.mjs';
import {readFile} from 'node:fs/promises';
test('demonstração é rollback por padrão e possui identificadores próprios',async()=>{
 const sql=await demoSql();assert.match(sql,/ROLLBACK;\s*$/);assert.doesNotMatch(sql,/f3000000|COMMIT;/);assert.match(sql,/SGF-DEMO07-M2/);
});
test('persistir demonstração exige consentimento explícito e não contém senha',async()=>{
 const sql=await demoSql(true);assert.match(sql,/DEMO_EXPLICIT_CONSENT_REQUIRED/);assert.match(sql,/COMMIT;\s*$/);assert.doesNotMatch(sql,/encrypted_password|change-password|service_role_key/i);
});
test('reconciliação é somente leitura e não infere unidades',async()=>{
 const sql=await readFile(new URL('../scripts/reconcile-history.sql',import.meta.url),'utf8');
 assert.match(sql,/repeatable read read only/i);assert.doesNotMatch(sql,/\b(update|delete|insert|truncate)\b/i);assert.match(sql,/legacy_active_requires_manual_review/);
});

test('guard legado não depende do proprietário e não confia no cabeçalho de ator',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261009172300_legacy_guard_service_identity.sql',import.meta.url),'utf8');
 assert.match(sql,/coalesce\(\(select auth.role\(\)\),''\)/);
 assert.match(sql,/<>\s*'service_role'/);assert.match(sql,/Campos de identificacao/);
 assert.doesNotMatch(sql,/headers->>|current_user.*supabase_admin/);
});
