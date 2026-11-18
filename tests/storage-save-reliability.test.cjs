'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {app,Cloud,Store,extract}=require('./harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
const base=()=>[{id:'cash',name:'Cash',type:'asset',current:100,history:[]},
  {id:'saver',name:'Savings',type:'asset',current:200,saver:true,history:[]}];
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function settled(cloud){for(let i=0;i<3;i++){await turn();await cloud.settle();}}
function device(cloud=new Cloud(),disk=new Store(),clock=1000){
  const c=app(cloud,disk),nodes={'sync-status':{},'finance-sync-review':{}};
  disk.keys=()=>[...disk.data.keys()];
  Object.defineProperty(disk,'length',{configurable:true,get:()=>disk.data.size});
  disk.key=i=>disk.keys()[i]??null;
  Object.assign(c,{Date:class extends Date{static now(){return clock}},console:{warn(){}},window:{addEventListener(){}},
    document:{getElementById:id=>nodes[id]||null},showToast:()=>{},S:{view:'none'},
    getLocalDate:()=> '2026-11-18',setTimeout:fn=>fn()});
  vm.runInContext(fs.readFileSync('js/ai-remote.js','utf8'),c);
  vm.runInContext(['loadAccounts','saveAccounts','genCatId','setSyncStatus','exportAllData'].map(extract).join('\n'),c);
  c.accounts=c.loadAccounts(true);
  return {c,disk,nodes,cloud};
}
function seedAccounts(c,rows=base(),t=50){
  c.localStorage.setItem('daily_accounts',JSON.stringify(rows));c.localStorage.setItem('daily_accounts_ts',String(t));
  c.accounts=c.loadAccounts(true);
  c.syncBlobListen('u','accounts','daily_accounts',()=>{c.accounts=c.loadAccounts();});
}

test('independent account edits merge without dropping either account history',async()=>{
  const cloud=new Cloud({users:{u:{accounts:{v:JSON.stringify(base()),t:50}}}}),a=device(cloud).c,b=device(cloud,new Store(),2000).c;
  seedAccounts(a);seedAccounts(b);
  const left=base(),right=base();left[0].current=125;left[0].history.push({date:'2026-11-18',balance:125});
  right[1].current=250;right[1].history.push({date:'2026-11-18',balance:250});
  assert.equal(a.saveAccounts(left),true);assert.equal(b.saveAccounts(right),true);await settled(cloud);
  const raw=cloud.get('users/u/accounts'),saved=JSON.parse(raw.v);
  assert.deepEqual(saved.map(a=>a.current),[125,250]);assert.deepEqual(saved.map(a=>a.history.length),[1,1]);
  assert.equal(raw.recordSync,1);assert.equal(a.dailyFinanceDirty('accounts'),false);assert.equal(b.dailyFinanceDirty('accounts'),false);
});

test('a transfer conflicting on either account stays atomic and retains its local intent',async()=>{
  const cloud=new Cloud({users:{u:{accounts:{v:JSON.stringify(base()),t:50}}}}),a=device(cloud).c,b=device(cloud,new Store(),2000).c;
  seedAccounts(a);seedAccounts(b);
  const correction=base();correction[1].current=250;assert.equal(a.saveAccounts(correction),true);await settled(cloud);
  const transfer=base();transfer[0].current=80;transfer[1].current=220;
  transfer.forEach(account=>account.balanceMovements=[{id:'move',amount:20,fromAcctId:'cash',toAcctId:'saver'}]);
  assert.equal(b.saveAccounts(transfer),true);await settled(cloud);
  assert.deepEqual(JSON.parse(cloud.get('users/u/accounts').v).map(a=>a.current),[100,250]);
  assert.deepEqual(plain(b.accounts).map(a=>a.current),[80,220]);assert.equal(b.dailyFinanceDirty('accounts'),true);
  assert.equal(vm.runInContext("dailyFinanceConflicts.has('accounts')",b),true);
  assert.match(b.document.getElementById('sync-status').textContent,/review/i);
  const reloaded=device(cloud,b.localStorage,3000).c;
  assert.deepEqual(plain(reloaded.accounts).map(a=>a.current),[80,220],'reload retains both sides for recovery');
});

