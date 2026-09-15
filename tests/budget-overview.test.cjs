// Cover for Budget › Overview: the view registry and its routing, the default landing view,
// the canonical current-week arithmetic it shares with the Week hero, and the promise that the
// screen is read-only.
//
// These run the REAL declarations out of js/app.js in a VM — no DOM, no network, no storage,
// no account. Every category, account, transaction and balance below is invented for the test.
//
// They exist because the expensive failures here are silent ones: a view added to the strip
// and not to the registry (or the reverse), a second copy of income − committed − spent − saved
// drifting from the Week hero, a pace line that disagrees with the one beside it, or a summary
// screen that quietly writes to a synced store just by being opened.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { extract } = require('./harness.cjs');

const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

// BUD_VIEWS and NAV_TREE are `const`, not functions, so harness.extract() cannot reach them.
// Slice between two anchors instead, and assert the anchors exist so renaming one fails here
// loudly rather than quietly testing nothing.
function slice(from, to) {
  const a = source.indexOf(from);
  const b = source.indexOf(to, a + 1);
  assert.ok(a >= 0, 'anchor missing: ' + from);
  assert.ok(b > a, 'anchor missing or out of order: ' + to);
  return source.slice(a, b);
}
// The body of one function, for source assertions about what it does NOT contain.
function body(name) { return extract(name); }

function views() {
  const context = vm.createContext({ console });
  vm.runInContext(slice('const BUD_VIEWS=[', 'let budgetData') +
    'globalThis.__b={BUD_VIEWS,budgetView};', context);
  return JSON.parse(JSON.stringify(context.__b));
}

// ── The view registry ─────────────────────────────────────────────

test('Finance holds five views in order, and a fresh session lands on Overview', () => {
  const { BUD_VIEWS, budgetView } = views();
  assert.deepEqual(BUD_VIEWS.map(v => v.id),
    ['overview', 'week', 'plan', 'bills', 'accounts']);
  assert.equal(budgetView, 'overview', 'a fresh session must enter Finance on the Overview');
  // Every entry is complete: a missing field is a view that lights no tab, shows no panel,
  // selects no sidebar row or renders nothing.
  BUD_VIEWS.forEach(v => {
    ['id', 'btn', 'panel', 'row', 'render'].forEach(k =>
      assert.ok(v[k], 'BUD_VIEWS.' + v.id + ' is missing ' + k));
  });
  // Ids, buttons, panels and rows are all unique — two views sharing any of them would make
  // one of them unreachable.
  ['id', 'btn', 'panel', 'row'].forEach(k =>
    assert.equal(new Set(BUD_VIEWS.map(v => v[k])).size, BUD_VIEWS.length, 'duplicate ' + k));
});

test('every registered view has a tab button and a panel, and nothing else does', () => {
  const { BUD_VIEWS } = views();
  BUD_VIEWS.forEach(v => {
    assert.ok(html.includes('id="' + v.btn + '"'), 'no tab button in index.html for ' + v.id);
    assert.ok(html.includes('id="' + v.panel + '"'), 'no panel in index.html for ' + v.id);
    assert.ok(html.includes("setBudgetView('" + v.id + "')"), 'nothing dispatches to ' + v.id);
  });
  // The reverse direction: a bv-*-btn in the markup that the registry has never heard of is a
  // tab that would light nothing and render nothing.
  const inMarkup = [...html.matchAll(/id="(bv-[a-z]+-btn)"/g)].map(m => m[1]);
  assert.deepEqual(inMarkup.sort(), BUD_VIEWS.map(v => v.btn).sort());
});

// ── Accounts is a Finance VIEW, not an overlay ────────────────────
// It was a full-screen .app-overlay launched from a button beside the tablist. The contract is
// inverted now: exactly one registry entry, one tab inside the tablist, one panel, and no
// overlay shell, launcher or close function left anywhere.

test('Accounts is a registered Finance view with exactly one tab and one panel', () => {
  const { BUD_VIEWS } = views();
  const acct = BUD_VIEWS.filter(v => v.id === 'accounts');
  assert.equal(acct.length, 1, 'Accounts must appear exactly once in BUD_VIEWS');
  assert.equal(acct[0].panel, 'budget-accounts-view');
  assert.equal(acct[0].render, 'renderAccountsPage', 'the existing renderer, not a new one');
  assert.equal(acct[0].row, 'accounts', 'it keeps the nav row id it already had');
  // Order: Overview · Week · Plan · Bills · Accounts.
  assert.equal(BUD_VIEWS.findIndex(v => v.id === 'accounts'), 4);
  // One tab, inside the tablist, and one panel.
  assert.equal((html.match(/id="bv-accounts-btn"/g) || []).length, 1);
  assert.equal((html.match(/id="budget-accounts-view"/g) || []).length, 1);
  const listStart = html.indexOf('id="budget-view-tabs"');
  const listEnd = html.indexOf('</div>', listStart);
  const tabAt = html.indexOf('id="bv-accounts-btn"');
  assert.ok(listStart > 0 && tabAt > listStart && tabAt < listEnd,
    'the Accounts tab must sit INSIDE role="tablist" with the others');
});

