import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.SGFS_PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer(async(req,res)=>{const name=new URL(req.url,'http://localhost').pathname;if(!/^\/(assets\/[^.][^/]*\.(js|css)|tests\/sgfs-maintenance-fixture\.(html|js))$/.test(name)){res.writeHead(404).end();return;}try{const file=await readFile(path.join(root,name));res.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html');res.end(file);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.SGFS_BROWSER_EXECUTABLE?{executablePath:process.env.SGFS_BROWSER_EXECUTABLE}:{})});
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const out=path.join(root,'output','sgfs-maintenance');await mkdir(out,{recursive:true});
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/tests/sgfs-maintenance-fixture.html');
 await page.locator('[data-vacation-date]').first().waitFor();
 for(const width of [360,390,768,1024,1366,1920]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Sem rolagem lateral da página em '+width);await page.screenshot({path:path.join(out,'calendar-'+width+'.png')});}
 await page.setViewportSize({width:390,height:844});
 for(const day of ['2028-02-01','2028-02-08','2028-02-15']){
  const button=page.locator('[data-vacation-date="'+day+'"]');await button.focus();await page.keyboard.press('Enter');await page.locator('dialog[open]').waitFor();await page.keyboard.press('Escape');await page.waitForFunction(day=>document.activeElement?.dataset.vacationDate===day,day);assert.equal(await page.evaluate(()=>document.activeElement?.dataset.vacationDate),day);
 }
 assert.equal(await page.locator('[data-vacation-date="2028-02-16"]').count(),0);
 assert.equal(await page.evaluate(()=>fixture.calls().some(x=>/create|close|revise/.test(x.action))),false);
 await page.evaluate(()=>fixture.calendar(true));await page.locator('[data-vacation-date="2028-02-08"]').click();assert.equal(await page.locator('[data-vacation-choice]').count(),2);
 await page.locator('[data-vacation-choice="1"]').click();await page.getByRole('heading',{name:'Registro de afastamento'}).waitFor();assert.equal(await page.evaluate(()=>fixture.calls().findLast(x=>x.action==='leave-detail').leaveId),'f7000000-0000-0000-0000-000000000002');
 await page.getByText('Histórico deste lançamento').click();await page.getByText('Importado da planilha DAPS').waitFor();await page.getByText('Carga horária não informada',{exact:true}).waitFor();await page.getByText('Não estruturado — legado não conferido').waitFor();await page.screenshot({path:path.join(out,'detail-390.png')});
 await page.getByRole('button',{name:'Voltar ao calendário'}).click();await page.locator('[data-vacation-date]').first().waitFor();assert.equal(await page.locator('#rh-calendar-month').inputValue(),'2028-02');
 await page.locator('#rh-reconcile').click();await page.getByRole('heading',{name:'Conciliação dos registros da unidade'}).waitFor();await page.screenshot({path:path.join(out,'reconciliation-390.png')});await page.locator('#reconcile-back').click();await page.locator('[data-vacation-date]').first().waitFor();
 await page.evaluate(()=>fixture.launch());await page.locator('[data-launch-entry]').click();await page.getByRole('button',{name:'Voltar aos profissionais'}).click();await page.getByRole('heading',{name:'Férias e Cadastros'}).waitFor();assert.equal(await page.locator('#rh-launch-name').inputValue(),'SINTÉTICO');
 for(const state of ['empty','error','legacy']){await page.evaluate(state=>fixture.holidays(state),state);await page.getByRole('heading',{name:'Feriados e pontos facultativos'}).waitFor();if(state==='empty')await page.getByText('Nenhum feriado ou ponto facultativo cadastrado.').waitFor();if(state==='error'){await page.getByRole('alert').waitFor();assert.equal(await page.getByText('Nenhum feriado ou ponto facultativo cadastrado.').count(),0);}if(state==='legacy'){await page.locator('[data-holiday-edit]').click();assert.equal(await page.locator('#holiday-jurisdiction').inputValue(),'');}await page.screenshot({path:path.join(out,'holidays-'+state+'-390.png')});}
 await page.evaluate(()=>fixture.password());await page.locator('#unit-current-password').fill('SYNTHETIC-OLD');await page.locator('#unit-new-password').fill('SYNTHETIC-NEW');await page.locator('#unit-repeat-password').fill('DIFFERENT-NEW');await page.getByRole('button',{name:'Confirmar troca e sair'}).click();await page.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>fixture.calls().some(x=>x.action==='change-own-password')),false);await page.locator('#unit-password-back').click();
 await page.evaluate(()=>fixture.calendar(false));await page.setViewportSize({width:768,height:900});await page.evaluate(()=>document.documentElement.style.zoom='200%');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Zoom 200%');await page.screenshot({path:path.join(out,'calendar-zoom200.png')});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({widths:[360,390,768,1024,1366,1920],keyboard:true,focusRestored:true,multipleChoices:true,stableId:true,readOnlyConsultation:true,returnToList:true,holidayStates:true,zoom200:true,pageErrors:errors.length,screenshots:out}));
}finally{await browser.close();server.close();}
