import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUnitLogin,verifiedSessionId,provisionRhAccount} from '../supabase/functions/_shared/rh-accounts.mjs';
import {limitedJson} from '../supabase/functions/_shared/limited-json.mjs';
const slot={auth_user_id:'a0000000-0000-0000-0000-000000000001',internal_email:'unit@example.invalid',code:'6305245',login_name:'UBS AMAZONAS'};
const user={id:slot.auth_user_id,email:slot.internal_email,app_metadata:{sgf_rh_cnes:slot.code}};
test('normalização aceita acentos e espaços sem ampliar o catálogo',()=>{
 assert.equal(normalizeUnitLogin('  ubs são   joão '),'UBS SAO JOAO');assert.equal(normalizeUnitLogin(null),'');assert.equal(normalizeUnitLogin('a'.repeat(161)),'');
});
test('sessão exige titular, UUID hexadecimal e validade',()=>{
 const token=payload=>'x.'+Buffer.from(JSON.stringify(payload)).toString('base64url')+'.x';
 const payload={sub:slot.auth_user_id,session_id:'a0000000-0000-0000-0000-000000000002',exp:Date.now()/1000+60};
 assert.equal(verifiedSessionId(token(payload),slot.auth_user_id),payload.session_id);
 for(const changed of [{sub:'other'},{session_id:'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'},{exp:0}])assert.throws(()=>verifiedSessionId(token({...payload,...changed}),slot.auth_user_id),/RH_SESSION_INVALID/);
});
test('provisionamento existente não consulta Auth nem altera senha',async()=>{
 const result=await provisionRhAccount({...slot,profile_id:user.id},undefined,{});assert.equal(result.status,'already_exists');
});
test('criação usa reserva estável e retomada não redefine senha',async()=>{
 let attributes,finished;
 await provisionRhAccount(slot,'TestOnly!987',{getUser:async()=>({error:{status:404}}),createUser:async args=>{attributes=args;return {data:{user}};},finish:async id=>{finished=id;}});
 assert.equal(attributes.id,slot.auth_user_id);assert.equal(attributes.email_confirm,true);assert.equal(finished,user.id);
 await provisionRhAccount(slot,'OtherTest!987',{getUser:async()=>({data:{user}}),createUser:()=>assert.fail('não recriar'),finish:async()=>{}});
});
test('falha transitória e conflito não criam nem vinculam contas',async()=>{
 for(const found of [{error:{status:503}},{data:{user:{...user,email:'other@example.invalid'}}}])await assert.rejects(provisionRhAccount(slot,'TestOnly!987',{getUser:async()=>found,createUser:()=>assert.fail(),finish:()=>assert.fail()}),/RH_AUTH_UNAVAILABLE|RH_ACCOUNT_CONFLICT/);
});
test('criação concorrente retoma somente a mesma reserva',async()=>{
 let lookups=0;
 await provisionRhAccount(slot,'TestOnly!987',{getUser:async()=>++lookups===1?{error:{status:404}}:{data:{user}},createUser:async()=>({error:{status:422}}),finish:async()=>{}});
 assert.equal(lookups,2);
});
test('corpo JSON limita bytes e rejeita arrays e UTF-8 inválido',async()=>{
 const request=body=>new Request('https://example.invalid',{method:'POST',body});
 assert.deepEqual(await limitedJson(request('{"action":"session"}')),{action:'session'});
 for(const body of ['[]','null','x','x'.repeat(16001),new Uint8Array([255])])await assert.rejects(limitedJson(request(body)),/RH_INPUT_INVALID/);
});
