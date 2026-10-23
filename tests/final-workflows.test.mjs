import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {absenceInput,absenceReturnInput} from '../supabase/functions/_shared/rh-absence.mjs';
const id='f6000000-0000-0000-0000-000000000300',key='f6000000-0000-0000-0000-000000000400';
const payload={entryId:id,requestKey:key,type:'folga',dates:['2030-01-04','2030-01-02','2030-01-02'],reference:' Processo teste ',operator:'forjado'};
test('folga normaliza dias separados sem aceitar autoria ou escopo do cliente',()=>{
 assert.deepEqual(absenceInput(payload),{target_entry:id,request_key:key,item:{type:'folga',dates:['2030-01-02','2030-01-04'],reference:'Processo teste',notes:''}});
 for(const dates of [[],['2030-02-30'],['2101-01-01'],[null]])assert.throws(()=>absenceInput({...payload,dates}));
});
test('afastamento aceita retorno em aberto mas exige cronologia real e versão para alterar',()=>{
 assert.equal(absenceInput({...payload,type:'afastamento',start:'2030-01-01'}).item.returnDate,null);
 assert.throws(()=>absenceInput({...payload,type:'afastamento',start:'2030-01-01',returnDate:'2029-12-31'}));
 assert.deepEqual(absenceReturnInput({leaveId:id,version:2,returnDate:null,reason:'Sem previsão'}),{target_leave:id,expected_version:2,return_day:null,target_reason:'Sem previsão'});
 assert.throws(()=>absenceReturnInput({leaveId:id,version:0,reason:'Teste'}));
});
test('calendário clicável mantém anos bissextos e não depende de estilo inline',async()=>{
 const context={};vm.createContext(context);const code=await readFile(new URL('../assets/rh-occurrence-ui.js',import.meta.url),'utf8');vm.runInContext(code,context);
 assert.equal(context.SGFRhOccurrence.monthDays('2028-02').dates.length,29);
 assert.equal(context.SGFRhOccurrence.monthDays('2026-10').offset,4);
 assert.doesNotMatch(code,/style=/);assert.match(code,/selected\.has/);assert.match(code,/record-absence/);
});
test('ficha e diferenças CNES apresentam campos amigáveis e escapam conteúdo externo',async()=>{
 const context={};vm.createContext(context);vm.runInContext(await readFile(new URL('../assets/cnes-source-view.js',import.meta.url),'utf8'),context);
 const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 const out=context.SGFCnesSource.renderData({occupation:'<script>teste</script>',teams:[{name:'Equipe A'}],status:'ativo',source_hash:'interno'},esc);
 assert.match(out,/>Cargo</);assert.match(out,/&lt;script&gt;/);assert.doesNotMatch(out,/<script>|<pre>|source_hash|interno/);
 const diff=context.SGFCnesSource.differences({occupation:'Anterior'},{occupation:'Atual'},esc);assert.match(diff,/Cadastro atual/);assert.match(diff,/Anterior/);assert.match(diff,/Atual/);
});
test('contrato final preserva revisão explícita, unidade fixa e operador apenas visual',async()=>{
 const units=await readFile(new URL('../assets/rh-units-ui.js',import.meta.url),'utf8'),holidays=await readFile(new URL('../assets/holidays-ui.js',import.meta.url),'utf8'),detail=await readFile(new URL('../assets/rh-leave-ui.js',import.meta.url),'utf8');
 assert.match(units,/reviewGroup\('added'/);assert.match(units,/reviewGroup\('changed'/);assert.match(units,/reviewed<preview.changes.length/);assert.doesNotMatch(units,/JSON.stringify|<pre\b|unit-select/);
 assert.doesNotMatch(holidays,/name="jurisdiction"|id="holiday-jurisdiction"/);assert.match(detail,/Atualizar previsão de retorno/);assert.match(detail,/Sem previsão de término/);
});
