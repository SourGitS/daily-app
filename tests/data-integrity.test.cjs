'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {app,Store,Cloud,extract,session}=require('./harness.cjs');
const remote=fs.readFileSync(require('node:path').join(__dirname,'../js/ai-remote.js'),'utf8');
const storage=fs.readFileSync(require('node:path').join(__dirname,'../js/account-storage.js'),'utf8');
const src=fs.readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
const pause=()=>new Promise(resolve=>setImmediate(resolve));
const json=value=>JSON.parse(JSON.stringify(value));
function device(cloud=new Cloud(),disk=new Store()){
  const c=app(cloud,disk);
  // Firebase's synthetic transaction interface in harness.cjs calls update with an empty
  // cache and then again with the latest server copy. No production SDK is configured.
  Object.defineProperties(disk,{length:{get:()=>disk.data.size,configurable:true},key:{value:i=>[...disk.data.keys()][i]??null,configurable:true}});
  Object.assign(c,{document:{getElementById:()=>null},console:{warn(){}},window:{addEventListener(){}},confirm:()=>true,location:{reload(){}},alert:()=>{},navigator:{onLine:true},_cloudWorkoutReady:true});
  vm.runInContext(remote,c);
  vm.runInContext(['loadTxns','saveTxns','loadLedger','saveLedger','jrnCommitNote','jrnPushOne','jrnMerge','jrnAttachSync','restorePushToCloud'].map(name=>(name==='restorePushToCloud'?'async ':'')+extract(name)).join('\n'),c);
  c.dailyRestoreBusy=false;c.jrnRef=()=>cloud.ref('users/u/notes');
  c.txnData=c.dailyFinanceRecover('transactions',c.loadTxns());c.ledgerData=c.dailyFinanceRecover('ledger',c.loadLedger());
  return c;
}
function attach(c,path){
  const key=path==='transactions'?'daily_transactions':'daily_ledger';
  return c.syncBlobListen('u',path,key,()=>{if(path==='transactions')c.txnData=c.loadTxns();else c.ledgerData=c.loadLedger();});
}
async function settled(cloud){await pause();await cloud.settle();await pause();}
for(const [path,key,field,save] of [['transactions','daily_transactions','txnData','saveTxns'],['ledger','daily_ledger','ledgerData','saveLedger']]){
  test(path+' preserves distinct offline edits, accepted deletions and replays after reload',async()=>{
    const cloud=new Cloud({users:{u:{[path]:{v:'[{"id":"old","amount":1}]',t:10}}}});
    const a=device(cloud);attach(a,path);cloud.emit('users/u/'+path);
    const b=device(cloud);attach(b,path);cloud.emit('users/u/'+path);
    a.firebaseReady=false;b.firebaseReady=false;
    a[field].push({id:'first',amount:2});b[field].push({id:'second',amount:3});
    assert.ok(a[save]());assert.ok(b[save]());assert.ok(a.dailyFinanceDirty(path));
    const fresh=device(cloud,a.localStorage);attach(fresh,path);cloud.emit('users/u/'+path);await settled(cloud);
    b.firebaseReady=true;cEmit(b);await settled(cloud);
    const remoteRows=()=>JSON.parse(cloud.get('users/u/'+path).v);
    assert.deepEqual(remoteRows().map(r=>r.id).sort(),['first','old','second']);
    b[field]=b[field].filter(r=>r.id!=='old');assert.ok(b[save]());await settled(cloud);
    assert.deepEqual(remoteRows().map(r=>r.id).sort(),['first','second']);assert.equal(b.dailyFinanceDirty(path),false);
    function cEmit(client){attach(client,path);cloud.emit('users/u/'+path);}
  });
}
test('same-record conflict preserves cloud, retains local copy and exposes a review decision',async()=>{
  const cloud=new Cloud({users:{u:{transactions:{v:'[{"id":"a","amount":1}]',t:10}}}}),c=device(cloud);
  attach(c,'transactions');cloud.emit('users/u/transactions');
  c.firebaseReady=false;c.txnData[0].amount=2;assert.ok(c.saveTxns());
  cloud.put('users/u/transactions',{v:'[{"id":"a","amount":3}]',t:50});
  c.firebaseReady=true;cloud.emit('users/u/transactions');await settled(cloud);
  assert.equal(c.loadTxns()[0].amount,2);assert.equal(JSON.parse(cloud.get('users/u/transactions').v)[0].amount,3);
  assert.ok(c.dailyFinanceDirty('transactions'));
  assert.equal(vm.runInContext("dailyFinanceConflicts.has('transactions')",c),true);
  c.exportAllData=()=>{};await c.dailyFinanceReview();
  assert.equal(c.loadTxns()[0].amount,2,'offline review retains pending data');
  cloud.put('.info/connected',true);await c.dailyFinanceReview();
  assert.equal(c.loadTxns()[0].amount,3);assert.equal(c.dailyFinanceDirty('transactions'),false);
});
test('normal weekly save and delayed Journal save cannot reverse a newer record',async()=>{
  const wk='2026-11-09',cloud=new Cloud({users:{u:{budgetData:{[wk]:{updatedAt:300,inc_pay:500}},notes:{n:{id:'n',updatedAt:300,deletedAt:300}}}}}),c=device(cloud);
  c.budgetData={[wk]:{updatedAt:200,inc_pay:10}};
  await c.syncBudgetDataToFirebase(wk);await c.jrnPushOne({id:'n',updatedAt:200,body:'old'});
  assert.equal(cloud.get('users/u/budgetData/'+wk).inc_pay,500);assert.equal(cloud.get('users/u/notes/n').deletedAt,300);
});
test('legacy note rekey merges records created during conversion',async()=>{
  const cloud=new Cloud({users:{u:{notes:[{id:'a',updatedAt:10}]}}}),c=device(cloud);
  c.jrnNormalise=r=>r?.id?r:null;c.loadNotes=()=>[];c.jrnSaveLocal=()=>{};c.jrnRerender=()=>{};
  c.jrnAttachSync('u');cloud.emit('users/u/notes');
  cloud.put('users/u/notes',{0:{id:'a',updatedAt:10},b:{id:'b',updatedAt:20}});
  await settled(cloud);
  assert.deepEqual(Object.values(cloud.get('users/u/notes')).map(r=>r.id).sort(),['a','b']);
  assert.deepEqual(Object.keys(cloud.get('users/u/notes')).sort(),['a','b']);
});
test('malformed sessions prevent ALL local and server writes',async()=>{
  const cloud=new Cloud(),c=device(cloud);let error='';
  c.localStorage.setItem('daily_profile','{"name":"original"}');
  assert.equal(c.restoreFromText(JSON.stringify({data:{daily_profile:'{"name":"other"}',wt_sessions:'[truncated'}}),m=>error=m),false);
  assert.match(error,/wt_sessions/);assert.equal(c.localStorage.getItem('daily_profile'),'{"name":"original"}');assert.deepEqual(cloud.writes,[]);
});
test('signed-in restore replaces only supplied stores, honors empties, and fences pre-restore peers',async()=>{
  const wk='2026-11-09',cloud=new Cloud({'.info':{connected:true},users:{u:{sessions:{a:session('a',100)},notes:{n:{id:'n'}},weeklyReviews:{[wk]:{status:'draft'}},weightGoal:{target:82},habits:['run'],profile:{name:'keep'},budgetConfig:{incomeStreams:[{id:'new'}]}}}}),c=device(cloud);
  const before=cloud.get('users/u/profile'),messages=[];c.alert=m=>messages.push(m);
  c.restoreFromText(JSON.stringify({data:{wt_sessions:JSON.stringify([session('keep',10)]),wt_notes:'[]',daily_reviews:'{}',daily_habits:'[]',daily_weight_goal:'{"target":70}',daily_budget_config:'{"incomeStreams":[{"id":"old"}],"variableExpenses":[],"fixedExpenses":[]}'}}));
  await settled(cloud);
  assert.match(messages.at(-1),/restored and synced/);assert.deepEqual(cloud.get('users/u/profile'),before);
  assert.equal(cloud.get('users/u/weightGoal').target,70);assert.equal(cloud.get('users/u/budgetConfig').incomeStreams[0].id,'old');
  assert.deepEqual(json(c.dailyRestoreUnwrap(cloud.get('users/u/habits'))),[]);
  assert.ok(!cloud.get('users/u/notes/n'));assert.ok(!cloud.get('users/u/weeklyReviews/'+wk));
  const peer=device(cloud);peer.localStorage.setItem('wt_sessions',JSON.stringify([session('a',100),session('after',200)]));
  peer.wtAttachRecords(peer.dbRef,'wt_sessions','id',rows=>peer.S.sessions=rows);cloud.emit('users/u/sessions');await settled(cloud);
  assert.deepEqual(json(peer.S.sessions).map(r=>r.id),['keep']);assert.equal(cloud.get('users/u/sessions/after'),null);
});
test('disconnected signed-in restore keeps previous records, reports failure and allows retry',async()=>{
  const cloud=new Cloud({'.info':{connected:false},users:{u:{weightGoal:{target:80}}}}),c=device(cloud);let message='';
  c.localStorage.setItem('daily_weight_goal','{"target":80}');
  c.restoreFromText('{"data":{"daily_weight_goal":{"target":70}}}',m=>message=m);await settled(cloud);
  assert.match(message,/Reconnect/);assert.equal(c.localStorage.getItem('daily_weight_goal'),'{"target":80}');assert.equal(cloud.get('users/u/weightGoal').target,80);
  cloud.put('.info/connected',true);c.restoreFromText('{"data":{"daily_weight_goal":{"target":70}}}');await settled(cloud);
  assert.equal(cloud.get('users/u/weightGoal').target,70);
});
test('a failed local-only restore rolls back earlier device writes',()=>{
  const c=device();c.firebaseReady=false;c.localStorage.setItem('daily_profile','{"name":"before"}');
  const normal=c.localStorage.setItem.bind(c.localStorage);let fired=false;
  c.localStorage.setItem=(k,v)=>{if(!fired&&k==='daily_weight_goal'){fired=true;throw Error('quota');}normal(k,v);};
  assert.equal(c.restoreFromText('{"data":{"daily_profile":{"name":"after"},"daily_weight_goal":{"target":70}}}',()=>{}),false);
  assert.equal(c.localStorage.getItem('daily_profile'),'{"name":"before"}');assert.equal(c.localStorage.getItem('daily_profile_ts'),null);
});
test('a returning account cannot silently perform a guest restore before its sign-in is confirmed',()=>{
  const c=device();c.localStorage.scope='user:u';c.localStorage.setItem('daily_weight_goal','{"target":80}');
  c.firebaseReady=false;c.auth=null;let reason='';
  assert.equal(c.restoreFromText('{"daily_weight_goal":{"target":70}}',m=>reason=m),false);
  assert.match(reason,/finish signing in/);assert.equal(c.localStorage.getItem('daily_weight_goal'),'{"target":80}');
  c.localStorage.scope='guest';assert.equal(c.restoreFromText('{"daily_weight_goal":{"target":70}}'),true);
  assert.equal(c.localStorage.getItem('daily_weight_goal'),'{"target":70}');
});
test('one deliberate edit to a 365-session history attempts only its own transaction',()=>{
  const c=device(),history=Array.from({length:365},(_,i)=>session('s'+i,100)),attempts=[];
  c.localStorage.setItem('wt_sessions',JSON.stringify(history));c.S.sessions=json(history);c.S.sessions[364].effort='easy';
  c.dbRef={child:id=>({transaction:()=>{attempts.push(id);return Promise.resolve();}})};
  assert.equal(c.persist(['s364']),true);assert.deepEqual(attempts,['s364']);
});
test('native events refresh only this scope; first sign-in offers journal-only data',()=>{
  const native=new Store({'daily-account-active':'guest'});
  native.key=i=>[...native.data.keys()][i]??null;Object.defineProperty(native,'length',{get:()=>native.data.size});
  const callbacks=[];let loads=0,offers=0;
  const ctx=vm.createContext({window:{localStorage:native,addEventListener:(e,f)=>callbacks.push(f),location:{reload(){}}},document:{body:{style:{}}},
    S:{view:'home'},load:()=>{loads++;return [];},loadWeights:()=>[],renderHome(){},confirm:()=>{offers++;return true;}});
  vm.runInContext(storage,ctx);
  const i=src.indexOf("window.addEventListener('storage',e=>{");vm.runInContext(src.slice(i,src.indexOf('\n});',i)+4),ctx);
  for(const key of ['daily-account:guest:wt_sessions','daily-account:guest:wt_weight','daily-account:user%3AB:wt_sessions'])for(const fn of callbacks)fn({key});
  assert.equal(loads,2);
  ctx.dailyScopedStorage(native,'guest').setItem('wt_notes','[{"id":"only"}]');ctx.dailySwitchAccount({uid:'A'});
  assert.equal(offers,1);assert.equal(ctx.dailyScopedStorage(native,'user:A').getItem('wt_notes'),'[{"id":"only"}]');
});

