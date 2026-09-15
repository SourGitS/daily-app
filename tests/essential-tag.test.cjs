// The optional "Essential / need" label on an expense, exercised against the real helpers in
// an isolated VM — no browser, no storage, no account. What these protect is that the tag is a
// LABEL: it is written only when it is true, an expense recorded before it existed reads as
// untagged, and its totals are reported beside the expenses they come from without ever being
// folded into a week's variable total, goal or leftover.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { extract, copy } = require('./harness.cjs');

function fixture(txns = []) {
  const ctx = vm.createContext({
    console, Date, Math,
    txnData: copy(txns),
    fmtMoneyExact: n => '$' + n.toFixed(2),
    escText: s => String(s)
  });
  vm.runInContext(['localMidnight', 'dateStr', 'txnsForWeek', 'genTxnId', 'txnCreateRecord',
    'txnIsEssential', 'budEssentialSummary', 'weekEssentialSummary', 'monthEssentialSummary',
    'budEssentialLineHtml'].map(extract).join('\n'), ctx);
  return ctx;
}
const txn = (date, amount, extra = {}) => ({ id: date + '-' + amount, date, amount, catId: 'food', ...extra });

test('only an explicit true counts as tagged, so historic and odd values read as untagged', () => {
  const ctx = fixture();
  assert.equal(ctx.txnIsEssential({ amount: 10 }), false, 'an expense saved before the tag existed');
  assert.equal(ctx.txnIsEssential({ essential: true }), true);
  assert.equal(ctx.txnIsEssential({ essential: false }), false);
  assert.equal(ctx.txnIsEssential({ essential: 'yes' }), false, 'a truthy non-true value is not a tag');
  assert.equal(ctx.txnIsEssential({ essential: 1 }), false);
  assert.equal(ctx.txnIsEssential(null), false);
  assert.equal(ctx.txnIsEssential(undefined), false);
});

test('the summary totals the tagged expenses and states the logged spending it came out of', () => {
  const ctx = fixture();
  const summary = ctx.budEssentialSummary([
    txn('2026-09-07', 40.5, { essential: true }),
    txn('2026-09-08', 12.25),
    txn('2026-09-09', '9.50', { essential: true }),
    txn('2026-09-10', 'not a number', { essential: true })
  ]);
  assert.equal(summary.total, 50, 'a string amount still counts; an unparseable one contributes zero');
  assert.equal(summary.logged, 62.25);
  assert.equal(summary.count, 3);
  assert.equal(summary.entries, 4);
  assert.deepEqual(copy(ctx.budEssentialSummary([])), { total: 0, logged: 0, count: 0, entries: 0 });
  assert.deepEqual(copy(ctx.budEssentialSummary(null)), { total: 0, logged: 0, count: 0, entries: 0 });
});

test('week and month totals cover exactly the dates their own periods cover', () => {
  const ctx = fixture([
    txn('2026-08-30', 100, { essential: true }),           // the Sunday BEFORE the week
    txn('2026-08-31', 25, { essential: true }),            // Monday
    txn('2026-09-06', 15, { essential: true }),            // Sunday
    txn('2026-09-07', 60, { essential: true }),            // the next week
    txn('2026-09-02', 40)                                  // inside the week, untagged
  ]);
  const week = ctx.weekEssentialSummary('2026-08-31');
  assert.equal(week.total, 40, 'Monday to Sunday inclusive, and nothing either side of it');
  assert.equal(week.count, 2);
  assert.equal(week.entries, 3);
  assert.equal(week.logged, 80);
  const month = ctx.monthEssentialSummary(['2026-08-31', '2026-09-07']);
  assert.equal(month.total, 100, 'two weeks, each counted once');
  assert.equal(month.count, 3);
  assert.equal(ctx.monthEssentialSummary([]).total, 0);
});

test('a decimal week total does not accumulate floating-point noise', () => {
  const ctx = fixture([txn('2026-09-07', 0.1, { essential: true }), txn('2026-09-08', 0.2, { essential: true })]);
  assert.equal(ctx.weekEssentialSummary('2026-09-07').total, 0.3);
});

test('the line is drawn only once something is tagged, and never claims a share of the week', () => {
  const ctx = fixture();
  assert.equal(ctx.budEssentialLineHtml(ctx.budEssentialSummary([txn('2026-09-07', 30)]), 'this week'), '',
    'a week with expenses but no tag shows nothing rather than a $0 row');
  assert.equal(ctx.budEssentialLineHtml(null, 'this week'), '');
  const html = ctx.budEssentialLineHtml(ctx.budEssentialSummary([
    txn('2026-09-07', 30, { essential: true }), txn('2026-09-08', 70)
  ]), 'this week');
  assert.match(html, /Essential \/ need/);
  assert.match(html, /\$30\.00/);
  assert.match(html, /1 of 2 logged expenses this week/);
  assert.match(html, /30% of \$100\.00 logged/, 'the share is of logged expenses, not of the weekly total');
  assert.ok(!/goal|left|remaining|budget/i.test(html), 'the tag reports a total and judges nothing');
});

