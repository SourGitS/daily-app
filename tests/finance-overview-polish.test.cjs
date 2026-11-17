// Actual date-scoped cash flow, kept independent of budget allocations and real accounts.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {extract}=require('./harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
const range={start:'2026-11-01',end:'2026-11-18',label:'This month',preset:'month'};
const purchase=(id,date,amount,extra={})=>({id,date,amount,catId:'food',...extra});
const entry=(id,date,kind,amount,extra={})=>({id,date,kind,amount,...extra});
function fixture(extra={}){
 const c=vm.createContext({console,Date,Math,Number,Map,Set,JSON,
  getLocalDate:()=>range.end,budgetData:{},ledgerData:[],txnData:[],budOvMoneyRange:{preset:'month',from:'',to:''},
  lsLoad:(key,fallback)=>fallback,localMidnight:s=>new Date(s+'T00:00:00'),
  loadVarCats:()=>[{id:'food',name:'Food'},{id:'travel',name:'Transport'}],loadFixCats:()=>[{id:'rent',name:'Rent'}],loadIncCats:()=>[{id:'pay',name:'Pay'}],loadAccounts:()=>[],
  weekIncome:w=>Number(w.income)||0,weekVarTotal:w=>Number(w.spent)||0,
  ledgerOf:kind=>c.ledgerData.filter(row=>row&&row.kind===kind),
  escText:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),
  escAttr:value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),
  fmtMoneyExact:value=>'$'+value,nwCompactMoney:value=>'$'+value,fmtDate:value=>value,
  cardHeader:(icon,label,right='')=>'<header>'+label+right+'</header>',cardIcon:()=>'<svg></svg>',
  statsFigure:(value,unit,caption)=>'<strong>'+value+'</strong><p>'+caption+'</p>',statsSplit:cells=>cells.map(([label,value])=>'<span>'+label+' '+value+'</span>').join(''),
  ledgerSavingsMovement:()=>({contributions:0,withdrawals:0,net:0,transfers:0}),
  ...extra});
 vm.runInContext(fs.readFileSync('js/finance-periods.js','utf8'),c);
 ['budOvMonthWindow','budOvRangeWindow','budOvRangeControls','budOvRangeDateLabel','budOvAmountValid','budOvExpenseAmountValid',
  'budOvDatedMoney','budOvSpendGroups','budOvRangeEntries'].forEach(name=>vm.runInContext(extract(name),c));
 vm.runInContext(fs.readFileSync('js/finance-overview.js','utf8'),c);
 return c;
}

test('cash flow uses inclusive actual dates, includes expense refunds, and reconciles its daily totals',()=>{
 const c=fixture({txnData:[purchase('first',range.start,100.11),purchase('refund','2026-11-10',-20.03),purchase('last',range.end,30.25),purchase('old','2026-10-31',900),purchase('future','2026-11-19',800)],
  ledgerData:[entry('pay',range.start,'income',200),entry('bill',range.end,'bill_payment',6.25),entry('transfer','2026-11-03','transfer',999),entry('refund-ledger','2026-11-04','reimbursement',12)]});
 const f=c.budMoneyFacts(range);
 assert.equal(f.money.spent,110.33);assert.equal(f.money.billPaid,6.25);assert.equal(f.money.total,116.58);assert.equal(f.money.income,200);assert.equal(f.difference,83.42);
 assert.equal(f.days.length,18);assert.equal(f.days[0].date,range.start);assert.equal(f.days.at(-1).date,range.end);
 assert.equal(f.days[0].spent,100.11);assert.equal(f.days[9].spent,-20.03);assert.equal(f.days.at(-1).spent,36.5);
 assert.equal(Number(f.days.reduce((sum,day)=>sum+day.spent,0).toFixed(2)),116.58);
 assert.equal(Number(f.days.reduce((sum,day)=>sum+day.income,0).toFixed(2)),200);
 assert.equal(Number(f.groups.reduce((sum,group)=>sum+group.amount,0).toFixed(2)),116.58);
 assert.equal(f.latestExpense?.date||f.latestExpense,range.end);
});

test('no income is an honest negative cash-flow difference and missing savings stays unknown',()=>{
 const c=fixture({txnData:[purchase('spending','2026-11-15',1234.56)]});
 const f=c.budMoneyFacts(range);
 assert.equal(f.money.income,0);assert.equal(f.difference,-1234.56);
 assert.equal(f.savings.amount,null);assert.equal(f.savings.kind,'none');
 assert.equal(f.latestExpense?.date||f.latestExpense,'2026-11-15');
 assert.ok(f.days.slice(15).every(day=>day.spent===0&&day.count===0),'empty later days have no fabricated records');
});

test('received income never grows from an expected payday or budget allocation',()=>{
 const c=fixture({txnData:[purchase('spending','2026-11-15',1234.56)],ledgerData:[entry('received','2026-11-03','income',75)],
  budgetData:{'2026-11-02':{income:1800,sav_amount:500,fix_rent:400}},
  loadIncCats:()=>[{id:'pay',name:'Old salary',payAmount:1800,payDate:'2026-11-13',payCycle:'fortnightly'}]});
 const f=c.budMoneyFacts(range);
 assert.equal(f.money.income,75);assert.equal(f.difference,-1159.56);assert.equal(f.savings.amount,null);
 assert.equal(f.undated,true);
});

