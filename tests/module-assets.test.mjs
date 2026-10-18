import test from 'node:test';
import assert from 'node:assert/strict';
import {versionModuleAsset,versionPublicAssets} from '../scripts/version-public-assets.mjs';
test('mudança no leitor PDF muda a URL do módulo e a URL do script que o importa',async()=>{
 const files={'assets/units.js':"const load=()=>import('./parser.mjs');",'assets/parser.mjs':'export const version=1;'};
 const build=async()=>{const cache=new Map();return versionPublicAssets('<script src="assets/units.js"></script>',name=>versionModuleAsset(name,key=>Promise.resolve(files[key]),cache));};
 const first=await build();files['assets/parser.mjs']='export const version=2;';const second=await build();assert.notEqual(first,second);
 assert.match(await versionModuleAsset('assets/units.js',key=>Promise.resolve(files[key])),/parser\.mjs\?v=[a-f0-9]{16}/);
});
test('dependências públicas não podem escapar de assets ou formar ciclo',async()=>{
 await assert.rejects(()=>versionModuleAsset('assets/main.js',()=>Promise.resolve("import './folder/../../secret.mjs';")),/fora/);
 await assert.rejects(()=>versionModuleAsset('assets/main.js',()=>Promise.resolve("import './main.js';")),/circular/);
});
