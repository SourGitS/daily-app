const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {extract}=require('./harness.cjs');
const plain=x=>JSON.parse(JSON.stringify(x));
function fixture(extra={}){
  const c=vm.createContext({console,Date,Math,Number,Map,Set,JSON,
    getLocalDate:()=> '2026-11-07',budgetData:{},ledgerData:[],txnData:[],budOvMoneyRange:{preset:'month',from:'',to:''},
    lsLoad:(key,fallback)=>fallback,
    localMidnight:s=>new Date(s+'T00:00:00'),
    loadVarCats:()=>[{id:'food',name:'Food'},{id:'travel',name:'Transport'}],
    loadFixCats:()=>[{id:'gym',name:'Gym'}],loadIncCats:()=>[{id:'salary',name:'Salary'}],loadAccounts:()=>[],
    weekIncome:w=>Number(w.income)||0,weekVarTotal:w=>Number(w.spent)||0,
    ledgerOf:kind=>c.ledgerData.filter(x=>x.kind===kind),
    escText:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),
    escAttr:s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),
    fmtMoneyExact:n=>'$'+n,nwCompactMoney:n=>'$'+n,fmtDate:s=>s,
    cardHeader:(icon,label,right='')=>'<header>'+label+right+'</header>',
    cardIcon:()=>'<svg></svg>',statsFigure:(v,u,cap)=>'<strong>'+v+'</strong><p>'+cap+'</p>',
    statsSplit:cells=>cells.map(([l,v])=>'<span>'+l+' '+v+'</span>').join(''),
    ...extra});
  vm.runInContext(fs.readFileSync('js/finance-periods.js','utf8'),c);
  ['budOvMonthWindow','budOvRangeWindow','budOvRangeChoose','budOvRangeApply','budOvRangeControls','budOvRangeDateLabel',
    'budOvAmountValid','budOvExpenseAmountValid','budOvDatedMoney','budOvSpendGroups','budOvRangeFacts','budOvRangeEntries','budOvRangeRecordsHtml',
    'budOvRangeSavingsHtml','budOvRangeDifferenceHtml','budOvRangeCoverageHtml','budOvRangeGroupsHtml','budOvRecordedHtml','budOvMonthFacts','budOvTrendHtml',
    'budOvMonthlyHtml','budOvActivityRows','budOvActivityHtml','budOvOpenActivity'].forEach(name=>vm.runInContext(extract(name),c));
  return c;
}
const expense=(id,date,amount,extra={})=>({id,date,amount,catId:'food',...extra});
const event=(id,date,kind,amount,extra={})=>({id,date,kind,amount,...extra});

test('monthly facts use dated purchases and paid bills once, with income and savings separate',()=>{
  const c=fixture({txnData:[expense('a','2026-11-01',35.15),expense('b','2026-11-07',80.01),
    expense('future','2026-11-08',900),expense('deleted','2026-11-05',999,{deletedAt:1})],
    ledgerData:[event('pay','2026-11-03','income',1000),event('bill','2026-11-04','bill_payment',14.28),
      event('save','2026-11-05','savings',50),event('move','2026-11-06','transfer',500),
      event('refund','2026-11-07','reimbursement',15),event('old','2026-10-01','bill_payment',20)]});
  const before=JSON.stringify([c.txnData,c.ledgerData,c.budgetData]),f=c.budOvMonthFacts();
  assert.equal(f.current.spent,115.16);assert.equal(f.current.billPaid,14.28);assert.equal(f.current.total,129.44);
  assert.equal(f.current.income,1000);assert.equal(f.current.savingsRecorded,50);
  assert.equal(f.currentDaily.reduce((a,b)=>a+b,0).toFixed(2),'129.44');
  c.budOvMonthlyHtml(f);c.budOvActivityHtml();
  assert.equal(JSON.stringify([c.txnData,c.ledgerData,c.budgetData]),before,'rendering changes no records');
});

