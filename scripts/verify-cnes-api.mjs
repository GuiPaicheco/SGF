// Consulta recebida por stdin. Não grava dados nem imprime nomes/CNS.
import {apiCollection} from '../supabase/functions/_shared/cnes-api.mjs';
import {normalizeCollection} from '../supabase/functions/_shared/cnes-review.mjs';
let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>4_000_000)throw Error('Consulta excede limite');}
const data=JSON.parse(input),normalized=await normalizeCollection(apiCollection(data,data.cnes),[data.cnes]);
console.log(JSON.stringify({cnes:data.cnes,professionals:normalized.items.length,teamAssignments:normalized.items.reduce((n,x)=>n+x.sourceData.teams.length,0),pending:normalized.pendingTeamMembers,competence:normalized.competence,writes:0}));
