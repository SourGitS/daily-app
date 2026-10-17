const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {extract,copy}=require('./harness.cjs');
const card=()=>({id:'card',name:'Synthetic card',type:'debt',category:'card',tracksStatement:true,current:650.35,statementBalance:400.25,dueDate:'2026-10-16',limit:2000,custom:'keep',history:[{date:'2026-10-01',balance:700},{date:'2026-10-17',balance:650.35}]});
function fixture(record=card()){
  const store=new Map([['daily_accounts',JSON.stringify([record,{id:'cash',type:'asset',current:2000,history:[]}])],['daily_budget','untouched budget'],['daily_ledger','untouched ledger']]);
  const nodes={};let writes=0,refreshes=0,failed=false;
  for(const id of ['acct-statement-dialog','acct-statement-summary','acct-statement-remaining','acct-statement-error','acct-statement-cancel'])nodes[id]={value:'',textContent:'',style:{},open:false,showModal(){this.open=true;},close(){this.open=false;},focus(){}};
  const c=vm.createContext({accounts:JSON.parse(store.get('daily_accounts')),console,Date,Number,JSON,Array,Math,
    _bootPhase:false,_syncApplying:0,S:{view:'budget'},auth:{currentUser:{uid:'A'}},
    localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>{if(failed)throw new Error('simulated quota');store.set(k,v);},removeItem:k=>store.delete(k)},
    document:{getElementById:id=>nodes[id]||null},getLocalDate:()=> '2026-10-17',fmtMoneyExact:n=>'$'+n,
    showToast:m=>c.toast=m,syncBlobPush:(path,key)=>{writes++;assert.equal(path,'accounts');assert.equal(key,'daily_accounts');},
    renderBudgetOverview:()=>refreshes++,renderAccountsPage:()=>refreshes++,renderBudgetTab:()=>refreshes++});
  vm.runInContext('let acctSettlementDraft=null;\n'+['lsLoad','stampFor','lsSave','loadAccounts','saveAccounts','accountMarkPaid','accountCancelStatement','accountConfirmStatement','accountSetStatementField','acctDueDays','acctDueText','accountsDebtsTotal','accountsAssetsTotal','accountsNetWorth','acctUtilisation'].map(extract).join('\n'),c);
  return {c,nodes,store,get writes(){return writes;},get refreshes(){return refreshes;},set failed(v){failed=v;}};
}
test('opening and cancelling settlement write nothing and preserve all saved balances',()=>{
  const f=fixture(),before=[...f.store];f.c.accountMarkPaid('card');assert.equal(f.nodes['acct-statement-remaining'].value,'250.10');
  assert.equal(f.nodes['acct-statement-dialog'].open,true);assert.equal(f.writes,0);
  f.c.accountCancelStatement();assert.equal(f.nodes['acct-statement-dialog'].open,false);assert.deepEqual([...f.store],before);
});
test('confirmed settlement changes the debt totals and utilisation, preserves history and unrelated financial data',()=>{
  const f=fixture(),cash=copy(f.c.accounts[1]);f.c.accountMarkPaid('card');
  assert.equal(f.c.accountConfirmStatement(),true);
  const a=JSON.parse(f.store.get('daily_accounts'))[0];assert.equal(a.current,250.1);assert.equal(a.statementBalance,0);assert.equal(a.dueDate,'');
  assert.equal(a.custom,'keep');assert.equal(a.limit,2000);assert.deepEqual(copy(f.c.accounts[1]),cash);
  assert.deepEqual(a.history,[{date:'2026-10-01',balance:700},{date:'2026-10-17',balance:250.1}]);
  assert.equal(a.statementSettlements[0].previousBalance,650.35);assert.equal(a.statementSettlements[0].statementBalance,400.25);assert.equal(a.statementSettlements[0].dueDate,'2026-10-16');
  assert.equal(f.c.accountsDebtsTotal(),250.1);assert.equal(f.c.accountsNetWorth(),1749.9);assert.equal(f.c.acctUtilisation(a),250.1/2000*100);
  assert.equal(f.store.get('daily_budget'),'untouched budget');assert.equal(f.store.get('daily_ledger'),'untouched ledger');assert.equal(f.writes,1);assert.ok(f.refreshes>=3);
});
test('repeated confirmation cannot apply the payment twice',()=>{
  const f=fixture();f.c.accountMarkPaid('card');f.c.accountConfirmStatement();assert.equal(f.c.accountConfirmStatement(),false);assert.equal(f.writes,1);
  f.c.accountMarkPaid('card');assert.equal(f.nodes['acct-statement-dialog'].open,false);assert.equal(f.c.accounts[0].current,250.1);
});
test('a user who already updated their balance can confirm that balance without another deduction',()=>{
  const f=fixture({...card(),current:250.1});f.c.accountMarkPaid('card');assert.equal(f.nodes['acct-statement-remaining'].value,'');
  f.nodes['acct-statement-remaining'].value='250.10';assert.equal(f.c.accountConfirmStatement(),true);assert.equal(f.c.accounts[0].current,250.1);
});
test('full repayment updates to zero without deleting the account, limit or older history',()=>{
  const f=fixture({...card(),current:400.25});f.c.accountMarkPaid('card');assert.equal(f.nodes['acct-statement-remaining'].value,'0.00');
  f.c.accountConfirmStatement();assert.equal(f.c.accounts[0].current,0);assert.equal(f.c.accounts[0].limit,2000);assert.equal(f.c.accounts.length,2);
});
test('invalid, negative, missing, non-finite and over-precision balances never save',()=>{
  for(const value of ['', '-1','1.001','Infinity','12x','999999999999999999999999']){
    const f=fixture();f.c.accountMarkPaid('card');f.nodes['acct-statement-remaining'].value=value;assert.equal(f.c.accountConfirmStatement(),false,value);assert.equal(f.writes,0);assert.equal(f.c.accounts[0].current,650.35);
  }
});
test('changed or deleted accounts and newer local data cannot be overwritten by an open draft',()=>{
  for(const change of ['memory','storage','delete']){
    const f=fixture();f.c.accountMarkPaid('card');
    if(change==='memory')f.c.accounts[0].current=99;
    if(change==='delete')f.c.accounts=[];
    if(change==='storage'){const list=JSON.parse(f.store.get('daily_accounts'));list[0].current=99;f.store.set('daily_accounts',JSON.stringify(list));}
    assert.equal(f.c.accountConfirmStatement(),false);assert.equal(f.writes,0);assert.match(f.nodes['acct-statement-error'].textContent,/changed/);
  }
});
test('storage failure keeps the dialog open and does not claim payment success',()=>{
  const f=fixture(),before=f.store.get('daily_accounts');f.c.accountMarkPaid('card');f.failed=true;
  assert.equal(f.c.accountConfirmStatement(),false);assert.equal(f.store.get('daily_accounts'),before);assert.equal(f.c.accounts[0].current,650.35);assert.equal(f.nodes['acct-statement-dialog'].open,true);assert.equal(f.writes,0);
});
test('settlement retains newer saved changes to other accounts and rejects an auth-account switch',()=>{
  const f=fixture();f.c.accountMarkPaid('card');const list=JSON.parse(f.store.get('daily_accounts'));list[1].current=3000;f.store.set('daily_accounts',JSON.stringify(list));
  assert.equal(f.c.accountConfirmStatement(),true);assert.equal(f.c.accounts[1].current,3000);
  const switched=fixture();switched.c.accountMarkPaid('card');switched.c.auth.currentUser={uid:'B'};
  assert.equal(switched.c.accountConfirmStatement(),false);assert.equal(switched.writes,0);
});
test('repayment dates are calendar dates; invalid days are rejected instead of rolling into another month',()=>{
  const f=fixture();assert.equal(f.c.acctDueText({dueDate:'2026-10-17'}),'Due today');assert.equal(f.c.acctDueText({dueDate:'2026-10-18'}),'Due tomorrow');
  assert.equal(f.c.acctDueDays({dueDate:'2026-10-16'}),-1);assert.equal(f.c.acctDueDays({dueDate:'2026-10-17T00:00:00Z'}),0);
  for(const dueDate of ['2026-02-30','2026-13-01','garbage']){assert.equal(f.c.acctDueDays({dueDate}),null);assert.equal(f.c.acctDueText({dueDate}),'');}
});
test('bad statement field edits write nothing; a valid edit preserves the payment button and unrelated fields',()=>{
  const f=fixture();f.c.accountSetStatementField('card','dueDate','2026-02-30');f.c.accountSetStatementField('card','statementBalance','-10');f.c.accountSetStatementField('card','unknown','value');assert.equal(f.writes,0);
  f.c.renderAccountsPage=()=>{throw new Error('payment button must not be rebuilt on blur');};
  f.c.accountSetStatementField('card','statementBalance','300.50');assert.equal(f.c.accounts[0].statementBalance,300.5);assert.equal(f.c.accounts[0].current,650.35);assert.equal(f.writes,1);
});
test('statement edits also reject stale data and do not replace newer unrelated account balances',()=>{
  const f=fixture(),saved=JSON.parse(f.store.get('daily_accounts'));saved[1].current=3000;f.store.set('daily_accounts',JSON.stringify(saved));
  f.c.accountSetStatementField('card','dueDate','2026-10-20');assert.equal(f.c.accounts[1].current,3000);
  const newer=JSON.parse(f.store.get('daily_accounts'));newer[0].statementBalance=200;f.store.set('daily_accounts',JSON.stringify(newer));
  f.c.accountSetStatementField('card','statementBalance','123');assert.equal(JSON.parse(f.store.get('daily_accounts'))[0].statementBalance,200);assert.equal(f.writes,1);
});
test('zero statements never create overdue warnings, due banners or scheduled card payments',()=>{
  const f=fixture({...card(),statementBalance:0});
  Object.assign(f.c,{localMidnight:s=>new Date(s+'T00:00:00'),weekKey:d=>d.toISOString().slice(0,10),dateStr:d=>d.toISOString().slice(0,10),loadFixCats:()=>[],billIsScheduled:()=>true,billsUndatedCount:()=>0,getWeekVarGoal:()=>null});
  f.nodes['bud-due-banner']={innerHTML:'old banner'};
  vm.runInContext(['renderDueBanner','billOccurrences','budOvAttention'].map(extract).join('\n'),f.c);
  f.c.renderDueBanner(new Date('2026-10-12T00:00:00'));assert.equal(f.nodes['bud-due-banner'].innerHTML,'');
  assert.equal(f.c.billOccurrences(new Date('2026-10-01T00:00:00'),new Date('2026-10-30T00:00:00')).length,0);
  assert.equal(f.c.budOvAttention({income:100,available:100,spent:0,week:{}},null).length,0);
});