test('matching-day comparison excludes the later part of last month and follows calendar dates',()=>{
  const c=fixture({txnData:[expense('now','2026-11-07',45.12),expense('before','2026-10-07',30.01),
    expense('later','2026-10-08',1000)]});
  const f=c.budOvMonthFacts();assert.equal(f.comparison.available,true);assert.equal(f.comparison.difference,15.11);
  assert.equal(f.previous.total,30.01);assert.equal(f.window.previousEnd,'2026-10-07');
  assert.equal(f.comparison.driver.name,'Food');assert.equal(f.comparison.driver.amount,15.11);
  assert.match(c.budOvMonthlyHtml(f),/First 7 days vs Oct/);
  c.budgetPeriodOffset=10;c.budgetConfig={frequency:'fortnightly',anchor:'2026-11-05'};
  assert.deepEqual(plain(c.budOvMonthFacts()),plain(f),'changing a budget schedule or viewed period cannot change calendar facts');
});

test('month boundaries clamp matching days for short months, leap years and January',()=>{
  for(const [today,previousStart,previousEnd,compareEnd] of [
    ['2026-03-31','2026-02-01','2026-02-28','2026-03-28'],
    ['2028-03-31','2028-02-01','2028-02-29','2028-03-29'],
    ['2026-12-31','2026-11-01','2026-11-30','2026-12-30'],
    ['2027-01-01','2026-12-01','2026-12-01','2027-01-01']
  ]){
    const w=fixture().budOvMonthWindow(today);assert.deepEqual([w.previousStart,w.previousEnd,w.compareEnd],[previousStart,previousEnd,compareEnd]);
  }
  const c=fixture({txnData:[expense('now','2026-03-28',40),expense('end','2026-03-31',50),expense('before','2026-02-28',30)]});
  const f=c.budOvMonthFacts('2026-03-31');assert.equal(f.current.total,90);assert.equal(f.matched.total,40);
  assert.equal(f.comparison.difference,10);assert.equal(f.previousDaily.length,31);assert.equal(f.previousDaily[30],null);
  assert.match(c.budOvMonthlyHtml(f),/First 28 days vs Feb/);assert.doesNotMatch(c.budOvTrendHtml(f),/NaN|Infinity/);
});

test('undated complete or overlapping weekly totals stay out of daily facts and suppress a spending comparison',()=>{
  for(const budgetData of [{'2026-11-01':{spent:90}},{'2026-10-26':{spent:90}}]){
    const c=fixture({budgetData,txnData:[expense('now','2026-11-07',20),expense('old','2026-10-07',30)]});
    const f=c.budOvMonthFacts();assert.equal(f.current.total,20);assert.equal(f.undated,true);assert.equal(f.comparison.available,false);
    const html=c.budOvMonthlyHtml(f);assert.match(html,/Some records are excluded/);assert.match(html,/Undated weekly totals remain in Weekly history/);
    assert.match(html,/Comparison unavailable/);
  }
});

test('missing history and invalid records never manufacture a trend or an empty zero balance',()=>{
  const empty=fixture(),f=empty.budOvMonthFacts();assert.equal(f.comparison.available,false);
  assert.match(empty.budOvMonthlyHtml(f),/>—</);assert.match(empty.budOvMonthlyHtml(f),/No dated activity/);
  assert.match(empty.budOvTrendHtml(f),/No dated spending to chart/);
  const c=fixture({txnData:[expense('good','2026-11-07',20),expense('zero','2026-11-03',0),
    expense('bad','2026-11-05','oops'),expense('date','2026-02-30',100),expense('huge','2026-11-02',1e308),expense('prior','2026-10-07',30)]});
  const data=c.budOvMonthFacts();assert.equal(data.current.total,20);assert.equal(data.current.invalid,4);
  assert.equal(data.comparison.available,false);assert.match(c.budOvMonthlyHtml(data),/Some records are excluded/);
});

test('the first day of a month has visible single points without fabricating a spending history',()=>{
  const c=fixture({txnData:[expense('now','2027-01-01',10.25),expense('before','2026-12-01',8)]});
  const f=c.budOvMonthFacts('2027-01-01'),html=c.budOvTrendHtml(f);
  assert.equal(f.currentDaily.length,1);assert.equal(f.previousDaily.length,1);
  assert.equal(f.comparison.difference,2.25);assert.match(html,/bov-trend-current-dot/);assert.match(html,/bov-trend-previous-dot/);
  assert.doesNotMatch(html,/NaN|Infinity/);
});

