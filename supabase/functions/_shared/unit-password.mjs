// Nenhum alvo, operador ou e-mail é recebido do cliente.
export async function changeOwnUnitPassword(payload,dependencies){
 const {currentPassword,password}=payload;
 if(Object.keys(payload).some(k=>!['action','currentPassword','password'].includes(k))
  ||typeof currentPassword!=='string'||currentPassword.length<1||currentPassword.length>72
  ||typeof password!=='string'||password.length<8||password.length>72||password===currentPassword)throw Error('RH_PASSWORD_INVALID');
 const context=await dependencies.authorize();
 await dependencies.limit();
 const auth=await dependencies.reauthenticate(currentPassword);
 if(!auth?.access_token||auth.user_id!==context.profile_id){if(auth?.access_token)await dependencies.signOut(auth.access_token,'local');throw Error('RH_CURRENT_PASSWORD_INVALID');}
 let changed=false;
 try{
  await dependencies.authorize();
  await dependencies.update(auth.access_token,password);changed=true;
  try{await dependencies.audit(context);}catch{throw Error('RH_PASSWORD_CHANGED_AUDIT_PENDING');}
 }finally{
  try{await dependencies.signOut(auth.access_token,changed?'global':'local');}
  catch{if(changed)throw Error('RH_PASSWORD_CHANGED_SESSION_PENDING');}
 }
 return {ok:true,logout_required:true};
}
