import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {apiCollection,retainMissing} from '../supabase/functions/_shared/cnes-api.mjs';
import {normalizeCollection} from '../supabase/functions/_shared/cnes-review.mjs';
const person={nome:'TESTE',cns:'900000000000001',cns_principal:'',cbo:'123456 - OCUPAÇÃO',ch_total:'40Hs.',ch_outros:'0Hs.',ch_ambulatorial:'40Hs.',ch_hospitalar:'0Hs.',vinculacao:'VINCULO',tipo_vinculo:'ESTATUTARIO',subtipo_vinculo:'PROPRIO',situacao:'Ativo',data_entrada:'01/01/2020'};
const data=()=>({cnes:'6305245',estabelecimento:{cnes:'6305245',nome:'UBS TESTE'},profissionais:[person],equipes:[],metadados:{coletado_em:'2026-10-23T12:00:00Z',completo_no_escopo_solicitado:true,avisos:[],competencia:null}});
test('API preserva dados e não inventa CPF, matrícula ou competência',async()=>{
 const n=await normalizeCollection(apiCollection(data(),'6305245'),['6305245']);
 assert.equal(n.items[0].sourceData.weeklyHours,40);assert.equal(n.competence,null);
 assert.equal(n.items[0].sourceData.registration,undefined);assert.equal(n.items[0].sourceData.cpf,undefined);
});
test('consulta parcial, unidade divergente ou falha de membros bloqueiam atualização',()=>{
 for(const d of [{...data(),cnes:'1111111'},{...data(),profissionais:null},{...data(),metadados:{completo_no_escopo_solicitado:false}},{...data(),equipes:[{profissionais:null}]}])assert.throws(()=>apiCollection(d,'6305245'));
});
test('ausente e removido explicitamente são mantidos sem reativação',()=>{
 const old={source_id:'a',source_hash:'old',source_data:{fullName:'Mantido'},local_data:{}};
 const removed={source_id:'b',source_hash:'old-b',source_data:{status:'inativo'},local_data:{archived:true}};
 const n={items:[{sourceId:'b',sourceHash:'new',sourceData:{status:'ativo'}},{sourceId:'c',sourceHash:'new-c',sourceData:{}}]};
 const r=retainMissing(n,{entries:[old,removed]});assert.deepEqual(r.incoming,['c']);assert.equal(r.items.length,3);assert.equal(r.items.find(x=>x.sourceId==='b').sourceData.status,'inativo');
});
test('calendário distingue day-off, folga e aniversário sem mudar duração',()=>{
 const root={};runInNewContext(readFileSync(new URL('../assets/rh-calendar-ui.js',import.meta.url),'utf8'),{globalThis:root,Date});
 const row={bond_id:'b'},p={bond_id:'b',start_date:'2028-04-03',end_date:'2028-04-03',type:'dayoff'};
 assert.match(root.SGFRhCalendar.cellMark(row,'2028-04-03',[p],'longitudinal'),/D/);
 assert.match(root.SGFRhCalendar.cellMark(row,'2028-04-03',[{...p,type:'folga'}],'longitudinal'),/L/);
});
test('Ver CNES escapa conteúdo remoto e separa dados do RH',()=>{
 const root={};runInNewContext(readFileSync(new URL('../assets/cnes-source-view.js',import.meta.url),'utf8'),{globalThis:root});
 const esc=x=>String(x).replaceAll('<','&lt;').replaceAll('>','&gt;');
 const html=root.SGFCnesSource.sourceView({source:{payload:{cadastro:{identificacao:{nome:'<script>x</script>'}},metadados:{}}},dayoffs:[],occurrences:[]},esc);
 assert.doesNotMatch(html,/<script>/);assert.match(html,/Informações registradas pelo RH/);
});
test('mutação cadastral CNES não possui acesso direto anônimo/autenticado',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261023124526_cnes_api_updates_and_rh_occurrences.sql',import.meta.url),'utf8');
 assert.match(sql,/from public,anon,authenticated/);assert.match(sql,/security invoker/);assert.doesNotMatch(sql,/security definer/i);
 assert.match(sql,/missing_preserved/);assert.match(sql,/for share/);assert.match(sql,/private.planning_lock/);
});
test('confirmação envia a coleta uma única vez para respeitar o limite do corpo',()=>{
 const ui=readFileSync(new URL('../assets/rh-units-ui.js',import.meta.url),'utf8');
 assert.match(ui,/action:'api-apply',sourceData:collection\.apiData,cnes:unit/);
 assert.equal((ui.match(/sourceData:collection\.apiData/g)||[]).length,1);
 assert.doesNotMatch(ui,/sourceData:collection\.apiData\}:\{\}\),collection/);
});
