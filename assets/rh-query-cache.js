(function(root){
'use strict';
function create({request,scope,now=Date.now,ttl=30000,limit=30}){
 const entries=new Map();let generation=0;
 const clear=()=>{generation++;entries.clear();};
 const reads=new Set(['session','registry','calendar','directory','candidates','binding-options','leave-resources','leave-detail','preview-leave','preview-revision']);
 async function run(payload,{fresh=false}={}){
  if(!reads.has(payload.action)){clear();try{return await request(payload);}finally{clear();}}
  if(!['calendar','directory'].includes(payload.action))return request(payload);
  const identity=scope(),key=JSON.stringify([identity,payload]),existing=entries.get(key);
  if(!fresh&&existing&&existing.expires>now())return structuredClone(await existing.promise);
  const version=generation,entry={expires:now()+ttl,promise:null};
  entry.promise=Promise.resolve().then(()=>request(payload));entries.set(key,entry);
  while(entries.size>limit)entries.delete(entries.keys().next().value);
  try{const result=await entry.promise;if(version!==generation||identity!==scope()){if(entries.get(key)===entry)entries.delete(key);}return structuredClone(result);}
  catch(error){if(entries.get(key)===entry)entries.delete(key);throw error;}
 }
 return {run,clear};
}
root.SGFRhQueryCache={create};
})(globalThis);
