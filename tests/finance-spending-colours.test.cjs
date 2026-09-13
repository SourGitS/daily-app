// Exercise the real scoped palette and renderers without a browser, storage or account.
// Capturing chart configurations protects the financial series while their paint changes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { extract, copy } = require('./harness.cjs');

const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const keys = ['2026-08-03', '2026-08-10', '2026-08-17'];
const records = {
  [keys[0]]: { income: 1200, variable: 210, fixed: 400, saved: 150, statsSnapshot: { totalTarget: 800 } },
  [keys[1]]: { income: null, variable: 30, fixed: 300, saved: 0 },
  [keys[2]]: { income: 900, variable: 500, fixed: 350, saved: 100, statsSnapshot: { totalTarget: 700 } }
};

function fixture(theme = 'light', accent = '#5c5c5c') {
  const nodes = new Map(['month-label-main', 'month-next-btn', 'month-label-sub',
    'month-bar', 'month-bar-label-l', 'month-bar-label-r', 'month-weeks-list',
    'month-weeks-chart', 'bs-trend-wrap-card', 'bs-trend-chart']
    .map(id => [id, { style: {}, innerHTML: '', textContent: '' }]));
  const charts = [];
  const opened = [];
  const ctx = vm.createContext({
    S: { theme }, accent, nodes, charts, opened, console,
    currentAccentHex: () => ctx.accent,
    accentTextHex: hex => hex,
    document: { getElementById: id => nodes.get(id) || null },
    Chart: function(canvas, config) { charts.push({ canvas, config }); this.destroy = () => {}; },
    budgetData: copy(records), monthWeekChart: null, bsChart: null, currentMonthOffset: -1,
    getMonthDate: () => new Date('2026-08-01T12:00:00'),
    fmtMonthLabel: () => 'August 2026', getMondaysInMonth: () => keys,
    weekIncome: d => d?.income || 0,
    weekSavedAmt: d => d?.saved || 0,
    weekSpending: d => (d?.fixed || 0) + (d?.variable || 0),
    weekVarTotal: d => d?.variable || 0, weekFixed: d => d?.fixed || 0,
    cardHeader: () => 'Money flow', statsChip: () => '', bsFinRangeLabel: () => 'Three weeks',
    bsFinRangeKeys: () => keys,
    statsWeekParts: d => ({ fixed: d.fixed, variable: d.variable, total: d.fixed + d.variable }),
    statsWeekIncomeKnown: d => d.income !== null,
    statsWeekSpendQuality: () => ({ ambiguousLegacyVariable: false }),
    bsFinSummary: () => ({ incomeWeeks: 2 }),
    fmtMoney: n => '$' + n, fmtMoneyExact: n => '$' + n.toFixed(2), fmtDate: s => s,
    closeStatsEvidence: () => {}, openBudgetWeekFromStats: key => opened.push(key),
    _catEsc: s => s, _catEscHtml: s => s, escAttr: s => s,
    _monthSpendSelected: '',
    monthSpendComparison: () => ({ direction: 'more', text: '$10 more than July 2026' })
  });
  const money = source.match(/const BUD_MONEY=\{[\s\S]*?\n\};/);
  assert.ok(money, 'existing shared money palette must remain available');
  const names = ['hexToRgb', '_hslToHex', 'budIsDark', 'budIncomeHex', 'budExpenseHex',
    'budIncomeRgba', 'budExpenseRgba', 'budAccentHex', 'budPalette', 'budNeutralSpendPalette',
    'budRankShade', 'budChartLegend', 'budChartGridColors', 'renderMonth', 'renderBSTrend',
    'renderMonthSpendBreakdown'];
  vm.runInContext(money[0] + '\n' + names.map(extract).join('\n') +
    '\nconst BUD_CHART_COLORS=new Proxy({},{get:(t,k)=>budPalette()[k]});', ctx);
  return ctx;
}

function rgba(value) {
  if (/^#[\da-f]{6}$/i.test(value)) {
    return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16)).concat(1);
  }
  const match = value.match(/^rgba?\(([^)]+)\)$/);
  assert.ok(match, 'expected a resolved colour: ' + value);
  const channels = match[1].split(',').map(Number);
  return channels.length === 3 ? channels.concat(1) : channels;
}
function assertGrey(value) {
  const channels = rgba(value);
  assert.equal(channels[0], channels[1], value + ' must be neutral');
  assert.equal(channels[1], channels[2], value + ' must be neutral');
  return channels;
}
function assertLegend(markup, label, fill, edge) {
  const fragment = markup.split(label)[0].split('<span class="chart-legend-pill">').at(-1);
  assert.ok(markup.includes(label), 'legend label: ' + label);
  assert.ok(fragment.includes('background:' + fill), label + ' legend must match its bar');
  if (edge) assert.ok(fragment.includes('solid ' + edge), label + ' legend must match its outline');
}
function assertSpending(dataset, palette, committed) {
  assert.equal(dataset.backgroundColor, committed ? palette.fixed : palette.variable);
  assert.equal(dataset.hoverBackgroundColor, committed ? palette.fixedHover : palette.variableHover);
  if (committed) {
    assert.equal(dataset.borderColor, palette.fixedEdge);
    assert.equal(dataset.hoverBorderColor, palette.fixedHoverEdge);
    assert.ok(dataset.borderWidth > 0, 'committed spending needs a visible outline');
    assert.equal(dataset.borderSkipped, false, 'outline must survive stacked bars');
  }
}

