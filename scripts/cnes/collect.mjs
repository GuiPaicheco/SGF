import {CNES_ORIGIN,parseProfessionals,parseTeams,parseTeamMembers,reconcileTeams,teamUrl} from './parse.mjs';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const allowedPaths=new Set(['/Mod_Profissional.asp','/Mod_Equipes.asp','/Mod_Equipes_Profisssional.asp']);

export function createPortalReader({fetchImpl=fetch,wait=pause,intervalMs=300,timeoutMs=15000,maxBytes=2_000_000}={}) {
  let lastRequest=0;
  return async function read(url) {
    const target=new URL(url);
    if(target.origin!==CNES_ORIGIN || !allowedPaths.has(target.pathname)) throw Error('CNES_URL_INVALID');
    for(let attempt=0;attempt<2;attempt++) {
      await wait(Math.max(0,intervalMs-(Date.now()-lastRequest)));
      lastRequest=Date.now();
      try {
        const response=await fetchImpl(target.href,{signal:AbortSignal.timeout(timeoutMs),redirect:'error',
          headers:{Accept:'text/html','User-Agent':'SGF-CNES-Collector/1.0'}});
        if(!response.ok) {
          await response.body?.cancel();
          if(attempt===0 && (response.status===429||response.status>=500)) {await wait(1000);continue;}
          throw Error(`CNES_HTTP_${response.status}`);
        }
        if(!/^text\/html\b/i.test(response.headers.get('content-type')||'')) {await response.body?.cancel();throw Error('CNES_CONTENT_TYPE_INVALID');}
        if(Number(response.headers.get('content-length'))>maxBytes) {await response.body?.cancel();throw Error('CNES_RESPONSE_TOO_LARGE');}
        const reader=response.body?.getReader();
        if(!reader) throw Error('CNES_RESPONSE_EMPTY');
        const chunks=[];let size=0;
        try {
          while(true) {
            const {done,value}=await reader.read();if(done) break;
            size+=value.byteLength;
            if(size>maxBytes) throw Error('CNES_RESPONSE_TOO_LARGE');
            chunks.push(value);
          }
        } catch(error) {await reader.cancel();throw error;} finally {reader.releaseLock();}
        const bytes=new Uint8Array(size);let offset=0;
        for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
        return new TextDecoder('windows-1252').decode(bytes);
      } catch(error) {
        // Retentar apenas transporte/timeout; erro de layout ou limite requer revisão.
        if(attempt===0 && (error instanceof TypeError || ['TimeoutError','AbortError'].includes(error.name))) {await wait(1000);continue;}
        if(/^CNES_[A-Z0-9_]+$/.test(error.message||'')) throw error;
        throw Error('CNES_TRANSPORT_FAILED');
      }
    }
    throw Error('CNES_TRANSPORT_FAILED');
  };
}

export async function collectUnit(unit,{read=createPortalReader(),now=()=>new Date()}={}) {
  if(!/^\d{7}$/.test(unit.cnes) || typeof unit.login!=='string') throw Error('CNES_UNIT_INVALID');
  const prefix=`${CNES_ORIGIN}/`, unitId=`310670${unit.cnes}`;
  const professionalsUrl=`${prefix}Mod_Profissional.asp?VCo_Unidade=${unitId}`;
  const teamsUrl=`${prefix}Mod_Equipes.asp?VCo_Unidade=${unitId}`;
  // Sequencial por projeto: não multiplicar requisições pelas 42 unidades/equipes.
  const professionals=parseProfessionals(await read(professionalsUrl));
  if(professionals.length>5000) throw Error('CNES_TOO_MANY_PROFESSIONALS');
  const teams=parseTeams(await read(teamsUrl),unit.cnes);
  let totalMembers=0;
  for(const team of teams) {
    team.members=parseTeamMembers(await read(teamUrl(team.url,unit.cnes)));
    totalMembers+=team.members.length;
    if(totalMembers>10000) throw Error('CNES_TOO_MANY_MEMBERS');
  }
  const reconciliation=reconcileTeams(professionals,teams);
  return {schemaVersion:1,cnes:unit.cnes,unitName:unit.login,collectedAt:now().toISOString(),
    sourceCompetence:null,requiresReview:true,source:'CNES_PUBLIC_HTML',
    sourceUrls:[professionalsUrl,teamsUrl],professionals,teams,...reconciliation};
}

export function summarize(collection) {
  return {cnes:collection.cnes,unit:collection.unitName,status:'REQUIRES_REVIEW',
    professionalRows:collection.professionals.length,teams:collection.teams.length,
    teamsWithoutMembers:collection.teams.filter(team=>!team.members.length).length,
    teamMembers:collection.teams.reduce((sum,team)=>sum+team.members.length,0),
    assignments:collection.assignments.length,pending:collection.pending.length};
}
