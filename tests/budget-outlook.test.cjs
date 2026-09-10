// Behavioural cover for Budget's fortnight timeline and for the Fixed expenses card's place
// in the week's card order.
//
// These run the REAL declarations out of js/app.js in a VM — no DOM, no network, no storage,
// no account, and nothing here reads or writes a production profile. Every category, account
// and balance below is invented for the test.
//
// They exist because the expensive failures in this change are silent arithmetic ones: a
// window that is off by a day at either end, a weekly charge counted once when it lands
// twice, a daylight-saving boundary walking an occurrence onto the wrong date, or the
// fortnight total quietly leaking into the pay-cycle projection the weekly hero is derived
// from.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { extract } = require('./harness.cjs');

const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

// BUD_TIMELINE_DAYS and BUD_CARDS are `const`, not functions, so harness.extract() cannot
// reach them. Slice between two anchors instead, and assert the anchors exist so renaming one
// fails here loudly rather than quietly testing nothing.
function slice(from, to) {
  const a = source.indexOf(from);
  const b = source.indexOf(to, a + 1);
  assert.ok(a >= 0, 'anchor missing: ' + from);
  assert.ok(b > a, 'anchor missing or out of order: ' + to);
  return source.slice(a, b);
}

// Everything billOccurrences()/budTimelineWindow() actually walk through, pulled from source.
// loadFixCats and loadAccounts are the seams the fixture is injected at: they are the only two
// stores these functions read, and stubbing them keeps localStorage out of the test entirely.
const FNS = [
  'dateStr', 'localMidnight', 'getLocalDate',
  '_billMonthlyOn', '_billYearlyOn',
  'catStatus', 'catIsCharging', 'catIsArchived', 'catCycle', 'catChargeType', 'catIsRecurring',
  'catAmount', 'catIsUnnamed', 'catDisplayName', 'catLabel', 'catPaymentAccount',
  'catOccurrencesBetween', 'billIsScheduled', 'billOccurrences', 'billsUndatedCount',
  'budTimelineWindow', 'budRangeLabel'
];

function ctx(fixture) {
  const context = vm.createContext({ console, Date, Math, JSON, Set, Map, Object, Array, String, Number, parseFloat, isNaN });
  vm.runInContext(
    slice('const BUD_TIMELINE_DAYS=', 'function budTimelineWindow') +
    'globalThis.BUD_TIMELINE_DAYS=BUD_TIMELINE_DAYS;\n' +
    slice('const CAT_CHARGE_TYPES=', 'function catChargeType') +
    'globalThis.CAT_CHARGE_TYPES=CAT_CHARGE_TYPES;\n',
    context);
  // CAT_ID_SHAPE is only reached by catIsUnnamed for a name that equals its own id; the real
  // pattern is irrelevant to these assertions, so a never-matching stand-in keeps the slice
  // count down without changing any outcome (every fixture category has a real name).
  vm.runInContext('var CAT_ID_SHAPE=/^$/;', context);
  vm.runInContext(FNS.map(extract).join('\n'), context);
  context.loadFixCats = () => fixture.fixCats || [];
  context.loadAccounts = () => fixture.accounts || [];
  context.accounts = fixture.accounts || [];
  // Values built inside the VM carry that realm's Array/Object prototypes, and assert/strict's
  // deepEqual compares prototypes as well as contents. Round-trip anything that gets compared.
  // Dates survive as ISO strings, which is fine: every assertion below reads .key, not .date.
  context.occurrences = (from, to) => JSON.parse(JSON.stringify(context.billOccurrences(from, to)));
  return context;
}

const d = (y, m, day) => y + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0');
// A charge that is dated, active and recurring unless the test says otherwise.
const bill = (over) => Object.assign(
  { id: 'c1', name: 'Charge', chargeType: 'subscription', cycle: 'monthly', amount: 10, status: 'active' },
  over);

test('the window is today through today + 13, inclusive at both ends', () => {
  const c = ctx({});
  const w = c.budTimelineWindow('2026-09-10');
  assert.equal(c.dateStr(w.from), '2026-09-10');
  assert.equal(c.dateStr(w.to), '2026-09-23', 'day 13, not day 14');
  assert.equal(c.BUD_TIMELINE_DAYS, 14);
});