test('all spending groups reconcile, including missing categories and actual bill payments',()=>{
  const c=fixture({txnData:[expense('a','2026-11-01',10),expense('b','2026-11-02',5,{catId:'travel'}),
    expense('c','2026-11-03',4,{catId:'removed'})],ledgerData:[event('bill','2026-11-02','bill_payment',7)]});
  const f=c.budOvMonthFacts();assert.equal(f.groups.reduce((n,g)=>n+g.amount,0),26);assert.equal(f.current.total,26);
  assert.ok(f.groups.some(g=>g.name==='Uncategorised'&&g.amount===4));assert.ok(f.groups.some(g=>g.name==='Bills paid'&&g.amount===7));
});

test('recent activity combines the four recorded kinds, uses original dates and never mutates source order',()=>{
  const c=fixture({txnData:[expense('yesterday','2026-11-06',10),expense('today','2026-11-07',12,{createdAt:2}),
    expense('future','2026-11-08',9),expense('deleted','2026-11-07',7,{deletedAt:1})],
    ledgerData:[event('income','2026-11-07','income',100,{createdAt:3}),event('savings','2026-11-07','savings',20,{createdAt:4}),
      event('bill','2026-11-05','bill_payment',4),event('old','2026-09-01','income',200),event('move','2026-11-07','transfer',80)]});
  const before=JSON.stringify([c.txnData,c.ledgerData]);
  assert.deepEqual(plain(c.budOvActivityRows().map(x=>x.record.id)),['savings','income','today','yesterday','bill','old']);
  assert.equal(JSON.stringify([c.txnData,c.ledgerData]),before);assert.match(c.budOvActivityHtml(),/2026-09-01/);
});

test('extra activity is available for fitting without losing the compact six-row default or edit access',()=>{
  const calls=[],c=fixture({txnData:Array.from({length:12},(_,i)=>expense('record-'+i,'2026-11-07',10,{createdAt:12-i})),
    openTxnModal:o=>calls.push(o.id)});
  assert.equal(c.budOvActivityRows().length,6);assert.equal(c.budOvActivityRows('2026-11-07',24).length,12);
  assert.equal((c.budOvActivityHtml().match(/class="bov-activity-item" hidden/g)||[]).length,6);
  c.budOvOpenActivity({dataset:{bovId:'record-8',bovKind:'purchase'}});assert.deepEqual(calls,['record-8']);
});

test('activity details escape user text and only existing editable records open their established editors',()=>{
  const calls=[],c=fixture({txnData:[expense('a"b','2026-11-07',10,{merchant:'<img src=x>',note:'<script>bad</script>'})],
    ledgerData:[event('manual','2026-11-06','savings',5,{manual:true}),event('imported','2026-11-05','income',10)],
    openTxnModal:o=>calls.push(['purchase',o.id]),budPeriodEdit:id=>calls.push(['ledger',id])});
  // finance-periods defines the existing edit function; replace it only for this routing test.
  c.budPeriodEdit=id=>calls.push(['ledger',id]);
  const html=c.budOvActivityHtml();assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<script>|<img/);assert.match(html,/a&quot;b/);
  const click=(id,kind)=>c.budOvOpenActivity({dataset:{bovId:id,bovKind:kind}});
  click('a"b','purchase');click('manual','savings');click('imported','income');click('missing','purchase');
  assert.deepEqual(calls,[['purchase','a"b'],['ledger','manual']]);
  c.txnData[0].deletedAt=1;click('a"b','purchase');assert.equal(calls.length,2);
});

