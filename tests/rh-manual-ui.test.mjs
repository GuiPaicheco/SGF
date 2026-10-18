import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../assets/rh-manual-ui.js',import.meta.url),'utf8');
function setup(request){
 let sequence=0,current=true;const nodes={},app={innerHTML:'',querySelector:key=>nodes[key]??={}};
 const context={crypto:{randomUUID:()=>`request-${++sequence}`},FormData:class{constructor(target){return Object.entries(target.values);}}};
 vm.runInNewContext(source,context);
 context.SGFRhManual.open({app,esc:String,request,isCurrent:()=>current,cnes:'6305245',onDone(){},onBack(){}});
 const values={fullName:'PESSOA FICTÍCIA',registration:'M-001',cbo:'123456',weeklyHours:'32.5',reason:'Teste fictício'};
 return {app,values,leave:()=>{current=false;},submit:()=>nodes['#rh-manual-form'].onsubmit({preventDefault(){},target:{values}})};
}
test('falha mantém preenchimento e repetição conserva chave; alteração gera outra chave',async()=>{
 const calls=[],s=setup(async payload=>{calls.push(payload);throw Error('Falha fictícia');});
 await s.submit();assert.match(s.app.innerHTML,/M-001/);assert.match(s.app.innerHTML,/Falha fictícia/);
 await s.submit();assert.equal(calls[0].requestId,calls[1].requestId);assert.equal(calls[0].localData.weeklyHours,32.5);
 s.values.registration='M-002';await s.submit();assert.notEqual(calls[1].requestId,calls[2].requestId);
});
test('envio em andamento não permite nova gravação',async()=>{
 let resolve,count=0;const s=setup(()=>{count++;return new Promise(done=>{resolve=done;});});
 const task=s.submit();await s.submit();assert.equal(count,1);resolve({id:'ficticio'});await task;
});
test('erro atrasado não substitui tela de outro contexto',async()=>{
 let reject;const s=setup(()=>new Promise((_resolve,fail)=>{reject=fail;}));const task=s.submit();
 s.leave();s.app.innerHTML='Outra tela';reject(Error('Erro atrasado'));await task;assert.equal(s.app.innerHTML,'Outra tela');
});