test('a charge on day 0 and one on day 13 are both in; day 14 is out', () => {
  const c = ctx({ fixCats: [
    bill({ id: 'today', name: 'Today',  dueDate: d(2026, 9, 10), amount: 5 }),
    bill({ id: 'edge',  name: 'Day 13', dueDate: d(2026, 9, 23), amount: 7 }),
    bill({ id: 'past',  name: 'Day 14', dueDate: d(2026, 9, 24), amount: 9 })
  ] });
  const w = c.budTimelineWindow('2026-09-10');
  const names = c.occurrences(w.from, w.to).map(o => o.name);
  assert.deepEqual(names, ['Today', 'Day 13']);
});

test('a weekly charge lands twice in a fortnight and both occurrences count', () => {
  const c = ctx({ fixCats: [bill({ id: 'gym', name: 'Gym', cycle: 'weekly', dueDate: d(2026, 9, 10), amount: 27.95 })] });
  const w = c.budTimelineWindow('2026-09-10');
  const occ = c.occurrences(w.from, w.to);
  assert.deepEqual(occ.map(o => o.key), ['2026-09-10', '2026-09-17']);
  assert.equal(occ.reduce((s, o) => s + o.amount, 0), 55.9);
});

test('an anchor in the future starts then — no occurrence is invented before it', () => {
  const c = ctx({ fixCats: [bill({ id: 'new', cycle: 'weekly', dueDate: d(2026, 9, 21), amount: 4 })] });
  const w = c.budTimelineWindow('2026-09-10');
  assert.deepEqual(c.occurrences(w.from, w.to).map(o => o.key), ['2026-09-21']);
});

test('the window crosses a month and a year boundary without losing a day', () => {
  const c = ctx({});
  assert.equal(c.dateStr(c.budTimelineWindow('2026-08-25').to), '2026-09-07');
  assert.equal(c.dateStr(c.budTimelineWindow('2026-12-24').to), '2027-01-06');
  assert.equal(c.dateStr(c.budTimelineWindow('2028-02-20').to), '2028-03-04', 'leap February');
});

test('a month-end anchor clamps for a short month and does not drag the series earlier', () => {
  // 31st anchor: February clamps to the 28th, and March must still be the 31st rather than
  // stepping a month on from the clamped date.
  const c = ctx({ fixCats: [bill({ id: 'rent', cycle: 'monthly', dueDate: d(2026, 1, 31), amount: 100 })] });
  const feb = c.occurrences(c.localMidnight('2027-02-20'), c.localMidnight('2027-03-05'));
  assert.deepEqual(feb.map(o => o.key), ['2027-02-28']);
  const mar = c.occurrences(c.localMidnight('2027-03-20'), c.localMidnight('2027-04-02'));
  assert.deepEqual(mar.map(o => o.key), ['2027-03-31']);
});

test('a Sydney daylight-saving boundary inside the window shifts no date and rewrites no anchor', () => {
  // Australia/Sydney moves to daylight time on the first Sunday of October (4 Oct 2026) and
  // back on the first Sunday of April (5 Apr 2026). A window spanning either must not walk a
  // weekly series off local midnight.
  const prev = process.env.TZ;
  process.env.TZ = 'Australia/Sydney';
  try {
    for (const [start, anchor, expected] of [
      ['2026-09-30', d(2026, 9, 30), ['2026-09-30', '2026-10-07']],
      ['2026-04-01', d(2026, 4, 1),  ['2026-04-01', '2026-04-08']]
    ]) {
      const cat = bill({ id: 'w', cycle: 'weekly', dueDate: anchor, amount: 3 });
      const c = ctx({ fixCats: [cat] });
      const w = c.budTimelineWindow(start);
      assert.deepEqual(c.occurrences(w.from, w.to).map(o => o.key), expected, start);
      assert.equal(cat.dueDate, anchor, 'the saved anchor is read-only');
    }
  } finally {
    if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev;
  }
});

