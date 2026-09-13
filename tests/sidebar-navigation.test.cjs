// Exercise the shared navigation registry and its existing state helpers in an isolated VM.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
function slice(from, to) {
  const start = source.indexOf(from), end = source.indexOf(to, start + 1);
  assert.ok(start >= 0 && end > start, 'missing navigation fixture anchors');
  return source.slice(start, end);
}
function fixture(savedOpen) {
  const writes = [], calls = [];
  const context = vm.createContext({
    console, calls, S: {view: 'home'}, logSubTab: 'today', statsSubTab: 'overview',
    _bootPhase: false,
    localStorage: {
      getItem: () => savedOpen === undefined ? null : JSON.stringify({open: savedOpen}),
      setItem: (key, value) => writes.push([key, JSON.parse(value)])
    },
    document: {getElementById: () => null, querySelectorAll: () => []},
    closeMenu: () => calls.push(['close']),
    openAIHub: () => calls.push(['aihub'])
  });
  vm.runInContext(slice('const NAV_ORDER=', '// ── Log hub state') +
    slice('const BUD_VIEWS=[', 'let budgetData') + `
    function setView(view){ S.view=view; calls.push(['view',view]); }
    function setStatsTab(sub){ statsSubTab=sub; calls.push(['stats',sub]); }
    function setBudgetView(sub){ budgetView=sub; calls.push(['budget',sub]); }
    function setLogTab(sub){ logSubTab=sub; calls.push(['log',sub]); }
    globalThis.registry={NAV_TREE,NAV_QUICK,BUD_VIEWS};
  `, context);
  return {context, writes, calls, ...copy(context.registry)};
}

test('quick access stays separate from groups with six labelled destinations and stable group IDs', () => {
  const f = fixture();
  assert.deepEqual(f.NAV_QUICK.map(q => [q.view, q.label]), [
    ['home', 'Home'], ['budget', 'Finance'], ['log', 'Log'],
    ['food', 'Food'], ['stats', 'Stats'], ['settings', 'Settings']
  ]);
  assert.ok(f.NAV_QUICK.every(q => q.icon), 'quick destinations retain their icons');
  assert.deepEqual(f.NAV_TREE.map(g => [g.id, g.label]), [
    ['today', 'Today'], ['training', 'Log'], ['money', 'Finance'],
    ['food', 'Food'], ['stats', 'Stats'], ['more', 'More']
  ]);
  const markup = f.context.navBuildHtml();
  const [quick, groups] = markup.split('<div class="nv-groups">');
  assert.ok(quick.endsWith('</div>'), 'quick access is outside the grouped scroller');
  assert.equal((quick.match(/data-nav-quick=/g) || []).length, 6);
  assert.ok(!quick.includes('data-nav-group'), 'quick access cannot be collapsed');
  assert.equal((groups.match(/data-nav-group=/g) || []).length, 6);
  assert.ok(!groups.includes('data-nav-quick'));
});

test('Finance children follow the six registered tabs exactly, including Accounts before Yearly', () => {
  const f = fixture(), rows = f.NAV_TREE.find(g => g.id === 'money').rows;
  assert.deepEqual(rows.map(r => [r.id, r.view, r.sub]),
    f.BUD_VIEWS.map(v => [v.row, 'budget', v.id]));
  assert.deepEqual(rows.map(r => r.label), ['Overview', 'Week', 'Month', 'Bills', 'Accounts', 'Yearly']);
});

test('Weekly review has one Stats home in tab order and supporting destinations remain reachable', () => {
  const f = fixture(), rows = f.NAV_TREE.flatMap(g => g.rows);
  assert.equal(new Set(rows.map(r => r.id)).size, rows.length, 'row IDs must stay unique');
  assert.deepEqual(f.NAV_TREE.find(g => g.id === 'stats').rows.map(r => r.sub),
    ['overview', 'review', 'training', 'body', 'nutrition', 'finance']);
  assert.deepEqual(rows.filter(r => r.id === 'wkr'),
    [{id: 'wkr', label: 'Weekly review', view: 'stats', sub: 'review'}]);
  assert.deepEqual(f.NAV_TREE.find(g => g.id === 'training').rows.map(r => [r.label, r.sub]),
    [['Splits', 'program'], ['Exercises', 'exercises'], ['History', 'history']]);
  assert.deepEqual(f.NAV_TREE.find(g => g.id === 'food').rows.map(r => r.sub),
    ['recipes', 'shopping', 'pantry', 'library', 'review']);
  assert.deepEqual(f.NAV_TREE.find(g => g.id === 'today').rows.map(r => [r.id, r.view, r.sub]),
    [['log-today', 'log', 'today'], ['nut-today', 'food', 'log']]);
  assert.deepEqual(f.NAV_TREE.find(g => g.id === 'more').rows.map(r => [r.id, r.view]),
    [['journal', 'notes'], ['plans', 'plans'], ['aihub', 'aihub']]);
});

test('moved and reordered links dispatch through the same routes and retain screen-derived selection', () => {
  const f = fixture([]), c = f.context;
  c.navRowGo('wkr');
  assert.deepEqual(copy(f.calls), [['close'], ['view', 'stats'], ['stats', 'review']]);
  assert.equal(c.navCurrentRow(), 'wkr');
  assert.equal(c.navCurrentQuick(), 'stats');
  f.calls.length = 0;
  c.navRowGo('accounts');
  assert.deepEqual(copy(f.calls), [['close'], ['view', 'budget'], ['budget', 'accounts']]);
  assert.equal(c.navCurrentRow(), 'accounts');
  assert.equal(c.navCurrentQuick(), 'budget');
  c.setNavActive();
  assert.deepEqual([...c.navResolveOpen()], [], 'navigation must not open a closed group');
  assert.deepEqual(f.writes, [], 'navigation and selection are read-only');
});

test('renamed groups restore array and legacy string expansion preferences without rewriting them', () => {
  for (const [saved, expected] of [
    [['training', 'money'], ['training', 'money']], ['money', ['money']], [undefined, []]
  ]) {
    const f = fixture(saved);
    assert.deepEqual([...f.context.navResolveOpen()], expected);
    f.context.navBuildHtml();
    f.context.setNavActive();
    assert.deepEqual([...f.context.navResolveOpen()], expected);
    assert.deepEqual(f.writes, [], 'reading or rendering a preference must not rewrite it');
  }
});

test('group headers only toggle that group and keep the existing persistence and boot safeguards', () => {
  const f = fixture(['training', 'money']), c = f.context;
  c.navToggleGroup('money');
  assert.deepEqual([...c.navResolveOpen()], ['training']);
  assert.deepEqual(f.writes, [['daily_nav_ui', {open: ['training']}]]);
  assert.equal(c.S.view, 'home');
  assert.deepEqual(f.calls, [], 'expansion must not navigate');
  c._bootPhase = true;
  c.navSaveOpen();
  assert.equal(f.writes.length, 1, 'boot must not persist expansion');
});
