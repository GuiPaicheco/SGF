import { readFile } from 'node:fs/promises';

// Imprime o ensaio inteiro para execução SQL em uma única transação.
// A preparação é reutilizada sem executar os testes RLS nem editar a fixture original.
const fixture = await readFile(new URL('../tests/access-rls-rehearsal.sql', import.meta.url), 'utf8');
const marker = "select set_config('request.jwt.claim.sub'";
const boundary = fixture.indexOf(marker);
if (boundary < 0) throw new Error('Limite das fixtures não encontrado; ensaio cancelado.');
const checks = await readFile(new URL('../tests/unit-workflow-rehearsal.sql', import.meta.url), 'utf8');
process.stdout.write(`begin;\n${fixture.slice(0, boundary)}\n${checks}\nrollback;\n`);
