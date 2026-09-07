// Test-only Firebase and localStorage. This page cannot contact the production database.
(() => {
  const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
  const memory=new Map();
  Object.defineProperty(window,'localStorage',{value:{
    getItem:k=>memory.has(k)?memory.get(k):null,
    setItem:(k,v)=>memory.set(k,String(v)), removeItem:k=>memory.delete(k),
    key:i=>[...memory.keys()][i], get length(){return memory.size;}
  }});
  Object.defineProperty(navigator,'serviceWorker',{value:{controller:null,register:()=>Promise.resolve({update:()=>Promise.resolve()}),addEventListener:()=>{}}});
  const split={types:[{id:'cloud',name:'Saved cloud workout',colorKey:'legs',exercises:[{name:'Cloud squat',sets:3}]}],schedule:[0]};
  const workouts={one:{id:'one',date:'2026-09-01',sessionType:'Saved cloud workout',dayNum:1,exercises:[{name:'Cloud squat',sets:[{weight:100,reps:5}]}]},two:{id:'two',date:'2026-09-03',sessionType:'Saved cloud workout',dayNum:1,exercises:[{name:'Cloud squat',sets:[{weight:105,reps:5}]}]}};
  const stores={sessions:workouts,weights:{20260903:{date:'2026-09-03',weight:80}},
    trainingSplit:{v:JSON.stringify(split),t:500},
    exerciseLib:{v:JSON.stringify([{id:'cloud-squat',name:'Cloud squat',custom:true,muscle:'legs'}]),t:500},
    plans:{v:JSON.stringify({plans:[{id:'saved-plan',name:'Saved program',split}],activePlanId:'saved-plan',streak:{count:0,lastDate:''}}),t:500},
    profile:{name:'Sync test',onboardingVersion:999,lastSeenWhatsNew:999}
  };
  const initial=clone(stores),listeners=new Map(),writes=[],errors=[];
  window.addEventListener('error',e=>errors.push(e.message));
  window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
  const root={users:{fixture:stores}};
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
  const user={uid:'fixture',displayName:'Sync test',photoURL:null};
  const auth={currentUser:user,getRedirectResult:()=>Promise.resolve(null),onAuthStateChanged:fn=>{const t=setTimeout(()=>fn(user),50);return()=>clearTimeout(t);}};
  window.firebase={initializeApp:()=>{},auth:()=>auth,database:()=>({ref})};
  window.addEventListener('load',()=>setTimeout(()=>{
    const report=document.createElement('pre');report.id='sync-test-result';
    report.style='position:fixed;inset:10px 10px auto;z-index:999999;padding:20px;background:#fff;color:#000;font:15px monospace;white-space:pre-wrap';
    const unchanged=['sessions','weights','trainingSplit','exerciseLib','plans'].every(k=>JSON.stringify(stores[k])===JSON.stringify(initial[k]));
    const checks={cloudWorkoutDataUnchanged:unchanged,restoredSessions:S.sessions.length===2,
      restoredWeight:S.weights.length===1,restoredProgram:splitCfg().types[0].name==='Saved cloud workout',
      ready:_cloudWorkoutReady,errors,writesToWorkoutStores:writes.filter(p=>/\/(sessions|weights|trainingSplit|exerciseLib|plans)(\/|$)/.test(p))};
    report.textContent='ISOLATED FRESH-PROFILE SYNC TEST\n'+JSON.stringify(checks,null,2);
    const button=document.createElement('button');button.textContent='Inspect restored workout';
    button.onclick=()=>{report.remove();obDismiss();setView('log');};report.appendChild(button);
    document.body.appendChild(report);
  },1500));
})();
