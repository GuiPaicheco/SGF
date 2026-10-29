import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(file){
 const nodes=new Map(),app={innerHTML:'',setAttribute(){},querySelectorAll:()=>[],querySelector(s){if(!nodes.has(s))nodes.set(s,{});return nodes.get(s);}};
 const root={SGFCnesSource:{sourceView:()=>'',renderData:()=>''}};
 runInNewContext(readFileSync(new URL('../assets/'+file,import.meta.url),'utf8'),{globalThis:root,Date});
 return {app,root};
}
test('calendário aplica presença antes de paginar e mantém a seleção na exportação',async()=>{
 const {app,root}=harness('rh-calendar-ui.js'),calls=[];
 await root.SGFRhCalendar.mount({app,esc:String,isCurrent:()=>true,request:async p=>{calls.push(p);return {employees:[],absences:[],total:60};}});
 assert.match(app.innerHTML,/Todos os funcionários/);assert.match(app.innerHTML,/Somente com lançamentos no período/);
 app.querySelector('#rh-calendar-month').value='2027-02';app.querySelector('#rh-calendar-presence').value='com_afastamento';
 app.querySelector('#rh-calendar-filter').onsubmit({preventDefault(){}});await tick();
 assert.equal(calls.at(-1).filters.status,'com_afastamento');
 app.querySelector('#rh-calendar-next').onclick();await tick();assert.equal(calls.at(-1).page,1);assert.equal(calls.at(-1).filters.status,'com_afastamento');
 root.SGFRhCalendarExport={download:async()=>{}};
 await app.querySelector('#rh-export-xlsx').onclick();assert.ok(calls.slice(-2).every(p=>p.filters.status==='com_afastamento'));
 app.querySelector('#rh-calendar-clear').onclick();await tick();assert.equal(calls.at(-1).filters.status,'todos');assert.equal(calls.at(-1).page,0);
});
test('filtros CNES combinam busca, cargo, equipe e carga; paginação conserva e limpeza reinicia',async()=>{
 const {app,root}=harness('rh-units-ui.js'),calls=[];
 await root.SGFRhUnits.mount({app,esc:String,isCurrent:()=>true,initialUnit:'6305245',request:async()=>({units:[{cnes:'6305245',login:'UBS TESTE'}]}),cnesRequest:async p=>{calls.push(p);return p.action==='list'?{entries:[],total:65,facets:{position:['Enfermeiro'],team_name:['Equipe A'],weekly_hours:['32.5','Não informada']}}:{};}});
 assert.match(app.innerHTML,/32.5h/);assert.match(app.innerHTML,/Não informada/);
 for(const [key,value] of Object.entries({search:'Ana',position:'Enfermeiro',team:'Equipe A',hours:'32.5'}))app.querySelector('#unit-'+key).value=value;
 app.querySelector('#unit-filters').onsubmit({preventDefault(){}});await tick();
 let q=calls.filter(p=>p.action==='list').at(-1);assert.equal(q.search,'Ana');assert.deepEqual(JSON.parse(JSON.stringify(q.filters)),{position:'Enfermeiro',team_name:'Equipe A',weekly_hours:'32.5'});
 app.querySelector('#unit-next').onclick();await tick();q=calls.filter(p=>p.action==='list').at(-1);assert.equal(q.page,1);assert.equal(q.filters.weekly_hours,'32.5');
 app.querySelector('#unit-filters-clear').onclick();await tick();q=calls.filter(p=>p.action==='list').at(-1);assert.equal(q.page,0);assert.equal(q.search,'');assert.ok(Object.values(q.filters).every(v=>v===''));
});
