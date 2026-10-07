import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const read = path => readFile(new URL(`../${path}`,import.meta.url),'utf8');
const code = stripTypeScriptTypes(await read('supabase/functions/_shared/rejection-reasons.ts'));
const {validateRejection} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const reason = mode => ({code:mode,input_mode:mode,active:true});

test('banco insuficiente exige números finitos, saldo não negativo e quantidade superior ao saldo', () => {
  assert.deepEqual(validateRejection(reason('bank'),{available_hours:0,required_hours:8},'Saldo conferido'),{code:'bank',available_hours:0,required_hours:8});
  for (const details of [{},{available_hours:'0',required_hours:8},{available_hours:-1,required_hours:8},{available_hours:8,required_hours:8},{available_hours:Infinity,required_hours:9},{available_hours:0,required_hours:100001}]) {
    assert.throws(() => validateRejection(reason('bank'),details,'Saldo conferido'),/REJECTION_BANK_INVALID/);
  }
});

test('conflito exige funcionário, período real e explicação', () => {
  assert.deepEqual(validateRejection(reason('conflict'),{employee_name:' Ana Silva ',start_date:'2026-10-06',end_date:'2026-10-09'},'Cobertura insuficiente'),
    {code:'conflict',employee_name:'Ana Silva',start_date:'2026-10-06',end_date:'2026-10-09'});
  for (const details of [{employee_name:''},{employee_name:'Ana',start_date:'2026-02-31',end_date:'2026-03-02'},{employee_name:'Ana',start_date:'2026-10-09',end_date:'2026-10-08'}]) {
    assert.throws(() => validateRejection(reason('conflict'),details,'Explicação'),/REJECTION_CONFLICT_INVALID/);
  }
});

test('Outros não dispensa justificativa e motivo inativo é recusado', () => {
  assert.deepEqual(validateRejection(reason('other'),{},'Razão administrativa'),{code:'other'});
  for (const notes of ['', 'ab', 'x'.repeat(2001), null]) assert.throws(() => validateRejection(reason('other'),{},notes),/REJECTION_DATA_INVALID/);
  assert.throws(() => validateRejection({...reason('other'),active:false},{},'Explicação'),/REJECTION_REASON_INACTIVE/);
});

test('dados extras e rótulo enviado pelo navegador não são armazenados como motivo', () => {
  assert.deepEqual(validateRejection(reason('bank'),{available_hours:1,required_hours:8,password:'secret',label:'forjado'},'Conferido'),{code:'bank',available_hours:1,required_hours:8});
});

test('SQL valida novamente catálogo ativo e preserva rótulo/dados junto à auditoria', async () => {
  const sql = await read('supabase/migrations/20261005170000_unit_request_workflow.sql');
  assert.match(sql,/request_rejection_reasons enable row level security/);
  assert.match(sql,/Banco de Horas Insuficiente/);
  assert.match(sql,/Conflito com Funcionário/);
  assert.match(sql,/where code=target_rejection->>'code' and active/);
  assert.match(sql,/rejection_label = case when target_action='reject' then rejection.label/);
  assert.match(sql,/'rejection_data',rejection_details/);
  assert.match(sql,/manage_unit_request_review\(uuid, uuid, text, text, integer, jsonb\)/);
});

test('recusa de banco registra informação sem alterar saldo', async () => {
  const sql = await read('supabase/migrations/20261005170000_unit_request_workflow.sql');
  const operation = sql.slice(sql.indexOf('create or replace function public.manage_unit_request_review'),sql.indexOf('revoke all on function public.manage_unit_request_review'));
  assert.doesNotMatch(operation,/update public.time_bank/);
  assert.match(operation,/Saldo informado pelo RH/);
});

test('interface possui campos condicionais, motivo e orientação sem referência legal inventada', async () => {
  const [app,operation] = await Promise.all([read('assets/app.js'),read('supabase/functions/manage-operations/index.ts')]);
  assert.match(app,/id="rejection-code"/);
  assert.match(app,/id="rejection-available"/);
  assert.match(app,/id="rejection-employee"/);
  assert.match(app,/notes, rejection/);
  assert.match(app,/Motivo: \$\{esc\(review.rejection_label\)/);
  assert.match(app,/consulte a norma homologada e o RH/);
  assert.match(operation,/validateRejection\(reason,payload.rejection,payload.notes\)/);
});