test('archived, cancelled, non-recurring and undated charges stay out of the timeline', () => {
  const c = ctx({ fixCats: [
    bill({ id: 'live',   name: 'Live',      dueDate: d(2026, 9, 12), amount: 10 }),
    bill({ id: 'trial',  name: 'Trial',     dueDate: d(2026, 9, 13), amount: 11, status: 'trial' }),
    bill({ id: 'arch',   name: 'Archived',  dueDate: d(2026, 9, 14), amount: 12, archived: true }),
    bill({ id: 'paused', name: 'Paused',    dueDate: d(2026, 9, 15), amount: 13, status: 'paused' }),
    bill({ id: 'canx',   name: 'Cancelled', dueDate: d(2026, 9, 16), amount: 14, status: 'cancelled' }),
    bill({ id: 'commit', name: 'Weekly commitment', chargeType: 'commitment', dueDate: d(2026, 9, 17), amount: 15 }),
    bill({ id: 'nodate', name: 'Undated',   dueDate: '', amount: 16 })
  ] });
  const w = c.budTimelineWindow('2026-09-10');
  assert.deepEqual(c.occurrences(w.from, w.to).map(o => o.name), ['Live', 'Trial'],
    'a trial still charges; the rest do not, and an undated cost is never given a date');
  assert.equal(c.billsUndatedCount(), 1, 'the undated one is counted, not guessed at');
});

test('a card statement is included, tagged, and carries its own balance', () => {
  const c = ctx({
    fixCats: [bill({ id: 'live', name: 'Live', dueDate: d(2026, 9, 19), amount: 260 })],
    accounts: [
      { id: 'card', name: 'Card', type: 'debt', tracksStatement: true, dueDate: d(2026, 9, 19), statementBalance: 412.6 },
      { id: 'other', name: 'Untracked card', type: 'debt', dueDate: d(2026, 9, 19), statementBalance: 999 },
      { id: 'save', name: 'Savings', type: 'asset', tracksStatement: true, dueDate: d(2026, 9, 19), statementBalance: 999 }
    ]
  });
  const w = c.budTimelineWindow('2026-09-10');
  const occ = c.occurrences(w.from, w.to);
  assert.deepEqual(occ.map(o => o.kind), ['statement', 'charge'], 'same day: biggest first');
  assert.equal(occ[0].amount, 412.6);
  assert.equal(occ.length, 2, 'only a debt account with statement tracking on contributes one');
  assert.equal(occ.reduce((s, o) => s + o.amount, 0), 672.6, 'the visible rows are exactly what the total sums');
});

test('rows are chronological, and same-day rows are ordered biggest first', () => {
  const c = ctx({ fixCats: [
    bill({ id: 'a', name: 'Small same day', dueDate: d(2026, 9, 15), amount: 5 }),
    bill({ id: 'b', name: 'Big same day',   dueDate: d(2026, 9, 15), amount: 90 }),
    bill({ id: 'c', name: 'Earlier',        dueDate: d(2026, 9, 11), amount: 1 })
  ] });
  const w = c.budTimelineWindow('2026-09-10');
  assert.deepEqual(c.occurrences(w.from, w.to).map(o => o.name),
    ['Earlier', 'Big same day', 'Small same day']);
});

test('the fortnight total and the before-payday total are independent quantities', () => {
  // Payday tomorrow: the projection counts one charge, the timeline counts every one of them,
  // including the five that land after payday. Neither figure may be derived from the other.
  const c = ctx({ fixCats: [
    bill({ id: 'gym',  name: 'Gym',  cycle: 'weekly',  dueDate: d(2026, 9, 10), amount: 27.95 }),
    bill({ id: 'rent', name: 'Rent', cycle: 'weekly',  dueDate: d(2026, 9, 12), amount: 260 }),
    bill({ id: 'sub',  name: 'Sub',  cycle: 'monthly', dueDate: d(2026, 9, 23), amount: 13.99 })
  ] });
  const today = c.localMidnight('2026-09-10');
  const dayBeforePay = c.localMidnight('2026-09-10'); // payday 11 Sept → through the 10th
  const beforePay = c.occurrences(today, dayBeforePay);
  const w = c.budTimelineWindow('2026-09-10');
  const fortnight = c.occurrences(w.from, w.to);

  assert.deepEqual(beforePay.map(o => o.name), ['Gym']);
  assert.equal(beforePay.reduce((s, o) => s + o.amount, 0), 27.95);
  assert.deepEqual(fortnight.map(o => o.name), ['Gym', 'Rent', 'Gym', 'Rent', 'Sub']);
  assert.equal(Number(fortnight.reduce((s, o) => s + o.amount, 0).toFixed(2)), 589.89);
  assert.ok(fortnight.length > beforePay.length,
    'the timeline must not stop at payday — that was the truncation this replaced');
});

