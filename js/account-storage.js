'use strict';

// Each document keeps its original namespace, including callbacks finishing during sign-out.
// Firebase's own authentication keys stay in native storage, outside the app's namespace.
function dailyScopedStorage(native, scope){
  const prefix='daily-account:'+encodeURIComponent(scope)+':';
  const shared=k=>k==='daily_weather_cache';
  const appKey=k=>/^(daily_|wt_|kitchen_)/.test(k);
  const physical=k=>shared(k)||scope==='legacy'?k:prefix+k;
  const keys=()=>{
    const out=[];
    for(let i=0;i<native.length;i++){
      const k=native.key(i);
      if(shared(k))out.push(k);
      else if(scope==='legacy'&&appKey(k))out.push(k);
      else if(scope!=='legacy'&&k.startsWith(prefix))out.push(k.slice(prefix.length));
    }
    return out;
  };
  return {scope,
    keys,
    logicalKey:k=>typeof k==='string'&&(shared(k)||scope==='legacy'&&appKey(k))?k:
      typeof k==='string'&&scope!=='legacy'&&k.startsWith(prefix)?k.slice(prefix.length):null,
    getItem:k=>native.getItem(physical(String(k))),
    setItem:(k,v)=>native.setItem(physical(String(k)),String(v)),
    removeItem:k=>native.removeItem(physical(String(k))),
    key:i=>keys()[i]||null,
    get length(){return keys().length;},
    clear:()=>keys().filter(k=>!shared(k)).forEach(k=>native.removeItem(physical(k)))
  };
}
const dailyNativeStorage=window.localStorage;
const localStorage=dailyScopedStorage(dailyNativeStorage,dailyNativeStorage.getItem('daily-account-active')||'legacy');
function dailyAccountMatches(user){
  return localStorage.scope===(user?'user:'+user.uid:'guest')||(!user&&localStorage.scope==='legacy');
}
function dailySwitchAccount(user){
  if(dailyAccountMatches(user))return false;
  const target=user?'user:'+user.uid:'guest';
  const destination=dailyScopedStorage(dailyNativeStorage,target);
  if(user&&(localStorage.scope==='legacy'||localStorage.scope==='guest')){
    let profile={};try{profile=JSON.parse(localStorage.getItem('daily_profile')||'{}')||{};}catch(e){}
    const meaningful=!!profile.onboardingVersion||dailyHasOfflineRecords(localStorage);
    if(!meaningful)dailyKeepOnboardingDraft(user.uid);
    const hasDestination=Array.from({length:destination.length},(_,i)=>destination.key(i)).some(k=>k!=='daily_weather_cache');
    if(meaningful&&!hasDestination&&confirm('This browser has existing offline Daily data. Does it belong to '+(user.displayName||'this account')+'?\n\nOK: attach it to this account. Cancel: load only this account’s cloud data. The previous offline copy is retained on this device.')){
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);if(k!=='daily_weather_cache'&&!k.startsWith('daily_finance_seen_'))destination.setItem(k,localStorage.getItem(k));
      }
    }
  }
  dailyNativeStorage.setItem('daily-account-active',target);
  document.body.inert=true;
  document.body.style.visibility='hidden';
  // Finish revocation before reloading, so a queued push cannot target the previous account.
  if(typeof dailyNotifyBinding!=='function'){window.location.reload();return true;}
  const revoke=dailyNotifyBinding().then(b=>{
    if(b&&b.scope!==target)return dailyNotifyPatch(b.scope,b.token,{enabled:false,token:crypto.randomUUID()});
  });
  revoke.catch(()=>{}).finally(()=>window.location.reload());
  return true;
}
function dailyHasOfflineRecords(storage){
  const stores=['wt_sessions','wt_weight','wt_notes','daily_budget','daily_transactions','daily_ledger',
    'daily_accounts','daily_reviews','daily_savings_log','wt_plans','kitchen_recipes',
    'daily_nutrition_log','daily_my_foods','daily_habits_log','daily_cal_history','daily_saved_foods',
    'daily_cc_log','wt_exercise_lib','kitchen_shopping_selected','kitchen_shopping_manual','wt_calories'];
  const records=stores.some(key=>{
    const raw=storage.getItem(key);
    if(!raw)return false;
    try{
      const value=JSON.parse(raw);
      if(!value||typeof value!=='object')return false;
      if(key==='daily_nutrition_log')return !!(Object.keys(value.entries||{}).length||Object.keys(value.legacyTotals||{}).length);
      if(key==='daily_my_foods')return !!Object.keys(value.foods||{}).length;
      if(key==='wt_calories')return !!value.entries?.length;
      if(key==='wt_plans'&&!Array.isArray(value))return !!value.plans?.length;
      return Object.keys(value).length>0;
    }catch(e){return false;}
  });
  if(records)return true;
  // These stores are seeded during startup. Only a deliberate edit advances their timestamp.
  return ['kitchen_pantry','daily_budget_cycles','daily_budget_inc_cats','daily_budget_fix_cats',
    'daily_budget_var_cats','daily_habits','daily_weight_goal','wt_split'].some(key=>
    storage.getItem(key)!==null&&Number(storage.getItem(key+'_ts'))>0);
}
function dailyKeepOnboardingDraft(uid){
  if(typeof obData==='undefined'||typeof obStep==='undefined'||obStep<1)return;
  const overlay=document.getElementById('onboarding-overlay');
  if(!overlay||overlay.classList.contains('hidden'))return;
  if(typeof obCaptureCurrent==='function')obCaptureCurrent();
  try{
    window.sessionStorage.setItem('daily-onboarding-draft:'+encodeURIComponent(uid),JSON.stringify({
      data:obData,step:obStep,habits:obHabitOptions,split:obSplitDraft,budgetStarted:obBudgetStarted
    }));
  }catch(e){console.warn('Could not retain onboarding draft',e);}
}
function dailyResumeOnboardingDraft(uid,hasCloudProfile){
  const key='daily-onboarding-draft:'+encodeURIComponent(uid);let draft;
  try{draft=JSON.parse(window.sessionStorage.getItem(key)||'null');window.sessionStorage.removeItem(key);}catch(e){return;}
  if(!draft||hasCloudProfile||!draft.data||typeof showOnboarding!=='function')return;
  showOnboarding();obData=draft.data;obHabitOptions=Array.isArray(draft.habits)?draft.habits:[];
  obSplitDraft=draft.split||null;obBudgetStarted=!!draft.budgetStarted;
  obStep=Math.max(0,Math.min(Number(draft.step)||0,obSteps().length-1));renderObStep();
}
window.addEventListener('storage',e=>{
  if(e.key==='daily-account-active'&&e.newValue!==localStorage.scope){
    document.body.inert=true;document.body.style.visibility='hidden';window.location.reload();
  }
});
