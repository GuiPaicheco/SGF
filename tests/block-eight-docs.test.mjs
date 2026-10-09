import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const root = new URL('../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');

test('avisos substituem temporizador anterior e limpam a região acessível ao terminar', () => {
  const app = read('assets/app.js');
  const source = app.match(/  let toastTimer;[\s\S]*?  const showToast =[^\n]+/)[0];
  const timers = new Map(); let next = 0;
  const toast = { textContent: '', classList: { add() {}, remove() {} } };
  const api = runInNewContext(`${source}\n({showToast,clearToast})`, {
    toast, friendlyMessage: message => message,
    setTimeout: fn => { const id = ++next; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id),
  });
  api.showToast('Primeira unidade'); api.showToast('Segunda unidade');
  assert.equal(timers.size, 1);
  assert.equal(toast.textContent, 'Segunda unidade');
  timers.get(next)(); assert.equal(toast.textContent, '');
  api.showToast('Decisão anterior'); api.clearToast();
  assert.equal(toast.textContent, ''); assert.equal(timers.size, 0);
  assert.match(app, /state\.activeContext = context;\s+clearToast\(\)/);
  assert.match(app.split('minimumCandidates.map(employee =>')[1].split('</form>')[0], /Matrícula \$\{esc\(employee\.matricula/);
  assert.match(read('assets/app.css'), /\.control:focus-visible\s*\{\s*outline: 3px solid var\(--green-700\)/);
  assert.match(app, /filter\.rangeMode === 'range' \? filter\.rangeStart \|\| monthStart : monthStart/);
});

test('arquivos publicados decodificam UTF-8 estrito e não contêm mojibake', () => {
  for (const name of ['index.html', ...readdirSync(new URL('assets/', root)).filter(n => /\.(css|js)$/.test(n)).map(n => `assets/${n}`)]) {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(new URL(name, root)));
    assert.doesNotMatch(text, /Ã[\u0080-\u00bf]|Â[\u0080-\u00bf]|â€|\uFFFD/, name);
  }
});

test('manual atual referencia imagens reais e distingue aprovação de calendário', () => {
  const manual = read('docs/MANUAL_USO.md');
  assert.match(manual, /não inclui automaticamente no calendário/);
  assert.match(manual, /não é uma modalidade solicitável/);
  for (const match of manual.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
    assert.ok(existsSync(new URL(`docs/${match[1]}`, root)), match[1]);
  }
});

test('aceite nominal e homologação normativa não são substituídos por testes técnicos', () => {
  const guide = read('docs/GUIA_HOMOLOGACAO.md');
  assert.match(guide, /Caso não executado nunca conta como aprovado/);
  assert.match(guide, /Não assinar automaticamente/);
  assert.match(guide, /Nenhum descarte foi autorizado/);
  assert.match(read('docs/HOSPEDAGEM.md'), /usuário confirmou recuperação e login por e-mail em 08\/10/);
});
