// Motivo técnico identificado; nunca modifica motivos reais nem senhas.
import assert from 'node:assert/strict';
const url='https://ijhvbzomakbbxverqfqh.supabase.co',key='sb_publishable_9upWl4mCzsfuaPE1_gOFkw_9Im-Y4sJ';
if(!process.env.SGF_TEST_ADMIN_PASSWORD)throw Error('Credencial administrativa ausente.');
const code=`teste_bloco06_${Date.now()}`;let token,current;
async function call(fn,payload){
 const r=await fetch(`${url}/functions/v1/${fn}`,{method:'POST',headers:{apikey:key,'content-type':'application/json',...(token?{authorization:`Bearer ${token}`,'x-sgf-role':'administrador'}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
 return {status:r.status,body:await r.json()};
}
async function ok(fn,payload){const r=await call(fn,payload);assert.equal(r.status,200,r.body.error);return r.body;}
const pass=n=>console.log(JSON.stringify({passed:n}));
token=(await ok('access-auth',{action:'login',identifier:'admin',password:process.env.SGF_TEST_ADMIN_PASSWORD})).access_token;
const original=(await ok('manage-operations',{action:'rejection-reasons',include_inactive:true})).reasons;
const save=values=>({action:'rejection-reason-save',code,label:'TESTE BLOCO06 — catálogo',input_mode:'other',active:true,display_order:999,version:0,justification:'TESTE BLOCO06 — ensaio controlado',...values});
try{
 current=(await ok('manage-operations',save())).reason;assert.equal(current.version,1);pass('Criação administrativa com versão inicial');
 const results=await Promise.all(['A','B'].map(label=>call('manage-operations',save({label:`TESTE BLOCO06 — concorrência ${label}`,version:1}))));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const conflict=results.find(r=>r.status===409);assert.equal(conflict.body.code,'REASON_VERSION_CONFLICT');assert.match(conflict.body.error,/Atualize o catálogo/);
 current=results.find(r=>r.status===200).body.reason;pass('Duas requisições simultâneas: uma grava, outra exige atualização');
 assert.equal((await call('manage-operations',save({version:current.version,input_mode:'bank'}))).status,400);
 assert.equal((await call('manage-operations',save({version:current.version,label:''}))).status,400);pass('Modo histórico imutável e campos obrigatórios');
 const audit=await ok('manage-operations',{action:'audit-history',start_date:'2026-10-09',end_date:'2026-10-09',event:'rejection_reason_save'});
 assert.ok(audit.events.some(e=>JSON.stringify(e).includes(code)));pass('Auditoria da gravação com motivo técnico identificado');
}finally{
 if(current){current=(await ok('manage-operations',save({version:current.version,active:false,justification:'TESTE BLOCO06 — ensaio encerrado'}))).reason;assert.equal(current.active,false);}
 const after=(await ok('manage-operations',{action:'rejection-reasons',include_inactive:true})).reasons;
 for(const reason of original)assert.deepEqual(after.find(r=>r.code===reason.code),reason);
 assert.ok(!(await ok('manage-operations',{action:'rejection-reasons'})).reasons.some(r=>r.code===code));pass('Motivo técnico desativado; catálogo original integralmente preservado');
}
