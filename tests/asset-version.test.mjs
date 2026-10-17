import test from 'node:test';
import assert from 'node:assert/strict';
import {versionPublicAssets} from '../scripts/version-public-assets.mjs';
test('build muda URL de cada asset alterado e preserva arquivos iguais e externos',async()=>{
 const input='<script src="assets/app.js?v=antiga"></script><link href="assets/app.css?v=antiga"><script src="https://example.invalid/app.js"></script>';
 const before=await versionPublicAssets(input,file=>Buffer.from(file==='assets/app.js'?'old':'style'));
 const after=await versionPublicAssets(input,file=>Buffer.from(file==='assets/app.js'?'new':'style'));
 assert.notEqual(before.match(/assets\/app.js\?v=[a-f0-9]+/)[0],after.match(/assets\/app.js\?v=[a-f0-9]+/)[0]);
 assert.equal(before.match(/assets\/app.css\?v=[a-f0-9]+/)[0],after.match(/assets\/app.css\?v=[a-f0-9]+/)[0]);
 assert.ok(after.includes('https://example.invalid/app.js'));assert.ok(!after.includes('v=antiga'));
});
test('build falha quando asset referenciado está ausente em vez de publicar página incompleta',async()=>{
 await assert.rejects(versionPublicAssets('<script src="assets/missing.js"></script>',async()=>{throw Error('missing');}),/missing/);
});
