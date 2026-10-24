import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { inspectPublicFile } from './public-repository-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const findings = [];
for (const path of tracked) {
  const bytes = await readFile(new URL('../' + path, import.meta.url));
  const text = bytes.includes(0) ? '' : bytes.toString('utf8');
  findings.push(...inspectPublicFile(path, text));
}
if (findings.length) {
  for (const issue of findings) console.error(`${issue.path}:${issue.line}: ${issue.kind}`);
  console.error('Revise os arquivos antes de publicar. Valores encontrados foram omitidos.');
  process.exitCode = 1;
} else {
  console.log(`Repositório público: ${tracked.length} arquivos rastreados verificados; nenhum padrão bloqueado encontrado.`);
}