test('savings transfers and manually recorded savings remain different quantities',()=>{
 const c=fixture({ledgerData:[entry('recorded','2026-11-04','savings',20)],ledgerSavingsMovement:()=>({contributions:70,withdrawals:30,net:40,transfers:2})});
 const f=c.budMoneyFacts(range);
 assert.equal(f.savings.kind,'transfers');assert.equal(f.savings.amount,40);
 assert.equal(f.money.savingsRecorded,20,'a manual record remains available without adding it to transfers');
 const recorded=fixture({ledgerData:[entry('recorded','2026-11-04','savings',20)]}).budMoneyFacts(range);
 assert.equal(recorded.savings.kind,'records');assert.equal(recorded.savings.amount,20);
 const zero=fixture({ledgerSavingsMovement:()=>({contributions:30,withdrawals:30,net:0,transfers:2})}).budMoneyFacts(range);
 assert.equal(zero.savings.kind,'transfers');assert.equal(zero.savings.amount,0,'recorded zero movement differs from no savings records');
});

test('invalid or deleted activity is excluded while valid negative expense refunds stay visible',()=>{
 const c=fixture({txnData:[purchase('valid','2026-11-01',10.01),purchase('refund','2026-11-02',-2.02),purchase('deleted','2026-11-03',999,{deletedAt:1}),purchase('invalid','2026-11-04','bad')],
  ledgerData:[entry('deleted-pay','2026-11-01','income',999,{deletedAt:1}),entry('pay','2026-11-05','income',50)]});
 const f=c.budMoneyFacts(range);
 assert.equal(f.money.total,7.99);assert.equal(f.money.income,50);assert.equal(f.invalid,1);
 assert.deepEqual(plain(f.entries.map(row=>row.id).sort()),['pay','refund','valid']);
 assert.equal(f.days[1].spent,-2.02);assert.equal(f.latestExpense?.date||f.latestExpense,'2026-11-02');
});

test('facts and chart rendering do not modify record order, values or budget settings',()=>{
 const c=fixture({txnData:[purchase('later','2026-11-18',0.2),purchase('early','2026-11-01',0.1)],ledgerData:[entry('pay','2026-11-02','income',1)],budgetData:{'2026-10-26':{income:90}}});
 const before=JSON.stringify([c.txnData,c.ledgerData,c.budgetData,c.budOvMoneyRange]),f=c.budMoneyFacts(range);
 assert.equal(f.money.total,0.3);assert.equal(f.difference,0.7);
 const html=c.budMoneyChartHtml(f);assert.match(html,/<svg/);assert.doesNotMatch(html,/NaN|Infinity/);
 assert.equal(JSON.stringify([c.txnData,c.ledgerData,c.budgetData,c.budOvMoneyRange]),before);
});

test('refund-only and single-day charts have finite values and retain the first and last day',()=>{
 const c=fixture({txnData:[purchase('refund','2026-11-01',-20)]});
 const f=c.budMoneyFacts({start:'2026-11-01',end:'2026-11-01',label:'Custom dates',preset:'custom'}),html=c.budMoneyChartHtml(f);
 assert.equal(f.days.length,1);assert.equal(f.days[0].spent,-20);assert.equal(f.money.total,-20);
 assert.match(html,/<svg/);assert.doesNotMatch(html,/NaN|Infinity/);
});

test('long ranges use bounded chart buckets without dropping boundary records or changing totals',()=>{
 for(const start of ['2026-10-01','2026-01-01','2020-01-01']){
  const c=fixture({txnData:[purchase('first',start,10.01),purchase('last',range.end,20.02)],ledgerData:[entry('pay',range.end,'income',100)]});
  const f=c.budMoneyFacts({...range,start}),html=c.budMoneyChartHtml(f);
  assert.ok(f.days.length<=35,'chart buckets stay readable: '+f.days.length);
  assert.equal(f.days[0].date,start);assert.equal(f.days.at(-1).end||f.days.at(-1).date,range.end);
  assert.equal(Number(f.days.reduce((sum,day)=>sum+day.spent,0).toFixed(2)),30.03);
  assert.equal(Number(f.days.reduce((sum,day)=>sum+day.income,0).toFixed(2)),100);
  assert.equal(f.money.total,30.03);assert.equal(f.difference,69.97);
  assert.doesNotMatch(html,/NaN|Infinity/);
 }
});

test('running total is an optional view of the same spending and keeps refund days unchanged',()=>{
 const c=fixture({txnData:[purchase('first',range.start,100.11),purchase('refund','2026-11-02',-20.03),purchase('last',range.end,30.25)]});
 const f=c.budMoneyFacts(range),before=JSON.stringify(f.days);
 vm.runInContext("budMoneyUI.chart='total';budMoneyUI.selected='2026-11-18'",c);
 const html=c.budMoneyChartHtml(f);
 assert.match(html,/Spending to date/);assert.match(html,/Running total/);assert.match(html,/\$110.33/);
 assert.doesNotMatch(html,/NaN|Infinity/);assert.equal(JSON.stringify(f.days),before);assert.equal(f.days[1].spent,-20.03);
});

test('activity and total details escape source text and keep explanations collapsed initially',()=>{
 const c=fixture({txnData:[purchase('quoted"id',range.start,10,{merchant:'<shop>',note:'<script>bad</script>',source:{file:'<bank>.csv',row:'1'}})]});
 const f=c.budMoneyFacts(range),activity=c.budMoneyActivityHtml(f),html=c.budMoneyOverviewHtml({period:range,available:20,committed:5,saved:10});
 assert.match(activity,/&lt;shop&gt;/);assert.match(activity,/&lt;bank&gt;.csv/);assert.match(activity,/quoted&quot;id/);assert.doesNotMatch(activity,/<shop>|<bank>|<script>/);
 assert.match(html,/Your money/);assert.match(html,/data-money-metric="spent"/);assert.match(html,/data-money-metric="difference"/);
 assert.match(html,/<details id="money-totals-info" class="money-totals-info">/);assert.doesNotMatch(html,/<details[^>]*money-totals-info[^>]*\sopen[\s>]/);
});
