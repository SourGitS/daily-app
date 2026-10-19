const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {extract,copy}=require('./harness.cjs');
const seed=()=>[
  {id:'cash',name:'Everyday',type:'asset',category:'cash',current:1000,custom:'keep',history:[{date:'2026-10-01',balance:1200}]},
  {id:'save',name:'Savings',type:'asset',category:'savings',saver:true,current:50.05,history:[]},
  {id:'card',name:'Card',type:'debt',category:'card',current:700,statementBalance:400,dueDate:'2026-10-12',history:[]}
];
function fixture(){
  const store=new Map([['daily_accounts',JSON.stringify(seed())],['daily_budget','{}'],['daily_ledger','untouched']]);
  const nodes={};let failed=false,writes=0;
  for(const id of ['acct-tools-dialog','acct-tools-error','acct-transfer-from','acct-transfer-to','acct-transfer-amount','acct-transfer-posted'])nodes[id]={value:'',checked:false,open:true,close(){this.open=false;}};
  const c=vm.createContext({console,Date,Map,Set,accounts:seed(),auth:{currentUser:{uid:'A'}},S:{view:'budget'},_bootPhase:false,_syncApplying:0,
    localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>{if(failed)throw Error('quota');store.set(k,String(v));},removeItem:k=>store.delete(k)},
    document:{getElementById:id=>nodes[id]},getLocalDate:()=> '2026-10-19',acctIsSaver:a=>a.type==='asset'&&a.saver===true,
    showToast:()=>{},renderBudgetOverview:()=>{},renderAccountsPage:()=>{},renderBudgetTab:()=>{},syncBlobPush:()=>writes++,
    escText:s=>String(s).replaceAll('<','&lt;'),escAttr:s=>String(s).replaceAll('"','&quot;'),fmtDate:s=>s,fmtMoneyExact:n=>'$'+n});
  vm.runInContext(fs.readFileSync('js/finance-periods.js','utf8'),c);
  vm.runInContext(fs.readFileSync('js/accounts-tools.js','utf8'),c);
  vm.runInContext(['lsLoad','stampFor','lsSave','loadAccounts','saveAccounts'].map(extract).join('\n'),c);
  return {c,nodes,store,get writes(){return writes;},set failed(v){failed=v;}};
}
const transfer={from:'cash',to:'save',amount:'100.25',posted:true,key:'week:2026-10-19',token:'transfer-1'};
const statement={statementDate:'2026-10-16',dueDate:'2026-11-10',balance:'600',minimum:'25',interest:'3.40',fees:'0',status:'current'};
test('new statement preserves old statement and all balances, with optional amounts distinct from zero',()=>{
  const {c}=fixture(),a=seed()[2],next=c.acctStatementBuild(a,statement);
  assert.equal(next.current,700);assert.equal(next.statementHistory[0].statementBalance,400);assert.equal(next.statementHistory[0].status,'replaced');
  assert.equal(next.statementBalance,600);assert.equal(next.statementDetails.interest,3.4);assert.equal(next.statementDetails.fees,0);
  assert.equal(a.statementHistory,undefined);
  const historical=c.acctStatementBuild(a,{...statement,status:'historical',interest:'',fees:''});assert.equal(historical.statementBalance,400);assert.equal(historical.statementHistory[0].interest,null);
});
test('statement dates, amounts and duplicate statements are validated without guessing history',()=>{
  const {c}=fixture(),a=seed()[2];
  for(const patch of [{statementDate:'2026-02-30'},{statementDate:'2026-12-01'},{dueDate:'2026-10-01'},{balance:'-1'},{interest:'1.001'},{minimum:'601'},{status:'other'}])assert.throws(()=>c.acctStatementBuild(a,{...statement,...patch}));
  const current=c.acctStatementBuild(a,statement);assert.throws(()=>c.acctStatementBuild(current,statement),/already/);
  assert.throws(()=>c.acctStatementBuild(a,{...statement,statementDate:'2026-09-16',dueDate:'2026-10-12',balance:'400'}),/already/);
});
test('historical paid entry does not settle current statement or change debt',()=>{
  const {c}=fixture(),a=seed()[2],next=c.acctStatementBuild(a,{...statement,status:'paid'});
  assert.equal(next.current,a.current);assert.equal(next.statementBalance,a.statementBalance);assert.equal(next.dueDate,a.dueDate);assert.equal(next.statementHistory[0].status,'paid');
});
test('history includes existing settlements without migrating or inventing missing dates',()=>{
  const {c}=fixture(),a={...seed()[2],statementSettlements:[{date:'2026-09-20',dueDate:'2026-09-25',statementBalance:200,confirmedBalance:10}]};
  const rows=c.acctStatementRows(a);assert.equal(rows.length,1);assert.equal(rows[0].status,'settled');assert.equal(rows[0].statementDate,undefined);
  assert.match(c.acctRecordsHtml(a),/Marked paid/);assert.match(c.acctRecordsHtml(seed()[2]),/cannot be reconstructed/);
});
test('transfer updates both balances exactly and keeps net worth, unknown fields and older history',()=>{
  const {c}=fixture(),before=seed(),next=c.acctTransferBuild(before,transfer);
  assert.equal(next[0].current,899.75);assert.equal(next[1].current,150.3);assert.equal(next[0].current+next[1].current,1050.05);
  assert.equal(next[0].custom,'keep');assert.equal(next[0].history[0].balance,1200);assert.equal(next[0].balanceMovements[0].id,next[1].balanceMovements[0].id);assert.equal(before[0].current,1000);assert.deepEqual(copy(next[2]),before[2]);
});
test('debt transfer reduces cash and debt without clearing a statement or fabricating expenses',()=>{
  const {c}=fixture(),next=c.acctTransferBuild(seed(),{...transfer,to:'card',key:''});
  assert.equal(next[0].current,899.75);assert.equal(next[2].current,599.75);assert.equal(next[2].statementBalance,400);assert.equal(next[2].dueDate,'2026-10-12');
});
test('pending, invalid, excess and same-account transfers do not build a balance update',()=>{
  const {c}=fixture();
  for(const patch of [{posted:false},{to:'cash'},{from:'card'},{to:'missing'},{amount:'0'},{amount:'-1'},{amount:'1000.01'},{amount:'1.001'},{to:'card'},{amount:'Infinity'}])assert.throws(()=>c.acctTransferBuild(seed(),{...transfer,...patch}));
  assert.throws(()=>c.acctTransferBuild(seed(),{...transfer,to:'card',key:'',amount:'701'}),/exceeds/);
});
test('repeated week saves and repeated confirmation tokens cannot apply another transfer',()=>{
  const {c}=fixture(),next=c.acctTransferBuild(seed(),transfer);
  assert.throws(()=>c.acctTransferBuild(next,{...transfer,token:'another'}),/already/);
  assert.throws(()=>c.acctTransferBuild(next,{...transfer,key:''}),/already/);
});
function prepare(f){
  vm.runInContext("acctToolDraft={kind:'transfer',uid:'A',snapshot:JSON.stringify(accounts),key:'week:2026-10-19',token:'transfer-1'}",f.c);
  f.nodes['acct-transfer-from'].value='cash';f.nodes['acct-transfer-to'].value='save';f.nodes['acct-transfer-amount'].value='100.25';f.nodes['acct-transfer-posted'].checked=true;
}
test('one confirmed transfer persists both accounts through one existing store writer',()=>{
  const f=fixture();prepare(f);assert.equal(f.c.acctTransferConfirm(),true);assert.equal(f.writes,1);assert.equal(f.c.acctTransferConfirm(),false);
  const saved=JSON.parse(f.store.get('daily_accounts'));assert.equal(saved[0].current,899.75);assert.equal(saved[1].current,150.3);assert.equal(f.store.get('daily_ledger'),'untouched');assert.equal(f.store.get('daily_budget'),'{}');
});
test('stale account, signed-in account change and failed storage reject transfer without claiming success',()=>{
  for(const kind of ['memory','storage','auth','quota']){
    const f=fixture();prepare(f);const before=f.store.get('daily_accounts');
    if(kind==='memory')f.c.accounts[0].current=900;
    if(kind==='storage'){const a=seed();a[0].current=900;f.store.set('daily_accounts',JSON.stringify(a));}
    if(kind==='auth')f.c.auth.currentUser.uid='B';if(kind==='quota')f.failed=true;
    assert.equal(f.c.acctTransferConfirm(),false,kind);assert.equal(f.writes,0);assert.equal(f.nodes['acct-tools-dialog'].open,true);
    if(kind==='quota')assert.equal(f.store.get('daily_accounts'),before);
  }
});
test('cancel is read-only and clears the transfer draft',()=>{
  const f=fixture();prepare(f);const before=[...f.store];f.c.acctToolClose();assert.equal(f.c.acctTransferConfirm(),false);assert.deepEqual([...f.store],before);
});
test('weekly offer reads a successfully saved current week and never changes it',()=>{
  const f=fixture();Object.assign(f.c,{currentWeekIdx:0,weekKey:()=> '2026-10-19',getMondayOf:()=>null,acctTransferOpen:p=>f.proposal=p});
  f.c.acctOfferBudgetTransfer(false);assert.equal(f.proposal,undefined);
  f.store.set('daily_budget',JSON.stringify({'2026-10-19':{saved:true,sav_amount:'75'}}));f.c.acctOfferBudgetTransfer(false);assert.equal(f.proposal.amount,75);assert.equal(f.writes,0);
  f.proposal=null;f.c.currentWeekIdx=1;f.c.acctOfferBudgetTransfer(false);assert.equal(f.proposal,null);
});
test('savings reporting counts the two account receipts once and respects a linked imported transfer',()=>{
  const f=fixture(),next=f.c.acctTransferBuild(seed(),transfer);f.store.set('daily_accounts',JSON.stringify(next));
  f.c.ledgerOf=()=>[];vm.runInContext(extract('ledgerSavingsMovement'),f.c);
  assert.equal(f.c.ledgerSavingsMovement('2026-10-19','2026-10-19').contributions,100.25);
  assert.equal(f.c.ledgerSavingsMovement('2026-10-18','2026-10-18').transfers,0);
  f.c.ledgerOf=()=>[{id:'imported',accountMovementId:'transfer-1',date:'2026-10-19',amount:100.25,savingsMove:'contribution'}];
  assert.equal(f.c.ledgerSavingsMovement('2026-10-19','2026-10-19').transfers,1);
});
test('existing transfer must be explicitly linked, counted once and cannot update balances twice',()=>{
  const f=fixture();f.c.ledgerOf=()=>[{id:'existing',date:'2026-10-19',fromAcctId:'cash',toAcctId:'save',amount:100.25,savingsMove:'contribution'}];
  assert.throws(()=>f.c.acctTransferBuild(seed(),transfer),/matching transfer/);
  assert.throws(()=>f.c.acctTransferBuild(seed(),{...transfer,ledgerId:'missing'}),/selected transfer/);
  const next=f.c.acctTransferBuild(seed(),{...transfer,ledgerId:'existing'});f.store.set('daily_accounts',JSON.stringify(next));
  vm.runInContext(extract('ledgerSavingsMovement'),f.c);assert.equal(f.c.ledgerSavingsMovement('2026-10-19','2026-10-19').contributions,100.25);
  assert.throws(()=>f.c.acctTransferBuild(next,{...transfer,key:'',token:'new',ledgerId:'existing'}),/already updated/);
});
