export async function limitedJson(request,maxBytes=16000) {
  if(Number(request.headers.get('content-length'))>maxBytes) throw Error('RH_INPUT_INVALID');
  const reader=request.body?.getReader();if(!reader) throw Error('RH_INPUT_INVALID');
  const chunks=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>maxBytes){await reader.cancel();throw Error('RH_INPUT_INVALID');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try {const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();return parsed;
  }catch{throw Error('RH_INPUT_INVALID');}
}
