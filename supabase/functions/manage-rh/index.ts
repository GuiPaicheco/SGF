import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {validateAccessContext,contextHeaders} from '../_shared/access-context.ts';
import {verifiedSessionId,provisionRhAccount} from '../_shared/rh-accounts.mjs';
import {limitedJson} from '../_shared/limited-json.mjs';
import {calendarQuery,calendarWindow,bindingInput,birthdayInput} from '../_shared/rh-calendar.mjs';
import {absenceInput,absenceReturnInput} from '../_shared/rh-absence.mjs';
import {leaveOperation} from '../_shared/rh-leaves.mjs';
import catalog from '../../../config/rh-units.json' with {type:'json'};
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-sgf-role,x-sgf-cnes,x-sgf-lotacao','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const messages:Record<string,string>={
 RH_LEAVE_MODALITY_DISABLED:'Banco de horas e complementação de férias foram encerrados. Use férias regulamentares ou férias-prêmio.',
 RH_LEAVE_CONFIRMATION_REQUIRED:'Confirme os assentamentos, a anuência da chefia e a concordância com o fracionamento.',
 RH_LEAVE_REGIME_REQUIRED:'Confirme o regime jurídico. Vínculo cedido ou especial exige análise específica do RH.',
 RH_LEAVE_EVIDENCE_REQUIRED:'Informe a referência do assentamento, processo ou ato que comprova o direito e saldo.',
 RH_LEAVE_PRIZE_INELIGIBLE:'Férias-prêmio exigem vínculo efetivo e quinquênio sem os impedimentos do art. 75. Confira suspensão, faltas e licenças.',
 RH_LEAVE_REGULAR_INELIGIBLE:'Há impedimento à concessão neste período. Confira as licenças (art. 73 do Estatuto) ou a perda do direito na CLT.',
 RH_LEAVE_NOTICE_REQUIRED:'Confira o protocolo: antecedência de 60 dias para programação municipal, 45 para reprogramação regulamentar, ou 30 dias na CLT.',
 RH_LEAVE_PRIZE_YEAR_INVALID:'As parcelas de férias-prêmio devem ocorrer em anos subsequentes (30 + 60 ou 60 + 30 dias).',
 RH_LEAVE_SCHEDULE_REQUIRED:'Para cálculo CLT, confirme jornada de segunda a sexta. Outra escala exige análise específica.',
 RH_LEAVE_CLT_START_INVALID:'Na CLT, não inicie as férias nos dois dias anteriores ao repouso semanal ou feriado. Confira a escala.',
 RH_LEAVE_RETURN_INVALID:'Escolha retorno em dia útil, fora de feriado. Confira o início e o período calculado.',
 RH_LEAVE_INPUT_INVALID:'Confira os campos, a confirmação do direito e os limites do lançamento.',
 RH_LEAVE_IDENTITY_REQUIRED:'Confira a data de admissão / exercício informada para este vínculo.',
 RH_LEAVE_DATES_INVALID:'O início deve ser uma data válida posterior à admissão.',RH_LEAVE_ACQUISITION_INVALID:'Confira o ciclo completo de aquisição (12 meses ou quinquênio), a admissão e o protocolo. O gozo começa após a aquisição.',
 RH_LEAVE_PREVIEW_REQUIRED:'Confira a prévia antes de programar o afastamento.',RH_LEAVE_PREVIEW_CHANGED:'Cadastro, operador ou calendário mudou. Gere e confira uma nova prévia.',
 RH_LEAVE_IDEMPOTENCY_CONFLICT:'Este envio já foi usado para outro lançamento. Confira o registro antes de iniciar outro.',
 RH_LEAVE_RATE_LIMIT:'Muitos lançamentos em sequência nesta conta. Aguarde um minuto para continuar.',
 RH_DAYOFF_RECALC_CONFLICT:'O day-off alteraria as férias e criaria sobreposição com outro afastamento ou parcela. Ajuste os períodos antes de salvar. Nenhuma alteração foi gravada.',
 RH_LEAVE_OVERLAP:'Este vínculo já tem afastamento ou pedido ativo nessas datas. Confira o calendário antes de continuar.',
 RH_LEAVE_CYCLE_IN_USE:'Já existe afastamento ativo para este vínculo e período aquisitivo.',RH_LEAVE_RIGHT_INVALID:'O direito ou saldo conhecido não corresponde a este vínculo e período, ou os dias já utilizados impedem nova programação.',
 RH_LEAVE_SPLIT_INVALID:'Confira as condições de fracionamento e o início do segundo período.',RH_LEAVE_NOT_FOUND:'Lançamento não encontrado nesta unidade.',
 RH_ABSENCE_RETURN_REQUIRED:'Informe o retorno do afastamento antes de concluí-lo. Use Atualizar retorno no registro.',
 RH_LEAVE_NOT_ENDED:'O período ainda não terminou e não pode ser concluído agora.',
 RH_BINDING_INPUT_INVALID:'Selecione o vínculo, confirme a unidade polo e informe a justificativa.',
 RH_ENTRY_INVALID:'Cadastro CNES não encontrado.',RH_ENTRY_REVIEW_REQUIRED:'Confira a importação CNES ativa, o vínculo e a unidade polo antes de programar férias.',
 RH_BINDING_IMMUTABLE:'Este cadastro já está associado a outro vínculo. Preserve a associação e solicite revisão administrativa.',
 RH_EXISTING_BOND_REQUIRED:'Já existe cadastro com esta matrícula. Confira e associe o vínculo existente.',
 RH_BOND_OUT_OF_UNIT:'O vínculo não pertence à unidade ou não corresponde ao cadastro conferido.',
 RH_POLE_CONFLICT:'O vínculo já tem outra unidade polo. Confira a responsabilidade antes de associar.',
 RH_CALENDAR_LIMIT:'Há muitos afastamentos nesta página. Refine a busca por funcionário para consultar o mês.',
 RH_INPUT_INVALID:'Confira os campos e limites da operação.',RH_PASSWORD_INVALID:'Informe uma senha de 8 a 72 caracteres para as contas novas.',
 RH_ACCOUNT_CONFLICT:'Há conflito com uma conta existente. Nenhuma senha existente foi redefinida.',RH_AUTH_UNAVAILABLE:'Não foi possível consultar o serviço de contas. Tente novamente.',
 RH_UNIT_INVALID:'Unidade fora do catálogo de RH.',RH_LOCATION_REVIEW_REQUIRED:'Confira o vínculo CNES/lotação principal da unidade antes de criar a conta.',
 RH_NOT_ALLOWED:'Esta ação não é permitida para este acesso.',RH_OPERATOR_OUT_OF_UNIT:'Operador não autorizado, inativo ou de outra unidade.',
 RH_OPERATOR_REQUIRED:'Selecione novamente um operador autorizado para continuar.',RH_SESSION_INVALID:'A sessão não está mais disponível. Entre novamente.',
 RH_VERSION_CONFLICT:'O registro ou a autorização foi alterado. Atualize a tela antes de continuar.',RH_ACCOUNT_MANAGED_SEPARATELY:'Gerencie esta conta pela área de contas RH.',
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
  const isLeaveAction=['leave-resources','preview-leave','create-leave','leave-detail','close-leave','preview-revision','revise-leave'].includes(payload.action);
  if(profile.institutional_cnes_unit_id) {
   if(request.headers.get('x-sgf-role')!=='rh'||profile.roles.length!==1||profile.roles[0]!=='rh')throw Error('RH_NOT_ALLOWED');
   const session=verifiedSessionId(token,actor);
   const rpc=async(name:string,args:Record<string,unknown>={})=>{const {data,error}=await auth.rpc(name,{target_profile:actor,target_session:session,...args});if(error)throw error;return data;};
   if(payload.action==='session')return json(await rpc('rh_session_state'));
   if(payload.action==='select-operator'){if(!uuid.test(payload.grantId||''))throw Error('RH_INPUT_INVALID');return json(await rpc('rh_select_operator',{target_grant:payload.grantId}));}
   if(payload.action==='clear-operator')return json(await rpc('rh_clear_operator'));
   if(payload.action==='launch-employees'){if(!Number.isInteger(payload.page)||payload.page<0||payload.page>100||typeof payload.search!=='string'||payload.search.length>120)throw Error('RH_INPUT_INVALID');return json(await rpc('rh_launch_employees',{page_index:payload.page,search_text:payload.search.trim()}));}
   if(payload.action==='employee-profile'){if(!uuid.test(payload.entryId||''))throw Error('RH_INPUT_INVALID');return json(await rpc('rh_employee_profile',{target_entry:payload.entryId}));}
   if(payload.action==='save-birthday')return json(await rpc('rh_save_employee_birthday',birthdayInput(payload)));
   if(payload.action==='record-absence')return json(await rpc('rh_record_absence',absenceInput(payload)));
   if(payload.action==='set-absence-return')return json(await rpc('rh_set_absence_return',absenceReturnInput(payload)));
   if(payload.action==='create-occurrence') {
    const day=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
    if(!uuid.test(payload.entryId||'')||!uuid.test(payload.requestKey||'')||!['dayoff','folga'].includes(payload.type)||!day(payload.start)||!day(payload.end)
      ||typeof payload.reference!=='string'||typeof (payload.notes??'')!=='string')throw Error('RH_INPUT_INVALID');
    return json(await rpc('rh_create_occurrence',{target_entry:payload.entryId,request_key:payload.requestKey,occurrence_type:payload.type,start_day:payload.start,end_day:payload.end,reference:payload.reference.trim(),notes:payload.notes||''}));
   }
   if(payload.action==='registry'){if(!Number.isInteger(payload.page)||payload.page<0||payload.page>100)throw Error('RH_INPUT_INVALID');return json(await rpc('rh_unit_registry',{page_index:payload.page}));}
   if(payload.action==='calendar')return json(await rpc('rh_calendar_window',{target_cnes:null,...calendarWindow(payload)}));
   if(isLeaveAction){const operation=leaveOperation(payload);return json(await rpc(operation.name,{target_cnes:null,...operation.args}));}
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
  if(isLeaveAction){
   const operation=leaveOperation(payload);
   const {data,error}=await db.rpc(operation.name,{target_profile:actor,target_session:verifiedSessionId(token,actor),target_cnes:unit.id,...operation.args});
   if(error)throw error;return json(data);
  }
  if(payload.action==='calendar') {
   const {data,error}=await db.rpc('rh_calendar_window',{target_profile:actor,target_session:null,target_cnes:unit.id,...calendarWindow(payload)});
   if(error)throw error;return json(data);
  }
  if(payload.action==='binding-options') {
   if(!uuid.test(payload.entryId||''))throw Error('RH_INPUT_INVALID');
   return json(await rpc('rh_registry_bond_options',{target_entry:payload.entryId}));
  }
  if(payload.action==='bind-registry')return json(await rpc('rh_bind_registry_bond',bindingInput(payload)));
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
  if(payload.action==='reset-default')payload.password='123456';
  if(['reset-password','reset-default'].includes(payload.action)) {
   if(typeof payload.password!=='string'||payload.password.length<(payload.action==='reset-default'?6:8)||payload.password.length>72)throw Error('RH_PASSWORD_INVALID');
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
  if(messages[code])return json({error:messages[code],code},/RATE_LIMIT/.test(code)?429:/CONFLICT|PREVIEW_CHANGED/.test(code)?409:/NOT_FOUND/.test(code)?404:/NOT_ALLOWED|OUT_OF_UNIT|OPERATOR_REQUIRED/.test(code)?403:400);
  console.error('manage-rh failed');return json({error:'Não foi possível concluir a operação.'},500);
 }
});
