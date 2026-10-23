'use strict';
// Optional transport for the existing financial writers. Disabled in this prepared build.
const dailyRemoteState={uid:'',enabled:null,enabledPromise:null,status:null,error:'',message:'',checkedAt:0,loading:false,stores:new Map(),queues:new Map()};
const DAILY_REMOTE_PATHS=['transactions','ledger','aiRequests'];
function dailyRemoteOrigin(){
  const value=window.DAILY_REMOTE_CONFIG?.origin;
  if(!value)return '';
  const url=new URL(value);if(url.protocol!=='https:'||url.origin!==value)throw Error('Daily connector requires an exact HTTPS origin.');
  return value;
}
function dailyRemoteOwn(uid){return auth?.currentUser?.uid===uid&&dailyAccountMatches(auth.currentUser);}
function dailyRemoteReset(){
  for(const store of dailyRemoteState.stores.values())store.ref.off();
  Object.assign(dailyRemoteState,{uid:'',enabled:null,enabledPromise:null,status:null,error:'',message:'',checkedAt:0,loading:false,stores:new Map(),queues:new Map()});
}
function dailyRemoteStable(value){
  if(Array.isArray(value))return '['+value.map(dailyRemoteStable).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+dailyRemoteStable(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
function dailyRemoteMerge(base,local,cloud){
  const index=rows=>{const map=new Map();for(const r of rows){if(!r||typeof r.id!=='string'||!r.id||map.has(r.id))throw Error('Missing or duplicate record IDs. Review this store before syncing.');map.set(r.id,r);}return map;};
  const b=index(base),l=index(local),c=index(cloud),result=new Map(c);
  for(const id of new Set([...b.keys(),...l.keys()])){
    if(dailyRemoteStable(b.get(id))===dailyRemoteStable(l.get(id)))continue;
    if(dailyRemoteStable(c.get(id))!==dailyRemoteStable(b.get(id))&&dailyRemoteStable(c.get(id))!==dailyRemoteStable(l.get(id)))throw Error('A record changed on another device. Your local edit is retained. Export it and review before using the cloud copy.');
    if(l.has(id))result.set(id,l.get(id));else result.delete(id);
  }
  return [...result.values()];
}
function dailyRemoteRows(raw){
  const value=raw&&typeof raw==='object'&&'v'in raw?raw.v:raw;
  const rows=value==null||value===''?[]:typeof value==='string'?JSON.parse(value):value;
  if(!Array.isArray(rows))throw Error('The financial store is not a record list. Nothing was replaced.');return rows;
}
async function dailyRemoteEnabled(uid){
  if(!dailyRemoteOwn(uid))throw Error('Daily account changed.');
  if(!dailyRemoteState.enabledPromise){
    dailyRemoteState.uid=uid;
    dailyRemoteState.enabledPromise=db.ref('users/'+uid+'/assistant/enabled').once('value').then(s=>{
      if(!dailyRemoteOwn(uid)||dailyRemoteState.uid!==uid)throw Error('Daily account changed.');
      return dailyRemoteState.enabled=s.val()===true;
    }).catch(e=>{if(dailyRemoteState.uid===uid)dailyRemoteState.enabledPromise=null;throw e;});
  }
  return dailyRemoteState.enabledPromise;
}
async function dailyRemoteFetch(path,body,uid=auth?.currentUser?.uid){
  const origin=dailyRemoteOrigin();if(!origin)throw Error('Remote access is not deployed.');
  if(!dailyRemoteOwn(uid))throw Error('Sign into the matching Daily account first.');
  if(navigator.onLine===false)throw Error('Offline. Local changes are retained; no cloud save is confirmed.');
  const user=auth.currentUser,token=await user.getIdToken();
  if(!dailyRemoteOwn(uid))throw Error('Daily account changed.');
  let response,data;
  try{
    response=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000)});
    data=await response.json();
  }catch{throw Error('Network result unknown. Refresh results before retrying; local changes are retained.');}
  if(!dailyRemoteOwn(uid))throw Error('Daily account changed.');
  if(!response.ok)throw Error(data.error?.message||'Daily connection failed. Reconnect and check the result.');
  return data;
}
function dailyRemoteProblem(message){dailyRemoteState.error=message;setSyncStatus('Sync needs review');dailyRemoteRefreshHtml();}
function dailyRemoteBaselineKey(s){return 'assistant_sync_baseline_'+s.uid+'_'+s.path;}
function dailyRemoteBaseline(s){const text=localStorage.getItem(dailyRemoteBaselineKey(s));const value=text?JSON.parse(text):null;if(value?.pending)throw Error('A local save was interrupted. Export the retained copy and review this store.');return value;}
function dailyRemoteReconcile(s,raw){
  if(!dailyRemoteOwn(s.uid))return;
  const cloud=dailyRemoteRows(raw),t=Number(raw?.t)||0,base=dailyRemoteBaseline(s),local=dailyRemoteRows(localStorage.getItem(s.lsKey));
  if(base&&t<base.t)return;
  let merged;
  if(base)merged=dailyRemoteMerge(base.rows,local,cloud);
  else if(dailyRemoteStable(local)===dailyRemoteStable(cloud)||!Number(localStorage.getItem(s.tsKey)||0))merged=cloud;
  else throw Error('This device has no verified sync baseline and a different local copy. Export it and review before using the cloud copy.');
  const key=dailyRemoteBaselineKey(s),value=JSON.stringify(merged),dirty=dailyRemoteStable(merged)!==dailyRemoteStable(cloud);
  // A single durable recovery journal prevents a crash between the baseline and local
  // writes from silently losing an unsynced edit. Interrupted journals fail closed.
  localStorage.setItem(key,JSON.stringify({pending:true,previous:local,merged,cloud,t}));
  localStorage.setItem(s.lsKey,value);
  localStorage.setItem(s.tsKey,String(dirty?Math.max(Date.now(),t+1):t));
  localStorage.setItem(key,JSON.stringify({rows:cloud,t}));
  _syncApplying++;try{s.onUpdate?.();}finally{_syncApplying--;}
  if(typeof dailyAIStoreObserved==='function')dailyAIStoreObserved(s.uid,s.path);
  return dirty;
}
function dailyRemoteListen(uid,path,lsKey,tsKey,onUpdate){
  if(!dailyRemoteOrigin()||!DAILY_REMOTE_PATHS.includes(path))return null;
  const ref=db.ref('users/'+uid+'/'+path),s={uid,path,lsKey,tsKey,onUpdate,ref};
  dailyRemoteState.stores.set(path,s);
  dailyRemoteEnabled(uid).then(enabled=>{
    if(!dailyRemoteOwn(uid))return;
    if(!enabled){syncTrack(syncBlobListenTS(uid,path,lsKey,tsKey,onUpdate,true));return;}
    ref.on('value',snap=>{
      if(!dailyRemoteOwn(uid))return;
      try{
        const dirty=dailyRemoteReconcile(s,snap.val());
        if(dailyRemoteState.error.startsWith(path+':')){dailyRemoteState.error='';dailyRemoteRefreshHtml();}
        if(dirty&&!dailyRemoteState.queues.has(path))syncBlobPush(path,lsKey,true);
      }
      catch(e){dailyRemoteProblem(path+': '+e.message);}
    },()=>dailyRemoteProblem('Could not read the protected financial store. Local records are retained.'));
  }).catch(e=>dailyRemoteProblem(e.message));
  syncTrack(ref);return ref;
}
function dailyRemoteCommit(ref,v,t,confirmSame){
  if(!dailyRemoteOrigin())return null;
  const path=ref.key,uid=ref.parent?.key;
  if(!DAILY_REMOTE_PATHS.includes(path))return null;
  const queues=dailyRemoteState.queues,previous=queues.get(path)||Promise.resolve();
  const pending=previous.catch(()=>{}).then(async()=>{
    if(!dailyRemoteOwn(uid))throw Error('Daily account changed.');
    if(!await dailyRemoteEnabled(uid))return syncBlobCommit(ref,v,t,confirmSame,true);
    const s=dailyRemoteState.stores.get(path);if(!s||s.uid!==uid)throw Error('Wait for this financial store to load.');
    const base=dailyRemoteBaseline(s);if(!base)throw Error('Wait for the verified cloud baseline before syncing.');
    const value=dailyRemoteRows(localStorage.getItem(s.lsKey));
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(dailyRemoteStable(base.rows)));
    const baseHash=Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join('');
    const result=await dailyRemoteFetch('/daily/sync',{path,base:base.rows,value,baseHash},uid);
    if(result.cloudSave!=='verified'||result.status!=='committed'||result.path!==path)throw Error('No confirmed cloud-save receipt. Refresh before retrying.');
    dailyRemoteReconcile(s,result.envelope);
    dailyRemoteState.error='';dailyRemoteRefreshHtml();
    return {committed:true,snapshot:{val:()=>result.envelope}};
  });
  queues.set(path,pending);
  pending.catch(e=>{if(dailyRemoteOwn(uid))dailyRemoteProblem(path+': '+e.message);}).finally(()=>{if(queues.get(path)===pending)queues.delete(path);});
  return pending;
}
async function dailyRemoteCheck(){
  if(dailyRemoteState.loading)return;
  const uid=auth?.currentUser?.uid;dailyRemoteState.loading=true;dailyRemoteState.error='';dailyRemoteRefreshHtml();
  try{
    const status=await dailyRemoteFetch('/daily/status',undefined,uid);
    if(status.account?.uid!==uid)throw Error('The server returned a different account. Access stopped.');
    dailyRemoteState.status=status;dailyRemoteState.checkedAt=Date.now();
    if(dailyRemoteState.enabled!==null&&dailyRemoteState.enabled!==status.enabled)dailyRemoteState.message='Protected sync changed. Reload Daily before editing financial records.';
  }catch(e){dailyRemoteState.error=e.message;dailyRemoteState.status=null;}
  finally{if(dailyRemoteOwn(uid)){dailyRemoteState.loading=false;dailyRemoteRefreshHtml();}}
}
async function dailyRemoteAction(action,id){
  if(dailyRemoteState.loading)return;
  const uid=auth?.currentUser?.uid;
  if(!confirm(action==='revoke'?'Revoke this assistant connection? Existing records remain.':'Undo this exact assistant expense? Changed records or dependent data will be refused.'))return;
  dailyRemoteState.loading=true;dailyRemoteState.message='';dailyRemoteRefreshHtml();
  try{
    const result=await dailyRemoteFetch('/daily/'+action,action==='revoke'?{grantId:id}:{requestId:id},uid);
    dailyRemoteState.message=action==='revoke'?'Connection revoked in the cloud.':'Undo saved to cloud. Record: '+result.recordId;
  }catch(e){dailyRemoteState.error=e.message;}
  finally{if(dailyRemoteOwn(uid)){dailyRemoteState.loading=false;dailyRemoteRefreshHtml();}}
  if(dailyRemoteOwn(uid)&&!dailyRemoteState.error)await dailyRemoteCheck();
}
function dailyRemoteExport(){
  const records={account:auth?.currentUser?.uid,exportedAt:new Date().toISOString(),stores:{}};
  for(const [path,s]of dailyRemoteState.stores)records.stores[path]={local:localStorage.getItem(s.lsKey),baseline:localStorage.getItem(dailyRemoteBaselineKey(s))};
  const url=URL.createObjectURL(new Blob([JSON.stringify(records,null,2)],{type:'application/json'})),a=document.createElement('a');
  a.href=url;a.download='daily-local-sync-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function dailyRemoteUseCloud(path){
  const s=dailyRemoteState.stores.get(path);if(!s||!dailyRemoteOwn(s.uid))return;
  if(!confirm('Export your local copy first. Replace this device’s '+path+' copy with the cloud version? Unsent edits will remain only in your export.'))return;
  try{
    const snap=await s.ref.once('value');if(!dailyRemoteOwn(s.uid))return;
    // Keep a local recovery copy even if the user has not retained the download.
    localStorage.setItem('assistant_sync_recovery_'+s.uid+'_'+path,JSON.stringify({local:localStorage.getItem(s.lsKey),baseline:localStorage.getItem(dailyRemoteBaselineKey(s))}));
    const raw=snap.val();localStorage.setItem(s.lsKey,JSON.stringify(dailyRemoteRows(raw)));localStorage.setItem(s.tsKey,String(Number(raw?.t)||0));localStorage.removeItem(dailyRemoteBaselineKey(s));
    dailyRemoteReconcile(s,raw);dailyRemoteState.error='';dailyRemoteState.message='Cloud copy loaded. The previous local copy is retained for recovery.';dailyRemoteRefreshHtml();
  }catch(e){dailyRemoteProblem(e.message);}
}
function dailyRemoteRefreshHtml(){const el=document.getElementById('daily-remote');if(el)el.innerHTML=dailyRemoteHtml();}
function dailyRemoteHtml(){
  const esc=_catEscHtml,s=dailyRemoteState,configured=!!dailyRemoteOrigin(),status=s.status,busy=s.loading?' disabled':'';
  let html='<h2>Fuji connection</h2><p>'+(!configured?'Prepared · not deployed':s.loading?'Checking secure connection…':status?.enabled?'Secure service enabled':status?'Secure service not enabled':'Connection not checked')+'</p>';
  html+='<p class="aih-hint">Ask Fuji “What bills are scheduled this week?” or “Log $18.50 for lunch today on my credit card.” Fuji must resolve missing account or category details and retain the platform’s write confirmations.</p>';
  if(!configured)html+='<p>No hosting, billing or assistant grant has been activated. Automatic phone access is unavailable until setup is completed. The manual tools below remain available.</p>';
  else html+='<div class="daily-ai-actions"><button class="aih-btn" onclick="dailyRemoteCheck()"'+busy+'>Check connection and results</button><a class="aih-btn" href="https://chatgpt.com/plugins" target="_blank" rel="noopener">Open ChatGPT plugins to connect or reconnect</a></div>';
  if(status){
    html+='<p>Verified Daily account: '+esc(status.account.email||status.account.uid)+'<br><small>Checked '+esc(new Date(s.checkedAt).toLocaleString('en-AU'))+'. Authorization does not prove that Fuji has used a tool successfully.</small></p>';
    html+=(status.connections.length?status.connections.map(g=>'<article class="daily-ai-record"><strong>'+esc(g.status)+'</strong><span>'+esc(g.scopes.join(', '))+'</span><small>Grant expires '+esc(new Date(g.expiresAt).toLocaleString('en-AU'))+'</small>'+(g.status!=='revoked'?'<button class="aih-btn" data-id="'+esc(g.id)+'" onclick="dailyRemoteAction(\'revoke\',this.dataset.id)"'+busy+'>Revoke connection</button>':'')+'</article>').join(''):'<p>No assistant authorization exists for this account.</p>');
    html+='<h3>Cloud operation receipts</h3>'+(status.operations.length?status.operations.map(r=>'<article class="daily-ai-record"><strong>'+esc(r.summary||r.requestId)+'</strong><span>'+esc(r.status)+(r.status==='committed'?' · expense saved to cloud':r.status==='undone'?' · undo saved to cloud':r.status==='pending'?' · preview saved; expense not committed':' · expense not committed')+'</span><code>Request: '+esc(r.requestId)+'</code>'+(r.recordId?'<code>Record: '+esc(r.recordId)+'</code>':'')+(r.error?'<p class="aih-err">'+esc(r.error.message)+'</p>':'')+(r.status==='committed'?'<button class="aih-btn" data-id="'+esc(r.requestId)+'" onclick="dailyRemoteAction(\'undo\',this.dataset.id)"'+busy+'>Undo assistant expense</button>':'')+'</article>').join(''):'<p>No remote operations recorded.</p>');
  }
  if(s.error)html+='<p class="aih-err" role="alert">'+esc(s.error)+'</p>';
  if(s.message)html+='<p role="status">'+esc(s.message)+'</p>';
  if(s.error&&s.stores.size)html+='<details><summary>Review local sync conflict</summary><p>Export and review local edits before replacing any device copy. Remote receipts stay server-owned.</p><button class="aih-btn" onclick="dailyRemoteExport()">Export local review copy</button>'+[...s.stores.keys()].map(p=>'<button class="aih-btn" data-path="'+esc(p)+'" onclick="dailyRemoteUseCloud(this.dataset.path)">Use cloud '+esc(p)+'</button>').join('')+'</details>';
  return html+'<details class="daily-remote-setup"><summary>Supported actions and setup</summary><p>Read identity, scheduled bills and existing expense choices; preview and record an explicitly requested AUD expense; retrieve its receipt; undo it while unchanged and without dependent records. No payments, transfers, bank connections or balance changes.</p><p>Setup requires an approved hosted HTTPS service, OAuth client, Firebase protected sync rules and a Daily consent grant. Add its /mcp URL in ChatGPT Plugins → Add custom MCP server with OAuth, then sign into Daily and review permissions. Enable that plugin for Fuji. Use the exact callback shown by ChatGPT.</p><p>Access tokens last 5 minutes and refresh within a grant lasting at most 30 days. After expiry or revocation, reconnect through ChatGPT and consent again. Daily sign-out and assistant revocation are separate actions. WebMCP and browser login alone do not supply this connection.</p><p>Cloud Run requires billing to be enabled even if usage fits its free allowance. This prepared build leaves that off. The repository setup guide lists the remaining deployment and iPhone verification steps.</p></details>';
}
window.addEventListener('online',()=>{if(dailyRemoteOrigin()&&auth?.currentUser)for(const s of dailyRemoteState.stores.values())syncBlobPush(s.path,s.lsKey,true);});