test('the standalone Accounts overlay, launcher and close function are gone', () => {
  assert.ok(!/id="view-accounts"/.test(html), 'the overlay shell must be removed');
  assert.ok(!/id="bud-accounts-btn"/.test(html), 'the launcher beside the tablist must be gone');
  assert.ok(!/\.bud-nav-act\{/.test(fs.readFileSync(path.join(__dirname, '../css/budget-home.css'), 'utf8')),
    'the launcher treatment has no element left to style');
  assert.ok(!/data-back="closeAccounts"/.test(html), 'a Finance view needs no Back control');
  assert.ok(!/function closeAccounts/.test(source), 'no callers remain after the overlay went');
  assert.ok(!/_acctReturnFocus/.test(source), 'launcher focus belonged to the overlay');
  // Nothing may treat it as a peer overlay or hide it on a view change any more.
  const peers = slice('const AI_PEER_OVERLAYS=', 'function aiHidePeerOverlays');
  assert.ok(!/view-accounts/.test(peers), 'Accounts is not a peer overlay');
  assert.ok(!/view-accounts/.test(body('setView')), 'setView has no overlay to close');
  // …and no stylesheet may still be positioning it as one. Comments are stripped whole: the
  // blocks that explain WHY the selector left still name it, and a source assertion must read
  // the rules rather than the explanation.
  ['budget-home.css', 'kitchen-extras.css', 'layout.css', 'base.css'].forEach(f => {
    const css = fs.readFileSync(path.join(__dirname, '../css/' + f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/#view-accounts/.test(css), 'css/' + f + ' still styles the retired overlay');
  });
});

test('openAccounts is a navigation helper now, with no overlay manipulation left in it', () => {
  const fn = body('openAccounts');
  assert.match(fn, /budgetView='accounts'/, 'the assignment comes first, so setView lands there');
  assert.match(fn, /setBudgetView\('accounts'\)/);
  assert.match(fn, /setView\('budget'\)/, 'from another destination it still switches to Finance');
  [/style\.display/, /style\.left/, /aiHidePeerOverlays/, /getElementById\('view-accounts'\)/,
   /closeAccounts/, /_acctReturnFocus/, /layoutIsDesktop/].forEach(re =>
    assert.ok(!re.test(fn), 'openAccounts must not contain ' + re));
  // Every existing caller still says openAccounts(), so none of them had to change.
  assert.ok((source.match(/openAccounts\(/g) || []).length >= 6,
    'the compatibility helper should still have its callers');
});

test('the navigation tree routes Accounts through the Finance subview', () => {
  const tree = slice('const NAV_TREE=[', '// Row id → row.');
  assert.match(tree, /\{id:'accounts',\s*label:'Accounts',\s*view:'budget',\s*sub:'accounts'\}/);
  assert.ok(!/view:'accounts'/.test(tree), 'no row may target a standalone accounts view');
  // The special case in the dispatcher is gone with it.
  assert.ok(!/viewId==='accounts'/.test(body('navGo')));
  // Accounts no longer clears the pinned Finance destination or the selected row.
  assert.ok(!/view-accounts/.test(body('navCurrentRow')));
  assert.ok(!/view-accounts/.test(body('navCurrentQuick')));
});

test('the Accounts store, its sync registration and its save path did not move', () => {
  // One store, one key, one Firebase path, one writer — rehoming the SCREEN must not have
  // touched any of them.
  assert.match(body('loadAccounts'), /lsLoad\('daily_accounts', \[\]\)/);
  assert.match(body('saveAccounts'), /lsSave\('daily_accounts', accounts, 'accounts'\)/);
  assert.equal((source.match(/lsSave\('daily_accounts'/g) || []).length, 1,
    'exactly one writer for the accounts store');
  assert.match(source, /syncBlobListen\(user\.uid,'accounts','daily_accounts'/,
    'the sync registration is unchanged');
  // No second account state, and no boot-time seeding.
  assert.equal((source.match(/let accounts = loadAccounts\(\)/g) || []).length, 1);
  assert.match(body('ensureAccountsMigrated'),
    /if\(!savHas && !ccHas\) return;/, 'a brand-new user is still left unmigrated');
  // Every edit still lands through saveAccounts() and then re-renders the same page.
  ['accountSetField', 'accountDelete', 'accountToggleStatement', 'accountMarkPaid']
    .filter(n => source.includes('function ' + n + '('))
    .forEach(n => assert.match(body(n), /saveAccounts\(/, n + ' must save through saveAccounts'));
});

test('rendering the Accounts panel writes nothing', () => {
  // Browsing is read-only; only a real edit may reach storage.
  const fn = body('renderAccountsPage');
  [/localStorage/, /lsSave/, /lsSaveTS/, /saveAccounts\(/, /Date\.now\(/].forEach(re =>
    assert.ok(!re.test(fn), 'renderAccountsPage must not contain ' + re));
  // …and so is the Finance view switch that reveals it.
  [/localStorage/, /lsSave/, /Date\.now\(/].forEach(re => {
    assert.ok(!re.test(body('setBudgetView')), 'setBudgetView must not contain ' + re);
    assert.ok(!re.test(body('budRenderView')), 'budRenderView must not contain ' + re);
    assert.ok(!re.test(body('openAccounts')), 'openAccounts must not contain ' + re);
  });
});

test('the destination is named Finance where the word means the place', () => {
  // The bottom nav, the sidebar's pinned strip and the tablist all say Finance…
  assert.match(html, /data-view="budget"[\s\S]{0,400}?\n\s*Finance\n/);
  assert.match(slice('const NAV_QUICK_LABELS=', 'const NAV_QUICK_EXTRA'), /budget:'Finance'/);
  assert.match(html, /aria-label="Finance views"/);
  assert.match(body('buildFinanceCheckinCard'), /Open Finance →/);
  // …while the internal id, the route and the storage keys stay 'budget'.
  assert.match(html, /data-view="budget" onclick="setView\('budget'\)"/);
  assert.match(body('dailyHistoryView'), /'budget'/, 'the #budget route must keep working');
  assert.match(body('dailyHistoryUrl'), /'#'\+v/);
  assert.ok(source.includes("'daily_budget'"), 'the store key is unchanged');
  // The budgeting CONCEPT keeps its own name.
  assert.ok(source.includes("'Budget setup'") || html.includes('>Budget setup<'));
  assert.match(body('budRecalc'), /Over budget/);
  assert.match(html, /Export budget \(CSV\)/);
});

test('the Finance tabs use the scrolling segmented control, not the filling one', () => {
  // .seg-fill's buttons are flex:1 0 auto and never shrink, so labels would spill over
  // each other on a phone instead of ellipsising.
  const strip = html.slice(html.indexOf('id="budget-view-tabs"') - 120, html.indexOf('id="budget-view-tabs"') + 40);
  assert.match(strip, /seg-tabs seg-scroll/);
  assert.ok(!/seg-tabs seg-fill" id="budget-view-tabs"/.test(html));
});

test('setBudgetView drives the registry and never calls scrollIntoView', () => {
  const fn = body('setBudgetView');
  assert.match(fn, /BUD_VIEWS\.forEach/, 'the five views must come from the registry');
  assert.ok(!/scrollIntoView/.test(fn),
    '#view-budget is a .swipe-panel inside the transformed deck — use segScrollToTab');
  assert.match(fn, /segScrollToTab/, 'the selected tab has to be revealed in a scrolling strip');
  // The hand-written segSetOn/classList pairs the registry replaced must not come back.
  assert.ok(!/getElementById\('bv-week-btn'\)/.test(fn));
  assert.ok(!/getElementById\('budget-month-view'\)/.test(fn));
  // Rendering is the registry's job too — no per-view branch may reappear here.
  assert.match(fn, /budRenderView\(v\)/);
  assert.ok(!/renderMonth\(\)/.test(fn));
  assert.match(body('budRenderView'), /BUD_VIEWS\.find/);
});

test('selecting the last Finance tab reveals it after the panel restores the scrollbar', () => {
  const { BUD_VIEWS } = views();
  const elements = {};
  const measurements = [];
  let width = 288;
  let scrollLeft = 0;
  let rendered = false;
  const row = {
    get scrollLeft() { return scrollLeft; },
    set scrollLeft(value) { scrollLeft = Math.max(0, Math.min(360 - width, value)); },
    getBoundingClientRect() {
      measurements.push({ width, rendered, accountsHidden: elements['budget-accounts-view'].hidden });
      return { left: 16, width };
    }
  };
  elements['budget-view-tabs'] = row;
  BUD_VIEWS.forEach((view, index) => {
    const selected = new Set();
    elements[view.btn] = {
      classList: { toggle(name, on) { if (on) selected.add(name); else selected.delete(name); } },
      setAttribute(name, value) { this[name] = value; },
      getBoundingClientRect() { return { left: 16 + index * 60 - scrollLeft, width: 60 }; }
    };
    const panel = { hidden: view.id !== 'overview' };
    panel.classList = { toggle(name, hidden) { panel.hidden = hidden; } };
    elements[view.panel] = panel;
  });
  const context = vm.createContext({
    BUD_VIEWS, budgetView: 'overview',
    document: { getElementById(id) { return elements[id] || null; } },
    setNavActive() {},
    budRenderView(view) {
      assert.equal(view, 'accounts');
      assert.equal(elements['budget-accounts-view'].hidden, false);
      // Rendering the tall destination restores a 15px scrollbar after the old panel hid.
      rendered = true;
      width = 273;
    }
  });
  vm.runInContext(['segSetOn', 'segScrollToTab', 'setBudgetView'].map(extract).join('\n'), context);
  context.setBudgetView('accounts');

  assert.deepEqual(measurements, [{ width: 273, rendered: true, accountsHidden: false }],
    'reveal must measure the final scrollport after the destination is shown and rendered');
  assert.equal(scrollLeft, 87, 'the browser clamp must use the final width, not leave 15px clipped');
  const accounts = elements['bv-accounts-btn'].getBoundingClientRect();
  assert.ok(accounts.left >= 16 && accounts.left + accounts.width <= 16 + width);
  BUD_VIEWS.forEach(view => {
    assert.equal(elements[view.btn]['aria-selected'], view.id === 'accounts' ? 'true' : 'false');
    assert.equal(elements[view.panel].hidden, view.id !== 'accounts');
  });
});

test('the tab strip is a real tablist: five tabs, five panels, one control each', () => {
  const { BUD_VIEWS } = views();
  assert.match(html, /id="budget-view-tabs" role="tablist" aria-label="Finance views"/);
  BUD_VIEWS.forEach(v => {
    // Each tab names the panel it controls…
    assert.ok(html.includes('id="' + v.btn + '" role="tab"') ||
              html.includes('id="' + v.btn + '" class="on" role="tab"'),
      v.id + ' tab must carry role="tab"');
    assert.ok(html.includes('aria-controls="' + v.panel + '"'),
      v.id + ' tab must control its own panel');
    // …and each panel points back at exactly one tab.
    assert.equal((html.match(new RegExp('aria-labelledby="' + v.btn + '"', 'g')) || []).length, 1);
    assert.ok(html.includes('id="' + v.panel + '" class="hidden" role="tabpanel"') ||
              html.includes('id="' + v.panel + '" role="tabpanel"'),
      v.panel + ' must be a tabpanel');
  });
  // Exactly one tab in THIS strip starts selected, and it is the Overview. (Log and Food have
  // their own tablists, which is why the count is scoped to the Finance strip.)
  const stripStart = html.indexOf('id="budget-view-tabs"');
  const strip = html.slice(stripStart, html.indexOf('</div>', stripStart));
  assert.equal((strip.match(/aria-selected="true"/g) || []).length, 1);
  assert.equal((strip.match(/role="tab"/g) || []).length, BUD_VIEWS.length);
  assert.match(strip, /id="bv-overview-btn" class="on" role="tab" aria-selected="true"/);
});

test('navCurrentRow reads the row off the registry instead of a second literal map', () => {
  const fn = body('navCurrentRow');
  assert.match(fn, /BUD_VIEWS\.find/);
  assert.ok(!/bud-month['"]?\s*,\s*bills:/.test(fn), 'the duplicated budget→row map is gone');
  const { BUD_VIEWS } = views();
  const tree = slice('const NAV_TREE=[', '// Row id → row.');
  BUD_VIEWS.forEach(v => {
    assert.ok(tree.includes("id:'" + v.row + "'"), 'NAV_TREE has no row for ' + v.id);
  });
  // Overview leads the Money group, before This week.
  assert.ok(tree.indexOf("id:'bud-overview'") < tree.indexOf("id:'bud-week'"),
    'Overview should be listed before This week');
});

test('entering Budget applies the remembered view rather than always rendering the week', () => {
  const fn = body('setView');
  assert.match(fn, /if\(v==='budget'\) setBudgetView\(budgetView\);/,
    'setView must land on the sub-view budgetView names — a deep link can set it first');
});

test('Overview has its own entry point, and explicit Week and Bills links keep theirs', () => {
  assert.match(body('openBudgetOverview'), /setBudgetView\('overview'\)/);
  assert.match(body('openBudgetWeek'), /setBudgetView\('week'\)/);
  assert.match(body('openBillsCalendar'), /setBudgetView\('bills'\)/);
  // Home's Finance check-in is a check-in, so it opens the current-position screen.
  const fin = body('buildFinanceCheckinCard');
  assert.match(fin, /openBudgetOverview\(\)/);
  assert.ok(!/openBudgetWeek\(\)/.test(fin));
  // Stats' source-week link is explicit about needing the week, and must stay that way.
  assert.match(body('openBudgetWeekFromStats'), /setBudgetView\('week'\)/);
});

// ── "This month" opens THIS month ─────────────────────────────────
// The card always describes the current calendar month (getMonthDate(0)), so its action has to
// land on that month. With a plain Plan entry it preserved currentMonthOffset, and
// after browsing back to June the September card opened June.

test('openBudgetCurrentMonth resets the month index, then opens Plan', () => {
  // Run the real helper against a stubbed setBudgetView, so the assertion is about behaviour
  // rather than about the source text.
  const context = vm.createContext({ console, currentMonthOffset: -3, opened: null });
  vm.runInContext('function setBudgetView(v){ opened={view:v, offsetAtOpen:currentMonthOffset}; }', context);
  vm.runInContext(extract('openBudgetCurrentMonth'), context);
  vm.runInContext('openBudgetCurrentMonth();', context);
  assert.equal(context.currentMonthOffset, 0, 'the month index must be reset to the current month');
  // JSON round-trip: the object is built inside the VM and carries that realm's prototype,
  // which assert/strict's deepEqual compares as well as the contents.
  assert.deepEqual(JSON.parse(JSON.stringify(context.opened)), { view: 'plan', offsetAtOpen: 0 },
    'Plan must open AFTER the reset, or it renders the browsed month once more');
  // Idempotent, and it never walks forward past the current month.
  vm.runInContext('currentMonthOffset=0; openBudgetCurrentMonth();', context);
  assert.equal(context.currentMonthOffset, 0);
  // In memory only — no storage, no stamp, no sync.
  const fn = body('openBudgetCurrentMonth');
  [/localStorage/, /lsSave/, /Date\.now/, /firebase/].forEach(re =>
    assert.ok(!re.test(fn), 'openBudgetCurrentMonth must not contain ' + re));
});

test('only the "This month" card resets the offset — every other Plan entry point remembers', () => {
  // The card's own action.
  assert.match(body('budOvMonthHtml'), /onclick="openBudgetCurrentMonth\(\)"/);
  assert.ok(!/onclick="setBudgetView\(\\'month\\'\)"/.test(body('budOvMonthHtml')));
  // The Plan tab and the History & tools link stay on the plain dispatcher: both mean "the
  // Month workspace", and a control that silently rewound your position is the worse bug.
  assert.match(html, /id="bv-plan-btn"[^>]*onclick="setBudgetView\('plan'\)"/);
  assert.match(html, /class="bud-tool-btn" onclick="setBudgetView\('plan'\)"/);
  assert.ok(!/openBudgetCurrentMonth/.test(html),
    'the reset helper belongs to the card that names a month, not to the markup');
  // Money › Plan in the nav, and returning from a source/evidence view.
  assert.match(body('navGo'), /setBudgetView\(t\.sub\)/);
  assert.ok(!/openBudgetCurrentMonth/.test(body('navGo')));
  assert.match(body('returnFromSourceView'), /setBudgetView\(dest\.tab\|\|'plan'\)/);
  assert.ok(!/openBudgetCurrentMonth/.test(body('returnFromSourceView')));
  // Ordinary movement between views restores the remembered one, offset included.
  assert.ok(!/openBudgetCurrentMonth/.test(body('setView')));
  assert.ok(!/currentMonthOffset/.test(body('setBudgetView')),
    'switching views must not touch the month index');
  // Exactly one caller in the whole file, plus the declaration.
  assert.equal((source.match(/openBudgetCurrentMonth/g) || [])
    .length - (source.match(/\/\/.*openBudgetCurrentMonth/g) || []).length, 2,
    'one declaration and one caller');
});

test('legacy Month and Yearly view values normalize to Plan rather than Overview', () => {
  const { BUD_VIEWS } = views();
  const elements = {};
  BUD_VIEWS.forEach(view => {
    elements[view.btn] = { classList: { toggle() {} }, setAttribute() {} };
    elements[view.panel] = { classList: { toggle() {} } };
  });
  const calls=[];
  const context=vm.createContext({
    BUD_VIEWS, document:{getElementById:id=>elements[id]||null},
    setNavActive(){}, budRenderView:view=>calls.push(view), segSetOn(){}, segScrollToTab(){}
  });
  vm.runInContext(extract('setBudgetView'), context);
  vm.runInContext("setBudgetView('month');", context);
  assert.equal(vm.runInContext('budgetView', context), 'plan');
  vm.runInContext("setBudgetView('year');", context);
  assert.equal(vm.runInContext('budgetView', context), 'plan');
  assert.deepEqual(calls, ['plan','plan']);
});

// ── The canonical current-week figures ────────────────────────────
// budAvailable() is the ONE definition of "available to spend"; budWeekMoney() supplies its
// four components from the canonical readers for a caller with no budget inputs on screen.
// The Week hero (budRecalc) hands budAvailable the same four totals off the live DOM, so the
// two surfaces cannot disagree — these assertions are what keeps that true.

const FNS = ['dateStr', 'localMidnight', 'catIsArchived', 'activeCats',
  'catStatus', 'catIsCharging', 'catCycle', 'catChargeType', 'catIsRecurring', 'catAmount',
  'catBudget', 'catChargeableBudget',
  'weekIncome', 'weekIncomeKeys', 'weekFixedTotal', 'weekSavedAmt',
  'txnsForWeek', 'txnsForWeekCat', 'txnCatTotal', 'varCatAmount', 'weekKeyOf', 'weekVarTotal',
  'budAvailable', 'budWeekMoney', 'budPaceText'];

function money(fixture) {
  const context = vm.createContext({ console, Date, Math, JSON, Set, Map, Object, Array,
    String, Number, parseFloat, isNaN });
  vm.runInContext('var CAT_ID_SHAPE=/^$/;', context);
  vm.runInContext(FNS.map(extract).join('\n'), context);
  context.loadIncCats = () => fixture.incCats || [];
  context.loadFixCats = () => fixture.fixCats || [];
  context.loadVarCats = () => fixture.varCats || [];
  context.txnData = fixture.txns || [];
  context.budgetData = fixture.budgetData || {};
  return context;
}

const WK = '2026-09-07';
const baseFixture = {
  incCats: [{ id: 'job1', name: 'Studio' }, { id: 'job2', name: 'Weekend shifts' }],
  fixCats: [{ id: 'rent', name: 'Rent', budget: 260, chargeType: 'commitment' }],
  varCats: [{ id: 'food', name: 'Food' }, { id: 'pub', name: 'Pub' }],
  txns: [{ id: 't1', date: '2026-09-09', catId: 'food', amount: 62.4 }],
  budgetData: {}
};
const week = (over) => Object.assign({
  wk: WK, inc_job1: '640', inc_job2: '280', sav_amount: '120',
  fixRates: { rent: 260, gym: 27.95 }
}, over || {});

test('available to spend is income − committed − spent − saved, from the canonical readers', () => {
  const c = money(baseFixture);
  const m = c.budWeekMoney(week(), WK);
  assert.equal(m.income, 920);
  assert.equal(m.committed, 287.95, 'the frozen fixRates, not today’s category list');
  assert.equal(m.spent, 62.4, 'the transaction, not the blank manual field');
  assert.equal(m.saved, 120);
  assert.equal(Math.round(m.available * 100) / 100, 449.65);
  assert.equal(m.available, c.budAvailable(m.income, m.committed, m.spent, m.saved),
    'the reader and the subtraction must agree by construction');
});

test('no income is NULL, never zero — "nothing left" and "nothing told us yet" differ', () => {
  const c = money(baseFixture);
  assert.equal(c.budWeekMoney(week({ inc_job1: '', inc_job2: '' }), WK).available, null);
  assert.equal(c.budAvailable(0, 100, 50, 0), null);
  // A real zero income figure is still "not entered" — weekIncome returns 0 either way, and
  // this is the existing rule the Week hero has always used.
  assert.equal(c.budAvailable(-5, 0, 0, 0), null);
  // Overspending is a number, not a null.
  assert.equal(c.budAvailable(100, 60, 60, 0), -20);
});

test('the Overview and the Week hero read one week the same way', () => {
  const c = money(baseFixture);
  const d = week();
  const m = c.budWeekMoney(d, WK);
  // budRecalc's four totals, built the way it builds them from the live inputs when those
  // inputs hold exactly what the week holds (which is what budSaveDraft guarantees).
  const totalIncome = c.weekIncome(d);
  const totalFixed = c.weekFixedTotal(d);
  const totalVar = c.weekVarTotal(d, WK);
  const totalSaved = parseFloat(d.sav_amount) || 0;
  assert.deepEqual(
    [m.income, m.committed, m.spent, m.saved, m.available],
    [totalIncome, totalFixed, totalVar, totalSaved,
      c.budAvailable(totalIncome, totalFixed, totalVar, totalSaved)]);
});

test('the pace line states one rule, and says nothing when there is nothing to pace', () => {
  const c = money(baseFixture);
  assert.equal(c.budPaceText(344, 2), '$172/day for the 2 days left');
  assert.equal(c.budPaceText(60, 1), '$60/day for the rest of today');
  assert.equal(c.budPaceText(-375, 2), 'Over by $375 this week');
  assert.equal(c.budPaceText(null, 2), '', 'no income figure paces nothing');
  assert.equal(c.budPaceText(0, 2), '', 'exactly nothing left is not a $0/day pace');
  assert.equal(c.budPaceText(200, 0), '', 'no days left to spread it over');
  // The Week hero must go through the same helper rather than keeping its own copy.
  const recalc = body('budRecalc');
  assert.match(recalc, /budPaceText\(available, daysLeft\)/);
  assert.match(recalc, /budAvailable\(totalIncome, committed, spentNow, totalSaved\)/);
});

// ── The projection half is shared, not copied ─────────────────────

test('Outlook and the Overview word and colour one figure from one function', () => {
  const part = body('budForecastPart');
  assert.match(part, /estimated left before your next pay/);
  assert.match(part, /estimated shortfall before your next pay/);
  assert.match(part, /BUD_TIGHT_UNDER/, 'the tight threshold must be the named constant');
  const outlook = body('renderOutlookCard');
  assert.match(outlook, /budForecastPart\(f\)/);
  assert.ok(!/estimated left before your next pay/.test(outlook),
    'the copy lives in budForecastPart now — a second copy is how the two surfaces drift');
  assert.ok(!/f\.projected<50/.test(outlook), 'the literal threshold is gone');
  assert.match(body('budOvComingHtml'), /budForecastPart\(f\)/);
  // One number decides "tight" everywhere.
  assert.equal((source.match(/const BUD_TIGHT_UNDER=/g) || []).length, 1);
  assert.match(body('budOvAttention'), /BUD_TIGHT_UNDER/);
});

// ── Read-only ─────────────────────────────────────────────────────

test('the Overview writes nothing: no store, no stamp, no sync path, no migration', () => {
  // Comments stripped: the block's own prose names daily_budget_collapse to say it is
  // deliberately NOT used, and a source assertion must read the code, not the explanation.
  const block = slice('// ── Budget › Overview ──', '// ── Home: Finance check-in ──')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  [/localStorage/, /lsSave/, /lsSaveTS/, /SYNC_BLOB_REG/, /firebase/, /schemaVersion/,
   /Date\.now\(\)/, /updatedAt/, /_bootPhase/].forEach(re =>
    assert.ok(!re.test(block), 'Budget › Overview must not contain ' + re));
  // The one write it may cause is the existing transaction modal.
  assert.match(block, /openTxnModal\(\)/);
  // It must not carry Budget Week's keyed collapse state either.
  assert.ok(!/data-bud-key/.test(block), 'Overview cards are summaries, not collapsing cards');
  assert.ok(!/daily_budget_collapse/.test(block));
});

test('the Overview cards stay out of BUD_CARDS, which is the Week layout', () => {
  const context = vm.createContext({ console });
  vm.runInContext(slice('const BUD_CARDS=[', 'let _budLayoutMode') +
    'globalThis.__b={BUD_CARDS};', context);
  const ids = context.__b.BUD_CARDS.map(c => c.id);
  assert.ok(!ids.some(id => id.startsWith('bov-')));
  assert.ok(!ids.includes('budget-overview-view'));
  assert.equal(ids.length, 8, 'the Week layout is unchanged at eight cards');
});

test('reading the month breakdown for a summary leaves no drill-down targets behind', () => {
  const fn = body('monthSpendBreakdown');
  assert.match(fn, /const register=!\(opts&&opts\.register===false\)/);
  assert.match(fn, /c\.evidenceKey=register\?statsRegisterFinanceEvidence/);
  assert.match(body('budOvMonthHtml'), /\{register:false\}/);
  // Budget › Month still registers — it is the screen that can open one.
  assert.match(body('renderMonthSpendBreakdown'), /monthSpendBreakdown\(monthDate,keys\)/);
});

test('Needs attention shows at most three items and invents no health score', () => {
  const max = slice('const BUD_OV_ATTENTION_MAX=', '\n');
  assert.match(max, /=3;/);
  assert.match(body('budOvAttentionHtml'), /slice\(0,BUD_OV_ATTENTION_MAX\)/);
  const att = body('budOvAttention');
  // Every item reads a canonical fact rather than computing a new one.
  ['acctDueDays', 'billOccurrences', 'getWeekVarGoal', 'billsUndatedCount', 'activeCats']
    .forEach(name => assert.match(att, new RegExp(name + '\\('), 'missing reader: ' + name));
  assert.ok(!/score|weight|rating/i.test(att), 'no financial-health score');
  // Red is a state that has gone wrong; everything else is amber.
  const negs = (att.match(/tone:'neg'/g) || []).length;
  assert.equal(negs, 2, 'only the overdue statement and the projected shortfall are red');
});

test('the fortnight preview is truncated but its total is not', () => {
  const fn = body('budOvComingHtml');
  assert.match(fn, /budTimelineWindow\(\)/, 'the existing 14-day window, not a second one');
  assert.match(fn, /billOccurrences\(win\.from, win\.to\)/, 'the existing recurrence engine');
  // The total sums every occurrence; only the ROWS are sliced.
  assert.match(fn, /const total=occ\.reduce\(\(s,o\)=>s\+o\.amount,0\)/);
  assert.match(fn, /const shown=occ\.slice\(0,BUD_OV_BILL_PREVIEW\)/);
  assert.match(fn, /shown\.map\(billRowHtml\)/, 'the Bills calendar’s own row, not a second one');
  assert.match(fn, /Nothing here is deducted from this week’s figures/,
    'an upcoming-payment total is not the weekly accrual and must say so');
});

// ── The hero's one primary action ─────────────────────────────────
// The Overview STATES the weekly position; Week is where every part of it is actually changed,
// so it is where almost every visit ends. The hero used to offer three equal pills — Add
// expense, Open week, and Set up when there was no income — which is three answers to "what now".
// Month, Bills, Accounts and Yearly stay on the tab strip and must not appear down here.

function hero(m) {
  const context = vm.createContext({ console, Date, Math, JSON });
  vm.runInContext(`
    function budHeroPanel(items,opts){ const i=items[0];
      return '<panel cols="'+opts.cols+'" class="'+opts.className+'" val="'+i.val+'">'+
        '<sub>'+i.sub+'</sub>'+i.chip+i.extra+'</panel>'; }
    function statsSplit(rows){ return '<split>'+rows.map(r=>r[0]+'='+r[1]).join('|')+'</split>'; }
    function budRangeLabel(){ return '7-13 Sept'; }
    function budPaceText(){ return '$50 a day for 3 more days'; }
    function varGoalDaysLeft(){ return 3; }
    function tstat(kind,label){ return '<tstat kind="'+kind+'">'+label+'</tstat>'; }
    function escText(s){ return String(s); }
    function fmtMoney(n){ return '$'+Math.round(n); }
  `, context);
  vm.runInContext(extract('budOvHeroHtml'), context);
  context.m = m;
  return vm.runInContext('budOvHeroHtml(m)', context);
}
const WEEK = { monday: new Date(2026, 8, 7), income: 1200, available: 350, spent: 210, committed: 480, saved: 160 };

test('This week is the hero primary action, and the only other control is quick capture', () => {
  const html = hero(WEEK);
  const buttons = html.match(/<button[^>]*>/g) || [];
  assert.equal(buttons.length, 2, 'exactly two actions: the destination and quick capture');
  assert.ok(buttons.every(b => /type="button"/.test(b)), 'real buttons, so they are keyboard reachable');
  // Order and emphasis both say which one is primary.
  assert.match(buttons[0], /bov-act-primary/);
  assert.match(buttons[0], /bov-act-lead/);
  assert.match(buttons[0], /setBudgetView\('week'\)/);
  assert.match(html, />This week /);
  assert.ok(!/bov-act-primary/.test(buttons[1]), 'quick capture must not compete with it');
  assert.match(buttons[1], /openTxnModal\(\)/);
  // The other Finance views belong to the tab strip.
  ['month', 'bills', 'accounts', 'year'].forEach(v =>
    assert.ok(!html.includes("setBudgetView('" + v + "')"), v + ' must not appear in the hero'));
  assert.ok(!/Open week/.test(html), 'the retired label is gone');
});

test('This week stays the primary action before anything is set up', () => {
  const html = hero({ ...WEEK, income: 0 });
  const buttons = html.match(/<button[^>]*>/g) || [];
  // ONE action. "Set up income & bills" used to take the lead pill here, which made the hero's
  // main button change identity with state and sent a first-time reader somewhere other than
  // the screen every later visit goes to.
  assert.equal(buttons.length, 1, 'no second button may compete with This week');
  assert.match(buttons[0], /setBudgetView\('week'\)/);
  assert.match(buttons[0], /bov-act-primary/);
  assert.match(buttons[0], /bov-act-lead/);
  assert.ok(!/openBudgetSetup/.test(html), 'setup is copy here, not a button');
  // Setup is still explained, and still named where it actually lives.
  assert.match(html, /Income, bills and your spending goal are set up in This week/);
  assert.match(html, /Add this week’s income and fixed costs/);
  // The figure itself still refuses to present an unknown as $0.
  assert.match(html, /val="—"/);
});

test('setup stays reachable from Week, which is where it lives', () => {
  // Week's own setup card and the Needs-attention row are the two ways in, and both survive.
  assert.match(body('renderBudgetSetupCard'), /openBudgetSetup\(\)/);
  assert.match(body('budOvAttention'), /openBudgetSetup\(\)/);
  assert.match(source, /\{id:'setup'/, 'the setup card is still first in the Week layout');
});

test('the hero keeps every figure it already stated', () => {
  const html = hero(WEEK);
  assert.match(html, /Spent=\$210/);
  assert.match(html, /Committed=\$480/);
  assert.match(html, /Saved=\$160/);
  assert.match(html, /val="\$350"/);
  assert.match(html, /\$50 a day for 3 more days/, 'the shared pace line');
  assert.match(html, /This week · 7-13 Sept/);
  assert.match(html, /not a bank balance/, 'the allocation caveat stays');
});
