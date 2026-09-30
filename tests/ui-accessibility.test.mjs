import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../assets/app.css', import.meta.url), 'utf8');
const calendar = readFileSync(new URL('../assets/calendar.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('validação informa sucesso e erro sem depender apenas de cor', () => {
  assert.match(app, /aria-invalid/);
  assert.match(app, /Atenção: verifique este campo/);
  assert.match(app, /✓ Preenchido corretamente/);
  assert.match(css, /border-style:dashed/);
  assert.match(css, /validation-error::before/);
});

test('foco, navegação e avisos possuem recursos acessíveis', () => {
  assert.match(html, /class="skip-link" href="#app"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(css, /:focus-visible/);
  assert.match(app, /aria-current/);
});

test('layouts críticos possuem ajustes para celular, tablet e desktop', () => {
  assert.match(css, /@media\(max-width:420px\)/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(calendar, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(calendar, /repeat\(7, minmax\(0, 1fr\)\)/);
});

test('documentos de interface permanecem em UTF-8 e com idioma declarado', () => {
  assert.match(html, /<html lang="pt-BR">/);
  assert.match(html, /<meta charset="utf-8">/);
  for (const source of [app, css, calendar, html]) assert.doesNotMatch(source, /Ã[\u0080-\u00bf]|Â[\u0080-\u00bf]|â€|\uFFFD/);
});
