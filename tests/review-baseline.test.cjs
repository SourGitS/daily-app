// Weekly Review's start boundary is deliberately pure on read: older plans acquire a
// current-week boundary in memory, and only an explicit plan save persists it.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { extract } = require('./harness.cjs');

const day = d => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');

function reviewApp(plan, budgetData, reviews) {
  const today = new Date(2026, 8, 16); // Wednesday; the current review week starts 14 Sept.
  const ctx = vm.createContext({
    WKR_SCHEMA: 1,
    WKR_TEMPLATE: { name: 'Weekly plan' },
    WKR_GROUPS: [
      { id: 'fixedBills', kind: 'fixed' }, { id: 'transport', kind: 'variable' },
      { id: 'foodGroceries', kind: 'variable' }, { id: 'socialPersonalGambling', kind: 'variable' },
      { id: 'other', kind: 'rest' }
    ],
    wkrNum: (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : (fallback || 0),
    wkrStr: v => typeof v === 'string' ? v : '',
    wkrIds: v => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x) : [],
    aiIsDate: v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v),
    localMidnight: v => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); },
    weekKey: day,
    getMondayOf: offset => {
      const date = new Date(today); const diff = (date.getDay() + 6) % 7;
      date.setDate(date.getDate() - diff + (offset || 0) * 7); return date;
    },
    budgetData: budgetData || {},
    wkrReviews: reviews || {},
    wkrUI: { week: null },
    renderStatsReview: () => {}
  });
  const names = ['wkrNormaliseStartWeek', 'wkrNormalisePlan', 'statsCompletedWeeks', 'wkrReview',
    'wkrReviewableWeeks', 'wkrPlanStartWeek', 'wkrVisibleWeeks', 'wkrPendingWeek', 'wkrCurrentWeek'];
  vm.runInContext(names.map(extract).join('\n'), ctx);
  ctx.wkrPlan = ctx.wkrNormalisePlan(plan || {});
  return ctx;
}

test('an older plan starts from the current week without writing a historical backlog', () => {
  const a = reviewApp({ enabled: true }, { '2026-08-31': { saved: true } });
  assert.equal(a.wkrPlan.reviewStartWeek, '2026-09-14');
  assert.equal(a.wkrPendingWeek(), null);
  assert.equal(a.wkrCurrentWeek(), '2026-09-14');
});

test('only completed weeks on or after the chosen start week can become outstanding', () => {
  const a = reviewApp({ enabled: true, reviewStartWeek: '2026-09-07' }, {
    '2026-08-03': { saved: true }, '2026-08-31': { saved: true }, '2026-09-07': { saved: true }
  });
  assert.equal(a.wkrPendingWeek(), '2026-09-07');
});

test('saved older reviews remain selectable while unreviewed older Budget history stays hidden', () => {
  const a = reviewApp({ enabled: true, reviewStartWeek: '2026-09-14' }, {
    '2026-08-03': { saved: true }, '2026-08-31': { saved: true }
  }, { '2026-08-31': { status: 'completed' } });
  assert.deepEqual([...a.wkrVisibleWeeks()], ['2026-09-14', '2026-08-31']);
});
