import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const source=stripTypeScriptTypes(await readFile(new URL('../supabase/functions/_shared/user-guidance.ts',import.meta.url),'utf8'));
const {userGuidance,guidanceCatalog}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('catálogo separa impedimento, recusa administrativa e falha técnica',()=>{
 assert.equal(userGuidance('SUBMISSION_ACQUISITION_RULE').category,'rule');
 assert.equal(userGuidance('REJECTION_BANK_INVALID').category,'administrative');
 assert.equal(userGuidance('TECHNICAL_ERROR').category,'technical');
 assert.match(userGuidance('TECHNICAL_ERROR').error,/TI da Prefeitura/);
 assert.match(userGuidance('SUBMISSION_ACQUISITION_RULE').error,/RH da sua unidade/);
 assert.match(userGuidance('REASON_VERSION_CONFLICT').error,/TI da Prefeitura/);
});

test('formulário e cálculo restringem fracionamento a dias úteis e conferem retorno',async()=>{
 const app=await readFile(new URL('../assets/app.js',import.meta.url),'utf8');
 const guards=app.match(/const splitAllowed =[^;]+;/g);assert.equal(guards.length,2);
 for(const guard of guards)assert.match(guard,/rule.unit === 'uteis'/);
 assert.match(app,/secondStart < dateFrom\(periods\[0\].return_date\)/);
});
test('não inventa aprovação ou vigência normativa e não repassa erro desconhecido',()=>{
 for(const code of Object.keys(guidanceCatalog)){
  const g=userGuidance(code);assert.ok(g.version&&g.support&&g.error);
  if(g.reference){assert.equal(g.reference.status,'pending_institutional_approval');assert.equal(g.reference.citation,null);assert.equal(g.reference.valid_from,null);assert.equal(g.reference.approved_by,null);}
 }
 assert.equal(userGuidance('SQL_ERROR_WITH_PRIVATE_DATA'),null);
});
test('servidor valida datas antes de persistir; navegador dá explicação correspondente',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261009132736_block_six_submission_guards.sql',import.meta.url),'utf8');
 assert.match(sql,/SUBMISSION_ACQUISITION_RULE/);assert.match(sql,/SUBMISSION_ADMISSION_RULE/);
 assert.match(sql,/revoke all on function private.validate_submission_dates/);
 const app=await readFile(new URL('../assets/app.js',import.meta.url),'utf8');
 assert.match(app,/Este impedimento não é recusa administrativa/);
 assert.match(app,/As referências legais e suas vigências ainda dependem de aprovação institucional/);
});
