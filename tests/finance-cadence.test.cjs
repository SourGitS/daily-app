const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { extract, extractConst, Store, Cloud, app } = require('./harness.cjs');

function fixture(seed = {}) {
  const a = vm.createContext({ localStorage: new Store(seed), budgetData: {}, budDefaults: {},
    Date, console, document: { querySelector: () => null }, CSS: { escape: s => s },
    _budgetSetupOpen: new Set(), refreshCatBudgetUI: () => {}, getLocalDate: () => '2026-10-04' });
  vm.runInContext(['CAT_CYCLES', 'CAT_CHARGE_TYPES', 'INC_PAY_CYCLES'].map(extractConst).join('\n') +
    ['lsLoad', 'loadBudgetConfig', 'budLegacyCats', 'budCategoryTypes', 'loadFixCats', 'loadIncCats', 'loadVarCats', 'getPayDay',
      'cyclePerWeek', 'catWeeklyFromAmount', 'catBudget', 'catAmount', 'catCycle', 'catChargeType',
      'catIsRecurring', 'catStatus', 'catIsCharging', 'catIsArchived', 'catChargeableBudget',
      'dateStr', 'localMidnight', '_billMonthlyOn', '_billYearlyOn', 'catNextDue', 'catOccurrencesBetween',
      'incomePayCycle', 'incomeNextPay', 'incomePayHint', 'incomePayDateHint', 'nextPayInfo', 'catUpdateField', 'weekFixedTotal',
      'budSaveConfig', 'setPayDay', 'setHourlyRate', 'catArchive', 'catRemoveItem',
      'migrateSubscriptionsToFixedOnce'].map(extract).join('\n'), a);
  a.activeCats = rows => rows.filter(c => !c.archived);
  a.guessCatSite = () => '';
  a.saveFixCats = cats => a.localStorage.setItem('daily_budget_fix_cats', JSON.stringify(cats));
  a.BUD_CAT_LOAD = { fix: a.loadFixCats, inc: a.loadIncCats };
  a.BUD_CAT_SAVE = { fix: a.saveFixCats };
  a.saveIncCats = cats => a.localStorage.setItem('daily_budget_inc_cats', JSON.stringify(cats));
  a.saveVarCats = cats => a.localStorage.setItem('daily_budget_var_cats', JSON.stringify(cats));
  return a;
}

test('a fresh Finance setup contains no personal sources, charges or amounts and writes nothing', () => {
  const a = fixture();
  assert.equal(JSON.stringify(a.loadBudgetConfig()), '{"incomeStreams":[],"fixedExpenses":[],"variableExpenses":[]}');
  assert.equal(a.loadFixCats().length, 0);
  assert.equal(a.loadIncCats().length, 0);
  assert.equal(a.nextPayInfo(), null);
  assert.equal(a.localStorage.data.size, 0);
});

test('stored categories and legacy weekly ids survive the removal of personal defaults', () => {
  const a = fixture();
  a.budgetData = { '2026-09-07': { inc_fuji: '800', fix_gym: '27' } };
  a.budDefaults = { gym: 29 };
  assert.equal(a.loadIncCats()[0].id, 'fuji');
  assert.equal(a.loadFixCats()[0].id, 'gym');
  assert.equal(a.catBudget(a.loadFixCats()[0]), 29);
  const saved = [{ id: 'mine', name: 'My membership', amount: 167.8, cycle: 'monthly', budget: 22 }];
  a.localStorage.setItem('daily_budget_fix_cats', JSON.stringify(saved));
  assert.equal(JSON.stringify(a.loadFixCats()), JSON.stringify(saved));
});

test('$167.80/month gives $38.72/week even when a stale weekly cache says $22', () => {
  const a = fixture();
  const c = { id: 'bill', amount: 167.8, cycle: 'monthly', budget: 22 };
  assert.equal(a.catWeeklyFromAmount(167.8, 'monthly'), 38.72);
  assert.equal(a.catBudget(c), 38.72);
  a.loadFixCats = () => [c];
  assert.equal(a.weekFixedTotal({}), 38.72);
  assert.equal(a.weekFixedTotal({ fixRates: { bill: 22 } }), 22, 'frozen history stays at the recorded rate');
  assert.equal(c.budget, 22, 'a read does not rewrite stored data');
});

