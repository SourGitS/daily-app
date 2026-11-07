const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {extract}=require('./harness.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
function fixture(){
  const week='2026-11-02',w={wk:week,inc_job:'500',sav_amount:'50',var_goal:'200',fixRates:{rent:100},updatedAt:10};
  const stores={daily_budget:{[week]:w},daily_budget_cycles:{config:{frequency:'weekly',anchor:week},periods:{}}},writes=[];
  const c=vm.createContext({Date,Math,Number,Set,Map,JSON,console,today:'2026-11-07',uid:'test',failSave:false,
    localStorage:{scope:'user:test'},acctToolUid:()=>c.uid,auth:{get currentUser(){return {uid:c.uid};}},
    getLocalDate:()=>c.today,localMidnight:s=>new Date(s+'T00:00:00'),
    dateStr:d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),
    lsLoad:(key,fallback)=>copy(stores[key]??fallback),lsSave:(key,value)=>{if(!c.failSave){stores[key]=copy(value);writes.push(key);}},
    budgetData:copy(stores.daily_budget),budDefaults:{varGoal:200},
    ledgerData:[{id:'pay',kind:'income',amount:500,date:'2026-11-03'},{id:'save',kind:'savings',amount:75,date:'2026-11-04'}],
    txnData:[{id:'buy',amount:20,date:'2026-11-05',catId:'food'}],
    loadIncCats:()=>[{id:'job',name:'Income'}],loadFixCats:()=>[{id:'rent',name:'Rent',budget:100}],
    loadVarCats:()=>[{id:'food',name:'Food'}],activeCats:x=>x,
    weekIncome:w=>Number(w.inc_job)||0,weekSavedAmt:w=>Number(w.sav_amount)||0,
    weekFixedTotal:()=>100,weekFixedContribution:(w,id)=>Number(w.fixRates?.[id]??100),
    weekVarTotal:(w,start)=>c.txnData.filter(x=>x.date>=start&&x.date<=c.budDateAdd(start,6)).reduce((n,x)=>n+x.amount,0),
    ledgerOf:kind=>c.ledgerData.filter(x=>x.kind===kind),catChargeableBudget:()=>100,
    budLoadData:()=>copy(stores.daily_budget),
    budSaveData:key=>{if(!c.failSave){stores.daily_budget=copy(c.budgetData);writes.push(['week',key]);}},
    budEnsureFixRates:w=>{w.fixRates||={rent:100};},budEnsureStatsSnapshot:()=>{},
    acctIsSaver:a=>a.type==='asset'&&a.saver===true,
    billOccurrences:(from,to)=>c.occurrences.filter(o=>o.key>=c.dateStr(from)&&o.key<=c.dateStr(to)),billsUndatedCount:()=>0,occurrences:[]
  });
  vm.runInContext(fs.readFileSync('js/finance-periods.js','utf8'),c);
  vm.runInContext(fs.readFileSync('js/accounts-tools.js','utf8'),c);
  c.getVarGoalDefault=()=>c.budDefaults.varGoal;
  vm.runInContext(extract('getWeekVarGoal'),c);
  vm.runInContext(fs.readFileSync('js/finance-plan.js','utf8'),c);
  return {c,stores,writes};
}
const charge=(date,amount,id='bill')=>({key:date,date:new Date(date+'T00:00:00'),amount,kind:'charge',name:'Bill',cat:{id}});
const draft=c=>({owner:c.budPlanOwner(),signature:c.budPlanBudgetSignature(),state:c.budPlanBudgetState()});

test('Plan commitment buckets share the recurrence reader and retain known statements separately identifiable',()=>{
  const {c,writes}=fixture();c.occurrences=[charge('2026-11-09',14),charge('2026-12-31',25),charge('2027-01-01',30),
    {key:'2026-11-27',amount:400,kind:'statement',name:'Card',acct:{id:'card'}},charge('2027-02-01',99)];
  const p=c.budPlanCommitments();assert.equal(p.total,469);assert.equal(p.range.end,'2027-01-31');
  assert.deepEqual(copy(p.months.map(m=>m.total)),[414,25,30]);assert.deepEqual(writes,[]);
  assert.equal(c.budPlanWindow('2028-02-29',1).end,'2028-02-29');
  assert.equal(c.budPlanWindow('2026-12-31',3).end,'2027-02-28');
});

