import test from 'node:test';
import assert from 'node:assert/strict';
import {leaveItem,leaveOperation} from '../supabase/functions/_shared/rh-leaves.mjs';
const uuid='f7000000-0000-0000-0000-000000000001';
const bank={type:'banco_horas',startDate:'2027-03-01',days:2,availableHours:15,dailyHours:7.5,birthDate:'1990-06-15',eligibilityConfirmed:true};
test('folga usa horas declaradas e jornada explícita sem aceitar autoria/vínculo do cliente',()=>{
 const value=leaveItem(bank);assert.equal(value.availableHours,15);assert.equal(value.dailyHours,7.5);assert.equal(value.override,false);
 for(const patch of [{operatorId:uuid},{bondId:uuid},{eligibilityConfirmed:false},{availableHours:-1},{availableHours:Infinity},{dailyHours:0},{dailyHours:25},{availableHours:0.0001}])assert.throws(()=>leaveItem({...bank,...patch}),/RH_LEAVE_/);
});
test('exceção requer escolha booleana e justificativa; horas zero continuam válidas para prévia',()=>{
 assert.equal(leaveItem({...bank,availableHours:0}).availableHours,0);
 assert.equal(leaveItem({...bank,override:true,overrideReason:'Exceção conferida'}).override,true);
 for(const patch of [{override:'true'},{override:true},{override:true,overrideReason:'x'},{override:true,overrideReason:'x'.repeat(501)}])assert.throws(()=>leaveItem({...bank,...patch}),/RH_LEAVE_/);
});
test('datas reais, quantidades limitadas e fracionamento declarado são verificados',()=>{
 for(const patch of [{startDate:'2027-02-30'},{birthDate:'invalid'},{days:0},{days:91},{days:1.5},{notes:'x'.repeat(1001)},{split:'13-12'}])assert.throws(()=>leaveItem({...bank,...patch}),/RH_LEAVE_INPUT_INVALID/);
 assert.equal(leaveItem({...bank,startDate:'2028-02-29'}).startDate,'2028-02-29');
});
test('férias preservam modalidades e exigem informação de aquisição e faltas',()=>{
 const regular={type:'regulamentar',startDate:'2027-05-03',acquisitionEnd:'2026-12-31',unjustifiedAbsences:'no',split:'15-10',secondStartDate:'2027-07-05',eligibilityConfirmed:true};
 assert.equal(leaveItem(regular).split,'15-10');assert.throws(()=>leaveItem({...regular,acquisitionEnd:''}),/RH_LEAVE_INPUT_INVALID/);
 assert.equal(leaveItem({type:'premio',startDate:'2027-05-03',days:90,eligibilityConfirmed:true}).days,90);
 assert.throws(()=>leaveItem({type:'premio',startDate:'2027-05-03',days:31,eligibilityConfirmed:true}),/RH_LEAVE_INPUT_INVALID/);
});
test('gravação exige prévia e idempotência; identidade autenticada não vem do payload',()=>{
 const operation=leaveOperation({action:'create-leave',entryId:uuid,item:bank,requestKey:uuid,digest:'a'.repeat(64),target_profile:'forjado'});
 assert.equal(operation.name,'rh_create_leave');assert.equal(operation.args.target_profile,undefined);assert.equal(operation.args.request_key,uuid);
 for(const patch of [{digest:'forjado'},{requestKey:'invalid'},{entryId:'invalid'}])assert.throws(()=>leaveOperation({action:'create-leave',entryId:uuid,item:bank,requestKey:uuid,digest:'a'.repeat(64),...patch}),/RH_LEAVE_/);
});
test('encerramento exige versão, estado permitido e motivo',()=>{
 const data={action:'close-leave',leaveId:uuid,version:1,status:'cancelada',reason:'Cancelamento conferido'};
 assert.equal(leaveOperation(data).args.expected_version,1);
 for(const patch of [{version:0},{status:'aprovada'},{reason:''},{leaveId:'invalid'}])assert.throws(()=>leaveOperation({...data,...patch}),/RH_LEAVE_INPUT_INVALID/);
});

test('reprogramação deriva beneficiário do registro e exige versão, motivo e envio identificado',()=>{
 const payload={action:'revise-leave',leaveId:uuid,version:2,item:bank,reason:'  Reprogramação conferida  ',requestKey:uuid,digest:'a'.repeat(64),entryId:'forjado',target_profile:'forjado'};
 const op=leaveOperation(payload);assert.equal(op.name,'rh_revise_leave');assert.equal(op.args.target_leave,uuid);assert.equal(op.args.target_entry,undefined);assert.equal(op.args.target_profile,undefined);assert.equal(op.args.target_reason,'Reprogramação conferida');
 assert.equal(leaveOperation({...payload,action:'preview-revision'}).name,'rh_preview_leave_revision');
 for(const patch of [{version:0},{version:1.5},{version:Infinity},{reason:''},{reason:false},{digest:''},{requestKey:'inválido'},{leaveId:'inválido'}])assert.throws(()=>leaveOperation({...payload,...patch}),/RH_LEAVE_/);
});
