import { readFile } from 'node:fs/promises';

// Imprime o ensaio inteiro para execução SQL em uma única transação.
// A preparação é reutilizada sem executar os testes RLS nem editar a fixture original.
const fixture = await readFile(new URL('../tests/access-rls-rehearsal.sql', import.meta.url), 'utf8');
const marker = "select set_config('request.jwt.claim.sub'";
const boundary = fixture.indexOf(marker);
if (boundary < 0) throw new Error('Limite das fixtures não encontrado; ensaio cancelado.');
const scenarios = { unit: 'unit-workflow', calendar: 'calendar-planning', distribution: 'distribution-planning', registration: 'registration-workflow', legacy: 'legacy-cycle', block4: 'block-four', block5: 'block-five', block6: 'block-six' };
const scenario = process.argv[2] || 'unit';
if (!Object.hasOwn(scenarios, scenario)) throw new Error('Cenário inválido: use unit, calendar, distribution, registration, legacy, block4, block5 ou block6.');
const checks = await readFile(new URL(`../tests/${scenarios[scenario]}-rehearsal.sql`, import.meta.url), 'utf8');
if(['legacy','block4','block5','block6'].includes(scenario)){
  const foundation=await readFile(new URL('../tests/block-three-rehearsal.sql',import.meta.url),'utf8');
  const end=foundation.indexOf('do $$');
  if(end<0) throw new Error('Fixtures do bloco 03 não encontradas.');
  process.stdout.write(`${foundation.slice(0,end)}\n${checks}\nrollback;\n`);
}else process.stdout.write(`begin;\n${fixture.slice(0, boundary)}\n${checks}\nrollback;\n`);
