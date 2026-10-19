'use strict';

// A confirmed balance plus explicitly linked NEW records. No replay, migration or boot write.
// The effect lives on its source record, so an expense and its balance effect save together.
// Account storage retains the confirmed baseline; projections are never written as baselines.
let acctTxnDraft=null;
function acctLinkRound(n){return Math.round(Number(n)*100)/100;}
function acctLinkEligible(a,kind){
  return !!(a&&!a.archivedAt&&(acctTransferSource(a)||(kind!=='income'&&a.type==='debt'&&a.category==='card')));
}
function acctLinkActive(a){return !!(a?.balanceLink?.version===1&&a.balanceLink.anchor&&Number.isFinite(a.balanceLink.balance));}
function acctLinkRows(){
  const tx=lsLoad('daily_transactions',[]),ledger=lsLoad('daily_ledger',[]);
  return [...(Array.isArray(tx)?tx:[]).map(r=>({record:r,kind:'expense'})),
    ...(Array.isArray(ledger)?ledger:[]).filter(r=>r&&['income','bill_payment'].includes(r.kind)).map(r=>({record:r,kind:r.kind}))];
}
function acctLinkProject(list,rows){
  rows=rows||acctLinkRows();
  return list.map(a=>{
    if(!acctLinkActive(a))return a;
    let cents=Math.round(a.balanceLink.balance*100);const seen=new Set();
    for(const {record:r,kind} of rows){
      const link=r?.accountLink,key=kind+':'+r?.id;
      if(!r?.id||seen.has(key)||!link||link.accountId!==a.id||r.acctId!==a.id||link.anchor!==a.balanceLink.anchor||link.kind!==kind||r.date<a.balanceLink.date)continue;
      seen.add(key);const amount=Math.round(Number(r.amount)*100);
      if(!Number.isSafeInteger(amount))continue;
      cents+=kind==='income'||a.type==='debt'?amount:-amount;
    }
    return {...a,current:cents/100};
  });
}
function acctLinkStored(list){return list.map(a=>acctLinkActive(a)?{...a,current:a.balanceLink.balance}:a);}
function acctLinkAnchor(){return genAccountId()+'_'+Math.random().toString(36).slice(2,10);}
function acctLinkCheckpoint(a){
  if(acctLinkActive(a))a.balanceCheckpoints=[...(a.balanceCheckpoints||[]),{...a.balanceLink,closedAt:Date.now(),calculatedBalance:a.current}];
}
function acctLinkSnapshot(a,balance,previousBalance){
  if(typeof acctFinId==='function')a.balanceEpoch=acctFinId('balance');
  if(!acctLinkActive(a))return;
  acctLinkCheckpoint(a);
  if(previousBalance!==undefined)a.balanceCheckpoints[a.balanceCheckpoints.length-1].calculatedBalance=previousBalance;
  a.balanceLink={version:1,anchor:acctLinkAnchor(),balance,confirmedBalance:balance,date:getLocalDate(),confirmedAt:Date.now()};
}
function acctLinkAdjust(a,change){
  if(acctLinkActive(a))a.balanceLink={...a.balanceLink,balance:acctLinkRound(a.balanceLink.balance+change)};
}
function acctLinkRefresh(){
  accounts=loadAccounts();
  if(typeof S!=='undefined'&&S.view==='budget'&&typeof renderAccountsPage==='function')renderAccountsPage();
}
function acctLinkSignature(){return JSON.stringify([acctToolUid(),lsLoad('daily_accounts',[]),lsLoad('daily_transactions',[]),lsLoad('daily_ledger',[])]);}
function acctLinkCard(a){
  const on=acctLinkActive(a);
  return '<div class="acct-link-status"><span>'+(on?'Linked entries · since '+escText(fmtDate(a.balanceLink.date)):'Manual updates')+'</span>'+
    (on||acctLinkEligible(a,'expense')?'<button class="stg-btn" type="button" data-account="'+escAttr(a.id)+'" onclick="acctLinkOpen(this.dataset.account)">Balance tracking</button>':'')+'</div>';
}
function acctLinkOpen(id){
  const a=loadAccounts().find(x=>x.id===id);if(!a||(!acctLinkActive(a)&&!acctLinkEligible(a,'expense')))return;
  acctToolDraft={kind:'connection',id,signature:acctLinkSignature()};
  acctToolForm('Balance tracking','<p>Manual updates work on their own. Linked tracking is optional: new entries can update this account, and you can skip any entry already included in your balance.</p>'+
    '<div class="stg-field"><label for="acct-link-mode">How to track '+escText(a.name)+'</label><select id="acct-link-mode"><option value="manual"'+(!acctLinkActive(a)?' selected':'')+'>Manual balance updates</option><option value="linked"'+(acctLinkActive(a)?' selected':'')+'>Link new entries to this account</option></select></div>'+
    acctToolField('acct-link-balance','Confirm today’s bank balance'+(a.type==='debt'?' (amount owed)':''),'text',a.current)+
    '<p>This becomes a fresh starting balance. Existing spending, income and weekly totals stay unchanged and are not applied again. Daily does not connect to your bank. Pending transactions are excluded until you record them as posted.</p>',
    'acctLinkConfirm','Save tracking choice');
}
function acctLinkConfirm(){
  const d=acctToolDraft;if(!d||d.kind!=='connection')return false;
  try{
    if(d.signature!==acctLinkSignature())throw new Error('Financial records changed. Cancel and reopen to review the latest balance.');
    const value=document.getElementById('acct-link-balance').value.trim();
    if(!/^-?\d+(?:\.\d{1,2})?$/.test(value)||!Number.isSafeInteger(Math.round(Number(value)*100)))throw new Error('Enter a balance with at most two decimal places.');
    const list=loadAccounts(),a=list.find(x=>x.id===d.id),balance=Number(value);
    if(document.getElementById('acct-link-mode').value==='linked'&&!acctLinkEligible(a,'expense'))throw new Error('Linked entries support cash, savings and credit cards. Choose manual updates for this category.');
    if(typeof acctFinReconcileReceipt==='function')acctFinReconcileReceipt(a,balance,'Tracking choice / starting balance');
    acctLinkCheckpoint(a);a.current=balance;
    if(typeof acctFinId==='function')a.balanceEpoch=acctFinId('balance');
    a.history=[...(a.history||[]).filter(r=>r&&r.date!==getLocalDate()),{date:getLocalDate(),balance}].sort((x,y)=>x.date.localeCompare(y.date));
    if(document.getElementById('acct-link-mode').value==='linked')a.balanceLink={version:1,anchor:acctLinkAnchor(),balance,confirmedBalance:balance,date:getLocalDate(),confirmedAt:Date.now()};
    else delete a.balanceLink;
    acctToolSave(list);acctToolClose();acctToolRefresh();showToast('Balance tracking saved');return true;
  }catch(e){document.getElementById('acct-tools-error').textContent=e.message;return false;}
}
function acctLinkEffect(a,kind,date){
  if(!acctLinkActive(a)||!acctLinkEligible(a,kind))throw new Error('Choose an account with linked balance tracking, or leave balance updating off.');
  if(!budDateValid(date)||date<a.balanceLink.date||date>getLocalDate())throw new Error('Only posted entries from this account’s starting date through today can update its balance. Leave balance updating off for older entries.');
  return {accountId:a.id,anchor:a.balanceLink.anchor,kind};
}
function acctLinkAmount(amount){
  const cents=Number(amount)*100;
  if(!Number.isSafeInteger(Math.round(cents))||Math.abs(cents-Math.round(cents))>.000001)throw new Error('Use a valid amount with at most two decimal places for a linked balance.');
}
function acctTxnOpen(existing){
  acctTxnDraft={signature:acctLinkSignature(),record:existing?JSON.parse(JSON.stringify(existing)):null};
  acctTxnChoice();
}
function acctTxnChoice(){
  const box=document.getElementById('txn-update-balance'),hint=document.getElementById('txn-balance-hint');if(!box||!hint)return;
  const a=loadAccounts().find(x=>x.id===document.getElementById('txn-account').value),old=acctTxnDraft?.record;
  const settled=old&&(!old.accountLink||!loadAccounts().some(x=>x.id===old.accountLink.accountId&&x.balanceLink?.anchor===old.accountLink.anchor));
  const enabled=acctLinkActive(a)&&acctLinkEligible(a,'expense')&&!settled;
  box.disabled=!enabled;box.checked=!!enabled;
  hint.textContent=settled?'This existing entry is separate from the current starting balance. Editing it updates your budget only.':enabled?'Updates this balance when you save. Uncheck if it is already included in your bank balance.':'Budget only. You can enable linked tracking in Accounts, or keep updating balances manually.';
}
function acctTxnPrepare(f){
  if(!acctTxnDraft)return f;
  if(acctTxnDraft.signature!==acctLinkSignature())throw new Error('Financial records changed while this expense was open. Close and reopen it before saving.');
  const old=acctTxnDraft.record,box=document.getElementById('txn-update-balance'),a=loadAccounts().find(x=>x.id===f.acctId);
  const active=old?.accountLink&&loadAccounts().some(x=>x.id===old.accountLink.accountId&&x.balanceLink?.anchor===old.accountLink.anchor);
  if(old&&!active)return {...f,accountLink:old.accountLink};
  if(box?.checked)acctLinkAmount(f.amount);
  return {...f,accountLink:box?.checked?acctLinkEffect(a,'expense',f.date):undefined};
}
function acctTxnGuard(){
  if(acctTxnDraft&&acctTxnDraft.signature!==acctLinkSignature())throw new Error('Financial records changed. Close and reopen this expense.');
}
function acctIncomeFields(kind){
  const list=loadAccounts().filter(a=>acctLinkEligible(a,kind));
  return '<label>'+(kind==='income'?'Received into':'Paid from')+' (optional)<select name="account" onchange="acctIncomeChoice()"><option value="">Not recorded</option>'+list.map(a=>'<option value="'+escAttr(a.id)+'">'+escText(a.name)+'</option>').join('')+'</select></label>'+
    '<label class="bi-follow"><input name="updateBalance" type="checkbox" disabled><span>Update this account’s balance<small id="income-balance-hint">Optional. Manual balances stay available in Accounts.</small></span></label>';
}
function acctIncomeChoice(){
  const f=document.getElementById('bp-form'),a=loadAccounts().find(x=>x.id===f.elements.account.value),enabled=acctLinkActive(a);
  f.elements.updateBalance.disabled=!enabled;f.elements.updateBalance.checked=!!enabled;
  document.getElementById('income-balance-hint').textContent=enabled?'Uncheck if this payment is already included in your bank balance.':'Budget only. Enable linked tracking in Accounts if you want new entries to update this balance.';
}
function acctIncomePrepare(entry,form,signature){
  if(signature!==acctLinkSignature())throw new Error('Financial records changed. Close and reopen this payment before saving.');
  const id=form.get('account');if(id)entry.acctId=id;
  if(form.has('updateBalance')){acctLinkAmount(entry.amount);entry.accountLink=acctLinkEffect(loadAccounts().find(a=>a.id===id),entry.kind,entry.date);}
}
function acctLinkedEditCheck(entry,date,signature){
  if(signature!==acctLinkSignature())throw new Error('Financial records changed. Close and reopen this payment.');
  const a=loadAccounts().find(x=>x.id===entry.accountLink?.accountId);
  if(a&&a.balanceLink?.anchor===entry.accountLink.anchor)acctLinkEffect(a,entry.kind,date);
}
// Income is already safely saved in its source store. If the legacy weekly summary fails,
// retry ONLY that summary, never the deposit or its account effect. Nothing runs on boot.
function acctIncomeFinishWeeks(weeks){
  Object.assign(budgetData,weeks);
  try{Object.keys(weeks).forEach(w=>budSaveData(w));}catch(e){/* Check actual persistence below. */}
  const saved=lsLoad('daily_budget',{});
  const matches=Object.entries(weeks).every(([w,value])=>Object.keys(value).filter(k=>k.startsWith('inc_')).every(k=>saved[w]?.[k]===value[k]));
  if(matches)return true;
  budgetData=saved;
  const signature=acctLinkSignature(),budgetSignature=JSON.stringify(saved);
  const summary=Object.entries(weeks).map(([w,value])=>'<p>Week of '+escText(fmtDate(w))+': '+Object.entries(value).filter(([k])=>k.startsWith('inc_')).map(([k,v])=>escText(catLabel(loadIncCats().find(c=>c.id===k.slice(4))||{name:k.slice(4)}))+' '+fmtMoneyExact(Number(v)||0)).join(' · ')+'</p>').join('');
  budPeriodDialog('Income saved · finish the weekly total','<p>The income entry and its chosen balance update are saved. The weekly summary could not be saved. Retry below; do not add this payment again. If you close this window, use these totals to review Weekly history.</p>'+summary);
  document.querySelector('#bp-form button[type="submit"]').textContent='Retry weekly total';
  document.getElementById('bp-form').onsubmit=e=>{
    e.preventDefault();
    if(signature!==acctLinkSignature()||budgetSignature!==JSON.stringify(lsLoad('daily_budget',{}))){budPeriodError('Records changed. Review the saved income and Weekly history before changing this total.');return;}
    if(acctIncomeFinishWeeks(weeks)){document.getElementById('bud-period-dialog').close();budPeriodRefresh();}
  };
  return false;
}
