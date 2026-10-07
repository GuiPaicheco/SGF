import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Lista explícita de conteúdo público: nunca copiar o repositório inteiro.
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
await mkdir(path.join(output, 'assets'), { recursive: true });
for (const name of ['index.html', 'logo.png']) {
  await copyFile(path.join(root, name), path.join(output, name));
}
for (const entry of await readdir(path.join(root, 'assets'), { withFileTypes: true })) {
  if (entry.isFile() && /\.(css|js)$/.test(entry.name)) {
    await copyFile(path.join(root, 'assets', entry.name), path.join(output, 'assets', entry.name));
  }
}
console.log('Site estático gerado em dist; documentos, SQL e funções não são publicados.');
