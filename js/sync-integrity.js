'use strict';

// Firebase removes empty objects. Keeping the last explicit replacement date in a keyed
// collection both represents an intentional empty collection and fences stale offline rows.
const DAILY_RESTORE_MARK = '__dailyRestoredAt';
function dailyRestoreUnwrap(raw) {
  if(raw?.__dailyEmpty==='array')return [];
  if(raw?.__dailyEmpty==='object')return {};
  return raw;
}
function dailyRestoreCutoff(raw) {
  return Number(raw && raw[DAILY_RESTORE_MARK]) || 0;
}
function dailyAfterRestore(rows, cutoff, timeOf) {
  return cutoff ? rows.filter(row => timeOf(row) >= cutoff) : rows;
}
function dailyWorkoutGeneration(rows, generation){
  return generation?rows.filter(row=>row?.restoreGeneration===generation):rows;
}
function dailyAfterRestoreMap(map, cutoff) {
  return Object.fromEntries(Object.entries(map || {}).filter(([id, row]) =>
    id !== DAILY_RESTORE_MARK && (!cutoff || Number(row?.updatedAt) >= cutoff)));
}

const dailyRestoreSpecial = {
  daily_profile:'profile', daily_budget_defaults:'budgetDefaults', wt_personalinfo:'personalInfo',
  daily_habits:'habits', daily_budget:'budgetData', daily_budget_config:'budgetConfig',
  daily_weight_goal:'weightGoal', daily_subscriptions:'subscriptions', wt_notes:'notes',
  daily_reviews:'weeklyReviews', wt_sessions:'sessions', wt_weight:'weights', daily_savings_log:'savingsLog'
};
const dailyRestoreArrayKeys = new Set(['wt_sessions','wt_weight','daily_savings_log','daily_accounts',
  'daily_transactions','daily_ledger','daily_ai_requests','kitchen_recipes','daily_habits','daily_subscriptions',
  'daily_budget_inc_cats','daily_budget_fix_cats','daily_budget_var_cats','daily_income_streams','daily_cc_log',
  'daily_home_order','daily_accent_favourites','wt_exercise_lib','wt_custom_muscles','wt_lib_hidden',
  'kitchen_shopping_selected','kitchen_shopping_manual','daily_saved_foods','daily_checkin_log','daily_weight_log']);
const dailyRestoreObjectKeys = new Set(['daily_profile','daily_budget_defaults','wt_personalinfo','daily_budget',
  'daily_budget_config','daily_weight_goal','daily_reviews','daily_nutrition_log','daily_my_foods','daily_food_prefs',
  'daily_budget_cycles','daily_cc','daily_habits_log','daily_day_colors','wt_swaps','wt_day_custom','wt_split',
  'kitchen_shopping_checked','kitchen_pantry','wt_calories','daily_cal_history','daily_review_plan',
  'daily_home_layout','daily_category_home_mobile','daily_category_home_desktop']);
const dailyRestoreStringLists = new Set(['daily_habits','daily_home_order','daily_accent_favourites','wt_custom_muscles','wt_lib_hidden']);
const dailyRestoreObject = v => v!==null && typeof v==='object' && !Array.isArray(v);
const dailyRestoreNumber = v => (typeof v==='number'||typeof v==='string'&&v.trim()!=='') && Number.isFinite(Number(v));
const dailyRestoreDate = v => typeof v==='string' && aiActValidDate(v);

