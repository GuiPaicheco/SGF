import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {calendarQuery,bindingInput} from '../supabase/functions/_shared/rh-calendar.mjs';
import '../assets/access-policy.js';
const source=readFileSync(new URL('../assets/rh-calendar-ui.js',import.meta.url),'utf8');
const uuid='a0000000-0000-0000-0000-000000000001';
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function harness(){const nodes=new Map(),app={innerHTML:'',querySelectorAll:selector=>nodes.get(selector)||[],querySelector:selector=>{if(!nodes.has(selector))nodes.set(selector,{});return nodes.get(selector);}};const root={};runInNewContext(source,{globalThis:root,Date});return {app,nodes,api:root.SGFRhCalendar};}
test('consulta aceita mês delimitado e busca literal; rejeita páginas e entradas excessivas',()=>{
 assert.deepEqual(calendarQuery({month:'2026-11',page:0,search:'  UBS %  '}),{filter_json:{},target_month:'2026-11-01',page_index:0,search_text:'UBS %'});
 for(const patch of [{month:'2026-13'},{month:'2026-11-01'},{month:'2101-01'},{page:101},{page:-1},{page:'0'},{search:'x'.repeat(121)},{search:null}])assert.throws(()=>calendarQuery({month:'2026-11',page:0,search:'',...patch}),/RH_INPUT_INVALID/);
});
test('integração exige polo explícito, versões e justificativa sem aceitar vínculo arbitrário',()=>{
 const payload={entryId:uuid,entryVersion:2,bindingVersion:0,bondId:null,confirmPole:true,reason:' Conferência '};
 assert.equal(bindingInput(payload).target_reason,'Conferência');
 for(const patch of [{confirmPole:false},{entryVersion:0},{bindingVersion:-1},{bondId:'inventado'},{reason:'x'},{entryId:'invalid'}])assert.throws(()=>bindingInput({...payload,...patch}),/RH_BINDING_INPUT_INVALID/);
});
test('calendário respeita ano bissexto e distribuição legada por data',()=>{
 const {api}=harness();assert.equal(api.daysInMonth('2024-02'),29);assert.equal(api.daysInMonth('2026-02'),28);
 const row={bond_id:uuid},absence={bond_id:uuid,start_date:'2026-11-03',end_date:'2026-11-05',distributed:true,assigned_dates:['2026-11-04']};
 assert.equal(api.visibleAbsences(row,'2026-11-03',[absence]).length,0);assert.equal(api.visibleAbsences(row,'2026-11-04',[absence]).length,1);
 assert.equal(api.visibleAbsences({bond_id:'other'},'2026-11-04',[absence]).length,0);
});
test('visão RH renderiza colunas, conserva cadastro incompleto e não expande HTML da fonte',async()=>{
 const {api,app}=harness();const calls=[];
 await api.mount({app,esc,isCurrent:()=>true,request:async payload=>{calls.push(payload);return {context:{cnes_name:'UNIDADE TESTE'},total:1,employees:[{row_id:uuid,full_name:'<script>FICTÍCIO</script>',origin:'cnes',weekly_hours:32.5}],absences:[],holidays:[]};}});
 assert.equal(calls.length,1);assert.equal(calls[0].action,'calendar');assert.equal(calls[0].page,0);assert.equal(calls[0].cnes,undefined);
 for(const label of ['Nome do funcionário','Cargo','CBO','Equipe','Carga horária','32.5h'])assert.ok(app.innerHTML.includes(label));
 assert.ok(!app.innerHTML.includes('<script>FICTÍCIO'));assert.match(app.innerHTML,/tabindex="0"/);
});
test('Administrador consulta uma unidade explícita e RH não tem acesso à rota global',async()=>{
 const {api,app}=harness();let queried;
 await api.mount({app,esc,admin:true,isCurrent:()=>true,request:async payload=>payload.action==='directory'?{units:[{cnes:'6305245',login:'UBS AMAZONAS'}]}:(queried=payload,{context:{cnes_name:'UBS AMAZONAS'},total:0,employees:[],absences:[],holidays:[]})});
 assert.equal(queried,undefined);assert.match(app.innerHTML,/Selecione uma unidade/);assert.equal(SGFAccessPolicy.allowed('rh-calendar','administrador',true),true);
 for(const role of ['rh','diretor','servidor'])assert.equal(SGFAccessPolicy.allowed('rh-calendar',role,true),false);
});
test('resposta atrasada não substitui tela após navegação',async()=>{
 const {api,app}=harness();let finish,current=true;
 const pending=api.mount({app,esc,isCurrent:()=>current,request:()=>new Promise(resolve=>{finish=resolve;})});
 current=false;app.innerHTML='OUTRA TELA';finish({context:{cnes_name:'ATRASADA'},employees:[],absences:[],holidays:[],total:0});await pending;
 assert.equal(app.innerHTML,'OUTRA TELA');
});

