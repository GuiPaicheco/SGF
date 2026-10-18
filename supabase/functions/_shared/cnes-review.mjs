// Compartilhado entre Edge Function e testes Node. Não depende de HTML nem do navegador.
const fail=()=>{throw Error('CNES_COLLECTION_INVALID');};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max=180,optional=false)=>{
  if(optional&&(value===null||value===undefined||value==='')) return null;
  if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f]/.test(value)) fail();
  return value.trim();
};
const identifier=(value,pattern,optional=false)=>{
  if(optional&&(value===null||value===undefined||value==='')) return null;
  if(typeof value!=='string'||!pattern.test(value)) fail();return value;
};
const hours=value=>{if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>168||Math.abs(Math.round(value*100)-value*100)>0.00001) fail();return value;};
const day=value=>{
  if(value===null||value===undefined||value==='') return null;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail();
  const parsed=new Date(value+'T12:00:00Z');
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value) fail();return value;
};
export function stableJson(value) {
  if(Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if(object(value)) return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function fingerprint(value) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableJson(value)));
  return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function normalizeCollection(input,allowedCodes) {
  if(!object(input)||input.schemaVersion!==1||!['CNES_PUBLIC_HTML','CNES_PDF'].includes(input.source)||input.requiresReview!==true
    ||!Array.isArray(input.professionals)||!input.professionals.length||input.professionals.length>5000
    ||!Array.isArray(input.teams)||input.teams.length>100) fail();
  const cnes=identifier(input.cnes,/^\d{7}$/);
  if(!allowedCodes.includes(cnes)) fail();
  const collectedAt=text(input.collectedAt,40);
  if(!/^\d{4}-\d{2}-\d{2}T/.test(collectedAt)||!Number.isFinite(Date.parse(collectedAt))||Date.parse(collectedAt)>Date.now()+300000) fail();
  const competence=identifier(input.sourceCompetence,/^\d{4}(0[1-9]|1[0-2])$/,true);
  const records=new Map(),identities=new Map();
  for(const raw of input.professionals) {
    if(!object(raw)) fail();
    const data={fullName:text(raw.fullName),cns:identifier(raw.cns,/^\d{15}$/),principalCns:identifier(raw.principalCns,/^\d{15}$/,true),
      cbo:identifier(raw.cbo,/^\d{6}$/),occupation:text(raw.occupation),weeklyHours:hours(raw.weeklyHours),
      hoursOther:hours(raw.hoursOther),hoursAmbulatory:hours(raw.hoursAmbulatory),hoursHospital:hours(raw.hoursHospital),
      relationship:text(raw.relationship),relationshipType:text(raw.relationshipType),relationshipSubtype:text(raw.relationshipSubtype),
      status:text(raw.status,80),sourceEntryDate:day(raw.sourceEntryDate),
      deactivationCompetence:identifier(raw.deactivationCompetence,/^(?:\d{4}(?:0[1-9]|1[0-2])|(?:0[1-9]|1[0-2])\/\d{4})$/,true),teams:[]};
    if(Math.abs(data.hoursOther+data.hoursAmbulatory+data.hoursHospital-data.weeklyHours)>0.01) fail();
    // Identidade da atuação não depende de nome, jornada, equipe ou hash da captura.
    const sourceId=await fingerprint([cnes,data.principalCns||data.cns,data.cbo,data.relationship,data.relationshipType,data.relationshipSubtype,data.sourceEntryDate]);
    if(records.has(sourceId)) {
      if(stableJson(records.get(sourceId).sourceData)!==stableJson(data)) throw Error('CNES_AMBIGUOUS_SOURCE_IDENTITY');
      continue;
    }
    records.set(sourceId,{sourceId,sourceData:data});
    for(const identity of new Set([data.cns,data.principalCns].filter(Boolean))) {
      const key=`${identity}:${data.cbo}`;
      if(!identities.has(key)) identities.set(key,[]);
      identities.get(key).push(sourceId);
    }
  }
  let members=0,pending=0;const ines=new Set();
  for(const team of input.teams) {
    if(!object(team)||!Array.isArray(team.members)) fail();
    const ine=identifier(team.ine,/^\d{10}$/),name=text(team.name),type=text(team.type);
    if(ines.has(ine)) fail();ines.add(ine);
    const activatedOn=day(team.activatedOn),deactivatedOn=day(team.deactivatedOn);
    if(activatedOn&&deactivatedOn&&activatedOn>deactivatedOn) fail();
    members+=team.members.length;if(members>10000) fail();
    for(const member of team.members) {
      if(!object(member)) fail();
      const memberCns=identifier(member.cns,/^\d{15}$/),cbo=identifier(member.cbo,/^\d{6}$/);
      const enteredOn=day(member.enteredOn),leftOn=day(member.leftOn);
      if(enteredOn&&leftOn&&enteredOn>leftOn) fail();
      const assignment={ine,name,type,activatedOn,deactivatedOn,enteredOn,leftOn,
        hoursOther:hours(member.hoursOther),hoursAmbulatory:hours(member.hoursAmbulatory),hoursHospital:hours(member.hoursHospital)};
      const candidates=identities.get(`${memberCns}:${cbo}`)||[];
      if(candidates.length!==1) {pending++;continue;}
      const target=records.get(candidates[0]).sourceData.teams;
      if(!target.some(item=>stableJson(item)===stableJson(assignment))) target.push(assignment);
    }
  }
  const items=[...records.values()].sort((a,b)=>a.sourceId.localeCompare(b.sourceId));
  for(const item of items) {
    item.sourceData.teams.sort((a,b)=>stableJson(a).localeCompare(stableJson(b)));
    item.sourceHash=await fingerprint(item.sourceData);
  }
  return {cnes,collectedAt,competence,metadata:input.source==='CNES_PDF'?validatePdfMetadata(input.metadata):{},items,pendingTeamMembers:pending,
    digest:await fingerprint({cnes,competence,items})};
}

