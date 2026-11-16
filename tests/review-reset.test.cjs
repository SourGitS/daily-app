const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {extract,Cloud,Store,copy}=require('./harness.cjs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
function fixture(){
 const storage=new Store(),cloud=new Cloud({users:{u:{weeklyReviews:{}}}}),writes=[],messages=[];
 const ctx=vm.createContext({console,Date,JSON,Set,Math,Number,Array,Object,Promise,
  window:{addEventListener:()=>{}},_bootPhase:false,_syncApplying:0,
  auth:{currentUser:{uid:'u'}},
  dateStr:d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),
  localMidnight:s=>new Date(s+'T00:00:00'),aiIsDate:s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s),
  getMondayOf:n=>new Date(2026,8,14+7*(n||0)),weekKey:d=>ctx.dateStr(d),
  lsLoad:(k,f)=>storage.getItem(k)?JSON.parse(storage.getItem(k)):f,
  lsSave:(k,v)=>{storage.setItem(k,JSON.stringify(v));writes.push(k);},
  fbRef:p=>cloud.ref('users/u/'+p),setSyncStatus:()=>{},
  showToast:m=>messages.push(m),S:{view:'stats',sessions:[]},statsSubTab:'review',
  clearTimeout:()=>{},setTimeout:()=>1,confirm:()=>false,
  budgetData:{},statsCompletedWeeks:()=>[],loadFixCats:()=>[],
  loadVarCats:()=>[],document:{getElementById:()=>null},
 });
 vm.runInContext(source.slice(source.indexOf('const WKR_SCHEMA '),source.indexOf('// ── Money flow',source.indexOf('const WKR_SCHEMA '))),ctx);
 vm.runInContext('renderStatsReview=()=>{};wkrRerender=()=>{};wkrUI.week="2026-09-14";',ctx);
 ctx.run=code=>vm.runInContext(code,ctx);
 ctx.storage=storage;ctx.cloud=cloud;ctx.writes=writes;ctx.messages=messages;
 ctx.run('wkrPlan=wkrNormalisePlan({enabled:true,money:{regularWeeklyTakeHome:1000,allocations:{fixedBills:300,transport:100,foodGroceries:200,savings:200,buffer:200}}});');
 return ctx;
}
test('fresh baseline has no personal template, no optional pages enabled, and creates no stored values',()=>{
 const a=fixture();assert.equal(a.run('wkrPlan.name'),'My weekly plan');
 assert.equal(a.run('wkrPlan.pages.some(p=>p.enabled)'),false);
 assert.deepEqual(a.writes,[]);assert.ok(!source.includes('WKR_TEMPLATE'));
});
test('legacy pages and every saved answer survive normalise, JSON backup round trip, and merge',()=>{
 const a=fixture();
 a.run('wkrPlan=wkrNormalisePlan({...wkrPlan,work:{enabled:true},life:{enabled:true},pages:undefined});');
 assert.equal(a.run('wkrPlan.pages.find(p=>p.id==="work").enabled'),true);
 a.run('wkrReviews["2026-09-07"]=wkrNormaliseRecord({week:"2026-09-07",status:"completed",planSnapshot:wkrPlan,pageAnswers:{custom:{answer:"keep"}},reflection:{wentWell:"milestone"},updatedAt:30},"2026-09-07");');
 const before=a.run('JSON.stringify(wkrReviews)');
 a.run('wkrReviews=wkrNormaliseReviews(JSON.parse(JSON.stringify(wkrReviews)));');
 assert.equal(a.run('JSON.stringify(wkrReviews)'),before);
 assert.equal(a.run('wkrMergeReviews(wkrReviews,{"2026-09-14":{updatedAt:40}}).merged["2026-09-07"].reflection.wentWell'),'milestone');
});
test('duplicate and dangerous page/prompt IDs cannot corrupt answers',()=>{
 const a=fixture();const pages=a.wkrNormalisePages([{id:'__proto__'},{id:'next'},{id:'mine',title:'Mine',enabled:true,prompts:[{id:'constructor'},{id:'ok',label:'Safe'},{id:'ok'}]},{id:'mine'}]);
 assert.equal(pages.filter(p=>p.id==='mine').length,1);
 assert.equal(pages.find(p=>p.id==='mine').prompts.length,1);
 assert.equal(pages.some(p=>p.id==='__proto__'),false);
});
test('opening, editing, cancelling and navigating a next-week draft write nothing',()=>{
 const a=fixture();a.wkrEditNext();a.wkrNextSet('savings','100');a.wkrSetSection('money');a.wkrCancelNext();
 assert.deepEqual(a.writes,[]);assert.equal(a.run('Object.keys(wkrReviews).length'),0);
 assert.equal(a.run('wkrPlan.money.allocations.savings'),200);
});
test('accepting a next-week plan saves only its source review and survives reload',async()=>{
 const a=fixture();a.wkrEditNext();a.wkrNextSet('savings','150');a.wkrNextSet('buffer','250');a.wkrNextSet('note','Protect the buffer');a.wkrSaveNext();
 await a.cloud.settle();
 assert.deepEqual([...new Set(a.writes)],['daily_reviews']);
 a.run('wkrReviews=wkrLoadReviews();');
 assert.equal(a.run('wkrReviews["2026-09-14"].nextWeek.week'),'2026-09-21');
 assert.equal(a.run('wkrReviews["2026-09-14"].nextWeek.money.allocations.savings'),150);
 assert.equal(a.run('wkrPlan.money.allocations.savings'),200);
 assert.ok(a.cloud.writes.every(w=>w.path==='users/u/weeklyReviews/2026-09-14'));
});
test('following review compares with accepted allocation and completed review freezes it',()=>{
 const a=fixture();a.wkrEditNext();a.wkrNextSet('savings','150');a.wkrNextSet('buffer','250');a.wkrSaveNext();
 assert.equal(a.wkrEffectivePlan(null,'2026-09-21').money.allocations.savings,150);
 const frozen=a.wkrEffectivePlan(null,'2026-09-21');
 a.run('wkrPlan.money.allocations.savings=900;');
 assert.equal(a.wkrEffectivePlan({status:'completed',planSnapshot:frozen,week:'2026-09-21'}).money.allocations.savings,150);
});
test('over-allocation, missing income and a pay date outside the target week cannot be accepted',()=>{
 for(const [field,value] of [['savings','999'],['income',''],['payDate','2026-09-14']]){
  const a=fixture();a.wkrEditNext();a.wkrNextSet(field,value);a.wkrSaveNext();assert.deepEqual(a.writes,[]);assert.ok(a.messages.length);
 }
});
test('a cloud baseline or review change blocks an older next-week draft',()=>{
 for(const change of ['wkrPlan.updatedAt=99;','wkrReviews["2026-09-14"]=wkrNormaliseRecord({updatedAt:99},"2026-09-14");']){
  const a=fixture();a.wkrEditNext();a.run(change);a.wkrSaveNext();assert.deepEqual(a.writes,[]);assert.ok(a.run('!!wkrUI.nextDraft'));
 }
});
test('an update in another local window also blocks an older next-week draft',()=>{
 const a=fixture();a.wkrEditNext();a.storage.setItem('daily_reviews',JSON.stringify({'2026-09-14':{updatedAt:99,reflection:{wentWell:'other window'}}}));
 a.wkrSaveNext();assert.deepEqual(a.writes,[]);assert.equal(a.run('wkrReviews["2026-09-14"].reflection.wentWell'),'other window');
});
test('plan pages are drafts until Save and cancel keeps the source plan intact',()=>{
 const a=fixture(),before=a.run('JSON.stringify(wkrPlan)');a.wkrEditPlan();a.wkrPageAdd();a.wkrPageSet(0,'enabled',true);a.wkrPageMove(0,1);a.wkrCancelSetup();
 assert.equal(a.run('JSON.stringify(wkrPlan)'),before);assert.deepEqual(a.writes,[]);
});
test('completed reviews reject answer edits and current week cannot be completed',()=>{
 const a=fixture();a.run('wkrReviews["2026-09-14"]=wkrNormaliseRecord({status:"completed",updatedAt:22},"2026-09-14");');
 a.wkrPatchText('reflection.wentWell','no');assert.equal(a.run('wkrReviews["2026-09-14"].reflection.wentWell'),'');
 a.wkrCompleteReview();assert.deepEqual(a.writes,[]);
});
test('scheduled charges use the target week including repeated occurrences',()=>{
 const a=fixture();a.loadFixCats=()=>[{name:'Weekly bill'}];a.catIsRecurring=()=>true;a.catIsCharging=()=>true;a.catLabel=c=>c.name;a.catAmount=()=>15;
 a.catOccurrencesBetween=(c,from,to)=>{assert.equal(a.dateStr(from),'2026-09-21');assert.equal(a.dateStr(to),'2026-09-27');return [new Date(2026,8,22),new Date(2026,8,26)];};
 assert.equal(a.wkrChargesForWeek('2026-09-21').length,2);
});
test('a stale upload cannot overwrite a newer cloud review or another week',async()=>{
 const a=fixture();a.cloud.put('users/u/weeklyReviews/2026-09-14',{updatedAt:500,reflection:{wentWell:'cloud'}});
 a.cloud.put('users/u/weeklyReviews/2026-09-07',{updatedAt:400});
 a.run('wkrReviews["2026-09-14"]=wkrNormaliseRecord({updatedAt:100},"2026-09-14");');a.wkrPushReview('2026-09-14');await a.cloud.settle();
 assert.equal(a.cloud.get('users/u/weeklyReviews/2026-09-14').reflection.wentWell,'cloud');
 assert.equal(a.cloud.get('users/u/weeklyReviews/2026-09-07').updatedAt,400);
 assert.equal(a.cloud.writes.length,0);
});
test('completion freezes the accepted prior allocation and custom page definitions',()=>{
 const a=fixture();
 a.wkrMoneyActuals=()=>({incomeTotal:1000,regularIncome:1000,irregularIncome:0,incomeKnown:true,fixed:300,variable:250,spendTotal:550,groups:{},saved:200,leftover:250});
 a.wkrCardTxns=()=>[];
 a.run('wkrUI.week="2026-09-07";wkrReviews["2026-09-07"]=wkrNormaliseRecord({updatedAt:1},"2026-09-07");wkrPlan.pages[0].enabled=true;');
 a.wkrCompleteReview();
 const before=a.run('JSON.stringify(wkrReviews["2026-09-07"])');
 a.run('wkrPlan.pages[0].title="Changed later";wkrPlan.money.regularWeeklyTakeHome=3000;');
 assert.equal(a.run('wkrEffectivePlan(wkrReviews["2026-09-07"]).money.regularWeeklyTakeHome'),1000);
 assert.equal(a.run('wkrEffectivePlan(wkrReviews["2026-09-07"]).pages[0].title'),'Training');
 assert.equal(a.run('JSON.stringify(wkrReviews["2026-09-07"])'),before);
});
test('boot and cloud apply cannot upload a review, even with a stored timestamp',async()=>{
 const a=fixture();a.run('wkrReviews["2026-09-14"]=wkrNormaliseRecord({updatedAt:55},"2026-09-14");');
 a._bootPhase=true;a.wkrPushReview('2026-09-14');a._bootPhase=false;a._syncApplying=1;a.wkrPushReview('2026-09-14');await a.cloud.settle();
 assert.deepEqual(a.cloud.writes,[]);
});