test('filtros delimitados e literais recusam campos e situações arbitrários',()=>{
 const input={month:'2027-03',page:0,search:'',filters:{position:' CARGO % ',cbo:'123',team:'Equipe',review:'pendente',type:'banco_horas',status:'cancelada'}};
 assert.equal(calendarQuery(input).filter_json.position,'CARGO %');
 for(const filters of [[],{status:'aprovada'},{type:'outro'},{review:null},{position:1},{team:'x'.repeat(121)},{unit:'outra'}])assert.throws(()=>calendarQuery({...input,filters}),/RH_INPUT_INVALID/);
});

test('consulta, paginação e limpeza preservam mês e enviam os filtros ao servidor',async()=>{
 const {api,app,nodes}=harness(),calls=[];const result={context:{cnes_name:'TESTE'},total:60,employees:[],absences:[],holidays:[]};
 await api.mount({app,esc,isCurrent:()=>true,request:async p=>{calls.push(p);return result;}});
 app.querySelector('#rh-calendar-month').value='2027-03';
 nodes.set('[data-rh-filter="position"]:checked',[{value:'Enfermeiro'}]);nodes.set('[data-rh-filter="team"]:checked',[{value:'Equipe'}]);nodes.set('[data-rh-conflict]:checked',[{dataset:{rhConflict:'team'}}]);
 app.querySelector('#rh-calendar-filter').onsubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));assert.equal(calls.at(-1).filters.position[0],'Enfermeiro');assert.equal(calls.at(-1).filters.cbo.length,0);assert.equal(calls.at(-1).filters.conflict_criteria[0],'team');
 app.querySelector('#rh-calendar-next').onclick();await new Promise(r=>setImmediate(r));assert.equal(calls.at(-1).page,1);assert.equal(calls.at(-1).filters.team[0],'Equipe');
 app.querySelector('#rh-calendar-clear').onclick();await new Promise(r=>setImmediate(r));assert.equal(calls.at(-1).page,0);assert.equal(calls.at(-1).month,'2027-03');assert.equal(calls.at(-1).filters.status,'todos');assert.equal(calls.at(-1).search,'');
});

test('sobreposição de registros distintos ganha aviso textual; repetição do mesmo registro não',async()=>{
 const {api,app}=harness();const absence={id:uuid,origin:'rh',bond_id:uuid,start_date:'2026-10-01',end_date:'2100-12-31',type:'regulamentar'};
 const request=async()=>({context:{cnes_name:'TESTE'},total:1,employees:[{row_id:uuid,bond_id:uuid,full_name:'FICTÍCIO'}],absences:[absence,{...absence,id:'other',type:'premio'}],holidays:[]});
 await api.mount({app,esc,isCurrent:()=>true,request});assert.match(app.innerHTML,/rh-conflict/);assert.match(app.innerHTML,/Possível sobreposição/);
 await api.mount({app,esc,isCurrent:()=>true,request:async()=>({...await request(),absences:[absence,{...absence}]})});assert.doesNotMatch(app.innerHTML,/class="rh-day rh-conflict"/);
});

test('calendário restaura período, filtros e colunas ao voltar à aba',async()=>{
 const {api,app}=harness(),viewState={month:'2027-03',mode:'range',start:'2027-03-01',end:'2027-03-20',search:'Ana',unit:'1',page:1,colOpen:false,filters:{position:'Enfermeiro',cbo:'123',team:'Equipe A',review:'todos',type:'todos',status:'todos'},cols:[['full_name','Nome'],['cbo','CBO']],hidden:['cbo']};let query;
 await api.mount({app,esc,isCurrent:()=>true,viewState,request:async q=>(query=q,{employees:[],absences:[],records:[],holidays:[],total:51,range_start:'2027-03-01',range_end:'2027-03-20'})});
 assert.equal(query.mode,'range');assert.equal(query.start,'2027-03-01');assert.equal(query.search,'Ana');assert.equal(query.page,1);assert.equal(query.filters.team,'Equipe A');assert.match(app.innerHTML,/value="2027-03-20"/);
});