export function planImport(normalized,snapshot) {
  if(!object(snapshot)||!Number.isSafeInteger(snapshot.revision)||snapshot.revision<0||!Array.isArray(snapshot.entries)) throw Error('CNES_SNAPSHOT_INVALID');
  const existing=new Map(snapshot.entries.map(row=>[row.source_id,row]));
  const counts={added:0,changed:0,unchanged:0,absent:0,pendingTeamMembers:normalized.pendingTeamMembers};
  const changes=[];
  for(const item of normalized.items) {
    const prior=existing.get(item.sourceId);existing.delete(item.sourceId);
    const action=!prior?'added':prior.source_hash===item.sourceHash?'unchanged':'changed';counts[action]++;
    if(action==='unchanged') continue;
    const fields=Object.keys(item.sourceData).filter(field=>stableJson(prior?.source_data?.[field]??null)!==stableJson(item.sourceData[field]));
    const display=data=>data?Object.fromEntries(Object.entries(data).filter(([key])=>!['cns','principalCns'].includes(key))):null;
    changes.push({sourceId:item.sourceId,action,fullName:item.sourceData.fullName,
      cbo:item.sourceData.cbo,fields,before:display(prior?.source_data),after:display(item.sourceData),preservedLocalFields:Object.keys(prior?.local_data||{})});
  }
  counts.absent=existing.size;
  for(const prior of existing.values())changes.push({sourceId:prior.source_id,action:'absent',fullName:prior.source_data?.fullName||'Cadastro anterior',cbo:prior.source_data?.cbo||'',before:{fullName:prior.source_data?.fullName,occupation:prior.source_data?.occupation},after:null,fields:['presença no CNES'],preservedLocalFields:[]});
  return {revision:snapshot.revision,digest:normalized.digest,cnes:normalized.cnes,competence:normalized.competence,metadata:normalized.metadata,counts,changes,
    changesTruncated:false,requiresReview:true};
}

