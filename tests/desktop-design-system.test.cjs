const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const base = read('css/base.css');
const home = read('css/home-category.css');
const layout = read('css/budget-home.css');
const kitchen = read('css/kitchen-extras.css');

test('ordinary content cards share the Category Home surface in both themes', () => {
  assert.match(base, /--surface-card:#ffffff;/);
  assert.match(base, /\[data-theme="dark"\]\{[\s\S]*?--surface-card:#1b1b1d;/);
  assert.match(base, /@media\(min-width:1024px\)\{\s*:root\{--surface-card:#f2f2f2\}\s*\[data-theme="dark"\]\{--surface-card:#202020\}/);
  assert.match(home, /#home-content\.category-home\{--cat-surface:#202020/);
  assert.match(home, /\[data-theme=light\] #home-content\.category-home\{--cat-surface:#f2f2f2/);
  assert.match(home, /@media\(min-width:1024px\)\{#home-content\.category-home,\[data-theme=light\] #home-content\.category-home\{--cat-surface:var\(--surface-card\)\}\}/);
  assert.match(layout, /@media\(min-width:1024px\)\{\s*\.card:not\(\.home-weather-card\),[\s\S]*?#chart-wrap\{\s*background:var\(--surface-card\);/);
});

test('all desktop main views use the same 1440px content canvas', () => {
  assert.match(
    layout,
    /#app-main>section,#app-main \.swipe-panel\{width:100%;max-width:1504px;margin:0 auto;padding:40px 32px\}/
  );
  assert.match(home, /#home-content\.category-home\{[^}]*max-width:1440px;margin:auto/);
  assert.match(kitchen, /\.aih-shell\{width:100%;max-width:1440px;margin:0 auto\}/);
  assert.match(kitchen, /\.aih-grid\{[^}]*max-width:1440px;margin-left:auto;margin-right:auto\}/);
  assert.equal((kitchen.match(/\.aihub-wrap\{padding:20px 32px 48px\}/g) || []).length, 2);
});