// Check the shapes consumed by the normal readers before a replacement can become authoritative.
// Older exports used both wrapped and bare plan / note collections and sometimes string numbers.
function dailyRestoreCheckStore(key,v){
  const object=dailyRestoreObject, validDate=dailyRestoreDate, number=dailyRestoreNumber;
  const check=ok=>{if(!ok)throw Error('Invalid data in '+key+'.');};
  const strings=list=>Array.isArray(list)&&list.every(s=>typeof s==='string');
  const rows=list=>Array.isArray(list)&&list.every(object);
  if(dailyRestoreArrayKeys.has(key)){
    if(dailyRestoreStringLists.has(key))check(strings(v));
    else if(key==='daily_checkin_log')check(Array.isArray(v)&&v.every(validDate));
    else check(rows(v));
  }
  if(dailyRestoreObjectKeys.has(key))check(object(v));
  if(key==='wt_notes')check(object(v)||Array.isArray(v));
  if(key==='wt_plans')check(rows(Array.isArray(v)?v:v?.plans));
  if(['kitchen_recipes','daily_budget_inc_cats','daily_budget_fix_cats','daily_budget_var_cats'].includes(key)){
    const ids=new Set();
    for(const row of v){
      const id=row.id;
      check((typeof id==='string'&&id.trim()||typeof id==='number'&&Number.isFinite(id))&&!ids.has(String(id))&&typeof row.name==='string');
      ids.add(String(id));
    }
  }
  if(key==='wt_split')check(rows(v.types)&&v.types.length&&v.types.every(type=>
    type.exercises===undefined||rows(type.exercises))&&(v.schedule===undefined||Array.isArray(v.schedule)));
  if(key==='daily_budget_config')check(['incomeStreams','fixedExpenses','variableExpenses'].every(k=>rows(v[k])));
  if(key==='daily_weight_goal')check((v.target==null||number(v.target))&&(!v.date||validDate(v.date)));
  if(key==='daily_home_layout'){
    const profile=p=>object(p)&&['order','hidden','wide'].every(k=>p[k]===undefined||strings(p[k]));
    check(v.schemaVersion===2 ? profile(v.mobile)&&profile(v.desktop) : profile(v)&&
      (v.schemaVersion===undefined||v.schemaVersion===1)&&!('mobile' in v||'desktop' in v));
  }
  if(key==='daily_my_foods')check(object(v.foods)&&Object.values(v.foods).every(f=>object(f)&&typeof f.name==='string'&&f.name.trim()));
  if(key==='wt_calories')check(validDate(v.date)&&rows(v.entries));
  if(key==='daily_cal_history')check(Object.entries(v).every(([date,total])=>validDate(date)&&number(object(total)?total.calories:total)));
  if(key==='daily_habits_log')check(Object.entries(v).every(([date,ids])=>validDate(date)&&Array.isArray(ids)&&ids.every(Number.isInteger)));
  if(key==='daily_cc_log')check(v.every(r=>validDate(r.date)&&number(r.balance)));
  if(key==='daily_weight_log')check(v.every(r=>validDate(r.date)&&number(r.kg===undefined?r.weight:r.kg)));
  if(key==='daily_nutrition_log'){
    check(object(v.entries)&&(v.legacyTotals===undefined||object(v.legacyTotals)));
    check(Object.entries(v.legacyTotals||{}).every(([date,row])=>validDate(date)&&object(row)&&number(row.calories)));
  }
}
function dailyRestoreStage(data, time) {
  const writes = new Map(), updates = Object.create(null);
  const registered = new Map(SYNC_BLOB_REG.map(store => [store.lsKey,store.path]));
  // Accounts attaches after its initial migration read. A restore may arrive before that read finishes.
  registered.set('daily_accounts','accounts');
  registered.set('daily_nutrition_log','nutritionLog');
  const recordKeys = { wt_sessions:'id', wt_weight:'date', daily_savings_log:'date', wt_notes:'id',
    daily_transactions:'id', daily_ledger:'id', daily_accounts:'id', daily_ai_requests:'id' };
  const object = dailyRestoreObject;
  const validKey = k => typeof k==='string' && k && !/[.#$\[\]/\u0000-\u001f\u007f]/.test(k) &&
    k!==DAILY_RESTORE_MARK && !['__proto__','prototype','constructor'].includes(k);
  for (const [key,input] of Object.entries(data)) {
    if(!/^(daily_|wt_|kitchen_)/.test(key) || /_ts$/.test(key)||/^daily_finance_(pending|seen)_/.test(key)||
       ['daily_weather_cache','daily_weather_forecast_mobile','daily_pantry_ui','daily_nav_ui','daily_budget_ui'].includes(key)) continue;
    const raw = typeof input==='string'?input:JSON.stringify(input);
    let value = input;
    if(dailyRestoreArrayKeys.has(key)||dailyRestoreObjectKeys.has(key)||key==='wt_notes'||
       key==='wt_plans'||(typeof input==='string'&&/^[\s]*[\[{]/.test(input))) {
      try { value=JSON.parse(raw); } catch { throw Error('Invalid JSON in '+key+'.'); }
      dailyRestoreCheckStore(key,value);
    }
    const isWorkout=key==='wt_sessions'||key==='wt_weight';
    const revision=isWorkout?Math.max(time,(Number(localStorage.getItem(key+'_restore_ts'))||0)+1):time;
    let encoded=raw, keyed=null;
    if(recordKeys[key]) {
      const field=recordKeys[key], rows=Array.isArray(value)?value:Object.values(value), ids=new Set();
      for(const row of rows) {
        const id=row?.[field];
        const idText=typeof id==='string'||typeof id==='number'&&Number.isFinite(id)?String(id):'';
        if(!object(row)||!validKey(idText)||ids.has(idText)||id===0||
           field==='date'&&!dailyRestoreDate(idText)) throw Error('Invalid or duplicate '+field+' in '+key+'.');
        if(row.deletedAt!=null&&(!dailyRestoreNumber(row.deletedAt)||Number(row.deletedAt)<0))throw Error('Invalid deletion date in '+key+'.');
        const deleted=Number(row.deletedAt)>0;
        if(key==='wt_sessions'&&!deleted&&(!dailyRestoreDate(row.date)||!Array.isArray(row.exercises)||
           !row.exercises.every(ex=>object(ex)&&Array.isArray(ex.sets)&&ex.sets.every(object))))throw Error('Invalid workout in '+key+'.');
        if(key==='wt_weight'&&!deleted&&!dailyRestoreNumber(row.weight))throw Error('Invalid weight in '+key+'.');
        if(key==='daily_savings_log'&&!dailyRestoreNumber(row.balance))throw Error('Invalid savings balance in '+key+'.');
        if(['daily_transactions','daily_ledger'].includes(key)&&!deleted&&
           (!dailyRestoreDate(row.date)||!dailyRestoreNumber(row.amount)))throw Error('Invalid financial record in '+key+'.');
        if(key==='daily_accounts'&&(!['asset','debt'].includes(row.type)||typeof row.name!=='string'))throw Error('Invalid account in '+key+'.');
        if(key==='daily_ai_requests'&&typeof row.status!=='string')throw Error('Invalid request status in '+key+'.');
        ids.add(idText);
      }
      if(['wt_sessions','wt_weight','daily_savings_log','wt_notes'].includes(key)) {
        const stamped=rows.map(row => {
          if(key==='daily_savings_log')return {...row,t:time};
          const record=key==='wt_notes'?jrnNormalise(row):row;
          return {...record,updatedAt:revision,...(isWorkout?{restoreGeneration:revision}:{}),
            ...(record.deletedAt!=null?{deletedAt:Number(record.deletedAt)>0?revision:null}:{})};
        });
        encoded=JSON.stringify(stamped);
        keyed=Object.fromEntries(stamped.map(row=>[field==='date'?row.date.replace(/-/g,''):String(row.id),row]));
      }
    }
    if(key==='daily_reviews'||key==='daily_budget') {
      for(const [id,row] of Object.entries(value)) {
        if(!dailyRestoreDate(id)||!object(row))throw Error('Invalid week in '+key+'.');
      }
      value=Object.fromEntries(Object.entries(value).map(([id,row])=>[id,{...row,updatedAt:time}]));
      encoded=JSON.stringify(value);keyed=value;
    }
    if(key==='daily_budget_config') {value={...value,updatedAt:time};encoded=JSON.stringify(value);}
    if(key==='daily_home_layout') {
      const layout=homeLayoutsNormalise(value,time);
      layout.mobile.updatedAt=time;layout.desktop.updatedAt=time;encoded=JSON.stringify(layout);
    }
    if(key==='daily_nutrition_log') {
      for(const [id,row] of Object.entries(value.entries)) {
        if(!validKey(id)||!object(row)||!dailyRestoreDate(row.date))throw Error('Invalid food log entry.');
        if(row.nutrition!=null&&(!object(row.nutrition)||['calories','protein','carbs','fat'].some(
          field=>row.nutrition[field]!=null&&!dailyRestoreNumber(row.nutrition[field]))))throw Error('Invalid food log nutrition.');
        row.updatedAt=time;if(row.deletedAt)row.deletedAt=time;
      }
      value.restoreAt=time;
      encoded=JSON.stringify(value);
    }
    writes.set(key,encoded);writes.set(key+'_ts',String(time));
    if(dailyRestoreSpecial[key]) {
      const empty=value&&typeof value==='object'&&!Object.keys(value).length;
      updates[dailyRestoreSpecial[key]]=keyed?{...keyed,[DAILY_RESTORE_MARK]:revision}:
        empty?{__dailyEmpty:Array.isArray(value)?'array':'object',[DAILY_RESTORE_MARK]:time}:value;
    }
    else if(registered.has(key)) {
      const path=registered.get(key);
      updates[path]={v:encoded,t:time,restoreAt:time,...(dailyFinancePaths[path]?{recordSync:1}:{})};
    }
  }
  if(!writes.size)throw Error('No restorable Daily data was found.');
  return {writes,updates,time};
}
function dailyRestoreAdvanceWorkouts(plan,before){
  // Even a lagging device, or two restores in one millisecond, must create a distinct
  // generation. The compare-and-swap below still checks the exact snapshot used here.
  for(const [key,path] of [['wt_sessions','sessions'],['wt_weight','weights']]){
    if(!plan.writes.has(key))continue;
    const last=dailyRestoreCutoff(before[path]),stage=plan.updates[path];
    if(last<dailyRestoreCutoff(stage))continue;
    const generation=last+1,rows=JSON.parse(plan.writes.get(key)).map(row=>({
      ...row,restoreGeneration:generation,updatedAt:generation,...(row.deletedAt?{deletedAt:generation}:{})
    }));
    plan.writes.set(key,JSON.stringify(rows));
    const field=key==='wt_sessions'?'id':'date';
    plan.updates[path]={...Object.fromEntries(rows.map(row=>[wtRecordKey(row,field),row])),[DAILY_RESTORE_MARK]:generation};
  }
}
function dailyRestoreWriteLocal(plan) {
  const previous=new Map();
  try {
    for(const key of ['wt_sessions','wt_weight'])if(plan.writes.has(key)){
      plan.writes.set(key+'_restore_ts',String(dailyRestoreCutoff(plan.updates[dailyRestoreSpecial[key]])));
    }
    for(const [path,key] of Object.entries(dailyFinancePaths))if(plan.writes.has(key)){
      for(const job of dailyFinanceKeys(path))if(job.t<=plan.time)plan.writes.set(job.key,null);
      plan.writes.set('daily_finance_seen_'+path,String(plan.time));
    }
    for(const [key,value] of plan.writes) {
      previous.set(key,localStorage.getItem(key));
      if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);
    }
  } catch(error) {
    // Release space from newly created keys before putting the older values back.
    for(const [key,value] of previous)if(value===null)localStorage.removeItem(key);
    for(const [key,value] of previous)if(value!==null)localStorage.setItem(key,value);
    throw error;
  }
}

// A live listener may write the restored records locally before the root transaction's
// acknowledgement. Recognise that echo, including Firebase's omitted empty children and
// the local sorted order of date-keyed histories, without treating a new edit as an echo.
function dailyRestoreEquivalent(key,a,b){
  if(a===b)return true;
  if(a===null||b===null||key.endsWith('_ts'))return false;
  try{
    const normalize=raw=>{
      let value=JSON.parse(raw);
      if(key==='daily_reviews'&&typeof wkrNormaliseReviews==='function')value=wkrNormaliseReviews(value);
      if(Array.isArray(value)&&['wt_notes','wt_sessions','wt_weight','daily_savings_log'].includes(key)){
        const field=key==='wt_notes'||key==='wt_sessions'?'id':'date';
        value.sort((l,r)=>String(l[field]).localeCompare(String(r[field])));
      }
      const compact=v=>{
        if(Array.isArray(v))return v.map(compact);
        if(!v||typeof v!=='object')return v;
        return Object.fromEntries(Object.entries(v).filter(([,child])=>
          child!=null&&(typeof child!=='object'||Object.keys(child).length)).map(([k,child])=>[k,compact(child)]));
      };
      return dailyRemoteStable(compact(value));
    };
    return normalize(a)===normalize(b);
  }catch{return false;}
}
function dailyRestoreLocalChanged(plan,allowEcho){
  for(const [key,before] of plan.localBefore){
    const now=localStorage.getItem(key);
    if(now===before)continue;
    if(allowEcho&&(dailyRestoreEquivalent(key,now,plan.writes.get(key))||
        key.endsWith('_ts')&&dailyRestoreEquivalent(key.slice(0,-3),
          localStorage.getItem(key.slice(0,-3)),plan.writes.get(key.slice(0,-3)))))continue;
    return true;
  }
  return false;
}

const dailyFinancePaths={transactions:'daily_transactions',ledger:'daily_ledger'};
const dailyFinanceViews=new Map(), dailyFinanceListeners=new Map(), dailyFinanceQueues=new Map();
const dailyFinanceConflicts=new Map();
function dailyFinanceUsesDefault(){
  return typeof dailyRemoteOrigin!=='function'||!dailyRemoteOrigin()||
    dailyRemoteState.uid===auth?.currentUser?.uid&&dailyRemoteState.enabled===false;
}
function dailyFinanceCopy(records){return JSON.parse(JSON.stringify(records));}
function dailyFinanceView(path,records){
  dailyFinanceViews.set(path,dailyFinanceCopy(records));return records;
}
function dailyFinanceKeys(path){
  const prefix='daily_finance_pending_'+path+'_';
  const all=localStorage.keys?localStorage.keys():Array.from({length:localStorage.length},(_,i)=>localStorage.key(i));
  const keys=all.filter(key=>key?.startsWith(prefix));
  return keys.sort().map(key=>({key,...JSON.parse(localStorage.getItem(key))}));
}
function dailyFinanceDirty(path){return dailyFinanceKeys(path).length>0;}
// Complete a device write interrupted after its journal entry was saved. This is needed
// on guest/offline reload too, where there may never be a Firebase listener to replay it.
function dailyFinanceRecover(path,rows){
  let recovered=rows;
  try{
    const jobs=dailyFinanceKeys(path);
    if(jobs.length){
      recovered=dailyFinanceApply(rows,jobs);
      if(dailyRemoteStable(rows)!==dailyRemoteStable(recovered))
        localStorage.setItem(dailyFinancePaths[path],JSON.stringify(recovered));
    }
  }catch(error){dailyFinanceIssue(path,error);}
  return dailyFinanceView(path,recovered);
}
function dailyFinanceOwn(uid){
  return auth?.currentUser?.uid===uid&&(typeof dailyAccountMatches!=='function'||dailyAccountMatches(auth.currentUser));
}
function dailyFinanceIssue(path,error){
  dailyFinanceConflicts.set(path,error.message||String(error));
  setSyncStatus('Financial sync needs review');
  if(typeof document!=='undefined'){
    const action=document.getElementById('finance-sync-review');if(action)action.hidden=false;
  }
}
function dailyFinanceIndex(rows){
  const index=new Map();
  for(const row of rows){
    const id=row?.id;
    if(!(typeof id==='string'&&id||typeof id==='number'&&Number.isFinite(id))||index.has(String(id)))
      throw Error('Missing or duplicate financial record ID.');
    index.set(String(id),row);
  }
  return index;
}
function dailyFinanceDelta(before,after){
  const a=dailyFinanceIndex(before),b=dailyFinanceIndex(after),changes=[];
  for(const id of new Set([...a.keys(),...b.keys()])){
    const old=a.get(id)||null,next=b.get(id)||null;
    if(dailyRemoteStable(old)!==dailyRemoteStable(next))changes.push({id,old,next});
  }
  return changes;
}
// Replaying is safe after a crash between a server acknowledgement and local cleanup.
// Each changed record accepts its original or an intermediate value in this device's history.
function dailyFinanceApply(rows,jobs){
  const index=dailyFinanceIndex(rows),history=new Map();
  for(const job of jobs)for(const change of job.changes){
    const {id,old,next}=change;let chain=history.get(id);
    if(!chain)history.set(id,chain={accepted:new Set(),final:old});
    if(dailyRemoteStable(old)!==dailyRemoteStable(chain.final)&&dailyRemoteStable(next)!==dailyRemoteStable(chain.final))
      throw Error('Two local edits disagree on a financial record.');
    chain.accepted.add(dailyRemoteStable(old));chain.accepted.add(dailyRemoteStable(next));
    chain.final=next;
  }
  for(const [id,chain] of history){
    if(!chain.accepted.has(dailyRemoteStable(index.get(id)||null)))throw Error('Another device changed the same financial record.');
    if(chain.final===null)index.delete(id);else index.set(id,chain.final);
  }
  return [...index.values()];
}
function dailyFinanceWrite(path,rows){
  const key=dailyFinancePaths[path], stored=dailyRemoteRows(localStorage.getItem(key));
  const disk=dailyFinanceApply(stored,dailyFinanceKeys(path));
  const changes=dailyFinanceDelta(dailyFinanceViews.get(path)||disk,rows);
  if(!changes.length)return dailyFinanceView(path,disk);
  const merged=dailyFinanceApply(disk,[{changes}]);
  const now=Date.now(),priorStamp=Number(localStorage.getItem(key+'_ts'))||0;
  const t=Math.max(now,priorStamp+1),uid=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2);
  const entry='daily_finance_pending_'+path+'_'+String(t).padStart(16,'0')+'_'+uid;
  const previous=localStorage.getItem(key);
  // Retain intent before changing the local snapshot so a crash can replay the edit.
  localStorage.setItem(entry,JSON.stringify({t,changes}));
  try{
    localStorage.setItem(key,JSON.stringify(merged));localStorage.setItem(key+'_ts',String(t));
  }catch(error){
    localStorage.removeItem(entry);
    if(localStorage.getItem(key)!==previous){
      if(previous===null)localStorage.removeItem(key);else localStorage.setItem(key,previous);
    }
    throw error;
  }
  dailyFinanceView(path,merged);
  try{syncBlobPush(path,key);}catch(error){dailyFinanceIssue(path,error);}
  return merged;
}
function dailyFinanceReceive(s,raw){
  if(!dailyFinanceOwn(s.uid))return;
  const cloud=dailyRemoteRows(raw),time=Number(raw?.t)||0,cutoff=Number(raw?.restoreAt)||0;
  const seenKey='daily_finance_seen_'+s.path,seen=Number(localStorage.getItem(seenKey))||0;
  if(time<seen&&raw!=null)return;
  const key=dailyFinancePaths[s.path], local=dailyRemoteRows(localStorage.getItem(key));
  const jobs=dailyFinanceKeys(s.path);
  const valid=jobs.filter(job=>!cutoff||job.t>cutoff);
  // On first upgrade, an old-format offline edit has no recorded base. Preserve both
  // versions for review if adopting the server could discard it.
  if(!seen&&!jobs.length&&raw&&localStorage.getItem(key)!==null&&Number(localStorage.getItem(key+'_ts'))>time&&
     dailyRemoteStable(local)!==dailyRemoteStable(cloud))throw Error('This device has an older-format unconfirmed financial edit.');
  const merged=dailyFinanceApply(raw==null?local:cloud,valid);
  localStorage.setItem(key,JSON.stringify(merged));
  localStorage.setItem(key+'_ts',String(Math.max(time,...valid.map(job=>job.t))));
  if(raw!=null)localStorage.setItem(seenKey,String(time||0));
  for(const job of jobs)if(cutoff&&job.t<=cutoff)localStorage.removeItem(job.key);
  dailyFinanceView(s.path,merged);
  syncApply(()=>s.onUpdate?.());
  if(typeof dailyAIStoreObserved==='function')dailyAIStoreObserved(s.uid,s.path);
  return valid.length>0||(raw==null&&local.length>0);
}
function dailyFinanceListen(uid,path,ref,onUpdate){
  const state={uid,path,ref,onUpdate};dailyFinanceListeners.set(path,state);
  ref.on('value',snap=>{
    if(!dailyFinanceOwn(uid))return;
    try{
      if(dailyFinanceReceive(state,snap.val())&&!dailyFinanceQueues.has(path))syncBlobPush(path,dailyFinancePaths[path]);
    }catch(error){dailyFinanceIssue(path,error);}
  },error=>dailyFinanceIssue(path,error));
  return syncTrack(ref);
}
function dailyFinanceCommit(uid,path,ref,confirmSame){
  const previous=dailyFinanceQueues.get(path)||Promise.resolve();
  const task=previous.catch(()=>{}).then(async()=>{
    if(!dailyFinanceOwn(uid))throw Error('Daily account changed.');
    const jobs=dailyFinanceKeys(path),key=dailyFinancePaths[path];
    const local=dailyRemoteRows(localStorage.getItem(key)), t=Number(localStorage.getItem(key+'_ts'))||0;
    let conflict;
    const result=await ref.transaction(raw=>{
      const cutoff=Number(raw?.restoreAt)||0,active=jobs.filter(job=>!cutoff||job.t>cutoff);
      if(raw==null&&!jobs.length&&!local.length)return;
      if(raw!=null&&!active.length&&!confirmSame)return;
      // Firebase may retry this callback on a later event, outside the initial promise.
      // An explicit abort settles its transaction and lets the caller present the conflict.
      let rows;
      try{rows=dailyFinanceApply(raw==null?local:dailyRemoteRows(raw),active);}
      catch(error){conflict=error;return;}
      const v=JSON.stringify(rows);
      if(confirmSame&&!active.length&&dailyRemoteStable(rows)!==dailyRemoteStable(local))return;
      if(!active.length&&raw?.v===v)return confirmSame?{...raw,recordSync:1}:undefined;
      return {v,t:Math.max(Date.now(),Number(raw?.t||0)+1,t),recordSync:1,...(cutoff?{restoreAt:cutoff}:{})};
    },undefined,false);
    if(!dailyFinanceOwn(uid))throw Error('Daily account changed.');
    if(conflict)throw conflict;
    const raw=result.snapshot.val(),s=dailyFinanceListeners.get(path);
    if(result.committed||raw?.restoreAt)for(const job of jobs)localStorage.removeItem(job.key);
    if(s&&s.uid===uid)dailyFinanceReceive(s,raw);
    dailyFinanceConflicts.delete(path);
    return result;
  });
  dailyFinanceQueues.set(path,task);
  task.catch(error=>dailyFinanceIssue(path,error)).finally(()=>{if(dailyFinanceQueues.get(path)===task)dailyFinanceQueues.delete(path);});
  return task;
}
async function dailyFinanceReview(){
  for(const [path,message] of dailyFinanceConflicts){
    const s=dailyFinanceListeners.get(path);if(!s||!dailyFinanceOwn(s.uid))continue;
    if(!confirm(path+': '+message+' Export a recovery copy of your local data and replace this list with the current cloud records?'))continue;
    try{
      const key=dailyFinancePaths[path],previous=localStorage.getItem(key),current=dailyFinanceKeys(path);
      const connected=await db.ref('.info/connected').once('value');
      if(!dailyFinanceOwn(s.uid))return;
      if(connected.val()!==true)throw Error('Reconnect and review the cloud records again.');
      // Require server acknowledgement before discarding a local edit. A cached read alone
      // cannot establish which copy the person is about to accept.
      const result=await s.ref.transaction(raw=>raw??{v:'[]',t:0},undefined,false);
      if(!dailyFinanceOwn(s.uid))return;
      if(!result.committed||localStorage.getItem(key)!==previous||dailyRemoteStable(dailyFinanceKeys(path))!==dailyRemoteStable(current))
        throw Error('Financial records changed during review. Check them and try again.');
      exportAllData();
      const snap=result.snapshot,rows=dailyRemoteRows(snap.val());
      localStorage.setItem(key,JSON.stringify(rows));localStorage.setItem(key+'_ts',String(Number(snap.val()?.t)||0));
      current.forEach(job=>localStorage.removeItem(job.key));
      dailyFinanceReceive(s,snap.val());dailyFinanceConflicts.delete(path);
    }catch(error){dailyFinanceIssue(path,error);}
  }
  if(!dailyFinanceConflicts.size){
    const action=document.getElementById('finance-sync-review');if(action)action.hidden=true;
    setSyncStatus('Synced ✓');
  }
}