test('personal priorities save and reload without a money plan; an empty edit writes nothing',()=>{
 const a=fixture(),week='2026-09-14';
 a.run('wkrPlan=wkrNormalisePlan({enabled:false})');
 assert.equal(a.wkrCommitPriorities(week,[],['','','']),'');
 assert.deepEqual(a.writes,[]);
 assert.equal(a.wkrCommitPriorities(week,[],[' Get the bike serviced ','','']),'');
 const saved=a.wkrLoadReviews()[week];
 assert.deepEqual([...saved.reflection.priorities],['Get the bike serviced']);
 assert.equal(saved.nextWeek,null);
 assert.equal(a.run('wkrPlan.enabled'),false);
 assert.deepEqual(a.writes,['daily_reviews']);
});

test('editing personal priorities protects a newer window and frozen reviews',()=>{
 const a=fixture(),week='2026-09-14';
 a.wkrCommitPriorities(week,[],['Initial']);
 const updated=a.wkrLoadReviews();
 updated[week].reflection.priorities=['Changed elsewhere'];updated[week].updatedAt+=10;
 a.storage.setItem('daily_reviews',JSON.stringify(updated));
 assert.match(a.wkrCommitPriorities(week,['Initial'],['Stale replacement']),/changed/);
 assert.equal(a.wkrLoadReviews()[week].reflection.priorities[0],'Changed elsewhere');
 a.run('wkrReviews["2026-09-14"].status="completed"');
 assert.match(a.wkrCommitPriorities(week,['Changed elsewhere'],['New intention']),/completed/);
 assert.equal(a.writes.length,1);
});

