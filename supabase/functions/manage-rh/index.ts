import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {validateAccessContext,contextHeaders} from '../_shared/access-context.ts';
import {verifiedSessionId,provisionRhAccount} from '../_shared/rh-accounts.mjs';
import {limitedJson} from '../_shared/limited-json.mjs';
import catalog from '../../../config/rh-units.json' with {type:'json'};
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-sgf-role,x-sgf-cnes,x-sgf-lotacao','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const messages:Record<string,string>={
 RH_INPUT_INVALID:'Confira os campos e limites da operação.',RH_PASSWORD_INVALID:'Informe uma senha de 8 a 72 caracteres para as contas novas.',
 RH_ACCOUNT_CONFLICT:'Há conflito com uma conta existente. Nenhuma senha existente foi redefinida.',RH_AUTH_UNAVAILABLE:'Não foi possível consultar o serviço de contas. Tente novamente.',
 RH_UNIT_INVALID:'Unidade fora do catálogo de RH.',RH_LOCATION_REVIEW_REQUIRED:'Confira o vínculo CNES/lotação principal da unidade antes de criar a conta.',
 RH_NOT_ALLOWED:'Esta ação não é permitida para este acesso.',RH_OPERATOR_OUT_OF_UNIT:'Operador não autorizado, inativo ou de outra unidade.',
 RH_OPERATOR_REQUIRED:'Selecione novamente um operador autorizado para continuar.',RH_SESSION_INVALID:'A sessão não está mais disponível. Entre novamente.',
 RH_VERSION_CONFLICT:'A autorização foi alterada. Atualize a lista antes de continuar.',RH_ACCOUNT_MANAGED_SEPARATELY:'Gerencie esta conta pela área de contas RH.',
};
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(request.method!=='POST')return json({error:'Método não permitido.'},405);
 try {
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return json({error:'Serviço indisponível.'},503);
  const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');if(!token)return json({error:'Sessão obrigatória.'},401);
  const auth=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:identity,error:identityError}=await auth.auth.getUser(token);
  if(identityError||!identity.user)return json({error:'Sessão inválida ou expirada.'},401);
  const {data:profile,error:profileError}=await auth.from('profiles').select('roles,disabled_at,must_change_password,institutional_cnes_unit_id').eq('id',identity.user.id).single();
  if(profileError||!profile||profile.disabled_at||profile.must_change_password)throw Error('RH_NOT_ALLOWED');
  const payload=await limitedJson(request),actor=identity.user.id;
  if(profile.institutional_cnes_unit_id) {
   if(request.headers.get('x-sgf-role')!=='rh'||profile.roles.length!==1||profile.roles[0]!=='rh')throw Error('RH_NOT_ALLOWED');
   const session=verifiedSessionId(token,actor);
   const rpc=async(name:string,args:Record<string,unknown>={})=>{const {data,error}=await auth.rpc(name,{target_profile:actor,target_session:session,...args});if(error)throw error;return data;};
   if(payload.action==='session')return json(await rpc('rh_session_state'));
   if(payload.action==='select-operator'){if(!uuid.test(payload.grantId||''))throw Error('RH_INPUT_INVALID');return json(await rpc('rh_select_operator',{target_grant:payload.grantId}));}
   if(payload.action==='clear-operator')return json(await rpc('rh_clear_operator'));
   if(payload.action==='registry'){if(!Number.isInteger(payload.page)||payload.page<0||payload.page>100)throw Error('RH_INPUT_INVALID');return json(await rpc('rh_unit_registry',{page_index:payload.page}));}
   throw Error('RH_NOT_ALLOWED');
  }
  const context=await validateAccessContext(auth,request,actor,profile.roles);
  if(context.role!=='administrador'||!context.global)throw Error('RH_NOT_ALLOWED');
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{...contextHeaders(context),'x-sgf-actor':actor}}});
  const rpc=async(name:string,args:Record<string,unknown>={})=>{const {data,error}=await db.rpc(name,{actor_id:actor,...args});if(error)throw error;return data;};
  if(payload.action==='directory') {
   const [{data:units,error},accounts]=await Promise.all([db.from('cnes_units').select('id,code,name').in('code',catalog.map(unit=>unit.cnes)).eq('active',true),rpc('rh_account_directory')]);
   if(error)throw error;
   return json({units:catalog.map(unit=>({...unit,unit_id:units?.find(item=>item.code===unit.cnes)?.id||null,account:accounts.find((a:{cnes:string})=>a.cnes===unit.cnes)||null}))});
  }
  const configured=catalog.find(unit=>unit.cnes===payload.cnes);if(!configured)throw Error('RH_UNIT_INVALID');
  const {data:unit,error:unitError}=await db.from('cnes_units').select('id').eq('code',configured.cnes).eq('active',true).single();
  if(unitError||!unit)throw Error('RH_UNIT_INVALID');
  if(payload.action==='provision') {
   const slot=await rpc('prepare_rh_unit',{target_cnes:unit.id,unit_login:configured.login});
   return json(await provisionRhAccount(slot,payload.password,{
    getUser:(id:string)=>auth.auth.admin.getUserById(id),createUser:(attributes:any)=>auth.auth.admin.createUser(attributes),
    finish:(id:string)=>rpc('finish_rh_unit',{target_cnes:unit.id,target_auth_user:id}),
   }));
  }
  if(payload.action==='candidates'){if(!Number.isInteger(payload.page)||payload.page<0||payload.page>100)throw Error('RH_INPUT_INVALID');return json(await rpc('rh_operator_candidates',{target_cnes:unit.id,page_index:payload.page}));}
  if(payload.action==='grant') {
   if(!uuid.test(payload.entryId||'')||typeof payload.active!=='boolean'||!Number.isInteger(payload.version)||payload.version<0)throw Error('RH_INPUT_INVALID');
   return json(await rpc('rh_grant_operator',{target_cnes:unit.id,target_entry:payload.entryId,grant_active:payload.active,expected_version:payload.version}));
  }
  if(payload.action==='account-status') {
   if(typeof payload.enabled!=='boolean'||!Number.isInteger(payload.version)||payload.version<1)throw Error('RH_INPUT_INVALID');
   return json(await rpc('rh_set_account_status',{target_cnes:unit.id,target_enabled:payload.enabled,expected_version:payload.version}));
  }
  if(payload.action==='reset-password') {
   if(typeof payload.password!=='string'||payload.password.length<8||payload.password.length>72)throw Error('RH_PASSWORD_INVALID');
   const directory=await rpc('rh_account_directory'),account=directory.find((a:{cnes:string})=>a.cnes===configured.cnes);
   if(!account?.profile_id)throw Error('RH_UNIT_INVALID');
   await rpc('rh_invalidate_sessions',{target_cnes:unit.id});
   const {error}=await auth.auth.admin.updateUserById(account.profile_id,{password:payload.password});
   if(error)throw Error('RH_AUTH_UNAVAILABLE');return json({ok:true});
  }
  return json({error:'Ação inválida.'},400);
 }catch(error){
  const code=String((error as {message?:string})?.message||'');
  if(code==='INVALID_ACCESS_CONTEXT')return json({error:'Selecione o acesso correto para continuar.'},403);
  if(messages[code])return json({error:messages[code],code},/CONFLICT/.test(code)?409:/NOT_ALLOWED|OUT_OF_UNIT|OPERATOR_REQUIRED/.test(code)?403:400);
  console.error('manage-rh failed');return json({error:'Não foi possível concluir a operação.'},500);
 }
});