test('the range label reads as one span within a month and names both months across one', () => {
  const c = ctx({});
  const label = (s) => { const w = c.budTimelineWindow(s); return c.budRangeLabel(w.from, w.to); };
  assert.match(label('2026-09-10'), /^10.23 Sept$/);
  assert.match(label('2026-08-25'), /Aug.*Sept/);
});

// ── Card order ────────────────────────────────────────────────────
// BUD_CARDS is the single source for both layouts, so these assertions cover the phone stack
// and the desktop columns at once.
test('Fixed expenses sits directly below Spending in both layouts', () => {
  const context = vm.createContext({ console });
  vm.runInContext(slice('const BUD_CARDS=[', 'let _budLayoutMode') +
    'globalThis.__b={BUD_CARDS,BUD_LAYOUT};', context);
  const { BUD_CARDS, BUD_LAYOUT } = context.__b;

  const mobile = BUD_LAYOUT.mobile[0][1];
  assert.equal(mobile[mobile.indexOf('bud-spend-card') + 1], 'bud-fixed-card');

  const left = BUD_LAYOUT.desktop.find(([col]) => col === 'bud-col-left')[1];
  assert.equal(left[left.indexOf('bud-spend-card') + 1], 'bud-fixed-card');

  // Derived, never re-typed: every card appears exactly once across the two desktop columns.
  const desktop = BUD_LAYOUT.desktop.flatMap(([, ids]) => ids);
  assert.deepEqual(desktop.slice().sort(), BUD_CARDS.map(c => c.id).sort());
  assert.equal(new Set(desktop).size, desktop.length);
  assert.deepEqual(mobile, BUD_CARDS.map(c => c.id));
});

// ── Device-local Budget UI state ──────────────────────────────────
// daily_budget_ui holds which spending breakdown this handset shows AND whether the Fixed
// expenses recurring list is open. It is device-local by design (plain setItem, never
// lsSave(key,value,syncName), excluded from exportAllData), so nothing here touches sync — but
// the two preferences share one blob, and the writer used to stringify a fresh single-key
// object. These cover the read-modify-write that stops one from erasing the other.
function uiCtx(seed) {
  const store = new Map(seed === undefined ? [] : [['daily_budget_ui', seed]]);
  const context = vm.createContext({
    console, JSON, Object, Array,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v))
    },
    BUD_SPEND_VIEWS: ['cat', 'day'],
    _budSpendView: null,
    _budRecurOpen: null
  });
  vm.runInContext(['budUiLoad', 'budUiSave', 'budSpendView', 'budRecurOpen'].map(extract).join('\n'), context);
  context.__store = store;
  return context;
}

test('saving one Budget UI preference does not erase the other', () => {
  const c = uiCtx();
  c.budUiSave({ spendView: 'day' });
  c.budUiSave({ recurOpen: true });
  assert.deepEqual(JSON.parse(c.__store.get('daily_budget_ui')), { spendView: 'day', recurOpen: true });
  c.budUiSave({ spendView: 'cat' });
  assert.deepEqual(JSON.parse(c.__store.get('daily_budget_ui')), { spendView: 'cat', recurOpen: true },
    'changing the breakdown must not close the recurring list');
});

test('both preferences are read back, and a fresh device gets the closed/category defaults', () => {
  const seeded = uiCtx('{"spendView":"day","recurOpen":true}');
  assert.equal(seeded.budSpendView(), 'day');
  assert.equal(seeded.budRecurOpen(), true);

  const fresh = uiCtx();
  assert.equal(fresh.budSpendView(), 'cat');
  assert.equal(fresh.budRecurOpen(), false);
  assert.equal(fresh.__store.has('daily_budget_ui'), false,
    'reading a preference must never write one — this runs during a render');
});

test('a corrupt or unexpected blob falls back instead of throwing', () => {
  for (const bad of ['not json', 'null', '[]', '"str"', '7']) {
    const c = uiCtx(bad);
    // Object.keys rather than deepEqual({}): the object is built inside the VM and carries
    // that realm's prototype, which assert/strict compares.
    assert.equal(Object.keys(c.budUiLoad()).length, 0, bad);
    assert.equal(c.budSpendView(), 'cat', bad);
    assert.equal(c.budRecurOpen(), false, bad);
  }
});
