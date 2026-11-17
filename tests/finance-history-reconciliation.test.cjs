const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {extract}=require('./harness.cjs');
function fixture(extra={}){
  const c=vm.createContext({Date,Math,Number,Set,Map,console,budgetData:{},txnData:[],ledgerData:[],
    loadIncCats:()=>[],loadFixCats:()=>[],loadVarCats:()=>[{id:'food'}],activeCats:x=>x,
    wkrNum:(v,f)=>Number.isFinite(Number(v))?Number(v):f,
    catIsArchived:()=>false,localMidnight:s=>new Date(s+'T00:00:00'),
    dateStr:d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),
    weekFixedTotal:d=>Object.values(d?.fixRates||{}).reduce((s,n)=>s+Number(n),0),
    ...extra});
  vm.runInContext(['weekIncome','weekIncomeKeys','weekSpending','weekSavedAmt','weekLeftover',
    'weekKeyOf','weekVarTotal','varCatAmount','txnsForWeekCat','txnsForWeek','txnCatTotal'].map(extract).join('\n'),c);
  return c;
}
test('backfilled purchases and corrected income update leftover despite a stale cloud snapshot',()=>{
  const week='2026-11-02',d={wk:week,inc_salary:1000,fixRates:{rent:100},var_food:100,sav_amount:100,
    snapshot:{income:1000,fixed:100,variable:100,saved:100,leftover:700}};
  const c=fixture({budgetData:{[week]:d}}),before=JSON.stringify(d);
  c.txnData.push({date:'2026-11-04',amount:700,catId:'food'});
  assert.equal(c.weekSpending(d),800);assert.equal(c.weekLeftover(d),100);
  assert.equal(JSON.stringify(d),before,'reading does not rewrite archived records');
  d.inc_salary=900;assert.equal(c.weekLeftover(d),0);
});
test('snapshot-only history still derives its result from surviving legacy components',()=>{
  const c=fixture(),d={snapshot:{income:1000,fixed:200,variable:300,saved:100,leftover:400}};
  assert.equal(c.weekLeftover(d),400);assert.equal(c.weekLeftover(null),0);
});
test('weekly review includes dated savings once and preserves frozen completed reviews',()=>{
  const c=fixture({ledgerData:[{kind:'income',date:'2026-11-16',amount:1000},
    {kind:'savings',date:'2026-11-17',amount:250}],txnData:[{date:'2026-11-18',amount:75,catId:'food'}],
    WKR_VAR_GROUPS:[],WKR_GROUPS:[{id:'fixedBills'},{id:'other'}],
    statsWeekCatDefs:()=>[],statsWeekSpendQuality:()=>({}),ledgerOf:k=>c.ledgerData.filter(r=>r.kind===k)});
  vm.runInContext(fs.readFileSync('js/finance-periods.js','utf8'),c);
  c.budPeriodActive=()=>true;
  vm.runInContext(['wkrMoneyActuals','wkrDisplayActuals'].map(extract).join('\n'),c);
  const plan={money:{categoryMappings:{}}},result=c.wkrMoneyActuals('2026-11-16',plan);
  assert.equal(result.saved,250);assert.equal(result.incomeTotal,1000);assert.equal(result.spendTotal,75);
  assert.equal(result.leftover,675);
  const frozen={saved:50,leftover:20};
  assert.equal(c.wkrDisplayActuals('2026-11-16',{status:'completed',actualSnapshot:{money:frozen}},plan),frozen);
});
test('no income is a checkable fact rather than a demand to invent a salary payment',()=>{
  const c=fixture({budgetData:{'2026-11-02':{wk:'2026-11-02',var_food:25}},
    aiIsDate:s=>/^\d{4}-\d{2}-\d{2}$/.test(s),aiReconRange:()=>({from:'2026-11-02',to:'2026-11-08'}),
    aiActFmtFullDate:String,aiActFmtDate:String,fmtMoneyExact:n=>'$'+n,catIsRecurring:()=>false,
    aiPendingTxns:()=>[],ledgerOf:()=>[],ledgerSavingsMovement:()=>({transfers:0}),loadAccounts:()=>[]});
  vm.runInContext(extract('aiReconReport'),c);
  const r=c.aiReconReport(),finding=r.sections.find(x=>x.id==='weeks_no_income');
  assert.equal(finding.severity,'info');assert.match(finding.note,/Zero income can be correct/);
  assert.equal(r.totals.needsDecision,0);
});
test('dated irregular income retains its source instead of borrowing stale weekly income fields',()=>{
  const c=fixture({budgetData:{'2026-11-16':{inc_salary:1000}},
    ledgerData:[{kind:'income',streamId:'commission',date:'2026-11-17',amount:500}],
    loadIncCats:()=>[{id:'salary',name:'Salary'},{id:'commission',name:'Commission'}],catLabel:c=>c.name,
    WKR_VAR_GROUPS:[],WKR_GROUPS:[{id:'fixedBills'},{id:'other'}],
    statsWeekCatDefs:()=>[],statsWeekSpendQuality:()=>({}),ledgerOf:k=>c.ledgerData.filter(r=>r.kind===k)});
  vm.runInContext(fs.readFileSync('js/finance-periods.js','utf8'),c);c.budPeriodActive=()=>true;
  vm.runInContext(extract('wkrMoneyActuals'),c);
  const result=c.wkrMoneyActuals('2026-11-16',{money:{categoryMappings:{},irregularIncomeCatIds:['commission']}});
  assert.equal(result.incomeTotal,1000);assert.equal(result.irregularIncome,500);
  assert.equal(result.regularIncome,500,'only the undated legacy remainder stays unitemised');
  assert.equal(result.incomeRows.find(r=>r.id==='commission').label,'Commission');
  assert.ok(result.incomeRows.every(r=>r.amount>=0),'stale typed totals cannot create a negative payment');
  c.budgetData['2026-11-16']={inc_salary:500,inc_commission:500};
  c.ledgerData=[{kind:'income',streamId:'salary',date:'2026-11-17',amount:500}];
  const legacy=c.wkrMoneyActuals('2026-11-16',{money:{categoryMappings:{},irregularIncomeCatIds:['commission']}});
  assert.equal(legacy.regularIncome,500);assert.equal(legacy.irregularIncome,500,
    'a reconciled undated remainder retains its surviving source');
});
test('savings movement excludes deleted, invalid and nonpositive transfers and counts paired evidence once',()=>{
  const rows=[{id:'ok',date:'2026-11-04',amount:100,savingsMove:'contribution'},
    {id:'deleted',date:'2026-11-05',amount:500,savingsMove:'contribution',deletedAt:1},
    {date:'2026-02-30',amount:500,savingsMove:'contribution'},
    {date:'2026-11-05',amount:'oops',savingsMove:'contribution'},
    {date:'2026-11-05',amount:-50,savingsMove:'contribution'},
    {date:'2026-11-06',amount:30,savingsMove:'withdrawal'}];
  const c=fixture({loadAccounts:()=>[],ledgerOf:()=>rows,acctRecordedTransfers:()=>[
    {id:'movement',ledgerId:'ok',date:'2026-11-04',amount:100,savingsMove:'contribution'}]});
  vm.runInContext(extract('ledgerSavingsMovement'),c);
  assert.deepEqual(JSON.parse(JSON.stringify(c.ledgerSavingsMovement('2026-11-01','2026-11-18'))),
    {contributions:100,withdrawals:30,net:70,transfers:2});
});
