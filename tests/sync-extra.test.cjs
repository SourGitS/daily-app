// Regression cover for the write paths that were still whole-node after the first pass:
// the savings log, budget weeks, budget config, node seeding, listener lifetime and the
// onboarding gate's failure branch. Same approach as sync-safety.test.cjs — the real helpers
// are extracted from js/app.js and run against a cloud mock whose unconditional .set() throws.
const test = require('node:test');
const assert = require('node:assert/strict');
const { app, Cloud, Store } = require('./harness.cjs');

test('savings entries are written per date, never as a whole collection', async () => {
  const cloud = new Cloud({ users: { u: { savingsLog: { 20260901: { date: '2026-09-01', balance: 100, t: 500 } } } } });
  const a = app(cloud);
  a.savingsLog = [{ date: '2026-09-01', balance: 100, t: 500 }, { date: '2026-09-07', balance: 250, t: 900 }];
  await a.pushSavings();
  await cloud.settle();
  assert.deepEqual(Object.keys(cloud.get('users/u/savingsLog')).sort(), ['20260901', '20260907']);
  assert.equal(cloud.get('users/u/savingsLog/20260907').balance, 250);
  // every write addressed one child, so an entry this device never saw cannot be dropped
  assert.ok(cloud.writes.every(w => w.path.split('/').length === 4));
});

test('a stale savings copy cannot undo a newer entry', async () => {
  const cloud = new Cloud({ users: { u: { savingsLog: { 20260901: { date: '2026-09-01', balance: 999, t: 900 } } } } });
  const a = app(cloud);
  a.savingsLog = [{ date: '2026-09-01', balance: 100, t: 100 }];
  await a.pushSavings();
  await cloud.settle();
  assert.equal(cloud.get('users/u/savingsLog/20260901').balance, 999);
  assert.equal(cloud.writes.length, 0);
});

test('an entry added elsewhere survives a stale device converging the savings log', async () => {
  const cloud = new Cloud({ users: { u: { savingsLog: { 20260908: { date: '2026-09-08', balance: 400, t: 950 } } } } });
  const a = app(cloud);
  a.savingsLog = [{ date: '2026-09-01', balance: 100, t: 100 }];
  await a.pushSavings();
  await cloud.settle();
  assert.equal(cloud.get('users/u/savingsLog/20260908').balance, 400);
  assert.equal(cloud.get('users/u/savingsLog/20260901').balance, 100);
});

test('budget weeks are written one week at a time', async () => {
  const cloud = new Cloud();
  const a = app(cloud);
  a.budgetData = { '2026-09-01': { wk: '2026-09-01', updatedAt: 10 }, '2026-09-08': { wk: '2026-09-08', updatedAt: 20 } };
  await a.syncBudgetDataToFirebase();
  await cloud.settle();
  assert.deepEqual(Object.keys(cloud.get('users/u/budgetData')).sort(), ['2026-09-01', '2026-09-08']);
  assert.ok(cloud.writes.every(w => w.path.split('/').length === 4));
});

test('a stale budget week cannot overwrite a newer cloud week, and unrelated weeks survive', async () => {
  const cloud = new Cloud({ users: { u: { budgetData: {
    '2026-09-01': { wk: '2026-09-01', income: 'newer', updatedAt: 900 },
    '2026-08-25': { wk: '2026-08-25', income: 'only in cloud', updatedAt: 400 }
  } } } });
  const a = app(cloud);
  a.budgetData = { '2026-09-01': { wk: '2026-09-01', income: 'stale', updatedAt: 100 } };
  await a.syncBudgetDataToFirebase();
  await cloud.settle();
  assert.equal(cloud.get('users/u/budgetData/2026-09-01').income, 'newer');
  assert.equal(cloud.get('users/u/budgetData/2026-08-25').income, 'only in cloud');
});

test('mergeBudgetWeeks names the weeks the cloud is behind on', () => {
  const a = app();
  const out = a.mergeBudgetWeeks(
    { w1: { updatedAt: 900 }, w2: { updatedAt: 10 }, w3: { updatedAt: 5 } },
    { w1: { updatedAt: 100 }, w2: { updatedAt: 500 } });
  // spread into a host array: a value built inside the VM realm is never reference-equal
  assert.deepEqual([...out.cloudNeedsKeys].sort(), ['w1', 'w3']);
  assert.equal(out.cloudNeedsUpdate, true);
});

