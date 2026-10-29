import '../assets/access-policy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {validCalendarInput} from '../supabase/functions/_shared/calendar-input.mjs';
import '../assets/rh-calendar-ui.js';
import '../assets/rh-leave-ui.js';
const item={event_date:'2028-02-29',name:'Data sintética',type:'feriado',jurisdiction:'municipal',source_url:'https://example.invalid/ato',scope:'general',unit_ids:[]};
test('contrato de feriados aceita data real bissexta e exige esfera e fonte explícitas',()=>{
 assert.equal(validCalendarInput(item),true);
 for(const patch of [{event_date:'2027-02-29'},{event_date:'2028-02-30'},{event_date:'2028-02-29-extra'},{jurisdiction:'nao_informada'},{jurisdiction:null},{source_url:''},{source_url:'javascript:alert(1)'},{name:' '}])assert.equal(validCalendarInput({...item,...patch}),false);
});
test('fase temporal independe do selo administrativo e reconhece intervalos entre parcelas',()=>{
 const phase=SGFRhLeave.temporalPhase,p=(start,end)=>({start_date:start,end_date:end});
 assert.equal(phase({periods:[p('2026-10-01','2026-10-15')]},'2026-10-29'),'Passado');
 assert.equal(phase({periods:[p('2026-10-29','2026-11-15')]},'2026-10-29'),'Em andamento');
 assert.equal(phase({periods:[p('2026-11-01','2026-11-15')]},'2026-10-29'),'Futuro');
 assert.equal(phase({periods:[p('2026-10-01','2026-10-15'),p('2026-11-01','2026-11-15')]},'2026-10-29'),'Entre parcelas');
});
test('consulta pelo dia resolve vínculo, ID e parcela sem incluir folga, ausência ou nome homônimo',()=>{
 const resolve=SGFRhCalendar.vacationOccurrences,row={bond_id:'bond-a'},base={origin:'rh',id:'leave-a',bond_id:'bond-a',type:'regulamentar',sequence:1,start_date:'2028-02-01',end_date:'2028-02-15'};
 const items=[base,{...base,id:'leave-b',sequence:2},{...base,type:'folga',id:'folga'},{...base,type:'afastamento',id:'absence'},{...base,bond_id:'bond-b',id:'other-person'},{...base,origin:'legado',id:'legacy'}];
 for(const day of ['2028-02-01','2028-02-08','2028-02-15'])assert.deepEqual(resolve(row,day,items).map(x=>x.id),['leave-a','leave-b']);
 assert.deepEqual(resolve(row,'2028-02-16',items),[]);
 assert.deepEqual(resolve({...row,_absence:items[1]},'2028-02-08',items,'nominal').map(x=>x.id),['leave-b']);
});

test('rotas de senha e administração conservam separação de perfis',()=>{assert.equal(SGFAccessPolicy.allowed('rh-password','rh',true),true);assert.equal(SGFAccessPolicy.allowed('rh-access','administrador',true),true);assert.equal(SGFAccessPolicy.allowed('rh-access','rh',true),false);assert.equal(SGFAccessPolicy.allowed('rh-password','administrador',true),false);assert.equal(SGFAccessPolicy.allowed('rh-password','rh',false),false);});
