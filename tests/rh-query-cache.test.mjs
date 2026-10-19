import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/rh-query-cache.js';
test('consultas iguais compartilham envio e expiram; busca explícita ignora cache',async()=>{
 let count=0,time=0;const cache=SGFRhQueryCache.create({scope:()=> 'admin',now:()=>time,request:async()=>({value:++count})});
 const q={action:'calendar',cnes:'1'};
 const results=await Promise.all([cache.run(q),cache.run(q)]);assert.equal(count,1);
 results[0].value=99;assert.equal((await cache.run(q)).value,1);
 await cache.run(q,{fresh:true});assert.equal(count,2);
 time=30001;await cache.run(q);assert.equal(count,3);
});
test('mutações, escopo e falhas não reutilizam respostas anteriores',async()=>{
 let count=0,scope='admin',fail=false;const cache=SGFRhQueryCache.create({scope:()=>scope,request:async()=>{count++;if(fail)throw Error('conexão');return {count};}}),q={action:'directory'};
 await cache.run(q);scope='rh';await cache.run(q);assert.equal(count,2);
 await cache.run({action:'create-leave'});await cache.run(q);assert.equal(count,4);
 cache.clear();fail=true;await assert.rejects(cache.run(q));fail=false;await cache.run(q);assert.equal(count,6);
});
test('recursos e validações de férias são sempre consultados no servidor',async()=>{
 let count=0;const cache=SGFRhQueryCache.create({scope:()=>'',request:async()=>({count:++count})});
 for(const action of ['session','leave-resources','leave-detail','preview-leave']){await cache.run({action});await cache.run({action});}
 assert.equal(count,8);
});
test('leitura em voo durante alteração não repovoa cache invalidado',async()=>{
 let resolve,count=0;const cache=SGFRhQueryCache.create({scope:()=>'',request:q=>q.action==='directory'&&++count===1?new Promise(r=>resolve=r):Promise.resolve({count})});
 const pending=cache.run({action:'directory'});await new Promise(r=>setImmediate(r));await cache.run({action:'grant'});resolve({old:true});await pending;await cache.run({action:'directory'});assert.equal(count,2);
});
