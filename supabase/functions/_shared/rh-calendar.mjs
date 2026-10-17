export function calendarQuery(payload) {
 if(typeof payload.month!=='string'||! /^(19\d{2}|20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(payload.month)
  ||!Number.isInteger(payload.page)||payload.page<0||payload.page>100
  ||typeof payload.search!=='string'||payload.search.length>120)throw Error('RH_INPUT_INVALID');
 return {target_month:payload.month+'-01',page_index:payload.page,search_text:payload.search.trim()};
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
