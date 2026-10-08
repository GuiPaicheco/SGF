import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import '../assets/access-policy.js';
const {allowed,resolve}=globalThis.SGFAccessPolicy;
test('visitante acessa simulação e cadastro público, não telas internas',()=>{
  for(const route of ['home','quick','quick-result','login','access-request','recover-password','set-password']) assert.equal(allowed(route,null,false),true);
  for(const route of ['scale','profiles','detail','employee-dashboard','stored-receipt']) assert.equal(resolve(route,null,false,false),'login');
});
test('servidor fica nas telas próprias e não abre gestão por navegação direta',()=>{
  for(const route of ['employee-dashboard','employee-detail','types','identity','rules','dates','confirm','receipt','notifications']) assert.equal(resolve(route,'servidor',true,false),route);
  for(const route of ['dashboard','detail','scale','audit-history','catalogs','profiles','rejection-catalog']) assert.equal(resolve(route,'servidor',true,false),'employee-dashboard');
});
test('diretor consulta gestão mas não abre cadastros ou permissões administrativas',()=>{
  for(const route of ['dashboard','detail','scale','audit-history','notifications']) assert.equal(resolve(route,'diretor',true,false),route);
  for(const route of ['catalogs','access-requests','profiles','calendar-admin','employee-detail']) assert.equal(resolve(route,'diretor',true,false),'dashboard');
});
test('RH mantém suas áreas operacionais mas não administração global',()=>{
  for(const route of ['catalogs','inclusions','access-requests','employee-registry-detail','location-detail']) assert.equal(resolve(route,'rh',true,false),route);
  for(const route of ['profiles','profile-create','reference-detail','calendar-admin','rejection-catalog']) assert.equal(resolve(route,'rh',true,false),'dashboard');
});
test('administrador acessa administração mas não solicita como servidor',()=>{
  for(const route of ['profiles','profile-create','reference-detail','calendar-admin','rejection-catalog','scale']) assert.equal(resolve(route,'administrador',true,false),route);
  assert.equal(resolve('types','administrador',true,false),'dashboard');
});
test('senha obrigatória, perfil não selecionado e rotas desconhecidas têm destinos seguros',()=>{
  assert.equal(resolve('profiles','administrador',true,true),'change-password');
  assert.equal(resolve('set-password','administrador',true,true),'set-password');
  assert.equal(resolve('dashboard',null,true,false),'choose-access');
  assert.equal(resolve('inventada','rh',true,false),'dashboard');
  assert.equal(resolve('inventada','servidor',true,false),'employee-dashboard');
});
test('política carrega antes do app e protege entrada e renderização',async()=>{
  const app=await readFile(new URL('../assets/app.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(html.indexOf('assets/access-policy.js')<html.indexOf('assets/app.js'));
  assert.match(app,/const go = route => \{ navigationVersion\+\+; state.route = SGFAccessPolicy.resolve/);
  assert.match(app,/function render\(\) \{ state.route = SGFAccessPolicy.resolve/);
});
