const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=()=>{throw Error('RH_LEAVE_INPUT_INVALID');};
const day=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail();const date=new Date(value+'T12:00:00Z');if(!Number.isFinite(date.valueOf())||date.toISOString().slice(0,10)!==value)fail();return value;};
const hours=(value,max)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max||Math.abs(value*60-Math.round(value*60))>1e-7)fail();return value;};
export function leaveItem(item){
 if(!item||typeof item!=='object'||Array.isArray(item))fail();
 const fields=new Set(['type','dateMode','returnDate','startDate','secondStartDate','days','availableHours','dailyHours','extraHours','birthDate','admissionDate','acquisitionEnd','unjustifiedAbsences','split','eligibilityConfirmed','rightId','override','overrideReason','notes']);
 if(Object.keys(item).some(key=>!fields.has(key))||!['regulamentar','premio','banco_horas'].includes(item.type)||item.eligibilityConfirmed!==true)fail();
 const dateMode=item.dateMode===undefined?'start':item.dateMode;if(!['start','return'].includes(dateMode))fail();
 if((dateMode==='return'&&item.startDate!==undefined&&item.startDate!=='')||(dateMode==='start'&&item.returnDate!==undefined&&item.returnDate!==''))fail();
 const chosen=dateMode==='return'?{dateMode:'return',returnDate:day(item.returnDate)}:{startDate:day(item.startDate),...(item.dateMode!==undefined?{dateMode:'start'}:{})};
 const result={type:item.type,...chosen,eligibilityConfirmed:true,availableHours:hours(item.availableHours??0,2160),
  dailyHours:hours(item.dailyHours??0,24),extraHours:hours(item.extraHours??0,2160),split:item.split??'none',
  override:item.override??false,overrideReason:item.overrideReason??'',notes:item.notes??''};
 if(typeof result.override!=='boolean'||typeof result.overrideReason!=='string'||result.overrideReason.length>500
  ||typeof result.notes!=='string'||result.notes.length>1000||!['none','15-10','10-15'].includes(result.split))fail();
 if(result.override&&result.overrideReason.trim().length<3)throw Error('RH_LEAVE_OVERRIDE_INVALID');
 if(item.type==='banco_horas'&&(typeof item.availableHours!=='number'||!Number.isInteger(item.days)||item.days<1||item.days>90))fail();
 if(item.type==='premio'&&![30,60,90].includes(item.days))fail();
 if(item.days!==undefined){if(!Number.isInteger(item.days)||item.days<1||item.days>90)fail();result.days=item.days;}
 if((item.type==='banco_horas'||result.extraHours>0)&&result.dailyHours<=0)throw Error('RH_LEAVE_DAILY_HOURS_REQUIRED');
 for(const key of ['birthDate','admissionDate','acquisitionEnd','secondStartDate'])if(item[key])result[key]=day(item[key]);
 if(item.type==='regulamentar'){
  if(!result.acquisitionEnd||!['yes','no'].includes(item.unjustifiedAbsences))fail();result.unjustifiedAbsences=item.unjustifiedAbsences;
 }
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