test('scenarios prorate the partial calendar month in exact cents and keep savings separate from bills',()=>{
  const {c,writes,stores}=fixture();c.occurrences=[charge('2026-11-10',100)];const before=JSON.stringify(stores);
  const result=c.budPlanScenario({starting:'1000',income:'0',spending:'300',savings:'60'},c.budPlanCommitments('2026-11-07',1));
  assert.equal(result.ending,612);assert.equal(result.firstShortfall,null);
  assert.deepEqual(copy(result.rows.map(r=>[r.income,r.spending,r.savings,r.bills])),[[0,240,48,100]]);
  assert.equal(JSON.stringify(stores),before);assert.deepEqual(writes,[]);
});

test('the first shortfall is retained even when later income makes the ending balance positive',()=>{
  const {c}=fixture();c.occurrences=[charge('2026-11-07',30)];
  const r=c.budPlanScenario({starting:'0',income:'300',spending:'0',savings:'0'},c.budPlanCommitments('2026-11-07',1));
  assert.equal(r.firstShortfall,'2026-11-07');assert.equal(r.gap,20);assert.equal(r.ending,210);
});

test('covered charges are excluded only for their exact identity, including equal-named card statements',()=>{
  const {c}=fixture();c.occurrences=[{key:'2026-11-09',amount:100,kind:'statement',name:'Card',acct:{id:'one'}},
    {key:'2026-11-09',amount:200,kind:'statement',name:'Card',acct:{id:'two'}}];
  const p=c.budPlanCommitments('2026-11-07',1),key=c.budPlanChargeKey(p.items[0]);
  const r=c.budPlanScenario({starting:'500',income:'0',spending:'0',savings:'0',covered:[key]},p);
  assert.equal(r.coveredTotal,100);assert.equal(r.ending,300);assert.equal(r.rows[0].bills,200);
});

test('full leap months reconcile the entered monthly amounts and zero-cost scenarios invent no run-out date',()=>{
  const {c}=fixture(),p=c.budPlanCommitments('2028-02-01',1);
  const r=c.budPlanScenario({starting:'0',income:'580',spending:'290',savings:'29'},p);
  assert.equal(r.ending,261);assert.equal(r.rows[0].income,580);assert.equal(r.rows[0].spending,290);assert.equal(r.rows[0].savings,29);
  const zero=c.budPlanScenario({starting:'123.45',income:'0',spending:'0',savings:'0'},p);
  assert.equal(zero.ending,123.45);assert.equal(zero.firstShortfall,null);
  for(const starting of ['','-1','NaN','1.005','Infinity','99999999999999999999'])assert.throws(()=>c.budPlanScenario({starting,income:'0',spending:'0'},p));
});

test('budget targets update only the current inherited week and preserve the savings-record floor',()=>{
  const {c,stores,writes}=fixture();stores.daily_budget['2026-10-26']={inc_job:'400',sav_amount:'40',saved:true,updatedAt:5};
  c.budgetData=copy(stores.daily_budget);const old=copy(stores.daily_budget['2026-10-26']);
  assert.equal(c.budPlanBudgetState().kind,'week');assert.equal(c.budPeriodMoney().available,305);
  c.budPlanBudgetTargetsCommit(draft(c),150,180);
  assert.deepEqual(copy(writes),[['week','2026-11-02']]);assert.deepEqual(stores.daily_budget['2026-10-26'],old);
  assert.equal(c.budPeriodMoney().available,230);assert.equal(c.budPeriodMoney().record.goal,180);
  c.budPlanBudgetTargetsCommit(draft(c),0,0);
  assert.equal(c.budPeriodMoney().available,305,'recorded savings stay deducted once');
  assert.equal(c.budPeriodMoney().record.goal,0,'an explicit zero overrides the usual spending goal');
  assert.equal(c.budDefaults.varGoal,200,'the usual goal is not silently changed');
});

