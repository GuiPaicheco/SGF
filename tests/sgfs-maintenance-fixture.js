const app=document.querySelector('#app'),esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const employee={bond_id:'bond-synthetic',entry_id:'entry-synthetic',full_name:'FUNCIONÁRIO SINTÉTICO COM NOME EXTENSO PARA CONFERÊNCIA',position:'CARGO SINTÉTICO',cbo:'123456',team:'EQUIPE SINTÉTICA',weekly_hours:null,binding_confirmed:true};
const absence={id:'f7000000-0000-0000-0000-000000000001',bond_id:employee.bond_id,origin:'rh',type:'regulamentar',sequence:1,start_date:'2028-02-01',end_date:'2028-02-15',return_date:'2028-02-16',days:11,counting_mode:'uteis',protocol:'RH-SINTÉTICO'};
const data={employees:[employee],absences:[absence],total:1,context:{cnes_name:'UNIDADE SINTÉTICA'},range_start:'2028-02-01',range_end:'2028-02-29',holidays:[],conflicts:[],facets:{full_name:[employee.full_name],position:[employee.position],team:[employee.team]}};
let calls=[],multiple=false,holidayMode='empty';
const request=async p=>{calls.push(p);if(p.action==='calendar')return {...data,absences:multiple?[absence,{...absence,id:'f7000000-0000-0000-0000-000000000002',sequence:2}]:[absence]};
 if(p.action==='leave-detail')return{id:p.leaveId,version:1,status:'programada',snapshot:{...employee,unit:'UNIDADE SINTÉTICA'},plan:{type:'regulamentar',periods:[absence],acquisition_start:null},operator_name:'OPERADOR SINTÉTICO',created_at:'2026-10-01T12:00:00Z',history:[{action:'daps_spreadsheet_import',occurred_at:'2026-10-01T12:00:00Z'}]};
 if(p.action==='change-own-password')return {ok:true,logout_required:true};
 if(p.action==='reconciliation-report')return {total_records:1,total_flagged:1,calendar_population:1,cnes_population:0,items:[{id:absence.id,origin:'rh',status:'programada',version:1,issues:['acquisition_unstructured','regime_unknown']}]};
 if(p.action==='launch-employees')return {employees:[employee],total:1};
 if(p.action==='leave-resources')return{...employee,unit:'UNIDADE SINTÉTICA',admission_date:'2020-01-01'};
 if(p.action==='calendar-list'){if(holidayMode==='error')throw Error('Falha sintética de consulta');return{events:holidayMode==='legacy'?[{id:'holiday-synthetic',version:1,event_date:'2028-02-29',name:'DATA SINTÉTICA',type:'feriado',scope:'general',unit_ids:[],jurisdiction:'nao_informada'}]:[],units:[]};}
 throw Error('Ação não prevista no teste: '+p.action);
};
const view={month:'2028-02',mode:'month',start:'',end:'',search:'',unit:'',page:0,colOpen:false,filters:{full_name:[],position:[],cbo:[],team:[],status:'todos',conflict_criteria:[]},cols:[['full_name','Nome do funcionário'],['position','Cargo'],['weekly_hours','Carga horária']],hidden:[]};
window.fixture={password:()=>SGFRhAccounts.password({app,esc,request,isCurrent:()=>true,onBack:()=>fixture.calendar(false),onDone:()=>fixture.calendar(false)}),calls:()=>calls,calendar:async multi=>{calls=[];multiple=!!multi;await SGFRhCalendar.mount({app,esc,request,isCurrent:()=>true,context:data.context,viewState:view});},holidays:async mode=>{calls=[];holidayMode=mode;await SGFHolidays.mount({app,esc,request,isCurrent:()=>true});},launch:async()=>{calls=[];await SGFRhLaunch.mount({app,esc,request,isCurrent:()=>true,viewState:{search:'SINTÉTICO',page:0},onBack:()=>{throw Error('Voltar sem salvar não deve abrir calendário');}});}};
fixture.calendar(false);