test('fortnightly bills accrue half per week and land every 14 calendar days across DST', () => {
  const a = fixture();
  const c = { amount: 167.8, cycle: 'fortnightly', dueDate: '2026-09-27' };
  assert.equal(a.catBudget(c), 83.9);
  const dates = a.catOccurrencesBetween(c, a.localMidnight('2026-10-01'), a.localMidnight('2026-11-01'));
  assert.deepEqual(Array.from(dates, a.dateStr), ['2026-10-11', '2026-10-25']);
  assert.equal(a.dateStr(a.catNextDue(c, '2026-10-04')), '2026-10-11');
  assert.equal(a.dateStr(a.catNextDue(c, '2026-10-12')), '2026-10-25');
});

test('editing a bill amount, clearing it and switching cycles retain the billed amount', () => {
  const a = fixture({ daily_budget_fix_cats: JSON.stringify([{ id: 'bill', amount: 167.8, cycle: 'monthly', budget: 22 }]) });
  a.catUpdateField('fix', 'bill', 'cycle', 'fortnightly');
  assert.equal(a.loadFixCats()[0].amount, 167.8);
  assert.equal(a.catBudget(a.loadFixCats()[0]), 83.9);
  a.catUpdateField('fix', 'bill', 'amount', '200');
  assert.equal(a.catBudget(a.loadFixCats()[0]), 100);
  a.catUpdateField('fix', 'bill', 'amount', '');
  assert.equal(a.catAmount(a.loadFixCats()[0]), '');
  assert.equal(a.catBudget(a.loadFixCats()[0]), 0);
  a.catUpdateField('fix', 'bill', 'cycle', 'monthly');
  assert.equal(a.catAmount(a.loadFixCats()[0]), '');
});

test('switching a legacy weekly bill between cycles never converts an already converted figure', () => {
  const a = fixture({ daily_budget_fix_cats: JSON.stringify([{ id: 'bill', budget: 100 }]) });
  a.catUpdateField('fix', 'bill', 'cycle', 'monthly');
  a.catUpdateField('fix', 'bill', 'cycle', 'yearly');
  assert.equal(a.loadFixCats()[0].amount, 100);
  assert.equal(a.catBudget(a.loadFixCats()[0]), 1.92);
});

test('billing metadata retained after a move does not change an income or spending target', () => {
  const saved = [{ id: 'moved', amount: 167.8, cycle: 'monthly', budget: 100 }];
  const a = fixture({ daily_budget_inc_cats: JSON.stringify(saved), daily_budget_var_cats: JSON.stringify(saved) });
  assert.equal(a.catBudget(a.loadIncCats()[0]), 100);
  assert.equal(a.catBudget(a.loadVarCats()[0]), 100);
  assert.equal(JSON.stringify(a.loadIncCats()), JSON.stringify(saved), 'read-time tags are never serialized');
});

test('legacy subscription imports preserve cadence and convert a monthly equivalent back to billed amount', () => {
  const a = fixture({ daily_subscriptions: JSON.stringify([
    { name: 'Yearly bill', cycle: 'yearly', monthlyCost: 10 },
    { name: 'Fortnightly bill', cycle: 'fortnightly', originalCost: 100 }
  ]) });
  a.migrateSubscriptionsToFixedOnce();
  const cats = a.loadFixCats();
  assert.equal(cats[0].amount, 120);
  assert.equal(a.catBudget(cats[0]), 2.31);
  assert.equal(cats[1].cycle, 'fortnightly');
  assert.equal(a.catBudget(cats[1]), 50);
});

test('income dates follow their actual fortnightly and month-end schedules without recording deposits', () => {
  const a = fixture();
  const c = { id: 'salary', name: 'Salary', payCycle: 'fortnightly', payDate: '2026-10-02', payAmount: 2000 };
  a.loadIncCats = () => [c];
  assert.equal(a.dateStr(a.incomeNextPay(c)), '2026-10-16');
  assert.equal(a.nextPayInfo().inDays, 12);
  assert.equal(a.nextPayInfo().name, 'Salary');
  assert.equal(a.dateStr(a.incomeNextPay({ ...c, payCycle: 'monthly', payDate: '2026-01-31' }, '2027-02-01')), '2027-02-28');
  assert.equal(Object.keys(a.budgetData).length, 0);
  assert.equal(a.localStorage.data.size, 0);
});

