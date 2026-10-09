// Somente conta técnica nova e identificada; nenhuma senha de conta existente é alterada.
import assert from 'node:assert/strict';
const url='https://ijhvbzomakbbxverqfqh.supabase.co';
const key='sb_publishable_9upWl4mCzsfuaPE1_gOFkw_9Im-Y4sJ';
const run=Number(process.env.SGF_REHEARSAL_RUN||1);
if(!Number.isInteger(run)||run<1||run>99) throw Error('Identificador de ensaio inválido.');
const email=`sgf-bloco05-20261009-${run}@betim.mg.gov.br`;
const registrationId=`SGF-BLOCO05-M${run}`;
const cpfBase=String(918058800+run);
const password=process.env.SGF_REHEARSAL_PASSWORD;
if(!password||!process.env.SGF_TEST_ADMIN_PASSWORD) throw Error('Credenciais de ensaio ausentes.');
const passed=[];
const record=name=>{passed.push(name);console.log(JSON.stringify({passed:name}));};
async function call(fn,payload,token,context){
 const response=await fetch(`${url}/functions/v1/${fn}`,{method:'POST',headers:{apikey:key,'content-type':'application/json',
 ...(token?{authorization:`Bearer ${token}`}:{ }),...(context?{'x-sgf-role':context.role,...(context.bond_id?{'x-sgf-bond':context.bond_id}:{}),...(context.cnes_unit_id?{'x-sgf-cnes':context.cnes_unit_id}:{}),...(context.lotacao_id?{'x-sgf-lotacao':context.lotacao_id}:{})}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(60000)});
 const body=await response.json();return {status:response.status,body};
}
async function ok(fn,payload,token,context){const r=await call(fn,payload,token,context);assert.equal(r.status,200,`${fn}/${payload.action}: ${r.status} ${r.body.error||''}`);return r.body;}
function cpf(base){let v=base;for(let n=9;n<=10;n++)v+=([...v].reduce((s,d,i)=>s+Number(d)*(n+1-i),0)*10%11)%10;return v;}
const admin=await ok('access-auth',{action:'login',identifier:'admin',password:process.env.SGF_TEST_ADMIN_PASSWORD});
const global={role:'administrador'};
const list=await ok('manage-profiles',{action:'list'},admin.access_token,global);
assert.ok(!list.profiles.some(p=>p.email===email),'Não redefinir/reutilizar conta existente. Use novo marcador para outro ensaio.');
const catalog=await ok('access-auth',{action:'registration-catalogs'});
const a=catalog.cnesUnits.find(u=>u.code==='2126028'),b=catalog.cnesUnits.find(u=>u.code==='2126060');
const location=list.locations.find(l=>l.code===a?.code),cargo=catalog.positions.find(p=>p.name==='Apoio Administrativo');
assert.ok(a&&b&&location&&cargo);
let profile;const conflicts=[];
try{
 profile=await ok('manage-profiles',{action:'create',full_name:'TESTE BLOCO 05 — Auditoria e avisos',email,cpf:cpf(cpfBase),birth_date:'1990-01-01',
 roles:['servidor','rh','diretor'],scope_ids:[location.id],bonds:[{registration:registrationId,cargo_id:cargo.id,employment_type:'estatutario',weekly_hours:40,
 units:[{cnes_unit_id:a.id,not_applicable:true,weekly_hours:20},{cnes_unit_id:b.id,not_applicable:true,weekly_hours:20}]}]},admin.access_token,global);
 const first=await ok('access-auth',{action:'login',identifier:email,password:profile.temporary_password});
 await ok('access-auth',{action:'change-password',password},first.access_token);
 await new Promise(resolve=>setTimeout(resolve,3100));
 const signed=await ok('access-auth',{action:'login',identifier:email,password});
 const contexts=(await ok('access-auth',{action:'contexts'},signed.access_token)).contexts;
 const owner=contexts.find(c=>c.role==='servidor'&&c.cnes_unit_id===a.id),other=contexts.find(c=>c.role==='servidor'&&c.cnes_unit_id===b.id);
 const rh=contexts.find(c=>c.role==='rh'),director=contexts.find(c=>c.role==='diretor');assert.ok(owner&&other&&rh&&director);
 record('Cadastro administrativo transacional e troca de senha auditada em conta técnica nova');
 const account=await ok('manage-operations',{action:'bond-resources',bond_id:owner.bond_id},admin.access_token,global);
 await ok('manage-operations',{action:'time-bank',bond_id:owner.bond_id,hours:10,description:'TESTE BLOCO05 — crédito sintético',occurred_on:'2026-10-09',version:account.account?.version||0,entry_key:crypto.randomUUID()},admin.access_token,global);
 record('Banco de horas por vínculo gera trilha e avisos');
 const created=await ok('manage-operations',{action:'manual-conflict-save',id:crypto.randomUUID(),conflict_action:'create',cnes_unit_id:a.id,bond_unit_id:owner.bond_unit_id,
 start_date:'2027-06-16',end_date:'2027-06-16',justification:'TESTE BLOCO05 — conferência de destinatários',version:0},signed.access_token,rh);
 conflicts.push(created.conflict);
 const notesA=(await ok('manage-operations',{action:'notifications'},signed.access_token,owner)).notifications;
 const notesB=(await ok('manage-operations',{action:'notifications'},signed.access_token,other)).notifications;
 assert.ok(notesA.some(n=>n.title==='Alerta de planejamento atualizado'));
 assert.ok(!notesB.some(n=>n.title==='Alerta de planejamento atualizado'));
 assert.ok(notesA.filter(n=>n.cnes).every(n=>n.cnes.code===a.code));assert.ok(notesB.filter(n=>n.cnes).every(n=>n.cnes.code===b.code));
 record('Aviso nominal do CNES A não aparece no contexto B do mesmo servidor');
 const filter={action:'audit-history',start_date:'2026-10-09',end_date:'2026-10-09',affected_name:'TESTE BLOCO 05'};
 const trail=await ok('manage-operations',filter,admin.access_token,global);assert.ok(trail.events.length>0);
 assert.ok(trail.events.some(e=>e.action==='password_changed'&&e.actor_name.startsWith('TESTE BLOCO 05')));
 const registration=await ok('manage-operations',{...filter,registration:registrationId},admin.access_token,global);assert.ok(registration.events.length>0);
 const authors=await ok('manage-operations',{...filter,actor_name:'TESTE BLOCO 05'},admin.access_token,global);assert.ok(authors.events.length>0);
 const event=await ok('manage-operations',{...filter,event:'manual_conflict_create'},admin.access_token,global);assert.ok(event.events.length>0);
 record('Buscas reais por afetado, autor, matrícula, evento e período');
 for(const context of [rh,director]){
  const scoped=await ok('manage-operations',filter,signed.access_token,context);
  assert.ok(scoped.events.length>0);assert.ok(scoped.events.every(e=>e.cnes===a.name));
  assert.doesNotMatch(JSON.stringify(scoped),/"cpf"|"email"|"password"|"access_token"|sb_secret_/i);
 }
 assert.equal((await call('manage-operations',{...filter,cnes_id:b.id},signed.access_token,rh)).body.events.length,0);
 assert.equal((await call('manage-operations',filter,signed.access_token,owner)).status,403);
 record('RH e Diretor recebem somente resumos do seu CNES; servidor não consulta auditoria');
 const all={action:'audit-history',start_date:'2026-10-01',end_date:'2026-10-09'};
 const page0=await ok('manage-operations',{...all,page:0},admin.access_token,global),page1=await ok('manage-operations',{...all,page:1},admin.access_token,global);
 assert.equal(page0.events.length,50);assert.equal(page0.has_more,true);assert.ok(page1.events.length>0);
 assert.ok(!page1.events.some(e=>page0.events.some(first=>first.id===e.id)));
 const n0=await ok('manage-operations',{action:'notifications',page:0},admin.access_token,global),n1=await ok('manage-operations',{action:'notifications',page:1},admin.access_token,global);
 assert.equal(n0.notifications.length,30);assert.equal(n0.has_more,true);assert.ok(n1.notifications.length>0);
 assert.ok(!n1.notifications.some(e=>n0.notifications.some(first=>first.id===e.id)));
 record('Paginação real: 50 eventos e 30 avisos por página, sem repetição no recorte estável');
 const foreign=notesA.find(n=>n.title==='Alerta de planejamento atualizado');
 await ok('manage-operations',{action:'read-notifications',id:foreign.id},signed.access_token,other);
 assert.ok(!(await ok('manage-operations',{action:'notifications'},signed.access_token,owner)).notifications.find(n=>n.id===foreign.id).read_at);
 await ok('manage-operations',{action:'read-notifications',id:foreign.id},signed.access_token,owner);
 assert.ok((await ok('manage-operations',{action:'notifications'},signed.access_token,owner)).notifications.find(n=>n.id===foreign.id).read_at);
 assert.equal((await call('manage-operations',{action:'notifications',page:-1},signed.access_token,owner)).status,400);
 record('Marcação de leitura respeita o mesmo contexto e página inválida é recusada');
}finally{
 for(const c of conflicts) await ok('manage-operations',{action:'manual-conflict-save',id:c.id,conflict_action:'resolve',justification:'TESTE BLOCO05 — ensaio encerrado',version:c.version},admin.access_token,global);
 if(profile?.id) await ok('manage-profiles',{action:'deactivate',profile_id:profile.id},admin.access_token,global);
}
console.log(JSON.stringify({total:passed.length,fixtureId:profile?.id,cleanup:'Conta técnica desativada; conflito encerrado; histórico preservado. Nenhum e-mail enviado.'}));
