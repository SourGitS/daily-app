const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { extract, extractConst } = require('./harness.cjs');
const period = {id:'2026-11-01_2026-11-30',start:'2026-11-01',end:'2026-11-30',days:30};

function fixture(){
  const form={}, nodes={'bp-form':form,'bp-error':{},'bud-period-dialog':{close(){this.closed=true}}};
  const store={daily_budget_cycles:{config:{frequency:'monthly',anchor:period.start},periods:{
    [period.id]:{start:period.start,end:period.end,opening:1000,goal:100,reserves:{},fundingConfirmed:true}
  }}};
  const fields={opening:'1000',goal:'200',savings:'0',amount:'800',destination:'budget'};
  const c=vm.createContext({
    console,Date,Math,accounts:[],txnData:[],ledgerData:[],budgetData:{},_txnCatId:'food',
    today:'2026-11-16',getLocalDate:()=>c.today,localStorage:{scope:'user:one'},escText:String,escAttr:String,
    document:{getElementById:id=>nodes[id]},FormData:class{get(key){return fields[key]}},
    lsLoad:(key,fallback)=>structuredClone(store[key]??fallback),lsSave:(key,value)=>{store[key]=structuredClone(value)},
    activeCats:list=>list.filter(x=>!x.archived),loadFixCats:()=>[],loadIncCats:()=>[],loadVarCats:()=>[],
    ledgerOf:k=>c.ledgerData.filter(x=>x.kind===k),incomePayCycle:x=>x.payCycle,
    dateStr:d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),
    localMidnight:s=>new Date(s+'T00:00:00'),catLabel:x=>x.name,showToast:()=>{}
  });
  for(const file of ['finance-periods','finance-plan','accounts-tools','finance-accounts']){
    vm.runInContext(fs.readFileSync('js/'+file+'.js','utf8'),c);
  }
  vm.runInContext(['TXN_CARRY_SOURCE','TXN_CARRY_MERCHANT','TXN_CARRY_NOTE','CAT_CHARGE_TYPES'].map(extractConst)
    .concat(['billOccurrences','accountsNetWorth','accountsAssetsTotal','accountsDebtsTotal','accountsSaverTotal','acctIsSaver',
      'txnIsCarryRecord','txnWeekOf','weekKey','txnReadForm','billIsScheduled','catIsArchived','catIsCharging','catStatus',
      'catIsRecurring','catChargeType','catCycle','catAmount','catOccurrencesBetween','catPaymentAccount','billsUndatedCount'
    ].map(extract)).join('\n'),c);
  c.budPeriodDialog=()=>{}; c.budPeriodRefresh=()=>{}; c.budPeriodLabel=p=>p.id;
  return {c,store,nodes,fields,submit:()=>form.onsubmit({preventDefault(){},target:form})};
}

test('Budget settings preserve unrelated concurrent edits and reject changes to the open period or owner',()=>{
  const {c,store,nodes,submit}=fixture();
  c.budPeriodAdjust();store.daily_budget_cycles.periods.other={opening:750};submit();
  assert.equal(store.daily_budget_cycles.periods.other.opening,750);
  assert.equal(store.daily_budget_cycles.periods[period.id].goal,200);
  c.budPeriodAdjust();store.daily_budget_cycles.periods[period.id].goal=275;submit();
  assert.equal(store.daily_budget_cycles.periods[period.id].goal,275);
  assert.match(nodes['bp-error'].textContent,/changed/i);
  c.budPeriodAdjust();c.localStorage.scope='user:two';submit();
  assert.equal(store.daily_budget_cycles.periods[period.id].goal,275);
});

test('rollover uses the current available funds and preserves unrelated periods',()=>{
  const {c,store,nodes,submit}=fixture();
  c.today='2026-12-01';c.budPeriodViewed=()=>period;
  c.budPeriodRollover();c.txnData.push({id:'new',date:'2026-11-22',amount:600});submit();
  assert.match(nodes['bp-error'].textContent,/changed/i);assert.equal(store.daily_budget_cycles.periods[period.id].rollover,undefined);
  c.txnData=[];c.budPeriodRollover();store.daily_budget_cycles.periods.other={opening:750};submit();
  assert.equal(store.daily_budget_cycles.periods[period.id].rollover.amount,800);
  assert.equal(store.daily_budget_cycles.periods.other.opening,750);
});

test('editing a followed payday preserves the old period until the scheduled change or cancellation',()=>{
  const {c,store}=fixture();
  let source={id:'job',payCycle:'weekly',payDate:'2026-11-02'};
  c.loadIncCats=()=>[source];
  store.daily_budget_cycles={config:{frequency:'weekly',anchor:source.payDate,sourceId:source.id},periods:{}};
  const original=c.budPeriodCurrent(),previous=c.budCyclesLoad();
  source={...source,payCycle:'monthly',payDate:'2026-11-01'};
  const plan=c.budPeriodTransitionPlan(previous,c.budIncomePeriodConfig(source),c.today,'next');
  store.daily_budget_cycles=c.budPeriodApplyTransition(previous,plan,'retarget');
  assert.equal(c.budPeriodCurrent().id,original.id);
  c.today='2026-11-23';assert.equal(c.budPeriodCurrent().start,c.today);
  c.today='2026-12-01';assert.equal(c.budPeriodCurrent().end,'2026-12-31');
  c.today='2026-11-16';c.budPeriodCancelTransition();assert.equal(c.budPeriodCurrent().id,original.id);
});

