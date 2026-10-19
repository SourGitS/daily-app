'use strict';

// Records live with their account so both sides of a balance update persist together.
// Opening a screen or saving a budget draft never creates a financial movement.
let acctToolDraft=null;
function acctMoney(value,optional){
  const text=String(value??'').trim();
  if(optional&&text==='')return null;
  if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw new Error('Use an amount of 0 or more with at most two decimal places.');
  const cents=Math.round(Number(text)*100);
  if(!Number.isSafeInteger(cents))throw new Error('That amount is too large.');
  return cents/100;
}
function acctToolUid(){return typeof auth!=='undefined'&&auth?auth.currentUser?.uid||null:null;}
function acctToolMount(){
  let dialog=document.getElementById('acct-tools-dialog');
  if(!dialog){
    dialog=document.createElement('dialog');dialog.id='acct-tools-dialog';dialog.className='acct-statement-dialog acct-tools-dialog';
    dialog.setAttribute('aria-labelledby','acct-tools-title');
    dialog.addEventListener('cancel',e=>{e.preventDefault();acctToolClose();});document.body.appendChild(dialog);
  }
  return dialog;
}
function acctToolClose(){acctToolDraft=null;document.getElementById('acct-tools-dialog')?.close();}
function acctToolField(id,label,type,value){
  return '<div class="stg-field"><label for="'+id+'">'+label+'</label><input id="'+id+'" type="'+type+'" '+(type==='text'?'inputmode="decimal" ':'')+'value="'+escAttr(value??'')+'"></div>';
}
function acctToolForm(title,body,action,label){
  const dialog=acctToolMount();
  dialog.innerHTML='<h2 id="acct-tools-title">'+title+'</h2><form onsubmit="event.preventDefault();'+action+'()">'+body+
    '<p id="acct-tools-error" role="alert"></p><div class="stg-actions"><button id="acct-tools-cancel" class="stg-btn" type="button" onclick="acctToolClose()">Cancel</button><button class="stg-btn primary" type="submit">'+label+'</button></div></form>';
  dialog.showModal();document.getElementById('acct-tools-cancel').focus();
}
function acctToolSave(next){
  const before=accounts;saveAccounts(next);
  if(JSON.stringify(loadAccounts())!==JSON.stringify(next)){accounts=before;throw new Error('The change could not be saved on this device. Please try again.');}
}
function acctToolRefresh(){
  renderAccountsPage();if(typeof renderBudgetTab==='function')renderBudgetTab();
  if(S.view==='home')renderHome();
  if(S.view==='stats')refreshStatsForData(['overview','review','finance']);
}
function acctCurrentStatement(a){
  const record={...(a.statementDetails||{}),statementBalance:Number(a.statementBalance)||0,dueDate:a.dueDate||''};
  if(typeof acctFinStatementId==='function')record.id=acctFinStatementId(a,record);
  return record;
}
function acctStatementRows(a){
  const rows=(Array.isArray(a.statementHistory)?a.statementHistory:[]).map(r=>({...r}));
  (Array.isArray(a.statementSettlements)?a.statementSettlements:[]).forEach(r=>rows.push({...r.details,...r,status:'settled'}));
  return rows.sort((a,b)=>String(b.statementDate||b.dueDate||b.date||'').localeCompare(String(a.statementDate||a.dueDate||a.date||'')));
}
function acctRecordsHtml(a){
  if(typeof acctFinRecordsHtml==='function')return acctFinRecordsHtml(a);
  const rows=acctStatementRows(a),moves=Array.isArray(a.balanceMovements)?a.balanceMovements:[];
  const field=(r,key,label)=>r[key]===undefined||r[key]===null?'':label+' '+fmtMoneyExact(r[key])+' · ';
  let html='';
  if(a.statementDetails&&(a.statementBalance||a.dueDate))html+='<div class="acct-category-label">'+
    (a.statementDetails.statementDate?'Statement '+escText(fmtDate(a.statementDetails.statementDate))+' · ':'')+
    field(a.statementDetails,'minimum','Minimum')+field(a.statementDetails,'interest','Interest')+field(a.statementDetails,'fees','Fees')+'</div>';
  if(a.type==='debt')html+='<div class="acct-record-actions"><button type="button" class="stg-btn" data-account="'+escAttr(a.id)+'" onclick="acctStatementOpen(this.dataset.account)">Add statement</button></div>';
  if(a.type==='debt'||rows.length)html+='<details class="acct-records"><summary>Previous statements ('+rows.length+')</summary>'+
    (rows.length?rows.map(r=>'<div class="acct-record"><strong>'+fmtMoneyExact(r.statementBalance||0)+'</strong><span>'+escText(r.statementDate?'Statement '+fmtDate(r.statementDate):r.dueDate?'Due '+fmtDate(r.dueDate):'Date not recorded')+'</span><small>'+
      (r.status==='settled'?'Marked paid '+escText(fmtDate(r.date))+' · remaining debt '+fmtMoneyExact(r.confirmedBalance):r.status==='replaced'?'Replaced by a newer statement · payment not confirmed':r.status==='paid'?'Recorded as paid':'Payment not confirmed')+'</small><small>'+
      field(r,'minimum','Minimum')+field(r,'interest','Interest')+field(r,'fees','Fees')+(r.dueDate?'Due '+escText(fmtDate(r.dueDate)):'')+'</small></div>').join(''):
      '<p>No previous statements recorded. You can add an older statement from your bank. Statements cleared by older versions cannot be reconstructed.</p>')+'</details>';
  if(moves.length)html+='<details class="acct-records"><summary>Recorded transfers ('+moves.length+')</summary>'+moves.slice().reverse().map(r=>'<div class="acct-record"><strong>'+fmtMoneyExact(r.amount)+'</strong><span>'+escText(r.fromAcctId===a.id?'To '+r.toName:'From '+r.fromName)+'</span><small>'+escText(fmtDate(r.date))+' · balances updated together'+(r.budgetKey?' · budget savings confirmed':'')+'</small></div>').join('')+'</details>';
  return html;
}
function acctStatementOpen(id){
  const a=accounts.find(x=>x&&x.id===id);if(!a||a.type!=='debt')return;
  acctToolDraft={kind:'statement',id,snapshot:JSON.stringify(a),uid:acctToolUid()};
  acctToolForm('Add a statement','<p>Keep the bank’s statement figures here. This does not change the account balance or add spending. A new current statement keeps the previous one in history.</p>'+
    acctToolField('acct-new-statement-date','Statement date','date','')+acctToolField('acct-new-statement-due','Repayment due date','date','')+
    acctToolField('acct-new-statement-balance','Closing statement balance','text','')+
    '<div class="acct-tools-grid">'+acctToolField('acct-new-statement-min','Minimum payment (optional)','text','')+acctToolField('acct-new-statement-interest','Interest charged (optional)','text','')+acctToolField('acct-new-statement-fees','Fees charged (optional)','text','')+'</div>'+
    (typeof acctFinStatementExtra==='function'?'<details><summary>Additional figures from the statement</summary>'+acctToolField('acct-new-statement-opening','Opening balance (optional)','text','')+acctToolField('acct-new-statement-purchases','Purchases (optional)','text','')+acctToolField('acct-new-statement-payments','Printed repayments total (optional)','text','')+acctToolField('acct-new-statement-credits','Other credits / refunds (optional)','text','')+acctToolField('acct-new-statement-start','Period start (optional)','date','')+'<div class="stg-field"><label for="acct-new-statement-source">Source / filename (optional)</label><input id="acct-new-statement-source" maxlength="160"></div><p>These are statement reference figures. They do not create spending or payments.</p></details>':'')+
    '<div class="stg-field"><label for="acct-new-statement-status">Save as</label><select id="acct-new-statement-status"><option value="current">Current statement</option><option value="historical">Previous statement — payment not confirmed</option><option value="paid">Previous statement — already paid</option></select></div>',
    'acctStatementConfirm','Save statement');
}
function acctStatementBuild(a,input){
  if(!budDateValid(input.statementDate)||!budDateValid(input.dueDate)||input.dueDate<input.statementDate||input.statementDate>getLocalDate())throw new Error('Choose valid statement and due dates. The statement date cannot be in the future.');
  if(!['current','historical','paid'].includes(input.status))throw new Error('Choose how to save this statement.');
  const record={statementDate:input.statementDate,dueDate:input.dueDate,statementBalance:acctMoney(input.balance),minimum:acctMoney(input.minimum,true),interest:acctMoney(input.interest,true),fees:acctMoney(input.fees,true),status:input.status,recordedAt:Date.now()};
  if(typeof acctFinStatementId==='function')record.id=acctFinStatementId(a,record);
  if(typeof acctFinStatementExtra==='function')acctFinStatementExtra(record,input);
  if(record.minimum!==null&&record.minimum>record.statementBalance)throw new Error('The minimum payment cannot exceed the statement balance.');
  const current=acctCurrentStatement(a);
  if([...acctStatementRows(a),...(a.statementBalance||a.dueDate?[current]:[])].some(r=>r.statementDate===record.statementDate||(!r.statementDate&&r.dueDate===record.dueDate&&r.statementBalance===record.statementBalance)))throw new Error('This statement is already recorded. Check its history before adding another copy.');
  const history=[...(Array.isArray(a.statementHistory)?a.statementHistory:[])];
  if(record.status!=='current')return {...a,statementHistory:[...history,record]};
  if(current.statementDate&&record.statementDate<=current.statementDate)throw new Error('Save an older statement as a previous statement.');
  if(a.statementBalance||a.dueDate)history.push({...current,status:'replaced',recordedAt:Date.now()});
  return {...a,tracksStatement:true,statementBalance:record.statementBalance,dueDate:record.dueDate,statementDetails:record,statementHistory:history};
}
function acctStatementConfirm(){
  const draft=acctToolDraft;if(!draft||draft.kind!=='statement')return false;
  try{
    const list=loadAccounts(),a=list.find(x=>x&&x.id===draft.id);
    if(draft.uid!==acctToolUid()||JSON.stringify(a)!==draft.snapshot||JSON.stringify(accounts.find(x=>x&&x.id===draft.id))!==draft.snapshot)throw new Error('This account changed. Cancel and reopen the statement.');
    const val=id=>document.getElementById(id).value;
    const next=acctStatementBuild(a,{statementDate:val('acct-new-statement-date'),dueDate:val('acct-new-statement-due'),balance:val('acct-new-statement-balance'),minimum:val('acct-new-statement-min'),interest:val('acct-new-statement-interest'),fees:val('acct-new-statement-fees'),status:val('acct-new-statement-status'),
      ...(typeof acctFinStatementExtra==='function'?{openingBalance:val('acct-new-statement-opening'),purchases:val('acct-new-statement-purchases'),printedRepayments:val('acct-new-statement-payments'),credits:val('acct-new-statement-credits'),periodStart:val('acct-new-statement-start'),sourceName:val('acct-new-statement-source')}:{})});
    acctToolSave(list.map(x=>x&&x.id===draft.id?next:x));acctToolClose();acctToolRefresh();showToast('Statement saved');return true;
  }catch(e){document.getElementById('acct-tools-error').textContent=e.message;return false;}
}
function acctTransferSource(a){return a&&!a.archivedAt&&a.type==='asset'&&(!a.category||['cash','savings'].includes(a.category));}
function acctTransferRecorded(list,key){return !!(key&&list.some(a=>(a.balanceMovements||[]).some(r=>r.budgetKey===key)));}
function acctRecordedTransfers(){
  const records=new Map();
  loadAccounts().forEach(a=>(a.balanceMovements||[]).forEach(r=>{if(r&&r.id&&r.status!=='void'&&!records.has(r.id))records.set(r.id,{...r,kind:'transfer'});}));
  return [...records.values()];
}
function acctTransferOpen(proposal){
  const list=loadAccounts(),sources=list.filter(acctTransferSource),targets=list.filter(a=>!a.archivedAt&&(acctTransferSource(a)||a.type==='debt'));
  if(proposal&&!targets.some(acctIsSaver)){showToast('Add or choose a Savers account in Accounts before recording the savings transfer.');return;}
  if(!sources.length||targets.length<2){showToast('Add a cash account and a savings or debt account first.');return;}
  if(acctTransferRecorded(list,proposal?.key)&&!proposal?.limit){showToast('A savings transfer is already recorded for this budget. Check Accounts before recording anything else.');return;}
  acctToolDraft={kind:'transfer',uid:acctToolUid(),snapshot:JSON.stringify(list),key:proposal?.key||'',limit:proposal?.limit,token:genAccountId()};
  const option=a=>'<option value="'+escAttr(a.id)+'">'+escText(a.name)+' · '+fmtMoneyExact(Number(a.current)||0)+'</option>';
  const existing=typeof ledgerOf==='function'?ledgerOf('transfer').filter(r=>r.date===getLocalDate()):[];
  acctToolForm(proposal?'Review savings transfer':'Record a transfer','<p>Record money that has already arrived. Daily updates both balances; it does not move money at your bank. Pending or failed payments should wait.</p>'+
    '<div class="stg-field"><label for="acct-transfer-from">From account</label><select id="acct-transfer-from" onchange="acctTransferPreview()"><option value="">Choose account</option>'+sources.map(option).join('')+'</select></div>'+
    '<div class="stg-field"><label for="acct-transfer-to">To account</label><select id="acct-transfer-to" onchange="acctTransferPreview()"><option value="">Choose account</option>'+targets.filter(a=>(!proposal||acctIsSaver(a))&&(!proposal?.allowedTargets||proposal.allowedTargets.includes(a.id))).map(option).join('')+'</select></div>'+
    acctToolField('acct-transfer-amount','Amount received','text',proposal?.amount||'').replace('<input ','<input oninput="acctTransferPreview()" ')+
    (existing.length?'<div class="stg-field"><label for="acct-transfer-ledger">Existing transfer entry (optional)</label><select id="acct-transfer-ledger" onchange="acctTransferPreview()"><option value="">New transfer record</option>'+existing.map(r=>'<option value="'+escAttr(r.id)+'">'+escText(list.find(a=>a.id===r.fromAcctId)?.name||'Unknown account')+' to '+escText(list.find(a=>a.id===r.toAcctId)?.name||'Unknown account')+' · '+fmtMoneyExact(r.amount)+'</option>').join('')+'</select><small>Link an entry already recorded today so savings is counted once.</small></div>':'')+
    '<p id="acct-transfer-preview" role="status">Choose both accounts to preview the resulting balances.</p>'+
    '<p>Updates today’s balances ('+escText(fmtDate(getLocalDate()))+'). For older transfers already included in your balances, use balance reconciliation instead.</p>'+
    '<label class="acct-transfer-check"><input id="acct-transfer-posted" type="checkbox" required> This transfer has posted, and these Daily balances do not already include it.</label>',
    'acctTransferConfirm','Update both balances');
}
function acctTransferPreview(){
  const draft=acctToolDraft;if(!draft||draft.kind!=='transfer')return;
  const el=document.getElementById('acct-transfer-preview');
  try{
    const from=document.getElementById('acct-transfer-from').value,to=document.getElementById('acct-transfer-to').value;
    const next=acctTransferBuild(JSON.parse(draft.snapshot),{from,to,amount:document.getElementById('acct-transfer-amount').value,ledgerId:document.getElementById('acct-transfer-ledger')?.value||'',posted:true,key:draft.key,limit:draft.limit,token:draft.token});
    el.textContent=next.filter(a=>a.id===from||a.id===to).map(a=>a.name+': '+fmtMoneyExact(a.current)+(a.type==='debt'?' owed':'')).join(' · ');
  }catch(e){el.textContent=e.message;}
}
function acctTransferBuild(list,input){
  const from=list.find(a=>a&&a.id===input.from),to=list.find(a=>a&&a.id===input.to),amount=acctMoney(input.amount);
  if(!acctTransferSource(from)||!to||to.archivedAt||(!acctTransferSource(to)&&to.type!=='debt')||from.id===to.id)throw new Error('Choose two different eligible accounts.');
  if(!input.posted)throw new Error('Confirm this transfer has posted and is not already included in the balances.');
  if(input.key&&!acctIsSaver(to))throw new Error('Choose a Savers account for the budget savings.');
  if(amount<=0||amount>acctMoney(from.current))throw new Error('The amount must be above zero and no more than the source balance.');
  if(to.type==='debt'&&amount>acctMoney(to.current))throw new Error('This payment exceeds the recorded debt. Reconcile the debt balance first.');
  if(input.limit!==undefined&&typeof acctFinBudgetMoved==='function'){
    if(!input.key||acctFinBudgetMoved(list,input.key)+amount>acctMoney(input.limit)+.001)throw new Error('This exceeds the savings still allocated for this budget.');
  }else if(acctTransferRecorded(list,input.key))throw new Error('This transfer is already recorded.');
  if(list.some(a=>(a.balanceMovements||[]).some(r=>r.id===input.token)))throw new Error('This transfer is already recorded.');
  const ledger=typeof ledgerOf==='function'?ledgerOf('transfer'):[];
  const matches=r=>r.date===getLocalDate()&&r.fromAcctId===from.id&&r.toAcctId===to.id&&Number(r.amount)===amount;
  if(input.ledgerId){
    if(!ledger.some(r=>r.id===input.ledgerId&&matches(r)))throw new Error('The selected transfer must match today, both accounts and the exact amount.');
    if(list.some(a=>(a.balanceMovements||[]).some(r=>r.ledgerId===input.ledgerId&&r.status!=='void')))throw new Error('This existing transfer has already updated the balances.');
  }else if(ledger.some(matches))throw new Error('A matching transfer is already recorded today. Select its existing entry to count it once.');
  const savingsMove=acctIsSaver(to)&&!acctIsSaver(from)?'contribution':acctIsSaver(from)&&!acctIsSaver(to)?'withdrawal':'none';
  const today=getLocalDate(),receipt={id:input.token,date:today,amount,fromAcctId:from.id,toAcctId:to.id,fromName:from.name,toName:to.name,savingsMove,budgetKey:input.key||'',ledgerId:input.ledgerId||''};
  if(typeof acctFinEpoch==='function'){receipt.fromEpoch=acctFinEpoch(from);receipt.toEpoch=acctFinEpoch(to);}
  return list.map(a=>{
    if(a.id!==from.id&&a.id!==to.id)return a;
    const change=a.id===from.id||a.type==='debt'?-amount:amount;
    const current=(Math.round(acctMoney(a.current)*100)+Math.round(change*100))/100;
    if(!Number.isSafeInteger(Math.round(current*100)))throw new Error('The resulting balance is too large.');
    const history=[...(a.history||[]).filter(r=>r&&r.date!==today),{date:today,balance:current}].sort((a,b)=>a.date.localeCompare(b.date));
    const next={...a,current,history,balanceMovements:[...(a.balanceMovements||[]),receipt]};
    if(typeof acctLinkAdjust==='function')acctLinkAdjust(next,change);
    return next;
  });
}
function acctTransferConfirm(){
  const draft=acctToolDraft;if(!draft||draft.kind!=='transfer')return false;
  try{
    const list=loadAccounts();
    if(draft.uid!==acctToolUid()||JSON.stringify(list)!==draft.snapshot||JSON.stringify(accounts)!==draft.snapshot)throw new Error('Accounts changed. Cancel and review the latest balances.');
    const next=acctTransferBuild(list,{from:document.getElementById('acct-transfer-from').value,to:document.getElementById('acct-transfer-to').value,amount:document.getElementById('acct-transfer-amount').value,ledgerId:document.getElementById('acct-transfer-ledger')?.value||'',posted:document.getElementById('acct-transfer-posted').checked,key:draft.key,limit:draft.limit,token:draft.token});
    acctToolSave(next);acctToolClose();acctToolRefresh();showToast('Both account balances updated');return true;
  }catch(e){document.getElementById('acct-tools-error').textContent=e.message;return false;}
}
function acctOfferBudgetTransfer(period){
  let key,amount;
  if(period){
    const p=budPeriodViewed(),r=p&&budCyclesLoad().periods[p.id],today=getLocalDate();
    if(!r?.finished||today<p.start||today>p.end)return;
    key='budget:'+p.start+'_'+p.end;amount=Number(r.savings)||0;
  }else{
    if(currentWeekIdx!==0)return;
    const wk=weekKey(getMondayOf(0)),r=lsLoad('daily_budget',{})[wk];
    if(!r?.saved)return;
    key='budget:'+wk+'_'+budDateAdd(wk,6);amount=Number(r.sav_amount)||0;
  }
  if(amount>0){if(typeof acctFinSavingsOffer==='function')acctFinSavingsOffer({key,amount});else acctTransferOpen({key,amount});}
}
