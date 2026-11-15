'use strict';
// Run with Playwright and Chrome available. The real export is downloaded from an
// isolated copy of index.html. All requests outside the local fixture are blocked.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {text} = require('node:stream/consumers');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html')
  .replace('<head>', '<head><script src="/tests/sync-browser-fixture.js"></script>')
  .replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"><\/script>/g, '');
const fixture = read('tests/sync-browser-fixture.js').replace('const initial=clone(stores)',
  read('tests/category-home-fixture.js') + '\n' + read('tests/home-journal-fixture.js') + '\n const initial=clone(stores)');
const types = {'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json',
  '.png':'image/png','.webp':'image/webp'};
const cases = [
  ['default', ''], ['fresh', 'fresh'], ['finance-journal', 'finance-links&overview&plan&ui=journal&polish'],
  ['planner-food', 'planner-review&home-cards&training&catalogue&ui=journal&polish'],
  ['all-stores', 'finance-links&overview&plan&planner-review&home-cards&catalogue&ui=journal&polish']
];

async function serve(route) {
  const url = new URL(route.request().url());
  if (url.host !== 'daily-backup.invalid') return route.abort();
  if (url.pathname === '/app') return route.fulfill({contentType:'text/html',body:html});
  if (url.pathname === '/tests/sync-browser-fixture.js') return route.fulfill({contentType:'text/javascript',body:fixture});
  const file = path.resolve(root, '.' + url.pathname), type = types[path.extname(file)];
  if (!file.startsWith(root + path.sep) || !type || !fs.existsSync(file)) return route.abort();
  await route.fulfill({contentType:type,body:fs.readFileSync(file)});
}

async function saveOptionalStores() {
  for (const mode of ['mobile','desktop']) categorySave(mode, categoryLoad(mode));
  saveCCData(loadCCData());
  recordCCHistory(10);
  saveDayColors(loadDayColors());
  setAccentMode('static');
  saveAccentFavourites(['#385c72']);
  setTheme('dark');
  saveSwaps();
  saveDayCustom();
  saveCustomMuscles(['sample']);
  saveLibHidden(['sample exercise']);
  saveHabitsLog();
  dailyAISaveRequest({id:'synthetic-backup-request',status:'undone'});
  kitShopToggleRecipe(kitLoadRecipes()[0].id);
  kitShopSaveSelected();
  kitShopSaveManual();
  persistDailyLog();
  persistSavedFoods();
  nutSaveFoods();
  nutSavePrefs();
  wkrSavePlan();
  await nutSaveMeals([]);
  // This preference is now read only as a legacy seed. Use Daily's own default order.
  lsSave('daily_home_order', HOME_DEFAULT_ORDER, 'homeOrder');
}

function stageDownloadedFile(file) {
  const {data} = JSON.parse(file);
  const plan = dailyRestoreStage(data, Date.now());
  const dataKeys = Object.keys(data).filter(key => !key.endsWith('_ts'));
  const missingData = dataKeys.filter(key => !plan.writes.has(key));
  const registered = SYNC_BLOB_REG.filter(store => Object.hasOwn(data, store.lsKey));
  const missingPaths = registered.filter(store => !Object.hasOwn(plan.updates, store.path)).map(store => store.path);
  const absent = SYNC_BLOB_REG.filter(store => !Object.hasOwn(data, store.lsKey)).map(store => store.lsKey);
  // Verify the actual device writer repopulates an empty store, including record types
  // whose timestamps and restore metadata are intentionally changed during staging.
  for (const key of dataKeys) localStorage.removeItem(key);
  dailyRestoreWriteLocal(plan);
  const mismatched = dataKeys.filter(key => localStorage.getItem(key) !== plan.writes.get(key));
  return {fileKeys:Object.keys(data).length, stores:dataKeys.length, registered:registered.length,
    cloudPaths:Object.keys(plan.updates).length, missingData, missingPaths, mismatched, absent};
}

async function checkCase(browser, name, query) {
  const context = await browser.newContext({viewport:{width:1200,height:900},timezoneId:'Australia/Sydney'});
  try {
    await context.route('**/*', serve);
    await context.addInitScript(() => {
      window.Chart = class { constructor(){this.data={};this.options={};} destroy(){} update(){} resize(){} };
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('https://daily-backup.invalid/app?preview&' + query);
    await page.waitForFunction(() => typeof _cloudWorkoutReady !== 'undefined' && _cloudWorkoutReady &&
      SYNC_BLOB_REG.some(store => store.path === 'accounts'));
    if (name === 'finance-journal') {
      await page.waitForFunction(() => loadTxns().length && loadLedger().length && loadNotes().length);
    }
    if (name === 'planner-food' || name === 'all-stores') {
      await page.waitForFunction(() => loadTxns().length && loadNotes().length && kitLoadRecipes().length);
    }
    if (name === 'all-stores') await page.evaluate(saveOptionalStores);
    const [download] = await Promise.all([page.waitForEvent('download'),page.evaluate(() => exportAllData())]);
    assert.match(download.suggestedFilename(), /^daily-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const file = await text(await download.createReadStream());
    assert.equal(JSON.parse(file).app, 'daily');
    const result = await page.evaluate(stageDownloadedFile, file);
    assert.ok(result.stores > 0);
    assert.deepEqual(result.missingData, []);
    assert.deepEqual(result.missingPaths, []);
    assert.deepEqual(result.mismatched, []);
    if (name === 'all-stores') assert.deepEqual(result.absent, []);
    assert.deepEqual(errors, []);
    console.log('PASS', name, result.fileKeys, 'exported keys,', result.stores, 'stores,',
      result.registered, 'registered,', result.cloudPaths, 'cloud paths staged');
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    for (const [name, query] of cases) await checkCase(browser, name, query);
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error);process.exitCode = 1;});
