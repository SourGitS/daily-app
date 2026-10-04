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
  Object.defineProperty(navigator,'serviceWorker',{value:{controller:null,register:()=>Promise.resolve({update:()=>Promise.resolve()}),addEventListener:()=>{}}});
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
  if(params.has('onboarding'))stores.profile={};
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
  const user={uid:selectedUid,displayName:selectedUid==='fixture'?'Sync test':'Fresh test account',photoURL:null};
  let authChange;
  const auth={currentUser:user,getRedirectResult:()=>Promise.resolve(null),onAuthStateChanged:fn=>{authChange=fn;const t=setTimeout(()=>fn(user),50);return()=>clearTimeout(t);}};
  window.firebase={initializeApp:()=>{},auth:()=>auth,database:()=>({ref})};
  window.addEventListener('load',()=>setTimeout(()=>{
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
