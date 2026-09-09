// Routing regression cover for the Food hub and Stats' return to the swipe deck.
//
// These run the REAL declarations out of js/app.js in a VM — no DOM, no network, no storage,
// no account. They exist because the expensive failures in this change are silent ones: a
// legacy #kitchen link that resolves to nothing, a deck order that disagrees with NAV_ORDER,
// or Stats pinned twice because it is in both NAV_ORDER and NAV_QUICK_EXTRA.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { extract } = require('./harness.cjs');

const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

// The navigation constants are `const`, not functions, so harness.extract() cannot reach them.
// Slice the block between two anchors instead — and assert the anchors exist, so renaming one
// fails here loudly rather than quietly testing nothing.
function slice(from, to) {
  const a = source.indexOf(from);
  const b = source.indexOf(to);
  assert.ok(a >= 0, 'anchor missing: ' + from);
  assert.ok(b > a, 'anchor missing or out of order: ' + to);
  return source.slice(a, b);
}

function ctx() {
  const context = vm.createContext({
    console,
    // dailyHistoryUrl builds on location; a fixed one keeps the assertions about the HASH.
    location: { pathname: '/daily/', search: '' },
    LOG_TABS: { today: 1, program: 1, exercises: 1, history: 1 },
    logSubTab: 'today'
  });
  // A script's top-level `const` lives in script scope, not on the global object, so the
  // navigation constants have to be handed out explicitly. Function declarations do become
  // globals, which is why the history helpers below need no epilogue.
  vm.runInContext(slice('const NAV_ORDER=', '// Row id → row.') +
    '\n;globalThis.__nav={NAV_ORDER,NAV_QUICK_EXTRA,NAV_QUICK_VIEWS,NAV_QUICK,' +
    'NAV_VIEW_ALIAS,FOOD_LEGACY_ROUTES,NAV_TREE,FOOD_TABS,foodState,FOOD_SUPPORT};', context);
  vm.runInContext(['dailyHistoryView', 'dailyHistoryTarget', 'dailyHistoryUrl', 'dailyHistorySub']
    .map(extract).join('\n'), context);
  // JSON round-trip: values built inside the VM carry that realm's Array/Object prototypes,
  // and assert/strict's deepEqual compares prototypes as well as contents.
  return Object.assign(JSON.parse(JSON.stringify(context.__nav)), {
    navResolve: (v, s) => JSON.parse(JSON.stringify(context.navResolve(v, s))),
    dailyHistoryView: context.dailyHistoryView,
    dailyHistoryTarget: context.dailyHistoryTarget,
    dailyHistoryUrl: context.dailyHistoryUrl,
    dailyHistorySub: context.dailyHistorySub
  });
}

test('the deck is exactly the five phone tabs, with Log in the centre', () => {
  const c = ctx();
  assert.deepEqual(c.NAV_ORDER, ['home', 'budget', 'log', 'food', 'stats']);
  assert.equal(c.NAV_ORDER[2], 'log', 'Log must stay in the middle slot');
  // css/layout.css assigns #view-*{order:n} from this list; a disagreement gives you a tab you
  // can tap but not swipe to. Check the stylesheet actually matches.
  const css = fs.readFileSync(path.join(__dirname, '../css/layout.css'), 'utf8');
  c.NAV_ORDER.forEach((view, i) => {
    assert.match(css, new RegExp('#view-' + view + '\\{order:' + i + '\\}'),
      'css/layout.css must place #view-' + view + ' at order ' + i);
  });
});

test('Stats is pinned once — a deck tab, not also a quick extra', () => {
  const c = ctx();
  assert.ok(!c.NAV_QUICK_EXTRA.includes('stats'), 'Stats is in NAV_ORDER now; listing it here shows it twice');
  assert.deepEqual(c.NAV_QUICK_EXTRA, ['settings']);
  assert.equal(c.NAV_QUICK_VIEWS.filter(v => v === 'stats').length, 1);
  assert.equal(c.NAV_QUICK_VIEWS.filter(v => v === 'food').length, 1);
  // Every pinned destination needs a label and an icon or the strip renders a raw view id.
  c.NAV_QUICK.forEach(q => {
    assert.ok(q.label && q.label !== q.view, 'missing label for ' + q.view);
    assert.ok(q.icon, 'missing icon for ' + q.view);
  });
});

