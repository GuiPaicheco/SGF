import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCnesPages} from '../assets/cnes-pdf-parser.mjs';
import {normalizeCollection,reconcileCollection,reviewedItems,planImport} from '../supabase/functions/_shared/cnes-review.mjs';
import {calendarWindow} from '../supabase/functions/_shared/rh-calendar.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const cell=(s,x,y)=>({s,x,y});
const page=()=>({width:940,height:500,items:[cell('CNES:',17,10),cell('6305245',44,10),cell('Data:',856,20),cell('18/10/2026',884,20),cell('Descrição',423,50),cell('Nome Fictício',18,80),cell('900000000000001',153,80),cell('123456',328,80),cell('CARGO FICTÍCIO',378,80),cell('VINCULO EMPREGATICIO',547,80),cell('ESTATUTARIO EFETIVO',607,80),cell('PROPRIO',666,80),cell('40',780,80),cell('0',820,80),cell('0',860,80),cell('40',900,80),cell('Equipes',17,130),cell('EQUIPE FICTÍCIA',204,160),cell('Equipe: 0000123456 - 70 - ESF',364,180),cell('CBO',241,200),cell('9000000000000',158,225),cell('01',188,237),cell('123456',257,230),cell('0',506,230),cell('40',585,230),cell('0',693,230),cell('01/01/2020',776,230)]});
test('ficha PDF reconhece CNES, ocupação, horas e CNS de equipe quebrado em duas linhas',async()=>{
 const c=parseCnesPages([page()],{competence:'202610'});assert.equal(c.professionals.length,1);assert.equal(c.professionals[0].occupation,'CARGO FICTÍCIO');assert.equal(c.teams[0].members[0].cns,c.professionals[0].cns);assert.equal(c.metadata.issuedOn,'2026-10-18');
 const normalized=await normalizeCollection(c,['6305245']);assert.equal(normalized.items[0].sourceData.teams.length,1);assert.equal(normalized.pendingTeamMembers,0);
});
test('PDF sem identificação ou com linha inconsistente é bloqueado',()=>{
 const p=page();p.items=p.items.filter(x=>x.s!=='6305245');assert.throws(()=>parseCnesPages([p]),/identificar/);
 const invalid=page();invalid.items.find(x=>x.s==='9000000000000').s='inválido';assert.throws(()=>parseCnesPages([invalid]),/CNS/);
 const missing=page();missing.items=missing.items.filter(x=>x.s!=='900000000000001');assert.throws(()=>parseCnesPages([missing]),/CNS\/CBO/);
 assert.throws(()=>parseCnesPages([{...page(),width:500}]),/Layout/);
});
test('conciliação por CNS/CBO preserva a identidade quando formato do vínculo muda',async()=>{
 const old=await normalizeCollection(parseCnesPages([page()],{competence:'202610'}),['6305245']);const prior=old.items[0];
 const snapshot={revision:3,entries:[{source_id:prior.sourceId,source_hash:prior.sourceHash,source_data:prior.sourceData,local_data:{}}]};
 const next=page();next.items.find(x=>x.s==='Nome Fictício').s='Nome Atualizado';next.items.find(x=>x.s==='VINCULO EMPREGATICIO').s='VÍNCULO EMPREGATÍCIO';
 const incoming=await reconcileCollection(await normalizeCollection(parseCnesPages([next],{competence:'202610'}),['6305245']),snapshot);
 assert.equal(incoming.items[0].sourceId,prior.sourceId);assert.equal(planImport(incoming,snapshot).counts.changed,1);
 assert.throws(()=>reviewedItems(incoming,snapshot,[]),/PREVIEW_REQUIRED/);
 const rejected=reviewedItems(incoming,snapshot,[{sourceId:prior.sourceId,accept:false}]);assert.equal(rejected.items[0].sourceHash,prior.sourceHash);assert.equal(rejected.present.length,0);
 const accepted=reviewedItems(incoming,snapshot,[{sourceId:prior.sourceId,accept:true}]);assert.equal(accepted.present.length,1);
});
test('intervalo real aceita cruzar meses e rejeita datas impossíveis ou mais de 93 dias',()=>{
 assert.equal(calendarWindow({mode:'range',start:'2027-02-25',end:'2027-03-10',page:0,search:'',filters:{cbo:'123'}}).range_end,'2027-03-10');
 for(const [start,end] of [['2027-02-30','2027-03-10'],['2027-03-10','2027-03-01'],['2027-01-01','2028-01-01']])assert.throws(()=>calendarWindow({mode:'range',start,end,page:0,search:''}));
});
test('CNS secundário do PDF reconhece o CNS principal conhecido sem trocar o vínculo',async()=>{
 const next=await normalizeCollection(parseCnesPages([page()],{competence:'202610'}),['6305245']);const original=next.items[0];
 const snapshot={revision:1,entries:[{source_id:'a'.repeat(64),source_hash:'b'.repeat(64),source_data:{...original.sourceData,principalCns:'900000000000002'},local_data:{}}]};
 const result=await reconcileCollection(next,snapshot);assert.equal(result.items[0].sourceId,'a'.repeat(64));assert.equal(result.items[0].sourceData.principalCns,'900000000000002');assert.equal(planImport(result,snapshot).counts.added,0);
});
test('exportação CSV tem carga própria, protege fórmulas e marca afastamentos',()=>{
 const root={};vm.runInNewContext(readFileSync(new URL('../assets/rh-calendar-ui.js',import.meta.url),'utf8'),{globalThis:root,Date});
 const api=root.SGFRhCalendar,days=api.datesBetween('2027-02-28','2027-03-01');assert.equal(days.length,2);
 const csv=api.csv([{full_name:'=FÓRMULA',weekly_hours:40,bond_id:'b'}],[{bond_id:'b',type:'regulamentar',start_date:'2027-03-01',end_date:'2027-03-01'}],days);
 assert.match(csv,/"'=FÓRMULA"/);assert.match(csv,/"40h"/);assert.match(csv,/"F"/);assert.doesNotMatch(csv,/Matrícula/);
});
test('unidades colocam Secretaria por último e UBS em ordem alfabética',()=>{
 const root={};vm.runInNewContext(readFileSync(new URL('../assets/rh-units-ui.js',import.meta.url),'utf8'),{globalThis:root});
 const ordered=root.SGFRhUnits.order([{cnes:'2126486',login:'SECRETARIA'},{cnes:'2',login:'UBS B'},{cnes:'1',login:'UBS A'}]);assert.equal(ordered[0].login,'UBS A');assert.equal(ordered.at(-1).cnes,'2126486');
});
