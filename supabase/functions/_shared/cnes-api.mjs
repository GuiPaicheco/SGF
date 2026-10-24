// Adaptador do contrato público da API Python para a conferência já existente.
const invalid=()=>{throw Error('CNES_API_INCOMPLETE');};
const day=value=>{if(!value)return null;const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);if(!m)invalid();const d=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;if(new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d)invalid();return d;};
const hours=value=>{const m=/^\s*(\d+(?:[.,]\d+)?)\s*(?:Hs\.?)?\s*$/i.exec(value||'');if(!m)invalid();return Number(m[1].replace(',','.'));};
const optionalTeamHours=value=>value==null||String(value).trim()===''?null:hours(value);
export function apiCollection(data,code){
 if(!data||data.cnes!==code||data.estabelecimento?.cnes!==code||data.metadados?.completo_no_escopo_solicitado!==true||data.metadados?.avisos?.length||!Array.isArray(data.profissionais)||!Array.isArray(data.equipes))invalid();
 const professionals=data.profissionais.filter(p=>String(p.situacao).toLowerCase()==='ativo').map(p=>{
  const cbo=/^(\d{4}[0-9A-Z]{2})\s*-\s*(.+)$/.exec(p.cbo||'');if(!cbo)invalid();
  return {fullName:p.nome,cns:p.cns,principalCns:p.cns_principal||null,cbo:cbo[1],occupation:cbo[2],weeklyHours:hours(p.ch_total),hoursOther:hours(p.ch_outros),hoursAmbulatory:hours(p.ch_ambulatorial),hoursHospital:hours(p.ch_hospitalar),relationship:p.vinculacao,relationshipType:p.tipo_vinculo,relationshipSubtype:p.subtipo_vinculo,status:p.situacao,sourceEntryDate:day(p.data_entrada),deactivationCompetence:p.competencia_desativacao||null};
 });
 if(!professionals.length)invalid();
 const teams=data.equipes.map(t=>{if(!Array.isArray(t.profissionais))invalid();return {ine:t.ine,name:t.nome,type:t.tipo,activatedOn:day(t.data_ativacao),deactivatedOn:day(t.data_desativacao),members:t.profissionais.map(p=>({cns:p.cns,cbo:p.cbo,enteredOn:day(p.data_entrada),leftOn:day(p.data_desligamento),hoursOther:optionalTeamHours(p.ch_outras),hoursAmbulatory:optionalTeamHours(p.ch_ambulatorial),hoursHospital:optionalTeamHours(p.ch_hospitalar)}))};});
 return {schemaVersion:1,source:'CNES_PUBLIC_HTML',requiresReview:true,cnes:code,collectedAt:data.metadados.coletado_em,sourceCompetence:data.metadados.competencia||null,professionals,teams};
}
export function retainMissing(normalized,snapshot){
 const existing=new Map(snapshot.entries.map(e=>[e.source_id,e]));
 const incoming=normalized.items.filter(x=>existing.get(x.sourceId)?.local_data?.archived!==true);
 const ids=new Set(incoming.map(x=>x.sourceId));
 return {incoming:incoming.map(x=>x.sourceId),items:[...incoming,...snapshot.entries.filter(e=>!ids.has(e.source_id)).map(e=>({sourceId:e.source_id,sourceHash:e.source_hash,sourceData:e.source_data}))]};
}
