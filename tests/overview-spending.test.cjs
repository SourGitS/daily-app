const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {extract}=require('./harness.cjs');
const plain=x=>JSON.parse(JSON.stringify(x));
function fixture(extra={}){
  const c=vm.createContext({console,Date,Math,Number,Map,Set,JSON,
    getLocalDate:()=> '2026-11-07',budgetData:{},ledgerData:[],txnData:[],
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
  ['budOvMonthWindow','budOvAmountValid','budOvDatedMoney','budOvSpendGroups','budOvMonthFacts','budOvTrendHtml',
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
  const c=fixture({txnData:[expense('good','2026-11-07',20),expense('negative','2026-11-03',-5),
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
