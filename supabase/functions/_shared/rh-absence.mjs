const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=()=>{throw Error('RH_LEAVE_INPUT_INVALID');};
export function absenceDay(value){if(typeof value!=='string'||! /^(19\d{2}|20\d{2}|2100)-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail();return value;}
export function absenceInput(payload){
 if(!uuid.test(payload.entryId||'')||!uuid.test(payload.requestKey||'')||!['folga','afastamento'].includes(payload.type)||typeof payload.reference!=='string'||payload.reference.trim().length<3||payload.reference.length>300||typeof (payload.notes??'')!=='string'||(payload.notes||'').length>1000)fail();
 const item={type:payload.type,reference:payload.reference.trim(),notes:(payload.notes||'').trim()};
 if(item.type==='folga'){if(!Array.isArray(payload.dates)||!payload.dates.length||payload.dates.length>366)fail();item.dates=[...new Set(payload.dates.map(absenceDay))].sort();}
 else{item.start=absenceDay(payload.start);item.returnDate=payload.returnDate?absenceDay(payload.returnDate):null;if(item.returnDate&&item.returnDate<=item.start)fail();}
 return {target_entry:payload.entryId,request_key:payload.requestKey,item};
}
export function absenceReturnInput(payload){
 if(!uuid.test(payload.leaveId||'')||!Number.isSafeInteger(payload.version)||payload.version<1||typeof payload.reason!=='string'||payload.reason.trim().length<3||payload.reason.length>500)fail();
 return {target_leave:payload.leaveId,expected_version:payload.version,return_day:payload.returnDate?absenceDay(payload.returnDate):null,target_reason:payload.reason.trim()};
}