test('archived accounts keep history while leaving live totals and statement schedules',()=>{
  const {c}=fixture();
  c.accounts=[{type:'asset',current:1000},{type:'asset',saver:true,archivedAt:1,current:500},
    {id:'card',type:'debt',archivedAt:1,current:350,tracksStatement:true,statementBalance:180,dueDate:'2026-11-20'}];
  const window=[c.localMidnight(c.today),c.localMidnight('2026-11-30')];
  assert.equal(c.accountsNetWorth(),1000);assert.equal(c.accountsSaverTotal(),0);assert.equal(c.billOccurrences(...window).length,0);
  delete c.accounts[2].archivedAt;
  assert.equal(c.accountsNetWorth(),650);assert.equal(c.billOccurrences(...window)[0].amount,180);
});

test('custom periods step in both directions by their own length',()=>{
  const {c}=fixture(),store={config:{frequency:'custom',anchor:period.start,end:period.end}};
  assert.equal(c.budPeriodRangeForStore(store,c.today,1).start,'2026-12-01');
  assert.equal(c.budPeriodRangeForStore(store,c.today,2).start,'2026-12-31');
  assert.equal(c.budPeriodRangeForStore(store,c.today,-2).end,'2026-10-01');
});

test('manual carry belongs to a whole week and never becomes a dated expense',()=>{
  const {c}=fixture(),tx=[{id:'carry',date:'2026-11-05',amount:200,carryWeek:'2026-11-02',carrySource:'manual-weekly-total'},
    {id:'purchase',date:'2026-11-05',amount:20}];
  for(const dates of [['2026-11-05','2026-11-18'],['2026-11-01','2026-11-03']]){
    const m=c.budPeriodCompute({start:dates[0],end:dates[1]},{opening:1000},[],tx,{},{});
    assert.equal(m.incomplete,true);assert.equal(m.available,null);assert.ok(m.spent<=20);
  }
  const m=c.budPeriodCompute(period,{opening:1000},[],tx,{},{});assert.equal(m.available,780);
  assert.equal(m.legacySpent,200);assert.equal(m.purchases.length,1);
  assert.doesNotMatch(c.budPeriodCSVText(m),/"carry","2026-11-05"/);
});

test('expense form accepts signed AUD cents and rejects malformed or overprecise input',()=>{
  const {c,nodes}=fixture();
  for(const name of ['amount','date','merchant','note','account','essential','err'])nodes['txn-'+name]={value:'',focus(){}};
  for(const invalid of ['10+5','10–15','12.3.4','12.345','9,99','0','10000000000000000']){
    nodes['txn-amount'].value=invalid;assert.equal(c.txnReadForm(),null,invalid);
  }
  for(const [text,amount] of [['$1,234.50',1234.5],['-12.35',-12.35],['.50',0.5]]){
    nodes['txn-amount'].value=text;assert.equal(c.txnReadForm().amount,amount);
  }
});

test('a posted transfer can clear an overdraft with cent-exact combined balances',()=>{
  const {c}=fixture(),list=[{id:'from',type:'asset',category:'cash',current:100.05},{id:'to',type:'asset',category:'cash',current:-25.15}];
  const moved=c.acctTransferBuild(list,{from:'from',to:'to',amount:50.10,posted:true,token:'t'});
  assert.equal(moved[0].current,49.95);assert.equal(moved[1].current,24.95);
  assert.throws(()=>c.acctTransferBuild(list,{from:'from',to:'to',amount:-50,posted:true,token:'t'}));
});

test('savings events reconcile to the period CSV summary',()=>{
  const {c}=fixture();
  const m=c.budPeriodCompute(period,{opening:1000},[{id:'s1',date:period.start,kind:'savings',amount:20.1},
    {id:'s2',date:period.end,kind:'savings',amount:30}],[],{},{});
  const csv=c.budPeriodCSVText(m);assert.match(csv,/"Savings recorded","50.1"/);
  assert.match(csv,/"s1","2026-11-01","savings","20.1"/);assert.match(csv,/"s2","2026-11-30","savings","30"/);
});

test('a dated bill with no price keeps Plan totals partial and the ending projection unknown',()=>{
  const {c}=fixture();
  const bill={id:'b',name:'Phone',chargeType:'bill',cycle:'weekly',dueDate:'2026-11-20',amount:''};
  c.loadFixCats=()=>[bill];
  const run=()=>{const costs=c.budPlanCommitments(c.today,1);
    return {costs,r:c.budPlanScenario({starting:100,income:0,spending:0},costs)}};
  const {costs,r}=run();assert.equal(costs.unpriced,2);assert.equal(r.ending,null);assert.match(c.budPlanScenarioResultHtml(r),/Ending funds unknown/);
  const covered=costs.items.map(c.budPlanChargeKey);
  assert.equal(c.budPlanScenario({starting:100,income:0,spending:0,covered},costs).ending,100);
  bill.amount=0;assert.equal(run().r.ending,100);bill.amount=15;assert.equal(run().r.ending,70);
});
