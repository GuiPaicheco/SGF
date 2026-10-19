const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=()=>{throw Error('RH_LEAVE_INPUT_INVALID');};
const day=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail();const date=new Date(value+'T12:00:00Z');if(!Number.isFinite(date.valueOf())||date.toISOString().slice(0,10)!==value)fail();return value;};
export function leaveItem(item){
 if(!item||typeof item!=='object'||Array.isArray(item))fail();
 const fields=new Set(['entryMode','type','dateMode','returnDate','startDate','secondStartDate','thirdStartDate','admissionDate','acquisitionStart','acquisitionEnd','split','parts','regime','absenceCount','familyLeaveDays','personalLeaveDays','spouseLeaveDays','healthLeaveDays','suspended','cltLoss','prizeCycle','historicalUsedDays','previousPrizeStart','recognitionReference','protocolDate','managerConsent','employeeConsent','eligibilityConfirmed','rightId','notes','scheduleConfirmed','regularLicenseLoss']);
 if(Object.keys(item).some(key=>!fields.has(key))||!['regulamentar','premio'].includes(item.type))throw Error('RH_LEAVE_MODALITY_DISABLED');
 const simplified=item.entryMode==='simplified';if(item.entryMode!==undefined&&!simplified)fail();
 if(!simplified&&(item.eligibilityConfirmed!==true||item.managerConsent!==true))throw Error('RH_LEAVE_CONFIRMATION_REQUIRED');
 if(!['efetivo','comissionado','contratado_estatutario','acs_ace_estatutario','celetista','especial'].includes(item.regime))throw Error('RH_LEAVE_REGIME_REQUIRED');
 const mode=item.dateMode??'start';if(!['start','return'].includes(mode))fail();
 if((mode==='return'&&item.startDate)||(mode==='start'&&item.returnDate))fail();
 const result={type:item.type,regime:item.regime,dateMode:mode,...(mode==='return'?{returnDate:day(item.returnDate)}:{startDate:day(item.startDate)}),eligibilityConfirmed:true,managerConsent:true,employeeConsent:item.employeeConsent===true,scheduleConfirmed:item.scheduleConfirmed===true,split:item.split??'none',notes:item.notes??''};
 if(typeof result.notes!=='string'||result.notes.length>1000||typeof item.recognitionReference!=='string'||item.recognitionReference.trim().length<(simplified?1:3)||item.recognitionReference.length>300)throw Error('RH_LEAVE_EVIDENCE_REQUIRED');
 result.recognitionReference=item.recognitionReference.trim();
 if(simplified){result.entryMode='simplified';delete result.eligibilityConfirmed;delete result.managerConsent;delete result.employeeConsent;result.acquisitionEnd=day(item.acquisitionEnd);if(item.protocolDate)result.protocolDate=day(item.protocolDate);for(const k of ['admissionDate','acquisitionStart'])if(item[k])result[k]=day(item[k]);}
 else for(const k of ['admissionDate','acquisitionStart','acquisitionEnd','protocolDate'])result[k]=day(item[k]);
 for(const k of ['secondStartDate','thirdStartDate','previousPrizeStart'])if(item[k])result[k]=day(item[k]);
 for(const k of ['absenceCount','familyLeaveDays','personalLeaveDays','spouseLeaveDays','healthLeaveDays','prizeCycle','historicalUsedDays']){
  const v=item[k]??0;if(!Number.isInteger(v)||v<0||v>3000)fail();result[k]=v;
 }
 for(const k of ['suspended','cltLoss','regularLicenseLoss']){if(typeof item[k]!=='boolean')throw Error('RH_LEAVE_CONFIRMATION_REQUIRED');result[k]=item[k];}
 if(item.parts!==undefined){if(!Array.isArray(item.parts)||item.parts.length<1||item.parts.length>3||item.parts.some(x=>!Number.isInteger(x)||x<1||x>90))fail();result.parts=item.parts;}
 if(!['none','15-10','10-15','15-15','30-60','60-30'].includes(result.split))fail();
 if(item.rightId){if(!uuid.test(item.rightId))fail();result.rightId=item.rightId;}
 return result;
}
export function leaveOperation(payload){
 const args={};
 if(['leave-resources','preview-leave','create-leave'].includes(payload.action)){
  if(!uuid.test(payload.entryId||''))fail();args.target_entry=payload.entryId;
  if(payload.action!=='leave-resources')args.item=leaveItem(payload.item);
 }
 if(['create-leave','revise-leave'].includes(payload.action)){
  if(!uuid.test(payload.requestKey||'')||! /^[a-f0-9]{64}$/.test(payload.digest||''))throw Error('RH_LEAVE_PREVIEW_REQUIRED');
  args.request_key=payload.requestKey;args.expected_digest=payload.digest;
 }
 if(['leave-detail','close-leave','preview-revision','revise-leave'].includes(payload.action)){
  if(!uuid.test(payload.leaveId||''))fail();args.target_leave=payload.leaveId;
  if(['preview-revision','revise-leave'].includes(payload.action)){
   if(!Number.isSafeInteger(payload.version)||payload.version<1)fail();args.expected_version=payload.version;args.item=leaveItem(payload.item);
   if(payload.action==='revise-leave'){if(typeof payload.reason!=='string'||payload.reason.trim().length<3||payload.reason.length>500)fail();args.target_reason=payload.reason.trim();}
  }
  if(payload.action==='close-leave'){
   if(!Number.isSafeInteger(payload.version)||payload.version<1||!['cancelada','concluida'].includes(payload.status)
    ||typeof payload.reason!=='string'||payload.reason.trim().length<3||payload.reason.length>500)fail();
   Object.assign(args,{expected_version:payload.version,next_status:payload.status,target_reason:payload.reason.trim()});
  }
 }
 const names={'preview-revision':'rh_preview_leave_revision','revise-leave':'rh_revise_leave','leave-resources':'rh_leave_resources','preview-leave':'rh_preview_leave','create-leave':'rh_create_leave','leave-detail':'rh_leave_detail','close-leave':'rh_close_leave'};
 if(!Object.hasOwn(names,payload.action))fail();return {name:names[payload.action],args};
}
