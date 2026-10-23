const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {extract,extractConst,copy}=require('./harness.cjs');
const moduleSource=fs.readFileSync(require('node:path').join(__dirname,'../js/ai-assistant.js'),'utf8');
function fixture(){
  const memory=new Map(),user={uid:'alice',reload:async()=>{}};
  const ctx=vm.createContext({console,Date,Math,Intl,JSON,setTimeout:()=>{},navigator:{onLine:true},crypto:require('node:crypto').webcrypto,
    document:{getElementById:()=>null},localStorage:{scope:'user:alice',getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v))},
    lsLoad:(k,d)=>memory.has(k)?JSON.parse(memory.get(k)):d,lsSave:(k,v)=>memory.set(k,JSON.stringify(v)),syncBlobPush:()=>{},
    auth:{currentUser:user},dailyAccountMatches:u=>ctx.localStorage.scope===(u?'user:'+u.uid:'guest'),
    _bootPhase:false,_syncApplying:0,_cloudWorkoutReady:true,renderAIHub:()=>{},showToast:()=>{},
    loadVarCats:()=>[{id:'food',name:'Food'}],activeCats:a=>a,loadAccounts:()=>[{id:'card',name:'Credit Card'}],
    txnData:[],loadFixCats:()=>[],ledgerOf:()=>[],accounts:[],catLabel:c=>c.name,catPaymentAccount:()=>null,
    catCycle:c=>c.cycle,catAmount:c=>c.amount,catIsArchived:c=>!!c.archived,catIsCharging:c=>!c.paused,catIsRecurring:()=>true,
    dateStr:d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')});
  vm.runInContext(['AI_ACT_SCHEMA','AI_ACT_VERSION','AI_ACT_MAX','AI_ACT_MAXSTR','AI_ACT_MAXTEXT'].map(extractConst).join('\n')+'\n'+
    ['aiActStr','aiActValidDate','parseDailyActions','localMidnight','_billMonthlyOn','_billYearlyOn','catOccurrencesBetween','billIsScheduled','billOccurrences','syncBlobCommit'].map(extract).join('\n')+'\n'+moduleSource,ctx);
  ctx.run=s=>vm.runInContext(s,ctx);ctx.memory=memory;
  ctx.run("dailyAIState.ready=Object.fromEntries(['accounts','transactions','ledger','budgetFixCats','budgetVarCats','aiRequests'].map(p=>[p,true]))");
  ctx.row={id:'daily_req_test',scope:'user:alice',status:'prepared',today:'2026-10-23',request:'Lunch',createdAt:1};
  ctx.dailyAISaveRequest(ctx.row);
  ctx.payload=()=>JSON.stringify({schema:'daily-actions',version:1,actions:[{id:'daily_req_test',type:'add_expense',data:{amount:18.5,currency:'AUD',date:'2026-10-23',merchant:'Lunch',categoryId:'food',paymentAccountId:'card'}}]});
  return ctx;
}
test('expense replies require an account-owned prepared request and explicit existing references',()=>{
  const c=fixture();assert.equal(c.dailyAIValidateReply(c.payload()).row.id,'daily_req_test');
  for(const [field,value] of [['amount','18.5oops'],['amount',Infinity],['amount',0],['amount',1.001],['currency','USD'],['date','2026-02-30'],['merchant',''],['paymentAccountId','other'],['categoryId','missing'],['essential','yes'],['pending',true]]){
    const p=JSON.parse(c.payload());p.actions[0].data[field]=value;assert.throws(()=>c.dailyAIValidateReply(JSON.stringify(p)),undefined,field);
  }
  for(const status of ['applied','applying','undone','undo_failed','failed','cancelled']){c.dailyAISaveRequest({...c.row,status});assert.throws(()=>c.dailyAIValidateReply(c.payload()),/already used/);}
  c.dailyAISaveRequest(c.row);c.auth.currentUser={uid:'bob'};assert.throws(()=>c.dailyAIValidateReply(c.payload()),/account changed/);
  c.localStorage.scope='user:bob';assert.throws(()=>c.dailyAIValidateReply(c.payload()),/not prepared in this Daily account/);
});
test('same-millisecond request state transitions retain increasing timestamps',()=>{
  const c=fixture(),a=Number(c.localStorage.getItem('daily_ai_requests_ts'));
  c.dailyAISaveRequest({...c.row,status:'applying'});const b=Number(c.localStorage.getItem('daily_ai_requests_ts'));
  c.dailyAISaveRequest({...c.row,status:'applied'});assert.ok(a<b&&b<Number(c.localStorage.getItem('daily_ai_requests_ts')));
});
test('receipt requires both exact committed record and exact audit, never a cache or generic sync badge',()=>{
  const c=fixture(),row={...c.row,status:'applied',record:{id:'txn_1',aiActionId:c.row.id,amount:18.5}};
  c.dailyAISaveRequest(row);const result=data=>({committed:true,snapshot:{val:()=>({v:JSON.stringify(data)})}});
  c.dailyAICloudResult('alice','transactions',result([row.record]));assert.doesNotMatch(c.dailyAIReceipt(row),/^Saved to cloud/);
  c.dailyAICloudResult('alice','aiRequests',{...result([row]),committed:false});assert.doesNotMatch(c.dailyAIReceipt(row),/^Saved to cloud/);
  c.dailyAICloudResult('alice','aiRequests',result([row]));assert.match(c.dailyAIReceipt(row),/^Saved to cloud/);
  assert.doesNotMatch(c.dailyAIReceipt({...row,record:{...row.record,amount:19}}),/^Saved to cloud/);
  c.dailyAICloudResult('bob','transactions',result([]));assert.match(c.dailyAIReceipt(row),/^Saved to cloud/);
  const undone={...row,status:'undone'};c.dailyAICloudResult('alice','aiRequests',result([undone]));assert.doesNotMatch(c.dailyAIReceipt(undone),/^Saved to cloud/);
  c.dailyAICloudResult('alice','transactions',result([]));assert.match(c.dailyAIReceipt(undone),/^Saved to cloud/);
});
test('pending, failure, offline and stale acknowledgements remain distinct',()=>{
  const c=fixture(),row={...c.row,status:'applied',record:{id:'x'}};
  const first=c.dailyAICloudStart('alice','transactions');assert.match(c.dailyAIReceipt(row),/^Syncing/);
  const second=c.dailyAICloudStart('alice','transactions');c.dailyAICloudResult('alice','transactions',null,new Error(),first);
  assert.match(c.dailyAIReceipt(row),/^Syncing/);
  c.dailyAICloudResult('alice','transactions',null,new Error(),second);assert.match(c.dailyAIReceipt(row),/^Cloud save failed/);
  c.run('dailyAIState.acks={}');c.navigator.onLine=false;assert.match(c.dailyAIReceipt(row),/^Saved locally/);
});
test('cloud receipt retry re-acknowledges identical content but never forces a newer or different cloud value',async()=>{
  const c=fixture();for(const [raw,expected] of [[{v:'same',t:10},true],[{v:'other',t:10},false],[{v:'newer',t:11},false]]){
    const ref={transaction:async f=>({committed:f(raw)!==undefined})};assert.equal((await c.syncBlobCommit(ref,'same',10,true)).committed,expected);
  }
});
test('revoked/expired identity blocks new requests and a successful recheck clears that state',async()=>{
  const c=fixture();c.auth.currentUser.reload=async()=>{throw Object.assign(new Error(),{code:'auth/user-token-expired'});};
  assert.equal(await c.dailyAICheckIdentity(),false);assert.throws(()=>c.dailyAIValidateReply(c.payload()),/sign-in/);
  c.auth.currentUser.reload=async()=>{};assert.equal(await c.dailyAICheckIdentity(),true);assert.doesNotThrow(()=>c.dailyAIValidateReply(c.payload()));
});
test('Sydney today resolves across UTC midnight and daylight saving independently of device timezone',()=>{
  const c=fixture();assert.equal(c.dailyAIToday(new Date('2026-10-22T14:00:00Z')),'2026-10-23');
  assert.equal(c.dailyAIToday(new Date('2026-10-03T14:30:00Z')),'2026-10-04');
});
test('bill date range repeats anchored schedules, preserves unknown amounts, and separates payment evidence',()=>{
  const c=fixture();c.loadFixCats=()=>[
    {id:'month',name:'Month end',cycle:'monthly',dueDate:'2026-01-31',amount:40},
    {id:'week',name:'Weekly',cycle:'weekly',dueDate:'2026-10-01',amount:''},
    {id:'paused',name:'Paused',cycle:'weekly',dueDate:'2026-10-01',amount:10,paused:true},
    {id:'archived',name:'Archived',cycle:'weekly',dueDate:'2026-10-01',amount:10,archived:true},
    {id:'bad',name:'Missing date',cycle:'monthly',amount:10}];
  c.ledgerOf=()=>[{id:'payment',date:'2026-10-01',fixCatId:'week',amount:10}];
  const before=JSON.stringify(c.loadFixCats()),r=c.dailyAIBills('2026-10-01','2026-10-31');
  assert.equal(r.items.filter(i=>i.id==='week').length,5);assert.ok(r.items.filter(i=>i.id==='week').every(i=>i.amount===null));
  assert.equal(r.items.find(i=>i.id==='month').dueDate,'2026-10-31');assert.equal(r.recordedPayments.length,1);
  assert.ok(r.items.every(i=>i.paymentStatus==='Not established for this scheduled occurrence'));
  assert.deepEqual(copy(r.missingSchedule),['Missing date']);assert.equal(JSON.stringify(c.loadFixCats()),before);
  assert.throws(()=>c.dailyAIBills('2026-02-31','2026-10-01'),/valid/);assert.throws(()=>c.dailyAIBills('2026-10-31','2026-10-01'),/valid/);
  assert.throws(()=>c.dailyAIBills('2025-01-01','2026-10-01'),/one year/);
});
test('request prompts disclose only names, IDs and request context, no balances or secrets',()=>{
  const c=fixture();c.loadAccounts=()=>[{id:'card',name:'Card',current:987654,token:'DO_NOT_SHARE'}];
  const text=c.dailyAIExpensePrompt(c.row);assert.match(text,/daily_req_test/);assert.doesNotMatch(text,/987654|DO_NOT_SHARE|uid|alice/);
});
test('financial collection readiness and account changes invalidate in-flight state',()=>{
  const c=fixture();c.run("delete dailyAIState.ready.aiRequests");assert.throws(()=>c.dailyAIValidateReply(c.payload()),/finish loading/);
  c.dailyAIStoreObserved('bob','aiRequests');assert.throws(()=>c.dailyAIValidateReply(c.payload()),/finish loading/);
  c.dailyAIStoreObserved('alice','aiRequests');assert.doesNotThrow(()=>c.dailyAIValidateReply(c.payload()));
  c.run("dailyAIState.reply='private draft';dailyAIState.verifiedUid='alice'");c.dailyAIAccountChanged();
  assert.equal(c.run('dailyAIState.reply'),'');assert.equal(c.run('dailyAIState.verifiedUid'),'');assert.deepEqual(copy(c.run('dailyAIState.acks')),{});
});
test('identity changing during online verification cannot verify the replacement account',async()=>{
  const c=fixture();c.auth.currentUser.reload=async()=>{c.auth.currentUser={uid:'bob'};};
  assert.equal(await c.dailyAICheckIdentity(),false);assert.equal(c.run('dailyAIState.verifiedUid'),'');
});