test('the retired Nutrition and Kitchen views survive only as aliases', () => {
  const c = ctx();
  assert.deepEqual(c.NAV_VIEW_ALIAS, { nutrition: 'food', kitchen: 'food' });
  // No tree row may still dispatch to a screen that no longer exists.
  c.NAV_TREE.forEach(group => group.rows.forEach(row => {
    assert.ok(row.view !== 'nutrition' && row.view !== 'kitchen',
      'NAV_TREE row "' + row.id + '" still points at the retired ' + row.view + ' view');
  }));
  // Recipes, Shopping, Pantry and Food library all stay directly reachable.
  const foodGroup = c.NAV_TREE.find(g => g.id === 'food');
  assert.ok(foodGroup, 'the Kitchen group should be renamed to Food, not removed');
  assert.equal(foodGroup.label, 'Food');
  const subs = foodGroup.rows.map(r => r.sub);
  ['recipes', 'shopping', 'pantry', 'library'].forEach(s =>
    assert.ok(subs.includes(s), 'Food group lost direct access to ' + s));
  // The Today group keeps its food-log shortcut, routed to Food › Today.
  const today = c.NAV_TREE.find(g => g.id === 'today');
  const foodLog = today.rows.find(r => r.id === 'nut-today');
  assert.deepEqual({ view: foodLog.view, sub: foodLog.sub }, { view: 'food', sub: 'today' });
  // Weekly review keeps its Money-group shortcut into Stats.
  const wkr = c.NAV_TREE.find(g => g.id === 'money').rows.find(r => r.id === 'wkr');
  assert.deepEqual({ view: wkr.view, sub: wkr.sub }, { view: 'stats', sub: 'review' });
});

test('every legacy destination resolves to one canonical Food destination', () => {
  const c = ctx();
  const cases = [
    // [old view, old sub] -> [tab, supporting screen]
    [['nutrition', null],      ['today', null]],
    [['nutrition', 'today'],   ['today', null]],
    [['nutrition', 'foods'],   ['today', 'library']],
    [['nutrition', 'recipes'], ['recipes', 'review']],
    [['kitchen', null],        ['recipes', null]],
    [['kitchen', 'recipes'],   ['recipes', null]],
    [['kitchen', 'shopping'],  ['shopping', null]],
    [['kitchen', 'pantry'],    ['pantry', null]],
    // Canonical spellings go through the same one function.
    [['food', 'today'],        ['today', null]],
    [['food', 'pantry'],       ['pantry', null]],
    [['food', 'library'],      ['today', 'library']],
    [['food', 'review'],       ['recipes', 'review']]
  ];
  cases.forEach(([[view, sub], [tab, screen]]) => {
    const r = c.navResolve(view, sub);
    assert.equal(r.view, 'food', view + '/' + sub + ' should reach Food');
    assert.equal(r.sub, tab, view + '/' + sub + ' should land on ' + tab);
    assert.equal(r.screen, screen, view + '/' + sub + ' supporting screen');
  });
  // The bottom-nav button and the quick strip pass no sub: "wherever I was".
  assert.deepEqual(c.navResolve('food', null), { view: 'food', sub: null, screen: null });
  // An unrecognised sub must not invent a section.
  assert.equal(c.navResolve('food', 'nonsense').sub, null);
  // Views that are not Food pass straight through untouched.
  assert.deepEqual(c.navResolve('stats', 'review'), { view: 'stats', sub: 'review', screen: null });
  assert.deepEqual(c.navResolve('log', 'program'), { view: 'log', sub: 'program', screen: null });
});

test('legacy hashes reach Food without keeping the retired name in the URL', () => {
  const c = ctx();
  // Old bookmarks and old history entries are still RECOGNISED...
  assert.ok(c.dailyHistoryView('nutrition'));
  assert.ok(c.dailyHistoryView('kitchen'));
  // ...but resolve to the canonical destination in one step, so no intermediate entry is
  // written for a screen that no longer exists.
  assert.equal(c.dailyHistoryTarget('nutrition').view, 'food');
  assert.equal(c.dailyHistoryTarget('nutrition').foodTab, 'today');
  assert.equal(c.dailyHistoryTarget('kitchen').view, 'food');
  assert.equal(c.dailyHistoryTarget('kitchen').foodTab, 'recipes');
  assert.equal(c.dailyHistoryTarget('kitchen/pantry').foodTab, 'pantry');
  assert.equal(c.dailyHistoryTarget('nutrition/foods').foodScreen, 'library');
  assert.equal(c.dailyHistoryTarget('nutrition/recipes').foodScreen, 'review');
  // Direct #stats reloads work — Stats is a top-level destination.
  assert.equal(c.dailyHistoryTarget('stats').view, 'stats');
  // And the canonical Food hash round-trips.
  assert.equal(c.dailyHistoryTarget('food/shopping').foodTab, 'shopping');
  // A bare #food names no section, which means "wherever I was" — the same thing the
  // bottom-nav button passes. On a cold load that resolves to Today, because foodState starts
  // there; mid-session it keeps whichever section the user last chose.
  assert.equal(c.dailyHistoryTarget('food').foodTab, null);
  assert.equal(c.foodState.tab, 'today');
  // A view Daily does not have is not a destination.
  assert.equal(c.dailyHistoryTarget('bogus'), null);
});