test('a successful transfer commits both changed accounts in one server update',async()=>{
  const cloud=new Cloud({users:{u:{accounts:{v:JSON.stringify(base()),t:50}}}}),{c}=device(cloud);seedAccounts(c);
  const next=base();next[0].current=75;next[1].current=225;c.saveAccounts(next);await settled(cloud);
  const changes=cloud.writes.filter(write=>write.path==='users/u/accounts');assert.equal(changes.length,1);
  assert.deepEqual(JSON.parse(changes[0].value.v).map(a=>a.current),[75,225]);
});

test('an identical Accounts echo advances receipts without replacing active controls',()=>{
  const {c,disk}=device();seedAccounts(c);
  let renders=0,observed=0;
  c.dailyAIStoreObserved=()=>observed++;
  const state={uid:'u',path:'accounts',onUpdate:()=>renders++};
  c.dailyFinanceReceive(state,{v:JSON.stringify(base()),t:2000,recordSync:1});
  assert.equal(renders,0);assert.equal(observed,1);
  assert.equal(disk.getItem('daily_accounts_ts'),'2000');assert.equal(disk.getItem('daily_finance_seen_accounts'),'2000');
  const updated=base();updated[0].current=125;
  c.dailyFinanceReceive(state,{v:JSON.stringify(updated),t:3000,recordSync:1});
  assert.equal(renders,1);assert.equal(observed,2);assert.equal(JSON.parse(disk.getItem('daily_accounts'))[0].current,125);
});

test('an accounts restore fences a queued transfer and removes both stale sides',async()=>{
  const cloud=new Cloud({users:{u:{accounts:{v:JSON.stringify(base()),t:50}}}}),{c}=device(cloud);seedAccounts(c);
  const next=base();next[0].current=75;next[1].current=225;c.saveAccounts(next);
  cloud.put('users/u/accounts',{v:JSON.stringify(base()),t:2000,restoreAt:2000,recordSync:1});
  await settled(cloud);
  assert.deepEqual(JSON.parse(cloud.get('users/u/accounts').v).map(a=>a.current),[100,200]);
  assert.equal(c.dailyFinanceDirty('accounts'),false);assert.deepEqual(plain(c.accounts).map(a=>a.current),[100,200]);
});

test('accounts quota failure retains both balances, timestamps and the pending journal boundary',()=>{
  const {c,disk,cloud}=device();seedAccounts(c);const before=[...disk.data];
  const write=disk.setItem.bind(disk);disk.setItem=(key,value)=>{if(key==='daily_accounts_ts')throw Error('quota');write(key,value);};
  const next=base();next[0].current=75;next[1].current=225;
  assert.equal(c.saveAccounts(next),false);assert.deepEqual([...disk.data],before);assert.equal(cloud.writes.length,0);
  assert.deepEqual(plain(c.accounts).map(a=>a.current),[100,200]);
});

test('explicit blob saves advance through bounded or backwards clocks while boot retains its age',async()=>{
  const {c,cloud}=device();
  for(let i=1;i<=10;i++)assert.equal(c.lsSaveTS('daily_budget_var_cats',[{id:'x',name:'Category',budget:i}],'daily_budget_var_cats_ts','budgetVarCats'),true);
  await settled(cloud);assert.equal(JSON.parse(cloud.get('users/u/budgetVarCats').v)[0].budget,10);
  assert.equal(c.localStorage.getItem('daily_budget_var_cats_ts'),'1009');
  c.Date=class extends Date{static now(){return 10}};
  c.lsSave('daily_budget_var_cats',[{id:'x',name:'Category',budget:11}],'budgetVarCats');await settled(cloud);
  assert.equal(c.localStorage.getItem('daily_budget_var_cats_ts'),'1010');
  const count=cloud.writes.length;c._bootPhase=true;c.lsSave('daily_budget_var_cats',[],'budgetVarCats');
  assert.equal(c.localStorage.getItem('daily_budget_var_cats_ts'),'1010');assert.equal(cloud.writes.length,count);
});

