const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
  const memory=new Map(),requests=[],events={},ctx={console,URL,TextEncoder,AbortSignal,Uint8Array,Date,Map,Set,JSON,Promise,setTimeout:()=>{},crypto:require('node:crypto').webcrypto,
    window:{DAILY_REMOTE_CONFIG:{origin:'https://connector.example.test'},addEventListener:(n,f)=>events[n]=f},navigator:{onLine:true},auth:{currentUser:{uid:'alice',getIdToken:async()=>'synthetic'}},
    localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)},dailyAccountMatches:u=>u?.uid===ctx.scope,
    scope:'alice',document:{getElementById:()=>null},setSyncStatus:()=>{},dailyAIStoreObserved:()=>{},syncBlobPush:()=>{},_syncApplying:0,_catEscHtml:s=>String(s),
    fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({})};}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../js/ai-remote.js'),'utf8'),ctx);
  ctx.run=s=>vm.runInContext(s,ctx);ctx.memory=memory;ctx.requests=requests;
  ctx.s={uid:'alice',path:'transactions',lsKey:'daily_transactions',tsKey:'daily_transactions_ts',onUpdate:()=>{},ref:{off:()=>{}}};
  ctx.run("dailyRemoteState.uid='alice';dailyRemoteState.enabledPromise=Promise.resolve(true);dailyRemoteState.stores.set('transactions',s)");
  ctx.cloud=(rows,t=10)=>({v:JSON.stringify(rows),t});ctx.local=()=>JSON.parse(memory.get('daily_transactions')||'[]');
  return ctx;
}
test('disabled remote build never invokes remote transport or changes legacy storage',()=>{
  const c=fixture();c.window.DAILY_REMOTE_CONFIG=null;
  assert.equal(c.dailyRemoteCommit({key:'transactions'},'[]',1),null);assert.equal(c.dailyRemoteListen('alice','transactions','x','xt'),null);assert.equal(c.requests.length,0);assert.equal(c.memory.size,0);
  assert.match(c.dailyRemoteHtml(),/Prepared · not deployed/);assert.doesNotMatch(c.dailyRemoteHtml(),/onclick="dailyRemoteAction/);
});
test('verified cloud baseline preserves independent offline edits and remote undo removals',()=>{
  const c=fixture(),first={id:'first',amount:1};c.dailyRemoteReconcile(c.s,c.cloud([first]));
  c.memory.set('daily_transactions',JSON.stringify([first,{id:'local',amount:2}]));
  c.dailyRemoteReconcile(c.s,c.cloud([first,{id:'remote',amount:3}],20));
  assert.deepEqual(c.local().map(r=>r.id),['first','remote','local']);
  c.dailyRemoteReconcile(c.s,c.cloud([first],30));assert.deepEqual(c.local().map(r=>r.id),['first','local']);
  c.dailyRemoteReconcile(c.s,c.cloud([first,{id:'remote',amount:3}],20));assert.deepEqual(c.local().map(r=>r.id),['first','local'],'older receipt cannot resurrect undo');
});
test('missing baseline and concurrent edits fail closed without replacing local data',()=>{
  const c=fixture();c.memory.set('daily_transactions',JSON.stringify([{id:'local'}]));c.memory.set('daily_transactions_ts','20');
  assert.throws(()=>c.dailyRemoteReconcile(c.s,c.cloud([{id:'cloud'}])),/no verified sync baseline/);assert.deepEqual(c.local(),[{id:'local'}]);
  c.memory.clear();c.dailyRemoteReconcile(c.s,c.cloud([{id:'one',amount:1}]));c.memory.set('daily_transactions',JSON.stringify([{id:'one',amount:2}]));
  assert.throws(()=>c.dailyRemoteReconcile(c.s,c.cloud([{id:'one',amount:3}],20)),/changed on another device/);assert.equal(c.local()[0].amount,2);
});
test('confirmed cloud commit retains edits made while the HTTP result was in flight',async()=>{
  const c=fixture();c.dailyRemoteReconcile(c.s,c.cloud([]));c.memory.set('daily_transactions',JSON.stringify([{id:'local'}]));
  let release,started;const startedPromise=new Promise(r=>started=r);
  c.fetch=async(url,options)=>{c.requests.push({url,options});started();return new Promise(r=>release=r);};
  const pending=c.dailyRemoteCommit({key:'transactions',parent:{key:'alice'}},'stale-argument',1,true);await startedPromise;
  const sent=JSON.parse(c.requests[0].options.body);assert.deepEqual(sent.base,[]);assert.deepEqual(sent.value,[{id:'local'}]);assert.match(sent.baseHash,/^[0-9a-f]{64}$/);
  c.memory.set('daily_transactions',JSON.stringify([{id:'local'},{id:'later'}]));
  release({ok:true,json:async()=>({status:'committed',cloudSave:'verified',path:'transactions',envelope:c.cloud([{id:'local'},{id:'remote'}],20)})});
  const ack=await pending;assert.equal(ack.committed,true);assert.deepEqual(c.local().map(r=>r.id),['local','remote','later']);assert.equal(JSON.parse(ack.snapshot.val().v).length,2);
});
test('offline, unknown network outcome and account changes never become successful receipts',async()=>{
  const c=fixture();c.navigator.onLine=false;await assert.rejects(c.dailyRemoteFetch('/daily/status'),/Offline/);assert.equal(c.requests.length,0);
  c.navigator.onLine=true;c.fetch=async()=>{throw Error('lost response');};await assert.rejects(c.dailyRemoteFetch('/daily/undo',{requestId:'daily_remote_example'}),/result unknown/);
  c.fetch=async()=>{c.auth.currentUser={uid:'bob'};c.scope='bob';return {ok:true,json:async()=>({account:{uid:'alice'}})};};
  await assert.rejects(c.dailyRemoteFetch('/daily/status',undefined,'alice'),/account changed/);assert.equal(c.run('dailyRemoteState.status'),null);
});
test('interrupted local baseline write preserves a recovery journal and blocks subsequent merges',()=>{
  const c=fixture();c.dailyRemoteReconcile(c.s,c.cloud([]));c.memory.set('daily_transactions',JSON.stringify([{id:'local'}]));
  const set=c.localStorage.setItem;c.localStorage.setItem=(k,v)=>{if(k==='daily_transactions')throw Error('quota');set(k,v);};
  assert.throws(()=>c.dailyRemoteReconcile(c.s,c.cloud([{id:'remote'}],20)),/quota/);assert.deepEqual(c.local(),[{id:'local'}]);
  assert.equal(JSON.parse(c.memory.get(c.dailyRemoteBaselineKey(c.s))).pending,true);
  assert.throws(()=>c.dailyRemoteBaseline(c.s),/interrupted/);
});
