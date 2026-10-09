import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const read=p=>readFile(new URL(`../${p}`,import.meta.url),'utf8');
const dependency=stripTypeScriptTypes(await read('supabase/functions/_shared/scoped-notifications.ts'));
const dependencyURL=`data:text/javascript;base64,${Buffer.from(dependency).toString('base64')}`;
const source=stripTypeScriptTypes((await read('supabase/functions/_shared/audit-history.ts')).replace("'./scoped-notifications.ts'",JSON.stringify(dependencyURL)));
const {auditDTO,sanitizeAudit}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('histórico usa nome e matrícula capturados na ação, não o cadastro renomeado',()=>{
  const dto=auditDTO({actor_name_at_event:'Autor original',actor:{full_name:'Novo nome'},bond_registration_at_event:'M1',bond:{registration:'M2'}},true);
  assert.equal(dto.actor_name,'Autor original');assert.equal(dto.bond,'M1');
});
test('eventos coletivos preservam nomes sem inventar um único servidor',()=>{
  const dto=auditDTO({affected_names:['Ana','Bruna'],affected_name:null},false);
  assert.equal(dto.affected_name,null);assert.deepEqual(dto.affected_names,['Ana','Bruna']);
});
test('encerramento de conflito exibe motivo do encerramento sem alterar o motivo original',()=>{
 const row={action:'manual_conflict_resolve',reason:'Motivo original',new_value:{closure_reason:'Motivo do encerramento'}};
 assert.equal(auditDTO(row,false).reason,'Motivo do encerramento');
 assert.equal(row.reason,'Motivo original');
});
test('RH recebe diferenças operacionais, sem campos pessoais nem identidades de outros vínculos',()=>{
  const dto=auditDTO({previous_value:{weekly_hours:40,cpf:'CPF',email:'EMAIL',bond_unit_ids:['OUTRO']},new_value:{weekly_hours:32}},false);
  assert.equal(dto.before.weekly_hours,40);assert.equal(dto.after.weekly_hours,32);
  assert.doesNotMatch(JSON.stringify(dto),/CPF|EMAIL|OUTRO/);
});
test('cookies e credenciais embutidas em texto também são removidos',()=>{
  assert.deepEqual(sanitizeAudit({must_change_password:true,password:'secret'}),{must_change_password:true});
  assert.deepEqual(sanitizeAudit({cookie:'session',credentials:'value',reason:'Bearer token',text:'sb_secret_x',nested:['normal']}),
    {reason:'[credencial removida]',text:'[credencial removida]',nested:['normal']});
});
test('migração cobre tabelas cadastrais e operacionais sem funções internas públicas',async()=>{
  const sql=await read('supabase/migrations/20261009125707_block_five_notifications_audit.sql');
  for(const table of ['profiles','profile_scopes','servidores','employment_bonds','employment_bond_units','employment_bond_teams','access_requests','employee_inclusion_requests','vacation_rights','bond_time_bank_entries','vacation_requests','request_periods']) assert.ok(sql.includes(`'${table}'`));
  assert.match(sql,/domain_mutation_audit after insert or update or delete/);
  assert.match(sql,/AUDIT_HISTORY_IMMUTABLE/);
  assert.match(sql,/revoke all on public.audit_events from public,anon,authenticated/);
  assert.doesNotMatch(sql,/security definer/i);
});
test('paginação de avisos valida página/id e conserva a mesma guarda de leitura e escrita',async()=>{
  const sql=await read('supabase/functions/manage-operations/index.ts');
  assert.match(sql,/range\(page\*30,page\*30\+30\)/);
  assert.match(sql,/Number.isSafeInteger\(Number\(payload.id\)\)/);
  assert.match(sql,/has_more:\(data\|\|\[\]\).length>30/);
  const app=await read('assets/app.js');
  assert.match(app,/state.notificationsPage = 0/);
  assert.match(app,/data-notification-page="1"/);
});
test('alterações diretas encaminham identidade verificada; senha não entra no RPC de auditoria',async()=>{
  for(const file of ['manage-profiles','manage-access']){
    const code=await read(`supabase/functions/${file}/index.ts`);
    assert.match(code,/'x-sgf-actor':\s*identity.user.id/);
  }
  const auth=await read('supabase/functions/access-auth/index.ts');
  assert.match(auth,/rpc\('complete_password_change',\{actor_id:identity.user.id\}\)/);
});
