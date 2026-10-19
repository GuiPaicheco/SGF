import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const ui=vm.createContext({}); vm.runInContext(read('assets/organization-ui.js'),ui);
const data={cnesUnits:[{id:'u',code:'2126028',name:'<img onerror=x>',active:true,version:1}],teams:[],teamTypes:[],mappings:[]};
test('ensaio do banco exige rollback e correção aceita jornada opcional vazia',()=>{
  const sql=read('tests/block-two-rehearsal.sql');
  assert.match(sql,/\nBEGIN;/); assert.match(sql,/ROLLBACK;\s*$/);
  assert.match(read('supabase/migrations/20261008140123_block_two_validation_fixes.sql'),/nullif\(item->>'weekly_hours',''\)::integer </);
});
test('troca de contexto e saída limpam recursos de matrícula',()=>{
  const app=read('assets/app.js');
  assert.ok((app.match(/state\.requestResources = null; state\.resourceBond = null; state\.detailBondResources = null;/g)||[]).length>=2);
  assert.match(app,/querySelector\('#registry-team'\)\?\.value/);
  assert.match(app,/bond_id: state\.selected\.context_bond_id, version: state\.detailBondResources\.account\.version, entry_key: event\.target\.dataset\.entryKey/);
});
test('catálogo escapa nomes e não trata INE ausente como pendência',()=>{
  const html=ui.SGFOrganization.registryPage(data);
  assert.ok(html.includes('&lt;img onerror=x&gt;')); assert.ok(!html.includes('<img onerror=x>'));
  assert.doesNotMatch(html,/aguardam conferência do INE|<th>INE<\/th>|Pendente de conferência/);
});
test('editor dispensa INE e preserva metadados existentes sem exibi-los',()=>{
  const html=ui.SGFOrganization.registryEditor('team',{id:'t',version:4},data);
  for(const name of ['source_reference','reason','cnes_unit_id','type_code','ine_code']) assert.ok(html.includes(`name="${name}"`));
  assert.match(html,/data-version="4"/);
  assert.match(html,/type="hidden" name="ine_code"/);
  assert.match(html,/type="hidden" name="source_reference"/);
  assert.doesNotMatch(html,/label[^>]*>Código INE/);
  assert.match(html,/Não é necessário informar INE/);
});
test('eMulti sem INE permanece selecionável pelo nome e unidade',()=>{
  const team={id:'t',cnes_unit_id:'u',name:'eMulti 004 Bueno Franco',type_code:'emulti',ine_code:null,needs_review:true,active:true};
  const html=ui.SGFOrganization.registryPage({...data,teams:[team]});
  assert.match(html,/eMulti 004 Bueno Franco/);
  assert.doesNotMatch(html,/Pendente de conferência|aguardam conferência/);
  const app=read('assets/app.js');
  assert.match(app,/catalogOptions\(teams,[^\n]+item => item\.name\)/);
  assert.doesNotMatch(app,/código em conferência/);
});
test('lotação separa CNES da subdivisão de Secretaria',()=>{
  assert.match(ui.SGFOrganization.locationExtra({},data),/Lotação interna de uma Secretaria/);
  assert.match(ui.SGFOrganization.locationExtra({},data),/id="location-cnes"/);
});
test('direitos e horas mostram matrícula e saldos separados',()=>{
  const html=ui.SGFOrganization.bondPage({bond:{registration:'M2'},account:{validated_minutes:120,declared_minutes:600,version:3},rights:[],entries:[],legacy_pending:true},'TESTE');
  assert.match(html,/Matrícula M2/); assert.match(html,/2.0 h/); assert.match(html,/10.0 h/); assert.match(html,/data-version="3"/); assert.match(html,/legados/);
});
test('estrutura exclusiva do administrador; recursos de vínculo apenas RH e admin na interface',()=>{
  const policy=vm.createContext({});vm.runInContext(read('assets/access-policy.js'),policy);
  assert.equal(policy.SGFAccessPolicy.allowed('organization','rh',true),false);
  assert.equal(policy.SGFAccessPolicy.allowed('organization','administrador',true),false);
  assert.equal(policy.SGFAccessPolicy.allowed('bond-resources','diretor',true),false);
  assert.equal(policy.SGFAccessPolicy.allowed('bond-resources','rh',true),false);
});
test('rota antiga de lançamento de horas foi encerrada, preservando histórico',()=>{
  const edge=read('supabase/functions/manage-operations/index.ts');
  assert.match(edge,/action === 'time-bank'[^\n]+410/);assert.doesNotMatch(edge,/rpc\('manage_(?:bond_)?time_bank'/);
});
test('dados de admissão e direitos vêm da matrícula selecionada',()=>{
  const app=read('assets/app.js');assert.match(app,/state.request.admissionDate=resources.bond.admission_date/);
  assert.match(app,/state.activeContext!==context/); assert.match(app,/rightId.*acquisitionEnd/);
});
test('saldo é único por vínculo e consumo é único por pedido; RPCs não são públicas',()=>{
  const sql=read('supabase/migrations/20261008133427_block_two_catalog_and_bond_balances.sql');
  assert.match(sql,/bond_id uuid primary key/);assert.match(sql,/request_id,kind/);
  assert.match(sql,/BANK_VERSION_CONFLICT/);assert.match(sql,/ENTRY_KEY_CONFLICT/);
  assert.match(sql,/revoke all on function public.manage_bond_time_bank[^;]+from public,anon,authenticated/s);
  assert.match(sql,/alter table public.bond_time_bank_accounts enable row level security/);
});
