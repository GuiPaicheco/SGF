import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const read = path => readFile(new URL(`../${path}`,import.meta.url),'utf8');
const dependency = stripTypeScriptTypes(await read('supabase/functions/_shared/scoped-notifications.ts'));
const dependencyURL = `data:text/javascript;base64,${Buffer.from(dependency).toString('base64')}`;
const code = stripTypeScriptTypes((await read('supabase/functions/_shared/audit-history.ts')).replace("'./scoped-notifications.ts'", JSON.stringify(dependencyURL)));
const {sanitizeAudit,auditInScope,auditDTO,loadAuditHistory,auditSearchPattern} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const context = {global:false,role:'rh',cnesUnitId:'X',lotacaoId:'D1'};
const row = {id:1,context_cnes_unit_id:'X',context_lotacao_id:'D1',actor:{full_name:'Gestor'},
  previous_value:{status:'pendente',cpf:'nao-exibir'},new_value:{status:'programada',employees:['outra-unidade'],password:'segredo'}};

test('busca amigável valida tamanho/tipo e trata curingas como texto literal', () => {
  assert.equal(auditSearchPattern(' Maria '),'%Maria%');
  assert.equal(auditSearchPattern('10%_'),'%10\\%\\_%');
  assert.equal(auditSearchPattern('  '),null);
  for (const input of ['A','x'.repeat(121),'Jo\nana',{},42]) assert.throws(() => auditSearchPattern(input),/AUDIT_FILTER_INVALID/);
});

test('nome e matrícula filtram eventos no banco antes da paginação sem ampliar escopo', async () => {
  const calls = [];
  const q = {select: value => {calls.push(['select',value]); return q;},gte: () => q,lte: () => q,
    eq: (...args) => {calls.push(['eq',...args]); return q;},or: () => q,
    ilike: (...args) => {calls.push(['ilike',...args]); return q;},order: () => q,
    range: async (...args) => {calls.push(['range',...args]); return {data:[row]};}};
  const admin = {from: table => table === 'lotacoes' ? {select: () => ({eq: () => ({single: async () => ({data:{id:'D1',is_internal_allocation:true}})})})} : q};
  await loadAuditHistory(admin,context,{start_date:'2026-10-01',end_date:'2026-10-08',actor_name:'Gestor',registration:'123'});
  assert.match(calls[0][1],/actor:profiles!audit_events_actor_id_fkey!inner/);
  assert.match(calls[0][1],/bond:employment_bonds!audit_events_context_bond_id_fkey!inner/);
  assert.ok(calls.some(x => x.join() === 'eq,context_lotacao_id,D1'));
  assert.ok(calls.some(x => x.join() === 'ilike,actor.full_name,%Gestor%'));
  assert.ok(calls.some(x => x.join() === 'ilike,bond.registration,%123%'));
  assert.equal(calls.at(-1)[0],'range');
  calls.length = 0;
  await loadAuditHistory(admin,context,{start_date:'2026-10-01',end_date:'2026-10-08'});
  assert.doesNotMatch(calls[0][1],/!inner/);
});

test('histórico de RH não atravessa CNES ou lotação interna; legado sem escopo não é inferido', () => {
  assert.equal(auditInScope(row,context,'D1'),true);
  assert.equal(auditInScope({...row,context_lotacao_id:'D2'},context,'D1'),false);
  assert.equal(auditInScope({...row,context_cnes_unit_id:'Y'},context,'D1'),false);
  assert.equal(auditInScope({...row,context_cnes_unit_id:null},context,'D1'),false);
  assert.equal(auditInScope(row,{global:true},null),true);
});

test('unidade geral aceita seu identificador legado mas não uma diretoria do mesmo CNES', () => {
  assert.equal(auditInScope({...row,context_lotacao_id:null},context,null),true);
  assert.equal(auditInScope(row,context,null),true);
  assert.equal(auditInScope({...row,context_lotacao_id:'D2'},context,null),false);
});

test('detalhes administrativos removem credenciais recursivamente sem alterar o original', () => {
  const input = {name:'Servidor',nested:[{password:'abc',refresh_token:'def',api_key:'ghi',status:'active'}]};
  assert.deepEqual(sanitizeAudit(input),{name:'Servidor',nested:[{status:'active'}]});
  assert.equal(input.nested[0].password,'abc');
});

test('resumo do RH não contém CPF ou dados de cadastros/unidades presentes nos payloads', () => {
  const dto = auditDTO(row,false);
  assert.deepEqual(dto.before,{status:'pendente'});
  assert.deepEqual(dto.after,{status:'programada'});
  assert.doesNotMatch(JSON.stringify(dto),/nao-exibir|outra-unidade|segredo/);
  assert.equal(auditDTO(row,true).after.password,undefined);
});

test('consulta valida período, evento, identificadores e paginação e rejeita Servidor', async () => {
  const admin = {from: () => {throw Error('Não deve consultar o banco');}};
  await assert.rejects(loadAuditHistory(admin,{role:'servidor'},{}),/AUDIT_ACCESS_DENIED/);
  for (const dates of [{start_date:'2026-02-31',end_date:'2026-03-01'},{start_date:'2026-10-09',end_date:'2026-10-08'},{start_date:'2020-01-01',end_date:'2026-10-08'}]) {
    await assert.rejects(loadAuditHistory(admin,{role:'administrador',global:true},dates),/AUDIT_PERIOD_INVALID/);
  }
  await assert.rejects(loadAuditHistory(admin,{role:'administrador',global:true},{start_date:'2026-10-01',end_date:'2026-10-08',event:'bad,filter'}),/AUDIT_FILTER_INVALID/);
});

