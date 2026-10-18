import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.resolve(root,process.argv[2]||'tmp/pdfs');await mkdir(out,{recursive:true});
const context={};runInNewContext(await readFile(path.join(root,'assets/rh-receipt.js'),'utf8'),{globalThis:context,Date,Set});
const fixture=await readFile(path.join(root,'tests/receipt-print.html'),'utf8');
const sample=runInNewContext(fixture.slice(fixture.indexOf('const sample='),fixture.indexOf('SGFRhReceipt.show'))+';sample');
const long=JSON.parse(JSON.stringify(sample));Object.assign(long.snapshot,{full_name:'FUNCIONÁRIO FICTÍCIO '.repeat(7),position:'CARGO FICTÍCIO '.repeat(9),team:'EQUIPE FICTÍCIA DE VERIFICAÇÃO '.repeat(22)});
Object.assign(long.plan,{type:'banco_horas',periods:[sample.plan.periods[0]],notes:('Observação fictícia para conferir paginação, acentos e integridade do texto.\n').repeat(15).slice(0,1000),bank:{declared_minutes:0,required_minutes:960,missing_minutes:960,override:true,override_reason:('Justificativa fictícia de exceção conferida pelo RH. ').repeat(11).slice(0,500)}});
for(const [name,record] of [['comprovante-curto',sample],['comprovante-extenso',long]]){
 const html=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>SGF — ${name} fictício</title><base href="${pathToFileURL(root+path.sep).href}"><link rel="stylesheet" href="assets/app.css"><link rel="stylesheet" href="assets/receipt.css"><body><main class="app"><section class="card receipt-card">${context.SGFRhReceipt.document(context.SGFRhReceipt.fromLeave(record))}</section></main></body></html>`;
 await writeFile(path.join(out,name+'.json'),JSON.stringify({required:[record.snapshot.full_name,record.snapshot.registration,record.snapshot.position,record.snapshot.cbo,record.snapshot.team,record.plan.notes,record.plan.bank.override_reason].filter(Boolean)}));
 await writeFile(path.join(out,name+'.html'),html);console.log(path.join(out,name+'.html'));
}
