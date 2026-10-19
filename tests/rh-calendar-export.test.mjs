import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInThisContext} from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ExcelJS=require('../assets/vendor/exceljs.min.js'),jspdf=require('../assets/vendor/jspdf.umd.min.js');
require('../assets/vendor/jspdf.plugin.autotable.min.js').applyPlugin(jspdf.jsPDF);
function api(){Object.assign(globalThis,{ExcelJS,jspdf});for(const f of ['rh-calendar-ui.js','rh-calendar-export.js'])runInThisContext(readFileSync(new URL('../assets/'+f,import.meta.url),'utf8'));return globalThis;}
const columns=[['full_name','Nome do funcionário'],['position','Cargo'],['cbo','CBO'],['weekly_hours','Carga horária'],['team','Equipe']];
const sample=()=>({unit:'UBS FICTÍCIA',competence:'01/01/2027 a 31/01/2027',rows:[{bond_id:'1',full_name:'ÁLVARO FICTÍCIO',position:'TÉCNICO DE ENFERMAGEM',cbo:'032205',weekly_hours:40,team:null,birth_month_day:'01-20'},{bond_id:'2',full_name:'=NOME DE TESTE',position:'TÉCNICO DE ENFERMAGEM',cbo:'032205',weekly_hours:30,team:'EQUIPE TESTE',birth_month_day:'12-20'}],items:[{id:'1',bond_id:'1',type:'regulamentar',protocol:'F1',origin:'rh',status:'programada',sequence:1,start_date:'2027-01-18',end_date:'2027-01-22',return_date:'2027-01-25'},{id:'2',bond_id:'2',type:'premio',protocol:'P2',origin:'rh',status:'programada',sequence:1,start_date:'2027-01-20',end_date:'2027-01-29',return_date:'2027-02-01'}],days:Array.from({length:31},(_,i)=>'2027-01-'+String(i+1).padStart(2,'0')),layout:'longitudinal',columns,conflicts:[{date:'2027-01-20',bond_ids:['1','2']}],criteria:['cbo'],holidays:[{date:'2027-01-01',type:'feriado'}]});
test('XLSX real preserva tipos, filtros, cores, congelamento e todos os dados',async()=>{
 const root=api(),o=sample(),{buffer}=await root.SGFRhCalendarExport.xlsx(o),read=new ExcelJS.Workbook();await read.xlsx.load(buffer);const sheet=read.getWorksheet('Calendário');
 assert.equal(Buffer.from(buffer).subarray(0,2).toString(),'PK');assert.equal(sheet.getCell('A1').value,o.unit);assert.equal(sheet.rowCount,8);assert.equal(sheet.columnCount,36);assert.equal(sheet.getCell('D7').value,40);assert.equal(sheet.getCell('C7').value,'032205');assert.equal(sheet.getCell('A8').value,'=NOME DE TESTE');assert.equal(sheet.getCell('A8').type,ExcelJS.ValueType.String);assert.equal(sheet.getCell('E7').value,'Não se aplica');assert.equal(sheet.views[0].ySplit,6);assert.equal(sheet.views[0].xSplit,5);assert.ok(sheet.autoFilter);assert.equal(sheet.getCell(6,25).value.toISOString().slice(0,10),'2027-01-20');assert.equal(sheet.getCell(7,25).value,'! F/A');assert.equal(sheet.getCell(7,25).fill.fgColor.argb,'FFF0CF');assert.equal(sheet.getCell(8,25).value,'! I');assert.equal(read.getWorksheet('Afastamentos').rowCount,3);assert.ok(read.getWorksheet('Afastamentos').getCell('I2').value instanceof Date);assert.doesNotMatch(sheet.getRow(6).values.join('|'),/Aniversário|Retorno previsto/);
});
test('PDF real é A4 paisagem e repete dados ao dividir datas em faixas',async()=>{
 const root=api(),o=sample(),doc=await root.SGFRhCalendarExport.pdf(o),text=doc.output();
 assert.equal(doc.getNumberOfPages(),5);assert.ok(Math.abs(doc.internal.pageSize.getWidth()-297)<.1);assert.ok(Math.abs(doc.internal.pageSize.getHeight()-210)<.1);assert.match(text,/%PDF-/);assert.equal((text.match(/UBS FICT/g)||[]).length,5);assert.equal((text.match(/032205/g)||[]).length,10);assert.match(text,/31\/01/);assert.match(text,/01\/01/);
});
test('exportação nominal marca conflitos somente na linha afastada e aniversário somente no dia',()=>{
 const root=api(),o=sample();o.layout='nominal';const r={...o.rows[0],_absence:{...o.items[0],start_date:'2027-01-21'}};assert.equal(root.SGFRhCalendarExport.mark(r,'2027-01-20',o),'A');assert.equal(root.SGFRhCalendarExport.mark(o.rows[1],'2027-01-20',{...o,layout:'longitudinal'}),'! I');assert.equal(root.SGFRhCalendarExport.mark(o.rows[0],'2027-01-19',{...o,layout:'longitudinal'}),'F');
});
