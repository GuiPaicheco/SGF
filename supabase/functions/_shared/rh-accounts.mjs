export function normalizeUnitLogin(value) {
  if(typeof value!=='string'||value.length>160) return '';
  return value.normalize('NFD').replace(/\p{M}/gu,'').trim().replace(/\s+/g,' ').toUpperCase();
}

// Chamar somente depois de getUser(token): a assinatura já foi verificada pelo Auth.
export function verifiedSessionId(token,profileId) {
  try {
    const payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    if(payload.sub!==profileId||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.session_id||'')
      ||!Number.isFinite(payload.exp)||payload.exp*1000<=Date.now()) throw Error();
    return payload.session_id;
  }catch{throw Error('RH_SESSION_INVALID');}
}

export async function provisionRhAccount(slot,password,{getUser,createUser,finish}) {
  if(slot.profile_id) return {status:'already_exists',cnes:slot.code};
  if(typeof password!=='string'||password.length<8||password.length>72) throw Error('RH_PASSWORD_INVALID');
  const matches=user=>user?.id===slot.auth_user_id&&user.email===slot.internal_email
    &&user.app_metadata?.sgf_rh_cnes===slot.code;
  let found=await getUser(slot.auth_user_id);
  if(found.error&&found.error.status!==404&&found.error.code!=='user_not_found') throw Error('RH_AUTH_UNAVAILABLE');
  let user=found.data?.user;
  if(user&&!matches(user)) throw Error('RH_ACCOUNT_CONFLICT');
  if(!user) {
    const result=await createUser({id:slot.auth_user_id,email:slot.internal_email,password,email_confirm:true,
      app_metadata:{sgf_rh_cnes:slot.code},user_metadata:{full_name:slot.login_name}});
    if(result.error) {
      // Outra execução pode ter criado a mesma reserva. Nunca redefinir senha para retomar.
      found=await getUser(slot.auth_user_id);user=found.data?.user;
      if(!matches(user)) throw Error('RH_ACCOUNT_CONFLICT');
    } else user=result.data?.user;
  }
  if(!matches(user)) throw Error('RH_ACCOUNT_CONFLICT');
  await finish(slot.auth_user_id);
  return {status:'created_or_resumed',cnes:slot.code};
}
