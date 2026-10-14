import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../assets/app.js',import.meta.url),'utf8');
const line=source.split(/\r?\n/).find(line=>line.includes('const sortedCnesUnits ='));
const sort=runInNewContext(`${line}\nsortedCnesUnits`);
test('CNES é ordenado pelo nome em português, não pelo código, sem mudar o catálogo',()=>{
  const input=[{name:'UBS Vila Cristina',code:'0000001'},{name:'UBS Bueno Franco',code:'9999999'},{name:'UBS Águas',code:'5555555'}];
  const original=input.map(item=>item.name);
  assert.deepEqual(Array.from(sort(input),item=>item.name),['UBS Águas','UBS Bueno Franco','UBS Vila Cristina']);
  assert.deepEqual(input.map(item=>item.name),original);
});
test('nomes equivalentes têm desempate pelo código CNES',()=>{
  assert.deepEqual(Array.from(sort([{name:'UBS X',code:'0000010'},{name:'ubs x',code:'0000002'}]),item=>item.code),['0000002','0000010']);
});
test('cadastro público, cadastro administrativo e unidade polo usam o mesmo catálogo ordenado',()=>{
  assert.equal((source.match(/catalogOptions\(sortedCnesUnits\(catalogs\.cnesUnits\),/g)||[]).length,2);
  assert.match(source,/accessUnitMarkup\(key\)/);
});
