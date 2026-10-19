import test from 'node:test';import assert from 'node:assert/strict';import{leaveItem,leaveOperation}from'../supabase/functions/_shared/rh-leaves.mjs';
const id='f7000000-0000-0000-0000-000000000001';
const regular={type:'regulamentar',regime:'efetivo',dateMode:'start',startDate:'2027-03-01',admissionDate:'2020-01-01',acquisitionStart:'2025-01-01',acquisitionEnd:'2025-12-31',protocolDate:'2026-10-01',recognitionReference:'Processo sintético',absenceCount:0,suspended:false,cltLoss:false,regularLicenseLoss:false,eligibilityConfirmed:true,managerConsent:true};
test('novo lançamento aceita apenas férias; horas, exceções e autoria forjada são recusadas',()=>{
 assert.equal(leaveItem(regular).regime,'efetivo');
 for(const patch of [{type:'banco_horas'},{availableHours:8},{extraHours:8},{override:true},{operatorId:id},{bondId:id}])assert.throws(()=>leaveItem({...regular,...patch}),/RH_LEAVE_/);
});
test('regime, comprovação, anuência e impedimentos precisam ser conferidos',()=>{
 for(const patch of [{regime:''},{regime:'estatutario_generico'},{eligibilityConfirmed:false},{managerConsent:false},{recognitionReference:''},{suspended:'no'},{cltLoss:undefined},{regularLicenseLoss:undefined}])assert.throws(()=>leaveItem({...regular,...patch}),/RH_LEAVE_/);
 assert.equal(leaveItem({...regular,regime:'especial'}).regime,'especial'); // servidor impede regime não regulamentado
});
test('datas reais, contadores e limites são verificados antes do banco',()=>{
 for(const patch of [{acquisitionEnd:'2027-02-30'},{protocolDate:''},{admissionDate:'inválido'},{absenceCount:-1},{absenceCount:1.5},{healthLeaveDays:Infinity},{notes:'x'.repeat(1001)},{parts:[10,10,10,10]},{parts:[14,0,16]}])assert.throws(()=>leaveItem({...regular,...patch}),/RH_LEAVE_/);
 assert.equal(leaveItem({...regular,acquisitionEnd:'2028-02-29'}).acquisitionEnd,'2028-02-29');
});
test('fracionamentos municipais e CLT são enviados para conferência normativa no servidor',()=>{
 for(const split of ['none','15-10','10-15','15-15','30-60','60-30'])assert.equal(leaveItem({...regular,split}).split,split);
 assert.deepEqual(leaveItem({...regular,regime:'celetista',parts:[14,8,8],thirdStartDate:'2027-09-01'}).parts,[14,8,8]);
 assert.throws(()=>leaveItem({...regular,split:'13-12'}),/RH_LEAVE_/);
});
test('gravação exige prévia, chave e beneficiário válidos; contexto não vem do cliente',()=>{
 const payload={action:'create-leave',entryId:id,item:regular,requestKey:id,digest:'a'.repeat(64),target_profile:'forjado'};
 const op=leaveOperation(payload);assert.equal(op.name,'rh_create_leave');assert.equal(op.args.target_profile,undefined);
 for(const patch of [{digest:'x'},{requestKey:'x'},{entryId:'x'}])assert.throws(()=>leaveOperation({...payload,...patch}),/RH_LEAVE_/);
});
test('revisão deriva beneficiário do registro e exige versão e motivo',()=>{
 const payload={action:'revise-leave',leaveId:id,version:2,item:regular,reason:'  Conferência documental  ',requestKey:id,digest:'a'.repeat(64),entryId:'forjado'};
 const op=leaveOperation(payload);assert.equal(op.args.target_reason,'Conferência documental');assert.equal(op.args.target_entry,undefined);
 for(const patch of [{version:0},{version:Infinity},{reason:''},{digest:'x'},{leaveId:'x'}])assert.throws(()=>leaveOperation({...payload,...patch}),/RH_LEAVE_/);
});
test('encerramento mantém versão e motivo obrigatórios',()=>{
 const payload={action:'close-leave',leaveId:id,version:1,status:'cancelada',reason:'Cancelamento conferido'};
 assert.equal(leaveOperation(payload).args.expected_version,1);
 for(const patch of [{version:0},{status:'aprovada'},{reason:''}])assert.throws(()=>leaveOperation({...payload,...patch}),/RH_LEAVE_/);
});
test('retorno envia apenas a data ativa e rejeita contextos internos de revisão',()=>{
 const {startDate,...rest}=regular;assert.equal(leaveItem({...rest,dateMode:'return',returnDate:'2027-03-09'}).startDate,undefined);
 for(const patch of [{dateMode:'outro'},{returnDate:'2027-02-30'},{startDate:'2027-03-01'},{revision:true},{_revisionLeave:id}])assert.throws(()=>leaveItem({...rest,dateMode:'return',returnDate:'2027-03-09',...patch}),/RH_LEAVE_/);
});

test('modo simplificado aceita só fim aquisitivo e não fabrica aceites nem admissão',()=>{
 const {admissionDate,acquisitionStart,eligibilityConfirmed,managerConsent,...simple}=regular;
 const result=leaveItem({...simple,entryMode:'simplified'});assert.equal(result.acquisitionEnd,regular.acquisitionEnd);
 for(const field of ['admissionDate','acquisitionStart','eligibilityConfirmed','managerConsent','employeeConsent'])assert.equal(result[field],undefined);
 assert.throws(()=>leaveItem({...simple,entryMode:'outro'}),/RH_LEAVE_INPUT_INVALID/);
 assert.throws(()=>leaveItem({...simple,entryMode:'simplified',acquisitionEnd:'2025-02-30'}),/RH_LEAVE_INPUT_INVALID/);
});

test('data de comunicação pode ser omitida no formulário simplificado, sem inventar protocolo',()=>{
 const {admissionDate,acquisitionStart,protocolDate,eligibilityConfirmed,managerConsent,...simple}=regular;
 const result=leaveItem({...simple,entryMode:'simplified'});assert.equal(result.protocolDate,undefined);
});