test('a rejected differing blob save remains reviewable after cloud adoption and reload',async()=>{
  const cloud=new Cloud({users:{u:{budgetVarCats:{v:'[{"id":"x","name":"Cloud category"}]',t:5000}}}}),f=device(cloud);
  const requested='[{"id":"x","name":"My retained category"}]';
  f.c.lsSave('daily_budget_var_cats',requested,'budgetVarCats');await settled(cloud);
  const recovery=f.c.dailyBlobRecoveryKeys();assert.equal(recovery.length,1);
  assert.equal(f.c.dailyBlobRecovery(recovery[0]).v,requested);
  f.c.syncBlobListen('u','budgetVarCats','daily_budget_var_cats');cloud.emit('users/u/budgetVarCats');
  assert.equal(JSON.parse(f.disk.getItem('daily_budget_var_cats'))[0].name,'Cloud category');
  const next=device(cloud,f.disk);next.c.setSyncStatus('Synced ✓');
  assert.equal(next.nodes['finance-sync-review'].hidden,false);assert.equal(next.nodes['finance-sync-review'].textContent,'Review saved changes');
  assert.equal(next.nodes['sync-status'].textContent,'Sync needs review');
  let downloaded;
  next.c.Blob=class{constructor(parts){downloaded=JSON.parse(parts.join(''));}};
  next.c.URL={createObjectURL:()=> 'blob:synthetic',revokeObjectURL(){}};
  next.c.document.createElement=()=>({click(){},remove(){}});next.c.document.body={appendChild(){}};
  assert.equal(next.c.dailyBlobRecoveryDownload(recovery[0]),true);
  assert.equal(downloaded.app,'daily');assert.deepEqual(downloaded.data,{daily_budget_var_cats:requested});
  const restore=next.c.dailyRestoreStage(downloaded.data,6000);assert.equal(restore.writes.get('daily_budget_var_cats'),requested);
});

test('generic value or revision quota failures roll back and start no upload',()=>{
  for(const helper of ['lsSave','lsSaveTS']){
    const {c,disk,cloud}=device();disk.setItem('daily_saved_foods','[]');disk.setItem('daily_saved_foods_ts','20');
    const old=[...disk.data],normal=disk.setItem.bind(disk);disk.setItem=(key,value)=>{if(key==='daily_saved_foods_ts')throw Error('quota');normal(key,value);};
    const result=helper==='lsSave'?c.lsSave('daily_saved_foods',[{id:'x'}],'savedFoods'):c.lsSaveTS('daily_saved_foods',[{id:'x'}],'daily_saved_foods_ts','savedFoods');
    assert.equal(result,false);assert.deepEqual([...disk.data],old);assert.equal(cloud.writes.length,0);
  }
});

test('a reloaded pending blob is acknowledged before a later device edit arrives',async()=>{
  const key='daily_saved_foods',pending={path:'savedFoods',key,tsKey:key+'_ts',v:'[{"id":"mine"}]',t:1000};
  const disk=new Store({[key]:pending.v,[key+'_ts']:'1000',['daily_blob_pending_'+key]:JSON.stringify(pending)});
  const cloud=new Cloud({users:{u:{savedFoods:{v:'[]',t:500}}}}),{c}=device(cloud,disk);
  c.syncBlobListen('u','savedFoods',key);cloud.emit('users/u/savedFoods');await settled(cloud);
  cloud.emit('users/u/savedFoods');assert.equal(c.dailyBlobIntent(key),null);
  cloud.put('users/u/savedFoods',{v:'[{"id":"peer"}]',t:2000});cloud.emit('users/u/savedFoods');
  assert.equal(c.dailyBlobRecoveryKeys().length,0);assert.equal(JSON.parse(disk.getItem(key))[0].id,'peer');
});