test('budget config converges by age inside the transaction', async () => {
  const cloud = new Cloud({ users: { u: { budgetConfig: { incomeStreams: ['cloud'], updatedAt: 900 } } } });
  const a = app(cloud);
  await a.budPushConfig(cloud.ref('users/u/budgetConfig'), { incomeStreams: ['stale'], updatedAt: 100 });
  await cloud.settle();
  assert.deepEqual(cloud.get('users/u/budgetConfig').incomeStreams, ['cloud']);
  await a.budPushConfig(cloud.ref('users/u/budgetConfig'), { incomeStreams: ['newer'], updatedAt: 1500 });
  await cloud.settle();
  assert.deepEqual(cloud.get('users/u/budgetConfig').incomeStreams, ['newer']);
});

test('saving budget config during boot keeps its age and uploads nothing', async () => {
  const cloud = new Cloud();
  const a = app(cloud);
  a._bootPhase = true;
  a.budgetConfig = { incomeStreams: [], fixedExpenses: [], variableExpenses: [], updatedAt: 700 };
  a.saveBudgetConfig({ incomeStreams: ['migrated'], fixedExpenses: [], variableExpenses: [], updatedAt: 700 });
  await cloud.settle();
  assert.equal(a.budgetConfig.updatedAt, 700);
  assert.equal(cloud.writes.length, 0);
});

test('a real budget config edit stamps and uploads', async () => {
  const cloud = new Cloud();
  const a = app(cloud);
  a.budgetConfig = { incomeStreams: [], fixedExpenses: [], variableExpenses: [], updatedAt: 0 };
  a.saveBudgetConfig({ incomeStreams: ['edited'], fixedExpenses: [], variableExpenses: [] });
  await cloud.settle();
  assert.ok(a.budgetConfig.updatedAt > 0);
  assert.deepEqual(cloud.get('users/u/budgetConfig').incomeStreams, ['edited']);
});

test('seeding an empty node cannot overwrite a value written in the gap', async () => {
  const cloud = new Cloud();
  const a = app(cloud);
  const ref = cloud.ref('users/u/habits');
  // The caller read an empty node; another device writes before this commit lands.
  cloud.put('users/u/habits', ['written by the other device']);
  await a.fbSeedIfEmpty(ref, ['this device']);
  await cloud.settle();
  assert.deepEqual(cloud.get('users/u/habits'), ['written by the other device']);
  assert.equal(cloud.writes.length, 0);
});

test('seeding a genuinely empty node still writes', async () => {
  const cloud = new Cloud();
  const a = app(cloud);
  await a.fbSeedIfEmpty(cloud.ref('users/u/habits'), ['first']);
  await cloud.settle();
  assert.deepEqual(cloud.get('users/u/habits'), ['first']);
});

test('every tracked listener is released when the account changes', () => {
  const a = app();
  const off = [];
  a.syncTrack({ off: () => off.push('a') });
  a.syncTrack({ off: () => off.push('b') });
  a.syncTrack(undefined);            // helpers that return nothing must not throw
  a.syncTrack({ off: () => { throw new Error('already detached'); } });
  a.syncDetachAll();
  assert.deepEqual(off, ['a', 'b']);
  assert.equal(a._syncRefs.length, 0);
  a.syncDetachAll();                 // idempotent
});

test('a cloud-apply block cannot stamp or upload a fresh edit', async () => {
  const cloud = new Cloud({ users: { u: { trainingSplit: { v: 'cloud program', t: 900 } } } });
  const a = app(cloud);
  a.localStorage.setItem('wt_split', 'cloud program');
  a.localStorage.setItem('wt_split_ts', '900');
  a.syncApply(() => a.lsSave('wt_split', 'cloud program', 'trainingSplit'));
  await cloud.settle();
  assert.equal(a.localStorage.getItem('wt_split_ts'), '900');
  assert.equal(cloud.writes.length, 0);
});

test('onboarding asks instead of blocking forever when the cloud read failed', () => {
  const a = app();
  let message = '', asked = 0;
  a.showToast = s => { message = s; };
  a.confirm = () => { asked++; return false; };
  a._cloudReadFailed = true;
  a.finishOnboarding();
  assert.equal(asked, 1, 'a failed read must offer a choice');
  assert.equal(message, '', 'and must not simply repeat "still loading"');
});

test('onboarding still waits while the read is merely slow', () => {
  const a = app();
  let message = '', asked = 0;
  a.showToast = s => { message = s; };
  a.confirm = () => { asked++; return true; };
  a.finishOnboarding();
  assert.match(message, /still loading/);
  assert.equal(asked, 0);
});
