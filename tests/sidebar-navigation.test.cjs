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
function fixture(savedOpen, visible) {
  const writes = [], calls = [];
  const shown = new Set(visible || []);
  const context = vm.createContext({
    console, calls, S: {view: 'home'}, logSubTab: 'today', statsSubTab: 'overview',
    _bootPhase: false,
    localStorage: {
      getItem: () => savedOpen === undefined ? null : JSON.stringify({open: savedOpen}),
      setItem: (key, value) => writes.push([key, JSON.parse(value)])
    },
    document: {getElementById: id => shown.has(id) ? {style: {display: 'block'}} : null, querySelectorAll: () => []},
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

test('quick access stays separate from groups with nine labelled destinations and stable group IDs', () => {
  const f = fixture();
  assert.deepEqual(f.NAV_QUICK.map(q => [q.id, q.label]), [
    ['home', 'Home'], ['budget', 'Finance'], ['log', 'Log'], ['food', 'Food'],
    ['stats', 'Stats'], ['notes', 'Journal'], ['aihub', 'Daily AI'], ['accounts', 'Accounts'], ['settings', 'Settings']
  ]);
  // Accounts is a Finance VIEW, so it is the one pinned item that carries a sub-tab.
  assert.deepEqual(f.NAV_QUICK.filter(q => q.sub).map(q => [q.id, q.view, q.sub]),
    [['accounts', 'budget', 'accounts']]);
  assert.ok(f.NAV_QUICK.every(q => q.icon), 'quick destinations retain their icons');
  assert.deepEqual(f.NAV_TREE.map(g => [g.id, g.label]), [
    ['today', 'Today'], ['training', 'Log'], ['money', 'Finance'],
    ['food', 'Food'], ['stats', 'Stats'], ['more', 'More']
  ]);
  const markup = f.context.navBuildHtml();
  const [quick, groups] = markup.split('<div class="nv-groups">');
  assert.ok(quick.endsWith('</div>'), 'quick access is outside the grouped scroller');
  assert.match(quick, /nv-section-label nv-quick-label">Favourites</,
    'the quick destinations have a clear visual label');
  assert.match(groups, /nv-section-label nv-groups-label">All areas</,
    'the detailed destinations have a clear visual label');
  assert.equal((quick.match(/data-nav-quick=/g) || []).length, 9);
  // Keyed by ID, not by view: Finance and Accounts share a view and must stay distinct.
  assert.ok(quick.includes('data-nav-quick="accounts"'));
  assert.ok(quick.includes('data-nav-quick="notes"'));
  assert.ok(quick.includes('data-nav-quick="aihub"'));
  assert.ok(!quick.includes('data-nav-group'), 'quick access cannot be collapsed');
  assert.equal((groups.match(/data-nav-group=/g) || []).length, 6);
  assert.ok(!groups.includes('data-nav-quick'));
});

test('Finance children follow the five registered tabs exactly, including Accounts after Bills', () => {
  const f = fixture(), rows = f.NAV_TREE.find(g => g.id === 'money').rows;
  assert.deepEqual(rows.map(r => [r.id, r.view, r.sub]),
    f.BUD_VIEWS.map(v => [v.row, 'budget', v.id]));
  assert.deepEqual(rows.map(r => r.label), ['Overview', 'Week', 'Plan', 'Bills', 'Accounts']);
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
  // Accounts is pinned in the quick strip now, so it lights ITSELF rather than Finance — one
  // destination, one lit item, exactly as the row below it says.
  assert.equal(c.navCurrentQuick(), 'accounts');
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

// ── Band spacing ──────────────────────────────────────────────────
// Brand, quick access, the grouped scroller and the account footer are four bands, and what
// separates them is space. The wordmark sat 10px above the first quick destination, so the two
// read as one block. These assert the separation exists, that the rows themselves and the
// scrolling model did not change with it, and that a short desktop window still fits.

const css = f => fs.readFileSync(path.join(__dirname, '../css/' + f), 'utf8');

test('the sidebar separates its four bands, keeping the 260px shell and one scroller', () => {
  const shell = css('budget-home.css');
  assert.match(shell, /#desktop-sidebar\{width:260px;/, 'the desktop width is unchanged');
  assert.match(shell, /\.ds-logo\{display:flex;flex:none;justify-content:flex-start;padding:0 22px 20px\}/,
    'the brand gets its own band under the wordmark');
  assert.match(shell, /\.ds-profile\{flex:none;margin-top:auto;padding:14px 16px;border-top/,
    'the account footer stays pinned to the bottom, with room of its own');
  const nav = css('kitchen-extras.css');
  assert.match(nav, /#ds-nav \.nv-quick\{flex:none;margin:0;padding:0 0 14px;/);
  assert.match(nav, /#ds-nav \.nv-section-label\{display:block;flex:none;margin:0 22px 8px;/,
    'desktop exposes compact labels for the two navigation levels');
  assert.match(nav, /#ds-nav \.nv-groups\{flex:1;min-height:0;overflow-y:auto;/,
    'only the groups scroll; quick access and the footer do not');
  assert.match(nav, /#ds-nav \.nv-group\+\.nv-group\{margin-top:10px\}/);
  // The opaque composition behind quick access is load-bearing: --card alone is translucent in
  // dark mode, so the groups would show through it as they scroll underneath.
  assert.match(nav, /#ds-nav \.nv-quick\{[^}]*background:linear-gradient\(var\(--card\),var\(--card\)\),var\(--bg\)\}/);
});

test('a short desktop window trades the rhythm back for reachability', () => {
  const nav = css('kitchen-extras.css');
  const short = nav.slice(nav.indexOf('@media (min-width:1024px) and (max-height:460px)'));
  const block = short.slice(0, short.indexOf('\n}') + 2);
  assert.match(block, /#desktop-sidebar\{overflow-y:auto/, 'one whole-sidebar scroller');
  assert.match(block, /#ds-nav \.nv-groups\{flex:none;overflow:visible\}/);
  assert.match(block, /#desktop-sidebar \.ds-logo\{padding-bottom:10px\}/, 'the bands close up');
  assert.match(short, /#ds-nav \.nv-section-label\{margin-bottom:4px;font-size:9px;line-height:12px\}/,
    'the labels compact with the other sidebar bands');
  assert.match(block, /#ds-nav \.nv-group\+\.nv-group\{margin-top:4px\}/);
});

test('the phone drawer keeps its 44px targets while gaining the same separation', () => {
  const nav = css('kitchen-extras.css');
  assert.match(nav, /\.nv-section-label\{display:none\}/, 'desktop-only labels do not crowd the drawer');
  assert.match(nav, /#side-menu-list \.nv-qrow\{min-height:44px;/);
  assert.match(nav, /#side-menu-list \.nv-row\{min-height:44px;/);
  assert.match(nav, /#side-menu-list \.nv-quick\{margin:0 0 10px;padding-bottom:10px\}/);
  assert.match(nav, /#side-menu\{position:fixed;/, 'the drawer itself is untouched');
});

test('Journal, Daily AI and Accounts are pinned AND keep their grouped rows', () => {
  const f = fixture();
  // Pinned for one-press reach...
  assert.ok(f.NAV_QUICK.some(q => q.id === 'notes' && q.view === 'notes'));
  assert.ok(f.NAV_QUICK.some(q => q.id === 'aihub' && q.view === 'aihub'));
  assert.ok(f.NAV_QUICK.some(q => q.id === 'accounts' && q.view === 'budget' && q.sub === 'accounts'));
  // ...and still listed below, which is where you go when aiming at something specific.
  const journal = f.NAV_TREE.find(g => g.id === 'more').rows.find(r => r.id === 'journal');
  assert.ok(journal, 'Journal keeps its row under More');
  assert.equal(journal.view, 'notes', 'and its existing route');
  const ai = f.NAV_TREE.find(g => g.id === 'more').rows.find(r => r.id === 'aihub');
  assert.ok(ai, 'Daily AI keeps its row under More');
  assert.equal(ai.view, 'aihub', 'and its existing route');
  const accounts = f.NAV_TREE.find(g => g.id === 'money').rows.find(r => r.sub === 'accounts');
  assert.ok(accounts, 'Accounts keeps its row under Finance');
  assert.equal(accounts.view, 'budget');
});

test('a pinned sub-tab lights instead of its parent view, never as well as it', () => {
  const f = fixture(), c = f.context;
  const go = (view, sub) => { c.S.view = view; if (sub) c.setBudgetView(sub); };
  // budgetView is a top-level `let` inside the VM, so it is set through the sliced code
  // rather than by assigning a context property, which would create a separate global.
  go('budget', 'week');
  assert.equal(c.navCurrentQuick(), 'budget', 'an ordinary Finance view lights Finance');
  go('budget', 'accounts');
  assert.equal(c.navCurrentQuick(), 'accounts', 'Accounts lights itself, not Finance');
  assert.equal(c.navCurrentRow(), 'accounts', 'and the grouped row still answers too');
  go('notes');
  assert.equal(c.navCurrentQuick(), 'notes');
  go('plans');
  assert.equal(c.navCurrentQuick(), '', 'a destination that is not pinned lights nothing');
});

test('Daily AI lights its favourite and its existing More row when its screen is open', () => {
  const f = fixture([], ['view-aihub']), c = f.context;
  assert.equal(c.navCurrentRow(), 'aihub');
  assert.equal(c.navCurrentQuick(), 'aihub');
});