test('date presets use inclusive calendar dates and budget dates without altering the schedule',()=>{
  const c=fixture();
  assert.deepEqual(plain(c.budOvRangeWindow()),{start:'2026-11-01',end:'2026-11-07',label:'This month',preset:'month'});
  assert.deepEqual(plain(c.budOvRangeWindow({preset:'last-month'},'2027-01-01')),{start:'2026-12-01',end:'2026-12-31',label:'Last month',preset:'last-month'});
  assert.equal(c.budOvRangeWindow({preset:'last-month'},'2028-03-01').end,'2028-02-29');
  assert.deepEqual(plain(c.budOvRangeWindow({preset:'30-days'})),{start:'2026-10-09',end:'2026-11-07',label:'Last 30 days',preset:'30-days'});
  const original={id:'2026-10-30',start:'2026-10-30',end:'2026-11-12',days:14};
  c.budPeriodCurrent=()=>original;
  assert.deepEqual(plain(c.budOvRangeWindow({preset:'budget'})),{start:'2026-10-30',end:'2026-11-07',label:'Budget period to date',preset:'budget'});
  assert.equal(original.end,'2026-11-12');
  c.budPeriodCurrent=()=>({start:'2026-11-08',end:'2026-11-14'});
  assert.equal(c.budOvRangeWindow({preset:'budget'}).preset,'month','future budgets cannot produce a reversed recorded range');
  assert.match(c.budOvRangeControls(c.budOvRangeWindow()),/value="budget" disabled/);
});

test('undated income crossing a month boundary does not become an undated spending warning',()=>{
  const c=fixture({budgetData:{'2026-10-26':{income:500}},txnData:[expense('now','2026-11-07',20),expense('old','2026-10-07',30)]});
  const f=c.budOvMonthFacts();
  assert.equal(f.comparison.available,true);assert.equal(f.comparison.difference,-10);assert.equal(f.undated,true);
  assert.doesNotMatch(c.budOvMonthlyHtml(f),/Some weekly spending has no dates/);
});

test('custom recorded totals cross schedule and week boundaries, excluding undated figures and plans',()=>{
  const c=fixture({budgetData:{'2026-10-26':{income:1000,spent:500}},
    txnData:[expense('first','2026-10-30',20.01),expense('last','2026-11-07',10.02),expense('before','2026-10-29',900),expense('after','2026-11-08',800)],
    ledgerData:[event('income','2026-10-30','income',100),event('bill','2026-11-07','bill_payment',5.03),event('saving','2026-11-02','savings',10),
      event('transfer','2026-11-03','transfer',70),event('refund','2026-11-04','reimbursement',5)]});
  c.budOvMoneyRange={preset:'custom',from:'2026-10-30',to:'2026-11-07'};
  const before=JSON.stringify([c.txnData,c.ledgerData,c.budgetData]),f=c.budOvRangeFacts(c.budOvRangeWindow());
  assert.equal(f.current.total,35.06);assert.equal(f.current.income,100);assert.equal(f.current.savingsRecorded,10);assert.equal(f.difference,64.94);
  assert.equal(f.undated,true);assert.equal(c.budOvRangeEntries(f.range).length,7);
  const html=c.budOvRecordedHtml();assert.match(html,/30 Oct 2026 – 7 Nov 2026 · inclusive/);assert.match(html,/Income less spending/);assert.match(html,/before separate reimbursements/);assert.match(html,/Some records are excluded/);
  assert.doesNotMatch(html,/Cumulative spending|First .* vs/);
  c.budPeriodCurrent=()=>({start:'2026-11-01',end:'2026-11-07'});
  assert.equal(c.budOvRangeFacts(c.budOvRangeWindow()).current.total,35.06);
  assert.equal(JSON.stringify([c.txnData,c.ledgerData,c.budgetData]),before);
});

test('a period with recorded spending and no income shows an honest difference without inventing pay or savings',()=>{
  const c=fixture({txnData:[expense('purchase','2026-11-07',80)],ledgerSavingsMovement:()=>({contributions:30,withdrawals:50,net:-20,transfers:2})});
  c.budOvMoneyRange={preset:'30-days'};
  const f=c.budOvRangeFacts(c.budOvRangeWindow()),html=c.budOvRecordedHtml();
  assert.equal(f.current.income,0);assert.equal(f.difference,-80);assert.equal(f.current.savingsRecorded,0);assert.equal(f.movement.net,-20);
  assert.match(html,/Income received \$0/);assert.match(html,/Savings recorded \$0/);assert.match(html,/Net moved to savings[\s\S]*\$-20/);assert.match(html,/never added together/);
  assert.doesNotMatch(html,/salary.*missing|income.*wrong|import.*salary/i);
});

