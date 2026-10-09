// Ensaio identificado; somente novos dados TESTE08. Não envia e-mail nem redefine conta existente.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const base = 'https://ijhvbzomakbbxverqfqh.supabase.co';
const key = 'sb_publishable_9upWl4mCzsfuaPE1_gOFkw_9Im-Y4sJ';
const mode = process.argv[2];
assert.ok(['prepare', 'resume', 'verify', 'cleanup'].includes(mode), 'Modo explícito prepare/resume/verify/cleanup obrigatório.');
assert.equal(process.env.SGF_PILOT_REHEARSAL, 'yes', 'Confirmar destino compartilhado com SGF_PILOT_REHEARSAL=yes.');
assert.ok(process.env.SGF_TEST_ADMIN_PASSWORD, 'Credencial administrativa ausente.');
const fixturePath = new URL('../.sgf-backups/bloco08/fixture.json', import.meta.url);
async function call(fn, payload, token, context = {}) {
  const response = await fetch(`${base}/functions/v1/${fn}`, { method:'POST',
    headers:{'content-type':'application/json',apikey:key,...(token?{authorization:`Bearer ${token}`} : {}),
      ...(context.role?{'x-sgf-role':context.role}:{}),...(context.bond_id?{'x-sgf-bond':context.bond_id}:{}),
      ...(context.cnes_unit_id?{'x-sgf-cnes':context.cnes_unit_id}:{}),...(context.lotacao_id?{'x-sgf-lotacao':context.lotacao_id}:{})},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(60000) });
  const body = await response.json();
  assert.ok(response.ok, `${fn}/${payload.action}: ${response.status} ${body.error || ''}`);
  return body;
}
const admin = await call('access-auth',{action:'login',identifier:'admin',password:process.env.SGF_TEST_ADMIN_PASSWORD});
const globalContext = {role:'administrador'};
if (mode === 'prepare') {
  assert.ok(process.env.SGF_REHEARSAL_PASSWORD?.length >= 12, 'Senha nova de ensaio obrigatória.');
  const fs = await import('node:fs');
  assert.ok(!fs.existsSync(fixturePath), 'Fixture existente: conferir/encerrar antes de nova preparação.');
  const catalog = await call('access-auth',{action:'registration-catalogs'});
  const profiles = await call('manage-profiles',{action:'list'},admin.access_token,globalContext);
  const units = ['2126028','2126060'].map(code => catalog.cnesUnits.find(u => u.code === code));
  const position = catalog.positions.find(p => p.name === 'Apoio Administrativo');
  const locations = units.map(u => profiles.locations.find(l => l.code === u?.code));
  assert.ok(units.every(Boolean) && locations.every(Boolean) && position);
  let cpf = `91808${String(Math.floor(Math.random()*10000)).padStart(4,'0')}`;
  for (let n=9;n<=10;n++) cpf += ([...cpf].reduce((s,d,i)=>s+Number(d)*(n+1-i),0)*10%11)%10;
  const tag = `TESTE08-${Date.now()}`, email = `sgf-${tag.toLowerCase()}@betim.mg.gov.br`;
  const created = await call('manage-profiles',{action:'create',full_name:`TESTE BLOCO 08 — Treinamento ${tag}`,email,cpf,birth_date:'1990-01-15',
    roles:['servidor','diretor','rh','administrador'],scope_ids:locations.map(l=>l.id),
    bonds:[{registration:`${tag}-M1`,cargo_id:position.id,employment_type:'efetivo',weekly_hours:40,
      units:units.map(u=>({cnes_unit_id:u.id,not_applicable:true,weekly_hours:20}))},
      {registration:`${tag}-M2`,cargo_id:position.id,employment_type:'efetivo',weekly_hours:20,
        units:[{cnes_unit_id:units[1].id,not_applicable:true,weekly_hours:20}]}]},admin.access_token,globalContext);
  // Registrar imediatamente para permitir encerramento mesmo se etapas seguintes falharem.
  mkdirSync(new URL('../.sgf-backups/bloco08/',import.meta.url),{recursive:true});
  const fixture = {id:created.id,email,cpf,tag,contexts:[]};
  writeFileSync(fixturePath,JSON.stringify(fixture,null,2));
  const first = await call('access-auth',{action:'login',identifier:email,password:created.temporary_password});
  await call('access-auth',{action:'change-password',password:process.env.SGF_REHEARSAL_PASSWORD},first.access_token);
  await new Promise(resolve=>setTimeout(resolve,3100));
  const fresh = await call('access-auth',{action:'login',identifier:email,password:process.env.SGF_REHEARSAL_PASSWORD});
  const contexts = (await call('access-auth',{action:'contexts'},fresh.access_token)).contexts;
  assert.ok(['servidor','diretor','rh','administrador'].every(role=>contexts.some(c=>c.role===role)));
  fixture.contexts = contexts;
  writeFileSync(fixturePath,JSON.stringify(fixture,null,2));
  for (const bond of [...new Set(contexts.filter(c=>c.role==='servidor').map(c=>c.bond_id))]) {
    const resources = await call('manage-operations',{action:'bond-resources',bond_id:bond},admin.access_token,globalContext);
    await call('manage-operations',{action:'time-bank',bond_id:bond,hours:80,description:`${tag} — crédito sintético de ensaio`,occurred_on:'2026-10-09',version:resources.account?.version||0,entry_key:crypto.randomUUID()},admin.access_token,globalContext);
  }
  console.log(JSON.stringify({passed:'Conta nova fictícia, quatro perfis, duas matrículas e dois CNES; senha nova definida somente para a conta criada; sem e-mail',fixture:{id:fixture.id,email,tag},contexts:contexts.map(c=>({role:c.role,registration:c.registration,cnes_code:c.cnes_code}))}));
} else if (mode === 'resume') {
  const fixture = JSON.parse(readFileSync(fixturePath,'utf8'));
  assert.match(fixture.tag,/^TESTE08-\d+$/);
  const profiles = await call('manage-profiles',{action:'list'},admin.access_token,globalContext);
  const profile = profiles.profiles.find(p=>p.id===fixture.id);
  assert.ok(profile?.full_name.includes(fixture.tag) && profile.email===fixture.email && !profile.disabled_at,'Alvo não corresponde ao ensaio ativo.');
  const fresh = await call('access-auth',{action:'login',identifier:fixture.email,password:process.env.SGF_REHEARSAL_PASSWORD});
  fixture.contexts = (await call('access-auth',{action:'contexts'},fresh.access_token)).contexts;
  assert.ok(['servidor','diretor','rh','administrador'].every(role=>fixture.contexts.some(c=>c.role===role)));
  writeFileSync(fixturePath,JSON.stringify(fixture,null,2));
  for (const bond of [...new Set(fixture.contexts.filter(c=>c.role==='servidor').map(c=>c.bond_id))]) {
    const resources = await call('manage-operations',{action:'bond-resources',bond_id:bond},admin.access_token,globalContext);
    if (resources.account?.validated_minutes === 4800) continue;
    assert.ok(!resources.account?.validated_minutes && !resources.entries?.length, 'Saldo ou histórico existente: conferir antes de adicionar novo crédito.');
    await call('manage-operations',{action:'time-bank',bond_id:bond,hours:80,description:`${fixture.tag} — crédito sintético de ensaio`,occurred_on:'2026-10-09',version:resources.account?.version||0,entry_key:crypto.randomUUID()},admin.access_token,globalContext);
  }
  console.log(JSON.stringify({passed:'Ensaio retomado com nova sessão após troca de senha',id:fixture.id,email:fixture.email,contexts:fixture.contexts}));
} else {
  const fixture = JSON.parse(readFileSync(fixturePath,'utf8'));
  assert.match(fixture.tag,/^TESTE08-\d+$/);
  const profiles = await call('manage-profiles',{action:'list'},admin.access_token,globalContext);
  const profile = profiles.profiles.find(p=>p.id===fixture.id);
  assert.ok(profile?.full_name.includes(fixture.tag) && profile.email===fixture.email,'Alvo não corresponde ao ensaio.');
  const bonds = [...new Set(fixture.contexts.filter(c=>c.role==='servidor').map(c=>c.bond_id))];
  assert.ok(bonds.length && bonds.every(b=>/^[a-f0-9-]{36}$/.test(b)), 'Vínculos de ensaio ausentes.');
  const response = await fetch(`${base}/rest/v1/vacation_requests?context_bond_id=in.(${bonds.join(',')})&select=id,status`,{headers:{apikey:key,authorization:`Bearer ${admin.access_token}`,'x-sgf-role':'administrador'},signal:AbortSignal.timeout(60000)});
  assert.ok(response.ok);
  const requests = await response.json();
  if (mode === 'verify') {
    assert.equal(requests.length,1, 'Esperado somente o pedido fictício deste ensaio.');
    assert.equal(requests[0].status,'programada');
    const resources = await call('manage-operations',{action:'bond-resources',bond_id:bonds[0]},admin.access_token,globalContext);
    assert.equal(resources.account.validated_minutes,48*60,'Dois CNES não duplicam débito das 32h.');
    const other = await call('manage-operations',{action:'bond-resources',bond_id:bonds[1]},admin.access_token,globalContext);
    assert.equal(other.account.validated_minutes,80*60,'Segunda matrícula preserva saldo próprio.');
    console.log(JSON.stringify({passed:'Pedido programado; débito único de 32h na primeira matrícula e saldo da segunda preservado',request_id:requests[0].id}));
    process.exit(0);
  }
  for (const r of requests.filter(r=>!['cancelada','rejeitada','concluida'].includes(r.status))) {
    await call('manage-operations',{action:'operation',request_id:r.id,operation:'cancelar',notes:`${fixture.tag} — encerramento de teste, preservar histórico`},admin.access_token,globalContext);
  }
  for (const bond of bonds) {
    const resources = await call('manage-operations',{action:'bond-resources',bond_id:bond},admin.access_token,globalContext);
    assert.equal(resources.account.validated_minutes,80*60,'Cancelamento deve estornar eventual débito de teste.');
  }
  if (!profile.disabled_at) await call('manage-profiles',{action:'deactivate',profile_id:fixture.id},admin.access_token,globalContext);
  const after = await call('manage-profiles',{action:'list'},admin.access_token,globalContext);
  assert.ok(after.profiles.find(p=>p.id===fixture.id)?.disabled_at);
  console.log(JSON.stringify({passed:'Pedidos de teste encerrados e conta desativada, sem exclusão física ou alteração de contas antigas',requests:requests.length}));
}
