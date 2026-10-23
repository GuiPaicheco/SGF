import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {validateAccessContext,contextHeaders} from '../_shared/access-context.ts';
import {normalizeCollection,planImport,validateLocalData,reconcileCollection,reviewedItems,fingerprint} from '../_shared/cnes-review.mjs';
import catalog from '../../../config/rh-units.json' with {type:'json'};
import {apiCollection,retainMissing} from '../_shared/cnes-api.mjs';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-sgf-role,x-sgf-bond,x-sgf-cnes,x-sgf-lotacao','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const messages:Record<string,string>={
  CNES_API_INCOMPLETE:'A consulta CNES está incompleta. Nenhum cadastro foi alterado. Tente novamente.',
  CNES_ENTRY_ARCHIVED:'Funcionário removido explicitamente pelo Administrador. A atualização não pode reativá-lo.',
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
  CNES_MANUAL_DUPLICATE:'Esta matrícula já existe. Localize e confira o cadastro existente antes de incluir outro funcionário.',
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
    if(payload.action==='archive') {
      if(typeof payload.entryId!=='string'||!Number.isInteger(payload.version)||typeof payload.reason!=='string') throw Error('CNES_LOCAL_DATA_INVALID');
      return json(await rpc('archive_cnes_employee',{target_entry:payload.entryId,expected_version:payload.version,target_reason:payload.reason.trim()}));
    }
    let normalized;
    const apiAction=['api-preview','api-apply'].includes(payload.action);
    if(apiAction) normalized=await normalizeCollection(apiCollection(payload.sourceData,payload.cnes),allowedCodes);
    if(['preview','apply'].includes(payload.action)) normalized=await normalizeCollection(payload.collection,allowedCodes);
    else if(!apiAction&&!['list','legacy-candidates','view-source'].includes(payload.action)) return json({error:'Ação indisponível. Utilize a importação CNES.'},400);
    const code=normalized?.cnes||payload.cnes;
    if(!allowedCodes.includes(code)) throw Error('CNES_UNIT_INVALID');
    const {data:unit,error:unitError}=await admin.from('cnes_units').select('id').eq('code',code).eq('active',true).maybeSingle();
    if(unitError||!unit) throw Error('CNES_UNIT_INVALID');
    if(payload.action==='view-source') return json(await rpc('view_cnes_source',{target_cnes:unit.id}));
    if(apiAction) {
      const snapshot=await rpc('cnes_registry_snapshot',{target_cnes:unit.id});
      normalized=await reconcileCollection(normalized,snapshot);
      const retained=retainMissing(normalized,snapshot);
      normalized.items=retained.items;
      normalized.digest=await fingerprint({items:retained.items,source:payload.sourceData});
      const plan=planImport(normalized,snapshot);
      if(payload.action==='api-preview')return json({...plan,missingPreserved:true});
      const executionDigest=await fingerprint({digest:normalized.digest,decisions:payload.decisions});
      const applied=await rpc('cnes_import_status',{target_cnes:unit.id,target_digest:executionDigest});
      if(applied)return json(applied);
      if(payload.confirmed!==true||payload.digest!==normalized.digest||payload.revision!==snapshot.revision)throw Error('CNES_PREVIEW_REQUIRED');
      const reviewed=reviewedItems(normalized,snapshot,payload.decisions);
      return json(await rpc('apply_cnes_api_update',{target_cnes:unit.id,items:reviewed.items,
        present_ids:retained.incoming.filter(id=>reviewed.items.some(x=>x.sourceId===id)),collection_digest:executionDigest,
        collected_at:normalized.collectedAt,expected_revision:payload.revision,source_payload:payload.sourceData}));
    }
    if(payload.action==='legacy-candidates') {
      if(typeof payload.registration!=='string'||payload.registration.length>60||!payload.registration.trim()) throw Error('CNES_LOCAL_DATA_INVALID');
      return json({candidates:await rpc('cnes_legacy_candidates',{target_cnes:unit.id,target_registration:payload.registration.trim().toUpperCase()})});
    }
    if(payload.action==='list') {
      if(!Number.isInteger(payload.page)||payload.page<0||payload.page>100) throw Error('CNES_PAGE_INVALID');
      if(typeof (payload.search??'')!=='string'||(payload.search||'').length>120)throw Error('CNES_LOCAL_DATA_INVALID');
      return json(await rpc('cnes_unit_registry',{target_cnes:unit.id,page_index:payload.page,search_text:(payload.search||'').trim(),filter_json:payload.filters||{}}));
    }
    if(!normalized) throw Error('CNES_COLLECTION_INVALID');
    const snapshot=await rpc('cnes_registry_snapshot',{target_cnes:unit.id});
    normalized=await reconcileCollection(normalized,snapshot);
    const preserved=retainMissing(normalized,snapshot);
    normalized.items=preserved.items;
    normalized.digest=await fingerprint({cnes:normalized.cnes,competence:normalized.competence,metadata:normalized.metadata,items:normalized.items});
    if(payload.action==='preview') return json(planImport(normalized,snapshot));
    if(payload.confirmed!==true||payload.digest!==normalized.digest||!Number.isSafeInteger(payload.revision)||payload.revision<0) throw Error('CNES_PREVIEW_REQUIRED');
    if(!Array.isArray(payload.decisions)||payload.decisions.length>10000||payload.decisions.some((x:any)=>!x||typeof x.sourceId!=='string'||! /^[a-f0-9]{64}$/.test(x.sourceId)||typeof x.accept!=='boolean'))throw Error('CNES_PREVIEW_REQUIRED');
    const executionDigest=await fingerprint({collection:normalized.digest,decisions:[...payload.decisions].sort((a:any,b:any)=>a.sourceId.localeCompare(b.sourceId))});
    const applied=await rpc('cnes_import_status',{target_cnes:unit.id,target_digest:executionDigest});if(applied)return json(applied);
    const reviewed=reviewedItems(normalized,snapshot,payload.decisions);
    if(!reviewed.items.length&&!reviewed.absent.length)return json({status:'no_changes'});
    return json(await rpc('apply_cnes_reviewed',{target_cnes:unit.id,items:reviewed.items,collection_digest:executionDigest,
      collected_at:normalized.collectedAt,competence:normalized.competence,expected_revision:payload.revision,
      absent_ids:[],present_ids:reviewed.present.filter(id=>preserved.incoming.includes(id)),metadata:normalized.metadata}));
  }catch(error){
    const code=String((error as {message?:string})?.message||'');
    if(code==='INVALID_ACCESS_CONTEXT') return json({error:'Selecione o acesso Administrador para continuar.'},403);
    if(messages[code]) return json({error:messages[code]},code==='CNES_ADMIN_REQUIRED'?403:/CONFLICT|STALE/.test(code)?409:400);
    // Não registrar arquivo, CNS, nome ou erro remoto arbitrário no log.
    console.error('manage-cnes failed');return json({error:'Não foi possível concluir a operação. Tente novamente.'},500);
  }
});
