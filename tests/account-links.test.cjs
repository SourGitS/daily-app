const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {extract,copy}=require('./harness.cjs');
const today='2026-10-20';
const seed=()=>[
  {id:'cash',name:'Everyday',type:'asset',category:'cash',current:1000,history:[{date:'2026-09-01',balance:1200}],custom:{keep:true}},
  {id:'save',name:'Savings',type:'asset',category:'savings',saver:true,current:200,history:[]},
  {id:'card',name:'Card',type:'debt',category:'card',current:700,statementBalance:400,dueDate:'2026-11-10',history:[]}
];
function fixture(){
  const store=new Map([['daily_accounts',JSON.stringify(seed())],['daily_transactions','[]'],['daily_ledger','[]'],['daily_budget','{"2026-09-01":{"inc_salary":"500","var_food":"80","saved":true}}']]);
  let fail='',writes=0,token=0;const nodes={'txn-account':{value:'cash'},'txn-update-balance':{checked:true},'txn-balance-hint':{},'txn-err':{},'acct-tools-error':{}};
  const c=vm.createContext({console:{warn(){}},Date,Math,Map,Set,JSON,accounts:seed(),txnData:[],ledgerData:[],auth:{currentUser:{uid:'A'}},S:{view:'none'},_bootPhase:false,_syncApplying:0,
    localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>{if(k===fail)throw Error('quota');writes++;store.set(k,String(v));},removeItem:k=>store.delete(k)},
    document:{getElementById:id=>nodes[id]},getLocalDate:()=>today,acctIsSaver:a=>a.saver===true,genAccountId:()=>`anchor-${++token}`,
    showToast:()=>{},syncBlobPush:()=>{},escText:String,escAttr:String,fmtDate:String,fmtMoneyExact:String});
  for(const file of ['finance-periods','accounts-tools','account-links'])vm.runInContext(fs.readFileSync(`js/${file}.js`,'utf8'),c);
  vm.runInContext(['lsLoad','stampFor','lsSave','loadAccounts','saveAccounts','loadTxns','saveTxns','loadLedger','saveLedger','accountLogBalance'].map(extract).join('\n'),c);
  function connect(id){const list=c.loadAccounts(),a=list.find(a=>a.id===id);a.balanceLink={version:1,anchor:id+'-start',balance:a.current,date:today,confirmedAt:1};c.saveAccounts(list);return a;}
  function expense(id,amount,account='cash',extra={}){const a=c.loadAccounts().find(a=>a.id===account);return {id,date:today,amount,catId:'food',acctId:account,accountLink:c.acctLinkEffect(a,'expense',today),...extra};}
  function income(id,amount,account='cash'){const a=c.loadAccounts().find(a=>a.id===account);return {id,date:today,amount,kind:'income',acctId:account,accountLink:c.acctLinkEffect(a,'income',today)};}
  return {c,store,nodes,connect,expense,income,set fail(v){fail=v;},get writes(){return writes;}};
}

test('expense balance choice explains unavailable states and offers setup only for a new manual-account entry',()=>{
  const f=fixture(),{c,nodes}=f;nodes['txn-balance-setup']={};
  const before=f.writes;c.acctTxnOpen(null);
  assert.equal(nodes['txn-update-balance'].disabled,true);assert.equal(nodes['txn-balance-setup'].hidden,false);
  assert.match(nodes['txn-balance-hint'].textContent,/manual balances/);
  nodes['txn-account'].value='';c.acctTxnChoice();assert.match(nodes['txn-balance-setup'].textContent,/Choose an account/);
  assert.match(nodes['txn-balance-hint'].textContent,/Paid with first/);assert.equal(f.writes,before);
  nodes['txn-account'].value='cash';c.acctTxnOpen({id:'legacy',acctId:'cash'});
  assert.equal(nodes['txn-balance-setup'].hidden,true);assert.equal(nodes['txn-update-balance'].disabled,true);
  assert.match(nodes['txn-balance-hint'].textContent,/budget only/);
  f.connect('cash');c.acctTxnOpen(null);assert.equal(nodes['txn-update-balance'].disabled,false);assert.equal(nodes['txn-balance-setup'].hidden,true);
  f.store.set('daily_accounts','[]');nodes['txn-account'].value='';c.acctTxnOpen(null);
  assert.match(nodes['txn-balance-hint'].textContent,/Add a cash, savings or credit-card account/);assert.equal(nodes['txn-balance-setup'].hidden,true);
});

