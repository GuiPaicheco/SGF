import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import '../assets/access-policy.js';

test('somente Administrador pode abrir a rota CNES e módulo é carregado antes do app',async()=>{
  assert.equal(SGFAccessPolicy.allowed('cnes-import','administrador',true),true);
  for(const role of ['rh','servidor','diretor']) assert.equal(SGFAccessPolicy.allowed('cnes-import',role,true),false);
  assert.equal(SGFAccessPolicy.allowed('cnes-import','administrador',false),false);
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(html.indexOf('assets/cnes-import-ui.js')<html.indexOf('assets/app.js'));
});

test('conta administrativa com apenas um perfil também envia contexto explícito',async()=>{
  const source=await readFile(new URL('../assets/app.js',import.meta.url),'utf8');
  const body=source.slice(source.indexOf('  async function renderCnesImport()'),source.indexOf('  async function loadAccessRequests()'));
  let headers;
  const sandbox={state:{profile:{role:'administrador'},session:{access_token:'ficticio'}},captureView:()=>()=>true,
    app:{},esc:String,SUPABASE_URL:'https://example.invalid',sessionHeaders:()=>({'Content-Type':'application/json'}),
    SGFCnesImport:{mount:async({request})=>request({action:'units'})},
    fetch:async(_url,options)=>{headers=options.headers;return {ok:true,json:async()=>({units:[]})};}};
  await runInNewContext(`${body}\nrenderCnesImport()`,sandbox);
  assert.equal(headers['x-sgf-role'],'administrador');
});

test('resposta de unidade atrasada não substitui tela/contexto posterior',async()=>{
  const source=await readFile(new URL('../assets/cnes-import-ui.js',import.meta.url),'utf8');
  const sandbox={};runInNewContext(source,sandbox);
  let current=true,resolve;const pending=new Promise(done=>resolve=done),writes=[];
  const app={set innerHTML(value){writes.push(value);}};
  const task=sandbox.SGFCnesImport.mount({app,request:()=>pending,esc:String,isCurrent:()=>current});
  current=false;resolve({units:[{code:'6305245',name:'Fictícia'}]});await task;
  assert.equal(writes.length,1);assert.match(writes[0],/Carregando unidades/);
});
