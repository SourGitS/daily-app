'use strict';

// ── Firebase ─────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDYLW15gSIKYfbZ1lLH-82TG74em2Cin9w",
  authDomain: "workout-tracker-5dd55.firebaseapp.com",
  databaseURL: "https://workout-tracker-5dd55-default-rtdb.firebaseio.com",
  projectId: "workout-tracker-5dd55",
  storageBucket: "workout-tracker-5dd55.firebasestorage.app",
  messagingSenderId: "30476940153",
  appId: "1:30476940153:web:9145b265c3f285dc83b5a8",
  measurementId: "G-ZMZK790C9W"
};
let firebaseReady = !firebaseConfig.apiKey.startsWith('REPLACE');
let auth = null, db = null;
let dbRef       = null;
let weightDbRef = null;
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstallPrompt = e; });

// iOS first-tap fix: a bound (even empty) click listener on an ancestor makes mobile WebKit
// treat descendant taps as real clicks immediately, instead of swallowing the first tap of a
// fresh load / post-idle as a hover simulation. Bound here at parse time (script is deferred,
// so document.body already exists) — as early as possible, before any user interaction.
document.body.addEventListener('click', function(){}, false);

// Returns the sign-in promise so callers can report failures. It used to swallow every error
// with an empty catch, which left any caller waiting on a result that was never coming —
// most visibly an in-app browser (ChatGPT, Instagram, Messenger) where Google refuses OAuth
// outright and the popup opens blank.
function handleAuth(){
  if(!firebaseReady || !auth) return Promise.resolve(null);
  if(auth.currentUser){ auth.signOut(); return Promise.resolve(null); }
  return auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
}
// Button-facing wrapper: same sign-in, but a failure surfaces as a toast instead of an
// unhandled rejection. handleAuth() no longer swallows errors, so every caller needs this.
function handleAuthUI(){
  const p=handleAuth();
  if(p&&p.catch) p.catch(err=>{ if(typeof showToast==='function') showToast(authErrorMessage(err)); });
}
// Plain-language reason for a Firebase auth failure, so a dead end explains itself.
function authErrorMessage(err){
  const code=(err&&err.code)||'';
  if(code==='auth/popup-closed-by-user'||code==='auth/cancelled-popup-request') return 'Sign-in was cancelled.';
  if(code==='auth/popup-blocked') return 'Your browser blocked the sign-in popup. Allow popups for this site, or open Daily in Safari or Chrome.';
  if(code==='auth/operation-not-supported-in-this-environment'||code==='auth/web-storage-unsupported')
    return 'This browser will not allow Google sign-in. Open Daily directly in Safari or Chrome rather than inside another app.';
  if(code==='auth/unauthorized-domain') return 'This address is not authorised for sign-in in Firebase.';
  if(code==='auth/network-request-failed') return 'No connection — check your internet and try again.';
  return 'Sign-in failed'+(code?' ('+code+')':'')+'. Try opening Daily in Safari or Chrome.';
}
// Google blocks OAuth inside embedded/in-app browsers, so the popup opens blank and never
// resolves. Detecting it lets us say so up front instead of leaving the user waiting.
function isEmbeddedBrowser(){
  const ua=navigator.userAgent||'';
  if(/FBAN|FBAV|Instagram|Line\/|Twitter|WhatsApp|Snapchat|LinkedInApp|ChatGPT/i.test(ua)) return true;
  // iOS in-app WebViews report Safari's engine without "Safari" in the UA.
  if(/iPhone|iPad/.test(ua) && !/Safari/.test(ua)) return true;
  return false;
}
function updateHeaderAvatar(){
  const btn=document.getElementById('header-avatar'); if(!btn) return;
  const user=(firebaseReady&&auth)?auth.currentUser:null;
  if(user&&user.photoURL){
    btn.innerHTML='<img src="'+user.photoURL+'" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover">';
    btn.style.background='transparent';
  } else {
    const name=profileData.name||S.personalInfo?.name||'';
    const initial=name?name.charAt(0).toUpperCase():'?';
    btn.innerHTML='<span style="font-size:14px;font-weight:700;color:var(--accent-text);line-height:1">'+initial+'</span>';
    btn.style.background='#2a2a2a';
  }
}
function syncProfileToFirebase(){ const r=fbRef('profile'); if(r) r.set(profileData); }
function syncPersonalInfoToFirebase(){ const r=fbRef('personalInfo'); if(r) r.set(S.personalInfo); }
function syncBudDefaultsToFirebase(){ const r=fbRef('budgetDefaults'); if(r) r.set(budDefaults); }
// When the caller knows which week changed, write ONLY that week's node — a device
// holding a stale copy of other weeks then can't clobber them, whatever it does.
// The whole-blob set survives only as the fallback for calls with no key.
function syncBudgetDataToFirebase(changedKey){
  const r=fbRef('budgetData'); if(!r) return;
  if(changedKey && budgetData[changedKey]) r.child(changedKey).set(budgetData[changedKey]);
  else r.set(budgetData);
}
// Merge cloud and local budget data per week instead of letting the cloud blob replace
// local wholesale — the replace is how a device with a stale copy used to wipe another
// device's newer week (blank current-week inputs). Weeks are never deleted anywhere in
// the app, so a union is safe; a week present on both sides goes to the newer updatedAt
// stamp (legacy weeks without one count as 0; ties keep the cloud copy, matching the old
// behaviour for never-stamped data).
function mergeBudgetWeeks(localData, cloudData){
  const merged={}; let cloudNeedsUpdate=false;
  new Set([...Object.keys(localData||{}), ...Object.keys(cloudData||{})]).forEach(k=>{
    const l=(localData||{})[k], c=(cloudData||{})[k];
    if(c===undefined){ merged[k]=l; cloudNeedsUpdate=true; return; }
    if(l===undefined){ merged[k]=c; return; }
    if(((l&&l.updatedAt)||0) > ((c&&c.updatedAt)||0)){ merged[k]=l; cloudNeedsUpdate=true; }
    else merged[k]=c;
  });
  return {data:merged, cloudNeedsUpdate};
}
function syncSettingsCollapsedToFirebase(){ const r=fbRef('settingsCollapsed'); if(r) r.set(settingsCollapsed); }
// ── Generic blob sync (Realtime Database) for simple localStorage keys ──
// Stores the raw localStorage string under users/<uid>/<path>. Used for data added
// after the original sync was built (budget categories, credit card, weight log).
function syncBlobPush(path, lsKey){
  const r=fbRef(path); if(!r) return;
  setSyncStatus('Syncing…');
  // {v,t} envelope so the receiving device can compare ages. Reading side still accepts a
  // bare value for anything written by an older build (treated as age 0, i.e. beatable).
  const t=parseInt(localStorage.getItem(lsKey+'_ts')||'0',10)||Date.now();
  r.set({v:localStorage.getItem(lsKey)||'', t})
    .then(()=>setSyncStatus('Synced ✓')).catch(()=>setSyncStatus('Sync failed'));
}
// Every blob-synced store is timestamped. This used to be an untimestamped listener that
// treated ANY local/cloud difference as an unsynced offline edit and pushed local over cloud
// — so a device running stale code, or one that had simply never been updated, would silently
// overwrite real data saved elsewhere and then propagate that loss to every other device.
// The same failure was fixed twice before by moving individual stores onto the timestamped
// listener (see the budget category lists, then Training Split / Exercise Library in
// 1db6a9d); leaving the unsafe version in place just meant the next store to matter hit it
// again. Now there is only one implementation, and it always compares timestamps.
// The ts key is derived rather than passed so no call site has to change.
function syncBlobListen(uid, path, lsKey, onUpdate){
  return syncBlobListenTS(uid, path, lsKey, lsKey+'_ts', onUpdate);
}
// Timestamp-aware variant of syncBlobPush/syncBlobListen, used only where a stale cloud read
// must never clobber a newer local edit (see Prompt 26 — budget category lists were silently
// reverting because the plain blob sync has no way to tell "old" from "new"). Wire shape in
// Firebase: {v:<string>, t:<ms>}. A bare-string cloud value (written by the older plain
// syncBlobPush, or pre-migration) is treated as t=0, so a locally-stamped edit always wins
// against it and converges the cloud to the new shape — no separate migration step needed.
function lsSaveTS(key, value, tsKey, syncPath){
  // Same boot rule as lsSave: a migration or default written during init must not outrank a
  // real edit sitting in the cloud.
  const now=_bootPhase ? (parseInt(localStorage.getItem(tsKey)||'0',10)||0) : Date.now();
  try{
    localStorage.setItem(key, typeof value==='string'?value:JSON.stringify(value));
    localStorage.setItem(tsKey, String(now));
  }catch(e){ console.warn('localStorage save failed for '+key, e); return; }
  if(syncPath && firebaseReady && auth && auth.currentUser && db){
    db.ref('users/'+auth.currentUser.uid+'/'+syncPath).set({v:localStorage.getItem(key), t:now});
  }
}
// Every blob store that has registered a listener this session, as {path, lsKey, tsKey}.
// Built here rather than kept as a second hardcoded list because the two would drift: a new
// store added below would sync fine but be silently skipped by a restore (see restorePush).
const SYNC_BLOB_REG=[];
function syncBlobListenTS(uid, path, lsKey, tsKey, onUpdate){
  if(!SYNC_BLOB_REG.some(b=>b.lsKey===lsKey)) SYNC_BLOB_REG.push({path, lsKey, tsKey});
  const ref=db.ref('users/'+uid+'/'+path);
  const localT=()=>parseInt(localStorage.getItem(tsKey)||'0',10)||0;
  // Seed an empty cloud slot from this device (behaviour the untimestamped listener had).
  // Seeded at the local timestamp — which is 0 for a store this device has never actually
  // saved — so an untouched device's defaults can still be beaten by a real, timestamped
  // edit from elsewhere rather than winning purely by connecting first.
  ref.once('value').then(snap=>{
    if(snap.exists()) return;
    const local=localStorage.getItem(lsKey);
    if(local!=null&&local!=='') ref.set({v:local, t:localT()});
  }).catch(()=>{});
  ref.on('value', snap=>{
    const raw=snap.val();
    if(raw==null||raw==='') return; // nothing in the cloud yet — never adopt emptiness
    const isEnvelope = raw && typeof raw==='object' && 'v' in raw;
    const cloudV = isEnvelope ? raw.v : raw;
    const cloudT = isEnvelope ? (raw.t||0) : 0;
    if(cloudV==null || cloudV==='') return;
    if(localT() > cloudT){
      ref.set({v:localStorage.getItem(lsKey), t:localT()}); // local newer — converge cloud
      return;
    }
    if(localStorage.getItem(lsKey)===cloudV) return; // unchanged
    localStorage.setItem(lsKey, cloudV);
    localStorage.setItem(tsKey, String(cloudT));
    try{ onUpdate&&onUpdate(); }catch(e){}
  });
  return ref;
}
function setSyncStatus(txt){
  const el=document.getElementById('sync-status');
  if(el) el.textContent=txt;
}

// ── Generic localStorage load/save ────────────────────────────────
// Read+parse a JSON value, returning `fallback` if it's missing, unparseable, null,
// or fails the optional `validate` predicate. The fallback is returned as-is (pass a
// fresh literal at the call site). Replaces the hand-rolled try/JSON.parse loaders.
function lsLoad(key, fallback, validate){
  try{
    const raw=localStorage.getItem(key);
    if(raw==null) return fallback;
    const v=JSON.parse(raw);
    if(v==null) return fallback;
    if(validate && !validate(v)) return fallback;
    return v;
  }catch(e){ return fallback; }
}
// Write to localStorage (JSON-encoded unless already a string) and, when a Firebase
// blob `syncPath` is given, push it to the cloud. setItem is guarded so a quota /
// private-mode failure can't throw out of the caller mid-render; the push is guarded too.
// TRUE while the app is booting: default seeding and the one-time migrations all write during
// init, and stamping those with Date.now() made an untouched device look like the most recent
// editor. On sign-in the timestamped listeners then pushed those local DEFAULTS over real
// cloud data — losing the training split and budget categories. Boot writes therefore keep
// whatever timestamp the store already had (0 if it has never been edited here), so they can
// never beat a genuine edit made on another device.
let _bootPhase = true;
function stampFor(key){
  if(!_bootPhase) return Date.now();
  return parseInt(localStorage.getItem(key+'_ts')||'0',10)||0;
}
function lsSave(key, value, syncPath){
  try{
    localStorage.setItem(key, typeof value==='string'?value:JSON.stringify(value));
    // Stamp every save so the sync listener can tell a real edit from an untouched default.
    // Without this the cloud copy carried no age and any device could claim to be newest.
    localStorage.setItem(key+'_ts', String(stampFor(key)));
  }catch(e){ console.warn('localStorage save failed for '+key, e); return; }
  if(syncPath){ try{ if(typeof syncBlobPush==='function') syncBlobPush(syncPath, key); }catch(e){} }
}

// ── Toasts & haptics ──────────────────────────────────────────────
// Transient pill above the bottom nav with a draining accent bar. aria-live container in
// index.html announces it to screen readers. Multiple toasts stack (newest at the bottom).
function showToast(msg, duration){
  duration = duration || 2200;
  const c=document.getElementById('toast-container'); if(!c) return;
  const t=document.createElement('div');
  t.className='toast';
  t.textContent=msg;
  const bar=document.createElement('span');
  bar.className='toast-bar';
  bar.style.animationDuration=duration+'ms';
  t.appendChild(bar);
  c.appendChild(t);
  void t.offsetWidth;      // force a reflow so the hidden start state is committed…
  t.classList.add('show'); // …and the entrance transition runs (no rAF — it stalls when throttled)
  setTimeout(()=>{ t.classList.add('hide'); setTimeout(()=>t.remove(),220); }, duration);
}
// navigator.vibrate is Android/Chrome-only (iOS Safari ignores it) — harmless no-op elsewhere.
function haptic(pattern){ try{ if(navigator.vibrate) navigator.vibrate(pattern); }catch(e){} }

// ── Firebase helpers ──────────────────────────────────────────────
// Per-user ref for `path`, or null if Firebase isn't ready / not signed in. Centralises
// the firebaseReady/auth/currentUser/db guard every cloud write repeated verbatim.
function fbRef(path){
  if(!firebaseReady||!auth||!auth.currentUser||!db) return null;
  return db.ref('users/'+auth.currentUser.uid+'/'+path);
}
// One-shot reconcile for a simple object/array store on sign-in: if the cloud has a
// value, pull it into memory (`set`) + localStorage and refresh the UI (`render`);
// otherwise seed the cloud from the local value when it's worth it (`seedWhen`, default
// "non-empty"). get()/set() bridge the module-scoped variable the store lives in.
function fbReconcile(path, lsKey, get, set, render, seedWhen){
  const ref=fbRef(path); if(!ref) return;
  ref.once('value').then(snap=>{
    if(snap.exists()){
      set(snap.val());
      localStorage.setItem(lsKey, JSON.stringify(get()));
      if(render) render();
    } else {
      const v=get();
      const worth = seedWhen ? seedWhen() : (Array.isArray(v) ? v.length>0 : !!(v&&Object.keys(v).length>0));
      if(worth) ref.set(v);
    }
  });
}

if(firebaseReady){
  try{
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db   = firebase.database();
    auth.getRedirectResult().catch(()=>{});
    auth.onAuthStateChanged(user=>{
  let piRef, savRef, habitsRef, budDataRef, incCatRef, fixCatRef, varCatRef, ccRef;
  if(user){

    dbRef = db.ref('users/'+user.uid+'/sessions');
    dbRef.once('value').then(snap=>{
      if(!snap.exists() && S.sessions.length>0){
        const data={};
        S.sessions.forEach(s=>{ data[s.id]=s; });
        dbRef.set(data);
      }
    });
    dbRef.on('value', snap=>{
      const cloudMap = snap.val() || {};
      // Union by id instead of adopting the cloud snapshot wholesale — a stale/empty cloud
      // read (e.g. right after sign-in, before the seed-check above finishes) used to wipe
      // every locally-logged session outright. Sessions are effectively create-once, so a
      // straight union recovers anything the old wholesale-replace could drop; local wins on
      // the rare same-id collision since it's the actively-open device's copy.
      const localMap = {}; S.sessions.forEach(s=>{ localMap[s.id]=s; });
      const mergedMap = {...cloudMap, ...localMap};
      S.sessions = Object.values(mergedMap).sort((a,b)=>a.date<b.date?-1:1);
      localStorage.setItem('wt_sessions', JSON.stringify(S.sessions));
      // Local had sessions the cloud didn't (the exact gap that used to cause data loss) —
      // converge the cloud so the next pull, on any device, sees them too.
      const cloudMissingSome = Object.keys(localMap).some(id=>!(id in cloudMap));
      if(cloudMissingSome) dbRef.set(mergedMap);
      if(S.view==='stats'){
        if(statsSubTab==='history') renderHistory();
        else if(statsSubTab==='training') renderTraining();
        else if(statsSubTab==='overview') renderStatsOverview();
      }
    });

    weightDbRef = db.ref('users/'+user.uid+'/weights');
    weightDbRef.once('value').then(snap=>{
      if(!snap.exists() && S.weights.length>0){
        const data={};
        S.weights.forEach(w=>{ data[w.date.replace(/-/g,'')]=w; });
        weightDbRef.set(data);
      }
    });
    weightDbRef.on('value', snap=>{
      const data=snap.val();
      S.weights = data ? Object.values(data).sort((a,b)=>a.date<b.date?-1:1) : [];
      // The cloud copy replaces S.weights wholesale, so legacy daily_weight_log entries
      // merged while signed out must be re-applied here and pushed back up.
      if(mergeLegacyWeightEntries()) persistWeights();
      else localStorage.setItem('wt_weight', JSON.stringify(S.weights));
      if(S.view==='stats'&&(statsSubTab==='body'||statsSubTab==='overview')) setStatsTab(statsSubTab);
    });

    // One-time migration: fold the old duplicate weight log (daily_weight_log locally,
    // users/{uid}/weightLog in the cloud) into the canonical weights store, then delete
    // both copies. Per-date conflicts keep the wt_weight value (mergeLegacyWeightEntries).
    db.ref('users/'+user.uid+'/weightLog').once('value').then(snap=>{
      const v=snap.val();
      if(v){ try{ const arr=JSON.parse(v); if(Array.isArray(arr)) _wtLegacyCloud=arr; }catch(e){} }
      if(mergeLegacyWeightEntries()) persistWeights();
      localStorage.removeItem('daily_weight_log');
      db.ref('users/'+user.uid+'/weightLog').remove().catch(()=>{});
    });

    // ── Sync personal info (calorie goal) ──
    piRef = db.ref('users/'+user.uid+'/personalInfo');
    piRef.once('value').then(snap=>{
      if(!snap.exists() && Object.keys(S.personalInfo||{}).length>0){
        piRef.set(S.personalInfo);
      }
    });
    piRef.on('value', snap=>{
      if(!snap.val()) return;
      S.personalInfo = snap.val();
      localStorage.setItem('wt_personalinfo', JSON.stringify(S.personalInfo));
      renderSettings();
    });

    // ── Sync savings balance log ──
    savRef = db.ref('users/'+user.uid+'/savingsLog');
    // Initial sync: MERGE local + cloud (newest-per-date wins) and push the union back, so a
    // local-only/newer update is never lost and the cloud catches up.
    savRef.once('value').then(snap=>{
      const cloud = snap.exists() ? Object.values(snap.val()||{}) : [];
      savingsLog = mergeSavings(savingsLog, cloud);
      localStorage.setItem('daily_savings_log', JSON.stringify(savingsLog));
      savRef.set(Object.fromEntries(savingsLog.filter(e=>e&&e.date).map(e=>[String(e.date).replace(/-/g,''),e])));
      if(typeof renderHome==='function') renderHome();
    });
    // Live updates: merge (don't blindly overwrite) so a fresh local entry survives.
    savRef.on('value', snap=>{
      const data=snap.val();
      if(!data) return;
      savingsLog = mergeSavings(savingsLog, Object.values(data));
      localStorage.setItem('daily_savings_log', JSON.stringify(savingsLog));
      if(typeof renderHome==='function') renderHome();
    });

    // ── Sync daily habits ──
    habitsRef = db.ref('users/'+user.uid+'/habits');
    habitsRef.once('value').then(snap=>{
      try{
        const local = JSON.parse(localStorage.getItem('daily_habits')||'null');
        if(!snap.exists() && local) habitsRef.set(local);
      }catch(e){ console.warn('habits seed failed',e); }
    }).catch(e=>console.warn('habits sync error',e));
    habitsRef.on('value', snap=>{
      if(!snap.val()) return;
      localStorage.setItem('daily_habits', JSON.stringify(snap.val()));
      if(typeof renderHome==='function') renderHome();
    });

    // Sync profile
    fbReconcile('profile','daily_profile',
      ()=>profileData, v=>{ profileData=v||{}; },
      ()=>{ renderAccountSection(); renderHome(); });

    // Sync budget defaults
    fbReconcile('budgetDefaults','daily_budget_defaults',
      ()=>budDefaults, v=>{ budDefaults=v||{}; },
      ()=>{ if(S.view==='budget') renderBudgetTab(); });

    // Sync weekly budget data (real-time, both directions)
    db.ref('users/'+user.uid+'/budgetData').once('value').then(snap=>{
      if(!snap.exists() && Object.keys(budgetData).length>0){
        db.ref('users/'+user.uid+'/budgetData').set(budgetData);
      }
    });
    budDataRef = db.ref('users/'+user.uid+'/budgetData');
    budDataRef.on('value', snap=>{
      const data=snap.val();
      if(data){
        const active=document.activeElement;
        const editing=active&&(active.tagName==='INPUT'||active.tagName==='TEXTAREA');
        if(editing) return; // never overwrite budgetData while user has focus in an input
        const scrubbed=scrubSavingsTarget(data); // strip the removed savings target from incoming cloud data
        // Merge per week (newer updatedAt wins) rather than adopting the cloud blob
        // wholesale — see mergeBudgetWeeks. If local had newer weeks, push the merge
        // result back so the cloud converges too. No loop: the echoed snapshot merges
        // to an identical result, so cloudNeedsUpdate comes back false.
        const merged=mergeBudgetWeeks(budgetData, data);
        budgetData=merged.data;
        localStorage.setItem('daily_budget',JSON.stringify(budgetData));
        if(scrubbed||merged.cloudNeedsUpdate) budDataRef.set(budgetData);
        if(S.view==='budget') renderBudgetTab();
        if(S.view==='home') renderHome();
      }
    });

    // Sync budget config (income streams + fixed + variable expenses)
    db.ref('users/'+user.uid+'/budgetConfig').once('value').then(snap=>{
      if(snap.exists()){
        const val=snap.val()||{};
        const fix=a=>Array.isArray(a)?a:Object.values(a||{});
        if(Array.isArray(val.incomeStreams)||val.incomeStreams){
          const cloudCfg={
            incomeStreams:fix(val.incomeStreams),
            fixedExpenses:fix(val.fixedExpenses),
            variableExpenses:fix(val.variableExpenses),
            updatedAt: val.updatedAt||0,
          };
          // Newer updatedAt wins (mirrors mergeBudgetWeeks) instead of adopting the cloud
          // copy outright — a stale snapshot used to silently overwrite fresher local edits,
          // including dropping them to empty and then to the hardcoded factory defaults.
          if((budgetConfig.updatedAt||0) > cloudCfg.updatedAt){
            db.ref('users/'+user.uid+'/budgetConfig').set(budgetConfig); // converge cloud
          } else {
            budgetConfig=cloudCfg;
            if(!budgetConfig.incomeStreams.length||!budgetConfig.fixedExpenses.length||!budgetConfig.variableExpenses.length){
              const def=loadBudgetConfig();
              if(!budgetConfig.incomeStreams.length) budgetConfig.incomeStreams=def.incomeStreams;
              if(!budgetConfig.fixedExpenses.length) budgetConfig.fixedExpenses=def.fixedExpenses;
              if(!budgetConfig.variableExpenses.length) budgetConfig.variableExpenses=def.variableExpenses;
            }
            incomeStreams=budgetConfig.incomeStreams;
            localStorage.setItem('daily_budget_config',JSON.stringify(budgetConfig));
            if(S.view==='budget') renderBudgetTab();
            if(S.view==='home') renderHome();
          }
        }
      } else {
        db.ref('users/'+user.uid+'/budgetConfig').set(budgetConfig);
      }
    });

    // Sync settings collapsed state
    fbReconcile('settingsCollapsed','daily_settings_collapsed',
      ()=>settingsCollapsed, v=>{ settingsCollapsed=v||{}; },
      ()=>{ if(S.view==='settings') applySettingsCollapsed(); });

    // Sync weight goal
    fbReconcile('weightGoal','daily_weight_goal',
      ()=>weightGoal, v=>{ weightGoal=v||{}; },
      ()=>{ if(S.view==='stats') renderWeightGoal(); },
      ()=>!!weightGoal.target);

    // Subscriptions are retired as a separate list (folded into fixed categories), but the
    // cloud copy is still reconciled so an older device can't resurrect or lose the data.
    fbReconcile('subscriptions','daily_subscriptions',
      ()=>subscriptionsData, v=>{ subscriptionsData=Array.isArray(v)?v:Object.values(v||{}); },
      ()=>{});

    // Sync notes — one-shot pull/seed on sign-in (fbReconcile's seedWhen guard keeps an empty
    // local store from wiping a populated cloud one, and only overwrites local when the cloud
    // snapshot exists). set() writes localStorage ONLY (saveNotesLocalOnly) — the cloud already
    // holds the value we just pulled.
    fbReconcile('notes','wt_notes',
      ()=>loadNotes(), v=>{ saveNotesLocalOnly(Array.isArray(v)?v:Object.values(v||{})); },
      ()=>{ renderNotes(); renderHomeNotesBubble(); });

    // ── Sync data added after the original sync was built ──
    const budEditing=()=>{ const a=document.activeElement; return a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'); };
    incCatRef = syncBlobListenTS(user.uid,'budgetIncCats','daily_budget_inc_cats','daily_budget_inc_cats_ts',()=>{ if(S.view==='budget'&&!budEditing()) renderBudgetTab(); });
    fixCatRef = syncBlobListenTS(user.uid,'budgetFixCats','daily_budget_fix_cats','daily_budget_fix_cats_ts',()=>{ if(S.view==='budget'&&!budEditing()) renderBudgetTab(); });
    varCatRef = syncBlobListenTS(user.uid,'budgetVarCats','daily_budget_var_cats','daily_budget_var_cats_ts',()=>{ if(S.view==='budget'&&!budEditing()) renderBudgetTab(); });
    ccRef     = syncBlobListen(user.uid,'creditCard','daily_cc',()=>{ if(S.view==='home'&&typeof renderHome==='function') renderHome(); });
    syncBlobListen(user.uid,'ccLog','daily_cc_log',()=>{ ccLog=loadCCLog(); if(S.view==='stats'&&statsSubTab==='finance') renderBSBalance(); });
    // Accounts (assets/debts). ensureAccountsMigrated() can pre-populate daily_accounts at boot
    // from legacy savings/CC logs — a GUESS, flagged with daily_accounts_migrated. On such a
    // device, syncBlobListen's offline-edit-wins race branch (its .on first-fire runs before the
    // seed .once resolves, so seedDone is still false) would push that guess up and clobber real
    // cloud accounts written by another device. So reconcile cloud-first: if the cloud already
    // holds accounts and ours is only the migration guess, adopt the cloud copy BEFORE the live
    // listener snapshots preAuthLocal — so the guess can never win. A genuine (non-guess) local
    // value still takes the normal offline-wins path. Then attach the live listener as usual.
    const _acctRerender=()=>{
      accounts=loadAccounts();
      if(S.view==='home'&&typeof renderHome==='function') renderHome();
      if(S.view==='budget'&&typeof renderBudgetTab==='function') renderBudgetTab();
      if(S.view==='stats'&&statsSubTab==='finance'&&typeof renderBSBalance==='function') renderBSBalance();
      if(typeof renderAccountsPage==='function'&&document.getElementById('view-accounts')&&document.getElementById('view-accounts').style.display!=='none') renderAccountsPage();
    };
    const _acctListen=()=>syncBlobListen(user.uid,'accounts','daily_accounts',_acctRerender);
    db.ref('users/'+user.uid+'/accounts').once('value').then(snap=>{
      if(snap.exists() && localStorage.getItem('daily_accounts_migrated')==='1'){
        const v=snap.val();
        if(v!=null && v!==''){ localStorage.setItem('daily_accounts', v); _acctRerender(); }
      }
      localStorage.removeItem('daily_accounts_migrated'); // reconciled: cloud adopted, or ours will seed the cloud
      _acctListen();
    }).catch(()=>{ _acctListen(); });
    // ── Cross-device sync for everything else that was previously local-only ──
    // These keys are all unset until the user changes them, so an untouched device can't
    // seed empty data over a device that has real data (last-writer-wins is safe here).
    // Exception: trainingSplit and exerciseLib are ALWAYS non-empty (loadSplit()/loadExerciseLib()
    // generate a default the moment the app boots, even on a device the user has never touched),
    // so the plain listener's "local differs from cloud → assume offline edit, push local" race
    // would treat that untouched default as a real edit and clobber a genuine save made elsewhere
    // (this is exactly what happened: a new split saved on desktop got wiped by an untouched
    // phone's default reconnecting, which then clobbered the desktop right back). Both use the
    // timestamped sync instead — same fix as Prompt 26 applied to the budget category lists.
    syncBlobListen(user.uid,'homeOrder','daily_home_order',()=>{ if(S.view==='home'&&typeof renderHome==='function') renderHome(); }); // legacy order (seed source)
    syncBlobListen(user.uid,'homeLayout','daily_home_layout',()=>{ if(S.view==='home'&&typeof renderHome==='function') renderHome(); if(_activeSettingsKey==='homelayout'&&typeof renderHomeLayoutSection==='function') renderHomeLayoutSection(); });
    syncBlobListen(user.uid,'habitsLog','daily_habits_log',()=>{ try{ habitsLog=loadHabitsLog(); }catch(e){} if(typeof refreshHabitsUI==='function') refreshHabitsUI(); });
    syncBlobListen(user.uid,'dynamicColours','daily_dynamic_colours',()=>{ if(typeof applyDayColour==='function') applyDayColour(); });
    syncBlobListen(user.uid,'dayColors','daily_day_colors',()=>{ if(typeof applyDayColour==='function') applyDayColour(); if(S.view==='settings'&&typeof renderDayColorPickers==='function') renderDayColorPickers(); });
    syncBlobListen(user.uid,'accentFavourites','daily_accent_favourites',()=>{ if(S.view==='settings'&&typeof renderDayColorPickers==='function') renderDayColorPickers(); });
    syncBlobListen(user.uid,'appTheme','wt_theme',()=>{ S.theme=localStorage.getItem('wt_theme')||S.theme; if(typeof applyTheme==='function') applyTheme(); });
    syncBlobListen(user.uid,'swaps','wt_swaps',()=>{ try{ S.swaps=JSON.parse(localStorage.getItem('wt_swaps')||'{}')||{}; }catch(e){} if(S.view==='log'&&typeof renderLog==='function') renderLog(); });
    syncBlobListen(user.uid,'dayCustom','wt_day_custom',()=>{ try{ dayCustom=JSON.parse(localStorage.getItem('wt_day_custom')||'{}')||{}; }catch(e){} if(S.view==='log'&&typeof renderLog==='function') renderLog(); if(S.view==='home'&&typeof renderHome==='function') renderHome(); });
    syncBlobListenTS(user.uid,'exerciseLib','wt_exercise_lib','wt_exercise_lib_ts',()=>{ if(typeof renderExerciseLibList==='function') renderExerciseLibList(); if(typeof SE!=='undefined' && SE.target>=0 && document.getElementById('se-picker-list')) document.getElementById('se-picker-list').innerHTML=sePickerListHTML(); });
    syncBlobListen(user.uid,'customMuscles','wt_custom_muscles',()=>{ try{ const v=document.getElementById('view-exercise-library'); if(v && v.style.display!=='none' && typeof renderMuscleFilterRow==='function') renderMuscleFilterRow(); }catch(e){} });
    syncBlobListen(user.uid,'libHidden','wt_lib_hidden',()=>{ if(typeof renderExerciseLibList==='function') renderExerciseLibList(); });
    syncBlobListenTS(user.uid,'trainingSplit','wt_split','wt_split_ts',()=>{
      splitConfig=null; splitCfg(); // reload from the just-updated localStorage copy
      if(S.view==='log'&&typeof renderLog==='function') renderLog();
      if(S.view==='home'&&typeof renderHome==='function') renderHome();
      if(S.view==='stats'&&statsSubTab==='training'&&typeof renderTraining==='function') renderTraining();
      if(typeof renderSplitEditor==='function'&&document.getElementById('view-split-editor')&&document.getElementById('view-split-editor').style.display!=='none') renderSplitEditor();
    });
    // ── Kitchen sync ──
    syncBlobListen(user.uid,'kitRecipes','kitchen_recipes',()=>{ try{ kitRecipes=kitLoadRecipes(); }catch(e){} if(S.view==='kitchen'&&typeof kitRender==='function') kitRender(); });
    syncBlobListen(user.uid,'kitShopSelected','kitchen_shopping_selected',()=>{ try{ kitShopSelected=kitShopLoadSelected(); kitShopView=kitShopSelected.length?'list':'selector'; }catch(e){} if(S.view==='kitchen'&&typeof kitShopRender==='function') kitShopRender(); });
    syncBlobListen(user.uid,'kitShopChecked','kitchen_shopping_checked',()=>{ try{ kitShopChecked=kitShopLoadChecked(); }catch(e){} if(S.view==='kitchen'&&typeof kitShopRenderList==='function') kitShopRenderList(); });
    syncBlobListen(user.uid,'kitShopManual','kitchen_shopping_manual',()=>{ try{ kitShopManual=kitShopLoadManual(); }catch(e){} if(S.view==='kitchen'&&typeof kitShopRenderList==='function') kitShopRenderList(); });
    syncBlobListen(user.uid,'kitPantry','kitchen_pantry',()=>{ try{ kitPantryData=kitPantryLoad(); }catch(e){} if(S.view==='kitchen'&&typeof kitPantryRender==='function') kitPantryRender(); });
    // ── Calorie tracking + check-in streak (previously local-only, same pattern as Kitchen) ──
    // syncBlobListen's seed guard keeps an empty local value from wiping a populated cloud one
    // (and vice-versa); re-render whatever calorie/streak surface is currently on screen.
    syncBlobListen(user.uid,'calorieLog','wt_calories',()=>{
      try{ S.dailyLog=loadDailyLog(); }catch(e){}
      if(S.view==='home'&&typeof renderHome==='function') renderHome();
      if(typeof renderCalorieLog==='function') renderCalorieLog();        // self-guards if not mounted
      const _co=document.getElementById('calorie-overlay');
      if(_co&&_co.style.display!=='none'&&typeof renderCalorieOverlay==='function') renderCalorieOverlay();
      if(S.view==='stats'&&statsSubTab==='nutrition'&&typeof renderNutrition==='function') renderNutrition();
    });
    syncBlobListen(user.uid,'calorieHistory','daily_cal_history',()=>{
      try{ calorieHistory=loadCalorieHistory(); }catch(e){}
      if(S.view==='stats'&&statsSubTab==='nutrition'&&typeof renderNutrition==='function') renderNutrition();
      const _co=document.getElementById('calorie-overlay');
      if(_co&&_co.style.display!=='none'&&typeof renderCalorieOverlay==='function') renderCalorieOverlay();
    });
    syncBlobListen(user.uid,'savedFoods','daily_saved_foods',()=>{
      try{ savedFoods=loadSavedFoods(); }catch(e){}
      const _co=document.getElementById('calorie-overlay');
      if(_co&&_co.style.display!=='none'&&typeof renderCalorieOverlay==='function') renderCalorieOverlay();
    });
    syncBlobListen(user.uid,'checkinLog','daily_checkin_log',()=>{
      if(S.view==='home'&&typeof renderHome==='function') renderHome(); // streak lives on Home (calcStreak)
    });
    // Plans now resolve by timestamp like every other store. The previous handler compared
    // PLAN COUNTS and let the longer list win, so deleting a plan was undone on the next
    // sign-in — the shorter local list always lost to the stale cloud copy. A legacy raw
    // value in the cloud reads as timestamp 0, so any real local edit beats it.
    syncBlobListenTS(user.uid,'plans','wt_plans','wt_plans_ts',()=>{
      if(S.view==='plans'&&typeof renderPlans==='function') renderPlans();
    });
    setSyncStatus('Synced ✓');

  } else {
    if(dbRef){ dbRef.off(); dbRef=null; }
    if(weightDbRef){ weightDbRef.off(); weightDbRef=null; }
    if(piRef){ piRef.off(); piRef=null; }
    if(savRef){ savRef.off(); savRef=null; }
    if(habitsRef){ habitsRef.off(); habitsRef=null; }
    if(budDataRef){ budDataRef.off(); budDataRef=null; }
    if(incCatRef){ incCatRef.off(); incCatRef=null; }
    if(fixCatRef){ fixCatRef.off(); fixCatRef=null; }
    if(varCatRef){ varCatRef.off(); varCatRef=null; }
    if(ccRef){ ccRef.off(); ccRef=null; }
    setSyncStatus('Not signed in');
  }
  updateHeaderAvatar();
  renderAccountSection();
    });
  } catch(e){
    firebaseReady = false;
    auth = null; db = null;
  }
}

// ── Program: user-editable training split ────────────────────────
// A split is a list of training "types" (each a named workout with its own exercise list)
// plus a `schedule` mapping the rotating day index → a type index. Persisted to wt_split
// and synced. Existing accounts (and the original hardcoded 6-day Arnold Split) migrate in
// via loadSplit(); brand-new users get a neutral 3-day full-body default until onboarding.
// LEGACY_SPLIT_TYPES is the exact original program — used only to migrate existing users
// with zero visible change, and to build the exercise-library defaults for them.
const LEGACY_SPLIT_TYPES = [
  {
    id:'cb', name:'Chest & Back', colorKey:'chest-back', pillClass:'cb', barColor:'#ef4444',
    exercises:[
      {name:'Incline smith press', sets:3},
      {name:'Chest fly', sets:2},
      {name:'Chest press machine', sets:2},
      {name:'Pullups', sets:3, allowNegative:true, note:'− kg = assisted · + kg = added weight'},
      {name:'Upper back row', sets:3},
      {name:'Seated row', sets:2},
      {name:'Dead hangs', sets:2, priority:'grip', unit:'secs'},
      {name:'Abs', sets:2, priority:'abs'},
    ]
  },
  {
    id:'sa', name:'Shoulders & Arms', colorKey:'shoulders-arms', pillClass:'sa', barColor:'#3b82f6',
    exercises:[
      {name:'Shoulder press', sets:2},
      {name:'Lateral raise', sets:2},
      {name:'Rear delt fly', sets:2},
      {name:'Barbell bicep curl', sets:3},
      {name:'Barbell reverse curl', sets:3},
      {name:'Tricep pushdown', sets:2},
      {name:'Single arm tricep pushdown', sets:2},
      {name:'Forearm curl', sets:2},
      {name:'Standing calf raise', sets:4, priority:'calves'},
      {name:'Abs', sets:2, priority:'abs'},
    ]
  },
  {
    id:'lg', name:'Legs', colorKey:'legs', pillClass:'lg', barColor:'#10b981',
    exercises:[
      {name:'Standing calf raise', sets:4, priority:'calves'},
      {name:'Smith machine squat', sets:3, warmupSets:1},
      {name:'Seated leg curl', sets:3},
      {name:'Leg extension', sets:3},
      {name:'Abs', sets:2, priority:'abs'},
    ]
  }
];
const LEGACY_SCHEDULE = [0,1,2,0,1,2];
// Palette assigned to freshly-created split days (index → colour). colorKey stays a plain
// slug used only to seed the per-day colour store (LEGACY_DAY_COLOURS) on migration.
const SPLIT_PALETTE = ['#3b82f6','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#ef4444','#10b981','#6366f1'];
function legacySplit(){ return { types: JSON.parse(JSON.stringify(LEGACY_SPLIT_TYPES)), schedule: LEGACY_SCHEDULE.slice() }; }
// Neutral 3-day full-body split for brand-new users who skip the split builder.
function genericSplit(){
  return { types:[
    {id:'fbA',name:'Full Body A',colorKey:'fullbody',barColor:'#3b82f6',exercises:[
      {name:'Squat',sets:3},{name:'Bench press',sets:3},{name:'Bent-over row',sets:3},{name:'Plank',sets:3,unit:'secs'}]},
    {id:'fbB',name:'Full Body B',colorKey:'push',barColor:'#f59e0b',exercises:[
      {name:'Deadlift',sets:3},{name:'Overhead press',sets:3},{name:'Lat pulldown',sets:3},{name:'Lunge',sets:3}]},
    {id:'fbC',name:'Full Body C',colorKey:'pull',barColor:'#8b5cf6',exercises:[
      {name:'Leg press',sets:3},{name:'Incline press',sets:3},{name:'Seated row',sets:3},{name:'Calf raise',sets:3}]},
  ], schedule:[0,1,2] };
}
// Normalise a loaded/edited split: guarantee ids, names, exercise arrays, and a schedule
// that only references valid type indices (falls back to one-slot-per-type).
function sanitizeSplit(s){
  if(!s||typeof s!=='object'||!Array.isArray(s.types)||!s.types.length) return null;
  s.types.forEach((t,i)=>{
    if(!t.id) t.id='t'+i+'_'+Math.random().toString(36).slice(2,7);
    if(!t.name) t.name='Day '+(i+1);
    if(!Array.isArray(t.exercises)) t.exercises=[];
  });
  let sch=Array.isArray(s.schedule)?s.schedule.filter(n=>Number.isInteger(n)&&n>=0&&n<s.types.length):[];
  if(!sch.length) sch=s.types.map((_,i)=>i);
  s.schedule=sch;
  return s;
}
function loadSplit(){
  const clean=sanitizeSplit(lsLoad('wt_split',null));
  if(clean) return clean;
  // No saved split → migrate. An account that has already been used (name set, sessions
  // logged, or per-day customisations) is the existing Arnold-split user → seed the legacy
  // program so their log/history/stats are byte-identical. A truly fresh install gets the
  // neutral default (overwritten when they build a split in onboarding).
  const existing = !!(typeof profileData==='object'&&profileData&&(profileData.name||'').trim())
    || (typeof S==='object'&&S&&Array.isArray(S.sessions)&&S.sessions.length>0)
    || (typeof dayCustom==='object'&&dayCustom&&Object.keys(dayCustom).length>0);
  return existing ? legacySplit() : genericSplit();
}
let splitConfig=null;
let _splitPersisted=false;
// Lazy init so the migration heuristics can read profileData / S.sessions / dayCustom,
// which are all declared later in the file. First real call is at boot render time.
function splitCfg(){
  if(!splitConfig){
    splitConfig=loadSplit();
    // Persist a migrated split once so it's stable across reloads and seeds the cloud.
    if(!_splitPersisted){ _splitPersisted=true; if(localStorage.getItem('wt_split')==null){ try{ lsSave('wt_split', splitConfig, 'trainingSplit'); }catch(e){} } }
  }
  return splitConfig;
}
function saveSplit(){ const c=sanitizeSplit(splitConfig); if(c) splitConfig=c; lsSaveTS('wt_split', splitConfig, 'wt_split_ts', 'trainingSplit'); }
function splitTypes(){ return splitCfg().types; }
function splitSchedule(){ return splitCfg().schedule; }
function scheduleLen(){ const n=splitSchedule().length; return n>0?n:1; }
function typeIdxForDay(i){ const s=splitSchedule(); const n=s.length||1; return s[((i%n)+n)%n]||0; }
function typeForDayIdx(i){ const ts=splitTypes(); return ts[typeIdxForDay(i)] || ts[0]; }
function allExerciseNames(){ return [...new Set(splitTypes().flatMap(t=>(t.exercises||[]).map(e=>e.name)))]; }

// ── Storage helpers ──────────────────────────────────────────────
function load(){ return lsLoad('wt_sessions', []); }
function loadWeights(){ return lsLoad('wt_weight', []); }
function loadSwaps(){ return lsLoad('wt_swaps', {}); }
function loadTheme(){
  // Default dark (the momentum look). Users opt into light via Settings.
  return localStorage.getItem('wt_theme')||'dark';
}
function loadPersonalInfo(){ return lsLoad('wt_personalinfo', {}); }
function loadDailyLog(){
  try{
    const saved = JSON.parse(localStorage.getItem('wt_calories')||'{}');
    const today = getLocalDate();
    // Always guarantee an entries array — a missing/old-shape object would otherwise
    // make S.dailyLog.entries undefined and crash renderHome() (blank Home tab).
    if(saved.date !== today || !Array.isArray(saved.entries)) return {date:today, entries:[]};
    // Migrate: ensure every entry has a category (default 'other')
    saved.entries.forEach(e=>{ if(!e.category) e.category='other'; });
    return saved;
  } catch{ return {date:getLocalDate(), entries:[]}; }
}
// Daily calorie totals history, keyed by date → total kcal (for the weekly chart)
function loadCalorieHistory(){ return lsLoad('daily_cal_history', {}); }
let calorieHistory = loadCalorieHistory();
function recordCalorieHistory(){
  if(!S.dailyLog||!S.dailyLog.date) return;
  const total=S.dailyLog.entries.reduce((a,e)=>a+(e.kcal||0),0);
  calorieHistory[S.dailyLog.date]=total;
  lsSave('daily_cal_history', calorieHistory, 'calorieHistory');
}
function loadSavingsLog(){ return lsLoad('daily_savings_log', []); }
function loadPlans(){
  const DEF={plans:[],activePlanId:null,streak:{lastDate:'',count:0}};
  let raw;
  try{ raw=JSON.parse(localStorage.getItem('wt_plans')||'null'); }catch(e){ return {plans:[],activePlanId:null,streak:{lastDate:'',count:0}}; }
  if(!raw||typeof raw!=='object') return DEF;
  // Legacy shape: some installs stored a BARE ARRAY of plans (the old "daily routine" model,
  // each plan carrying its own exercises/history) instead of the {plans,activePlanId,streak}
  // wrapper the current tab expects. Returning that array as-is made renderPlans crash on
  // data.plans.find (plans undefined) — a silent blank Plans tab. Wrap/coerce to a stable
  // shape so every caller is safe; the plan objects themselves are preserved untouched.
  if(Array.isArray(raw)){
    return {plans:raw, activePlanId:(raw[0]&&raw[0].id)||null, streak:{lastDate:'',count:0}};
  }
  if(!Array.isArray(raw.plans)) raw.plans=[];
  if(!raw.streak||typeof raw.streak!=='object') raw.streak={lastDate:'',count:0};
  if(raw.activePlanId===undefined) raw.activePlanId=(raw.plans[0]&&raw.plans[0].id)||null;
  return raw;
}
// Timestamped, like every other synced store. The old version wrote a bare object and let the
// login handler resolve conflicts by COUNTING plans, which meant a deletion could never win:
// deleting makes the local list shorter, so the longer cloud copy always overwrote it and the
// deleted plans came back on the next sign-in.
function savePlans(data){
  lsSaveTS('wt_plans', data, 'wt_plans_ts', 'plans');
}
function loadNotes(){ try{ return JSON.parse(localStorage.getItem('wt_notes')||'[]'); }catch(e){ return []; } }
// Save + push to Firebase, matching savePlans' pattern (localStorage is source of truth; the
// cloud mirrors it when signed in).
function saveNotes(n){
  try{ localStorage.setItem('wt_notes',JSON.stringify(n)); }catch(e){ console.warn('notes save failed',e); }
  try{
    if(firebaseReady&&auth&&auth.currentUser&&db){
      db.ref('users/'+auth.currentUser.uid+'/notes').set(n);
    }
  }catch(e){ console.warn('notes firebase sync failed',e); }
}
// localStorage-only write — used by the sign-in reconcile so a just-pulled cloud value isn't
// immediately written straight back to the cloud (pointless round-trip).
function saveNotesLocalOnly(n){
  try{ localStorage.setItem('wt_notes',JSON.stringify(n)); }catch(e){ console.warn('notes save failed',e); }
}
// Merge two savings logs by date, keeping the most recently-edited entry per date (by `t`).
// Prevents a stale cloud copy from clobbering a fresh local update on the next load.
function mergeSavings(a, b){
  const m={};
  [...(a||[]),...(b||[])].forEach(e=>{
    if(!e||!e.date) return;
    const cur=m[e.date];
    if(!cur || (e.t||0) >= (cur.t||0)) m[e.date]=e;
  });
  return Object.values(m).sort((x,y)=>x.date<y.date?-1:1);
}
function saveSavingsLog(){
  localStorage.setItem('daily_savings_log', JSON.stringify(savingsLog));
  pushSavings();
}
// savRef is let-scoped to the auth callback, so referencing it from this global function threw
// a ReferenceError that the old try/catch swallowed — the cloud write silently never ran, so
// edits never synced to other devices. Write to the ref by uid instead (same fix as pushHabits).
function pushSavings(){
  try{
    if(firebaseReady && auth && auth.currentUser && db){
      db.ref('users/'+auth.currentUser.uid+'/savingsLog').set(Object.fromEntries(
        savingsLog.filter(e=>e&&e.date).map(e=>[String(e.date).replace(/-/g,''),e])
      ));
    }
  }catch(err){ console.error('savings cloud sync failed', err); }
}
function logCheckin(){
  const today=getLocalDate();
  try{
    const log=JSON.parse(localStorage.getItem('daily_checkin_log')||'[]');
    if(!log.includes(today)){ log.push(today); lsSave('daily_checkin_log', log, 'checkinLog'); }
  } catch{}
}
function calcStreak(){
  let log=[];
  try{ log=JSON.parse(localStorage.getItem('daily_checkin_log')||'[]'); } catch{}
  if(!log.length) return {current:0,longest:0};
  const dates=[...new Set(log)].sort();
  const d=localMidnight(getLocalDate());
  // Current streak: walk backwards from today
  let current=0;
  while(true){
    if(dates.includes(dateStr(d))){ current++; d.setDate(d.getDate()-1); }
    else break;
  }
  // Longest streak: scan sorted dates
  let longest=dates.length?1:0, run=1;
  for(let i=1;i<dates.length;i++){
    const diff=Math.round((new Date(dates[i]+'T12:00:00')-new Date(dates[i-1]+'T12:00:00'))/(864e5));
    if(diff===1){ run++; if(run>longest) longest=run; }
    else run=1;
  }
  longest=Math.max(longest,current);
  return {current,longest};
}
function loadProfileData(){ return lsLoad('daily_profile', {}); }

// ── State ────────────────────────────────────────────────────────
const S = {
  view: 'home',
  dayIdx: 0,
  setData: {},
  checked: new Set(),
  sessions: load(),
  weights: loadWeights(),
  swaps: loadSwaps(),
  theme: loadTheme(),
  personalInfo: loadPersonalInfo(),
  dailyLog: loadDailyLog(),
  sessionNote: '',
  swapTarget: null,
  chart: null,
  weightChart: null,
  sessionStart: null,
  // Exercises added via the Log "+ Add exercise" button. SESSION-ONLY: merged into the
  // currently-viewed day's list (so they show in today's log and save into that date's
  // history) but never written to dayCustom — future occurrences of the day type render
  // from the plan template with no trace of them. Reset on day change / after save.
  sessionAdds: [],
};

let exCollapsed = new Set(); // session-only exercise card collapse state

// ── Persist ──────────────────────────────────────────────────────
function persist(){
  try{ localStorage.setItem('wt_sessions', JSON.stringify(S.sessions)); }catch(e){ console.warn('localStorage full',e); }
  if(dbRef){
    const data={};
    S.sessions.forEach(s=>{ data[s.id]=s; });
    dbRef.set(data).catch(e=>console.error('Firebase sync error:',e));
  }
}
function persistWeights(){
  try{ localStorage.setItem('wt_weight', JSON.stringify(S.weights)); }catch(e){ console.warn('localStorage full',e); }
  if(weightDbRef){
    const data={};
    S.weights.forEach(w=>{ data[w.date.replace(/-/g,'')]=w; });
    weightDbRef.set(data).catch(e=>console.error('Firebase weight sync error:',e));
  }
}
function saveSwaps(){ lsSave('wt_swaps', S.swaps, 'swaps'); }
function persistDailyLog(){ lsSave('wt_calories', S.dailyLog, 'calorieLog'); recordCalorieHistory(); }

// ── Helpers ──────────────────────────────────────────────────────
// Per-day-type exercise customisation (permanent, overlay model): `added` extra exercises
// and `hidden` removed names, keyed by TYPES id (cb/sa/lg). Cached in memory; saved on change.
let dayCustom = lsLoad('wt_day_custom', {}, o=>o&&typeof o==='object');
function saveDayCustom(){ lsSave('wt_day_custom', dayCustom, 'dayCustom'); }
function dayCustomFor(typeId){ return dayCustom[typeId] || (dayCustom[typeId]={added:[],hidden:[]}); }
function effectiveExercises(base){
  const c=dayCustom[base.id]||{};
  const hidden=new Set(c.hidden||[]);
  const added=(c.added||[]).map(a=>({name:a.name, sets:a.sets||1, muscle:a.muscle, custom:true}));
  let list=[...base.exercises, ...added].filter(ex=>!hidden.has(ex.name));
  // Session-only additions (Log "+ Add exercise") for the CURRENTLY-VIEWED day only. They join
  // the rendered list — so saveSession (which reads this same list) writes them into today's
  // history — but they are NOT in dayCustom, so they vanish on the next occurrence. The length
  // guard keeps the common (no-adds) path free of the extra typeForDayIdx lookup.
  if(typeof S!=='undefined' && Array.isArray(S.sessionAdds) && S.sessionAdds.length
     && typeof typeForDayIdx==='function' && base.id===typeForDayIdx(S.dayIdx).id){
    const have=new Set(list.map(e=>e.name));
    S.sessionAdds.forEach(a=>{ if(a&&a.name&&!have.has(a.name)){ list.push({name:a.name, muscle:a.muscle||'other', custom:true, sessionOnly:true}); have.add(a.name); } });
  }
  if(c.order && c.order.length){
    // Apply the user's drag-reordered sequence; anything not in `order` (e.g. just added) trails.
    const pos=n=>{ const i=c.order.indexOf(n); return i<0?1e6:i; };
    list=list.map((ex,i)=>[ex,i]).sort((a,b)=>(pos(a[0].name)-pos(b[0].name))||(a[1]-b[1])).map(p=>p[0]);
  }
  return list;
}
// Returns a shallow clone of the day's program type with its EFFECTIVE (customised) exercise
// list, so every consumer (render/save/Home counts) sees the same add/remove edits.
function type(i){ const base=typeForDayIdx(i); return {...base, exercises:effectiveExercises(base)}; }
function dn(name){ return S.swaps[name] || name; } // display name (respects swaps)

function lastSessionOf(typeName){
  for(let i=S.sessions.length-1;i>=0;i--)
    if(S.sessions[i].sessionType===typeName) return S.sessions[i];
  return null;
}
function hintWeight(session, exName, setIdx){
  if(!session) return '';
  const ex = (session.exercises||[]).find(e=>e.name===exName);
  if(!ex||!ex.sets||!ex.sets[setIdx]) return '';
  return ex.sets[setIdx].weight||'';
}
function fmtDate(iso){
  const d = new Date(iso+'T12:00:00');
  return d.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'});
}
// For a counted exercise the record is the heaviest load; for a timed one it's the longest
// hold. Without this a bodyweight plank had a permanent PR of 0, because it carries no weight
// for the comparison to find.
function getPR(exName){
  const timed=_secsNames.has(exName);
  let pr=0;
  S.sessions.forEach(s=>s.exercises.forEach(ex=>{
    if(ex.name!==exName) return;
    ex.sets.forEach(set=>{
      const v=parseFloat(timed?set.reps:set.weight);
      if(!isNaN(v)&&v>pr) pr=v;
    });
  }));
  return pr;
}
// Same split for the progress chart. The old weight>0 filter dropped every set of a bodyweight
// timed exercise, so those exercises produced no points and therefore no trend line at all.
function getPoints(exName){
  const timed=_secsNames.has(exName);
  const pts=[];
  S.sessions.forEach(s=>{
    const ex=s.exercises.find(e=>e.name===exName);
    if(ex&&ex.sets.length){
      const vs=ex.sets.map(st=>parseFloat(timed?st.reps:st.weight)).filter(v=>!isNaN(v)&&v>0);
      if(vs.length) pts.push({date:s.date,weight:Math.max(...vs)});
    }
  });
  return pts;
}

// ── Theme ─────────────────────────────────────────────────────────
function applyTheme(){
  const isDark = S.theme !== 'light';
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  // Sync the iOS/Android status-bar & chrome tint to the app's live --bg for the active theme
  // (read after data-theme is set so it reflects the new value); fall back to the known hexes.
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta){
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    meta.content = bg || (isDark ? '#080808' : '#f2f2f7');
  }
  // --accent-text is derived against the theme's background, so a theme change invalidates it.
  // applyTheme() is the one path EVERY theme change goes through (setTheme, the Firebase
  // 'appTheme' listener, and boot), which is why the refresh lives here rather than in
  // setTheme alone — otherwise toggling light<->dark strands the previous theme's variant on
  // the new background and accent text goes unreadable again, in mirror image.
  if(typeof applyDayColour==='function') applyDayColour();
}
function setTheme(t){
  S.theme = t;
  lsSave('wt_theme', t, 'appTheme');
  applyTheme();
  if(S.view==='stats') setStatsTab(statsSubTab); // re-render charts with the new theme colours
}

// ── Accent colour ─────────────────────────────────────────────────
// ── Accent / per-day colour system ────────────────────────────────
// One unified system: a palette of 8 presets, one colour assigned per actual training day
// (keyed by day NAME so it tracks renames/adds/removes) plus a colour for rest days. The
// rest colour doubles as the app's static base accent when dynamic day colours are off.
const DAY_COLOR_PRESETS = ['#FF6B35','#3B82F6','#8B5CF6','#EF4444','#10B981','#F59E0B','#EC4899','#14B8A6'];
const REST_COLOR_KEY = '__rest__';
// ── Brand accent palette ──────────────────────────────────────────
// The app starts neutral grey and the user commits to a colour deliberately, rather than
// inheriting the old orange (#FF6B35, retired) by default.
// The red and green here are pulled AWAY from the status colours on purpose: --danger is
// #E74C3C (orange-red) and --success #52B788 (muted sea green), so the accent red leans
// crimson and the accent green leans grass. Without that offset an accent-coloured button
// would read as an error, and a "done"/"on track" state would be indistinguishable from
// ordinary accent furniture.
const DEFAULT_ACCENT = '#5C5C5C';   // pure neutral grey — 6.69:1 against white text
const RETIRED_ACCENT = '#ff6b35';   // the old default; migrated away from once (lowercase for compares)
const ACCENT_PRESETS = [
  {id:'gray',  name:'Grey',  hex:'#5C5C5C'},   // pure neutral (92,92,92); the old #6B7280 had a blue cast
  {id:'red',   name:'Red',   hex:'#C0304A'},
  {id:'green', name:'Green', hex:'#268000'},   // 5.04:1 on white; 2.04 against --success, so it can't be mistaken for a "done" state
  {id:'blue',  name:'Blue',  hex:'#0072EA'},   // 4.57:1 on white — the old #3B82F6 was 3.68:1
];
// One-time move off the retired orange — only for anyone still sitting on it untouched, so a
// deliberately-chosen colour (orange included) is never overwritten.
function migrateRetiredAccentOnce(){
  if(localStorage.getItem('daily_accent_retired_orange')) return;
  try{
    const m=loadDayColors();
    if(String(m[REST_COLOR_KEY]||'').toLowerCase()===RETIRED_ACCENT){
      m[REST_COLOR_KEY]=DEFAULT_ACCENT;
      saveDayColors(m);
    }
  }catch(e){}
  localStorage.setItem('daily_accent_retired_orange','1');
}
function hexToRgb(hex){
  const h=(hex||'').replace('#','');
  return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)].join(',');
}
// ── Accent as a FOREGROUND colour ──────────────────────────────────
// Every accent the app can hold — ACCENT_PRESETS, WEATHER_ACCENTS, the per-day colours — was
// tuned to CARRY white text, i.e. checked >=4.5:1 with #fff sitting on top. Using the accent
// AS text on the app background is the opposite test, and ~90 call sites do exactly that
// (color:var(--accent-text) on links, badges, "Manage Accounts →"). Measured against the dark --bg
// #080808 every one of them fails: the daytime blues land at 4.38:1 and the night skies at
// 1.7:1, which is invisible rather than merely low.
// --accent-text is the same hue and saturation, lifted (dark theme) or deepened (light theme)
// in lightness only, until it clears the threshold — so accent TEXT is readable while --accent
// itself keeps the tuning that white-on-accent needs. Both tokens are always set together.
// Derived, not a lookup table: the accent is not a closed set. Appearance offers a free
// <input type="color"> plus a saved favourites list, so an arbitrary hex is always reachable
// and any table would be missing exactly the colours a user chose deliberately.
// Lightness-only keeps the palette's design intent intact — dawn/dusk were deliberately moved
// into amber so they couldn't be mistaken for --danger, and the lifted variants still sit at
// hue ~31 against --danger's 6.
const ACCENT_TEXT_TARGET=5.0;   // not the 4.5 AA floor: this token's main job is 12px text,
                                // where 4.5 leaves no headroom for antialiasing.
function _relLum(hex){
  const h=(hex||'').replace('#','');
  const c=[0,2,4].map(i=>parseInt(h.substr(i,2),16)/255)
    .map(v=>v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4));
  return .2126*c[0]+.7152*c[1]+.0722*c[2];
}
function _contrastRatio(a,b){
  const x=_relLum(a), y=_relLum(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
function _hexToHsl(hex){
  const h=(hex||'').replace('#','');
  const r=parseInt(h.substr(0,2),16)/255, g=parseInt(h.substr(2,2),16)/255, b=parseInt(h.substr(4,2),16)/255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn, l=(mx+mn)/2;
  let hu=0, s=0;
  if(d){
    s = l>.5 ? d/(2-mx-mn) : d/(mx+mn);
    hu = mx===r ? ((g-b)/d+(g<b?6:0)) : mx===g ? ((b-r)/d+2) : ((r-g)/d+4);
    hu/=6;
  }
  return [hu,s,l];
}
function _hslToHex(hu,s,l){
  const f=(p,q,t)=>{ if(t<0)t+=1; if(t>1)t-=1;
    if(t<1/6) return p+(q-p)*6*t;
    if(t<1/2) return q;
    if(t<2/3) return p+(q-p)*(2/3-t)*6;
    return p; };
  let r,g,b;
  if(!s){ r=g=b=l; }
  else { const q = l<.5 ? l*(1+s) : l+s-l*s, p=2*l-q; r=f(p,q,hu+1/3); g=f(p,q,hu); b=f(p,q,hu-1/3); }
  return '#'+[r,g,b].map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('');
}
// isDark decides both the background to test against and which way to move: on #080808 the
// accent has to get lighter, on #f2f2f7 darker. Most accents already pass in light mode (the
// blue preset #0072EA at 4.10:1 is the notable exception), so this usually returns hex
// unchanged there and only really bites in dark mode.
function accentTextHex(hex, isDark){
  if(!/^#[0-9a-fA-F]{6}$/.test(hex||'')) return hex;
  const bg = isDark ? '#080808' : '#f2f2f7';
  if(_contrastRatio(hex,bg) >= ACCENT_TEXT_TARGET) return hex;
  const [hu,s,l]=_hexToHsl(hex);
  const dir = isDark ? 1 : -1;
  for(let i=1;i<=100;i++){
    const c=_hslToHex(hu, s, Math.min(1, Math.max(0, l + dir*i/100)));
    if(_contrastRatio(c,bg) >= ACCENT_TEXT_TARGET) return c;
  }
  return isDark ? '#ffffff' : '#000000';
}
function applyAccent(hex){
  const root=document.documentElement;
  root.style.setProperty('--accent', hex);
  root.style.setProperty('--accent-rgb', hexToRgb(hex));
  // Theme-dependent, so applyTheme() re-runs this. A stale value here is the invisible-text
  // bug in mirror image — the previous theme's variant left sitting on the new background.
  root.style.setProperty('--accent-text', accentTextHex(hex, root.getAttribute('data-theme')!=='light'));
}
// Legacy muscle-group → colour; used only to migrate existing accounts onto the new store.
const LEGACY_DAY_COLOURS = { 'chest-back':'#3B82F6','shoulders-arms':'#8B5CF6','legs':'#EF4444','rest':'#FF6B35' };
function buildDefaultDayColors(){
  const map={};
  try{ (splitTypes()||[]).forEach((t,i)=>{
    if(!t||!t.name) return;
    map[t.name] = LEGACY_DAY_COLOURS[t.colorKey] || t.barColor || DAY_COLOR_PRESETS[i%DAY_COLOR_PRESETS.length];
  }); }catch(e){}
  // Preserve any previously-chosen single accent as the base/rest colour.
  map[REST_COLOR_KEY] = localStorage.getItem('daily_accent_color') || DEFAULT_ACCENT;
  return map;
}
function loadDayColors(){
  let m=null;
  try{ m=JSON.parse(localStorage.getItem('daily_day_colors')||'null'); }catch(e){}
  if(!m||typeof m!=='object') m=buildDefaultDayColors();
  if(!m[REST_COLOR_KEY]) m[REST_COLOR_KEY]=DEFAULT_ACCENT;
  return m;
}
function saveDayColors(m){ lsSave('daily_day_colors', m, 'dayColors'); }
function restColor(){ return loadDayColors()[REST_COLOR_KEY] || DEFAULT_ACCENT; }
function dayColorFor(name){ const m=loadDayColors(); return (name&&m[name]) || m[REST_COLOR_KEY] || DEFAULT_ACCENT; }
function setDayColorEnc(encKey, hex){
  const key=decodeURIComponent(encKey);
  const m=loadDayColors(); m[key]=hex; saveDayColors(m);
  applyDayColour();
  if(typeof renderDayColorPickers==='function') renderDayColorPickers();
}
// Name of the training day currently shown in the Log tab (drives the live accent).
function currentDayName(){ const t=typeForDayIdx(S.dayIdx); return t?t.name:null; }
// ── Accent mode ────────────────────────────────────────────────────
// Three ways the accent can be decided. This used to be a boolean read independently in four
// places (accent, wordmark, log hero, settings), which is why they could disagree; they all
// go through currentAccentHex() now.
//   static  — the colour picked in Appearance (the Rest days colour)
//   day     — the current training day's colour
//   weather — derived from the Home weather card's scene
const ACCENT_MODES=['static','day','weather'];
function accentMode(){
  const m=localStorage.getItem('daily_accent_mode');
  if(ACCENT_MODES.indexOf(m)>=0) return m;
  // Migrate the legacy boolean, so an existing install keeps whatever it had.
  return localStorage.getItem('daily_dynamic_colours')==='true' ? 'day' : 'static';
}
function setAccentMode(mode){
  if(ACCENT_MODES.indexOf(mode)<0) return;
  lsSave('daily_accent_mode', mode, 'accentMode');
  // Keep the old key in step so a downgrade (or an un-migrated device) still behaves sanely.
  lsSave('daily_dynamic_colours', mode==='day' ? 'true' : 'false', 'dynamicColours');
  if(typeof renderAccentModeRow==='function') renderAccentModeRow(); // refresh its own selection
  renderDayColorPickers();
  applyDayColour();
}
// Scene → accent. Deliberately darker/more saturated than the scene gradient itself: the
// gradient only needs to look like sky, whereas the accent carries white text, so every one
// of these is >=4.5:1 on white and hue-separated from --danger (a burnt orange at dawn read
// too close to the error red, so dawn/dusk sit in amber instead).
const WEATHER_ACCENTS={
  'clear-dawn':'#A05E18','clear-noon':'#0072EA','clear-day':'#0072EA','clear-dusk':'#98591A','clear-night':'#2B3566',
  'partly-dawn':'#96662F','partly-noon':'#3E6E99','partly-day':'#3E6E99','partly-dusk':'#83572A','partly-night':'#313B57',
  'cloudy-day':'#5C5C5C','cloudy-night':'#35393D','fog':'#5E6368',
  'rain-day':'#3D5A70','rain-night':'#2A3A48','storm':'#4B3A66',
  'snow-day':'#4F6C82','snow-night':'#33454F'
};
// The scene the accent should follow. Prefers a real reading; with no location yet it uses
// the same clock-based sky the card itself falls back to, so the colour still tracks
// day/night rather than freezing on a default.
function currentWeatherScene(){
  try{
    const c=loadWeatherCache();
    if(c && !c.placeholder) return weatherScene(c.code,c);
    if(c) return weatherScene(c.code,c);          // sample reading — still a real sky
  }catch(e){}
  return (typeof weatherPlaceholderScene==='function') ? weatherPlaceholderScene() : 'clear-day';
}
function weatherAccentHex(){
  return WEATHER_ACCENTS[currentWeatherScene()] || restColor();
}
// One source of truth for "what colour is the app right now".
function currentAccentHex(){
  switch(accentMode()){
    case 'day':     return dayColorFor(currentDayName());
    case 'weather': return weatherAccentHex();
    default:        return restColor();
  }
}
function applyDayColour(){
  if(typeof applyLogoDayColour==='function') applyLogoDayColour(); // keep the wordmark in sync
  const mode = accentMode();
  const hero = document.querySelector('.hero-workout-card');
  const rtBar = document.getElementById('rt-bar');
  const hex = currentAccentHex();
  applyAccent(hex);
  if(hero){ hero.style.background=''; hero.style.boxShadow=''; }
  if(rtBar) rtBar.style.boxShadow = mode!=='static' ? ('0 8px 24px rgba('+hexToRgb(hex)+',.30)') : '';
}
// Kept for the old checkbox handler path; routes into the mode model.
function onDynamicColoursToggle(enabled){ setAccentMode(enabled?'day':'static'); }
const ACCENT_MODE_LABELS={
  static:{label:'Fixed',   desc:'The app uses the single colour you pick below.'},
  day:   {label:'Training',desc:'Follows the training day you\'re viewing, using the per-day colours below.'},
  weather:{desc:'Follows the sky on your Home weather card — blue on a clear day, grey when it\'s overcast, deep indigo at night.', label:'Weather'}
};
function renderAccentModeRow(){
  const row=document.getElementById('accent-mode-row'); if(!row) return;
  const cur=accentMode();
  row.innerHTML=ACCENT_MODES.map(m=>
    '<button type="button" class="accent-mode-btn'+(m===cur?' on':'')+'" onclick="setAccentMode(\''+m+'\')">'+
      ACCENT_MODE_LABELS[m].label+'</button>').join('');
  const d=document.getElementById('accent-mode-desc');
  if(d){
    let txt=ACCENT_MODE_LABELS[cur].desc;
    // Name the sky it's actually following, so the choice isn't abstract.
    if(cur==='weather') txt+=' Right now: '+currentWeatherScene().replace('-',' ')+'.';
    d.textContent=txt;
  }
}
// Appearance → per-day colour pickers. One row per live training day + one for rest days.
function renderDayColorPickers(){
  const wrap=document.getElementById('day-colors-list'); if(!wrap) return;
  // Per-day pickers only make sense in Training mode; the other two modes don't use them.
  const dynamicOn=accentMode()==='day';

  if(!dynamicOn){
    // Static mode: the four brand presets first (the curated set), then a free picker for
    // anything else. Presets are labelled buttons rather than bare swatches so the set reads
    // as deliberate choices, not a palette.
    const cur=restColor()||DEFAULT_ACCENT;
    const curLc=String(cur).toLowerCase();
    const isPreset=ACCENT_PRESETS.some(p=>p.hex.toLowerCase()===curLc);
    wrap.innerHTML=
      '<div class="accent-preset-row">'+
        ACCENT_PRESETS.map(p=>
          '<button class="accent-preset'+(p.hex.toLowerCase()===curLc?' active':'')+'" '+
            'onclick="setStaticAccent(\''+p.hex+'\');renderDayColorPickers()" aria-label="'+p.name+' accent">'+
            '<span class="accent-preset-dot" style="background:'+p.hex+'"></span>'+
            '<span class="accent-preset-name">'+p.name+'</span>'+
          '</button>').join('')+
      '</div>'+
      '<div style="display:flex;align-items:center;gap:14px;padding:10px 0 4px">' +
        '<label style="font-size:14px;color:var(--text);font-weight:500;flex:1">Custom colour'+
          (isPreset?'':' <span style="font-size:12px;color:var(--accent-text);font-weight:700">· in use</span>')+'</label>' +
        '<input type="color" id="static-accent-input" value="'+cur+'" ' +
          'style="width:44px;height:44px;border:none;border-radius:10px;cursor:pointer;background:none;padding:0" ' +
          'oninput="setStaticAccent(this.value)" ' +
          'onchange="setStaticAccent(this.value);renderDayColorPickers()">' +
      '</div>' +
      '<p style="font-size:12px;color:var(--muted);margin:8px 0 0;line-height:1.4">This colour is used as the app accent everywhere. Enable Dynamic day colours above to set a colour per training day.</p>';
    const favs=loadAccentFavourites();
    wrap.innerHTML +=
      '<div style="margin-top:14px">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'+
          '<span style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px">Favourites</span>'+
          '<button onclick="saveCurrentAccentAsFavourite()" style="font-size:12px;font-weight:700;color:var(--accent-text);background:none;border:none;cursor:pointer;padding:0">+ Save current colour</button>'+
        '</div>'+
        (favs.length
          ? '<div class="fav-list">'+favs.filter(h=>/^#[0-9a-fA-F]{6}$/.test(h)).map(hex=>
              '<div class="fav-row">'+
                '<button class="fav-del" onclick="removeAccentFavourite(\''+hex+'\')" aria-label="Delete favourite '+hex+'">'+FAV_TRASH_SVG+'</button>'+
                '<div class="fav-face" role="button" tabindex="0" onclick="favRowActivate(this,\''+hex+'\')" aria-label="Use '+hex+' as accent">'+
                  '<span class="fav-dot" style="background:'+hex+'"></span>'+
                  '<span class="fav-hex">'+hex.toUpperCase()+'</span>'+
                  (hex.toLowerCase()===curLc?'<span class="fav-inuse">In use</span>':'')+
                '</div>'+
              '</div>').join('')+'</div>'
          : '<p style="font-size:12px;color:var(--muted)">No favourites saved yet.</p>')+
      '</div>';
    return;
  }

  // Dynamic mode: full per-day grid (original code)
  const m=loadDayColors();
  const rows=[]; const seen=new Set();
  let types=[]; try{ types=splitTypes()||[]; }catch(e){}
  types.forEach(t=>{ if(t&&t.name&&!seen.has(t.name)){ seen.add(t.name); rows.push({key:t.name,label:t.name}); } });
  rows.push({key:REST_COLOR_KEY,label:'Rest days'});
  wrap.innerHTML=rows.map(r=>{
    const cur=String(m[r.key]||m[REST_COLOR_KEY]||DEFAULT_ACCENT).toLowerCase();
    const sw=DAY_COLOR_PRESETS.map(hex=>
      '<button class="dc-swatch'+(hex.toLowerCase()===cur?' active':'')+'" style="background:'+hex+'" '+
        'onclick="setDayColorEnc(\''+encodeURIComponent(r.key)+'\',\''+hex+'\')" aria-label="'+hex+'"></button>'
    ).join('');
    return '<div class="dc-row"><div class="dc-row-name">'+String(r.label).replace(/</g,'&lt;')+'</div>'+
      '<div class="dc-swatches">'+sw+'</div></div>';
  }).join('');
}
function setStaticAccent(hex){
  if(!hex||!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  const m=loadDayColors();
  m[REST_COLOR_KEY]=hex;
  saveDayColors(m);
  applyDayColour();
}
// A small bank of accent colours the user liked, so they can compare candidates before
// committing to a new default. Static-mode only (see renderDayColorPickers). Same list-blob
// storage + Firebase-sync pattern as every other small preference list.
function loadAccentFavourites(){ return lsLoad('daily_accent_favourites', [], Array.isArray); }
function saveAccentFavourites(list){ lsSave('daily_accent_favourites', list, 'accentFavourites'); }
function saveCurrentAccentAsFavourite(){
  const hex=(restColor()||DEFAULT_ACCENT).toLowerCase();
  const favs=loadAccentFavourites();
  if(!favs.includes(hex)) favs.push(hex);
  saveAccentFavourites(favs);
  renderDayColorPickers();
}
function removeAccentFavourite(hex){
  saveAccentFavourites(loadAccentFavourites().filter(h=>h!==hex));
  renderDayColorPickers();
}
// Favourites are a stacked list with iOS-style swipe-to-delete, replacing a row of 24px
// swatches that each carried a 16px × badge overlapping their top-right corner: the tap target
// was a quarter of the 44px minimum and the destructive control sat on top of the thing you
// were aiming at, so selecting a colour frequently deleted it instead. Delete now lives behind
// the row and takes a deliberate swipe to reach.
const FAV_TRASH_SVG='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/></svg>';
const FAV_REVEAL=76;   // px of red delete panel behind each row
const FAV_SNAP=38;     // drag past this and it stays open
let _favSuppressClick=false;
function favCloseOpenRows(except){
  document.querySelectorAll('.fav-row.open').forEach(r=>{ if(r!==except) r.classList.remove('open'); });
}
function favRowActivate(el,hex){
  // A swipe ends with a click on the same element; ignore that one so dragging never also
  // selects the colour.
  if(_favSuppressClick){ _favSuppressClick=false; return; }
  const row=el.closest('.fav-row');
  if(row&&row.classList.contains('open')){ row.classList.remove('open'); return; } // tap = close
  setStaticAccent(hex); renderDayColorPickers();
}
// Pointer Events so one path covers touch-swipe and mouse-drag. Settings sits OUTSIDE
// #swipe-deck, so this can't fight the horizontal tab pager (which locks after 3px).
(function(){
  let row=null, face=null, x0=0, y0=0, base=0, axis=null, moved=false;
  document.addEventListener('pointerdown',function(e){
    const f=e.target.closest&&e.target.closest('.fav-face');
    if(!f){ if(!(e.target.closest&&e.target.closest('.fav-row'))) favCloseOpenRows(); return; }
    row=f.closest('.fav-row'); face=f; x0=e.clientX; y0=e.clientY; axis=null; moved=false;
    base=row.classList.contains('open')?-FAV_REVEAL:0;
  });
  document.addEventListener('pointermove',function(e){
    if(!row) return;
    const dx=e.clientX-x0, dy=e.clientY-y0;
    if(axis===null){
      // Undecided until the finger commits, so a vertical scroll through the list is never
      // stolen by the row (touch-action:pan-y on .fav-face backs this up).
      if(Math.abs(dy)>Math.abs(dx)+3 && Math.abs(dy)>4){ row=null; face=null; return; }
      if(Math.abs(dx)>Math.abs(dy)+3 && Math.abs(dx)>4) axis='h';
      else return;
    }
    e.preventDefault();
    moved=true;
    row.classList.add('fav-dragging');
    face.style.transform='translateX('+Math.max(-FAV_REVEAL,Math.min(0,base+dx))+'px)';
  },{passive:false});
  function end(){
    if(!row) return;
    const r=row, f=face;
    row=null; face=null;
    r.classList.remove('fav-dragging');
    if(axis==='h'){
      const cur=parseFloat((String(f.style.transform).match(/-?[\d.]+/)||[0])[0])||0;
      const open=cur<-FAV_SNAP;
      favCloseOpenRows(r);
      r.classList.toggle('open',open);
      f.style.transform='';        // hand the offset back to the CSS class
      if(moved) _favSuppressClick=true;
    }
    axis=null; moved=false;
  }
  document.addEventListener('pointerup',end);
  document.addEventListener('pointercancel',end);
})();

// ── Timer ─────────────────────────────────────────────────────────
function fmtTimer(ms){
  const s=Math.floor(ms/1000), m=Math.floor(s/60), h=Math.floor(m/60);
  const mm=String(m%60).padStart(2,'0'), ss=String(s%60).padStart(2,'0');
  return h>0?`${h}:${mm}:${ss}`:`${m}:${ss}`;
}
function getDurationMins(){ return S.sessionStart ? Math.round((Date.now()-S.sessionStart)/60000) : 0; }
function fmtDuration(mins){
  if(!mins) return '';
  return mins>=60 ? Math.floor(mins/60)+'h '+String(mins%60).padStart(2,'0')+'m' : mins+'m';
}
// Session timer — timestamp-based (survives backgrounding). Source of truth is
// S.sessionStart (ms epoch); elapsed is derived on read, never tick-counted.
function sessionGetElapsed(){ return S.sessionStart ? Date.now()-S.sessionStart : 0; }
function sessionFormat(ms){
  const s=Math.floor(ms/1000), h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
  return h>0 ? h+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0') : m+':'+String(sec).padStart(2,'0');
}
function rtUpdateSessionLabels(){
  const txt=sessionFormat(sessionGetElapsed());
  const bar=document.getElementById('rt-bar-session');
  if(bar) bar.textContent='Session: '+txt;
  const fs=document.getElementById('rt-fs-session');
  if(fs) fs.textContent='Session '+txt;
  // Same ~per-second interval drives the lap button's live duration, so the current lap time
  // is visible on the button without opening the fullscreen timer.
  if(typeof updateLapFabText==='function') updateLapFabText();
}

// ── Rest Timer (stopwatch) ────────────────────────────────────────
// Counts UP. Elapsed is derived from timestamps, never from tick counts, so
// backgrounding the tab (which throttles setInterval) can't make it drift or
// "pause". The interval only drives the display refresh.
let rtStartTime = null;   // ms epoch of the current run segment
let rtOffset = 0;         // accumulated ms from previous paused segments
let rtRunning = false;
let rtInterval = null;
let rtLaps = [];
let rtUiInterval = null;  // 1s refresh for the session label while on the Log tab

function rtFormat(ms){
  const s=Math.floor(ms/1000), min=Math.floor(s/60), sec=s%60, tenth=Math.floor((ms%1000)/100);
  return min>0 ? min+':'+String(sec).padStart(2,'0')+'.'+tenth : sec+'.'+tenth;
}
function rtGetElapsed(){ if(!rtRunning) return rtOffset; return rtOffset+(Date.now()-rtStartTime); }
function rtStart(){
  rtStartTime=Date.now(); rtRunning=true;
  if(!S.sessionStart){ S.sessionStart=Date.now(); rtStartUi(); } // first Start also starts the session
  if(rtInterval) clearInterval(rtInterval);
  rtInterval=setInterval(rtTick,47);
  rtUpdateControls();
  updateLapFab();
}
function rtPause(){
  if(!rtRunning) return;
  rtOffset+=Date.now()-rtStartTime;
  rtRunning=false;
  clearInterval(rtInterval); rtInterval=null;
  rtUpdateControls();
  updateLapFab();
}
function rtToggle(){ rtRunning ? rtPause() : rtStart(); }
// The rest timer used to be a strip inside the day hero's footer. It's now its own card
// directly under it: the body still opens the fullscreen timer (data-action="timer-expand",
// unchanged), and the start/stop control sits on the card itself rather than only existing
// once you've expanded it.
function renderTimerCard(){
  const el=document.getElementById('log-timer-card'); if(!el) return;
  el.innerHTML=
    '<div class="log-timer-card">'+
      '<button class="lt-body" data-action="timer-expand" aria-label="Open timer">'+
        '<span class="lt-dot"></span>'+
        '<span id="rt-bar-time" class="lt-time">0.0</span>'+
        '<span id="rt-bar-session" class="lt-session">Session: 0:00</span>'+
        '<svg class="lt-expand" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>'+
      '</button>'+
      '<button id="lt-toggle" class="lt-toggle'+(rtRunning?' running':'')+'" onclick="rtToggle();renderTimerCard();rtUpdateDisplay(rtGetElapsed());rtUpdateSessionLabels()">'+
        (rtRunning?'Stop':'Start')+
      '</button>'+
    '</div>';
}
function rtTick(){ rtUpdateDisplay(rtGetElapsed()); }

function rtUpdateDisplay(ms){
  const txt=rtFormat(ms);
  const bar=document.getElementById('rt-bar-time'); if(bar) bar.textContent=txt;
  const fs=document.getElementById('rt-fs-time'); if(fs) fs.textContent=txt;
}
function rtUpdateControls(){
  const barBtn=document.getElementById('rt-bar-toggle');
  if(barBtn) barBtn.textContent=rtRunning?'Pause':'Start';
  const fsBtn=document.getElementById('rt-fs-toggle');
  if(fsBtn){ fsBtn.textContent=rtRunning?'Stop':'Start'; fsBtn.className='rt-fs-btn '+(rtRunning?'stop':'start'); }
}
function rtLap(){
  rtLaps.unshift({label:'Rest '+(rtLaps.length+1), ms:rtGetElapsed()});
  rtOffset=0; rtStartTime=Date.now();
  rtRenderLaps();
  rtUpdateDisplay(rtGetElapsed());
  showToast('Lap recorded');
  haptic(20);
}
function rtRenderLaps(){
  const el=document.getElementById('rt-fs-laps');
  if(!el) return;
  el.innerHTML=rtLaps.map(l=>
    '<div class="rt-lap-row"><span class="rt-lap-label">'+l.label+'</span><span class="rt-lap-time">'+rtFormat(l.ms)+'</span></div>'
  ).join('');
}
// Full reset of the rest stopwatch (day change / after save) — session is reset separately.
function rtResetAll(){
  rtPause();
  rtOffset=0; rtStartTime=null; rtLaps=[];
  rtUpdateDisplay(0); rtRenderLaps(); rtUpdateControls();
  updateLapFab();
}
// Floating LAP button — visible only while the rest stopwatch is running on the Log tab,
// so you can bank a rest split without opening the fullscreen timer. Reuses rtLap via the
// timer-lap delegated action; splits show in the fullscreen timer's lap list.
// m:ss clock for the lap button (whole seconds — the button shows the CURRENT lap/rest
// duration, i.e. time since the last lap, which is exactly the rest stopwatch's elapsed).
function lapFabClock(ms){ const s=Math.floor(ms/1000); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }
function updateLapFabText(){
  // Pill shows two live clocks: session elapsed (left) and the current lap/rest split (right).
  const sEl=document.getElementById('lap-fab-session');
  if(sEl) sEl.textContent=sessionFormat(sessionGetElapsed());
  const lEl=document.getElementById('lap-fab-lap');
  if(lEl) lEl.textContent=lapFabClock(rtGetElapsed());
}
function updateLapFab(){
  const f=document.getElementById('lap-fab'); if(!f) return;
  // Hidden while the fullscreen timer is open — that screen already shows the session/lap
  // clocks, so the floating pill would be redundant (and covered anyway).
  const fs=document.getElementById('rt-fullscreen');
  const fsOpen=fs && !fs.classList.contains('hidden');
  f.style.display=(rtRunning && S.view==='log' && !fsOpen) ? 'flex' : 'none';
  updateLapFabText(); // show the current lap time immediately when the button appears
}
// Sync all timer UI to current state (called when entering the Log tab).
function rtInitDisplay(){
  rtUpdateDisplay(rtGetElapsed());
  rtUpdateControls();
  rtRenderLaps();
  rtUpdateSessionLabels();
}
function rtOpenFullscreen(){
  const fs=document.getElementById('rt-fullscreen');
  if(!fs) return;
  fs.classList.remove('hidden');
  rtInitDisplay();
  updateLapFab(); // hide the floating pill while fullscreen is up
}
function rtCloseFullscreen(){
  const fs=document.getElementById('rt-fullscreen');
  if(fs) fs.classList.add('hidden');
  updateLapFab(); // restore the pill once fullscreen is dismissed
}
function rtStartUi(){ if(rtUiInterval) return; rtUiInterval=setInterval(rtUpdateSessionLabels,500); }
function rtStopUi(){ if(rtUiInterval){ clearInterval(rtUiInterval); rtUiInterval=null; } }

// Recompute on return to foreground: setInterval is throttled while hidden, so
// snap the display back to the true timestamp-derived elapsed.
document.addEventListener('visibilitychange',()=>{
  if(document.hidden) return;
  if(rtRunning) rtUpdateDisplay(rtGetElapsed());
  rtUpdateSessionLabels();
});

// Timer controls via event delegation. Buttons carry data-action instead of inline
// onclick — delegation on document is the more reliable tap path in iOS standalone PWAs
// (matches how the budget/category controls are wired). One listener, no double-fire.
document.addEventListener('click',function(e){
  const btn=e.target.closest('[data-action^="timer-"]');
  if(!btn) return;
  switch(btn.dataset.action){
    case 'timer-toggle': rtToggle(); break;
    case 'timer-lap':    rtLap(); break;
    case 'timer-expand': rtOpenFullscreen(); break;
    case 'timer-close':  rtCloseFullscreen(); break;
    case 'timer-reset':  rtResetAll(); break;
  }
});

// Desktop: drag the floating timer panel (mousedown anywhere on the bar except buttons).
(function(){
  let dragging=false,dx=0,dy=0,bar=null;
  document.addEventListener('mousedown',e=>{
    if(window.innerWidth<1024) return;
    bar=document.getElementById('rt-bar');
    if(!bar||!bar.contains(e.target)||e.target.closest('button')) return;
    const r=bar.getBoundingClientRect();
    dragging=true; dx=e.clientX-r.left; dy=e.clientY-r.top;
    e.preventDefault();
  });
  document.addEventListener('mousemove',e=>{
    if(!dragging||!bar) return;
    const w=bar.offsetWidth, h=bar.offsetHeight;
    const x=Math.min(Math.max(0,e.clientX-dx),window.innerWidth-w);
    const y=Math.min(Math.max(0,e.clientY-dy),window.innerHeight-h);
    bar.style.left=x+'px'; bar.style.top=y+'px';
    bar.style.right='auto'; bar.style.bottom='auto';
  });
  document.addEventListener('mouseup',()=>{ dragging=false; });
})();

function suggestDay(){
  if(!S.sessions.length) return 0;
  const last = S.sessions[S.sessions.length-1];
  return (last.dayNum||0) % scheduleLen();
}

// ── Init day ─────────────────────────────────────────────────────
function initDay(idx){
  S.dayIdx = idx;
  S.checked = new Set();
  S.sessionNote = '';
  S.sessionStart = null;
  S.sessionAdds = []; // fresh day → no carried-over session-only additions
  const noteEl = document.getElementById('session-note');
  if(noteEl) noteEl.value = '';
  const t = type(idx);
  // Dynamic sets: every exercise opens with a single working set; the user adds more
  // (or warmups) as they go. Last-session values are shown as hints at render time.
  S.setData = {};
  t.exercises.forEach(ex=>{
    S.setData[ex.name] = [{weight:'', reps:'', type:'working', done:false}];
  });
}

// ── View ─────────────────────────────────────────────────────────
let statsSubTab = 'overview';
function setView(v, direction, opts){
  opts = opts || {};
  const _libOv=document.getElementById('view-exercise-library');
  if(_libOv&&_libOv.style.display!=='none'){_libOv.style.display='none';_libOv.style.left='0';}
  // Accounts is a fixed overlay (not an #app-main>section), so — like the library above — it
  // won't be hidden by the .hidden toggle below; close it explicitly so a sidebar switch away
  // from Accounts actually leaves it. The .ds-item active state is handled by line ~1165.
  const _acctOv=document.getElementById('view-accounts');
  if(_acctOv&&_acctOv.style.display!=='none'){_acctOv.style.display='none';_acctOv.style.left='0';}
  const prev=S.view;
  S.view = v;
  const swipeIdx=NAV_ORDER.indexOf(v);
  const isSwipe=swipeIdx>=0;
  // Overlay (non-deck) views are the direct <section> children of #app-main; hide them all,
  // then reveal the target if it's an overlay. Deck views (home/budget/log/stats) live inside
  // #swipe-deck and are shown by deck position (mobile) / .deck-active (desktop) instead.
  document.querySelectorAll('#app-main > section').forEach(el=>el.classList.add('hidden'));
  if(!isSwipe){ const incoming=document.getElementById('view-'+v); if(incoming) incoming.classList.remove('hidden'); }
  document.querySelectorAll('.swipe-panel').forEach(p=>p.classList.toggle('deck-active', p.id===('view-'+v)));
  if(typeof updateKitFab==='function') updateKitFab();   // hide the "+" when leaving Kitchen
  // Move the deck to the target panel — unless the gesture already positioned it (fromSwipe).
  if(isSwipe && !opts.fromSwipe) setDeckPosition(swipeIdx, prev!==v);
  else if(isSwipe) deckIdx=swipeIdx;
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  document.querySelectorAll('.ds-item').forEach(b=>b.classList.toggle('active',b.dataset.tab===v));
  // The bottom scroll-fade paints over the kitchen's floating "+" / add bars (the tab-slide
  // transform traps those fixed elements below it), so hide it on the Kitchen tab.
  const _sf=document.getElementById('scroll-fade'); if(_sf) _sf.style.display = (v==='kitchen') ? 'none' : '';
  if(v==='home') renderHome();
  if(v==='log'){
    renderLog(true); // entering the tab → play the entrance animations
    // The rest-timer bar lives inside #view-log, so it shows/hides with the tab.
    rtInitDisplay();
    rtStartUi();
  } else {
    rtStopUi();
  }
  // Stats is a standalone top-level view (its own bottom-nav tab + desktop sidebar item).
  if(v==='stats'){ setStatsTab(statsSubTab); }
  if(v==='budget') renderBudgetTab();
  if(v==='kitchen') kitRender();
  else if(typeof kitShopRenderAddBar==='function') kitShopRenderAddBar(false); // hide fixed shopping add-bar off-tab
  if(v==='settings') renderSettings();
  if(v==='plans') renderPlans();
  if(v==='notes') renderNotes();
  updateNavPill(v);
  updateStatsPill(v);
  if(typeof updateLapFab==='function') updateLapFab();
  if(v!=='home' && homeEditMode){ homeEditMode=false; const b=document.getElementById('home-edit-btn'); if(b){ b.textContent='Edit layout'; b.classList.remove('active'); } }
  updateNavBadges();
}
// The four swipeable tabs, in swipe order. Kitchen replaced Stats here: Kitchen is used daily
// and Stats is a look-back-occasionally screen, so Stats moved to the hamburger menu.
// This list IS the deck — a view named here must be a .swipe-panel inside #swipe-deck, and one
// that isn't must be a direct <section> child of #app-main (see setView). Changing the list
// without moving the markup gives you a tab you can swipe to but not tap, or the reverse.
const NAV_ORDER=['home','budget','log','kitchen'];

// ── Swipe deck (native-feel tab paging) ──────────────────────────
// The four bottom-nav views sit side-by-side in #swipe-deck and track the finger in real
// time; releasing spring-snaps to the nearest view. Mobile only — desktop pages via
// .deck-active (see setView + layout.css). Order matches NAV_ORDER: home,budget,log,stats.
let deckIdx = 0;
let deckRaf = 0;      // handle of the pending touchmove frame (0 = none) — must be cancellable
let deckSnapH = null; // active snap's transitionend handler, so we can pull it off early
// Width of ONE panel, measured from the DOM — never window.innerWidth. #app is
// `max-width:480px; margin:0 auto` (base.css), so on any viewport wider than 480 the panels are
// 480 and innerWidth is not. Paging by innerWidth overshot by (innerWidth-480) per panel, which
// compounds with the index — invisible on Home, 3x on Stats, which is why only the last tab
// swiped past itself into empty (black) deck space.
function deckPanelW(){
  const p=document.querySelector('.swipe-panel');
  const w=p?p.getBoundingClientRect().width:0;
  return w>1?w:window.innerWidth;
}
// Current on-screen X of the deck in px (negative once paged right). Read from the computed
// transform so an in-flight snap can be frozen exactly where it is, mid-animation.
function deckOffsetPx(deck){
  try{ return new DOMMatrixReadOnly(getComputedStyle(deck).transform).m41; }
  catch(e){ return -(deckIdx*deckPanelW()); }
}
// Drop anything queued that could write to the deck's transform behind our back.
function deckCancelPending(deck){
  if(deckRaf){ cancelAnimationFrame(deckRaf); deckRaf=0; }
  if(deckSnapH){ deck.removeEventListener('transitionend',deckSnapH); deckSnapH=null; }
}
function setDeckPosition(idx, animate){
  const deck=document.getElementById('swipe-deck'); if(!deck) return;
  idx=Math.max(0, Math.min(NAV_ORDER.length-1, idx));
  // A touchmove frame or a previous snap's cleanup may still be queued; either would clobber the
  // transform we are about to set (that is what left the deck stranded mid-screen on a flick).
  deckCancelPending(deck);
  deck.style.transition='none';
  void deck.offsetWidth; // force reflow so the browser registers the removal before we re-set
  if(animate){
    deck.style.transition='transform 0.32s cubic-bezier(0.25,0.46,0.45,0.94)';
    // transitionend BUBBLES. Every card stagger, bar fill and ripple inside the panels sends one
    // up here, so an unfiltered listener strips the transition mid-snap and freezes the deck
    // half-way. Only the deck's own transform ends the snap.
    deckSnapH=function(e){
      if(e.target!==deck || e.propertyName!=='transform') return;
      deck.removeEventListener('transitionend',deckSnapH); deckSnapH=null;
      deck.style.transition='none';
    };
    deck.addEventListener('transitionend',deckSnapH);
  }
  // Measure the panel live every time — never cache it (orientation/resize safe).
  deck.style.transform='translate3d('+(-(idx*deckPanelW()))+'px,0,0)';
  deckIdx=idx;
  pinDeckScroll(); // belt-and-braces: a stray scrollLeft would offset every panel
}
// A width change (rotation, resize, desktop breakpoint) changes the panel width, so the deck's
// px transform has to be recomputed or the panels drift out of alignment.
window.addEventListener('resize',function(){ setDeckPosition(deckIdx,false); });
// #app-main must NEVER scroll horizontally — the deck is positioned purely by transform, so any
// scrollLeft stacks on top of it and pushes the panel off-screen (blank deck showing through).
// overflow:hidden only stops the *user* scrolling; scrollIntoView() on any descendant still
// scrolls it programmatically, and such an element fires NO scroll event, so a scroll listener
// cannot catch it. It has to be pinned back explicitly at each site that can move it.
function pinDeckScroll(){
  const main=document.getElementById('app-main');
  if(main && main.scrollLeft!==0) main.scrollLeft=0;
}
// Vertical-only replacement for scrollIntoView(). scrollIntoView cannot see the deck's transform:
// it works in #app-main's scroll space, where the Log panel sits at x=2 panels and Stats at x=3,
// so it "helpfully" scrolls #app-main sideways to reach them — which stacks on the transform and
// pushes the panel off-screen. Pinning scrollLeft afterwards is not enough either, since a
// behavior:'smooth' scroll keeps animating after the call returns. So we never ask for it: find
// the element's real vertical scroller (the .swipe-panel on mobile, #app-main on desktop) and
// scroll only that, only on the Y axis.
function verticalScroller(el){
  let n=el.parentElement;
  while(n && n!==document.body){
    const oy=getComputedStyle(n).overflowY;
    if((oy==='auto'||oy==='scroll') && n.scrollHeight>n.clientHeight) return n;
    n=n.parentElement;
  }
  return null;
}
function safeScrollIntoView(el, opts){
  if(!el) return;
  opts=opts||{};
  const sc=verticalScroller(el);
  if(!sc){ pinDeckScroll(); return; }
  const er=el.getBoundingClientRect(), sr=sc.getBoundingClientRect();
  const delta = opts.block==='center'
    ? (er.top+er.height/2)-(sr.top+sr.height/2)
    : er.top-sr.top;
  sc.scrollBy({top:delta, left:0, behavior:opts.behavior||'auto'});
  pinDeckScroll();
}
(function(){
  const deck=document.getElementById('swipe-deck'); if(!deck) return;
  const MAX=NAV_ORDER.length-1;
  let tsX=0,tsY=0,tsDelta=0,tsLocked=null,tsStartIdx=0,tsStartPx=0,tsTime=0,dragging=false,tsOnControl=false;
  // Interactive controls inside the panels — a touch that starts on one is presumed a TAP. The
  // pager must not lock horizontal (and preventDefault) on a few px of finger drift, or it eats
  // the click and the button "needs multiple taps". These need a deliberate swipe to page.
  const CONTROL_SEL='button, input, select, textarea, a, label, [onclick], [contenteditable]';
  deck.addEventListener('touchstart',e=>{
    if(window.innerWidth>=1024 || e.touches.length>1) return; // desktop / pinch → no paging
    // Freeze an in-flight snap exactly where it is and drag on from there, so grabbing the deck
    // mid-animation doesn't teleport it to the snap target.
    const cur=deckOffsetPx(deck);
    deckCancelPending(deck);
    deck.style.transition='none';
    deck.style.transform='translate3d('+cur+'px,0,0)';
    tsStartPx=-cur;                    // px scrolled from the first panel (positive)
    tsX=e.touches[0].clientX; tsY=e.touches[0].clientY;
    tsDelta=0; tsLocked=null; tsStartIdx=deckIdx; tsTime=Date.now(); dragging=true;
    tsOnControl=!!(e.target && e.target.closest && e.target.closest(CONTROL_SEL));
  },{passive:true});
  deck.addEventListener('touchmove',e=>{
    if(!dragging) return;
    const dx=e.touches[0].clientX-tsX, dy=e.touches[0].clientY-tsY;
    if(tsLocked===null){
      // On a control, require a clear horizontal swipe (>=16px) before hijacking — small drift
      // stays unlocked so the tap/click proceeds. Elsewhere the light 3px dominance rule stands.
      const hGate = tsOnControl ? 16 : 3;
      if(Math.abs(dx)>Math.abs(dy)+3 && Math.abs(dx)>=hGate) tsLocked='h';
      else if(Math.abs(dy)>Math.abs(dx)+3) tsLocked='v';
    }
    if(tsLocked!=='h') return;                 // vertical/undecided → let the panel scroll
    e.preventDefault();
    // Rubber-band: past either end the drag is damped to 0.3× and hard-clamped near 60px.
    let d=dx;
    if((tsStartIdx===0 && d>0)||(tsStartIdx===MAX && d<0)) d*=0.3;
    tsDelta=d;
    // rAF throttle: batch DOM writes to one per frame so we never exceed 60fps. Keep the handle —
    // touchend must be able to cancel a queued frame, or it lands after the snap has started and
    // drags the deck back to this stale offset.
    if(!deckRaf){
      deckRaf=requestAnimationFrame(()=>{
        deckRaf=0;
        let offsetPx=tsStartPx-tsDelta;
        const overPx=60; // rubber-band hard clamp in pixels
        offsetPx=Math.max(-overPx, Math.min(MAX*deckPanelW()+overPx, offsetPx));
        deck.style.transform='translate3d('+(-offsetPx)+'px,0,0)';
      });
    }
  },{passive:false});
  function end(){
    if(!dragging) return;
    dragging=false;
    if(tsLocked!=='h'){ return; }               // wasn't a horizontal page gesture
    // Velocity-based flick (px/ms) rather than a raw elapsed-time cutoff, so a quick short
    // swipe still pages while a slow long drag past threshold also pages.
    const elapsed=Date.now()-tsTime;
    const velocity=Math.abs(tsDelta)/Math.max(1,elapsed); // px/ms
    const movedPct=Math.abs(tsDelta)/deckPanelW();        // fraction of a PANEL, not the window
    const flick=velocity>0.3 && Math.abs(tsDelta)>30;
    let target=tsStartIdx;
    if(movedPct>0.25 || flick){
      if(tsDelta<0 && tsStartIdx<MAX) target=tsStartIdx+1;
      else if(tsDelta>0 && tsStartIdx>0) target=tsStartIdx-1;
    }
    setDeckPosition(target, true);               // spring-snap
    if(NAV_ORDER[target]!==S.view) setView(NAV_ORDER[target], null, {fromSwipe:true});
    else updateNavPill(S.view);
  }
  deck.addEventListener('touchend',end);
  deck.addEventListener('touchcancel',end);
})();

// ── Pull-to-refresh on the Home tab ──────────────────────────────
// Manual (not native PTR) to avoid conflicts in PWA standalone mode. Only engages
// when Home is showing and already scrolled to the very top. #app-main is the scroller.
(function(){
  let startY=0,pulling=false;
  const THRESHOLD=70;
  const main=document.getElementById('app-main');
  if(!main) return;
  main.addEventListener('touchstart',e=>{
    if(typeof homeEditMode!=='undefined' && homeEditMode){ pulling=false; return; } // dragging cards, not pulling
    // The Home panel is the scroller now (mobile), not #app-main — read its scrollTop.
    const homePanel=document.getElementById('view-home');
    const atTop=(homePanel?homePanel.scrollTop:main.scrollTop)===0;
    if(S.view==='home' && atTop){ startY=e.touches[0].clientY; pulling=true; }
    else pulling=false;
  },{passive:true});
  main.addEventListener('touchend',e=>{
    if(!pulling) return;
    pulling=false;
    if(S.view!=='home') return;
    const dist=e.changedTouches[0].clientY-startY;
    if(dist>THRESHOLD) refreshHomeTab();
  },{passive:true});
})();

// ── Back navigation ───────────────────────────────────────────────
// Every "close this view" control is <button class="back-btn" data-back="fnName">, so the
// chevron markup lives in one constant and the dismiss animation in one place. The seven
// full-screen views carry .app-overlay; a back-btn inside one slides it off before running
// its close function, and a left-edge drag does the same by finger. Views that aren't
// overlays (Kitchen's in-page detail) just run the function — nothing to slide.
const BACK_CHEVRON='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
(function(){
  const EDGE=28;      // px from the left edge that arms the drag
  const COMMIT=0.32;  // fraction of the width that dismisses on release
  const DUR=280;      // keep in step with .app-overlay's transition-duration

  const reduced=()=>window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shown=o=>getComputedStyle(o).display!=='none';
  const fnOf=name=>(name&&typeof window[name]==='function')?window[name]:null;
  // Desktop keeps the instant open/close: these views sit beside the sidebar rather than
  // covering the screen, so a slide reads as noise there.
  const animates=()=>window.innerWidth<1024 && !reduced();

  // Topmost open overlay — the one a back gesture should act on.
  function topOverlay(){
    return Array.prototype.slice.call(document.querySelectorAll('.app-overlay'))
      .filter(shown)
      .sort((a,b)=>(parseInt(getComputedStyle(b).zIndex,10)||0)-(parseInt(getComputedStyle(a).zIndex,10)||0))[0]||null;
  }
  // An overlay declares its own close function through its back button, so the gesture
  // needs no separate registry to stay in sync with the markup.
  function closeFnFor(o){ const b=o.querySelector('[data-back]'); return b?fnOf(b.getAttribute('data-back')):null; }

  function dismiss(o, fn){
    if(!animates()){ if(fn) fn(); return; }
    o.classList.remove('ov-drag');
    o.style.transform='translateX(100%)';
    setTimeout(()=>{ o.style.transform=''; if(fn) fn(); }, DUR);
  }

  document.addEventListener('click',function(e){
    const btn=e.target.closest&&e.target.closest('.back-btn[data-back]');
    if(!btn) return;
    const fn=fnOf(btn.getAttribute('data-back'));
    if(!fn) return;
    e.preventDefault();
    const o=btn.closest('.app-overlay');
    if(o) dismiss(o, fn); else fn();
  });

  // Slide-in on open. Watching the style attribute keeps this self-contained — the seven
  // open functions each just set display:block and need no animation hook of their own.
  if(window.MutationObserver){
    const mo=new MutationObserver(muts=>{
      muts.forEach(m=>{
        const o=m.target, isOpen=shown(o), was=o.dataset.ovOpen==='1';
        if(isOpen===was) return;
        o.dataset.ovOpen=isOpen?'1':'0';
        if(!isOpen||!animates()) return;
        o.classList.add('ov-drag','ov-enter');                    // park off-screen, untransitioned
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
          o.classList.remove('ov-drag');                          // transition back on…
          o.classList.remove('ov-enter');                         // …then run it to 0
        }));
      });
    });
    document.querySelectorAll('.app-overlay').forEach(o=>{
      o.dataset.ovOpen=shown(o)?'1':'0';
      mo.observe(o,{attributes:true,attributeFilter:['style']});
    });
  }

  // Left-edge drag-to-dismiss. Lives on document rather than per-overlay because the
  // overlays are fixed siblings that come and go; the topOverlay() lookup picks the target.
  let el=null,w=0,x0=0,y0=0,dx=0,locked=null,t0=0;
  document.addEventListener('touchstart',function(e){
    el=null;
    if(!animates()||e.touches.length>1) return;
    const o=topOverlay(); if(!o) return;
    const r=o.getBoundingClientRect();
    const t=e.touches[0];
    if(t.clientX-r.left>EDGE) return;             // not an edge grab
    el=o; w=r.width||window.innerWidth;
    x0=t.clientX; y0=t.clientY; dx=0; locked=null; t0=Date.now();
    el.classList.add('ov-drag');
  },{passive:true});
  document.addEventListener('touchmove',function(e){
    if(!el) return;
    const t=e.touches[0], mx=t.clientX-x0, my=t.clientY-y0;
    if(locked===null){
      if(mx>Math.abs(my)+3&&mx>=6) locked='h';    // rightward and clearly horizontal
      else if(Math.abs(my)>Math.abs(mx)+3){ locked='v'; el.classList.remove('ov-drag'); el=null; return; }
      else return;
    }
    if(locked!=='h') return;
    e.preventDefault();                            // own the gesture; stop the view scrolling
    dx=Math.max(0,mx);
    el.style.transform='translateX('+dx+'px)';
  },{passive:false});
  function end(){
    if(!el) return;
    const o=el; el=null;
    if(locked!=='h'){ o.classList.remove('ov-drag'); return; }
    const flick=dx/Math.max(1,Date.now()-t0)>0.35&&dx>40;
    if(dx>w*COMMIT||flick){ dismiss(o, closeFnFor(o)); return; }
    o.classList.remove('ov-drag');                 // snap back
    o.style.transform='';
  }
  document.addEventListener('touchend',end);
  document.addEventListener('touchcancel',end);
})();
function refreshHomeTab(){
  renderHome(); // re-renders greeting, hero, stats, budget snapshot — the whole Home tab
  const fb=document.getElementById('home-content');
  if(fb){ fb.style.transition='opacity .2s ease'; fb.style.opacity='.5'; setTimeout(()=>fb.style.opacity='1',300); }
}

function updateNavPill(v){
  const idx=NAV_ORDER.indexOf(v);
  const n=NAV_ORDER.length;
  const pill=document.getElementById('nav-pill');
  if(pill){
    if(idx<0){ pill.style.left=(idx*25)+'%'; pill.style.width='25%'; } // off-screen on overlay views
    else {
      // Every tab's pill has a small side margin; tabs 1 & 4 get extra inset on their OUTER
      // edge so the pill curves inward and never touches the left/right screen edge.
      const base=4, outer=10;
      const li=base+(idx===0?outer:0), ri=base+(idx===n-1?outer:0);
      pill.style.left='calc('+(idx*25)+'% + '+li+'px)';
      pill.style.width='calc(25% - '+(li+ri)+'px)';
    }
  }
  // Accent underline: measured from the active button (offsetLeft/offsetWidth), centred on the
  // icon at 40% of the button's width, springing between tabs. Always centred on the tab's
  // TRUE centre — including tabs 1 & 4: the outer curve is a pill-width effect only and must
  // not shift the underline off-centre from the icon. Hidden on overlay views (idx<0).
  const ind=document.getElementById('nav-indicator');
  if(ind){
    const btn=document.querySelector('.nav-btn[data-view="'+v+'"]');
    if(idx>=0 && btn){
      const w=btn.offsetWidth*0.4;
      ind.style.left=(btn.offsetLeft+(btn.offsetWidth-w)/2)+'px';
      ind.style.width=w+'px';
      ind.classList.add('on');
    } else {
      ind.classList.remove('on');
    }
  }
}
// Button geometry shifts on resize/rotation — re-measure the underline for the current view.
window.addEventListener('resize',function(){ if(typeof S!=='undefined'&&S.view) updateNavPill(S.view); });
// Home's card markup differs across the 1024px breakpoint (flat list on mobile, two flex
// columns on desktop), so it has to be rebuilt when the viewport crosses it. Only on an
// actual crossing — re-rendering on every resize tick would fight the enter animation.
(function(){
  let wasDesktop=window.innerWidth>=1024;
  window.addEventListener('resize',function(){
    const isDesktop=window.innerWidth>=1024;
    if(isDesktop===wasDesktop) return;
    wasDesktop=isDesktop;
    if(typeof S!=='undefined'&&S.view==='home'&&typeof renderHome==='function') renderHome();
  });
})();
// ── Weekday wordmark tint ─────────────────────────────────────────
// Publishes --day-color (one colour per weekday when dynamic colours are on, else the static
// accent). The wordmark is a real logo image now, so this only drives the active Stats pill
// (#header-stats-pill.active). Name/call sites kept though "Logo" is no longer strictly apt.
function applyLogoDayColour(){
  // Same colour the rest of the UI is using, whichever mode is active — the wordmark used to
  // read the dynamic flag itself and so ignored the weather mode entirely.
  document.documentElement.style.setProperty('--day-color', currentAccentHex());
}
// Stats pill shows on Home (and stays visible+active on the Stats view so it doubles
// as the way back). Hidden everywhere else.
function updateStatsPill(v){
  const p=document.getElementById('header-stats-pill');
  if(!p) return;
  // Visible on Home/Log/Budget (carrying the tab as context); hidden on Stats itself + Kitchen/Settings.
  if(v==='home'||v==='log'||v==='budget'){
    p.style.display='block';
    p.classList.remove('active');
    p.dataset.context=v;
  } else {
    p.style.display='none';
  }
}
// Context-aware: open Stats at the sub-tab relevant to where the chip was tapped from.
// (This app uses Stats sub-tabs, not scrollable sections, so we switch sub-tab not scroll.)
function openStatsFromChip(){
  const ctx=document.getElementById('header-stats-pill')?.dataset.context || S.view;
  setView('stats');
  if(typeof setStatsTab==='function') setStatsTab(ctx==='budget' ? 'finance' : ctx==='log' ? 'training' : 'overview');
}
function openProfile(){ setView('settings'); if(typeof openSettingsSection==='function') openSettingsSection('account'); }

// ── Slide-out settings menu ───────────────────────────────────────
// Just the two most-used settings shortcuts; everything else is reachable via "All settings".
const MENU_SECTIONS=[
  {id:'account',label:'Account'},
  {id:'appearance',label:'Appearance'}
];
// Primary destinations, mirroring the desktop sidebar so the hamburger reaches everything
// the sidebar does — including views not in the mobile bottom nav (Kitchen, Plans, Notes).
const MENU_NAV=[
  {id:'home',label:'Home'},
  {id:'log',label:'Log'},
  {id:'stats',label:'Stats'},
  {id:'kitchen',label:'Kitchen'},
  {id:'budget',label:'Budget'},
  {id:'plans',label:'Plans'},
  {id:'notes',label:'Notes'},
];
function menuNav(v){ closeMenu(); setView(v); }
function buildSideMenu(){
  const list=document.getElementById('side-menu-list');
  if(!list) return;
  const chev='<svg class="smi-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
  const groupLabel=t=>'<div class="side-menu-group-label">'+t+'</div>';
  list.innerHTML =
    groupLabel('Navigate')+
    // Accounts renders directly after Budget so the two read as a group (both are money views),
    // rather than floating near Exercise Library at the bottom.
    MENU_NAV.map(n=>{
      let html='<button class="side-menu-item" onclick="menuNav(\''+n.id+'\')"><span class="smi-label">'+n.label+'</span>'+chev+'</button>';
      if(n.id==='budget') html+='<button class="side-menu-item" onclick="openAccounts()"><span class="smi-label">Accounts</span>'+chev+'</button>';
      return html;
    }).join('')+
    '<div class="side-menu-divider"></div>'+
    '<button class="side-menu-item" data-action="open-exercise-library"><span class="smi-label">Exercise Library</span>'+chev+'</button>'+
    groupLabel('Settings')+
    '<button class="side-menu-item" onclick="openMenuSection(\'\')"><span class="smi-label">All settings</span>'+chev+'</button>'+
    MENU_SECTIONS.map(s=>'<button class="side-menu-item" onclick="openMenuSection(\''+s.id+'\')"><span class="smi-label">'+s.label+'</span>'+chev+'</button>').join('');
}
// ── Exercise Library ──────────────────────────────────────────────
// Master list of exercises the user maintains. Defaults are derived from the program
// (ALL_EX) and can't be deleted; customs are stored in wt_exercise_lib. Muscle group for
// defaults is a best-guess from the name. This is the management view; adding to a day's
// session is a separate picker (built later).
function libGuessMuscle(name){
  const n=(name||'').toLowerCase();
  if(/(abs|core|plank|crunch|oblique)/.test(n)) return 'core';
  if(/(calf|calves)/.test(n)) return 'calves';
  if(/(hamstring|leg curl|romanian|\brdl\b)/.test(n)) return 'hamstrings';
  if(/(glute|hip thrust|hip-thrust)/.test(n)) return 'glutes';
  if(/(quad|squat|lunge|leg press|leg extension)/.test(n)) return 'quads';
  if(/(forearm|wrist|grip)/.test(n)) return 'forearms';
  if(/(lower back|deadlift|hyperextension|good morning|back extension)/.test(n)) return 'lower back';
  if(/(bicep|tricep|curl|pushdown|extension)/.test(n)) return 'arms';
  if(/(shoulder|lateral|delt|overhead)/.test(n)) return 'shoulders';
  if(/(row|pull|lat|hang|chin)/.test(n)) return 'back';
  if(/(chest|bench|incline|fly|dip|press)/.test(n)) return 'chest';
  return 'other';
}
// ── Muscle groups (exercise categories) — built-ins + user-added customs ──────────
// Customs are stored lowercase in wt_custom_muscles and shown alongside the built-ins in the
// library filter and the add/edit picker. muscleLabel() capitalises for display.
const BUILTIN_MUSCLES=['chest','back','shoulders','arms','quads','hamstrings','calves','glutes','lower back','forearms','core','other'];
function loadCustomMuscles(){
  try{ const a=JSON.parse(localStorage.getItem('wt_custom_muscles')); if(Array.isArray(a)) return a.filter(m=>typeof m==='string'&&m.trim()); }catch(e){}
  return [];
}
function saveCustomMuscles(arr){ lsSave('wt_custom_muscles', arr, 'customMuscles'); }
function allMuscleGroups(){
  const seen=new Set(), out=[];
  [...BUILTIN_MUSCLES, ...loadCustomMuscles()].forEach(m=>{ const k=(m||'').toLowerCase().trim(); if(k&&!seen.has(k)){ seen.add(k); out.push(k); } });
  return out;
}
function muscleLabel(m){ m=(m||''); return m.charAt(0).toUpperCase()+m.slice(1); }
// One-time: 'legs' was split into quads/hamstrings/calves/glutes/lower back. Re-categorise any
// custom library entry still tagged 'legs' by re-guessing from its name, and drop a leftover
// 'legs' custom group. Built-in (non-custom) exercises re-guess on every load, so they need no fix.
function migrateLegsGroupOnce(){
  if(localStorage.getItem('wt_legs_split_migrated')) return;
  try{
    const raw=JSON.parse(localStorage.getItem('wt_exercise_lib')||'[]');
    if(Array.isArray(raw)){
      let changed=false;
      raw.forEach(e=>{ if(e && e.muscle==='legs'){ e.muscle=libGuessMuscle(e.name); changed=true; } });
      if(changed) localStorage.setItem('wt_exercise_lib', JSON.stringify(raw));
    }
    const cm=loadCustomMuscles().filter(m=>m!=='legs');
    if(cm.length!==loadCustomMuscles().length) localStorage.setItem('wt_custom_muscles', JSON.stringify(cm));
  }catch(e){}
  localStorage.setItem('wt_legs_split_migrated','1');
}
// Program-default exercises the user has deleted from the library. Defaults regenerate from the
// program on every load, so "deleting" one means hiding it here (by id) rather than removing it.
function loadLibHidden(){
  try{ const a=JSON.parse(localStorage.getItem('wt_lib_hidden')); if(Array.isArray(a)) return a.filter(x=>typeof x==='string'); }catch(e){}
  return [];
}
function saveLibHidden(arr){ lsSave('wt_lib_hidden', arr, 'libHidden'); }
function loadExerciseLib(){
  let customs=[];
  try{ const a=JSON.parse(localStorage.getItem('wt_exercise_lib')); if(Array.isArray(a)) customs=a; }catch(e){}
  const customIds=new Set(customs.map(c=>c.id));
  const hidden=new Set(loadLibHidden());
  const defaults=allExerciseNames().map(name=>({
    id:'ex_def_'+name.toLowerCase().replace(/[^a-z0-9]+/g,'_'),
    name, muscle:libGuessMuscle(name), custom:false
  })).filter(d=>!customIds.has(d.id) && !hidden.has(d.id));
  return [...defaults, ...customs];
}
function saveExerciseLib(lib){
  // Persist only the user's customs; defaults always regenerate from the program.
  lsSaveTS('wt_exercise_lib', lib.filter(e=>e.custom), 'wt_exercise_lib_ts', 'exerciseLib');
  // Re-derive the timed-exercise cache here rather than at each call site, so flagging an
  // exercise as seconds takes effect immediately in PRs, charts and set rows.
  if(typeof refreshSecsNames==='function') refreshSecsNames();
}
// Names the user has flagged "allow negative/assisted" in the Exercise Library. Cached so the
// per-set render doesn't reload the whole library each row; refreshed by refreshAllowNegNames()
// on renderLog and whenever the library is edited.
let _allowNegNames=new Set();
function refreshAllowNegNames(){
  try{ _allowNegNames=new Set(loadExerciseLib().filter(e=>e.allowNegative).map(e=>e.name)); }
  catch(e){ _allowNegNames=new Set(); }
}
// True if an exercise takes a negative (assisted) load — either its plan definition says so
// (the built-in Pullups) or the user flagged it in the Exercise Library.
function exerciseAllowsNegative(ex){
  if(ex && ex.allowNegative) return true;
  return !!(ex && _allowNegNames.has(ex.name));
}
// Exercises measured in time rather than repetitions (planks, dead hangs, wall sits). Same
// two-source resolution as the negative flag: the plan definition can set it (the seeded
// Plank and Dead hangs already do) or the user flags it in the Exercise Library.
// Only the SECOND field changes meaning — weight still applies, so a 20kg weighted plank
// records both load and duration.
let _secsNames=new Set();
function refreshSecsNames(){
  try{ _secsNames=new Set(loadExerciseLib().filter(e=>e.unit==='secs').map(e=>e.name)); }
  catch(e){ _secsNames=new Set(); }
}
function exerciseUnit(ex){
  if(ex && ex.unit) return ex.unit;
  return (ex && _secsNames.has(ex.name)) ? 'secs' : 'reps';
}
function isTimedExercise(ex){ return exerciseUnit(ex)==='secs'; }
// Formats a set's second field for display: "45s" for a hold, plain count for reps.
function fmtSetAmount(v,unit){
  const n=parseFloat(v);
  if(isNaN(n)) return '–';
  return unit==='secs' ? n+'s' : String(n);
}
let _libMuscle='all';
function openExerciseLibrary(){
  const v=document.getElementById('view-exercise-library'); if(!v) return;
  v.style.display='block';
  // On desktop, leave the sidebar uncovered
  v.style.left=window.innerWidth>=1024?'260px':'0';
  document.querySelectorAll('.ds-item').forEach(b=>b.classList.remove('active'));
  const _di=document.getElementById('ds-exlib'); if(_di) _di.classList.add('active'); // desktop sidebar peer
  const s=document.getElementById('lib-search'); if(s) s.value='';
  _libMuscle='all';
  renderMuscleFilterRow();
  renderExerciseLibList();
  if(typeof closeMenu==='function') closeMenu();
}
function closeExerciseLibrary(){
  const v=document.getElementById('view-exercise-library');
  if(v){ v.style.display='none'; v.style.left='0'; }
  document.querySelectorAll('.ds-item').forEach(b=>b.classList.toggle('active',b.dataset.tab===S.view));
}
// Library filter pills (All + every group). Rebuilt so user-added groups show up.
function renderMuscleFilterRow(){
  const row=document.getElementById('lib-filter-row'); if(!row) return;
  row.innerHTML=['all', ...allMuscleGroups()].map(m=>
    '<button class="muscle-filter'+(m===_libMuscle?' active':'')+'" data-muscle="'+m+'" data-action="lib-filter-muscle">'+(m==='all'?'All':_catEscHtml(muscleLabel(m)))+'</button>'
  ).join('');
}
// Add/edit-exercise picker: the group pills + a "+" bubble (or an inline input while adding).
let _addingMuscle=false;
function renderExMuscleRow(){
  const row=document.getElementById('exlib-muscle-row'); if(!row) return;
  let h=allMuscleGroups().map(m=>
    '<button type="button" class="exlib-muscle-pick'+(m===_newExMuscle?' active':'')+'" data-muscle="'+m+'" data-action="exlib-pick-muscle">'+_catEscHtml(muscleLabel(m))+'</button>'
  ).join('');
  h += _addingMuscle
    ? '<input id="exlib-new-muscle" class="exlib-muscle-add-input" type="text" placeholder="New group" maxlength="16" autocomplete="off" onkeydown="if(event.key===\'Enter\'){event.preventDefault();commitAddMuscle();}" onblur="commitAddMuscle()">'
    : '<button type="button" class="exlib-muscle-add" data-action="exlib-add-muscle" aria-label="Add exercise group">+</button>';
  row.innerHTML=h;
  if(_addingMuscle){ const i=document.getElementById('exlib-new-muscle'); if(i) setTimeout(()=>i.focus(),30); }
}
function startAddMuscle(){ _addingMuscle=true; renderExMuscleRow(); }
function commitAddMuscle(){
  if(!_addingMuscle) return;               // guard the double call (Enter re-renders, then blur fires)
  const i=document.getElementById('exlib-new-muscle');
  const key=(((i&&i.value)||'')).toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
  _addingMuscle=false;
  if(key){
    if(!allMuscleGroups().includes(key)){ const c=loadCustomMuscles(); c.push(key); saveCustomMuscles(c); }
    _newExMuscle=key;                        // auto-select the group just added
    renderMuscleFilterRow();                 // surface it in the library filter behind the modal
  }
  renderExMuscleRow();
}
function renderExerciseLibList(){
  const q=(document.getElementById('lib-search')?.value||'').toLowerCase();
  const lib=loadExerciseLib();
  const filtered=lib.filter(e=>(_libMuscle==='all'||e.muscle===_libMuscle)&&(!q||e.name.toLowerCase().includes(q)));
  const el=document.getElementById('exercise-lib-list'); if(!el) return;
  el.innerHTML=filtered.map(e=>
    '<div class="lib-row">'+
      '<div style="flex:1;min-width:0;cursor:pointer" data-ex="'+_catEsc(e.name)+'" onclick="openExerciseDetail(this.dataset.ex)">'+
      '<div class="lib-row-name">'+_catEscHtml(e.name)+'</div>'+
      '<div class="lib-row-muscle">'+_catEscHtml(muscleLabel(e.muscle))+' · tap for history</div></div>'+
      // Delete now lives inside the edit modal (openEditExercise) — see Prompt 17.
      '<div style="display:flex;gap:6px;flex-shrink:0">'
        +'<button class="lib-edit-btn" data-action="lib-edit-exercise" data-id="'+e.id+'" aria-label="Edit exercise">✎</button>'
      +'</div>'+
    '</div>'
  ).join('')||'<div style="padding:32px 0;text-align:center;color:var(--muted)">No exercises found</div>';
}
// New/edit-exercise modal — replaces window.prompt() (blocked in iOS standalone PWAs).
// The same form serves both paths; _editExId picks which. Only customs are editable:
// default names regenerate from the training-split program on every load, so a rename
// stored here would be silently discarded — defaults are renamed in the Split editor.
let _newExMuscle='other';
let _editExId=null; // library id being edited; null = creating a new exercise
function _setExModalLabels(editing){
  const t=document.getElementById('exlib-modal-title'); if(t) t.textContent=editing?'Edit exercise':'New exercise';
  const b=document.getElementById('exlib-confirm-btn'); if(b) b.textContent=editing?'Save':'Add';
  const d=document.getElementById('exlib-delete-btn'); if(d) d.classList.toggle('hidden', !editing);
}
function openNewExercise(){
  _editExId=null;
  _newExMuscle='other';
  _addingMuscle=false;
  const nm=document.getElementById('exlib-new-name'); if(nm) nm.value='';
  renderExMuscleRow();
  const neg=document.getElementById('exlib-allow-neg'); if(neg) neg.checked=false;
  const secs=document.getElementById('exlib-unit-secs'); if(secs) secs.checked=false;
  _setExModalLabels(false);
  const m=document.getElementById('exlib-add-modal'); if(m) m.classList.remove('hidden');
  setTimeout(()=>{ if(nm) nm.focus(); }, 50);
}
function openEditExercise(id){
  const ex=loadExerciseLib().find(e=>e.id===id);
  if(!ex) return;
  _editExId=id;
  _newExMuscle=ex.muscle||'other';
  _addingMuscle=false;
  const nm=document.getElementById('exlib-new-name'); if(nm) nm.value=ex.name;
  renderExMuscleRow();
  const neg=document.getElementById('exlib-allow-neg'); if(neg) neg.checked=!!ex.allowNegative;
  const secs=document.getElementById('exlib-unit-secs'); if(secs) secs.checked=ex.unit==='secs';
  _setExModalLabels(true);
  const m=document.getElementById('exlib-add-modal'); if(m) m.classList.remove('hidden');
  setTimeout(()=>{ if(nm) nm.focus(); }, 50);
}
function closeNewExercise(){ const m=document.getElementById('exlib-add-modal'); if(m) m.classList.add('hidden'); }
// Delete the exercise currently open in the edit modal — same steps the old row × used.
function deleteCurrentExercise(){
  if(!_editExId) return;
  if(!confirm('Delete this exercise?')) return;
  const id=_editExId;
  saveExerciseLib(loadExerciseLib().filter(x=>x.id!==id)); // drop any custom (or default override)
  // A program default regenerates from the split, so also hide it by id or it reappears.
  if(id.indexOf('ex_def_')===0){ const h=loadLibHidden(); if(!h.includes(id)){ h.push(id); saveLibHidden(h); } }
  closeNewExercise();
  if(document.getElementById('exercise-lib-list')) renderExerciseLibList();
  // If deleted from within the Split editor's picker, refresh that list too.
  if(typeof SE!=='undefined' && SE.target>=0 && document.getElementById('se-picker-list')) document.getElementById('se-picker-list').innerHTML=sePickerListHTML();
}
function confirmNewExercise(){
  const nm=document.getElementById('exlib-new-name');
  const name=(nm?nm.value:'').trim();
  if(!name){ closeNewExercise(); return; }
  const allowNeg=!!(document.getElementById('exlib-allow-neg')||{}).checked;
  // Stored only when true, so a reps exercise stays free of the field entirely.
  const exUnit=(document.getElementById('exlib-unit-secs')||{}).checked?'secs':undefined;
  const lib=loadExerciseLib();
  if(_editExId){
    const ex=lib.find(e=>e.id===_editExId);
    if(ex){
      const oldName=ex.name;
      if(name!==oldName && lib.some(e=>e.id!==_editExId && e.name.toLowerCase()===name.toLowerCase())
         && !confirm('An exercise named "'+name+'" already exists — rename anyway? Their history will be combined.')) return;
      if(ex.custom){
        ex.name=name; ex.muscle=_newExMuscle; ex.allowNegative=allowNeg; ex.unit=exUnit;
        saveExerciseLib(lib);
      } else {
        // Default exercise: save as a custom override with the same id (loadExerciseLib will hide the default)
        lib.push({id:ex.id, name, muscle:_newExMuscle, allowNegative:allowNeg, unit:exUnit, custom:true});
        saveExerciseLib(lib);
      }
      if(name!==oldName) renameExerciseRefs(oldName,name);
    }
  } else {
    lib.push({id:'ex_custom_'+Date.now(), name, muscle:_newExMuscle, allowNegative:allowNeg, unit:exUnit, custom:true});
    saveExerciseLib(lib);
  }
  closeNewExercise();
  if(document.getElementById('exercise-lib-list')) renderExerciseLibList();
  // If the edit was launched from inside the Split editor's picker, refresh that list too.
  if(typeof SE!=='undefined' && SE.target>=0 && document.getElementById('se-picker-list')) document.getElementById('se-picker-list').innerHTML=sePickerListHTML();
  if(S.view==='log' && typeof renderLog==='function') renderLog(); // ± visibility may have changed
}
// The exercise NAME is the join key across the app — logged sessions (which History, the
// PR board and Stats all read from), per-day customisations, swap targets and today's
// in-memory set data. Carry every reference over on rename so past logs follow the new
// name instead of being stranded (and hidden from PRs/stats) under the old one.
function renameExerciseRefs(oldName,newName){
  let touched=false;
  S.sessions.forEach(s=>(s.exercises||[]).forEach(ex=>{ if(ex.name===oldName){ ex.name=newName; touched=true; } }));
  if(touched) persist();
  touched=false;
  Object.values(dayCustom||{}).forEach(c=>{
    (c.added||[]).forEach(a=>{ if(a.name===oldName){ a.name=newName; touched=true; } });
    ['hidden','order'].forEach(k=>{
      if(Array.isArray(c[k])&&c[k].includes(oldName)){ c[k]=c[k].map(n=>n===oldName?newName:n); touched=true; }
    });
  });
  if(touched) saveDayCustom();
  touched=false;
  Object.keys(S.swaps||{}).forEach(k=>{
    if(S.swaps[k]===oldName){ S.swaps[k]=newName; touched=true; }
    if(k===oldName){ S.swaps[newName]=S.swaps[k]; delete S.swaps[k]; touched=true; }
  });
  if(touched) saveSwaps();
  if(S.setData&&S.setData[oldName]){ S.setData[newName]=S.setData[oldName]; delete S.setData[oldName]; }
  if(S.view==='log'&&typeof renderLog==='function') renderLog();
  if(S.view==='home'&&typeof renderHome==='function') renderHome();
}
// One delegated listener for all Exercise Library actions (iOS-reliable taps)
document.addEventListener('click',function(e){
  if(e.target.closest('[data-action="open-exercise-library"]')){ openExerciseLibrary(); return; }
  if(e.target.closest('[data-action="close-exercise-library"]')){ closeExerciseLibrary(); return; }
  const f=e.target.closest('[data-action="lib-filter-muscle"]');
  if(f){ _libMuscle=f.dataset.muscle; renderMuscleFilterRow(); renderExerciseLibList(); return; }
  const ed=e.target.closest('[data-action="lib-edit-exercise"]');
  if(ed){ openEditExercise(ed.dataset.id); return; }
  if(e.target.closest('[data-action="new-custom-exercise"]')){ openNewExercise(); return; }
  if(e.target.closest('[data-action="exlib-add-muscle"]')){ startAddMuscle(); return; }
  const pm=e.target.closest('[data-action="exlib-pick-muscle"]');
  if(pm){ _newExMuscle=pm.dataset.muscle; renderExMuscleRow(); return; }
});

// ── Log tab: edit mode (add/remove exercises for the day type) ─────
let logEditMode=false;
// The exercise you've tapped as "what I'm doing now" — moves the accent spotlight there.
// -1 = auto (first not-done exercise). Reset on day change.
let activeExIdx=-1;
function setActiveExercise(ei){ activeExIdx=ei; exCollapsed.delete(ei); renderLog(); }
// Focusing a set's input makes that exercise the active (spotlit) one — but WITHOUT a re-render,
// which would blur the field and drop the mobile keyboard mid-typing. Just move the .active class.
function focusExercise(ei){
  if(S.checked.has(ei)) return;   // a completed exercise doesn't take the spotlight
  if(activeExIdx===ei) return;    // already active — nothing to move
  activeExIdx=ei;
  refreshActiveHighlight();
}
// Re-apply the .active class to whichever card the spotlight logic currently picks (mirrors the
// activeEi computation in renderExCard) by toggling classes only — no innerHTML rebuild.
function refreshActiveHighlight(){
  const exs=type(S.dayIdx).exercises;
  let activeEi=-1;
  if(activeExIdx>=0 && activeExIdx<exs.length && !S.checked.has(activeExIdx)) activeEi=activeExIdx;
  else for(let i=0;i<exs.length;i++){ if(!S.checked.has(i)){ activeEi=i; break; } }
  exs.forEach((ex,i)=>{
    const card=document.getElementById('ec'+i);
    if(card) card.classList.toggle('active', i===activeEi && !S.checked.has(i));
  });
}

// ── Drag-to-reorder exercises (edit mode, touch) ──────────────────
// HTML5 drag-and-drop doesn't work on iOS, so use touch events. Order persists per day
// type in dayCustom.order (effectiveExercises applies it). Saved sessions are untouched.
function logSetExerciseOrder(orderedNames){
  const base=typeForDayIdx(S.dayIdx);
  const c=dayCustomFor(base.id);
  c.order=orderedNames.slice();
  saveDayCustom();
}
function persistExOrderFromDOM(){
  const exs=type(S.dayIdx).exercises; // pre-save order — card ids (ec{ei}) index into this
  const cards=[...document.querySelectorAll('#exercise-list .ex-card')];
  const names=cards.map(c=>{ const ei=parseInt((c.id||'').replace('ec',''),10); return exs[ei]?exs[ei].name:null; }).filter(Boolean);
  if(names.length){ logSetExerciseOrder(names); recomputeChecked(); renderLog(); }
}
(function(){
  let dragCard=null;
  document.addEventListener('touchstart',function(e){
    if(!logEditMode) return;
    const handle=e.target.closest('.ex-drag-handle'); if(!handle) return;
    const card=handle.closest('.ex-card'); if(!card) return;
    dragCard=card; card.classList.add('ex-dragging');
    e.preventDefault();
  },{passive:false});
  document.addEventListener('touchmove',function(e){
    if(!dragCard) return;
    e.preventDefault();
    const t=e.touches[0];
    const over=document.elementFromPoint(t.clientX,t.clientY);
    const overCard=(over&&over.closest)?over.closest('.ex-card'):null;
    if(overCard&&overCard!==dragCard&&overCard.parentElement===dragCard.parentElement){
      const r=overCard.getBoundingClientRect();
      const after=t.clientY>r.top+r.height/2;
      dragCard.parentElement.insertBefore(dragCard, after?overCard.nextSibling:overCard);
    }
  },{passive:false});
  function endDrag(){ if(!dragCard) return; dragCard.classList.remove('ex-dragging'); dragCard=null; persistExOrderFromDOM(); }
  document.addEventListener('touchend',endDrag);
  document.addEventListener('touchcancel',endDrag);
})();
function toggleLogEdit(){ logEditMode=!logEditMode; renderLog(); }
function logRemoveExercise(name){
  if((S.setData[name]||[]).some(s=>s.done)) return; // guard: never remove an exercise with a completed set
  if(S.sessionAdds && S.sessionAdds.some(a=>a.name===name)){
    // Session-only add → just drop it from the session; never touches the template.
    S.sessionAdds=S.sessionAdds.filter(a=>a.name!==name);
  } else {
    const base=typeForDayIdx(S.dayIdx);
    const c=dayCustomFor(base.id);
    if((c.added||[]).some(a=>a.name===name)) c.added=c.added.filter(a=>a.name!==name); // drop a legacy dayCustom add
    else c.hidden=[...new Set([...(c.hidden||[]), name])];                              // hide a built-in (permanent, unchanged)
    saveDayCustom();
  }
  delete S.setData[name];
  recomputeChecked(); saveSetData(); renderLog();
}
function logAddExercise(name, muscle){
  if(!name) return;
  // Session-only add: DO NOT write to dayCustom / the day template. Just track it for the
  // current session so it renders today and saves into today's history; the plan is untouched.
  if(!S.sessionAdds) S.sessionAdds=[];
  const alreadyShown = type(S.dayIdx).exercises.some(e=>e.name===name); // includes prior session adds
  if(!alreadyShown && !S.sessionAdds.some(a=>a.name===name)){
    S.sessionAdds.push({name, muscle:muscle||'other'});
  }
  if(!S.setData[name]) S.setData[name]=[{weight:'',reps:'',type:'working',done:false}];
  saveSetData(); renderLog();
  showToast('Exercise added');
  haptic(15);
}
// Add-exercise picker — pulls from the Exercise Library, excluding ones already in the day.
function openAddExercise(){
  const m=document.getElementById('log-add-picker'); if(!m) return;
  const s=document.getElementById('logpick-search'); if(s) s.value='';
  m.classList.remove('hidden'); renderAddPicker();
  setTimeout(()=>{ if(s) s.focus(); },50);
}
function closeAddExercise(){ const m=document.getElementById('log-add-picker'); if(m) m.classList.add('hidden'); }
function renderAddPicker(){
  const q=(document.getElementById('logpick-search')?.value||'').toLowerCase();
  const inDay=new Set(type(S.dayIdx).exercises.map(e=>e.name));
  const lib=loadExerciseLib().filter(e=>!inDay.has(e.name) && (!q||e.name.toLowerCase().includes(q)));
  const el=document.getElementById('logpick-list'); if(!el) return;
  el.innerHTML=lib.map(e=>
    '<button class="logpick-row" data-action="logpick-add" data-name="'+_catEsc(e.name)+'" data-muscle="'+e.muscle+'">'+
      '<span class="logpick-name">'+_catEscHtml(e.name)+'</span><span class="logpick-muscle">'+e.muscle+'</span>'+
    '</button>'
  ).join('')||'<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">Nothing to add — manage your list in the Exercise Library.</div>';
}
// Delegated listener for Log edit-mode + picker actions (iOS-reliable taps)
document.addEventListener('click',function(e){
  if(e.target.closest('[data-action="log-edit-toggle"]')){ toggleLogEdit(); return; }
  if(e.target.closest('[data-action="log-add-exercise"]')){ openAddExercise(); return; }
  const delEx=e.target.closest('[data-action="log-del-exercise"]');
  if(delEx){ logRemoveExercise(delEx.dataset.name); return; }
  const pick=e.target.closest('[data-action="logpick-add"]');
  if(pick){ logAddExercise(pick.dataset.name, pick.dataset.muscle); closeAddExercise(); return; }
});

function toggleMenu(){
  const o=document.getElementById('menu-overlay'), m=document.getElementById('side-menu');
  if(!o||!m) return;
  const open=m.classList.contains('open');
  o.classList.toggle('open',!open);
  m.classList.toggle('open',!open);
}
function closeMenu(){
  const o=document.getElementById('menu-overlay'), m=document.getElementById('side-menu');
  if(o) o.classList.remove('open');
  if(m) m.classList.remove('open');
}
function openMenuSection(s){
  closeMenu();
  // Habits has a working in-app manager (add/remove) — open it instead of the placeholder section.
  if(s==='habits'){ if(typeof openHabitsEditModal==='function') openHabitsEditModal(); return; }
  setView('settings');
  if(s){ if(typeof openSettingsSection==='function') openSettingsSection(s); }
  else { if(typeof closeSettingsSection==='function') closeSettingsSection(); }
}
function updateNavBadges(){
  const today=getLocalDate();
  const hasSessionToday=S.sessions.some(s=>s.date===today);
  const bl=document.getElementById('badge-log');
  if(bl) bl.style.display=hasSessionToday?'none':'block';
  const wKey=weekKey(getMondayOf(0));
  const wData=budgetData[wKey];
  const showBudget=!wData||(!wData.saved&&wData.draft);
  const bb=document.getElementById('badge-budget');
  if(bb) bb.style.display=showBudget?'block':'none';
}
// Old sub-tab names (saved state, header-pill contexts) map onto the new structure.
const STATS_TAB_ALIASES={progress:'training', budget:'finance', weight:'body'};
function setStatsTab(tab){
  tab=STATS_TAB_ALIASES[tab]||tab;
  const paneIds={overview:'sub-overview',history:'sub-history',training:'sub-training',body:'sub-body',nutrition:'sub-nutrition',finance:'sub-finance'};
  const btnIds={overview:'st-ov-btn',history:'st-hist-btn',training:'st-train-btn',body:'st-body-btn',nutrition:'st-nut-btn',finance:'st-fin-btn'};
  if(!paneIds[tab]) tab='overview';
  statsSubTab = tab;
  Object.keys(paneIds).forEach(t=>{
    const pane=document.getElementById(paneIds[t]); if(pane) pane.classList.toggle('hidden',t!==tab);
    const btn=document.getElementById(btnIds[t]); if(btn) btn.classList.toggle('active',t===tab);
  });
  const activeBtn=document.getElementById(btnIds[tab]);
  // Scroll ONLY the sub-tab strip. scrollIntoView() walks every scrollable ancestor, and
  // #app-main is one (overflow:hidden is still programmatically scrollable, and it holds the
  // 400%-wide swipe deck) — so it used to scroll #app-main sideways on top of the deck's
  // transform, shoving the panel past the viewport and exposing bare deck as black. Stats is the
  // only tab with a scrollable strip, which is why it was the only tab that broke.
  const tabRow=document.getElementById('stats-tab-row');
  if(activeBtn&&tabRow){
    // Rect-based, so it does not depend on offsetParent (.stats-tab-row is position:static, so
    // offsetLeft would be measured from #app and be wildly wrong). Nudge the strip by however far
    // the active button is off its centre, clamped to the strip's own scroll range.
    const br=activeBtn.getBoundingClientRect(), rr=tabRow.getBoundingClientRect();
    const delta=(br.left+br.width/2)-(rr.left+rr.width/2);
    tabRow.scrollLeft+=delta; // the browser clamps to [0, max] — clamping by hand off-by-oned it
                              // on fractional widths and left the last tab a pixel short
  }
  if(tab==='overview') renderStatsOverview();
  if(tab==='history') renderHistory();
  if(tab==='training') renderTraining();
  if(tab==='body') renderBody();
  if(tab==='nutrition') renderNutrition();
  if(tab==='finance') renderBudgetStats();
}

// ── LOG view ─────────────────────────────────────────────────────
// animateEntrance: replay the hero pop + card stagger. Only true when the Log tab is (re)entered
// or the day is switched — NOT on every set tick, or the whole list re-animates its entrance on
// each tap and reads like a full page reload.
function renderLog(animateEntrance){
  if(!Object.keys(S.setData).length) initDay(S.dayIdx);
  refreshAllowNegNames(); // which exercises show the ± sign toggle (library-driven)
  refreshSecsNames();     // which exercises are timed rather than counted (library-driven)
  const t = type(S.dayIdx);
  // Make sure every effective exercise (incl. ones just added) has a starting set row.
  t.exercises.forEach(ex=>{ if(!S.setData[ex.name]) S.setData[ex.name]=[{weight:'',reps:'',type:'working',done:false}]; });

  // Day hero card — arrow-navigated, per-day muscle colour, progress + TODAY badge.
  const done=S.checked.size, total=t.exercises.length;
  const pct = total ? Math.round(done/total*100) : 0;
  // Hero tint follows the SAME rule as the accent (applyDayColour): dynamic colours ON →
  // this day's assigned colour; OFF → the fixed static accent (restColor). Reading the raw
  // day colour unconditionally was the bug — with dynamic OFF the accent went static but this
  // card stayed the day's colour (e.g. green for Legs), so the static pick looked overridden.
  const heroRgb = hexToRgb(currentAccentHex());
  const isToday = S.dayIdx === suggestDay();
  const heroEl = document.getElementById('log-day-hero');
  if(heroEl){
    heroEl.innerHTML =
      '<div class="log-day-hero-card" style="background:linear-gradient(150deg, rgba('+heroRgb+',.9), rgba('+heroRgb+',.55) 55%, rgba('+heroRgb+',.35));box-shadow:0 16px 40px rgba('+heroRgb+',.3)">'+
        '<div class="ldh-nav">'+
          '<button class="ldh-arrow" onclick="logDayStep(-1)" aria-label="Previous day">&#8249;</button>'+
          '<div class="ldh-center" onclick="logGoToday()">'+
            '<div class="ldh-name">'+t.name+'</div>'+
            '<div class="ldh-sub">Day '+(S.dayIdx+1)+' of '+scheduleLen()+(isToday?'<span class="ldh-today">TODAY</span>':'')+'</div>'+
          '</div>'+
          '<button class="ldh-arrow" onclick="logDayStep(1)" aria-label="Next day">&#8250;</button>'+
        '</div>'+
        '<div class="ldh-progress-row"><span>'+done+' of '+total+' done</span><span>'+pct+'%</span></div>'+
        '<div class="ldh-bar"><div class="ldh-bar-fill" style="width:'+pct+'%"></div></div>'+
      '</div>';
    renderTimerCard();
    rtUpdateDisplay(rtGetElapsed()); rtUpdateSessionLabels(); // sync the freshly-rendered timer
    // The continuous gradient-breathe always runs; the one-time entrance pop/bar-fill/badge only
    // replay on tab-entry or day-switch (animateEntrance), not on every re-render from a set tick.
    const heroCard = heroEl.querySelector('.log-day-hero-card');
    if(heroCard){ heroCard.classList.add('ldh-breathe'); if(animateEntrance) heroCard.classList.add('ldh-enter'); }
    const barFill = heroEl.querySelector('.ldh-bar-fill');
    if(barFill && animateEntrance){ barFill.style.setProperty('--bar-target', pct+'%'); barFill.classList.add('ldh-bar-animate'); }
    if(animateEntrance){
      const todayBadge = heroEl.querySelector('.ldh-today');
      if(todayBadge) todayBadge.classList.add('ldh-badge-animate');
    }
  }
  const tag = document.getElementById('header-tag');
  if(tag){ tag.textContent=`Day ${S.dayIdx+1} · ${t.name}`; tag.style.color=t.barColor; }

  document.getElementById('exercise-list').innerHTML = t.exercises.map(renderExCard).join('');
  if(animateEntrance){
    document.querySelectorAll('#exercise-list .ex-card').forEach((card, i) => {
      card.style.animationDelay = (i * 55) + 'ms';
      card.classList.add('ex-card-enter');
    });
  }

  // Edit-mode controls: button label + the add-exercise button visibility
  const eb=document.getElementById('log-edit-btn');
  if(eb){ eb.textContent=logEditMode?'Done':'Edit'; eb.classList.toggle('active',logEditMode); }
  // "+ Add exercise" is always available at the bottom of the day's list (previously it only
  // appeared in Edit mode, so adding to the session required tapping Edit first).
  const ab=document.getElementById('log-add-exercise-btn');
  if(ab) ab.style.display='block';

  // Desktop exercise overview nav (left column)
  const exNav=document.getElementById('desktop-exercise-nav');
  if(exNav) exNav.innerHTML=t.exercises.map((ex,ei)=>{
    const d=S.checked.has(ei);
    return `<div class="den-item${d?' done':''}" onclick="safeScrollIntoView(document.getElementById('ec${ei}'),{behavior:'smooth',block:'start'})">`+
      `<span style="flex-shrink:0">${d?'✓':'•'}</span><span>${dn(ex.name)}</span></div>`;
  }).join('');

  document.getElementById('save-msg').style.display='none';
  document.getElementById('save-btn').textContent='Save session';
  document.getElementById('save-btn').style.background='';

  checkSessionComplete();
}

// Show the "Session complete" card once every exercise for the day is marked done.
// Volume = Σ (weight × reps) across all logged sets; time = live session elapsed.
function checkSessionComplete(){
  const card=document.getElementById('session-complete-card');
  if(!card) return;
  const t=type(S.dayIdx);
  const allDone = t.exercises.length>0 && S.checked.size===t.exercises.length;
  if(allDone){
    let vol=0;
    t.exercises.forEach(ex=>{
      (S.setData[ex.name]||[]).forEach(s=>{
        vol += (parseFloat(s.weight)||0)*(parseInt(s.reps)||0);
      });
    });
    const vEl=document.getElementById('sc-volume');
    const tEl=document.getElementById('sc-time');
    if(vEl) vEl.textContent=Math.round(vol)+' kg';
    if(tEl) tEl.textContent=sessionFormat(sessionGetElapsed());
    card.style.display='block';
  } else {
    card.style.display='none';
  }
}

function renderExCard(ex, ei){
  const done = S.checked.has(ei);
  // "Active" = the exercise you're on now. If you've tapped one (and it's still valid +
  // not done) the spotlight stays there; otherwise it auto-falls to the first not-done one.
  const exs = type(S.dayIdx).exercises;
  let activeEi;
  if(activeExIdx>=0 && activeExIdx<exs.length && !S.checked.has(activeExIdx)){
    activeEi = activeExIdx;
  } else {
    activeEi = -1;
    for(let i=0;i<exs.length;i++){ if(!S.checked.has(i)){ activeEi=i; break; } }
  }
  const isActive = ei===activeEi && !done;
  const badge = ex.priority ? `<span class="badge badge-${ex.priority}">${ex.priority==='grip'?'dead hangs':ex.priority}</span>` : '';
  // Via the resolver so a library flag counts too, not just a unit baked into the plan.
  const unit = exerciseUnit(ex);
  const displayName = dn(ex.name);
  const isSwapped = S.swaps[ex.name] && S.swaps[ex.name] !== ex.name;
  const allowNeg = exerciseAllowsNegative(ex); // plan flag OR the library toggle for this name

  // Dynamic set rows. Warmup is a per-set toggle (not positional); working sets are
  // numbered 1..n and show last session's working-set value (kg × reps) as a hint.
  const sets = S.setData[ex.name] || [];
  const lastWork = lastWorkingSetsFor(type(S.dayIdx), ex.name);
  let workIdx = 0;
  const setRows = sets.map((s,si)=>{
    const isWarmup = s.type==='warmup';
    const minAttr = allowNeg ? 'min="-999"' : 'min="0"';
    let numLabel, hint='';
    if(isWarmup){
      numLabel='W';
    } else {
      numLabel=String(++workIdx);
      const lw=lastWork[workIdx-1];
      // A timed bodyweight hold has no load, so "–kg × 45" reads as missing data. Show the
      // duration alone unless weight was actually added.
      if(lw && (lw.weight||lw.reps)){
        hint = unit==='secs'
          ? 'Last: '+(parseFloat(lw.weight)?lw.weight+'kg × ':'')+fmtSetAmount(lw.reps,'secs')
          : 'Last: '+(lw.weight||'–')+'kg × '+(lw.reps||'–');
      }
    }
    // iOS decimal keypad has no minus key. For exercises that allow negative loads (e.g. assisted
    // pullups), overlay a ± button inside the kg field so the sign can be set without a keyboard
    // minus — kept inside the input's grid cell so the row layout is unchanged.
    const kgInput = `<input class="set-kg" type="number" inputmode="decimal" ${minAttr} step="0.5"
        placeholder="${isWarmup?'bw':'kg'}" value="${s.weight}"
        onfocus="focusExercise(${ei})" onchange="updSet(${ei},${si},'weight',this.value)">`;
    const kgCell = allowNeg
      ? `<div class="set-kg-wrap"><button type="button" tabindex="-1" class="set-sign-btn${(parseFloat(s.weight)<0||s.negPending)?' neg':''}" onmousedown="event.preventDefault()" onclick="toggleSetSign(${ei},${si})" aria-label="Toggle negative weight">±</button>${kgInput}</div>`
      : kgInput;
    return `
    <div class="set-row${isWarmup?' set-warmup':''}${s.done?' set-done':''}">
      <button class="set-warmup-btn${isWarmup?' active':''}" onclick="toggleWarmup(${ei},${si})" aria-label="Toggle warmup">W</button>
      <div class="set-num">${numLabel}</div>
      ${kgCell}
      <span class="set-sep">${unit==='secs'?'for':'×'}</span>
      <input class="set-reps${unit==='secs'?' set-secs':''}" type="number" inputmode="numeric" min="0"
        placeholder="${unit==='secs'?'secs':unit}" value="${s.reps}"
        onfocus="focusExercise(${ei})" onchange="updSet(${ei},${si},'reps',this.value)">
      <button class="set-check${s.done?' done':''}" onclick="toggleSetDone(${ei},${si})" aria-label="Mark set done">✓</button>
      <button class="set-delete-btn" onclick="delSet(${ei},${si})" aria-label="Delete set">×</button>
      ${hint?`<div class="set-hint">${hint}</div>`:''}
    </div>`;
  }).join('');

  const collapsed = exCollapsed.has(ei);
  // n/m working-sets-done counter — shown (via CSS) only on collapsed cards, so a
  // minimised card still carries its progress context.
  const workTotal = sets.filter(s=>s.type!=='warmup');
  const setsDoneCt = workTotal.filter(s=>s.done).length;
  const workSets = sets.filter(s=>s.type!=='warmup' && (s.reps||s.weight));
  let exSummary = '';
  if(workSets.length){
    const last=workSets[workSets.length-1];
    exSummary=workSets.length+'×'+(last.reps||'?');
    if(last.weight) exSummary+=' @ '+last.weight+'kg';
  }
  return `<div class="ex-card${done?' done':''}${isActive?' active':''}${collapsed?' collapsed':''}" id="ec${ei}">
    <div class="ex-top ex-top-bar" style="background:transparent">
      <div class="ex-left" onclick="setActiveExercise(${ei})" style="cursor:pointer" title="Set as current exercise">
        <div class="ex-name">${displayName}</div>
        ${exSummary?`<div class="ex-collapse-summary">${exSummary}</div>`:''}
        ${isSwapped?`<div class="swap-badge">swapped</div>`:''}
        ${ex.note?`<div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:2px">${ex.note}</div>`:''}
        ${badge?`<div class="ex-badges">${badge}</div>`:''}
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        ${workTotal.length?`<span class="ex-mini-progress">${setsDoneCt}/${workTotal.length} sets</span>`:''}
        ${done?'<span class="exercise-done-check" aria-label="Exercise complete">✓</span>':''}
        ${logEditMode ? `<span class="ex-drag-handle" aria-label="Drag to reorder" title="Hold and drag to reorder">⠿</span>` : ''}
        <button class="swap-btn" onclick="openSwapModal(${ei})" title="Swap exercise" aria-label="Swap exercise">
          <svg viewBox="0 0 24 24"><path d="M7 16V4m0 0L3 8m4-4 4 4"/><path d="M17 8v12m0 0 4-4m-4 4-4-4"/></svg>
        </button>
        <button class="ex-collapse-btn" onclick="toggleExCollapse(${ei})" aria-label="Toggle collapse">
          <svg class="card-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        ${(logEditMode && !(S.setData[ex.name]||[]).some(s=>s.done)) ? `<button class="ex-del-btn" data-action="log-del-exercise" data-name="${_catEsc(ex.name)}" aria-label="Remove exercise">×</button>` : ''}
      </div>
    </div>
    <div class="ex-collapse-body"${collapsed?' style="height:0;opacity:0;overflow:hidden"':''}>
      ${setRows}
      <div class="set-actions">
        <button class="add-set-btn" onclick="addSet(${ei})">+ Add set</button>
        <button class="add-warmup-btn" onclick="addSet(${ei},'warmup')">+ Warmup</button>
      </div>
    </div>
  </div>`;
}

function selectDay(idx){ logEditMode=false; activeExIdx=-1; exCollapsed.clear(); initDay(idx); saveSetData(); rtResetAll(); dismissPostSaveWeight(); renderLog(true); rtUpdateSessionLabels(); }
// Day hero arrows — wrap around the split's schedule; centre taps back to today's suggested day.
function logDayStep(dir){ const n=scheduleLen(); selectDay(((S.dayIdx+dir)%n+n)%n); }
function logGoToday(){ selectDay(suggestDay()); }

// Last session's WORKING sets for an exercise (for the per-row hint). Old saved
// sessions have no per-set `type` → treat every set as working (best-effort).
function lastWorkingSetsFor(t, exName){
  const sess=lastSessionOf(t.name);
  if(!sess) return [];
  // Sessions are stored under the swapped name (dn); match it first, then the original so
  // the hint still resolves for sessions saved before this exercise was swapped.
  const swapped=dn(exName);
  const ex=(sess.exercises||[]).find(e=>e.name===swapped) || (sess.exercises||[]).find(e=>e.name===exName);
  if(!ex||!ex.sets) return [];
  return ex.sets.filter(s=>s.type?s.type!=='warmup':true).map(s=>({weight:s.weight,reps:s.reps}));
}
// Exercise-done is derived from sets: done when it has ≥1 working set and all working
// sets are ticked. S.checked stays the single source for Home progress/streak/badges.
function recomputeChecked(){
  const exs=type(S.dayIdx).exercises;
  S.checked=new Set();
  exs.forEach((ex,ei)=>{
    const sets=S.setData[ex.name]||[];
    const work=sets.filter(s=>s.type!=='warmup');
    if(work.length>0 && work.every(s=>s.done)) S.checked.add(ei);
  });
}
function updSet(ei, si, field, val){
  const ex = type(S.dayIdx).exercises[ei];
  if(!S.setData[ex.name]||!S.setData[ex.name][si]) return;
  const s = S.setData[ex.name][si];
  // Apply a primed negative sign (± tapped on an empty field, then a value typed): the iOS keypad
  // can only produce a positive number, so honour the pending sign here.
  if(field==='weight'){
    const n=parseFloat(val);
    if(s.negPending && !isNaN(n) && n>0){ val=String(-n); }
    if(!isNaN(n) && n!==0) s.negPending=false; // sign now lives in the value itself
  }
  s[field] = val;
  if(!S.sessionStart && String(val).trim()){
    S.sessionStart = Date.now(); // first set logged starts the session timer
    rtStartUi();
    rtUpdateSessionLabels();
  }
  saveSetData();
  if(field==='weight' && exerciseAllowsNegative(ex)) refreshSetSign(ei, si); // reflect the applied sign
  // Sweep an accent flash across the row so the commit is visible (change fires on blur/enter).
  if(String(val).trim()){
    const card=document.getElementById('ec'+ei);
    const row=card && card.querySelectorAll('.set-row')[si];
    if(row){
      row.classList.remove('row-save-flash'); void row.offsetWidth; // restart if still flashing
      row.classList.add('row-save-flash');
      setTimeout(()=>row.classList.remove('row-save-flash'), 650);
    }
  }
}
// ± button for negative-load exercises. Flip the sign of the entered value; if the field is empty
// it primes the sign so the next digits typed become negative (see updSet). Updates in place —
// no renderLog — so a live keyboard/focus survives.
function toggleSetSign(ei, si){
  const ex = type(S.dayIdx).exercises[ei];
  const arr = S.setData[ex.name]; const s = arr && arr[si]; if(!s) return;
  const v = parseFloat(s.weight);
  if(!isNaN(v) && v!==0){ s.weight = String(-v); s.negPending = false; }
  else { s.negPending = !s.negPending; s.weight = ''; }
  saveSetData();
  refreshSetSign(ei, si);
}
function refreshSetSign(ei, si){
  const ex = type(S.dayIdx).exercises[ei];
  const s = S.setData[ex.name] && S.setData[ex.name][si]; if(!s) return;
  const card = document.getElementById('ec'+ei); if(!card) return;
  const row = card.querySelectorAll('.set-row')[si]; if(!row) return;
  const inp = row.querySelector('.set-kg'); if(inp && inp.value!==s.weight) inp.value = s.weight;
  const btn = row.querySelector('.set-sign-btn');
  if(btn) btn.classList.toggle('neg', (parseFloat(s.weight)<0) || !!s.negPending);
}
function toggleExCollapse(ei){
  exCollapsed.has(ei) ? exCollapsed.delete(ei) : exCollapsed.add(ei);
  renderLog();
}
function addSet(ei, setType){
  const ex = type(S.dayIdx).exercises[ei];
  const arr = S.setData[ex.name] || (S.setData[ex.name]=[]);
  const ns = {weight:'',reps:'',type:setType==='warmup'?'warmup':'working',done:false};
  if(setType==='warmup') arr.unshift(ns); else arr.push(ns); // warmups sit at the top
  recomputeChecked(); saveSetData(); renderLog();
}
function delSet(ei, si){
  const ex = type(S.dayIdx).exercises[ei];
  const arr = S.setData[ex.name]; if(!arr) return;
  arr.splice(si,1);
  if(arr.length===0) arr.push({weight:'',reps:'',type:'working',done:false}); // keep ≥1 row
  recomputeChecked(); saveSetData(); renderLog();
}
function toggleWarmup(ei, si){
  const ex = type(S.dayIdx).exercises[ei];
  const s = S.setData[ex.name] && S.setData[ex.name][si]; if(!s) return;
  s.type = s.type==='warmup' ? 'working' : 'warmup';
  recomputeChecked(); saveSetData(); renderLog();
}
function toggleSetDone(ei, si){
  const ex = type(S.dayIdx).exercises[ei];
  const s = S.setData[ex.name] && S.setData[ex.name][si]; if(!s) return;
  s.done = !s.done;
  const justMarkedDone = s.done;
  recomputeChecked(); saveSetData();
  const nowDone = S.checked.has(ei);
  const exList = type(S.dayIdx).exercises;
  const dayComplete = justMarkedDone && exList.length > 0 && S.checked.size === exList.length;
  renderLog();

  // Micro-interactions on freshly rendered DOM nodes
  if(justMarkedDone){
    const card = document.getElementById('ec'+ei);
    if(card){
      const rows = card.querySelectorAll('.set-row');
      const row = rows[si];
      if(row){
        const btn = row.querySelector('.set-check');
        if(btn){ btn.classList.add('check-btn-ripple'); setTimeout(()=>btn.classList.remove('check-btn-ripple'), 500); }
        row.classList.add('set-row-sweep');
        setTimeout(()=>row.classList.remove('set-row-sweep'), 600);
      }
      if(nowDone){ card.classList.add('ex-card-done-glow'); setTimeout(()=>card.classList.remove('ex-card-done-glow'), 800); }
    }
    // Day-complete gets its own toast+haptic below — don't stack both on the final set.
    if(!dayComplete){ showToast('Set saved'); haptic(30); }
  }

  // Day complete — 5 celebration rings scattered across the viewport
  if(dayComplete){
    showToast('Day complete 🎉');
    haptic([60, 40, 60]);
    for(let i=0;i<5;i++){
      const ring=document.createElement('div');
      ring.className='celebrate-ring';
      ring.style.top=(20+Math.random()*60)+'vh';
      ring.style.left=(20+Math.random()*60)+'vw';
      ring.style.animationDelay=(i*80)+'ms';
      document.body.appendChild(ring);
      setTimeout(()=>ring.remove(), 700+i*80);
    }
    const barFill=document.querySelector('.ldh-bar-fill');
    if(barFill){ barFill.style.transition='opacity 0.15s'; barFill.style.opacity='0.3'; setTimeout(()=>{ barFill.style.opacity=''; barFill.style.transition=''; }, 250); }
  }

  if(nowDone){ setTimeout(()=>{ exCollapsed.add(ei); renderLog(); }, 400); } // auto-collapse when complete
}

// ── In-progress persistence ───────────────────────────────────────
// S.setData is rebuilt fresh by initDay and was lost on refresh. Persist the current
// day's in-progress sets (incl. warmup/done) so a reload mid-workout restores them.
function saveSetData(){
  try{
    localStorage.setItem('wt_setdata', JSON.stringify({
      date:getLocalDate(), dayIdx:S.dayIdx, setData:S.setData,
      checked:[...S.checked], sessionStart:S.sessionStart, note:S.sessionNote,
      sessionAdds:S.sessionAdds // keep session-only adds visible across a same-day reload
    }));
  }catch(e){}
}
function restoreSetData(){
  try{
    const raw=localStorage.getItem('wt_setdata'); if(!raw) return false;
    const o=JSON.parse(raw);
    if(!o || o.date!==getLocalDate() || typeof o.dayIdx!=='number') return false; // only same-day
    initDay(o.dayIdx);
    if(o.setData && typeof o.setData==='object') S.setData=o.setData;
    S.checked=new Set(o.checked||[]);
    S.sessionStart=o.sessionStart||null;
    S.sessionNote=o.note||'';
    S.sessionAdds=Array.isArray(o.sessionAdds)?o.sessionAdds:[]; // restore same-day session-only adds
    return true;
  }catch(e){ return false; }
}
function clearSetData(){ try{ localStorage.removeItem('wt_setdata'); }catch(e){} }

// ── Save session ─────────────────────────────────────────────────
function saveSession(){
  const t = type(S.dayIdx);
  // In-session set data is keyed by the ORIGINAL program name (ex.name); the swap only
  // changed what's displayed. Record each exercise under its SWAPPED name (dn) so history
  // lives under the movement actually performed — e.g. sets done after Bench→Dumbbell Press
  // are stored as "Dumbbell Press", matched literally by the per-exercise history view.
  const exercises = t.exercises.map(ex=>({
    name: dn(ex.name),
    sets: S.setData[ex.name]
      .map(s=>({weight:parseFloat(s.weight)||0, reps:parseInt(s.reps)||0, type:s.type==='warmup'?'warmup':'working'}))
      .filter(s=>s.weight>0||s.reps>0)
  })).filter(ex=>ex.sets.length>0);

  if(!exercises.length){
    const msg=document.getElementById('save-msg');
    msg.style.display='block'; msg.style.color='var(--danger)';
    msg.textContent='Log at least one set before saving.'; return;
  }

  const note = S.sessionNote.trim();
  const sessionObj = {
    id: Date.now().toString(),
    date: getLocalDate(),
    dayNum: S.dayIdx+1,
    sessionType: t.name,
    duration: getDurationMins(),
    exercises
  };
  if(note) sessionObj.note = note;

  S.sessions.push(sessionObj);
  persist();
  updateNavBadges();

  // Progressive overload check
  const poSuggestions = checkPO(S.sessions[S.sessions.length-1]);

  // Reset note, session timer and rest stopwatch
  S.sessionNote = '';
  S.sessionStart = null;
  S.sessionAdds = []; // session-only adds are now in this date's history; don't carry them forward
  clearSetData(); // saved now — drop the in-progress copy so a reload starts fresh
  rtResetAll();
  rtUpdateSessionLabels();
  const noteEl = document.getElementById('session-note');
  if(noteEl) noteEl.value = '';

  // Success feedback
  const btn = document.getElementById('save-btn');
  const msg = document.getElementById('save-msg');
  btn.textContent = '✓ Saved!';
  btn.style.background = 'var(--accent)';
  msg.style.display = 'block';
  msg.style.color = 'var(--accent)';
  msg.textContent = 'Session saved!';
  showPostSaveWeightPrompt();
  showPostSaveEffortPrompt(sessionObj.id);

  setTimeout(()=>{
    btn.textContent = 'Save session';
    btn.style.background = '';
    if(poSuggestions.length) showPOModal(poSuggestions);
  }, 900);
}

// ── Progressive overload check ────────────────────────────────────
// The old rule compared only the last two sessions and used >=, so simply MATCHING last week
// was enough to be told to add weight — which is why it fired nearly every session. It now
// wants a real trend, judged on the first working set and always at the same load: a weight
// increase resets the comparison, because reps naturally drop after a jump and then climb
// back, which the old rule read as progress.
const PO_STREAK_NEEDED=3;      // sessions of strictly increasing reps
const PO_REP_CEILING=8;        // reps at or above this means the load is too light
const PO_CEILING_SESSIONS=2;   // ...sustained for this many sessions
// The first working set specifically: it's the freshest and least affected by fatigue, and
// it's what Francois judges his own progress on.
function poFirstWorkingSet(ex){
  const sets=(ex&&ex.sets||[]).filter(s=>s.type!=='warmup'&&parseFloat(s.weight)>0&&parseFloat(s.reps)>0);
  return sets.length?{weight:parseFloat(sets[0].weight),reps:parseFloat(sets[0].reps)}:null;
}
// Newest-first first-working-sets for one exercise, across sessions of the same type.
function poHistoryFor(exName,sessionType){
  const out=[];
  for(let i=S.sessions.length-1;i>=0;i--){
    const s=S.sessions[i];
    if(s.sessionType!==sessionType) continue;
    const ex=(s.exercises||[]).find(e=>e.name===exName);
    if(!ex) continue;
    const fw=poFirstWorkingSet(ex);
    if(fw) out.push(fw);
    if(out.length>=6) break;   // no need to look further back than the current streak can reach
  }
  return out;
}
// Returns a reason string, or null. Only ever considers the run at the CURRENT weight.
function poShouldIncrease(hist){
  if(!hist.length) return null;
  const w=hist[0].weight;
  const run=[];
  for(const h of hist){ if(h.weight!==w) break; run.push(h); }

  // Strictly increasing reps, session over session. run[0] is the newest, so each entry must
  // beat the one before it in time.
  if(run.length>=PO_STREAK_NEEDED){
    let rising=true;
    for(let i=0;i<PO_STREAK_NEEDED-1;i++){
      if(!(run[i].reps>run[i+1].reps)){ rising=false; break; }
    }
    if(rising) return 'reps up '+PO_STREAK_NEEDED+' sessions running';
  }
  // Or the load is simply too light to keep at.
  if(run.length>=PO_CEILING_SESSIONS &&
     run.slice(0,PO_CEILING_SESSIONS).every(h=>h.reps>=PO_REP_CEILING)){
    return PO_REP_CEILING+'+ reps for '+PO_CEILING_SESSIONS+' sessions';
  }
  return null;
}
function checkPO(newSession){
  const suggestions=[];
  (newSession.exercises||[]).forEach(ex=>{
    const hist=poHistoryFor(ex.name,newSession.sessionType);
    const reason=poShouldIncrease(hist);
    if(reason) suggestions.push({name:dn(ex.name),weight:hist[0].weight,reps:hist[0].reps,reason});
  });
  return suggestions;
}

function showPOModal(suggestions){
  document.getElementById('po-items').innerHTML = suggestions.map(s=>`
    <div class="po-item">
      <div class="po-item-name">${s.name}</div>
      <div class="po-item-tip">Try ${s.weight+2.5}kg next time (+2.5kg)</div>
      <!-- Say WHY it fired, so a suggestion can be judged rather than just trusted. -->
      <div class="po-item-why">${s.reason} · currently ${s.weight}kg × ${s.reps}</div>
    </div>`).join('');
  document.getElementById('po-modal').classList.remove('hidden');
}
function closePOModal(){
  document.getElementById('po-modal').classList.add('hidden');
}

// ── Week review ───────────────────────────────────────────────────
function getWeekBounds(){
  const monday=getMondayOf(0);
  const mondayStr=weekKey(monday);
  const sunday=new Date(monday); sunday.setDate(monday.getDate()+6);
  return {mondayStr, sundayStr:dateStr(sunday)};
}
function renderWeekReviewCard(){
  const {mondayStr,sundayStr}=getWeekBounds();
  const isSunday=localMidnight(getLocalDate()).getDay()===0;
  const weekBudget=budgetData[mondayStr];
  if(!isSunday&&!(weekBudget&&weekBudget.saved)) return '';

  const workoutDays=new Set(
    S.sessions.filter(s=>s.date>=mondayStr&&s.date<=sundayStr).map(s=>s.date)
  ).size;

  let leftoverLine='';
  if(weekBudget){
    const inc=weekIncome(weekBudget);
    const leftover=inc>0?weekLeftover(weekBudget):null;
    if(leftover!==null){
      const statusTxt=leftover>=50?'🟢 On track':leftover>=0?'🟡 Tight':'🔴 Over';
      const col=leftover>=0?'var(--success)':'var(--danger)';
      leftoverLine='<div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid var(--border)"><span style="font-size:13px;color:var(--muted)">Budget</span><span style="font-size:13px;font-weight:600;color:'+col+'">'+(leftover>=0?'+$':'-$')+Math.abs(leftover).toFixed(0)+' · '+statusTxt+'</span></div>';
    }
  }

  let calLine='';
  const cg=calcGoalCals();
  const goalCals=cg?(cg.goal==='cut'?cg.cut:cg.goal==='bulk'?cg.bulk:cg.maintain):null;
  if(goalCals){
    const calTotal=S.dailyLog.entries.reduce((a,e)=>a+e.kcal,0);
    calLine='<div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid var(--border)"><span style="font-size:13px;color:var(--muted)">Today\'s cals</span><span style="font-size:13px;font-weight:600">'+calTotal+' / '+goalCals+' kcal</span></div>';
  }

  let weightLine='';
  const weekWeights=S.weights.filter(w=>w.date>=mondayStr&&w.date<=sundayStr).sort((a,b)=>a.date<b.date?-1:1);
  if(weekWeights.length>=2){
    const chg=+(weekWeights[weekWeights.length-1].weight-weekWeights[0].weight).toFixed(1);
    const col=chg<0?'var(--success)':chg>0?'var(--danger)':'var(--muted)';
    weightLine='<div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid var(--border)"><span style="font-size:13px;color:var(--muted)">Weight</span><span style="font-size:13px;font-weight:600;color:'+col+'">'+(chg>0?'+':'')+chg+'kg this week</span></div>';
  }

  return '<div class="card">'
    +'<div class="sec-label" style="margin-bottom:10px">🗓️ Week in review</div>'
    +'<div style="display:flex;justify-content:space-between;padding:6px 0"><span style="font-size:13px;color:var(--muted)">Workouts</span><span style="font-size:13px;font-weight:600">'+workoutDays+' / 6 days</span></div>'
    +leftoverLine+calLine+weightLine
    +'<button onclick="openWeekReviewModal()" style="width:100%;margin-top:12px;padding:10px;background:var(--bg);border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-weight:600;color:var(--text);cursor:pointer">View full review</button>'
    +'</div>';
}
// Shared week-review body — used by the wr-modal popup AND inline by Stats > Overview.
function buildWeekReviewHTML(){
  const {mondayStr,sundayStr}=getWeekBounds();
  const weekSessions=S.sessions.filter(s=>s.date>=mondayStr&&s.date<=sundayStr);
  const workoutDays=new Set(weekSessions.map(s=>s.date)).size;

  const sessionHTML=weekSessions.length
    ?weekSessions.map(s=>'<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)"><span style="font-size:13px;font-weight:600">'+fmtDate(s.date)+'</span><span style="font-size:13px;color:var(--muted)">'+s.sessionType+(s.duration?' · '+fmtDuration(s.duration):'')+'</span></div>').join('')
    :'<div style="font-size:13px;color:var(--muted);padding:8px 0">No workouts logged this week</div>';

  const bd=budgetData[mondayStr];
  let budHTML='<div style="font-size:13px;color:var(--muted);padding:8px 0">No budget data this week</div>';
  if(bd){
    const inc=weekIncome(bd);
    const saved=weekSavedAmt(bd);
    // Match the Budget Editor exactly: sum the ACTUAL per-week fix_/var_ category amounts
    // (weekFixedTotal/weekVarTotal — the same data budRecalc feeds into "Total variable").
    // The old code used bd.snapshot.* (a stale aggregate) or config*Total() (the PLANNED
    // budget), so variable read as the plan's $670 instead of the $510 actually entered.
    const fixed=weekFixedTotal(bd);
    const variable=weekVarTotal(bd);
    const leftover=inc>0?weekLeftover(bd):null;
    const col=leftover!==null&&leftover>=0?'var(--success)':'var(--danger)';
    budHTML='<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px"><span style="color:var(--muted)">Income</span><span style="font-weight:600;color:var(--success)">'+(inc>0?'$'+inc.toFixed(0):'—')+'</span></div>'
      +'<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px"><span style="color:var(--muted)">Saved</span><span style="font-weight:600">$'+saved.toFixed(0)+'</span></div>'
      +'<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px"><span style="color:var(--muted)">Fixed expenses</span><span style="font-weight:600">$'+fixed.toFixed(0)+'</span></div>'
      +'<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px"><span style="color:var(--muted)">Variable expenses</span><span style="font-weight:600">$'+variable.toFixed(0)+'</span></div>'
      +'<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px;font-weight:700;border-top:1px solid var(--border);margin-top:4px"><span>Left over</span><span style="color:'+col+'">'+(leftover!==null?(leftover>=0?'+$':'-$')+Math.abs(leftover).toFixed(0):'—')+'</span></div>';
  }

  let calHTML='';
  const cg=calcGoalCals();
  const goalCals=cg?(cg.goal==='cut'?cg.cut:cg.goal==='bulk'?cg.bulk:cg.maintain):null;
  if(goalCals){
    const calTotal=S.dailyLog.entries.reduce((a,e)=>a+e.kcal,0);
    const pct=Math.round(calTotal/goalCals*100);
    calHTML='<div style="margin-bottom:16px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);margin-bottom:4px">Today\'s calories</div>'
      +'<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:13px"><span style="color:var(--muted)">Eaten today</span><span style="font-weight:600">'+calTotal+' / '+goalCals+' kcal ('+pct+'%)</span></div></div>';
  }

  const weekWeights=S.weights.filter(w=>w.date>=mondayStr&&w.date<=sundayStr).sort((a,b)=>a.date<b.date?-1:1);
  let weightHTML='<div style="font-size:13px;color:var(--muted);padding:8px 0">No weight logged this week</div>';
  if(weekWeights.length){
    weightHTML=weekWeights.map(w=>'<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px"><span style="color:var(--muted)">'+fmtDate(w.date)+'</span><span style="font-weight:600">'+w.weight+'kg</span></div>').join('');
    if(weekWeights.length>=2){
      const chg=+(weekWeights[weekWeights.length-1].weight-weekWeights[0].weight).toFixed(1);
      const col=chg<0?'var(--success)':chg>0?'var(--danger)':'var(--muted)';
      weightHTML+='<div style="font-size:13px;font-weight:700;padding:8px 0 0;color:'+col+'">'+(chg>0?'+':'')+chg+'kg this week</div>';
    }
  }

  // Habits section for modal
  let habitsModalHTML='';
  if(habitsData.length){
    const wkDates=getWeekDates();
    const todayStr=getLocalDate();
    const dayNames=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const rows=wkDates.map((date,i)=>{
      if(date>todayStr) return '';
      const done=(habitsLog[date]||[]).length;
      const n=habitsData.length;
      const col=done===0?'var(--muted)':done>=n?'var(--success)':'var(--warn)';
      return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">'
        +'<span style="color:var(--muted)">'+dayNames[i]+' '+fmtDate(date)+'</span>'
        +'<span style="font-weight:600;color:'+col+'">'+done+'/'+n+'</span>'
        +'</div>';
    }).filter(Boolean).join('');
    habitsModalHTML='<div><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);margin-bottom:4px">Habits</div>'
      +(rows||'<div style="font-size:13px;color:var(--muted);padding:8px 0">No habits logged yet</div>')
      +'</div>';
  }

  return '<div style="margin-bottom:16px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);margin-bottom:8px">Workouts ('+workoutDays+'/6 days)</div>'+sessionHTML+'</div>'
    +'<div style="margin-bottom:16px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);margin-bottom:4px">Budget</div>'+budHTML+'</div>'
    +calHTML
    +'<div style="margin-bottom:16px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);margin-bottom:4px">Weight this week</div>'+weightHTML+'</div>'
    +habitsModalHTML;
}
function openWeekReviewModal(){
  document.getElementById('wr-modal-body').innerHTML=buildWeekReviewHTML();
  document.getElementById('wr-modal').classList.remove('hidden');
}
function closeWeekReviewModal(){
  document.getElementById('wr-modal').classList.add('hidden');
}

// ── Exercise swap ─────────────────────────────────────────────────
function openSwapModal(ei){
  S.swapTarget = ei;
  const ex = type(S.dayIdx).exercises[ei];
  const cur = S.swaps[ex.name];
  // Show the current swap (if any) in the LABEL, not the search box.
  document.getElementById('swap-original-label').textContent =
    cur ? `${ex.name} → ${cur}` : `Default: ${ex.name}`;
  // Start the search box EMPTY so the whole library renders. Prefilling it with the current
  // swap name (frequently a custom name absent from the library) made renderSwapList filter
  // the list down to zero rows — the "swap list is empty / swap won't save" bug, since with
  // nothing pickable the swap could never be committed.
  document.getElementById('swap-input').value = '';
  // Bottom-sheet + backdrop pair, mirroring the Training Split picker's open/close.
  document.getElementById('swap-backdrop').classList.remove('hidden');
  document.getElementById('swap-modal').classList.remove('hidden');
  renderSwapList();
  setTimeout(()=>document.getElementById('swap-input').focus(), 100);
}
function renderSwapList(){
  const q=(document.getElementById('swap-input')?.value||'').toLowerCase();
  const lib=loadExerciseLib();
  const filtered=q?lib.filter(e=>e.name.toLowerCase().includes(q)):lib;
  const groups={};
  filtered.forEach(e=>{ const m=e.muscle||'other'; if(!groups[m]) groups[m]=[]; groups[m].push(e); });
  // Built-in order first, then any user-added groups present — so custom-group exercises still list.
  const ORDER=[...BUILTIN_MUSCLES, ...Object.keys(groups).filter(m=>!BUILTIN_MUSCLES.includes(m))];
  const el=document.getElementById('swap-lib-list'); if(!el) return;
  let html='';
  ORDER.forEach(m=>{
    if(!groups[m]||!groups[m].length) return;
    html+='<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;padding:8px 0 2px">'
      +m.charAt(0).toUpperCase()+m.slice(1)+'</div>';
    groups[m].forEach(e=>{
      // Name goes in an HTML-escaped data attribute, read back in the handler. Inlining
      // JSON.stringify(name) put double quotes INSIDE the double-quoted onclick attribute,
      // which truncated it to `swapPickExercise(` — so tapping a row did nothing and swaps
      // couldn't be picked from the list at all.
      html+='<button class="se-picker-item" data-swap="'+_catEsc(e.name)+'" onclick="swapPickExercise(this.dataset.swap)"><span>'+_catEscHtml(e.name)+'</span><span class="se-picker-muscle">'+e.muscle+'</span></button>';
    });
  });
  el.innerHTML=html||'<div style="padding:12px 0;text-align:center;color:var(--muted);font-size:13px">No exercises found</div>';
}
function swapPickExercise(name){
  document.getElementById('swap-input').value=name;
  confirmSwap();
}
function closeSwapModal(){
  document.getElementById('swap-backdrop').classList.add('hidden');
  document.getElementById('swap-modal').classList.add('hidden');
}
function confirmSwap(){
  const ex = type(S.dayIdx).exercises[S.swapTarget];
  const newName = document.getElementById('swap-input').value.trim();
  // Empty box = no change: keep whatever's currently set. (The box now starts empty so the full
  // list shows, so an untouched Save must NOT wipe an existing swap.) Removing a swap is done
  // with the "Reset to default" button → resetSwapDefault().
  if(!newName){ closeSwapModal(); return; }
  if(newName !== ex.name){
    S.swaps[ex.name] = newName;
  } else {
    delete S.swaps[ex.name]; // picking the exercise's own default name clears any swap
  }
  saveSwaps();
  closeSwapModal();
  renderLog();
}
function resetSwapDefault(){
  const ex = type(S.dayIdx).exercises[S.swapTarget];
  delete S.swaps[ex.name];
  saveSwaps();
  closeSwapModal();
  renderLog();
}

// ── Empty state helper ────────────────────────────────────────────
function emptyState(emoji,heading,sub,btnLabel,btnAction){
  return `<div style="text-align:center;padding:32px 16px;margin:32px 0">
    <div style="font-size:40px;margin-bottom:12px">${emoji}</div>
    <div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:6px">${heading}</div>
    <div style="font-size:13px;color:var(--muted);margin-bottom:${btnLabel?'18px':'0'}">${sub}</div>
    ${btnLabel?`<button onclick="${btnAction}" style="padding:10px 22px;border-radius:10px;border:none;background:var(--accent);color:#fff;font-size:14px;font-weight:600;cursor:pointer">${btnLabel}</button>`:''}
  </div>`;
}

// ── HISTORY view ──────────────────────────────────────────────────
function renderHistory(){
  const list = document.getElementById('history-list');
  if(!S.sessions.length){
    list.innerHTML=emptyState('🏋️','No sessions yet','Log your first workout to start tracking your progress','Go to Log →',"setView('log')");
    return;
  }
  list.innerHTML = [...S.sessions].reverse().map((s,ri)=>{
    const i = S.sessions.length-1-ri;
    const tc = splitTypes().find(t=>t.name===s.sessionType)||splitTypes()[0];
    const summary = s.exercises.map(e=>`${dn(e.name)} (${e.sets.length} sets)`).join(' · ');
    const detail = s.exercises.map(ex=>`
      <div class="session-ex-row">
        <div class="session-ex-name">${dn(ex.name)}</div>
        ${ex.sets.map((set,si)=>{
          const timed=isTimedExercise(ex);
          const load=set.weight?set.weight+'kg':(timed?'':'—');
          return `<div class="session-set-line">Set ${si+1}: ${timed?(load?load+' for ':'')+fmtSetAmount(set.reps,'secs'):load+' × '+(set.reps||'—')}</div>`;
        }).join('')}
      </div>`).join('');

    const durStr = s.duration ? ` · ${fmtDuration(s.duration)}` : '';
    return `<div class="session-card">
      <div class="session-card-top">
        <div class="session-date-str">${fmtDate(s.date)} · Day ${s.dayNum}${durStr}</div>
        <div style="display:flex;align-items:center;gap:8px">
          ${s.effort&&effortMeta(s.effort)?`<div class="session-effort-pill" title="Session effort">${effortMeta(s.effort).emoji} ${effortMeta(s.effort).label}</div>`:''}
          <div class="session-type-pill ${tc.id}">${s.sessionType}</div>
          <button class="session-del-x" onclick="deleteSession('${s.id}')" title="Delete session" aria-label="Delete session">✕</button>
        </div>
      </div>
      <div class="session-summary">${summary}</div>
      <div class="session-expand" id="se${i}">${detail}
        <button class="delete-btn" onclick="deleteSession('${s.id}')">Delete session</button>
      </div>
      ${s.note?`<div class="session-note-block" id="sn${i}">${s.note.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`:''}
      <div class="hist-toggle-row">
        <button class="hist-toggle-btn" onclick="toggleExpand('se${i}',this)">Show sets ▾</button>
        ${s.note?`<button class="hist-toggle-btn" onclick="toggleExpand('sn${i}',this)">Notes ▾</button>`:''}
      </div>
    </div>`;
  }).join('');
}

function toggleExpand(id, btn){
  const el = document.getElementById(id);
  if(!el) return;
  const open = el.style.display === 'block';
  el.style.display = open ? 'none' : 'block';
  if(btn){
    const label = btn.textContent.includes('sets') ? (open?'Show sets ▾':'Hide sets ▴')
                                                     : (open?'Notes ▾':'Notes ▴');
    btn.textContent = label;
  }
}

function deleteSession(id){
  if(!confirm('Delete this session?')) return;
  S.sessions = S.sessions.filter(s=>s.id!==id);
  persist(); renderHistory();
}

// ── WEIGHT tracking ──────────────────────────────────────────────
// Single write path for a weight entry (Stats > Body form + post-save Log prompt).
function addWeightEntry(date, weight){
  S.weights = S.weights.filter(w=>w.date!==date);
  S.weights.push({date, weight});
  S.weights.sort((a,b)=>a.date<b.date?-1:1);
  persistWeights();
}
function logWeight(){
  const dateEl  = document.getElementById('weight-date');
  const inputEl = document.getElementById('weight-input');
  const weight  = parseFloat(inputEl.value);
  const date    = dateEl.value;
  if(!weight || !date) return;
  addWeightEntry(date, weight);
  inputEl.value='';
  renderWeightSection();
}
// ── Post-workout weight prompt (Log tab, after Save session) ─────
// Inline and skippable — never a modal, so it can't collide with the PO modal.
function showPostSaveWeightPrompt(){
  const wrap=document.getElementById('post-save-weight'); if(!wrap) return;
  const today=getLocalDate();
  if(S.weights.some(w=>w.date===today)){ wrap.innerHTML=''; return; } // already logged today
  wrap.innerHTML=
    '<div class="psw-card">'+
      '<div class="psw-title">⚖️ Log your weight? Scale\'s right there.</div>'+
      '<div class="psw-row">'+
        '<input class="psw-input" id="psw-input" type="number" inputmode="decimal" min="30" max="250" step="0.1" placeholder="kg">'+
        '<button class="psw-save" onclick="confirmPostSaveWeight()">Save</button>'+
        '<button class="psw-skip" onclick="dismissPostSaveWeight()">Skip</button>'+
      '</div>'+
    '</div>';
}
function confirmPostSaveWeight(){
  const v=parseFloat(document.getElementById('psw-input')?.value);
  if(!v||v<30||v>250) return;
  addWeightEntry(getLocalDate(), v);
  const wrap=document.getElementById('post-save-weight');
  if(wrap){
    wrap.innerHTML='<div class="psw-card" style="text-align:center;color:var(--success);font-size:13px;font-weight:600">✓ '+v+'kg logged</div>';
    setTimeout(()=>{ if(wrap) wrap.innerHTML=''; },1800);
  }
}
function dismissPostSaveWeight(){
  const wrap=document.getElementById('post-save-weight');
  if(wrap) wrap.innerHTML='';
}

// ── Post-save effort rating ───────────────────────────────────────
// Same card idiom as the weight prompt above, in its own container so both can show.
// Fully optional and non-blocking: the session is already saved by the time this appears —
// picking a level back-fills s.effort on the saved record; Skip (or ignoring it) changes
// nothing. Synced automatically via persist() (sessions sync wholesale by id).
// `color` is a semantic scale (easy→brutal), deliberately independent of --accent, which can
// be any hue at runtime. The emoji stay for the existing rating buttons and session pills;
// chrome that needs the rating as a coloured chip uses `color` instead.
const EFFORT_LEVELS=[
  {id:'easy',     label:'Easy',     emoji:'🟢', color:'#52B788'},
  {id:'moderate', label:'Moderate', emoji:'🟡', color:'#EAB308'},
  {id:'hard',     label:'Hard',     emoji:'🟠', color:'#F59E0B'},
  {id:'brutal',   label:'Brutal',   emoji:'🔴', color:'#E74C3C'},
];
function effortMeta(id){ return EFFORT_LEVELS.find(l=>l.id===id)||null; }
function showPostSaveEffortPrompt(sessionId){
  const wrap=document.getElementById('post-save-effort'); if(!wrap) return;
  wrap.innerHTML=
    '<div class="psw-card">'+
      '<div class="psw-title">💪 How did that session feel?</div>'+
      '<div class="psw-row">'+
        EFFORT_LEVELS.map(l=>'<button class="effort-btn" onclick="setSessionEffort(\''+sessionId+'\',\''+l.id+'\')">'+l.emoji+' '+l.label+'</button>').join('')+
      '</div>'+
      '<button class="psw-skip" style="width:100%;margin-top:8px;padding:8px 0" onclick="dismissPostSaveEffort()">Skip</button>'+
    '</div>';
}
function setSessionEffort(sessionId,level){
  const s=S.sessions.find(x=>x.id===sessionId);
  if(s){ s.effort=level; persist(); }
  const wrap=document.getElementById('post-save-effort');
  if(wrap){
    const m=effortMeta(level);
    wrap.innerHTML='<div class="psw-card" style="text-align:center;color:var(--success);font-size:13px;font-weight:600">✓ '+(m?m.emoji+' '+m.label:'Logged')+'</div>';
    setTimeout(()=>{ if(wrap) wrap.innerHTML=''; },1800);
  }
}
function dismissPostSaveEffort(){
  const wrap=document.getElementById('post-save-effort');
  if(wrap) wrap.innerHTML='';
}
function deleteWeight(date){
  S.weights = S.weights.filter(w=>w.date!==date);
  persistWeights();
  renderWeightSection();
}
function renderWeightSection(){
  const wrap = document.getElementById('weight-section');
  if(!wrap) return;
  const today  = getLocalDate();
  const sorted = [...S.weights].sort((a,b)=>a.date<b.date?-1:1);
  const cur    = sorted.length ? sorted[sorted.length-1].weight : null;
  const lo     = sorted.length ? Math.min(...sorted.map(w=>w.weight)) : null;
  const hi     = sorted.length ? Math.max(...sorted.map(w=>w.weight)) : null;

  wrap.innerHTML=`
    <div class="week-section" style="margin-bottom:14px">
      <div class="week-section-title">Body weight</div>
      <div class="week-section-sub">Log your weight to track bulk progress</div>
      <div style="display:flex;gap:8px;margin-bottom:12px;align-items:stretch">
        <div style="flex:1;display:flex;flex-direction:column;gap:6px">
          <input type="date" id="weight-date" value="${today}"
            style="width:100%;height:40px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;padding:0 10px;background:var(--card);color:var(--text)">
          <input type="number" id="weight-input" inputmode="decimal" min="30" max="250" step="0.1" placeholder="kg"
            style="width:100%;height:40px;border:1.5px solid var(--border);border-radius:8px;font-size:18px;font-weight:500;text-align:center;background:var(--card);color:var(--text)">
        </div>
        <button onclick="logWeight()"
          style="padding:0 18px;background:var(--header);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">Log</button>
      </div>
      ${sorted.length ? `
        <div class="stats-grid" style="margin-bottom:12px">
          <div class="stat-card"><div class="stat-val">${cur}kg</div><div class="stat-lbl">Current</div></div>
          <div class="stat-card"><div class="stat-val">${lo}kg</div><div class="stat-lbl">Lowest</div></div>
          <div class="stat-card"><div class="stat-val">${hi}kg</div><div class="stat-lbl">Highest</div></div>
        </div>
        ${sorted.length>=2?`<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:12px"><canvas id="weight-chart" style="max-height:360px"></canvas></div>`:''}
        <div style="max-height:160px;overflow-y:auto">
          ${[...sorted].reverse().map(w=>`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)">
              <span style="font-size:13px;color:var(--muted)">${fmtDate(w.date)}</span>
              <span style="font-size:14px;font-weight:600">${w.weight}kg</span>
              <button onclick="deleteWeight('${w.date}')" style="font-size:12px;color:var(--danger);background:none;border:none;cursor:pointer;padding:0 4px">✕</button>
            </div>`).join('')}
        </div>` :
        emptyState('⚖️','No weight logged',"Tap 'Log weight' above to start tracking")}
    </div>`;
  animateStatVals(wrap);

  if(S.weightChart){ S.weightChart.destroy(); S.weightChart=null; }
  if(sorted.length>=2){
    const ctx=document.getElementById('weight-chart');
    if(!ctx) return;
    const isDark = S.theme==='dark';
    const gc=isDark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.06)';
    const tc=isDark?'#888':'#94a3b8';
    S.weightChart=new Chart(ctx,{
      type:'line',
      data:{
        labels:sorted.map(w=>fmtDate(w.date)),
        datasets:[{
          data:sorted.map(w=>w.weight),
          borderColor:'#6366f1',backgroundColor:'rgba(99,102,241,0.08)',
          borderWidth:2.5,pointRadius:4,pointBackgroundColor:'#6366f1',
          fill:true,tension:0.3
        }]
      },
      options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.parsed.y+'kg'}}},
        scales:{
          x:{grid:{color:gc},ticks:{color:tc,font:{size:11},maxTicksLimit:6}},
          y:{grid:{color:gc},ticks:{color:tc,font:{size:11},callback:v=>v+'kg'},beginAtZero:false}
        }
      }
    });
  }
}

function syncWeightGoalToFirebase(){
  if(!firebaseReady||!auth||!auth.currentUser||!db) return;
  db.ref('users/'+auth.currentUser.uid+'/weightGoal').set(weightGoal);
}
function syncSubscriptionsToFirebase(){
  if(!firebaseReady||!auth||!auth.currentUser||!db) return;
  db.ref('users/'+auth.currentUser.uid+'/subscriptions').set(subscriptionsData);
}
function saveWeightGoal(){
  const t = parseFloat(document.getElementById('wg-target')?.value);
  const d = document.getElementById('wg-date')?.value||null;
  if(!t||isNaN(t)) return;
  weightGoal = {target:t, date:d};
  localStorage.setItem('daily_weight_goal', JSON.stringify(weightGoal));
  syncWeightGoalToFirebase();
  renderWeightGoal();
}
function renderWeightGoal(){
  const wrap = document.getElementById('weight-goal-section');
  if(!wrap) return;
  const sorted = [...S.weights].sort((a,b)=>a.date<b.date?-1:1);
  const target = weightGoal.target;
  const targetDate = weightGoal.date||'';
  let progressHTML = '';
  if(sorted.length && target){
    const startW = sorted[0].weight;
    const curW   = sorted[sorted.length-1].weight;
    const range  = target - startW;
    const pct    = range!==0 ? Math.max(0, Math.min(100, (curW - startW) / range * 100)) : 100;
    const rem    = Math.abs(target - curW).toFixed(1);
    let etaStr   = '';
    if(sorted.length >= 2){
      const last4    = sorted.slice(-4);
      const days     = (new Date(last4[last4.length-1].date) - new Date(last4[0].date)) / 86400000;
      const change   = last4[last4.length-1].weight - last4[0].weight;
      if(days > 0 && change !== 0){
        const daysNeeded = (target - curW) / (change / days);
        if(daysNeeded > 0){
          const eta = new Date();
          eta.setDate(eta.getDate() + Math.round(daysNeeded));
          etaStr = eta.toLocaleDateString('en-CA');
        }
      }
    }
    progressHTML = `
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:4px">
          <span>${startW}kg start</span><span>${target}kg goal</span>
        </div>
        <div style="position:relative;height:12px;background:var(--border);border-radius:6px;overflow:visible">
          <div style="height:100%;width:${pct}%;background:var(--header);border-radius:6px;transition:width 0.4s"></div>
          <div style="position:absolute;top:-2px;left:calc(${pct}% - 1.5px);width:3px;height:16px;background:#fff;border-radius:2px;box-shadow:0 0 0 1.5px rgba(0,0,0,0.3)"></div>
        </div>
        <div class="stats-grid" style="margin-top:10px">
          <div class="stat-card"><div class="stat-val">${curW}kg</div><div class="stat-lbl">Current</div></div>
          <div class="stat-card"><div class="stat-val">${rem}kg</div><div class="stat-lbl">Remaining</div></div>
          ${etaStr?`<div class="stat-card"><div class="stat-val" style="font-size:13px">${etaStr}</div><div class="stat-lbl">Est. date</div></div>`:''}
        </div>
      </div>`;
  } else if(!sorted.length){
    progressHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:8px 0">Log weight entries to see progress</div>';
  }
  wrap.innerHTML = `
    <div class="week-section" style="margin-bottom:14px">
      <div class="week-section-title">Weight goal</div>
      <div style="display:flex;gap:8px;margin-bottom:12px;align-items:flex-end">
        <div style="flex:1">
          <div style="font-size:12px;color:var(--muted);margin-bottom:4px">Target (kg)</div>
          <input type="number" id="wg-target" inputmode="decimal" min="30" max="250" step="0.1" placeholder="kg"
            value="${target||''}"
            style="width:100%;height:40px;border:1.5px solid var(--border);border-radius:8px;font-size:16px;font-weight:500;text-align:center;background:var(--card);color:var(--text)">
        </div>
        <div style="flex:1">
          <div style="font-size:12px;color:var(--muted);margin-bottom:4px">Target date</div>
          <input type="date" id="wg-date" value="${targetDate}"
            style="width:100%;height:40px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;padding:0 10px;background:var(--card);color:var(--text)">
        </div>
        <button onclick="saveWeightGoal()"
          style="padding:0 18px;height:40px;background:var(--header);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;flex-shrink:0">Save</button>
      </div>
      ${progressHTML}
    </div>`;
  animateStatVals(wrap);
}

// ── BODY sub-tab (consolidated weight tracker + goal) ─────────────
function renderBody(){
  renderWeightSection();
  renderWeightGoal();
}

// ── TRAINING sub-tab (formerly Progress, minus the weight widgets) ─
function renderTraining(){
  const empty=document.getElementById('train-empty');
  const content=document.getElementById('train-content');
  if(!S.sessions.length){
    if(empty) empty.innerHTML=emptyState('📊','No workout data yet','Complete and save a session to see your progress charts here');
    if(content) content.classList.add('hidden');
    ensureHabitsStatsInProgress();
    return;
  }
  if(empty) empty.innerHTML='';
  if(content) content.classList.remove('hidden');
  const sel = document.getElementById('pr-select');
  const prev = sel.value;
  const exNames = allExerciseNames();
  sel.innerHTML = exNames.map(n=>`<option value="${n}"${n===prev?' selected':''}>${dn(n)}</option>`).join('');
  if(!sel.value && exNames.length) sel.value = exNames[0];
  renderTrainStreak();
  renderVolumeTrend();
  renderWeeklyGrid();
  renderConsistStats();
  renderMuscleBalance();
  renderChart();
  renderPRBoard();
  ensureHabitsStatsInProgress();
}

// ── Training: workout streak (any calendar day with ≥1 saved session) ─
function calcSessionStreak(){
  const dates=[...new Set(S.sessions.map(s=>s.date))].sort();
  if(!dates.length) return {current:0,longest:0};
  // Current: walk back from today; an unfinished today doesn't break a streak that ran
  // through yesterday, so the walk may start one day back.
  const set=new Set(dates);
  const d=localMidnight(getLocalDate());
  if(!set.has(dateStr(d))) d.setDate(d.getDate()-1);
  let current=0;
  while(set.has(dateStr(d))){ current++; d.setDate(d.getDate()-1); }
  let longest=1, run=1;
  for(let i=1;i<dates.length;i++){
    const diff=Math.round((new Date(dates[i]+'T12:00:00')-new Date(dates[i-1]+'T12:00:00'))/864e5);
    if(diff===1){ run++; if(run>longest) longest=run; }
    else run=1;
  }
  return {current, longest:Math.max(longest,current)};
}
function renderTrainStreak(){
  const el=document.getElementById('train-streak-grid'); if(!el) return;
  const {current,longest}=calcSessionStreak();
  const total=[...new Set(S.sessions.map(s=>s.date))].length;
  el.innerHTML=[
    {l:'Current streak',v:'🔥 '+current},
    {l:'Longest streak',v:longest},
    {l:'Days trained',v:total},
  ].map(s=>`<div class="stat-card"><div class="stat-val">${s.v}</div><div class="stat-lbl">${s.l}</div></div>`).join('');
  animateStatVals(el);
}

// ── Training: total volume trend (Σ weight × reps, grouped by week or month) ─
let trainVolRange='week';
let trainVolChart=null;
function setTrainVolRange(range){
  trainVolRange=range;
  ['week','month'].forEach(r=>{
    const btn=document.getElementById('tv-'+r); if(!btn) return;
    const a=r===range;
    btn.style.background=a?'rgba(255,255,255,0.3)':'transparent';
    btn.style.color=a?'#fff':'rgba(255,255,255,0.65)';
  });
  renderVolumeTrend();
}
function sessionVolume(s){
  let vol=0;
  (s.exercises||[]).forEach(ex=>(ex.sets||[]).forEach(set=>{
    if(set.weight>0&&set.reps>0) vol+=set.weight*set.reps;
  }));
  return vol;
}
function mondayKeyOf(ds){
  const d=localMidnight(ds);
  const day=d.getDay();
  d.setDate(d.getDate()-(day===0?6:day-1));
  return dateStr(d);
}
function renderVolumeTrend(){
  const wrap=document.getElementById('train-vol-wrap'); if(!wrap) return;
  if(trainVolChart){ trainVolChart.destroy(); trainVolChart=null; }
  const groups={};
  S.sessions.forEach(s=>{
    const key=trainVolRange==='week'?mondayKeyOf(s.date):s.date.substring(0,7);
    groups[key]=(groups[key]||0)+sessionVolume(s);
  });
  const keys=Object.keys(groups).sort().slice(-12);
  if(keys.length<2){
    wrap.innerHTML='<div style="text-align:center;color:var(--muted);font-size:13px;padding:20px 0">Not enough data yet — keep logging sessions.</div>';
    return;
  }
  const labels=keys.map(k=>trainVolRange==='week'
    ? new Date(k+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short'})
    : new Date(k+'-01T12:00:00').toLocaleDateString('en-AU',{month:'short',year:'2-digit'}));
  wrap.innerHTML='<canvas id="train-vol-chart"></canvas>';
  const ctx=document.getElementById('train-vol-chart'); if(!ctx) return;
  const {gc,tc}=budChartGridColors();
  const accent=(getComputedStyle(document.documentElement).getPropertyValue('--accent')||'#FF6B35').trim();
  const accentRgb=(getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb')||'255,107,53').trim();
  trainVolChart=new Chart(ctx,{
    type:'bar',
    data:{
      labels,
      datasets:[{label:'Volume',data:keys.map(k=>Math.round(groups[k])),backgroundColor:'rgba('+accentRgb+',0.6)',borderColor:accent,borderWidth:1,borderRadius:6,maxBarThickness:48}]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>c.parsed.y.toLocaleString()+' kg lifted'}}
      },
      scales:{
        x:{grid:{display:false},ticks:{color:tc,font:{size:11},maxTicksLimit:12}},
        y:{grid:{color:gc},ticks:{color:tc,font:{size:11},callback:v=>(v>=1000?(v/1000)+'t':v+'kg')},beginAtZero:true}
      }
    }
  });
}

// ── Training: muscle-group balance (sets per group, last 30 days) ──
const MUSCLE_COLOURS={chest:'#3B82F6',back:'#8B5CF6',shoulders:'#F59E0B',arms:'#EC4899',legs:'#EF4444',core:'#52B788',other:'#94a3b8'};
function renderMuscleBalance(){
  const wrap=document.getElementById('train-muscle-wrap'); if(!wrap) return;
  const byName={};
  loadExerciseLib().forEach(e=>{ byName[e.name]=e.muscle; });
  const cutoff=localMidnight(getLocalDate());
  cutoff.setDate(cutoff.getDate()-29);
  const cutoffStr=dateStr(cutoff);
  const counts={chest:0,back:0,shoulders:0,arms:0,legs:0,core:0,other:0};
  S.sessions.forEach(s=>{
    if(s.date<cutoffStr) return;
    (s.exercises||[]).forEach(ex=>{
      const m=byName[ex.name]||libGuessMuscle(ex.name);
      const n=(ex.sets||[]).filter(set=>(set.type?set.type!=='warmup':true)&&(set.weight>0||set.reps>0)).length;
      counts[counts[m]!==undefined?m:'other']+=n;
    });
  });
  const rows=Object.keys(counts).filter(m=>counts[m]>0||m!=='other');
  const max=Math.max(1,...rows.map(m=>counts[m]));
  const total=rows.reduce((a,m)=>a+counts[m],0);
  if(!total){
    wrap.innerHTML='<div style="text-align:center;color:var(--muted);font-size:13px;padding:8px 0">No sets logged in the last 30 days.</div>';
    return;
  }
  wrap.innerHTML=rows.map(m=>{
    const pct=Math.round(counts[m]/max*100);
    const label=m.charAt(0).toUpperCase()+m.slice(1);
    return '<div class="muscle-bar-row">'+
      '<div class="muscle-bar-label">'+label+'</div>'+
      '<div class="muscle-bar-track"><div class="muscle-bar-fill" style="width:'+pct+'%;background:'+MUSCLE_COLOURS[m]+'"></div></div>'+
      '<div class="muscle-bar-count">'+counts[m]+' set'+(counts[m]!==1?'s':'')+'</div>'+
    '</div>';
  }).join('');
}

// Display colour for a split day in the consistency grid + legend. Legacy day types keep
// their exact original grid colours; custom days fall back to their own barColor.
function typeGridColor(t){
  const map={'chest-back':'#E74C3C','shoulders-arms':'#3b82f6','legs':'#52B788'};
  if(t&&map[t.colorKey]) return map[t.colorKey];
  return (t&&t.barColor) || '#94a3b8';
}
function renderWeeklyGrid(targetId){
  // Map each session date → the colour of its logged day type (matched by name so old
  // sessions still colour correctly). Unknown/renamed types show as a plain filled cell.
  const typeByName={};
  splitTypes().forEach(t=>{ typeByName[t.name]=t; });
  const sessionMap = {};
  S.sessions.forEach(s=>{ sessionMap[s.date] = typeByName[s.sessionType] ? typeGridColor(typeByName[s.sessionType]) : '#94a3b8'; });

  const todayStr = getLocalDate();
  const today = localMidnight(todayStr);
  const dow = today.getDay();
  const daysToMon = dow===0?6:dow-1;
  const thisMonday = new Date(today); thisMonday.setDate(today.getDate()-daysToMon);
  const startDate = new Date(thisMonday); startDate.setDate(thisMonday.getDate()-49);

  const DAY_LABELS=['M','T','W','T','F','S','S'];
  let html=`<div class="week-section">
    <div class="week-section-title">8-week consistency</div>
    <div class="week-section-sub">Each square = one day · coloured = session logged</div>
    <div class="week-day-labels"><div></div>${DAY_LABELS.map(d=>`<div class="week-day-lbl">${d}</div>`).join('')}</div>`;

  for(let w=0;w<8;w++){
    const weekStart=new Date(startDate); weekStart.setDate(startDate.getDate()+w*7);
    const lbl=weekStart.toLocaleDateString('en-AU',{day:'numeric',month:'short'});
    html+=`<div class="week-row"><div class="week-row-lbl">${lbl}</div>`;
    for(let d=0;d<7;d++){
      const cellDate=new Date(weekStart); cellDate.setDate(weekStart.getDate()+d);
      const ds=dateStr(cellDate);
      const col=sessionMap[ds]||'';
      const isToday=ds===todayStr?' today':'';
      const styles=[];
      if(cellDate>today) styles.push('opacity:0.25');
      if(col) styles.push('background:'+col);
      const styleAttr=styles.length?` style="${styles.join(';')}"`:'';
      html+=`<div class="day-cell${isToday}"${styleAttr}></div>`;
    }
    html+='</div>';
  }
  // Legend: one entry per unique day type in the split, in schedule order.
  const seen=new Set();
  const legendTypes=[];
  splitSchedule().forEach(idx=>{ const t=splitTypes()[idx]; if(t&&!seen.has(t.id)){ seen.add(t.id); legendTypes.push(t); } });
  html+=`<div class="week-legend">${legendTypes.map(t=>
    `<div class="legend-item"><div class="legend-dot" style="background:${typeGridColor(t)}"></div>${(t.name||'').replace(/</g,'&lt;')}</div>`
  ).join('')}</div></div>`;
  const el=document.getElementById(targetId||'week-grid-wrap');
  if(el) el.innerHTML=html;
}

// ── Stat count-up animation ──
function animateCount(element,targetValue,duration=600){
  const decimals=(String(targetValue).split('.')[1]||'').length;
  const suffix=element.dataset.suffix||'';
  const start=performance.now();
  function tick(now){
    const t=Math.min((now-start)/duration,1);
    const eased=1-Math.pow(1-t,3);
    const v=targetValue*eased;
    element.textContent=(decimals?v.toFixed(decimals):String(Math.round(v)))+suffix;
    if(t<1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
function animateStatVals(container){
  if(!container) return;
  container.querySelectorAll('.stat-val').forEach(el=>{
    const m=el.textContent.match(/^(\d+(?:\.\d+)?)(.*)$/s);
    if(!m||!parseFloat(m[1])) return;
    el.dataset.suffix=m[2];
    animateCount(el,parseFloat(m[1]));
  });
}

function renderConsistStats(){
  const today=localMidnight(getLocalDate());
  const dow=today.getDay(), daysToMon=dow===0?6:dow-1;
  const thisMonday=new Date(today); thisMonday.setDate(today.getDate()-daysToMon);
  const fourWeeksAgo=new Date(today); fourWeeksAgo.setDate(today.getDate()-27);

  const thisWeek=S.sessions.filter(s=>{const d=new Date(s.date+'T12:00:00');return d>=thisMonday;}).length;
  const last4=S.sessions.filter(s=>{const d=new Date(s.date+'T12:00:00');return d>=fourWeeksAgo;}).length;
  const durations=S.sessions.filter(s=>s.duration>0).map(s=>s.duration);
  const avgDur=durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):null;

  const perWeek=scheduleLen();
  document.getElementById('consist-stats').innerHTML=[
    {l:'This week',v:`${thisWeek}/${perWeek}`},
    {l:'Last 4 weeks',v:`${last4}/${perWeek*4}`},
    {l:'Avg session',v:avgDur?`${avgDur} min`:'—'},
  ].map(s=>`<div class="stat-card"><div class="stat-val">${s.v}</div><div class="stat-lbl">${s.l}</div></div>`).join('');
  animateStatVals(document.getElementById('consist-stats'));
}

function renderChart(){
  const exName = document.getElementById('pr-select').value;
  const pts = getPoints(exName);

  const pr = getPR(exName);
  const totalSets = S.sessions.reduce((acc,s)=>{
    const ex=s.exercises.find(e=>e.name===exName);
    return acc+(ex?ex.sets.length:0);
  },0);
  const sessions = S.sessions.filter(s=>s.exercises.some(e=>e.name===exName)).length;
  document.getElementById('stats-grid').innerHTML = [
    {l:'Sessions',v:sessions||'—'},
    {l:'Total sets',v:totalSets||'—'},
    {l:'Best weight',v:pr?pr+'kg':'—'},
  ].map(s=>`<div class="stat-card"><div class="stat-val">${s.v}</div><div class="stat-lbl">${s.l}</div></div>`).join('');
  animateStatVals(document.getElementById('stats-grid'));

  if(S.chart){ S.chart.destroy(); S.chart=null; }
  const ctx = document.getElementById('prog-chart');

  if(!pts.length){
    ctx.style.display='none';
    const msg=ctx.parentElement.querySelector('.no-data-msg');
    if(!msg){
      const p=document.createElement('p');
      p.className='no-data-msg';
      p.style.cssText='text-align:center;color:var(--muted);padding:20px 0;font-size:14px';
      p.textContent='No data yet — log some sessions first';
      ctx.parentElement.appendChild(p);
    }
    return;
  }

  ctx.style.display='';
  const nm=ctx.parentElement.querySelector('.no-data-msg');
  if(nm) nm.remove();

  const isDark = S.theme==='dark';
  const gc=isDark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.06)';
  const tc=isDark?'#888':'#94a3b8';

  S.chart = new Chart(ctx,{
    type:'line',
    data:{
      labels:pts.map(p=>fmtDate(p.date)),
      datasets:[{
        data:pts.map(p=>p.weight),
        borderColor:'#52B788',backgroundColor:'rgba(82,183,136,0.08)',
        borderWidth:2.5,pointRadius:5,pointBackgroundColor:'#52B788',
        fill:true,tension:0.3
      }]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.parsed.y+'kg'}}},
      scales:{
        x:{grid:{color:gc},ticks:{color:tc,font:{size:11},maxTicksLimit:6}},
        y:{grid:{color:gc},ticks:{color:tc,font:{size:11},callback:v=>v+'kg'},beginAtZero:false}
      }
    }
  });
}

function renderPRBoard(){
  // Rows tap through to the per-exercise detail view. After the split sections, an "Other
  // logged" section lists every stored name found in session history that ISN'T in the
  // current split — previously those (removed/renamed program exercises, session-only adds)
  // were invisible here even though their history exists.
  // Key rows by the SWAPPED name (dn) — that's what sessions are now stored under, so the
  // displayed name, its PR, and the history it taps into all line up. Anything in history
  // not matching a current (swapped) split name — including a swapped exercise's OWN
  // pre-swap sessions under its original name — falls into "Other logged".
  const inSplit=new Set(splitTypes().flatMap(t=>(t.exercises||[]).map(e=>dn(e.name))));
  const others=[...new Set(S.sessions.flatMap(s=>(s.exercises||[]).map(e=>e.name)))]
    .filter(n=>!inSplit.has(n)).sort();
  document.getElementById('pr-board').innerHTML = splitTypes().map(t=>`
    <div class="pr-board-section">
      <div class="pr-section-label">${t.name}</div>
      ${t.exercises.map(ex=>{
        const nm=dn(ex.name);
        const pr=getPR(nm);
        return `<div class="pr-row" data-ex="${_catEsc(nm)}" onclick="openExerciseDetail(this.dataset.ex)" style="cursor:pointer">
          <div class="pr-ex-name">${_catEscHtml(nm)}</div>
          <div class="pr-val${pr?'':' none'}">${pr?pr+'kg':'—'}</div>
        </div>`;
      }).join('')}
    </div>`).join('')+
    (others.length?`
    <div class="pr-board-section">
      <div class="pr-section-label">Other logged</div>
      ${others.map(n=>{
        const pr=getPR(n);
        return `<div class="pr-row" data-ex="${_catEsc(n)}" onclick="openExerciseDetail(this.dataset.ex)" style="cursor:pointer">
          <div class="pr-ex-name">${_catEscHtml(dn(n))}</div>
          <div class="pr-val${pr?'':' none'}">${pr?pr+'kg':'—'}</div>
        </div>`;
      }).join('')}
    </div>`:'');
}

// ── Per-exercise history detail ───────────────────────────────────
// saveSession now records each exercise under its SWAPPED name (dn) — the movement actually
// performed — so a session's stored name is authoritative and history is keyed literally.
// This view filters sessions by exact name match, so e.g. "Dumbbell Press" shows only sets
// logged as Dumbbell Press. Sessions saved before this exercise was swapped remain under the
// original name (a small breadcrumb banner links a currently-swapped exercise to its new
// name); nothing is silently merged or dropped.
let _exDetailChart=null;
function openExerciseDetail(name){
  const v=document.getElementById('view-exercise-detail'); if(!v) return;
  v.style.display='block';
  v.style.left=window.innerWidth>=1024?'260px':'0';
  v.scrollTop=0;
  renderExerciseDetail(name);
}
function closeExerciseDetail(){
  const v=document.getElementById('view-exercise-detail'); if(v){ v.style.display='none'; v.style.left='0'; }
  if(_exDetailChart){ _exDetailChart.destroy(); _exDetailChart=null; }
}
function renderExerciseDetail(name){
  const titleEl=document.getElementById('ex-detail-title'); if(titleEl) titleEl.textContent=dn(name);
  const wrap=document.getElementById('ex-detail-content'); if(!wrap) return;
  if(_exDetailChart){ _exDetailChart.destroy(); _exDetailChart=null; }

  const hist=S.sessions.filter(s=>(s.exercises||[]).some(e=>e.name===name)); // chronological
  const pr=getPR(name);
  let prDate='';
  hist.forEach(s=>{
    if(prDate) return;
    const e=(s.exercises||[]).find(x=>x.name===name);
    if(e&&pr>0&&(e.sets||[]).some(x=>(parseFloat(x.weight)||0)>=pr)) prDate=s.date;
  });

  // History is now literal: sessions are stored under the name actually performed (swaps log
  // under the swapped name), so this view shows only exact matches for `name`. The one place
  // a breadcrumb helps is a currently-swapped exercise — its NEW sessions are recorded under
  // the replacement, so point the user there (older, pre-swap sessions still show here).
  const note=(txt,extra)=>'<div style="font-size:12px;font-weight:600;color:var(--amber-dark);background:var(--amber-bg);border:1px solid var(--amber-border);border-radius:10px;padding:9px 12px;margin-bottom:10px;line-height:1.45">'+txt+(extra||'')+'</div>';
  let banners='';
  const swappedTo=S.swaps[name];
  if(swappedTo){
    banners+=note('🔄 Currently swapped to “'+_catEscHtml(swappedTo)+'”. New sessions are logged under that name. ',
      '<span data-ex="'+_catEsc(swappedTo)+'" onclick="openExerciseDetail(this.dataset.ex)" style="text-decoration:underline;cursor:pointer">View “'+_catEscHtml(swappedTo)+'” history</span>');
  }

  const lastDone=hist.length?hist[hist.length-1].date:null;
  const statCard=
    '<div class="card" style="display:flex;text-align:center;padding:16px 8px">'+
      '<div style="flex:1"><div style="font-family:var(--font-num);font-size:24px;font-weight:800;color:var(--accent-text)">'+(pr?pr+'kg':'—')+'</div>'+
        '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-top:3px">PR'+(prDate?' · '+fmtDate(prDate):'')+'</div></div>'+
      '<div style="width:1px;background:var(--border)"></div>'+
      '<div style="flex:1"><div style="font-family:var(--font-num);font-size:24px;font-weight:800">'+hist.length+'</div>'+
        '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-top:3px">Sessions</div></div>'+
      '<div style="width:1px;background:var(--border)"></div>'+
      '<div style="flex:1"><div style="font-family:var(--font-num);font-size:24px;font-weight:800">'+(lastDone?fmtDate(lastDone):'—')+'</div>'+
        '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-top:3px">Last done</div></div>'+
    '</div>';

  const pts=getPoints(name); // reused: max working weight per session, chronological
  const chartCard=pts.length>=2
    ? '<div class="card" style="padding:14px 16px"><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);margin-bottom:8px">📈 '+(_secsNames.has(name)?'Longest hold':'Top set weight')+'</div><canvas id="ex-detail-chart" style="max-height:220px"></canvas></div>'
    : (pts.length===1?'<div class="card" style="padding:14px 16px;text-align:center;color:var(--muted);font-size:13px">One session logged — the chart appears from the second.</div>':'');

  const histList=hist.length
    ? [...hist].reverse().map(s=>{
        const e=(s.exercises||[]).find(x=>x.name===name);
        const _timed=_secsNames.has(name);
        const setLines=(e.sets||[]).map((x,si)=>{
          const lbl=(x.type==='warmup'?'W':'Set '+(si+1));
          const load=x.weight?x.weight+'kg':(_timed?'':'—');
          const val=_timed?((load?load+' for ':'')+fmtSetAmount(x.reps,'secs')):(load+' × '+(x.reps||'—'));
          return '<div class="session-set-line">'+lbl+': '+val+'</div>';
        }).join('');
        return '<div style="padding:10px 0;border-bottom:1px solid var(--border)">'+
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'+
            '<span style="font-size:13px;font-weight:700">'+fmtDate(s.date)+'</span>'+
            '<span style="font-size:11px;color:var(--muted)">'+_catEscHtml(s.sessionType||'')+'</span>'+
          '</div>'+setLines+'</div>';
      }).join('')
    : '<div style="padding:18px 0;text-align:center;color:var(--muted);font-size:13px">No logged sessions for this exercise yet.</div>';

  wrap.innerHTML=
    banners+
    statCard+
    chartCard+
    '<div class="card"><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);margin-bottom:4px">🗂 Every session</div>'+histList+'</div>';

  if(pts.length>=2){
    const ctx=document.getElementById('ex-detail-chart');
    if(ctx&&typeof Chart!=='undefined'){
      const {gc,tc}=budChartGridColors();
      const accent=(getComputedStyle(document.documentElement).getPropertyValue('--accent')||'#FF6B35').trim();
      _exDetailChart=new Chart(ctx,{
        type:'line',
        data:{ labels:pts.map(p=>p.date.substring(5)),
          datasets:[{label:'Top set (kg)',data:pts.map(p=>p.weight),borderColor:accent,backgroundColor:'transparent',borderWidth:2.5,pointRadius:3,pointBackgroundColor:accent,tension:0.3}] },
        options:{ responsive:true,maintainAspectRatio:false,
          plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>c.parsed.y+'kg'}} },
          scales:{ x:{grid:{color:gc},ticks:{color:tc,font:{size:10},maxTicksLimit:8}},
                   y:{grid:{color:gc},ticks:{color:tc,font:{size:10},callback:v=>v+'kg'},beginAtZero:false} } }
      });
    }
  }
}

// ── SETTINGS view ─────────────────────────────────────────────────
function toggleSettingsSection(key){
  if(settingsCollapsed[key]) delete settingsCollapsed[key];
  else settingsCollapsed[key]=1;
  localStorage.setItem('daily_settings_collapsed',JSON.stringify(settingsCollapsed));
  syncSettingsCollapsedToFirebase();
  const c=!!settingsCollapsed[key];
  const body=document.getElementById('ssc-'+key);
  const chev=document.getElementById('sc-'+key);
  const hdr=document.getElementById('sh-'+key);
  if(body) body.style.display=c?'none':'';
  if(chev) chev.style.transform=c?'rotate(-90deg)':'rotate(0deg)';
  if(hdr) hdr.style.marginBottom=c?'0':'14px';
}
function applySettingsCollapsed(){
  ['income','savings-target','fixed','variable'].forEach(key=>{
    if(!settingsCollapsed[key]) return;
    const body=document.getElementById('ssc-'+key);
    const chev=document.getElementById('sc-'+key);
    const hdr=document.getElementById('sh-'+key);
    if(body) body.style.display='none';
    if(chev) chev.style.transform='rotate(-90deg)';
    if(hdr) hdr.style.marginBottom='0';
  });
}
function settingsProfileCardTap(){
  const user=(firebaseReady&&auth)?auth.currentUser:null;
  if(user){ openSettingsSection('account'); } else { handleAuthUI(); }
}
function renderSettingsTopCard(){
  const av=document.getElementById('stg-avatar');
  const nm=document.getElementById('stg-name');
  const em=document.getElementById('stg-email');
  const sy=document.getElementById('stg-sync');
  if(!av) return;
  const user=(firebaseReady&&auth)?auth.currentUser:null;
  if(user){
    const photo=user.photoURL;
    const uname=user.displayName||profileData.name||'Google user';
    av.classList.toggle('stg-avatar-grad',!photo);
    av.innerHTML=photo?'<img src="'+photo+'" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover">':'<span style="font-size:20px;font-weight:800;color:#fff">'+uname.charAt(0).toUpperCase()+'</span>';
    if(nm) nm.textContent=uname;
    if(em) em.textContent=user.email||'';
    if(sy){ sy.textContent='● Synced to cloud'; sy.style.color='var(--success)'; }
  } else {
    const name=profileData.name||S.personalInfo?.name||'';
    av.classList.toggle('stg-avatar-grad',!!name);
    av.innerHTML=name?'<span style="font-size:20px;font-weight:800;color:#fff">'+name.charAt(0).toUpperCase()+'</span>':'<span style="font-size:20px;color:var(--muted)">?</span>';
    if(nm) nm.textContent=name||'Not signed in';
    if(em) em.textContent='';
    if(sy){ sy.textContent='Tap to sign in'; sy.style.color='var(--muted)'; }
  }
  updateDesktopSidebar();
}
function updateDesktopSidebar(){
  const av=document.querySelector('.ds-av');
  const nm=document.querySelector('.ds-name');
  const sy=document.querySelector('.ds-sync');
  if(!av) return;
  const user=(firebaseReady&&auth)?auth.currentUser:null;
  const name=(user&&user.displayName)||profileData.name||S.personalInfo?.name||'';
  const initials=name?name.trim().split(/\s+/).map(w=>w.charAt(0).toUpperCase()).slice(0,2).join(''):'?';
  av.textContent=initials;
  if(nm) nm.textContent=name||'Not signed in';
  if(sy) sy.textContent=user?'Synced':'Local only';
}
// Every settings item opens as a genuine full-screen pushed view: the target section div is
// moved out of its hidden store into #view-settings-detail (mirrors the split/budget editor
// overlays), and moved back on close. Desktop and mobile behave identically (the overlay is
// simply offset past the sidebar on desktop) — so there's no "stacked column" branch to break.
const SETTINGS_SECTION_KEYS=['account','health','habits','appearance','homelayout','export'];
const SETTINGS_TITLES={account:'Account',health:'Health',habits:'Habits',appearance:'Appearance',homelayout:'Home Layout',export:'Export'};
let _activeSettingsKey=null;
function openSettingsSection(key){
  const overlay=document.getElementById('view-settings-detail');
  const content=document.getElementById('settings-detail-content');
  const store=document.getElementById('settings-sections-store');
  const sec=document.getElementById('settings-'+key+'-section');
  if(!overlay||!content||!sec) return;
  // Return a previously-mounted section to the store, then mount the requested one.
  if(_activeSettingsKey && _activeSettingsKey!==key){
    const prev=document.getElementById('settings-'+_activeSettingsKey+'-section');
    if(prev){ prev.classList.add('hidden'); if(store) store.appendChild(prev); }
  }
  content.appendChild(sec);
  sec.classList.remove('hidden');
  _activeSettingsKey=key;
  const t=document.getElementById('settings-detail-title'); if(t) t.textContent=SETTINGS_TITLES[key]||key;
  // Populate each section's dynamic content (unchanged from before).
  if(key==='account') renderAccountSection();
  if(key==='health'){
    const pi=S.personalInfo;
    ['name','age','sex','height','weight','activity'].forEach(f=>{
      const el=document.getElementById('pi-'+f); if(el&&pi[f]!=null) el.value=pi[f];
    });
    renderTDEESection();
  }
  if(key==='habits') renderHabitsEditModal();
  if(key==='appearance'){ const th=document.getElementById('theme-toggle'); if(th) th.checked=S.theme==='dark'; renderAccentModeRow(); renderDayColorPickers(); }
  if(key==='homelayout') renderHomeLayoutSection();
  overlay.style.display='block';
  overlay.style.left=window.innerWidth>=1024?'260px':'0';
  overlay.scrollTop=0;
}
// ── Desktop quick-settings mini list ──────────────────────────────
// Tucked under the sidebar Settings item (desktop only — it lives inside
// #desktop-sidebar, which is display:none under 1024px), revealed via the chevron in
// .ds-settings-row. The Settings item itself always navigates straight to the full
// Settings screen; the chevron independently expands/collapses this list. Open/closed
// state persists across reloads via localStorage.
function renderQuickSettingsMenu(){
  const menu=document.getElementById('quick-settings-menu'); if(!menu) return;
  // Same shortcuts as the mobile hamburger's Settings group (MENU_SECTIONS + "All
  // settings"), so the desktop dropdown reaches the same destinations. Dark mode / Day
  // colours used to duplicate their own toggle switches here; both are one click away via
  // the Appearance link, so the dropdown now just points there instead of maintaining a
  // second copy of controls that already live in Settings.
  menu.innerHTML=
    '<button class="ds-item" onclick="openMenuSection(\'\')"><span>All settings</span></button>'+
    MENU_SECTIONS.map(s=>'<button class="ds-item" onclick="openMenuSection(\''+s.id+'\')"><span>'+s.label+'</span></button>').join('');
}
function setQuickSettingsOpen(open){
  const menu=document.getElementById('quick-settings-menu');
  const btn=document.querySelector('.ds-caret-btn');
  if(!menu||!btn) return;
  menu.classList.toggle('open', open);
  btn.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', open?'true':'false');
  localStorage.setItem('daily_qs_open', open?'1':'0');
}
function toggleQuickSettings(e){
  if(e) e.stopPropagation();
  setQuickSettingsOpen(!document.getElementById('quick-settings-menu').classList.contains('open'));
}
function restoreQuickSettings(){
  renderQuickSettingsMenu();
  setQuickSettingsOpen(localStorage.getItem('daily_qs_open')==='1');
}

function closeSettingsSection(){
  const overlay=document.getElementById('view-settings-detail');
  if(overlay){ overlay.style.display='none'; overlay.style.left='0'; }
  // Move the mounted section back to its hidden store so the overlay is left empty/clean.
  if(_activeSettingsKey){
    const store=document.getElementById('settings-sections-store');
    const sec=document.getElementById('settings-'+_activeSettingsKey+'-section');
    if(sec){ sec.classList.add('hidden'); if(store) store.appendChild(sec); }
    _activeSettingsKey=null;
  }
}
function saveProfileSection(){
  profileData.name=document.getElementById('profile-name')?.value.trim()||'';
  localStorage.setItem('daily_profile',JSON.stringify(profileData));
  syncProfileToFirebase();
  updateHeaderAvatar();
  renderSettingsTopCard();
  const btn=document.getElementById('profile-save-btn');
  if(btn){ btn.textContent='Saved ✓'; btn.style.background='var(--accent)'; setTimeout(()=>{ btn.textContent='Save'; btn.style.background=''; },2000); }
}
// The separate subscriptions list was retired: it was never actually wired into the budget,
// and each entry is now a real fixed category with its own billing cycle (see
// migrateSubscriptionsToFixedOnce). daily_subscriptions is left in storage, unread.

function renderInstallCard(){
  const wrap = document.getElementById('stg-install-card');
  if(!wrap) return;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let content;
  if(isStandalone){
    content = '<span style="font-size:13px;color:var(--muted)">✅ Already installed</span>';
  } else if(isIOS){
    content = '<p style="font-size:13px;color:var(--muted);margin:0">Tap the Share button <strong style="color:var(--text)">□↑</strong> in Safari, then tap <strong style="color:var(--text)">"Add to Home Screen"</strong></p>';
  } else if(deferredInstallPrompt){
    content = '<button onclick="triggerInstallPrompt()" style="width:100%;padding:10px;border-radius:10px;border:none;background:var(--accent);color:#fff;font-size:13px;font-weight:600;cursor:pointer">Install App</button>';
  } else {
    wrap.style.display='none'; return;
  }
  wrap.style.display='';
  wrap.innerHTML=`<div class="settings-card"><div style="font-size:14px;font-weight:700;margin-bottom:10px">📲 Add to Home Screen</div>${content}</div>`;
}
function triggerInstallPrompt(){
  if(!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.then(()=>{ deferredInstallPrompt=null; renderInstallCard(); });
}
function renderSettings(){
  // Entering the Settings tab shows the grouped list; ensure any open detail overlay is closed.
  closeSettingsSection();
  renderSettingsTopCard(); // profile card avatar/name/sync state
  renderInstallCard();
}

// Merged "Account" section — sign-in + Profile (name) + Reminders + Advanced (reset
// onboarding), each under its own card/sub-heading so it reads as grouped rows, not a wall.
function renderAccountSection(){
  const wrap=document.getElementById('settings-account-section'); if(!wrap) return;
  const user=(firebaseReady&&auth)?auth.currentUser:null;
  let signIn;
  if(user){
    const photo=user.photoURL;
    const uname=user.displayName||'Google user';
    const email=user.email||'';
    const avatar=photo
      ?'<img src="'+photo+'" referrerpolicy="no-referrer" style="width:46px;height:46px;border-radius:50%;object-fit:cover;flex-shrink:0">'
      :'<div style="width:46px;height:46px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#fff;flex-shrink:0">'+uname.charAt(0).toUpperCase()+'</div>';
    signIn=
      '<div class="settings-card">'+
        '<div class="settings-card-title" style="cursor:default">Account</div>'+
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">'+
          avatar+
          '<div style="min-width:0">'+
            '<div style="font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+uname+'</div>'+
            '<div style="font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+email+'</div>'+
            '<div style="font-size:12px;color:var(--success);margin-top:2px">● Synced to cloud</div>'+
          '</div>'+
        '</div>'+
        '<button onclick="handleAuthUI()" style="width:100%;padding:10px;border-radius:10px;border:1.5px solid var(--border);background:transparent;color:var(--muted);font-size:13px;font-weight:600;cursor:pointer">Sign out</button>'+
      '</div>';
  } else {
    signIn=
      '<div class="settings-card">'+
        '<div class="settings-card-title" style="cursor:default">Account</div>'+
        '<div style="font-size:13px;color:var(--muted);margin-bottom:14px">Not signed in — sign in to sync your data across devices.</div>'+
        '<button onclick="handleAuthUI()" style="width:100%;padding:10px;border-radius:10px;border:none;background:#4285f4;color:#fff;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">'+
          '<svg viewBox="0 0 24 24" style="width:16px;height:16px;flex-shrink:0"><path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>'+
          'Sign in with Google'+
        '</button>'+
      '</div>';
  }
  const profileCard=
    '<div class="settings-card">'+
      '<div class="settings-card-title" style="cursor:default">Profile</div>'+
      '<div class="settings-field">'+
        '<label>Your name</label>'+
        '<input type="text" id="profile-name" placeholder="e.g. Francois" value="'+(profileData.name||'').replace(/"/g,'&quot;')+'" autocomplete="name">'+
      '</div>'+
      '<button class="settings-save-btn" id="profile-save-btn" onclick="saveProfileSection()" style="margin-top:4px">Save</button>'+
    '</div>';
  const remindersCard=
    '<div class="settings-card">'+
      '<div class="settings-card-title" style="cursor:default">Reminders</div>'+
      '<div id="reminders-inner"></div>'+
    '</div>';
  const advancedCard=
    '<div class="settings-card">'+
      '<div class="settings-card-title" style="cursor:default;font-size:13px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Advanced</div>'+
      '<button onclick="resetOnboarding()" style="width:100%;padding:11px;border-radius:8px;border:1.5px solid var(--border);background:transparent;color:var(--muted);font-size:13px;font-weight:600;cursor:pointer">Reset onboarding</button>'+
    '</div>';
  wrap.innerHTML=signIn+profileCard+remindersCard+advancedCard;
  renderRemindersSection();
  renderSettingsTopCard();
}

function savePersonalInfo(){
  S.personalInfo = {
    name:     document.getElementById('pi-name').value.trim(),
    age:      parseInt(document.getElementById('pi-age').value)||null,
    sex:      document.getElementById('pi-sex').value,
    height:   parseFloat(document.getElementById('pi-height').value)||null,
    weight:   parseFloat(document.getElementById('pi-weight').value)||null,
    activity: document.getElementById('pi-activity').value,
    goal:     S.personalInfo.goal||'maintain'
  };
  localStorage.setItem('wt_personalinfo', JSON.stringify(S.personalInfo));
  renderTDEESection();
  renderCalorieLog();

  const btn = document.getElementById('pi-save-btn');
  if(btn){
    btn.textContent='✓ Saved!'; btn.style.background='var(--accent)';
    setTimeout(()=>{ btn.textContent='Save info'; btn.style.background=''; }, 1500);
  }
}

function calcGoalCals(){
  const pi = S.personalInfo;
  if(!pi.age||!pi.height||!pi.weight||!pi.sex) return null;
  const bmr = pi.sex==='female'
    ? (10*pi.weight)+(6.25*pi.height)-(5*pi.age)-161
    : (10*pi.weight)+(6.25*pi.height)-(5*pi.age)+5;
  const activity = parseFloat(pi.activity)||1.55;
  const tdee = Math.round(bmr*activity);
  const goal = pi.goal||'maintain';
  return {tdee, cut:tdee-500, maintain:tdee, bulk:tdee+300, goal};
}

function selectGoal(goal){
  S.personalInfo.goal = goal;
  localStorage.setItem('wt_personalinfo', JSON.stringify(S.personalInfo));
  renderTDEESection();
  renderCalorieLog();
  if(document.getElementById('calorie-overlay')?.style.display==='flex') renderCalorieOverlay();
}

function renderTDEESection(){
  const wrap = document.getElementById('tdee-section');
  if(!wrap) return;
  const c = calcGoalCals();
  if(!c){
    wrap.innerHTML=`<div style="font-size:13px;color:var(--muted);text-align:center;padding:14px 0">Fill in your details above and tap Save to see calorie targets.</div>`;
    return;
  }
  const g = c.goal;
  wrap.innerHTML=`
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
      <div style="font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Daily calorie targets</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px">TDEE: ${c.tdee} kcal · tap a goal to track it</div>
      <div class="tdee-grid">
        <div class="tdee-card" style="color:var(--danger);border-color:${g==='cut'?'var(--danger)':'var(--border)'}" onclick="selectGoal('cut')">
          <div class="tdee-card-val">${c.cut}</div>
          <div class="tdee-card-lbl">Cut</div>
          ${g==='cut'?'<div class="tdee-card-active" style="color:var(--danger)">✓ Active</div>':''}
        </div>
        <div class="tdee-card" style="color:var(--success);border-color:${g==='maintain'?'var(--success)':'var(--border)'}" onclick="selectGoal('maintain')">
          <div class="tdee-card-val">${c.maintain}</div>
          <div class="tdee-card-lbl">Maintain</div>
          ${g==='maintain'?'<div class="tdee-card-active" style="color:var(--success)">✓ Active</div>':''}
        </div>
        <div class="tdee-card" style="color:var(--blue);border-color:${g==='bulk'?'var(--blue)':'var(--border)'}" onclick="selectGoal('bulk')">
          <div class="tdee-card-val">${c.bulk}</div>
          <div class="tdee-card-lbl">Bulk</div>
          ${g==='bulk'?'<div class="tdee-card-active" style="color:var(--blue)">✓ Active</div>':''}
        </div>
      </div>
    </div>`;
}

// ── Calorie log ────────────────────────────────────────────────────
function renderCalorieLog(){
  const wrap = document.getElementById('calorie-log-inner');
  if(!wrap) return;

  // Check for midnight reset
  const today = getLocalDate();
  if(S.dailyLog.date !== today){
    S.dailyLog = {date:today, entries:[]};
    persistDailyLog();
  }

  const c = calcGoalCals();
  const goalCals = c ? (c.goal==='cut'?c.cut:c.goal==='bulk'?c.bulk:c.maintain) : null;
  const total = S.dailyLog.entries.reduce((a,e)=>a+e.kcal, 0);
  const pct = goalCals ? Math.min(110, Math.round(total/goalCals*100)) : 0;
  const barColor = pct>100?'var(--danger)':pct>80?'var(--warn)':'var(--success)';

  let html = '';

  if(goalCals){
    html += `
      <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--muted);margin-bottom:4px">
        <span>${total} kcal eaten</span>
        <span>Goal: ${goalCals} kcal</span>
      </div>
      <div class="cal-progress-bar">
        <div class="cal-progress-fill" style="width:${Math.min(100,pct)}%;background:${barColor}"></div>
      </div>
      <div style="font-size:12px;color:var(--muted);text-align:right;margin-bottom:12px">
        ${pct<=100?`${goalCals-total} kcal remaining`:`${total-goalCals} kcal over goal`}
      </div>`;
  } else {
    html += `<div style="font-size:13px;color:var(--muted);margin-bottom:12px">Save your personal info to see a calorie goal here.</div>`;
  }

  html += `
    <div class="cal-add-row">
      <input class="cal-food-input" type="text" id="cal-food" placeholder="Food / meal">
      <input class="cal-kcal-input" type="number" id="cal-kcal" inputmode="numeric" placeholder="kcal" min="1">
      <button class="cal-add-btn" onclick="logCalorie()">Add</button>
    </div>`;

  if(S.dailyLog.entries.length){
    html += `<div style="max-height:220px;overflow-y:auto;margin-top:4px">`;
    [...S.dailyLog.entries].reverse().forEach((e,ri)=>{
      const i = S.dailyLog.entries.length-1-ri;
      html += `<div class="cal-entry">
        <div class="cal-entry-name">${e.name.replace(/</g,'&lt;')||'—'}</div>
        <div class="cal-entry-kcal">${e.kcal} kcal</div>
        <button class="cal-del-btn" onclick="deleteCalEntry(${i})">✕</button>
      </div>`;
    });
    html += `</div>
      <div style="padding-top:10px;font-size:14px;font-weight:700;text-align:right">Total: ${total} kcal</div>`;
  } else {
    html += `<div style="text-align:center;color:var(--muted);font-size:13px;padding:14px 0">No food logged today</div>`;
  }

  wrap.innerHTML = html;
}

function logCalorie(category){
  const food = document.getElementById('cal-food');
  const kcalEl = document.getElementById('cal-kcal');
  const kcal = parseInt(kcalEl.value);
  if(!kcal||kcal<=0) return;
  S.dailyLog.entries.push({name: food.value.trim()||'Unknown', kcal, category: category||'other'});
  persistDailyLog();
  food.value=''; kcalEl.value='';
  renderCalorieLog();
  if(document.getElementById('calorie-overlay')?.style.display==='flex') renderCalorieOverlay();
}
function deleteCalEntry(i){
  S.dailyLog.entries.splice(i, 1);
  persistDailyLog();
  renderCalorieLog();
  if(document.getElementById('calorie-overlay')?.style.display==='flex') renderCalorieOverlay();
}

// ── Calorie overlay (full-screen) ─────────────────────────────────
const MEAL_CATS=[
  {id:'breakfast',emoji:'🌅',label:'Breakfast'},
  {id:'lunch',emoji:'🥗',label:'Lunch'},
  {id:'dinner',emoji:'🍽️',label:'Dinner'},
  {id:'snacks',emoji:'🍎',label:'Snacks'},
];
function openCalorieOverlay(){
  const ov=document.getElementById('calorie-overlay');
  if(!ov) return;
  ov.style.display='flex';
  renderCalorieOverlay();
}
function closeCalorieOverlay(){
  const ov=document.getElementById('calorie-overlay');
  if(ov) ov.style.display='none';
  if(S.calOverlayChart){ S.calOverlayChart.destroy(); S.calOverlayChart=null; }
}
function overlayAddCalorie(cat){
  const food=document.getElementById('ov-food-'+cat);
  const kcalEl=document.getElementById('ov-kcal-'+cat);
  if(!kcalEl) return;
  const kcal=parseInt(kcalEl.value);
  if(!kcal||kcal<=0) return;
  const today=getLocalDate();
  if(S.dailyLog.date!==today){ S.dailyLog={date:today,entries:[]}; }
  S.dailyLog.entries.push({name:(food?.value.trim())||'Unknown', kcal, category:cat});
  persistDailyLog();
  renderCalorieLog();
  renderCalorieOverlay();
}
function deleteOverlayEntry(i){
  S.dailyLog.entries.splice(i,1);
  persistDailyLog();
  renderCalorieLog();
  renderCalorieOverlay();
}
function renderCalorieOverlay(){
  const inner=document.getElementById('calorie-overlay-inner');
  if(!inner) return;
  const today=getLocalDate();
  if(S.dailyLog.date!==today){ S.dailyLog={date:today,entries:[]}; persistDailyLog(); }
  const c=calcGoalCals();
  const goal=c?c.goal:'maintain';
  const goalCals=c?(goal==='cut'?c.cut:goal==='bulk'?c.bulk:c.maintain):null;
  const eaten=S.dailyLog.entries.reduce((a,e)=>a+e.kcal,0);
  const rem=goalCals!=null?goalCals-eaten:null;

  // Header
  let html='<div id="calorie-overlay-header">'+
    '<button id="calorie-overlay-back" onclick="closeCalorieOverlay()">←</button>'+
    '<div style="font-size:20px;font-weight:700">Calories</div></div>';

  // Target switcher
  if(c){
    const pill=(g,lbl,val)=>{
      const active=goal===g;
      return '<button onclick="selectGoal(\''+g+'\')" style="flex:1;padding:10px 6px;border-radius:999px;border:1.5px solid '+(active?'var(--accent)':'var(--border)')+';background:'+(active?'var(--accent)':'transparent')+';color:'+(active?'#fff':'var(--text)')+';font-size:13px;font-weight:600;cursor:pointer;text-align:center">'
        +lbl+'<div style="font-size:11px;font-weight:500;opacity:0.85;margin-top:1px">'+val+'</div></button>';
    };
    html+='<div style="display:flex;gap:8px;margin-bottom:24px">'+
      pill('bulk','Bulk',c.bulk)+pill('maintain','Maintain',c.maintain)+pill('cut','Cut',c.cut)+'</div>';
  } else {
    html+='<div style="text-align:center;color:var(--muted);font-size:13px;margin-bottom:20px">Add your personal info in Settings to see calorie targets.</div>';
  }

  // Ring + stats
  if(goalCals!=null){
    const pct=Math.min(100,Math.round(eaten/goalCals*100));
    const ringCol=rem<0?'var(--danger)':pct>80?'var(--warn)':'var(--success)';
    const R=58,circ=+(2*Math.PI*R).toFixed(1),offset=+(circ*(1-pct/100)).toFixed(1);
    html+='<div style="display:flex;flex-direction:column;align-items:center;margin-bottom:28px">'+
      '<svg width="150" height="150" viewBox="0 0 150 150">'+
        '<circle cx="75" cy="75" r="'+R+'" fill="none" stroke="var(--border)" stroke-width="12"/>'+
        '<circle cx="75" cy="75" r="'+R+'" fill="none" stroke="'+ringCol+'" stroke-width="12" stroke-dasharray="'+circ+'" stroke-dashoffset="'+offset+'" stroke-linecap="round" transform="rotate(-90 75 75)"/>'+
        '<text x="75" y="70" text-anchor="middle" dominant-baseline="middle" font-size="30" font-weight="800" fill="var(--text)">'+eaten+'</text>'+
        '<text x="75" y="94" text-anchor="middle" font-size="12" fill="var(--muted)">eaten</text>'+
      '</svg>'+
      '<div style="display:flex;gap:28px;margin-top:14px">'+
        '<div style="text-align:center"><div style="font-size:18px;font-weight:800;color:'+ringCol+'">'+(rem>=0?rem:Math.abs(rem))+'</div><div style="font-size:11px;color:var(--muted)">'+(rem>=0?'remaining':'over')+'</div></div>'+
        '<div style="text-align:center"><div style="font-size:18px;font-weight:800">'+goalCals+'</div><div style="font-size:11px;color:var(--muted)">goal</div></div>'+
      '</div></div>';
  }

  // Meal log by category
  MEAL_CATS.forEach(cat=>{
    const items=S.dailyLog.entries.map((e,i)=>({e,i})).filter(o=>(o.e.category||'other')===cat.id);
    const subtotal=items.reduce((a,o)=>a+o.e.kcal,0);
    html+='<div class="card" style="margin-bottom:12px">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'+
        '<div style="font-size:14px;font-weight:700">'+cat.emoji+' '+cat.label+'</div>'+
        '<div style="font-size:13px;font-weight:600;color:var(--muted)">'+subtotal+' kcal</div>'+
      '</div>';
    items.forEach(o=>{
      html+='<div class="cal-entry"><div class="cal-entry-name">'+(o.e.name.replace(/</g,'&lt;')||'—')+'</div>'+
        '<div class="cal-entry-kcal">'+o.e.kcal+' kcal</div>'+
        '<button class="cal-del-btn" onclick="deleteOverlayEntry('+o.i+')">✕</button></div>';
    });
    html+='<div class="cal-add-row" style="margin:10px 0 0">'+
      '<input class="cal-food-input" type="text" id="ov-food-'+cat.id+'" placeholder="Food / meal">'+
      '<input class="cal-kcal-input" type="number" id="ov-kcal-'+cat.id+'" inputmode="numeric" placeholder="kcal" min="1">'+
      '<button class="cal-add-btn" onclick="overlayAddCalorie(\''+cat.id+'\')">+ Add</button>'+
      '</div></div>';
  });

  // Weekly chart
  html+='<div class="card" style="margin-bottom:12px"><div style="font-size:14px;font-weight:700;margin-bottom:12px">Last 7 days</div>'+
    '<canvas id="cal-week-chart" height="160"></canvas></div>';

  inner.innerHTML=html;

  // Build weekly chart
  const labels=[],eatenData=[],dayInit=[];
  for(let i=6;i>=0;i--){
    const d=new Date(today+'T12:00:00'); d.setDate(d.getDate()-i);
    const key=d.toLocaleDateString('en-CA');
    const total = key===today ? eaten : (calorieHistory[key]||0);
    eatenData.push(total);
    dayInit.push(['S','M','T','W','T','F','S'][d.getDay()]);
    labels.push(key);
  }
  const ctx=document.getElementById('cal-week-chart');
  if(ctx && typeof Chart!=='undefined'){
    if(S.calOverlayChart){ S.calOverlayChart.destroy(); S.calOverlayChart=null; }
    const accent=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#FF6B35';
    const datasets=[{label:'Eaten',data:eatenData,backgroundColor:accent,borderRadius:4,barPercentage:0.6}];
    if(goalCals!=null) datasets.push({label:'Target',type:'line',data:eatenData.map(()=>goalCals),borderColor:'rgba(150,150,150,0.7)',borderDash:[5,4],borderWidth:1.5,pointRadius:0,fill:false});
    S.calOverlayChart=new Chart(ctx,{
      type:'bar',
      data:{labels:dayInit,datasets},
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false}},
        scales:{x:{grid:{display:false},ticks:{color:'#94a3b8'}},y:{beginAtZero:true,grid:{color:'rgba(150,150,150,0.12)'},ticks:{color:'#94a3b8'}}}}
    });
  }
}

// ── Saved foods (favourites) ──────────────────────────────────────
function loadSavedFoods(){ return lsLoad('daily_saved_foods', []); }
function persistSavedFoods(){
  lsSave('daily_saved_foods', savedFoods, 'savedFoods');
}
let savedFoods = loadSavedFoods();

function addSavedFood(){
  const nameEl=document.getElementById('saved-food-name');
  const kcalEl=document.getElementById('saved-food-kcal');
  const name=nameEl?.value.trim();
  const kcal=parseInt(kcalEl?.value);
  if(!name||!kcal||kcal<=0) return;
  savedFoods.push({name, kcal});
  persistSavedFoods();
  nameEl.value=''; kcalEl.value='';
  renderSavedFoods();
}
function deleteSavedFood(i){
  savedFoods.splice(i,1);
  persistSavedFoods();
  renderSavedFoods();
}
function logFromFavourite(name, kcal){
  const today=getLocalDate();
  if(S.dailyLog.date!==today){ S.dailyLog={date:today,entries:[]}; }
  S.dailyLog.entries.push({name, kcal, category:'other'});
  persistDailyLog();
  renderCalorieLog();
  if(document.getElementById('calorie-overlay')?.style.display==='flex') renderCalorieOverlay();
}
function renderSavedFoods(){
  const wrap=document.getElementById('saved-foods-inner'); if(!wrap) return;
  let html=`
    <div class="cal-add-row" style="margin-bottom:12px">
      <input class="cal-food-input" type="text" id="saved-food-name" placeholder="Food name">
      <input class="cal-kcal-input" type="number" id="saved-food-kcal" inputmode="numeric" placeholder="kcal" min="1">
      <button class="cal-add-btn" onclick="addSavedFood()">Save</button>
    </div>`;
  if(savedFoods.length){
    html+=`<div style="display:flex;flex-wrap:wrap;gap:7px">`;
    savedFoods.forEach((f,i)=>{
      const safeName=f.name.replace(/</g,'&lt;').replace(/'/g,'&#39;');
      html+=`<div style="display:inline-flex;align-items:center;gap:4px;background:var(--blue-bg);border:1.5px solid var(--blue-border);border-radius:20px;padding:5px 8px 5px 12px">
        <span onclick="logFromFavourite('${safeName}',${f.kcal})" style="font-size:13px;font-weight:600;color:var(--blue-dark);cursor:pointer">${safeName} · ${f.kcal} kcal</span>
        <button onclick="deleteSavedFood(${i})" style="font-size:12px;color:var(--muted);background:none;border:none;cursor:pointer;padding:0 2px;line-height:1;flex-shrink:0">✕</button>
      </div>`;
    });
    html+=`</div>`;
  } else {
    html+=`<div style="text-align:center;color:var(--muted);font-size:13px;padding:10px 0">No saved foods yet — save frequent meals above</div>`;
  }
  wrap.innerHTML=html;
}

// ── Export ────────────────────────────────────────────────────────
// Comprehensive multi-section budget export. Design notes (read before touching):
//
// • Per-week figures are read through the LIVE per-input functions — weekIncome/weekFixedTotal/
//   weekVarTotal/weekSavedAmt — never through d.snapshot. recoverBudgetData's own comments
//   document that preferring the snapshot aggregates over the per-input fields is exactly the
//   bug that made real numbers "vanish" after past redesigns; the per-input readers are the
//   app's current source of truth and match what the Budget tab itself displays.
//
// • The app has THREE overlapping category systems and this export deliberately uses a
//   different one per section, matching what each section is asking for:
//     1) loadFixCats()/loadVarCats()/loadIncCats() — the live, user-editable per-week
//        categories (id/name[/default]) that d['fix_'+id]/d['var_'+id]/d['inc_'+id] key off.
//        Used for Section 1's per-week actuals.
//     2) dTransportBud()/dFoodBud()/dPubBud()/dPersonalBud() — standalone per-category budget
//        targets (budDefaults.*_bud). Used for Section 2's "Budget target" column — this is
//        the literal, existing API for that concept, even though only the transport one is
//        currently wired to a Settings field (the food/pub/personal ones fall back to their
//        DEFAULT_* constants until/unless a future Settings field sets them).
//     3) budgetConfig.fixedExpenses/variableExpenses — a separate flat config (weeklyAmount
//        per named line item) used by configFixedTotal/configVariableTotal. Used for Sections
//        5 and 6, per the task's explicit pointer to configFixedTotal.
//   These do not all share the same category names/ids, so Section 6 cross-references its
//   config items to the live variable categories by a best-effort name match (see matchVarCat);
//   when no confident match exists the "actual" columns are left blank rather than guessed.
//
// • Subscriptions are NOT double-counted: subscriptionsData (Settings → Subscriptions) is a
//   flat CURRENT list, not stored per historical week, so its prorated weekly figure is the
//   same value on every week/month row — an informational cross-reference column, exactly as
//   asked for. It is never added into Total Out/Leftover, because the week's actual
//   subscriptions cost already lives inside Total Fixed via the (independently editable)
//   fix_subs line item that weekFixedTotal sums. Section 8's "Total Fixed Spent" is the one
//   place that EXCLUDES fix_subs — its summary table also lists Total Subscriptions rows, and
//   the rows there are meant to be mutually exclusive so the table can be summed.
//
// • "Running Savings Balance" starts from the EARLIEST entry in the daily_savings_log balance
//   history (savingsLog) — the earliest balance actually on record — or 0 if none exists, then
//   adds each week's saved amount chronologically. This is a documented approximation: if
//   balance-logging started after budget history began, earlier weeks' running balance won't
//   reflect a true starting point (no better data exists to anchor it).
function exportBudgetCSV(){
  const weekKeys=Object.keys(budgetData).sort(); // 'YYYY-MM-DD' keys sort chronologically
  if(!weekKeys.length){ alert('No budget weeks saved yet.'); return; }

  const r2=n=>Math.round((n+Number.EPSILON)*100)/100; // round to 2dp, dodging float noise
  // CSV field escaper — quotes only when the value needs it, doubles internal quotes.
  const cell=v=>{
    if(v===null||v===undefined) return '';
    const s=String(v);
    return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  };
  const row=arr=>arr.map(cell).join(',');
  const rows=[];

  const incCats=loadIncCats(), fixCats=loadFixCats(), varCats=loadVarCats(); // live per-week category definitions
  // Do any weeks record hours for any income source? Only then do we emit hours columns.
  const anyHours=Object.values(budgetData).some(d=>incCats.some(c=>{const v=d&&d['hrs_'+c.id];return v!==undefined&&v!=='';}));
  // Single-category actual reader — same fallback logic as weekFixedTotal/weekVarTotal, just
  // isolated to one id instead of summed across every category.
  function fixActual(d,id){
    const v=d&&d['fix_'+id];
    if(v!==undefined&&v!=='') return parseFloat(v)||0;
    const cat=fixCats.find(c=>c.id===id);
    return cat?(parseFloat(cat.default)||0):0;
  }
  function varActual(d,id){ return parseFloat(d&&d['var_'+id])||0; }

  // Current subscription tracker, prorated to weekly (see design note above: not historical).
  const subsMonthly=r2(subscriptionsData.reduce((s,sub)=>s+(parseFloat(sub.monthlyCost)||0),0));
  const subsWeekly=r2(subsMonthly/4.33);

  // Savings-balance history → base + current balance (see design note above).
  const savLogSorted=[...savingsLog].filter(e=>e&&e.date).sort((a,b)=>a.date<b.date?-1:1);
  const savBase=savLogSorted.length?(parseFloat(savLogSorted[0].balance)||0):0;
  const savCurrentLogged=savLogSorted.length?(parseFloat(savLogSorted[savLogSorted.length-1].balance)||0):null;

  // ── Pass 1: one fully-computed row per saved week, shared by every section below ──
  let runningBal=savBase;
  const weeks=weekKeys.map(k=>{
    const d=budgetData[k];
    const mon=localMidnight(k);
    const income=weekIncome(d);
    const saved=weekSavedAmt(d);
    const totalFixed=weekFixedTotal(d);
    const totalVar=weekVarTotal(d);
    const totalOut=r2(saved+totalFixed+totalVar);
    const leftover = income>0 ? r2(income-totalOut) : '';
    const leftoverPct = income>0 ? r2((income-totalOut)/income*100) : '';
    const savRate = income>0 ? r2(saved/income*100) : '';
    runningBal=r2(runningBal+saved);
    // Generic per-category actual map, covering EVERY live variable category (not just the 3
    // named ones) — Section 6 needs this to read a correctly-matched custom category's actual
    // value rather than hardcoding just food/pub/personal.
    const varByCat={}; varCats.forEach(c=>{ varByCat[c.id]=varActual(d,c.id); });
    // Per-income-source amounts and hours — one entry per live income category (not just
    // fuji/mcd), so the Section 1 income columns always sum to Total Income and any added
    // income source (e.g. Freelance) gets its own reconciling column. Hours are blank when
    // never entered (blank-when-unknown), so sum()/avgRate() skip those weeks.
    const incByCat={}, hrsByCat={};
    incCats.forEach(c=>{
      incByCat[c.id]=parseFloat(d['inc_'+c.id])||0;
      const h=d['hrs_'+c.id];
      hrsByCat[c.id]=(h!==undefined&&h!=='')?(parseFloat(h)||0):'';
    });
    return {
      key:k, mon, label:fmtWeekLabel(mon),
      incByCat, hrsByCat,
      income, saved, savRate, runningBal,
      fixTransport:fixActual(d,'transport'),
      // Same value-or-default fallback weekFixedTotal applies to this line, so Section 8
      // can subtract it from Total Fixed exactly (not approximately).
      fixSubs:fixActual(d,'subs'),
      varFood:varActual(d,'food'), varPub:varActual(d,'pub'), varPersonal:varActual(d,'personal'),
      varByCat, totalVar, totalFixed, subsWeekly, totalOut, leftover, leftoverPct,
      notes:d.notes||''
    };
  });
  const numWk=weeks.length;
  const sum=f=>r2(weeks.reduce((a,w)=>a+(typeof f(w)==='number'?f(w):0),0));
  const avg=f=>numWk?r2(sum(f)/numWk):0;
  // Mean of a per-week RATE column, over only the weeks where that rate was computable
  // (income>0 — matches the blank-when-unknown convention used throughout this export).
  const avgRate=f=>{ const vs=weeks.map(f).filter(v=>typeof v==='number'); return vs.length?r2(vs.reduce((a,v)=>a+v,0)/vs.length):''; };
  const totalIncome=sum(w=>w.income), totalSaved=sum(w=>w.saved);
  const totalFixedAll=sum(w=>w.totalFixed), totalVarAll=sum(w=>w.totalVar);
  const totalFood=sum(w=>w.varFood), totalPub=sum(w=>w.varPub), totalPersonal=sum(w=>w.varPersonal);
  const totalSubsAll=sum(w=>w.subsWeekly), totalOutAll=sum(w=>w.totalOut);
  // Leftover total/blended rate only over weeks with a computed (non-blank) leftover — mirrors
  // the original function's income>0 gate on its leftover total.
  const leftoverWeeks=weeks.filter(w=>typeof w.leftover==='number');
  const totalLeftover=r2(leftoverWeeks.reduce((a,w)=>a+w.leftover,0));
  const blendedLeftoverPct = totalIncome>0 ? r2(totalLeftover/totalIncome*100) : '';
  const blendedSavRate = totalIncome>0 ? r2(totalSaved/totalIncome*100) : '';
  const finalRunningBal = numWk?weeks[numWk-1].runningBal:savBase;
  const savCurrent = savCurrentLogged!==null ? savCurrentLogged : finalRunningBal;
  const avgWeeklySaved = avg(w=>w.saved);
  const projectedAnnualSavings = r2(avgWeeklySaved*52);

  // Context banner at the very top (point 5): explains the Notes column's purpose.
  rows.push(row(['Notes provide context for income/expense spikes and windfall weeks (e.g. tax return, bonus, unexpected expense).']));
  rows.push('');

  // ── SECTION 1 — WEEKLY BREAKDOWN MATRIX ──────────────────────────
  // Income columns are generated per live income source so they always reconcile with Total
  // Income; hours columns appear only if any week recorded hours. Everything after Total
  // Income is fixed.
  const incHdr=incCats.map(c=>catLabel(c)+' Income');
  const hrsHdr=anyHours?incCats.map(c=>catLabel(c)+' Hours'):[];
  const tail=['Saved','Savings Rate %','Running Savings Balance','Fixed Transport','Var Food','Var Pub',
    'Var Personal','Total Variable','Total Fixed','Total Subscriptions','Total Out','Leftover','Leftover %','Notes'];
  const incVals=w=>incCats.map(c=>w.incByCat[c.id]);
  const hrsVals=w=>anyHours?incCats.map(c=>w.hrsByCat[c.id]):[];
  const tailVals=w=>[w.saved,w.savRate,w.runningBal,w.fixTransport,w.varFood,w.varPub,w.varPersonal,
    w.totalVar,w.totalFixed,w.subsWeekly,w.totalOut,w.leftover,w.leftoverPct,w.notes];
  rows.push(row(['Week',...incHdr,'Total Income',...hrsHdr,...tail]));
  weeks.forEach(w=>{ rows.push(row([w.label,...incVals(w),w.income,...hrsVals(w),...tailVals(w)])); });
  // Totals row: sums for flow columns; the blended (not naively-averaged) rate for rate
  // columns; the FINAL balance (not a sum, which would be meaningless for a running balance).
  // Σ(per-source income) == Total Income by construction (same inc_<id> fields).
  rows.push(row(['TOTALS',
    ...incCats.map(c=>sum(w=>w.incByCat[c.id])), totalIncome,
    ...(anyHours?incCats.map(c=>sum(w=>w.hrsByCat[c.id])):[]),
    totalSaved,blendedSavRate,finalRunningBal,sum(w=>w.fixTransport),totalFood,totalPub,totalPersonal,
    totalVarAll,totalFixedAll,totalSubsAll,totalOutAll,totalLeftover,blendedLeftoverPct,'']));
  // Hours averages use avgRate (mean over only the weeks that recorded hours) — a plain avg
  // over all weeks would dilute the figure with pre-feature blank weeks.
  rows.push(row(['AVERAGES',
    ...incCats.map(c=>avg(w=>w.incByCat[c.id])), avg(w=>w.income),
    ...(anyHours?incCats.map(c=>avgRate(w=>w.hrsByCat[c.id])):[]),
    avg(w=>w.saved),avgRate(w=>w.savRate),'',avg(w=>w.fixTransport),avg(w=>w.varFood),avg(w=>w.varPub),
    avg(w=>w.varPersonal),avg(w=>w.totalVar),avg(w=>w.totalFixed),avg(w=>w.subsWeekly),
    avg(w=>w.totalOut),numWk?r2(totalLeftover/(leftoverWeeks.length||1)):'',avgRate(w=>w.leftoverPct),'']));

  // ── SECTION 2 — CATEGORY ANALYSIS ────────────────────────────────
  rows.push(''); rows.push('CATEGORY ANALYSIS');
  rows.push(row(['Category','Weekly Average','Monthly Average','Yearly Projection',
    '% of Avg Income','Best Week (Lowest)','Worst Week (Highest)','Weeks Over Budget',
    'Weeks Under Budget','Budget Target']));
  const avgIncomeAll = avg(w=>w.income);
  const catAnalysis=[
    {label:(fixCats.find(c=>c.id==='transport')||{}).name||'Transport', get:w=>w.fixTransport, budget:dTransportBud()},
    {label:(varCats.find(c=>c.id==='food')||{}).name||'Food',           get:w=>w.varFood,       budget:dFoodBud()},
    {label:(varCats.find(c=>c.id==='pub')||{}).name||'Pub',             get:w=>w.varPub,         budget:dPubBud()},
    {label:(varCats.find(c=>c.id==='personal')||{}).name||'Personal',   get:w=>w.varPersonal,    budget:dPersonalBud()},
  ];
  catAnalysis.forEach(c=>{
    const vals=weeks.map(c.get);
    const weeklyAvg=numWk?r2(vals.reduce((a,v)=>a+v,0)/numWk):0;
    const monthlyAvg=r2(weeklyAvg*4.33), yearlyProj=r2(weeklyAvg*52);
    const pctIncome=avgIncomeAll>0?r2(weeklyAvg/avgIncomeAll*100):'';
    let bestIdx=0,worstIdx=0;
    weeks.forEach((w,i)=>{ if(c.get(w)<c.get(weeks[bestIdx])) bestIdx=i; if(c.get(w)>c.get(weeks[worstIdx])) worstIdx=i; });
    const bestWeek=`${weeks[bestIdx].label} ($${r2(c.get(weeks[bestIdx]))})`;
    const worstWeek=`${weeks[worstIdx].label} ($${r2(c.get(weeks[worstIdx]))})`;
    const overCount=vals.filter(v=>v>c.budget).length, underCount=vals.filter(v=>v<=c.budget).length;
    rows.push(row([c.label,weeklyAvg,monthlyAvg,yearlyProj,pctIncome,bestWeek,worstWeek,overCount,underCount,c.budget]));
  });

  // ── SECTION 3 — MONTHLY ROLLUP ───────────────────────────────────
  rows.push(''); rows.push('MONTHLY SUMMARY');
  rows.push(row(['Month','Total Income','Total Saved','Savings Rate %','Total Fixed','Total Food',
    'Total Pub','Total Personal','Total Subscriptions','Total Out','Leftover']));
  const monthGroups={}; // 'YYYY-MM' -> {label, weeks:[...]}
  weeks.forEach(w=>{
    const mk=w.mon.getFullYear()+'-'+String(w.mon.getMonth()+1).padStart(2,'0');
    if(!monthGroups[mk]) monthGroups[mk]={label:fmtMonthLabel(new Date(w.mon.getFullYear(),w.mon.getMonth(),1)), weeks:[]};
    monthGroups[mk].weeks.push(w);
  });
  Object.keys(monthGroups).sort().forEach(mk=>{
    const g=monthGroups[mk].weeks;
    const mSum=f=>r2(g.reduce((a,w)=>a+(typeof f(w)==='number'?f(w):0),0));
    const mIncome=mSum(w=>w.income), mSaved=mSum(w=>w.saved);
    const mLeftoverWeeks=g.filter(w=>typeof w.leftover==='number');
    const mLeftover=r2(mLeftoverWeeks.reduce((a,w)=>a+w.leftover,0));
    rows.push(row([monthGroups[mk].label,mIncome,mSaved,mIncome>0?r2(mSaved/mIncome*100):'',
      mSum(w=>w.totalFixed),mSum(w=>w.varFood),mSum(w=>w.varPub),mSum(w=>w.varPersonal),
      mSum(w=>w.subsWeekly),mSum(w=>w.totalOut),mLeftover]));
  });

  // ── SECTION 4 — SAVINGS TRACKING ─────────────────────────────────
  rows.push(''); rows.push('SAVINGS TRACKING');
  rows.push(row(['Week','Amount Saved','Running Balance','Savings Rate %']));
  weeks.forEach(w=>rows.push(row([w.label,w.saved,w.runningBal,w.savRate])));
  rows.push(row(['Total Saved All Time',totalSaved,'','']));
  rows.push(row(['Current Balance',savCurrent,'','']));
  rows.push(row(['Average Weekly Savings',avgWeeklySaved,'','']));
  rows.push(row(['Projected Annual Savings',projectedAnnualSavings,'','']));

  // ── SECTION 5 — FIXED EXPENSES (each category's own weekly budget) ──
  rows.push(''); rows.push('FIXED EXPENSES');
  rows.push(row(['Category','Monthly Amount','Annual Amount']));
  let fixedMonthlyTotal=0, fixedAnnualTotal=0;
  fixCats.forEach(c=>{
    const wk=catBudget(c), mo=r2(wk*4.33), yr=r2(wk*52);
    fixedMonthlyTotal+=mo; fixedAnnualTotal+=yr;
    rows.push(row([c.name||'(unnamed)',mo,yr]));
  });
  rows.push(row(['Totals',r2(fixedMonthlyTotal),r2(fixedAnnualTotal)]));

  // ── SECTION 6 — VARIABLE EXPENSE BUDGETS ────────────────────────────────────
  rows.push(''); rows.push('VARIABLE BUDGETS');
  rows.push(row(['Category','Weekly Budget','Monthly Budget','Annual Budget',
    'Actual Weekly Average','Actual Monthly Average','Over/Under Budget per Month']));
  // Budget and actuals now hang off the same category, so the budget/actual pairing is exact
  // — this used to name-match config items against the live categories via a synonym table.
  let vBudgetWkTotal=0,vBudgetMoTotal=0,vBudgetYrTotal=0;
  varCats.forEach(c=>{
    const wkBudget=catBudget(c), moBudget=r2(wkBudget*4.33), yrBudget=r2(wkBudget*52);
    vBudgetWkTotal+=wkBudget; vBudgetMoTotal+=moBudget; vBudgetYrTotal+=yrBudget;
    const actualWeekly=avg(w=>w.varByCat[c.id]||0);
    const actualMonthly=r2(actualWeekly*4.33);
    rows.push(row([c.name||'(unnamed)',wkBudget,moBudget,yrBudget,actualWeekly,actualMonthly,r2(actualMonthly-moBudget)]));
  });
  rows.push(row(['Totals',r2(vBudgetWkTotal),r2(vBudgetMoTotal),r2(vBudgetYrTotal),'','','']));

  // ── SECTION 7 — SUBSCRIPTIONS ────────────────────────────────────
  rows.push(''); rows.push('SUBSCRIPTIONS');
  rows.push(row(['Name','Emoji','Billing Cycle','Original Cost per Cycle','Monthly Cost','Annual Cost']));
  let subsMoTotal=0,subsYrTotal=0;
  subscriptionsData.forEach(sub=>{
    const mo=parseFloat(sub.monthlyCost)||0, yr=r2(mo*12);
    subsMoTotal+=mo; subsYrTotal+=yr;
    rows.push(row([sub.name||'',sub.emoji||'',sub.cycle||'monthly',sub.originalCost??'',mo,yr]));
  });
  rows.push(row(['Totals','','','',r2(subsMoTotal),r2(subsYrTotal)]));

  // ── SECTION 8 — OVERALL SUMMARY ──────────────────────────────────
  rows.push(''); rows.push('OVERALL SUMMARY');
  const bestLeftoverIdx = leftoverWeeks.length ? weeks.indexOf(leftoverWeeks.reduce((best,w)=>w.leftover>best.leftover?w:best,leftoverWeeks[0])) : -1;
  const worstLeftoverIdx = leftoverWeeks.length ? weeks.indexOf(leftoverWeeks.reduce((worst,w)=>w.leftover<worst.leftover?w:worst,leftoverWeeks[0])) : -1;
  // "Total Fixed Spent" here EXCLUDES the fix_subs line: subscriptions get their own
  // Total Subscriptions rows below, and keeping both figures overlapping would double-count
  // that spend for anyone summing this table. Sections 1/5 keep the inclusive fixed total —
  // there the subscriptions columns are labelled cross-references, not summands.
  const totalFixedExclSubs=r2(totalFixedAll-sum(w=>w.fixSubs));
  const summary=[
    ['Date Exported',getLocalDate()],
    ['Weeks of Data',numWk],
    ['Total Income All Weeks',totalIncome],
    ['Total Saved All Weeks',totalSaved],
    ['Overall Savings Rate %',blendedSavRate],
    ['Total Fixed Spent',totalFixedExclSubs],
    ['Total Food Spent',totalFood],
    ['Total Pub Spent',totalPub],
    ['Total Personal Spent',totalPersonal],
    ['Total Subscriptions Monthly',subsMonthly],
    ['Total Subscriptions Annual',r2(subsMonthly*12)],
    ['Current Savings Balance',savCurrent],
    ['Projected Annual Savings',projectedAnnualSavings],
    ['Average Weekly Leftover', leftoverWeeks.length?r2(totalLeftover/leftoverWeeks.length):''],
    ['Best Week (Highest Leftover)', bestLeftoverIdx>=0?`${weeks[bestLeftoverIdx].label} ($${weeks[bestLeftoverIdx].leftover})`:''],
    ['Worst Week (Lowest Leftover)', worstLeftoverIdx>=0?`${weeks[worstLeftoverIdx].label} ($${weeks[worstLeftoverIdx].leftover})`:''],
  ];
  summary.forEach(([label,val])=>rows.push(row([label,val])));

  const blob=new Blob([rows.join('\n')],{type:'text/csv'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`budget-export-${getLocalDate()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function exportData(){
  if(!S.sessions.length){ alert('No sessions to export yet.'); return; }
  const rows=['Date,Day,Session,Exercise,Set,Weight (kg),Reps,Effort'];
  S.sessions.forEach(s=>{
    s.exercises.forEach(ex=>{
      ex.sets.forEach((set,si)=>{
        // Effort is session-level, repeated on each of the session's set rows
        rows.push([s.date,s.dayNum,s.sessionType,ex.name,si+1,set.weight||'',set.reps||'',s.effort||''].join(','));
      });
    });
  });
  const blob=new Blob([rows.join('\n')],{type:'text/csv'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`workout-log-${getLocalDate()}.csv`;
  a.click();
}

// ── Full data backup (export / import) ───────────────────────────
// Backs up EVERY app localStorage key (budget, workouts, weight, kitchen, settings…)
// as raw strings, so a future change that renames a field can be recovered from here.
// Values are kept as strings (not JSON.parsed) so non-JSON entries like wt_theme survive.
function exportAllData(){
  const data={};
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(key && /^(daily_|wt_|kitchen_)/.test(key)) data[key]=localStorage.getItem(key);
  }
  const backup={ app:'daily', version:1, exported:new Date().toISOString(), data };
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='daily-backup-'+getLocalDate()+'.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function importData(e){
  const file=e.target.files&&e.target.files[0];
  if(!file){ return; }
  const reader=new FileReader();
  reader.onload=function(ev){ if(!restoreFromText(ev.target.result)) e.target.value=''; };
  reader.readAsText(file);
}
// Shared by the file picker and the paste box — a backup that arrived as pasted text is the
// same backup, and on a phone it is often the ONLY form it arrives in (the JSON comes back
// from a chat, not as a downloaded file). Returns false when nothing was restored so the
// caller can keep its own input intact; `report` lets the paste box show the reason inline
// instead of firing an alert over the top of the text the user just pasted.
function restoreFromText(text, report){
  const fail=m=>{ if(report) report(m); else alert(m); return false; };
  let parsed;
  try{ parsed=JSON.parse(text); }
  catch(err){ return fail('Could not read that as JSON — check you pasted the whole backup, starting at { and ending at }.'); }
  // Accept both {data:{...}} (this app's format) and a flat {key:value} object
  const data=(parsed && parsed.data && typeof parsed.data==='object') ? parsed.data : parsed;
  if(!data || typeof data!=='object') return fail('That is valid JSON, but not a Daily backup.');
  const keys=Object.keys(data).filter(k=>/^(daily_|wt_|kitchen_)/.test(k));
  if(!keys.length) return fail('No Daily data found in that text.');
  const signedIn = !!(firebaseReady && auth && auth.currentUser && db);
  if(!confirm('Restore '+keys.length+' data keys from this backup?\n\n'+
    'This replaces the data on this device'+
    (signedIn?' AND in your synced account, on every device.':'.'))) return false;
  keys.forEach(k=>{
    if(/_ts$/.test(k)) return; // re-stamped below — never restore a stale timestamp
    const v=data[k];
    localStorage.setItem(k, typeof v==='string' ? v : JSON.stringify(v));
  });
  // A restore is authoritative: the file is meant to BECOME the truth, not to be merged
  // with whatever the cloud happens to hold. Restoring the backup's own _ts values would
  // do the exact opposite — they are by definition older than anything saved since, so the
  // first sync after reload reads the cloud as "newer" and wipes the restore. Stamping now
  // is what makes the restored copy win.
  const now=Date.now();
  keys.forEach(k=>{ if(!/_ts$/.test(k)) localStorage.setItem(k+'_ts', String(now)); });
  if(!signedIn){ alert('Data restored. Reloading…'); location.reload(); return true; }
  // Signed in: push before reloading. The cloud-wins stores (profile, budget defaults,
  // personal info, habits) adopt the cloud copy unconditionally when their listeners
  // re-attach, so a restore of those only survives if it reaches the cloud first.
  restorePushToCloud().then(ok=>{
    alert(ok ? 'Data restored and synced to your account. Reloading…'
             : 'Data restored on this device, but syncing to the cloud failed.\n\n'+
               'Do not open Daily on another device until you have retried, or the older '+
               'cloud copy may overwrite this one.');
    location.reload();
  });
  return true;
}
function openPasteRestore(){
  const box=document.getElementById('paste-restore-box'); if(!box) return;
  box.innerHTML=
    '<div class="modal-header">'+
      '<button class="back-btn" data-back="closePasteRestore" aria-label="Back">'+BACK_CHEVRON+'</button>'+
      '<div class="modal-title">Paste backup</div>'+
    '</div>'+
    '<div class="modal-body">'+
      '<div style="font-size:13px;color:var(--muted);margin-bottom:10px">'+
        'Paste the full contents of a Daily backup — the whole thing, from the first '+
        '<code>{</code> to the last <code>}</code>.</div>'+
      '<textarea id="paste-restore-text" rows="8" placeholder=\'{"app":"daily","version":1,…}\' '+
        'style="width:100%;padding:10px;border-radius:12px;border:1px solid var(--border);'+
        'background:var(--bg);color:var(--text);font-size:13px;font-family:monospace"></textarea>'+
      '<div id="paste-restore-msg" style="font-size:12.5px;font-weight:600;margin-top:8px;min-height:17px;color:var(--danger)"></div>'+
      '<div style="display:flex;gap:10px;margin-top:14px">'+
        '<button class="modal-btn secondary" onclick="closePasteRestore()">Cancel</button>'+
        '<button class="modal-btn primary" onclick="doPasteRestore()">Restore</button>'+
      '</div>'+
    '</div>';
  document.getElementById('paste-restore-overlay').classList.remove('hidden');
}
function closePasteRestore(){ const o=document.getElementById('paste-restore-overlay'); if(o) o.classList.add('hidden'); }
function doPasteRestore(){
  const msg=document.getElementById('paste-restore-msg');
  const txt=(document.getElementById('paste-restore-text')||{}).value||'';
  if(!txt.trim()){ if(msg) msg.textContent='Nothing pasted yet.'; return; }
  if(msg) msg.textContent='';
  // The overlay stays open on failure so the pasted text is not lost.
  restoreFromText(txt, m=>{ if(msg) msg.textContent=m; });
}
// Full-replacement push of every synced store, used only by a restore. Ordinary saves must
// never call this — merge-on-write is right for day-to-day editing across two devices, and
// wholesale replacement is right only when the user has explicitly said "this file is the
// truth". Sessions and weights are replaced rather than unioned for that reason: after a
// restore the union would resurrect exactly the entries the backup was taken to be rid of.
function restorePushToCloud(){
  if(!(firebaseReady && auth && auth.currentUser && db)) return Promise.resolve(false);
  const uid=auth.currentUser.uid, jobs=[];
  let failed=false;
  const put=(path,val)=>jobs.push(
    db.ref('users/'+uid+'/'+path).set(val).catch(()=>{ failed=true; }));
  const putJSON=(path,key)=>{
    const raw=localStorage.getItem(key); if(raw==null||raw==='') return;
    try{ put(path, JSON.parse(raw)); }catch(err){}
  };
  // Keyed collections — same id scheme each listener writes, so the shapes still match.
  const putKeyed=(path,key,idOf)=>{
    const raw=localStorage.getItem(key); if(raw==null||raw==='') return;
    try{
      const arr=JSON.parse(raw); if(!Array.isArray(arr)) return;
      put(path, Object.fromEntries(arr.filter(x=>x&&idOf(x)).map(x=>[idOf(x),x])));
    }catch(err){}
  };
  ['profile:daily_profile','budgetDefaults:daily_budget_defaults',
   'personalInfo:wt_personalinfo','habits:daily_habits','budgetData:daily_budget']
    .forEach(pair=>{ const [p,k]=pair.split(':'); putJSON(p,k); });
  putKeyed('sessions','wt_sessions', s=>String(s.id||''));
  putKeyed('weights','wt_weight', w=>String(w.date||'').replace(/-/g,''));
  putKeyed('savingsLog','daily_savings_log', s=>String(s.date||'').replace(/-/g,''));
  // Blob stores, as the {v,t} envelope the listeners expect, at the freshly stamped time.
  SYNC_BLOB_REG.forEach(b=>{
    const raw=localStorage.getItem(b.lsKey); if(raw==null||raw==='') return;
    put(b.path, {v:raw, t:parseInt(localStorage.getItem(b.tsKey)||'0',10)||Date.now()});
  });
  setSyncStatus('Restoring…');
  return Promise.all(jobs).then(()=>{
    setSyncStatus(failed?'Sync failed':'Synced ✓');
    return !failed;
  });
}

// ── AI review export ─────────────────────────────────────────────
// One Markdown briefing covering budget + accounts + workouts over a chosen window,
// written to be pasted straight into an AI chat. Deliberately NOT exportAllData()'s
// raw-localStorage dump: that's a restore-me backup, this is a read-me summary — rolled
// up, labelled, and topped with the question we actually want answered.
function aiRangeStart(months){
  const d=localMidnight(getLocalDate());
  d.setMonth(d.getMonth()-months);
  return dateStr(d);
}
function buildAIReviewMarkdown(months){
  const r2=n=>Math.round((n+Number.EPSILON)*100)/100;
  const money=n=>(n<0?'-$':'$')+Math.abs(r2(n)).toFixed(2);
  // Table-cell safe: pipes would split a column, newlines would end the row.
  const md=v=>String(v==null?'':v).replace(/\|/g,'\\|').replace(/\n/g,' ');
  const monthOf=d=>(d||'').slice(0,7);
  const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
  const start=aiRangeStart(months), today=getLocalDate();
  const L=[];

  L.push('# Daily — data export for AI review');
  L.push('');
  L.push('Generated '+today+' · window: last '+months+' month'+(months===1?'':'s')+' ('+start+' → '+today+')');
  L.push('All money in AUD. Budget is tracked weekly (weeks start Monday).');
  L.push('');
  L.push('## What I want from you');
  L.push('');
  L.push('**Budget is the priority — spend most of your answer there.** Read the data below and give me:');
  L.push('');
  L.push('1. **Where my money actually went this period.** Rank variable categories by total spend and by how far each ran over its target. Separate the ones that are genuinely fixed from the ones I control. Use the weekly tables — point at specific weeks, not averages alone.');
  L.push('2. **Where to cut back, in order.** Name the two or three categories with the most realistic savings in them, say roughly how much per week each is worth, and why you picked those over the others. Do not suggest cutting something the data shows is already lean.');
  L.push('3. **Next month\'s targets.** A per-category weekly number, derived from what I actually spent rather than what I previously planned. Flag any current target I am clearly kidding myself about, and give me one overall weekly spending goal to aim at. Say what that adds up to per month and what it would do to my savings rate.');
  L.push('4. **Am I on track?** Savings rate trend, net-worth movement, and whether my debt payoff position is improving or sliding. If a target is unrealistic on my current income, say so plainly.');
  L.push('5. **Training and body**, briefly — consistency and progression, and one concrete goal for next month.');
  L.push('');
  L.push('Rules: be direct and specific — a number I can act on beats a principle. Quote the figures you are reasoning from. If the data does not support a conclusion, say so rather than guessing. Ignore categories marked archived when setting future targets; they are finished, though their past spending is real and still counts in the history.');
  L.push('');

  // ── Profile ──
  const pi=S.personalInfo||{};
  if(pi.age||pi.height||pi.weight||pi.goal){
    L.push('## Profile');
    L.push('');
    if(pi.age)      L.push('- Age: '+pi.age);
    if(pi.sex)      L.push('- Sex: '+pi.sex);
    if(pi.height)   L.push('- Height: '+pi.height+' cm');
    if(pi.weight)   L.push('- Weight (stated): '+pi.weight+' kg');
    if(pi.activity) L.push('- Activity factor: '+pi.activity);
    if(pi.goal)     L.push('- Goal: '+pi.goal);
    L.push('');
  }

  // ── Budget ──
  const incCats=loadIncCats(), fixCats=loadFixCats(), varCats=loadVarCats();
  // Same per-category fallback rules exportBudgetCSV uses: a blank fixed cell means the
  // category's default was charged, a blank variable cell means nothing was spent.
  const fixActual=(d,c)=>{ const v=d&&d['fix_'+c.id]; return (v!==undefined&&v!=='')?(parseFloat(v)||0):(parseFloat(c.default)||0); };
  const varActual=(d,c)=>parseFloat(d&&d['var_'+c.id])||0;
  const weekKeys=Object.keys(budgetData).filter(k=>k>=start&&k<=today).sort();

  L.push('## Budget');
  L.push('');
  L.push('### Current plan (weekly targets)');
  L.push('');
  L.push('| Type | Item | Weekly target |');
  L.push('| --- | --- | --- |');
  // Archived categories are flagged, not hidden: their history still appears in the spending
  // tables below, so leaving them unmarked would invite budget advice for a job I've left or
  // a spend I no longer have.
  const planRow=(label,c)=>L.push('| '+label+' | '+md(c.name)+(catIsArchived(c)?' _(archived — no longer active)_':'')+' | '+
    (catIsArchived(c)?'—':((c.budget==null||c.budget==='')&&c.default==null?'not set':money(catBudget(c))))+' |');
  incCats.forEach(c=>planRow('Income',c));
  fixCats.forEach(c=>planRow('Fixed',c));
  varCats.forEach(c=>planRow('Variable',c));
  if(budDefaults&&budDefaults.savingsGoal!=null) L.push('| Savings | Weekly savings goal | '+money(parseFloat(budDefaults.savingsGoal)||0)+' |');
  // The self-imposed cap on variable spending — distinct from "money left over", which is
  // whatever income happens to leave behind. Advice that ignores it misses the actual target.
  const _vgDefault=(typeof getVarGoalDefault==='function')?getVarGoalDefault():null;
  if(_vgDefault!=null) L.push('| Spending goal | Weekly cap on variable spending | '+money(_vgDefault)+' |');
  L.push('');
  L.push('Planned weekly: income '+money(configIncomeTotal())+' · fixed '+money(configFixedTotal())+' · variable '+money(configVariableTotal())+'.');
  if(_vgDefault!=null) L.push('My variable spending goal is '+money(_vgDefault)+'/week. Judge variable spending against this, not just against leftover.');
  L.push('');

  if(!weekKeys.length){
    L.push('_No budget weeks recorded in this window._');
    L.push('');
  } else {
    L.push('### Weekly actuals');
    L.push('');
    // Each week carries the spending goal that applied AT THE TIME (var_goal), so raising the
    // goal later never rewrites how a past week is judged.
    L.push('| Week (Mon) | Income | Fixed | Variable | Spending goal | Under goal? | Saved | Leftover |');
    L.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    weekKeys.forEach(k=>{
      const d=budgetData[k];
      const v=weekVarTotal(d);
      const g=(typeof getWeekVarGoal==='function')?getWeekVarGoal(d):null;
      L.push('| '+k+' | '+money(weekIncome(d))+' | '+money(weekFixedTotal(d))+' | '+money(v)+' | '+
        (g!=null?money(g):'—')+' | '+(g!=null?(v<=g?'yes':'NO — over by '+money(v-g)):'—')+' | '+
        money(weekSavedAmt(d))+' | '+money(weekLeftover(d))+' |');
    });
    L.push('');

    // Monthly rollup — weeks grouped by the month their Monday falls in.
    const byMonth={};
    weekKeys.forEach(k=>{ (byMonth[monthOf(k)]=byMonth[monthOf(k)]||[]).push(budgetData[k]); });
    L.push('### Monthly rollup');
    L.push('');
    L.push('| Month | Weeks | Income | Spent | Saved | Leftover | Savings rate |');
    L.push('| --- | --- | --- | --- | --- | --- | --- |');
    Object.keys(byMonth).sort().forEach(m=>{
      const ws=byMonth[m];
      const inc=ws.reduce((s,d)=>s+weekIncome(d),0);
      const spent=ws.reduce((s,d)=>s+weekSpending(d),0);
      const sav=ws.reduce((s,d)=>s+weekSavedAmt(d),0);
      const left=ws.reduce((s,d)=>s+weekLeftover(d),0);
      L.push('| '+m+' | '+ws.length+' | '+money(inc)+' | '+money(spent)+' | '+money(sav)+' | '+money(left)+' | '+(inc>0?r2(sav/inc*100).toFixed(1)+'%':'—')+' |');
    });
    L.push('');

    // ── Per-category detail — the point of the whole export ──
    // Actuals come from each category's own weekly cells and the target from its own budget
    // field, so a category added later (Groceries, anything) appears here complete with no
    // code change and no name matching. A blank target means one was genuinely never set,
    // which is worth the AI knowing rather than papering over with a zero.
    const RECENT=4;
    const statsOf=v=>({avg:avg(v), min:Math.min.apply(null,v), max:Math.max.apply(null,v), recent:avg(v.slice(-RECENT))});

    // One table per type. `read(weekRecord, cat)` isolates the only thing that differs between
    // income / fixed / variable — how a single category's amount is pulled out of a week.
    function catSection(heading, cats, read, planTotal){
      if(!cats.length) return;
      const rows=cats.map(c=>{
        const v=weekKeys.map(k=>read(budgetData[k], c));
        const unset=(c.budget==null||c.budget==='')&&c.default==null;
        return {c, v, s:statsOf(v), t:unset?null:catBudget(c)};
      });
      const total=rows.reduce((a,r)=>a+r.s.avg,0);
      L.push('#### '+heading);
      L.push('');
      L.push('| Category | Avg/wk | Share | Last '+RECENT+'wk | Min–max | Target | vs target |');
      L.push('| --- | --- | --- | --- | --- | --- | --- |');
      rows.forEach(r=>{
        L.push('| '+md(r.c.name)+' | '+money(r.s.avg)+' | '+(total>0?r2(r.s.avg/total*100).toFixed(0)+'%':'—')+' | '+
          money(r.s.recent)+' | '+money(r.s.min)+'–'+money(r.s.max)+' | '+
          (r.t==null?'—':money(r.t))+' | '+(r.t==null?'—':(r.s.avg-r.t>0?'+':'')+money(r.s.avg-r.t))+' |');
      });
      L.push('| **Total** | **'+money(total)+'** | 100% | '+money(rows.reduce((a,r)=>a+r.s.recent,0))+' | — | **'+money(planTotal)+'** | **'+
        (total-planTotal>0?'+':'')+money(total-planTotal)+'** |');
      L.push('');
      // A missing target is a real gap in the user's setup, so name it — setting one is
      // exactly the kind of thing next month's plan should include.
      const noTarget=rows.filter(r=>r.t==null).map(r=>r.c.name);
      if(noTarget.length){
        L.push('- No weekly budget set for: '+noTarget.map(md).join(', ')+'. Suggest one based on the actuals above.');
        L.push('');
      }
      return rows;
    }

    L.push('### Spending by category (per week)');
    L.push('');
    catSection('Income', incCats, (d,c)=>parseFloat(d['inc_'+c.id])||0, configIncomeTotal());
    const fixRows=catSection('Fixed', fixCats, (d,c)=>fixActual(d,c), configFixedTotal());
    const varRows=catSection('Variable', varCats, (d,c)=>varActual(d,c), configVariableTotal());

    // Full weekly series per category — the raw numbers behind every average above, so the
    // review can spot a one-off blowout rather than reading a lifted mean as a habit.
    const seriesRows=[].concat(fixRows||[], varRows||[]).filter(r=>r.s.max>0);
    if(seriesRows.length){
      L.push('### Weekly series by expense category');
      L.push('');
      L.push('Weeks in order, '+weekKeys[0]+' → '+weekKeys[weekKeys.length-1]+'.');
      L.push('');
      seriesRows.forEach(r=>L.push('- **'+md(r.c.name)+'**: '+r.v.map(n=>r2(n)).join(' · ')));
      L.push('');
    }
  }

  // (Subscriptions used to get their own section here. They're fixed categories now, so they
  // already appear in the Fixed table above — listing them twice would read as double spend.)

  // ── Accounts ──
  L.push('## Accounts & net worth');
  L.push('');
  if(!accounts.length){
    L.push('_No accounts set up._');
    L.push('');
  } else {
    L.push('| Account | Type | Current |');
    L.push('| --- | --- | --- |');
    accounts.forEach(a=>L.push('| '+md(a.name)+' | '+(a.type==='debt'?'Debt':(acctIsSaver(a)?'Asset (savers — parked, not for clearing debt)':'Asset'))+' | '+money(parseFloat(a.current)||0)+' |'));
    L.push('');
    L.push('Assets '+money(accountsAssetsTotal())+' · debts '+money(accountsDebtsTotal())+' · **net worth '+money(accountsAssetsTotal()-accountsDebtsTotal())+'**');
    // Savers are money deliberately parked to earn interest, so the honest "could I clear my
    // debts today" figure holds them back. Without this the AI would count them as available.
    const _sav=(typeof accountsSaverTotal==='function')?accountsSaverTotal():0;
    if(_sav>0){
      const _pos=accountsPayoffPosition();
      L.push('');
      L.push('Of those assets, '+money(_sav)+' sits in savers accounts I do not want to raid to clear debt. '+
        'Debt payoff position (assets − savers − debts) is **'+money(_pos)+'** — '+
        (_pos>=0?'covered, with that much spare.':'I am short by '+money(Math.abs(_pos))+'.'));
    }
    L.push('');
    // Balance history within the window, so the AI can see the trend rather than one number.
    accounts.forEach(a=>{
      const h=(a.history||[]).filter(e=>e&&e.date>=start&&e.date<=today).sort((x,y)=>x.date<y.date?-1:1);
      if(!h.length) return;
      L.push('**'+md(a.name)+'** balance history: '+h.map(e=>e.date+' '+money(parseFloat(e.balance)||0)).join(' · '));
      L.push('');
    });
  }

  // ── Workouts ──
  const sessions=S.sessions.filter(s=>s&&s.date>=start&&s.date<=today).sort((a,b)=>a.date<b.date?-1:1);
  // Warmups carry no training load — volume counts working sets only.
  const sessVolume=s=>s.exercises.reduce((t,ex)=>t+ex.sets.reduce((v,st)=>v+(st.type==='warmup'?0:(parseFloat(st.weight)||0)*(parseFloat(st.reps)||0)),0),0);
  L.push('## Workouts');
  L.push('');
  if(!sessions.length){
    L.push('_No sessions logged in this window._');
    L.push('');
  } else {
    const totalVol=sessions.reduce((s,x)=>s+sessVolume(x),0);
    const mins=sessions.reduce((s,x)=>s+(parseFloat(x.duration)||0),0);
    const spanWeeks=Math.max(1,Math.round((localMidnight(today)-localMidnight(start))/6048e5));
    L.push('- Sessions: '+sessions.length+' ('+r2(sessions.length/spanWeeks).toFixed(1)+'/week over '+spanWeeks+' weeks)');
    L.push('- Total working volume: '+Math.round(totalVol).toLocaleString()+' kg');
    if(mins) L.push('- Total logged time: '+Math.round(mins)+' min (avg '+Math.round(mins/sessions.length)+' min/session)');
    L.push('');

    const byMonthS={};
    sessions.forEach(s=>{ (byMonthS[monthOf(s.date)]=byMonthS[monthOf(s.date)]||[]).push(s); });
    L.push('### Monthly training');
    L.push('');
    L.push('| Month | Sessions | Volume (kg) | Avg effort |');
    L.push('| --- | --- | --- | --- |');
    Object.keys(byMonthS).sort().forEach(m=>{
      const ss=byMonthS[m];
      const eff=ss.map(s=>parseFloat(s.effort)).filter(n=>!isNaN(n));
      L.push('| '+m+' | '+ss.length+' | '+Math.round(ss.reduce((t,s)=>t+sessVolume(s),0)).toLocaleString()+' | '+(eff.length?r2(avg(eff)).toFixed(1):'—')+' |');
    });
    L.push('');

    L.push('### Session type frequency');
    L.push('');
    const byType={};
    sessions.forEach(s=>{ byType[s.sessionType]=(byType[s.sessionType]||0)+1; });
    Object.keys(byType).sort((a,b)=>byType[b]-byType[a]).forEach(t=>L.push('- '+md(t)+': '+byType[t]+' sessions'));
    L.push('');

    // Progression = heaviest working set first vs last time each movement was trained.
    L.push('### Per-exercise progression (top working set)');
    L.push('');
    L.push('| Exercise | Sessions | First | Latest | Change |');
    L.push('| --- | --- | --- | --- | --- |');
    const byEx={};
    sessions.forEach(s=>s.exercises.forEach(ex=>{
      const working=ex.sets.filter(st=>st.type!=='warmup'&&(parseFloat(st.weight)||0)>0);
      if(!working.length) return;
      const top=working.reduce((a,b)=>((parseFloat(b.weight)||0)>(parseFloat(a.weight)||0)?b:a));
      (byEx[ex.name]=byEx[ex.name]||[]).push({date:s.date, weight:parseFloat(top.weight)||0, reps:parseInt(top.reps)||0});
    }));
    Object.keys(byEx).sort((a,b)=>byEx[b].length-byEx[a].length).forEach(name=>{
      const h=byEx[name].sort((a,b)=>a.date<b.date?-1:1);
      const f=h[0], l=h[h.length-1], diff=l.weight-f.weight;
      L.push('| '+md(name)+' | '+h.length+' | '+f.weight+'kg×'+f.reps+' ('+f.date+') | '+l.weight+'kg×'+l.reps+' ('+l.date+') | '+(diff>0?'+':'')+r2(diff)+'kg |');
    });
    L.push('');
  }

  // ── Body & habits ──
  const weights=(S.weights||[]).filter(w=>w&&w.date>=start&&w.date<=today).sort((a,b)=>a.date<b.date?-1:1);
  if(weights.length){
    L.push('## Bodyweight');
    L.push('');
    const f=weights[0], l=weights[weights.length-1];
    L.push('- Start '+f.weight+' kg ('+f.date+') → latest '+l.weight+' kg ('+l.date+'), change '+(l.weight-f.weight>0?'+':'')+r2(l.weight-f.weight)+' kg over '+weights.length+' weigh-ins');
    if(typeof weightGoal==='object'&&weightGoal&&weightGoal.target) L.push('- Target: '+weightGoal.target+' kg'+(weightGoal.date?' by '+weightGoal.date:''));
    L.push('');
    L.push('Log: '+weights.map(w=>w.date+' '+w.weight+'kg').join(' · '));
    L.push('');
  }

  const hLog=(typeof habitsLog==='object'&&habitsLog)?habitsLog:loadHabitsLog();
  const hDays=Object.keys(hLog).filter(d=>d>=start&&d<=today);
  if(hDays.length&&habitsData.length){
    L.push('## Habits');
    L.push('');
    L.push('| Habit | Days completed | Rate |');
    L.push('| --- | --- | --- |');
    habitsData.forEach((h,i)=>{
      const n=hDays.filter(d=>Array.isArray(hLog[d])&&hLog[d].indexOf(i)>=0).length;
      L.push('| '+md(h)+' | '+n+' / '+hDays.length+' | '+r2(n/hDays.length*100).toFixed(0)+'% |');
    });
    L.push('');
  }

  return L.join('\n');
}
function exportAIReport(){
  const sel=document.getElementById('ai-export-range');
  const months=parseInt(sel&&sel.value,10)||1;
  const text=buildAIReviewMarkdown(months);
  const blob=new Blob([text],{type:'text/markdown'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='daily-ai-review-'+months+'m-'+getLocalDate()+'.md';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
// Clipboard path — on iOS "download a .md" is awkward, pasting into a chat is not.
function copyAIReport(){
  const sel=document.getElementById('ai-export-range');
  const months=parseInt(sel&&sel.value,10)||1;
  const text=buildAIReviewMarkdown(months);
  const done=()=>{ if(typeof showToast==='function') showToast('Report copied — paste it into your AI chat'); };
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done).catch(()=>fallbackCopy(text,done));
  } else fallbackCopy(text,done);
}
function fallbackCopy(text,done){
  const ta=document.createElement('textarea');
  ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand('copy'); done(); }catch(e){ alert('Could not copy automatically.'); }
  ta.remove();
}

// ── Budget constants (fallback defaults) ──────────────────────────
// Still referenced by loadFixCats defaults (fine/subs/gym/transport) and the Section-2 budget
// targets (food/pub/personal). DEFAULT_SAVINGS and the old 8-key BUD_CATS list were removed —
// both were dead (the live categories come from loadFixCats/loadVarCats and per-week data).
const DEFAULT_FINE      = 25;
const DEFAULT_SUBS      = 17;
const DEFAULT_GYM       = 27;
const DEFAULT_TRANSPORT = 50;
const DEFAULT_FOOD      = 70;
const DEFAULT_PUB       = 100;
const DEFAULT_PERSONAL  = 60;
const BUD_DONUT_COLOURS = [
  '#FF6B35','rgba(255,107,53,.6)','rgba(255,107,53,.35)',
  '#52B788','#3B82F6','#8B5CF6','#f59e0b','#ec4899',
];

// ── Budget state ──────────────────────────────────────────────────
let currentWeekIdx     = 0;
let currentMonthOffset = 0;
let budgetView         = 'week';
let budgetData         = budLoadData();
let budDefaults        = budLoadDefaults();
// ── Unified budget config (single source of truth) ───────────────
// daily_budget_config = { incomeStreams[], fixedExpenses[], variableExpenses[] }
function loadBudgetConfig(){
  try{
    const c=JSON.parse(localStorage.getItem('daily_budget_config')||'null');
    if(c&&Array.isArray(c.incomeStreams)&&Array.isArray(c.fixedExpenses)&&Array.isArray(c.variableExpenses)) return c;
  }catch(e){}
  // Build defaults, migrating any pre-existing (separate) income streams
  let income=null;
  try{ const s=JSON.parse(localStorage.getItem('daily_income_streams')||'null'); if(Array.isArray(s)&&s.length) income=s; }catch(e){}
  const bd=(typeof budDefaults==='object'&&budDefaults)?budDefaults:{};
  return {
    incomeStreams: income || [
      {id:'1',name:'Fujifilm',weeklyAmount:507},
      {id:'2',name:"McDonald's",weeklyAmount:278},
    ],
    fixedExpenses: [
      {id:'f1',name:'Fine payment',weeklyAmount:bd.fine??25},
      {id:'f2',name:'Subscriptions',weeklyAmount:bd.subs??17},
      {id:'f3',name:'Transport',weeklyAmount:bd.transport??50},
      {id:'f4',name:'Gym',weeklyAmount:bd.gym??27},
    ],
    variableExpenses: [
      {id:'v1',name:'Food / Social',weeklyAmount:150},
      {id:'v2',name:'Personal / Misc',weeklyAmount:68},
    ],
  };
}
let budgetConfig = loadBudgetConfig();
let incomeStreams = budgetConfig.incomeStreams; // legacy alias kept in sync
function saveBudgetConfig(cfg){
  cfg.updatedAt = Date.now(); // stamp so the cloud pull can tell "older" from "newer" (Prompt 26)
  budgetConfig = cfg;
  incomeStreams = cfg.incomeStreams;
  localStorage.setItem('daily_budget_config', JSON.stringify(cfg));
  localStorage.removeItem('daily_income_streams'); // consolidate — no separate key
  if(firebaseReady&&auth&&auth.currentUser&&db){
    db.ref('users/'+auth.currentUser.uid+'/budgetConfig').set(cfg);
  }
}
// Legacy shims (older code paths still reference these names)
function loadIncomeStreams(){ return budgetConfig.incomeStreams; }
function saveIncomeStreams(){ saveBudgetConfig(budgetConfig); }
function cfgSum(arr){ return (arr||[]).reduce((a,i)=>a+(parseFloat(i.weeklyAmount)||0),0); }
// Planned weekly totals. The categories own the targets now, so these sum catBudget() —
// except during onboarding, where the categories don't exist yet and budgetConfig is still
// the live capture buffer for what the user is typing.
function planTotal(type){
  return localStorage.getItem(BUD_CAT_KEY[type])!=null
    ? catBudgetTotal(type)
    : cfgSum(budgetConfig[BUD_CFG_KEY[type]]);
}
function configIncomeTotal(){ return planTotal('inc'); }
function configFixedTotal(){ return planTotal('fix'); }
function configVariableTotal(){ return planTotal('var'); }

// ── Generic line-item editing (Budget tab + Settings share these) ─
function addBudgetItem(type){
  const prefix=type==='incomeStreams'?'i':type==='fixedExpenses'?'f':'v';
  if(!Array.isArray(budgetConfig[type])) budgetConfig[type]=[];
  budgetConfig[type].push({id:prefix+Date.now(),name:'',weeklyAmount:0});
  saveBudgetConfig(budgetConfig);
  refreshBudgetUI();
}
function deleteBudgetItem(type,id){
  if(!Array.isArray(budgetConfig[type])||budgetConfig[type].length<=1) return;
  budgetConfig[type]=budgetConfig[type].filter(x=>x.id!==id);
  saveBudgetConfig(budgetConfig);
  refreshBudgetUI();
}
function updateBudgetItem(type,id,field,val){
  const it=(budgetConfig[type]||[]).find(x=>x.id===id);
  if(!it) return;
  it[field]= field==='weeklyAmount' ? (parseFloat(val)||0) : val;
  saveBudgetConfig(budgetConfig);
  refreshBudgetUI();
}
function refreshBudgetUI(){
  if(S.view==='budget') renderBudgetTab();
  if(S.view==='home') renderHome();
  // Keep the structural editors that share these handlers in sync when they're open, so
  // "+ Add item" / delete visibly update their lists (they aren't the Budget tab or Home).
  const be=document.getElementById('view-budget-editor');
  if(be && be.style.display!=='none' && typeof renderBudgetEditor==='function') renderBudgetEditor();
  if(document.getElementById('ob-inc-list')){ renderBudgetEditList('ob-inc-list','incomeStreams'); renderBudgetEditList('ob-fix-list','fixedExpenses'); }
}
function renderBudgetEditList(containerId,type){
  const el=document.getElementById(containerId);
  if(!el) return;
  const items=budgetConfig[type]||[];
  el.innerHTML=items.map(it=>
    '<div class="bud-edit-row">'+
      '<input class="bud-edit-name" value="'+(it.name||'').replace(/"/g,'&quot;')+'" placeholder="Name" onchange="updateBudgetItem(\''+type+'\',\''+it.id+'\',\'name\',this.value)">'+
      '<input class="bud-edit-amt" type="number" inputmode="decimal" value="'+(it.weeklyAmount??'')+'" placeholder="0" onchange="updateBudgetItem(\''+type+'\',\''+it.id+'\',\'weeklyAmount\',this.value)">'+
      '<button class="bud-edit-del" title="Remove" onclick="deleteBudgetItem(\''+type+'\',\''+it.id+'\')">🗑️</button>'+
    '</div>'
  ).join('')+
    '<button class="bud-add-item" onclick="addBudgetItem(\''+type+'\')">+ Add item</button>';
}

// ── Category budget editor (Settings → Budget categories) ─────────
// Edits the live categories themselves — the same list the Budget tab enters weekly amounts
// against — so a category added in either place carries its target everywhere and the two
// can no longer drift. Ids are never rewritten, so saved weekly history stays attached.
const CAT_TYPE_LABEL={inc:'income source', fix:'fixed expense', var:'variable expense'};
function renderCatBudgetList(containerId, type){
  const el=document.getElementById(containerId); if(!el) return;
  const cats=BUD_CAT_LOAD[type]?BUD_CAT_LOAD[type]():[];
  // Only fixed expenses get a billing cycle: variable spend is per-week by definition, and
  // income is entered per pay against the week it lands in.
  const cycles=type==='fix';
  el.innerHTML=cats.map(c=>{
    const amt=cycles?catAmount(c):(c.budget??'');
    const cyc=catCycle(c);
    const weekly=catBudget(c);
    const row=
      '<div class="bud-edit-row">'+
        (cycles?catIconHtml(c,26):'')+
        '<input class="bud-edit-name" value="'+_catEsc(c.name||'')+'" placeholder="Name" '+
          'onchange="catUpdateField(\''+type+'\',\''+c.id+'\',\'name\',this.value)">'+
        '<input class="bud-edit-amt" type="number" inputmode="decimal" value="'+(amt===''?'':amt)+'" placeholder="0" '+
          'onchange="catUpdateField(\''+type+'\',\''+c.id+'\',\''+(cycles?'amount':'budget')+'\',this.value)">'+
        (cycles?'<select class="bud-edit-cycle" onchange="catUpdateField(\''+type+'\',\''+c.id+'\',\'cycle\',this.value)">'+
          CAT_CYCLES.map(o=>'<option value="'+o.id+'"'+(o.id===cyc?' selected':'')+'>'+o.suffix+'</option>').join('')+
        '</select>':'')+
        '<button class="bud-edit-del" title="Remove" onclick="catRemoveItem(\''+type+'\',\''+c.id+'\')">🗑️</button>'+
      '</div>';
    // Second line: website (fixed only, drives the logo), the weekly conversion, and the
    // move control — which carries saved history with it rather than stranding it.
    const moveOpts=['inc','fix','var'].filter(t=>t!==type)
      .map(t=>'<option value="'+t+'">→ '+CAT_TYPE_PLURAL[t]+'</option>').join('');
    const sub=
      '<div class="bud-edit-sub">'+
        (cycles?'<input class="bud-edit-site" value="'+_catEsc(c.site||'')+'" placeholder="website (e.g. stan.com.au) — optional" '+
          'onchange="catUpdateField(\''+type+'\',\''+c.id+'\',\'site\',this.value)">':'<span class="bud-edit-spacer"></span>')+
        ((cycles&&cyc!=='weekly'&&weekly>0)?'<span class="bud-edit-hint">≈ $'+weekly.toFixed(2)+'/wk</span>':'')+
        '<select class="bud-edit-move" onchange="catMoveTo(\''+type+'\',\''+c.id+'\',this.value)" aria-label="Move category">'+
          '<option value="">Move…</option>'+moveOpts+
        '</select>'+
      '</div>';
    return row+sub;
  }).join('')+
    '<button class="bud-add-item" onclick="catAddItem(\''+type+'\')">+ Add '+CAT_TYPE_LABEL[type]+'</button>';
}
function catUpdateField(type,id,field,val){
  const cats=BUD_CAT_LOAD[type](); const c=cats.find(x=>x.id===id); if(!c) return;
  // Empty stays empty rather than becoming 0 — "no target set" and "target of zero" are
  // different things, and only the first should leave the field blank next time.
  c[field]= (field==='budget'||field==='amount') ? (String(val).trim()===''?'':(parseFloat(val)||0)) : val;
  // `budget` is the weekly figure the rest of the app reads, so keep it derived from the
  // billed amount + cycle rather than asking anything downstream to understand cycles.
  if(type==='fix'&&(field==='amount'||field==='cycle')){
    const a=catAmount(c);
    c.budget=(a===''||a==null)?'':catWeeklyFromAmount(a,catCycle(c));
  }
  BUD_CAT_SAVE[type](cats);
  refreshCatBudgetUI();
}
function catAddItem(type){
  const cats=BUD_CAT_LOAD[type]();
  const item={id:genCatId(type), name:'', budget:''};
  if(type==='fix'){ item.amount=''; item.cycle='weekly'; }
  cats.push(item);
  BUD_CAT_SAVE[type](cats);
  refreshCatBudgetUI();
}
// ── Move a category between income / fixed / variable ─────────────
// Recategorising by hand (delete here, re-add there) silently strands every saved week's
// amount: the data stays in storage under the old `fix_<id>` key but nothing reads it, so
// past weeks quietly drop that spend and the history rewrites itself. This moves the
// per-week values across with the category so nothing is lost.
const CAT_TYPE_PLURAL={inc:'Income', fix:'Fixed expenses', var:'Variable expenses'};
function catMoveTo(fromType,id,toType){
  if(!toType||toType===fromType||!BUD_CAT_LOAD[toType]){ refreshCatBudgetUI(); return; }
  const fromCats=BUD_CAT_LOAD[fromType]();
  const cat=fromCats.find(c=>c.id===id);
  if(!cat){ refreshCatBudgetUI(); return; }
  const toCats=BUD_CAT_LOAD[toType]();
  // Ids only have to be unique within their own list, so the same id can already exist in
  // the destination — mint a fresh one rather than colliding with someone else's history.
  const newId=toCats.some(c=>c.id===id)?genCatId(toType):id;
  const fromKey=fromType+'_'+id, toKey=toType+'_'+newId;
  const weeks=Object.keys(budgetData).filter(k=>budgetData[k]&&budgetData[k][fromKey]!==undefined);

  const label=catDisplayName(cat.name)||'this category';
  let msg='Move “'+label+'” to '+CAT_TYPE_PLURAL[toType]+'?';
  if(weeks.length) msg+='\n\n'+weeks.length+' saved week'+(weeks.length===1?'':'s')+' of history will move with it.';
  // Leaving Fixed means losing the blank-row fallback: fixed treats an empty week as "the
  // usual amount", variable treats it as nothing spent. Worth stating plainly — it changes
  // what a forgotten week costs you.
  if(fromType==='fix'&&toType==='var'){
    msg+='\n\nHeads up: as a variable expense, a week you don’t fill in counts as $0 instead of the usual $'+catBudget(cat).toFixed(2)+'.';
    if(catIsRecurring(cat)) msg+='\nIts '+catCycle(cat)+' billing will also stop being spread across weeks automatically.';
  }
  if(!confirm(msg)){ refreshCatBudgetUI(); return; }

  weeks.forEach(k=>{ const d=budgetData[k]; d[toKey]=d[fromKey]; delete d[fromKey]; d.updatedAt=Date.now(); });

  const moved={id:newId, name:cat.name, budget:cat.budget};
  if(cat.site) moved.site=cat.site;
  if(cat.default!=null) moved.default=cat.default;
  // Cycles only exist on fixed expenses; arriving there needs one, leaving drops it so a
  // stale cycle can't linger on a category that no longer prorates.
  if(toType==='fix'){
    moved.amount=(cat.amount!=null&&cat.amount!=='')?cat.amount:(cat.budget??'');
    moved.cycle=catCycle(cat);
  }
  BUD_CAT_SAVE[fromType](fromCats.filter(c=>c.id!==id));
  toCats.push(moved);
  BUD_CAT_SAVE[toType](toCats);
  // One write + one full cloud set for the whole move, rather than N per-week syncs.
  if(weeks.length) budSaveData();
  refreshCatBudgetUI();
}
function catRemoveItem(type,id){
  const cats=BUD_CAT_LOAD[type]();
  if(cats.length<=1) return;   // never leave a section with nothing to enter against
  // Deleting a category removes it from the LIST only — every week's saved amount stays in
  // storage under `<type>_<id>`. Nothing reads those keys once the category is gone, so past
  // weeks silently lose that income/spend and look wrong (see budScanOrphans, which finds
  // them again). Warn while the money is still attributable to a name.
  const stranded=budCountStrandedFor(type,id);
  if(stranded.weeks && !confirm(
      'Delete "'+(cats.find(c=>c.id===id)||{}).name+'"?\n\n'+
      stranded.weeks+' past week'+(stranded.weeks===1?'':'s')+' still hold '+fmtMoney(stranded.total)+
      ' against it. That figure is kept, not erased, but it stops counting towards those weeks '+
      'until you restore the category from Budget → Stranded data.')) return;
  BUD_CAT_SAVE[type](cats.filter(c=>c.id!==id));
  refreshCatBudgetUI();
}
// ── Unnamed categories ─────────────────────────────────────────────
// catAddItem creates a category with name:'' and it persists whether or not it's ever named,
// so tapping "+ Add category" and backing out leaves a permanent row. Those rows surfaced as
// raw machine ids ("var_1784718952875") in the Income and Variable spending breakdowns.
// A name that IS the id counts as unnamed too — nothing legitimate is called var_1784718952875.
const CAT_ID_SHAPE=/^(inc|fix|var)_\d{10,}$/;
function catIsUnnamed(c){
  const n=String((c&&c.name)||'').trim();
  return !n || n===c.id || CAT_ID_SHAPE.test(n);
}
// Never render a machine id as a label.
// Distinct from catDisplayName(name), which strips a decorative emoji prefix off a name
// string. This takes the CATEGORY and answers "what should this row be called", so a
// machine id never reaches a label.
function catLabel(c){ return catIsUnnamed(c) ? 'Other' : catDisplayName(c.name); }
// Removes unnamed categories that hold no money anywhere. Any that DO hold money are renamed
// to "Other" instead of deleted — deleting one would strand its amounts (see budScanOrphans),
// which is the very bug this must not cause.
// ── Archived categories ────────────────────────────────────────────
// A category you've finished with (a job you left, a spend you no longer have) shouldn't sit
// in the entry lists collecting blank rows — but deleting it strands every past week's amount
// (see budScanOrphans). Archiving keeps the record and drops the row: loadXCats() still
// returns it, so every history and total path counts it unchanged, and only the entry UI
// filters it out.
function catIsArchived(c){ return !!(c && c.archived); }
function activeCats(list){ return (list||[]).filter(c=>!catIsArchived(c)); }
function catArchive(type,id,on){
  const load={inc:loadIncCats,fix:loadFixCats,var:loadVarCats}[type];
  const save={inc:saveIncCats,fix:saveFixCats,var:saveVarCats}[type];
  if(!load||!save) return;
  const cats=load();
  const c=cats.find(x=>x.id===id); if(!c) return;
  // Never archive the last remaining active category — the section needs somewhere to type.
  if(on && activeCats(cats).length<=1) return;
  if(on) c.archived=true; else delete c.archived;
  save(cats);
  refreshCatBudgetUI();
}
// Fold each source category's per-week amounts into the target's key and clear the source.
// Amounts are ADDED, never overwritten, so a merge cannot lose money.
function budMergeCatsInto(type,targetId,sourceIds){
  if(!sourceIds.length) return;
  const tk=type+'_'+targetId;
  Object.keys(budgetData||{}).forEach(wk=>{
    const d=budgetData[wk]; if(!d||typeof d!=='object') return;
    sourceIds.forEach(sid=>{
      const sk=type+'_'+sid;
      if(!(sk in d)) return;
      const sv=parseFloat(d[sk]);
      if(!isNaN(sv)&&sv!==0) d[tk]=String((parseFloat(d[tk])||0)+sv);
      delete d[sk];
    });
  });
  budSaveData();
}
// Junk categories: an unnamed row (never named after "+ Add category"), or an "Other" left by
// an earlier version of this cleanup. Holding money decides the outcome, never the name:
//   holds money → ARCHIVED, so past weeks still add up but no row appears
//   holds none  → deleted outright, since there is nothing to preserve
function budCleanupUnnamedCats(){
  let removed=0, archived=0;
  [['inc',loadIncCats,saveIncCats],['fix',loadFixCats,saveFixCats],['var',loadVarCats,saveVarCats]]
  .forEach(([type,load,save])=>{
    const cats=load();
    const before=JSON.stringify(cats);
    const isJunk=c=>catIsUnnamed(c)||String(c.name||'').trim().toLowerCase()==='other';
    const junk=cats.filter(c=>isJunk(c)&&!catIsArchived(c));
    if(!junk.length) return;

    const keep=[];
    cats.forEach(c=>{
      if(!isJunk(c)||catIsArchived(c)){ keep.push(c); return; }
      if(budCountStrandedFor(type,c.id).weeks>0){
        c.archived=true;
        if(!String(c.name||'').trim()) c.name='Former '+({inc:'income',fix:'expense',var:'spending'}[type]);
        archived++; keep.push(c);
      } else {
        // No money anywhere, so nothing to keep — drop the row and any zero-value keys.
        Object.keys(budgetData||{}).forEach(wk=>{
          const d=budgetData[wk]; if(d&&typeof d==='object') delete d[type+'_'+c.id];
        });
        removed++;
      }
    });
    // Never leave a section with no active row to type into.
    if(!activeCats(keep).length){
      const revive=keep[0]||cats[0];
      if(revive){ delete revive.archived; if(!String(revive.name||'').trim()) revive.name='Other';
        if(keep.indexOf(revive)<0) keep.push(revive); archived--; }
    }
    if(JSON.stringify(keep)!==before && keep.length){ budSaveData(); save(keep); }
  });
  return {removed,archived};
}
function budCleanupUnnamedCatsOnce(){
  // Versioned: v1 renamed junk rows to "Other" and could leave several of them, so a device
  // that already ran it still needs the archive-or-delete pass.
  if(localStorage.getItem('daily_budget_unnamed_cleaned')==='2') return;
  try{ budCleanupUnnamedCats(); }catch(e){}
  localStorage.setItem('daily_budget_unnamed_cleaned','2');
}

// ── Stranded week data ─────────────────────────────────────────────
// weekIncome/weekSpending only sum the categories that currently EXIST, so a deleted
// category's saved amounts stop counting and the affected weeks read as over budget. The
// values are never actually deleted — budWriteFields only ever assigns keys for live
// categories, it never prunes — so this finds them and can reattach them.
function budCountStrandedFor(type,id){
  let weeks=0,total=0;
  Object.keys(budgetData||{}).forEach(wk=>{
    const d=budgetData[wk]; if(!d||typeof d!=='object') return;
    const v=parseFloat(d[type+'_'+id]);
    if(!isNaN(v)&&v!==0){ weeks++; total+=v; }
  });
  return {weeks,total};
}
function budScanOrphans(){
  const known={inc:new Set(loadIncCats().map(c=>c.id)),
               fix:new Set(loadFixCats().map(c=>c.id)),
               var:new Set(loadVarCats().map(c=>c.id))};
  const found={};
  Object.keys(budgetData||{}).forEach(wk=>{
    const d=budgetData[wk]; if(!d||typeof d!=='object') return;
    Object.keys(d).forEach(k=>{
      const m=k.match(/^(inc|fix|var)_(.+)$/); if(!m) return;
      const type=m[1], id=m[2];
      // var_goal is the week's spending goal, not a category amount.
      if(type==='var'&&id==='goal') return;
      if(known[type].has(id)) return;
      const v=parseFloat(d[k]); if(isNaN(v)||v===0) return;
      const key=type+'_'+id;
      if(!found[key]) found[key]={type,id,weeks:0,total:0,firstWeek:wk,lastWeek:wk};
      const f=found[key];
      f.weeks++; f.total+=v;
      if(wk<f.firstWeek) f.firstWeek=wk;
      if(wk>f.lastWeek)  f.lastWeek=wk;
    });
  });
  return Object.values(found).sort((a,b)=>b.total-a.total);
}
// Re-create the category under its ORIGINAL id, which is what reattaches the saved amounts.
function budRestoreOrphan(type,id){
  const load={inc:loadIncCats,fix:loadFixCats,var:loadVarCats}[type];
  const save={inc:saveIncCats,fix:saveFixCats,var:saveVarCats}[type];
  if(!load||!save) return;
  const cats=load();
  if(cats.some(c=>c.id===id)) return;
  const name=(prompt('Name for this restored category?', id)||'').trim();
  if(!name) return;
  const item={id,name,budget:''};
  if(type==='fix'){ item.amount=''; item.cycle='weekly'; }
  cats.push(item); save(cats);
  refreshCatBudgetUI();
  if(typeof showToast==='function') showToast('Restored "'+name+'" — past weeks now count it again');
}
function budDiscardOrphan(type,id){
  const s=budCountStrandedFor(type,id);
  if(!confirm('Permanently delete '+fmtMoney(s.total)+' of saved data across '+s.weeks+' week'+(s.weeks===1?'':'s')+'?\n\nThis cannot be undone.')) return;
  Object.keys(budgetData||{}).forEach(wk=>{ const d=budgetData[wk]; if(d&&typeof d==='object') delete d[type+'_'+id]; });
  budSaveData();
  refreshCatBudgetUI();
}
// Only rendered when something is actually stranded, so it stays invisible in normal use.
function renderStrandedCard(){
  const orphans=budScanOrphans();
  if(!orphans.length) return '';
  const label={inc:'Income',fix:'Fixed',var:'Variable'};
  return '<div class="card" data-bud-key="stranded">'+
    '<div class="sec-label bud-toggle"><span class="bud-head-label">⚠️ Stranded data</span>'+
      '<span class="bud-head-right">'+BUD_CHEVRON+'</span></div>'+
    '<div style="font-size:12.5px;color:var(--muted);line-height:1.5;margin-bottom:10px">'+
      'These amounts are saved against past weeks but their category was deleted, so they no '+
      'longer count towards those weeks. Restore a category to make its weeks add up again.</div>'+
    orphans.map(o=>
      '<div class="bud-row">'+
        '<div class="bud-row-left">'+
          '<div class="bud-row-name">'+label[o.type]+' · '+_catEscHtml(o.id)+'</div>'+
          '<div class="bud-row-budget">'+fmtMoney(o.total)+' across '+o.weeks+' week'+(o.weeks===1?'':'s')+' · '+o.firstWeek+' to '+o.lastWeek+'</div>'+
        '</div>'+
        '<div style="display:flex;gap:6px;flex-shrink:0">'+
          '<button class="bud-edit-btn" onclick="budRestoreOrphan(\''+o.type+'\',\''+o.id+'\')">Restore</button>'+
          '<button class="bud-edit-btn" style="color:var(--danger);border-color:var(--danger)" onclick="budDiscardOrphan(\''+o.type+'\',\''+o.id+'\')">Discard</button>'+
        '</div>'+
      '</div>').join('')+
  '</div>';
}
function refreshCatBudgetUI(){
  const be=document.getElementById('view-budget-editor');
  if(be && be.style.display!=='none' && typeof renderBudgetEditor==='function') renderBudgetEditor();
  if(S.view==='budget') renderBudgetTab();
  if(S.view==='home') renderHome();
}


// ── Per-week snapshot accessors (history reads these; legacy fallback) ─
function weekIncome(d){
  if(!d) return 0;
  if(d.snapshot&&typeof d.snapshot==='object') return parseFloat(d.snapshot.income)||0;
  if(d.income&&typeof d.income==='object'){
    return Object.values(d.income).reduce((a,v)=>a+(parseFloat(v)||0),0);
  }
  // Sum the dynamic income sources (ids fuji/mcd map onto legacy d.inc_fuji / d.inc_mcd)
  return loadIncCats().reduce((s,c)=>s+(parseFloat(d['inc_'+c.id])||0),0);
}
function weekSpending(d){
  if(d&&d.snapshot) return (parseFloat(d.snapshot.fixed)||0)+(parseFloat(d.snapshot.variable)||0);
  // Sum across the user's dynamic fixed + variable categories
  return weekFixedTotal(d)+weekVarTotal(d);
}
function weekSavedAmt(d){
  if(!d) return 0;
  // New free-input model: the saved total is exactly what was entered for the week
  if(d.sav_amount!==undefined&&d.sav_amount!=='') return parseFloat(d.sav_amount)||0;
  if(d.snapshot) return parseFloat(d.snapshot.saved)||0;
  // Legacy "extra" field (old target+extra model) — no target is added anymore, so it's just
  // whatever extra was recorded. Genuine legacy weeks were frozen to sav_amount by recoverBudgetData.
  if(d.sav_extra!==undefined) return parseFloat(d.sav_extra)||0;
  return 0;
}
function weekLeftover(d){
  if(d&&d.snapshot) return parseFloat(d.snapshot.leftover)||0;
  return weekIncome(d)-weekSpending(d)-weekSavedAmt(d);
}
let savingsLog         = loadSavingsLog();
// ── Credit-card balance history (dated; drives the Finance net-worth line) ──
function loadCCLog(){ return lsLoad('daily_cc_log', []); }
let ccLog = loadCCLog();
function recordCCHistory(bal){
  const today=getLocalDate();
  ccLog=ccLog.filter(e=>e&&e.date!==today);
  ccLog.push({date:today,balance:bal,t:Date.now()});
  ccLog.sort((a,b)=>a.date<b.date?-1:1);
  lsSave('daily_cc_log', ccLog, 'ccLog');
}
// Last known CC balance on or before `date`; earliest entry before history starts;
// falls back to the current daily_cc balance if no history exists at all.
function ccBalanceAt(date){
  let last=null;
  for(const e of ccLog){ if(e.date<=date) last=e; else break; }
  if(last) return last.balance;
  if(ccLog.length) return ccLog[0].balance;
  return parseFloat(loadCCData().balance)||0;
}

// ── Accounts (generic assets/debts) ───────────────────────────────────────────
// Supersedes the separate savings + CC logs with one flexible list. Each account:
//   { id, name, type:'asset'|'debt', tracksStatement, current, statementBalance,
//     dueDate, history:[{date,balance}] }
// No fixed count and no assumed credit card — zero debts and five assets both work.
// Net worth = Σ(asset.current) − Σ(debt.current). Persists to daily_accounts and syncs
// as a blob via the 'accounts' Firebase path (registered in the auth callback), exactly
// like the budget-category lists.
function loadAccounts(){ const a=lsLoad('daily_accounts', []); return Array.isArray(a)?a:[]; }
let accounts = loadAccounts();
function saveAccounts(list){
  if(Array.isArray(list)) accounts=list;
  // A real save supersedes the boot migration guess — drop the flag so the sign-in reconcile
  // treats this as authoritative (offline edits win) rather than discarding it for the cloud.
  try{ localStorage.removeItem('daily_accounts_migrated'); }catch(e){}
  lsSave('daily_accounts', accounts, 'accounts');
}
function genAccountId(){ return 'acct_'+Date.now()+'_'+Math.floor(Math.random()*1e4); }

// Build one account from a legacy dated balance log ([{date,balance,t}]). Collapses any
// same-date entries to the most-recently-edited (largest t) so migration neither drops
// distinct dates nor duplicates a date — mirrors mergeSavings' newest-per-date rule.
function accountFromLog(log, id, name, type){
  const byDate={};
  (Array.isArray(log)?log:[]).forEach(e=>{
    if(!e||!e.date) return;
    const prev=byDate[e.date];
    if(!prev || (e.t||0) >= (prev.t||0)) byDate[e.date]={date:e.date, balance:parseFloat(e.balance)||0, t:e.t||0};
  });
  const history=Object.values(byDate).sort((a,b)=>a.date<b.date?-1:1).map(e=>({date:e.date, balance:e.balance}));
  const current=history.length?history[history.length-1].balance:0;
  return {id, name, type, tracksStatement:false, current, statementBalance:0, dueDate:'', history};
}
// One-time migration from the legacy savings + CC logs into daily_accounts. Runs only when
// daily_accounts has never been written AND local legacy data exists — the ordinary upgrade
// path (an existing device already holds savingsLog/ccLog in localStorage). A brand-new user
// with no legacy data is left unmigrated (key stays absent → blank Accounts list, no starter
// rows). Deliberately NOT re-triggered from the cloud listeners: the synced accounts blob is
// the source of truth on returning devices, and re-migrating there could clobber accounts the
// user added by hand.
function ensureAccountsMigrated(){
  if(localStorage.getItem('daily_accounts')!==null) return; // already migrated / user has accounts
  const sav=loadSavingsLog(), cc=loadCCLog();
  const savHas=Array.isArray(sav)&&sav.length, ccHas=Array.isArray(cc)&&cc.length;
  if(!savHas && !ccHas) return; // brand-new: leave the list blank until they add an account
  const migrated=[];
  if(savHas) migrated.push(accountFromLog(sav,'acct_savings','Savings','asset'));
  // tracksStatement off: the old CC log carried no statement balance / due date to migrate.
  if(ccHas)  migrated.push(accountFromLog(cc,'acct_cc','Credit Card','debt'));
  saveAccounts(migrated);
  // Flag this value as a boot migration GUESS (saveAccounts cleared the flag above). The accounts
  // sign-in reconcile prefers real cloud data over it, so a fresh device can't clobber the cloud.
  try{ localStorage.setItem('daily_accounts_migrated','1'); }catch(e){}
}
ensureAccountsMigrated();

// A "savers" account is an asset the user has ringfenced — money parked to earn interest
// that they don't intend to raid to clear debts. It still counts in net worth (it IS theirs);
// it's excluded only from the debt-payoff position below, which answers a different question:
// "if I paid everything off today with the money I'm willing to spend, where would I land?"
function acctIsSaver(a){ return !!(a && a.type==='asset' && a.saver); }
function accountsSaverTotal(){ return accounts.filter(acctIsSaver).reduce((s,a)=>s+(parseFloat(a.current)||0),0); }
// Spendable assets (everything except the savers accounts) minus every debt.
// Negative → short by that much. Positive → clear, with that much spare.
function accountsPayoffPosition(){ return (accountsAssetsTotal()-accountsSaverTotal())-accountsDebtsTotal(); }
function accountsAssetsTotal(){ return accounts.filter(a=>a&&a.type==='asset').reduce((s,a)=>s+(parseFloat(a.current)||0),0); }
function accountsDebtsTotal(){  return accounts.filter(a=>a&&a.type==='debt' ).reduce((s,a)=>s+(parseFloat(a.current)||0),0); }
function accountsNetWorth(){ return accountsAssetsTotal()-accountsDebtsTotal(); }
// Balance of one account on or before `date` (last history entry ≤ date; else earliest entry;
// else its current). History is kept sorted ascending by every writer below.
function accountBalanceAt(acc, date){
  if(!acc) return 0;
  const h=acc.history||[];
  let last=null;
  for(const e of h){ if(e && e.date<=date) last=e; else if(e && e.date>date) break; }
  if(last) return parseFloat(last.balance)||0;
  if(h.length) return parseFloat(h[0].balance)||0;
  return parseFloat(acc.current)||0;
}
// Net worth on a given date across all accounts (assets − debts, each at that date).
function netWorthAt(date){
  return accounts.reduce((s,a)=>{
    if(!a) return s;
    const bal=accountBalanceAt(a, date);
    return s + (a.type==='debt' ? -bal : bal);
  }, 0);
}
// Record a new dated balance for an account (today), updating current — same convention as
// the old savings/CC balance logs (one entry per date, newest wins).
function accountLogBalance(id, bal){
  const acc=accounts.find(a=>a&&a.id===id); if(!acc) return;
  const b=parseFloat(bal); if(isNaN(b)) return;
  const today=getLocalDate();
  acc.history=(acc.history||[]).filter(e=>e&&e.date!==today);
  acc.history.push({date:today, balance:b});
  acc.history.sort((x,y)=>x.date<y.date?-1:1);
  acc.current=b;
  saveAccounts(accounts);
}
// ── Legacy weight-log merge (daily_weight_log / users/{uid}/weightLog → wt_weight) ──
// The old duplicate store held {date, kg} entries; the canonical store holds
// {date, weight}. Union by date, wt_weight winning conflicts. Idempotent — safe to run
// at boot and again from the weights cloud listener (which replaces S.weights wholesale).
let _wtLegacyCloud=null; // parsed cloud copy, fetched once at sign-in
function mergeLegacyWeightEntries(){
  const srcs=[];
  const local=lsLoad('daily_weight_log', []);
  if(Array.isArray(local)) srcs.push(...local);
  if(Array.isArray(_wtLegacyCloud)) srcs.push(..._wtLegacyCloud);
  if(!srcs.length) return false;
  const have=new Set(S.weights.map(w=>w&&w.date));
  let added=false;
  srcs.forEach(e=>{
    if(!e||!e.date||have.has(e.date)) return;
    const kg=parseFloat(e.kg!==undefined?e.kg:e.weight);
    if(!kg||kg<=0) return;
    S.weights.push({date:e.date, weight:kg});
    have.add(e.date);
    added=true;
  });
  if(added) S.weights.sort((a,b)=>a.date<b.date?-1:1);
  return added;
}
let profileData        = loadProfileData();
let settingsCollapsed  = lsLoad('daily_settings_collapsed', {});
function loadWeightGoal(){ return lsLoad('daily_weight_goal', {}); }
let weightGoal = loadWeightGoal();
function loadSubscriptions(){ return lsLoad('daily_subscriptions', []); }
let subscriptionsData = loadSubscriptions();
let habitsData         = loadHabits();
let habitsLog          = loadHabitsLog();
let budChart           = null;
let budDonutChart      = null;
let monthWeekChart     = null;   // Month view: weekly grouped bar chart
let yearStackChart     = null;   // Yearly view: stacked bars + savings-rate line
let yearCCChart        = null;   // Yearly view: monthly CC / variable spending line
let budTrendRange      = 'monthly';
let bsChart            = null;
let bsTrendRange       = 'monthly';

// ── Budget storage ────────────────────────────────────────────────
function budLoadData(){ return lsLoad('daily_budget', {}); }
function budSaveData(changedKey){
  localStorage.setItem('daily_budget', JSON.stringify(budgetData));
  syncBudgetDataToFirebase(changedKey);
}
function budLoadDefaults(){ return lsLoad('daily_budget_defaults', {}); }
function budSaveDefaults(){
  budDefaults.fine      = parseFloat(document.getElementById('fix-fine')?.value)      || DEFAULT_FINE;
  budDefaults.subs      = parseFloat(document.getElementById('fix-subs')?.value)      || DEFAULT_SUBS;
  budDefaults.gym       = parseFloat(document.getElementById('fix-gym')?.value)       || DEFAULT_GYM;
  budDefaults.transport = parseFloat(document.getElementById('fix-transport')?.value) || DEFAULT_TRANSPORT;
  localStorage.setItem('daily_budget_defaults', JSON.stringify(budDefaults));
  syncBudDefaultsToFirebase();
}
function getWeeklySavings(){ return 0; } // weekly-savings target was removed; no-op for legacy callers
// Pay day (day-of-week 0-6) per income source, keyed by the source's id in loadIncCats().
// Reads budDefaults.payDays first, then falls back to the original hardcoded fuji/mcd fields
// so existing saved settings keep working until the user changes them via the new selectors.
function getPayDay(id){
  const pd = budDefaults.payDays && budDefaults.payDays[id];
  if(pd!=null && !isNaN(pd)) return parseInt(pd);
  if(id==='fuji') return budDefaults.fujifilmPayDay ?? 4;   // legacy: Thursday
  if(id==='mcd')  return budDefaults.mcdonaldsPayDay ?? 2;  // legacy: Tuesday
  return 5; // sensible default (Friday) for newly-added sources
}
function setPayDay(id, day){
  if(!budDefaults.payDays || typeof budDefaults.payDays!=='object') budDefaults.payDays={};
  budDefaults.payDays[id]=parseInt(day);
}
// Optional hourly rate per income source, keyed by loadIncCats() id like payDays above.
// 0 = not set (hours entry then never auto-fills the dollar field for that source).
function getHourlyRate(id){
  const r = budDefaults.hourlyRates && parseFloat(budDefaults.hourlyRates[id]);
  return (r && r>0) ? r : 0;
}
function setHourlyRate(id, rate){
  if(!budDefaults.hourlyRates || typeof budDefaults.hourlyRates!=='object') budDefaults.hourlyRates={};
  const r=parseFloat(rate);
  if(r>0) budDefaults.hourlyRates[id]=r; else delete budDefaults.hourlyRates[id];
}
function dFine()       { return budDefaults.fine       ?? DEFAULT_FINE; }
function dSubs()       { return budDefaults.subs       ?? DEFAULT_SUBS; }
function dGym()        { return budDefaults.gym        ?? DEFAULT_GYM; }
function dTransport()  { return budDefaults.transport  ?? DEFAULT_TRANSPORT; }
function dFineLabel()      { return budDefaults.fine_label      || '⚙️ Fine repayment'; }
function dSubsLabel()      { return budDefaults.subs_label      || '📱 Subscriptions'; }
function dGymLabel()       { return budDefaults.gym_label       || '🏋️ Gym'; }
function dTransportLabel() { return budDefaults.transport_label || '🚌 Transport'; }
function dTransportBud()   { return budDefaults.transport       ?? DEFAULT_TRANSPORT; }
function dFoodBud()    { return budDefaults.food_bud    ?? DEFAULT_FOOD; }
function dPubBud()     { return budDefaults.pub_bud     ?? DEFAULT_PUB; }
function dPersonalBud(){ return budDefaults.personal_bud ?? DEFAULT_PERSONAL; }

// ── Date helpers (device-local timezone) ─────────────────────────
// "Today" as YYYY-MM-DD in the user's own device timezone. Native Date getters resolve the
// device's local wall clock (including its DST), so each user's day/midnight matches their
// own clock. This only governs newly-computed dates — previously-saved date strings are never
// re-derived, so switching timezones can't retroactively change stored data.
function getLocalDate(){
  return dateStr(new Date());
}
function localMidnight(dateStr){
  const [y,m,d]=dateStr.split('-').map(Number);
  return new Date(y,m-1,d);
}
function dateStr(d){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

// ── Week / month key helpers ──────────────────────────────────────
function getMondayOf(weekOffset = 0){
  // Anchor on the user's own device calendar date via getLocalDate(). The day-of-week of a
  // calendar date is timezone-independent, so .getDay() on a local-midnight Date is safe
  // (no offset/DST math needed). Returns a local-midnight Date so callers (weekKey/
  // fmtWeekLabel and monday.setDate arithmetic) keep working unchanged.
  const today = localMidnight(getLocalDate());
  const day = today.getDay();                 // 0=Sun … 6=Sat
  const diffToMonday = (day === 0) ? 6 : day - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - diffToMonday + (weekOffset * 7));
  return monday;
}
function weekKey(monday){ return dateStr(monday); }
function fmtWeekLabel(monday){
  // Full Monday–Sunday span, matching getMondayOf()'s 7-day week — this used to add 4 days
  // (Friday), showing every week as a 5-day range instead of 7.
  const sun = new Date(monday); sun.setDate(monday.getDate()+6);
  const opts = {day:'numeric',month:'short'};
  return monday.toLocaleDateString('en-AU',opts)+' – '+sun.toLocaleDateString('en-AU',opts);
}
function getBudWeekData(key){
  return budgetData[key]||{
    inc_fuji:'',inc_mcd:'',
    sav_amount:'',fix_transport:'',
    var_food:'',var_pub:'',var_personal:'',notes:''
  };
}
function getMonthDate(offset){
  // Anchor to the current week's Monday so the default month matches where the latest
  // week data lives (e.g. if today is Wed Jul 2, Monday was Jun 29 → default month = June).
  const mon=getMondayOf(0);
  return new Date(mon.getFullYear(),mon.getMonth()+offset,1);
}
function getMondaysInMonth(monthDate){
  const year=monthDate.getFullYear(),month=monthDate.getMonth();
  const mondays=[];
  const d=new Date(year,month,1);
  while(d.getDay()!==1) d.setDate(d.getDate()+1); // advance to first Monday
  while(d.getMonth()===month){ mondays.push(dateStr(d)); d.setDate(d.getDate()+7); }
  return mondays;
}
function fmtMonthLabel(d){ return d.toLocaleDateString('en-AU',{month:'long',year:'numeric'}); }

// ── Budget view toggle ────────────────────────────────────────────
function setBudgetView(v){
  budgetView=v;
  const setBtn=(id,active)=>{ const b=document.getElementById(id); if(!b) return;
    b.style.background=active?'var(--card)':'transparent'; b.style.fontWeight=active?'700':'500';
    b.style.color=active?'var(--text)':'var(--muted)'; b.style.boxShadow=active?'0 1px 3px rgba(0,0,0,0.1)':'none'; };
  setBtn('bv-week-btn',v==='week');
  setBtn('bv-month-btn',v==='month');
  setBtn('bv-year-btn',v==='year');
  document.getElementById('budget-week-view').classList.toggle('hidden',v!=='week');
  document.getElementById('budget-month-view').classList.toggle('hidden',v!=='month');
  document.getElementById('budget-year-view').classList.toggle('hidden',v!=='year');
  if(v==='week') renderBudgetTab();
  if(v==='month') renderMonth();
  if(v==='year') renderYear();
}

// ── Week navigation ───────────────────────────────────────────────
function changeWeek(dir){
  if(dir>0&&currentWeekIdx>=0) return;
  budSaveDraft();              // flush the viewed week's inputs before the index changes
  budPastEdit=false;          // lock the next week by default (history is read-only unless unlocked)
  currentWeekIdx+=dir; renderBudgetTab();
}
function changeMonth(dir){
  if(dir>0&&currentMonthOffset>=0) return;
  currentMonthOffset+=dir; renderMonth();
}

// ── One-time data recovery ────────────────────────────────────────
// The accordion/donut redesigns stored each week in one of several shapes:
//   • legacy per-input fields  (inc_fuji / var_food / …)            ← what this tab reads
//   • a dynamic income map     (d.income = {streamId: amount})
//   • aggregate snapshots      (d.snapshot = {income, variable, …}) ← shadows legacy fields
//   • category objects         (d.cats = {groceries, transport, …})
// Crucially the redesigns never DELETED the original per-input fields — they only added
// aggregates on top, and the history readers (weekIncome/weekSpending) prefer those
// aggregates, which is why real data appeared to vanish. This normalises every saved
// week back to the per-input fields and removes the shadowing aggregates so the restored
// tab and the Stats readers both see the user's real numbers. Runs once; idempotent.
// Remove residue of the deleted weekly-savings target from the CURRENT/FUTURE weeks so they
// never auto-show or re-bake the old target (e.g. 300). Past weeks were frozen by
// recoverBudgetData and are left untouched. Returns true if it changed anything.
function scrubSavingsTarget(data){
  if(!data||typeof data!=='object') return false;
  const curWk=(typeof getMondayOf==='function'&&typeof weekKey==='function')?weekKey(getMondayOf(0)):'';
  if(!curWk) return false;
  let changed=false;
  Object.keys(data).forEach(wk=>{
    if(wk<curWk) return; // current + future only; past weeks stay frozen
    const w=data[wk]; if(!w||typeof w!=='object') return;
    if(w.sav_extra!==undefined){ delete w.sav_extra; changed=true; }       // drop old-model marker
    // NOTE: this used to also clear sav_amount whenever it equalled budDefaults.weeklySavings
    // (the old auto-savings TARGET, since removed as a feature). But weeklySavings still
    // lingers in budDefaults (e.g. 200), so that clear treated a user's LEGITIMATE manual
    // entry that happened to equal the target — 200, their own "$200 minimum" goal, the most
    // natural value to type — as stale residue and wiped it. It ran on every boot
    // (recoverBudgetData) and every cloud sync (the budgetData listener, which then wrote the
    // emptied blob back to Firebase), so savings of exactly the target never survived a
    // refresh and never synced. The savings-target feature is gone and current/future weeks
    // now only ever get manually-entered values, so there is nothing legitimate left to scrub.
  });
  return changed;
}
function recoverBudgetData(){
  const raw=localStorage.getItem('daily_budget'); if(!raw) return;
  let data; try{ data=JSON.parse(raw); }catch(e){ return; }
  if(!data||typeof data!=='object') return;
  let changed=false;
  const num=v=>{ const n=parseFloat(v); return isNaN(n)?0:n; };
  // This week's key — only PAST weeks get their old target-based savings frozen.
  const curWk=(typeof getMondayOf==='function'&&typeof weekKey==='function')?weekKey(getMondayOf(0)):'';
  Object.keys(data).forEach(wk=>{
    const w=data[wk]; if(!w||typeof w!=='object') return;
    const has=k=>w[k]!==undefined&&w[k]!==''&&w[k]!==null;

    // ── Income → inc_fuji / inc_mcd / inc_other ──
    if(!has('inc_fuji')&&!has('inc_mcd')&&!has('inc_other')){
      if(w.income&&typeof w.income==='object'){
        const vals=Object.values(w.income).map(num);
        if(vals[0]){ w.inc_fuji=String(vals[0]); changed=true; }
        if(vals[1]){ w.inc_mcd=String(vals[1]); changed=true; }
        const rest=vals.slice(2).reduce((a,v)=>a+v,0);
        if(rest){ w.inc_other=String(rest); changed=true; }
      } else if(w.snapshot&&num(w.snapshot.income)>0){
        // config/donut era only kept a total — preserve it so it isn't lost
        w.inc_fuji=String(num(w.snapshot.income)); changed=true;
      }
    }

    // ── Variable → var_food / var_pub / var_personal ──
    if(!has('var_food')&&!has('var_pub')&&!has('var_personal')){
      if(w.cats&&typeof w.cats==='object'){
        const c=w.cats;
        const food=num(c.groceries)+num(c.eating_out);
        const pub=num(c.entertainment);
        const personal=num(c.personal_care);
        if(food){ w.var_food=String(food); changed=true; }
        if(pub){ w.var_pub=String(pub); changed=true; }
        if(personal){ w.var_personal=String(personal); changed=true; }
        if(!has('fix_transport')&&num(c.transport)){ w.fix_transport=String(num(c.transport)); changed=true; }
      } else if(w.snapshot&&num(w.snapshot.variable)>0){
        // no per-category breakdown available — keep the total under Food so it survives
        w.var_food=String(num(w.snapshot.variable)); changed=true;
      }
    }

    // ── Savings total from snapshot.saved → free-input sav_amount ──
    if(!has('sav_amount')&&w.snapshot&&num(w.snapshot.saved)>0){
      w.sav_amount=String(Math.round(num(w.snapshot.saved))); changed=true;
    }
    // ── Freeze old target-based savings into an explicit amount for PAST weeks, so removing
    //    the weekly-savings target doesn't retroactively change weeks already saved. ──
    if(!has('sav_amount')&&curWk&&wk<curWk&&(has('sav_extra')||w.saved)){
      const oldTarget=(budDefaults&&budDefaults.weeklySavings!=null)?budDefaults.weeklySavings:350;
      w.sav_amount=String(oldTarget+num(w.sav_extra)); changed=true;
    }

    // ── Drop the shadowing aggregates so the legacy readers are the source of truth ──
    if(w.snapshot!==undefined){ delete w.snapshot; changed=true; }
    if(w.cats!==undefined){ delete w.cats; changed=true; }
    if(w.income!==undefined&&typeof w.income==='object'){ delete w.income; changed=true; }
  });
  if(scrubSavingsTarget(data)) changed=true;
  if(changed){
    localStorage.setItem('daily_budget', JSON.stringify(data));
    budgetData=data; // refresh the in-memory copy
    console.log('Budget data recovered and normalised to Fixed/Variable fields.');
  }
}

// ── Render budget tab ─────────────────────────────────────────────
// ── Custom budget categories (add/remove fixed & variable rows) ───
// Category ids match the legacy field suffixes (fine/food/…) so per-week storage
// d['fix_'+id] / d['var_'+id] stays compatible with existing saved weeks.
function loadFixCats(){
  return lsLoad('daily_budget_fix_cats', [
    {id:'fine',      name:'⚖️ Fine repayment',     default:budDefaults.fine??25},
    {id:'subs',      name:'📱 Subscriptions',       default:budDefaults.subs??17},
    {id:'transport', name:'🚌 Transport (Opal)',    default:budDefaults.transport??50},
    {id:'gym',       name:'🏋️ Anytime Fitness',     default:budDefaults.gym??27},
  ], Array.isArray);
}
function saveFixCats(cats){ lsSaveTS('daily_budget_fix_cats', cats, 'daily_budget_fix_cats_ts', 'budgetFixCats'); }
function loadVarCats(){
  return lsLoad('daily_budget_var_cats', [
    {id:'food',     name:'🍔 Food'},
    {id:'pub',      name:'🍺 Pub & social'},
    {id:'personal', name:'👜 Personal'},
  ], Array.isArray);
}
function saveVarCats(cats){ lsSaveTS('daily_budget_var_cats', cats, 'daily_budget_var_cats_ts', 'budgetVarCats'); }
// Income sources — ids match the legacy field suffixes (fuji/mcd) so per-week storage
// d['inc_'+id] stays compatible with existing saved weeks (d.inc_fuji / d.inc_mcd).
function loadIncCats(){
  return lsLoad('daily_budget_inc_cats', [
    {id:'fuji', name:'Fujifilm'},
    {id:'mcd',  name:"McDonald's"},
  ], Array.isArray);
}
function saveIncCats(cats){ lsSaveTS('daily_budget_inc_cats', cats, 'daily_budget_inc_cats_ts', 'budgetIncCats'); }
function genCatId(prefix){ return prefix+'_'+Date.now(); }

// ── Per-category weekly budget ────────────────────────────────────
// The category's own `budget` field is the single source of truth for its weekly target.
// Before this, the target lived in budgetConfig — a second, independently-edited list that
// shared no ids with these categories, so the two drifted (a category added in the Budget
// tab had no plan entry; a plan entry renamed in Settings stopped matching). Anything that
// wants "the target for this category" reads catBudget(); nothing name-matches any more.
const BUD_CAT_KEY={fix:'daily_budget_fix_cats', var:'daily_budget_var_cats', inc:'daily_budget_inc_cats'};
const BUD_CFG_KEY={fix:'fixedExpenses', var:'variableExpenses', inc:'incomeStreams'};
// ── Billing cycles ────────────────────────────────────────────────
// A fixed expense is often billed on a cycle that isn't weekly — rego yearly, a subscription
// monthly — and converting that by hand every time is exactly what the old, separate
// subscriptions list existed to do. A category can now carry the amount it's ACTUALLY billed
// plus its cycle; `budget` stays the canonical weekly figure everything else reads, and is
// recomputed from those two whenever either changes (see catUpdateField).
// 52/12 rather than the 4.33 used elsewhere: exact, so a yearly and a monthly entry of the
// same annual cost agree to the cent.
const CAT_CYCLES=[
  {id:'weekly',  label:'Weekly',  suffix:'/wk', perWeek:1},
  {id:'monthly', label:'Monthly', suffix:'/mo', perWeek:12/52},
  {id:'yearly',  label:'Yearly',  suffix:'/yr', perWeek:1/52},
];
function cyclePerWeek(cycle){ const c=CAT_CYCLES.find(x=>x.id===cycle); return c?c.perWeek:1; }
function catWeeklyFromAmount(amount,cycle){
  const a=parseFloat(amount);
  if(isNaN(a)) return '';
  return Math.round(a*cyclePerWeek(cycle)*100)/100;
}
// What the user typed, in the cycle they typed it in. Falls back to the weekly budget for
// categories that predate cycles (they're weekly by definition).
function catAmount(c){
  if(!c) return '';
  if(c.amount!=null&&c.amount!=='') return c.amount;
  return (c.budget!=null&&c.budget!=='')?c.budget:'';
}
function catCycle(c){ return (c&&c.cycle)||'weekly'; }
// ── Category logos ────────────────────────────────────────────────
// A category can carry the website of the thing it pays for; its favicon becomes the row
// icon. DuckDuckGo's icon service is used rather than Google's: no key either way, but this
// one doesn't feed an advertising profile with the list of services you pay for.
// Note a real limitation — a mistyped domain does NOT error, both services just hand back a
// generic globe. There's no way to tell "no logo" from "wrong domain" from the image alone,
// so the field stays freely editable and the letter placeholder is always a valid choice.
function catSiteDomain(raw){
  let s=String(raw||'').trim().toLowerCase();
  if(!s) return '';
  s=s.replace(/^[a-z]+:\/\//,'').replace(/^www\./,'');   // strip scheme + www
  s=s.split('/')[0].split('?')[0].split('#')[0];          // host only
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)?s:'';
}
function catLogoUrl(c){
  const d=catSiteDomain(c&&c.site);
  return d?'https://icons.duckduckgo.com/ip3/'+d+'.ico':'';
}
// Emoji were how these rows used to be identified, before logos. They're still sitting in
// some names as a decorative prefix ("☁️ Claude"), which would double up next to a logo —
// strip them for display only, leaving the stored name untouched.
function catDisplayName(name){
  return String(name||'').replace(/^[^\p{L}\p{N}$]+/u,'').trim()||String(name||'').trim();
}
function catInitial(name){
  const n=catDisplayName(name);
  return n?n.charAt(0).toUpperCase():'?';
}
// Falls back to the initial if there's no site, and also if the logo fails to load.
function catIconHtml(c,size){
  const px=size||22;
  const url=catLogoUrl(c);
  const style='width:'+px+'px;height:'+px+'px;border-radius:'+Math.round(px*0.27)+'px;flex-shrink:0';
  const fallback='<span class="cat-icon-letter" style="'+style+';font-size:'+Math.round(px*0.5)+'px">'+_catEscHtml(catInitial(c&&c.name))+'</span>';
  if(!url) return fallback;
  // Not loading="lazy": these are ~20px icons in a short list, so deferring them saves
  // nothing and just risks them never resolving if the list renders off-screen.
  return '<img class="cat-icon-img" src="'+url+'" alt="" style="'+style+'" '+
    'onerror="this.outerHTML='+_catEsc(JSON.stringify(fallback))+'">';
}
function catBudget(c){
  if(!c) return 0;
  if(c.budget!=null&&c.budget!=='') return parseFloat(c.budget)||0;
  return parseFloat(c.default)||0;   // pre-migration fixed categories
}
function catBudgetTotal(type){ return (BUD_CAT_LOAD[type]?BUD_CAT_LOAD[type]():[]).reduce((s,c)=>s+catBudget(c),0); }
// One-time fold of the separate subscriptions list into the fixed categories. The two lists
// were never actually connected — subscriptions only ever wrote to a legacy defaults key and
// to a DOM input that usually wasn't on screen — so a $125/wk subscription load sat entirely
// outside the weekly budget. Each subscription becomes a real fixed category billed on its
// own cycle, so it now counts.
// Best-effort website for a well-known name, so migrated entries arrive with a logo instead
// of a wall of letter placeholders. Substring match on a stripped name; anything not listed
// just gets no site, which is a perfectly valid state — the field is editable.
const CAT_SITE_GUESSES=[
  ['claude','claude.ai'],['chatgpt','openai.com'],['openai','openai.com'],
  ['applecare','apple.com'],['icloud','icloud.com'],['appletv','apple.com'],['applemusic','apple.com'],
  ['netflix','netflix.com'],['spotify','spotify.com'],['disney','disneyplus.com'],
  ['hbomax','hbomax.com'],['binge','binge.com.au'],['stan','stan.com.au'],['kayo','kayosports.com.au'],
  ['youtube','youtube.com'],['amazonprime','amazon.com.au'],['paramount','paramountplus.com'],
  ['ozlotto','thelott.com'],['powerball','thelott.com'],['thelott','thelott.com'],
  ['anytimefitness','anytimefitness.com.au'],['fitnessfirst','fitnessfirst.com.au'],['goodlife','goodlifehealthclubs.com.au'],
  ['budgetdirect','budgetdirect.com.au'],['nrma','nrma.com.au'],['ctpgreenslip','nrma.com.au'],
  ['rego','service.nsw.gov.au'],['servicensw','service.nsw.gov.au'],['opal','transportnsw.info'],
  ['telstra','telstra.com.au'],['optus','optus.com.au'],['vodafone','vodafone.com.au'],['belong','belong.com.au'],
  ['agl','agl.com.au'],['originenergy','originenergy.com.au'],['medibank','medibank.com.au'],['bupa','bupa.com.au'],
];
function guessCatSite(name){
  const n=String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(!n) return '';
  const hit=CAT_SITE_GUESSES.find(([k])=>n.includes(k));
  return hit?hit[1]:'';
}
function migrateSubscriptionsToFixedOnce(){
  if(localStorage.getItem('daily_subs_merged_into_fixed')) return;
  try{
    const subs=lsLoad('daily_subscriptions', []);
    if(Array.isArray(subs)&&subs.length){
      const cats=loadFixCats();
      // Some expenses were tracked in BOTH lists (a gym membership as a fixed category and
      // again as a subscription). Importing those blindly would silently inflate the weekly
      // budget, so skip any whose name already exists as a fixed category — that expense is
      // already being counted. Exact match on a stripped-down name only: deliberately not
      // fuzzy, since a wrong merge here quietly loses a real expense.
      const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
      const existing=new Set(cats.map(c=>norm(c.name)).filter(Boolean));
      const skipped=[];
      subs.forEach((s,i)=>{
        const cycle=(s&&s.cycle==='yearly')?'yearly':'monthly';
        // originalCost is what was actually billed for that cycle; monthlyCost is derived.
        const raw=parseFloat(s&&s.originalCost);
        const amount=isNaN(raw)?(parseFloat(s&&s.monthlyCost)||0):raw;
        const name=((s&&s.emoji?s.emoji+' ':'')+((s&&s.name)||'Subscription')).trim();
        if(existing.has(norm(name))){ skipped.push(name); return; }
        cats.push({id:'sub'+Date.now()+'_'+i, name, amount, cycle,
          budget:catWeeklyFromAmount(amount,cycle), site:guessCatSite(name)});
      });
      if(skipped.length) try{ localStorage.setItem('daily_subs_merge_skipped', JSON.stringify(skipped)); }catch(e){}
      // The built-in 'subs' category existed only to hold the subscriptions TOTAL, which the
      // individual entries above now represent — so it has to go entirely, not just have its
      // budget zeroed. A zeroed category still double-counts wherever an amount was typed
      // into its weekly row, and those rows exist. Removing it doesn't lose history either:
      // each imported category's budget applies to EVERY week including past ones (a blank
      // row falls back to the budget), so the recurring block already covers what fix_subs
      // used to. The old per-week fix_subs values stay in storage, simply unread.
      saveFixCats(cats.filter(c=>c.id!=='subs'));
    }
    // Backfill a website onto any fixed category that doesn't have one yet — including the
    // ones that predate subscriptions entirely (a gym, a transport card), so the list arrives
    // with logos rather than a column of letter placeholders. Never overwrites a set value.
    const all=loadFixCats();
    let touched=false;
    all.forEach(c=>{
      if(c.site) return;
      const g=guessCatSite(c.name);
      if(g){ c.site=g; touched=true; }
    });
    if(touched) saveFixCats(all);
  }catch(e){}
  // daily_subscriptions is deliberately left in storage — nothing is destroyed, so the old
  // list is still recoverable if this migration got something wrong.
  localStorage.setItem('daily_subs_merged_into_fixed','1');
}
// Follow-up to the merge above. Its first version zeroed the aggregate 'subs' category's
// budget instead of removing it, on the mistaken reasoning that past weeks needed it for
// their history. They don't — every imported category's budget already applies retroactively
// — and a zeroed category still counts twice on any week where an amount was typed into its
// row, which is exactly what happened. Drops the leftover aggregate for anyone who ran that
// earlier version.
// Recovery hatch. The subscriptions→fixed merge is rebuildable because daily_subscriptions
// was deliberately never deleted — so if a stale device ever overwrites the merged categories
// with a pre-merge copy, the merge can simply be run again from that surviving source rather
// than re-entered by hand. Clears the one-shot flags and re-runs, then re-renders.
function rebuildSubscriptionCategories(){
  const subs=lsLoad('daily_subscriptions', []);
  if(!Array.isArray(subs)||!subs.length){
    alert('No saved subscriptions found to rebuild from.');
    return false;
  }
  localStorage.removeItem('daily_subs_merged_into_fixed');
  localStorage.removeItem('daily_subs_aggregate_dropped');
  migrateSubscriptionsToFixedOnce();
  migrateDropSubsAggregateOnce();
  if(typeof renderBudgetTab==='function'&&S.view==='budget') renderBudgetTab();
  if(typeof renderBudgetEditor==='function') renderBudgetEditor();
  return true;
}
function migrateDropSubsAggregateOnce(){
  if(localStorage.getItem('daily_subs_aggregate_dropped')) return;
  try{
    // Only when subscriptions were actually imported — otherwise a category that happens to
    // use the built-in 'subs' id is a legitimate expense and must be left alone.
    const hadSubs=(lsLoad('daily_subscriptions', [])||[]).length>0;
    if(hadSubs){
      const cats=loadFixCats();
      const agg=cats.find(c=>c.id==='subs');
      // Guard on the zeroed budget the earlier migration set, so a category the user has
      // since given a real budget to isn't silently deleted.
      if(agg&&(agg.budget===0||agg.budget===''||agg.budget==null)){
        saveFixCats(cats.filter(c=>c.id!=='subs'));
      }
    }
  }catch(e){}
  localStorage.setItem('daily_subs_aggregate_dropped','1');
}
// One-time lift of the old budgetConfig amounts onto the categories they were describing.
// Name-matched one-to-one — the same imperfect bridge as before, but run exactly once here
// instead of on every read, so from now on the number lives with the category.
function migrateCatBudgetsOnce(){
  if(localStorage.getItem('daily_cat_budgets_migrated')) return;
  const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  ['inc','fix','var'].forEach(type=>{
    if(localStorage.getItem(BUD_CAT_KEY[type])==null) return;   // untouched defaults; nothing to migrate
    const cats=BUD_CAT_LOAD[type]();
    const plan=((budgetConfig&&budgetConfig[BUD_CFG_KEY[type]])||[]).map(p=>({n:norm(p.name), amt:parseFloat(p.weeklyAmount)||0, used:false}));
    let changed=false;
    const take=(c,hit)=>{ if(hit){ hit.used=true; c.budget=hit.amt; changed=true; } };
    cats.forEach(c=>{ if(c.budget!=null&&c.budget!=='') return; const n=norm(c.name); if(n) take(c, plan.find(p=>!p.used&&p.n===n)); });
    cats.forEach(c=>{ if(c.budget!=null&&c.budget!=='') return; const n=norm(c.name); if(!n) return;
      take(c, plan.find(p=>!p.used&&p.n&&(p.n.includes(n)||n.includes(p.n)))); });
    // No plan entry: fall back to the category's own legacy `default`, else leave it unset
    // so the UI shows an empty field rather than a fabricated $0 target.
    cats.forEach(c=>{ if((c.budget==null||c.budget==='')&&c.default!=null&&c.default!==''){ c.budget=parseFloat(c.default)||0; changed=true; } });
    if(changed) BUD_CAT_SAVE[type](cats);
  });
  localStorage.setItem('daily_cat_budgets_migrated','1');
}

function weekFixedTotal(d){
  let t=0;
  loadFixCats().forEach(c=>{
    const v=d&&d['fix_'+c.id];
    // A blank fixed cell means the standard amount was charged, so it falls back to the
    // category's budget. (Variable is the opposite — blank there means nothing was spent.)
    t += (v!==undefined&&v!=='') ? (parseFloat(v)||0) : catBudget(c);
  });
  return t;
}
function weekVarTotal(d){
  let t=0;
  loadVarCats().forEach(c=>{ t += parseFloat(d&&d['var_'+c.id])||0; });
  return t;
}
// Sum of all fixed-category amounts for a week (same pattern as weekSpending's fixed half).
function weekFixed(d){ return weekFixedTotal(d); }
// Shared chart colours for the budget month/year charts (matches renderBudTrend palette).
const BUD_CHART_COLORS={income:'#1d9e75',variable:'#d85a30',fixed:'#888780',saved:'#378add',rate:'#1d9e75',spending:'#e74c3c'};
// Inline legend pills rendered above a Chart.js canvas (more legible on mobile than
// the built-in legend). items = [{c:'#hex', l:'Label'}, …]
function budChartLegend(items){
  return items.map(it=>'<span class="chart-legend-pill"><span class="chart-legend-dot" style="background:'+it.c+'"></span>'+it.l+'</span>').join('');
}
// Grid + tick colours that adapt to the active theme (same values as renderBudTrend).
function budChartGridColors(){
  const isDark=S.theme==='dark';
  return {gc:isDark?'rgba(255,255,255,0.07)':'rgba(0,0,0,0.06)', tc:isDark?'#888':'#94a3b8'};
}
const _catEsc=s=>(s||'').replace(/"/g,'&quot;');
const _catEscHtml=s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// Collapsible section header (shared markup) — collapse handled by the delegated
// .bud-toggle listener + restoreBudgetCollapseState (index-based persistence).
const BUD_CHEVRON='<svg class="bud-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>';
// Per-card edit mode (current week only). When off, add/delete/rename controls are not
// rendered at all — so a stray tap can't delete a category; amounts stay editable always.
const budEditMode = {inc:false, fix:false, var:false, vargoal:false};
// A past week temporarily unlocked for backfill editing (e.g. fixing last week's income).
// Reset whenever the viewed week changes so history stays read-only by default.
let budPastEdit = false;
// Collapsible card header with an Edit/Done toggle (current week only). The toggle lives
// inside .bud-toggle but the collapse listener ignores taps on it (see that handler).
function budCardHead(type, label, isCur){
  const editing=budEditMode[type];
  const editBtn = isCur
    ? '<button class="bud-edit-btn'+(editing?' active':'')+'" data-type="'+type+'" data-action="bud-edit-toggle">'+(editing?'Done':'Edit')+'</button>'
    : '';
  // bud-head-sum carries the card's total so a collapsed card still states its figure; it is
  // shown only while collapsed (the row below says the same thing when open). Filled by
  // budRecalc, which already computes every one of these totals.
  return '<div class="sec-label bud-toggle"><span class="bud-head-label">'+label+'</span>'+
    '<span class="bud-head-right"><span class="bud-head-sum" id="sum-'+type+'"></span>'+editBtn+BUD_CHEVRON+'</span></div>';
}
// In edit mode (current week) category names are editable inputs; otherwise plain labels.
// A brand-new unnamed row also gets an input so it can be named without window.prompt().
function budCatNameHtml(type,c,isCur,editMode){
  if(editMode && isCur){
    return '<input class="bud-cat-name-input" id="catname-'+type+'-'+c.id+'" value="'+_catEsc(c.name||'')+'" placeholder="Name this category…" oninput="budRenameCat(\''+type+'\',\''+c.id+'\',this.value)">';
  }
  // Fixed rows lead with the category's logo (or its initial); the stored name may still
  // carry a legacy emoji prefix, so display the stripped form to avoid showing both.
  if(c.name) return '<div class="bud-row-left">'+
    (type==='fix'?catIconHtml(c,20):'')+
    '<div class="bud-row-name">'+_catEscHtml(type==='fix'?catDisplayName(c.name):c.name)+'</div></div>';
  return '<input class="bud-cat-name-input" id="catname-'+type+'-'+c.id+'" value="" placeholder="Name this category…" oninput="budRenameCat(\''+type+'\',\''+c.id+'\',this.value)" onchange="renderBudgetTab()"'+(isCur?'':' disabled')+'>';
}
// A category billed monthly/yearly accrues its prorated share automatically — typing into it
// would double-count what's already been counted (see the note in the collapsed list). So it
// gets no weekly input; only genuinely per-week categories do.
function catIsRecurring(c){ const cy=catCycle(c); return cy==='monthly'||cy==='yearly'; }
function renderFixedCard(data,isCur){
  const editing=budEditMode.fix && isCur;
  const cats=activeCats(loadFixCats()); // archived keep counting in totals, just no row
  const weeklyCats=cats.filter(c=>!catIsRecurring(c));
  const recurCats=cats.filter(catIsRecurring);

  const rows=weeklyCats.map(c=>{
    const raw=data['fix_'+c.id];
    const val=(raw!==undefined&&raw!=='')?raw:'';
    // Placeholder is the amount a blank row actually contributes, so an empty field reads as
    // "the usual $50" rather than the old, misleading "$0".
    return '<div class="bud-row bud-cat-row" data-cat-id="'+c.id+'">'+
      budCatNameHtml('fix',c,isCur,editing)+
      '<input class="bud-row-input" type="number" inputmode="decimal" id="fix-'+c.id+'" placeholder="$'+catBudget(c).toFixed(0)+'" value="'+val+'" oninput="budRecalc();budSaveDraft()"'+(isCur?'':' disabled')+'>'+
      (editing?'<button class="delete-cat-btn" data-type="fix" data-id="'+c.id+'" aria-label="Remove category">×</button>':'')+
    '</div>';
  }).join('');

  // Recurring block: one summary row that expands to a read-only breakdown. Toggled inline
  // (same idiom as the Home accounts list) so it never triggers a re-render mid-tap.
  let recurBlock='';
  if(recurCats.length){
    const recurTotal=recurCats.reduce((s,c)=>s+catBudget(c),0);
    const items=recurCats.map(c=>
      '<div class="bud-recur-item">'+
        '<div class="bud-row-left">'+catIconHtml(c,18)+
          '<div class="bud-row-name">'+_catEscHtml(catDisplayName(c.name))+'</div></div>'+
        '<div class="bud-recur-amt">$'+catBudget(c).toFixed(2)+
          '<span class="bud-recur-per">/wk</span></div>'+
      '</div>').join('');
    recurBlock=
      '<div class="bud-row bud-recur-head" onclick="var l=this.nextElementSibling;var open=l.style.display!==\'none\';l.style.display=open?\'none\':\'block\';var ch=this.querySelector(\'.bud-recur-chev\');if(ch)ch.textContent=open?\'▾\':\'▴\'">'+
        '<div class="bud-row-left"><span class="bud-recur-ic">🔁</span>'+
          '<div class="bud-row-name">Recurring<span class="bud-recur-count">'+recurCats.length+'</span></div></div>'+
        '<div class="bud-row-calc bud-recur-total">$'+recurTotal.toFixed(2)+
          '<span class="bud-recur-chev">▾</span></div>'+
      '</div>'+
      '<div class="bud-recur-list" style="display:none">'+items+
        '<div class="bud-recur-note">Counted automatically each week from their billing cycle — nothing to enter. Edit them in Settings → Budget categories.</div>'+
      '</div>';
  }

  return '<div class="card" data-bud-key="fix">'+budCardHead('fix','📌 Fixed expenses',isCur)+rows+recurBlock+
    '<div class="bud-row"><div class="bud-row-name" style="font-weight:700">Total fixed</div><div class="bud-row-calc" id="calc-fixed" style="color:var(--muted)">—</div></div>'+
    (editing?'<button class="add-cat-btn" data-type="fix">+ Add fixed expense</button>':'')+
  '</div>';
}
// ── Weekly variable-spend goal ────────────────────────────────────
// A self-imposed ceiling on the Variable card below, separate from "money left over":
// leftover is whatever income happens to leave behind, this is a number Francois picks and
// tries to stay under. Per-week, so a week with things on can carry a bigger goal without
// rewriting the usual one. The usual goal lives in budDefaults.varGoal; each week stores the
// number that actually applied to it (var_goal), so past weeks aren't rewritten when the
// usual goal changes later.
function getVarGoalDefault(){ const n=parseFloat(budDefaults&&budDefaults.varGoal); return isNaN(n)?null:n; }
function getWeekVarGoal(data){
  const raw=data?data.var_goal:'';
  if(raw!==undefined&&raw!==''&&raw!==null){ const n=parseFloat(raw); if(!isNaN(n)) return n; }
  return getVarGoalDefault();
}
// Days remaining in the viewed week, today included. Only meaningful for the current week —
// a past week has no "rest of the week" left to pace.
function varGoalDaysLeft(){
  const dow=(new Date().getDay()+6)%7; // 0 = Monday … 6 = Sunday
  return 7-dow;
}
function renderVarGoalCard(data,editable){
  const goal=getWeekVarGoal(data);
  const editing=budEditMode.vargoal && editable;
  // Read-only by default (same Edit-button convention as the Income/Fixed/Variable cards):
  // the goal is already spelled out in "left of your $250 goal", so an always-visible input
  // was just clutter on a card you only change occasionally.
  const goalRow=editing
    ? '<div class="bud-row">'+
        '<div class="bud-row-left"><div class="bud-row-name">Goal for this week</div></div>'+
        '<input class="bud-row-input" type="number" inputmode="decimal" id="vargoal-input" placeholder="$0" '+
          'value="'+(goal===null?'':goal)+'" oninput="budVarGoalInput()">'+
      '</div>'
    : '';
  // The goal has to survive the input disappearing — updateVarGoalCard falls back to this.
  return '<div class="card vg-card" data-bud-key="vargoal" data-vg-goal="'+(goal===null?'':goal)+'">'+
    budCardHead('vargoal','🎯 Spending goal',editable)+
    goalRow+
    '<div class="vg-body">'+
      '<div class="vg-amt" id="vargoal-amt">—</div>'+
      '<div class="vg-sub" id="vargoal-sub">Set a goal to start tracking it</div>'+
      '<div class="vg-bar-wrap"><div class="vg-bar-fill" id="vargoal-bar" style="width:0%"></div></div>'+
      '<div class="vg-foot"><span id="vargoal-spent">$0 spent</span><span id="vargoal-pace"></span></div>'+
    '</div>'+
    '<div class="vg-default-line" id="vargoal-defaultline"></div>'+
  '</div>';
}
// Live update from budRecalc — never a re-render, which would drop focus out of the goal
// input mid-typing (the same reason the category rows update by id rather than re-rendering).
function currentVarGoal(){
  const inputEl=document.getElementById('vargoal-input');
  const raw=inputEl ? inputEl.value
                    : (document.querySelector('#bud-vargoal-card .vg-card')||{dataset:{}}).dataset.vgGoal;
  if(raw===undefined||raw===null||raw==='') return null;
  const n=parseFloat(raw);
  return isNaN(n)?null:n;
}
function updateVarGoalCard(totalVar){
  const cardEl=document.querySelector('#bud-vargoal-card .vg-card'); if(!cardEl) return;
  const goal=currentVarGoal();
  const $=(id,t)=>{ const el=document.getElementById(id); if(el) el.textContent=t; };
  const amtEl=document.getElementById('vargoal-amt');
  const barEl=document.getElementById('vargoal-bar');

  $('vargoal-spent','$'+totalVar.toFixed(0)+' spent');

  if(goal===null||isNaN(goal)||goal<=0){
    if(amtEl){ amtEl.textContent='—'; amtEl.style.color='var(--muted)'; }
    $('vargoal-sub',document.getElementById('vargoal-input')?'Enter a goal to start tracking it':'Tap Edit to set a weekly goal');
    $('vargoal-pace','');
    if(barEl){ barEl.style.width='0%'; barEl.style.background='var(--muted)'; }
    if(cardEl) cardEl.classList.remove('vg-over');
    updateVarGoalDefaultLine(goal);
    return;
  }

  const left=goal-totalVar;
  const over=left<0;
  const pct=Math.min(100,Math.round(totalVar/goal*100));
  // Green under, amber from 85% (close enough to pull up), red the moment it ticks over.
  const col=over?'var(--danger)':(totalVar/goal>=0.85?'var(--accent)':'var(--success)');
  if(amtEl){ amtEl.textContent=(over?'-$':'$')+Math.abs(left).toFixed(0); amtEl.style.color=col; }
  $('vargoal-sub',over?'over your $'+goal.toFixed(0)+' goal':'left of your $'+goal.toFixed(0)+' goal');
  if(barEl){ barEl.style.width=pct+'%'; barEl.style.background=col; }
  if(cardEl) cardEl.classList.toggle('vg-over',over);

  // Pace only makes sense for the week actually in progress.
  if(currentWeekIdx===0 && !over){
    const days=varGoalDaysLeft();
    $('vargoal-pace','$'+(left/days).toFixed(0)+'/day for '+days+' more day'+(days===1?'':'s'));
  } else if(currentWeekIdx===0 && over){
    // The amount over is already the headline — the useful extra here is how long you still
    // have to hold the line for.
    const days=varGoalDaysLeft();
    $('vargoal-pace',days+' day'+(days===1?'':'s')+' still to go');
  } else {
    $('vargoal-pace',totalVar<=goal?'✓ Stayed under':'✗ Went over');
  }
  updateVarGoalDefaultLine(goal);
}
// "Usual goal" controls: only shown when this week's number differs from the saved default.
function updateVarGoalDefaultLine(goal){
  const el=document.getElementById('vargoal-defaultline'); if(!el) return;
  if(!document.getElementById('vargoal-input')){ el.innerHTML=''; return; } // read-only card
  const def=getVarGoalDefault();
  if(goal===null||isNaN(goal)||def===null||goal===def){
    el.innerHTML = def===null ? '' : '<span class="vg-default-txt">Your usual goal: $'+def.toFixed(0)+'</span>';
    return;
  }
  el.innerHTML='<span class="vg-default-txt">Usual: $'+def.toFixed(0)+'</span>'+
    '<button class="vg-default-btn" onclick="budVarGoalReset()">Use usual</button>'+
    '<button class="vg-default-btn" onclick="budVarGoalSaveDefault()">Make this my usual</button>';
}
function budVarGoalInput(){
  // First goal ever set becomes the usual one — otherwise the "usual" line would stay empty
  // until the user found the button, and there'd be nothing for new weeks to inherit.
  if(getVarGoalDefault()===null){
    const n=parseFloat(document.getElementById('vargoal-input')?.value);
    if(!isNaN(n)&&n>0){ budDefaults.varGoal=n; budPersistDefaults(); }
  }
  budRecalc(); budSaveDraft();
}
function budVarGoalSaveDefault(){
  const n=parseFloat(document.getElementById('vargoal-input')?.value);
  if(isNaN(n)||n<=0) return;
  budDefaults.varGoal=n; budPersistDefaults();
  budRecalc();
  if(typeof showToast==='function') showToast('Usual goal set to $'+n.toFixed(0));
}
function budVarGoalReset(){
  const def=getVarGoalDefault(); if(def===null) return;
  const el=document.getElementById('vargoal-input'); if(!el) return;
  el.value=def;
  budRecalc(); budSaveDraft();
}
// budSaveDefaults() rewrites the four legacy fixed-expense fields from the DOM, which isn't
// what we want here — this just persists whatever is already on the object, and syncs.
function budPersistDefaults(){
  localStorage.setItem('daily_budget_defaults', JSON.stringify(budDefaults));
  syncBudDefaultsToFirebase();
}
function renderVariableCard(data,isCur){
  const editing=budEditMode.var && isCur;
  const cats=activeCats(loadVarCats()); // archived keep counting in totals, just no row
  const rows=cats.map(c=>{
    // Show empty placeholder for no/zero spend — never a filled "0"
    const num=parseFloat(data['var_'+c.id]);
    const val=(!isNaN(num)&&num!==0)?data['var_'+c.id]:'';
    return '<div class="bud-row bud-cat-row" data-cat-id="'+c.id+'">'+
      budCatNameHtml('var',c,isCur,editing)+
      '<input class="bud-row-input" type="number" inputmode="decimal" id="var-'+c.id+'" placeholder="$0" value="'+val+'" oninput="budRecalc();budSaveDraft()"'+(isCur?'':' disabled')+'>'+
      (editing?'<button class="delete-cat-btn" data-type="var" data-id="'+c.id+'" aria-label="Remove category">×</button>':'')+
    '</div>';
  }).join('');
  return '<div class="card" data-bud-key="var">'+budCardHead('var','🛒 Variable expenses',isCur)+rows+
    '<div class="bud-row"><div class="bud-row-name" style="font-weight:700">Total variable</div><div class="bud-row-calc" id="calc-variable" style="color:var(--muted)">$0</div></div>'+
    (editing?'<button class="add-cat-btn" data-type="var">+ Add variable expense</button>':'')+
  '</div>';
}
function renderIncomeCard(data,isCur){
  const editing=budEditMode.inc && isCur;
  const cats=activeCats(loadIncCats()); // archived keep counting in totals, just no row
  const rows=cats.map(c=>{
    const raw=data['inc_'+c.id];
    const val=(raw!==undefined&&raw!=='')?raw:'';
    const hrsRaw=data['hrs_'+c.id];
    const hrsVal=(hrsRaw!==undefined&&hrsRaw!=='')?hrsRaw:'';
    // Optional hours-worked companion input (hrs_<id>), independent of the dollar figure.
    // Hidden while category-editing to keep room for the rename/delete controls.
    const hrsInput=editing?'':'<input class="bud-row-input" type="number" inputmode="decimal" id="hrs-'+c.id+'" placeholder="hrs" value="'+hrsVal+'" style="width:58px;margin-right:6px;font-size:14px" oninput="budHoursInput(\''+c.id+'\')"'+(isCur?'':' disabled')+'>';
    return '<div class="bud-row bud-cat-row" data-cat-id="'+c.id+'">'+
      budCatNameHtml('inc',c,isCur,editing)+
      hrsInput+
      '<input class="bud-row-input" type="number" inputmode="decimal" id="inc-'+c.id+'" placeholder="$0" value="'+val+'" oninput="this.removeAttribute(\'data-autofilled\');budRecalc();budSaveDraft()"'+(isCur?'':' disabled')+'>'+
      (editing?'<button class="delete-cat-btn" data-type="inc" data-id="'+c.id+'" aria-label="Remove income source">×</button>':'')+
    '</div>';
  }).join('');
  return '<div class="card" data-bud-key="inc">'+budCardHead('inc','💵 Income',isCur)+rows+
    '<div class="bud-row"><div class="bud-row-name" style="font-weight:700">Total income</div><div class="bud-row-calc" id="calc-income" style="color:var(--green)">$0</div></div>'+
    (editing?'<button class="add-cat-btn" data-type="inc">+ Add income source</button>':'')+
  '</div>';
}
// Hours-worked companion input. If the source has an hourly rate configured, entering hours
// pre-fills the dollar field with hours × rate as a starting ESTIMATE — only while the dollar
// field is empty or still holding a previous estimate (data-autofilled). Typing in the dollar
// field clears that flag, and a manually-typed value is never overwritten (actual pay can
// include penalty rates/tips/tax adjustments that don't equal hours × rate).
function budHoursInput(id){
  const hrsEl=document.getElementById('hrs-'+id), dEl=document.getElementById('inc-'+id);
  const rate=getHourlyRate(id);
  if(hrsEl && dEl && rate>0 && (dEl.value===''||dEl.getAttribute('data-autofilled')==='1')){
    const hrs=parseFloat(hrsEl.value);
    if(!isNaN(hrs)&&hrs>0){
      dEl.value=String(Math.round(hrs*rate*100)/100);
      dEl.setAttribute('data-autofilled','1');
    } else if(dEl.getAttribute('data-autofilled')==='1'){
      dEl.value=''; dEl.removeAttribute('data-autofilled');
    }
  }
  budRecalc(); budSaveDraft();
}
// Shared loader/saver lookup so add/delete/rename work for all three category types
const BUD_CAT_LOAD={fix:loadFixCats, var:loadVarCats, inc:loadIncCats};
const BUD_CAT_SAVE={fix:saveFixCats, var:saveVarCats, inc:saveIncCats};
function budRenameCat(type,id,val){
  const load=BUD_CAT_LOAD[type], save=BUD_CAT_SAVE[type];
  if(!load) return;
  const cats=load(); const c=cats.find(x=>x.id===id); if(!c) return;
  c.name=val; save(cats); // no re-render: keep input focus while typing
}
// One delegated listener for add / delete category buttons (survives re-renders)
document.addEventListener('click', function(e){
  // Per-card Edit/Done toggle: flush amounts, flip the card's mode, re-render. Names are
  // saved live (budRenameCat oninput) and amounts by budSaveDraft, so Done needs no extra save.
  const editBtn=e.target.closest('[data-action="bud-edit-toggle"]');
  if(editBtn){
    const type=editBtn.dataset.type;
    if(type in budEditMode){
      budSaveDraft();
      budEditMode[type]=!budEditMode[type];
      renderBudgetTab();
    }
    return;
  }
  // Unlock/lock a past week for backfill editing (e.g. fixing a previous week's income).
  const weekEdit=e.target.closest('[data-action="bud-week-edit"]');
  if(weekEdit){
    budSaveDraft();              // flush any edits to the viewed week before flipping the lock
    budPastEdit=!budPastEdit;
    renderBudgetTab();
    return;
  }
  const del=e.target.closest('.delete-cat-btn');
  if(del){
    budSaveDraft();   // flush the week's current input values before the DOM is rebuilt
    const type=del.dataset.type, id=del.dataset.id;
    const load=BUD_CAT_LOAD[type], save=BUD_CAT_SAVE[type];
    if(!load) return;
    save(load().filter(c=>c.id!==id));
    renderBudgetTab();
    return;
  }
  const add=e.target.closest('.add-cat-btn');
  if(add){
    budSaveDraft();   // flush the week's current input values before the DOM is rebuilt
    const type=add.dataset.type;
    const load=BUD_CAT_LOAD[type], save=BUD_CAT_SAVE[type];
    if(!load) return;
    const id=genCatId(type);
    const cats=load(); cats.push({id,name:'',budget:''}); save(cats);
    renderBudgetTab();
    setTimeout(()=>document.getElementById('catname-'+type+'-'+id)?.focus(),60);
    return;
  }
});

// Collapsible budget cards: one delegated listener; state persisted by card index
document.addEventListener('click', function(e){
  if(e.target.closest('[data-action="bud-edit-toggle"]')) return; // Edit button isn't a collapse tap
  const toggle=e.target.closest('.bud-toggle');
  if(!toggle) return;
  const card=toggle.closest('.card');
  if(!card) return;
  card.classList.toggle('bud-collapsed');
  saveBudgetCollapseState();
});
// Keyed by data-bud-key, not by position. The old index-based array silently mis-applied
// itself whenever the card count changed — the due banner and the previous-weeks list both
// render .card elements conditionally, so a collapsed card could reappear as a different one.
// Cards without a key (those two) simply aren't persisted, which is what we want anyway.
function saveBudgetCollapseState(){
  const states={};
  document.querySelectorAll('#budget-week-view .card[data-bud-key]').forEach(card=>{
    states[card.dataset.budKey]=card.classList.contains('bud-collapsed');
  });
  localStorage.setItem('daily_budget_collapse', JSON.stringify(states));
}
function restoreBudgetCollapseState(){
  try{
    const states=JSON.parse(localStorage.getItem('daily_budget_collapse')||'{}');
    if(!states||Array.isArray(states)||typeof states!=='object') return; // legacy array: ignore, re-saves on first toggle
    document.querySelectorAll('#budget-week-view .card[data-bud-key]').forEach(card=>{
      if(states[card.dataset.budKey]) card.classList.add('bud-collapsed');
    });
  }catch(e){}
}

function renderBudgetTab(){
  const monday=getMondayOf(currentWeekIdx);
  const key=weekKey(monday);
  const data=getBudWeekData(key);
  const isCur=currentWeekIdx===0;
  if(isCur) budPastEdit=false;          // current week is always editable; clear any past-edit state
  const editable = isCur || budPastEdit; // current week, or a past week the user unlocked

  document.getElementById('week-label-main').textContent=
    isCur?'This week':currentWeekIdx===-1?'Last week':Math.abs(currentWeekIdx)+' weeks ago';
  document.getElementById('week-label-sub').textContent=fmtWeekLabel(monday);
  document.getElementById('week-next-btn').style.opacity=currentWeekIdx>=0?'0.3':'1';

  // Edit-week toggle: only on past weeks (current week is editable already).
  const weekEditBtn=document.getElementById('week-edit-btn');
  if(weekEditBtn){
    weekEditBtn.style.display = isCur ? 'none' : 'inline-block';
    weekEditBtn.textContent = budPastEdit ? '✓ Done editing' : '✎ Edit week';
  }

  // Savings: free per-week amount. New weeks store sav_amount; weeks saved under the old
  // "target + extra" model are shown at their historical total so nothing reads as $0.
  const savEl=document.getElementById('sav-amount');
  if(savEl){
    savEl.value=(data.sav_amount!==undefined&&data.sav_amount!=='')
      ? data.sav_amount
      : '';
    savEl.disabled=!editable; savEl.style.opacity=editable?'1':'0.7';
  }

  // Dynamic income + fixed + variable category cards
  const incWrap=document.getElementById('bud-income-card');
  if(incWrap) incWrap.innerHTML=renderIncomeCard(data,editable);
  const fixWrap=document.getElementById('bud-fixed-card');
  if(fixWrap) fixWrap.innerHTML=renderFixedCard(data,editable);
  const goalWrap=document.getElementById('bud-vargoal-card');
  if(goalWrap) goalWrap.innerHTML=renderVarGoalCard(data,editable);
  const varWrap=document.getElementById('bud-variable-card');
  if(varWrap) varWrap.innerHTML=renderVariableCard(data,editable);
  // Empty string when nothing is stranded, so this slot collapses to nothing in normal use.
  const strandedWrap=document.getElementById('bud-stranded-card');
  if(strandedWrap) strandedWrap.innerHTML=renderStrandedCard();

  const notesEl=document.getElementById('week-notes');
  if(notesEl){ notesEl.value=data.notes||''; notesEl.disabled=!editable; }

  const saveBtn=document.getElementById('save-week-btn');
  const saveMsg=document.getElementById('save-week-msg');
  if(saveBtn) saveBtn.style.display=editable?'block':'none';
  if(saveMsg) saveMsg.style.display='none';

  budRecalc(true);
  renderPrevWeeks();
  renderBudgetConfig();
  loadCCInput();
  renderDueBanner(monday);
  restoreBudgetCollapseState();
}
// Visual reminder only (never touches the leftover calc): for the week being viewed, surface
// any debt account with statement tracking on whose due date falls Mon–Sun of that week.
// Supports several at once.
function renderDueBanner(monday){
  const el=document.getElementById('bud-due-banner'); if(!el) return;
  const mondayStr=weekKey(monday);
  const sun=new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+6);
  const sundayStr=weekKey(sun);
  const hits=accounts.filter(a=>a&&a.type==='debt'&&a.tracksStatement&&a.dueDate
    && String(a.dueDate).slice(0,10)>=mondayStr && String(a.dueDate).slice(0,10)<=sundayStr);
  if(!hits.length){ el.innerHTML=''; return; }
  el.innerHTML=hits.map(a=>{
    const due=new Date(String(a.dueDate).slice(0,10)+'T12:00:00');
    const dueTxt=isNaN(due.getTime())?a.dueDate:due.toLocaleDateString('en-AU',{day:'numeric',month:'short'});
    const amt=parseFloat(a.statementBalance)||0;
    return '<div class="card" style="background:var(--amber-bg);border:1px solid var(--amber-border);padding:12px 14px;margin-bottom:12px;display:flex;align-items:center;gap:8px">'+
      '<span style="font-size:18px">💳</span>'+
      '<span style="font-size:13px;font-weight:600;color:var(--amber-dark)">'+_catEscHtml(a.name)+': '+fmtMoney(amt)+' due '+dueTxt+'</span>'+
    '</div>';
  }).join('');
}

// ── Budget config: pay days + weekly savings target (relocated from Settings) ──
// These feed the Home tab (pay-day countdown + budget-left projection) and the
// legacy-week savings fallback. Stored in budDefaults alongside the fixed defaults.
const BUD_DAY_NAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function renderBudgetConfig(){
  const sg=document.getElementById('bud-cfg-savings-goal');
  if(sg) sg.value=budDefaults.savingsGoal??'';
  // One pay-day selector per actual income source (loadIncCats — the list used for weekly
  // entries), so adding/renaming/removing a source updates these automatically.
  const wrap=document.getElementById('bud-payday-rows');
  if(wrap){
    const dayOpts=(cur)=>BUD_DAY_NAMES.map((d,v)=>'<option value="'+v+'"'+(v===cur?' selected':'')+'>'+d+'</option>').join('');
    const cats=loadIncCats();
    wrap.innerHTML = cats.length
      ? cats.map(c=>{
          const name=catIsUnnamed(c)?'Income source':c.name.trim();
          const rate=getHourlyRate(c.id);
          return '<div class="bud-row">'+
            '<div class="bud-row-left"><div class="bud-row-name">'+_catEscHtml(name)+' pay day</div></div>'+
            '<select class="bud-row-input" id="bud-payday-'+c.id+'" style="width:140px;text-align:left;padding:0 8px;-webkit-appearance:menulist;appearance:menulist" onchange="budSaveConfig()">'+dayOpts(getPayDay(c.id))+'</select>'+
          '</div>'+
          // Optional $/hr — lets the weekly Income card pre-fill hours × rate as a starting
          // estimate. Blank = off; actual pay entry stays manual either way.
          '<div class="bud-row">'+
            '<div class="bud-row-left"><div class="bud-row-name" style="font-weight:500;color:var(--muted)">'+_catEscHtml(name)+' hourly rate</div></div>'+
            '<input class="bud-row-input" type="number" inputmode="decimal" id="bud-rate-'+c.id+'" placeholder="$/hr" value="'+(rate||'')+'" onchange="budSaveConfig()">'+
          '</div>';
        }).join('')
      : '<div class="bud-row"><div class="bud-row-left"><div class="bud-row-budget">Add an income source above to set its pay day.</div></div></div>';
  }
}
function budSaveConfig(){
  const sg=document.getElementById('bud-cfg-savings-goal');
  if(sg){ const n=parseFloat(sg.value); budDefaults.savingsGoal = isNaN(n)?undefined:n; }
  // Read every generated pay-day selector back into budDefaults.payDays (keyed by source id).
  loadIncCats().forEach(c=>{
    const el=document.getElementById('bud-payday-'+c.id);
    if(el){ const v=parseInt(el.value); if(!isNaN(v)) setPayDay(c.id, v); }
    const rateEl=document.getElementById('bud-rate-'+c.id);
    if(rateEl) setHourlyRate(c.id, rateEl.value); // blank/0 clears the rate
  });
  localStorage.setItem('daily_budget_defaults', JSON.stringify(budDefaults));
  syncBudDefaultsToFirebase();
  // Repaint the savings card so a changed goal shows on its label (and recolours the figure)
  // straight away rather than waiting for the next Budget render.
  if(typeof budRecalc==='function') budRecalc();
}

// ── Budget calculator ──────────────────────────────────────────────
// Standalone on purpose. The previous attempt wired itself into the budget inputs, hijacking
// taps and pulling focus off the field, which let a sync refresh overwrite an in-progress
// entry — the "reverting values" bug that got it removed (05e1cd1). This one touches nothing
// but its own display.
// Sequential four-function behaviour, like a physical calculator: each new operator resolves
// the pending one. No eval() anywhere — the operation is applied by a switch.
let _bcalc={acc:null, op:null, entry:'0', fresh:true};
function bcalcRender(){
  const d=document.getElementById('bcalc-display'); if(d) d.textContent=_bcalc.entry;
  const e=document.getElementById('bcalc-expr');
  if(e){
    const sym={'+':'+','-':'−','*':'×','/':'÷'}[_bcalc.op]||'';
    e.innerHTML=_bcalc.op!=null ? (bcalcTrim(_bcalc.acc)+' '+sym) : '&nbsp;';
  }
}
function bcalcTrim(n){
  if(n==null||isNaN(n)) return '0';
  // Kill floating-point noise (0.1+0.2) without forcing decimals onto whole numbers.
  const r=Math.round(n*1e10)/1e10;
  return String(r);
}
function bcalcDigit(d){
  if(_bcalc.fresh){ _bcalc.entry=d; _bcalc.fresh=false; }
  else if(_bcalc.entry==='0') _bcalc.entry=d;
  else if(_bcalc.entry.replace(/[-.]/g,'').length<12) _bcalc.entry+=d;
  bcalcRender();
}
function bcalcDot(){
  if(_bcalc.fresh){ _bcalc.entry='0.'; _bcalc.fresh=false; }
  else if(!_bcalc.entry.includes('.')) _bcalc.entry+='.';
  bcalcRender();
}
function bcalcApply(a,b,op){
  switch(op){
    case '+': return a+b;
    case '-': return a-b;
    case '*': return a*b;
    case '/': return b===0?NaN:a/b;
    default:  return b;
  }
}
function bcalcOp(op){
  const cur=parseFloat(_bcalc.entry)||0;
  if(_bcalc.op!=null && !_bcalc.fresh){
    const r=bcalcApply(_bcalc.acc,cur,_bcalc.op);
    if(isNaN(r)){ bcalcClear(); _bcalc.entry='Can\'t divide by 0'; bcalcRender(); return; }
    _bcalc.acc=r; _bcalc.entry=bcalcTrim(r);
  } else {
    _bcalc.acc=cur;
  }
  _bcalc.op=op; _bcalc.fresh=true;
  bcalcRender();
}
function bcalcEquals(){
  if(_bcalc.op==null) return;
  const cur=parseFloat(_bcalc.entry)||0;
  const r=bcalcApply(_bcalc.acc,cur,_bcalc.op);
  if(isNaN(r)){ bcalcClear(); _bcalc.entry='Can\'t divide by 0'; bcalcRender(); return; }
  _bcalc.entry=bcalcTrim(r); _bcalc.acc=null; _bcalc.op=null; _bcalc.fresh=true;
  bcalcRender();
}
function bcalcClear(){ _bcalc={acc:null,op:null,entry:'0',fresh:true}; bcalcRender(); }
function bcalcSign(){
  if(_bcalc.entry==='0') return;
  _bcalc.entry=_bcalc.entry.startsWith('-')?_bcalc.entry.slice(1):'-'+_bcalc.entry;
  bcalcRender();
}
// Percent of the pending left-hand value where there is one (200 + 10% = 220), otherwise a
// plain division by 100 — matching what a phone calculator does.
function bcalcPercent(){
  const cur=parseFloat(_bcalc.entry)||0;
  _bcalc.entry=bcalcTrim(_bcalc.op!=null&&_bcalc.acc!=null ? _bcalc.acc*cur/100 : cur/100);
  _bcalc.fresh=false;
  bcalcRender();
}
function bcalcBack(){
  if(_bcalc.fresh) return;
  _bcalc.entry=_bcalc.entry.length>1?_bcalc.entry.slice(0,-1):'0';
  if(_bcalc.entry==='-') _bcalc.entry='0';
  bcalcRender();
}

// Savings is a free per-week input (no auto-calc / no lock). The savings goal is SUGGESTIVE
// only — it never fills in an amount, it just colours the savings figure once reached.
const SAVINGS_GOAL = 200; // default when the user hasn't set one
function getSavingsGoal(){ const g=parseFloat(budDefaults&&budDefaults.savingsGoal); return isNaN(g)?SAVINGS_GOAL:g; }
function savingsColor(amt){
  const goal=getSavingsGoal();
  if(amt>=goal) return 'var(--positive)';   // met the goal
  if(amt>0)            return 'var(--accent)';       // saved something, below goal
  return 'var(--muted)';                             // nothing saved
}
function countUp(el, target, duration){
  if(!el || isNaN(target)) return;
  duration = duration || 600;
  const start = performance.now();
  function step(now){
    const p = Math.min((now-start)/duration, 1);
    const ease = 1 - Math.pow(1-p, 3);
    el.textContent = '$' + Math.round(target * ease).toLocaleString();
    if(p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function budRecalc(animate){
  const v=id=>parseFloat(document.getElementById(id)?.value)||0;
  let totalIncome=0;
  // An archived category has no input, so fall back to whatever the week already holds —
  // otherwise the on-screen total would disagree with weekIncome(), which still counts it.
  const _wk=budgetData[weekKey(getMondayOf(currentWeekIdx))]||{};
  const liveOrSaved=(pre,c)=>{ const el=document.getElementById(pre+'-'+c.id);
    return el ? (parseFloat(el.value)||0) : (parseFloat(_wk[pre+'_'+c.id])||0); };
  loadIncCats().forEach(c=>{ totalIncome += liveOrSaved('inc',c); });

  // Dynamic fixed + variable totals (sum across the user's custom categories).
  // Fixed must mirror weekFixedTotal exactly: a blank (or absent) input means "the standard
  // amount was charged", so it falls back to the category's budget. Summing only the input
  // values under-reported the total by every category the user hadn't typed into — and
  // recurring categories have no input at all now, so they'd have counted as zero.
  let totalFixed=0;
  loadFixCats().forEach(c=>{
    const el=document.getElementById('fix-'+c.id);
    const raw=el?el.value:'';
    totalFixed += (raw!==undefined&&raw!=='') ? (parseFloat(raw)||0) : catBudget(c);
  });
  let totalVar=0;
  loadVarCats().forEach(c=>{ totalVar += liveOrSaved('var',c); });

  // Savings is a free per-week amount (no fixed target); the goal is display-only.
  const totalSaved  = parseFloat(document.getElementById('sav-amount')?.value)||0;
  const totalOut    = totalSaved+totalFixed+totalVar;
  const leftover    = totalIncome>0?totalIncome-totalOut:null;

  const $ = (id,t) => { const el=document.getElementById(id); if(el) el.textContent=t; };
  $('calc-income',  totalIncome>0?'$'+totalIncome.toFixed(0):'—');
  $('calc-saved',   '$'+totalSaved.toFixed(0));
  $('calc-fixed',   '$'+totalFixed.toFixed(0));
  $('calc-variable',totalVar>0?'$'+totalVar.toFixed(0):'—');
  $('calc-leftover',leftover!==null?(leftover>=0?'+$':'-$')+Math.abs(leftover).toFixed(0):'—');
  updateVarGoalCard(totalVar);

  // The goal label was hardcoded as "Goal: $200 minimum" in index.html, so it kept showing
  // $200 no matter what the user set in Pay days & savings goal. Drive it from the saved value.
  $('sav-goal-label','Goal: $'+getSavingsGoal().toLocaleString()+' minimum');
  // Header summary: this week's savings stays readable once the card is collapsed. The
  // generic rule keeps only the LAST .bud-row, which here is "Total saved" — not the figure
  // that matters week to week.
  $('sav-head-sum','$'+totalSaved.toFixed(0));
  // Collapsed-card totals, so minimising a card never hides its figure.
  $('sum-inc','$'+totalIncome.toFixed(0));
  $('sum-fix','$'+totalFixed.toFixed(0));
  $('sum-var','$'+totalVar.toFixed(0));
  const _vg=currentVarGoal&&currentVarGoal();
  $('sum-vargoal',_vg?('$'+totalVar.toFixed(0)+' / $'+Math.round(_vg)):'—');
  const savSum=document.getElementById('sav-head-sum');
  if(savSum) savSum.style.color = totalSaved>=getSavingsGoal() ? 'var(--blue)' : 'var(--muted)';

  // Suggestive savings goal: below it → red, met → blue
  const calcSavedEl=document.getElementById('calc-saved');
  if(calcSavedEl) calcSavedEl.style.color = totalSaved>=getSavingsGoal() ? 'var(--blue)' : 'var(--danger)';

  const pill=document.getElementById('week-status-pill');
  if(pill){
    if(leftover===null){pill.className='status-pill good';pill.textContent='⏳ Enter income';}
    else if(leftover>=50){pill.className='status-pill good';pill.textContent='🟢 On track';}
    else if(leftover>=0){pill.className='status-pill warn';pill.textContent='🟡 Tight week';}
    else{pill.className='status-pill over';pill.textContent='🔴 Over budget';}
  }

  // Hero summary card
  $('bud-hero-income',  totalIncome>0?'$'+totalIncome.toFixed(0):'$0');
  $('bud-hero-saved',   '$'+totalSaved.toFixed(0));
  $('bud-hero-leftover',leftover!==null?(leftover>=0?'+$':'-$')+Math.abs(leftover).toFixed(0):'—');
  // Debts + net worth now source from daily_accounts (assets − debts), not the old CC/savings logs.
  const ccDebt=accountsDebtsTotal();
  const assetsTot=accountsAssetsTotal();
  const netSav=assetsTot-ccDebt;
  $('bud-hero-cc', '$'+ccDebt.toFixed(0));
  $('bud-hero-net', accounts.length?((netSav>=0?'+$':'-$')+Math.abs(netSav).toFixed(0)):'—');
  if(animate){
    const _el=id=>document.getElementById(id);
    if(totalIncome>0) countUp(_el('bud-hero-income'), totalIncome);
    countUp(_el('bud-hero-saved'), totalSaved);
    countUp(_el('bud-hero-cc'), ccDebt);
  }
  const heroPill=document.getElementById('week-status-pill-hero');
  if(heroPill){
    heroPill.textContent = leftover===null ? 'Enter income' : (leftover>=0 ? '✓ On track' : '⚠ Over budget');
    heroPill.style.background = (leftover!==null&&leftover<0) ? 'rgba(231,76,60,.5)' : 'rgba(255,255,255,.2)';
  }

  const barEl=document.getElementById('budget-bar');     // white fill on the hero gradient
  const barL=document.getElementById('budget-bar-label-l');
  const barR=document.getElementById('budget-bar-label-r');
  if(totalIncome>0){
    const pct=Math.min(110,Math.round(totalOut/totalIncome*100));
    if(barEl){
      if(animate){
        barEl.classList.remove('budget-hero-bar-fill-animate');
        barEl.style.width='0%'; barEl.offsetWidth;
        barEl.classList.add('budget-hero-bar-fill-animate');
        const _tgt=Math.min(100,pct)+'%';
        requestAnimationFrame(()=>{ barEl.classList.remove('budget-hero-bar-fill-animate'); barEl.style.transition='width 0.65s cubic-bezier(0.22,0.61,0.36,1)'; barEl.style.width=_tgt; });
      } else { barEl.style.width=Math.min(100,pct)+'%'; }
    }
    if(barL) barL.textContent='$'+totalOut.toFixed(0)+' spent';
    if(barR) barR.textContent=pct+'% of income';
  } else {
    if(barEl) barEl.style.width='0%';
    if(barL) barL.textContent='Enter income to see breakdown';
    if(barR) barR.textContent='';
  }
}

// Write the per-week editable fields from the DOM into a week record.
//
// CRITICAL: sav-amount and week-notes live in STATIC html — they're always in the DOM,
// even when the Budget tab isn't the active view. The inc/fix/var inputs, by contrast, are
// rendered dynamically and only exist while the tab is on screen (hence their `if(el)`
// guard). Without a matching guard, a save that fires while another tab is showing would
// read the STALE static input — e.g. an empty sav-amount left over from before a cloud sync
// updated budgetData in the background — and
// write that empty value back with a fresh updatedAt, which then wins every merge and wipes
// the real saved amount locally AND on every other device. This is why savings (and only
// savings) kept vanishing on refresh and refused to sync. So only capture the two static
// fields when the Budget tab is the live, rendered view; otherwise preserve budgetData's
// existing values. (renderBudgetTab keeps these inputs in sync with budgetData whenever the
// tab is active — including on incoming cloud echoes — so "budget is the view" == "fresh".)
function budWriteFields(d){
  const gv=id=>document.getElementById(id)?.value||'';
  if(S.view==='budget'){
    d.sav_amount = gv('sav-amount');
    // Only when the goal input is actually on screen (it's behind the card's Edit button) —
    // otherwise a routine draft flush would blank the week's saved goal.
    if(document.getElementById('vargoal-input')) d.var_goal = gv('vargoal-input');
    d.notes      = gv('week-notes');
  }
  loadIncCats().forEach(c=>{ const el=document.getElementById('inc-'+c.id); if(el) d['inc_'+c.id]=el.value||''; });
  // Optional hours-worked per source — stored independently of the dollar figure.
  loadIncCats().forEach(c=>{ const el=document.getElementById('hrs-'+c.id); if(el) d['hrs_'+c.id]=el.value||''; });
  loadFixCats().forEach(c=>{ const el=document.getElementById('fix-'+c.id); if(el) d['fix_'+c.id]=el.value||''; });
  loadVarCats().forEach(c=>{ const el=document.getElementById('var-'+c.id); if(el) d['var_'+c.id]=el.value||''; });
}
function budSaveDraft(){
  // Current week always auto-persists; a past week persists only while unlocked for editing.
  if(currentWeekIdx !== 0 && !budPastEdit) return;
  const key=weekKey(getMondayOf(currentWeekIdx)); // write to the VIEWED week, not always "this" week
  if(!budgetData[key]) budgetData[key]={};
  const d=budgetData[key];
  const before=JSON.stringify(d);
  budWriteFields(d);
  if(!d.saved) d.draft=true;
  // Only a REAL change stamps and syncs. Draft flushes also fire on render/week-nav with
  // untouched inputs — stamping those would let a device with stale data pass it off as
  // the freshest copy just by being opened.
  if(JSON.stringify(d)===before) return;
  d.updatedAt=Date.now();
  budSaveData(key);
}

function budSaveCurrentWeek(){
  const monday=getMondayOf(currentWeekIdx);
  const key=weekKey(monday);
  if(!budgetData[key]) budgetData[key]={};
  const d=budgetData[key];
  budWriteFields(d);
  d.saved=true; delete d.draft;
  d.updatedAt=Date.now(); // explicit user save — always stamp
  budSaveData(key); renderPrevWeeks(); updateNavBadges();
}

function budSaveWeekExplicit(){
  budSaveCurrentWeek();
  const btn=document.getElementById('save-week-btn');
  const msg=document.getElementById('save-week-msg');
  if(btn){btn.textContent='✓ Saved!';btn.style.background='var(--accent)';}
  if(msg) msg.style.display='block';
  setTimeout(()=>{
    if(btn){btn.textContent='Save week';btn.style.background='';}
    if(msg) msg.style.display='none';
  },1800);
}


function _applyCardCollapse(id, collapse){
  const card=document.getElementById(id); if(!card) return;
  const body=document.getElementById(id+'-body');
  if(!body){ if(collapse) card.classList.add('collapsed'); else card.classList.remove('collapsed'); return; }
  if(collapse){
    card.classList.add('collapsed');
    body.style.height=body.scrollHeight+'px';
    body.style.overflow='hidden';
    setTimeout(()=>{
      body.style.transition='height 0.3s ease,opacity 0.25s ease';
      body.style.height='0';
      body.style.opacity='0';
    }, 16);
  } else {
    card.classList.remove('collapsed');
    body.style.transition='height 0.3s ease,opacity 0.25s ease';
    body.style.height=body.scrollHeight+'px';
    body.style.opacity='';
    body.addEventListener('transitionend',()=>{ body.style.height=''; body.style.transition=''; },{ once:true });
  }
}
function toggleCard(id){
  const card=document.getElementById(id); if(!card) return;
  const isCollapsed=!card.classList.contains('collapsed');
  _applyCardCollapse(id, isCollapsed);
  let collapsed; try{ collapsed=JSON.parse(localStorage.getItem('daily_collapsed')||'{}'); }catch(e){ collapsed={}; }
  if(isCollapsed) collapsed[id]=true; else delete collapsed[id];
  localStorage.setItem('daily_collapsed',JSON.stringify(collapsed));
}
function restoreCardCollapse(){
  let collapsed; try{ collapsed=JSON.parse(localStorage.getItem('daily_collapsed')||'{}'); }catch(e){ collapsed={}; }
  Object.keys(collapsed).forEach(id=>{
    const card=document.getElementById(id); if(!card) return;
    card.classList.add('collapsed');
    const body=document.getElementById(id+'-body');
    if(body){ body.style.height='0'; body.style.opacity='0'; body.style.overflow='hidden'; }
  });
}

function renderPrevWeeks(){
  const wrap=document.getElementById('prev-weeks-section'); if(!wrap) return;
  const curKey=weekKey(getMondayOf(currentWeekIdx));
  const keys=Object.keys(budgetData).filter(k=>k<curKey).sort((a,b)=>b.localeCompare(a)).slice(0,8);
  if(!keys.length){wrap.innerHTML=emptyState('📋','No previous weeks','Your saved weeks will appear here');return;}
  const chevron='<svg class="card-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  let html='<div class="card" id="bud-card-prev"><div class="card-collapse-header" onclick="toggleCard(\'bud-card-prev\')"><div class="sec-label" style="margin-bottom:0">Previous weeks</div><div class="card-collapse-right">'+chevron+'</div></div><div class="card-collapse-body" id="bud-card-prev-body" style="padding-top:6px">';
  keys.forEach(k=>{
    const d=budgetData[k];
    const inc=weekIncome(d);
    const saved=weekSavedAmt(d);
    const left=inc>0?weekLeftover(d):null;
    const mon=new Date(k+'T12:00:00');
    const fri=new Date(mon); fri.setDate(mon.getDate()+4);
    const lbl=mon.toLocaleDateString('en-AU',{day:'numeric',month:'short'})+' – '+fri.toLocaleDateString('en-AU',{day:'numeric',month:'short'});
    html+='<div class="prev-week-row"><div class="prev-week-date">'+lbl+'</div><div class="prev-week-pills">';
    if(inc>0) html+='<span class="prev-pill in">$'+inc.toFixed(0)+' in</span>';
    html+='<span class="prev-pill saved">$'+saved.toFixed(0)+' saved</span>';
    if(left!==null) html+='<span class="prev-pill '+(left>=0?'left':'over')+'">'+(left>=0?'+':'-')+'$'+Math.abs(left).toFixed(0)+'</span>';
    html+='</div></div>';
  });
  html+='</div></div></div>';
  wrap.innerHTML=html;
}

function renderMonth(){
  const monthDate=getMonthDate(currentMonthOffset);
  const isCur=currentMonthOffset>=0;
  document.getElementById('month-label-main').textContent=fmtMonthLabel(monthDate);
  document.getElementById('month-next-btn').style.opacity=isCur?'0.3':'1';
  const keys=getMondaysInMonth(monthDate);
  let totalIncome=0,totalSaved=0,totalSpending=0,weekCount=0;
  keys.forEach(k=>{
    const d=budgetData[k]; if(!d) return; weekCount++;
    totalIncome+=weekIncome(d);
    totalSaved+=weekSavedAmt(d);
    totalSpending+=weekSpending(d);
  });
  const totalOut=totalSaved+totalSpending;
  const leftover=totalIncome>0?totalIncome-totalOut:null;

  document.getElementById('month-label-sub').textContent=weekCount>0?weekCount+' week'+(weekCount>1?'s':'')+' recorded':'No data saved yet';

  const sg=document.getElementById('month-summary-grid');
  if(sg){
    // Income and Expenses rather than Saved and CC balance: the CC balance is a running debt
    // that has nothing to do with the month being viewed, and Saved was already implied by
    // the savings rate beside it. These three now describe the same month — what came in,
    // what went out (fixed + variable), and what proportion stuck.
    const savRate=totalIncome>0?(totalSaved/totalIncome*100).toFixed(0)+'%':'—';
    sg.innerHTML=[
      {val:savRate,lbl:'Savings rate',color:BUD_CHART_COLORS.rate},
      {val:weekCount>0?'$'+Math.round(totalIncome).toLocaleString():'—',lbl:'Income',color:BUD_CHART_COLORS.income},
      {val:weekCount>0?'$'+Math.round(totalSpending).toLocaleString():'—',lbl:'Expenses',color:BUD_CHART_COLORS.variable},
    ].map(s=>'<div class="sum-card"><div class="sum-card-val" style="color:'+s.color+'">'+s.val+'</div><div class="sum-card-lbl">'+s.lbl+'</div></div>').join('');
  }

  const barEl=document.getElementById('month-bar');
  const barL=document.getElementById('month-bar-label-l');
  const barR=document.getElementById('month-bar-label-r');
  if(totalIncome>0){
    const pct=Math.min(110,Math.round(totalOut/totalIncome*100));
    const bc=pct>100?'var(--danger)':pct>85?'var(--warn)':'var(--success)';
    if(barEl){barEl.style.width=Math.min(100,pct)+'%';barEl.style.background=bc;}
    if(barL) barL.textContent='$'+totalOut.toFixed(0)+' spent';
    if(barR) barR.textContent=pct+'% of income';
  } else {
    if(barEl) barEl.style.width='0%';
    if(barL) barL.textContent=weekCount>0?'Enter income to see breakdown':'No weeks saved for this month';
    if(barR) barR.textContent='';
  }

  const catEl=document.getElementById('month-categories');
  if(catEl){
    const MONTH_CAT_COLORS=['#52B788','#f59e0b','#6366f1','#3b82f6','#ec4899','#8b5cf6','#FF6B35','#14b8a6'];
    const catTotals=activeCats(loadVarCats()).map((c,i)=>({
      label:catLabel(c),
      val:keys.reduce((s,k)=>s+(parseFloat(budgetData[k]?.['var_'+c.id])||0),0),
      color:MONTH_CAT_COLORS[i%MONTH_CAT_COLORS.length]
    }));
    const maxVal=Math.max(1,...catTotals.map(c=>c.val));
    catEl.innerHTML=catTotals.length?catTotals.map(c=>{
      const pct=Math.round(c.val/maxVal*100);
      return '<div class="month-cat-row"><div class="month-cat-label">'+c.label+'</div>'
        +'<div class="month-cat-bar-wrap"><div class="month-cat-bar-fill" style="width:'+pct+'%;background:'+c.color+'"></div></div>'
        +'<div class="month-cat-amount">'+(c.val>0?'$'+c.val.toFixed(0):'—')+'</div></div>';
    }).join(''):'<div style="font-size:13px;color:var(--muted);text-align:center;padding:8px 0">No variable categories</div>';
  }

  const wl=document.getElementById('month-weeks-list');
  if(monthWeekChart){ monthWeekChart.destroy(); monthWeekChart=null; }
  if(wl){
    if(!keys.length){
      wl.innerHTML=emptyState('📅','No weeks in this month','Navigate to a month with budget data');
    } else {
      const labels=keys.map(k=>{
        const mon=new Date(k+'T12:00:00');
        return mon.toLocaleDateString('en-AU',{day:'numeric',month:'short'});
      });
      const data=keys.map(k=>budgetData[k]);
      const legend=budChartLegend([
        {c:BUD_CHART_COLORS.income,l:'Income'},
        {c:BUD_CHART_COLORS.spending,l:'Total expenses'},
        {c:BUD_CHART_COLORS.variable,l:'CC / variable'},
        {c:BUD_CHART_COLORS.fixed,l:'Fixed'},
        {c:BUD_CHART_COLORS.saved,l:'Saved'},
      ]);
      wl.innerHTML='<div class="chart-legend">'+legend+'</div><div id="month-weeks-chart-wrap" style="height:220px"><canvas id="month-weeks-chart"></canvas></div>';
      const ctx=document.getElementById('month-weeks-chart');
      const {gc,tc}=budChartGridColors();
      monthWeekChart=new Chart(ctx,{
        type:'bar',
        data:{
          labels,
          datasets:[
            {label:'Income',data:data.map(weekIncome),backgroundColor:BUD_CHART_COLORS.income,borderRadius:3,order:0},
            {label:'Total expenses',data:data.map(weekSpending),backgroundColor:BUD_CHART_COLORS.spending,borderRadius:3,order:1},
            {label:'CC / variable',data:data.map(weekVarTotal),backgroundColor:BUD_CHART_COLORS.variable,borderRadius:3,order:2},
            {label:'Fixed',data:data.map(weekFixed),backgroundColor:BUD_CHART_COLORS.fixed,borderRadius:3,order:3},
            {label:'Saved',data:data.map(weekSavedAmt),backgroundColor:BUD_CHART_COLORS.saved,borderRadius:3,order:4},
          ]
        },
        options:{
          responsive:true,maintainAspectRatio:false,
          plugins:{
            legend:{display:false},
            tooltip:{callbacks:{label:c=>c.dataset.label+': $'+c.parsed.y.toFixed(0)}}
          },
          scales:{
            x:{grid:{display:false},ticks:{color:tc,font:{size:11}}},
            y:{grid:{color:gc},ticks:{color:tc,font:{size:11},callback:v=>'$'+v},beginAtZero:true}
          }
        }
      });
    }
  }
}

// ── Yearly budget view ────────────────────────────────────────────
// ── Yearly view ────────────────────────────────────────────────────
// This used to read a rolling 12 months for its charts while the "Saved this year" tile read
// the calendar year, so the headline figure and the chart described different spans. Now
// everything is one calendar year, which is also what makes the year nav meaningful.
let budgetYearOffset=0;   // 0 = this year, -1 = last year
function budViewedYear(){ return localMidnight(getLocalDate()).getFullYear()+budgetYearOffset; }
function changeBudgetYear(dir){
  if(dir>0&&budgetYearOffset>=0) return;   // never navigate into the future
  budgetYearOffset+=dir;
  renderYear();
}
// One entry per calendar month of the given year. Months are always returned in order with
// zeros for the empty ones, so a gap month reads as a gap on the chart rather than being
// silently dropped and shifting the axis.
function budYearMonths(year){
  const now=localMidnight(getLocalDate());
  const isCurrentYear=year===now.getFullYear();
  const lastMonth=isCurrentYear?now.getMonth():11;   // don't project into unlived months
  const months=[];
  for(let m=0;m<=lastMonth;m++){
    months.push({m, ym:year+'-'+String(m+1).padStart(2,'0'),
      label:new Date(year,m,1).toLocaleDateString('en-AU',{month:'short'}),
      income:0, fixed:0, variable:0, saved:0, weeks:0});
  }
  Object.keys(budgetData).forEach(k=>{
    if(k.substring(0,4)!==String(year)) return;
    const mi=parseInt(k.substring(5,7),10)-1;
    if(isNaN(mi)||mi<0||mi>lastMonth) return;
    const d=budgetData[k]; if(!d) return;
    const M=months[mi];
    M.income+=weekIncome(d); M.fixed+=weekFixed(d);
    M.variable+=weekVarTotal(d); M.saved+=weekSavedAmt(d); M.weeks++;
  });
  return months;
}
function renderYear(){
  const year=budViewedYear();
  const months=budYearMonths(year);
  const withData=months.filter(m=>m.weeks>0);
  const points=months.map(m=>({label:m.label, income:m.income, saved:m.saved}));
  const fixedArr=months.map(m=>m.fixed);
  const varArr=months.map(m=>m.variable);
  const rateArr=months.map(m=>m.income>0?(m.saved/m.income*100):0);

  // ── Year label + nav ──
  const lm=document.getElementById('year-label-main');
  const ls=document.getElementById('year-label-sub');
  if(lm) lm.textContent=String(year);
  if(ls) ls.textContent=withData.length
    ? withData.length+' month'+(withData.length===1?'':'s')+' recorded'
    : 'No data yet';
  const nextBtn=document.getElementById('year-next-btn');
  if(nextBtn) nextBtn.style.opacity=budgetYearOffset>=0?'0.3':'1';

  // ── Stat tiles ──
  const sg=document.getElementById('year-summary-grid');
  if(sg){
    const totIncome=months.reduce((s,m)=>s+m.income,0);
    const totSaved=months.reduce((s,m)=>s+m.saved,0);
    const avgRate=totIncome>0?(totSaved/totIncome*100):0;
    // Best month by what was actually put away, which is the number worth chasing.
    const best=withData.slice().sort((a,b)=>b.saved-a.saved)[0];
    sg.innerHTML=[
      {val:'$'+Math.round(totIncome).toLocaleString(),lbl:'Earned in '+year,color:BUD_CHART_COLORS.income},
      {val:'$'+Math.round(totSaved).toLocaleString(),lbl:'Saved in '+year,color:BUD_CHART_COLORS.saved},
      {val:avgRate.toFixed(0)+'%',lbl:'Average savings rate',color:BUD_CHART_COLORS.rate},
      {val:best?best.label:'—',lbl:best?'Best month · $'+Math.round(best.saved).toLocaleString():'Best month',color:BUD_CHART_COLORS.saved},
    ].map(s=>'<div class="sum-card"><div class="sum-card-val" style="color:'+s.color+'">'+s.val+'</div><div class="sum-card-lbl">'+s.lbl+'</div></div>').join('');
  }

  // ── Month-by-month table ──
  // The arrays above already held all of this; the view just never showed it itemised.
  const ml=document.getElementById('year-months-list');
  if(ml){
    ml.innerHTML=withData.length
      ? '<div class="year-mo-row year-mo-head"><span>Month</span><span>In</span><span>Out</span><span>Saved</span><span>Rate</span></div>'+
        withData.map(m=>{
          const out=m.fixed+m.variable;
          const rate=m.income>0?(m.saved/m.income*100):0;
          const rateCol=rate>=20?'var(--positive)':rate>0?'var(--amber-dark,#f59e0b)':'var(--muted)';
          return '<div class="year-mo-row">'+
            '<span class="year-mo-name">'+m.label+'</span>'+
            '<span>'+fmtMoney(m.income)+'</span>'+
            '<span>'+fmtMoney(out)+'</span>'+
            '<span>'+fmtMoney(m.saved)+'</span>'+
            '<span style="color:'+rateCol+'">'+rate.toFixed(0)+'%</span>'+
          '</div>';
        }).join('')
      : '<div style="text-align:center;color:var(--muted);font-size:13px;padding:18px 0">Nothing recorded in '+year+' yet.</div>';
  }

  // ── Stacked bar + savings-rate line ──
  if(yearStackChart){ yearStackChart.destroy(); yearStackChart=null; }
  const stackWrap=document.getElementById('year-stack-wrap');
  const stackLegend=document.getElementById('year-stack-legend');
  const {gc,tc}=budChartGridColors();
  if(stackWrap){
    if(withData.length<2){
      stackWrap.innerHTML='<div style="text-align:center;color:var(--muted);font-size:13px;padding:20px 0">Not enough data yet.</div>';
      if(stackLegend) stackLegend.innerHTML='';
    } else {
      if(stackLegend) stackLegend.innerHTML=budChartLegend([
        {c:BUD_CHART_COLORS.fixed,l:'Fixed'},
        {c:BUD_CHART_COLORS.variable,l:'CC / variable'},
        {c:BUD_CHART_COLORS.saved,l:'Saved'},
        {c:BUD_CHART_COLORS.rate,l:'Savings rate %'},
      ]);
      stackWrap.style.height='280px';
      stackWrap.innerHTML='<canvas id="year-stack-chart"></canvas>';
      yearStackChart=new Chart(document.getElementById('year-stack-chart'),{
        type:'bar',
        data:{
          labels:points.map(p=>p.label),
          datasets:[
            {label:'Fixed',data:fixedArr,backgroundColor:BUD_CHART_COLORS.fixed,stack:'s'},
            {label:'CC / variable',data:varArr,backgroundColor:BUD_CHART_COLORS.variable,stack:'s'},
            {label:'Saved',data:points.map(p=>p.saved),backgroundColor:BUD_CHART_COLORS.saved,stack:'s',borderRadius:{topLeft:4,topRight:4}},
            {label:'Savings rate',data:rateArr,type:'line',yAxisID:'y2',borderColor:BUD_CHART_COLORS.rate,backgroundColor:BUD_CHART_COLORS.rate,borderWidth:2.5,pointRadius:4,pointBackgroundColor:BUD_CHART_COLORS.rate,tension:0.3,fill:false}
          ]
        },
        options:{
          responsive:true,maintainAspectRatio:false,
          plugins:{
            legend:{display:false},
            tooltip:{callbacks:{label:c=>c.dataset.label==='Savings rate'?c.dataset.label+': '+c.parsed.y.toFixed(0)+'%':c.dataset.label+': $'+c.parsed.y.toFixed(0)}}
          },
          scales:{
            x:{stacked:true,grid:{display:false},ticks:{color:tc,font:{size:11},maxTicksLimit:12}},
            y:{stacked:true,grid:{color:gc},ticks:{color:tc,font:{size:11},callback:v=>'$'+v},beginAtZero:true},
            y2:{position:'right',min:0,max:50,grid:{display:false},ticks:{color:BUD_CHART_COLORS.rate,font:{size:11},callback:v=>v+'%'}}
          }
        }
      });
    }
  }

  // ── Monthly CC / variable spending line ──
  if(yearCCChart){ yearCCChart.destroy(); yearCCChart=null; }
  const ccWrap=document.getElementById('year-cc-wrap');
  const ccLegend=document.getElementById('year-cc-legend');
  if(ccWrap){
    if(withData.length<2){
      ccWrap.innerHTML='<div style="text-align:center;color:var(--muted);font-size:13px;padding:20px 0">Not enough data yet.</div>';
      if(ccLegend) ccLegend.innerHTML='';
    } else {
      if(ccLegend) ccLegend.innerHTML=budChartLegend([{c:BUD_CHART_COLORS.variable,l:'CC / variable spending'}]);
      ccWrap.style.height='200px';
      ccWrap.innerHTML='<canvas id="year-cc-chart"></canvas>';
      yearCCChart=new Chart(document.getElementById('year-cc-chart'),{
        type:'line',
        data:{
          labels:points.map(p=>p.label),
          datasets:[
            {label:'CC / variable spending',data:varArr,borderColor:BUD_CHART_COLORS.variable,backgroundColor:'rgba(216,90,48,0.12)',borderWidth:2.5,pointRadius:3,pointBackgroundColor:BUD_CHART_COLORS.variable,fill:true,tension:0.3}
          ]
        },
        options:{
          responsive:true,maintainAspectRatio:false,
          plugins:{
            legend:{display:false},
            tooltip:{callbacks:{label:c=>'$'+c.parsed.y.toFixed(0)}}
          },
          scales:{
            x:{grid:{display:false},ticks:{color:tc,font:{size:11},maxTicksLimit:12}},
            y:{grid:{color:gc},ticks:{color:tc,font:{size:11},callback:v=>'$'+v},beginAtZero:true}
          }
        }
      });
    }
  }
}

// ── Budget trends ─────────────────────────────────────────────────
function getBudWeekTotals(d){
  return {income:weekIncome(d), spending:weekSpending(d), saved:weekSavedAmt(d)};
}
function getBudTrendPoints(range){
  const groups={};
  const allKeys=Object.keys(budgetData).sort();
  let filteredKeys=allKeys;
  if(range==='monthly'){
    const cutoff=localMidnight(getLocalDate());
    cutoff.setDate(1);
    cutoff.setMonth(cutoff.getMonth()-11);
    const cutoffYM=dateStr(cutoff).substring(0,7);
    filteredKeys=allKeys.filter(k=>k.substring(0,7)>=cutoffYM);
  }
  filteredKeys.forEach(k=>{
    const d=budgetData[k]; if(!d) return;
    const mon=new Date(k+'T12:00:00');
    const groupKey=range==='yearly'?String(mon.getFullYear()):k.substring(0,7);
    if(!groups[groupKey]) groups[groupKey]={income:0,spending:0,saved:0};
    const t=getBudWeekTotals(d);
    groups[groupKey].income+=t.income;
    groups[groupKey].spending+=t.spending;
    groups[groupKey].saved+=t.saved;
  });
  const sortedLog=[...savingsLog].sort((a,b)=>a.date<b.date?-1:1);
  return Object.keys(groups).sort().map(k=>{
    const label=range==='yearly'?k:(([y,m])=>
      new Date(parseInt(y),parseInt(m)-1,1).toLocaleDateString('en-AU',{month:'short',year:'2-digit'})
    )(k.split('-'));
    const relevant=sortedLog.filter(e=>(range==='yearly'?e.date.substring(0,4):e.date.substring(0,7))<=k);
    const balance=relevant.length?relevant[relevant.length-1].balance:null;
    return {label,...groups[k],balance};
  });
}
function setBudTrendRange(range){
  budTrendRange=range;
  ['monthly','yearly','alltime'].forEach(r=>{
    const btn=document.getElementById('btr-'+r); if(!btn) return;
    btn.style.background=r===range?'var(--header)':'transparent';
    btn.style.color=r===range?'#fff':'var(--muted)';
  });
  renderBudTrend();
}
function renderBudTrend(){
  const wrap=document.getElementById('bud-trend-wrap'); if(!wrap) return;
  if(budChart){budChart.destroy();budChart=null;}
  const points=getBudTrendPoints(budTrendRange);
  if(points.length<2){
    wrap.innerHTML='<div style="text-align:center;color:var(--muted);font-size:13px;padding:20px 0">Not enough data yet.</div>';
    return;
  }
  wrap.innerHTML='<canvas id="bud-trend-chart"></canvas>';
  const ctx=document.getElementById('bud-trend-chart'); if(!ctx) return;
  const {gc,tc}=budChartGridColors();
  budChart=new Chart(ctx,{
    type:'line',
    data:{
      labels:points.map(p=>p.label),
      datasets:[
        {label:'Income',data:points.map(p=>p.income),borderColor:BUD_CHART_COLORS.income,backgroundColor:'rgba(29,158,117,0.08)',borderWidth:2.5,pointRadius:4,pointBackgroundColor:BUD_CHART_COLORS.income,fill:false,tension:0.3},
        {label:'Spending',data:points.map(p=>p.spending),borderColor:BUD_CHART_COLORS.spending,backgroundColor:'rgba(231,76,60,0.08)',borderWidth:2.5,pointRadius:4,pointBackgroundColor:BUD_CHART_COLORS.spending,fill:false,tension:0.3},
        {label:'Saved',data:points.map(p=>p.saved),borderColor:BUD_CHART_COLORS.saved,backgroundColor:'rgba(55,138,221,0.08)',borderWidth:2.5,pointRadius:4,pointBackgroundColor:BUD_CHART_COLORS.saved,fill:false,tension:0.3},
        {label:'Account',data:points.map(p=>p.balance),borderColor:'#94a3b8',backgroundColor:'transparent',borderWidth:2,pointRadius:3,pointBackgroundColor:'#94a3b8',fill:false,tension:0.3,spanGaps:false,borderDash:[5,4]}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:true,
      plugins:{
        legend:{display:true,labels:{color:tc,font:{size:12},usePointStyle:true,pointStyleWidth:10}},
        tooltip:{callbacks:{label:c=>c.dataset.label+': $'+c.parsed.y.toFixed(0)}}
      },
      scales:{
        x:{grid:{color:gc},ticks:{color:tc,font:{size:11},maxTicksLimit:8}},
        y:{grid:{color:gc},ticks:{color:tc,font:{size:11},callback:v=>'$'+v},beginAtZero:true}
      }
    }
  });
}

// ── Savings account card ──────────────────────────────────────────
function renderSavingsCard(){
  const wrap=document.getElementById('bud-savings-card-wrap'); if(!wrap) return;
  const today=getLocalDate();
  const sorted=[...savingsLog].sort((a,b)=>a.date<b.date?-1:1);
  const cur=sorted.length?sorted[sorted.length-1]:null;
  wrap.innerHTML=`<div class="card">
    <div class="sec-label" style="margin-bottom:12px">🏦 Savings account</div>
    <div style="display:flex;gap:8px;margin-bottom:12px;align-items:stretch">
      <div style="flex:1;display:flex;flex-direction:column;gap:6px">
        <input type="date" id="sav-log-date" value="${today}"
          style="width:100%;height:40px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;padding:0 10px;background:var(--card);color:var(--text)">
        <input type="number" id="sav-log-bal" inputmode="decimal" min="0" step="0.01" placeholder="Balance ($)"
          style="width:100%;height:40px;border:1.5px solid var(--border);border-radius:8px;font-size:18px;font-weight:500;text-align:center;background:var(--card);color:var(--text)">
      </div>
      <button onclick="logSavingsBalance()"
        style="padding:0 18px;background:var(--header);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">Log</button>
    </div>
    ${cur?`<div style="margin-bottom:10px">
      <div style="font-size:28px;font-weight:800">$${cur.balance.toLocaleString()}</div>
      <div style="font-size:12px;color:var(--muted)">Logged ${cur.date}</div>
    </div>`:''}
    ${sorted.length?`<div style="max-height:160px;overflow-y:auto">
      ${[...sorted].reverse().map(e=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:13px;color:var(--muted)">${e.date}</span>
          <span style="font-size:14px;font-weight:600">$${e.balance.toLocaleString()}</span>
          <button onclick="deleteSavingsEntry('${e.date}')" style="font-size:12px;color:var(--danger);background:none;border:none;cursor:pointer;padding:0 4px">✕</button>
        </div>`).join('')}
    </div>`:'<div style="text-align:center;color:var(--muted);font-size:13px;padding:8px 0">No entries yet — log your balance above</div>'}
  </div>`;
}
function logSavingsBalance(){
  const dateEl=document.getElementById('sav-log-date');
  const balEl=document.getElementById('sav-log-bal');
  const bal=parseFloat(balEl.value);
  const date=dateEl.value;
  if(!bal||!date) return;
  savingsLog=savingsLog.filter(e=>e.date!==date);
  savingsLog.push({date,balance:bal,t:Date.now()}); // t lets this win the newest-per-date merge
  savingsLog.sort((a,b)=>a.date<b.date?-1:1);
  saveSavingsLog();
  balEl.value='';
  renderSavingsCard();
  if(statsSubTab==='finance'){ renderBSBalance(); renderBSAccountGrowth(); renderBSTrend(); }
}
function deleteSavingsEntry(date){
  savingsLog=savingsLog.filter(e=>e.date!==date);
  saveSavingsLog();
  renderSavingsCard();
  if(statsSubTab==='finance'){ renderBSBalance(); renderBSAccountGrowth(); renderBSTrend(); }
}

// ── Savings goals card ────────────────────────────────────────────
function renderGoalsCard(){
  const wrap=document.getElementById('bud-goals-card-wrap'); if(!wrap) return;
  const goals=budDefaults.goals||[];
  const sortedLog=[...savingsLog].sort((a,b)=>a.date<b.date?-1:1);
  const curBal=sortedLog.length?sortedLog[sortedLog.length-1].balance:0;
  const goalsHTML=goals.map((g,i)=>{
    const pct=g.target>0?Math.min(100,Math.round(curBal/g.target*100)):0;
    const remaining=Math.max(0,g.target-curBal);
    const bc=pct>=100?'var(--success)':pct>=50?'var(--warn)':'#3b82f6';
    const weeksLeft=Math.max(0,(new Date(g.date+'T12:00:00')-new Date())/(7*864e5));
    const weeklyNeeded=weeksLeft>0&&remaining>0?'$'+Math.ceil(remaining/weeksLeft).toLocaleString()+'/wk needed':null;
    return `<div style="padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
        <div style="font-size:15px;font-weight:700">${g.name}</div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;color:var(--muted)">$${g.target.toLocaleString()} by ${g.date}</span>
          <button onclick="deleteGoal(${i})" style="font-size:12px;color:var(--danger);background:none;border:none;cursor:pointer;padding:0">✕</button>
        </div>
      </div>
      <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;margin-bottom:6px">
        <div style="width:${pct}%;height:100%;background:${bc};border-radius:3px"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted)">
        <span>${pct}%${curBal>0?' ($'+curBal.toLocaleString()+')':''}</span>
        <span>${pct>=100?'🎉 Reached!':(remaining>0?'$'+remaining.toLocaleString()+' to go':'')+(weeklyNeeded?' · '+weeklyNeeded:'')}</span>
      </div>
    </div>`;
  }).join('');
  wrap.innerHTML=`<div class="card">
    <div class="sec-label" style="margin-bottom:12px">🎯 Savings goals</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:${goals.length?'4px':'0'}">
      <input type="text" id="goal-name" placeholder="Goal name" style="flex:1 1 100px;min-width:0;max-width:100%;box-sizing:border-box;height:38px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;padding:0 8px;background:var(--card);color:var(--text)">
      <input type="number" id="goal-target" inputmode="decimal" placeholder="$ Target" style="flex:1 1 70px;min-width:0;max-width:100%;box-sizing:border-box;height:38px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;text-align:center;background:var(--card);color:var(--text)">
      <input type="date" id="goal-date" style="flex:1 1 110px;min-width:0;max-width:100%;box-sizing:border-box;height:38px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;padding:0 6px;background:var(--card);color:var(--text)">
      <button onclick="addGoal()" style="flex-shrink:0;padding:0 14px;height:38px;background:var(--header);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Add</button>
    </div>
    ${goals.length?goalsHTML:'<div style="text-align:center;color:var(--muted);font-size:13px;padding:12px 0">Add a goal above</div>'}
  </div>`;
}
function addGoal(){
  const name=document.getElementById('goal-name')?.value.trim();
  const target=parseFloat(document.getElementById('goal-target')?.value);
  const date=document.getElementById('goal-date')?.value;
  if(!name||!target||!date) return;
  if(!budDefaults.goals) budDefaults.goals=[];
  budDefaults.goals.push({name,target,date});
  localStorage.setItem('daily_budget_defaults',JSON.stringify(budDefaults));
  syncBudDefaultsToFirebase();
  renderGoalsCard();
}
function deleteGoal(i){
  budDefaults.goals=(budDefaults.goals||[]).filter((_,idx)=>idx!==i);
  localStorage.setItem('daily_budget_defaults',JSON.stringify(budDefaults));
  syncBudDefaultsToFirebase();
  renderBSGoals();
}

// ── Budget Stats (Stats tab) ──────────────────────────────────────
// Account-derived cards lead: the Finance tab was almost entirely budget data with the net
// worth chart buried below four budget cards, so account history was effectively hidden.
function renderBudgetStats(){
  renderBSBalance();
  renderBSAccountGrowth();
  renderBSTrend();
  renderBSProgress();
  renderBSBestWorst();
  renderBSCatBreakdown();
  renderBSConsist();
  renderBSRecords();
  renderBSGoals();
}

// ── Finance: which accounts actually moved ────────────────────────
// The net worth chart shows the total but not where it came from. This ranks each account by
// its effect on net worth over the period, so a rise driven by paying down debt reads
// differently from one driven by saving.
let bsGrowthRange='30';   // '30' | '90' | 'all'
function setBSGrowthRange(r){ bsGrowthRange=r; renderBSAccountGrowth(); }
function bsGrowthFromDate(a){
  if(bsGrowthRange==='all'){
    const h=(a&&a.history||[]).filter(e=>e&&e.date).slice().sort((x,y)=>x.date<y.date?-1:1);
    return h.length?h[0].date:getLocalDate();
  }
  const d=localMidnight(getLocalDate());
  d.setDate(d.getDate()-parseInt(bsGrowthRange,10));
  return dateStr(d);
}
function renderBSAccountGrowth(){
  const wrap=document.getElementById('bs-acctgrowth-wrap'); if(!wrap) return;
  const head=(body)=>'<div class="card" style="padding:0;overflow:hidden">'+
    '<div style="background:transparent;padding:16px 16px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);display:flex;justify-content:space-between;align-items:center;gap:8px">'+
      '<span>📊 Account growth</span>'+
      '<div class="bs-growth-range">'+
        [['30','30d'],['90','90d'],['all','All']].map(([v,l])=>
          '<button onclick="setBSGrowthRange(\''+v+'\')" class="'+(bsGrowthRange===v?'on':'')+'">'+l+'</button>').join('')+
      '</div>'+
    '</div>'+body+'</div>';
  const tracked=accounts.filter(a=>a&&(a.history||[]).length>=1);
  if(!tracked.length){
    wrap.innerHTML=head('<div style="padding:14px 16px;text-align:center;color:var(--muted);font-size:13px">Log a balance in Accounts to see which of them are moving.</div>');
    return;
  }
  const rows=tracked.map(a=>{
    const from=bsGrowthFromDate(a);
    const then=accountBalanceAt(a,from);
    const now=parseFloat(a.current)||0;
    const delta=Math.round((now-then)*100)/100;
    // A debt shrinking RAISES net worth, so its contribution is the opposite of its delta.
    const nwEffect=(a.type==='debt')?-delta:delta;
    const pct=then?Math.round((delta/Math.abs(then))*1000)/10:null;
    return {a,delta,nwEffect,pct};
  }).sort((x,y)=>y.nwEffect-x.nwEffect);
  const netChange=rows.reduce((s,r)=>s+r.nwEffect,0);
  const body='<div style="padding:6px 16px 14px">'+
    rows.map(r=>{
      const good=r.nwEffect>0, flat=r.nwEffect===0;
      const col=flat?'var(--muted)':(good?'var(--success)':'var(--danger)');
      const arrow=flat?'':(r.delta>0?'▲':'▼');
      return '<div class="bs-growth-row">'+
        '<div class="bs-growth-name">'+_catEscHtml(a_name(r.a))+
          '<span class="bs-growth-type">'+(r.a.type==='debt'?'Debt':'Asset')+'</span></div>'+
        '<div class="bs-growth-spark">'+(acctSparklineHtml(r.a)||'')+'</div>'+
        '<div class="bs-growth-delta" style="color:'+col+'">'+
          (flat?'—':arrow+' '+fmtMoney(Math.abs(r.delta)))+
          (r.pct!==null&&!flat?'<span class="bs-growth-pct">'+(r.pct>0?'+':'')+r.pct+'%</span>':'')+
        '</div>'+
      '</div>';
    }).join('')+
    '<div class="bs-growth-total">'+
      '<span>Net worth change</span>'+
      '<span style="color:'+(netChange>0?'var(--success)':netChange<0?'var(--danger)':'var(--muted)')+'">'+
        (netChange===0?'—':(netChange>0?'▲ ':'▼ ')+fmtMoney(Math.abs(netChange)))+'</span>'+
    '</div>'+
  '</div>';
  wrap.innerHTML=head(body);
}
function a_name(a){ return (a&&a.name)||'Account'; }

// ── Finance: spending category breakdown (fixed + variable, last 12 saved weeks) ─
function renderBSCatBreakdown(){
  const wrap=document.getElementById('bs-catbreak-wrap'); if(!wrap) return;
  const keys=Object.keys(budgetData)
    .filter(k=>{const d=budgetData[k]; return d&&(d.saved||d.draft);})
    .sort().slice(-12);
  if(!keys.length){ wrap.innerHTML=''; return; }
  const CAT_COLORS=['#52B788','#f59e0b','#6366f1','#3b82f6','#ec4899','#8b5cf6','#FF6B35','#14b8a6','#94a3b8','#d85a30'];
  const cats=[];
  // Fixed: blank weeks fall back to the category default (same convention as weekFixedTotal)
  loadFixCats().forEach(c=>{
    const val=keys.reduce((s,k)=>{
      const v=budgetData[k]['fix_'+c.id];
      return s+((v!==undefined&&v!=='')?(parseFloat(v)||0):(parseFloat(c.default)||0));
    },0);
    cats.push({label:catLabel(c), val, kind:'Fixed'});
  });
  loadVarCats().forEach(c=>{
    const val=keys.reduce((s,k)=>s+(parseFloat(budgetData[k]['var_'+c.id])||0),0);
    cats.push({label:catLabel(c), val, kind:'Variable'});
  });
  cats.sort((a,b)=>b.val-a.val);
  const total=cats.reduce((s,c)=>s+c.val,0);
  if(total<=0){ wrap.innerHTML=''; return; }
  const max=Math.max(1,...cats.map(c=>c.val));
  const rows=cats.filter(c=>c.val>0).map((c,i)=>{
    const pctOfTotal=Math.round(c.val/total*100);
    return '<div class="muscle-bar-row">'+
      '<div class="muscle-bar-label" style="width:110px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+_catEsc(c.label)+'">'+_catEscHtml(c.label)+'</div>'+
      '<div class="muscle-bar-track"><div class="muscle-bar-fill" style="width:'+Math.round(c.val/max*100)+'%;background:'+CAT_COLORS[i%CAT_COLORS.length]+'"></div></div>'+
      '<div class="muscle-bar-count" style="width:78px">$'+Math.round(c.val).toLocaleString()+' · '+pctOfTotal+'%</div>'+
    '</div>';
  }).join('');
  wrap.innerHTML='<div class="card" style="padding:0;overflow:hidden">'+
    '<div style="background:transparent;padding:16px 16px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted)">🧾 Where the money goes · last '+keys.length+' week'+(keys.length>1?'s':'')+'</div>'+
    '<div style="padding:14px 16px">'+rows+
      '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);border-top:1px solid var(--border);padding-top:10px;margin-top:4px"><span>Total spent</span><b style="color:var(--text)">$'+Math.round(total).toLocaleString()+'</b></div>'+
    '</div></div>';
}

function renderBSProgress(){
  const wrap=document.getElementById('bs-progress-wrap'); if(!wrap) return;
  const keys=Object.keys(budgetData).filter(k=>{const d=budgetData[k];return d&&(d.saved||d.draft||d.snapshot);}).sort();
  if(!keys.length){ wrap.innerHTML=''; return; }
  const weekCount=keys.length;
  const totalSaved=keys.reduce((s,k)=>s+weekSavedAmt(budgetData[k]),0);
  const goal=getSavingsGoal();
  const cumulativeGoal=goal*weekCount;
  const pct=cumulativeGoal>0?Math.min(100,Math.round(totalSaved/cumulativeGoal*100)):0;
  const onTrack=totalSaved>=cumulativeGoal*0.85;
  const barColor=onTrack?'var(--positive)':'var(--accent)';
  wrap.innerHTML='<div class="card bst-prog-card">'+
    '<div class="bst-prog-label">Total saved · '+weekCount+' week'+(weekCount>1?'s':'')+' tracked</div>'+
    '<div class="bst-prog-val">$'+Math.round(totalSaved).toLocaleString()+'</div>'+
    '<div class="bst-prog-goal">of $'+cumulativeGoal.toLocaleString()+' cumulative goal ($'+goal+'/wk)</div>'+
    '<div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden;margin-top:12px">'+
      '<div style="width:'+pct+'%;height:100%;background:'+barColor+';border-radius:4px;transition:width .4s ease"></div>'+
    '</div>'+
    '<div style="font-size:12px;color:var(--muted);margin-top:6px">'+pct+'% of goal</div>'+
  '</div>';
}

function renderBSBestWorst(){
  const wrap=document.getElementById('bs-bestworst-wrap'); if(!wrap) return;
  const keys=Object.keys(budgetData).filter(k=>budgetData[k]&&weekIncome(budgetData[k])>0);
  if(!keys.length){ wrap.innerHTML=''; return; }
  let bestKey=null,bestSav=-Infinity,worstKey=null,worstOver=-Infinity;
  keys.forEach(k=>{
    const d=budgetData[k];
    const sav=weekSavedAmt(d);
    const left=weekIncome(d)-weekSpending(d)-weekSavedAmt(d);
    if(sav>bestSav){bestSav=sav;bestKey=k;}
    if(left<0&&-left>worstOver){worstOver=-left;worstKey=k;}
  });
  const fmtWk=k=>k?new Date(k+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short'}):'—';
  wrap.innerHTML='<div class="bst-tiles">'+
    '<div class="bst-tile">'+
      '<div class="bst-tile-icon">🏆</div>'+
      '<div class="bst-tile-lbl">Best week</div>'+
      '<div class="bst-tile-date">'+fmtWk(bestKey)+'</div>'+
      '<div class="bst-tile-val" style="color:var(--positive)">'+(bestKey?'saved $'+Math.round(bestSav):'—')+'</div>'+
    '</div>'+
    '<div class="bst-tile">'+
      '<div class="bst-tile-icon">⚠️</div>'+
      '<div class="bst-tile-lbl">Worst week</div>'+
      '<div class="bst-tile-date">'+fmtWk(worstKey)+'</div>'+
      '<div class="bst-tile-val" style="color:var(--danger)">'+(worstKey?'over by $'+Math.round(worstOver):'No overspend 🎉')+'</div>'+
    '</div>'+
  '</div>';
}

// ── Stats: Nutrition sub-tab ──────────────────────────────────────
// Charts the archived daily calorie totals (daily_cal_history, written by
// recordCalorieHistory on every food log) plus today's live total.
let nutChart=null;
function renderNutrition(){
  const wrap=document.getElementById('nutrition-content'); if(!wrap) return;
  if(nutChart){ nutChart.destroy(); nutChart=null; }
  const today=getLocalDate();
  const todayTotal=S.dailyLog.date===today?S.dailyLog.entries.reduce((a,e)=>a+(e.kcal||0),0):0;
  const c=calcGoalCals();
  const goalCals=c?(c.goal==='cut'?c.cut:c.goal==='bulk'?c.bulk:c.maintain):null;

  // Recorded days (history + live today), most recent 30 with data
  const totals={...calorieHistory};
  if(todayTotal>0||totals[today]!==undefined) totals[today]=todayTotal;
  const days=Object.keys(totals).filter(d=>totals[d]>0).sort().slice(-30);

  let html='';
  const goalLine=goalCals
    ? '<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--muted);margin-bottom:10px"><span>Today: <b style="color:var(--text)">'+todayTotal+'</b> kcal</span><span>Goal: '+goalCals+' kcal ('+(c.goal||'maintain')+')</span></div>'
    : '<div style="font-size:13px;color:var(--muted);margin-bottom:10px">Set up your profile in Settings → Health to see a calorie goal line.</div>';

  if(days.length>=2){
    const vals=days.map(d=>totals[d]);
    const avg7=Math.round(vals.slice(-7).reduce((a,v)=>a+v,0)/Math.min(7,vals.length));
    html+='<div class="stats-grid" id="nut-stats-grid">'+[
      {l:'Today',v:todayTotal||'—'},
      {l:'7-day avg',v:avg7},
      {l:'Days tracked',v:days.length},
    ].map(s=>'<div class="stat-card"><div class="stat-val">'+s.v+'</div><div class="stat-lbl">'+s.l+'</div></div>').join('')+'</div>';
    html+='<div class="card" style="padding:0;overflow:hidden">'+
      '<div style="background:transparent;padding:16px 16px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted)">🍽️ Calorie trend</div>'+
      '<div style="padding:14px 16px">'+goalLine+'<canvas id="nut-chart" style="max-height:360px"></canvas></div>'+
    '</div>';
  } else {
    html+=goalLine+emptyState('🍽️','Not enough data yet','Daily calorie totals are archived automatically as you log food — check back after a few days of logging');
  }
  wrap.innerHTML=html;
  animateStatVals(document.getElementById('nut-stats-grid'));

  if(days.length>=2){
    const ctx=document.getElementById('nut-chart'); if(!ctx) return;
    const {gc,tc}=budChartGridColors();
    const accent=(getComputedStyle(document.documentElement).getPropertyValue('--accent')||'#FF6B35').trim();
    const accentRgb=(getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb')||'255,107,53').trim();
    const datasets=[{label:'Eaten',data:days.map(d=>totals[d]),borderColor:accent,backgroundColor:'rgba('+accentRgb+',.08)',borderWidth:2.5,pointRadius:3,pointBackgroundColor:accent,fill:true,tension:0.3}];
    if(goalCals) datasets.push({label:'Goal',data:days.map(()=>goalCals),borderColor:'rgba(150,150,150,0.7)',borderDash:[6,4],borderWidth:1.5,pointRadius:0,fill:false});
    nutChart=new Chart(ctx,{
      type:'line',
      data:{labels:days.map(d=>new Date(d+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short'})),datasets},
      options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:cx=>cx.dataset.label+': '+cx.parsed.y+' kcal'}}},
        scales:{
          x:{grid:{color:gc},ticks:{color:tc,font:{size:11},maxTicksLimit:8}},
          y:{grid:{color:gc},ticks:{color:tc,font:{size:11}},beginAtZero:false}
        }
      }
    });
  }
}

// ── Stats: Overview (landing view) ────────────────────────────────
// At-a-glance tiles + the full week-in-review, inline. Shares buildWeekReviewHTML
// with the Home tab's week-review modal so the numbers can never disagree.
function renderStatsOverview(){
  const wrap=document.getElementById('overview-content'); if(!wrap) return;
  const {mondayStr,sundayStr}=getWeekBounds();
  const workoutDays=new Set(S.sessions.filter(s=>s.date>=mondayStr&&s.date<=sundayStr).map(s=>s.date)).size;
  const {current:streak}=calcSessionStreak();

  // Latest weight + direction vs the previous entry. Status tints (ov-pos/ov-neg) are light,
  // high-luminance greens/reds chosen to read clearly on the accent gradient in both themes.
  const sortedW=[...S.weights].sort((a,b)=>a.date<b.date?-1:1);
  let weightVal='—', weightSub='No entries yet';
  if(sortedW.length){
    const latest=sortedW[sortedW.length-1];
    weightVal=latest.weight+'<span class="ov-hs-unit"> kg</span>';
    if(sortedW.length>=2){
      const chg=+(latest.weight-sortedW[sortedW.length-2].weight).toFixed(1);
      const arrow=chg<0?'↓':chg>0?'↑':'→';
      const cls=chg<0?'ov-pos':chg>0?'ov-neg':'';
      weightSub='<span class="'+cls+'">'+arrow+' '+(chg>0?'+':'')+chg+'kg</span> since last entry';
    } else {
      weightSub='Logged '+fmtDate(latest.date);
    }
  }

  // Today's calories vs goal
  const cg=calcGoalCals();
  const goalCals=cg?(cg.goal==='cut'?cg.cut:cg.goal==='bulk'?cg.bulk:cg.maintain):null;
  const kcalTotal=S.dailyLog.entries.reduce((a,e)=>a+(e.kcal||0),0);
  const calVal=goalCals
    ? kcalTotal+'<span class="ov-hs-unit"> / '+goalCals+'</span>'
    : String(kcalTotal||'—');
  const calSub=goalCals?(kcalTotal<=goalCals?(goalCals-kcalTotal)+' kcal left':'<span class="ov-neg">'+(kcalTotal-goalCals)+' kcal over</span>'):'No goal set';

  // This week's budget status. The 🟢/🟡/🔴 emoji carries the status colour, so the sub text
  // itself stays white — only the leftover figure is tinted.
  const bd=budgetData[mondayStr];
  let budVal='—', budSub='No data this week';
  if(bd&&weekIncome(bd)>0){
    const left=weekLeftover(bd);
    budVal='<span class="'+(left>=0?'ov-pos':'ov-neg')+'">'+(left>=0?'+$':'-$')+Math.abs(left).toFixed(0)+'</span>';
    budSub=left>=50?'🟢 On track':left>=0?'🟡 Tight week':'🔴 Over budget';
  }

  // Single accent-gradient hero (matches Home / Budget), with the same 4 tappable stats laid
  // out as light-text sections. Light-mode gradient floor lives in .ov-hero (workout.css).
  wrap.innerHTML=
    '<div class="ov-hero">'+
      '<div class="ov-hero-grid">'+
        '<div class="ov-hs" onclick="setStatsTab(\'training\')">'+
          '<div class="ov-hs-label">Workouts this week</div>'+
          '<div class="ov-hs-val">'+workoutDays+'<span class="ov-hs-unit"> / '+scheduleLen()+'</span></div>'+
          '<div class="ov-hs-sub">🔥 '+streak+' day streak</div>'+
        '</div>'+
        '<div class="ov-hs" onclick="setStatsTab(\'body\')">'+
          '<div class="ov-hs-label">Weight</div>'+
          '<div class="ov-hs-val">'+weightVal+'</div>'+
          '<div class="ov-hs-sub">'+weightSub+'</div>'+
        '</div>'+
        '<div class="ov-hs" onclick="setStatsTab(\'nutrition\')">'+
          '<div class="ov-hs-label">Calories today</div>'+
          '<div class="ov-hs-val">'+calVal+'</div>'+
          '<div class="ov-hs-sub">'+calSub+'</div>'+
        '</div>'+
        '<div class="ov-hs" onclick="setStatsTab(\'finance\')">'+
          '<div class="ov-hs-label">Budget this week</div>'+
          '<div class="ov-hs-val">'+budVal+'</div>'+
          '<div class="ov-hs-sub">'+budSub+'</div>'+
        '</div>'+
      '</div>'+
    '</div>'+
    '<div class="card"><div class="sec-label" style="margin-bottom:12px">🗓️ Week in review</div>'+buildWeekReviewHTML()+'</div>';
}
function setBSTrendRange(range){
  bsTrendRange=range;
  ['monthly','yearly','alltime'].forEach(r=>{
    const btn=document.getElementById('bst-'+r); if(!btn) return;
    const a=r===range;
    btn.style.background=a?'rgba(255,255,255,0.3)':'transparent';
    btn.style.color=a?'#fff':'rgba(255,255,255,0.65)';
  });
  renderBSTrend();
}
function renderBSTrend(){
  const wrap=document.getElementById('bs-trend-wrap'); if(!wrap) return;
  // Always destroy a prior chart first so re-rendering can't conflict on the canvas
  if(bsChart){bsChart.destroy();bsChart=null;}
  // Per-week spending: each saved week (daily_budget) is one bar. Grouping by month
  // previously hid everything until 2+ months existed; weeks within one month now show.
  const keys=Object.keys(budgetData)
    .filter(k=>{const d=budgetData[k]; return d && (d.saved || d.draft || d.snapshot);})
    .sort();
  // Range toggle controls how many recent weeks are shown
  const windowWeeks = bsTrendRange==='monthly' ? 12 : bsTrendRange==='yearly' ? 52 : keys.length;
  const shown = keys.slice(-windowWeeks);
  if(shown.length<1){
    wrap.innerHTML=emptyState('💰','No budget history yet','Save a week in the Budget tab to see your spending trend here');
    return;
  }
  const spent  = shown.map(k=>weekSpending(budgetData[k]));
  const labels = shown.map(k=>new Date(k+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short'}));
  // Budget goal reference line = the current plan's weekly spend (fixed + variable)
  const goal = configFixedTotal()+configVariableTotal();
  wrap.innerHTML='<canvas id="bs-trend-chart" style="max-height:360px"></canvas>';
  const ctx=document.getElementById('bs-trend-chart'); if(!ctx) return;
  const {gc,tc}=budChartGridColors();
  const accent=(getComputedStyle(document.documentElement).getPropertyValue('--accent')||'#FF6B35').trim();
  const datasets=[
    {type:'bar',label:'Spent',data:spent,backgroundColor:'rgba(231,76,60,0.6)',borderColor:BUD_CHART_COLORS.spending,borderWidth:1,borderRadius:6,maxBarThickness:48}
  ];
  if(goal>0){
    datasets.push({type:'line',label:'Budget goal',data:shown.map(()=>goal),borderColor:accent,borderWidth:2,borderDash:[6,4],pointRadius:0,fill:false,tension:0});
  }
  bsChart=new Chart(ctx,{
    data:{labels,datasets},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:true,labels:{color:tc,font:{size:12},usePointStyle:true,pointStyleWidth:10}},
        tooltip:{callbacks:{label:c=>c.dataset.label+': $'+c.parsed.y.toFixed(0)}}
      },
      scales:{
        x:{grid:{color:gc},ticks:{color:tc,font:{size:11},maxTicksLimit:12}},
        y:{grid:{color:gc},ticks:{color:tc,font:{size:11},callback:v=>'$'+v},beginAtZero:true}
      }
    }
  });
}
// Union of all dates across every account's history, ascending. Drives the trend chart's axis.
function accountsHistoryDates(){
  const set=new Set();
  accounts.forEach(a=>(a&&a.history||[]).forEach(e=>{ if(e&&e.date) set.add(e.date); }));
  return [...set].sort((x,y)=>x<y?-1:1);
}
// Rendered in two places — Stats → Finance and the Accounts page — so it's parametrised by
// container rather than hardcoded to one. One function means the two can't drift apart; the
// Chart instances are tracked per container so re-rendering one never destroys the other's.
const _nwCharts={};
function renderBSBalance(){ renderNetWorthChartInto('bs-balance-wrap'); }
function renderNetWorthChartInto(wrapId){
  const wrap=document.getElementById(wrapId); if(!wrap) return;
  if(_nwCharts[wrapId]){ _nwCharts[wrapId].destroy(); _nwCharts[wrapId]=null; }
  const canvasId=wrapId+'-nwcanvas';
  const dates=accountsHistoryDates();
  if(dates.length<2){
    wrap.innerHTML='<div class="card" style="padding:0;overflow:hidden"><div style="background:transparent;padding:16px 16px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted)">💰 Net worth over time</div><div style="padding:14px 16px;text-align:center;color:var(--muted);font-size:13px">Update at least 2 account balances in Accounts to see the trend.</div></div>';
    return;
  }
  // Assets, debts and net worth at each recorded date (each account carried forward from its
  // last known balance on/before that date — same convention as the old CC line).
  const assetAccts=accounts.filter(a=>a&&a.type==='asset'), debtAccts=accounts.filter(a=>a&&a.type==='debt');
  const assetsData=dates.map(d=>assetAccts.reduce((s,a)=>s+accountBalanceAt(a,d),0));
  const debtsData =dates.map(d=>debtAccts.reduce((s,a)=>s+accountBalanceAt(a,d),0));
  const netData   =dates.map((d,i)=>assetsData[i]-debtsData[i]);
  const curNet=netData[netData.length-1];
  const netCol=curNet>=0?'var(--success)':'var(--danger)';
  const accent=(getComputedStyle(document.documentElement).getPropertyValue('--accent')||'#FF6B35').trim();
  wrap.innerHTML='<div class="card" style="padding:0;overflow:hidden">'+
    '<div style="background:transparent;padding:16px 16px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);display:flex;justify-content:space-between;align-items:center">'+
      '<span>💰 Net worth over time</span>'+
      '<span style="font-size:13px;font-weight:800;text-transform:none;letter-spacing:0;color:'+netCol+'">'+(curNet>=0?'+$':'-$')+Math.abs(Math.round(curNet)).toLocaleString()+' net</span>'+
    '</div>'+
    '<div style="padding:14px 16px"><canvas id="'+canvasId+'" style="max-height:360px"></canvas></div></div>';
  const ctx=document.getElementById(canvasId); if(!ctx) return;
  const {gc,tc}=budChartGridColors();
  const datasets=[
    {label:'Assets',data:assetsData,borderColor:'#52B788',backgroundColor:'rgba(82,183,136,0.12)',borderWidth:2.5,pointRadius:3,pointBackgroundColor:'#52B788',fill:true,tension:0.3},
    {label:'Net worth',data:netData,borderColor:accent,backgroundColor:'transparent',borderWidth:2.5,pointRadius:3,pointBackgroundColor:accent,fill:false,tension:0.3}
  ];
  // Only plot the debt line if there's any debt account — a debt-free user shouldn't see a flat 0 line.
  if(debtAccts.length) datasets.splice(1,0,{label:'Debts',data:debtsData,borderColor:'#E74C3C',backgroundColor:'transparent',borderWidth:2.5,pointRadius:3,pointBackgroundColor:'#E74C3C',fill:false,tension:0.3});
  _nwCharts[wrapId]=new Chart(ctx,{
    type:'line',
    data:{ labels:dates.map(e=>e.substring(5)), datasets },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:true,labels:{color:tc,font:{size:12},usePointStyle:true,pointStyleWidth:10}},
        tooltip:{callbacks:{label:c=>c.dataset.label+': $'+c.parsed.y.toLocaleString()}}
      },
      scales:{
        x:{grid:{color:gc},ticks:{color:tc,font:{size:11},maxTicksLimit:8}},
        y:{grid:{color:gc},ticks:{color:tc,font:{size:11},callback:v=>'$'+v},beginAtZero:false}
      }
    }
  });
}
function renderBSConsist(){
  const wrap=document.getElementById('bs-consist-wrap'); if(!wrap) return;
  const allKeys=Object.keys(budgetData).sort().reverse().slice(0,8).reverse();
  if(!allKeys.length){
    wrap.innerHTML='<div class="card" style="padding:0;overflow:hidden"><div style="background:transparent;padding:16px 16px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted)">📅 Budget consistency</div><div style="padding:14px 16px;text-align:center;color:var(--muted);font-size:13px">No weeks saved yet.</div></div>';
    return;
  }
  const cells=allKeys.map(k=>{
    const d=budgetData[k]; if(!d) return '';
    const inc=weekIncome(d);
    const leftover=inc>0?weekLeftover(d):null;
    const mon=new Date(k+'T12:00:00');
    const dayLbl=mon.toLocaleDateString('en-AU',{day:'numeric',month:'short'});
    const status=leftover===null?'grey':leftover>=50?'green':leftover>=0?'amber':'red';
    const bg={green:'#52B788',amber:'#f59e0b',red:'#E74C3C',grey:'var(--border)'};
    const fg={green:'#fff',amber:'#fff',red:'#fff',grey:'var(--muted)'};
    const valLbl=leftover!==null?(leftover>=0?'+$':'-$')+Math.abs(leftover).toFixed(0):'—';
    return '<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:3px">'
      +'<div style="width:100%;height:48px;background:'+bg[status]+';border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:'+fg[status]+'">'+valLbl+'</div>'
      +'<div style="font-size:9px;color:var(--muted);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;padding:0 1px">'+dayLbl+'</div>'
      +'</div>';
  }).join('');
  wrap.innerHTML='<div class="card" style="padding:0;overflow:hidden">'
    +'<div style="background:transparent;padding:16px 16px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted)">📅 Budget consistency</div>'
    +'<div style="padding:14px 16px">'
    +'<div style="display:flex;gap:5px;margin-bottom:10px">'+cells+'</div>'
    +'<div style="display:flex;gap:14px;font-size:11px;color:var(--muted)">'
    +'<span><span style="display:inline-block;width:10px;height:10px;background:#52B788;border-radius:2px;vertical-align:middle;margin-right:3px"></span>On track</span>'
    +'<span><span style="display:inline-block;width:10px;height:10px;background:#f59e0b;border-radius:2px;vertical-align:middle;margin-right:3px"></span>Tight</span>'
    +'<span><span style="display:inline-block;width:10px;height:10px;background:#E74C3C;border-radius:2px;vertical-align:middle;margin-right:3px"></span>Over</span>'
    +'</div></div></div>';
}
function renderBSRecords(){
  const wrap=document.getElementById('bs-records-wrap'); if(!wrap) return;
  const keys=Object.keys(budgetData);
  if(keys.length<2){
    wrap.innerHTML='<div class="card" style="padding:0;overflow:hidden"><div style="background:transparent;padding:16px 16px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted)">🏆 Personal records</div><div style="padding:14px 16px;text-align:center;color:var(--muted);font-size:13px">Save at least 2 weeks to see records.</div></div>';
    return;
  }
  let bestInc={val:0,key:null},bestSav={val:0,key:null},loSpend={val:Infinity,key:null};
  keys.forEach(k=>{
    const d=budgetData[k]; if(!d) return;
    const inc=weekIncome(d);
    const spend=weekSpending(d);
    const sav=weekSavedAmt(d);
    if(inc>0&&inc>bestInc.val){bestInc={val:inc,key:k};}
    if(sav>bestSav.val){bestSav={val:sav,key:k};}
    if(inc>0&&spend<loSpend.val){loSpend={val:spend,key:k};}
  });
  const fmtWk=k=>{if(!k) return '—'; return new Date(k+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'2-digit'});};
  const rows=[
    {icon:'💵',label:'Highest income',val:bestInc.key?'$'+bestInc.val.toFixed(0):'—',wk:fmtWk(bestInc.key)},
    {icon:'📉',label:'Lowest spending',val:loSpend.key&&isFinite(loSpend.val)?'$'+loSpend.val.toFixed(0):'—',wk:fmtWk(loSpend.key)},
    {icon:'🏅',label:'Most saved',val:bestSav.key?'$'+bestSav.val.toFixed(0):'—',wk:fmtWk(bestSav.key)},
  ];
  wrap.innerHTML='<div class="card" style="padding:0;overflow:hidden">'
    +'<div style="background:transparent;padding:16px 16px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted)">🏆 Personal records</div>'
    +'<div style="padding:2px 16px">'
    +rows.map(r=>'<div style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid var(--border)">'
      +'<div style="display:flex;align-items:center;gap:10px"><span style="font-size:20px">'+r.icon+'</span>'
      +'<div><div style="font-size:13px;font-weight:600">'+r.label+'</div><div style="font-size:11px;color:var(--muted)">Week of '+r.wk+'</div></div></div>'
      +'<div style="font-size:18px;font-weight:800;color:var(--success)">'+r.val+'</div>'
      +'</div>').join('')
    +'</div></div>';
}
function renderBSGoals(){
  const wrap=document.getElementById('bs-goals-wrap'); if(!wrap) return;
  const goals=budDefaults.goals||[];
  // Savings-goal progress tracks total assets from daily_accounts (the generalised "savings
  // balance"), not the retired savingsLog.
  const curBal=accountsAssetsTotal();
  const goalsHTML=goals.map((g,i)=>{
    const pct=g.target>0?Math.min(100,Math.round(curBal/g.target*100)):0;
    const remaining=Math.max(0,g.target-curBal);
    const bc=pct>=100?'var(--success)':pct>=50?'var(--warn)':'#3b82f6';
    const weeksLeft=Math.max(0,(new Date(g.date+'T12:00:00')-new Date())/(7*864e5));
    const weeklyNeeded=weeksLeft>0&&remaining>0?'$'+Math.ceil(remaining/weeksLeft).toLocaleString()+'/wk needed':null;
    return `<div style="padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
        <div style="font-size:15px;font-weight:700">${g.name}</div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;color:var(--muted)">$${g.target.toLocaleString()} by ${g.date}</span>
          <button onclick="deleteGoal(${i})" style="font-size:12px;color:var(--danger);background:none;border:none;cursor:pointer;padding:0">✕</button>
        </div>
      </div>
      <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;margin-bottom:6px">
        <div style="width:${pct}%;height:100%;background:${bc};border-radius:3px"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted)">
        <span>${pct}%${curBal>0?' ($'+curBal.toLocaleString()+')':''}</span>
        <span>${pct>=100?'🎉 Reached!':(remaining>0?'$'+remaining.toLocaleString()+' to go':'')+(weeklyNeeded?' · '+weeklyNeeded:'')}</span>
      </div>
    </div>`;
  }).join('');
  wrap.innerHTML=`<div class="card" style="padding:0;overflow:hidden">
    <div style="background:transparent;padding:16px 16px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted)">🎯 Savings goals</div>
    <div style="padding:14px 16px">
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:${goals.length?'12px':'0'}">
        <input type="text" id="bs-goal-name" placeholder="Goal name" style="flex:1 1 100px;min-width:0;box-sizing:border-box;height:38px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;padding:0 8px;background:var(--card);color:var(--text)">
        <input type="number" id="bs-goal-target" inputmode="decimal" placeholder="$ Target" style="flex:1 1 70px;min-width:0;box-sizing:border-box;height:38px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;text-align:center;background:var(--card);color:var(--text)">
        <input type="date" id="bs-goal-date" style="flex:1 1 110px;min-width:0;box-sizing:border-box;height:38px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;padding:0 6px;background:var(--card);color:var(--text)">
        <button onclick="addBSGoal()" style="flex-shrink:0;padding:0 14px;height:38px;background:var(--header);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Add</button>
      </div>
      ${goals.length?goalsHTML:'<div style="text-align:center;color:var(--muted);font-size:13px;padding:12px 0">No goals yet — add one above</div>'}
    </div>
  </div>`;
}
function addBSGoal(){
  const name=document.getElementById('bs-goal-name')?.value.trim();
  const target=parseFloat(document.getElementById('bs-goal-target')?.value);
  const date=document.getElementById('bs-goal-date')?.value;
  if(!name||!target||!date) return;
  if(!budDefaults.goals) budDefaults.goals=[];
  budDefaults.goals.push({name,target,date});
  localStorage.setItem('daily_budget_defaults',JSON.stringify(budDefaults));
  syncBudDefaultsToFirebase();
  renderBSGoals();
}

// ── Home tab ──────────────────────────────────────────────────────
// ── Habits ────────────────────────────────────────────────────────
function loadHabits(){
  return lsLoad('daily_habits',
    ['Morning workout','Hit calorie goal','Log budget','8h sleep','Drink 2L water'],
    d=>Array.isArray(d)&&d.length>0);
}
function loadHabitsLog(){ return lsLoad('daily_habits_log', {}); }
function saveHabitsLog(){ lsSave('daily_habits_log', habitsLog, 'habitsLog'); }
function toggleHabit(idx){
  const today=getLocalDate();
  if(!habitsLog[today]) habitsLog[today]=[];
  const arr=habitsLog[today];
  const pos=arr.indexOf(idx);
  if(pos>=0) arr.splice(pos,1); else arr.push(idx);
  saveHabitsLog();
  refreshHabitsUI();
}
// Delegated: a tap survives the list re-rendering between press and release. An inline
// onclick on a row that gets rebuilt mid-tap is swallowed → "nothing happens, tap again".
document.addEventListener('click',function(e){
  const el=e.target.closest('[data-habit-toggle]'); if(!el) return;
  const i=parseInt(el.getAttribute('data-habit-toggle'),10);
  if(!isNaN(i)) toggleHabit(i);
});
function getWeekDates(){
  const monday=getMondayOf(0);
  return Array.from({length:7},(_,i)=>{
    const d=new Date(monday); d.setDate(monday.getDate()+i);
    return dateStr(d);
  });
}
function buildHabitsWeekGrid(){
  const today=getLocalDate();
  const dates=getWeekDates();
  const n=habitsData.length||1;
  const labels=['M','T','W','T','F','S','S'];
  return dates.map((date,i)=>{
    const done=(habitsLog[date]||[]).length;
    const isFuture=date>today;
    let bg='var(--border)',tc='var(--muted)';
    if(!isFuture&&done>=n){bg='var(--success)';tc='#fff';}
    else if(!isFuture&&done>0){bg='#f59e0b';tc='#fff';}
    const border=date===today?'border:2px solid var(--text);':'border:2px solid transparent;';
    return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">'
      +'<div style="width:30px;height:30px;border-radius:8px;background:'+bg+';'+border+'display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:'+tc+'">'
      +(!isFuture&&done>0?done:'')
      +'</div>'
      +'<div style="font-size:9px;color:var(--muted)">'+labels[i]+'</div>'
      +'</div>';
  }).join('');
}
// 30-day per-habit completion for the Stats tab (uses the existing index-based model:
// habit "done" on a date = its index is in habitsLog[date]).
function renderStatsHabits(){
  const el=document.getElementById('stats-habits-list');
  const section=document.getElementById('stats-habits-section');
  if(!el) return;
  if(!habitsData.length){ if(section) section.style.display='none'; return; }
  if(section) section.style.display='';
  const days=[]; const d0=localMidnight(getLocalDate());
  for(let i=0;i<30;i++){ const d=new Date(d0); d.setDate(d.getDate()-i); days.push(dateStr(d)); }
  el.innerHTML=habitsData.map((h,idx)=>{
    const completed=days.filter(day=>(habitsLog[day]||[]).indexOf(idx)>=0).length;
    const pct=Math.round(completed/30*100);
    const streak=calcHabitStreakIdx(idx);
    return '<div style="margin-bottom:18px">'+
      '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">'+
        '<span style="font-size:14px;font-weight:600;color:var(--text)">'+String(h).replace(/</g,'&lt;')+'</span>'+
        '<span style="font-size:12px;color:var(--muted)">'+completed+'/30 · 🔥 '+streak+'</span>'+
      '</div>'+
      '<div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">'+
        '<div style="height:100%;width:'+pct+'%;background:var(--accent);border-radius:4px;transition:width .4s ease"></div>'+
      '</div>'+
      '<div style="font-size:11px;color:var(--muted);margin-top:4px">'+pct+'% this month</div>'+
    '</div>';
  }).join('');
}
function calcHabitStreakIdx(idx){
  let streak=0; const d=localMidnight(getLocalDate());
  while(true){ if((habitsLog[dateStr(d)]||[]).indexOf(idx)<0) break; streak++; d.setDate(d.getDate()-1); }
  return streak;
}
// Habits stats live in the Training sub-tab. Created dynamically and always
// re-appended to the end of #sub-training.
function ensureHabitsStatsInProgress(){
  const sub=document.getElementById('sub-training'); if(!sub) return;
  let sec=document.getElementById('stats-habits-section');
  if(!sec){
    sec=document.createElement('div');
    sec.id='stats-habits-section';
    sec.style.cssText='margin-top:24px;display:none';
    sec.innerHTML='<div class="sec-label" style="margin-bottom:12px">📋 Habit completion · last 30 days</div><div id="stats-habits-list"></div>';
  }
  sub.appendChild(sec); // move/keep at the end
  renderStatsHabits();
}
function buildHabitsWeekStats(){
  const today=getLocalDate();
  const dates=getWeekDates();
  const n=habitsData.length;
  let perfect=0,total=0,days=0;
  dates.forEach(d=>{
    if(d>today) return;
    days++;
    const done=(habitsLog[d]||[]).length;
    total+=done;
    if(done>=n) perfect++;
  });
  const avg=days>0?(total/days).toFixed(1):'0';
  return '<span style="font-size:12px;font-weight:600;color:var(--success)">'+perfect+' perfect day'+(perfect!==1?'s':'')+'</span>'
    +'<span style="font-size:12px;color:var(--muted);margin-left:8px">· avg '+avg+'/'+n+' per day</span>';
}
function buildTodayHabitsList(){
  const today=getLocalDate();
  const done=habitsLog[today]||[];
  return habitsData.map((h,i)=>{
    const checked=done.includes(i);
    const isLast=i===habitsData.length-1;
    return '<div data-habit-toggle="'+i+'" style="display:flex;align-items:center;gap:12px;padding:11px 0;'+(isLast?'':'border-bottom:1px solid var(--border);')+'cursor:pointer;-webkit-tap-highlight-color:transparent">'
      +'<div style="width:22px;height:22px;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;'+(checked?'background:var(--accent);border:2px solid var(--accent);':'background:transparent;border:2px solid var(--border);')+'">'
      +(checked?'<svg viewBox="0 0 12 10" width="10" height="10" fill="none"><polyline points="1,5 4,8 11,1" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>':'')
      +'</div>'
      +'<span style="font-size:14px;'+(checked?'color:var(--muted);text-decoration:line-through;':'color:var(--text);')+'">'+h+'</span>'
      +'</div>';
  }).join('');
}
function refreshHabitsUI(){
  const g=document.getElementById('habits-week-grid');
  if(g) g.innerHTML=buildHabitsWeekGrid();
  const s=document.getElementById('habits-week-stats');
  if(s) s.innerHTML=buildHabitsWeekStats();
  const l=document.getElementById('habits-today-list');
  if(l) l.innerHTML=buildTodayHabitsList();
  const c=document.getElementById('habits-today-count');
  if(c){
    const today=getLocalDate();
    const n=habitsData.length;
    const doneN=(habitsLog[today]||[]).length;
    c.textContent=doneN+'/'+n;
    c.style.color='#fff';
    c.style.opacity=(doneN===n&&n>0)?'1':'0.75';
  }
}
// ── Week in review ────────────────────────────────────────────────
// Rebuilt around DELTAS, because as a snapshot this card was almost entirely duplicate. Its
// 2×2 grid showed Workouts (the same distinct-session-dates count the streak card already
// computes), Budget (the same leftover as the budget card), Cals today (the same total as the
// calorie ring) and Weight Δ — and Weight Δ, its one unique cell, is now covered properly by
// the Weight & Goal card. Three of four cells were repeating a number from another card two
// rows away, which is why Home felt busy without feeling informative.
// A delta is not a duplicate: "4 workouts" is already on screen, "+1 vs last week" is not.
// The habits stats and 7-day grid moved to the habits card, where they describe the thing
// they belong to.
function buildWeekSummaryCard(){
  const {mondayStr,sundayStr}=getWeekBounds();
  const prevMon=getMondayOf(-1);
  const prevMonStr=weekKey(prevMon);
  const prevSun=new Date(prevMon); prevSun.setDate(prevMon.getDate()+6);
  const prevSunStr=dateStr(prevSun);
  const inRange=(d,a,b)=>d>=a&&d<=b;
  // Workouts: distinct days trained, this week vs last.
  const wNow=new Set(S.sessions.filter(s=>inRange(s.date,mondayStr,sundayStr)).map(s=>s.date)).size;
  const wPrev=new Set(S.sessions.filter(s=>inRange(s.date,prevMonStr,prevSunStr)).map(s=>s.date)).size;
  // Spending: total outgoings for each week, from the same accessor the Budget tab uses.
  const sNow=budgetData[mondayStr]?weekSpending(budgetData[mondayStr]):null;
  const sPrev=budgetData[prevMonStr]?weekSpending(budgetData[prevMonStr]):null;
  // Calories: daily average across the days actually logged in each week. calorieHistory is a
  // flat {date: total} map, so this is a read — no new tracking.
  const avgCals=(a,b)=>{
    const vals=Object.keys(calorieHistory||{}).filter(d=>inRange(d,a,b))
      .map(d=>parseFloat(calorieHistory[d])||0).filter(v=>v>0);
    return vals.length?Math.round(vals.reduce((x,y)=>x+y,0)/vals.length):null;
  };
  const cNow=avgCals(mondayStr,sundayStr), cPrev=avgCals(prevMonStr,prevSunStr);
  // A delta chip is only honest when there is a previous week to compare against — otherwise
  // it silently treats "no data last week" as zero and reports a fake improvement.
  const chip=(now,prev,opts)=>{
    const o=opts||{};
    if(now==null||prev==null) return '<span class="wr-chip wr-chip-none">no last week</span>';
    const d=+(now-prev).toFixed(o.dp||0);
    if(!d) return '<span class="wr-chip wr-chip-none">same</span>';
    // neutral: the direction has no good/bad reading, so the chip stays grey and just reports
    // the movement. lowerIsBetter otherwise flips which way is green — more workouts is good,
    // more spend is not.
    const cls=o.neutral?'wr-chip-flat':((o.lowerIsBetter?d<0:d>0)?'wr-chip-up':'wr-chip-down');
    return '<span class="wr-chip '+cls+'">'+
      (d>0?'+':'−')+(o.money?fmtMoney(Math.abs(d)):Math.abs(d))+'</span>';
  };
  const row=(label,valHtml,chipHtml)=>
    '<div class="wr-row"><span class="wr-row-l">'+label+'</span>'+
    '<span class="wr-row-v">'+valHtml+'</span>'+chipHtml+'</div>';
  const dash='<span class="wr-row-none">—</span>';
  return '<div class="card">'
    +cardHeader('calendar','Week in review',
       '<button class="card-hd-act" onclick="event.stopPropagation();openWeekReviewModal()">Full review →</button>')
    +row('Workouts', wNow+'<span class="wr-row-u">days</span>', chip(wNow,wPrev))
    +row('Spending', sNow==null?dash:fmtMoney(Math.round(sNow)), chip(sNow==null?null:Math.round(sNow), sPrev==null?null:Math.round(sPrev), {money:true,lowerIsBetter:true}))
    // Whether eating more is better depends entirely on the goal, so read it rather than
    // assuming: cutting wants the number down, bulking wants it up, and maintaining has no
    // preferred direction at all (grey chip, movement reported without a verdict). Painting
    // "+257 kcal" green for someone on a cut would be exactly backwards.
    +row('Avg calories', cNow==null?dash:cNow+'<span class="wr-row-u">kcal/day</span>',
        chip(cNow,cPrev,(()=>{ const g=(calcGoalCals()||{}).goal;
          return g==='cut'?{lowerIsBetter:true}:g==='bulk'?{}:{neutral:true}; })()))
    +'</div>';
}
// ── Weight & goal ─────────────────────────────────────────────────
// The app stored a weight goal that appeared nowhere on Home — a goal whose progress only
// exists on a settings screen is a goal you never see.
// The stored goal is {target, date}, and the DATE is what makes this more than a subtraction:
// with a start point, a target and a deadline you can say whether today's weight is ahead of
// or behind the straight line between them, which is the same "pace" idea the budget card
// uses. Without a target date it degrades to distance-to-go, which is still useful.
function buildWeightGoalCard(){
  const sorted=[...(S.weights||[])].sort((a,b)=>a.date<b.date?-1:1);
  const open='onclick="setView(\'stats\');setStatsTab(\'body\')"';
  if(!sorted.length){
    return '<div class="card" '+open+' style="cursor:pointer">'+
      cardHeader('scale','Weight')+
      '<div style="font-size:14px;color:var(--muted)">Log your weight to start tracking.</div>'+
    '</div>';
  }
  const cur=sorted[sorted.length-1];
  const target=parseFloat(weightGoal&&weightGoal.target);
  const hasGoal=!isNaN(target)&&target>0;
  // Last ~8 weeks of readings for the shape.
  const cutoff=dateStr(new Date(Date.now()-56*864e5));
  const recent=sorted.filter(w=>w.date>=cutoff);
  const series=(recent.length>=2?recent:sorted.slice(-8)).map(w=>parseFloat(w.weight)).filter(v=>isFinite(v));
  // Week-over-week delta from the readings inside the current week.
  const {mondayStr}=getWeekBounds();
  const wk=sorted.filter(w=>w.date>=mondayStr);
  const wkDelta=wk.length>=2?+(wk[wk.length-1].weight-wk[0].weight).toFixed(1):null;
  let capParts=[];
  if(wkDelta!==null) capParts.push((wkDelta>0?'+':'')+wkDelta+' kg this week');
  let pillHtml='';
  if(hasGoal){
    const toGo=+(target-cur.weight).toFixed(1);
    capParts.push(Math.abs(toGo)+' kg to go');
    // Pace: where the straight line from the first reading to the target says you should be
    // today. Losing and gaining are both handled because it compares distance covered against
    // distance expected, not raw direction.
    const gd=weightGoal.date?String(weightGoal.date).slice(0,10):'';
    if(gd&&sorted.length>=2){
      const t0=localMidnight(sorted[0].date).getTime();
      const t1=localMidnight(gd).getTime();
      const now=localMidnight(getLocalDate()).getTime();
      if(t1>t0&&now>t0){
        const frac=Math.min(1,(now-t0)/(t1-t0));
        const expected=sorted[0].weight+(target-sorted[0].weight)*frac;
        const total=target-sorted[0].weight;
        // "Ahead" means further along the intended direction than the line expects.
        const ahead=total===0 ? true : ((cur.weight-expected)/total)>=-0.02;
        pillHtml='<span class="budget-snap-pill'+(ahead?'':' warn')+'">'+(ahead?'On pace':'Behind pace')+'</span>';
        capParts.push('target '+localMidnight(gd).toLocaleDateString('en-AU',{day:'numeric',month:'short'}));
      }
    }
  }
  return '<div class="card" '+open+' style="cursor:pointer">'+
    cardHeader('scale','Weight',pillHtml||(hasGoal?'':'<span class="card-hd-act">Set a goal →</span>'))+
    '<div><span class="card-fig">'+cur.weight+'</span><span class="card-fig-u">kg</span></div>'+
    (series.length>=2?'<div class="card-shape">'+sparkline(series,{target:hasGoal?target:null,height:40})+'</div>':'')+
    (capParts.length?'<div class="card-cap">'+capParts.join(' · ')+'</div>':'')+
  '</div>';
}
// ── Kitchen snapshot ──────────────────────────────────────────────
// Kitchen was an entire tab — recipes, shopping list, pantry — with no presence on Home at
// all, which is why Home read as a fitness-and-money app that happened to have a Kitchen tab.
// Everything here is a read of data already stored and synced: recipes carry `favourite` and a
// `lastCooked` timestamp (stored precisely so something could reason about rotation, and
// nothing did), kitShopComputeItems() already builds the shopping list, and kitPantryNeeds()
// already knows what is low or out.
// ── Personal records ──────────────────────────────────────────────
// getPR(name) returns a bare maximum and nothing else — no reps, no date, no previous best —
// and it rescans every session, exercise and set on each call, so asking it for a Home card's
// worth of exercises is O(sessions × exercises × sets) per exercise, every render.
// This walks the history ONCE, in date order, and records a PR *event* whenever a working set
// beats the running best for that exercise. One pass gives everything the card needs: what was
// lifted, for how many reps, when, and what it beat.
// Warmup sets are excluded (s.type==='warmup'); getPR counts them, which is a latent bug there
// — harmless only because warmups are usually lighter.
function computePRHistory(){
  const best={}, events=[];
  [...(S.sessions||[])].sort((a,b)=>a.date<b.date?-1:1).forEach(s=>{
    (s.exercises||[]).forEach(ex=>{
      if(!ex||!ex.name) return;
      // Timed exercises are ranked by seconds (stored in reps), matching getPR/getPoints.
      const timed=(typeof _secsNames!=='undefined')&&_secsNames.has(ex.name);
      (ex.sets||[]).forEach(set=>{
        if(!set||set.type==='warmup') return;
        const val=parseFloat(timed?set.reps:set.weight);
        if(isNaN(val)||val<=0) return;
        const prev=best[ex.name];
        if(prev===undefined||val>prev){
          events.push({name:ex.name, val, reps:parseFloat(set.reps)||null,
                       date:s.date, prev:prev===undefined?null:prev, timed});
          best[ex.name]=val;
        }
      });
    });
  });
  return events;
}
// Every other training card on Home is about compliance — did you train, how many days, what
// percent done. None of them are about getting stronger, which is the reason to train at all.
function buildPRCard(){
  const ev=computePRHistory();
  const open='onclick="setView(\'stats\');setStatsTab(\'training\')"';
  if(!ev.length){
    return '<div class="card" '+open+' style="cursor:pointer">'+
      cardHeader('trophy','Personal records')+
      '<div style="font-size:14px;color:var(--muted)">Your first logged session sets them all.</div>'+
    '</div>';
  }
  // Most recent first, one row per exercise so a single lift that broke its record three weeks
  // running doesn't fill the card.
  const seen=new Set(), rows=[];
  for(let i=ev.length-1;i>=0&&rows.length<3;i--){
    const e=ev[i];
    if(seen.has(e.name)) continue;
    seen.add(e.name);
    const days=Math.floor((localMidnight(getLocalDate())-localMidnight(e.date))/864e5);
    const val=e.timed ? e.val+'s' : e.val+' kg'+(e.reps?' × '+e.reps:'');
    rows.push('<div class="pr-row">'+
      '<span class="pr-name">'+_catEscHtml(e.name)+'</span>'+
      (days<=14?'<span class="pr-new">NEW</span>':'')+
      '<span class="pr-val">'+val+'</span>'+
    '</div>');
  }
  return '<div class="card" '+open+' style="cursor:pointer">'+
    cardHeader('trophy','Personal records','<span class="card-hd-act">All →</span>')+
    rows.join('')+
  '</div>';
}
function buildKitchenCard(){
  const recipes=(typeof kitRecipes!=='undefined'&&Array.isArray(kitRecipes))?kitRecipes:[];
  const open='onclick="setView(\'kitchen\')"';
  if(!recipes.length){
    return '<div class="card" '+open+' style="cursor:pointer">'+
      cardHeader('pot','Kitchen')+
      '<div style="font-size:14px;color:var(--muted)">Add a recipe to get cook-again suggestions.</div>'+
    '</div>';
  }
  // Cook again: the favourite you have left longest. Favourites first because a suggestion you
  // have already said you like is worth more than one picked purely by staleness; never-cooked
  // recipes sort first inside each group (lastCooked 0), which is the right nudge for something
  // you saved and never made.
  const byStale=(a,b)=>(a.lastCooked||0)-(b.lastCooked||0);
  const favs=recipes.filter(r=>r.favourite).sort(byStale);
  const pick=(favs.length?favs:[...recipes].sort(byStale))[0];
  const days=pick.lastCooked?Math.floor((Date.now()-pick.lastCooked)/864e5):null;
  const ago=days===null?'never cooked':days===0?'cooked today':days===1?'cooked yesterday'
    :days<14?'cooked '+days+' days ago':'cooked '+Math.floor(days/7)+' weeks ago';
  const meta=[pick.category?pick.category[0].toUpperCase()+pick.category.slice(1):'',
              pick.servings?pick.servings+' servings':'', ago].filter(Boolean).join(' · ');
  // Shopping + pantry, as cells — omitted individually when there is nothing to say, so a
  // clear list doesn't render a "0 left" that looks like a failure.
  const cells=[];
  try{
    if(typeof kitShopComputeItems==='function'){
      const map=kitShopComputeItems();
      const left=Object.keys(map).filter(k=>!kitShopChecked[k]).length;
      if(Object.keys(map).length) cells.push({l:'Shopping',v:left?left+' left':'All done',
        c:left?'':'var(--positive)'});
    }
  }catch(e){}
  try{
    if(typeof kitPantryNeeds==='function'){
      const n=kitPantryNeeds().length;
      if(n) cells.push({l:'Pantry',v:n+(n===1?' item low':' items low'),c:'#f59e0b'});
    }
  }catch(e){}
  const splitHtml=cells.map((c,i)=>
    (i?'<div class="card-split-div"></div>':'')+
    '<div><div class="card-split-l">'+c.l+'</div>'+
    '<div class="card-split-v"'+(c.c?' style="color:'+c.c+'"':'')+'>'+c.v+'</div></div>').join('');
  return '<div class="card" '+open+' style="cursor:pointer">'+
    cardHeader('pot','Kitchen','<span class="card-hd-act">Open →</span>')+
    '<div class="kit-suggest">'+_catEscHtml(pick.name||'Untitled')+'</div>'+
    '<div class="card-cap" style="margin-top:4px">'+meta+'</div>'+
    (splitHtml?'<div class="card-split">'+splitHtml+'</div>':'')+
  '</div>';
}
function buildTodayHabitsCard(){
  const today=getLocalDate();
  const doneCount=(habitsLog[today]||[]).length;
  const n=habitsData.length;
  const allDone=doneCount===n&&n>0;
  return '<div class="card" style="padding:0;overflow:hidden">'
    +'<div style="background:transparent;padding:16px 16px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);display:flex;justify-content:space-between;align-items:center">'
    +'<span>Daily habits</span>'
    +'<div style="display:flex;align-items:center;gap:10px">'
    +'<span id="habits-today-count" style="font-size:13px;font-weight:700;color:var(--text);opacity:'+(allDone?'1':'0.75')+'">'+doneCount+'/'+n+'</span>'
    +'<button onclick="openHabitsEditModal()" style="background:transparent;border:1px solid var(--border);border-radius:8px;padding:4px 11px;cursor:pointer;color:var(--muted);font-size:12px;font-weight:600;line-height:1;-webkit-tap-highlight-color:transparent" title="Edit habits">Edit</button>'
    +'</div>'
    +'</div>'
    +'<div style="padding:14px 16px">'
    +'<div id="habits-today-list">'+buildTodayHabitsList()+'</div>'
    // The week stats + 7-day grid moved here from the Week in Review card, where they were
    // the habits half of a card that also duplicated three other cards. A habits card showing
    // only today has no memory — the grid is what turns "3/5 today" into "and here's the week",
    // and it belongs with the habits it describes.
    +(habitsData.length
      ? '<div style="border-top:1px solid var(--border);margin-top:12px;padding-top:12px">'
        +'<div id="habits-week-stats" style="margin-bottom:8px">'+buildHabitsWeekStats()+'</div>'
        +'<div id="habits-week-grid" style="display:flex;gap:4px">'+buildHabitsWeekGrid()+'</div>'
      +'</div>'
      : '')
    +'</div>'
    +'</div>';
}
// Habits management is now a full-screen settings section (#settings-habits-section, rendered
// into #habits-edit-sheet). Kept as a named entry point for the Home habits card + menu.
function openHabitsEditModal(){ if(typeof openSettingsSection==='function') openSettingsSection('habits'); }
function renderHabitsEditModal(){
  const sheet=document.getElementById('habits-edit-sheet'); if(!sheet) return;
  const rows=habitsData.map((h,i)=>
    '<div class="habit-edit-row" data-idx="'+i+'">'
    +'<span class="habit-drag-handle" aria-label="Drag to reorder" title="Drag to reorder">⠿</span>'
    +'<span style="flex:1;font-size:14px;color:var(--text)">'+h.replace(/</g,'&lt;')+'</span>'
    +'<button onclick="deleteHabitItem('+i+')" style="background:none;border:none;color:var(--danger);font-size:16px;cursor:pointer;padding:0 4px;flex-shrink:0">✕</button>'
    +'</div>'
  ).join('') || '<div style="font-size:13px;color:var(--muted);padding:8px 0">No habits yet</div>';
  sheet.innerHTML=
    (habitsData.length>1?'<div style="font-size:12px;color:var(--muted);margin-bottom:12px">Drag the ⠿ handle to reorder · tap ✕ to remove</div>':'<div style="font-size:12px;color:var(--muted);margin-bottom:12px">Add, remove and reorder your daily habits.</div>')
    +rows
    +'<div style="display:flex;gap:8px;margin-top:12px">'
    +'<input id="habit-new-input" type="text" placeholder="New habit…" style="flex:1;height:40px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;padding:0 10px;background:transparent;color:var(--text)">'
    +'<button onclick="addHabitItem()" style="padding:0 16px;height:40px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">Add</button>'
    +'</div>';
}
// habitsRef is scoped to the auth callback, so it's not visible here — write to the cloud
// ref by uid directly. (Referencing habitsRef from these global fns threw a ReferenceError,
// which aborted them before the re-render — habits only appeared after close+reopen.)
function pushHabits(){
  try{ if(firebaseReady&&auth&&auth.currentUser&&db) db.ref('users/'+auth.currentUser.uid+'/habits').set(habitsData); }catch(e){}
}
function addHabitItem(){
  const inp=document.getElementById('habit-new-input'); if(!inp) return;
  const val=inp.value.trim(); if(!val) return;
  habitsData.push(val);
  localStorage.setItem('daily_habits',JSON.stringify(habitsData));
  pushHabits();
  inp.value='';
  renderHabitsEditModal();
  refreshTodayHabits();
}
function deleteHabitItem(i){
  habitsData.splice(i,1);
  // Keep completion history aligned: drop this index, shift higher indices down.
  Object.keys(habitsLog).forEach(date=>{
    habitsLog[date]=(habitsLog[date]||[]).filter(x=>x!==i).map(x=>x>i?x-1:x);
  });
  localStorage.setItem('daily_habits',JSON.stringify(habitsData));
  saveHabitsLog();
  pushHabits();
  renderHabitsEditModal();
  refreshTodayHabits();
}
// Apply the dragged habit order, remapping habitsLog indices so each habit's completion
// history follows it to the new position.
function applyHabitOrderFromDOM(){
  const rows=[...document.querySelectorAll('#habits-edit-sheet .habit-edit-row')];
  if(rows.length<2) return;
  const newOrder=rows.map(r=>parseInt(r.dataset.idx,10)); // old indices in their new order
  if(newOrder.some(isNaN)) return;
  const inv={}; newOrder.forEach((oldIdx,newPos)=>{ inv[oldIdx]=newPos; });
  habitsData=newOrder.map(oldIdx=>habitsData[oldIdx]);
  Object.keys(habitsLog).forEach(date=>{
    habitsLog[date]=(habitsLog[date]||[]).map(i=>inv[i]).filter(x=>x!==undefined).sort((a,b)=>a-b);
  });
  localStorage.setItem('daily_habits',JSON.stringify(habitsData));
  saveHabitsLog();
  pushHabits();
  renderHabitsEditModal();
  refreshTodayHabits();
}
// Pointer-based drag-to-reorder for the habits edit sheet (mouse + touch). Uses a floating
// clone that follows the pointer so it's obvious what you're holding and where it'll drop.
(function(){
  let row=null, clone=null, offY=0, parent=null;
  function onMove(e){
    if(!row) return;
    if(e.cancelable) e.preventDefault();
    clone.style.top=(e.clientY-offY)+'px';
    clone.style.display='none'; // hide clone so hit-test reads the row underneath
    const el=document.elementFromPoint(e.clientX,e.clientY);
    clone.style.display='';
    const over=(el&&el.closest)?el.closest('.habit-edit-row'):null;
    if(over&&over!==row&&over.parentElement===parent){
      const r=over.getBoundingClientRect();
      const after=e.clientY > r.top + r.height/2;
      parent.insertBefore(row, after?over.nextSibling:over);
    }
  }
  function onUp(){
    document.removeEventListener('pointermove',onMove);
    document.removeEventListener('pointerup',onUp);
    document.removeEventListener('pointercancel',onUp);
    if(!row) return;
    if(clone){ clone.remove(); clone=null; }
    row.style.opacity=''; row=null; parent=null;
    applyHabitOrderFromDOM();
  }
  document.addEventListener('pointerdown',function(e){
    const h=e.target.closest('.habit-drag-handle'); if(!h) return;
    row=h.closest('.habit-edit-row'); if(!row) return;
    parent=row.parentElement;
    const r=row.getBoundingClientRect();
    offY=e.clientY-r.top;
    clone=row.cloneNode(true);
    clone.classList.add('habit-dragging');
    clone.style.cssText='position:fixed;left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px;z-index:9999;pointer-events:none;margin:0';
    document.body.appendChild(clone);
    row.style.opacity='.25';
    try{ if(h.setPointerCapture&&e.pointerId!=null) h.setPointerCapture(e.pointerId); }catch(err){}
    e.preventDefault();
    document.addEventListener('pointermove',onMove,{passive:false});
    document.addEventListener('pointerup',onUp);
    document.addEventListener('pointercancel',onUp);
  });
})();
function closeHabitsEditModal(){ if(typeof closeSettingsSection==='function') closeSettingsSection(); }
function refreshTodayHabits(){
  const list=document.getElementById('habits-today-list');
  if(list) list.innerHTML=buildTodayHabitsList();
  const today=getLocalDate();
  const doneCount=(habitsLog[today]||[]).length;
  const n=habitsData.length;
  const counter=document.getElementById('habits-today-count');
  if(counter){ counter.textContent=doneCount+'/'+n; counter.style.opacity=(doneCount===n&&n>0)?'1':'0.75'; }
}

// Time-of-day greeting + saved profile name (source of truth: profileData.name).
function getGreeting(){
  const hour=new Date().getHours();
  const nm=(profileData.name||S.personalInfo?.name||'').trim();
  const timeGreet=hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';
  return nm?timeGreet+', '+nm:timeGreet;
}

// ── Home weather card ──────────────────────────────────────────────
// Open-Meteo: free, no API key (nothing to hide in a static public repo), CORS-enabled.
// WMO weather codes → icon/label (https://open-meteo.com/en/docs — "WMO Weather interpretation codes").
const WEATHER_CODES={
  0:['☀️','Clear sky'],1:['🌤️','Mostly clear'],2:['⛅','Partly cloudy'],3:['☁️','Overcast'],
  45:['🌫️','Fog'],48:['🌫️','Fog'],
  51:['🌦️','Light drizzle'],53:['🌦️','Drizzle'],55:['🌦️','Heavy drizzle'],
  61:['🌧️','Light rain'],63:['🌧️','Rain'],65:['🌧️','Heavy rain'],
  71:['🌨️','Light snow'],73:['🌨️','Snow'],75:['🌨️','Heavy snow'],
  80:['🌦️','Rain showers'],81:['🌧️','Rain showers'],82:['⛈️','Violent showers'],
  95:['⛈️','Thunderstorm'],96:['⛈️','Thunderstorm'],99:['⛈️','Thunderstorm'],
};
// A dry sky — no precipitation, fog or storm — is the only case where cloud_cover should
// override the code (see cloudLook below).
function isDrySkyCode(code){ return code===0||code===1||code===2||code===3; }
// For a dry sky the WMO code is too coarse to trust: sampling live data, code 1 ("mainly
// clear") comes back at anything from 22% to 46% cloud cover, and code 0/1 both used to draw
// a cloudless sunny scene — so a half-grey sky rendered as brilliant sunshine. cloud_cover is
// the actual modelled percentage and tracks what you see out the window far better, so it
// drives the icon, the label and the scene whenever the sky is dry.
// Thresholds follow the usual met convention (roughly okta bands): few / scattered / broken / overcast.
const CLOUD_LOOKS=[
  {max:15,  base:'clear',  day:['☀️','Clear sky'],     night:['🌙','Clear night']},
  {max:40,  base:'clear',  day:['🌤️','Mostly sunny'],  night:['🌙','Mostly clear']},
  {max:70,  base:'partly', day:['⛅','Partly cloudy'],  night:['☁️','Partly cloudy']},
  {max:101, base:'cloudy', day:['☁️','Cloudy'],         night:['☁️','Cloudy']},
];
function cloudLook(cloud){
  for(const l of CLOUD_LOOKS){ if(cloud<l.max) return l; }
  return CLOUD_LOOKS[CLOUD_LOOKS.length-1];
}
// Icon + label for the card. Dry skies read from cloud_cover; anything with actual weather in
// it (rain/snow/fog/storm) still reads from the code, which is authoritative for those.
// Night matters here too: a clear sky at 9pm was previously drawing a ☀️.
function weatherLook(entry){
  if(entry&&isDrySkyCode(entry.code)&&entry.cloud!=null){
    const l=cloudLook(entry.cloud);
    return weatherPhase(entry)==='night'?l.night:l.day;
  }
  return WEATHER_CODES[entry&&entry.code]||['🌡️','—'];
}
// Condition → animated background "scene" (see .home-weather-card[data-scene] in
// kitchen-extras.css). Storm and fog skip the day/night split: a storm already reads as
// dark regardless of clock time, and fog's flat haze doesn't have a distinct night look in
// practice either — building separate art for those would just duplicate the day scene.
function weatherSceneBase(code,cloud){
  // Real weather first — these are what the code is actually good for.
  if(code===45||code===48) return 'fog';
  if(code===82||code>=95) return 'storm';
  if((code>=71&&code<=77)||(code>=85&&code<=86)) return 'snow';
  if((code>=51&&code<=67)||code===80||code===81) return 'rain';
  // Dry sky → let measured cloud cover decide how cloudy it looks.
  if(cloud!=null) return cloudLook(cloud).base;
  if(code===0||code===1) return 'clear';
  if(code===2) return 'partly';
  return 'cloudy';
}
// Time-of-day phase from the day's real sunrise/sunset rather than a fixed clock hour, so
// the card tracks the actual sky (an 8pm summer dusk vs an 8pm winter night). Computed at
// RENDER time, not fetch time, so a cached reading still advances dawn→noon→dusk on its own.
// Falls back to the API's is_day flag if the sun times are missing.
function weatherPhase(entry){
  const fallback=entry.isDay===0?'night':'day';
  if(!entry.sunrise||!entry.sunset) return fallback;
  const sr=new Date(entry.sunrise).getTime(), ss=new Date(entry.sunset).getTime();
  if(isNaN(sr)||isNaN(ss)) return fallback;
  const now=Date.now(), EDGE=45*60*1000;
  if(now<sr-EDGE||now>ss+EDGE) return 'night';
  if(Math.abs(now-sr)<=EDGE) return 'dawn';
  if(Math.abs(now-ss)<=EDGE) return 'dusk';
  if(Math.abs(now-(sr+ss)/2)<=2*60*60*1000) return 'noon';  // brightest, sun highest
  return 'day';
}
// The sun and moon travel a real arc between sunrise and sunset rather than sitting at one
// fixed spot per phase, and live wind angles the rain and drives the cloud speed. Everything
// is published as CSS custom properties so the animation layers stay pure CSS — this only
// decides where things sit, never how they move.
function applyWeatherMotion(card, entry){
  if(!card||!entry) return;
  const H=card.getBoundingClientRect().height||100;
  const now=Date.now(), DAY=86400000;
  const sr=entry.sunrise?new Date(entry.sunrise).getTime():NaN;
  const ss=entry.sunset?new Date(entry.sunset).getTime():NaN;
  let p=0.5, isNight=false;
  if(!isNaN(sr)&&!isNaN(ss)&&ss>sr){
    if(now>=sr&&now<=ss){
      p=(now-sr)/(ss-sr);                       // fraction of daylight elapsed
    } else {
      isNight=true;
      // Night spans sunset to the NEXT sunrise, so before dawn we look back to yesterday's
      // sunset and after dusk forward to tomorrow's sunrise.
      const start=now>ss?ss:ss-DAY;
      const end  =now>ss?sr+DAY:sr;
      p=(now-start)/(end-start);
    }
  } else {
    isNight=weatherPhase(entry)==='night';       // no sun times — fall back to the phase
  }
  p=Math.max(0,Math.min(1,isNaN(p)?0.5:p));
  const arc=Math.sin(Math.PI*p);                 // 0 at both horizons, 1 at the peak
  const lowTop=H*0.55, peakTop=-38;
  const set=(k,v)=>card.style.setProperty(k,v);
  set(isNight?'--wfx-moon-x':'--wfx-sun-x',(p*100).toFixed(1)+'%');
  set(isNight?'--wfx-moon-y':'--wfx-sun-y',Math.round(lowTop+(peakTop-lowTop)*arc)+'px');

  // Wind direction is the compass bearing the wind blows FROM, so a westerly (270) pushes
  // rain to the right: -sin(270) = +1.
  const spd=Math.max(0,Math.min(60,parseFloat(entry.wind)||0));
  const dir=parseFloat(entry.windDir);
  const across=isNaN(dir)?-1:-Math.sin(dir*Math.PI/180);
  set('--wfx-rain-x',(across*(6+spd*0.7)).toFixed(0)+'px');
  // Divides the cloud drift durations, so 0.6 is a slow still day and ~2.2 a gale.
  set('--wfx-wind',(0.6+Math.min(spd,40)/25).toFixed(2));
}
// Phase from the local clock alone, for the states where there is no reading to read sun
// times from: location not yet granted, first launch, or a failed fetch. Rough hour bands are
// the best available without a location, but enough that a 9pm card looks like night.
function weatherClockPhase(){
  const h=new Date().getHours();
  if(h<5)  return 'night';
  if(h<7)  return 'dawn';
  if(h<11) return 'day';
  if(h<15) return 'noon';
  if(h<18) return 'day';
  if(h<20) return 'dusk';
  return 'night';
}
// Placeholder sky for the no-data states. Deliberately a "clear" scene: it implies no
// precipitation we haven't measured, while still tracking time of day. Previously these
// states left data-scene="neutral", which has no CSS of its own and so fell through to the
// base blue-grey gradient — a daytime sky shown at every hour, including midnight.
function weatherPlaceholderScene(){ return 'clear-'+weatherClockPhase(); }
// Only clear/partly skies get the full dawn/noon/dusk treatment — under heavy cloud, rain or
// snow the sun's height barely changes how the sky reads, so those stay day/night.
function weatherScene(code,entry){
  const base=weatherSceneBase(code,entry&&entry.cloud);
  if(base==='storm'||base==='fog') return base;
  const phase=weatherPhase(entry);
  if(base==='clear'||base==='partly') return base+'-'+phase;
  return base+'-'+(phase==='night'?'night':'day');
}
// "Australia/Sydney" → "Sydney". Uses the timezone the forecast call already returns, so
// there's no second request and no extra service to depend on. It's the timezone's city, not
// a precise suburb — accurate enough for a glanceable card.
function weatherCityFromTz(tz){
  if(!tz) return '';
  const part=String(tz).split('/').pop();
  return part?part.replace(/_/g,' '):'';
}
function loadWeatherCache(){ return lsLoad('daily_weather_cache', null); }
function saveWeatherCache(c){ lsSave('daily_weather_cache', c, 'weatherCache'); }
const WEATHER_STALE_MS=30*60*1000; // refetch after 30 min
// Shown before the user grants location, so the card reads as finished rather than an empty
// grey box. It's a real live reading for this city, clearly labelled "sample", not fake data.
const WEATHER_SAMPLE_LOC={lat:-33.8688, lon:151.2093, city:'Sydney'};
let _weatherLoading=false;
function renderWeatherInto(entry){
  const tempEl=document.getElementById('home-weather-temp');
  if(!tempEl) return; // card isn't in the current layout — nothing to patch
  tempEl.textContent=Math.round(entry.tempC)+'°';
  const look=weatherLook(entry);
  document.getElementById('home-weather-icon').textContent=look[0];
  // On the sample reading the tappable label states what tapping does, rather than the
  // condition — the icon already carries that, and an unexplained city is the confusing part.
  const labelEl=document.getElementById('home-weather-label');
  labelEl.textContent=entry.placeholder?'Tap for your weather':look[1];
  labelEl.classList.toggle('weather-cta',!!entry.placeholder);
  const cityEl=document.getElementById('home-weather-city');
  if(cityEl) cityEl.textContent=entry.placeholder?(entry.city||'Sydney')+' · sample':(entry.city||'');
  // Feels-like is only worth showing when it actually differs from the real temperature —
  // repeating the same number twice reads as a bug, not a detail.
  const metaEl=document.getElementById('home-weather-meta');
  if(metaEl){
    const bits=[];
    if(entry.feelsC!=null&&Math.round(entry.feelsC)!==Math.round(entry.tempC)) bits.push('Feels '+Math.round(entry.feelsC)+'°');
    if(entry.tmax!=null&&entry.tmin!=null) bits.push('H '+Math.round(entry.tmax)+'°  L '+Math.round(entry.tmin)+'°');
    metaEl.textContent=bits.join('   ·   ');
  }
  const card=document.querySelector('.home-weather-card');
  if(card){
    card.dataset.scene=weatherScene(entry.code,entry);
    applyWeatherMotion(card,entry);
  }
  // In weather mode the accent follows the sky, so a new reading has to repaint it.
  if(accentMode()==='weather' && typeof applyDayColour==='function') applyDayColour();
}
// First-ever load (no cache yet): show an explicit "tap for weather" invite instead of
// popping the OS location prompt unasked — Home is where most sessions land first, and an
// unprompted permission dialog there is a bad first impression. Once granted, the browser
// won't re-prompt, so every later call is a silent refresh via loadWeatherWidget(true)
// (the label's own tap) or the auto-refresh at the bottom of renderHome().
function renderWeatherPrompt(){
  const labelEl=document.getElementById('home-weather-label'); if(!labelEl) return;
  document.getElementById('home-weather-temp').textContent='';
  document.getElementById('home-weather-icon').textContent='📍';
  labelEl.textContent='Tap for weather';
  setWeatherPlaceholderScene();
}
function renderWeatherError(denied){
  const labelEl=document.getElementById('home-weather-label'); if(!labelEl) return;
  document.getElementById('home-weather-temp').textContent='';
  document.getElementById('home-weather-icon').textContent='📍';
  labelEl.textContent=denied?'Enable location for weather':'Couldn\'t load weather — tap to retry';
  setWeatherPlaceholderScene();
}
// Both no-data states share the clock-based sky; without this they kept whatever scene was
// already on the card, which on a cold start is the daytime placeholder gradient.
function setWeatherPlaceholderScene(){
  const card=document.querySelector('.home-weather-card');
  if(card) card.dataset.scene=weatherPlaceholderScene();
}
// One place that turns coordinates into a reading, so the sample city, the saved-coordinate
// refresh and the real geolocation path all build an identical entry.
function fetchWeatherAt(lat,lon){
  return fetch('https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+
        '&current=temperature_2m,apparent_temperature,weather_code,is_day,cloud_cover,wind_speed_10m,wind_direction_10m'+
        '&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&forecast_days=1&timezone=auto')
    .then(r=>r.json())
    .then(data=>{
      const c=data&&data.current;
      if(!c||c.temperature_2m==null) throw new Error('no current-weather block');
      const d=(data&&data.daily)||{};
      const first=a=>Array.isArray(a)&&a.length?a[0]:null;
      return {lat,lon,tempC:c.temperature_2m,feelsC:c.apparent_temperature,
        code:c.weather_code,isDay:c.is_day,cloud:c.cloud_cover,
        wind:c.wind_speed_10m,windDir:c.wind_direction_10m,
        tmax:first(d.temperature_2m_max),tmin:first(d.temperature_2m_min),
        sunrise:first(d.sunrise),sunset:first(d.sunset),
        city:weatherCityFromTz(data&&data.timezone),
        fetchedAt:Date.now()};
    });
}
function loadWeatherWidget(userInitiated){
  const cache=loadWeatherCache();
  if(cache) renderWeatherInto(cache);
  if(_weatherLoading) return;
  const fresh=cache && (Date.now()-cache.fetchedAt<WEATHER_STALE_MS);
  const haveRealLocation=cache && !cache.placeholder && cache.lat!=null;

  // Tapping the card while it's showing the sample means "use my location" — the only path
  // that touches geolocation, so the OS dialog only ever appears in response to a tap.
  if(userInitiated && !haveRealLocation){ requestRealLocationWeather(); return; }
  if(fresh) return;

  // We already know where they are, so refresh straight from the stored coordinates. This is
  // what stops iOS asking on every launch: getCurrentPosition() is never called on a routine
  // refresh, and a browser can only prompt when we actually ask it where we are.
  if(haveRealLocation){
    _weatherLoading=true;
    fetchWeatherAt(cache.lat,cache.lon)
      .then(e=>{ saveWeatherCache(e); renderWeatherInto(e); })
      .catch(()=>{})   // keep the last good reading rather than blanking the card
      .finally(()=>{ _weatherLoading=false; });
    return;
  }

  // No location yet: show a real reading for the sample city so the card looks finished
  // instead of empty, with the label inviting them to switch to their own.
  _weatherLoading=true;
  fetchWeatherAt(WEATHER_SAMPLE_LOC.lat,WEATHER_SAMPLE_LOC.lon)
    .then(e=>{ e.city=WEATHER_SAMPLE_LOC.city; e.placeholder=true; saveWeatherCache(e); renderWeatherInto(e); })
    .catch(()=>renderWeatherError(false))
    .finally(()=>{ _weatherLoading=false; });
}
function requestRealLocationWeather(){
  if(!navigator.geolocation){ renderWeatherError(false); return; }
  _weatherLoading=true;
  navigator.geolocation.getCurrentPosition(
    pos=>{
      const {latitude:lat,longitude:lon}=pos.coords;
      fetchWeatherAt(lat,lon)
        .then(e=>{ saveWeatherCache(e); renderWeatherInto(e); })
        .catch(()=>renderWeatherError(false))
        .finally(()=>{ _weatherLoading=false; });
    },
    err=>{
      _weatherLoading=false;
      // Denied or unavailable: fall back to the sample card rather than an empty one, so
      // declining location still leaves something readable (and still re-offerable).
      const c=loadWeatherCache();
      if(c) renderWeatherInto(c); else renderWeatherError(err&&err.code===1);
    },
    // A long maximumAge lets the browser answer from a position it already has instead of
    // starting a fresh GPS fix, which is both quicker and less likely to re-prompt.
    {maximumAge:6*60*60*1000, timeout:10000}
  );
}
// Fixed set of decorative layers for every possible scene, shown/hidden per
// .home-weather-card[data-scene] in CSS — cheaper and simpler than swapping markup per
// condition, since it's just one attribute write in renderWeatherInto(). Stars/snow use a
// handful of individually-delayed elements rather than a repeating background pattern so
// they read as scattered/organic instead of a visible grid.
function buildWeatherCard(){
  const d=localMidnight(getLocalDate());
  const dayLabel=d.toLocaleDateString('en-AU',{weekday:'long'});
  const dateLabel=d.toLocaleDateString('en-AU',{day:'numeric',month:'long'});
  const stars=Array.from({length:5},(_,i)=>'<div class="wfx-star wfx-star-'+(i+1)+'"></div>').join('');
  const flakes=Array.from({length:6},(_,i)=>'<div class="wfx-flake wfx-flake-'+(i+1)+'"></div>').join('');
  const drops=Array.from({length:6},(_,i)=>'<div class="wfx-drop wfx-drop-'+(i+1)+'"></div>').join('');
  // Built with the clock-based sky already applied so a cold start paints the right time of
  // day immediately, instead of flashing the daytime placeholder before any render runs.
  return '<div class="card home-weather-card" data-scene="'+weatherPlaceholderScene()+'">'+
    '<div class="weather-fx" aria-hidden="true">'+
      '<div class="wfx-sun"></div>'+
      '<div class="wfx-moon"></div>'+
      '<div class="wfx-stars">'+stars+'</div>'+
      '<div class="wfx-cloud wfx-cloud-1"></div>'+
      '<div class="wfx-cloud wfx-cloud-2"></div>'+
      '<div class="wfx-cloud wfx-cloud-3"></div>'+
      '<div class="wfx-fog wfx-fog-1"></div>'+
      '<div class="wfx-fog wfx-fog-2"></div>'+
      '<div class="wfx-rain">'+drops+'</div>'+
      '<div class="wfx-snow">'+flakes+'</div>'+
      '<div class="wfx-flash"></div>'+
    '</div>'+
    '<div class="weather-content">'+
      '<div class="weather-left">'+
        '<div class="weather-city" id="home-weather-city"></div>'+
        '<div class="weather-day">'+dayLabel+'</div>'+
        '<div class="weather-date">'+dateLabel+'</div>'+
      '</div>'+
      '<div class="weather-right">'+
        '<div class="weather-temp-row">'+
          '<span class="weather-icon" id="home-weather-icon"></span>'+
          '<span class="weather-temp" id="home-weather-temp"></span>'+
        '</div>'+
        '<div class="weather-condition" id="home-weather-label" onclick="loadWeatherWidget(true)">Loading…</div>'+
        '<div class="weather-meta" id="home-weather-meta"></div>'+
      '</div>'+
    '</div>'+
  '</div>';
}
// ── Credit card tracker (Home card + Budget input) ───────────────
function loadCCData(){ return lsLoad('daily_cc', {}); }
function saveCCData(d){ lsSave('daily_cc', d, 'creditCard'); }
function renderCCCard(){
  const d=loadCCData();
  const balance=parseFloat(d.balance)||0;
  const balEl=document.getElementById('home-cc-balance');
  if(balEl) balEl.textContent='$'+balance.toFixed(0);

  // Due date — exactly the date the user set (YYYY-MM-DD), or legacy ISO. No auto-guessing.
  let due=null;
  if(d.dueDate){ const s=String(d.dueDate); due=new Date(s.length<=10?s+'T12:00:00':s); if(isNaN(due.getTime())) due=null; }
  const dueEl=document.getElementById('home-cc-due');
  if(dueEl){
    if(due){
      const overdue = due < new Date(getLocalDate()+'T12:00:00');
      dueEl.textContent=(overdue?'Overdue · ':'Due ')+due.toLocaleDateString('en-AU',{day:'numeric',month:'short'});
      dueEl.style.color = overdue ? 'var(--danger)' : '';
    } else {
      dueEl.textContent='Set due date in Budget';
      dueEl.style.color='';
    }
  }

  // Covered if the current savings balance covers what's owed on the card
  const savings=savingsLog.length?(parseFloat(savingsLog[savingsLog.length-1].balance)||0):0;
  const statusEl=document.getElementById('home-cc-status');
  if(statusEl){
    if(balance>0){
      const covered=savings>=balance;
      statusEl.textContent=covered?'✓ Covered':'⚠ Check funds';
      statusEl.className='home-cc-status '+(covered?'covered':'at-risk');
      statusEl.style.display='inline-block';
    } else {
      statusEl.textContent=''; statusEl.className='home-cc-status'; statusEl.style.display='none';
    }
  }
}
function updateCCBalance(){
  const val=parseFloat(document.getElementById('cc-balance-input')?.value)||0;
  const d=loadCCData();
  d.balance=val;            // due date is set explicitly via the date field — never auto-guessed
  saveCCData(d);
  recordCCHistory(val);     // dated history feeds the Finance net-worth trend
  renderCCCard();
}
function updateCCDue(){
  const v=document.getElementById('cc-due-input')?.value||'';
  const d=loadCCData();
  if(v) d.dueDate=v; else delete d.dueDate;
  saveCCData(d);
  renderCCCard();
}
// ── Budget tab: credit-card row (tap to expand → edit balance + repayment due) ──
let ccEditing=false;
function ccDueText(d){
  if(!d||!d.dueDate) return 'Set repayment date';
  const s=String(d.dueDate); const due=new Date(s.length<=10?s+'T12:00:00':s);
  if(isNaN(due.getTime())) return 'Set repayment date';
  const overdue = due < new Date(getLocalDate()+'T12:00:00');
  return (overdue?'Overdue · ':'Due ')+due.toLocaleDateString('en-AU',{day:'numeric',month:'short'});
}
function ccToggleEdit(){
  ccEditing=!ccEditing;
  renderCCRow();
  if(ccEditing) setTimeout(()=>document.getElementById('cc-balance-input')?.focus(),60);
}
function renderCCRow(){
  const block=document.getElementById('cc-card-block'); if(!block) return;
  const d=loadCCData();
  const balance=parseFloat(d.balance)||0;
  const dueTxt=ccDueText(d);
  const overdue=dueTxt.indexOf('Overdue')===0;
  if(!ccEditing){
    block.innerHTML=
      '<div class="bud-row cc-row" onclick="ccToggleEdit()" style="cursor:pointer">'+
        '<div class="bud-row-left">'+
          '<div class="bud-row-name">💳 Card balance owed</div>'+
          '<div class="bud-row-budget"'+(overdue?' style="color:var(--danger)"':'')+'>'+dueTxt+'</div>'+
        '</div>'+
        '<div class="bud-row-calc" style="color:var(--text)">$'+balance.toFixed(0)+'</div>'+
      '</div>';
  } else {
    const dueVal = d.dueDate ? String(d.dueDate).slice(0,10) : '';
    block.innerHTML=
      '<div class="bud-row cc-row">'+
        '<div class="bud-row-name" onclick="ccToggleEdit()" style="cursor:pointer">💳 Card balance owed</div>'+
        '<input class="bud-row-input" type="number" inputmode="decimal" placeholder="$0" id="cc-balance-input" value="'+(d.balance!==undefined&&d.balance!==''?d.balance:'')+'" oninput="updateCCBalance()">'+
      '</div>'+
      '<div class="bud-row cc-row">'+
        '<div class="bud-row-name" style="font-weight:500;color:var(--muted)">Repayment due</div>'+
        '<input class="bud-row-input" type="date" id="cc-due-input" value="'+dueVal+'" onchange="updateCCDue()" style="width:150px">'+
      '</div>'+
      '<p style="font-size:12px;color:var(--muted);line-height:1.45;margin:8px 0 2px">'+
        'This is how much is currently owed on the card. Purchases made on the card still go '+
        'into the Variable categories above, same as cash — this balance is a separate running '+
        'debt total and isn’t counted again in the weekly leftover.</p>';
  }
}
// Card balance + other debts now live in the Accounts page (the single source of truth for
// net worth). Replace the old inline CC editor with a link there so there's no parallel store.
function loadCCInput(){
  const block=document.getElementById('cc-card-block'); if(!block) return;
  const debts=accountsDebtsTotal();
  block.innerHTML=
    '<div class="bud-row cc-row" onclick="openAccounts()" style="cursor:pointer">'+
      '<div class="bud-row-left">'+
        '<div class="bud-row-name">💳 Cards &amp; debts</div>'+
        '<div class="bud-row-budget">Managed in Accounts →</div>'+
      '</div>'+
      '<div class="bud-row-calc" style="color:var(--text)">'+(accounts.length?fmtMoney(debts):'—')+'</div>'+
    '</div>';
}

function daysUntil(targetDay,today){
  const nowDay=new Date(today+'T12:00:00').getDay();
  let diff=(targetDay-nowDay+7)%7;
  return diff===0?'Today! 🎉':'in '+diff+' day'+(diff===1?'':'s');
}
// ── Card chrome ───────────────────────────────────────────────────
// A small line-icon set for card headers, in one visual family with the sidebar's icons
// (24px grid, currentColor stroke, round caps) — so a card header stops being an emoji sitting
// a few hundred pixels from a clean icon set. Emoji ignore currentColor, so they can never
// follow the theme or the accent, and they render as a different picture per OS.
// Chrome only. Emoji the USER typed (note titles, recipe names, the per-subscription emoji
// field) are content and are left alone.
const CARD_ICONS={
  wallet:'<path d="M17 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6"/><circle cx="16.5" cy="13.5" r="1.1"/>',
  bank:'<path d="M3 21h18M5 10v11M19 10v11M9.5 10v11M14.5 10v11M4 10h16L12 4z"/>',
  scale:'<path d="M12 4v16M7 20h10M4 7h16M7 7l-3 6a3 3 0 0 0 6 0zM17 7l-3 6a3 3 0 0 0 6 0z"/>',
  trophy:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H5a2 2 0 0 0 0 4h2M17 6h2a2 2 0 0 1 0 4h-2"/>',
  check:'<path d="M9 12l2 2 4-4M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/>',
  note:'<path d="M14 3v5h5M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/>',
  pot:'<path d="M5 10h14v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM3 10h18M8 10V7a4 4 0 0 1 8 0v3"/>',
  calendar:'<path d="M8 3v3M16 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
  flame:'<path d="M12 3c3 4 6 5.5 6 9a6 6 0 0 1-12 0c0-2 1-3.5 2.5-5 .3 1.2 1 2 2 2.2C10 7 11 4.6 12 3z"/>'
};
function cardIcon(name){
  const d=CARD_ICONS[name];
  return d ? '<svg class="card-hd-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>' : '';
}
// One header for every rebuilt card: icon + label on the left, an optional pill or action on
// the right. rightHtml is raw so a card can pass either.
function cardHeader(icon,label,rightHtml){
  return '<div class="card-hd"><div class="card-hd-l">'+cardIcon(icon)+
    '<span class="card-label">'+label+'</span></div>'+(rightHtml||'')+'</div>';
}
// Inline SVG sparkline — one path, no axes, no labels, no library. Chart.js is loaded but a
// 40px trend line inside a card wants a shape, not a chart: axes and tooltips at this size are
// noise, and a hand-rolled path costs nothing and scales with the card.
// preserveAspectRatio="none" so the path stretches to whatever width the card gives it while
// keeping its stroke crisp (vector-effect), which is what lets it act as a .card-shape stretch
// zone on desktop.
function sparkline(vals,opts){
  const o=opts||{};
  const h=o.height||40, col=o.color||'var(--accent-text)', W=100;
  const pts=(vals||[]).filter(v=>typeof v==='number'&&isFinite(v));
  if(pts.length<2) return '';
  let min=Math.min(...pts), max=Math.max(...pts);
  if(o.target!=null){ min=Math.min(min,o.target); max=Math.max(max,o.target); }
  const pad=(max-min)*0.12||1;
  min-=pad; max+=pad;
  const x=i=>(i/(pts.length-1)*W).toFixed(2);
  const y=v=>(h-((v-min)/(max-min))*h).toFixed(2);
  const d=pts.map((v,i)=>(i?'L':'M')+x(i)+' '+y(v)).join(' ');
  const tgt=o.target!=null
    ? '<line x1="0" y1="'+y(o.target)+'" x2="'+W+'" y2="'+y(o.target)+'" stroke="var(--text-3)" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>'
    : '';
  // Last point marked so "where am I now" is findable without reading the whole line.
  const last='<circle cx="'+x(pts.length-1)+'" cy="'+y(pts[pts.length-1])+'" r="2.5" fill="'+col+'" vector-effect="non-scaling-stroke"/>';
  return '<svg class="card-spark" viewBox="0 0 '+W+' '+h+'" preserveAspectRatio="none" aria-hidden="true">'+
    tgt+'<path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>'+
    last+'</svg>';
}
// Seven-day calorie strip for the overview card. daily_cal_history is a flat {date: total}
// map that was stored, synced, and never shown on Home — the card only ever knew about today,
// so "0 / 3,062" on a Sunday evening read as failure rather than as a Sunday.
// Folded into the existing card rather than shipped as a separate widget: one card showing
// today AND the week beats two cards each showing half of it.
function calorieWeekStrip(goalCals,todayTotal){
  const today=getLocalDate(), t0=localMidnight(today).getTime();
  const days=[];
  for(let i=6;i>=0;i--){
    const d=dateStr(new Date(t0-i*864e5));
    days.push({d, v: d===today ? todayTotal : (parseFloat((calorieHistory||{})[d])||0)});
  }
  const logged=days.filter(x=>x.v>0);
  // Under three logged days the chart is mostly gaps, which reads as broken rather than as
  // "not much history yet" — better to show nothing at all.
  if(logged.length<3) return '';
  const avg=Math.round(logged.reduce((a,b)=>a+b.v,0)/logged.length);
  const max=Math.max(goalCals||0, ...days.map(x=>x.v))*1.08||1;
  const bars=days.map(x=>
    '<div class="cw-col"><div class="cw-bar'+(x.d===today?' cw-today':'')+(x.v?'':' cw-empty')+
    '" style="height:'+Math.min(100,x.v/max*100).toFixed(1)+'%"></div></div>').join('');
  return '<div class="cal-week">'+
      (goalCals?'<div class="cw-target" style="bottom:'+(goalCals/max*100).toFixed(1)+'%"></div>':'')+
      bars+
    '</div>'+
    '<div class="card-cap">7-day avg '+avg.toLocaleString()+(goalCals?' · target '+goalCals.toLocaleString():'')+'</div>';
}
function homeHeroContent(goalCals,kcalTotal,budLeft,budPillCls,budPillTxt){
  if(goalCals){
    const pct=Math.min(100,Math.round(kcalTotal/goalCals*100));
    const rem=goalCals-kcalTotal;
    const ringCol=rem<0?'var(--danger)':pct>80?'var(--warn)':'var(--success)';
    const R=44,circ=+(2*Math.PI*R).toFixed(1),offset=+(circ*(1-pct/100)).toFixed(1);
    // Breakfast / lunch / dinner totals, replacing the greeting that used to sit above the
    // ring. The per-meal category is already recorded on every entry (MEAL_CATS), it just
    // was never surfaced here — so this is a read, not new tracking.
    const byMeal={breakfast:0,lunch:0,dinner:0};
    ((S.dailyLog&&S.dailyLog.entries)||[]).forEach(e=>{
      if(byMeal[e.category]!==undefined) byMeal[e.category]+=parseFloat(e.kcal)||0;
    });
    const mealRows=[['B','breakfast'],['L','lunch'],['D','dinner']].map(([initial,id])=>{
      const v=Math.round(byMeal[id]);
      return '<div class="hh-meal">'+
        '<span class="hh-meal-key">'+initial+'</span>'+
        '<span class="hh-meal-val'+(v?'':' hh-meal-empty')+'">'+(v?v:'—')+'</span>'+
      '</div>';
    }).join('');
    return (
      '<div class="hh-row">'+
      '<div class="hh-meals">'+mealRows+'</div>'+
      '<svg width="110" height="110" viewBox="0 0 110 110" style="flex-shrink:0">'+
        '<circle cx="55" cy="55" r="'+R+'" fill="none" stroke="var(--border)" stroke-width="9"/>'+
        '<circle cx="55" cy="55" r="'+R+'" fill="none" stroke="'+ringCol+'" stroke-width="9"'+
        ' stroke-dasharray="'+circ+'" stroke-dashoffset="'+offset+'"'+
        ' stroke-linecap="round" transform="rotate(-90 55 55)"/>'+
        '<text x="55" y="52" text-anchor="middle" dominant-baseline="middle" font-size="19" font-weight="800" fill="var(--text)">'+kcalTotal+'</text>'+
        '<text x="55" y="67" text-anchor="middle" font-size="10" fill="var(--muted)">eaten</text>'+
      '</svg>'+
      '<div class="hh-remain">'+
        '<div style="font-size:30px;font-weight:700;letter-spacing:-1px;color:'+ringCol+';line-height:1">'+(rem>=0?rem:Math.abs(rem))+'</div>'+
        '<div style="font-size:12px;color:var(--muted);margin-bottom:6px">'+(rem>=0?'kcal remaining':'kcal over target')+'</div>'+
        '<div style="font-size:11px;font-weight:600;color:var(--muted)">Goal: '+goalCals+' kcal</div>'+
      '</div>'+
      '</div>'+
      calorieWeekStrip(goalCals,kcalTotal));
  } else if(budLeft!==null){
    const col=budLeft>=0?'var(--success)':'var(--danger)';
    return (
      '<div style="text-align:center;padding:14px 0">'+
        '<div style="font-size:30px;font-weight:700;letter-spacing:-1px;color:'+col+';line-height:1;margin-bottom:6px">'+(budLeft>=0?'+$':'-$')+Math.abs(budLeft).toFixed(0)+'</div>'+
        '<div style="font-size:13px;color:var(--muted);margin-bottom:10px">This week\'s leftover</div>'+
        '<span class="status-pill '+budPillCls+'">'+budPillTxt+'</span>'+
      '</div>');
  } else {
    return '<div style="text-align:center;padding:14px 0;font-size:13px;color:var(--muted)">Set up your profile to see calorie targets</div>';
  }
}
function homeSavingsInner(){
  const last8=savingsLog.slice(-8);
  if(last8.length){
    const latest=last8[last8.length-1];
    const diffDays=Math.floor((new Date()-new Date(latest.date))/(864e5));
    const ago=diffDays===0?'today':diffDays===1?'yesterday':diffDays+' days ago';
    const vals=last8.map(e=>e.balance);
    const maxV=Math.max(...vals),minV=Math.min(...vals),range=maxV-minV||maxV||1;
    const bars=last8.map((e,i)=>{
      const prev=i>0?last8[i-1].balance:e.balance;
      const col=e.balance<prev?'var(--danger)':'var(--success)';
      const h=Math.max(8,Math.round(((e.balance-minV)/range)*36+8));
      return '<div style="flex:1;display:flex;align-items:flex-end;padding:0 1px"><div style="width:100%;height:'+h+'px;background:'+col+';border-radius:2px 2px 0 0;opacity:0.85"></div></div>';
    }).join('');
    return (
      '<div style="display:flex;justify-content:space-between;align-items:flex-end">'+
        '<div>'+
          '<div style="font-size:22px;font-weight:800">$'+latest.balance.toLocaleString()+'</div>'+
          '<div style="font-size:11px;color:var(--muted)">Updated '+ago+'</div>'+
        '</div>'+
        '<button class="sav-update-btn" onclick="event.stopPropagation();updateSavingsBalance()">Update</button>'+
      '</div>'+
      '<div style="display:flex;align-items:flex-end;height:40px;gap:2px;margin-top:8px">'+bars+'</div>');
  } else {
    return (
      '<div style="display:flex;justify-content:space-between;align-items:center">'+
        '<div style="font-size:22px;font-weight:800;color:var(--muted)">$—</div>'+
        '<button class="sav-update-btn" onclick="event.stopPropagation();updateSavingsBalance()">Update</button>'+
      '</div>'+
      '<div style="font-size:11px;color:var(--muted);margin-top:4px">No balance logged</div>');
  }
}

function renderHome(){
  const wrap=document.getElementById('home-content'); if(!wrap) return;
  const name=profileData.name||S.personalInfo.name||'';

  // Calories
  const today=getLocalDate();
  if(S.dailyLog.date!==today){ S.dailyLog={date:today,entries:[]}; persistDailyLog(); }
  const c=calcGoalCals();
  const goalCals=c?(c.goal==='cut'?c.cut:c.goal==='bulk'?c.bulk:c.maintain):null;
  const kcalTotal=S.dailyLog.entries.reduce((a,e)=>a+e.kcal,0);

  // Budget leftover — from the CURRENT WEEK's saved data (same accessors as the Budget
  // tab: weekIncome / weekLeftover) so Home always matches what the Budget tab shows.
  let budLeft=null,budPillCls='good',budPillTxt='';
  const curWk=budgetData[weekKey(getMondayOf(0))];
  const incTot=curWk?weekIncome(curWk):0;
  if(incTot>0){
    budLeft=weekLeftover(curWk);
    budPillCls=budLeft>=50?'good':budLeft>=0?'warn':'over';
    // The .status-pill class already carries the state colour, so the emoji was saying the
    // same thing a second time in a way that can't follow the theme.
    budPillTxt=budLeft>=50?'On track':budLeft>=0?'Tight':'Over';
  }

  const heroContent=homeHeroContent(goalCals,kcalTotal,budLeft,budPillCls,budPillTxt);

  // Workout streak (consecutive days with logged sessions)
  const sessDates=[...new Set(S.sessions.map(s=>s.date))].sort();
  let wStreak=0;
  const dw=localMidnight(getLocalDate());
  while(true){ const ds=dateStr(dw); if(sessDates.includes(ds)){wStreak++;dw.setDate(dw.getDate()-1);}else break; }

  // Check-in streak
  const {current:ciStreak}=calcStreak();

  // This week's saved amount (the weekly-savings target was removed) + next workout
  const thisWeekSaved=Math.round(weekSavedAmt(budgetData[weekKey(getMondayOf(0))]||{}));
  const nextIdx=suggestDay();
  const nextType=type(nextIdx);
  const dayNum=nextIdx+1;

  // Pay day countdown tiles — one per named income source (loadIncCats), no hardcoded names.
  // Cells of the money card (see quickTiles) rather than free-floating mini-cards.
  const payDayTiles=loadIncCats()
    .filter(c=>(c.name||'').trim())
    .map(c=>{
      const str=daysUntil(getPayDay(c.id),today);
      const nm=_catEscHtml(c.name.trim());
      const soon=str==='Today! 🎉';
      return '<div class="mt-cell"><div class="mt-val'+(soon?' mt-val-sm':' mt-val-sm')+'" style="color:'+
        (soon?'var(--accent-text)':'var(--text)')+'">'+str+'</div>'+
        '<div class="mt-lbl">'+nm+' pay</div></div>';
    }).join('');

  // Last week's total pay (sum of income sources recorded for the previous budget week)
  const lastWk=budgetData[weekKey(getMondayOf(-1))];
  const lastWeekPay=lastWk?weekIncome(lastWk):0;

  const heroHdrCol=goalCals?'#52B788':budLeft!==null?'#FF6B35':'#64748b';
  const heroHdrTxt=goalCals?'Calorie progress':budLeft!==null?'Budget summary':'Overview';
  const heroHdrIcon=goalCals?'flame':budLeft!==null?'wallet':'check';

  // ── Momentum redesign: top-of-Home cards (display only; reuse existing data) ──
  const mCurType=type(S.dayIdx);
  const mExCount=mCurType.exercises.length;
  const mDone=S.checked.size;
  const mPct=mExCount?Math.round(mDone/mExCount*100):0;
  const mGoal=6;
  const mMon=getMondayOf(0);
  const mSessions=[...new Set(S.sessions.filter(s=>localMidnight(s.date)>=mMon).map(s=>s.date))].length;
  let mSegs=''; for(let i=0;i<mGoal;i++){ mSegs+='<div class="session-seg'+(i<mSessions?' done':'')+'"></div>'; }
  const mBudIncome=incTot>0?incTot:0;
  const mBudRem=incTot>0?budLeft:0;
  const mBudSpent=incTot>0?(incTot-budLeft):0;
  const mBudPct=mBudIncome>0?Math.min(mBudSpent/mBudIncome*100,100):0;
  const mBudOver=mBudRem<0;
  const mBudCol=mBudOver?'var(--danger)':'var(--positive)';
  const heroDateLabel=localMidnight(today).toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'});
  const heroCard=
    '<div class="hero-workout-card">'+
      '<div class="hero-top">'+
        '<span class="hero-label">TODAY\'S SESSION · '+heroDateLabel+'</span>'+
        '<button class="hero-play-btn" aria-label="Go to workout" onclick="setView(\'log\')">'+
          '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M5 3.5l10 5.5-10 5.5V3.5z" fill="currentColor"/></svg>'+
        '</button>'+
      '</div>'+
      '<p class="hero-workout-title" id="hero-day-name">'+mCurType.name+'</p>'+
      '<p class="hero-meta" id="hero-meta">'+mExCount+' exercise'+(mExCount!==1?'s':'')+'</p>'+
      '<div class="hero-progress-row">'+
        '<span class="hero-progress-text" id="hero-progress-text">'+mDone+' of '+mExCount+' done</span>'+
        '<span class="hero-progress-pct" id="hero-progress-pct">'+mPct+'%</span>'+
      '</div>'+
      '<div class="hero-progress-track"><div class="hero-progress-fill" id="hero-progress-fill" style="width:'+mPct+'%;"></div></div>'+
    '</div>';
  const statsSplit=
    '<div class="card stats-split-card">'+
      '<div class="stats-left">'+
        '<p class="card-label">Streak</p>'+
        '<p class="metric-num" id="home-streak">'+wStreak+'</p>'+
        '<p class="metric-unit">days</p>'+
      '</div>'+
      '<div class="stats-divider"></div>'+
      '<div class="stats-right">'+
        '<p class="card-label">This week</p>'+
        '<p class="metric-num" id="home-sessions">'+mSessions+' <span class="metric-unit">of '+mGoal+'</span></p>'+
        '<div class="sessions-bar-row" id="home-sessions-bar">'+mSegs+'</div>'+
      '</div>'+
    '</div>';
  // ── Weekly budget ──
  // No longer an accent-gradient hero. It used the same 90%→35% accent gradient, white text and
  // glow as the session hero, so the two were indistinguishable in peripheral vision — and a
  // budget readout is not an action the way "start today's session" is. Full accent now means
  // "press this", and only the session card gets it.
  // Its colour is SEMANTIC instead: --positive / --warn / --danger on the pill and the bar fill.
  // That survives the accent being any hue (grey, indigo or bright blue depending on
  // weather/settings), and green-vs-red answers the question before you read the number.
  const budGoal=getWeekVarGoal(curWk);
  const budVarSpent=curWk?weekVarTotal(curWk):0;
  // The bar tracks VARIABLE spending against the weekly goal, not total spend against income,
  // because variable spend is the half that accrues day by day and the half still in your
  // control. Total spend can't be paced — a fixed cost lands in one lump, so a pace marker
  // against income would read "behind" every week the rent came out.
  const budHasGoal=budGoal!==null&&budGoal>0;
  const budVarPct=budHasGoal?budVarSpent/budGoal*100:0;
  const budBarPct=budHasGoal?Math.min(budVarPct,100):mBudPct;
  // Days elapsed this week including today (Mon=1 … Sun=7). varGoalDaysLeft() counts days
  // REMAINING, so elapsed is 8 minus that.
  const budPacePct=budHasGoal?Math.round((8-varGoalDaysLeft())/7*100):null;
  const budBehind=budHasGoal&&budVarPct>budPacePct+2;
  const budOverGoal=budHasGoal&&budVarSpent>budGoal;
  const budBarCol=(budHasGoal?budOverGoal:mBudOver)?'var(--danger)':budBehind?'#f59e0b':'var(--positive)';
  const budPillTxt2=mBudOver?'Over budget':budBehind?'Spending fast':'On track';
  const budPillCls2=mBudOver?' over':budBehind?' warn':'';
  const budCaption=budHasGoal
    ? fmtMoney(budVarSpent)+' of '+fmtMoney(budGoal)+' spending goal · '+(budBehind?'ahead of pace':'on pace')
    : (mBudIncome>0?'Set a weekly spending goal to track pace':'');
  const budgetSnapshot=
    '<div class="card budget-snapshot-card" onclick="setView(\'budget\')" style="cursor:pointer">'+
      cardHeader('wallet','Weekly budget',
        '<span class="budget-snap-pill'+budPillCls2+'" id="home-bud-status">'+budPillTxt2+'</span>')+
      '<div><span class="card-fig" id="home-bud-remaining" style="color:'+(mBudOver?'var(--danger)':'var(--text)')+'">'+
        (mBudRem>=0?'':'-')+fmtMoney(Math.abs(Math.round(mBudRem)))+'</span>'+
        '<span class="card-fig-u" id="home-bud-label">left of '+fmtMoney(Math.round(mBudIncome))+'</span></div>'+
      '<div class="card-bar">'+
        '<div class="card-bar-fill" id="home-bud-bar" style="width:'+budBarPct+'%;background:'+budBarCol+'"></div>'+
        (budPacePct!==null?'<div class="card-bar-pace" style="left:calc('+budPacePct+'% - 1px)" title="Where you should be today"></div>':'')+
      '</div>'+
      (budCaption?'<div class="card-cap">'+budCaption+'</div>':'')+
    '</div>';

  // Calorie / overview card
  const overviewCard=
    '<div class="card hero-card"'+(goalCals?' onclick="openCalorieOverlay()"':'')+' style="margin-bottom:12px;padding:0;overflow:hidden'+(goalCals?';cursor:pointer':'')+'">'+
      // Shared header, replacing another inline copy of the 11px/600/uppercase declaration.
      '<div style="padding:16px 16px 0">'+cardHeader(heroHdrIcon,heroHdrTxt)+'</div>'+
      // Greeting removed: it repeated the time of day the app already shows and pushed the
      // figures down. The meal totals now occupy that side of the card instead.
      '<div class="overview-content" style="padding:14px 16px">'+
        heroContent+
      '</div>'+
    '</div>';

  // Net Worth & Accounts widget (daily_accounts): total balance, per-account list
  // (tap to expand/collapse), net worth, and any tracked statement debt + due date.
  const _nw=accountsNetWorth(), _assets=accountsAssetsTotal(), _debts=accountsDebtsTotal();
  const _acctRows=accounts.map(a=>{
    const isD=a&&a.type==='debt';
    const util=(typeof acctUtilisation==='function')?acctUtilisation(a):null;
    const cat=(typeof acctCategoryLabel==='function')?acctCategoryLabel(a):null;
    // Sub-line only when there is something to say — a category, a utilisation figure, or both.
    const sub=[cat, util!==null?util.toFixed(0)+'% of limit':null].filter(Boolean).join(' · ');
    return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">'+
      '<span style="min-width:0"><span style="font-weight:600">'+_catEscHtml(a.name||'')+'</span>'+
        (sub?'<span style="display:block;font-size:11px;font-weight:600;color:'+
          (util!==null?acctUtilColour(util):'var(--muted)')+'">'+sub+'</span>':'')+'</span>'+
      '<span style="font-weight:700;font-family:var(--font-num);flex-shrink:0;color:'+(isD?'var(--danger)':'var(--text)')+'">'+(isD?'−':'')+fmtMoney(parseFloat(a.current)||0)+'</span>'+
    '</div>';
  }).join('');
  const _stmtRows=accounts
    .filter(a=>a&&a.type==='debt'&&a.tracksStatement&&((parseFloat(a.statementBalance)||0)>0||a.dueDate))
    .map(a=>{
      const dueTxt=acctDueText(a);
      return '<div style="font-size:12px;font-weight:600;color:var(--amber-dark);background:var(--amber-bg);border:1px solid var(--amber-border);border-radius:8px;padding:7px 10px;margin-top:8px">'+
        // Icon rather than 💳: inside an amber alert the stroke inherits the row's amber via
        // currentColor, which an emoji cannot do.
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;vertical-align:-2px;margin-right:6px" aria-hidden="true">'+
          '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>'+
        _catEscHtml(a.name||'')+': '+fmtMoney(parseFloat(a.statementBalance)||0)+' this statement'+(dueTxt?' · '+dueTxt:'')+'</div>';
    }).join('');
  // ── Net worth & accounts ──
  // Rebuilt on the shared card anatomy. It was the only Home card with no CSS identity at all —
  // assembled entirely from inline styles, so it had drifted furthest from everything else and
  // drifted further with each edit.
  // Hierarchy is inverted: NET WORTH is the primary figure, not total assets. Assets is the
  // bigger number but not the true one — $2,991 of assets against $2,812 of debts is a $179
  // position, and leading with the flattering figure told you the wrong thing at a glance.
  // The split below it is three-way when a Savers account exists, because "savers" money is
  // ringfenced and is deliberately excluded from the debt-payoff position (see
  // accountsPayoffPosition) — so folding it into one Assets number hides the distinction the
  // account flag exists to make. With no savers account it collapses to two cells rather than
  // rendering a dead $0 column.
  const _savers=accountsSaverTotal();
  const _spendable=_assets-_savers;
  const _splitCell=(label,val,col)=>'<div><div class="card-split-l">'+label+'</div>'+
    '<div class="card-split-v"'+(col?' style="color:'+col+'"':'')+'>'+fmtMoney(val)+'</div></div>';
  const _div='<div class="card-split-div"></div>';
  const _splitHtml=_savers>0
    ? _splitCell('Spendable',_spendable)+_div+_splitCell('Savers',_savers)+_div+_splitCell('Debts',_debts,'var(--danger)')
    : _splitCell('Assets',_assets)+_div+_splitCell('Debts',_debts,'var(--danger)');
  const balanceRow=
    '<div class="card home-networth-card">'+
      cardHeader('bank','Accounts',
        '<span class="card-hd-act" onclick="event.stopPropagation();openAccounts()">Manage →</span>')+
      (accounts.length
        ? '<div><span class="card-fig"'+(_nw<0?' style="color:var(--danger)"':'')+'>'+
            (_nw<0?'-':'')+fmtMoney(Math.abs(_nw))+'</span>'+
            '<span class="card-fig-u">net worth</span></div>'+
          '<div class="card-split">'+_splitHtml+'</div>'+
          // The statement alert moved ABOVE the account list: it is the actionable part of the
          // card and it was sitting below a collapsed section, i.e. last.
          _stmtRows+
          // Expand/collapse the per-account list — same inline toggle idiom as the
          // Recent-workout card; no re-render, so it can't lose scroll position.
          '<div onclick="event.stopPropagation();var d=this.nextElementSibling;var open=d.style.display===\'block\';d.style.display=open?\'none\':\'block\';this.querySelector(\'span\').textContent=open?\'▾\':\'▴\'" '+
            'style="cursor:pointer;font-size:12px;font-weight:700;color:var(--muted);margin-top:12px;display:flex;justify-content:space-between;align-items:center">'+
            accounts.length+' account'+(accounts.length===1?'':'s')+' <span>▾</span></div>'+
          '<div class="home-accts-list" style="display:none;margin-top:4px">'+_acctRows+'</div>'
        : '<div onclick="openAccounts()" style="cursor:pointer;font-size:14px;color:var(--muted)">Tap to add your savings, credit card, or any balance to track net worth.</div>')+
    '</div>';

  // Quick-info tiles (de-duplicated: no streak/next-workout — those live in the cards above)
  // ── Money at a glance ──
  // Was a bare 2-column grid of small .cards with no container of its own — a loose cluster
  // rather than a widget, so it broke the page's vertical rhythm every time you scrolled past
  // it, and its tiles carried their own padding and radius matching nothing else.
  // One card now, with the tiles as cells inside it sharing the card's padding. Emoji dropped:
  // the header icon says "money" once, so repeating 💰/💵/📅 on every cell was decoration that
  // also could not follow the theme.
  const quickTiles=
    '<div class="card" onclick="setView(\'budget\')" style="cursor:pointer">'+
      cardHeader('wallet','This week\'s money')+
      '<div class="mt-grid">'+
        '<div class="mt-cell"><div class="mt-val" style="color:var(--positive)">'+fmtMoney(thisWeekSaved)+'</div>'+
          '<div class="mt-lbl">Saved this week</div></div>'+
        '<div class="mt-cell"><div class="mt-val">'+fmtMoney(Math.round(lastWeekPay))+'</div>'+
          '<div class="mt-lbl">Last week\'s pay</div></div>'+
        payDayTiles+
      '</div>'+
    '</div>';

  // Each card is a draggable unit (data-card-id); assembled in the user's saved order
  // so a reorder survives the next renderHome. (Recent workout + Stats render separately.)
  const homeCards={
    session: heroCard,
    weather: buildWeatherCard(),
    streak: statsSplit,
    calories: overviewCard,
    review: buildWeekSummaryCard(),
    habits: buildTodayHabitsCard(),
    budget: budgetSnapshot,
    balance: balanceRow,
    tiles: quickTiles,
    weight: buildWeightGoalCard(),
    prs: buildPRCard(),
    kitchen: buildKitchenCard(),
    notes: buildHomeNotesCard(),
    recent: buildHomeRecentCard()
  };
  // Ordered + visibility-filtered widget list; skip widgets whose HTML is empty right now
  // (e.g. Recent Workout before any session exists) so edit mode has no invisible boxes.
  const _homeIds=effectiveHomeWidgetIds(homeCards).filter(k=>homeCards[k]);
  // Cards that span both desktop columns are a saved per-card preference now, not a hardcoded
  // list. The class is emitted on every layout but only means anything inside the desktop
  // media query, where the grid lives.
  const _wide=new Set(homeLayout().wide);
  const _cardHtml=k=>'<div class="home-card'+(_wide.has(k)?' home-card-wide':'')+'" data-card-id="'+k+'">'+homeCards[k]+'</div>';
  if(window.innerWidth>=1024){
    // Desktop: ONE grid holding every card in saved order, so visual order == DOM order.
    // This replaced a column-major layout (cards dealt alternately into two flex columns)
    // that packed more tightly but made the visual order unreadable from the DOM — which is
    // why saveHomeOrder() used to refuse to run on desktop and drag-to-reorder was mobile-only.
    // Ordering has to win over packing for reordering to work at all: in a packed/masonry
    // layout a dragged card can't land where it was dropped. The cost is that a short card
    // beside a tall one leaves a gap rather than the columns finishing flush.
    // Weather is no longer pulled out and pinned last — it's an ordinary ordered card.
    wrap.innerHTML='<div class="home-grid-cols">'+_homeIds.map(_cardHtml).join('')+'</div>';
  } else {
    wrap.innerHTML=_homeIds.map(_cardHtml).join('');
  }
  const _oldRecent=document.getElementById('home-recent-card'); if(_oldRecent) _oldRecent.innerHTML='';
  document.querySelectorAll('#view-home .card').forEach((card, i) => {
    card.style.animationDelay = (i * 45) + 'ms';
    card.classList.add('home-card-enter');
    setTimeout(() => card.classList.remove('home-card-enter'), 600 + i * 45);
  });
  if(homeEditMode) applyHomeEditMode();
  applyHomeCardCaps();   // assigns grid spans too

  applyDayColour();
  // Only touch geolocation/network if the widget is actually visible — a hidden card has no
  // #home-weather-temp for the result to land in anyway.
  if(_homeIds.includes('weather')) loadWeatherWidget();
}

// ── Home widget system ────────────────────────────────────────────
// Every Home card is a "widget": it can be toggled off and back on (never deleted — the
// underlying data is untouched) and reordered. The registry tags each widget with its
// related tab for the Settings → Home Layout grouping. `fixed` widgets can't be hidden:
// the Overview card doubles as the app's greeting, so Home is never a fully blank page.
// Settings → Home Layout preview thumbnails. Miniature mock-ups of the real cards (same
// background treatment and layout at reduced scale), so a toggle is recognisably attached to
// the card it controls — the same approach as the onboarding theme picker's mini screens.
// Content is deliberately illustrative placeholder rather than live data: bound to real
// values these would render blank exactly when the user has nothing logged yet, which is
// when they're most likely to be setting their layout up.
function hlPrevSession(){
  return '<div class="hl-prev hl-prev-hero">'+
    '<div class="hl-lbl">Today\'s session · Sat</div>'+
    '<div class="hl-title">Full Body A</div>'+
    '<div class="hl-sub">4 exercises</div>'+
    '<div class="hl-row-between" style="margin-top:7px;font-size:8.5px;font-weight:700;opacity:.85"><span>1 of 4 done</span><span>25%</span></div>'+
    '<div class="hl-bar"><i style="width:25%"></i></div>'+
  '</div>';
}
function hlPrevWeather(){
  return '<div class="hl-prev hl-prev-weather">'+
    '<div class="hl-row-between">'+
      '<div><div style="font-size:13px;font-weight:800">Saturday</div><div class="hl-sub">15 August</div></div>'+
      '<div style="text-align:right">'+
        '<div style="display:flex;align-items:center;gap:4px;justify-content:flex-end">'+
          '<span style="font-size:14px;line-height:1">☀️</span>'+
          '<span class="hl-num">21°</span>'+
        '</div>'+
        '<div class="hl-sub">Clear sky</div>'+
      '</div>'+
    '</div>'+
  '</div>';
}
function hlPrevStreak(){
  const segs=[1,1,1,0,0,0].map(on=>'<i class="'+(on?'on':'')+'"></i>').join('');
  return '<div class="hl-prev hl-prev-plain" style="display:flex;gap:12px">'+
    '<div style="flex:1"><div class="hl-lbl">Streak</div><div class="hl-num" style="margin-top:3px">3</div><div class="hl-sub">days</div></div>'+
    '<div style="width:0.5px;background:var(--border)"></div>'+
    '<div style="flex:1"><div class="hl-lbl">This week</div><div class="hl-num" style="margin-top:3px">3 <span style="font-size:9px;font-weight:600;color:var(--muted)">of 6</span></div>'+
      '<div class="hl-segs">'+segs+'</div></div>'+
  '</div>';
}
function hlPrevReview(){
  const stat=(lbl,val,col)=>'<div><div class="hl-lbl">'+lbl+'</div><div class="hl-num" style="font-size:14px;margin-top:2px'+(col?';color:'+col:'')+'">'+val+'</div></div>';
  const dots=[1,1,0,1,0,0,0].map(on=>'<i class="'+(on?'on':'')+'"></i>').join('');
  return '<div class="hl-prev hl-prev-plain">'+
    '<div class="hl-lbl">📋 Weekly review</div>'+
    '<div class="hl-grid2">'+
      stat('Workouts','3')+stat('Budget','+$120','var(--success)')+
      stat('Cals today','1,840')+stat('Weight Δ','-0.4','var(--success)')+
    '</div>'+
    '<div class="hl-dots">'+dots+'</div>'+
  '</div>';
}
function hlPrevRecent(){
  return '<div class="hl-prev hl-prev-plain">'+
    '<div class="hl-lbl">Recent workout</div>'+
    '<div class="hl-list">'+
      '<div class="hl-li"><i></i>Squat <span style="margin-left:auto;color:var(--muted)">80kg × 5</span></div>'+
      '<div class="hl-li"><i></i>Bench press <span style="margin-left:auto;color:var(--muted)">60kg × 8</span></div>'+
      '<div class="hl-li"><i></i>Barbell row <span style="margin-left:auto;color:var(--muted)">55kg × 8</span></div>'+
    '</div>'+
  '</div>';
}
function hlPrevCalories(){
  // Neutral surface, not accent — .card.hero-card on Home is deliberately a plain card.
  return '<div class="hl-prev hl-prev-plain">'+
    '<div class="hl-lbl">📊 Overview</div>'+
    '<div style="display:flex;align-items:center;gap:9px;margin-top:6px">'+
      '<div class="hl-ring"><i></i></div>'+
      '<div><div style="font-size:11px;font-weight:700;color:var(--text)">Good morning</div>'+
        '<div class="hl-num" style="font-size:14px;color:var(--success);margin-top:2px">640</div>'+
        '<div class="hl-sub">kcal remaining</div></div>'+
    '</div>'+
  '</div>';
}
function hlPrevHabits(){
  const li=(txt,on)=>'<div class="hl-li"><b class="'+(on?'on':'')+'"></b>'+txt+'</div>';
  return '<div class="hl-prev hl-prev-plain">'+
    '<div class="hl-row-between"><div class="hl-lbl">Daily habits</div><div style="font-size:9px;font-weight:700;color:var(--text)">3/5</div></div>'+
    '<div class="hl-list">'+li('Morning workout',1)+li('Hit calorie goal',1)+li('Drink 2L water',0)+'</div>'+
  '</div>';
}
// Plain, not hl-prev-hero, and semantic green rather than white-on-accent — these thumbnails
// are meant to be recognisable miniatures of the real cards, so they track the redesigns.
function hlPrevBudget(){
  return '<div class="hl-prev hl-prev-plain">'+
    '<div class="hl-row-between">'+
      '<div class="hl-lbl">Weekly budget</div>'+
      '<span style="font-size:7.5px;font-weight:700;background:rgba(82,183,136,.16);color:var(--positive);padding:2px 7px;border-radius:20px">On track</span>'+
    '</div>'+
    '<div class="hl-num" style="font-size:20px;margin-top:6px">$666</div>'+
    '<div class="hl-sub">left of $785</div>'+
    '<div class="hl-bar"><i style="width:62%;background:var(--positive)"></i></div>'+
  '</div>';
}
function hlPrevBalance(){
  const cell=(l,v)=>'<div style="flex:1;min-width:0"><div class="hl-lbl" style="font-size:7px">'+l+'</div>'+
    '<div style="font-size:9px;font-weight:800;color:var(--text)">'+v+'</div></div>';
  return '<div class="hl-prev hl-prev-plain">'+
    '<div class="hl-lbl">Accounts</div>'+
    '<div class="hl-num" style="font-size:19px;margin-top:5px">$8,030</div>'+
    '<div class="hl-sub">net worth</div>'+
    '<div style="display:flex;gap:6px;margin-top:5px">'+cell('Assets','$9,370')+cell('Debts','$1,340')+'</div>'+
  '</div>';
}
function hlPrevPRs(){
  const r=(n,v,isNew)=>'<div class="hl-row-between" style="padding:2px 0">'+
    '<span style="font-size:8.5px;font-weight:600;color:var(--text)">'+n+
      (isNew?' <span style="font-size:6.5px;font-weight:800;color:var(--positive)">NEW</span>':'')+'</span>'+
    '<span style="font-size:8.5px;font-weight:800;color:var(--text)">'+v+'</span></div>';
  return '<div class="hl-prev hl-prev-plain">'+
    '<div class="hl-lbl">Personal records</div>'+
    '<div style="margin-top:4px">'+r('Bench press','100 kg × 5',1)+r('Squat','140 kg × 3')+r('Deadlift','180 kg × 1')+'</div>'+
  '</div>';
}
function hlPrevKitchen(){
  return '<div class="hl-prev hl-prev-plain">'+
    '<div class="hl-lbl">Kitchen</div>'+
    '<div style="font-size:11px;font-weight:700;color:var(--text);margin-top:4px">Chicken Katsu</div>'+
    '<div class="hl-sub">Dinner · cooked 3 weeks ago</div>'+
    '<div style="display:flex;gap:8px;margin-top:5px">'+
      '<div><div class="hl-lbl" style="font-size:7px">Shopping</div><div style="font-size:9px;font-weight:800;color:var(--text)">6 left</div></div>'+
      '<div><div class="hl-lbl" style="font-size:7px">Pantry</div><div style="font-size:9px;font-weight:800;color:#f59e0b">2 low</div></div>'+
    '</div>'+
  '</div>';
}
function hlPrevWeight(){
  return '<div class="hl-prev hl-prev-plain">'+
    '<div class="hl-row-between">'+
      '<div class="hl-lbl">Weight</div>'+
      '<span style="font-size:7.5px;font-weight:700;background:rgba(82,183,136,.16);color:var(--positive);padding:2px 7px;border-radius:20px">On pace</span>'+
    '</div>'+
    '<div class="hl-num" style="font-size:19px;margin-top:5px">82.4<span style="font-size:9px;margin-left:2px">kg</span></div>'+
    '<svg viewBox="0 0 100 22" preserveAspectRatio="none" style="width:100%;height:22px;margin-top:4px">'+
      '<line x1="0" y1="17" x2="100" y2="17" stroke="var(--text-3)" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>'+
      '<path d="M0 4 L25 7 L50 6 L75 11 L100 13" fill="none" stroke="var(--accent-text)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>'+
    '</svg>'+
    '<div class="hl-sub">−0.4 kg this week · 3.2 kg to go</div>'+
  '</div>';
}
function hlPrevTiles(){
  const tile=(icon,val,lbl)=>'<div class="hl-tile"><em>'+icon+'</em><span>'+val+'</span><div class="hl-sub" style="font-size:7px;margin-top:1px">'+lbl+'</div></div>';
  return '<div class="hl-prev hl-prev-plain">'+
    '<div class="hl-tiles">'+tile('💰','$150','Saved')+tile('💵','$785','Last pay')+'</div>'+
  '</div>';
}
function hlPrevNotes(){
  return '<div class="hl-prev hl-prev-plain">'+
    '<div class="hl-lbl">Notes</div>'+
    '<div class="hl-list">'+
      '<div class="hl-li"><i></i>Book physio <span style="margin-left:auto;color:var(--accent-text);font-size:8px">Priority</span></div>'+
      '<div class="hl-li"><i style="background:var(--danger)"></i>Rego due <span style="margin-left:auto;color:var(--muted);font-size:8px">3 days</span></div>'+
    '</div>'+
  '</div>';
}
const HOME_WIDGETS=[
  {id:'session',  label:"Today's Session",      tab:'Train', preview:hlPrevSession},
  {id:'weather',  label:'Weather',              tab:'Train', preview:hlPrevWeather},
  {id:'streak',   label:'Streak & This Week',   tab:'Train', preview:hlPrevStreak},
  {id:'review',   label:'Week in Review',       tab:'Train', preview:hlPrevReview},
  {id:'recent',   label:'Recent Workout',       tab:'Train', preview:hlPrevRecent},
  {id:'calories', label:'Overview & Greeting',  tab:'Nutrition', fixed:true, preview:hlPrevCalories},
  {id:'weight',   label:'Weight & Goal',        tab:'Nutrition', preview:hlPrevWeight},
  {id:'prs',      label:'Personal Records',     tab:'Train', preview:hlPrevPRs},
  {id:'kitchen',  label:'Kitchen Snapshot',     tab:'Kitchen', preview:hlPrevKitchen},
  {id:'habits',   label:"Today's Habits",       tab:'Habits', preview:hlPrevHabits},
  {id:'budget',   label:'Weekly Budget',        tab:'Budget', preview:hlPrevBudget},
  {id:'balance',  label:'Net Worth & Accounts', tab:'Budget', preview:hlPrevBalance},
  {id:'tiles',    label:'Money Quick Tiles',    tab:'Budget', preview:hlPrevTiles},
  {id:'notes',    label:'Notes',                tab:'Notes', preview:hlPrevNotes},
];
const HOME_DEFAULT_ORDER=['session','weather','streak','prs','calories','weight','review','habits','budget','balance','tiles','kitchen','notes','recent'];
// Which cards span the full desktop grid row by default. User-editable per card
// (Settings → Home Layout); this is only the starting point. Only the session hero: it is the
// one card with enough internal content to earn the width (label, play button, 40px title, meta,
// progress row and track) and the one whose job is to be ranked first.
// Weather and budget were seeded wide too, which stacked three full-width bands before the
// grid began and, since all three are accent-toned, put the signature colour on three
// consecutive full-bleed rows — read as a default nobody turned off rather than as emphasis.
// Neither needs the width: the Home budget card is four elements (label + pill, one figure,
// one unit line, one 7px bar) — not to be confused with #budget-hero-card on the Budget tab,
// which does have arrows and a stat row — and the weather card keeps its full 16-scene
// treatment at half width, where the sky gradient actually has room to resolve its stops.
// Both remain one toggle away in Settings → Home Layout for anyone who wants them back.
// NOTE this is a SEED, not a setting: homeLayout() applies it only while the stored layout
// has no `wide` array, and saveHomeOrder() freezes whatever is current into storage the first
// time a card is dragged. So this reaches new and untouched installs; anyone who has already
// reordered their Home keeps the old three and has to change it in Settings.
const HOME_DEFAULT_WIDE=['session'];
function loadHomeOrder(){ return lsLoad('daily_home_order', null, Array.isArray); } // legacy (seed only)
// One preference object {hidden:[], order:[]} — the same overlay convention as per-day
// exercise customisation (dayCustomFor's added/hidden/order). Seeded once from the legacy
// daily_home_order array so an existing custom order survives the upgrade.
function homeLayout(){
  let l=lsLoad('daily_home_layout', null, v=>v&&typeof v==='object'&&!Array.isArray(v));
  if(!l) l={hidden:[], order:loadHomeOrder()||[]};
  if(!Array.isArray(l.hidden)) l.hidden=[];
  if(!Array.isArray(l.order)) l.order=[];
  // Seeded only when the key is absent, so a user who deliberately turns every card to
  // half-width keeps an empty array instead of having the defaults re-applied each load.
  if(!Array.isArray(l.wide)) l.wide=HOME_DEFAULT_WIDE.slice();
  return l;
}
function saveHomeLayout(l){ lsSave('daily_home_layout', l, 'homeLayout'); }
// One-time narrowing of the default wide set (see HOME_DEFAULT_WIDE). Without this the change
// would only ever reach brand-new installs: saveHomeOrder() writes the whole layout object
// back, so the moment anyone drags a Home card the seed of the day is frozen into storage and
// no later change to the constant can move it.
// Same rule as migrateRetiredAccentOnce — it fires ONLY for a layout still holding the exact
// old default set, so a deliberately-chosen arrangement is never overwritten. Compared as a
// set rather than by index, since the order within `wide` carries no meaning.
const HOME_LEGACY_WIDE=['session','budget','weather'];
function migrateDefaultWideOnce(){
  if(localStorage.getItem('daily_home_wide_narrowed')) return;
  try{
    const l=lsLoad('daily_home_layout', null, v=>v&&typeof v==='object'&&!Array.isArray(v));
    if(l && Array.isArray(l.wide) && l.wide.length===HOME_LEGACY_WIDE.length
       && HOME_LEGACY_WIDE.every(k=>l.wide.indexOf(k)>=0)){
      l.wide=HOME_DEFAULT_WIDE.slice();
      saveHomeLayout(l);
    }
  }catch(e){}
  localStorage.setItem('daily_home_wide_narrowed','1');
}
// Saved order first (only ids that exist), then defaults/new widgets appended, then the
// hidden filter — mirroring effectiveExercises' order-then-hidden overlay application.
function effectiveHomeWidgetIds(cards){
  const l=homeLayout();
  const keys=[];
  l.order.forEach(k=>{ if(cards[k]!==undefined && keys.indexOf(k)<0) keys.push(k); });
  HOME_DEFAULT_ORDER.forEach(k=>{ if(cards[k]!==undefined && keys.indexOf(k)<0) keys.push(k); });
  Object.keys(cards).forEach(k=>{ if(keys.indexOf(k)<0) keys.push(k); });
  const hidden=new Set(l.hidden);
  return keys.filter(k=>{ const w=HOME_WIDGETS.find(x=>x.id===k); return (w&&w.fixed) || !hidden.has(k); });
}
function saveHomeOrder(){
  // Both layouts now put every card in one container in visual order (desktop is a single
  // CSS grid, mobile a plain stack), so DOM order is the saved order on either. The old
  // desktop bail-out is gone with the column-major layout that made it necessary.
  const order=[...document.querySelectorAll('#home-content [data-card-id]')].map(c=>c.dataset.cardId);
  if(!order.length) return;
  const l=homeLayout();
  // Hidden widgets aren't in the DOM — keep them in the order list (after the visible ones)
  // so toggling one back on doesn't strand it outside the saved order.
  l.order=order.concat(HOME_DEFAULT_ORDER.filter(k=>order.indexOf(k)<0));
  saveHomeLayout(l);
}
// Settings → Home Layout: per-widget show/hide toggles grouped by tab.
function renderHomeLayoutSection(){
  const wrap=document.getElementById('settings-homelayout-section'); if(!wrap) return;
  const hidden=new Set(homeLayout().hidden);
  const wide=new Set(homeLayout().wide);
  const tabs=[...new Set(HOME_WIDGETS.map(w=>w.tab))];
  wrap.innerHTML=
    '<p style="font-size:13px;color:var(--muted);margin-bottom:14px">Choose which cards show on the Home tab. Hiding a card never deletes its data — turn it back on any time. Reorder cards by dragging them via Home → Edit layout (works on phone and desktop).</p>'+
    tabs.map(tab=>'<div class="settings-card">'+
      '<div class="settings-card-title">'+tab+'</div>'+
      HOME_WIDGETS.filter(w=>w.tab===tab).map(w=>
        '<div class="settings-row" style="padding:7px 0;flex-direction:column;align-items:stretch">'+
          '<div style="display:flex;justify-content:space-between;align-items:center">'+
            '<span class="settings-row-label">'+w.label+(w.fixed?' <span style="font-size:11px;color:var(--muted)">· always shown</span>':'')+'</span>'+
            (w.fixed?'':'<label class="toggle-switch"><input type="checkbox"'+(hidden.has(w.id)?'':' checked')+' onchange="homeWidgetToggle(\''+w.id+'\',this.checked)"><span class="toggle-slider"></span></label>')+
          '</div>'+
          // Desktop-only: the phone layout is a single column, so every card is full width there.
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">'+
            '<span style="font-size:12px;color:var(--muted)">Full width on desktop</span>'+
            '<label class="toggle-switch"><input type="checkbox"'+(wide.has(w.id)?' checked':'')+' onchange="homeWidgetWidth(\''+w.id+'\',this.checked)"><span class="toggle-slider"></span></label>'+
          '</div>'+
          (w.preview?w.preview():'')+
        '</div>').join('')+
      '</div>').join('');
}
// Half-width (one grid column) vs full-width (both) on the desktop Home grid.
function homeWidgetWidth(id,on){
  const l=homeLayout();
  l.wide=l.wide.filter(x=>x!==id);
  if(on) l.wide.push(id);
  saveHomeLayout(l);
  if(typeof renderHome==='function') renderHome();
}
function homeWidgetToggle(id,on){
  const l=homeLayout();
  l.hidden=l.hidden.filter(x=>x!==id);
  if(!on) l.hidden.push(id);
  saveHomeLayout(l);
  if(typeof renderHome==='function') renderHome();
}
// ── Height cap for cards that grow with your data ──────────────────
// Cards on the desktop grid size to their own content (align-items:start in CSS) — nothing
// forces a card to any particular height. This is deliberately the third attempt at this, and
// it is the last one: a grid with mixed-height cards has exactly two failure modes, not one —
// force every card to a shared height and you get dead space INSIDE the short ones (what this
// replaces: the previous version forced a 250px-multiple row grid, and while it eliminated
// gaps between cards, weather/notes/tiles/kitchen sat inside a box nearly double their real
// content); or size every card to its own content and a short card next to a tall one leaves a
// gap in the ROW below it, back down to the next row. Told directly that the empty-space-inside
// problem was worse than the gap-between problem, this drops all row-forcing and takes the
// second trade-off. There is no clever third option here without either reintroducing masonry
// packing (rejected twice already — see CLAUDE.md — because it desyncs DOM order from visual
// order and breaks drag-to-reorder) or hand-tuning every card's own content to a shared target
// height, which is a design change to each card, not a layout fix.
// Only genuinely UNBOUNDED cards are still capped — a real list that can grow without limit
// (habits, notes, recent sessions) is the one case a fixed content height can't fix on its own:
// 25 notes made this card 837px tall and dragged its row down with it. HOME_CARD_CAP is a flat
// pixel ceiling, not tied to any row grid, since there is no row grid to tie it to any more.
const HOME_CAPPABLE=['notes','habits','recent'];
const HOME_CARD_CAP=280;   // ≈ the tallest naturally-occurring standard card, so unaffected in the common case
const _homeExpanded=new Set();   // survives re-render; renderHome rebuilds innerHTML and would lose a class
function applyHomeCardCaps(){
  document.querySelectorAll('#home-content .home-card').forEach(w=>{
    const old=w.querySelector(':scope > .home-card-more'); if(old) old.remove();
    w.classList.remove('home-card-capped','home-card-hasmore');
    const id=w.dataset.cardId;
    if(window.innerWidth<1024 || HOME_CAPPABLE.indexOf(id)<0) return;
    const inner=w.firstElementChild; if(!inner) return;
    const expanded=_homeExpanded.has(id);
    // Measure uncapped, so a card that only just fits keeps no button at all.
    inner.style.removeProperty('max-height');
    if(!expanded && inner.scrollHeight<=HOME_CARD_CAP) return;
    w.classList.add('home-card-hasmore');
    if(!expanded){
      w.classList.add('home-card-capped');
      inner.style.maxHeight=HOME_CARD_CAP+'px';
    }
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='home-card-more';
    btn.textContent=expanded?'Show less':'Show all';
    // The card itself is a link through to its tab; the toggle must not trigger that.
    btn.addEventListener('click',e=>{ e.stopPropagation(); toggleHomeCardExpand(id); });
    w.appendChild(btn);
  });
}
function toggleHomeCardExpand(id){
  if(_homeExpanded.has(id)) _homeExpanded.delete(id); else _homeExpanded.add(id);
  applyHomeCardCaps();
}
let homeEditMode=false;
function toggleHomeEdit(){
  homeEditMode=!homeEditMode;
  const btn=document.getElementById('home-edit-btn');
  if(btn){ btn.textContent=homeEditMode?'Done':'Edit'; btn.classList.toggle('active',homeEditMode); }
  applyHomeEditMode();
}
function applyHomeEditMode(){
  const hc=document.getElementById('home-content');
  if(hc) hc.classList.toggle('home-editing',homeEditMode);
  document.querySelectorAll('#home-content [data-card-id]').forEach(c=>c.classList.toggle('home-card-jiggle',homeEditMode));
}
// Drag-to-reorder with a floating clone. Active only in Home edit mode.
// Pointer Events (not touch events) so mouse, touch and pen all run the same path — the old
// touchstart/touchmove pair meant desktop could enter edit mode but nothing responded to a
// mouse, making the Edit layout button a dead control there.
// Reordering is FLIP-animated (First/Last/Invert/Play): a bare insertBefore relocates the
// other cards in a single frame, which is the "snap" — measuring before and after and
// transitioning from the inverted offset turns the same DOM move into a smooth swap.
(function(){
  const SLOP=4;            // px of movement before a press becomes a drag
  const FLIP_MS=260;
  let card=null, clone=null, offX=0, offY=0, startX=0, startY=0, dragging=false, pid=null;

  const allCards=()=>[...document.querySelectorAll('#home-content [data-card-id]')];

  // Animate every card from where it was to where the mutation just put it.
  // Uses the Web Animations API rather than inline styles + requestAnimationFrame: the rAF
  // approach has to paint the inverted position on one frame and release it on the next, so
  // if frames stop (backgrounded tab, throttled window) the release never runs and the cards
  // stay visually displaced with a stale inline transform. element.animate() owns the whole
  // invert→identity transition itself, touches no inline styles, and needs no cleanup.
  function flip(mutate){
    const cards=allCards();
    const first=new Map(cards.map(c=>[c,c.getBoundingClientRect()]));
    mutate();
    cards.forEach(c=>{
      const f=first.get(c), l=c.getBoundingClientRect();
      const dx=f.left-l.left, dy=f.top-l.top;
      if(!dx&&!dy) return;
      if(!c.animate) return; // no WAAPI: the move still happens, just without the tween
      c.animate(
        [{transform:'translate('+dx+'px,'+dy+'px)'},{transform:'none'}],
        {duration:FLIP_MS, easing:'cubic-bezier(.2,.7,.3,1)'}
      );
    });
  }

  function beginDrag(e){
    const r=card.getBoundingClientRect();
    dragging=true;
    document.getElementById('home-content').classList.add('home-dragging');
    clone=card.cloneNode(true);
    clone.classList.remove('home-card-jiggle');
    clone.style.cssText='position:fixed;left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;opacity:.92;z-index:9999;pointer-events:none;transform:scale(1.03);box-shadow:0 14px 34px rgba(0,0,0,.45);animation:none;margin:0';
    document.body.appendChild(clone);
    card.classList.add('home-card-ghost');
  }

  document.addEventListener('pointerdown',function(e){
    if(!homeEditMode || S.view!=='home' || e.button) return;
    const c=e.target.closest&&e.target.closest('#home-content [data-card-id]'); if(!c) return;
    card=c; pid=e.pointerId;
    const r=c.getBoundingClientRect();
    startX=e.clientX; startY=e.clientY; offX=e.clientX-r.left; offY=e.clientY-r.top;
    // Capture on the card so moves that leave it (fast drags, edge of screen) still arrive.
    try{ c.setPointerCapture(e.pointerId); }catch(_){}
  });

  document.addEventListener('pointermove',function(e){
    if(!card||e.pointerId!==pid) return;
    if(!dragging){
      if(Math.abs(e.clientX-startX)<SLOP && Math.abs(e.clientY-startY)<SLOP) return;
      beginDrag(e);
    }
    e.preventDefault();
    clone.style.left=(e.clientX-offX)+'px';
    clone.style.top=(e.clientY-offY)+'px';
    clone.style.display='none';
    const el=document.elementFromPoint(e.clientX,e.clientY);
    clone.style.display='';
    const target=(el&&el.closest)?el.closest('#home-content [data-card-id]'):null;
    if(!target||target===card||target.parentElement!==card.parentElement) return;
    // Desktop is a two-column grid, so "past the midpoint" has to consider X as well as Y:
    // within the same row the decision is horizontal, across rows it's vertical.
    const r=target.getBoundingClientRect();
    const cx=r.left+r.width/2, cy=r.top+r.height/2;
    const sameRow=Math.abs(e.clientY-cy)<r.height/2;
    const after=sameRow ? e.clientX>cx : e.clientY>cy;
    const ref=after?target.nextSibling:target;
    if(ref===card||(after&&target.nextSibling===card)) return;
    flip(()=>card.parentElement.insertBefore(card,ref));
  },{passive:false});

  function endDrag(e){
    if(!card||(e&&e.pointerId!==undefined&&e.pointerId!==pid)) return;
    try{ card.releasePointerCapture(pid); }catch(_){}
    card.classList.remove('home-card-ghost');
    const hc=document.getElementById('home-content');
    if(hc) hc.classList.remove('home-dragging');
    if(clone){ clone.remove(); clone=null; }
    const wasDragging=dragging;
    card=null; dragging=false; pid=null;
    if(wasDragging) saveHomeOrder();
  }
  document.addEventListener('pointerup',endDrag);
  document.addEventListener('pointercancel',endDrag);
})();

// Persistent Home "Recent workout" card (last saved session, tap to expand exercises).
// Rendered separately from the draggable home-content cards, into its own #home-recent-card.
// "Recent workout" card — now a widget in the ordered Home list (was a separate render
// into #home-recent-card, which renderHome keeps cleared for older cached markup).
// ── Recent sessions ───────────────────────────────────────────────
// Was one session with every exercise and every set behind a tap-to-expand. That is the Log
// tab's job — Home is a glance, and the expanded state made a card that was already the
// tallest on the page taller still while answering a question ("what did I lift on set 3?")
// nobody asks from the dashboard.
// It's a short history instead: the last few sessions with date, split, and how each one FELT.
// The effort rating was recorded on every session and shown nowhere outside the session card,
// so the one genuinely subjective thing tracked here was invisible. Four sessions rather than
// one also gives the card enough rows to fill its height on desktop, where it is stretched to
// match its row partner.
function buildHomeRecentCard(){
  if(!S.sessions.length) return '';
  const recent=[...S.sessions].sort((a,b)=>a.date<b.date?-1:1).slice(-4).reverse();
  const rows=recent.map(s=>{
    const m=effortMeta(s.effort);
    const exCount=(s.exercises||[]).length;
    return '<div class="rw-row">'+
      '<div class="rw-l">'+
        '<div class="rw-date">'+fmtDate(s.date)+'</div>'+
        '<div class="rw-sub">'+_catEscHtml(s.sessionType||('Day '+(s.dayNum||'')))+
          (exCount?' · '+exCount+' exercise'+(exCount!==1?'s':''):'')+'</div>'+
      '</div>'+
      // Not rated is a real state, not a blank: an unrated session should look different from
      // one you found easy, so it gets a hollow chip rather than no chip.
      // Class, not an inline colour: the chip is coloured text on a tint of its own colour, and
      // the vivid scale that works on the dark card is unreadable on the light one (Moderate
      // measured 1.76:1 in light mode). The per-theme values live in CSS — same problem, and
      // the same fix, as --accent-text.
      (m
        ? '<span class="rw-effort ef-'+m.id+'">'+m.label+'</span>'
        : '<span class="rw-effort rw-effort-none">Not rated</span>')+
    '</div>';
  }).join('');
  return '<div class="card" style="cursor:pointer" onclick="setView(\'stats\');setStatsTab(\'history\')">'+
    cardHeader('flame','Recent sessions','<span class="card-hd-act">History →</span>')+
    rows+
  '</div>';
}

// iOS standalone PWAs disable window.prompt(), which is why the old Update button
// "did nothing" on iPhone. Use an in-app modal instead.
function updateSavingsBalance(){
  const modal=document.getElementById('savings-modal');
  const input=document.getElementById('savings-input');
  if(!modal||!input) return;
  const latest=savingsLog.length?savingsLog[savingsLog.length-1].balance:'';
  input.value=latest===''?'':String(latest);
  modal.classList.remove('hidden');
  setTimeout(()=>{ input.focus(); input.select(); }, 50);
}
function closeSavingsModal(){
  const modal=document.getElementById('savings-modal');
  if(modal) modal.classList.add('hidden');
}
function confirmSavingsBalance(){
  const input=document.getElementById('savings-input');
  if(!input) return;
  const bal=parseFloat(String(input.value).replace(/[^0-9.]/g,''));
  if(isNaN(bal)||bal<0){ closeSavingsModal(); return; } // close even on an invalid entry
  const today=getLocalDate();
  savingsLog=savingsLog.filter(e=>e&&e.date!==today);
  savingsLog.push({date:today,balance:bal,t:Date.now()}); // t = edit time, used to win merges
  savingsLog.sort((a,b)=>a.date<b.date?-1:1);
  saveSavingsLog();      // persists locally + (safely) syncs to cloud
  closeSavingsModal();   // close before re-render so a render error can't keep it open
  try{ renderHome(); }catch(err){ console.error('renderHome after savings save failed', err); }
}

// Keep bottom-sheet modals above the iOS keyboard. Every .modal-overlay aligns its
// .modal-box to the bottom (flex-end) — exactly where the keyboard opens — so the Save
// button can end up hidden. When visualViewport shrinks, lift the visible modal's box by
// the keyboard height. One delegated handler covers savings, swap, kitchen form, etc.
// Defined at module scope (not inside an IIFE) so the focusin handler below can call it
// explicitly after the keyboard has fully appeared, covering devices where the resize
// event fires before the modal is rendered or mid-animation.
function adjustModalsForKeyboard(){
  if(!window.visualViewport) return;
  const kb = window.innerHeight - window.visualViewport.height;
  if(kb > 100){ // >100px ≈ a keyboard (ignore URL-bar / minor viewport jitter)
    document.querySelectorAll('.modal-overlay:not(.hidden) .modal-box').forEach(box=>{
      box.style.transition = 'margin-bottom 0.2s ease';
      box.style.marginBottom = kb + 'px';
      // Constrain the box to the space above the keyboard so its (pinned) buttons stay on screen.
      box.style.maxHeight = (window.visualViewport.height - 12) + 'px';
    });
  } else {
    document.querySelectorAll('.modal-box').forEach(box=>{ box.style.marginBottom = ''; box.style.maxHeight = ''; });
  }
}
if(window.visualViewport){
  window.visualViewport.addEventListener('resize', adjustModalsForKeyboard);
  window.visualViewport.addEventListener('scroll', adjustModalsForKeyboard);
}

// On mobile, handle keyboard appearing over inputs:
// • Modal inputs: re-run the modal lift after 400 ms so the keyboard is fully up.
//   The visualViewport resize event alone isn't reliable — it can fire before the
//   modal is visible, or the final height isn't settled yet.
// • Non-modal inputs (budget rows, settings): scroll into view so they aren't hidden.
document.addEventListener('focusin', function(e){
  const el = e.target;
  if(!el || window.innerWidth >= 1024) return;
  if(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'){
    if(el.closest('.modal-overlay')){
      setTimeout(adjustModalsForKeyboard, 400);
    } else {
      // Delay until the keyboard has started to appear so the scroll target
      // accounts for the reduced visible area above it.
      setTimeout(function(){ safeScrollIntoView(el,{behavior:'smooth', block:'center'}); }, 320);
    }
  }
});

// ── Onboarding ────────────────────────────────────────────────────
// Data-driven multi-step flow: the step order lives in OB_STEPS, so the progress dots
// and the Back/Skip logic derive from that array — adding or removing a step needs no
// dot markup and no renumbering. Every answer is staged in obData (not the DOM) so
// Back/forward navigation preserves what was entered.
const OB_VERSION = 2;             // bump when onboarding gains steps worth re-showing existing users
// Bump WHATS_NEW_VERSION and add an entry whenever existing users should see a "what's new"
// popup next time they open the app. Independent of OB_VERSION (which is onboarding steps only).
const WHATS_NEW_VERSION = 2;
const WHATS_NEW_LOG = [
  { v:1, items:['New app icon and logo, everywhere in the app', 'Brighter, taller completed-exercise rows on Log', 'Exercise Library: delete moved into the edit screen'] },
  { v:2, items:['Budget: a weekly Spending goal card — set a cap for your variable spending and watch it turn red if you go over', 'Accounts: flag an account as a Savers account to keep it out of the new debt payoff total'] }
];
const OB_STEPS = ['welcome','theme','profile','body','split','habits','sync','done'];
const OB_FIX_CHIPS = ['Rent','Phone','Subscriptions','Transport','Gym'];
let obBudgetStarted = false;
const OB_HABIT_SUGGESTIONS = ['Morning workout','Hit calorie goal','Log budget','8h sleep','Drink 2L water','10k steps','Stretch 10 min','Read 20 min','No junk food','Meditate'];
let obStep = 0;
let obData = {};
let obAuthUnsub = null;
let obHabitOptions = [];

function obNum(v){ const n=parseFloat(v); return isFinite(n)?n:undefined; }
function obEsc(s){ return (s==null?'':String(s)).replace(/"/g,'&quot;'); }

function checkOnboarding(){
  const named = !!(profileData.name||'').trim();
  if(!named){ showOnboarding(); return; }
  // Existing user: reconcile their stored onboarding version against the current one.
  const v = profileData.onboardingVersion || 0;
  if(v < OB_VERSION){
    if(v === 0){
      // Pre-versioning user — they've already used the app, so silently seed them to the
      // current version. This means only FUTURE bumps (v≥1 → newer) can trigger a nudge.
      profileData.onboardingVersion = OB_VERSION;
      localStorage.setItem('daily_profile', JSON.stringify(profileData));
      syncProfileToFirebase();
    } else {
      // A later release bumps OB_VERSION and re-introduces new features here. The nudge UI
      // is intentionally NOT built yet — this is just the ready hook so it's wired up.
      showWhatsNew(v, OB_VERSION);
    }
  }
}
// Kept for the OB_VERSION hook in checkOnboarding — onboarding-step nudging is separate from
// the general-release "what's new" popup below (checkWhatsNew), which runs on its own counter.
function showWhatsNew(fromVersion, toVersion){ /* onboarding-step nudge — not used yet */ }

// General-release "what's new" popup, run on every load after checkOnboarding(). Uses its own
// WHATS_NEW_VERSION counter (not OB_VERSION) so everyday fixes/features can trigger it without
// onboarding needing to change. Brand-new users are seeded caught-up in finishOnboarding().
function checkWhatsNew(){
  // Only for an existing (named) user. A brand-new user is mid-onboarding on this same load
  // (checkOnboarding just opened it) and gets seeded caught-up in finishOnboarding, so the
  // popup must never fire over/right after onboarding.
  if(!(profileData.name||'').trim()) return;
  const v = profileData.lastSeenWhatsNew || 0;
  if(v >= WHATS_NEW_VERSION) return;
  const entries = WHATS_NEW_LOG.filter(e=>e.v>v && e.v<=WHATS_NEW_VERSION);
  if(!entries.length){ profileData.lastSeenWhatsNew = WHATS_NEW_VERSION; localStorage.setItem('daily_profile', JSON.stringify(profileData)); return; }
  showWhatsNewModal(entries);
}
function showWhatsNewModal(entries){
  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.id='whats-new-overlay';
  const body=entries.map(e=>'<ul style="margin:0 0 10px;padding-left:20px">'+
    e.items.map(i=>'<li style="margin-bottom:6px;font-size:14px;color:var(--text)">'+i+'</li>').join('')+
  '</ul>').join('');
  overlay.innerHTML='<div class="modal-box" style="max-width:420px">'+
    '<div style="font-size:18px;font-weight:800;margin-bottom:4px">What\'s new</div>'+
    '<div style="font-size:13px;color:var(--muted);margin-bottom:14px">Since you last opened Daily</div>'+
    body+
    '<button onclick="dismissWhatsNew()" class="modal-btn primary" style="width:100%;margin-top:6px">Got it</button>'+
  '</div>';
  document.body.appendChild(overlay);
}
function dismissWhatsNew(){
  document.getElementById('whats-new-overlay')?.remove();
  profileData.lastSeenWhatsNew = WHATS_NEW_VERSION;
  localStorage.setItem('daily_profile', JSON.stringify(profileData));
  syncProfileToFirebase();
}

function showOnboarding(){
  obDetachAuthWatch();
  obStep = 0;
  obBudgetStarted = false;
  obSplitDraft = null;
  obData = { theme: S.theme, habits: (loadHabits()||[]).slice() };
  renderObStep();
  document.getElementById('onboarding-overlay').classList.remove('hidden');
}
// Blank the shared budgetConfig to a single empty income row + no fixed expenses, but ONLY
// for a genuinely new user (no budget saved yet). An existing account re-running onboarding
// keeps its real budget untouched. Runs once when the budget step is first shown.
function obEnsureBudgetStarter(){
  if(obBudgetStarted) return;
  obBudgetStarted = true;
  if(localStorage.getItem('daily_budget_config')==null){
    saveBudgetConfig({
      incomeStreams:[{id:'i'+Date.now(),name:'',weeklyAmount:0}],
      fixedExpenses:[],
      variableExpenses:[],
    });
  }
}
function obAddFixChip(name){
  if(!Array.isArray(budgetConfig.fixedExpenses)) budgetConfig.fixedExpenses=[];
  budgetConfig.fixedExpenses.push({id:'f'+Date.now(),name:name,weeklyAmount:0});
  saveBudgetConfig(budgetConfig);
  renderBudgetEditList('ob-fix-list','fixedExpenses');
}

// ── Training split editor (shared: onboarding 'split' step + Settings overlay) ──
// Works on a flat, editable list of "days" (each = name + its own exercise list). On save
// it becomes splitConfig.types with a 1:1 schedule. splitToDays expands an existing split's
// schedule so what you edit matches the rotation you actually see.
let obSplitDraft = null;
const SE = { days:[], target:-1, pickerQuery:'', container:'se-wrap' };
function splitToDays(cfg){
  const src=(cfg&&Array.isArray(cfg.types)&&cfg.types.length)?cfg:splitCfg();
  const sch=(Array.isArray(src.schedule)&&src.schedule.length)?src.schedule:src.types.map((_,i)=>i);
  return sch.map((idx,i)=>{
    const t=src.types[idx]||src.types[0]||{};
    return {
      id:'d'+i+'_'+Math.random().toString(36).slice(2,6),
      name:t.name||('Day '+(i+1)),
      colorKey:t.colorKey||'',
      barColor:t.barColor||SPLIT_PALETTE[i%SPLIT_PALETTE.length],
      exercises:(t.exercises||[]).map(e=>({...e})),
    };
  });
}
function daysToSplit(days){
  const types=(days||[]).map((d,i)=>({
    id:d.id||('d'+i+'_'+Math.random().toString(36).slice(2,6)),
    name:(d.name||('Day '+(i+1))).trim()||('Day '+(i+1)),
    colorKey:d.colorKey||'',
    barColor:d.barColor||SPLIT_PALETTE[i%SPLIT_PALETTE.length],
    exercises:(d.exercises||[]).filter(e=>e&&e.name).map(e=>({...e, sets:e.sets||1})),
  }));
  return { types, schedule: types.map((_,i)=>i) };
}
function seRerender(){ renderSplitEditor(SE.container); }
function renderSplitEditor(containerId){
  const el=document.getElementById(containerId||SE.container); if(!el) return;
  SE.container=containerId||SE.container;
  const days=SE.days;
  let html=days.map((d,i)=>
    '<div class="se-day-card">'+
      '<div class="se-day-head">'+
        '<span class="se-day-dot" style="background:'+typeGridColor(d)+'"></span>'+
        '<input class="se-day-name" value="'+_catEsc(d.name)+'" placeholder="Day name" oninput="seRenameDay('+i+',this.value)">'+
        (days.length>1?'<button class="se-day-del" onclick="seRemoveDay('+i+')" aria-label="Remove day">×</button>':'')+
      '</div>'+
      '<div class="se-ex-list">'+
        (d.exercises.length ? d.exercises.map((ex,j)=>
          '<div class="se-ex-row">'+
            '<span class="se-ex-name">'+_catEscHtml(ex.name)+'</span>'+
            '<input class="se-ex-sets" type="number" inputmode="numeric" min="1" max="12" value="'+(ex.sets||1)+'" onchange="seSetSets('+i+','+j+',this.value)" aria-label="Sets">'+
            '<span class="se-ex-setslbl">sets</span>'+
            '<button class="se-ex-del" onclick="seRemoveExercise('+i+','+j+')" aria-label="Remove exercise">×</button>'+
          '</div>'
        ).join('') : '<div class="se-ex-empty">No exercises yet — add some below.</div>')+
      '</div>'+
      '<button class="se-add-ex" onclick="seOpenPicker('+i+')">+ Add exercise</button>'+
    '</div>'
  ).join('');
  html+='<button class="se-add-day" onclick="seAddDay()">+ Add training day</button>';
  // Starting a new program means wiping the current days, which was previously only possible
  // by deleting each one by hand (and seRemoveDay refuses to delete the last).
  html+='<button class="se-clear-all" onclick="seClearAll()">Clear all days and start fresh</button>';
  html+='<div class="se-clear-hint">Removes every training day here so you can build a new split. Your logged sessions and history are not affected.</div>';
  if(SE.target>=0 && SE.days[SE.target]){
    html+='<div class="se-picker-backdrop" onclick="seClosePicker()"></div>'+
      '<div class="se-picker">'+
        '<div class="se-picker-head">Add to “'+_catEscHtml(SE.days[SE.target].name||'day')+'”'+
          '<button class="se-picker-x" onclick="seClosePicker()" aria-label="Close">×</button></div>'+
        '<input class="se-picker-search" id="se-picker-search" placeholder="Search or type a new name…" value="'+_catEsc(SE.pickerQuery)+'" oninput="sePickerSearch(this.value)">'+
        '<div class="se-picker-list" id="se-picker-list">'+sePickerListHTML()+'</div>'+
      '</div>';
  }
  el.innerHTML=html;
  if(SE.target>=0){ setTimeout(()=>{ const s=document.getElementById('se-picker-search'); if(s){ s.focus(); s.setSelectionRange(s.value.length,s.value.length); } },30); }
}
function sePickerListHTML(){
  const d=SE.days[SE.target]; if(!d) return '';
  const lib=loadExerciseLib();
  const q=(SE.pickerQuery||'').toLowerCase().trim();
  const inDay=new Set((d.exercises||[]).map(e=>e.name.toLowerCase()));
  const filtered=lib.filter(e=>!inDay.has(e.name.toLowerCase())&&(!q||e.name.toLowerCase().includes(q)));
  let out=filtered.map(e=>
    '<div class="se-picker-item">'+
      '<span class="se-picker-pick" onclick="sePick('+JSON.stringify(e.name).replace(/"/g,'&quot;')+')">'+
        '<span>'+_catEscHtml(e.name)+'</span><span class="se-picker-muscle">'+e.muscle+'</span>'+
      '</span>'+
      '<button class="se-picker-edit" onclick="event.stopPropagation();openEditExercise(\''+e.id+'\')" aria-label="Edit exercise">✎</button>'+
    '</div>'
  ).join('');
  if(q && !lib.some(e=>e.name.toLowerCase()===q)){
    out+='<button class="se-picker-item se-picker-new" onclick="sePickCustom()">+ Add “'+_catEscHtml(SE.pickerQuery.trim())+'” as a new exercise</button>';
  }
  if(!out) out='<div class="se-ex-empty" style="padding:14px">Type a name above to add a new exercise.</div>';
  return out;
}
function seAddDay(){ const i=SE.days.length; SE.days.push({id:'d'+Date.now()+'_'+i,name:'Day '+(i+1),colorKey:'',barColor:SPLIT_PALETTE[i%SPLIT_PALETTE.length],exercises:[]}); seRerender(); }
// Wipe the editor back to one blank day. Resets to ONE rather than zero because a split must
// have at least one type to be valid (sanitizeSplit), and seRemoveDay refuses to delete the
// last day for the same reason.
// Offers to save the current split to Plans first, but only when it isn't already stored
// there — otherwise the prompt is noise on every clear.
function seClearAll(){
  let alreadySaved=false;
  try{
    alreadySaved=(loadPlans().plans||[]).some(p=>planIsProgram(p)&&planCfgFingerprint(p.cfg)===planCfgFingerprint(daysToSplit(SE.days)));
  }catch(e){}
  if(!alreadySaved && SE.days.some(d=>(d.exercises||[]).length)){
    if(confirm('Save this split to Plans before clearing it?\n\nYou can switch back to it any time from the Plans tab.')){
      // Persist what's in the editor right now, so the saved program matches what's on screen.
      const cfg=sanitizeSplit(daysToSplit(SE.days));
      if(cfg){
        const name=(prompt('Name this program?', cfg.types.length+'-day split')||'').trim();
        if(name){
          const data=loadPlans();
          data.plans.push({id:'plan_'+Date.now(),name,kind:'split',description:'',
            cfg:JSON.parse(JSON.stringify({types:cfg.types,schedule:cfg.schedule})),createdAt:Date.now()});
          savePlans(data);
        }
      }
    }
  }
  if(!confirm('Clear every training day?\n\nYour logged sessions and history stay exactly as they are.')) return;
  SE.days=[{id:'d'+Date.now()+'_0',name:'Day 1',colorKey:'',barColor:SPLIT_PALETTE[0],exercises:[]}];
  seRerender();
}
function seRemoveDay(i){ if(SE.days.length<=1) return; SE.days.splice(i,1); seRerender(); }
function seRenameDay(i,val){ if(SE.days[i]) SE.days[i].name=val; } // no rerender — keep input focus
function seSetSets(i,j,val){ const n=Math.max(1,Math.min(12,parseInt(val)||1)); if(SE.days[i]&&SE.days[i].exercises[j]) SE.days[i].exercises[j].sets=n; }
function seRemoveExercise(i,j){ if(SE.days[i]&&SE.days[i].exercises) SE.days[i].exercises.splice(j,1); seRerender(); }
function seOpenPicker(i){ SE.target=i; SE.pickerQuery=''; seRerender(); }
function seClosePicker(){ SE.target=-1; SE.pickerQuery=''; seRerender(); }
function sePickerSearch(v){ SE.pickerQuery=v; const list=document.getElementById('se-picker-list'); if(list) list.innerHTML=sePickerListHTML(); }
function sePick(name){ const d=SE.days[SE.target]; if(d&&name&&!d.exercises.some(e=>e.name.toLowerCase()===String(name).toLowerCase())) d.exercises.push({name:String(name),sets:3}); SE.target=-1; SE.pickerQuery=''; seRerender(); }
function sePickCustom(){
  const name=(SE.pickerQuery||'').trim(); if(!name) return;
  const lib=loadExerciseLib();
  if(!lib.some(e=>e.name.toLowerCase()===name.toLowerCase())){ lib.push({id:'ex_custom_'+Date.now(),name,muscle:libGuessMuscle(name),custom:true}); saveExerciseLib(lib); }
  sePick(name);
}

// ── Onboarding 'split' step ──
function obSplitHTML(){
  if(!obSplitDraft) obSplitDraft = splitToDays(genericSplit());
  SE.days = obSplitDraft; SE.target=-1; SE.pickerQuery=''; SE.container='se-wrap';
  return '<div class="ob-head"><div class="ob-title">Build your split</div><div class="ob-desc">Add a day for each training session in your week, name it, and pick its exercises. Skip to start with a simple 3-day full-body split.</div></div>'+
    '<div id="se-wrap"></div>'+
    '<div class="ob-btn-row" style="margin-top:14px">'+
      '<button class="ob-btn-skip" onclick="obSkipSplit()">Skip</button>'+
      '<button class="ob-btn-primary ob-btn-inline" onclick="obNext()">Continue →</button>'+
    '</div>';
}
function obSkipSplit(){ obData.splitSkipped=true; obSplitDraft=null; obNext(); }

// ── Settings overlay entry points ──
function openSplitEditor(){
  SE.days = splitToDays(splitCfg()); SE.target=-1; SE.pickerQuery=''; SE.container='split-editor-wrap';
  const v=document.getElementById('view-split-editor'); if(!v) return;
  v.style.display='block';
  v.style.left=window.innerWidth>=1024?'260px':'0';
  renderSplitEditor('split-editor-wrap');
  if(typeof closeMenu==='function') closeMenu();
}
function closeSplitEditor(){ const v=document.getElementById('view-split-editor'); if(v){ v.style.display='none'; v.style.left='0'; } }
function saveSplitEditor(){
  const cfg=daysToSplit(SE.days);
  if(!cfg.types.length){ closeSplitEditor(); return; }
  splitConfig=cfg; saveSplit();
  if(S.dayIdx>=scheduleLen()) S.dayIdx=0;
  closeSplitEditor();
  if(S.view==='log'&&typeof renderLog==='function') renderLog();
  if(S.view==='home'&&typeof renderHome==='function') renderHome();
  if(S.view==='stats'&&statsSubTab==='training'&&typeof renderTraining==='function') renderTraining();
}

// ── Budget structural editor (Settings → Budget) ──────────────────
// Full-screen editor for the income / fixed / variable CATEGORY structure, built on the
// shared budgetConfig line-item system (add/update/deleteBudgetItem + renderBudgetEditList).
// Edits save live; the Budget tab keeps handling the week-to-week numbers as before.
function openBudgetEditor(){
  const v=document.getElementById('view-budget-editor'); if(!v) return;
  v.style.display='block';
  v.style.left=window.innerWidth>=1024?'260px':'0';
  renderBudgetEditor();
  if(typeof closeMenu==='function') closeMenu();
}
function renderBudgetEditor(){
  // Categories, not budgetConfig — this screen sets each category's weekly budget directly.
  renderCatBudgetList('be-inc','inc');
  renderCatBudgetList('be-fix','fix');
  renderCatBudgetList('be-var','var');
}
function closeBudgetEditor(){
  // Prune categories the user added but never named, so backing out of "+ Add category"
  // doesn't leave a permanent blank row. Only ever removes EMPTY ones (see the function).
  try{ budCleanupUnnamedCats(); }catch(e){}
  const v=document.getElementById('view-budget-editor'); if(v){ v.style.display='none'; v.style.left='0'; }
  refreshCatBudgetUI();
}

// ── Accounts page (full-screen overlay) ───────────────────────────────────────
// Same overlay pattern as the budget/settings editors, and the same add/rename/delete
// idiom as the budget-category lists — just richer per-item fields (balance history,
// optional statement tracking for debts). Reads/writes the daily_accounts store from phase 1.
let _acctAddOpen=false, _acctAddType='asset', _acctAddTracks=false, _acctAddSaver=false;
// Read-only by default, same Edit-button convention as the Budget cards (budEditMode). The
// account name used to be a permanent <input>, and in dark mode an input carries a grey fill —
// so every account card showed a grey slab across its title, which read as a rendering fault
// rather than as "this is editable". A name you change once and then read a hundred times
// should look like a heading; the input only appears while editing.
let _acctEditMode=false;
function acctToggleEdit(){
  _acctEditMode=!_acctEditMode;
  renderAccountsPage();
}
function openAccounts(){
  const v=document.getElementById('view-accounts'); if(!v) return;
  v.style.display='block';
  v.style.left=window.innerWidth>=1024?'260px':'0'; // leave the desktop sidebar uncovered
  // Sidebar peer highlight (mirrors openExerciseLibrary): mark Accounts active, clear the rest.
  document.querySelectorAll('.ds-item').forEach(b=>b.classList.remove('active'));
  const _di=document.getElementById('ds-accounts'); if(_di) _di.classList.add('active');
  _acctAddOpen=false; _acctAddType='asset'; _acctAddTracks=false; _acctAddSaver=false;
  renderAccountsPage();
  if(typeof closeMenu==='function') closeMenu();
}
function closeAccounts(){
  const v=document.getElementById('view-accounts'); if(v){ v.style.display='none'; v.style.left='0'; }
  // Restore the sidebar highlight to whatever tab is actually showing underneath (mirrors closeExerciseLibrary).
  document.querySelectorAll('.ds-item').forEach(b=>b.classList.toggle('active',b.dataset.tab===S.view));
}

function fmtMoney(n){ const v=Math.round(Math.abs(n)).toLocaleString(); return (n<0?'-$':'$')+v; }
function acctDueText(acc){
  if(!acc||!acc.dueDate) return '';
  const s=String(acc.dueDate); const due=new Date(s.length<=10?s+'T12:00:00':s);
  if(isNaN(due.getTime())) return '';
  const overdue = due < new Date(getLocalDate()+'T12:00:00');
  return (overdue?'Overdue · ':'Due ')+due.toLocaleDateString('en-AU',{day:'numeric',month:'short'});
}

// ── Per-account trend ─────────────────────────────────────────────
// Inline SVG rather than a Chart.js instance per account: these are decorative 40px traces,
// and spinning up N charts on a page that already hosts the net-worth one is a lot of canvas
// for very little. Needs 2+ points to be a line at all.
function acctSparklineHtml(a){
  const hist=(a&&a.history||[]).filter(e=>e&&e.date)
    .slice().sort((x,y)=>x.date<y.date?-1:1);
  if(hist.length<2) return '';
  const vals=hist.map(e=>parseFloat(e.balance)||0);
  const min=Math.min.apply(null,vals), max=Math.max.apply(null,vals);
  const range=(max-min)||1;   // a flat history would divide by zero
  const W=100, H=28;
  const pts=vals.map((v,i)=>{
    const x=(i/(vals.length-1))*W;
    const y=H-((v-min)/range)*H;
    return x.toFixed(1)+','+y.toFixed(1);
  }).join(' ');
  // Debt trending up is bad, an asset trending up is good — colour by what the line means,
  // not just by direction.
  const rising=vals[vals.length-1]>=vals[0];
  const good=(a.type==='debt')?!rising:rising;
  const col=good?'var(--success)':'var(--danger)';
  return '<svg class="acct-spark" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-hidden="true">'+
    '<polyline points="'+pts+'" fill="none" stroke="'+col+'" stroke-width="2" '+
    'stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
}
// Movement over the trailing 30 days. accountBalanceAt carries the last known balance
// forward, and falls back to the earliest entry when the account is younger than 30 days —
// so a new account reads as change-since-opening rather than a misleading zero.
function acctChangeHtml(a){
  const hist=(a&&a.history||[]).filter(e=>e&&e.date);
  if(hist.length<2) return '';
  const d=localMidnight(getLocalDate()); d.setDate(d.getDate()-30);
  const then=accountBalanceAt(a,dateStr(d));
  const now=parseFloat(a.current)||0;
  const delta=Math.round((now-then)*100)/100;
  if(!delta) return '<div class="acct-change acct-change-flat">No change · 30d</div>';
  const good=(a.type==='debt')?delta<0:delta>0;
  return '<div class="acct-change" style="color:'+(good?'var(--success)':'var(--danger)')+'">'+
    (delta>0?'▲':'▼')+' '+fmtMoney(Math.abs(delta))+' · 30d</div>';
}
// ── Debt payoff position ──────────────────────────────────────────
// Net worth answers "what am I worth"; this answers "am I actually covered". Savers accounts
// are held back from the sum so the interest pot isn't quietly counted as debt cover.
function renderPayoffCard(){
  const el=document.getElementById('accounts-payoff'); if(!el) return;
  if(!accounts.length){ el.innerHTML=''; return; }
  const debts=accountsDebtsTotal();
  const savers=accounts.filter(acctIsSaver);
  const saverTot=accountsSaverTotal();
  const pos=accountsPayoffPosition();
  const clear=pos>=0;
  const col=clear?'var(--success)':'var(--danger)';
  const headline=debts<=0
    ? 'No debts — everything here is yours'
    : (clear?'spare after clearing every debt':'still needed to clear every debt');
  const saverLine=savers.length
    ? '<div class="acct-payoff-note">Holding back '+fmtMoney(saverTot)+' in '+
        savers.map(a=>_catEscHtml(a.name||'Savers')).join(', ')+' — excluded from this total, still counted in net worth.</div>'
    : '<div class="acct-payoff-note">Flip on “Savers account” below to keep an interest account out of this total.</div>';
  el.innerHTML=
    // THREE groups, matching the net-worth card directly above: label, figure, detail. The
    // shared desktop rule spreads them with space-between, which is what puts the figure in
    // the middle — a two-group version left it hard against the left edge while net worth's
    // sat centred, and the two cards read as unrelated.
    '<div class="card acct-payoff-card">'+
      '<div class="acct-payoff-label">'+(clear?'✅':'⚠️')+' Debt payoff position</div>'+
      '<div class="acct-payoff-fig">'+
        '<div class="acct-payoff-amt" style="color:'+col+'">'+fmtMoney(Math.abs(pos))+'</div>'+
        '<div class="acct-payoff-sub">'+headline+'</div>'+
      '</div>'+
      '<div class="acct-payoff-aside">'+
        (debts>0?'<div class="acct-payoff-math">'+fmtMoney(accountsAssetsTotal()-saverTot)+' spendable − '+fmtMoney(debts)+' debts</div>':'')+
        saverLine+
      '</div>'+
    '</div>';
}
function renderAccountsPage(){
  // Net-worth header
  const nwEl=document.getElementById('accounts-networth');
  if(nwEl){
    const nw=accountsNetWorth();
    const assets=accountsAssetsTotal(), debts=accountsDebtsTotal();
    const col=nw>=0?'var(--success)':'var(--danger)';
    nwEl.innerHTML=
      '<div class="card" style="text-align:center;padding:20px 16px">'+
        '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Net worth</div>'+
        '<div style="font-family:var(--font-num);font-size:40px;font-weight:800;line-height:1;color:'+col+'">'+fmtMoney(nw)+'</div>'+
        '<div style="font-size:12px;color:var(--muted);margin-top:8px">'+fmtMoney(assets)+' assets · '+fmtMoney(debts)+' debts</div>'+
      '</div>';
  }
  renderPayoffCard();
  // One card per account
  // Section header carrying the Edit toggle — same .bud-edit-btn / "Edit"→"Done" convention as
  // the Budget tab's Income, Fixed and Variable cards.
  const headEl=document.getElementById('accounts-list-head');
  if(headEl){
    headEl.innerHTML=accounts.length
      ? '<div class="sec-label bud-toggle" style="cursor:default">'+
          '<span class="bud-head-label">Your accounts</span>'+
          '<button class="bud-edit-btn'+(_acctEditMode?' active':'')+'" onclick="acctToggleEdit()">'+
            (_acctEditMode?'Done':'Edit')+'</button>'+
        '</div>'
      : '';
  }
  const listEl=document.getElementById('accounts-list');
  if(listEl){
    if(!accounts.length){
      listEl.innerHTML='<div class="card" style="text-align:center;color:var(--muted);font-size:13px;padding:24px 16px">No accounts yet. Tap “+ Add account” to add your savings, credit card, or any other balance you want to track.</div>';
    } else {
      listEl.innerHTML=accounts.map(a=>{
        const isDebt=a.type==='debt';
        const curCol=isDebt?'var(--danger)':'var(--text)';
        let stmt='';
        if(isDebt){
          const dueTxt=acctDueText(a);
          stmt=
            '<div class="bud-row" style="border-bottom:none;padding-top:6px">'+
              '<div class="bud-row-left"><div class="bud-row-name" style="font-weight:500;color:var(--muted)">Track statement due date</div></div>'+
              '<label class="toggle-switch"><input type="checkbox"'+(a.tracksStatement?' checked':'')+' onchange="accountToggleStatement(\''+a.id+'\',this.checked)"><span class="toggle-slider"></span></label>'+
            '</div>'+
            (a.tracksStatement?
              // Wrapped so the three controls can sit inline on a wide screen (see
              // .acct-stmt-row); on mobile they stay stacked exactly as before.
              '<div class="acct-stmt-row">'+
              '<div class="bud-row" style="border-bottom:none">'+
                '<div class="bud-row-left"><div class="bud-row-name" style="font-weight:500">Statement balance</div></div>'+
                '<input class="bud-row-input" type="number" inputmode="decimal" placeholder="$0" value="'+(a.statementBalance?a.statementBalance:'')+'" onchange="accountSetStatementField(\''+a.id+'\',\'statementBalance\',this.value)">'+
              '</div>'+
              '<div class="bud-row" style="border-bottom:none">'+
                '<div class="bud-row-left"><div class="bud-row-name" style="font-weight:500">Due date</div>'+(dueTxt?'<div class="bud-row-budget"'+(dueTxt.indexOf('Overdue')===0?' style="color:var(--danger)"':'')+'>'+dueTxt+'</div>':'')+'</div>'+
                '<input class="bud-row-input" type="date" value="'+(a.dueDate?String(a.dueDate).slice(0,10):'')+'" onchange="accountSetStatementField(\''+a.id+'\',\'dueDate\',this.value)" style="width:150px">'+
              '</div>'+
              '<button class="sav-update-btn" style="width:100%;margin-top:8px" onclick="accountMarkPaid(\''+a.id+'\')">Mark statement as paid</button>'+
              '</div>'
            :'');
        }
        // Category picker — one optional select per account. "Unset" is a real option, and the
        // default, so existing accounts are untouched until deliberately categorised.
        const catList=ACCT_CATEGORIES[isDebt?'debt':'asset'];
        const catRow=
          '<div class="bud-row" style="border-bottom:none;padding-top:6px">'+
            '<div class="bud-row-left"><div class="bud-row-name" style="font-weight:500;color:var(--muted)">Category</div></div>'+
            '<select class="bud-row-input" style="text-align:left" onchange="accountSetCategory(\''+a.id+'\',this.value)">'+
              '<option value=""'+(a.category?'':' selected')+'>Not set</option>'+
              catList.map(c=>'<option value="'+c.id+'"'+(a.category===c.id?' selected':'')+'>'+c.label+'</option>').join('')+
            '</select>'+
          '</div>';
        // Credit limit — debts only, and only meaningful for revolving credit, but offered on
        // any debt since a loan's original principal works the same way as a progress figure.
        let limitRow='';
        if(isDebt){
          const util=acctUtilisation(a);
          limitRow=
            '<div class="bud-row" style="border-bottom:none;padding-top:6px">'+
              '<div class="bud-row-left"><div class="bud-row-name" style="font-weight:500;color:var(--muted)">Credit limit</div>'+
                (util!==null
                  ? '<div class="bud-row-budget" style="color:'+acctUtilColour(util)+';font-weight:700">'+util.toFixed(0)+'% used'+
                    (util>=80?' · high':'')+'</div>'
                  : '<div class="bud-row-budget">Optional — shows how much of it you are using</div>')+
              '</div>'+
              '<input class="bud-row-input" type="number" inputmode="decimal" placeholder="$0" value="'+(a.limit?a.limit:'')+'" onchange="accountSetLimit(\''+a.id+'\',this.value)">'+
            '</div>'+
            (util!==null
              ? '<div class="card-bar" style="margin:2px 2px 8px"><div class="card-bar-fill" style="width:'+Math.min(100,util).toFixed(1)+'%;background:'+acctUtilColour(util)+'"></div></div>'
              : '');
        }
        // Assets can be flagged as a savers account: still net worth, held out of the payoff total.
        let saverRow='';
        if(!isDebt){
          saverRow=
            '<div class="bud-row" style="border-bottom:none;padding-top:6px">'+
              '<div class="bud-row-left"><div class="bud-row-name" style="font-weight:500;color:var(--muted)">Savers account</div>'+
                '<div class="bud-row-budget">Excluded from the payoff total</div></div>'+
              '<label class="toggle-switch"><input type="checkbox"'+(a.saver?' checked':'')+' onchange="accountToggleSaver(\''+a.id+'\',this.checked)"><span class="toggle-slider"></span></label>'+
            '</div>';
        }
        const typeTag=(!isDebt&&a.saver)?'🔒 Savers':(isDebt?'Debt':'Asset');
        const typeCol=isDebt?'var(--danger)':((a.saver)?'var(--blue)':'var(--success)');
        return '<div class="card">'+
          '<div class="bud-row" style="border-bottom:1px solid var(--border)">'+
            (_acctEditMode
              ? '<input class="bud-cat-name-input" value="'+_catEsc(a.name)+'" placeholder="Account name" onchange="accountRename(\''+a.id+'\',this.value)" style="flex:1;font-weight:700">'
              : '<div style="flex:1;min-width:0;font-weight:700;font-size:15px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+_catEscHtml(a.name||'Untitled')+'</div>')+
            '<span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:'+typeCol+';margin:0 8px;white-space:nowrap">'+typeTag+'</span>'+
            // Destructive, so it only exists while deliberately in edit mode.
            (_acctEditMode?'<button class="lib-del-btn" onclick="accountDelete(\''+a.id+'\')" aria-label="Delete account">×</button>':'')+
          '</div>'+
          '<div class="bud-row" style="border-bottom:none">'+
            '<div class="bud-row-left"><div class="bud-row-name">Current balance</div>'+
              '<div class="bud-row-budget">'+(a.history&&a.history.length?a.history.length+' update'+(a.history.length===1?'':'s')+' logged':'No history yet')+'</div>'+
              acctChangeHtml(a)+'</div>'+
            '<div style="display:flex;align-items:center;gap:6px">'+
              '<input class="bud-row-input" id="acct-bal-'+a.id+'" type="number" inputmode="decimal" placeholder="$0" value="'+(a.current||a.current===0?a.current:'')+'" style="color:'+curCol+'">'+
              '<button class="sav-update-btn" onclick="accountUpdateBalanceFromInput(\''+a.id+'\')">Update</button>'+
            '</div>'+
          '</div>'+
          // Clarify that a debt balance is a standalone running total, not weekly spending —
          // the note that used to live in the retired Budget-tab CC editor.
          catRow+
          limitRow+
          saverRow+
          (isDebt?'<div class="acct-note" style="font-size:12px;color:var(--muted);line-height:1.45;padding:2px 2px 4px">This is the total currently owed — a separate running debt, not counted in your weekly leftover. Enter card purchases in your Variable spending categories as usual, same as cash.</div>':'')+
          stmt+
        '</div>';
      }).join('');
    }
  }
  // Add-account form / button
  const formEl=document.getElementById('accounts-addform');
  if(formEl){
    if(!_acctAddOpen){
      formEl.innerHTML='<button class="add-cat-btn" style="width:100%;margin-top:4px" onclick="accountsAddOpen()">+ Add account</button>';
    } else {
      formEl.innerHTML=
        '<div class="card">'+
          '<div class="bud-row" style="border-bottom:none"><input class="modal-input" id="acct-new-name" type="text" placeholder="Account name (e.g. Savings, Visa)"></div>'+
          '<div class="bud-row" style="border-bottom:none">'+
            '<div class="bud-row-left"><div class="bud-row-name">Type</div></div>'+
            '<div class="acct-type-seg">'+
              '<button class="acct-type-btn'+(_acctAddType==='asset'?' on':'')+'" onclick="accountsAddSetType(\'asset\')">Asset</button>'+
              '<button class="acct-type-btn'+(_acctAddType==='debt'?' on':'')+'" onclick="accountsAddSetType(\'debt\')">Debt</button>'+
            '</div>'+
          '</div>'+
          (_acctAddType==='debt'?
            '<div class="bud-row" style="border-bottom:none">'+
              '<div class="bud-row-left"><div class="bud-row-name" style="font-weight:500;color:var(--muted)">Track statement due date</div></div>'+
              '<label class="toggle-switch"><input type="checkbox"'+(_acctAddTracks?' checked':'')+' onchange="accountsAddSetTracks(this.checked)"><span class="toggle-slider"></span></label>'+
            '</div>':
            '<div class="bud-row" style="border-bottom:none">'+
              '<div class="bud-row-left"><div class="bud-row-name" style="font-weight:500;color:var(--muted)">Savers account</div>'+
                '<div class="bud-row-budget">Excluded from the debt payoff total</div></div>'+
              '<label class="toggle-switch"><input type="checkbox"'+(_acctAddSaver?' checked':'')+' onchange="accountsAddSetSaver(this.checked)"><span class="toggle-slider"></span></label>'+
            '</div>')+
          '<div style="display:flex;gap:8px;margin-top:10px">'+
            '<button class="modal-btn secondary" onclick="accountsAddCancel()">Cancel</button>'+
            '<button class="modal-btn primary" onclick="accountsAddConfirm()">Add account</button>'+
          '</div>'+
        '</div>';
      setTimeout(()=>{ document.getElementById('acct-new-name')?.focus(); },50);
    }
  }
  // Net-worth trend — the same chart Stats → Finance renders, shown here where the balances
  // that feed it are actually edited.
  renderNetWorthChartInto('accounts-chart');
}
// Add-form controllers
function accountsAddOpen(){ _acctAddOpen=true; _acctAddType='asset'; _acctAddTracks=false; _acctAddSaver=false; renderAccountsPage(); }
function accountsAddCancel(){ _acctAddOpen=false; renderAccountsPage(); }
function accountsAddSetType(t){ _acctAddType=t; if(t!=='debt') _acctAddTracks=false; else _acctAddSaver=false; renderAccountsPage(); }
function accountsAddSetSaver(on){ _acctAddSaver=!!on; }
function accountsAddSetTracks(on){ _acctAddTracks=!!on; }
function accountsAddConfirm(){
  const name=(document.getElementById('acct-new-name')?.value||'').trim();
  if(!name){ document.getElementById('acct-new-name')?.focus(); return; }
  accounts.push({ id:genAccountId(), name, type:(_acctAddType==='debt'?'debt':'asset'),
    tracksStatement:(_acctAddType==='debt'&&_acctAddTracks), saver:(_acctAddType!=='debt'&&_acctAddSaver),
    current:0, statementBalance:0, dueDate:'', history:[] });
  saveAccounts(accounts);
  _acctAddOpen=false;
  renderAccountsPage();
}
// Per-account controllers (mirror the budget-category add/rename/delete convention)
function accountRename(id,val){
  const a=accounts.find(x=>x&&x.id===id); if(!a) return;
  a.name=(val||'').trim()||a.name;
  saveAccounts(accounts); renderAccountsPage();
}
function accountDelete(id){
  const a=accounts.find(x=>x&&x.id===id); if(!a) return;
  if(!confirm('Delete “'+(a.name||'this account')+'”? Its balance history will be removed.')) return;
  accounts=accounts.filter(x=>x&&x.id!==id);
  saveAccounts(accounts); renderAccountsPage();
}
function accountUpdateBalanceFromInput(id){
  const el=document.getElementById('acct-bal-'+id); if(!el) return;
  const v=parseFloat(String(el.value).replace(/[^0-9.-]/g,''));
  if(isNaN(v)) return;
  accountLogBalance(id, v); // dated history entry + current update + sync (phase 1)
  renderAccountsPage();
}
function accountToggleSaver(id,on){
  const a=accounts.find(x=>x&&x.id===id); if(!a) return;
  a.saver=!!on;
  saveAccounts(accounts); renderAccountsPage();
}
function accountToggleStatement(id,on){
  const a=accounts.find(x=>x&&x.id===id); if(!a) return;
  a.tracksStatement=!!on;
  saveAccounts(accounts); renderAccountsPage();
}
function accountSetStatementField(id,field,val){
  const a=accounts.find(x=>x&&x.id===id); if(!a) return;
  if(field==='statementBalance') a.statementBalance=parseFloat(val)||0;
  else if(field==='dueDate') a.dueDate=val||'';
  saveAccounts(accounts); renderAccountsPage();
}
// ── Credit limit & utilisation ────────────────────────────────────
// Optional per-debt field. Absent on every existing account, and every reader below treats
// absent as "no limit set", so nothing needs migrating.
// Utilisation is worth surfacing on its own terms: $2,000 owed means something different on a
// $2,500 limit than on a $10,000 one, and the balance alone can't say which.
function accountSetLimit(id,val){
  const a=accounts.find(x=>x&&x.id===id); if(!a) return;
  const n=parseFloat(val);
  if(isNaN(n)||n<=0) delete a.limit; else a.limit=n;
  saveAccounts(accounts); renderAccountsPage();
  if(S.view==='home'&&typeof renderHome==='function') renderHome();
}
function acctUtilisation(a){
  if(!a||a.type!=='debt') return null;
  const lim=parseFloat(a.limit); if(isNaN(lim)||lim<=0) return null;
  return Math.max(0,(parseFloat(a.current)||0)/lim*100);
}
// 30% is the usual "healthy" threshold and 80% is where it starts to look stretched; these are
// semantic, not accent-driven, for the same reason the budget card's colours are.
function acctUtilColour(pct){
  return pct>=80?'var(--danger)':pct>=30?'#f59e0b':'var(--positive)';
}
// ── Account categories ────────────────────────────────────────────
// A flat asset/debt split can't tell a credit card apart from money you owe a person, and had
// no way at all to record money owed TO you — which is an asset that isn't sitting in any
// account. `category` is one optional string; absent means "unset" and behaves exactly as
// before, so no migration.
const ACCT_CATEGORIES={
  asset:[ {id:'cash',   label:'Cash / everyday'},
          {id:'savings',label:'Savings'},
          {id:'invest', label:'Investments'},
          {id:'owed',   label:'Owed to me'} ],
  debt: [ {id:'card',   label:'Credit card'},
          {id:'loan',   label:'Loan'},
          {id:'person', label:'Owed to a person'},
          {id:'bill',   label:'Bill / arrears'} ]
};
function acctCategoryLabel(a){
  if(!a||!a.category) return null;
  const list=ACCT_CATEGORIES[a.type==='debt'?'debt':'asset'];
  const hit=list.find(c=>c.id===a.category);
  return hit?hit.label:null;
}
function accountSetCategory(id,val){
  const a=accounts.find(x=>x&&x.id===id); if(!a) return;
  if(!val) delete a.category; else a.category=val;
  saveAccounts(accounts); renderAccountsPage();
  if(S.view==='home'&&typeof renderHome==='function') renderHome();
}
function accountMarkPaid(id){
  const a=accounts.find(x=>x&&x.id===id); if(!a) return;
  // Clears the statement reminder (this cycle is settled). The running debt total (current)
  // is edited separately via Update — paying a statement doesn't necessarily zero the card.
  a.statementBalance=0; a.dueDate='';
  saveAccounts(accounts); renderAccountsPage();
  if(typeof showToast==='function') showToast('Statement marked paid');
}

// ── Navigation ──
function obGo(step){
  obCaptureCurrent();
  obStep = Math.max(0, Math.min(step, OB_STEPS.length-1));
  renderObStep();
}
function obNext(){ obGo(obStep+1); }
function obBack(){ obGo(obStep-1); }
function obProfileContinue(){
  const name=(document.getElementById('ob-name')?.value||'').trim();
  if(!name){ const e=document.getElementById('ob-error'); if(e) e.style.display='block'; return; }
  obNext();
}

// Read the current step's inputs into obData before the DOM is replaced. Theme, goal and
// habits are captured live by their own tap handlers, so only the text/number/select
// fields need reading here.
function obCaptureCurrent(){
  const step=OB_STEPS[obStep];
  const val=id=>{ const el=document.getElementById(id); return el?el.value:undefined; };
  if(step==='profile'){
    // Income + fixed expenses are edited live via the shared budgetConfig list editor
    // (renderBudgetEditList), so only name + savings need reading from the DOM here.
    obData.name=(val('ob-name')||'').trim();
    obData.savings=obNum(val('ob-savings'));
  } else if(step==='body'){
    obData.age=obNum(val('ob-age'));
    if(val('ob-sex')!==undefined) obData.sex=val('ob-sex');
    obData.height=obNum(val('ob-height'));
    obData.weight=obNum(val('ob-weight'));
    if(val('ob-activity')!==undefined) obData.activity=val('ob-activity');
    obData.wgTarget=obNum(val('ob-wg-target'));
    obData.wgDate=val('ob-wg-date')||'';
  }
}

// ── Live tap handlers ──
function obSetTheme(t){ obData.theme=t; setTheme(t); renderObStep(); } // re-themes overlay + app live
function obSetGoal(g){ obCaptureCurrent(); obData.goal=g; renderObStep(); }
function obToggleHabit(i){
  const h=obHabitOptions[i]; if(h==null) return;
  obCaptureCurrent();
  const idx=obData.habits.findIndex(x=>x.toLowerCase()===h.toLowerCase());
  if(idx>=0) obData.habits.splice(idx,1); else obData.habits.push(h);
  renderObStep();
}
function obAddCustomHabit(){
  const el=document.getElementById('ob-habit-custom');
  const v=(el?.value||'').trim(); if(!v) return;
  if(!obData.habits.some(h=>h.toLowerCase()===v.toLowerCase())) obData.habits.push(v);
  renderObStep();
  setTimeout(()=>{ const c=document.getElementById('ob-habit-custom'); if(c) c.focus(); },30);
}

// ── Cloud-sync step ──
function obSignIn(){
  if(!(firebaseReady&&auth)){ obNext(); return; }
  obAttachAuthWatch();
  // Same reporting as the welcome-screen button: a blocked popup must not leave this step
  // waiting silently for a result that never arrives.
  handleAuth().catch(err=>{ if(typeof showToast==='function') showToast(authErrorMessage(err)); });
}
function obAttachAuthWatch(){
  if(!firebaseReady||!auth||obAuthUnsub) return;
  obAuthUnsub = auth.onAuthStateChanged(u=>{
    if(u && OB_STEPS[obStep]==='sync'){ obData.synced=true; obGo(OB_STEPS.indexOf('done')); }
  });
}
function obDetachAuthWatch(){ if(obAuthUnsub){ try{ obAuthUnsub(); }catch(e){} obAuthUnsub=null; } }

// ── Renderer ──
function renderObStep(){
  const box=document.getElementById('onboarding-box'); if(!box) return;
  const step=OB_STEPS[obStep];
  const dots='<div class="ob-dots">'+OB_STEPS.map((_,i)=>'<div class="ob-dot'+(i===obStep?' active':'')+'"></div>').join('')+'</div>';
  const showBack = obStep>0 && step!=='done';
  const topbar='<div class="ob-topbar">'+(showBack?'<button class="ob-back" onclick="obBack()">‹ Back</button>':'')+'</div>';
  if(step==='profile') obEnsureBudgetStarter(); // blank the budget for new users before we render its editors
  let inner='';
  if(step==='welcome') inner=obWelcomeHTML();
  else if(step==='theme') inner=obThemeHTML();
  else if(step==='profile') inner=obProfileHTML();
  else if(step==='body') inner=obBodyHTML();
  else if(step==='split') inner=obSplitHTML();
  else if(step==='habits') inner=obHabitsHTML();
  else if(step==='sync') inner=obSyncHTML();
  else inner=obDoneHTML();
  box.innerHTML=topbar+dots+inner;
  box.scrollTop=0;
  if(step==='profile'){
    // Live income + fixed-expense list editors (shared budgetConfig system)
    renderBudgetEditList('ob-inc-list','incomeStreams');
    renderBudgetEditList('ob-fix-list','fixedExpenses');
    setTimeout(()=>{ const el=document.getElementById('ob-name'); if(el&&!el.value) el.focus(); },50);
  }
  if(step==='split') renderSplitEditor('se-wrap');
  if(step==='sync' && !(auth&&auth.currentUser)) obAttachAuthWatch();
}

function obFeature(icon,text){ return '<li><span class="ob-feat-ic">'+icon+'</span>'+text+'</li>'; }
function obWelcomeHTML(){
  return '<div class="ob-center">'+
    '<img class="wordmark-img wordmark-light" src="daily-wordmark-light.png" alt="Daily">'+
    '<img class="wordmark-img wordmark-dark" src="daily-wordmark-dark.png" alt="Daily">'+
    '<div class="ob-tagline">One place for your training, nutrition, budget, kitchen and notes — all in sync.</div>'+
    '<ul class="ob-feature-list">'+
      obFeature('🏋️','Log workouts &amp; track PRs')+
      obFeature('🍎','Calories, TDEE &amp; weight goals')+
      obFeature('💰','Weekly budget &amp; savings')+
      obFeature('🍳','Recipes, shopping &amp; pantry')+
    '</ul>'+
    '<button class="ob-btn-primary" onclick="obNext()">Get started →</button>'+
    // Returning users could only sign in at the 'sync' step, second from last — six screens
    // of setup before they could pull down the account they already had. This restores it
    // immediately, and skips the rest once the cloud profile lands.
    ((firebaseReady&&auth)?
      '<button class="ob-btn-link" id="ob-restore-btn" onclick="obSignInExisting()">I already have an account — sign in</button>'+
      '<div class="ob-restore-note" id="ob-restore-note"></div>'
      :'')+
  '</div>';
}
// Sign in from the welcome screen and, if the account has data, skip onboarding entirely.
// A brand-new Google account has nothing to restore, so that case falls through into the
// normal flow rather than dropping the user into an empty app with no name.
let _obRestoreTimer=null;
// Close the overlay without saving any onboarding answers.
function obDismiss(){
  clearInterval(_obRestoreTimer);
  obDetachAuthWatch();
  const ov=document.getElementById('onboarding-overlay');
  if(ov) ov.classList.add('hidden');
  if(typeof applyTheme==='function') applyTheme();
  if(typeof applyDayColour==='function') applyDayColour();
  if(typeof renderHome==='function') renderHome();
  if(typeof updateHeaderAvatar==='function') updateHeaderAvatar();
}
let _obOpenWatchdog=null;
function obSignInExisting(){
  if(!(firebaseReady&&auth)) return;
  const say=t=>{ const n=document.getElementById('ob-restore-note'); if(n) n.textContent=t; };
  if(isEmbeddedBrowser()){
    say('Google will not allow sign-in inside another app’s browser. Open Daily in Safari or Chrome, then tap this again.');
    return;
  }
  say('Opening sign-in…');
  // A blocked popup can hang without ever rejecting, so never leave this state spinning
  // with no explanation of what to do next.
  clearTimeout(_obOpenWatchdog);
  _obOpenWatchdog=setTimeout(()=>{
    const n=document.getElementById('ob-restore-note');
    if(n && /Opening sign-in/.test(n.textContent))
      say('Still waiting on Google. If the sign-in window is blank, this browser is blocking it — open Daily in Safari or Chrome instead.');
  },12000);
  obDetachAuthWatch();
  obAuthUnsub=auth.onAuthStateChanged(u=>{
    if(!u) return;
    say('Signed in — looking for your data…');
    // The profile arrives asynchronously via fbReconcile. Poll briefly for a name rather than
    // racing it; give up gracefully instead of hanging if this account is genuinely new.
    // Real elapsed time, not a tick count: a backgrounded tab throttles setInterval to about
    // once a second, so counting 400ms per tick stretched a 6s wait past 9s in practice.
    const startedAt=Date.now();
    clearInterval(_obRestoreTimer);
    _obRestoreTimer=setInterval(()=>{
      const named=!!(profileData&&(profileData.name||'').trim());
      if(named){
        clearInterval(_obRestoreTimer);
        obDetachAuthWatch();
        say('Welcome back, '+profileData.name+'!');
        // Dismiss rather than finishOnboarding(): that writes the onboarding answers (name,
        // split, habits) and would overwrite the account we just restored.
        setTimeout(obDismiss,600);
      } else if(Date.now()-startedAt>=6000){
        clearInterval(_obRestoreTimer);
        say('Signed in, but this account has no saved data yet — continuing setup. Anything you enter now will sync.');
      }
    },400);
  });
  // Report the failure rather than waiting on a result that is never coming.
  handleAuth().catch(err=>{
    clearTimeout(_obOpenWatchdog);
    clearInterval(_obRestoreTimer);
    obDetachAuthWatch();
    say(authErrorMessage(err));
  });
}
function obThemeHTML(){
  const opt=(val,label,icon)=>{
    const sel=obData.theme===val;
    return '<div class="ob-theme-opt'+(sel?' selected':'')+'" onclick="obSetTheme(\''+val+'\')">'+
      '<div class="ob-theme-mini ob-theme-mini-'+val+'">'+
        '<div class="budget-hero-card ob-mini-hero">'+
          '<div class="ob-mini-cap">Income this week</div>'+
          '<div class="ob-mini-big">$1,240</div>'+
          '<div class="ob-mini-sub">Saved $300 · Left $180</div>'+
        '</div>'+
        '<div class="ob-mini-card"></div>'+
        '<div class="ob-mini-card ob-mini-card-sm"></div>'+
      '</div>'+
      '<div class="ob-theme-name">'+icon+' '+label+(sel?' <span class="ob-theme-check">✓</span>':'')+'</div>'+
    '</div>';
  };
  return '<div class="ob-head"><div class="ob-title">Pick your look</div><div class="ob-desc">Tap to preview live — you can change it anytime in Settings.</div></div>'+
    '<div class="ob-theme-grid">'+opt('light','Light','☀️')+opt('dark','Dark','🌙')+'</div>'+
    '<button class="ob-btn-primary" onclick="obNext()">Continue →</button>';
}
function obProfileHTML(){
  const v=k=>obData[k]!==undefined&&obData[k]!==null?obData[k]:'';
  const chips=OB_FIX_CHIPS.map(c=>'<button type="button" class="ob-add-chip" onclick="obAddFixChip(\''+c+'\')">+ '+c+'</button>').join('');
  return '<div class="ob-head"><div class="ob-title">Tell us about you</div><div class="ob-desc">Only your name is required. Add your income and any fixed weekly expenses — you can change these anytime.</div></div>'+
    '<div class="settings-field"><label>Your name <span style="color:var(--danger)">*</span></label><input type="text" id="ob-name" value="'+obEsc(v('name'))+'" placeholder="e.g. Alex" autocomplete="name"></div>'+
    '<div class="ob-section-label">Income sources</div>'+
    '<div id="ob-inc-list"></div>'+
    '<div class="ob-section-label">Weekly fixed expenses</div>'+
    '<div class="ob-desc" style="margin:-4px 0 8px">Tap to add common ones, or use “+ Add item”.</div>'+
    '<div class="ob-chip-row">'+chips+'</div>'+
    '<div id="ob-fix-list"></div>'+
    '<div class="settings-field" style="margin-top:10px"><label>Weekly savings target ($)</label><input type="number" id="ob-savings" value="'+obEsc(v('savings'))+'" placeholder="e.g. 200" inputmode="decimal"></div>'+
    '<div id="ob-error" style="display:none;color:var(--danger);font-size:13px;margin:6px 0 0">Please enter your name to continue.</div>'+
    '<button class="ob-btn-primary" onclick="obProfileContinue()">Continue →</button>';
}
function obBodyHTML(){
  const v=k=>obData[k]!==undefined&&obData[k]!==null?obData[k]:'';
  const curSex=obData.sex||'male';
  const curAct=obData.activity!==undefined?String(obData.activity):'1.55';
  const goal=obData.goal||'maintain';
  const sexSel=s=>curSex===s?' selected':'';
  const actSel=a=>curAct===a?' selected':'';
  const gopt=(g,label)=>'<button type="button" class="ob-seg-btn'+(goal===g&&obData.goal!==undefined?' on':'')+'" onclick="obSetGoal(\''+g+'\')">'+label+'</button>';
  return '<div class="ob-head"><div class="ob-title">Body &amp; goals</div><div class="ob-desc">Powers your calorie targets and weight tracker. Skip and add it later in Settings.</div></div>'+
    '<div class="settings-2col">'+
      '<div class="settings-field"><label>Age</label><input type="number" id="ob-age" value="'+obEsc(v('age'))+'" placeholder="years" min="10" max="100" inputmode="numeric"></div>'+
      '<div class="settings-field"><label>Sex</label><select id="ob-sex"><option value="male"'+sexSel('male')+'>Male</option><option value="female"'+sexSel('female')+'>Female</option></select></div>'+
    '</div>'+
    '<div class="settings-2col">'+
      '<div class="settings-field"><label>Height (cm)</label><input type="number" id="ob-height" value="'+obEsc(v('height'))+'" placeholder="cm" min="100" max="250" inputmode="decimal"></div>'+
      '<div class="settings-field"><label>Weight (kg)</label><input type="number" id="ob-weight" value="'+obEsc(v('weight'))+'" placeholder="kg" min="30" max="300" step="0.1" inputmode="decimal"></div>'+
    '</div>'+
    '<div class="settings-field"><label>Activity level</label><select id="ob-activity">'+
      '<option value="1.2"'+actSel('1.2')+'>Sedentary (little/no exercise)</option>'+
      '<option value="1.375"'+actSel('1.375')+'>Lightly active (1–3×/week)</option>'+
      '<option value="1.55"'+actSel('1.55')+'>Moderately active (3–5×/week)</option>'+
      '<option value="1.725"'+actSel('1.725')+'>Very active (6–7×/week)</option>'+
      '<option value="1.9"'+actSel('1.9')+'>Extra active (athlete + job)</option>'+
    '</select></div>'+
    '<div class="ob-section-label">Goal</div>'+
    '<div class="ob-seg">'+gopt('cut','Cut')+gopt('maintain','Maintain')+gopt('bulk','Bulk')+'</div>'+
    '<div class="ob-section-label">Weight goal (optional)</div>'+
    '<div class="settings-2col">'+
      '<div class="settings-field"><label>Target (kg)</label><input type="number" id="ob-wg-target" value="'+obEsc(v('wgTarget'))+'" placeholder="kg" min="30" max="300" step="0.1" inputmode="decimal"></div>'+
      '<div class="settings-field"><label>Target date</label><input type="date" id="ob-wg-date" value="'+obEsc(v('wgDate'))+'"></div>'+
    '</div>'+
    '<div class="ob-btn-row">'+
      '<button class="ob-btn-skip" onclick="obNext()">Skip for now</button>'+
      '<button class="ob-btn-primary ob-btn-inline" onclick="obNext()">Continue →</button>'+
    '</div>';
}
function obHabitsHTML(){
  const chosen=obData.habits||[];
  obHabitOptions=OB_HABIT_SUGGESTIONS.slice();
  chosen.forEach(h=>{ if(!obHabitOptions.some(x=>x.toLowerCase()===h.toLowerCase())) obHabitOptions.push(h); });
  const chips=obHabitOptions.map((h,i)=>{
    const on=chosen.some(x=>x.toLowerCase()===h.toLowerCase());
    return '<button type="button" class="ob-habit-chip'+(on?' on':'')+'" onclick="obToggleHabit('+i+')">'+(on?'✓ ':'')+h.replace(/</g,'&lt;')+'</button>';
  }).join('');
  return '<div class="ob-head"><div class="ob-title">Daily habits</div><div class="ob-desc">Pick a few to check off each day. Tap to toggle — edit anytime later.</div></div>'+
    '<div class="ob-habit-wrap">'+chips+'</div>'+
    '<div class="ob-habit-add"><input type="text" id="ob-habit-custom" placeholder="Add your own…" onkeydown="if(event.key===\'Enter\'){event.preventDefault();obAddCustomHabit();}"><button type="button" onclick="obAddCustomHabit()">Add</button></div>'+
    '<div class="ob-btn-row">'+
      '<button class="ob-btn-skip" onclick="obNext()">Skip</button>'+
      '<button class="ob-btn-primary ob-btn-inline" onclick="obNext()">Continue →</button>'+
    '</div>';
}
function obSyncHTML(){
  const signedIn = firebaseReady && auth && auth.currentUser;
  if(signedIn){
    const email=(auth.currentUser.email||'').replace(/</g,'&lt;');
    return '<div class="ob-head"><div class="ob-title">Cloud sync</div></div>'+
      '<div class="ob-sync-box"><div class="ob-sync-ic">☁️</div><div class="ob-sync-title">You\'re connected</div>'+
        '<div class="ob-sync-desc">Synced as '+(email||'your Google account')+'. Everything backs up across your devices automatically.</div></div>'+
      '<button class="ob-btn-primary" onclick="obNext()">Continue →</button>';
  }
  const canAuth = firebaseReady && auth;
  const googleBtn = canAuth
    ? '<button class="ob-btn-google" onclick="obSignIn()"><svg viewBox="0 0 24 24" width="18" height="18" style="flex-shrink:0"><path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>Sign in with Google</button>'
    : '<div class="ob-desc" style="text-align:center;margin-top:14px">Sync isn\'t available in this build.</div>';
  return '<div class="ob-head"><div class="ob-title">Sync across devices</div><div class="ob-desc">Optional — sign in to back up your data and pick up right where you left off on any device.</div></div>'+
    '<div class="ob-sync-box"><div class="ob-sync-ic">☁️</div><div class="ob-sync-title">Google sync</div>'+
      '<div class="ob-sync-desc">Free and private to your account. You can always sign in later from Settings.</div></div>'+
    googleBtn+
    '<button class="ob-btn-skip ob-btn-block" onclick="obNext()">Skip for now</button>';
}
function obDoneHTML(){
  const name=(obData.name||'').trim();
  const synced = obData.synced || (firebaseReady && auth && auth.currentUser);
  const bits=[];
  if(obData.age&&obData.height&&obData.weight) bits.push('calorie targets');
  if(obData.wgTarget!==undefined&&isFinite(obData.wgTarget)) bits.push('a weight goal');
  const habN=(obData.habits||[]).length;
  if(habN) bits.push(habN+' habit'+(habN!==1?'s':''));
  if(synced) bits.push('cloud sync');
  let line='Your tracker is ready.';
  if(bits.length){
    const list = bits.length===1?bits[0]:bits.slice(0,-1).join(', ')+' and '+bits[bits.length-1];
    line='We set up '+list+'.';
  }
  return '<div class="ob-center">'+
    '<div class="ob-done-emoji">🎉</div>'+
    '<div class="ob-title" style="font-size:26px">You\'re all set'+(name?', '+name.replace(/</g,'&lt;'):'')+'!</div>'+
    '<div class="ob-desc" style="margin:10px 0 40px">'+line+'<br>Update anything anytime in Settings.</div>'+
    '<button class="ob-btn-primary" onclick="finishOnboarding()">Go to app →</button>'+
  '</div>';
}

// Mirror the onboarding budgetConfig entries into the live per-week category stores the
// Budget tab reads. Only runs for stores that are still unset (a brand-new user), so an
// existing account is never overwritten.
function seedBudgetCategoriesFromConfig(){
  const wkKey=weekKey(getMondayOf(0));
  let touchedWeek=false;
  const ensureWeek=()=>{ if(!budgetData[wkKey]) budgetData[wkKey]={}; return budgetData[wkKey]; };
  // Every config entry becomes a live category carrying its weekly amount as that category's
  // budget, so what the user planned in onboarding IS the category list from day one. Variable
  // was previously skipped entirely, which is why the plan and the categories started life
  // already out of step for every new account.
  const seed=(type, prefix, fallbackName, prefillWeek)=>{
    if(localStorage.getItem(BUD_CAT_KEY[type])!=null) return;   // real categories already exist
    const items=((budgetConfig&&budgetConfig[BUD_CFG_KEY[type]])||[])
      .filter(s=>(s.name||'').trim()||parseFloat(s.weeklyAmount)>0);
    BUD_CAT_SAVE[type](items.length
      ? items.map((s,i)=>({id:prefix+(i+1), name:(s.name||(fallbackName+' '+(i+1))).trim(), budget:parseFloat(s.weeklyAmount)||0}))
      : [{id:prefix+'1', name:fallbackName, budget:''}]);
    // Income and fixed are known up front, so this week starts pre-filled. Variable is what
    // you actually spend — prefilling it would claim spending that hasn't happened yet.
    if(!prefillWeek) return;
    items.forEach((s,i)=>{
      const amt=parseFloat(s.weeklyAmount)||0;
      if(amt>0){ ensureWeek()[type+'_'+prefix+(i+1)]=String(amt); touchedWeek=true; }
    });
  };
  seed('inc','inc','Income',true);
  seed('fix','fix','Fixed',true);
  seed('var','var','Variable',false);
  if(touchedWeek && typeof budSaveData==='function'){
    budgetData[wkKey].updatedAt=Date.now();
    budSaveData(wkKey);
  }
}

function finishOnboarding(){
  obCaptureCurrent();
  const name=(obData.name||'').trim()||profileData.name||'';

  // Profile + version stamp
  profileData.name = name;
  profileData.onboardingVersion = OB_VERSION;
  profileData.lastSeenWhatsNew = WHATS_NEW_VERSION;   // brand-new users start "caught up"
  localStorage.setItem('daily_profile', JSON.stringify(profileData));
  syncProfileToFirebase();

  // Savings target/goal feed getSavingsGoal + the Home projection. Income + fixed expenses
  // were captured live into budgetConfig by the profile step's list editors — nothing to
  // rebuild here.
  if(obData.savings!==undefined){ budDefaults.weeklySavings=obData.savings; budDefaults.savingsGoal=obData.savings; }
  localStorage.setItem('daily_budget_defaults', JSON.stringify(budDefaults));
  syncBudDefaultsToFirebase();

  // For a brand-new user, mirror the onboarding budget into the live category stores the
  // Budget tab actually reads (loadIncCats/loadFixCats) + seed this week's amounts, so the
  // tab reflects their entries and never falls back to the app's built-in sample names.
  // Gated on "unset" so an existing account (which already has these saved) is never touched.
  seedBudgetCategoriesFromConfig();

  // Training split — commit what they built (or the neutral default if skipped). Only for a
  // genuinely new account (no logged sessions), so an existing user who ever re-runs onboarding
  // keeps their migrated/edited split and workout history untouched.
  if(!S.sessions.length){
    if(obData.splitSkipped || !obSplitDraft){
      // Split step skipped. Only seed the neutral default on a genuinely fresh install — NEVER
      // overwrite a split the user already has. A split can be customised before any workout is
      // logged, so "no sessions" alone is not proof of a new account; an existing wt_split is.
      if(localStorage.getItem('wt_split')==null){
        splitConfig = genericSplit();
        saveSplit();
        S.dayIdx = 0;
        initDay(suggestDay());
      }
    } else {
      // User actively built a split this run → apply their choice.
      const cfg = daysToSplit(obSplitDraft);
      splitConfig = cfg.types.length ? cfg : genericSplit();
      saveSplit();
      S.dayIdx = 0;
      initDay(suggestDay());
    }
  }

  // Personal info — same store Settings → Health + calcGoalCals()/renderTDEESection() use.
  // Only written when a real measurement or an explicit goal was given, so a fully-skipped
  // Body step leaves the store untouched.
  if(obData.age||obData.height||obData.weight||obData.goal){
    S.personalInfo = Object.assign({}, S.personalInfo, {
      name,
      age: obData.age||S.personalInfo.age||null,
      sex: obData.sex||S.personalInfo.sex||'male',
      height: obData.height||S.personalInfo.height||null,
      weight: obData.weight||S.personalInfo.weight||null,
      activity: obData.activity||S.personalInfo.activity||'1.55',
      goal: obData.goal||S.personalInfo.goal||'maintain',
    });
    localStorage.setItem('wt_personalinfo', JSON.stringify(S.personalInfo));
    syncPersonalInfoToFirebase();
  }

  // Weight goal (reuses the daily_weight_goal store + its Firebase sync)
  if(obData.wgTarget!==undefined && isFinite(obData.wgTarget)){
    weightGoal = { target: obData.wgTarget, date: obData.wgDate||null };
    localStorage.setItem('daily_weight_goal', JSON.stringify(weightGoal));
    syncWeightGoalToFirebase();
  }

  // Starter habits
  if(Array.isArray(obData.habits) && obData.habits.length){
    habitsData = obData.habits.slice();
    localStorage.setItem('daily_habits', JSON.stringify(habitsData));
    pushHabits();
  }

  obDetachAuthWatch();
  document.getElementById('onboarding-overlay').classList.add('hidden');
  renderHome();
}
function resetOnboarding(){
  profileData.name='';
  localStorage.setItem('daily_profile', JSON.stringify(profileData));
  showOnboarding();
}

// ── Reminders ────────────────────────────────────────────────────
function loadReminders(){ return lsLoad('daily_reminders', {}); }
function saveReminders(r){ lsSave('daily_reminders', r); }
function checkReminders(){
  if(!('Notification' in window)) return;
  const r=loadReminders();
  const today=getLocalDate();
  const now=new Date();
  const nowMins=now.getHours()*60+now.getMinutes();

  // Workout reminder
  const wr=r.workout||{};
  if(wr.enabled){
    const [wH,wM]=(wr.time||'07:00').split(':').map(Number);
    const wAck=localStorage.getItem('daily_reminder_workout_date');
    if(nowMins>=wH*60+wM && wAck!==today){
      if(Notification.permission==='granted'){
        const nxt=type(suggestDay());
        new Notification('Time to train 💪',{body:nxt.name+' is up — let\'s go.',icon:'icon-192.png'});
        localStorage.setItem('daily_reminder_workout_date',today);
      } else if(Notification.permission!=='denied'){
        Notification.requestPermission().then(p=>{ if(p==='granted') checkReminders(); });
      }
    }
  }

  // Budget reminder
  const br=r.budget||{};
  if(br.enabled){
    const todayDay=new Date(today+'T12:00:00').getDay();
    const [bH,bM]=(br.time||'20:00').split(':').map(Number);
    const bAck=localStorage.getItem('daily_reminder_budget_date');
    if(todayDay===(br.day??0) && nowMins>=bH*60+bM && bAck!==today){
      if(Notification.permission==='granted'){
        new Notification('Save your week 💰',{body:"Don't forget to log this week's budget before it resets.",icon:'icon-192.png'});
        localStorage.setItem('daily_reminder_budget_date',today);
      } else if(Notification.permission!=='denied'){
        Notification.requestPermission().then(p=>{ if(p==='granted') checkReminders(); });
      }
    }
  }
}
function renderRemindersSection(){
  const wrap=document.getElementById('reminders-inner'); if(!wrap) return;
  const r=loadReminders();
  const wr=r.workout||{enabled:false,time:'07:00'};
  const br=r.budget||{enabled:false,day:0,time:'20:00'};
  const denied='Notification' in window && Notification.permission==='denied';
  const deniedBanner=denied?'<div style="background:rgba(231,76,60,0.12);border:1px solid var(--danger);border-radius:8px;padding:10px 12px;font-size:12px;color:var(--danger);margin-bottom:12px">⚠️ Notifications blocked — enable them in your browser settings</div>':'';
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayOpts=days.map((d,i)=>`<option value="${i}"${i===(br.day??0)?' selected':''}>${d}</option>`).join('');
  wrap.innerHTML=`
    ${deniedBanner}
    <div class="settings-card">
      <div class="settings-card-title" style="cursor:default">🏋️ Daily workout reminder</div>
      <div class="settings-row" style="margin-bottom:12px">
        <span class="settings-row-label">Enable</span>
        <label class="toggle-switch"><input type="checkbox" id="rem-workout-enabled"${wr.enabled?' checked':''} onchange="saveReminderField('workout','enabled',this.checked)"><span class="toggle-slider"></span></label>
      </div>
      <div class="settings-field"><label>Remind me at</label><input type="time" id="rem-workout-time" value="${wr.time||'07:00'}" onchange="saveReminderField('workout','time',this.value)" style="height:44px;border:1.5px solid var(--border);border-radius:8px;font-size:15px;padding:0 12px;background:var(--card);color:var(--text);width:100%"></div>
    </div>
    <div class="settings-card">
      <div class="settings-card-title" style="cursor:default">💰 Weekly budget reminder</div>
      <div class="settings-row" style="margin-bottom:12px">
        <span class="settings-row-label">Enable</span>
        <label class="toggle-switch"><input type="checkbox" id="rem-budget-enabled"${br.enabled?' checked':''} onchange="saveReminderField('budget','enabled',this.checked)"><span class="toggle-slider"></span></label>
      </div>
      <div class="settings-field"><label>Day</label><select id="rem-budget-day" onchange="saveReminderField('budget','day',parseInt(this.value))">${dayOpts}</select></div>
      <div class="settings-field"><label>Time</label><input type="time" id="rem-budget-time" value="${br.time||'20:00'}" onchange="saveReminderField('budget','time',this.value)" style="height:44px;border:1.5px solid var(--border);border-radius:8px;font-size:15px;padding:0 12px;background:var(--card);color:var(--text);width:100%"></div>
    </div>`;
}
function saveReminderField(type,field,value){
  const r=loadReminders();
  if(!r[type]) r[type]={};
  r[type][field]=value;
  saveReminders(r);
  if(field==='enabled' && value && 'Notification' in window && Notification.permission==='default'){
    Notification.requestPermission().then(()=>renderRemindersSection());
  }
}

// ══ KITCHEN: Recipe Book ══════════════════════════════════════════
function kitUUID(){
  return (crypto&&crypto.randomUUID)?crypto.randomUUID():'r'+Date.now()+Math.random().toString(16).slice(2);
}
function kitSeedRecipes(){
  const ig=(name,amount,unit)=>({name,amount,unit:unit||''});
  const mk=(o)=>Object.assign({id:kitUUID(),description:'',tags:[],calories:null,protein:null,carbs:null,fat:null,favourite:false,batchPrep:false,createdAt:Date.now()},o);
  return [
    mk({name:'French Toast with Berries',category:'breakfast',servings:2,
      description:'Golden eggy toast with fresh berries and maple syrup.',
      ingredients:[ig('Eggs',3,''),ig('Milk',0.25,'cup'),ig('Bread',4,'slices'),ig('Vanilla',1,'tsp'),ig('Cinnamon',0.5,'tsp'),ig('Butter',1,'tbsp'),ig('Mixed berries',1,'cup'),ig('Maple syrup',2,'tbsp')],
      steps:['Whisk eggs, milk, vanilla and cinnamon.','Dip bread in the mixture.','Cook in butter 2–3 min each side until golden.','Serve with berries and maple syrup.'],
      tags:['quick'],calories:420,protein:16,carbs:58,fat:14}),
    mk({name:'Hash Browns',category:'breakfast',servings:2,
      description:'Crispy golden potato patties.',
      ingredients:[ig('Potatoes',4,'medium'),ig('Canola oil',2,'tbsp'),ig('Salt','',''),ig('Pepper','','')],
      steps:['Grate potatoes.','Squeeze out moisture.','Season.','Form into patties.','Fry 4–5 min each side until crispy.'],
      tags:['quick','batch-prep'],calories:280,protein:4,carbs:48,fat:9,batchPrep:true}),
    mk({name:'Honey Soy Chicken Thighs + Basmati Rice',category:'lunch',servings:4,
      description:'Sticky honey soy chicken over fluffy basmati.',
      ingredients:[ig('Chicken thighs',800,'g'),ig('Soy sauce',3,'tbsp'),ig('Honey',2,'tbsp'),ig('Garlic',3,'cloves'),ig('Ginger',1,'tsp'),ig('Sesame oil',1,'tsp'),ig('Basmati rice',2,'cups'),ig('Spring onion',2,'')],
      steps:['Mix the marinade.','Marinate chicken 30 min.','Cook rice.','Pan-fry chicken 5–6 min each side.','Slice over rice and top with spring onion.'],
      tags:['batch-prep','high-protein'],calories:520,protein:42,carbs:48,fat:14,batchPrep:true}),
    mk({name:'Spiced Lamb Pan Fry + Basmati Rice',category:'lunch',servings:4,
      description:'Aromatic spiced lamb mince with lemon and parsley.',
      ingredients:[ig('Lamb mince',600,'g'),ig('Brown onion',1,''),ig('Garlic',3,'cloves'),ig('Garam masala',2,'tsp'),ig('Cumin',1,'tsp'),ig('Smoked paprika',1,'tsp'),ig('Basmati rice',2,'cups'),ig('Lemon',1,''),ig('Parsley','','')],
      steps:['Cook rice.','Fry onion.','Add garlic then lamb.','Add spices.','Squeeze lemon.','Serve over rice with parsley.'],
      tags:['batch-prep','high-protein'],calories:490,protein:38,carbs:44,fat:18,batchPrep:true}),
    mk({name:'Korean Crispy Beef Mince + Rice',category:'lunch',servings:4,
      description:'Crispy-edged beef in a sweet-savoury sauce.',
      ingredients:[ig('Beef mince',600,'g'),ig('Soy sauce',3,'tbsp'),ig('Brown sugar',1,'tbsp'),ig('Sesame oil',1,'tsp'),ig('Garlic',3,'cloves'),ig('Ginger',1,'tsp'),ig('Spring onion',3,''),ig('Basmati rice',2,'cups'),ig('Chilli flakes',0.5,'tsp')],
      steps:['Cook rice.','Mix the sauce.','Fry garlic and ginger.','Add mince and cook until crispy at the edges.','Add sauce.','Serve over rice.'],
      tags:['batch-prep','high-protein'],calories:510,protein:40,carbs:46,fat:16,batchPrep:true}),
    mk({name:'Butter Garlic Prawns',category:'dinner',servings:2,
      description:'Juicy prawns in lemon garlic butter.',
      ingredients:[ig('Prawns',400,'g peeled'),ig('Butter',60,'g'),ig('Garlic',4,'cloves'),ig('Lemon',1,''),ig('Parsley',1,'handful'),ig('Salt','',''),ig('Pepper','','')],
      steps:['Melt butter.','Add garlic for 30 sec.','Add prawns, 1–2 min each side until pink.','Squeeze lemon.','Finish with parsley.'],
      tags:['quick','high-protein'],calories:380,protein:36,carbs:4,fat:24}),
    mk({name:'Pan Burgers',category:'dinner',servings:2,
      description:'Caramelised onion cheeseburgers with burger sauce.',
      ingredients:[ig('Burger patties',2,'x150g'),ig('Cheese slices',2,''),ig('Brown onion',1,''),ig('Butter',1,'tbsp'),ig('Brioche buns',2,''),ig('Mayo',2,'tbsp'),ig('Ketchup',1,'tbsp'),ig('Dijon',1,'tsp'),ig('Rocket',1,'handful')],
      steps:['Caramelise onion ~20 min.','Cook patties 3–4 min each side.','Add cheese.','Mix burger sauce.','Toast buns.','Assemble.'],
      tags:['quick'],calories:720,protein:38,carbs:52,fat:38}),
    mk({name:'Turkish Bread Steak Sandwich',category:'dinner',servings:2,
      description:'Thin-sliced rump with steakhouse sauce on Turkish bread.',
      ingredients:[ig('Rump steak',400,'g'),ig('Turkish bread',1,'loaf'),ig('Brown onion',1,''),ig('Butter',1,'tbsp'),ig('Rocket',1,'handful'),ig('Mayo',2,'tbsp'),ig('Worcestershire',1,'tbsp'),ig('Dijon',1,'tsp'),ig('Salt','',''),ig('Pepper','','')],
      steps:['Caramelise onion.','Sear steak 2–3 min each side.','Rest 5 min.','Slice thin.','Mix steakhouse sauce.','Build the sandwich.'],
      tags:[],calories:680,protein:44,carbs:54,fat:26}),
    mk({name:'Reverse Sear Rump Steak with Pan Sauce and Noodles',category:'dinner',servings:2,
      description:'Reverse-seared steak with a glossy pan sauce over noodles.',
      ingredients:[ig('Rump steak',500,'g'),ig('Mi Goreng noodles',2,'packs'),ig('Butter',30,'g'),ig('Garlic',2,'cloves'),ig('Soy sauce',2,'tbsp'),ig('Worcestershire',1,'tbsp'),ig('Balsamic',1,'tsp'),ig('Salt','',''),ig('Pepper','','')],
      steps:['Bake steak at 120°C until 50°C internal (~35 min).','Sear 1 min each side.','Make pan sauce with butter, garlic, soy, Worcestershire and balsamic.','Cook noodles.','Slice steak over noodles with pan sauce.'],
      tags:['high-protein'],calories:620,protein:52,carbs:44,fat:22}),
  ];
}
function kitLoadRecipes(){
  try{
    const raw=localStorage.getItem('kitchen_recipes');
    if(raw){ const arr=JSON.parse(raw); if(Array.isArray(arr)) return arr; }
  }catch(e){}
  const seeded=kitSeedRecipes();
  localStorage.setItem('kitchen_recipes',JSON.stringify(seeded));
  return seeded;
}
let kitRecipes=kitLoadRecipes();
function kitSaveRecipes(){ lsSave('kitchen_recipes', kitRecipes, 'kitRecipes'); }
const kitState={tab:'recipes',cat:'all',search:'',filter:'all',selectedId:null,scaleServings:null};
const KIT_CATS=[['all','All'],['breakfast','Breakfast'],['lunch','Lunch'],['dinner','Dinner'],['dessert','Dessert']];

function kitEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function kitTrim(n){ let s=(Math.round(n*10)/10).toFixed(1); return s.endsWith('.0')?s.slice(0,-2):s; }
function kitScaledAmount(amount,baseServings,curServings){
  const n=parseFloat(amount);
  if(isNaN(n)||!baseServings) return amount===0?'':String(amount||'');
  return kitTrim((n/baseServings)*curServings);
}

function kitRender(){ kitSetTab(kitState.tab); }
function kitSetTab(tab){
  kitState.tab=tab;
  ['recipes','shopping','pantry'].forEach(t=>{
    const pane=document.getElementById('kit-'+t); if(pane) pane.classList.toggle('hidden',t!==tab);
    const btn=document.getElementById('kit-tab-'+t); if(btn) btn.classList.toggle('active',t===tab);
  });
  if(tab==='recipes') kitRenderList();
  if(tab==='shopping') kitShopRender();
  else if(typeof kitShopRenderAddBar==='function') kitShopRenderAddBar(false);
  if(tab==='pantry') kitPantryRender();
  updateKitFab();
}
// The "+" is only meaningful on the Recipes sub-tab of the Kitchen view. It used to be a child
// of #kit-recipes, so the pane's own .hidden did this; now that it has to live outside the
// swipe deck (see index.html) its visibility is explicit.
function updateKitFab(){
  const fab=document.getElementById('kit-fab'); if(!fab) return;
  const show = S.view==='kitchen' && (kitState&&kitState.tab==='recipes');
  fab.style.display = show ? 'flex' : 'none';
}
function kitOnSearch(v){ kitState.search=v||''; kitRenderList(); }
function kitSetCat(c){ kitState.cat=c; kitRenderList(); }

function kitRenderCatPills(){
  const wrap=document.getElementById('kit-cat-pills'); if(!wrap) return;
  wrap.innerHTML=KIT_CATS.map(([v,l])=>
    '<button class="kit-cat-pill'+(kitState.cat===v?' active':'')+'" onclick="kitSetCat(\''+v+'\')">'+l+'</button>'
  ).join('');
}
// step normalisation helpers — seeded recipes have string steps, new ones use {text,timerMinutes}
function kitStepText(s){ return (s&&typeof s==='object') ? (s.text||'') : (s||''); }
function kitStepTimer(s){ return (s&&typeof s==='object'&&s.timerMinutes>0) ? s.timerMinutes : null; }

function kitFilteredRecipes(){
  const q=kitState.search.trim().toLowerCase();
  const f=kitState.filter;
  return kitRecipes.filter(r=>{
    if(kitState.cat!=='all' && r.category!==kitState.cat) return false;
    if(f==='favourites' && !r.favourite) return false;
    if(f==='recent' && !r.lastCooked) return false;
    if(!q) return true;
    if((r.name||'').toLowerCase().includes(q)) return true;
    return (r.ingredients||[]).some(i=>(i.name||'').toLowerCase().includes(q));
  });
}
function kitSetFilter(f){
  kitState.filter=f;
  kitRenderList();
}
function kitRenderFilterChips(){
  const wrap=document.getElementById('kit-filter-chips'); if(!wrap) return;
  const chips=[['all','All'],['favourites','Favourites ♥'],['recent','Recently Cooked 🕐']];
  wrap.innerHTML=chips.map(([v,l])=>
    '<button class="kit-fchip'+(kitState.filter===v?' active':'')+'" onclick="kitSetFilter(\''+v+'\')">'+l+'</button>'
  ).join('');
}

// ── Cooking mode ──────────────────────────────────────────────────
const kitCookState={recipeId:null,step:0,timerTotal:0,timerRemaining:0,timerStart:null,timerRunning:false,wakeLock:null,tickId:null};
function kitStartCooking(id){
  const r=kitRecipes.find(x=>x.id===id); if(!r) return;
  kitCookState.recipeId=id;
  kitCookState.step=0;
  kitCookState.timerRunning=false;
  kitCookState.timerStart=null;
  kitCookState.timerTotal=0;
  kitCookState.timerRemaining=0;
  if(kitCookState.tickId){ clearInterval(kitCookState.tickId); kitCookState.tickId=null; }
  const ov=document.getElementById('kit-cook-overlay'); if(!ov) return;
  // Opaque status bar already reserves its height (see #app-header) — fixed top padding, no
  // env(safe-area-inset-top) which double-counts it. Bottom inset kept.
  ov.style.cssText='display:flex;flex-direction:column;position:fixed;inset:0;background:var(--bg);z-index:200;overflow:hidden;padding:16px 0 env(safe-area-inset-bottom,16px)';
  kitCookRender();
  // wake lock
  if(navigator.wakeLock) navigator.wakeLock.request('screen').then(wl=>{ kitCookState.wakeLock=wl; }).catch(()=>{});
}
function kitExitCooking(){
  if(kitCookState.tickId){ clearInterval(kitCookState.tickId); kitCookState.tickId=null; }
  if(kitCookState.wakeLock){ kitCookState.wakeLock.release().catch(()=>{}); kitCookState.wakeLock=null; }
  const ov=document.getElementById('kit-cook-overlay');
  if(ov) ov.style.display='none';
  kitCookState.recipeId=null;
}
function kitCookFinish(){
  const r=kitRecipes.find(x=>x.id===kitCookState.recipeId);
  if(r){ r.lastCooked=Date.now(); kitSaveRecipes(); }
  kitExitCooking();
  kitShowToast('Well done! 🎉');
  kitRenderList();
  if(kitCookState.recipeId && window.innerWidth>=1024) kitRefreshOpenDetail();
}
function kitCookGo(dir){
  const r=kitRecipes.find(x=>x.id===kitCookState.recipeId); if(!r) return;
  const steps=r.steps||[];
  const next=kitCookState.step+dir;
  if(next<0||next>=steps.length) return;
  kitCookState.step=next;
  if(kitCookState.tickId){ clearInterval(kitCookState.tickId); kitCookState.tickId=null; }
  kitCookState.timerRunning=false;
  kitCookState.timerStart=null;
  kitCookRender();
}
function kitCookTimerToggle(){
  const r=kitRecipes.find(x=>x.id===kitCookState.recipeId); if(!r) return;
  const s=r.steps[kitCookState.step];
  const mins=kitStepTimer(s)||0; if(!mins) return;
  if(kitCookState.timerRunning){
    // pause: store remaining
    kitCookState.timerRemaining=Math.max(0,kitCookState.timerRemaining-Math.floor((Date.now()-kitCookState.timerStart)/1000));
    kitCookState.timerRunning=false;
    kitCookState.timerStart=null;
    if(kitCookState.tickId){ clearInterval(kitCookState.tickId); kitCookState.tickId=null; }
    kitCookRenderTimer();
  } else {
    // start / resume
    if(kitCookState.timerTotal!==mins*60||kitCookState.timerRemaining<=0){
      kitCookState.timerTotal=mins*60;
      kitCookState.timerRemaining=mins*60;
    }
    kitCookState.timerStart=Date.now();
    kitCookState.timerRunning=true;
    kitCookState.tickId=setInterval(kitCookTick,500);
    kitCookRenderTimer();
  }
}
function kitCookTimerReset(){
  const r=kitRecipes.find(x=>x.id===kitCookState.recipeId); if(!r) return;
  const s=r.steps[kitCookState.step];
  const mins=kitStepTimer(s)||0;
  if(kitCookState.tickId){ clearInterval(kitCookState.tickId); kitCookState.tickId=null; }
  kitCookState.timerRunning=false;
  kitCookState.timerStart=null;
  kitCookState.timerTotal=mins*60;
  kitCookState.timerRemaining=mins*60;
  kitCookRenderTimer();
}
function kitCookTick(){
  if(!kitCookState.timerRunning) return;
  const elapsed=Math.floor((Date.now()-kitCookState.timerStart)/1000);
  const rem=Math.max(0,kitCookState.timerRemaining-elapsed);
  if(rem===0){
    clearInterval(kitCookState.tickId); kitCookState.tickId=null;
    kitCookState.timerRunning=false;
    kitCookState.timerRemaining=0;
    kitCookRenderTimer();
    if(navigator.vibrate) navigator.vibrate([300,100,300]);
    kitShowToast('Timer done! ⏰');
  } else {
    kitCookRenderTimer();
  }
}
function kitCookTimerSec(){
  if(!kitCookState.timerRunning) return kitCookState.timerRemaining;
  return Math.max(0,kitCookState.timerRemaining-Math.floor((Date.now()-kitCookState.timerStart)/1000));
}
function kitCookRenderTimer(){
  const r=kitRecipes.find(x=>x.id===kitCookState.recipeId); if(!r) return;
  const s=r.steps[kitCookState.step];
  const mins=kitStepTimer(s)||0;
  const tWrap=document.getElementById('kit-cook-timer'); if(!tWrap) return;
  if(!mins){ tWrap.innerHTML=''; return; }
  const sec=kitCookTimerSec();
  const mm=String(Math.floor(sec/60)).padStart(2,'0');
  const ss=String(sec%60).padStart(2,'0');
  const done=sec===0;
  const total=kitCookState.timerTotal||mins*60;
  const pct=total>0?Math.round((1-sec/total)*100):0;
  tWrap.innerHTML=
    '<div class="kit-cook-timer-ring" style="--pct:'+pct+'%">'+
      '<svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="34" stroke="var(--border)" stroke-width="6" fill="none"/><circle cx="40" cy="40" r="34" stroke="'+(done?'var(--danger)':'var(--accent)')+'" stroke-width="6" fill="none" stroke-dasharray="213.6" stroke-dashoffset="'+Math.round((1-pct/100)*213.6)+'" stroke-linecap="round" transform="rotate(-90 40 40)"/></svg>'+
      '<div class="kit-cook-timer-time'+(done?' done':'')+'">'+mm+':'+ss+'</div>'+
    '</div>'+
    '<div class="kit-cook-timer-btns">'+
      '<button class="kit-cook-tbtn" onclick="kitCookTimerToggle()">'+(kitCookState.timerRunning?'⏸ Pause':'▶ Start')+'</button>'+
      '<button class="kit-cook-tbtn secondary" onclick="kitCookTimerReset()">↺ Reset</button>'+
    '</div>';
}
function kitCookRender(){
  const r=kitRecipes.find(x=>x.id===kitCookState.recipeId); if(!r) return;
  const ov=document.getElementById('kit-cook-overlay'); if(!ov) return;
  const steps=r.steps||[];
  const idx=kitCookState.step;
  const total=steps.length;
  const s=steps[idx];
  const text=kitStepText(s);
  const hasPrev=idx>0;
  const hasNext=idx<total-1;
  const pct=total>1?Math.round(((idx+1)/total)*100):100;
  // reset timer state when step changes
  const mins=kitStepTimer(s)||0;
  if(kitCookState.timerTotal!==mins*60){
    kitCookState.timerTotal=mins*60;
    kitCookState.timerRemaining=mins*60;
    kitCookState.timerRunning=false;
    kitCookState.timerStart=null;
    if(kitCookState.tickId){ clearInterval(kitCookState.tickId); kitCookState.tickId=null; }
  }
  ov.innerHTML=
    '<div class="kit-cook-topbar">'+
      '<button class="kit-cook-exit" onclick="kitExitCooking()">✕ Exit</button>'+
      '<div class="kit-cook-recipe-name">'+kitEsc(r.emoji||'🍽️')+' '+kitEsc(r.name)+'</div>'+
      '<div></div>'+
    '</div>'+
    '<div class="kit-cook-progress-bar"><div class="kit-cook-progress-fill" style="width:'+pct+'%"></div></div>'+
    '<div class="kit-cook-step-label">Step '+( idx+1)+' of '+total+'</div>'+
    '<div class="kit-cook-body">'+
      '<div class="kit-cook-step-text">'+kitEsc(text)+'</div>'+
      '<div id="kit-cook-timer"></div>'+
    '</div>'+
    '<div class="kit-cook-nav">'+
      '<button class="kit-cook-nav-btn" onclick="kitCookGo(-1)"'+(hasPrev?'':' disabled')+'>← Prev</button>'+
      (hasNext
        ? '<button class="kit-cook-nav-btn primary" onclick="kitCookGo(1)">Next →</button>'
        : '<button class="kit-cook-nav-btn finish" onclick="kitCookFinish()">🎉 Finish Cooking</button>')+
    '</div>';
  kitCookRenderTimer();
}

// toast helper
let kitToastTimer=null;
function kitShowToast(msg){
  const el=document.getElementById('kit-toast'); if(!el) return;
  el.textContent=msg;
  el.style.display='block';
  el.classList.add('visible');
  if(kitToastTimer) clearTimeout(kitToastTimer);
  kitToastTimer=setTimeout(()=>{ el.classList.remove('visible'); setTimeout(()=>{ el.style.display='none'; },300); },2500);
}
function kitRenderFeatured(){
  const wrap=document.getElementById('kitchen-featured'); if(!wrap) return;
  if(!kitRecipes.length){ wrap.innerHTML=''; return; }
  // Featured = most recently cooked, else most recently added
  const byRecent=[...kitRecipes].sort((a,b)=>(b.lastCooked||0)-(a.lastCooked||0)||(b.createdAt||0)-(a.createdAt||0));
  const r=byRecent[0]; if(!r){ wrap.innerHTML=''; return; }
  const label=r.lastCooked?'Last cooked':'Latest recipe';
  const cal=r.calories!=null?'<span class="kitchen-hero-cal">'+r.calories+' cal</span>':'';
  const time=r.cookTime?'<span class="kitchen-hero-time">'+(cal?'· ':'')+r.cookTime+' min</span>':'';
  wrap.innerHTML=
    '<div class="kitchen-hero-card">'+
      '<p class="card-label">'+label+'</p>'+
      '<p class="kitchen-hero-name">'+(r.emoji?r.emoji+' ':'')+kitEsc(r.name)+'</p>'+
      ((cal||time)?'<div style="display:flex;gap:8px;align-items:center;margin-top:8px">'+cal+time+'</div>':'')+
      '<button class="kitchen-hero-btn" onclick="kitOpenDetail(\''+r.id+'\')">View Recipe →</button>'+
    '</div>';
}
function kitRenderList(){
  kitRenderFeatured();
  kitRenderFilterChips();
  kitRenderCatPills();
  const list=document.getElementById('kit-list'); if(!list) return;
  const items=kitFilteredRecipes();
  // Favourites first, then by name
  items.sort((a,b)=>(b.favourite?1:0)-(a.favourite?1:0)||(a.name||'').localeCompare(b.name||''));
  if(!items.length){
    list.innerHTML='<div class="empty" style="padding:48px 16px"><div style="font-size:40px">🍽️</div><div style="font-size:15px;font-weight:600;margin-top:10px">No recipes found</div><div style="font-size:13px;color:var(--muted);margin-top:4px">Try a different search or add a new recipe.</div></div>';
  } else {
    list.innerHTML=items.map(r=>{
      const sel=r.id===kitState.selectedId?' kit-card-active':'';
      const cal=r.calories!=null?'<span class="kit-cal-badge">'+r.calories+' cal</span>':'';
      const batch=r.batchPrep?'<span class="kit-batch-badge">🍱 Batch</span>':'';
      const cookTime=r.cookTime?'<span class="kit-cal-badge">⏱ '+r.cookTime+'m</span>':'';
      let cookedLabel='';
      if(r.lastCooked){
        const days=Math.floor((Date.now()-r.lastCooked)/86400000);
        cookedLabel='<div class="kit-cooked-ago">'+(days===0?'Cooked today':days===1?'Cooked yesterday':'Cooked '+days+' days ago')+'</div>';
      }
      return '<div class="kit-card kit-c-'+(r.category||'dinner')+sel+'" onclick="kitOpenDetail(\''+r.id+'\')">'+
        '<div class="kit-card-top">'+
          '<div class="kit-cat-tile" aria-hidden="true">'+kitCardEmoji(r)+'</div>'+
          '<div class="kit-card-name">'+kitEsc(r.name)+'</div>'+
          '<div class="kit-card-actions" onclick="event.stopPropagation()">'+
            '<button class="kit-fav'+(r.favourite?' on':'')+'" onclick="kitToggleFav(\''+r.id+'\')" aria-label="Favourite">'+(r.favourite?'⭐':'☆')+'</button>'+
            '<button class="kit-menu-btn" onclick="kitToggleMenu(\''+r.id+'\',event)">⋯</button>'+
          '</div>'+
        '</div>'+
        '<div class="kit-card-meta"><span class="kit-cat-tag kit-cat-'+r.category+'">'+r.category+'</span>'+cal+cookTime+batch+'</div>'+
        (r.description?'<div class="kit-card-desc">'+kitEsc(r.description)+'</div>':'')+
        '<div class="kit-card-serv">🍽️ '+r.servings+' serving'+(r.servings!=1?'s':'')+'</div>'+
        cookedLabel+
        (kitMenuOpenId===r.id?
          '<div class="kit-menu-dropdown" onclick="event.stopPropagation()">'+
            '<button onclick="kitMenuOpenId=null;kitOpenForm(\''+r.id+'\')">✏️ Edit</button>'+
            '<button onclick="kitMenuOpenId=null;kitCopyRecipe(\''+r.id+'\')">🤖 Copy for AI</button>'+
            '<button class="danger" onclick="kitMenuOpenId=null;kitDeleteRecipe(\''+r.id+'\')">🗑️ Delete</button>'+
          '</div>':'')+
      '</div>';
    }).join('');
  }
  // Desktop: keep the persistent detail column in sync
  if(window.innerWidth>=1024){
    const col=document.getElementById('kit-detail-col');
    if(col){
      if(kitState.selectedId && kitRecipes.some(r=>r.id===kitState.selectedId)) kitRenderDetail(kitState.selectedId,col);
      else col.innerHTML='<div class="empty" style="padding-top:80px"><div style="font-size:48px">🍳</div><div style="font-size:16px;font-weight:600;margin-top:12px">Select a recipe</div><div style="font-size:13px;color:var(--muted);margin-top:6px">Pick one from the list to see the full method.</div></div>';
    }
  }
}
let kitMenuOpenId=null;
function kitToggleMenu(id,e){
  if(e) e.stopPropagation();
  kitMenuOpenId=(kitMenuOpenId===id)?null:id;
  kitRenderList();
}
// close menu on outside tap
document.addEventListener('click',()=>{ if(kitMenuOpenId){ kitMenuOpenId=null; kitRenderList(); } });
function kitToggleFav(id){
  const r=kitRecipes.find(x=>x.id===id); if(!r) return;
  r.favourite=!r.favourite;
  kitSaveRecipes();
  kitRenderList();
  if(kitState.selectedId===id) kitRefreshOpenDetail();
}

function kitOpenDetail(id){
  kitState.selectedId=id;
  const r=kitRecipes.find(x=>x.id===id); if(!r) return;
  kitState.scaleServings=r.servings;
  if(window.innerWidth>=1024){
    kitRenderList(); // re-render list (highlight) + detail column
  } else {
    const ov=document.getElementById('kit-detail-overlay');
    kitRenderDetail(id,document.getElementById('kit-detail-overlay-inner'));
    if(ov) ov.style.display='flex';
  }
}
function kitCloseDetail(){
  const ov=document.getElementById('kit-detail-overlay');
  if(ov) ov.style.display='none';
  kitState.selectedId=null;
  if(window.innerWidth>=1024) kitRenderList();
}
function kitRefreshOpenDetail(){
  if(window.innerWidth>=1024){
    const col=document.getElementById('kit-detail-col');
    if(col&&kitState.selectedId) kitRenderDetail(kitState.selectedId,col);
  } else {
    const inner=document.getElementById('kit-detail-overlay-inner');
    if(inner&&kitState.selectedId) kitRenderDetail(kitState.selectedId,inner);
  }
}
function kitScale(delta){
  const r=kitRecipes.find(x=>x.id===kitState.selectedId); if(!r) return;
  const next=(kitState.scaleServings||r.servings)+delta;
  if(next<1) return;
  kitState.scaleServings=next;
  kitRefreshOpenDetail();
}
function kitRenderDetail(id,target){
  if(!target) return;
  const r=kitRecipes.find(x=>x.id===id);
  if(!r){ target.innerHTML=''; return; }
  const cur=kitState.scaleServings||r.servings;
  const ingRows=(r.ingredients||[]).map(i=>{
    const amt=kitScaledAmount(i.amount,r.servings,cur);
    const right=[amt,i.unit].filter(x=>x!=='' && x!=null).join(' ');
    return '<div class="kit-ing-row"><span>'+kitEsc(i.name)+'</span><span class="kit-ing-amt">'+kitEsc(right)+'</span></div>';
  }).join('');
  const stepRows=(r.steps||[]).map((s,i)=>{
    const text=kitStepText(s);
    const timer=kitStepTimer(s);
    return '<div class="kit-step-row"><span class="kit-step-n">'+(i+1)+'</span><div class="kit-step-body"><span>'+kitEsc(text)+'</span>'+(timer?'<span class="kit-step-timer-badge">⏱ '+timer+' min</span>':'')+'</div></div>';
  }).join('');
  const tags=(r.tags||[]).map(t=>'<span class="kit-tag">'+kitEsc(t)+'</span>').join('');
  let macros='';
  if(r.calories!=null||r.protein!=null||r.carbs!=null||r.fat!=null){
    const scl=v=>v==null?'—':Math.round(v*cur/r.servings);
    macros='<div class="kit-macros">'+
      '<div class="kit-macro"><div class="kit-macro-v">'+scl(r.calories)+'</div><div class="kit-macro-l">cal</div></div>'+
      '<div class="kit-macro"><div class="kit-macro-v">'+scl(r.protein)+'</div><div class="kit-macro-l">protein</div></div>'+
      '<div class="kit-macro"><div class="kit-macro-v">'+scl(r.carbs)+'</div><div class="kit-macro-l">carbs</div></div>'+
      '<div class="kit-macro"><div class="kit-macro-v">'+scl(r.fat)+'</div><div class="kit-macro-l">fat</div></div>'+
    '</div>';
  }
  const cookInfo=(r.cookTime?'<span class="kit-cal-badge">⏱ '+r.cookTime+' min</span>':'');
  const backBtn=window.innerWidth>=1024?'':'<button class="back-btn" data-back="kitCloseDetail" aria-label="Back">'+BACK_CHEVRON+'</button>';
  target.innerHTML=
    '<div class="kit-detail-head">'+backBtn+
      '<button class="kit-fav'+(r.favourite?' on':'')+'" onclick="kitToggleFav(\''+r.id+'\')" style="margin-left:auto" aria-label="Favourite">'+(r.favourite?'⭐':'☆')+'</button>'+
    '</div>'+
    (r.emoji?'<div class="kit-detail-emoji">'+r.emoji+'</div>':'')+
    '<div class="kit-detail-name">'+kitEsc(r.name)+'</div>'+
    '<div class="kit-card-meta" style="margin-bottom:14px"><span class="kit-cat-tag kit-cat-'+r.category+'">'+r.category+'</span>'+(r.batchPrep?'<span class="kit-batch-badge">🍱 Batch</span>':'')+cookInfo+tags+'</div>'+
    (r.description?'<div class="kit-card-desc" style="margin-bottom:16px">'+kitEsc(r.description)+'</div>':'')+
    '<button class="kit-start-cooking-btn" onclick="kitStartCooking(\''+r.id+'\')">▶ Start Cooking</button>'+
    '<div class="kit-scaler">'+
      '<button class="kit-scale-btn" onclick="kitScale(-1)" aria-label="Fewer servings">−</button>'+
      '<div class="kit-scale-val"><div class="kit-scale-num">'+cur+'</div><div class="kit-scale-lbl">servings</div></div>'+
      '<button class="kit-scale-btn" onclick="kitScale(1)" aria-label="More servings">+</button>'+
    '</div>'+
    macros+
    '<div class="kit-sec-label">Ingredients</div><div class="kit-ing-list">'+ingRows+'</div>'+
    '<div class="kit-sec-label">Method</div><div class="kit-step-list">'+stepRows+'</div>'+
    '<div class="kit-detail-actions">'+
      '<button class="kit-act kit-act-primary" onclick="kitLogMeal(\''+r.id+'\')">🍴 Log this meal</button>'+
      '<button class="kit-act" onclick="kitOpenForm(\''+r.id+'\')">✏️ Edit</button>'+
      '<button class="kit-act kit-act-danger" onclick="kitDeleteRecipe(\''+r.id+'\')">🗑️ Delete</button>'+
    '</div>';
}
function kitLogMeal(id){
  const r=kitRecipes.find(x=>x.id===id); if(!r) return;
  const cur=kitState.scaleServings||r.servings;
  const kcal=r.calories!=null?Math.round(r.calories*cur/r.servings):0;
  const today=getLocalDate();
  if(S.dailyLog.date!==today){ S.dailyLog={date:today,entries:[]}; }
  S.dailyLog.entries.push({name:r.name,kcal,category:'other'});
  persistDailyLog();
  if(typeof renderCalorieLog==='function') renderCalorieLog();
  // Dismiss the mobile recipe overlay so the calorie overlay isn't hidden behind it
  const dov=document.getElementById('kit-detail-overlay');
  if(dov) dov.style.display='none';
  openCalorieOverlay();
}
function kitDeleteRecipe(id){
  const r=kitRecipes.find(x=>x.id===id); if(!r) return;
  if(!confirm('Delete "'+r.name+'"?')) return;
  kitRecipes=kitRecipes.filter(x=>x.id!==id);
  kitSaveRecipes();
  if(window.innerWidth<1024) kitCloseDetail();
  else { kitState.selectedId=null; }
  kitRenderList();
}

// ── Add / edit form ───────────────────────────────────────────────
const KIT_STANDARD_TAGS=[
  {val:'high-protein',label:'High Protein'},
  {val:'low-carb',label:'Low Carb'},
  {val:'quick',label:'Quick'},
  {val:'vegetarian',label:'Vegetarian'},
  {val:'bulk-cook',label:'Bulk Cook'},
];
const KIT_UNITS=['g','ml','cup','tbsp','tsp','piece','oz','lb'];
// The tile always shows something, so cards line up whether or not a recipe carries an emoji
// — several seeded ones (Butter Garlic Prawns) have none and previously rendered no glyph at
// all, leaving their titles hanging where every other card had one.
const KIT_CAT_EMOJI={breakfast:'🍳',lunch:'🥪',dinner:'🍽️',dessert:'🍰'};
function kitCardEmoji(r){
  const e=(r&&r.emoji||'').trim();
  return e || KIT_CAT_EMOJI[(r&&r.category)||'dinner'] || '🍽️';
}
// ── Import recipes from Claude ─────────────────────────────────────
// Daily is a static site with no backend, and the Firebase rules only accept writes from the
// signed-in user's own uid, so nothing can push data in from outside. The transfer is
// therefore a paste: Claude emits JSON in the schema below and this validates it.
// Strict on purpose — a bad paste is reported precisely rather than half-imported, since a
// silently mangled recipe is worse than a rejected one.
const KIT_IMPORT_CATS=['breakfast','lunch','dinner','dessert'];
// Returns {recipes:[...]} or {error:'...'} — never throws, never partially applies.
function kitParseImport(text){
  const raw=String(text||'').trim();
  if(!raw) return {error:'Nothing pasted yet.'};
  // Tolerate a ```json fence, since that is how chat tools usually present a code block.
  const unfenced=raw.replace(/^```(?:json)?\s*/i,'').replace(/```$/,'').trim();
  let data;
  try{ data=JSON.parse(unfenced); }
  catch(e){ return {error:"That isn't valid JSON. Copy the whole code block, including the outer { } or [ ]."}; }
  // Accept a single recipe, a bare array, or {recipes:[...]}.
  let list=Array.isArray(data)?data:(data&&Array.isArray(data.recipes)?data.recipes:[data]);
  if(!list.length) return {error:'No recipes found in that JSON.'};
  const out=[];
  for(let i=0;i<list.length;i++){
    const r=list[i], where=list.length>1?(' (recipe '+(i+1)+')'):'';
    if(!r||typeof r!=='object') return {error:'Each recipe must be an object'+where+'.'};
    const name=String(r.name||'').trim();
    if(!name) return {error:'A recipe is missing "name"'+where+'.'};
    if(!Array.isArray(r.ingredients)||!r.ingredients.length) return {error:'"'+name+'" needs a non-empty "ingredients" array.'};
    const ingredients=[];
    for(const ing of r.ingredients){
      if(!ing||typeof ing!=='object') return {error:'"'+name+'": each ingredient must be an object with a "name".'};
      const iname=String(ing.name||'').trim();
      if(!iname) return {error:'"'+name+'": an ingredient is missing "name".'};
      const amt=ing.amount===''||ing.amount==null?'':(isNaN(parseFloat(ing.amount))?String(ing.amount):parseFloat(ing.amount));
      ingredients.push({name:iname, amount:amt, unit:String(ing.unit||'').trim()});
    }
    // Steps may be plain strings or {text,timerMinutes}; the cook mode reads both.
    const steps=(Array.isArray(r.steps)?r.steps:[]).map(s=>{
      if(typeof s==='string') return s;
      if(s&&typeof s==='object'&&s.text) return {text:String(s.text), timerMinutes:(s.timerMinutes==null?null:parseInt(s.timerMinutes)||null)};
      return null;
    }).filter(Boolean);
    const cat=String(r.category||'').toLowerCase();
    const num=v=>{ const n=parseFloat(v); return isNaN(n)?null:n; };
    const tags=Array.isArray(r.tags)?r.tags.map(t=>String(t).trim()).filter(Boolean):[];
    out.push({
      name, emoji:String(r.emoji||'🍽️').trim()||'🍽️',
      category:KIT_IMPORT_CATS.indexOf(cat)>=0?cat:'dinner',
      description:String(r.description||'').trim(),
      servings:Math.max(1,parseInt(r.servings)||2),
      cookTime:num(r.cookTime), ingredients, steps, tags,
      calories:num(r.calories), protein:num(r.protein), carbs:num(r.carbs), fat:num(r.fat),
      batchPrep:tags.includes('batch-prep')||tags.includes('bulk-cook')
    });
  }
  return {recipes:out};
}
// ── Export recipes for AI ──────────────────────────────────────────
// Emits the SAME schema kitParseImport accepts, so the round trip closes: copy a recipe out,
// ask an assistant to change it, paste the result straight back into Import. Anything that
// only produced prose would have to be retyped by hand.
function kitRecipeToExport(r){
  const num=v=>{ const n=parseFloat(v); return isNaN(n)?null:n; };
  return {
    name:r.name||'',
    emoji:r.emoji||'🍽️',
    category:KIT_IMPORT_CATS.indexOf(r.category)>=0?r.category:'dinner',
    servings:Math.max(1,parseInt(r.servings)||1),
    description:r.description||'',
    cookTime:num(r.cookTime),
    ingredients:(r.ingredients||[]).map(i=>({
      name:i.name||'',
      amount:(i.amount===''||i.amount==null)?'':(num(i.amount)!=null?num(i.amount):i.amount),
      unit:i.unit||''
    })),
    // Steps keep whichever shape they were stored in; both import cleanly.
    steps:(r.steps||[]).map(s=>(s&&typeof s==='object'&&s.text)
      ? {text:s.text, timerMinutes:(s.timerMinutes==null?null:parseInt(s.timerMinutes)||null)}
      : String(s)),
    tags:Array.isArray(r.tags)?r.tags.slice():[],
    calories:num(r.calories), protein:num(r.protein), carbs:num(r.carbs), fat:num(r.fat)
  };
}
// The wrapper explains the format to an assistant that has never seen this app, so the pasted
// block is useful on its own rather than needing the separate briefing prompt every time.
function kitBuildExportText(recipes,intro){
  const payload={recipes:recipes.map(kitRecipeToExport)};
  return [
    intro,
    '',
    'Rules for any version you give back:',
    '- Reply with ONE ```json code block in exactly this shape and nothing else inside the fences.',
    '- category must be one of: '+KIT_IMPORT_CATS.join(', ')+'.',
    '- tags must come from: '+KIT_STANDARD_TAGS.map(t=>t.val).join(', ')+'.',
    '- amount is a number and the unit goes in "unit" (one of: '+KIT_UNITS.join(', ')+', or "" for countable things).',
    '- Name ingredients as they would be BOUGHT ("Onion", not "finely diced onion") — my shopping list merges identical names.',
    '- calories/protein/carbs/fat are PER SERVING, numbers only. Use null rather than guessing.',
    '- steps are plain strings, or {"text": "...", "timerMinutes": N} for a timed step.',
    '',
    '```json',
    JSON.stringify(payload,null,2),
    '```'
  ].join('\n');
}
function kitCopyText(text,msg){
  const done=()=>{ if(typeof showToast==='function') showToast(msg); };
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done).catch(()=>fallbackCopy(text,done));
  } else fallbackCopy(text,done);
}
function kitCopyRecipe(id){
  const r=kitRecipes.find(x=>x.id===id); if(!r) return;
  kitCopyText(kitBuildExportText([r],
    'Here is one recipe from my recipe app. Suggest improvements, adapt it, or scale it as I ask — '+
    'then give it back in the same format so I can import it straight back.'),
    'Recipe copied — paste it into your AI chat');
}
function kitCopyAllRecipes(){
  if(!kitRecipes.length){ if(typeof showToast==='function') showToast('No recipes to copy'); return; }
  kitCopyText(kitBuildExportText(kitRecipes,
    'Here is my whole recipe book ('+kitRecipes.length+' recipes). Use it to understand what I actually cook '+
    'when suggesting meal plans or new recipes. Give anything new back in the same format so I can import it.'),
    kitRecipes.length+' recipes copied');
}
function kitOpenImport(){
  const box=document.getElementById('kit-import-box'); if(!box) return;
  box.innerHTML=
    // Same topbar as the recipe form, so it joins the app's unified back navigation
    // (the delegated [data-back] handler) rather than inventing its own close control.
    '<div class="kit-form-topbar">'+
      '<button class="back-btn" data-back="kitCloseImport" aria-label="Back">'+BACK_CHEVRON+'</button>'+
      '<div class="modal-title">Import recipes</div>'+
      '<div style="width:36px"></div>'+
    '</div>'+
    '<div style="padding:4px 2px 0">'+
      '<p style="font-size:13px;color:var(--muted);line-height:1.5;margin:0 0 10px">'+
        'Paste the JSON your assistant produced. Ask it for recipes “in Daily import format”, '+
        'or give it the format below once and it will remember for that chat.</p>'+
      '<textarea id="kit-import-text" rows="8" placeholder=\'{"recipes":[{"name":"…","ingredients":[…]}]}\' '+
        'style="width:100%;box-sizing:border-box;font-family:ui-monospace,monospace;font-size:12px;line-height:1.45;'+
        'padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--text);resize:vertical"></textarea>'+
      '<div id="kit-import-msg" style="font-size:12.5px;font-weight:600;margin-top:8px;min-height:17px"></div>'+
      '<details style="margin-top:6px"><summary style="font-size:12px;color:var(--muted);cursor:pointer">Show the format</summary>'+
        '<pre style="font-size:11px;line-height:1.45;overflow-x:auto;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px;margin-top:8px">'+
_catEscHtml(KIT_IMPORT_EXAMPLE)+'</pre></details>'+
      // Export lives beside import: the two halves of the same round trip.
      '<button class="modal-btn secondary" style="width:100%;margin-top:12px" onclick="kitCopyAllRecipes()">🤖 Copy my whole recipe book for AI</button>'+
      '<div style="display:flex;gap:10px;margin-top:14px">'+
        '<button class="modal-btn secondary" onclick="kitCloseImport()">Cancel</button>'+
        '<button class="modal-btn primary" onclick="kitDoImport()">Import</button>'+
      '</div>'+
    '</div>';
  document.getElementById('kit-import-overlay').classList.remove('hidden');
}
function kitCloseImport(){ const o=document.getElementById('kit-import-overlay'); if(o) o.classList.add('hidden'); }
const KIT_IMPORT_EXAMPLE=
'{\n  "recipes": [\n    {\n      "name": "Lemon Garlic Chicken",\n      "emoji": "🍗",\n      "category": "dinner",\n      "servings": 2,\n      "description": "One-pan roast chicken thighs.",\n      "cookTime": 35,\n      "ingredients": [\n        { "name": "Chicken thighs", "amount": 4, "unit": "" },\n        { "name": "Lemon", "amount": 1, "unit": "" },\n        { "name": "Olive oil", "amount": 2, "unit": "tbsp" }\n      ],\n      "steps": [\n        "Heat oven to 200C.",\n        { "text": "Roast until cooked through.", "timerMinutes": 30 }\n      ],\n      "tags": ["quick"],\n      "calories": 520, "protein": 42, "carbs": 6, "fat": 34\n    }\n  ]\n}';
function kitDoImport(){
  const msg=document.getElementById('kit-import-msg');
  const res=kitParseImport(document.getElementById('kit-import-text')?.value);
  if(res.error){ if(msg){ msg.textContent=res.error; msg.style.color='var(--danger)'; } return; }
  // Same shape kitSaveForm builds, so imported recipes are ordinary recipes from here on.
  res.recipes.forEach(d=>kitRecipes.push(Object.assign({id:kitUUID(),favourite:false,lastCooked:null,createdAt:Date.now()},d)));
  kitSaveRecipes();
  kitCloseImport();
  kitSetTab('recipes');
  showToast('Imported '+res.recipes.length+' recipe'+(res.recipes.length>1?'s':''));
}
function kitOpenForm(id){
  const editing=id?kitRecipes.find(x=>x.id===id):null;
  const r=editing||{name:'',emoji:'🍽️',category:'dinner',description:'',servings:2,cookTime:null,
    ingredients:[{name:'',amount:'',unit:'g'}],steps:[{text:'',timerMinutes:null}],
    tags:[],calories:null,protein:null,carbs:null,fat:null};
  const box=document.getElementById('kit-form-box'); if(!box) return;
  const catOpts=['breakfast','lunch','dinner','dessert'].map(c=>'<option value="'+c+'"'+(r.category===c?' selected':'')+'>'+c.charAt(0).toUpperCase()+c.slice(1)+'</option>').join('');
  const tagChips=KIT_STANDARD_TAGS.map(t=>{
    const on=(r.tags||[]).includes(t.val)||(t.val==='bulk-cook'&&r.batchPrep);
    return '<button type="button" class="kit-tag-chip'+(on?' active':'')+'" data-tag="'+t.val+'" onclick="this.classList.toggle(\'active\')">'+t.label+'</button>';
  }).join('');
  box.innerHTML=
    '<div class="kit-form-topbar">'+
      '<button class="back-btn" data-back="kitCloseForm" aria-label="Back">'+BACK_CHEVRON+'</button>'+
      '<div class="modal-title">'+(editing?'Edit Recipe':'New Recipe')+'</div>'+
      '<div style="width:36px"></div>'+
    '</div>'+
    '<input type="hidden" id="kit-f-id" value="'+(editing?editing.id:'')+'">'+
    '<div class="kit-f-emoji-row">'+
      '<input id="kit-f-emoji" class="kit-f-emoji-input" type="text" value="'+(r.emoji||'🍽️')+'" maxlength="4" placeholder="🍽️">'+
      '<input id="kit-f-name" class="kit-f-name-input" type="text" value="'+kitEsc(r.name||'')+'" placeholder="Recipe name" autocomplete="off">'+
    '</div>'+
    '<div class="settings-2col">'+
      '<div class="settings-field"><label>Category</label><select id="kit-f-cat">'+catOpts+'</select></div>'+
      '<div class="settings-field"><label>Servings</label><input id="kit-f-serv" type="number" min="1" inputmode="numeric" value="'+(r.servings||2)+'"></div>'+
    '</div>'+
    '<div class="settings-field"><label>Cook time (min)</label><input id="kit-f-time" type="number" min="0" inputmode="numeric" value="'+(r.cookTime||'')+'" placeholder="e.g. 25"></div>'+
    '<div class="settings-field"><label>Description</label><input id="kit-f-desc" type="text" value="'+kitEsc(r.description||'')+'" placeholder="Short description"></div>'+
    '<div class="settings-field"><label>Macros (per recipe)</label><div class="kit-macro-grid">'+
      '<input id="kit-f-cal" type="number" inputmode="numeric" placeholder="cal" value="'+(r.calories??'')+'">'+
      '<input id="kit-f-pro" type="number" inputmode="numeric" placeholder="protein" value="'+(r.protein??'')+'">'+
      '<input id="kit-f-carb" type="number" inputmode="numeric" placeholder="carbs" value="'+(r.carbs??'')+'">'+
      '<input id="kit-f-fat" type="number" inputmode="numeric" placeholder="fat" value="'+(r.fat??'')+'">'+
    '</div></div>'+
    '<div class="settings-field"><label>Ingredients</label><div id="kit-f-ings"></div>'+
      '<button class="kit-add-row" onclick="kitFormAddIng()">+ Add ingredient</button></div>'+
    '<div class="settings-field"><label>Steps <span style="font-size:11px;font-weight:400;color:var(--muted)">(add a timer if the step needs one)</span></label>'+
      '<div id="kit-f-steps"></div>'+
      '<button class="kit-add-row" onclick="kitFormAddStep()">+ Add step</button></div>'+
    '<div class="settings-field"><label>Tags</label><div class="kit-tag-chips-wrap" id="kit-f-tag-chips">'+tagChips+'</div></div>'+
    '<button class="kit-f-save-btn" onclick="kitSaveForm()">Save Recipe</button>'+
    '<div style="height:24px"></div>';
  document.getElementById('kit-f-ings').innerHTML='';
  (r.ingredients&&r.ingredients.length?r.ingredients:[{name:'',amount:'',unit:'g'}]).forEach(i=>kitFormAddIng(i));
  document.getElementById('kit-f-steps').innerHTML='';
  (r.steps&&r.steps.length?r.steps:[{text:'',timerMinutes:null}]).forEach(s=>kitFormAddStep(s));
  const ov=document.getElementById('kit-form-overlay');
  ov.classList.remove('hidden');
  // full-screen on mobile
  if(window.innerWidth<1024){
    // Fixed top padding — opaque status bar reserves its height; no env(safe-area-inset-top)
    // double-count (see #app-header). Bottom inset kept.
    ov.style.cssText='position:fixed;inset:0;background:var(--bg);z-index:180;display:flex;flex-direction:column;overflow-y:auto;padding:16px 0 env(safe-area-inset-bottom,24px);align-items:stretch;justify-content:flex-start';
    const mb=document.getElementById('kit-form-box');
    if(mb) mb.style.cssText='width:100%;max-width:none;border-radius:0;box-shadow:none;max-height:none;margin:0;flex:1';
  } else {
    ov.style.cssText='';
    const mb=document.getElementById('kit-form-box');
    if(mb) mb.style.cssText='';
  }
}
function kitFormAddIng(data){
  const wrap=document.getElementById('kit-f-ings'); if(!wrap) return;
  const d=(data&&typeof data==='object')?data:{name:'',amount:'',unit:'g'};
  const unitSel=KIT_UNITS.map(u=>'<option value="'+u+'"'+((d.unit||'g')===u?' selected':'')+'>'+u+'</option>').join('');
  const row=document.createElement('div');
  row.className='kit-f-ing-row';
  row.innerHTML=
    '<input class="kit-fi-amt" type="text" inputmode="decimal" placeholder="Qty" value="'+kitEsc(String(d.amount||''))+'">'+
    '<select class="kit-fi-unit-sel">'+unitSel+'</select>'+
    '<input class="kit-fi-name" type="text" placeholder="Ingredient" value="'+kitEsc(d.name||'')+'">'+
    '<button class="kit-f-del" onclick="this.parentElement.remove()" aria-label="Remove">✕</button>';
  wrap.appendChild(row);
}
function kitFormAddStep(data){
  const wrap=document.getElementById('kit-f-steps'); if(!wrap) return;
  const text=kitStepText(data);
  const timer=kitStepTimer(data);
  const row=document.createElement('div');
  row.className='kit-f-step-row';
  row.innerHTML=
    '<textarea class="kit-fs-text" rows="2" placeholder="Describe this step">'+kitEsc(text)+'</textarea>'+
    '<input class="kit-fs-timer" type="number" inputmode="numeric" min="0" placeholder="⏱ min" value="'+(timer||'')+'" title="Timer (minutes)">'+
    '<button class="kit-f-del" onclick="this.parentElement.remove()" aria-label="Remove">✕</button>';
  wrap.appendChild(row);
}
function kitCloseForm(){
  const ov=document.getElementById('kit-form-overlay');
  if(ov){ ov.classList.add('hidden'); ov.style.cssText=''; }
  const mb=document.getElementById('kit-form-box');
  if(mb) mb.style.cssText='';
}
function kitSaveForm(){
  const num=v=>{ const n=parseFloat(v); return isNaN(n)?null:n; };
  const name=(document.getElementById('kit-f-name')?.value||'').trim();
  if(!name){ alert('Please enter a recipe name.'); return; }
  const ings=[...document.querySelectorAll('#kit-f-ings .kit-f-ing-row')].map(row=>({
    name:(row.querySelector('.kit-fi-name')?.value||'').trim(),
    amount:(()=>{ const v=(row.querySelector('.kit-fi-amt')?.value||'').trim(); const n=parseFloat(v); return (v!==''&&!isNaN(n))?n:v; })(),
    unit:(row.querySelector('.kit-fi-unit-sel')?.value||row.querySelector('.kit-fi-unit')?.value||'').trim(),
  })).filter(i=>i.name);
  const steps=[...document.querySelectorAll('#kit-f-steps .kit-f-step-row')].map(row=>{
    const t=(row.querySelector('.kit-fs-text')?.value||'').trim();
    const m=parseInt(row.querySelector('.kit-fs-timer')?.value||'');
    return {text:t,timerMinutes:(!isNaN(m)&&m>0)?m:null};
  }).filter(s=>s.text);
  const tags=[...document.querySelectorAll('#kit-f-tag-chips .kit-tag-chip.active')].map(b=>b.dataset.tag);
  const id=document.getElementById('kit-f-id')?.value||'';
  const data={
    name,
    emoji:(document.getElementById('kit-f-emoji')?.value||'🍽️').trim()||'🍽️',
    category:document.getElementById('kit-f-cat')?.value||'dinner',
    description:(document.getElementById('kit-f-desc')?.value||'').trim(),
    servings:Math.max(1,parseInt(document.getElementById('kit-f-serv')?.value)||1),
    cookTime:num(document.getElementById('kit-f-time')?.value),
    ingredients:ings,
    steps,
    tags,
    calories:num(document.getElementById('kit-f-cal')?.value),
    protein:num(document.getElementById('kit-f-pro')?.value),
    carbs:num(document.getElementById('kit-f-carb')?.value),
    fat:num(document.getElementById('kit-f-fat')?.value),
    batchPrep:tags.includes('batch-prep')||tags.includes('bulk-cook'),
  };
  if(id){
    const r=kitRecipes.find(x=>x.id===id);
    if(r) Object.assign(r,data);
  } else {
    kitRecipes.push(Object.assign({id:kitUUID(),favourite:false,lastCooked:null,createdAt:Date.now()},data));
    kitState.selectedId=null;
  }
  kitSaveRecipes();
  kitCloseForm();
  kitRenderList();
  if(id&&kitState.selectedId===id) kitRefreshOpenDetail();
}

// ══ KITCHEN: Shopping List ════════════════════════════════════════
const PANTRY_STAPLES = new Set([
  'extra virgin olive oil','olive oil','salted butter','butter','canola oil',
  'soy sauce','worcestershire sauce','balsamic vinegar','white vinegar',
  'bbq sauce','teriyaki sauce','mayonnaise','chipotle in adobo',
  'eggs','salt','black pepper','curry powder','sugar','brown sugar',
  'plain flour','cinnamon','vanilla extract','garlic','onion','brown onion',
  'smoked paprika','paprika','coriander','cumin','chilli','chilli flakes',
  'garam masala','garlic powder','garlic salt','onion powder','parsley',
  'rosemary','oregano','italian herbs','allspice','roast chicken seasoning',
  'bay leaves','cloves','cayenne pepper','ginger','ginger powder','sesame oil',
  // Short forms. Matching is exact (kitShopNorm + Set.has), and recipes write the everyday
  // name while this list held only the full one — so "Pepper" never matched 'black pepper'
  // and landed on every shopping list, with no quantity, even though the Pantry tracker was
  // already tracking Black pepper. Same near-miss for vanilla/worcestershire/balsamic/mayo.
  // Deliberately explicit aliases rather than substring matching: 'onion' is a staple, and a
  // substring rule would swallow "spring onion", which is produce you genuinely have to buy.
  'pepper','vanilla','worcestershire','balsamic','mayo',
  // Tracked in the Pantry tab (KITPANTRY_CATS 'sauces') but missing here, so they were
  // treated as shopping items despite being staples.
  'tomato ketchup','ketchup','dijon mustard','dijon'
]);
function kitGetIngredientCategory(name){
  const n=name.toLowerCase();
  if(/prawn|beef|chicken|lamb|steak|mince|patty|patties|pork|fish|tuna|salmon|egg/.test(n)) return 'Protein';
  if(/milk|cheese|butter|yoghurt|cream|feta/.test(n)) return 'Dairy';
  if(/lettuce|rocket|spinach|tomato|carrot|potato|onion|lemon|lime|berry|berries|apple|banana|capsicum|zucchini|mushroom|spring onion|basil|coriander leaf/.test(n)) return 'Produce';
  if(/bread|bun|noodle|rice|flour|pasta|oat|cereal|cracker|wrap|tortilla/.test(n)) return 'Bakery & Grains';
  return 'Other';
}
const KITSHOP_CAT_ORDER=['Produce','Protein','Dairy','Bakery & Grains','Other'];

function kitShopLoadSelected(){ return lsLoad('kitchen_shopping_selected', [], Array.isArray); }
function kitShopSaveSelected(){ lsSave('kitchen_shopping_selected', kitShopSelected, 'kitShopSelected'); }
function kitShopLoadChecked(){ return lsLoad('kitchen_shopping_checked', {}); }
function kitShopSaveChecked(){ lsSave('kitchen_shopping_checked', kitShopChecked, 'kitShopChecked'); }
function kitShopLoadManual(){ return lsLoad('kitchen_shopping_manual', [], Array.isArray); }
function kitShopSaveManual(){ lsSave('kitchen_shopping_manual', kitShopManual, 'kitShopManual'); }
let kitShopSelected = kitShopLoadSelected();
let kitShopChecked  = kitShopLoadChecked();
let kitShopManual   = kitShopLoadManual();
// If a list was already built (selections exist), reopen on the list view
let kitShopView = kitShopSelected.length ? 'list' : 'selector';

function kitShopRender(){
  const sel=document.getElementById('kitshop-selector');
  const list=document.getElementById('kitshop-list');
  if(!sel||!list) return;
  const onList=kitShopView==='list' && kitShopSelected.length>0;
  sel.classList.toggle('hidden',onList);
  list.classList.toggle('hidden',!onList);
  if(onList) kitShopRenderList(); else kitShopRenderSelector();
}

// ── State 1: recipe selector ──
function kitShopSelEntry(id){ return kitShopSelected.find(s=>s.recipeId===id); }
function kitShopToggleRecipe(id){
  const r=kitRecipes.find(x=>x.id===id); if(!r) return;
  const i=kitShopSelected.findIndex(s=>s.recipeId===id);
  if(i>=0) kitShopSelected.splice(i,1);
  else kitShopSelected.push({recipeId:id,servings:r.servings});
  kitShopSaveSelected();
  kitShopRenderSelector();
}
function kitShopAdjustServings(id,delta){
  const e=kitShopSelEntry(id); if(!e) return;
  const next=e.servings+delta;
  if(next<1) return;
  e.servings=next;
  kitShopSaveSelected();
  kitShopRenderSelector();
}
function kitShopRenderSelector(){
  const wrap=document.getElementById('kitshop-selector'); if(!wrap) return;
  if(!kitRecipes.length){
    wrap.innerHTML='<div class="empty" style="padding-top:64px"><div style="font-size:48px">🛒</div><div style="font-size:16px;font-weight:600;margin-top:12px">No recipes yet</div><div style="font-size:13px;color:var(--muted);margin-top:6px">Add recipes first, then build a list.</div></div>';
    return;
  }
  const recs=[...kitRecipes].sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  let html='<div class="kitshop-heading">What are you cooking this week?</div>';
  html+='<div class="kitshop-sel-list">';
  recs.forEach(r=>{
    const e=kitShopSelEntry(r.id);
    const on=!!e;
    const servings=e?e.servings:r.servings;
    html+='<div class="kitshop-sel-card'+(on?' selected':'')+'" onclick="kitShopToggleRecipe(\''+r.id+'\')">'+
      '<div class="kitshop-sel-check">'+(on?'✓':'')+'</div>'+
      '<div class="kitshop-sel-body">'+
        '<div class="kitshop-sel-name">'+kitEsc(r.name)+'</div>'+
        '<div class="kit-card-meta"><span class="kit-cat-tag kit-cat-'+r.category+'">'+r.category+'</span></div>'+
      '</div>'+
      (on?
        '<div class="kitshop-serv" onclick="event.stopPropagation()">'+
          '<button class="kitshop-serv-btn" onclick="kitShopAdjustServings(\''+r.id+'\',-1)" aria-label="Fewer">−</button>'+
          '<div class="kitshop-serv-num">'+servings+'</div>'+
          '<button class="kitshop-serv-btn" onclick="kitShopAdjustServings(\''+r.id+'\',1)" aria-label="More">+</button>'+
        '</div>'
        :'<div class="kitshop-serv-hint">'+r.servings+' serv</div>')+
    '</div>';
  });
  html+='</div>';
  const n=kitShopSelected.length;
  html+='<button class="kitshop-build-btn" onclick="kitShopBuild()"'+(n?'':' disabled')+'>Build shopping list →</button>';
  wrap.innerHTML=html;
}
function kitShopBuild(){
  if(!kitShopSelected.length) return;
  kitShopView='list';
  kitShopRender();
}

// ── Quantity combining ──
function kitShopNorm(name){ return (name||'').toLowerCase().trim(); }
function kitShopItemKey(name,unit){ return kitShopNorm(name)+'-'+(unit||'').toLowerCase().trim(); }
function kitShopComputeItems(){
  // map: key -> {name, unit, amount(number|null), hasNumeric, category}
  const map={};
  kitShopSelected.forEach(sel=>{
    const r=kitRecipes.find(x=>x.id===sel.recipeId); if(!r) return;
    const factor=(sel.servings||r.servings)/(r.servings||1);
    (r.ingredients||[]).forEach(ing=>{
      const nm=ing.name||'';
      if(!nm) return;
      if(PANTRY_STAPLES.has(kitShopNorm(nm))) return; // exclude staples
      const unit=(ing.unit||'').trim();
      const key=kitShopItemKey(nm,unit);
      const n=parseFloat(ing.amount);
      if(!map[key]){
        map[key]={name:nm,unit,amount:isNaN(n)?null:0,hasNumeric:!isNaN(n),category:kitGetIngredientCategory(nm)};
      }
      if(!isNaN(n)){
        map[key].amount=(map[key].amount||0)+n*factor;
        map[key].hasNumeric=true;
      }
    });
  });
  // manual items (always 'Other' or their stored category)
  kitShopManual.forEach(m=>{
    const key=kitShopItemKey(m.name,'');
    if(!map[key]) map[key]={name:m.name,unit:'',amount:null,hasNumeric:false,category:m.category||'Other',manual:true,manualId:m.id};
  });
  return map;
}
function kitShopRenderList(){
  const wrap=document.getElementById('kitshop-list'); if(!wrap) return;
  const map=kitShopComputeItems();
  const keys=Object.keys(map);
  // group by category
  const groups={};
  keys.forEach(k=>{ const it=map[k]; (groups[it.category]=groups[it.category]||[]).push(Object.assign({key:k},it)); });
  const needs=(typeof kitPantryNeeds==='function')?kitPantryNeeds():[];
  const totalItems=keys.length+needs.length;
  let html='';
  html+='<div class="kitshop-list-head">'+
    '<button class="back-btn" data-back="kitShopBackToSelector" aria-label="Back">'+BACK_CHEVRON+'</button>'+
    '<div class="kitshop-list-title">Shopping list<span class="kitshop-count">'+totalItems+'</span></div>'+
    '<button class="kitshop-clear-checked" onclick="kitShopClearChecked()">Clear checked</button>'+
  '</div>';
  if(!totalItems){
    html+='<div class="empty" style="padding:48px 16px"><div style="font-size:40px">✅</div><div style="font-size:15px;font-weight:600;margin-top:10px">Nothing to buy</div><div style="font-size:13px;color:var(--muted);margin-top:4px">Everything\'s a pantry staple — or add an item below.</div></div>';
  }
  // Pantry needs (out of stock / running low) — separate from recipe ingredients
  if(needs.length){
    html+='<div class="kitshop-cat-head kitshop-pantry-head">🥫 Pantry needs</div>';
    needs.forEach(it=>{
      html+='<label class="kitshop-item">'+
        '<input type="checkbox" class="kitshop-cb" onchange="kitPantryRestock(\''+it.id+'\')">'+
        '<span class="kitshop-item-name">'+kitEsc(it.name)+'</span>'+
        '<span class="kitshop-item-qty kitshop-need-tag '+(it.inStock?'low':'out')+'">'+(it.inStock?'⚠ Low':'Out')+'</span>'+
      '</label>';
    });
  }
  KITSHOP_CAT_ORDER.forEach(cat=>{
    const items=groups[cat]; if(!items||!items.length) return;
    items.sort((a,b)=>a.name.localeCompare(b.name));
    html+='<div class="kitshop-cat-head">'+cat+'</div>';
    items.forEach(it=>{
      const checked=!!kitShopChecked[it.key];
      let qty='';
      if(it.hasNumeric&&it.amount!=null){ qty=kitTrim(it.amount)+(it.unit?' '+it.unit:''); }
      else if(it.unit){ qty=it.unit; }
      html+='<label class="kitshop-item'+(checked?' checked':'')+'">'+
        '<input type="checkbox" class="kitshop-cb"'+(checked?' checked':'')+' onchange="kitShopToggleCheck(\''+it.key.replace(/'/g,"\\'")+'\',this.checked)">'+
        '<span class="kitshop-item-name">'+kitEsc(it.name)+'</span>'+
        (qty?'<span class="kitshop-item-qty">'+kitEsc(qty)+'</span>':'')+
        (it.manual?'<button class="kitshop-item-del" onclick="event.preventDefault();kitShopDeleteManual(\''+it.manualId+'\')" aria-label="Remove">✕</button>':'')+
      '</label>';
    });
  });
  html+='<button class="kitshop-clear-all" onclick="kitShopClearAll()">Clear all & start over</button>';
  wrap.innerHTML=html;
  // Manual-add bar (fixed) lives outside the scroll list
  kitShopRenderAddBar(true);
}
function kitShopRenderAddBar(show){
  let bar=document.getElementById('kitshop-addbar');
  if(!show){ if(bar) bar.remove(); return; }
  if(!bar){
    bar=document.createElement('div');
    bar.id='kitshop-addbar';
    bar.className='kitshop-addbar';
    bar.innerHTML='<input id="kitshop-add-input" type="text" placeholder="Add an item…" onkeydown="if(event.key===\'Enter\')kitShopAddManual()"><button onclick="kitShopAddManual()">Add</button>';
    document.body.appendChild(bar);
  }
  bar.style.display='flex';
}
function kitShopBackToSelector(){
  kitShopView='selector';
  kitShopRenderAddBar(false);
  kitShopRender();
}
function kitShopToggleCheck(key,checked){
  if(checked) kitShopChecked[key]=true; else delete kitShopChecked[key];
  kitShopSaveChecked();
  // update row styling without full re-render
  kitShopRenderList();
}
function kitShopClearChecked(){
  kitShopChecked={};
  kitShopSaveChecked();
  kitShopRenderList();
}
function kitShopAddManual(){
  const inp=document.getElementById('kitshop-add-input'); if(!inp) return;
  const name=inp.value.trim(); if(!name) return;
  kitShopManual.push({id:kitUUID(),name,category:'Other'});
  kitShopSaveManual();
  inp.value='';
  kitShopRenderList();
}
function kitShopDeleteManual(id){
  const m=kitShopManual.find(x=>x.id===id);
  kitShopManual=kitShopManual.filter(x=>x.id!==id);
  if(m) delete kitShopChecked[kitShopItemKey(m.name,'')];
  kitShopSaveManual(); kitShopSaveChecked();
  kitShopRenderList();
}
function kitShopClearAll(){
  if(!confirm('Clear the whole list and start over?')) return;
  kitShopSelected=[]; kitShopChecked={}; kitShopManual=[];
  kitShopSaveSelected(); kitShopSaveChecked(); kitShopSaveManual();
  kitShopView='selector';
  kitShopRenderAddBar(false);
  kitShopRender();
}

// ══ KITCHEN: Spice & Pantry Tracker ═══════════════════════════════
const KITPANTRY_CATS=[
  ['spices','Spices',['Smoked paprika','Paprika (ground)','Coriander (ground)','Cumin (ground)','Chilli flakes','Garam masala','Garlic powder','Garlic salt','Onion powder','Allspice (ground)','Roast chicken seasoning','Cayenne pepper','Ginger powder']],
  ['herbs','Dried Herbs',['Parsley (dried)','Rosemary leaves','Oregano leaves','Italian herbs','Bay leaves','Cloves (whole)']],
  ['dry','Dry Goods',['Salt','Black pepper','Curry powder','Cinnamon','Sugar','Brown sugar','Plain flour','Vanilla extract']],
  ['oils','Oils & Fats',['Extra virgin olive oil','Canola oil','Salted butter','Sesame oil']],
  ['sauces','Sauces & Condiments',['Soy sauce','Worcestershire sauce','Balsamic vinegar','White vinegar','BBQ sauce','Teriyaki sauce','Mayonnaise','Chipotle in adobo','Tomato ketchup','Dijon mustard']],
];
function kitPantryId(name){ return name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,''); }
// Seed item metadata (id -> {name, cat}); custom items carry their own metadata in the store
const KITPANTRY_SEED_META={};
KITPANTRY_CATS.forEach(([cat,,items])=>items.forEach(nm=>{ KITPANTRY_SEED_META[kitPantryId(nm)]={name:nm,cat}; }));
function kitPantryLoad(){
  try{
    const raw=localStorage.getItem('kitchen_pantry');
    if(raw){ const o=JSON.parse(raw); if(o&&typeof o==='object') return o; }
  }catch(e){}
  const seed={};
  KITPANTRY_CATS.forEach(([cat,,items])=>items.forEach(nm=>{ seed[kitPantryId(nm)]={inStock:true,runningLow:false}; }));
  localStorage.setItem('kitchen_pantry',JSON.stringify(seed));
  return seed;
}
let kitPantryData=kitPantryLoad();
function kitPantrySave(){ lsSave('kitchen_pantry', kitPantryData, 'kitPantry'); }
// All items (seed + custom) grouped by category key
function kitPantryItemsByCat(){
  const groups={}; KITPANTRY_CATS.forEach(([cat])=>groups[cat]=[]);
  // seed items in their defined order
  KITPANTRY_CATS.forEach(([cat,,items])=>items.forEach(nm=>{
    const id=kitPantryId(nm);
    const st=kitPantryData[id]||{inStock:true,runningLow:false};
    groups[cat].push({id,name:nm,cat,inStock:st.inStock!==false,runningLow:!!st.runningLow});
  }));
  // custom items (have name+cat stored in the value)
  Object.keys(kitPantryData).forEach(id=>{
    const v=kitPantryData[id];
    if(v&&v.custom&&v.name){
      const cat=v.cat&&groups[v.cat]?v.cat:'sauces';
      groups[cat].push({id,name:v.name,cat,inStock:v.inStock!==false,runningLow:!!v.runningLow,custom:true});
    }
  });
  return groups;
}
function kitPantryNeeds(){
  // Items out of stock OR running low — for the shopping list
  const out=[];
  const seen={};
  const push=(id,name,inStock)=>{ if(seen[id])return; seen[id]=1; out.push({id,name,inStock}); };
  Object.keys(kitPantryData).forEach(id=>{
    const v=kitPantryData[id]||{};
    const meta=KITPANTRY_SEED_META[id];
    const name=(v.custom&&v.name)?v.name:(meta?meta.name:null);
    if(!name) return;
    if(v.inStock===false || v.runningLow===true) push(id,name,v.inStock!==false);
  });
  out.sort((a,b)=>a.name.localeCompare(b.name));
  return out;
}
function kitPantryToggleStock(id){
  const v=kitPantryData[id]||(kitPantryData[id]={inStock:true,runningLow:false});
  v.inStock=v.inStock===false; // flip (running-low flag is left untouched)
  kitPantrySave();
  kitPantryRender();
}
function kitPantryToggleLow(id){
  const v=kitPantryData[id]||(kitPantryData[id]={inStock:true,runningLow:false});
  v.runningLow=!v.runningLow;
  kitPantryData[id]=v;
  kitPantrySave();
  kitPantryRender();
}
function kitPantryRestock(id){
  const v=kitPantryData[id]||{};
  v.inStock=true; v.runningLow=false;
  // preserve custom metadata
  kitPantryData[id]=Object.assign(kitPantryData[id]||{},v);
  kitPantrySave();
  // refresh whichever kitchen view is active
  if(kitState.tab==='pantry') kitPantryRender();
  if(kitState.tab==='shopping') kitShopRenderList();
}
function kitPantryAddCustom(catKey){
  const inp=document.getElementById('kitpantry-add-'+catKey);
  if(!inp) return;
  const name=inp.value.trim(); if(!name) return;
  let id='custom_'+Date.now();
  kitPantryData[id]={inStock:true,runningLow:false,custom:true,name,cat:catKey};
  kitPantrySave();
  inp.value='';
  kitPantryRender();
}
function kitPantryRender(){
  const wrap=document.getElementById('kitpantry'); if(!wrap) return;
  const groups=kitPantryItemsByCat();
  // Summary counts
  let inStock=0,low=0,out=0;
  Object.keys(groups).forEach(cat=>groups[cat].forEach(it=>{
    if(!it.inStock) out++; else { inStock++; if(it.runningLow) low++; }
  }));
  let html='<div class="kitpantry-summary">'+
    '<span class="kitpantry-badge good">'+inStock+' in stock</span>'+
    '<span class="kitpantry-badge warn">'+low+' running low</span>'+
    '<span class="kitpantry-badge bad">'+out+' out of stock</span>'+
  '</div>';
  KITPANTRY_CATS.forEach(([cat,label])=>{
    html+='<div class="kitpantry-cat-head">'+label+'</div>';
    // Items wrapped per category so desktop can lay them out two-up without the sticky
    // category headings being pulled into a column alongside them.
    html+='<div class="kitpantry-cat-items">';
    groups[cat].forEach(it=>{
      html+='<div class="kitpantry-item'+(it.inStock?'':' out')+'">'+
        '<input type="checkbox" class="kitpantry-cb"'+(it.inStock?' checked':'')+' onchange="kitPantryToggleStock(\''+it.id+'\')" aria-label="In stock">'+
        '<span class="kitpantry-name">'+kitEsc(it.name)+'</span>'+
        '<button class="kitpantry-low'+(it.runningLow?' on':'')+'" onclick="kitPantryToggleLow(\''+it.id+'\')">⚠ Low</button>'+
        (it.custom?'<button class="kitpantry-del" onclick="kitPantryDeleteCustom(\''+it.id+'\')" aria-label="Remove">✕</button>':'')+
      '</div>';
    });
    html+='</div>';
    html+='<div class="kitpantry-add"><input id="kitpantry-add-'+cat+'" type="text" placeholder="+ Add item" onkeydown="if(event.key===\'Enter\')kitPantryAddCustom(\''+cat+'\')"><button onclick="kitPantryAddCustom(\''+cat+'\')">Add</button></div>';
  });
  wrap.innerHTML=html;
}
function kitPantryDeleteCustom(id){
  delete kitPantryData[id];
  kitPantrySave();
  kitPantryRender();
}

// ── Portrait lock ─────────────────────────────────────────────────
// iOS Safari ignores the JS screen-orientation lock API, so the manifest's
// "orientation":"portrait" only covers Android/installed PWAs. This overlay is the real
// enforcement. Width-guarded to 1024 so the desktop layout (always landscape on a monitor)
// is never blocked — only phone-width viewports rotated to landscape get the prompt.
function checkOrientation(){
  const overlay=document.getElementById('rotate-overlay');
  if(!overlay) return;
  const landscape = window.innerWidth > window.innerHeight && window.innerWidth < 1024;
  overlay.style.display = landscape ? 'flex' : 'none';
}
window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', checkOrientation);
checkOrientation(); // run on boot

// ── Boot ──────────────────────────────────────────────────────────
// Wrapped so a single render/init error surfaces a visible message instead of
// leaving a blank black screen — and so later steps (like the SW registration
// that ships fresh code) still run even if an earlier step throws.
try {
  migrateLegsGroupOnce(); // one-time: 'legs' → quads/hamstrings/calves/glutes/lower back
  recoverBudgetData(); // one-time: normalise legacy budget weeks, strip shadowing snapshots
  migrateCatBudgetsOnce(); // one-time: lift budgetConfig weekly amounts onto the categories
  migrateSubscriptionsToFixedOnce(); // one-time: fold subscriptions into fixed categories
  migrateDropSubsAggregateOnce(); // one-time: drop the leftover aggregate 'subs' category
  migrateRetiredAccentOnce(); // one-time: retired orange default → neutral grey
  migrateDefaultWideOnce();   // one-time: three full-width Home cards → just the session hero
  budCleanupUnnamedCatsOnce(); // one-time: clear machine-id rows left by unnamed categories
  // Warm the timed-exercise cache at boot: getPR/getPoints read it, and Stats can render
  // before renderLog has ever run.
  refreshSecsNames();
  // Weight-log consolidation: fold any legacy daily_weight_log entries into wt_weight.
  // The local key is only removed by the signed-in path (after the merged copy is safely
  // in the cloud), so a signed-out merge can never lose data to the next cloud pull.
  if(mergeLegacyWeightEntries()) persistWeights();
  // Seed the CC balance history from the current balance so the net-worth line has a start.
  if(!ccLog.length){
    const _ccBal=parseFloat(loadCCData().balance);
    if(_ccBal>0) recordCCHistory(_ccBal);
  }
  applyTheme();
  applyLogoDayColour();
  buildSideMenu();
  restoreQuickSettings();
  applyDayColour();
  logCheckin();
  // Restore an in-progress workout from earlier today (survives refresh); else fresh day.
  if(!restoreSetData()) initDay(suggestDay());
  renderHome();
  updateNavPill(S.view||'home'); // seed the nav underline before the first tab switch
  updateHeaderAvatar();
  updateDesktopSidebar();
  // Event delegation on the stable sidebar parent — one listener, never double-binds
  const _dsSidebar=document.getElementById('desktop-sidebar');
  if(_dsSidebar) _dsSidebar.addEventListener('click',e=>{
    const item=e.target.closest('.ds-item');
    if(item&&item.dataset.tab) setView(item.dataset.tab);
  });
  document.querySelectorAll('.ds-item').forEach(b=>b.classList.toggle('active',b.dataset.tab==='home'));
  updateNavPill('home');
  updateStatsPill('home');
  updateNavBadges();
  (function(){
    const _bn=document.getElementById('bottom-nav');
    if(!_bn) return;
    _bn.addEventListener('click', function(e){
      const btn=e.target.closest('.nav-btn');
      if(!btn) return;
      const icon=btn.querySelector('svg');
      if(!icon) return;
      icon.classList.remove('nav-icon-bounce');
      void icon.offsetWidth;
      icon.classList.add('nav-icon-bounce');
      icon.addEventListener('animationend', ()=>icon.classList.remove('nav-icon-bounce'), {once:true});
    });
  })();
  checkOnboarding();
  checkWhatsNew();
  checkReminders();
  // Boot is over: from here every save is a real edit and stamps the current time.
  _bootPhase = false;
} catch(e) {
  // Cleared in the failure path too — otherwise an init error would leave every later save
  // unstamped, and this device could never win a sync conflict again.
  _bootPhase = false;
  console.error('App init failed:', e);
  const main=document.getElementById('app-main');
  if(main) main.innerHTML='<div style="padding:24px;color:var(--text);font-size:14px;line-height:1.6">'+
    '<div style="font-size:32px;margin-bottom:8px">⚠️</div>'+
    '<div style="font-weight:700;margin-bottom:6px">Something went wrong loading the app</div>'+
    '<div style="color:var(--muted);font-size:13px;margin-bottom:12px">'+(e&&e.message?String(e.message).replace(/</g,'&lt;'):'Unknown error')+'</div>'+
    '<button onclick="try{if(typeof budSaveCurrentWeek===\'function\')budSaveCurrentWeek()}catch(e){};location.reload(true)" style="padding:10px 20px;border:none;border-radius:10px;background:var(--accent);color:#fff;font-size:14px;font-weight:600;cursor:pointer">Reload</button>'+
    '</div>';
}

// Always register the (network-first) service worker so fresh code reaches the
// device even if boot above threw — this is what replaces stale cached code.
if('serviceWorker' in navigator){
  // When a new SW (skipWaiting + clients.claim) takes control, the page is still
  // running the OLD cached JS/CSS until it reloads. Reload once automatically so
  // updates apply on the very next launch instead of needing a manual second relaunch.
  // Guarded against loops: only fires after an existing controller is replaced.
  let _swRefreshing=false;
  if(navigator.serviceWorker.controller){
    navigator.serviceWorker.addEventListener('controllerchange', function(){
      if(_swRefreshing) return;
      _swRefreshing=true;
      location.reload();
    });
  }
  // Relative, not hardcoded to a repo name — an absolute /workout-tracker/ path here
  // broke outright when the repo was renamed to daily-app (404, registration failed
  // silently), which also broke "Add to Home Screen" via manifest.json's start_url
  // pointing at the same dead path.
  navigator.serviceWorker.register('service-worker.js');
}

// ── Keep #app-main bottom padding in sync with the real bottom-nav height ──
// The nav height varies with the device safe-area inset, so measure it rather than
// hardcoding. Floored + small gap so a mistimed measurement can never clip content;
// falls back to the stylesheet value on desktop (nav hidden) or if measuring fails.
function syncNavPadding(){
  var nav=document.getElementById('bottom-nav');
  var main=document.getElementById('app-main');
  if(!nav||!main) return;
  var h=Math.round(nav.getBoundingClientRect().height);
  if(h>0){
    main.style.paddingBottom=Math.max(h+12, 88)+'px';
    document.documentElement.style.setProperty('--nav-height', h+'px');
  } else {
    main.style.paddingBottom='';
    document.documentElement.style.removeProperty('--nav-height');
  }
}
window.addEventListener('load', syncNavPadding);
window.addEventListener('resize', syncNavPadding);
window.addEventListener('orientationchange', function(){ setTimeout(syncNavPadding,150); });
setTimeout(syncNavPadding, 0);

// ── iOS standalone PWA cold-launch layout fix ──
// On a fresh launch from the Home Screen, iOS can render before env(safe-area-inset-*)
// resolve (they come back 0) and with a mis-measured viewport — the app "fixes itself"
// only after the user rotates. Force the same reflow a few times after launch / on
// resume so the safe-area insets + nav padding settle without needing a rotation.
// (Scroll position is preserved; the display toggle is synchronous so it never paints.)
function pinAppHeight(){
  // #app now fills the viewport via CSS (position:fixed; inset:0), which iOS resolves
  // correctly at launch — so never set an explicit JS height (it would override the
  // insets). Only clear any stale inline height left by an earlier app version.
  var app=document.getElementById('app');
  if(app && app.style.height) app.style.height='';
}
function nudgeLayout(){
  // Note: the old viewport-fit (cover→auto→cover) toggle was REMOVED — it raced with how
  // iOS resolves env(safe-area-inset-top) and intermittently double-counted it, dragging
  // the header down on some launches. With #app on position:fixed (stable dvh) the toggle
  // is unnecessary; we only keep the nav-padding sync here.
  pinAppHeight();
  if(typeof syncNavPadding==='function') syncNavPadding();
}
// ── Notes ──────────────────────────────────────────────────────────
function renderNotes(){
  const wrap=document.getElementById('notes-content'); if(!wrap) return;
  const notes=loadNotes();
  const today=getLocalDate();

  let html=`<button onclick="notesOpenEdit(null)" style="width:100%;padding:12px;border-radius:14px;border:none;background:var(--accent);color:#fff;font-size:15px;font-weight:700;margin-bottom:16px">+ New note</button>`;

  html+=`<div style="display:flex;gap:8px;margin-bottom:16px">
    <button onclick="notesFilter('all')" id="nf-all" style="flex:1;padding:8px;border-radius:10px;border:none;background:var(--accent);color:#fff;font-size:13px;font-weight:600">All</button>
    <button onclick="notesFilter('work')" id="nf-work" style="flex:1;padding:8px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:13px;font-weight:600">Work</button>
    <button onclick="notesFilter('personal')" id="nf-personal" style="flex:1;padding:8px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:13px;font-weight:600">Personal</button>
  </div>`;

  if(!notes.length){
    html+=`<div style="text-align:center;padding:60px 20px;color:var(--muted)"><div style="font-size:40px;margin-bottom:12px">📝</div><div style="font-size:16px;font-weight:600;margin-bottom:6px">No notes yet</div><div style="font-size:14px">Tap + New note to get started</div></div>`;
  } else {
    const sorted=[...notes].sort((a,b)=>{
      if(a.priority!==b.priority) return a.priority?-1:1;
      if(a.date&&b.date) return a.date<b.date?-1:1;
      if(a.date) return -1; if(b.date) return 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
    sorted.forEach(n=>{
      const typeColor=n.type==='work'?'#3b82f6':'#52B788';
      const typeLabel=n.type==='work'?'Work':'Personal';
      let dateBadge='';
      if(n.date&&n.dateType!=='none'){
        const diff=Math.ceil((new Date(n.date)-new Date(today))/(1000*60*60*24));
        const label=n.dateType==='expiry'?'Expires':'Reminder';
        const urgentColor=diff<=7?'var(--danger)':diff<=30?'#f59e0b':'var(--success)';
        dateBadge=`<span style="background:${urgentColor};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">${label}: ${diff<=0?'Today':diff===1?'Tomorrow':n.date}</span>`;
      }
      html+=`<div style="background:var(--card);border-radius:16px;padding:14px 16px;margin-bottom:10px;position:relative" onclick="notesOpenEdit('${n.id}')">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="background:${typeColor};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">${typeLabel}</span>
          ${n.priority?'<span style="font-size:13px">⭐</span>':''}
          ${dateBadge}
        </div>
        <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px">${n.title}</div>
        ${n.body?`<div style="font-size:13px;color:var(--muted);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${n.body}</div>`:''}
      </div>`;
    });
  }

  wrap.innerHTML=html;
  wrap.dataset.filter='all';
}

function notesFilter(f){
  ['all','work','personal'].forEach(t=>{
    const btn=document.getElementById('nf-'+t);
    if(btn){ btn.style.background=t===f?'var(--accent)':'var(--card)'; btn.style.color=t===f?'#fff':'var(--text)'; btn.style.border=t===f?'none':'1px solid var(--border)'; }
  });
  const wrap=document.getElementById('notes-content'); if(!wrap) return;
  wrap.dataset.filter=f;
  const notes=f==='all'?loadNotes():loadNotes().filter(n=>n.type===f);
  const today=getLocalDate();
  const sorted=[...notes].sort((a,b)=>{
    if(a.priority!==b.priority) return a.priority?-1:1;
    if(a.date&&b.date) return a.date<b.date?-1:1;
    if(a.date) return -1; if(b.date) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
  // Replace only the card area (everything after the 2 fixed buttons)
  let cardsHtml='';
  if(!sorted.length){
    cardsHtml=`<div style="text-align:center;padding:60px 20px;color:var(--muted)"><div style="font-size:40px;margin-bottom:12px">📝</div><div style="font-size:16px;font-weight:600;margin-bottom:6px">No notes</div></div>`;
  } else {
    sorted.forEach(n=>{
      const typeColor=n.type==='work'?'#3b82f6':'#52B788';
      const typeLabel=n.type==='work'?'Work':'Personal';
      let dateBadge='';
      if(n.date&&n.dateType!=='none'){
        const diff=Math.ceil((new Date(n.date)-new Date(today))/(1000*60*60*24));
        const label=n.dateType==='expiry'?'Expires':'Reminder';
        const urgentColor=diff<=7?'var(--danger)':diff<=30?'#f59e0b':'var(--success)';
        dateBadge=`<span style="background:${urgentColor};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">${label}: ${diff<=0?'Today':diff===1?'Tomorrow':n.date}</span>`;
      }
      cardsHtml+=`<div style="background:var(--card);border-radius:16px;padding:14px 16px;margin-bottom:10px;position:relative" onclick="notesOpenEdit('${n.id}')">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="background:${typeColor};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px">${typeLabel}</span>
          ${n.priority?'<span style="font-size:13px">⭐</span>':''}
          ${dateBadge}
        </div>
        <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px">${n.title}</div>
        ${n.body?`<div style="font-size:13px;color:var(--muted);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${n.body}</div>`:''}
      </div>`;
    });
  }
  // Splice into wrap: keep first 2 children (new-btn + filter-row), replace rest
  const kids=[...wrap.children];
  kids.slice(2).forEach(k=>k.remove());
  const tmp=document.createElement('div'); tmp.innerHTML=cardsHtml;
  while(tmp.firstChild) wrap.appendChild(tmp.firstChild);
}

function notesOpenEdit(id){
  const notes=loadNotes();
  const note=id?notes.find(n=>n.id===id):null;
  const n=note||{id:'note_'+Date.now(),title:'',body:'',type:'personal',dateType:'none',date:'',priority:false,createdAt:getLocalDate()};

  const overlay=document.createElement('div');
  overlay.className='modal-overlay';
  overlay.id='note-edit-overlay';
  overlay.innerHTML=`<div class="modal-box" style="max-width:480px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div style="font-size:17px;font-weight:700">${id?'Edit note':'New note'}</div>
      <div style="display:flex;align-items:center;gap:4px">
        <button onclick="notesViewFullscreen('${n.id}')" aria-label="Read fullscreen" title="Read fullscreen" style="background:none;border:none;color:var(--muted);cursor:pointer;padding:4px;display:flex;-webkit-tap-highlight-color:transparent"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></button>
        <button onclick="this.closest('.modal-overlay').remove()" aria-label="Close" style="background:none;border:none;font-size:22px;color:var(--muted);cursor:pointer;padding:0 4px">×</button>
      </div>
    </div>
    <input id="ne-title" placeholder="Title" value="${n.title}" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:15px;margin-bottom:10px;box-sizing:border-box">
    <textarea id="ne-body" placeholder="Note body (optional)" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:14px;min-height:80px;box-sizing:border-box;resize:vertical;margin-bottom:10px">${n.body}</textarea>
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <select id="ne-type" style="flex:1;padding:8px 10px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:14px">
        <option value="personal" ${n.type==='personal'?'selected':''}>Personal</option>
        <option value="work" ${n.type==='work'?'selected':''}>Work</option>
      </select>
      <select id="ne-datetype" style="flex:1;padding:8px 10px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:14px" onchange="document.getElementById('ne-date').style.display=this.value==='none'?'none':'block'">
        <option value="none" ${n.dateType==='none'?'selected':''}>No date</option>
        <option value="reminder" ${n.dateType==='reminder'?'selected':''}>Reminder</option>
        <option value="expiry" ${n.dateType==='expiry'?'selected':''}>Expiry</option>
      </select>
    </div>
    <input type="date" id="ne-date" value="${n.date}" style="width:100%;padding:8px 12px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:14px;margin-bottom:10px;box-sizing:border-box;display:${n.dateType==='none'?'none':'block'}">
    <label style="display:flex;align-items:center;gap:8px;margin-bottom:16px;font-size:14px;color:var(--text);cursor:pointer">
      <input type="checkbox" id="ne-priority" ${n.priority?'checked':''} style="width:16px;height:16px;accent-color:var(--accent)"> Priority note
    </label>
    <div style="display:flex;gap:8px">
      ${id?`<button onclick="notesDelete('${id}');this.closest('.modal-overlay').remove()" style="flex:1;padding:11px;border-radius:12px;border:1px solid var(--danger);background:transparent;color:var(--danger);font-weight:600;font-size:14px">Delete</button>`:''}
      <button onclick="notesSave('${n.id}')" style="flex:1;padding:11px;border-radius:12px;border:none;background:var(--accent);color:#fff;font-weight:700;font-size:14px">Save</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}

// Fullscreen note editor. Opened from the compact edit modal — persists whatever's typed so far
// (via notesSaveDraft, no "title required" gate) before swapping to the fullscreen view, so
// jumping to fullscreen mid-edit never drops text. The fullscreen fields are themselves editable
// and save live (debounced) back to the same record.
function notesSaveDraft(id){
  const notes=loadNotes();
  const idx=notes.findIndex(n=>n.id===id);
  const updated={
    id,
    title: document.getElementById('ne-title')?.value?.trim()||'',
    body: document.getElementById('ne-body')?.value||'',
    type: document.getElementById('ne-type')?.value||'personal',
    dateType: document.getElementById('ne-datetype')?.value||'none',
    date: document.getElementById('ne-date')?.value||'',
    priority: document.getElementById('ne-priority')?.checked||false,
    createdAt: idx>=0?notes[idx].createdAt:getLocalDate()
  };
  if(idx>=0) notes[idx]=updated; else notes.push(updated);
  saveNotes(notes);
  return updated;
}
function notesViewFullscreen(id){
  const saved = id ? notesSaveDraft(id) : null; // nothing typed so far is ever lost now
  document.getElementById('note-edit-overlay')?.remove();
  showNoteView(saved?saved.title:'', saved?saved.body:'', id);
}
let _noteViewId=null;
let _noteViewSaveTimer=null;
function showNoteView(title, body, id){
  _noteViewId=id;
  const t=document.getElementById('note-view-title'); if(t) t.value=title||'';
  const b=document.getElementById('note-view-body'); if(b) b.value=body||'';
  const v=document.getElementById('note-view-overlay');
  if(v){ v.style.display='block'; v.scrollTop=0; }
}
function noteViewSave(){
  clearTimeout(_noteViewSaveTimer);
  _noteViewSaveTimer=setTimeout(()=>{
    if(!_noteViewId) return;
    const notes=loadNotes();
    const idx=notes.findIndex(n=>n.id===_noteViewId);
    if(idx<0) return;
    notes[idx].title=(document.getElementById('note-view-title')?.value||'').trim();
    notes[idx].body=document.getElementById('note-view-body')?.value||'';
    saveNotes(notes);
  }, 500);
}
function closeNoteView(){ const v=document.getElementById('note-view-overlay'); if(v) v.style.display='none'; }
function copyNoteView(){
  const title=document.getElementById('note-view-title')?.value||'';
  const body=document.getElementById('note-view-body')?.value||'';
  const text=(title?title+'\n\n':'')+body;
  const btn=document.getElementById('note-view-copy');
  const done=()=>{ if(btn){ const o=btn.textContent; btn.textContent='Copied ✓'; setTimeout(()=>{ btn.textContent=o; },1500); } };
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(done,()=>{}); return; }
  }catch(e){}
  // Fallback for insecure contexts / older webviews
  try{
    const ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done();
  }catch(e){}
}

function notesSave(id){
  const title=document.getElementById('ne-title')?.value?.trim();
  if(!title){ alert('Add a title'); return; }
  const notes=loadNotes();
  const idx=notes.findIndex(n=>n.id===id);
  const updated={
    id, title,
    body: document.getElementById('ne-body')?.value?.trim()||'',
    type: document.getElementById('ne-type')?.value||'personal',
    dateType: document.getElementById('ne-datetype')?.value||'none',
    date: document.getElementById('ne-date')?.value||'',
    priority: document.getElementById('ne-priority')?.checked||false,
    createdAt: idx>=0?notes[idx].createdAt:getLocalDate()
  };
  if(idx>=0) notes[idx]=updated; else notes.push(updated);
  saveNotes(notes);
  document.getElementById('note-edit-overlay')?.remove();
  renderNotes();
  renderHomeNotesBubble();
}

function notesDelete(id){
  const notes=loadNotes().filter(n=>n.id!==id);
  saveNotes(notes);
  renderNotes();
  renderHomeNotesBubble();
}

function buildHomeNotesCard(){
  const today=getLocalDate();
  const in7=new Date(today); in7.setDate(in7.getDate()+7);
  const in7Str=dateStr(in7);
  const all=loadNotes();
  const dated=n=>n.date&&n.dateType!=='none';
  // Each note lands in exactly ONE bucket. Priority wins first (accent, "pinned"); the other
  // three exclude priority so nothing renders twice. `recent` = undated notes (the default
  // dateType for a new note), newest first, capped so the card can't grow unbounded.
  const priority=all.filter(n=>n.priority);
  const urgent  =all.filter(n=>!n.priority&&dated(n)&&n.date>=today&&n.date<=in7Str);
  const upcoming=all.filter(n=>!n.priority&&dated(n)&&n.date>in7Str);
  const recent  =all.filter(n=>!n.priority&&!dated(n))
    .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))
    .slice(0,3);
  // Whole card taps through to the Notes tab (rows inherit the click via bubbling).
  const row=(dotCol,titleWeight,title,rightHtml)=>
    `<div style="display:flex;align-items:center;gap:10px;padding:6px 0"><span style="width:8px;height:8px;border-radius:50%;background:${dotCol};flex-shrink:0"></span><div style="flex:1;font-size:14px;font-weight:${titleWeight};color:var(--text)">${title}</div>${rightHtml}</div>`;
  let html='<div class="card" onclick="setView(\'notes\')" style="cursor:pointer">';
  html+='<div style="font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Notes</div>';
  if(!priority.length&&!urgent.length&&!recent.length&&!upcoming.length){
    html+='<div style="font-size:13px;color:var(--muted)">No notes yet</div>';
  } else {
    // 1) Priority — accent dot, pinned to the top.
    priority.forEach(n=>{
      html+=row('var(--accent)','600',n.title,'<div style="font-size:12px;color:var(--accent-text);font-weight:700">Priority</div>');
    });
    // 2) Urgent — danger dot, due within 7 days.
    urgent.forEach(n=>{
      const diff=Math.ceil((new Date(n.date)-new Date(today))/(1000*60*60*24));
      const label=diff<=0?'Today':diff===1?'Tomorrow':'In '+diff+' days';
      html+=row('var(--danger)','600',n.title,`<div style="font-size:12px;color:var(--danger);font-weight:600">${label}</div>`);
    });
    // 3) Recent — undated notes, muted dot, no date label.
    recent.forEach(n=>{
      html+=row('var(--muted)','500',n.title,'');
    });
    // 4) Upcoming — muted dot, due after 7 days.
    upcoming.forEach(n=>{
      html+=row('var(--muted)','500',n.title,`<div style="font-size:12px;color:var(--muted)">${n.date}</div>`);
    });
  }
  html+='</div>';
  return html;
}
function renderHomeNotesBubble(){
  const el=document.querySelector('#home-content [data-card-id="notes"]');
  if(el) el.innerHTML=buildHomeNotesCard();
}

// ── Plans ──────────────────────────────────────────────────────────
function renderPlans(){
  const wrap=document.getElementById('plans-content'); if(!wrap) return;
  const data=loadPlans();
  const active=data.plans.find(p=>p.id===data.activePlanId)||data.plans[0]||null;

  const today=getLocalDate();
  if(active && data.streak.lastDate!==today){
    const yesterday=new Date(today); yesterday.setDate(yesterday.getDate()-1);
    const yStr=dateStr(yesterday);
    if(data.streak.lastDate===yStr){
      data.streak.count++;
    } else if(data.streak.lastDate!==today){
      data.streak.count=0;
    }
    data.streak.lastDate=today;
    savePlans(data);
  }

  let html='';

  if(active){
    html+=`<div style="background:linear-gradient(135deg,rgba(var(--accent-rgb),.15),rgba(var(--accent-rgb),.05));border-radius:16px;padding:16px 20px;margin-bottom:16px;display:flex;align-items:center;gap:14px">
      <div style="font-size:32px">🔥</div>
      <div>
        <div style="font-size:24px;font-weight:800;color:var(--accent-text);font-family:var(--font-num)">${data.streak.count} day streak</div>
        <div style="font-size:13px;color:var(--muted)">Active: ${active.name}</div>
      </div>
    </div>`;
  }

  // Saving the current split is the primary action now — it's the only one that produces a
  // program you can actually train, so it leads and the import/export tools follow.
  html+=`<button onclick="plansSaveCurrentAsProgram()" style="width:100%;padding:13px;border-radius:12px;border:none;background:var(--accent);color:#fff;font-size:15px;font-weight:700;margin-bottom:8px">+ Save current split as a program</button>`;
  html+=`<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
    <button onclick="plansImport()" style="flex:1;padding:10px;border-radius:12px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:13px;font-weight:600">⬆ JSON</button>
    <button onclick="plansImportHTML()" style="flex:1;padding:10px;border-radius:12px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:13px;font-weight:600">⬆ HTML</button>
    <button onclick="plansExport()" style="flex:1;padding:10px;border-radius:12px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:13px;font-weight:600">⬇ Export</button>
  </div>`;

  if(!data.plans.length){
    html+=`<div style="text-align:center;padding:60px 20px;color:var(--muted)"><div style="font-size:40px;margin-bottom:12px">🗂️</div><div style="font-size:16px;font-weight:600;margin-bottom:6px;color:var(--text)">No programs yet</div><div style="font-size:14px;line-height:1.5">Save your current training split as a program, then build others and switch between them any time.</div></div>`;
  } else {
    html+=`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">${data.plans.map(p=>`<button onclick="plansSetActive('${p.id}')" style="padding:6px 14px;border-radius:20px;border:none;background:${p.id===data.activePlanId?'var(--accent)':'var(--card-2)'};color:${p.id===data.activePlanId?'#fff':'var(--text)'};font-size:13px;font-weight:600">${p.name}</button>`).join('')}</div>`;

    if(active){
      if(planIsProgram(active)){
        // A saved training split: its real days and exercises, plus whether it's the one
        // currently driving the Log.
        const applied=planAppliedState(active)==='active';
        const types=active.cfg.types||[], sched=active.cfg.schedule||[];
        html+=`<div style="background:var(--card);border-radius:16px;padding:16px;margin-bottom:12px">`;
        html+=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <div style="font-size:16px;font-weight:700;color:var(--text);flex:1;min-width:0">${_catEscHtml(active.name)}</div>
          ${applied?`<span style="font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:999px;background:rgba(var(--accent-rgb),.16);color:var(--accent-text)">Training now</span>`:''}
        </div>`;
        html+=`<div style="font-size:12px;color:var(--muted);margin-bottom:12px">${types.length} day${types.length===1?'':'s'} · ${sched.length}-day rotation</div>`;
        types.forEach((t,i)=>{
          const exs=t.exercises||[];
          html+=`<div style="border-bottom:1px solid var(--border);padding:10px 0">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:${exs.length?6:0}px">
              <div style="width:32px;height:32px;border-radius:8px;background:rgba(var(--accent-rgb),.12);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--accent-text)">${i+1}</div>
              <div style="font-weight:600;color:var(--text);font-size:14px">${_catEscHtml(t.name||'Day '+(i+1))}</div>
              <div style="margin-left:auto;font-size:12px;color:var(--muted)">${exs.length} ex</div>
            </div>
            ${exs.map(e=>`<div style="padding:3px 0 3px 40px;font-size:13px;color:var(--text-2)">${_catEscHtml(e.name||'')}</div>`).join('')}
          </div>`;
        });
        html+=`</div>`;
        html+=`<button onclick="plansApply('${active.id}')" ${applied?'disabled':''} style="width:100%;padding:13px;border-radius:12px;border:none;background:${applied?'var(--card-2)':'var(--accent)'};color:${applied?'var(--muted)':'#fff'};font-size:15px;font-weight:700;margin-bottom:8px">${applied?'Currently training this':'Switch to this program'}</button>`;
        html+=`<div style="display:flex;gap:8px;margin-bottom:8px">
          <button onclick="plansUpdateFromCurrent('${active.id}')" style="flex:1;padding:10px;border-radius:12px;border:1px solid var(--border);background:transparent;color:var(--text);font-size:13px;font-weight:600">Save current split into this</button>
          <button onclick="plansRename('${active.id}')" style="flex:1;padding:10px;border-radius:12px;border:1px solid var(--border);background:transparent;color:var(--text);font-size:13px;font-weight:600">Rename</button>
        </div>`;
      } else if(active.type==='html'){
        // HTML plan — show open button and a preview description
        html+=`<div style="background:var(--card);border-radius:16px;padding:20px;margin-bottom:12px;text-align:center">
          <div style="font-size:36px;margin-bottom:10px">📄</div>
          <div style="font-size:16px;font-weight:700;margin-bottom:6px;color:var(--text)">${active.name}</div>
          <div style="font-size:13px;color:var(--muted);margin-bottom:16px">HTML plan · tap to open full screen</div>
          <button onclick="plansOpenHTML('${active.id}')" style="width:100%;padding:13px;border-radius:12px;border:none;background:var(--accent);color:#fff;font-size:15px;font-weight:700">Open</button>
        </div>`;
      } else if(!active.days && Array.isArray(active.exercises)){
        // Legacy "daily routine" plan — a flat exercise list, no 7-day grid. Render the list
        // so the plan's real content shows instead of an empty week of rest days.
        html+=`<div style="background:var(--card);border-radius:16px;padding:16px;margin-bottom:12px">`;
        html+=`<div style="font-size:16px;font-weight:700;margin-bottom:${active.description?6:12}px;color:var(--text)">${active.name}</div>`;
        if(active.description) html+=`<div style="font-size:13px;color:var(--muted);margin-bottom:12px">${active.description}</div>`;
        active.exercises.forEach(e=>{
          const detail=e.detail||(e.sets&&e.reps?e.sets+'×'+e.reps:'');
          html+=`<div style="border-bottom:1px solid var(--border);padding:10px 0">
            <div style="font-weight:600;color:var(--text);font-size:14px">${e.name||''}</div>
            ${detail?`<div style="font-size:12px;color:var(--muted);margin-top:2px">${detail}</div>`:''}
          </div>`;
        });
        html+=`</div>`;
      } else {
        // Workout plan — existing 7-day grid
        const dayNames=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        html+=`<div style="background:var(--card);border-radius:16px;padding:16px;margin-bottom:12px">`;
        html+=`<div style="font-size:16px;font-weight:700;margin-bottom:12px;color:var(--text)">${active.name}</div>`;
        if(active.description) html+=`<div style="font-size:13px;color:var(--muted);margin-bottom:12px">${active.description}</div>`;
        for(let d=0;d<7;d++){
          const day=active.days&&active.days[String(d)];
          const dayLabel=day?.name||dayNames[d];
          const exs=day?.exercises||[];
          const isRest=!exs.length;
          html+=`<div style="border-bottom:1px solid var(--border);padding:10px 0">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:${isRest?0:6}px">
              <div style="width:32px;height:32px;border-radius:8px;background:${isRest?'var(--card-2)':'rgba(var(--accent-rgb),.12)'};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:${isRest?'var(--muted)':'var(--accent)'}">${dayNames[d]}</div>
              <div style="font-weight:600;color:${isRest?'var(--muted)':'var(--text)'};font-size:14px">${dayLabel}</div>
            </div>
            ${exs.map(e=>`<div style="padding:4px 0 4px 40px;font-size:13px;color:var(--text)">${e.name}${e.sets&&e.reps?' — '+e.sets+'×'+e.reps:''}</div>`).join('')}
          </div>`;
        }
        html+=`</div>`;
      }
      html+=`<button onclick="plansDelete('${active.id}')" style="width:100%;padding:10px;border-radius:12px;border:1px solid var(--danger);background:transparent;color:var(--danger);font-size:14px;font-weight:600">Delete this plan</button>`;
    }
  }

  wrap.innerHTML=html;
}

// ── Programs ───────────────────────────────────────────────────────
// The Log holds exactly ONE training split (splitCfg). A program is a saved snapshot of that
// split, so Plans can hold many and swap between them — the one job the Log genuinely cannot
// do, and the reason this tab was previously an island: nothing outside it ever read a plan,
// and plansNew() built a seven-day shell with no UI anywhere to put exercises in it.
function planSnapshotSplit(){
  const c=splitCfg();
  return JSON.parse(JSON.stringify({types:c.types||[],schedule:c.schedule||[]}));
}
// Compared as normalised JSON so "is this the program I'm running?" survives key order and
// can also tell you the split has been edited since it was saved.
function planCfgFingerprint(cfg){
  if(!cfg||!Array.isArray(cfg.types)) return '';
  return JSON.stringify({
    types:cfg.types.map(t=>({name:t.name||'',exercises:(t.exercises||[]).map(e=>e.name||'')})),
    schedule:cfg.schedule||[]
  });
}
function planIsProgram(p){ return p&&p.kind==='split'&&p.cfg&&Array.isArray(p.cfg.types); }
function planAppliedState(p){
  if(!planIsProgram(p)) return 'n/a';
  return planCfgFingerprint(p.cfg)===planCfgFingerprint(splitCfg())?'active':'inactive';
}
function plansSaveCurrentAsProgram(){
  const cur=splitCfg();
  if(!cur||!Array.isArray(cur.types)||!cur.types.length){ alert('No training split to save yet.'); return; }
  const name=(prompt('Name this program?', cur.types.length+'-day split')||'').trim();
  if(!name) return;
  const data=loadPlans();
  const id='plan_'+Date.now();
  data.plans.push({id,name,kind:'split',description:'',cfg:planSnapshotSplit(),createdAt:Date.now()});
  data.activePlanId=id;
  savePlans(data);
  renderPlans();
}
// Overwrite a saved program with whatever the split looks like now.
function plansUpdateFromCurrent(id){
  const data=loadPlans();
  const p=data.plans.find(x=>x.id===id); if(!planIsProgram(p)) return;
  if(!confirm('Replace "'+p.name+'" with your current training split?')) return;
  p.cfg=planSnapshotSplit(); p.updatedAt=Date.now();
  savePlans(data);
  renderPlans();
}
// Write a program back into the Log's split. Mirrors the split editor's save path (9417):
// assign, persist, clamp the day index, then re-render the Log.
function plansApply(id){
  const data=loadPlans();
  const p=data.plans.find(x=>x.id===id);
  if(!planIsProgram(p)) return;
  const clean=sanitizeSplit(JSON.parse(JSON.stringify(p.cfg)));
  if(!clean){ alert('That program has no training days saved in it.'); return; }
  if(!confirm('Switch your training split to "'+p.name+'"?\n\nThis changes the days and exercises the Log shows. Your logged sessions and history are not touched.')) return;
  splitConfig=clean;
  saveSplit();
  if(S.dayIdx>=scheduleLen()) S.dayIdx=0;
  p.lastAppliedAt=Date.now();
  savePlans(data);
  if(typeof applyDayColour==='function') applyDayColour();
  if(S.view==='log'&&typeof renderLog==='function') renderLog();
  renderPlans();
  if(typeof showToast==='function') showToast('Now training "'+p.name+'"');
}
function plansRename(id){
  const data=loadPlans();
  const p=data.plans.find(x=>x.id===id); if(!p) return;
  const name=(prompt('Rename program', p.name)||'').trim();
  if(!name) return;
  p.name=name; savePlans(data); renderPlans();
}
function plansSetActive(id){
  const data=loadPlans();
  data.activePlanId=id;
  savePlans(data);
  renderPlans();
}

function plansDelete(id){
  if(!confirm('Delete this plan?')) return;
  const data=loadPlans();
  data.plans=data.plans.filter(p=>p.id!==id);
  if(data.activePlanId===id) data.activePlanId=data.plans[0]?.id||null;
  savePlans(data);
  renderPlans();
}

// plansNew() removed: it created a plan with seven empty days, and no screen anywhere could
// add an exercise to it, so it could only ever produce an empty shell. Programs are captured
// from the real training split now (plansSaveCurrentAsProgram), which is editable in the Log.

function plansImport(){
  const inp=document.createElement('input');
  inp.type='file'; inp.accept='.json';
  inp.onchange=e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const plan=JSON.parse(ev.target.result);
        if(!plan.name||!plan.days) throw new Error('Invalid plan format');
        const data=loadPlans();
        if(!plan.id) plan.id='plan_'+Date.now();
        data.plans=data.plans.filter(p=>p.id!==plan.id);
        data.plans.push(plan);
        if(!data.activePlanId) data.activePlanId=plan.id;
        savePlans(data);
        renderPlans();
      }catch(err){ alert('Import failed: '+err.message); }
    };
    reader.readAsText(file);
  };
  inp.click();
}

function plansImportHTML(){
  const inp=document.createElement('input');
  inp.type='file'; inp.accept='.html,.htm';
  inp.onchange=e=>{
    const file=e.target.files[0]; if(!file) return;
    const name=prompt('Name this plan?', file.name.replace(/\.html?$/i,'').replace(/[-_]/g,' '))||file.name;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const content=ev.target.result;
        const data=loadPlans();
        const id='plan_'+Date.now();
        data.plans.push({id, name, type:'html', content});
        if(!data.activePlanId) data.activePlanId=id;
        savePlans(data);
        renderPlans();
      }catch(err){ alert('Import failed: '+err.message); }
    };
    reader.readAsText(file);
  };
  inp.click();
}

function plansOpenHTML(id){
  const data=loadPlans();
  const plan=data.plans.find(p=>p.id===id);
  if(!plan||plan.type!=='html') return;
  const overlay=document.getElementById('plan-html-overlay');
  const frame=document.getElementById('plan-html-frame');
  const title=document.getElementById('plan-html-title');
  if(!overlay||!frame) return;
  if(title) title.textContent=plan.name;
  frame.srcdoc=plan.content;
  overlay.style.display='flex';
}

function plansCloseHTML(){
  const overlay=document.getElementById('plan-html-overlay');
  const frame=document.getElementById('plan-html-frame');
  if(overlay) overlay.style.display='none';
  if(frame) frame.srcdoc='';
}

function plansExport(){
  const data=loadPlans();
  const active=data.plans.find(p=>p.id===data.activePlanId)||data.plans[0];
  if(!active){ alert('No plan to export'); return; }
  if(active.type==='html'){
    const blob=new Blob([active.content],{type:'text/html'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=active.name.replace(/\s+/g,'_')+'.html';
    a.click();
  } else {
    const blob=new Blob([JSON.stringify(active,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=active.name.replace(/\s+/g,'_')+'.json';
    a.click();
  }
}

// Keep bottom-sheet modals reachable while the on-screen keyboard is up. The keyboard
// shrinks only the VISUAL viewport — position:fixed overlays still span the full layout
// viewport — so the bottom-aligned modal box (and its sticky Cancel/Save row) ends up
// behind the keyboard. Track the obscured height and expose it as --kb-inset;
// .modal-overlay pads its bottom by it (see nutrition-modals.css).
function syncKeyboardInset(){
  const vv=window.visualViewport;
  const inset=vv?Math.max(0, window.innerHeight - vv.height - vv.offsetTop):0;
  document.documentElement.style.setProperty('--kb-inset', Math.round(inset)+'px');
}
if(window.visualViewport){
  window.visualViewport.addEventListener('resize', syncKeyboardInset);
  window.visualViewport.addEventListener('scroll', syncKeyboardInset);
  syncKeyboardInset();
}

// Pin as early as possible (deferred script runs before first paint) and on every
// viewport change, so the dvh mis-measurement is corrected without waiting for a rotation.
pinAppHeight();
requestAnimationFrame(function(){ pinAppHeight(); nudgeLayout(); });
window.addEventListener('resize', pinAppHeight);
window.addEventListener('orientationchange', function(){ setTimeout(pinAppHeight,150); });
if(window.visualViewport){ window.visualViewport.addEventListener('resize', pinAppHeight); }
window.addEventListener('load', function(){ nudgeLayout(); setTimeout(nudgeLayout,300); setTimeout(nudgeLayout,800); });
document.addEventListener('visibilitychange', function(){ if(!document.hidden) setTimeout(nudgeLayout,80); });
window.addEventListener('pageshow', function(){ setTimeout(nudgeLayout,80); if(typeof applyLogoDayColour==='function') applyLogoDayColour(); });
