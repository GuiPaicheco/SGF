import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {validateAccessContext,contextHeaders} from '../_shared/access-context.ts';
import {normalizeCollection,planImport,validateLocalData} from '../_shared/cnes-review.mjs';
import catalog from '../../../config/rh-units.json' with {type:'json'};

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-sgf-role,x-sgf-bond,x-sgf-cnes,x-sgf-lotacao','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const messages:Record<string,string>={
  CNES_COLLECTION_INVALID:'Arquivo CNES inválido ou fora dos limites. Gere novamente a coleta.',
  CNES_AMBIGUOUS_SOURCE_IDENTITY:'A coleta possui vínculos indistinguíveis com dados diferentes. Confira a fonte antes de importar.',
  CNES_VERSION_CONFLICT:'O cadastro mudou desde a prévia. Confira novamente antes de gravar.',
  CNES_STALE_COLLECTION:'Esta coleta é anterior à última carga incorporada. Use uma coleta atual.',
  CNES_ADMIN_REQUIRED:'Somente o Administrador pode importar e conferir cadastros nesta etapa.',
  CNES_UNIT_INVALID:'CNES não disponível no catálogo de RH.',
  CNES_REGISTRY_LIMIT:'Limite de registros da unidade atingido. Solicite conferência técnica.',
  CNES_LEGACY_OUT_OF_UNIT:'O cadastro antigo indicado não pertence à unidade.',
  CNES_LEGACY_LINK_REQUIRED:'Esta matrícula já existe no cadastro anterior. Busque e confirme a associação antes de salvar.',
  CNES_REGISTRATION_CONFLICT:'Esta matrícula foi conferida para outra pessoa. Confira os identificadores antes de continuar.',
  CNES_ENTRY_NOT_FOUND:'Registro não encontrado.',
  CNES_LOCAL_DATA_INVALID:'Confira os campos municipais informados.',
  CNES_PREVIEW_REQUIRED:'Gere a prévia e confirme a conferência antes de incorporar.',
  CNES_PAGE_INVALID:'Página inválida.',
};

export async function readLimitedJson(request:Request,maxBytes=4_000_000) {
  if(Number(request.headers.get('content-length'))>maxBytes) throw Error('CNES_COLLECTION_INVALID');
  const reader=request.body?.getReader();if(!reader) throw Error('CNES_COLLECTION_INVALID');
  const chunks:Uint8Array[]=[];let size=0;
  try {
    while(true) {
      const {done,value}=await reader.read();if(done) break;
      size+=value.byteLength;if(size>maxBytes) {await reader.cancel();throw Error('CNES_COLLECTION_INVALID');}chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('CNES_COLLECTION_INVALID');}
}

Deno.serve(async request=>{
  if(request.method==='OPTIONS') return new Response('ok',{headers:cors});
  if(request.method!=='POST') return json({error:'Método não permitido.'},405);
  try {
    const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!url||!key) return json({error:'Serviço indisponível.'},503);
    const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
    if(!token) return json({error:'Sessão obrigatória.'},401);
    const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:identity,error:identityError}=await admin.auth.getUser(token);
    if(identityError||!identity.user) return json({error:'Sessão inválida ou expirada.'},401);
    const context=await validateAccessContext(admin,request,identity.user.id,['administrador']);
    if(!context.global||context.role!=='administrador') throw Error('CNES_ADMIN_REQUIRED');
    const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{...contextHeaders(context),'x-sgf-actor':identity.user.id}}});
    const actor_id=identity.user.id,payload=await readLimitedJson(request);
    if(!payload||typeof payload!=='object'||Array.isArray(payload)) throw Error('CNES_COLLECTION_INVALID');
    const allowedCodes=catalog.map(unit=>unit.cnes);
    const rpc=async(name:string,args:Record<string,unknown>)=>{const {data,error}=await db.rpc(name,{actor_id,...args});if(error) throw error;return data;};
    if(payload.action==='units') {
      const {data,error}=await admin.from('cnes_units').select('id,code,name').in('code',allowedCodes).eq('active',true).order('name');
      if(error) throw error;return json({units:data||[]});
    }
    if(payload.action==='review') {
      if(typeof payload.entryId!=='string'||!Number.isInteger(payload.version)||payload.version<1) throw Error('CNES_LOCAL_DATA_INVALID');
      return json(await rpc('review_cnes_registry_entry',{target_entry:payload.entryId,expected_version:payload.version,
        local_values:validateLocalData(payload.localData),legacy_servidor:payload.legacyServidor||null}));
    }
    let normalized;
    if(['preview','apply'].includes(payload.action)) normalized=await normalizeCollection(payload.collection,allowedCodes);
    else if(!['list','legacy-candidates'].includes(payload.action)) return json({error:'Ação inválida.'},400);
    const code=normalized?.cnes||payload.cnes;
    if(!allowedCodes.includes(code)) throw Error('CNES_UNIT_INVALID');
    const {data:unit,error:unitError}=await admin.from('cnes_units').select('id').eq('code',code).eq('active',true).maybeSingle();
    if(unitError||!unit) throw Error('CNES_UNIT_INVALID');
    if(payload.action==='legacy-candidates') {
      if(typeof payload.registration!=='string'||payload.registration.length>60||!payload.registration.trim()) throw Error('CNES_LOCAL_DATA_INVALID');
      return json({candidates:await rpc('cnes_legacy_candidates',{target_cnes:unit.id,target_registration:payload.registration.trim().toUpperCase()})});
    }
    if(payload.action==='list') {
      if(!Number.isInteger(payload.page)||payload.page<0||payload.page>100) throw Error('CNES_PAGE_INVALID');
      return json(await rpc('list_cnes_registry',{target_cnes:unit.id,page_index:payload.page}));
    }
    if(!normalized) throw Error('CNES_COLLECTION_INVALID');
    if(payload.action==='preview') {
      const snapshot=await rpc('cnes_registry_snapshot',{target_cnes:unit.id});
      return json(planImport(normalized,snapshot));
    }
    if(payload.confirmed!==true||payload.digest!==normalized.digest||!Number.isSafeInteger(payload.revision)||payload.revision<0) throw Error('CNES_PREVIEW_REQUIRED');
    return json(await rpc('apply_cnes_registry_import',{target_cnes:unit.id,items:normalized.items,collection_digest:normalized.digest,
      collected_at:normalized.collectedAt,competence:normalized.competence,expected_revision:payload.revision}));
  }catch(error){
    const code=String((error as {message?:string})?.message||'');
    if(code==='INVALID_ACCESS_CONTEXT') return json({error:'Selecione o acesso Administrador para continuar.'},403);
    if(messages[code]) return json({error:messages[code]},code==='CNES_ADMIN_REQUIRED'?403:/CONFLICT|STALE/.test(code)?409:400);
    // Não registrar arquivo, CNS, nome ou erro remoto arbitrário no log.
    console.error('manage-cnes failed');return json({error:'Não foi possível concluir a operação. Tente novamente.'},500);
  }
});