test('scoped spending palette is neutral and theme-aware, independent of every accent change', () => {
  const palettes = [];
  for (const theme of ['light', 'dark']) {
    const ctx = fixture(theme);
    const before = copy(ctx.budNeutralSpendPalette());
    Object.values(before).forEach(assertGrey);
    for (const accent of ['#8457d9', '#0d806f', '#db2777']) {
      ctx.accent = accent;
      assert.deepEqual(copy(ctx.budNeutralSpendPalette()), before);
    }
    assert.equal(rgba(before.variable)[3], 1, 'variable spending is solid');
    assert.ok(rgba(before.fixed)[3] > 0 && rgba(before.fixed)[3] < 1, 'committed fill is translucent');
    assert.equal(rgba(before.fixedEdge)[3], 1, 'committed edge stays solid');
    assert.notEqual(before.variable, before.fixed);
    assert.notEqual(before.variableHover, before.variable);
    assert.notEqual(before.fixedHover, before.fixed);
    palettes.push(before);
  }
  assert.notDeepEqual(palettes[0], palettes[1], 'light and dark surfaces need different greys');
});

test('category ranks are distinct neutral shades, reversing emphasis with the theme and ignoring accent', () => {
  for (const theme of ['light', 'dark']) {
    const ctx = fixture(theme);
    const shades = Array.from({ length: 10 }, (_, i) => ctx.budRankShade(i, 10));
    const values = shades.map(shade => assertGrey(shade)[0]);
    assert.equal(new Set(shades).size, shades.length);
    values.slice(1).forEach((v, i) => assert.ok(theme === 'dark' ? v < values[i] : v > values[i]));
    ctx.accent = '#0072ea';
    assert.deepEqual(Array.from({ length: 10 }, (_, i) => ctx.budRankShade(i, 10)), shades);
    assertGrey(ctx.budRankShade(0, 1));
  }
});

test('Month category strip and rows share greys without changing amounts, shares or evidence targets', () => {
  const cats = [
    { label: 'Food', val: 50, pctLabel: '50%', evidenceKey: 'food' },
    { label: 'Transport', val: 30, pctLabel: '30%', evidenceKey: 'transport' },
    { label: 'Legacy', kind: 'Legacy', val: 20, pctLabel: '20%', evidenceKey: 'legacy' }
  ];
  for (const theme of ['light', 'dark']) {
    const ctx = fixture(theme);
    ctx.monthSpendBreakdown = () => ({ total: 100, cats, periodLabel: 'August 2026', issues: [] });
    const wrap = {};
    ctx.renderMonthSpendBreakdown(wrap, new Date('2026-08-01'), keys, 3, false);
    const segments = [...wrap.innerHTML.matchAll(/class="month-spend-seg" style="width:([^;]+);background:([^"]+)" title="([^"]+)"/g)];
    const fills = [...wrap.innerHTML.matchAll(/class="month-spend-fill" style="width:([^;]+);background:([^"]+)"/g)];
    assert.equal(segments.length, cats.length);
    assert.equal(fills.length, cats.length);
    cats.forEach((cat, i) => {
      assertGrey(segments[i][2]);
      assert.equal(segments[i][2], fills[i][2]);
      assert.equal(segments[i][1], cat.val.toFixed(2) + '%');
      assert.equal(fills[i][1], (cat.val / 50 * 100).toFixed(1) + '%');
      assert.equal(segments[i][3], cat.label + ' · ' + cat.pctLabel);
      assert.ok(wrap.innerHTML.includes('data-evidence-key="' + cat.evidenceKey + '"'));
      assert.ok(wrap.innerHTML.includes('$' + cat.val.toFixed(2)));
    });
    ctx.accent = '#a10065';
    const changed = {};
    ctx.renderMonthSpendBreakdown(changed, new Date('2026-08-01'), keys, 3, false);
    assert.equal(changed.innerHTML, wrap.innerHTML);
  }
});

