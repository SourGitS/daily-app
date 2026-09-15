// Finance › Plan keeps two kinds of information deliberately separate: the Month and Year
// readers show recorded facts, while Year ahead is only a dated recurring-bills schedule.
// These tests use the real schedule summariser against a small calendar fixture, so a later UI
// change cannot quietly turn it into a balance or income prediction.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { extract } = require('./harness.cjs');

const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const body = name => extract(name);

function planFixture() {
  const calls=[];
  const context=vm.createContext({
    Date, Object, console, calls,
    getLocalDate:()=> '2026-09-15',
    localMidnight:value=>{
      const d=value instanceof Date ? value : new Date(String(value)+'T12:00:00');
      return new Date(d.getFullYear(),d.getMonth(),d.getDate());
    },
    billOccurrences:(from,to)=>{
      calls.push({from,to});
      return [
        {kind:'charge', key:'2026-09-18', date:new Date(2026,8,18), amount:20, name:'Gym'},
        {kind:'statement', key:'2026-09-20', date:new Date(2026,8,20), amount:500, name:'Card'},
        {kind:'charge', key:'2026-10-02', date:new Date(2026,9,2), amount:40, name:'Phone'},
        {kind:'charge', key:'2026-10-09', date:new Date(2026,9,9), amount:30, name:'Stream'}
      ];
    },
    loadFixCats:()=>[
      {id:'gym', scheduled:true, next:'2026-09-18'},
      {id:'missing-date', scheduled:true, next:null},
      {id:'not-recurring', scheduled:false, next:null}
    ],
    billIsScheduled:cat=>cat.scheduled,
    catNextDue:cat=>cat.next ? new Date(cat.next+'T12:00:00') : null
  });
  vm.runInContext(body('budPlanYearAhead'),context);
  return {context,calls};
}

test('Year ahead is a 12-month schedule of recurring charges, with statements separate', () => {
  const {context,calls}=planFixture();
  const raw=vm.runInContext("budPlanYearAhead(new Date(2026,8,15))",context);
  const p=JSON.parse(JSON.stringify(raw));
  assert.equal(calls.length,1);
  assert.deepEqual([calls[0].from.getFullYear(),calls[0].from.getMonth(),calls[0].from.getDate()], [2026,8,15]);
  assert.deepEqual([calls[0].to.getFullYear(),calls[0].to.getMonth(),calls[0].to.getDate()], [2027,8,14],
    'the window is exactly the next twelve months, inclusive');
  assert.equal(p.total,90, 'the total excludes the statement balance');
  assert.equal(p.charges.length,3);
  assert.equal(p.statements.length,1);
  assert.equal(p.statements[0].name,'Card');
  assert.deepEqual(p.months.map(m=>[m.key,m.total,m.items.length]), [
    ['2026-09',20,1], ['2026-10',70,2]
  ]);
  assert.deepEqual([p.busiest.key,p.busiest.total],['2026-10',70]);
  assert.equal(p.unscheduled,1, 'an active recurring charge without a usable date is named, never guessed');
});

test('Plan renders actual month and year data alongside the explicit forward schedule', () => {
  const render=body('renderPlan');
  assert.ok(render.indexOf('renderMonth()') < render.indexOf('renderPlanAhead()'));
  assert.ok(render.indexOf('renderPlanAhead()') < render.indexOf('renderYear()'));
  const ahead=body('renderPlanAhead');
  assert.match(ahead, /12-month total/);
  assert.match(ahead, /Next due/);
  assert.match(ahead, /Busiest month/);
  assert.match(ahead, /Month-by-month schedule/);
  assert.match(ahead, /Scheduled recurring charges only\. Income, account balances and day-to-day spending are not forecast here\./);
  assert.match(ahead, /Known card statements/);
  assert.ok(!/nextPayInfo\(/.test(ahead), 'a weekly pay day is not evidence of a year of deposits');
  assert.ok(!/accountsNetWorth\(/.test(ahead), 'a present balance is not a future balance');
});

test('Plan replaces Month and Yearly in the Finance UI while Bills stays separate', () => {
  assert.match(html, /id="bv-plan-btn"[^>]*aria-controls="budget-plan-view"[^>]*setBudgetView\('plan'\)/);
  assert.match(html, /id="bv-bills-btn"[^>]*setBudgetView\('bills'\)/);
  assert.ok(!/id="bv-month-btn"/.test(html));
  assert.ok(!/id="bv-year-btn"/.test(html));
  assert.match(html, /<h2 id="budget-plan-month-title">This month<\/h2>/);
  assert.match(html, /<h2 id="budget-plan-year-title">Year ahead<\/h2>/);
  assert.match(html, /<h3>Year so far<\/h3>/);
  assert.match(html, /id="plan-ahead-card"/);
});

test('the Plan schedule is read-only and retains legacy Month/Yearly entry compatibility', () => {
  const schedule=body('budPlanYearAhead')+'\n'+body('renderPlanAhead');
  [/localStorage/, /lsSave/, /lsSaveTS/, /Date\.now\(/, /firebase/, /saveAccounts\(/].forEach(re =>
    assert.ok(!re.test(schedule), 'the schedule must not contain ' + re));
  const toggle=body('setBudgetView');
  assert.match(toggle, /if\(v==='month'\|\|v==='year'\) v='plan';/,
    'stale in-memory callers must land on Plan rather than Overview');
});
