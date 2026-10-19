import { mkdir, copyFile, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { versionPublicAssets, versionModuleAsset } from './version-public-assets.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Lista explícita de conteúdo público: nunca copiar o repositório inteiro.
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.join(root, 'dist');
if(path.dirname(output)!==root||path.basename(output)!=='dist')throw Error('Saída fora do projeto.');
await rm(output,{recursive:true,force:true});
await mkdir(path.join(output, 'assets'), { recursive: true });
for (const name of ['logo.png']) {
  await copyFile(path.join(root, name), path.join(output, name));
}
const html=await readFile(path.join(root,'index.html'),'utf8');
const moduleCache=new Map();
const publicAsset=name=>versionModuleAsset(name,file=>readFile(path.join(root,file)),moduleCache);
await writeFile(path.join(output,'index.html'),await versionPublicAssets(html,publicAsset), 'utf8');
for (const entry of await readdir(path.join(root, 'assets'), { withFileTypes: true })) {
  if (entry.isFile() && !['rh-manual-ui.js','cnes-import-ui.js','rh-bond-ui.js'].includes(entry.name) && /\.(css|m?js)$/.test(entry.name)) {
    await writeFile(path.join(output, 'assets', entry.name),await publicAsset('assets/'+entry.name));
  }
}
await mkdir(path.join(output,'assets','vendor'),{recursive:true});
for(const name of ['pdf.mjs','pdf.worker.mjs','pdfjs-LICENSE','exceljs.min.js','exceljs-LICENSE','jspdf.umd.min.js','jspdf-LICENSE','jspdf.plugin.autotable.min.js','jspdf-autotable-LICENSE'])await copyFile(path.join(root,'assets','vendor',name),path.join(output,'assets','vendor',name));
console.log('Site estático gerado em dist; documentos, SQL e funções não são publicados.');