test('custom-period targets preserve funding, fixed allowances, rollover and all historical periods',()=>{
  const {c,stores,writes}=fixture();
  stores.daily_budget_cycles={config:{frequency:'fortnightly',anchor:'2026-11-01'},periods:{
    '2026-11-01_2026-11-14':{start:'2026-11-01',end:'2026-11-14',opening:100,savings:80,goal:250,reserves:{rent:200},fundingConfirmed:true,allocationsReviewed:true,notes:'Keep this',updatedAt:10},
    historical:{start:'2026-10-01',end:'2026-10-14',savings:40,finished:true,updatedAt:2}}};
  const before=copy(stores.daily_budget_cycles),weeks=copy(stores.daily_budget);
  assert.equal(c.budPlanBudgetState().kind,'period');c.budPlanBudgetTargetsCommit(draft(c),125,300);
  const after=stores.daily_budget_cycles;
  assert.equal(after.periods['2026-11-01_2026-11-14'].savings,125);
  for(const key of ['opening','reserves','fundingConfirmed','allocationsReviewed','notes'])assert.deepEqual(after.periods['2026-11-01_2026-11-14'][key],before.periods['2026-11-01_2026-11-14'][key]);
  assert.deepEqual(after.periods.historical,before.periods.historical);assert.deepEqual(stores.daily_budget,weeks);
  assert.deepEqual(writes,['daily_budget_cycles']);
});

test('no-op, invalid, changed-record, changed-account and rolled-over target drafts never overwrite data',()=>{
  const {c,writes,stores}=fixture();assert.equal(c.budPlanBudgetTargetsCommit(draft(c),50,200),false);assert.deepEqual(writes,[]);
  assert.throws(()=>c.budPlanBudgetTargetsCommit(draft(c),-1,200));
  let d=draft(c);c.ledgerData.push({kind:'income',amount:5,date:'2026-11-07'});assert.throws(()=>c.budPlanBudgetTargetsCommit(d,60,200),/changed/);
  d=draft(c);c.uid='other';assert.throws(()=>c.budPlanBudgetTargetsCommit(d,60,200),/changed/);
  c.uid='test';d=draft(c);c.today='2026-11-09';assert.throws(()=>c.budPlanBudgetTargetsCommit(d,60,200),/period changed/);
  assert.equal(stores.daily_budget['2026-11-02'].sav_amount,'50');assert.deepEqual(writes,[]);
});

test('an explicitly saved seven-day period owns its targets even if it retained an old inheritance marker',()=>{
  const {c,stores,writes}=fixture();
  stores.daily_budget_cycles.periods['2026-11-02_2026-11-08']={start:'2026-11-02',end:'2026-11-08',reserves:{rent:100},savings:50,goal:200,fundingConfirmed:true,inheritedWeeklyPlan:true};
  const week=copy(stores.daily_budget);assert.equal(c.budPlanBudgetState().kind,'period');
  c.budPlanBudgetTargetsCommit(draft(c),125,160);
  assert.equal(c.budPeriodMoney().record.savings,125);assert.equal(c.budPeriodMoney().record.inheritedWeeklyPlan,undefined);
  assert.deepEqual(stores.daily_budget,week);assert.deepEqual(writes,['daily_budget_cycles']);
});

test('a failed target save restores the in-memory week and leaves stored financial data intact',()=>{
  const {c,stores,writes}=fixture(),before=copy(c.budgetData);c.failSave=true;
  assert.throws(()=>c.budPlanBudgetTargetsCommit(draft(c),100,150),/could not be saved/);
  assert.deepEqual(copy(c.budgetData),before);assert.deepEqual(stores.daily_budget,before);assert.deepEqual(writes,[]);
});

test('goal suggestions use each saver account once, handle missing balances, and cap overdue contributions',()=>{
  const {c}=fixture(),range={days:7};
  const facts=c.budPlanGoalFacts([
    {id:'one',type:'asset',saver:true,current:500,savingsPlan:{goal:1500,targetDate:'2027-05-07'}},
    {id:'two',type:'asset',saver:true,current:null,savingsPlan:{goal:100,targetDate:'2026-11-10'}},
    {id:'past',type:'asset',saver:true,current:20,savingsPlan:{goal:100,targetDate:'2026-11-01'}},
    {id:'archived',type:'asset',saver:true,current:0,archivedAt:1,savingsPlan:{goal:999}}
  ],range);
  assert.equal(facts.length,3);assert.equal(facts[0].contribution,38.47);assert.equal(facts[1].contribution,null);assert.equal(facts[2].contribution,80);
});

test('scenario drafts clear across owners without persisting their inputs',()=>{
  const {c,writes}=fixture(),d=c.budPlanEnsureDraft();d.starting='1234';d.covered=['bill'];
  c.uid='another';assert.equal(c.budPlanEnsureDraft().starting,'');assert.deepEqual(copy(c.budPlanEnsureDraft().covered),[]);assert.deepEqual(writes,[]);
});