test('Food history URLs mirror Log: the default section carries no suffix', () => {
  const c = ctx();
  assert.equal(c.dailyHistoryUrl('food', 'today'), '/daily/#food');
  assert.equal(c.dailyHistoryUrl('food', 'pantry'), '/daily/#food/pantry');
  assert.equal(c.dailyHistoryUrl('food', null), '/daily/#food');
  assert.equal(c.dailyHistoryUrl('stats', null), '/daily/#stats');
  assert.equal(c.dailyHistoryUrl('log', 'today'), '/daily/#log');
  assert.equal(c.dailyHistoryUrl('log', 'program'), '/daily/#log/program');
});

test('a fresh session opens Food on Today, and Food state is never persisted', () => {
  const c = ctx();
  assert.deepEqual(c.foodState, { tab: 'today' });
  assert.deepEqual(c.FOOD_TABS, ['today', 'recipes', 'shopping', 'pantry']);
  // The whole point of holding this in memory: no new synced key, no storage migration.
  const block = slice('const NAV_ORDER=', '// Row id → row.');
  assert.ok(!/localStorage/.test(block), 'Food navigation state must not touch localStorage');
  assert.ok(!/lsSave/.test(block), 'Food navigation state must not be a synced store');
});

test('each supporting screen names its parent section', () => {
  const c = ctx();
  assert.equal(c.FOOD_SUPPORT.library.parent, 'today');
  assert.equal(c.FOOD_SUPPORT.review.parent, 'recipes');
  // Overlay ids must exist in the markup, outside the transformed swipe deck — position:fixed
  // resolves against the deck's transform, so one placed inside it lands off-screen.
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const deckEnd = html.indexOf('/#swipe-deck');
  assert.ok(deckEnd > 0, 'the swipe deck should still close with its marker comment');
  Object.values(c.FOOD_SUPPORT).forEach(def => {
    const at = html.indexOf('id="' + def.el + '"');
    assert.ok(at > 0, 'missing overlay markup for ' + def.el);
    assert.ok(at > deckEnd, def.el + ' must sit outside #swipe-deck');
  });
  // Stats, by contrast, must be INSIDE the deck now.
  const statsAt = html.indexOf('id="view-stats"');
  assert.ok(statsAt > 0 && statsAt < deckEnd, '#view-stats must be a panel inside #swipe-deck');
  assert.match(html.slice(statsAt - 40, statsAt + 80), /swipe-panel/,
    '#view-stats must carry .swipe-panel');
  // One copy of the Stats markup, and one recipe book.
  assert.equal(html.split('id="view-stats"').length - 1, 1);
  assert.equal(html.split('id="kit-recipes"').length - 1, 1);
  // The retired top-level screens are gone rather than kept alive beside Food.
  assert.ok(!html.includes('id="view-nutrition"'), 'the old Nutrition panel should be removed');
  assert.ok(!html.includes('id="view-kitchen"'), 'the old Kitchen panel should be removed');
});

test('the bottom nav renders exactly the five NAV_ORDER destinations', () => {
  const c = ctx();
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const start = html.indexOf('<nav id="bottom-nav">');
  assert.ok(start > 0, 'bottom nav markup missing');
  // Search for the close FROM the opening tag: the document has earlier <nav> elements.
  const nav = html.slice(start, html.indexOf('</nav>', start));
  const views = [...nav.matchAll(/data-view="([a-z]+)"/g)].map(m => m[1]);
  assert.deepEqual(views, c.NAV_ORDER, 'bottom-nav buttons must match NAV_ORDER exactly, in order');
});
