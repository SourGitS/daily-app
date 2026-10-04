const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(seed={},confirm=false){
  const m=new Map(Object.entries(seed)),listeners={};let reloads=0,confirms=0;
  const native={getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),key:i=>[...m.keys()][i]??null,get length(){return m.size;}};
  const c=vm.createContext({window:{localStorage:native,location:{reload:()=>reloads++},addEventListener:(name,fn)=>listeners[name]=fn},document:{body:{style:{}}},confirm:()=>{confirms++;return confirm;}});
  vm.runInContext(fs.readFileSync('js/account-storage.js','utf8'),c);
  return {c,m,native,listeners,get reloads(){return reloads;},get confirms(){return confirms;}};
}
test('account B starts empty on the same browser and account A remains recoverable',()=>{
  const f=fixture({'daily-account-active':'user:A','daily-account:user%3AA:daily_budget_fix_cats':'[{"name":"Private gym"}]'});
  assert.equal(f.c.dailySwitchAccount({uid:'B'}),true);assert.equal(f.reloads,1);
  assert.equal(f.c.dailyScopedStorage(f.native,'user:B').getItem('daily_budget_fix_cats'),null);
  assert.match(f.c.dailyScopedStorage(f.native,'user:A').getItem('daily_budget_fix_cats'),/Private gym/);
  assert.equal(f.c.dailyAccountMatches({uid:'B'}),false,'old document cannot write as the new user');
});
test('late callbacks stay bound to A after switching the active pointer to B',()=>{
  const f=fixture({'daily-account-active':'user:A'});f.c.dailySwitchAccount({uid:'B'});
  vm.runInContext("localStorage.setItem('daily_ledger','late A value')",f.c);
  assert.equal(f.c.dailyScopedStorage(f.native,'user:A').getItem('daily_ledger'),'late A value');
  assert.equal(f.c.dailyScopedStorage(f.native,'user:B').getItem('daily_ledger'),null);
});
test('legacy data is retained but never attributed to a new account without the ownership choice',()=>{
  const f=fixture({daily_profile:'{"onboardingVersion":2}',daily_budget:'{"private":true}',daily_weather_cache:'weather'},false);
  f.c.dailySwitchAccount({uid:'B'});assert.equal(f.confirms,1);assert.equal(f.native.getItem('daily_budget'),'{"private":true}');
  assert.equal(f.c.dailyScopedStorage(f.native,'user:B').getItem('daily_budget'),null);
});
test('explicit legacy attachment copies data and timestamps without advancing them',()=>{
  const f=fixture({daily_profile:'{"onboardingVersion":2}',daily_budget:'{"private":true}',daily_budget_ts:'13',daily_weather_cache:'weather'},true);
  f.c.dailySwitchAccount({uid:'A'});const a=f.c.dailyScopedStorage(f.native,'user:A');
  assert.equal(a.getItem('daily_budget_ts'),'13');assert.equal(a.getItem('daily_budget'),'{"private":true}');assert.equal(f.native.getItem('daily_budget_ts'),'13');
});
test('sign-out opens a separate guest scope; backups enumerate only current account application keys',()=>{
  const f=fixture({'daily-account-active':'user:A','firebase:auth':'sdk','daily-account:user%3AA:daily_profile':'A','daily-account:user%3AB:daily_profile':'B',daily_weather_cache:'weather'});
  const a=f.c.dailyScopedStorage(f.native,'user:A');assert.deepEqual(Array.from({length:a.length},(_,i)=>a.key(i)).sort(),['daily_profile','daily_weather_cache']);
  f.c.dailySwitchAccount(null);assert.equal(f.native.getItem('daily-account-active'),'guest');assert.equal(f.c.dailyScopedStorage(f.native,'guest').getItem('daily_profile'),null);
  assert.equal(f.native.getItem('firebase:auth'),'sdk');
});
test('cross-tab account switch hides the old document and reloads it',()=>{
  const f=fixture({'daily-account-active':'user:A'});f.listeners.storage({key:'daily-account-active',newValue:'user:B'});assert.equal(f.reloads,1);assert.equal(f.c.document.body.inert,true);assert.equal(f.c.document.body.style.visibility,'hidden');
});
test('corrupt legacy profile cannot strand sign-in or leak its records',()=>{
  const f=fixture({daily_profile:'{invalid',daily_budget:'{"data":1}'});assert.equal(f.c.dailySwitchAccount({uid:'B'}),true);assert.equal(f.reloads,1);assert.equal(f.c.dailyScopedStorage(f.native,'user:B').getItem('daily_budget'),null);
});
test('first sign-in retains staged onboarding only for its destination account, without seeding profile stores',()=>{
  const f=fixture(),drafts=new Map();
  Object.assign(f.c,{obData:{name:'New member',focus:['budget']},obStep:3,obHabitOptions:[],obSplitDraft:null,obBudgetStarted:false,obCaptureCurrent:()=>{}});
  f.c.document.getElementById=()=>({classList:{contains:()=>false}});
  f.c.window.sessionStorage={setItem:(k,v)=>drafts.set(k,v),getItem:k=>drafts.get(k)||null,removeItem:k=>drafts.delete(k)};
  f.c.dailySwitchAccount({uid:'new-user'});assert.equal(drafts.size,1);assert.equal(f.c.dailyScopedStorage(f.native,'user:new-user').getItem('daily_profile'),null);
  let rendered=0;Object.assign(f.c,{showOnboarding:()=>{},obSteps:()=>['a','b','c','d'],renderObStep:()=>rendered++});
  f.c.dailyResumeOnboardingDraft('another-user',false);assert.equal(rendered,0);
  f.c.dailyResumeOnboardingDraft('new-user',false);assert.equal(rendered,1);assert.equal(f.c.obData.name,'New member');assert.equal(f.c.obStep,3);assert.equal(drafts.size,0);
});
test('restoring an existing cloud profile discards a pending onboarding draft instead of applying it',()=>{
  const f=fixture(),drafts=new Map([['daily-onboarding-draft:A',JSON.stringify({data:{name:'Draft'},step:2})]]);let resumed=0;
  f.c.window.sessionStorage={getItem:k=>drafts.get(k)||null,removeItem:k=>drafts.delete(k)};f.c.showOnboarding=()=>resumed++;
  f.c.dailyResumeOnboardingDraft('A',true);assert.equal(resumed,0);assert.equal(drafts.size,0);
});