test('atomic local changes release no cloud work when a later store cannot be saved',async()=>{
  const {c,disk,cloud}=device();disk.setItem('daily_saved_foods','[]');disk.setItem('daily_habits_log','{}');
  const old=[...disk.data],normal=disk.setItem.bind(disk);let fail=true;
  disk.setItem=(key,value)=>{if(fail&&key==='daily_habits_log'){fail=false;throw Error('quota');}normal(key,value);};
  assert.throws(()=>c.dailyAtomicLocalChange(()=>{c.lsSave('daily_saved_foods',[{id:'x'}],'savedFoods');c.lsSave('daily_habits_log',{'2026-11-18':[0]},'habitsLog');}),/quota/);
  await settled(cloud);assert.deepEqual([...disk.data],old);assert.equal(cloud.writes.length,0);
  c.dailyAtomicLocalChange(()=>{c.lsSave('daily_saved_foods',[{id:'x'}],'savedFoods');c.lsSave('daily_habits_log',{'2026-11-18':[0]},'habitsLog');});
  await settled(cloud);assert.equal(JSON.parse(cloud.get('users/u/savedFoods').v).length,1);
  assert.deepEqual(JSON.parse(cloud.get('users/u/habitsLog').v),{'2026-11-18':[0]});
});

test('category identifiers remain unique for a synchronous batch with a fixed clock and random fallback',()=>{
  const {c}=device();c.Math=Object.create(Math);c.Math.random=()=>0;
  const ids=Array.from({length:50},()=>c.genCatId('var'));assert.equal(new Set(ids).size,50);
  assert.ok(ids.every(id=>/^var_[a-zA-Z0-9_-]+$/.test(id)));
});

test('a synchronous AI category setup batch keeps every distinct row locally and in the cloud',async()=>{
  const {c,cloud}=device();
  c.AI_ACT_MAXSTR=2000;c.catLabel=category=>category.name;c.refreshCatBudgetUI=()=>{};
  c.loadVarCats=()=>c.lsLoad('daily_budget_var_cats',[]);c.BUD_CAT_LOAD={var:c.loadVarCats};
  vm.runInContext(['aiActStr','aiActTooLong','saveVarCats','aiValExpenseCategory'].map(extract).join('\n'),c);
  c.BUD_CAT_SAVE={var:c.saveVarCats};
  for(let index=0;index<20;index++){
    const action=c.aiValExpenseCategory({name:'Synthetic category '+index},'source-'+index);
    assert.equal(action.ok,true);action.apply({aiActionId:'source-'+index});
  }
  await settled(cloud);
  for(const rows of [JSON.parse(c.localStorage.getItem('daily_budget_var_cats')),JSON.parse(cloud.get('users/u/budgetVarCats').v)]){
    assert.equal(rows.length,20);assert.equal(new Set(rows.map(row=>row.id)).size,20);
    assert.equal(new Set(rows.map(row=>row.aiActionId)).size,20);
  }
});

test('account restore rejects malformed histories before writing any supplied stores',()=>{
  const {c,disk}=device();
  for(const history of [{},'damaged',[null],[{date:'2026-02-30',balance:5}],[{date:'2026-11-18',balance:'unknown'}]]){
    assert.throws(()=>c.dailyRestoreStage({daily_profile:{name:'Do not apply'},daily_accounts:[{id:'a',name:'Account',type:'asset',history}]},5000),/Invalid data/);
    assert.equal(disk.getItem('daily_profile'),null);
  }
  for(const account of [{id:'a',name:'Legacy',type:'asset'},
      {id:'a',name:'Legacy',type:'asset',history:null},
      {id:'a',name:'Legacy',type:'asset',current:'-2.50',history:[{date:'2024-02-29',balance:'-2.50'}]}]){
    const plan=c.dailyRestoreStage({daily_accounts:[account]},5000);
    assert.deepEqual(JSON.parse(plan.writes.get('daily_accounts')),[account]);assert.equal(plan.updates.accounts.recordSync,1);
  }
});

test('backup restore ignores pending generic intent but retains downloadable recovery data',()=>{
  const {c}=device(),value=JSON.stringify({path:'budgetVarCats',key:'daily_budget_var_cats',v:'[]',t:50});
  const plan=c.dailyRestoreStage({daily_blob_pending_daily_budget_var_cats:value,
    daily_sync_recovery_daily_budget_var_cats_50:value},5000);
  assert.equal(plan.writes.has('daily_blob_pending_daily_budget_var_cats'),false);
  assert.equal(plan.writes.get('daily_sync_recovery_daily_budget_var_cats_50'),value);
});
