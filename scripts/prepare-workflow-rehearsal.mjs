import { readFile } from 'node:fs/promises';

// Imprime o ensaio inteiro para execução SQL em uma única transação.
// A preparação é reutilizada sem executar os testes RLS nem editar a fixture original.
const fixture = await readFile(new URL('../tests/access-rls-rehearsal.sql', import.meta.url), 'utf8');
const marker = "select set_config('request.jwt.claim.sub'";
const boundary = fixture.indexOf(marker);
if (boundary < 0) throw new Error('Limite das fixtures não encontrado; ensaio cancelado.');
const scenarios = { access: 'access-rls', unit: 'unit-workflow', calendar: 'calendar-planning', distribution: 'distribution-planning', registration: 'registration-workflow', legacy: 'legacy-cycle', block4: 'block-four', block5: 'block-five', block6: 'block-six', cnes: 'cnes-registry', rh: 'rh-accounts', rhcalendar: 'rh-calendar', rhleaves:'rh-leaves', rhrevisions:'rh-revisions', rhfilters:'rh-calendar-filters', rhreturn:'rh-return',manualregistry:'manual-registry',cnespdf:'cnes-pdf-workspace',rhpolicy:'rh-policy',rhpolicyworkflow:'rh-policy-workflow',cnesintegration:'cnes-integration' };
const scenario = process.argv[2] || 'unit';
if (!Object.hasOwn(scenarios, scenario)) throw new Error('Cenário inválido: use access, unit, calendar, distribution, registration, legacy, block4, block5, block6 ou cnes.');
let checks = await readFile(new URL(`../tests/${scenarios[scenario]}-rehearsal.sql`, import.meta.url), 'utf8');
if(scenario==='cnesintegration'){const repair=await readFile(new URL('../supabase/migrations/20261019110415_integrate_previous_admin_cnes_imports.sql',import.meta.url),'utf8');checks=checks.replaceAll('-- RUN_IMPORT_REPAIR',()=>repair.slice(0,repair.indexOf('-- Lista exclusiva')));}
if(['rhcalendar','rhleaves','rhrevisions','rhfilters','rhreturn','manualregistry','cnespdf','rhpolicy','rhpolicyworkflow','cnesintegration'].includes(scenario)) {
  const base=await readFile(new URL('../tests/rh-accounts-rehearsal.sql',import.meta.url),'utf8');
  const end=base.indexOf('do $$');if(end<0)throw new Error('Fundação RH não encontrada.');
  // Ensaios históricos preservam seus contratos anteriores dentro de ROLLBACK.
  // Os cenários rhpolicy/rhpolicyworkflow abaixo usam exclusivamente as funções atuais.
  let historical='';
  if(['rhleaves','rhrevisions','rhfilters','rhreturn','cnespdf'].includes(scenario)){
    const files=[['20261018223409_cnes_pdf_workspace.sql','private.rh_make_leave_plan'],['20261018081927_rh_direct_leaves.sql','public.rh_preview_leave'],['20261018092805_rh_leave_revisions.sql','public.rh_preview_leave_revision']];
    for(const [file,name] of files){const sql=await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8');const start=sql.indexOf('function '+name+'(');const finish=sql.indexOf('end $$;',start);if(start<0||finish<0)throw Error('Contrato histórico ausente.');historical+='create or replace '+sql.slice(start,finish+7)+'\n';}
  }
  if(historical)historical='reset role;\n'+historical+'set local role service_role;\n';
  process.stdout.write('begin;\n'+base.slice(0,end)+'\n'+historical+'\n'+checks+'\nrollback;\n');
}
else if(['cnes','rh'].includes(scenario)) process.stdout.write(`begin;\n${checks}\nrollback;\n`);
else if(['legacy','block4','block5','block6'].includes(scenario)){
  const foundation=await readFile(new URL('../tests/block-three-rehearsal.sql',import.meta.url),'utf8');
  const end=foundation.indexOf('do $$');
  if(end<0) throw new Error('Fixtures do bloco 03 não encontradas.');
  process.stdout.write(`${foundation.slice(0,end)}\nselect set_config('request.jwt.claim.role','service_role',true);\n${checks}\nrollback;\n`);
}else if(scenario==='access') process.stdout.write(`begin;\n${fixture}\nrollback;\n`);
else process.stdout.write(`begin;\n${fixture.slice(0, boundary)}\ngrant all on access_checks to service_role;\n${scenario==='registration'?'':'set local role service_role;'}\n${checks}\nrollback;\n`);