function validatePdfMetadata(input){
 if(!object(input))fail();return {origin:'CNES_PDF',issuedOn:day(input.issuedOn),localUpdatedOn:day(input.localUpdatedOn),nationalUpdatedOn:day(input.nationalUpdatedOn)};
}
export async function reconcileCollection(normalized,snapshot){
 const keys=data=>[...new Set([data.principalCns,data.cns].filter(Boolean))].map(id=>`${id}:${data.cbo}`);
 const incoming=new Map(),prior=new Map();
 for(const item of normalized.items)for(const k of keys(item.sourceData))incoming.set(k,(incoming.get(k)||0)+1);
 for(const item of snapshot.entries)for(const k of keys(item.source_data)){if(!prior.has(k))prior.set(k,[]);prior.get(k).push(item);}
 for(const item of normalized.items){const candidates=[...new Map(keys(item.sourceData).flatMap(k=>prior.get(k)||[]).map(x=>[x.source_id,x])).values()];
  if(candidates.length===1&&keys(item.sourceData).every(k=>incoming.get(k)===1)){
   item.sourceId=candidates[0].source_id;
   if(!item.sourceData.principalCns&&candidates[0].source_data.principalCns){item.sourceData.principalCns=candidates[0].source_data.principalCns;item.sourceHash=await fingerprint(item.sourceData);}
  }
  else if(candidates.length&&!candidates.some(x=>x.source_id===item.sourceId))throw Error('CNES_AMBIGUOUS_SOURCE_IDENTITY');
 }
 normalized.digest=await fingerprint({cnes:normalized.cnes,competence:normalized.competence,metadata:normalized.metadata,items:normalized.items});return normalized;
}
export function reviewedItems(normalized,snapshot,decisions){
 const plan=planImport(normalized,snapshot);
 if(!Array.isArray(decisions)||decisions.length!==plan.changes.length||decisions.some(x=>!object(x)||typeof x.accept!=='boolean'||typeof x.sourceId!=='string')||new Set(decisions.map(x=>x.sourceId)).size!==decisions.length)throw Error('CNES_PREVIEW_REQUIRED');
 const choices=new Map(decisions.map(x=>[x.sourceId,x.accept]));if(plan.changes.some(x=>!choices.has(x.sourceId)))throw Error('CNES_PREVIEW_REQUIRED');
 const old=new Map(snapshot.entries.map(x=>[x.source_id,x]));
 const items=normalized.items.flatMap(x=>{if(choices.get(x.sourceId)!==false)return [x];const previous=old.get(x.sourceId);return previous?[{sourceId:previous.source_id,sourceHash:previous.source_hash,sourceData:previous.source_data}]:[];});
 const absent=plan.changes.filter(x=>x.action==='absent'&&choices.get(x.sourceId)).map(x=>x.sourceId);
 const accepted=plan.changes.filter(x=>x.action!=='absent'&&choices.get(x.sourceId)).map(x=>x.sourceId);
 return {items,absent,accepted,present:normalized.items.filter(x=>choices.get(x.sourceId)!==false).map(x=>x.sourceId)};
}

export function validateLocalData(input) {
  if(!object(input)) fail();
  const allowed=['fullName','registration','municipalPosition','weeklyHours','teamLabel','admissionDate','employmentType'];
  if(Object.keys(input).some(key=>!allowed.includes(key))) fail();
  const result={};
  for(const [key,value] of Object.entries(input)) {
    if(value===null||value==='') continue; // Ausente não gera identificador funcional fictício.
    if(key==='weeklyHours') result[key]=hours(value);
    else if(key==='admissionDate') result[key]=day(value);
    else result[key]=text(value,key==='registration'?60:180);
  }
  if(result.registration) result.registration=result.registration.toUpperCase();
  return result;
}

export function validateManualEntry(input) {
  if(!object(input)||typeof input.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId)) fail();
  const localData=validateLocalData(input.localData);
  if(!localData.fullName||!localData.registration) fail();
  if(localData.admissionDate && localData.admissionDate>new Date().toISOString().slice(0,10)) fail();
  const reason=text(input.reason,500);if(reason.length<3) fail();
  return {requestId:input.requestId,cbo:identifier(input.cbo,/^[0-9]{6}$/),localData,reason};
}