test('saved priorities keep their linked action after reorder, across older plan formats and duplicate wording',()=>{
 const a=fixture(),week='2026-09-14',source={week,text:'Bike',occurrence:1};
 const rec={reflection:{priorities:['Walk','Bike','Bike']},nextWeek:{priorities:['Bike','Train']}};
 const task={id:'task',source,title:'Call the shop',date:'2026-09-23',originalDate:'2026-09-22',done:true};
 const rows=a.wkrPriorityRows(week,rec,[task]);
 assert.deepEqual(Array.from(rows,r=>[r.source.text,r.source.occurrence]),[['Walk',0],['Bike',0],['Bike',1],['Train',0]]);
 assert.equal(rows[2].task,task);
 assert.equal(rows[1].task,null);
 const edited=a.wkrPriorityRows(week,{reflection:{priorities:['Replacement']}},[task]);
 assert.equal(edited[0].task,null);
 assert.equal(edited[1].task,task);
 assert.equal(edited[1].source.text,'Bike');
});

test('current outcomes render in the origin and following review without updating a completed review',()=>{
 const a=fixture(),week='2026-09-07';
 a.fmtDate=s=>s;a.escText=s=>String(s);a.cardHeader=(_icon,s)=>'<h3>'+s+'</h3>';
 const task={id:'one',source:{week,text:'Get the bike serviced',occurrence:0},title:'Call the shop',date:'2026-09-16',originalDate:'2026-09-15',done:true};
 a.plannerTasks=()=>[task];
 const rec=a.wkrNormaliseRecord({status:'completed',reflection:{priorities:['Get the bike serviced']}},week);
 const before=JSON.stringify(rec);
 for(const [selected,review] of [[week,rec],['2026-09-14',null]]){
   const html=a.wkrPriorityCardHtml(selected,review);
   assert.match(html,/Get the bike serviced/);assert.match(html,/Call the shop/);
   assert.match(html,/Done · 2026-09-16 · Moved from 2026-09-15/);
   assert.match(html,/data-task-id="one"/);
 }
 assert.ok(a.wkrVisibleWeeks().includes(week));
 task.done=false;
 assert.match(a.wkrPriorityCardHtml(week,rec),/Planned · 2026-09-16/);
 assert.equal(JSON.stringify(rec),before);assert.deepEqual(a.writes,[]);
});
