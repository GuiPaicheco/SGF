import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('login preserva 42 unidades e ordena UBS, DAPS e Administração por último',()=>{
 const root={};runInNewContext(read('assets/unit-login.js'),{globalThis:root});
 const html=root.SGFUnitLogin.options(String),options=[...html.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)];
 assert.equal(options.length,44);assert.equal(options.at(-1)[1],'admin');assert.match(options.at(-2)[2],/^DAPS/);
 const ubs=options.slice(1,-2).map(x=>x[2]);assert.deepEqual(ubs,[...ubs].sort((a,b)=>a.localeCompare(b,'pt-BR')));
});
test('cabeçalho mantém Administração do SGFS sem depender do nome cadastrado',()=>{
 const code=read('assets/app.js'),start=code.indexOf('  function renderHeaderUser()'),end=code.indexOf('  function catalogTabs()',start);
 const headerUser={classList:{toggle(){}},innerHTML:''},state={session:{},profile:{role:'administrador',full_name:'Nome anterior'},activeContext:{global:true}};
 runInNewContext(code.slice(start,end)+'renderHeaderUser();',{headerUser,state,esc:String});
 assert.match(headerUser.innerHTML,/Administração do SGFS/);assert.doesNotMatch(headerUser.innerHTML,/Visão geral|Nome anterior/);
});
test('autocadastro encerrado não mantém ramos inalcançáveis de inclusão',()=>{
 const source=read('supabase/functions/access-auth/index.ts');
 assert.match(source,/autocadastro foi encerrado/);assert.doesNotMatch(source,/if \(action === 'request-access'\)|if \(action === 'registration-catalogs'\)|if \(action === 'locations'\)/);
 assert.match(source,/action === 'change-password'/);assert.match(source,/action === 'contexts'/);assert.match(source,/action === 'recover'/);
});
