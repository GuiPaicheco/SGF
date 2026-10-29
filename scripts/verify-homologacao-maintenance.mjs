// Somente homologação. Não imprime credenciais, tokens, nomes ou registros funcionais.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin='https://sgf-homologacao.vercel.app',backend='https://pouluaiadcgppxbzqdjw.supabase.co';
const env=Object.fromEntries((await readFile(new URL('../.env.homologacao.local',import.meta.url),'utf8')).split(/\r?\n/).filter(x=>/^[A-Z_]+=/.test(x)).map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];}));
assert.equal(env.HOMOLOGACAO_URL?.replace(/\/$/,''),origin);
assert.equal(env.SUPABASE_URL?.replace(/\/$/,''),backend);
const response=await fetch(origin),html=await response.text();
assert.ok(response.headers.get('content-security-policy').includes(backend));
const asset=html.match(/src="([^"]*assets\/app.js[^"]*)"/)[1];
const js=await(await fetch(new URL(asset,origin))).text();
assert.ok(js.includes(backend));assert.ok(!js.includes('ijhvbzomakbbxverqfqh'));
const key=js.match(/const SUPABASE_KEY = '([^']+)'/)[1];
let token;
const call=async(name,payload,{role='administrador',auth=true}={})=>{
 const r=await fetch(backend+'/functions/v1/'+name,{method:'POST',headers:{'Content-Type':'application/json',apikey:key,...(auth&&token?{Authorization:'Bearer '+token}:{}),'x-sgf-role':role},body:JSON.stringify(payload)});
 const text=await r.text();let body={};try{body=JSON.parse(text);}catch{}return {status:r.status,body};
};
try{
 const login=await call('access-auth',{action:'login',identifier:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD},{auth:false});
 assert.equal(login.status,200,'Login administrativo de homologação');token=login.body.access_token;
 const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
 assert.equal(claims.iss,backend+'/auth/v1');
 const directory=await call('manage-rh',{action:'directory'});assert.equal(directory.status,200);const report=await call('manage-rh',{action:'reconciliation-report',cnes:directory.body.units[0].cnes,page:0});assert.equal(report.status,200);assert.equal(typeof report.body.total_records,'number');
 assert.equal((await call('homologacao-admin-recovery',{})).status,410,'Recuperação temporária encerrada');
 const list=await call('manage-catalogs',{action:'calendar-list'});assert.equal(list.status,200);
 assert.ok(list.body.events.every(x=>'jurisdiction' in x&&'source_url' in x));
 assert.equal((await call('manage-catalogs',{action:'calendar-list'},{auth:false})).status,401);
 assert.equal((await call('manage-catalogs',{action:'calendar-list'},{role:'rh'})).status,403);
 const item={event_date:'2096-02-29',type:'feriado',name:'TESTE SINTÉTICO — NÃO PERSISTIR',jurisdiction:'institucional',source_url:'https://example.invalid/synthetic-holiday',scope:'general',unit_ids:[]};
 const preview=await call('manage-catalogs',{action:'calendar-preview',operation:'save',...item});assert.equal(preview.status,200,'Prévia de data bissexta válida');assert.match(preview.body.digest,/^[a-f0-9]{64}$/);
 assert.equal((await call('manage-catalogs',{action:'calendar-preview',operation:'save',...item,event_date:'2095-02-29'})).status,400);
 assert.equal((await call('manage-catalogs',{action:'calendar-preview',operation:'save',...item,jurisdiction:'nao_informada'})).status,400);
 assert.equal((await call('manage-catalogs',{action:'calendar-save',...item})).status,409,'Gravação sem prévia bloqueada');
 const after=await call('manage-catalogs',{action:'calendar-list'});assert.equal(after.body.events.length,list.body.events.length,'Prévia sem persistência');
 console.log(JSON.stringify({frontend:true,authIssuer:true,catalogContract:true,unauthenticated:401,forgedRole:403,leapDayPreview:200,invalidDate:400,unclassified:400,missingPreview:409,originalEventsPreserved:list.body.events.length}));
}finally{
 if(token)await fetch(backend+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+token}});
}