test('visões nominal e longitudinal preservam registros e mostram sobreposições',async()=>{
 const {api,app}=harness(),row={bond_id:uuid,full_name:'TESTE',birth_month_day:'01-20'},items=[{id:'ferias',origin:'rh',sequence:1,bond_id:uuid,type:'regulamentar',protocol:'F1',start_date:'2027-01-18',end_date:'2027-02-22',return_date:'2027-02-23'},{id:'folga',origin:'legado',sequence:1,bond_id:uuid,type:'banco_horas',protocol:'B1',start_date:'2027-01-16',end_date:'2027-01-25',return_date:'2027-01-26'}];
 assert.equal(api.calendarRows([row],items,'longitudinal').length,1);assert.equal(api.calendarRows([row],items,'nominal').length,2);assert.deepEqual(Array.from(api.returnDates(items)),['2027-02-23']);
 const saved={layout:'nominal'};await api.mount({app,esc,isCurrent:()=>true,viewState:saved,request:async()=>({context:{cnes_name:'UBS TESTE'},source_competence:'202610',employees:[row],absences:items,total:1,range_start:'2027-01-16',range_end:'2027-02-23'})});
 assert.match(app.innerHTML,/RH|F1/);assert.match(app.innerHTML,/B1/);assert.match(app.innerHTML,/! F/);assert.match(app.innerHTML,/! B/);assert.match(app.innerHTML,/Competência: 16\/01\/2027 a 23\/02\/2027/);assert.doesNotMatch(app.innerHTML,/Competência CNES|Retorno previsto<\/th>|>Aniversário<\/th>|data-rh-new-leave|<th>Ações<\/th>|>Programar</);assert.match(app.innerHTML,/rh-calendar-meta/);
 assert.equal(api.cellMark(row,'2027-01-20',[], 'longitudinal'),'A');assert.equal(api.cellMark(row,'2027-01-20',items,'longitudinal'),'F/B/A');assert.equal(api.cellMark(row,'2027-02-23',items,'longitudinal'),'R');
 const exported=api.csv([row],items,['2027-01-18'],undefined,'nominal');assert.match(exported,/F1/);assert.match(exported,/B1/);assert.equal(exported.split('\r\n').length,3);
});
test('retornos separados não são apresentados como afastamento contínuo',()=>{
 const {api}=harness();assert.deepEqual(Array.from(api.returnDates([{start_date:'2027-01-01',return_date:'2027-01-05'},{start_date:'2027-01-10',return_date:'2027-01-15'}])),['2027-01-05','2027-01-15']);
});
test('após lançar, calendário abre intervalo salvo e limpa filtros anteriores',async()=>{
 const {api,app}=harness();let query;await api.mount({app,esc,isCurrent:()=>true,viewState:{focusRange:{month:'2027-01',start:'2027-01-18',end:'2027-02-23'}},request:async q=>(query=q,{context:{},employees:[],absences:[],total:0})});assert.equal(query.mode,'range');assert.equal(query.start,'2027-01-18');assert.equal(query.end,'2027-02-23');
});

test('checkboxes usam catálogo da unidade em ordem alfabética, sem situação ou campos livres',async()=>{
 const {api,app}=harness();await api.mount({app,esc,isCurrent:()=>true,request:async()=>({context:{},total:0,employees:[],absences:[],facets:{full_name:['ZÉ','ANA'],position:['ZELADOR','ADMINISTRATIVO'],cbo:['999999','111111'],team:['EQUIPE Z','EQUIPE A','Não se aplica']},conflicts:[]})});
 assert.ok(app.innerHTML.indexOf('value="ANA"')<app.innerHTML.indexOf('value="ZÉ"'));assert.ok(app.innerHTML.indexOf('value="EQUIPE A"')<app.innerHTML.indexOf('value="EQUIPE Z"'));assert.doesNotMatch(app.innerHTML,/data-rh-filter="cbo"|rh-filter-type|rh-filter-status|rh-calendar-search|rh-col-birth_month_day|Retorno previsto<\/th>/);assert.match(app.innerHTML,/Exportar planilha \(XLSX\)/);
});
test('conflito de colega fora da página é marcado, sem inventar aniversário fora da competência',async()=>{
 const {api,app}=harness(),r={bond_id:uuid,full_name:'ANA',birth_month_day:'12-20'};await api.mount({app,esc,isCurrent:()=>true,request:async()=>({context:{},range_start:'2027-01-20',range_end:'2027-01-20',total:1,employees:[r],absences:[{id:'a',bond_id:uuid,type:'regulamentar',start_date:'2027-01-20',end_date:'2027-01-20'}],conflicts:[{date:'2027-01-20',bond_ids:[uuid,'outra-pagina']}],facets:{}})});assert.match(app.innerHTML,/Afastamentos simultâneos na unidade/);assert.match(app.innerHTML,/! F/);assert.doesNotMatch(app.innerHTML,/20\/12|>A<\/td>/);
});
test('contrato aceita seleções exatas e rejeita listas ou critérios abusivos',()=>{
 const base={month:'2027-01',page:0,search:''};assert.deepEqual(calendarQuery({...base,filters:{full_name:[' ANA ','ANA'],cbo:['001234'],conflict_criteria:['cbo','team'],conflict_only:true}}).filter_json,{full_name:['ANA'],cbo:['001234'],conflict_criteria:['cbo','team'],conflict_only:true});
 for(const filters of [{conflict_criteria:['invalid']},{conflict_only:'true'},{team:[null]},{full_name:Array(201).fill('Ana')},{cbo:['']},{position:['x'.repeat(241)]}])assert.throws(()=>calendarQuery({...base,filters}),/RH_INPUT_INVALID/);
});