test('date-filtered detail includes bank source references and counts a linked transfer once',()=>{
  const c=fixture({txnData:[expense('purchase','2026-11-07',10,{merchant:'<shop>',source:{file:'<bank>.csv',row:9}})],
    ledgerData:[event('transfer','2026-11-06','transfer',50,{fromAcctId:'cash',toAcctId:'save',accountMovementId:'posted'}),event('deleted','2026-11-07','income',500,{deletedAt:1})],
    acctRecordedTransfers:()=>[event('posted','2026-11-06','transfer',50,{ledgerId:'transfer'}),event('other','2026-11-05','transfer',20)],
    loadAccounts:()=>[{id:'cash',name:'Everyday'},{id:'save',name:'Savings'}]});
  const range={start:'2026-11-01',end:'2026-11-07'},rows=c.budOvRangeEntries(range),html=c.budOvRangeRecordsHtml(range);
  assert.deepEqual(plain(rows.map(r=>r.id)),['purchase','transfer','other']);
  assert.match(html,/&lt;shop&gt;/);assert.match(html,/&lt;bank&gt;.csv · row 9/);assert.match(html,/Everyday → Savings/);assert.doesNotMatch(html,/<shop>|<bank>/);
});

test('reversed or future custom dates keep the applied range and financial records intact',()=>{
  const nodes={'bov-range-from':{value:'2026-11-07'},'bov-range-to':{value:'2026-11-01'},'bov-range-error':{textContent:''},'bov-range-preset':{focus(){}}};
  let renders=0,prevented=0;
  const c=fixture({document:{getElementById:id=>nodes[id]},renderBudgetOverview:()=>renders++});
  c.budOvMoneyRange={preset:'custom',from:'2026-11-01',to:'2026-11-07'};
  const before=JSON.stringify(c.budOvMoneyRange),event={preventDefault(){prevented++;}};
  c.budOvRangeApply(event);assert.equal(renders,0);assert.match(nodes['bov-range-error'].textContent,/start date/);assert.equal(JSON.stringify(c.budOvMoneyRange),before);
  nodes['bov-range-from'].value='2026-11-01';nodes['bov-range-to'].value='2026-11-08';c.budOvRangeApply(event);assert.equal(renders,0);
  nodes['bov-range-to'].value='2026-11-06';c.budOvRangeApply(event);assert.equal(renders,1);assert.equal(c.budOvMoneyRange.to,'2026-11-06');assert.equal(prevented,3);
});

test('expense refunds reconcile with budget net purchases and stay visible in categories and activity',()=>{
  const c=fixture({txnData:[expense('buy','2026-11-01',100),expense('refund','2026-11-02',-20)],
    ledgerData:[event('pay','2026-11-03','income',200),event('bill','2026-11-04','bill_payment',10),event('bad-income','2026-11-05','income',-100)]});
  const m=c.budOvDatedMoney('2026-11-01','2026-11-07'),f=c.budOvMonthFacts();
  assert.equal(m.spent,80);assert.equal(m.total,90);assert.equal(m.income,200);assert.equal(m.invalid,1);
  assert.equal(c.budOvSpendGroups(m).reduce((sum,g)=>sum+g.amount,0),90);
  assert.ok(c.budOvRangeEntries({start:'2026-11-01',end:'2026-11-07'}).some(r=>r.id==='refund'));
  assert.ok(c.budOvActivityRows().some(r=>r.record.id==='refund'));
  assert.equal(f.currentDaily[1],-20);assert.match(c.budOvMonthlyHtml(f),/Purchases include recorded expense refunds/);
});

test('refund-only spending charts remain visible with a negative axis and finite coordinates',()=>{
  const c=fixture({txnData:[expense('refund','2026-11-01',-20)]});
  const f=c.budOvMonthFacts(),html=c.budOvTrendHtml(f),groups=c.budOvRangeGroupsHtml(f.groups,f.current.total);
  assert.equal(f.current.total,-20);assert.match(html,/bov-trend-current/);assert.match(html,/\$-20/);assert.doesNotMatch(html,/NaN|Infinity|No dated spending/);
  assert.match(groups,/width:100%/);assert.doesNotMatch(groups,/width:-/);
});