function inlineTracking(f){
  const {c,nodes}=f;
  nodes['acct-link-mode']={value:'linked'};nodes['acct-link-balance']={value:'1000'};
  nodes['txn-modal']={classList:{contains:()=>false}};
  nodes['txn-update-balance'].focus=()=>{};nodes['txn-balance-setup']={focus:()=>{}};
  c.acctToolClose=()=>{};c.acctToolRefresh=()=>{};
  c.acctTxnOpen(null);
  vm.runInContext("acctToolDraft={kind:'connection',id:'cash',signature:acctLinkSignature(),expenseDraft:acctTxnDraft}",c);
}
test('confirmed inline tracking retains the expense draft, requires opting in again and never posts an expense itself',()=>{
  const f=fixture(),{c,store,nodes}=f;inlineTracking(f);
  const tx=store.get('daily_transactions'),ledger=store.get('daily_ledger'),budget=store.get('daily_budget');
  assert.equal(c.acctLinkConfirm(),true);
  assert.equal(c.loadAccounts()[0].current,1000);assert.equal(c.acctLinkActive(c.loadAccounts()[0]),true);
  assert.equal(nodes['txn-update-balance'].disabled,false);assert.equal(nodes['txn-update-balance'].checked,false);
  assert.doesNotThrow(()=>c.acctTxnGuard());
  assert.equal(c.acctTxnPrepare({acctId:'cash',date:today,amount:20}).accountLink,undefined);
  nodes['txn-update-balance'].checked=true;assert.equal(c.acctTxnPrepare({acctId:'cash',date:today,amount:20}).accountLink.accountId,'cash');
  assert.equal(store.get('daily_transactions'),tx);assert.equal(store.get('daily_ledger'),ledger);assert.equal(store.get('daily_budget'),budget);
});
test('inline tracking refuses changed, replaced or closed expense drafts and a failed save leaves the account manual',()=>{
  for(const kind of ['records','draft','account','closed','failed']){
    const f=fixture(),{c,store,nodes}=f;inlineTracking(f);const accounts=store.get('daily_accounts');
    if(kind==='records')store.set('daily_ledger','[{"id":"concurrent"}]');
    if(kind==='draft')c.acctTxnOpen(null);
    if(kind==='account')nodes['txn-account'].value='card';
    if(kind==='closed')nodes['txn-modal'].classList.contains=()=>true;
    if(kind==='failed')f.fail='daily_accounts';
    assert.equal(c.acctLinkConfirm(),false,kind);assert.equal(store.get('daily_accounts'),accounts,kind);
    assert.equal(c.acctLinkActive(c.loadAccounts()[0]),false,kind);
    assert.equal(nodes['txn-update-balance'].disabled,true,kind);
    if(kind==='failed')assert.doesNotThrow(()=>c.acctTxnGuard());
  }
});
test('manual accounts and legacy entries remain byte-for-byte unchanged on reads and linking',()=>{
  const f=fixture(),{c,store}=f;
  store.set('daily_transactions',JSON.stringify([{id:'old',date:today,amount:500,acctId:'cash'}]));
  store.set('daily_ledger',JSON.stringify([{id:'old-income',date:today,amount:900,kind:'income',acctId:'cash'}]));
  const before=new Map(store),writes=f.writes;
  assert.deepEqual(copy(c.loadAccounts()),seed());assert.equal(f.writes,writes);
  f.connect('cash');assert.equal(c.loadAccounts()[0].current,1000);
  for(const key of ['daily_transactions','daily_ledger','daily_budget'])assert.equal(store.get(key),before.get(key));
  assert.deepEqual(copy(c.loadAccounts()[0].history),seed()[0].history);
});
test('cash spending, card spending and income update balances once without writing account storage',()=>{
  const f=fixture(),{c,store}=f;f.connect('cash');f.connect('card');const raw=store.get('daily_accounts');
  c.txnData=[f.expense('cash-spend',25.55),f.expense('card-spend',40,'card')];assert.equal(c.saveTxns(),true);
  c.ledgerData=[f.income('pay',100.10)];assert.equal(c.saveLedger(),true);
  assert.equal(c.loadAccounts()[0].current,1074.55);assert.equal(c.loadAccounts()[2].current,740);
  for(let i=0;i<4;i++)assert.equal(c.loadAccounts()[0].current,1074.55);
  assert.equal(store.get('daily_accounts'),raw);assert.equal(c.loadAccounts()[2].statementBalance,400);
});
test('editing, refunding and deleting a linked expense changes only its current effect',()=>{
  const f=fixture(),{c}=f;f.connect('cash');c.txnData=[f.expense('one',20)];c.saveTxns();assert.equal(c.accounts[0].current,980);
  c.txnData[0].amount=30;c.saveTxns();assert.equal(c.accounts[0].current,970);
  c.txnData[0].amount=-10;c.saveTxns();assert.equal(c.accounts[0].current,1010);
  c.txnData=[];c.saveTxns();assert.equal(c.accounts[0].current,1000);
});
test('duplicate source IDs cannot count twice; unlinked, wrong-account and wrong-kind entries do not apply',()=>{
  const f=fixture(),{c}=f;f.connect('cash');const r=f.expense('one',20);
  c.txnData=[r,copy(r),{...r,id:'unlinked',accountLink:undefined},{...r,id:'wrong',acctId:'save'}, {...r,id:'kind',accountLink:{...r.accountLink,kind:'income'}}];c.saveTxns();
  assert.equal(c.accounts[0].current,980);
});
test('renaming and saving a projected account never writes the projection into its baseline',()=>{
  const f=fixture(),{c,store}=f;f.connect('cash');c.txnData=[f.expense('one',25)];c.saveTxns();
  const list=c.loadAccounts();list[0].name='Renamed';c.saveAccounts(list);c.saveAccounts(c.accounts);
  assert.equal(c.accounts[0].current,975);assert.equal(JSON.parse(store.get('daily_accounts'))[0].current,1000);
  assert.equal(c.accounts[0].balanceLink.balance,1000);assert.deepEqual(copy(c.accounts[0].custom),{keep:true});
});
test('confirming even the same calculated balance starts a new baseline and preserves source records',()=>{
  const f=fixture(),{c,store}=f;f.connect('cash');c.txnData=[f.expense('one',25)];c.saveTxns();
  const tx=store.get('daily_transactions'),budget=store.get('daily_budget');c.accountLogBalance('cash',975);
  assert.equal(c.accounts[0].current,975);assert.notEqual(c.accounts[0].balanceLink.anchor,'cash-start');
  assert.equal(c.accounts[0].balanceCheckpoints[0].calculatedBalance,975);
  assert.equal(store.get('daily_transactions'),tx);assert.equal(store.get('daily_budget'),budget);
  c.txnData[0].amount=50;c.saveTxns();assert.equal(c.accounts[0].current,975,'a correction before the snapshot cannot move it');
  c.txnData.push(f.expense('new',10));c.saveTxns();assert.equal(c.accounts[0].current,965);
  assert.deepEqual(copy(c.accounts[0].history[0]),seed()[0].history[0]);
});
test('transfers apply once to both connected accounts and preserve active purchase effects',()=>{
  const f=fixture(),{c}=f;f.connect('cash');f.connect('save');c.txnData=[f.expense('spend',50)];c.saveTxns();
  const next=c.acctTransferBuild(c.loadAccounts(),{from:'cash',to:'save',amount:'100',posted:true,key:'budget:one',token:'move'});
  c.acctToolSave(next);assert.equal(c.accounts[0].current,850);assert.equal(c.accounts[1].current,300);
  assert.throws(()=>c.acctTransferBuild(c.loadAccounts(),{from:'cash',to:'save',amount:'100',posted:true,key:'budget:one',token:'again'}),/already/);
  c.txnData[0].amount=60;c.saveTxns();assert.equal(c.accounts[0].current,840);assert.equal(c.accounts[1].current,300);
});
test('repayment lowers cash and debt without clearing the statement or counting spending again',()=>{
  const f=fixture(),{c}=f;f.connect('cash');f.connect('card');c.txnData=[f.expense('spend',50,'card')];c.saveTxns();
  c.acctToolSave(c.acctTransferBuild(c.loadAccounts(),{from:'cash',to:'card',amount:'100',posted:true,key:'',token:'pay'}));
  assert.equal(c.accounts[0].current,900);assert.equal(c.accounts[2].current,650);assert.equal(c.accounts[2].statementBalance,400);assert.equal(c.txnData.length,1);
});
test('failed source saves cannot change balances or account history',()=>{
  const f=fixture(),{c,store}=f;f.connect('cash');const raw=store.get('daily_accounts');
  f.fail='daily_transactions';c.txnData=[f.expense('spend',50)];assert.equal(c.saveTxns(),false);assert.equal(c.loadAccounts()[0].current,1000);
  f.fail='daily_ledger';c.ledgerData=[f.income('pay',500)];assert.equal(c.saveLedger(),false);assert.equal(c.loadAccounts()[0].current,1000);assert.equal(store.get('daily_accounts'),raw);
});
test('failed two-sided transfer leaves both balances unchanged',()=>{
  const f=fixture(),{c,store}=f;f.connect('cash');f.connect('save');const raw=store.get('daily_accounts');
  f.fail='daily_accounts';const next=c.acctTransferBuild(c.loadAccounts(),{from:'cash',to:'save',amount:'100',posted:true,key:'',token:'pay'});
  assert.throws(()=>c.acctToolSave(next),/could not be saved/);assert.equal(store.get('daily_accounts'),raw);assert.equal(c.loadAccounts()[0].current,1000);assert.equal(c.loadAccounts()[1].current,200);
});
test('new links reject dates before the starting balance, future dates and non-cash income destinations',()=>{
  const f=fixture(),{c}=f;f.connect('cash');f.connect('card');
  for(const date of ['2026-10-19','2026-10-21','2026-02-30'])assert.throws(()=>c.acctLinkEffect(c.accounts[0],'expense',date),/Only posted/);
  assert.throws(()=>c.acctLinkEffect(c.accounts[2],'income',today),/Choose/);
});
test('unchecking a new expense keeps it budget-only and legacy edits cannot be newly linked',()=>{
  const f=fixture(),{c,nodes}=f;f.connect('cash');c.acctTxnOpen(null);nodes['txn-update-balance'].checked=false;
  assert.equal(c.acctTxnPrepare({acctId:'cash',date:today}).accountLink,undefined);
  c.acctTxnOpen({id:'legacy',date:today,amount:25,acctId:'cash'});assert.equal(nodes['txn-update-balance'].disabled,true);
  nodes['txn-update-balance'].checked=true;assert.equal(c.acctTxnPrepare({acctId:'cash',date:today}).accountLink,undefined);
});
test('stale drafts and account switches refuse saves before mutating anything',()=>{
  const f=fixture(),{c,store}=f;f.connect('cash');c.acctTxnOpen(null);const before=store.get('daily_accounts');
  c.auth.currentUser.uid='B';assert.throws(()=>c.acctTxnPrepare({acctId:'cash',date:today}),/changed/);assert.equal(store.get('daily_accounts'),before);
  c.auth.currentUser.uid='A';c.acctTxnOpen(null);store.set('daily_ledger','[{"id":"remote"}]');assert.throws(()=>c.acctTxnGuard(),/changed/);
});
test('restoring the existing three stores reconstructs balances without changing their timestamps',()=>{
  const f=fixture(),{c,store}=f;f.connect('cash');c.txnData=[f.expense('one',10.25)];c.saveTxns();c.ledgerData=[f.income('pay',80)];c.saveLedger();
  const backup=new Map(store),restored=fixture();for(const [k,v] of backup)restored.store.set(k,v);
  const writes=restored.writes;assert.equal(restored.c.loadAccounts()[0].current,1069.75);assert.equal(restored.writes,writes);
  for(const [k,v] of backup)assert.equal(restored.store.get(k),v);
});
test('changing a linked expense to another connected account reverses its old effect once',()=>{
  const f=fixture(),{c,nodes}=f;f.connect('cash');f.connect('card');c.txnData=[f.expense('one',20)];c.saveTxns();
  c.acctTxnOpen(c.txnData[0]);nodes['txn-account'].value='card';c.acctTxnChoice();
  const updated=c.acctTxnPrepare({acctId:'card',date:today,amount:30});Object.assign(c.txnData[0],updated);c.saveTxns();
  assert.equal(c.accounts[0].current,1000);assert.equal(c.accounts[2].current,730);
});
test('linked amounts reject fractions of cents, infinities and unsafe integers',()=>{
  const {c}=fixture();for(const n of [1.001,Infinity,NaN,Number.MAX_SAFE_INTEGER])assert.throws(()=>c.acctLinkAmount(n),/valid amount/);
  for(const n of [10.01,-10.01,0,25.55])assert.doesNotThrow(()=>c.acctLinkAmount(n));
});