test('an older numeric ID keeps its stored type across a cloud edit',async()=>{
  const cloud=new Cloud({users:{u:{transactions:{v:'[{"id":7,"amount":1}]',t:10}}}}),c=device(cloud);
  attach(c,'transactions');cloud.emit('users/u/transactions');
  c.txnData[0].amount=8;assert.ok(c.saveTxns());await settled(cloud);
  assert.deepEqual(JSON.parse(cloud.get('users/u/transactions').v),[{id:7,amount:8}]);
});
test('a failed local ledger save stops an imported entry before it can receive a receipt',()=>{
  const c=device();c.genLedgerId=()=> 'test-income';
  vm.runInContext(extract('aiLedgerWrite'),c);
  c.localStorage.fail=true;
  assert.throws(()=>c.aiLedgerWrite({kind:'income',amount:100},{aiActionId:'id'}),/could not be saved/);
  assert.deepEqual(json(c.ledgerData),[]);assert.equal(c.localStorage.getItem('daily_ledger'),null);
});
test('guest startup recovers a record if writing its local snapshot was interrupted',()=>{
  const disk=new Store(),cloud=new Cloud(),a=device(cloud,disk);a.firebaseReady=false;
  a.txnData.push({id:'spent',amount:5});assert.ok(a.saveTxns());
  // Crash between recording intent and updating the snapshot.
  disk.removeItem('daily_transactions');
  const b=device(cloud,disk);b.firebaseReady=false;
  assert.deepEqual(json(b.txnData),[{id:'spent',amount:5}]);
  assert.deepEqual(JSON.parse(disk.getItem('daily_transactions')),json(b.txnData));
  assert.deepEqual(cloud.writes,[]);
});
test('an empty legacy edit that differs from an older cloud copy requests review',()=>{
  const cloud=new Cloud({users:{u:{transactions:{v:'[{"id":"old"}]',t:10}}}}),c=device(cloud);
  c.localStorage.setItem('daily_transactions','[]');c.localStorage.setItem('daily_transactions_ts','12');
  attach(c,'transactions');cloud.emit('users/u/transactions');
  assert.equal(vm.runInContext("dailyFinanceConflicts.has('transactions')",c),true);
  assert.deepEqual(json(c.loadTxns()),[]);
});
test('a disconnected peer cannot replay a financial edit older than an explicit restore',async()=>{
  const cloud=new Cloud({users:{u:{ledger:{v:'[]',t:2}}}}),c=device(cloud);
  attach(c,'ledger');cloud.emit('users/u/ledger');c.firebaseReady=false;
  c.ledgerData.push({id:'from-before',amount:99});assert.ok(c.saveLedger());
  const t=Number(c.localStorage.getItem('daily_ledger_ts'))+100;
  cloud.put('users/u/ledger',{v:'[{"id":"restored","amount":22}]',t,restoreAt:t});
  c.firebaseReady=true;cloud.emit('users/u/ledger');await settled(cloud);
  assert.deepEqual(json(c.loadLedger()).map(row=>row.id),['restored']);
  assert.equal(c.dailyFinanceDirty('ledger'),false);
});
test('a peer edit before the restore transaction is retained; failure permits retry',async()=>{
  const cloud=new Cloud({'.info':{connected:true},users:{u:{weightGoal:{target:80}}}}),c=device(cloud);
  const originalRef=cloud.ref.bind(cloud);
  cloud.ref=p=>{
    const ref=originalRef(p);if(p!=='users/u')return ref;
    return {...ref,transaction(fn,complete,local){
      cloud.put('users/u/weightGoal',{target:75});return ref.transaction(fn,complete,local);
    }};
  };
  let message='';
  c.restoreFromText('{"data":{"daily_weight_goal":{"target":70}}}',m=>message=m);await settled(cloud);
  assert.match(message,/changed during restore/);assert.equal(cloud.get('users/u/weightGoal').target,75);
  assert.equal(c.localStorage.getItem('daily_weight_goal'),null);
  cloud.ref=originalRef;c.restoreFromText('{"data":{"daily_weight_goal":{"target":70}}}');await settled(cloud);
  assert.equal(cloud.get('users/u/weightGoal').target,70);
});

