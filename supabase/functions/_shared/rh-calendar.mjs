export function calendarQuery(payload) {
 if(typeof payload.month!=='string'||! /^(19\d{2}|20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(payload.month)
  ||!Number.isInteger(payload.page)||payload.page<0||payload.page>100
  ||typeof payload.search!=='string'||payload.search.length>120)throw Error('RH_INPUT_INVALID');
 const filters=payload.filters??{};if(!filters||typeof filters!=='object'||Array.isArray(filters))throw Error('RH_INPUT_INVALID');
 const allowed={position:null,cbo:null,team:null,review:['todos','pendente','conferido'],type:['todos','regulamentar','premio','banco_horas'],status:['todos','com_afastamento','sem_afastamento','programada','concluida','cancelada']};
 if(Object.entries(filters).some(([key,value])=>!Object.hasOwn(allowed,key)||typeof value!=='string'||value.length>120||(allowed[key]&&!allowed[key].includes(value))))throw Error('RH_INPUT_INVALID');
 const clean=Object.fromEntries(Object.entries(filters).map(([k,v])=>[k,v.trim()]));
 return {filter_json:clean,target_month:payload.month+'-01',page_index:payload.page,search_text:payload.search.trim()};
}

export function bindingInput(payload) {
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!uuid.test(payload.entryId||'')||!Number.isInteger(payload.entryVersion)||payload.entryVersion<1
  ||!Number.isInteger(payload.bindingVersion)||payload.bindingVersion<0
  ||(payload.bondId!==null&&!uuid.test(payload.bondId||''))||payload.confirmPole!==true
  ||typeof payload.reason!=='string'||payload.reason.trim().length<3||payload.reason.length>500)throw Error('RH_BINDING_INPUT_INVALID');
 return {target_entry:payload.entryId,expected_entry_version:payload.entryVersion,target_bond:payload.bondId,
  expected_binding_version:payload.bindingVersion,confirm_pole:true,target_reason:payload.reason.trim()};
}

export function calendarWindow(payload){
 const base=calendarQuery({...payload,month:payload.month||String(payload.start||'').slice(0,7)});
 const valid=value=>typeof value==='string'&&/^(19\d{2}|20\d{2}|2100)-\d{2}-\d{2}$/.test(value)&&!isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
 let start,end;
 if(payload.mode==='range'){start=payload.start;end=payload.end;}
 else {start=base.target_month;const d=new Date(start+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);end=d.toISOString().slice(0,10);}
 if(!valid(start)||!valid(end)||end<start||(Date.parse(end)-Date.parse(start))/86400000>92)throw Error('RH_INPUT_INVALID');
 return {range_start:start,range_end:end,page_index:base.page_index,search_text:base.search_text,filter_json:base.filter_json};
}

export function birthdayInput(payload){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!uuid.test(payload.entryId||'')||!Number.isSafeInteger(payload.version)||payload.version<0)throw Error('RH_INPUT_INVALID');
 const m=payload.month,d=payload.day;if(m!==null||d!==null){if(!Number.isInteger(m)||!Number.isInteger(d)||m<1||m>12||d<1||d>31||new Date(Date.UTC(2000,m-1,d)).getUTCMonth()!==m-1)throw Error('RH_INPUT_INVALID');}
 return {target_entry:payload.entryId,expected_version:payload.version,target_month:m,target_day:d};
}
