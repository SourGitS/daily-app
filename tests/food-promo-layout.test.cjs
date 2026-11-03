const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'food-catalogue.css'), 'utf8');

test('Food catalogue entry is a secondary sidebar card below Shopping', () => {
  const start = app.indexOf('function foodRenderOverview()');
  const end = app.indexOf('function foodOverviewSetFilter', start);
  const overview = app.slice(start, end);
  const shopping = overview.indexOf('id="fo-shopping"');
  const catalogue = overview.indexOf('class="fc-today"');
  const log = overview.indexOf('id="fo-log-summary"');
  assert.ok(shopping >= 0 && catalogue > shopping && log > catalogue,
    'catalogue entry follows Shopping and precedes the Food log in the supporting column');
  assert.ok(catalogue > overview.indexOf('<aside class="fo-support">'),
    'catalogue entry is no longer part of the primary recipe-results column');
});

test('Food catalogue entry follows app surfaces in dark and light themes', () => {
  const rule = css.match(/\.fc-today\{[^}]+\}/)?.[0] || '';
  assert.match(rule, /background:var\(--surface-card\)/);
  assert.match(rule, /color:var\(--text\)/);
  assert.match(rule, /border:1px solid var\(--surface-card-border\)/);
  assert.doesNotMatch(rule, /#faf7f0|#1b1a18|color-scheme:light/);
});
