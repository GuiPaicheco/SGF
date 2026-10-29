// Somente leitura no site de homologação; não captura senha, storage ou tokens.
import {readFile,mkdir} from 'node:fs/promises';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import path from 'node:path';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.SGFS_PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),origin='https://sgf-homologacao.vercel.app';
const env=Object.fromEntries((await readFile(path.join(root,'.env.homologacao.local'),'utf8')).split(/\r?\n/).filter(x=>/^[A-Z_]+=/.test(x)).map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];}));
assert.equal(env.HOMOLOGACAO_URL?.replace(/\/$/,''),origin);
const browser=await chromium.launch({headless:true,...(process.env.SGFS_BROWSER_EXECUTABLE?{executablePath:process.env.SGFS_BROWSER_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[],backendHosts=new Set();
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const host=new URL(r.url()).hostname;if(host.endsWith('supabase.co'))backendHosts.add(host);});
const out=path.join(root,'output','sgfs-maintenance');await mkdir(out,{recursive:true});
try{
 await page.goto(origin);await page.locator('[data-go="login"],#access-identifier').first().waitFor();const login=page.locator('[data-go="login"]');if(await login.count())await login.first().click();
 await page.locator('#access-identifier').selectOption('admin');await page.locator('#access-password').fill(env.ADMIN_PASSWORD);
 await page.getByRole('button',{name:'Entrar no SGFS',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#rh-calendar-unit')||document.querySelector('#login-error:not(.hidden)'));
 assert.equal(await page.locator('#login-error:not(.hidden)').count(),0,'Login pela opção Administração');
 await page.locator('#rh-calendar-unit').selectOption('2126486');await page.getByRole('button',{name:'Conferir integridade dos registros'}).waitFor();
 await page.getByRole('button',{name:'Conferir integridade dos registros'}).click();await page.getByRole('heading',{name:'Conciliação dos registros da unidade'}).waitFor();
 await page.getByRole('button',{name:'Feriados',exact:true}).click();await page.getByRole('heading',{name:'Feriados e pontos facultativos'}).waitFor();
 assert.equal(await page.locator('#holiday-jurisdiction').count(),1);await page.getByText('Classificação não informada — conferir').first().waitFor();
 await page.getByRole('button',{name:'Contas e operadores',exact:true}).click();await page.getByRole('heading',{name:'Contas RH e operadores'}).waitFor();
 assert.equal(await page.getByRole('alert').count(),0);await page.screenshot({path:path.join(out,'deployed-admin-1366.png')});
 await page.getByRole('button',{name:'Histórico',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#app h2')?.textContent?.includes('Histórico'));
 assert.deepEqual([...backendHosts],['pouluaiadcgppxbzqdjw.supabase.co']);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({site:origin,adminLogin:true,calendar:true,reconciliation:true,holidays:true,accounts:true,auditHistory:true,isolatedBackend:true,pageErrors:0}));
}catch(e){await page.screenshot({path:path.join(out,'deployed-test-failure.png')}).catch(()=>{});console.log(JSON.stringify({pageErrors:errors,headings:await page.locator('h1,h2').allTextContents()}));throw e;}finally{if(await page.locator('#session-action:not(.hidden)').count())await page.locator('#session-action').click().catch(()=>{});await browser.close();}
