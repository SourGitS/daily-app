// Import and Undo use only synthetic in-memory records. No account, network or real storage.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {extract,extractConst,copy}=require('./harness.cjs');
function fixture(){
  const data=new Map(),cats={inc:[{id:'salary',name:'Salary'}],fix:[],var:[]};let failKey='',writes=0,syncs=0;
  const storage={getItem:k=>data.get(k)??null,setItem(k,v){if(k===failKey){failKey='';throw Error('quota');}data.set(k,String(v));writes++;},removeItem:k=>data.delete(k),keys:()=>[...data.keys()]};
  const catRows=kind=>JSON.parse(storage.getItem('daily_'+kind+'_cats')||JSON.stringify(cats[kind]));let id=0;
  const c=vm.createContext({console,Date,Math,Number,Map,Set,JSON,localStorage:storage,dailyFinanceViews:new Map(),today:'2026-11-18',getLocalDate:()=>c.today,
    txnData:[],ledgerData:[],budgetData:{},accounts:[],budDefaults:{},kitRecipes:[],kitShopManual:[],kitShopChecked:{},aiInboxState:{lastApply:null},
    activeCats:x=>x,loadIncCats:()=>catRows('inc'),loadFixCats:()=>catRows('fix'),loadVarCats:()=>catRows('var'),loadAccounts:()=>c.accounts,
    kitUUID:()=> 'sample-'+(++id),kitParseImport:text=>({recipes:[JSON.parse(text)]}),
    aiResolveNamedAccount:id=>({ok:true,rec:c.accounts.find(a=>a.id===id)}),aiActFmtFullDate:String,ledgerNormaliseSource:x=>x,
    ledgerReimbursedTotal:id=>c.ledgerData.filter(r=>r.expenseId===id).reduce((sum,r)=>sum+r.amount,0),txnIsEssential:r=>!!r.essential,
    catLabel:x=>x.name,aiResolveRef:(list,id,name)=>({ok:true,rec:list.find(x=>x.id===id||x.name===name)}),aiResolveAccount:()=>({ok:true,rec:null}),
    aiActSource:()=>({key:'',src:null}),txnWeekOf:()=> '2026-11-16',aiActFmtDate:String,fmtMoneyExact:n=>'$'+n,
    aiDupWarning:()=>'',aiNearDupLedger:()=>[],incomePayCycle:()=> 'fortnightly',localMidnight:s=>new Date(s+'T00:00:00'),aiLedgerDup:id=>r=>r.aiActionId===id,
    ledgerOf:kind=>c.ledgerData.filter(r=>r.kind===kind),aiInboxRefreshViews:()=>{},refreshCatBudgetUI:()=>{},setSyncStatus:()=>{},
    getVarGoalDefault:()=>c.budDefaults.varGoal,aiGoalActionIds:()=>c.budDefaults.aiAppliedGoalActions||[],aiArchiveActionRecords:()=>[],
    kitShopRemoveCheckedKeyEverywhere:()=>{},kitShopItemKey:x=>x});
  const persist=(key,value)=>{storage.setItem(key,JSON.stringify(value));c.dailyAtomicDefer(key,()=>syncs++);return true;};
  Object.assign(c,{saveTxns:()=>persist('daily_transactions',c.txnData),saveLedger:()=>persist('daily_ledger',c.ledgerData),
    budSaveData:()=>persist('daily_budget',c.budgetData),saveAccounts:list=>{c.accounts=list;return persist('daily_accounts',list);},
    budPersistDefaults:()=>persist('daily_budget_defaults',c.budDefaults),kitSaveRecipes:()=>persist('daily_kit_recipes',c.kitRecipes),
    kitShopSaveManual:()=>persist('daily_kit_shop_manual',c.kitShopManual),kitShopSaveChecked:()=>persist('daily_kit_shop_checked',c.kitShopChecked),
    BUD_CAT_LOAD:Object.fromEntries(['inc','fix','var'].map(k=>[k,()=>catRows(k)])),
    BUD_CAT_SAVE:Object.fromEntries(['inc','fix','var'].map(k=>[k,list=>persist('daily_'+k+'_cats',list)]))});
  const sync=fs.readFileSync('js/sync-integrity.js','utf8');
  vm.runInContext('let dailyAtomicState=null;\n'+['dailyAtomicDefer','dailyAtomicLocalChange'].map(name=>sync.match(new RegExp('function '+name+'\\([^]*?\\n\\}'))[0]).join('\n'),c);
  vm.runInContext(['AI_ACT_MAXSTR','AI_INCOME_MODES','AI_INCOME_TYPES','AI_BALANCE_KINDS','CAT_CYCLES','CAT_STATUSES','KITSHOP_CAT_ORDER'].map(extractConst).join('\n')+'\n'+[
    'aiActStr','aiActMoney','aiActValidDate','aiActTooLong','aiValIncome','aiValBalanceSnapshot','aiValUpdateExpense','aiValSubscription','aiValIncomeStream','aiValExpenseCategory','aiValRecipe','aiValShoppingItem','genCatId','cyclePerWeek','catWeeklyFromAmount','aiActionReview','aiUndoCopy','aiActionMemory','aiActionMemoryRestore','aiUndoGuardCapture','aiUndoGuardSafe','applyDailyActions','aiUndoLastApply','aiUndoLastApplyChanges'
  ].map(extract).join('\n'),c);
  c.aiLedgerWrite=(row,meta)=>{const record={...row,id:'ledger-'+meta.aiActionId,aiActionId:meta.aiActionId};c.ledgerData.push(record);c.saveLedger();return record;};
  c.validateDailyAction=action=>({add_income:c.aiValIncome,add_balance_snapshot:c.aiValBalanceSnapshot,update_expense:c.aiValUpdateExpense,add_subscription:c.aiValSubscription,add_income_stream:c.aiValIncomeStream,add_expense_category:c.aiValExpenseCategory,add_recipe:c.aiValRecipe,add_shopping_item:c.aiValShoppingItem})[action.type](action.data,action.id);
  const action=(id='pay',mode='replace',amount=100)=>({id,type:'add_income',data:{amount,date:c.today,streamId:'salary',incomeType:'salary',weekMode:mode}});
  const preview=a=>{const result=c.validateDailyAction(a);return {...result,id:a.id,type:a.type,action:a,state:'new',review:c.aiActionReview(result)};};
  const remember=items=>{items.forEach(item=>item.guard=c.aiUndoGuardCapture(item));c.aiInboxState.lastApply={ids:items.map(x=>x.id),items};};
  const baseline=()=>{for(const [key,value]of [['daily_transactions',c.txnData],['daily_ledger',c.ledgerData],['daily_budget',c.budgetData],['daily_accounts',c.accounts]])storage.setItem(key,JSON.stringify(value));};
  return {c,cats,data,action,preview,remember,baseline,get writes(){return writes;},get syncs(){return syncs;},failAt:key=>failKey=key};
}
test('a changed income preview rejects the entire selected batch until explicitly reviewed again',()=>{
  const f=fixture(),a=f.action(),rows=[f.preview(a),f.preview(f.action('other','add',20))];
  f.c.budgetData['2026-11-16']={inc_salary:'500'};const before=f.writes;
  const stale=f.c.applyDailyActions(rows,'test');assert.equal(stale.applied.length,0);assert.equal(stale.failed.length,2);
  assert.match(rows[0].error,/changed since this preview/);assert.equal(f.writes,before);assert.equal(f.c.ledgerData.length,0);
  const reviewed=f.c.applyDailyActions([f.preview(a)],'test');assert.equal(reviewed.applied.length,1);assert.equal(f.c.budgetData['2026-11-16'].inc_salary,'100');
});
test('future income is rejected while today and earlier received dates remain valid',()=>{
  const f=fixture(),a=f.action();a.data.date='2026-11-19';assert.equal(f.c.validateDailyAction(a).ok,false);
  assert.match(f.c.validateDailyAction(a).error,/already have arrived/);
  for(const date of ['2026-11-18','2026-11-17']){a.data.date=date;assert.equal(f.c.validateDailyAction(a).ok,true);}
  assert.equal(f.writes,0);
});
test('setup actions fail honestly on quota and safely retry once without a duplicate category',()=>{
  for(const [type,kind,data]of [['add_subscription','fix',{name:'Subscription',amount:10,cycle:'monthly'}],['add_income_stream','inc',{name:'Side income'}],['add_expense_category','var',{name:'Travel'}]]){
    const f=fixture(),a={id:'setup-'+kind,type,data},before=copy([...f.data]),row=f.preview(a);f.failAt('daily_'+kind+'_cats');
    const failed=f.c.applyDailyActions([row],'test');assert.equal(failed.applied.length,0,type);assert.equal(failed.failed.length,1);assert.match(row.error,/quota/);
    assert.deepEqual([...f.data],before);assert.equal(f.c.BUD_CAT_LOAD[kind]().some(r=>r.aiActionId===a.id),false);assert.equal(f.syncs,0);
    const retried=f.c.applyDailyActions([f.preview(a)],'test');assert.equal(retried.applied.length,1);assert.equal(f.c.BUD_CAT_LOAD[kind]().filter(r=>r.aiActionId===a.id).length,1);
    assert.equal(f.c.applyDailyActions([f.preview(a)],'test').applied.length,0,'same action remains idempotent');
  }
});
test('setup apply handlers refuse an explicit failed writer even when used directly',()=>{
  for(const [type,kind,data]of [['add_subscription','fix',{name:'Subscription',amount:10,cycle:'monthly'}],['add_income_stream','inc',{name:'Side income'}],['add_expense_category','var',{name:'Travel'}]]){
    const f=fixture(),result=f.c.validateDailyAction({id:'direct-'+kind,type,data});f.c.BUD_CAT_SAVE[kind]=()=>false;
    assert.throws(()=>result.apply({aiActionId:'direct-'+kind}),/could not be saved/);assert.equal(f.data.size,0);
  }
});
test('a normal setup batch commits each distinct row and remains undoable as one batch',()=>{
  const f=fixture(),actions=Array.from({length:20},(_,index)=>({id:'bulk-'+index,type:'add_expense_category',data:{name:'Category '+index}}));
  const applied=f.c.applyDailyActions(actions.map(f.preview),'test');assert.equal(applied.failed.length,0);assert.equal(applied.applied.length,20);
  assert.equal(new Set(f.c.loadVarCats().map(r=>r.id)).size,20);f.remember(applied.applied);
  const undo=f.c.aiUndoLastApply();assert.equal(undo.protected,0);assert.equal(undo.removed,20);assert.equal(f.c.loadVarCats().length,0);
});
test('failed recipe or shopping persistence restores memory before retrying the same action',()=>{
  for(const [type,key,data,list]of [['add_recipe','daily_kit_recipes',{name:'Sample',category:'dinner',servings:1,ingredients:[{name:'Rice',amount:1,unit:'cup'}],steps:['Cook']},'kitRecipes'],['add_shopping_item','daily_kit_shop_manual',{name:'Rice',category:'Other'},'kitShopManual']]){
    const f=fixture(),a={id:'food-save',type,data};f.failAt(key);const failed=f.c.applyDailyActions([f.preview(a)],'test');
    assert.equal(failed.applied.length,0);assert.equal(failed.failed.length,1);assert.equal(f.c[list].length,0);assert.equal(f.data.size,0);assert.equal(f.syncs,0);
    assert.equal(f.c.applyDailyActions([f.preview(a)],'test').applied.length,1);assert.equal(f.c[list].length,1);assert.equal(JSON.parse(f.data.get(key)).length,1);
  }
});
test('a failed income action rolls back ledger and weekly total while earlier batch rows remain saved',()=>{
  const f=fixture();f.c.budgetData['2026-11-16']={inc_salary:'500'};f.baseline();
  const first=f.action('earlier','record_only',20),second=f.action('failed','add',100);f.failAt('daily_budget');
  const result=f.c.applyDailyActions([f.preview(first),f.preview(second)],'test');
  assert.equal(result.applied.length,1);assert.equal(result.failed.length,1);assert.equal(f.c.budgetData['2026-11-16'].inc_salary,'500');
  assert.deepEqual(f.c.ledgerData.map(r=>r.aiActionId),['earlier']);assert.deepEqual(JSON.parse(f.data.get('daily_ledger')).map(r=>r.aiActionId),['earlier']);assert.equal(JSON.parse(f.data.get('daily_budget'))['2026-11-16'].inc_salary,'500');
  assert.equal(f.syncs,1,'the failed action starts no uploads');
  const retry=f.c.applyDailyActions([f.preview(first),f.preview(second)],'test');assert.equal(retry.applied.length,1);assert.equal(f.c.ledgerData.length,2);assert.equal(f.c.budgetData['2026-11-16'].inc_salary,'600');
});
test('Undo preserves a later manual income edit and its supporting deposit',()=>{
  const f=fixture();f.c.budgetData['2026-11-16']={inc_salary:'500'};
  const result=f.c.applyDailyActions([f.preview(f.action())],'test');f.remember(result.applied);
  f.c.budgetData['2026-11-16'].inc_salary='900';const before=f.writes,undo=f.c.aiUndoLastApply();
  assert.equal(undo.protected,1);assert.equal(undo.changed,0);assert.equal(f.writes,before);
  assert.equal(f.c.budgetData['2026-11-16'].inc_salary,'900');assert.equal(f.c.ledgerData.length,1);
});
test('Undo reverses two untouched deposits into one week in reverse order',()=>{
  const f=fixture();f.c.budgetData['2026-11-16']={inc_salary:'500'};
  const result=f.c.applyDailyActions([f.preview(f.action('one','add',100)),f.preview(f.action('two','add',200))],'test');f.remember(result.applied);
  assert.equal(f.c.budgetData['2026-11-16'].inc_salary,'800');const undo=f.c.aiUndoLastApply();
  assert.equal(undo.protected,0);assert.equal(undo.restored,2);assert.equal(f.c.budgetData['2026-11-16'].inc_salary,'500');assert.equal(f.c.ledgerData.length,0);
});
test('Undo protects an edited expense and a purchase referenced by a later reimbursement',()=>{
  for(const later of ['edit','reimbursement']){
    const f=fixture();f.c.txnData=[{id:'expense',aiActionId:'purchase',amount:20,date:f.c.today}];
    f.remember([{id:'purchase',type:'add_expense'}]);
    if(later==='edit')f.c.txnData[0].amount=30;else f.c.ledgerData=[{id:'refund',kind:'reimbursement',expenseId:'expense',amount:5}];
    const undo=f.c.aiUndoLastApply();assert.equal(undo.protected,1);assert.equal(f.c.txnData.length,1);assert.equal(f.writes,0);
  }
});
test('a protected dependent action also protects its imported parent purchase',()=>{
  const f=fixture();f.c.txnData=[{id:'expense',aiActionId:'purchase',amount:20}];f.c.ledgerData=[{id:'refund',aiActionId:'refund-action',expenseId:'expense',amount:5}];
  f.remember([{id:'purchase',type:'add_expense'},{id:'refund-action',type:'add_reimbursement'}]);f.c.ledgerData[0].amount=6;
  const undo=f.c.aiUndoLastApply();assert.equal(undo.protected,2);assert.equal(f.c.txnData.length,1);assert.equal(f.c.ledgerData.length,1);
});
test('balance snapshots and created categories survive later account edits and budget allocations',()=>{
  const f=fixture();f.c.accounts=[{id:'cash',current:100,history:[]}];f.cats.fix=[{id:'bill',name:'Bill',aiActionId:'new-bill'}];
  f.c.budCyclesLoad=()=>({periods:{p:{reserves:{bill:40}}}});
  f.remember([{id:'snapshot',type:'add_balance_snapshot',undo:{balance:true,accountId:'cash',date:f.c.today,prevCurrent:0}},{id:'new-bill',type:'add_subscription'}]);
  f.c.accounts[0].current=150;const undo=f.c.aiUndoLastApply();assert.equal(undo.protected,2);assert.equal(f.c.accounts[0].current,150);assert.equal(f.cats.fix.length,1);
});
test('untouched balance snapshot Undo restores every original history field and ordering',()=>{
  const f=fixture(),original=[{id:'cash',name:'Cash',current:75,history:[{date:'2026-11-18',balance:75,kind:'closing',note:'Bank reading',custom:{keep:true}},{date:'2026-11-01',balance:50,kind:'opening'}]}];
  f.c.accounts=copy(original);const a={id:'snapshot',type:'add_balance_snapshot',data:{accountId:'cash',date:f.c.today,balance:100,balanceKind:'current'}};
  const applied=f.c.applyDailyActions([f.preview(a)],'test');assert.equal(applied.applied.length,1);f.remember(applied.applied);
  const result=f.c.aiUndoLastApply();assert.equal(result.protected,0);assert.equal(result.restored,1);assert.deepEqual(copy(f.c.accounts),original);assert.equal(f.c.ledgerData.length,0);
});
test('expense correction Undo protects later changes and reverses an untouched correction chain',()=>{
  const original={id:'purchase',date:'2026-11-18',amount:20,merchant:'Lunch',note:'Keep me'};
  for(const later of [false,true]){
    const f=fixture();f.c.txnData=[copy(original)];
    const action=(id,amount)=>({id,type:'update_expense',data:{expenseId:'purchase',setAmount:amount,reason:'Bank correction'}});
    const result=f.c.applyDailyActions([f.preview(action('first',30)),f.preview(action('second',40))],'test');assert.equal(result.applied.length,2);f.remember(result.applied);
    if(later)f.c.txnData[0].note='Later manual note';
    const undo=f.c.aiUndoLastApply();
    if(later){assert.equal(undo.protected,2);assert.equal(f.c.txnData[0].amount,40);assert.equal(f.c.txnData[0].note,'Later manual note');}
    else{assert.equal(undo.restored,2);assert.deepEqual(copy(f.c.txnData),[original]);}
  }
});
test('Undo removes safe unrelated actions while retaining a protected action',()=>{
  const f=fixture();f.c.txnData=[{id:'safe',amount:20,aiActionId:'safe'},{id:'keep',amount:30,aiActionId:'keep'}];
  f.remember([{id:'safe',type:'add_expense'},{id:'keep',type:'add_expense'}]);f.c.txnData[1].note='Later edit';
  const undo=f.c.aiUndoLastApply();assert.equal(undo.protected,1);assert.equal(undo.removed,1);assert.equal(f.c.txnData.length,1);assert.equal(f.c.txnData[0].id,'keep');
});
test('Undo local commit failure restores all records and suppresses every cloud effect',()=>{
  const f=fixture();f.c.txnData=[{id:'expense',aiActionId:'purchase',amount:20}];f.c.ledgerData=[{id:'refund',aiActionId:'refund-action',expenseId:'expense',amount:5}];
  f.remember([{id:'purchase',type:'add_expense'},{id:'refund-action',type:'add_reimbursement'}]);f.baseline();
  const before=copy([...f.data]),last=copy(f.c.aiInboxState.lastApply);f.failAt('daily_ledger');
  const undo=f.c.aiUndoLastApply();assert.equal(undo.failed,true);assert.equal(undo.changed,0);
  assert.deepEqual([...f.data],before);assert.equal(f.c.txnData.length,1);assert.equal(f.c.ledgerData.length,1);assert.deepEqual(copy(f.c.aiInboxState.lastApply),last);assert.equal(f.syncs,0);
  const retry=f.c.aiUndoLastApply();assert.equal(retry.failed,undefined);assert.equal(retry.removed,2);assert.equal(f.c.txnData.length,0);assert.equal(f.c.ledgerData.length,0);assert.equal(f.syncs,2);
});
