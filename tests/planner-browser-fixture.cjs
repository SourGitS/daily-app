// The browser tests and the local preview use the same app files and synthetic account.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const origin = 'http://daily.test';
const read = file => fs.readFileSync(path.join(root, file));
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json'
};

function plannerSampleFiles(revision) {
  const cache = new Map();
  function source(file) {
    if (!revision) return read(file);
    if (!cache.has(file)) cache.set(file, execFileSync('git', ['show', revision + ':' + file], {cwd:root, maxBuffer:16*1024*1024}));
    return cache.get(file);
  }
  const manifest = source('service-worker.js').toString().match(/const ASSETS = (\[[\s\S]*?\]);/)[1];
  const allowed = new Set(vm.runInNewContext(manifest).filter(x => x.startsWith('./')).map(x => x.slice(2)));
  const html = source('index.html').toString()
    .replace('<head>', '<head><base href="../"><script src="tests/sync-browser-fixture.js"></script>')
    .replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"><\/script>/g, '');
  const samples = ['tests/category-home-fixture.js', 'tests/home-journal-fixture.js'].map(file => read(file).toString()).join('\n');
  const fixture = read('tests/sync-browser-fixture.js').toString().replace('const initial=clone(stores)', () => samples + '\nconst initial=clone(stores)');
  return file => {
    let body;
    if (file === 'tests/sync-browser.html') body = html;
    else if (file === 'tests/sync-browser-fixture.js') body = fixture;
    else if (file && file !== 'index.html' && allowed.has(file)) body = source(file);
    else return null;
    return {contentType:contentTypes[path.extname(file)] || 'application/octet-stream', body};
  };
}

function plannerFixture(revision, fixtureOrigin = origin) {
  const sample = plannerSampleFiles(revision);
  return async context => {
    await context.addInitScript(() => {
      window.Chart = class {constructor(){this.data={};this.options={};} destroy(){} update(){} resize(){}};
    });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== fixtureOrigin) return route.abort();
      const file = decodeURIComponent(url.pathname).slice(1);
      return route.fulfill(sample(file) || {status:404, body:''});
    });
  };
}

module.exports = {plannerFixture, plannerSampleFiles, fixtureURL:origin + '/tests/sync-browser.html'};