test('unconfigured and irregular income have no invented payday; legacy weekly choices remain usable', () => {
  const a = fixture();
  assert.equal(a.incomeNextPay({ id: 'new', name: 'New' }), null);
  assert.equal(a.incomeNextPay({ id: 'odd', payCycle: 'irregular', payDate: '2026-10-05' }), null);
  assert.equal(a.incomeNextPay({ payCycle: 'monthly', payDate: '2026-02-31' }), null);
  a.budDefaults.payDays = { weekly: 2 };
  assert.equal(a.dateStr(a.incomeNextPay({ id: 'weekly' })), '2026-10-06');
  a.budDefaults.payDays.fuji = null;
  assert.equal(a.incomeNextPay({ id: 'fuji' }), null, 'clearing a legacy weekday must not reinstate its fallback');
});

test('payday forecast uses the next cycle after today and ignores archived sources', () => {
  const a = fixture();
  a.loadIncCats = () => [{ id: 'pay', name: 'Salary', payCycle: 'fortnightly', payDate: '2026-10-04' },
    { id: 'old', name: 'Old', archived: true, payDate: '2026-10-05' }];
  assert.equal(a.nextPayInfo().inDays, 14);
});

test('saving income setup keeps pay amount and dates in the existing category store without creating income', () => {
  const a = fixture({ daily_budget_inc_cats: JSON.stringify([{ id: 'salary', name: 'Salary', payCycle: 'fortnightly', payDate: '2026-10-02', payAmount: 2000 }]) });
  const elements = {
    'bud-paycycle-salary': { value: 'fortnightly' }, 'bud-paydate-salary': { value: '2026-10-02' },
    'bud-payamount-salary': { value: '2400' }, 'bud-payhint-salary': { textContent: '' },
    'bud-paynext-salary': { textContent: '' }
  };
  a.document = { getElementById: id => elements[id] || null, activeElement: elements['bud-payamount-salary'] };
  a.fmtMoneyExact = n => '$' + n;
  a.fmtDate = s => s;
  a.syncBudDefaultsToFirebase = () => {};
  a.renderBudgetConfig = () => { throw new Error('amount edits must preserve the inputs'); };
  a.budSaveConfig();
  const saved = a.loadIncCats()[0];
  assert.equal(saved.payCycle, 'fortnightly');
  assert.equal(saved.payDate, '2026-10-02');
  assert.equal(saved.payAmount, 2400);
  assert.match(elements['bud-payhint-salary'].textContent, /\$1200\/week/);
  assert.equal(Object.keys(a.budgetData).length, 0);
  elements['bud-payamount-salary'].value = '';
  a.budSaveConfig();
  assert.equal(a.loadIncCats()[0].payAmount, '');
  assert.doesNotMatch(elements['bud-payhint-salary'].textContent, /\$1200/);
});

test('the last seeded bill can be archived or removed, and recorded history is retained', () => {
  const a = fixture({ daily_budget_fix_cats: JSON.stringify([{ id: 'only', name: 'Membership', budget: 27 }]) });
  a.budgetData = { old: { fix_only: '27', fixRates: { only: 27 } } };
  a.catArchive('fix', 'only', true);
  assert.equal(a.loadFixCats()[0].archived, true);
  assert.equal(a.weekFixedTotal(a.budgetData.old), 27);
  a.budCountStrandedFor = () => ({ weeks: 1, total: 27 });
  a.fmtMoney = n => '$' + n;
  a.confirm = () => true;
  a.catRemoveItem('fix', 'only');
  assert.equal(a.loadFixCats().length, 0);
  assert.equal(a.budgetData.old.fix_only, '27');
});

test('fresh-profile sign-in restores existing Finance blobs without uploading defaults or losing schedule fields', async () => {
  const data = [{ id: 'salary', name: 'Salary', payCycle: 'fortnightly', payDate: '2026-10-02', payAmount: 2000 }];
  const bills = [{ id: 'rent', name: 'Rent', cycle: 'fortnightly', amount: 500, budget: 250 }];
  const cloud = new Cloud({ users: { u: { budgetIncCats: { v: JSON.stringify(data), t: 800 },
    budgetFixCats: { v: JSON.stringify(bills), t: 900 } } } });
  const a = app(cloud);
  a.syncBlobListen('u', 'budgetIncCats', 'daily_budget_inc_cats');
  a.syncBlobListen('u', 'budgetFixCats', 'daily_budget_fix_cats');
  cloud.emit('users/u/budgetIncCats'); cloud.emit('users/u/budgetFixCats');
  await cloud.settle();
  assert.equal(a.localStorage.getItem('daily_budget_inc_cats'), JSON.stringify(data));
  assert.equal(a.localStorage.getItem('daily_budget_fix_cats'), JSON.stringify(bills));
  assert.equal(cloud.writes.length, 0);
});