test('Month weekly chart retains figures and stack order while bars, hover fills and legend use the neutral palette', () => {
  for (const theme of ['light', 'dark']) {
    const ctx = fixture(theme, '#8457d9');
    ctx.renderMonth();
    const { data, options } = ctx.charts.at(-1).config;
    const ds = data.datasets;
    assert.deepEqual(copy(ds.map(d => [d.label, d.data, d.stack, d.order])), [
      ['Income', [1200, 0, 900], 'in', 0],
      ['Spent (variable)', [210, 30, 500], 'out', 1],
      ['Committed', [400, 300, 350], 'out', 2],
      ['Saved', [150, 0, 100], 'out', 3]
    ]);
    const palette = ctx.budNeutralSpendPalette();
    assertSpending(ds[1], palette, false);
    assertSpending(ds[2], palette, true);
    assert.equal(ds[0].backgroundColor, ctx.budIncomeHex());
    assert.equal(ds[3].backgroundColor, ctx.budAccentHex());
    const legend = ctx.nodes.get('month-weeks-list').innerHTML;
    assertLegend(legend, ds[1].label, palette.variable);
    assertLegend(legend, ds[2].label, palette.fixed, palette.fixedEdge);
    assert.equal(options.plugins.tooltip.callbacks.label({ dataset: ds[2], parsed: { y: 350 } }), 'Committed: $350');
    assert.equal(options.scales.x.stacked, true);
    assert.equal(options.scales.y.stacked, true);
  }
});

test('Money flow preserves missing-data gaps, independent stacks, tooltips and source-week navigation', () => {
  for (const theme of ['light', 'dark']) {
    const ctx = fixture(theme, '#8457d9');
    ctx.renderBSTrend();
    const { data, options } = ctx.charts.at(-1).config;
    const ds = data.datasets;
    assert.deepEqual(copy(ds.map(d => [d.label, d.data, d.stack, d.order])), [
      ['Committed spend', [400, 300, 350], 'out', 3],
      ['Variable spend', [210, 30, 500], 'out', 3],
      ['Income', [1200, null, 900], 'inc', 1],
      ['Saved plan', [800, null, 700], 'plan', 2]
    ]);
    const palette = ctx.budNeutralSpendPalette();
    assertSpending(ds[0], palette, true);
    assertSpending(ds[1], palette, false);
    assert.equal(ds[2].borderColor, ctx.budIncomeHex());
    assert.equal(ds[3].borderColor, ctx.budAccentHex());
    assert.equal(ds[2].spanGaps, false);
    assert.equal(ds[3].spanGaps, false);
    assert.deepEqual(copy(ds[3].borderDash), [6, 4]);
    const legend = ctx.nodes.get('bs-trend-wrap-card').innerHTML;
    assertLegend(legend, ds[0].label, palette.fixed, palette.fixedEdge);
    assertLegend(legend, ds[1].label, palette.variable);
    const tooltip = options.plugins.tooltip.callbacks;
    assert.equal(tooltip.label({ dataset: ds[1], parsed: { y: 500 } }), 'Variable spend: $500');
    assert.equal(tooltip.label({ dataset: ds[2], parsed: { y: null } }), 'Income: not recorded');
    assert.equal(tooltip.footer([{ dataIndex: 1 }]), 'Total expenses: $330');
    assert.equal(tooltip.footer([{ dataIndex: 2 }]), 'Total expenses: $850\nLeft after expenses: $50');
    options.onClick({}, [{ index: 1 }]);
    assert.deepEqual(ctx.opened, [keys[1]]);
  }
});

test('unrelated expense colours stay red, income green and saved accent-driven', () => {
  for (const theme of ['light', 'dark']) {
    const ctx = fixture(theme);
    const original = ctx.budPalette();
    const expense = rgba(original.expense);
    const income = rgba(original.income);
    assert.ok(expense[0] > expense[1] && expense[0] > expense[2]);
    assert.ok(income[1] > income[0] && income[1] > income[2]);
    assert.equal(original.variable, ctx.budExpenseHex());
    assert.equal(original.fixedEdge, ctx.budExpenseHex());
    ctx.accent = '#8457d9';
    const changed = ctx.budPalette();
    assert.equal(changed.expense, original.expense);
    assert.equal(changed.income, original.income);
    assert.notEqual(changed.saved, original.saved);
  }
});

test('Month allocation still uses semantic danger for a real shortfall', () => {
  const ctx = fixture();
  ctx.budgetData[keys[0]].income = 100;
  ctx.budgetData[keys[2]].income = 200;
  ctx.renderMonth();
  assert.equal(ctx.nodes.get('month-bar').style.background, 'var(--danger)');
  assert.equal(ctx.nodes.get('month-bar').style.width, '100%');
});