test('a stale guest tab cannot add unchanged sessions or weights back to a restored collection',()=>{
  const disk=new Store(),a=device(new Cloud(),disk),b=device(new Cloud(),disk);
  a.firebaseReady=false;b.dbRef=null;b.weightDbRef=null;
  b.S.sessions=[session('old',5)];b.S.weights=[{date:'2020-05-05',weight:72,updatedAt:5}];
  disk.setItem('wt_sessions',JSON.stringify(b.S.sessions));disk.setItem('wt_weight',JSON.stringify(b.S.weights));
  assert.equal(a.restoreFromText(JSON.stringify({wt_sessions:[],wt_weight:[]})),true);
  b.S.sessions.push(session('new'));b.persist(['new']);
  b.S.weights.push({date:'2026-11-15',weight:80});b.persistWeights(['2026-11-15']);
  assert.deepEqual(JSON.parse(disk.getItem('wt_sessions')).map(row=>row.id),['new']);
  assert.deepEqual(JSON.parse(disk.getItem('wt_weight')).map(row=>row.date),['2026-11-15']);
});
test('legacy weight import still works before restore and cannot reintroduce dates after a restore and reload',()=>{
  const disk=new Store({daily_weight_log:'[{"date":"2020-02-29","kg":81}]'}),cloud=new Cloud();
  function open(){const c=device(cloud,disk);c._wtLegacyCloud=[{date:'2022-03-01',kg:81}];vm.runInContext(extract('mergeLegacyWeightEntries'),c);return c;}
  const a=open();assert.equal(a.mergeLegacyWeightEntries(),true);assert.equal(a.S.weights.length,2);a.firebaseReady=false;
  a.restoreFromText('{"wt_weight":[]}');
  const b=open();assert.equal(b.mergeLegacyWeightEntries(),false);assert.deepEqual(b.S.weights,[]);
});
test('a clock ahead cannot replay excluded workouts, and a slow device can save after it sees the restore',async()=>{
  const now=Date.now(),generation=now+3600000,cloud=new Cloud({users:{u:{
    sessions:{__dailyRestoredAt:generation},weights:{__dailyRestoredAt:generation}
  }}}),c=device(cloud);
  for(const [path,key,field,old,fresh] of [
    ['sessions','wt_sessions','id',session('old',generation+99),session('fresh')],
    ['weights','wt_weight','date',{date:'2025-01-01',weight:82,updatedAt:generation+99},{date:'2026-11-16',weight:81}]
  ]){
    c.localStorage.setItem(key,JSON.stringify([{...old,restoreGeneration:3}]));
    const ref=cloud.ref('users/u/'+path);c.wtAttachRecords(ref,key,field,()=>{});cloud.emit('users/u/'+path);
    await settled(cloud);
    assert.deepEqual(Object.keys(cloud.get('users/u/'+path)),['__dailyRestoredAt']);
    assert.deepEqual(JSON.parse(c.localStorage.getItem(key)),[]);
    const saved=c.wtPersistRecords(key,field,[fresh],[fresh[field]],[],ref);
    await saved.upload;
    const row=cloud.get('users/u/'+path+'/'+c.wtRecordKey(fresh,field));
    assert.equal(row.restoreGeneration,generation);assert.ok(row.updatedAt>generation);
  }
});
test('a second restore advances past a previous workout generation even if the clock moved backwards',async()=>{
  const prior=Date.now()+86400000,cloud=new Cloud({'.info':{connected:true},users:{u:{
    sessions:{__dailyRestoredAt:prior},weights:{__dailyRestoredAt:prior}
  }}}),c=device(cloud);
  let report='';c.alert=m=>report=m;
  c.restoreFromText(JSON.stringify({wt_sessions:[session('kept',1)],wt_weight:[{date:'2026-11-02',weight:80}]}),m=>report=m);
  await settled(cloud);assert.match(report,/restored and synced/);
  for(const [path,id,key] of [['sessions','kept','wt_sessions'],['weights','20261102','wt_weight']]){
    assert.equal(cloud.get('users/u/'+path+'/__dailyRestoredAt'),prior+1);
    assert.equal(cloud.get('users/u/'+path+'/'+id).restoreGeneration,prior+1);
    assert.equal(Number(c.localStorage.getItem(key+'_restore_ts')),prior+1);
    assert.equal(JSON.parse(c.localStorage.getItem(key))[0].restoreGeneration,prior+1);
  }
});
test('another tab changing a supplied store after acknowledgement retains its device copy',async()=>{
  const cloud=new Cloud({'.info':{connected:true},users:{u:{weightGoal:{target:80}}}}),c=device(cloud);
  c.localStorage.setItem('daily_weight_goal','{"target":80}');
  const realRef=cloud.ref.bind(cloud);let message='';
  cloud.ref=path=>{
    const ref=realRef(path);if(path!=='users/u')return ref;
    return {...ref,transaction(...args){return ref.transaction(...args).then(result=>{
      c.localStorage.setItem('daily_weight_goal','{"target":71}');return result;
    });}};
  };
  c.restoreFromText('{"daily_weight_goal":{"target":70}}',m=>message=m);await settled(cloud);
  assert.equal(cloud.get('users/u/weightGoal').target,70);assert.equal(c.localStorage.getItem('daily_weight_goal'),'{"target":71}');
  assert.match(message,/newer copy is retained/);
});
test('a restore listener echo with its own write time permits local completion',()=>{
  const c=device(),plan=c.dailyRestoreStage({daily_reviews:{}},100);
  plan.localBefore=new Map([...plan.writes.keys()].map(key=>[key,null]));
  c.localStorage.setItem('daily_reviews','{}');c.localStorage.setItem('daily_reviews_ts','112');
  assert.equal(c.dailyRestoreLocalChanged(plan,true),false);
  c.localStorage.setItem('daily_reviews','{"2026-11-16":{"updatedAt":113}}');
  assert.equal(c.dailyRestoreLocalChanged(plan,true),true);
});