test('gravação usa o nome real da coluna anterior e consulta não depende de leitura direta', async () => {
  const [sql,app,operation] = await Promise.all([read('supabase/migrations/20261005170000_unit_request_workflow.sql'),read('assets/app.js'),read('supabase/functions/manage-operations/index.ts')]);
  assert.doesNotMatch(sql,/old_value/);
  assert.match(sql,/action,entity_type,previous_value,new_value/);
  assert.match(sql,/audit_fill_access_context before insert/);
  assert.match(sql,/revoke select on public.audit_events from authenticated/);
  assert.match(operation,/action === 'audit-history'/);
  assert.match(app,/'audit-history': renderAuditHistory/);
  assert.match(app,/data-audit-page=/);
  assert.match(app,/esc\(JSON.stringify\(item.before/);
});

test('consulta impõe escopo no banco e paginação antes de projetar o resumo', async () => {
  const calls = [];
  const q = {select: () => q, gte: () => q, lte: () => q,
    eq: (...args) => {calls.push(args); return q;}, or: () => q, order: () => q,
    range: async (start,end) => {calls.push(['range',start,end]); return {data:[row,{...row,context_lotacao_id:'D2'}]};}};
  const admin = {from: table => table === 'lotacoes' ? {select: () => ({eq: () => ({single: async () => ({data:{id:'D1',is_internal_allocation:true}})})})} : q};
  const result = await loadAuditHistory(admin,context,{start_date:'2026-10-01',end_date:'2026-10-08',page:1});
  assert.equal(result.events.length,1);
  assert.ok(calls.some(args => args.join() === 'context_cnes_unit_id,X'));
  assert.ok(calls.some(args => args.join() === 'context_lotacao_id,D1'));
  assert.ok(calls.some(args => args.join() === 'range,50,100'));
  await assert.rejects(loadAuditHistory(admin,context,{start_date:'2026-10-01',end_date:'2026-10-08',actor_id:'invalid'}),/AUDIT_FILTER_INVALID/);
});

test('servidor afetado é distinto do autor e DTO não expõe identidade sensível', () => {
  const dto = auditDTO({...row,affected_name:'Ana Silva',affected_source:'at_event',affected_servidor_id:'ID_INTERNO',cpf:'CPF_OCULTO'},false);
  assert.equal(dto.actor_name,'Gestor'); assert.equal(dto.affected_name,'Ana Silva');
  assert.equal(dto.affected_source,'at_event');
  assert.doesNotMatch(JSON.stringify(dto),/ID_INTERNO|CPF_OCULTO/);
  assert.equal(auditDTO(row,false).affected_name,null);
});

test('busca por servidor afetado combina com autor/escopo antes da paginação', async () => {
  const calls = [];
  const q = {select: () => q,gte: () => q,lte: () => q,or: () => q,
    eq: (...args) => {calls.push(['eq',...args]); return q;},
    ilike: (...args) => {calls.push(['ilike',...args]); return q;},order: () => q,
    range: async (...args) => {calls.push(['range',...args]); return {data:[{...row,affected_name:'Ana Silva'}]};}};
  const admin = {from: table => table === 'lotacoes' ? {select: () => ({eq: () => ({single: async () => ({data:{id:'D1',is_internal_allocation:true}})})})} : q};
  const result = await loadAuditHistory(admin,context,{start_date:'2026-10-01',end_date:'2026-10-08',affected_name:'Ana',actor_name:'Gestor'});
  assert.ok(calls.some(x => x.join() === 'eq,context_cnes_unit_id,X'));
  assert.ok(calls.some(x => x.join() === 'eq,context_lotacao_id,D1'));
  assert.ok(calls.some(x => x.join() === 'ilike,affected_name,%Ana%'));
  assert.ok(calls.some(x => x.join() === 'ilike,actor.full_name,%Gestor%'));
  assert.equal(calls.at(-1)[0],'range'); assert.equal(result.events[0].affected_name,'Ana Silva');
  await assert.rejects(loadAuditHistory(admin,context,{start_date:'2026-10-01',end_date:'2026-10-08',affected_name:{name:'Ana'}}),/AUDIT_FILTER_INVALID/);
});

test('SQL resolve somente relações conhecidas e não deriva servidor do ator/contexto', async () => {
  const sql = await read('supabase/migrations/20261005170000_unit_request_workflow.sql');
  const resolver = sql.slice(sql.indexOf('create function private.resolve_audit_subject'),sql.indexOf('revoke all on function private.resolve_audit_subject'));
  assert.match(resolver,/stable security invoker set search_path = ''/);
  assert.match(resolver,/public.request_unit_reviews v/);
  assert.match(resolver,/public.request_approvals a/);
  assert.match(resolver,/cardinality\(people\)=1/);
  assert.match(resolver,/invalid_text_representation then return null/);
  assert.doesNotMatch(resolver,/where .*actor_id|where .*context_bond_id/);
  assert.match(sql,/audit_fill_affected_subject before insert/);
  assert.match(sql,/affected_source='reconciled_current'/);
  const start = sql.lastIndexOf('with subjects as');
  const backfill = sql.slice(start,sql.indexOf(';',start));
  assert.doesNotMatch(backfill,/context_cnes_unit_id|context_lotacao_id/);
});

test('interface diferencia nome afetado, autor e origem histórica sem inserir HTML externo', async () => {
  const app = await read('assets/app.js');
  assert.match(app,/\['affected_name','Nome do servidor afetado'\]/);
  assert.match(app,/Servidor afetado: \$\{esc\(item.affected_name\)\}/);
  assert.match(app,/nome atual na reconciliação/);
  assert.match(app,/nome registrado na ação/);
});
