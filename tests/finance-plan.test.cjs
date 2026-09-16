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
const planCss = fs.readFileSync(path.join(__dirname, '../css/budget-home.css'), 'utf8');
const body = name => extract(name);

function planFixture() {
  const calls=[], dueInputs=[];
  const context=vm.createContext({
    Date, Object, console, calls,
    getLocalDate:()=> '2026-09-15',
    dateStr:d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),
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
    catNextDue:(cat,from)=>{
      dueInputs.push(from);
      if(typeof from!=='string') throw new TypeError('catNextDue needs YYYY-MM-DD');
      return cat.next ? new Date(cat.next+'T12:00:00') : null;
    }
  });
  vm.runInContext(body('budPlanYearAhead'),context);
  return {context,calls,dueInputs};
}

test('Year ahead is a 12-month schedule of recurring charges, with statements separate', () => {
  const {context,calls,dueInputs}=planFixture();
  const raw=vm.runInContext('budPlanYearAhead()',context);
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
  assert.deepEqual(dueInputs,['2026-09-15','2026-09-15'],
    'the scheduled-date reader receives its YYYY-MM-DD contract, so an unscheduled bill cannot abort Plan');
});

test('Plan renders the selected phone lens and both fact scopes on desktop', () => {
  const render=body('renderPlan');
  const run=(lens, desktop)=>{
    const calls=[];
    const context=vm.createContext({
      budgetPlanLens:lens, layoutIsDesktop:()=>desktop,
      budPlanApplyLens:()=>calls.push('apply'),
      budPlanClearMonthChart:()=>calls.push('clear-month'),
      budPlanClearYearCharts:()=>calls.push('clear-year'),
      renderMonth:()=>calls.push('month'), renderPlanAhead:()=>calls.push('ahead'), renderYear:()=>calls.push('year')
    });
    vm.runInContext(render,context);
    vm.runInContext('renderPlan()',context);
    return calls;
  };
  assert.deepEqual(run('month',false), ['apply','clear-year','month']);
  assert.deepEqual(run('year',false), ['apply','clear-month','ahead','year']);
  assert.deepEqual(run('year',true), ['apply','month','ahead','year']);
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

test('Plan has a separate, prominent phone lens rather than extra Finance tabs', () => {
  const start=html.indexOf('id="budget-plan-view"');
  const end=html.indexOf('<!-- BILLS CALENDAR VIEW',start);
  assert.ok(start>0 && end>start, 'Plan panel anchors');
  const panel=html.slice(start,end);
  const lensAt=panel.indexOf('id="budget-plan-lens"');
  assert.ok(lensAt>=0 && lensAt<panel.indexOf('class="budget-plan-layout"'),
    'the Plan lens sits above its month/year content');
  assert.match(panel, /id="budget-plan-view"[^>]*data-plan-lens="year"/);
  assert.match(panel, /id="budget-plan-lens"[^>]*role="group"[^>]*aria-label="Plan focus"/);
  assert.match(panel, /data-plan-lens="month"[^>]*aria-pressed="false"[^>]*onclick="setBudgetPlanLens\('month'\)"/);
  assert.match(panel, /data-plan-lens="year"[^>]*aria-pressed="true"[^>]*onclick="setBudgetPlanLens\('year'\)"/);
  assert.match(panel, /Recorded[\s\S]{0,120}?This month/);
  assert.match(panel, /Forward plan[\s\S]{0,120}?Year ahead/);
  assert.match(planCss, /\.budget-plan-lens\{display:none\}/,
    'desktop keeps its existing split view rather than adding another selector');
  const phoneStart=planCss.indexOf('@media (max-width:1023px)',planCss.indexOf('Finance › Plan'));
  const phoneEnd=planCss.indexOf('@media (max-width:380px)',phoneStart);
  const phone=planCss.slice(phoneStart,phoneEnd);
  assert.match(phone, /\.budget-plan-lens\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);/);
  assert.match(phone, /\.budget-plan-lens button\{[^}]*min-height:64px/);
  assert.match(phone, /\.budget-plan-lens button\.on\{[^}]*linear-gradient\(150deg,var\(--accent-hero\),var\(--accent-hero-2\)\)/);
  assert.match(phone, /data-plan-lens="month"\] \.budget-plan-year,[\s\S]{0,100}?data-plan-lens="year"\] \.budget-plan-month\{display:none\}/);
  assert.match(phone, /data-plan-lens="year"\] \.budget-plan-year\{padding-top:0;border-top:0\}/);
});

test('changing the Plan lens is in-memory, preserves its data positions and updates its controls', () => {
  const panel={dataset:{}};
  const makeButton=lens=>{
    const classes=new Set(lens==='year'?['on']:[]);
    return {
      dataset:{planLens:lens}, classes, attrs:{},
      classList:{toggle(name,on){ if(on) classes.add(name); else classes.delete(name); }},
      setAttribute(name,value){ this.attrs[name]=String(value); }
    };
  };
  const month=makeButton('month'), year=makeButton('year'), calls=[];
  const context=vm.createContext({
    budgetPlanLens:'year', budgetView:'plan', currentMonthOffset:-2, budgetYearOffset:-1, S:{view:'budget'},
    document:{getElementById:id=>id==='budget-plan-view'?panel:null, querySelectorAll:()=>[month,year]},
    layoutIsDesktop:()=>false, renderPlan:()=>calls.push('render')
  });
  vm.runInContext(body('budPlanApplyLens')+'\n'+body('setBudgetPlanLens'),context);
  vm.runInContext("setBudgetPlanLens('month')",context);
  assert.equal(vm.runInContext('budgetPlanLens',context),'month');
  assert.equal(vm.runInContext('budgetView',context),'plan');
  assert.equal(vm.runInContext('currentMonthOffset',context),-2);
  assert.equal(vm.runInContext('budgetYearOffset',context),-1);
  assert.equal(panel.dataset.planLens,'month');
  assert.equal(month.attrs['aria-pressed'],'true');
  assert.equal(year.attrs['aria-pressed'],'false');
  assert.ok(month.classes.has('on') && !year.classes.has('on'));
  assert.deepEqual(calls,['render'], 'the newly visible phone pane is rendered after selection');
  const fn=body('setBudgetPlanLens')+'\n'+body('budPlanApplyLens');
  [/localStorage/, /lsSave/, /lsSaveTS/, /Date\.now\(/, /firebase/, /history/, /setBudgetView\(/].forEach(re =>
    assert.ok(!re.test(fn), 'the Plan lens must not contain ' + re));
});

test('the Plan schedule is read-only and retains legacy Month/Yearly entry compatibility', () => {
  const schedule=body('budPlanYearAhead')+'\n'+body('renderPlanAhead');
  [/localStorage/, /lsSave/, /lsSaveTS/, /Date\.now\(/, /firebase/, /saveAccounts\(/].forEach(re =>
    assert.ok(!re.test(schedule), 'the schedule must not contain ' + re));
  const toggle=body('setBudgetView');
  assert.match(toggle, /if\(v==='month'\)\{ budgetPlanLens='month'; v='plan'; \}/);
  assert.match(toggle, /else if\(v==='year'\)\{ budgetPlanLens='year'; v='plan'; \}/,
    'stale in-memory callers retain their matching Plan lens rather than landing on Overview');
});
