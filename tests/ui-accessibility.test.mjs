import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../assets/app.js', import.meta.url), 'utf8');
const calendar = readFileSync(new URL('../assets/calendar.css', import.meta.url), 'utf8');
const scale = readFileSync(new URL('../assets/scale.css', import.meta.url), 'utf8');
const receipt = readFileSync(new URL('../assets/receipt.css', import.meta.url), 'utf8');
const css = [
  readFileSync(new URL('../assets/app.css', import.meta.url), 'utf8'),
  calendar, scale, receipt,
].join('\n');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('identidade SGF representa gestão de funcionários, não apenas férias e folgas', () => {
  for (const source of [html, app + readFileSync(new URL('../assets/rh-receipt.js', import.meta.url), 'utf8'), readFileSync(new URL('../README.md', import.meta.url), 'utf8'), readFileSync(new URL('./receipt-print.html', import.meta.url), 'utf8')]) {
    assert.match(source, /Sistema de Gestão de Funcionários/);
    assert.doesNotMatch(source, /Sistema de Gestão de Férias e Folgas/);
  }
});

test('validação informa sucesso e erro sem depender apenas de cor', () => {
  assert.match(app, /aria-invalid/);
  assert.match(app, /Atenção: verifique este campo/);
  assert.match(app, /✓ Preenchido corretamente/);
  assert.match(css, /border-style:\s*dashed/);
  assert.match(css, /validation-error::before/);
});

test('foco, navegação e avisos possuem recursos acessíveis', () => {
  assert.match(html, /class="skip-link" href="#app"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(css, /:focus-visible/);
  assert.match(app, /aria-current/);
});

test('layouts críticos possuem ajustes para celular, tablet e desktop', () => {
  assert.match(css, /@media\s*\(max-width:\s*420px\)/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(calendar, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(calendar, /repeat\(7, minmax\(0, 1fr\)\)/);
});

test('documentos de interface permanecem em UTF-8 e com idioma declarado', () => {
  assert.match(html, /<html lang="pt-BR">/);
  assert.match(html, /<meta charset="utf-8">/);
  for (const source of [app, css, html]) assert.doesNotMatch(source, /Ã[\u0080-\u00bf]|Â[\u0080-\u00bf]|â€|\uFFFD/);
});

test('retorno explícito à tela inicial permanece disponível em celular', () => {
  const mobile = css.slice(css.indexOf('@media (max-width: 420px)'));
  assert.match(mobile, /#home-action\s*\{\s*display:\s*inline-flex/);
  assert.match(html, /id="home-action"[^>]*data-go="home"/);
});

test('movimento reduzido é respeitado na navegação e nos avisos', () => {
  assert.match(app, /window\.matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)\.matches \? 'auto' : 'smooth'/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.spinner \{ animation: none; \}/);
  assert.match(css, /\.choice, \.toast \{ transition: none; \}/);
});

test('impressão restaura colunas de A4 independentemente do layout móvel', () => {
  const print = receipt.slice(receipt.indexOf('@media print'));
  assert.match(print, /\.signature-grid\s*\{[^}]*grid-template-columns: 1fr 1fr;/);
  assert.match(print, /\.receipt-protocol\s*\{[^}]*grid-template-columns: 1\.25fr 1fr 1fr;/);
  assert.match(print, /\.receipt-data-wide\s*\{[^}]*grid-column: 1 \/ -1;/);
  assert.match(print, /\.receipt-head, \.receipt-notes, \.receipt-warning\s*\{\s*break-inside: avoid;/);
});