test('the tag is stored only when it is true, so an untagged record keeps its original shape', () => {
  const ctx = fixture();
  const plain = ctx.txnCreateRecord({ date: '2026-09-07', catId: 'food', amount: 12 });
  assert.equal('essential' in plain, false, 'no false is written for an ordinary expense');
  assert.deepEqual(Object.keys(plain).sort(),
    ['acctId', 'amount', 'catId', 'createdAt', 'date', 'id', 'merchant', 'note'].sort());
  const off = ctx.txnCreateRecord({ date: '2026-09-07', catId: 'food', amount: 12, essential: false });
  assert.equal('essential' in off, false);
  const notTrue = ctx.txnCreateRecord({ date: '2026-09-07', catId: 'food', amount: 12, essential: 'yes' });
  assert.equal('essential' in notTrue, false, 'an imported value that is not literally true cannot tag an expense');
  const tagged = ctx.txnCreateRecord({ date: '2026-09-07', catId: 'food', amount: 12, essential: true });
  assert.equal(tagged.essential, true);
  assert.equal(ctx.txnData.length, 4, 'every record still goes through the one writer');
});

// ── The tag changes nothing else ──────────────────────────────────
// A label that quietly entered a money reader would be a second budget system, which is the one
// thing this feature must not become. These read the real source of the canonical readers.
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

test('no canonical money reader knows the tag exists', () => {
  ['budAvailable', 'budWeekMoney', 'weekIncome', 'weekFixedTotal', 'weekVarTotal', 'weekSavedAmt',
   'weekLeftover', 'varCatAmount', 'statsWeekParts', 'monthVariableTotal', 'budRecalc',
   'payCycleForecast', 'billOccurrences', 'accountsNetWorth'].forEach(name => {
    assert.ok(!/essential/i.test(extract(name)), name + ' must not read the Essential / need tag');
  });
});

test('the tag introduces no store, no sync path and no boot-time write', () => {
  ['txnIsEssential', 'budEssentialSummary', 'weekEssentialSummary', 'monthEssentialSummary',
   'budEssentialLineHtml'].forEach(name => {
    const fn = extract(name);
    [/localStorage/, /lsSave/, /SYNC_BLOB_REG/, /firebase/, /Date\.now/, /_bootPhase/,
     /schemaVersion/, /saveTxns/].forEach(re =>
      assert.ok(!re.test(fn), name + ' must not contain ' + re));
  });
  // It rides inside daily_transactions, which is already a registered, timestamped store.
  assert.match(extract('saveTxns'), /lsSave\('daily_transactions', txnData, 'transactions'\)/);
  assert.ok(!/daily_essential|essential_ts|'essentials'/.test(source), 'no second store was created');
});

test('every ordinary create-and-edit path carries the tag', () => {
  // The one modal, reached by Home capture, both Finance heroes, the per-category add and by
  // tapping any listed expense — plus the import, which is the other way an expense is written.
  assert.match(extract('txnReadForm'), /txn-essential/);
  assert.match(extract('openTxnModal'), /txn-essential/);
  assert.match(extract('txnCreateRecord'), /f\.essential===true/);
  assert.match(extract('txnCommitSave'), /delete t\.essential/, 'unticking an edited expense clears the field');
  assert.match(extract('aiValExpense'), /d\.essential===true/);
  assert.match(extract('aiValUpdateExpense'), /setEssential/);
  // And it travels with the expense wherever an expense is already reported.
  assert.match(extract('aiTransactionsScope'), /txnIsEssential\(t\)/);
  // exportBudgetCSV is too large for harness.extract()'s brace scanner, so this reads the
  // column it emits directly out of the source.
  assert.ok(source.includes("const needHdr=anyEssential?['Essential / Need']:[];"),
    'the budget CSV gains an Essential / Need column once the tag is in use');
});

test('both the week and the month summaries report it, from the same helper', () => {
  assert.match(extract('renderSpendCard'), /budEssentialLineHtml\(weekEssentialSummary\(wk\),'this week'\)/);
  assert.match(extract('renderMonthSpendBreakdown'), /budEssentialLineHtml\(monthEssentialSummary\(keys\),'this month'\)/);
});
