import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const app=await readFile(new URL('../assets/app.js',import.meta.url),'utf8');
const code=app.slice(app.indexOf('  let accessCatalogLoad'),app.indexOf('  async function requestAccess'));
function setup(){
 const pending=[];
 const c={state:{route:'access-request'},app:{innerHTML:'original'},setProgress(){},shell:(...args)=>args.join('|'),esc:String,accessBondMarkup:()=>'',SUPABASE_URL:'https://example.invalid',SUPABASE_KEY:'public',fetch:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))};
 vm.createContext(c);vm.runInContext(`${code};this.run=renderAccessRequest`,c);return {c,pending};
}
test('resposta do cadastro não sobrescreve tela após navegação',async()=>{
 const {c,pending}=setup();const result=c.run();c.state.route='login';pending[0].resolve({ok:true,json:async()=>({marker:'old'})});await result;
 assert.equal(c.app.innerHTML,'original');assert.equal(c.state.registrationCatalogs,undefined);
});
test('erro atrasado não substitui outra tela',async()=>{
 const {c,pending}=setup();const result=c.run();c.state.route='home';pending[0].reject(new Error('atrasado'));await result;assert.equal(c.app.innerHTML,'original');
});
test('duas cargas do cadastro preservam somente a mais recente',async()=>{
 const {c,pending}=setup();const old=c.run();const latest=c.run();pending[1].resolve({ok:true,json:async()=>({marker:'new'})});await latest;
 pending[0].resolve({ok:true,json:async()=>({marker:'old'})});await old;assert.equal(c.state.registrationCatalogs.marker,'new');
});
