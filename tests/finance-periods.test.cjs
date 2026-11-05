const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {extract,extractConst}=require('./harness.cjs');
const plain=x=>JSON.parse(JSON.stringify(x));
function context(extra={}){
  const stores={},ctx=vm.createContext({console,Date,Set,Number,Math,
    lsLoad:(k,f)=>stores[k]??f,lsSave:(k,v)=>stores[k]=plain(v),getLocalDate:()=> '2026-10-04',
    localMidnight:s=>new Date(s+'T00:00:00'),dateStr:d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),
    ...extra});
  vm.runInContext(fs.readFileSync('js/finance-periods.js','utf8'),ctx);return ctx;
}
const period={id:'2026-10-02_2026-10-15',start:'2026-10-02',end:'2026-10-15',days:14};

test('budget keeps the original phone unknown amount and desktop guidance',()=>{
  const c=context({lsSave:()=>{throw Error('Rendering must not save');},
    homeBudgetDestination:()=>'<a href="#budget">Budget</a>',cardHeader:(icon,label,status='')=>'<header>'+label+status+'</header>',
    tstat:(kind,label)=>'<span>'+label+'</span>',fmtMoneyExact:n=>'$'+n});
  c.budPeriodLabel=()=> '2–15 Oct';
  let money={range:period,record:{goal:450},available:null,income:0,spent:0,incomplete:true,allocationReview:false};
  c.budPeriodMoney=()=>money;
  const before=JSON.stringify(money);
  assert.match(c.budPeriodHomeCard('desktop'),/Check your budget dates/);
  assert.doesNotMatch(c.budPeriodHomeCard('desktop'),/Available to spend|card-fig/);
  assert.match(c.budPeriodHomeCard('mobile'),/card-fig">—/);
  assert.doesNotMatch(c.budPeriodHomeCard('mobile'),/home-budget-review/);
  assert.equal(c.budPeriodHomeCard('desktop'),c.budPeriodHomeCard());
  assert.equal(JSON.stringify(money),before);
  money={...money,incomplete:false};assert.match(c.budPeriodHomeCard('desktop'),/Set your starting funds/);
  money={...money,allocationReview:true};assert.match(c.budPeriodHomeCard('desktop'),/Confirm the allocations/);
  money={...money,available:0,incomplete:false,allocationReview:false};
  assert.match(c.budPeriodHomeCard('desktop'),/card-fig">\$0/);
  assert.equal(c.budPeriodHomeCard('desktop'),c.budPeriodHomeCard('mobile'));
  const snapshot=JSON.stringify(money),combined=c.budPeriodHomeCard('combined');
  assert.match(combined,/<\/header>[\s\S]*home-budget-inline-status/);
  assert.equal((combined.match(/On track/g)||[]).length,1);
  assert.doesNotMatch(c.budPeriodHomeCard('mobile'),/home-budget-inline-status/);
  assert.equal(JSON.stringify(money),snapshot);
});
test('one fortnightly payday funds both calendar weeks, through the DST boundary',()=>{
  const c=context(),cfg={frequency:'fortnightly',anchor:'2026-10-02'};
  for(const date of ['2026-10-02','2026-10-04','2026-10-05','2026-10-15'])assert.deepEqual(plain(c.budPeriodRange(cfg,date,0)),period);
  assert.equal(c.budPeriodRange(cfg,'2026-10-16',0).start,'2026-10-16');
  const m=c.budPeriodCompute(period,{},[{kind:'income',date:'2026-10-02',amount:2000}],[{date:'2026-10-10',amount:200}],{},{});
  assert.equal(m.available,1800);assert.equal(m.income,2000);
});
test('monthly boundaries retain the original month-end anchor through February and leap years',()=>{
  const c=context();
  assert.deepEqual(plain(c.budPeriodRange({frequency:'monthly',anchor:'2026-01-31'},'2026-02-28',0)),{id:'2026-02-28_2026-03-30',start:'2026-02-28',end:'2026-03-30',days:31});
  assert.equal(c.budPeriodRange({frequency:'monthly',anchor:'2024-01-31'},'2024-02-29',0).start,'2024-02-29');
  assert.equal(c.budPeriodRange({frequency:'monthly',anchor:'2026-01-31'},'2026-03-31',0).start,'2026-03-31');
});
test('weekly/custom navigation uses calendar dates and rejects malformed ranges',()=>{
  const c=context();assert.equal(c.budPeriodRange({frequency:'weekly',anchor:'2026-10-02'},'2026-10-01',0).start,'2026-09-25');
  const cfg={frequency:'custom',anchor:'2026-10-02',end:'2026-10-20'};
  assert.equal(c.budPeriodRange(cfg,'2026-11-01',0).days,19);
  assert.equal(c.budPeriodRange(cfg,'2026-11-01',1).start,'2026-10-21');
  assert.equal(c.budPeriodRange({...cfg,end:'2026-09-30'},'2026-10-04',0),null);
  assert.equal(c.budPeriodRange({...cfg,anchor:'2026-02-30'},'2026-10-04',0),null);
});
test('multiple actual income sources add once; transfers and expected income cannot fund the budget',()=>{
  const c=context(),events=[{kind:'income',date:'2026-10-02',amount:2000},{kind:'income',date:'2026-10-10',amount:120},{kind:'transfer',date:'2026-10-02',amount:9000},{kind:'income',date:'2026-10-16',amount:2000}];
  const m=c.budPeriodCompute(period,{},events,[{date:'2026-10-15',amount:23.45},{date:'2026-10-16',amount:99}],{},{});
  assert.equal(m.income,2120);assert.equal(m.available,2096.55);
});
test('recorded savings reduce spending once while a larger savings target keeps the remainder reserved',()=>{
  const c=context(),events=[{kind:'income',date:'2026-10-02',amount:1000},{kind:'savings',date:'2026-10-03',amount:75}];
  let m=c.budPeriodCompute(period,{savings:200},events,[],{},{});
  assert.equal(m.savingsRecorded,75);assert.equal(m.savingsRemaining,125);assert.equal(m.savingsCommitted,200);assert.equal(m.available,800);
  m=c.budPeriodCompute(period,{savings:50},events,[],{},{});
  assert.equal(m.savingsCommitted,75);assert.equal(m.savingsRemaining,0);assert.equal(m.available,925);
});
test('income and savings recording use matching visual actions',()=>{
  const c=context({escAttr:String,escText:String,fmtDate:String,fmtMoneyExact:n=>'$'+n});
  const html=c.budPeriodRecordActivity({income:900,savingsRecorded:200,rows:[]});
  assert.equal((html.match(/class="bud-record-tile"/g)||[]).length,2);
  assert.equal((html.match(/class="bud-record-action"/g)||[]).length,2);
  assert.match(html,/Income received[\s\S]*\$900[\s\S]*Record income/);
  assert.match(html,/Savings recorded[\s\S]*\$200[\s\S]*Record savings/);
  assert.doesNotMatch(html,/primary/);
});
test('record savings creates one dated ledger record without changing an account balance',()=>{
  const submit={textContent:''},form={elements:{amount:{value:'125'},date:{value:'2026-10-04'},note:{value:'Emergency fund'}},querySelector:()=>submit};
  const nodes={'bp-form':form,'bud-period-dialog':{close(){}},'bp-error':{textContent:''}};const events=[];let writes=0;
  const c=context({document:{getElementById:id=>nodes[id]},FormData:class{constructor(f){this.f=f;}get(k){return this.f.elements[k]?.value||'';}has(){return false;}},
    budgetData:{},ledgerData:events,ledgerOf:()=>[],txnWeekOf:()=> '2026-09-28',genLedgerId:()=> 'save-1',saveLedger:()=>writes++});
  c.budPeriodDialog=()=>{};c.budPeriodRefresh=()=>{};c.budPeriodRecord('savings');
  form.onsubmit({preventDefault(){},target:form});form.onsubmit({preventDefault(){},target:form});
  assert.equal(submit.textContent,'Record savings');assert.equal(writes,1);assert.deepEqual(plain(events),[{id:'save-1',kind:'savings',date:'2026-10-04',amount:125,note:'Emergency fund',createdAt:events[0].createdAt,manual:true}]);
  assert.equal(events[0].accountLink,undefined);
});
test('bill payment consumes its own reserve rather than deducting the same bill twice',()=>{
  const c=context(),record={opening:1000,reserves:{rent:500,phone:50},savings:100};
  const before=c.budPeriodCompute(period,record,[],[],{},{});
  const after=c.budPeriodCompute(period,record,[{kind:'bill_payment',fixCatId:'rent',date:'2026-10-03',amount:500}],[],{},{});
  assert.equal(before.available,350);assert.equal(after.available,350);assert.equal(after.reserved,50);assert.equal(after.billPaid,500);
  const over=c.budPeriodCompute(period,record,[{kind:'bill_payment',fixCatId:'rent',date:'2026-10-03',amount:600}],[],{},{});
  assert.equal(over.available,250);assert.equal(over.reserved,50);
});
test('rollover is counted once only in its selected destination and never becomes income',()=>{
  const c=context(),prev={rollover:{to:period.id,amount:125,destination:'budget'}};
  const m=c.budPeriodCompute(period,{},[],[],{previous:prev},{});assert.equal(m.available,125);assert.equal(m.income,0);
  for(const destination of ['savings','unallocated']){
    const other=c.budPeriodCompute(period,{},[],[],{previous:{rollover:{...prev.rollover,destination}}},{});
    assert.equal(other.incoming,0);assert.equal(other.available,null);
  }
  const source=c.budPeriodCompute(period,{opening:500,rollover:{amount:125,destination:'savings'}},[],[],{},{});
  assert.equal(source.available,375);assert.equal(source.savings,0);
});
test('unknown funding stays unknown, explicitly zero funding is zero and overspend can be negative',()=>{
  const c=context();assert.equal(c.budPeriodCompute(period,{},[],[],{},{}).available,null);
  assert.equal(c.budPeriodCompute(period,{fundingConfirmed:true},[],[],{},{}).available,0);
  assert.equal(c.budPeriodCompute(period,{opening:10},[],[{date:'2026-10-03',amount:20}],{},{}).available,-10);
});
test('overlapping undated weekly totals are never apportioned into guessed days',()=>{
  const weeks={'2026-09-28':{income:1000,spent:50},'2026-10-05':{income:500,spent:30}};
  const c=context({budgetData:weeks,txnData:[],ledgerOf:()=>[],weekIncome:w=>w.income,weekVarTotal:w=>w.spent});
  const before=JSON.stringify(weeks),old=c.budPeriodLegacy(period);
  assert.deepEqual(plain(old),{income:500,spent:30,incomplete:true});assert.equal(JSON.stringify(weeks),before);
  assert.equal(c.budPeriodCompute(period,{opening:200},[],[],{},old).available,null);
});
test('legacy weekly income and expenses already itemised are not counted a second time',()=>{
  const events=[{kind:'income',date:'2026-10-06',amount:500}],expenses=[{date:'2026-10-06',amount:30}];
  const c=context({budgetData:{'2026-10-05':{}},txnData:expenses,ledgerOf:()=>events,weekIncome:()=>500,weekVarTotal:()=>30});
  const old=c.budPeriodLegacy(period);assert.deepEqual(plain(old),{income:0,spent:0,incomplete:false});
  assert.equal(c.budPeriodCompute(period,{},events,expenses,{},old).available,470);
});
test('older bill and savings allocations require an explicit review before presenting spendable money',()=>{
  const c=context({budgetData:{'2026-10-05':{sav_amount:100,fixRates:{rent:250}}},txnData:[],ledgerOf:()=>[],weekIncome:()=>1000,weekVarTotal:()=>50});
  const old=c.budPeriodLegacy(period);assert.equal(old.allocationReview,true);
  assert.equal(c.budPeriodCompute(period,{},[],[],{},old).available,null);
  assert.equal(c.budPeriodCompute(period,{fundingConfirmed:true,savings:100,reserves:{rent:250}},[],[],{},old).available,600);
});
test('new period mode anchors calendar reports to today instead of the previous month’s Monday',()=>{
  const c=context({getMondayOf:()=>new Date(2026,8,28),budPeriodActive:()=>true});
  vm.runInContext(extract('getMonthDate'),c);
  // Override the real feature detector after loading the date helpers.
  c.budPeriodActive=()=>true;assert.equal(c.dateStr(c.getMonthDate(0)),'2026-10-01');
});
test('twice-monthly pay uses two calendar days rather than adding fourteen days',()=>{
  const c=context(),pay={payDate:'2026-01-15',paySecondDay:31};
  assert.equal(c.dateStr(c.incomeTwiceMonthlyNext(pay,'2026-02-16')),'2026-02-28');
  assert.equal(c.dateStr(c.incomeTwiceMonthlyNext(pay,'2026-03-01')),'2026-03-15');
  assert.equal(c.dateStr(c.incomeTwiceMonthlyNext(pay,'2026-03-16')),'2026-03-31');
  assert.equal(c.incomeTwiceMonthlyNext({...pay,paySecondDay:15},'2026-03-01'),null);
});
test('calendar reports clamp only the current month and keep future ranges in order',()=>{
  const c=context();c.budCalendarFactsHtml=(start,end)=>({start,end});
  assert.deepEqual(plain(c.budCalendarMonthHtml(new Date(2026,9,1))),{start:'2026-10-01',end:'2026-10-04'});
  assert.deepEqual(plain(c.budCalendarMonthHtml(new Date(2026,10,1))),{start:'2026-11-01',end:'2026-11-30'});
});
test('new desktop profiles get the requested six cards; legacy Grid and saved Dashboard survive',()=>{
  const c=context({loadHomeOrder:()=>null});
  vm.runInContext(['HOME_DEFAULT_WIDE','HOME_DASH_DEFAULT'].map(extractConst).join('\n')+'\n'+['homeDashNormalise','homeLayoutProfileNormalise','homeLayoutsNormalise'].map(extract).join('\n'),c);
  const fresh=c.homeLayoutsNormalise(null,0);assert.equal(fresh.desktop.composition,'dashboard');
  assert.deepEqual(plain(fresh.desktop.dashboard.main.filter(x=>x!=='session').slice(0,3)),['review','notes','habits']);
  assert.deepEqual(plain(fresh.desktop.dashboard.summary.filter(x=>!['weather','budget'].includes(x)).slice(0,3)),['balance','calories','weight']);
  assert.equal(c.homeLayoutsNormalise({order:['notes','session']},44).desktop.composition,'grid');
  c.loadHomeOrder=()=>[];assert.equal(c.homeLayoutsNormalise(null,0).desktop.composition,'grid');
  const saved={schemaVersion:2,mobile:{order:['weight'],hidden:['budget'],updatedAt:20},desktop:{composition:'dashboard',dashboard:{main:['notes','review'],summary:['weight']},hidden:['balance'],updatedAt:40}};
  const result=c.homeLayoutsNormalise(saved,40);assert.deepEqual(plain(result.desktop.dashboard),saved.desktop.dashboard);assert.deepEqual(plain(result.desktop.hidden),['balance']);assert.deepEqual(plain(result.mobile.order),['weight']);
});
test('calendar reports attribute an October payment to October even when its budget week began in September',()=>{
  const c=context({budgetData:{'2026-09-28':{}},txnData:[{date:'2026-10-03',amount:125}],ledgerData:[{kind:'income',date:'2026-10-02',amount:2000},{kind:'bill_payment',date:'2026-10-03',amount:500}],
    ledgerOf:()=>[{date:'2026-10-02',amount:2000}],weekIncome:()=>2000,weekVarTotal:()=>125});
  const m=c.budRecordedRange('2026-10-01','2026-10-31');assert.equal(m.income,2000);assert.equal(m.spent,125);assert.equal(m.billPaid,500);assert.equal(m.incomplete,false);
});
test('reading an unconfigured budget never writes or seeds a store',()=>{
  let writes=0;const c=context({lsSave:()=>writes++});assert.equal(c.budPeriodCurrent(),null);assert.equal(c.budPeriodMoney(),null);assert.equal(c.budPeriodActive(),false);assert.equal(writes,0);
});
test('period CSV leaves unknown money blank and exports recorded payments once',()=>{
  const c=context(),m=c.budPeriodCompute(period,{},[{id:'bill-1',kind:'bill_payment',date:'2026-10-03',amount:500}],[],{},{});
  const csv=c.budPeriodCSVText(m);assert.match(csv,/"Remaining spending budget",""/);
  assert.equal(csv.split('"bill-1"').length-1,1);assert.match(csv,/"Bills paid","500"/);
});
test('weekly review uses actual payments and preserves a frozen legacy review',()=>{
  const c=context({budgetData:{},txnData:[{date:'2026-10-03',amount:125}],ledgerData:[{kind:'income',date:'2026-10-02',amount:2000},{kind:'bill_payment',fixCatId:'rent',date:'2026-10-03',amount:500}],
    ledgerOf:()=>[],WKR_VAR_GROUPS:[],WKR_GROUPS:[{id:'fixedBills'},{id:'other'}],
    statsWeekCatDefs:(d,w,kind)=>kind==='variable'?[{id:'food',label:'Food'}]:[],varCatAmount:()=>125,
    loadFixCats:()=>[{id:'rent',name:'Rent'}],loadIncCats:()=>[],weekIncomeKeys:()=>[],statsWeekSpendQuality:()=>({})});
  c.budPeriodActive=()=>true;
  vm.runInContext(['wkrMoneyActuals','wkrDisplayActuals'].map(extract).join('\n'),c);
  const plan={money:{categoryMappings:{}}},m=c.wkrMoneyActuals('2026-09-28',plan);
  assert.equal(m.spendTotal,625);assert.equal(m.fixed,500);assert.equal(m.incomeTotal,2000);assert.equal(m.leftover,1375);
  assert.equal(m.periodMode,true);assert.equal(m.saved,0);assert.equal(m.hasData,true);
  const frozen={hasData:true,spendTotal:375,leftover:1425};
  assert.deepEqual(plain(c.wkrDisplayActuals('2026-09-28',{status:'completed',actualSnapshot:{money:frozen}},plan)),frozen);
});
test('swipeable update popup waits for restore and can be seen after dismissing the old banner',()=>{
  const c=context({profileData:{onboardingVersion:2,lastSeenWhatsNew:999},auth:{currentUser:{uid:'A'}},_cloudWorkoutReady:false});
  assert.equal(c.dailyUpdateBannerHtml(),'');assert.equal(c.dailyUpdatePopupEligible(),false);c._cloudWorkoutReady=true;assert.equal(c.dailyUpdatePopupEligible(),true);
  c.profileData.budgetRhythmSeen=1;assert.equal(c.dailyUpdatePopupEligible(),true);c.profileData.budgetRhythmSeen=2;assert.equal(c.dailyUpdatePopupEligible(),false);
  c.profileData={onboardingVersion:0};assert.equal(c.dailyUpdatePopupEligible(),false);
});
test('saving another profile field cannot undo a banner acknowledgement from another device',()=>{
  let cloud={name:'Before',budgetRhythmSeen:1,homeCustomiseSeen:1};
  const c=context({_bootPhase:false,_syncApplying:false,profileData:{name:'After'},fbRef:()=>({transaction:fn=>cloud=fn(cloud)})});
  vm.runInContext(extract('syncProfileToFirebase'),c);c.syncProfileToFirebase();assert.equal(cloud.name,'After');assert.equal(cloud.budgetRhythmSeen,1);assert.equal(cloud.homeCustomiseSeen,1);
});
test('budget-period configuration uses the registered blob path for sync and restore',()=>{
  const source=fs.readFileSync('js/app.js','utf8');assert.match(source,/syncBlobListen\(user.uid,'budgetCycles','daily_budget_cycles'/);
  let write;const c=context({lsSave:(...args)=>write=args});c.budCyclesSave({config:{frequency:'weekly'},periods:{}});assert.equal(write[0],'daily_budget_cycles');assert.equal(write[2],'budgetCycles');
});
test('an exact saved week retains its allocations and goal without a confirmation or write',()=>{
  const weeks={'2026-09-28':{inc_salary:1200,sav_amount:160,var_goal:300,fixRates:{rent:250}}},before=JSON.stringify(weeks);
  const c=context({budgetData:weeks,ledgerData:[],ledgerOf:()=>[],txnData:[{date:'2026-10-03',amount:210}],
    loadFixCats:()=>[{id:'rent',budget:999}],weekFixedContribution:(w,id)=>w.fixRates[id],weekFixedTotal:w=>w.fixRates.rent,
    weekIncome:w=>w.inc_salary,weekVarTotal:()=>210,weekSavedAmt:w=>w.sav_amount,getWeekVarGoal:w=>w.var_goal});
  c.budCyclesSave({config:{frequency:'weekly',anchor:'2026-09-28'},periods:{}});
  let writes=0;c.lsSave=()=>writes++;
  const m=c.budPeriodMoney();assert.equal(m.available,580);assert.equal(m.reserved,250);assert.equal(m.savings,160);assert.equal(m.record.goal,300);
  assert.equal(m.allocationReview,false);assert.equal(writes,0);assert.equal(JSON.stringify(weeks),before);
});
test('an explicit period allocation remains authoritative over a matching old week',()=>{
  const c=context(),p={start:'2026-09-28',end:'2026-10-04',days:7},saved={fundingConfirmed:true,savings:80,reserves:{rent:90}};
  assert.deepEqual(plain(c.budPeriodInheritedPlan(p,saved)),saved);
});
test('changing to a payday period prorates every fixed expense without writing or changing its definition',()=>{
  const cats=[
    {id:'rent',name:'Rent',amount:1300,cycle:'monthly',dueDate:'2026-10-05'},
    {id:'gym',name:'Gym',amount:20,cycle:'weekly',dueDate:'2026-10-02'},
    {id:'insurance',name:'Insurance',amount:130,cycle:'monthly'},
    {id:'paused',name:'Paused',amount:15,cycle:'weekly',status:'paused'}
  ],before=JSON.stringify(cats);
  let writes=0;
  const c=context({loadFixCats:()=>cats,activeCats:x=>x,
    catChargeableBudget:x=>x.status==='paused'?0:x.id==='insurance'?30:x.id==='rent'?300:20,
    lsSave:()=>writes++});
  const suggested=c.budPeriodInheritedPlan(period,null);
  assert.deepEqual(plain(suggested.reserves),{rent:600,gym:40,insurance:60,paused:0});
  assert.equal(suggested.provisionalFixedPlan,true);
  assert.equal(writes,0);assert.equal(JSON.stringify(cats),before);
});
test('an old all-zero period repairs even if the broken migration marked it reviewed',()=>{
  const c=context({loadFixCats:()=>[{id:'rent'},{id:'gym'}],activeCats:x=>x,catChargeableBudget:x=>x.id==='rent'?300:20});
  const saved={start:period.start,end:period.end,fundingConfirmed:true,reserves:{rent:0,gym:0},updatedAt:10};
  const repair=c.budPeriodInheritedPlan(period,saved);
  assert.equal(repair.automaticFixedRepair,true);assert.deepEqual(plain(repair.reserves),{rent:600,gym:40});
  assert.deepEqual(saved.reserves,{rent:0,gym:0});
  assert.deepEqual(plain(c.budPeriodSuggestedReserves(period)),{rent:600,gym:40});
  const reviewed={...saved,allocationsReviewed:true};
  assert.equal(c.budPeriodInheritedPlan(period,reviewed).automaticFixedRepair,true);
  const confirmed={...reviewed,zeroFixedConfirmed:true};
  assert.equal(c.budPeriodInheritedPlan(period,confirmed).automaticFixedRepair,true);
  assert.equal(c.budPeriodZeroConfirmed(period,{rent:0,gym:0}),true);
  assert.equal(c.budPeriodZeroConfirmed(period,{rent:1,gym:0}),false);
});
test('week view shows a calculated read-only fixed expense snapshot',()=>{
  const cats=[{id:'rent',name:'Rent'}],c=context({loadFixCats:()=>cats,activeCats:x=>x,catChargeableBudget:()=>300,
    budCatNameHtml:(type,cat)=>'<span>'+cat.name+'</span>',catLabel:x=>x.name,escAttr:x=>x,escText:x=>x,
    fmtMoneyExact:n=>'$'+n,budPeriodLabel:()=> '2–15 Oct'});
  c.budPeriodLabel=()=> '2–15 Oct';
  const money={range:period,record:{reserves:{rent:600}},rows:[]};
  const html=c.budPeriodFixedRows(money);
  assert.match(html,/read-only snapshot/);assert.match(html,/Rent[\s\S]*\$600/);
  assert.match(html,/Manage recurring bills/);assert.doesNotMatch(html,/data-period-reserve|type="number"|Manage rows|data-period-archive/);
});
test('week view archive keeps the row definition and uses the reversible category archive path',()=>{
  const cats=[{id:'rent',name:'Rent'}];let archive=null,saves=0,toast='';
  const c=context({loadFixCats:()=>cats,catLabel:x=>x.name,confirm:()=>true,budSaveDraft:()=>saves++,
    catArchive:(...args)=>archive=args,showToast:s=>toast=s});
  c.budPeriodArchiveFixed('rent');
  assert.deepEqual(plain(archive),['fix','rent',true]);assert.equal(saves,1);assert.match(toast,/history was kept/);
});
test('a next-period schedule change preserves the current period and inserts an explicit bridge with no gap',()=>{
  const c=context(),store={config:{frequency:'weekly',anchor:'2026-09-28'},periods:{}};
  const plan=c.budPeriodTransitionPlan(store,{frequency:'fortnightly',anchor:'2026-10-06'},'2026-10-04','next');
  assert.deepEqual(plain(plan.old),{id:'2026-09-28_2026-10-04',start:'2026-09-28',end:'2026-10-04',days:7});
  assert.deepEqual(plain(plan.special),{id:'2026-10-05_2026-10-05',start:'2026-10-05',end:'2026-10-05',days:1});
  assert.equal(plan.first.start,'2026-10-06');assert.equal(plan.destination.id,plan.special.id);
  const changed=c.budPeriodApplyTransition(store,plan);
  assert.deepEqual(changed.config,store.config);assert.equal(changed.transition.effectiveFrom,'2026-10-05');
  assert.equal(c.budPeriodRangeForStore(changed,'2026-10-04',0).id,plan.old.id);
  assert.equal(c.budPeriodRangeForStore(changed,'2026-10-04',1).id,plan.special.id);
  assert.equal(c.budPeriodRangeForStore(changed,'2026-10-04',2).start,'2026-10-06');
  assert.equal(c.budPeriodRangeForStore(changed,'2026-10-05',0).id,plan.special.id);
  assert.equal(c.budPeriodRangeForStore(changed,'2026-10-06',0).start,'2026-10-06');
});
test('starting a new rhythm today closes dated activity in the old period without deleting its plan',()=>{
  const c=context(),oldId='2026-09-28_2026-10-04',store={config:{frequency:'weekly',anchor:'2026-09-28'},periods:{[oldId]:{start:'2026-09-28',end:'2026-10-04',notes:'keep me',reserves:{rent:250}}}};
  const plan=c.budPeriodTransitionPlan(store,{frequency:'monthly',anchor:'2026-10-01'},'2026-10-04','now');
  assert.equal(plan.special.start,'2026-10-04');assert.equal(plan.special.end,'2026-10-31');assert.equal(plan.closedEnd,'2026-10-03');
  const changed=c.budPeriodApplyTransition(store,plan);
  assert.equal(changed.periods[oldId].closedEnd,'2026-10-03');assert.equal(changed.periods[oldId].notes,'keep me');
  assert.deepEqual(plain(changed.periods[oldId].reserves),{rent:250});
  assert.equal(c.budPeriodRangeForStore(changed,'2026-10-04',0).id,'2026-10-04_2026-10-31');
});
test('period transitions retarget or remove only affected rollovers and preserve unrelated history',()=>{
  const c=context(),oldId='2026-09-28_2026-10-04',store={config:{frequency:'weekly',anchor:'2026-09-28'},periods:{
    earlier:{start:'2026-09-21',end:'2026-09-27',notes:'history',rollover:{to:oldId,amount:75,destination:'budget'}},
    unrelated:{start:'2026-08-01',end:'2026-08-07',rollover:{to:'2026-08-08_2026-08-14',amount:10,destination:'budget'}}}};
  const plan=c.budPeriodTransitionPlan(store,{frequency:'fortnightly',anchor:'2026-10-06'},'2026-10-04','next');
  assert.deepEqual(plain(plan.rolloverIds),['earlier']);
  const retargeted=c.budPeriodApplyTransition(store,plan,'retarget');
  assert.equal(retargeted.periods.earlier.rollover.to,plan.destination.id);assert.equal(retargeted.periods.earlier.notes,'history');
  assert.equal(retargeted.periods.unrelated.rollover.to,'2026-08-08_2026-08-14');
  const removed=c.budPeriodApplyTransition(store,plan,'remove');assert.equal(removed.periods.earlier.rollover,undefined);
});
test('cancelling a future transition restores its rollover and removes only untouched placeholders',()=>{
  const c=context({document:{getElementById:()=>null},showToast(){}}),oldId='2026-09-28_2026-10-04';c.budPeriodRefresh=()=>{};
  const store={config:{frequency:'weekly',anchor:'2026-09-28'},periods:{earlier:{start:'2026-09-21',end:'2026-09-27',rollover:{to:oldId,amount:75,destination:'budget'}}}};
  const plan=c.budPeriodTransitionPlan(store,{frequency:'fortnightly',anchor:'2026-10-06'},'2026-10-04','next'),changed=c.budPeriodApplyTransition(store,plan,'retarget');
  c.budCyclesSave(changed);c.budPeriodCancelTransition();const restored=c.budCyclesLoad();
  assert.equal(restored.transition,undefined);assert.equal(restored.periods.earlier.rollover.to,oldId);
  assert.equal(restored.periods[plan.special.id],undefined);assert.equal(restored.periods[oldId],undefined);
});
test('reading a scheduled transition and its archived periods writes nothing',()=>{
  const saved={config:{frequency:'weekly',anchor:'2026-09-28'},periods:{old:{start:'2026-09-01',end:'2026-09-07'}},transition:{config:{frequency:'fortnightly',anchor:'2026-10-06'},effectiveFrom:'2026-10-05'}};
  const c=context();c.budCyclesSave(saved);let writes=0;c.lsSave=()=>writes++;
  assert.deepEqual(plain(c.budCyclesLoad().transition),saved.transition);
  assert.equal(c.budPeriodCurrent().id,'2026-09-28_2026-10-04');assert.equal(writes,0);
});
test('a placeholder period receives suggestions but reviewed or explicit allowances never change',()=>{
  const c=context({loadFixCats:()=>[{id:'rent'}],activeCats:x=>x,catChargeableBudget:()=>250});
  const placeholder={start:period.start,end:period.end,updatedAt:10};
  const inherited=c.budPeriodInheritedPlan(period,placeholder);
  assert.equal(inherited.reserves.rent,500);assert.equal(inherited.updatedAt,10);assert.equal(inherited.provisionalFixedPlan,true);
  const explicit={...placeholder,reserves:{rent:375}};
  assert.deepEqual(plain(c.budPeriodInheritedPlan(period,explicit)),explicit);
  const confirmed={...placeholder,fundingConfirmed:true};
  assert.deepEqual(plain(c.budPeriodInheritedPlan(period,confirmed)),confirmed);
});
test('moving between period breakdowns does not stamp an untouched allocation plan',()=>{
  const fields={'sav-amount':{value:'200'},'week-notes':{value:''}};
  const c=context({S:{view:'budget'},budgetView:'week',document:{getElementById:id=>fields[id],querySelectorAll:()=>[{dataset:{periodReserve:'rent'},value:'500'}]}});
  c.budPeriodViewed=()=>period;
  c.budCyclesSave({config:{frequency:'fortnightly',anchor:period.start},periods:{[period.id]:{start:period.start,end:period.end,savings:200,reserves:{rent:500},updatedAt:50}}});
  let writes=0;c.lsSave=()=>writes++;
  c.budPeriodSaveFields(false);assert.equal(writes,0);
  fields['sav-amount'].value='250';c.budPeriodSaveFields(false);assert.equal(writes,1);
});
test('period Outlook gives back only reserves for charges due before payday, once per bill',()=>{
  const c=context({nextPayInfo:()=>({date:new Date(2026,9,10)}),billOccurrences:()=>[
    {kind:'charge',cat:{id:'rent'},date:new Date(2026,9,5),amount:100},
    {kind:'charge',cat:{id:'rent'},date:new Date(2026,9,8),amount:100}]});
  const f=c.budPeriodForecast({range:period,available:500,record:{reserves:{rent:600}},rows:[]});
  assert.equal(f.addBack,200);assert.equal(f.projected,500);
});

test('restored period totals cancel older count-up frames before publishing the balance',()=>{
  const pending=new Map(),el={textContent:''};let seq=0;
  const c=context({performance:{now:()=>0},requestAnimationFrame:fn=>{pending.set(++seq,fn);return seq;},cancelAnimationFrame:id=>pending.delete(id),
    document:{getElementById:id=>id==='bud-hero-avail'?el:null},fmtMoneyExact:n=>'$'+n,updateVarGoalCard:()=>{},budPaceText:()=>''});
  vm.runInContext(extract('countUp'),c);c.budPeriodCardMode=()=>false;
  c.countUp(el,790);assert.equal(pending.size,1);
  c.budPeriodPaintMoney({available:580,range:period,spent:210,billPaid:0,reserved:250,savings:160,outgoing:0,income:1200,funded:1200,opening:0,incoming:0});
  assert.equal(pending.size,0);assert.equal(el.textContent,'$580');
});

test('twice-monthly budgets follow calendar paydays, including short months and navigation',()=>{
  const c=context(),cfg={frequency:'semimonthly',anchor:'2026-01-15',secondDay:31};
  const dates=[['2026-02-14','2026-01-31','2026-02-14'],['2026-02-15','2026-02-15','2026-02-27'],['2026-02-28','2026-02-28','2026-03-14']];
  dates.forEach(([day,start,end])=>{const p=c.budPeriodRange(cfg,day,0);assert.equal(p.start,start);assert.equal(p.end,end);});
  assert.equal(c.budPeriodRange(cfg,'2026-02-15',1).start,'2026-02-28');
  assert.equal(c.budPeriodRange(cfg,'2026-02-15',-1).start,'2026-01-31');
  assert.equal(c.budPeriodRange({...cfg,secondDay:15},'2026-02-15',0),null);
  assert.equal(c.budPeriodRange({...cfg,anchor:'2024-01-30'},'2024-02-29',0).end,'2024-03-29');
});

test('linked budgets resolve the selected income schedule read-only, retaining saved history',()=>{
  let source={id:'salary',payCycle:'fortnightly',payDate:'2026-10-02'};
  const c=context({loadIncCats:()=>[source],activeCats:x=>x.filter(c=>!c.archived),incomePayCycle:x=>x.payCycle});
  const saved={config:{frequency:'weekly',anchor:'2026-09-28',sourceId:'salary'},periods:{old:{opening:400}}};
  c.budCyclesSave(saved);let writes=0;c.lsSave=()=>writes++;
  assert.equal(c.budPeriodCurrent().end,'2026-10-15');
  assert.deepEqual(plain(c.budCyclesLoad().periods),saved.periods);
  source={...source,payCycle:'monthly',payDate:'2026-01-31'};
  assert.equal(c.budPeriodCurrent().start,'2026-09-30');
  source.archived=true;
  assert.equal(c.budPeriodCurrent().start,'2026-09-28');
  assert.equal(writes,0);assert.equal(saved.config.frequency,'weekly');
});

test('fixed pay prefills only the recording draft; variable pay remains blank with an optional estimate',()=>{
  const fixed={id:'fixed',payAmount:1800,payMode:'fixed'},variable={id:'hourly',payAmount:999,payMode:'variable'};
  const form={elements:{category:{value:'fixed'},amount:{value:''},hours:{value:''}}};
  const nodes={'bp-form':form,'bi-estimate':{},'bi-record-hint':{},'bi-estimate-result':{}};
  const c=context({activeCats:x=>x,loadIncCats:()=>[fixed,variable],getHourlyRate:id=>id==='hourly'?25:0,document:{getElementById:id=>nodes[id]}});
  c.budIncomeRecordFill();assert.equal(form.elements.amount.value,1800);assert.equal(nodes['bi-estimate'].hidden,true);
  form.elements.category.value='hourly';c.budIncomeRecordFill();assert.equal(form.elements.amount.value,'');assert.equal(nodes['bi-estimate'].hidden,false);
  form.elements.hours.value=12.5;c.budIncomeEstimate();assert.equal(form.elements.amount.value,312.5);
  assert.equal(variable.payAmount,999);assert.equal(fixed.payAmount,1800);
});

function receivedFixture({old=0,events=[]}={}){
  const form={elements:{category:{value:'salary'},amount:{value:''},date:{value:'2026-10-04'},hours:{value:''},duplicate:{checked:false},weekMode:{value:''}},querySelector:()=>({})};
  const nodes={'bp-form':form,'bi-estimate':{},'bi-record-hint':{},'bi-history':{},'bi-duplicate':{},'bp-error':{},'bud-period-dialog':{close(){}}};
  const cats=[{id:'salary',name:'Salary',payAmount:1800,payMode:'fixed'}],weeks=old?{'2026-09-28':{inc_salary:String(old)}}:{};
  let writes=0,seq=0;
  const c=context({document:{getElementById:id=>nodes[id]},FormData:class{constructor(f){this.f=f;}get(k){return this.f.elements[k]?.value||'';}has(k){return !!this.f.elements[k]?.checked;}},
    activeCats:x=>x,loadIncCats:()=>cats,getHourlyRate:()=>0,budgetData:weeks,ledgerData:events,ledgerOf:()=>events,
    weekIncome:w=>Number(w.inc_salary||0),catLabel:c=>c.name,escAttr:x=>x,escText:x=>x,
    txnWeekOf:()=> '2026-09-28',genLedgerId:()=> 'new-'+(++seq),saveLedger:()=>writes++,budSaveData:()=>writes++});
  c.budPeriodDialog=()=>{};c.budPeriodRefresh=()=>{};c.budPeriodRecord('income');
  return {c,form,nodes,cats,events,weeks,writes:()=>writes,submit:()=>form.onsubmit({preventDefault(){},target:form})};
}

test('confirming fixed pay records the editable actual amount once, even with a repeated submit',()=>{
  const f=receivedFixture();assert.equal(f.form.elements.amount.value,1800);assert.equal(f.writes(),0);
  f.form.elements.amount.value=1790;f.submit();f.submit();
  assert.equal(f.events.length,1);assert.equal(f.events[0].amount,1790);assert.equal(f.weeks['2026-09-28'].inc_salary,'1790');assert.equal(f.writes(),2);
});

test('future pay, removed sources and accidental same-day duplicates cannot fund the budget',()=>{
  let f=receivedFixture();f.form.elements.date.value='2026-10-05';f.submit();assert.equal(f.events.length,0);
  f=receivedFixture();f.cats.length=0;f.submit();assert.equal(f.events.length,0);
  f=receivedFixture({old:1800,events:[{kind:'income',streamId:'salary',date:'2026-10-04',amount:1800}]});
  f.submit();assert.equal(f.events.length,1);assert.match(f.nodes['bp-error'].textContent,/already recorded/);
  f.form.elements.duplicate.checked=true;f.submit();assert.equal(f.events.length,2);assert.equal(f.weeks['2026-09-28'].inc_salary,'3600');
});

test('dating income already included in a legacy week does not add it again',()=>{
  const f=receivedFixture({old:1800});f.submit();assert.equal(f.events.length,0);
  f.form.elements.weekMode.value='record_only';f.submit();
  assert.equal(f.events.length,1);assert.equal(f.events[0].weekMode,'record_only');assert.equal(f.weeks['2026-09-28'].inc_salary,'1800');
});

test('income setup saves explicitly, preserves other sources/history, and rejects stale drafts',()=>{
  let cats=[{id:'salary',name:'Salary',payCycle:'weekly',payDate:'2026-09-28',payAmount:1000},{id:'side',name:'Other',payCycle:'irregular'}];
  let saves=0;
  const fields={name:'Salary updated',mode:'fixed',cycle:'fortnightly',amount:'1800',payDate:'2026-10-02',secondDay:'',follow:true};
  const action={before(){},textContent:''},form={};
  const nodes={'bp-form':form,'bp-error':{}};
  const c=context({loadIncCats:()=>plain(cats),saveIncCats:v=>{cats=plain(v);saves++;},activeCats:x=>x,incomePayCycle:x=>x.payCycle||'weekly',getHourlyRate:()=>0,
    incomeNextPay:()=>null,escText:x=>x,escAttr:x=>x,INC_PAY_CYCLES:[{id:'weekly',label:'Weekly'},{id:'fortnightly',label:'Fortnightly'}],
    document:{getElementById:id=>nodes[id],createElement:()=>({})},renderBudgetConfig(){},showToast(){},
    FormData:class{get(k){return fields[k]??'';}has(k){return fields[k]===true;}}});
  c.budPeriodDialog=()=>({querySelector:()=>action});c.budIncomeFields=()=>{};c.budPeriodRefresh=()=>{};c.budIncomeManage=()=>{};
  c.budCyclesSave({config:{frequency:'weekly',anchor:'2026-09-28'},periods:{old:{opening:200}}});
  c.budIncomeEdit('salary');assert.equal(saves,0);
  const concurrent=c.budCyclesLoad();concurrent.periods.newer={opening:777};c.budCyclesSave(concurrent);
  form.onsubmit({preventDefault(){},target:form});
  assert.equal(saves,1);assert.equal(cats[0].payAmount,1800);assert.equal(cats[0].payMode,'fixed');assert.equal(cats[1].name,'Other');
  assert.equal(c.budCyclesLoad().transition.config.sourceId,'salary');assert.equal(c.budCyclesLoad().periods.old.opening,200);
  assert.equal(c.budCyclesLoad().periods.newer.opening,777);
  c.budIncomeEdit('salary');cats[0].name='Changed on another device';
  form.onsubmit({preventDefault(){},target:form});assert.equal(saves,1);assert.match(nodes['bp-error'].textContent,/changed elsewhere/);
});
