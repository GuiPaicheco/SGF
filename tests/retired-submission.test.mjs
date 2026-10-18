import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
test('endpoint antigo devolve 410 antes de acessar dados ou tentar criar solicitação',async()=>{
 const source=readFileSync(new URL('../supabase/functions/submit-request/index.ts',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'');let handler;
 vm.runInNewContext(stripTypeScriptTypes(source),{Deno:{serve:fn=>{handler=fn;}},Response,Request,createClient:()=>{throw Error('Não deve consultar banco');}});
 const response=await handler(new Request('https://example.invalid',{method:'POST',body:'{}'}));assert.equal(response.status,410);assert.match((await response.json()).error,/RH programa/);
});
