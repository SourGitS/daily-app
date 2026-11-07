// Test-only Firebase and localStorage. This page cannot contact the production database.
(() => {
  const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
  const params=new URL(location.href).searchParams,switchKey=params.has('switch')?'daily-test-switch-'+params.get('switch'):null;
  const memory=new Map(switchKey?JSON.parse(sessionStorage.getItem(switchKey)||'[]'):[]);
  const persistMemory=()=>{if(switchKey)sessionStorage.setItem(switchKey,JSON.stringify([...memory]));};
  if(!memory.has('daily-account-active'))memory.set('daily-account-active','user:fixture');
  if(new URL(location.href).searchParams.has('light')) memory.set('daily-account:user%3Afixture:wt_theme','light');
  Object.defineProperty(window,'localStorage',{value:{
    getItem:k=>memory.has(k)?memory.get(k):null,
    setItem:(k,v)=>{memory.set(k,String(v));persistMemory();}, removeItem:k=>{memory.delete(k);persistMemory();},
    key:i=>[...memory.keys()][i], get length(){return memory.size;}
  }});
  Object.defineProperty(navigator,'serviceWorker',{value:{controller:null,register:()=>Promise.resolve({update:()=>Promise.resolve()}),getRegistration:()=>Promise.resolve(undefined),addEventListener:()=>{}}});
  const split={types:[{id:'cloud',name:'Saved cloud workout',colorKey:'legs',exercises:[{name:'Cloud squat',sets:3}]}],schedule:[0]};
  const workouts={one:{id:'one',date:'2026-09-01',sessionType:'Saved cloud workout',dayNum:1,exercises:[{name:'Cloud squat',sets:[{weight:100,reps:5}]}]},two:{id:'two',date:'2026-09-03',sessionType:'Saved cloud workout',dayNum:1,exercises:[{name:'Cloud squat',sets:[{weight:105,reps:5}]}]}};
  const stores={sessions:workouts,weights:{20260903:{date:'2026-09-03',weight:80}},
    budgetIncCats:{v:JSON.stringify([{id:'salary',name:'Saved salary',payCycle:'fortnightly',payDate:'2026-10-02',payAmount:2000}]),t:500},
    budgetFixCats:{v:JSON.stringify([{id:'rent',name:'Saved rent',cycle:'fortnightly',amount:500,budget:250,chargeType:'bill',dueDate:'2026-10-02'}]),t:500},
    trainingSplit:{v:JSON.stringify(split),t:500},
    exerciseLib:{v:JSON.stringify([{id:'cloud-squat',name:'Cloud squat',custom:true,muscle:'legs'}]),t:500},
    plans:{v:JSON.stringify({plans:[{id:'saved-plan',name:'Saved program',split}],activePlanId:'saved-plan',streak:{count:0,lastDate:''}}),t:500},
    profile:{name:'Sync test',onboardingVersion:999,lastSeenWhatsNew:999}
  };
  const selectedUid=memory.get('fixture-user')||'fixture';
  if(params.has('ui')){
    stores.profile.budgetRhythmSeen=2;
    const count=Math.max(0,Math.min(4,Number(params.get('weights')??3)));
    stores.weights=Object.fromEntries(['2026-09-19','2026-09-25','2026-10-01','2026-10-04'].slice(0,count).map((date,i)=>[date,{date,weight:80+i*.2}]));
    if(!params.has('nogoal')) stores.weightGoal={target:84,startedAt:'2026-09-19',startWeight:80};
    stores.personalInfo={age:30,height:180,weight:80,sex:'male',activity:1.55,goal:'maintain'};
    if(params.get('ui')==='journal') stores.notes={
      sample:{id:'sample',kind:'entry',title:'A little more space',body:'A walk before work helped me slow down.\n\nI want to make time for that again tomorrow.',dateAbout:'2026-10-03',createdAt:1790982000000,updatedAt:1790982000000,tags:['Outside'],mood:4,schemaVersion:2},
      reminder:{id:'reminder',kind:'note',title:'Book the bike service',body:'Ask about the brakes.',dueDate:'2026-10-08',dateType:'reminder',createdAt:1790982000000,updatedAt:1790982000000,tags:[],pinned:true,schemaVersion:2}
    };
  }
  if(params.has('polish')){
    stores.profile.budgetRhythmSeen=2;
    stores.kitRecipes={v:JSON.stringify([
      ['tacos','Birria Tacos',600,null,null],['pasta','Cajun Chicken Alfredo',50,1530,63],
      ['fish','Parmentier de Poisson',75,null,null],['lasagne','Beef Lasagne',120,1290,68],
      ['toast','Burnt-Butter Brioche French Toast',45,null,null],['prawns','Butter Garlic Prawns',15,380,36]
    ].map(([id,name,cookTime,calories,protein])=>({id,name,category:id==='toast'?'breakfast':'dinner',servings:4,cookTime: cookTime+' min',calories,protein,nutritionBasis:'manual',ingredients:[{name:'Test ingredient',amount:400,unit:'g'}],steps:['Prepare the ingredients.','Cook and serve.']}))),t:500};
  }
  if(params.has('onboarding'))stores.profile={};
  if(params.has('catalogue')){
    stores.profile.budgetRhythmSeen=2;
    stores.kitRecipes={v:JSON.stringify([
      {id:'personal-lunch',name:'My saved lunch',category:'lunch',servings:2,ingredients:[{name:'Rice',amount:200,unit:'g'}],steps:['Cook the rice.'],favourite:true},
      {id:'personal-birria',name:'Birria Tacos',category:'dinner',servings:3,description:'My edited version — preserve this.',ingredients:[{name:'Beef',amount:900,unit:'g'}],steps:['My own method.']}
    ]),t:500};
    if(params.get('catalogue')==='new'){
      Object.keys(stores).forEach(key=>delete stores[key]);stores.profile={budgetRhythmSeen:2};
    }
  }
  if(params.has('training')){
    const date=offset=>{const d=new Date();d.setDate(d.getDate()+offset);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
    const upper=[{name:'Low-incline Smith chest press',sets:3},{name:'Lat pulldown',sets:3},{name:'Dumbbell shoulder press',sets:3},{name:'Cable triceps extension',sets:2},{name:'Dumbbell biceps curl',sets:2},{name:'Dead hangs',sets:2,unit:'secs'}];
    const lower=[{name:'Smith squat',sets:4},{name:'Romanian deadlift',sets:3},{name:'Seated leg curl',sets:3},{name:'Standing calf raise',sets:3}];
    stores.trainingSplit={v:JSON.stringify({types:[{id:'upper',name:'Upper body',exercises:upper},{id:'lower',name:'Lower body',exercises:lower}],schedule:[0,1]}),t:500};
    const session=(id,offset,dayNum,sessionType,exercises)=>({id,date:date(offset),dayNum,sessionType,duration:45,completed:true,exercises:exercises.map(e=>({name:e.name,muscle:e.muscle||(/curl/.test(e.name)?'arms':'chest'),unit:e.unit||'reps',sets:[{weight:20,reps:8,type:'warmup'},{weight:40,reps:8,type:'working'},{weight:40,reps:9,type:'working'}]}))});
    stores.sessions={
      upper:session('upper',-5,1,'Upper body',[{name:upper[0].name,muscle:'chest'},{name:'Lat pulldown',muscle:'back'},{name:'Dumbbell biceps curl',muscle:'arms'}]),
      lower:session('lower',-2,2,'Lower body',[{name:'Smith squat',muscle:'quads'},{name:'Romanian deadlift',muscle:'hamstrings'},{name:'Standing calf raise',muscle:'calves'}])};
    stores.exerciseLib={v:JSON.stringify([{id:'incline',name:upper[0].name,muscle:' Chest ',custom:true},
      {id:'curl',name:'Dumbbell biceps curl',muscle:'Biceps',custom:true},{id:'triceps',name:'Cable triceps extension',muscle:'triceps',custom:true},
      {id:'seated-row',name:'Seated cable row',muscle:'BACK',custom:true},{id:'hip',name:'Hip thrust',muscle:'Glutes',custom:true},
      {id:'plank',name:'Plank',muscle:'Core',unit:'secs',custom:true}]),t:500};
    stores.sessions.old=session('old',-40,1,'Earlier split',[{name:'Farmer’s carry',muscle:'forearms'}]);
    stores.profile.budgetRhythmSeen=2;
  }
  const fresh=params.has('fresh')||selectedUid==='fresh-fixture';
  if(params.has('fresh')) Object.keys(stores).filter(k=>k!=='profile').forEach(k=>delete stores[k]);
  if(new URL(location.href).searchParams.has('period')){
    const blob=v=>({v:JSON.stringify(v),t:500});
    stores.budgetCycles=blob({config:{frequency:'fortnightly',anchor:'2026-10-02'},periods:{'2026-10-02_2026-10-15':{start:'2026-10-02',end:'2026-10-15',opening:100,savings:200,goal:1000,reserves:{rent:500},fundingConfirmed:true}}});
    stores.ledger=blob([{id:'test-income',kind:'income',date:'2026-10-02',amount:2000,streamId:'salary',manual:true,weekMode:'add'},
      {id:'test-payment',kind:'bill_payment',date:'2026-10-03',amount:500,fixCatId:'rent',manual:true}]);
    stores.transactions=blob([{id:'test-expense',date:'2026-10-03',amount:125,catId:'food',merchant:'Test groceries'}]);
    stores.budgetData={'2026-09-28':{wk:'2026-09-28',inc_salary:'2000',updatedAt:500}};
    stores.profile.budgetRhythmSeen=1;
    if(params.has('zero-fixed')){
      stores.budgetFixCats=blob([{id:'rent',name:'Saved rent',amount:250,cycle:'weekly',chargeType:'commitment'}]);
      stores.budgetCycles=blob({config:{frequency:'fortnightly',anchor:'2026-10-02'},periods:{
        '2026-10-30_2026-11-12':{start:'2026-10-30',end:'2026-11-12',opening:100,savings:200,goal:1000,reserves:{rent:0},fundingConfirmed:true,allocationsReviewed:true}
      }});
    }
  }
  if(params.has('weekly')){
    stores.budgetCycles={v:JSON.stringify({config:{frequency:'weekly',anchor:'2026-09-28'},periods:{}}),t:500};
    stores.budgetData={'2026-09-28':{wk:'2026-09-28',inc_salary:'1200',sav_amount:'160',var_goal:'300',fixRates:{rent:250},updatedAt:500}};
    stores.transactions={v:JSON.stringify([{id:'weekly-expense',date:'2026-10-03',amount:210,catId:'food',merchant:'Test groceries'}]),t:500};
    stores.profile.budgetRhythmSeen=2;
  }
  if(params.has('accent'))memory.set('daily-account:user%3Afixture:daily_accent_color','#'+params.get('accent'));
  if(params.has('accounts'))stores.accounts={v:JSON.stringify([
    {id:'cash',name:'Test cash',type:'asset',current:1500,history:[{date:'2026-08-01',balance:1000},{date:'2026-09-01',balance:1500}]},
    {id:'card',name:'Test card',type:'debt',current:200,history:[{date:'2026-09-15',balance:200}]},
    {id:'new',name:'Test new account',type:'asset',current:300,history:[]}
  ]),t:500};
  if(params.has('finance-links')){
    const format=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const day=new Date(),date=format(day),monday=new Date(day),due=new Date(day);
    monday.setDate(day.getDate()-((day.getDay()+6)%7));due.setDate(day.getDate()+20);const week=format(monday);
    const blob=v=>({v:JSON.stringify(v),t:500});
    const link=(id,balance)=>({version:1,anchor:'preview-'+id,balance,confirmedBalance:balance,date,confirmedAt:1});
    const effect=(id,kind)=>({accountId:id,anchor:'preview-'+id,kind});
    stores.profile={...stores.profile,name:'Finance preview',budgetRhythmSeen:2};
    stores.accounts=blob([
      {id:'cash',name:'Everyday — sample',type:'asset',category:'cash',current:1000,history:[{date,balance:1000}],balanceLink:link('cash',1000)},
      {id:'savings',name:'Savings — sample',type:'asset',category:'savings',saver:true,current:500,history:[{date,balance:500}],savingsPlan:{mode:'review',fromId:'cash',goal:1500}},
      {id:'card',name:'Credit card — sample',type:'debt',category:'card',tracksStatement:true,limit:2000,current:700,statementBalance:400,dueDate:format(due),history:[{date,balance:700}],balanceLink:link('card',700),
        statementDetails:{id:'preview-statement',statementDate:date,minimum:20,interest:3.4,fees:20,sourceName:'Illustrative bank statement'},
        statementHistory:[{id:'preview-previous',statementDate:'2026-09-16',dueDate:'2026-10-10',statementBalance:300,minimum:15,interest:0,fees:0,status:'paid'}],
        repayments:[{id:'preview-pending',date,amount:100,applied:100,status:'pending',statementId:'preview-statement',fromAcctId:'cash',fromName:'Everyday — sample',affectsBalances:false,reference:'Sample transfer awaiting bank posting'}]}
    ]);
    stores.budgetVarCats=blob([{id:'food',name:'Food',icon:'cart'}]);
    stores.budgetIncCats=blob([{id:'salary',name:'Salary',payMode:'variable',payCycle:'weekly',payDate:date}]);
    stores.budgetFixCats=blob([]);
    stores.transactions=blob([
      {id:'preview-spend-cash',date,amount:35,catId:'food',merchant:'Sample groceries',acctId:'cash',accountLink:effect('cash','expense'),createdAt:1},
      {id:'preview-spend-card',date,amount:45,catId:'food',merchant:'Sample dinner',acctId:'card',accountLink:effect('card','expense'),createdAt:2}
    ]);
    stores.ledger=blob([{id:'preview-income',date,amount:250,kind:'income',streamId:'salary',acctId:'cash',accountLink:effect('cash','income'),manual:true,weekMode:'add',weekKey:week,weekBefore:0,weekAfter:250,createdAt:1}]);
    stores.budgetData={[week]:{wk:week,inc_salary:'250',sav_amount:'50',var_goal:'200',updatedAt:500}};
    stores.budgetCycles=blob({config:{frequency:'weekly',anchor:week},periods:{}});
    if(params.has('overview')){
      const dueIn=n=>format(new Date(day.getFullYear(),day.getMonth(),day.getDate()+n));
      stores.budgetFixCats=blob([
        {id:'gym',name:'Gym — sample',amount:14,cycle:'weekly',chargeType:'subscription',dueDate:dueIn(2)},
        {id:'internet',name:'Internet — sample',amount:65,cycle:'monthly',chargeType:'bill',dueDate:dueIn(2)},
        {id:'cover',name:'Insurance — sample',amount:45,cycle:'fortnightly',chargeType:'bill',dueDate:dueIn(5)},
        {id:'storage',name:'Cloud storage — sample',amount:5,cycle:'monthly',chargeType:'subscription',dueDate:dueIn(8)}
      ]);
      const monthStart=new Date(day.getFullYear(),day.getMonth(),1),previousStart=new Date(day.getFullYear(),day.getMonth()-1,1);
      const currentDay=day.getDate(),pastDays=Math.min(currentDay,new Date(day.getFullYear(),day.getMonth(),0).getDate());
      const at=(start,n)=>format(new Date(start.getFullYear(),start.getMonth(),n));
      stores.budgetVarCats=blob([{id:'food',name:'Food',icon:'cart'},{id:'travel',name:'Transport'},{id:'social',name:'Eating out'}]);
      const purchases=JSON.parse(stores.transactions.v),events=JSON.parse(stores.ledger.v);
      events[0].amount=500;events[0].weekAfter=500;stores.budgetData[week].inc_salary='500';
      [[1,65.2,'food','Weekly groceries'],[3,18.6,'travel','Train fare'],[5,42.5,'social','Lunch with friends'],[6,23.4,'food','Fresh groceries']].forEach(([n,amount,catId,merchant])=>{
        if(n<currentDay)purchases.push({id:'preview-month-'+n,date:at(monthStart,n),amount,catId,merchant,createdAt:n});
      });
      [[1,78.9,'food'],[3,25.5,'travel'],[5,65,'social'],[6,31,'food']].forEach(([n,amount,catId])=>{
        if(n<=pastDays)purchases.push({id:'preview-prior-'+n,date:at(previousStart,n),amount,catId,merchant:'Previous month — sample',createdAt:n});
      });
      events.push({id:'preview-savings',kind:'savings',date,amount:50,manual:true,note:'Put aside this month',createdAt:3},
        {id:'preview-bill-paid',kind:'bill_payment',fixCatId:'gym',date,amount:14,manual:true,note:'Gym payment — sample',createdAt:4},
        {id:'preview-prior-pay',kind:'income',streamId:'salary',date:at(previousStart,1),amount:800,createdAt:1},
        {id:'preview-prior-bill',kind:'bill_payment',fixCatId:'gym',date:at(previousStart,pastDays),amount:14,createdAt:2});
      stores.transactions=blob(purchases);stores.ledger=blob(events);
      if(params.has('plan')){
        const list=JSON.parse(stores.accounts.v);list.find(a=>a.id==='savings').savingsPlan.targetDate=format(new Date(day.getFullYear(),day.getMonth()+6,day.getDate()));stores.accounts=blob(list);
      }
    }
  }
  const initial=clone(stores),listeners=new Map(),writes=[],errors=[];
  window.addEventListener('error',e=>errors.push(e.message));
  window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
  const root={users:{fixture:stores,'fresh-fixture':{}}};
  const get=p=>clone(p.split('/').reduce((v,k)=>v&&v[k],root)??null);
  const snapshot=p=>{const v=get(p);return {val:()=>clone(v),exists:()=>v!==null};};
  const put=(p,v)=>{
    const keys=p.split('/'); let n=root;
    for(const k of keys.slice(0,-1))n=n[k]||=( {} );
    if(v===null)delete n[keys.at(-1)];else n[keys.at(-1)]=clone(v);
    writes.push(p);
    for(const [path,callbacks] of listeners)if(path===p||p.startsWith(path+'/')){
      for(const fn of callbacks)queueMicrotask(()=>fn(snapshot(path)));
    }
  };
  const ref=p=>({
    child:k=>ref(p+'/'+k),
    once:()=>Promise.resolve(snapshot(p)),
    on:(event,fn)=>{if(!listeners.has(p))listeners.set(p,new Set());listeners.get(p).add(fn);queueMicrotask(()=>fn(snapshot(p)));},
    off:()=>listeners.delete(p),
    set:v=>{put(p,v);return Promise.resolve();},
    remove:()=>{put(p,null);return Promise.resolve();},
    update:v=>{for(const [k,val] of Object.entries(v))put(p+'/'+k,val);return Promise.resolve();},
    transaction:(fn,complete)=>Promise.resolve().then(()=>{
      const v=fn(get(p)); if(v!==undefined)put(p,v);
      const result={committed:v!==undefined,snapshot:snapshot(p)};
      if(complete)complete(null,result.committed,result.snapshot);return result;
    })
  });
  const user={uid:selectedUid,displayName:selectedUid==='fixture'?'Sync test':'Fresh test account',photoURL:null,reload:()=>Promise.resolve()};
  let authChange;
  const auth={currentUser:user,getRedirectResult:()=>Promise.resolve(null),onAuthStateChanged:fn=>{authChange=fn;const t=setTimeout(()=>fn(user),50);return()=>clearTimeout(t);}};
  window.firebase={initializeApp:()=>{},auth:()=>auth,database:()=>({ref})};
  window.addEventListener('load',()=>setTimeout(()=>{
    if(params.has('finance-links')){
      obDismiss();dailyUpdateDismiss();if(params.has('plan')){setView('budget');setBudgetView('plan');
        const form=document.getElementById('plan-scenario-form');form.elements.starting.value='1500';form.elements.spending.value='650';form.elements.savings.value='100';budPlanScenarioRun({preventDefault(){},target:form});
      }else if(params.has('overview'))openBudgetOverview();else openAccounts();
      const banner=document.createElement('p');banner.textContent='Local preview · sample money only. Changes here do not affect your saved finances.';
      banner.style='padding:12px;border:1px solid var(--border);border-radius:12px;font-size:13px;color:var(--muted)';
      document.getElementById('view-budget').prepend(banner);return;
    }
    if(new URL(location.href).searchParams.has('onboarding')||params.has('preview'))return;
    const report=document.createElement('pre');report.id='sync-test-result';
    report.style='position:fixed;inset:10px 10px auto;z-index:999999;padding:20px;background:#fff;color:#000;font:15px monospace;white-space:pre-wrap';
    const unchanged=['sessions','weights','trainingSplit','exerciseLib','plans','budgetIncCats','budgetFixCats'].filter(k=>initial[k]!=null).every(k=>JSON.stringify(stores[k])===JSON.stringify(initial[k]));
    const checks={freshAccount:fresh,existingCloudDataUnchanged:unchanged,restoredSessions:fresh?S.sessions.length===0:S.sessions.length===2,
      restoredWeight:fresh?S.weights.length===0:S.weights.length===1,restoredProgram:fresh?true:splitCfg().types[0].name==='Saved cloud workout',
      finance:fresh?{noIncomeSources:loadIncCats().length===0,noBills:loadFixCats().length===0,noIncome:weekIncome({})===0,noCommitments:weekFixedTotal({})===0}:
        {restoredPayFrequency:loadIncCats()[0]?.payCycle==='fortnightly',restoredPayDate:loadIncCats()[0]?.payDate==='2026-10-02',restoredBill:catBudget(loadFixCats()[0])===250},
      ready:_cloudWorkoutReady,errors,writesToWorkoutStores:writes.filter(p=>/\/(sessions|weights|trainingSplit|exerciseLib|plans)(\/|$)/.test(p))};
    report.textContent='ISOLATED FRESH-PROFILE SYNC TEST\n'+JSON.stringify(checks,null,2);
    const button=document.createElement('button');button.textContent='Inspect restored workout';
    button.onclick=()=>{report.remove();obDismiss();setView('log');};report.appendChild(button);
    const financeButton=document.createElement('button');financeButton.textContent='Inspect Finance setup';
    financeButton.onclick=()=>{report.remove();obDismiss();openBudgetEditor();};report.appendChild(financeButton);
    if(switchKey){
      const switchButton=document.createElement('button');switchButton.textContent=selectedUid==='fixture'?'Switch to fresh test account':'Return to original test account';
      switchButton.onclick=()=>{const uid=selectedUid==='fixture'?'fresh-fixture':'fixture';memory.set('fixture-user',uid);persistMemory();auth.currentUser={uid,displayName:'Test account'};authChange(auth.currentUser);};report.appendChild(switchButton);
    }
    document.body.appendChild(report);
  },1500));
})();
