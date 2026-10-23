import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {calendarWindow} from '../supabase/functions/_shared/rh-calendar.mjs';
const query=(start,end)=>calendarWindow({mode:'range',start,end,page:0,search:''});
test('período aceita 12 meses, inclusive ano bissexto, mas não o aniversário seguinte',()=>{
 for(const [a,b] of [['2027-01-01','2027-12-31'],['2027-03-01','2028-02-29'],['2028-02-29','2029-02-27']])assert.equal(query(a,b).range_end,b);
 for(const [a,b] of [['2027-01-01','2028-01-01'],['2028-02-29','2029-02-28'],['2027-02-30','2027-03-01'],['2027-03-02','2027-03-01']])assert.throws(()=>query(a,b),/RH_INPUT_INVALID/);
});
test('calendário não trunca o ano em 93 dias e separa day-off das férias úteis',()=>{
 const root={};runInNewContext(readFileSync(new URL('../assets/rh-calendar-ui.js',import.meta.url),'utf8'),{globalThis:root,Date});
 const api=root.SGFRhCalendar,row={bond_id:'b'},vacation={id:'f',bond_id:'b',type:'regulamentar',counting_mode:'uteis',start_date:'2028-06-05',end_date:'2028-07-10'},off={id:'d',bond_id:'b',type:'dayoff',start_date:'2028-06-06',end_date:'2028-06-06'};
 assert.equal(api.cellMark({...row,birthday_dayoff:true,birth_month_day:'06-06'},'2028-06-06',[vacation],'longitudinal'),'D');
 assert.equal(api.datesBetween('2027-03-01','2028-02-29').length,366);
 assert.equal(api.cellMark(row,'2028-06-06',[vacation,off],'longitudinal'),'D');
 assert.equal(api.cellMark({...row,_absence:vacation},'2028-06-06',[vacation,off],'nominal'),'');
 assert.equal(api.visibleAbsences(row,'2028-06-06',[{...vacation,counting_mode:'corridos'},off]).length,2);
});
test('comprovante utiliza day-offs efetivamente considerados pelo cálculo',()=>{
 const root={};runInNewContext(readFileSync(new URL('../assets/rh-receipt.js',import.meta.url),'utf8'),{globalThis:root,Date});
 const receipt=root.SGFRhReceipt.fromLeave({id:'a',snapshot:{},plan:{legal:{},periods:[],day_offs:['2028-06-06']}});
 assert.equal(receipt.dayOffs[0],'2028-06-06');assert.match(root.SGFRhReceipt.text(receipt),/Day-off de aniversário: 06\/06\/2028/);
});
