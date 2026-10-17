import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {collectUnit,createPortalReader,summarize} from './cnes/collect.mjs';

const usage='Uso: node scripts/collect-cnes.mjs (--cnes CODIGO | --all) [--save-review]\nSem --save-review, exibe apenas contagens e não grava dados pessoais nem altera Supabase.';
const args=process.argv.slice(2);
if(args.length===1 && args[0]==='--help') {console.log(usage);process.exit(0);}
let code=null,all=false,save=false;
for(let i=0;i<args.length;i++) {
  if(args[i]==='--cnes'&&!code) {
    code=args[++i];
    if(!/^\d{7}$/.test(code||'')) {console.error(usage);process.exit(1);}
  }
  else if(args[i]==='--all'&&!all) all=true;
  else if(args[i]==='--save-review'&&!save) save=true;
  else {console.error(usage);process.exit(1);}
}
if(Boolean(code)===all || (code&&!/^\d{7}$/.test(code))) {console.error(usage);process.exit(1);}
const catalog=JSON.parse(await readFile(new URL('../config/rh-units.json',import.meta.url),'utf8'));
if(catalog.length!==42||new Set(catalog.map(unit=>unit.cnes)).size!==42) throw Error('CNES_CATALOG_INVALID');
const units=all?catalog:catalog.filter(unit=>unit.cnes===code);
if(!units.length) {console.error('CNES fora do catálogo de RH.');process.exit(1);}
const read=createPortalReader();
const runId=new Date().toISOString().replace(/[:.]/g,'-');
const output=new URL(`../.sgf-imports/${runId}/`,import.meta.url);
let failures=0;
for(const unit of units) {
  try {
    const collection=await collectUnit(unit,{read});
    if(save) {
      await mkdir(output,{recursive:true,mode:0o700});
      await writeFile(new URL(`${unit.cnes}.json`,output),JSON.stringify(collection,null,2)+'\n',{flag:'wx',mode:0o600});
    }
    console.log(JSON.stringify(summarize(collection)));
  } catch(error) {
    failures++;
    // Não imprimir resposta remota, nome, CNS ou exceção que possa conter payload.
    const message=/^CNES_[A-Z0-9_]+$/.test(error.message||'')?error.message:'CNES_COLLECTION_FAILED';
    console.error(JSON.stringify({cnes:unit.cnes,status:'FAILED',code:message}));
  }
}
console.log(JSON.stringify({units:units.length,success:units.length-failures,failures,savedForReview:save,
  ...(save?{directory:fileURLToPath(output)}:{})}));
process.exitCode=failures?1:0;
