'use strict';

// Account-only records are committed together through the existing accounts writer.
// These readers never migrate, re-date or rewrite a historical financial record.
function acctFinId(prefix){return prefix+'_'+Date.now()+'_'+Math.random().toString(36).slice(2,12);}
function acctFinClone(value){return JSON.parse(JSON.stringify(value));}
function acctFinCents(n){const value=Number(n),cents=Math.round(value*100);if(!Number.isFinite(value)||!Number.isSafeInteger(cents)||Math.abs(value*100-cents)>.000001)throw new Error('Use a valid amount with at most two decimal places.');return cents;}
function acctFinMoney(n){return acctFinCents(n)/100;}
function acctFinEpoch(a){return a.balanceLink?.anchor||a.balanceEpoch||'legacy';}
function acctFinButton(label,fn,id,extra){return '<button type="button" class="stg-btn" data-account="'+escAttr(id)+'"'+(extra?' data-record="'+escAttr(extra)+'"':'')+' onclick="'+fn+'(this.dataset.account'+(extra?',this.dataset.record':'')+')">'+label+'</button>';}
function acctFinGuard(d){if(!d||d.signature!==acctLinkSignature())throw new Error('Financial records changed. Cancel and reopen to review the latest figures.');}
function acctFinAccountSave(build){
  try{acctFinGuard(acctToolDraft);const next=build(loadAccounts(),acctToolDraft);acctToolSave(next);acctToolClose();acctToolRefresh();return true;}
  catch(e){document.getElementById('acct-tools-error').textContent=e.message;return false;}
}
function acctFinStatementId(a,r){return r.id||'statement:'+a.id+':'+(r.statementDate||r.dueDate||('undated-'+(r.recordedAt||r.statementBalance||0)));}
function acctFinStatements(a){
  const rows=acctStatementRows(a).map(r=>({...r,id:acctFinStatementId(a,r),isCurrent:false}));
  if(a.statementBalance||a.dueDate||a.statementDetails?.id)rows.unshift({...acctCurrentStatement(a),isCurrent:true});
  const seen=new Set();return rows.filter(r=>{if(seen.has(r.id))return false;seen.add(r.id);return true;});
}
function acctFinStatementProgress(a,r,excludeId){
  const closed=['paid','settled'].includes(r.status),payments=(a.repayments||[]).filter(p=>p.id!==excludeId&&p.statementId===acctFinStatementId(a,r)&&p.status!=='void');
  const closing=Math.max(0,acctFinCents(r.statementBalance||0));
  const posted=payments.filter(p=>p.status==='posted'),paid=posted.reduce((n,p)=>n+acctFinCents(p.applied||0),0);
  const pending=payments.filter(p=>['pending','scheduled'].includes(p.status)).reduce((n,p)=>n+acctFinCents(p.applied||0),0);
  const byDue=posted.filter(p=>!r.dueDate||p.date<=r.dueDate).reduce((n,p)=>n+acctFinCents(p.applied||0),0);
  const minimum=r.minimum===null||r.minimum===undefined?null:Math.max(0,acctFinCents(r.minimum));
  return {remaining:closed?0:Math.max(0,closing-paid)/100,paid:paid/100,pending:pending/100,
    minimumLeft:closed?0:minimum===null?null:Math.max(0,Math.min(closing,minimum)-paid)/100,
    minimumMetByDue:closed||minimum!==null&&byDue>=minimum,closed};
}
function acctStatementRemaining(a){return acctFinStatementProgress(a,acctCurrentStatement(a)).remaining;}
function acctFinPaymentStatus(p){return ({scheduled:'Scheduled',pending:'Pending',posted:'Posted',failed:'Failed',cancelled:'Cancelled',void:'Voided'})[p.status]||'Unknown';}
function acctFinQuickStatus(a){
  if(!a.tracksStatement||!(a.statementBalance>0))return '';
  const p=acctFinStatementProgress(a,acctCurrentStatement(a));
  const due=acctDueText(a),late=p.remaining>0&&acctDueDays(a)<0;
  return '<span'+(late?' class="fin-warning"':'')+'>'+escText(p.remaining>0?'Statement '+fmtMoneyExact(p.remaining)+(due?' · '+due:' · no due date'):'Statement covered')+'</span>'+
    (p.pending?'<span class="acct-pending-hint">'+fmtMoneyExact(p.pending)+' pending / scheduled</span>':'');
}
function acctFinSavingsGoalHtml(a){
  if(!acctIsSaver(a)||!(a.savingsPlan?.goal>0))return '';
  const goal=a.savingsPlan.goal,progress=Math.max(0,Math.min(100,a.current/goal*100));
  return '<div class="acct-records acct-savings-goal"><div class="acct-goal-heading"><span>Savings goal</span><strong>'+fmtMoneyExact(goal)+'</strong></div><progress class="fin-goal" value="'+progress+'" max="100" aria-label="Savings goal progress">'+Math.round(progress)+'%</progress><p>'+fmtMoneyExact(Math.max(0,acctFinMoney((acctFinCents(goal)-acctFinCents(a.current))/100)))+' to go'+(a.savingsPlan.targetDate?' · '+escText(fmtDate(a.savingsPlan.targetDate)):'')+' · '+(a.savingsPlan.mode==='manual'?'manual updates':'reviewed transfers')+'</p></div>';
}
function acctFinStatementSummary(a){
  if(!a.tracksStatement||(!a.statementBalance&&!a.dueDate))return '';
  const r=acctCurrentStatement(a),p=acctFinStatementProgress(a,r);
  return '<div class="acct-records acct-statement-summary"><div class="fin-facts"><span>Statement remaining<strong>'+fmtMoneyExact(p.remaining)+'</strong></span><span>Minimum remaining<strong>'+(p.minimumLeft===null?'Not recorded':fmtMoneyExact(p.minimumLeft))+'</strong></span><span>Repaid<strong>'+fmtMoneyExact(p.paid)+'</strong></span></div>'+
    (p.pending?'<p>'+fmtMoneyExact(p.pending)+' pending / scheduled · not yet counted as paid.</p>':'')+
    (r.dueDate&&r.dueDate<getLocalDate()&&!p.minimumMetByDue&&p.minimumLeft!==null?'<p class="fin-warning">The recorded minimum was not met by its due date. Check the bank’s current amount due.</p>':'')+
    '</div>';
}
function acctFinRecordsHtml(a){
  const statements=acctFinStatements(a),payments=a.repayments||[],history=statements.filter(r=>!r.isCurrent);
  const totals=statements.reduce((t,r)=>({interest:t.interest+(Number(r.interest)||0),fees:t.fees+(Number(r.fees)||0)}),{interest:0,fees:0});
  let html=acctFinStatementSummary(a)+'<div class="acct-record-actions">'+acctFinButton('Activity & balances','acctFinActivityOpen',a.id);
  if(a.type==='debt')html+=acctFinButton('Record repayment','acctFinPaymentOpen',a.id);
  if(acctIsSaver(a))html+=acctFinButton('Savings preferences','acctFinSavingsOpen',a.id);
  html+='</div>';
  if(a.type==='debt')html+='<details class="acct-records acct-statements"><summary>Statements & charges ('+statements.length+')</summary><div class="acct-record-actions">'+acctFinButton('Add statement','acctStatementOpen',a.id)+acctFinButton('Import statements','acctFinStatementImportOpen',a.id)+'</div><p>Recorded interest '+fmtMoneyExact(totals.interest)+' · fees '+fmtMoneyExact(totals.fees)+'.</p>'+
    (statements.length?statements.map(r=>{const p=acctFinStatementProgress(a,r);return '<div class="acct-record"><strong>'+fmtMoneyExact(r.statementBalance||0)+'</strong><span>'+(r.isCurrent?'Current · ':'')+escText(r.statementDate?fmtDate(r.statementDate):r.dueDate?'Due '+fmtDate(r.dueDate):'Date not recorded')+'</span><small>'+
      (p.closed?'Recorded as paid':fmtMoneyExact(p.paid)+' matched · '+fmtMoneyExact(p.remaining)+' unmatched')+(r.dueDate?' · due '+escText(fmtDate(r.dueDate)):'')+'</small><small>Interest '+(r.interest==null?'not recorded':fmtMoneyExact(r.interest))+' · fees '+(r.fees==null?'not recorded':fmtMoneyExact(r.fees))+'</small>'+
      (typeof acctFinStatementFacts==='function'?acctFinStatementFacts(r):'')+'<div class="acct-record-actions">'+acctFinButton('Review / correct','acctFinStatementEditOpen',a.id,r.id)+'</div></div>';}).join(''):'<p>No statement history yet. Add older statements without changing account balances.</p>')+
      '<p>Repayments reduce the amount remaining, not the printed closing balance. Interest and fees are recorded from the bank.</p>'+(history.length?'<p>Previous statements are kept for reference, not added together as debt.</p>':'')+'</details>';
  if(payments.length)html+='<details class="acct-records"><summary>Repayments ('+payments.length+')</summary>'+payments.slice().sort((x,y)=>y.date.localeCompare(x.date)).map(p=>'<div class="acct-record"><strong>'+fmtMoneyExact(p.amount)+'</strong><span>'+acctFinPaymentStatus(p)+' · '+escText(fmtDate(p.date))+'</span><small>'+escText(p.fromName||'Source not recorded')+' · '+fmtMoneyExact(p.applied||0)+' matched to a statement'+(p.affectsBalances?' · balances updated':' · record only')+(p.reference?' · '+escText(p.reference):'')+'</small>'+
    (p.status==='void'?'':'<div class="acct-record-actions">'+acctFinButton(p.status==='posted'?'Review / void':'Update status','acctFinPaymentOpen',a.id,p.id)+'</div>')+'</div>').join('')+'</details>';
  const moves=(a.balanceMovements||[]).filter(r=>!r.paymentId);
  if(moves.length)html+='<details class="acct-records"><summary>Recorded transfers ('+moves.length+')</summary>'+moves.slice().reverse().map(r=>'<div class="acct-record"><strong>'+fmtMoneyExact(r.amount)+'</strong><span>'+escText(r.fromAcctId===a.id?'To '+r.toName:'From '+r.fromName)+'</span><small>'+escText(fmtDate(r.date))+(r.status==='void'?' · voided':' · balances updated together')+'</small>'+(r.status==='void'?'':'<div class="acct-record-actions">'+acctFinButton('Review / void transfer','acctFinTransferOpen',a.id,r.id)+'</div>')+'</div>').join('')+'</details>';
  if(a.statementCorrections?.length)html+='<details class="acct-records"><summary>Statement corrections ('+a.statementCorrections.length+')</summary>'+a.statementCorrections.slice().reverse().map(r=>'<div class="acct-record"><span>'+escText(r.reason)+'</span><small>Closing '+fmtMoneyExact(r.before.statementBalance||0)+' → '+fmtMoneyExact(r.after.statementBalance||0)+' · due '+escText(r.before.dueDate||'not recorded')+' → '+escText(r.after.dueDate||'not recorded')+'</small></div>').join('')+'</details>';
  return html;
}
function acctFinAccountAlerts(){
  const items=[];
  loadAccounts().filter(a=>!a.archivedAt).forEach(a=>(a.repayments||[]).filter(p=>p.status==='failed'||['pending','scheduled'].includes(p.status)&&p.date<=getLocalDate()).forEach(p=>items.push({tone:p.status==='failed'?'neg':'warn',icon:'alert',title:escText(a.name)+' repayment '+(p.status==='failed'?'failed':p.status==='pending'?'is pending':'needs checking'),body:fmtMoneyExact(p.amount)+' · '+escText(fmtDate(p.date))+'. It does not count as paid until you confirm it posted.',act:'Open accounts',run:'openAccounts(this)'})));
  return items;
}
function acctFinPaymentBuild(list,input){
  const next=acctFinClone(list),a=next.find(a=>a.id===input.accountId),from=next.find(a=>a.id===input.from),old=a?.repayments?.find(p=>p.id===input.id);
  if(!a||a.type!=='debt'||a.archivedAt)throw new Error('Choose an active debt account.');
  if(old?.status==='posted'||old?.status==='void')throw new Error('A posted payment is retained for the audit trail. Void it before recording a correction.');
  if(!['scheduled','pending','posted','failed','cancelled'].includes(input.status))throw new Error('Choose a payment status.');
  if(!budDateValid(input.date)||(!['scheduled','cancelled'].includes(input.status)&&input.date>getLocalDate()))throw new Error('Choose a valid date. Only scheduled or cancelled payments may have a future date.');
  const amount=acctMoney(input.amount),applied=input.statementId?acctMoney(input.applied):0;
  if(amount<=0||applied>amount)throw new Error('Payment must be above zero; the matched amount cannot exceed it.');
  const statement=acctFinStatements(a).find(r=>r.id===input.statementId);
  if(input.statementId&&!statement)throw new Error('Choose a statement that is still on record.');
  if(statement){
    if(statement.statementDate&&input.date<statement.statementDate)throw new Error('This payment predates that statement. Choose the earlier statement or leave it unmatched.');
    if(applied>acctFinStatementProgress(a,statement,input.id).remaining)throw new Error('The matched amount exceeds what remains on that statement. Leave the excess unmatched.');
  }
  if((a.repayments||[]).some(p=>p.id!==input.id&&!['void','cancelled'].includes(p.status)&&p.date===input.date&&p.amount===amount&&p.fromAcctId===(input.from||''))&&!input.duplicate)throw new Error('A similar payment is already recorded. Confirm this is a separate payment.');
  if(from&&!acctTransferSource(from))throw new Error('Repayments must come from a cash or savings account.');
  const update=input.status==='posted'&&input.updateBalances===true;
  const existing=input.existingId?(a.balanceMovements||[]).find(r=>r.id===input.existingId&&r.toAcctId===a.id&&r.status!=='void'):null;
  if(input.existingId){
    if(!existing||existing.amount!==amount||existing.date!==input.date||existing.fromAcctId!==input.from)throw new Error('The existing transfer must match the date, amount and accounts.');
    if((a.repayments||[]).some(p=>p.id!==input.id&&p.existingId===input.existingId&&p.status!=='void'))throw new Error('That transfer is already matched to a repayment.');
    if(update||input.status!=='posted')throw new Error('An existing posted transfer is record-only here; its balances have already changed.');
  }else if((a.balanceMovements||[]).some(r=>r.toAcctId===a.id&&r.status!=='void'&&r.date===input.date&&r.amount===amount&&r.fromAcctId===input.from&&!r.paymentId))throw new Error('A matching transfer already exists. Link it instead of recording the payment twice.');
  if(update){
    if(!from||from.archivedAt||from.id===a.id)throw new Error('Choose an active source account to update both balances.');
    if(amount>from.current)throw new Error('This payment exceeds the recorded source balance. Check the balance first.');
    if(a.category!=='card'&&amount>a.current)throw new Error('This exceeds the recorded debt. Check its balance first.');
    for(const acc of [from,a]){
      const baseline=acc.balanceLink?.date||(acc.history||[]).reduce((last,r)=>r.date>last?r.date:last,'');
      if(baseline&&input.date<baseline)throw new Error('A newer balance is already recorded. Save this older repayment as record-only.');
    }
  }
  const id=old?.id||input.id||acctFinId('repayment');
  if(!old&&(a.repayments||[]).some(p=>p.id===id))throw new Error('This repayment is already recorded.');
  const payment={...(old||{}),id,date:input.date,amount,status:input.status,fromAcctId:input.from||'',fromName:from?.name||existing?.fromName||'',
    statementId:input.statementId||'',applied,reference:String(input.reference||'').trim().slice(0,160),affectsBalances:update,existingId:input.existingId||'',updatedAt:Date.now(),
    changes:[...(old?.changes||[]),{at:Date.now(),status:input.status,amount,date:input.date}]};
  if(statement?.isCurrent)a.statementDetails={...acctCurrentStatement(a),id:statement.id};
  if(update){
    const receipt={id:'payment:'+id,paymentId:id,date:input.date,amount,fromAcctId:from.id,toAcctId:a.id,fromName:from.name,toName:a.name,
      savingsMove:acctIsSaver(from)?'withdrawal':'none',fromEpoch:acctFinEpoch(from),toEpoch:acctFinEpoch(a),status:'posted'};
    for(const acc of [from,a]){
      const change=-amount;acc.current=acctFinMoney((acctFinCents(acc.current)+acctFinCents(change))/100);acctLinkAdjust(acc,change);
      acc.history=[...(acc.history||[]).filter(r=>r.date!==getLocalDate()),{date:getLocalDate(),balance:acc.current}].sort((x,y)=>x.date.localeCompare(y.date));
      acc.balanceMovements=[...(acc.balanceMovements||[]),receipt];
    }
    payment.movementId=receipt.id;
  }
  a.repayments=[...(a.repayments||[]).filter(p=>p.id!==id),payment];return next;
}
function acctFinPaymentVoidBuild(list,accountId,id,reverse){
  const next=acctFinClone(list),a=next.find(a=>a.id===accountId),p=a?.repayments?.find(p=>p.id===id);
  if(!p||p.status==='void')throw new Error('This payment is no longer available to void.');
  if(p.affectsBalances&&reverse){
    const receipt=a.balanceMovements?.find(r=>r.id===p.movementId),from=next.find(x=>x.id===p.fromAcctId);
    if(!receipt||!from||receipt.fromEpoch!==acctFinEpoch(from)||receipt.toEpoch!==acctFinEpoch(a))throw new Error('A balance was confirmed after this payment. Check the bank balances, then void the record without reversing balances.');
    for(const acc of [from,a]){acc.current=acctFinMoney((acctFinCents(acc.current)+acctFinCents(p.amount))/100);acctLinkAdjust(acc,p.amount);
      acc.history=[...(acc.history||[]).filter(r=>r.date!==getLocalDate()),{date:getLocalDate(),balance:acc.current}].sort((x,y)=>x.date.localeCompare(y.date));}
  }
  next.forEach(acc=>{if(acc.balanceMovements)acc.balanceMovements=acc.balanceMovements.map(r=>r.id===p.movementId?{...r,status:'void',voidedAt:Date.now()}:r);});
  p.status='void';p.voidedAt=Date.now();p.balancesReversed=!!(p.affectsBalances&&reverse);return next;
}
function acctFinTransferVoidBuild(list,id,reverse){
  const next=acctFinClone(list),receipt=next.flatMap(a=>a.balanceMovements||[]).find(r=>r.id===id&&r.status!=='void');
  if(!receipt||receipt.paymentId)throw new Error('This transfer is no longer available. Review repayments through their payment record.');
  if(next.some(a=>(a.repayments||[]).some(p=>p.existingId===id&&p.status!=='void')))throw new Error('This transfer is matched to a repayment. Void that repayment record first.');
  const from=next.find(a=>a.id===receipt.fromAcctId),to=next.find(a=>a.id===receipt.toAcctId);
  if(reverse){
    if(!from||!to||receipt.fromEpoch!==acctFinEpoch(from)||receipt.toEpoch!==acctFinEpoch(to))throw new Error('A newer balance was confirmed, or this older transfer has no starting-point record. Check your bank balances, then void without reversing them.');
    for(const a of [from,to]){const change=a.id===from.id||a.type==='debt'?receipt.amount:-receipt.amount;a.current=acctFinMoney((acctFinCents(a.current)+acctFinCents(change))/100);acctLinkAdjust(a,change);a.history=[...(a.history||[]).filter(r=>r.date!==getLocalDate()),{date:getLocalDate(),balance:a.current}].sort((x,y)=>x.date.localeCompare(y.date));}
  }
  next.forEach(a=>{if(a.balanceMovements)a.balanceMovements=a.balanceMovements.map(r=>r.id===id?{...r,status:'void',voidedAt:Date.now(),balancesReversed:!!reverse}:r);});return next;
}
function acctFinTransferOpen(accountId,id){
  const a=loadAccounts().find(a=>a.id===accountId),r=a?.balanceMovements?.find(r=>r.id===id&&r.status!=='void');if(!r)return;
  acctToolDraft={kind:'transfer-void',id,signature:acctLinkSignature()};
  acctToolForm('Review recorded transfer','<p>'+fmtMoneyExact(r.amount)+' · '+escText(r.fromName)+' to '+escText(r.toName)+' · '+escText(fmtDate(r.date))+'.</p><p>Void an incorrect Daily record before entering its correction. The original stays in history. This does not cancel or move money at your bank.</p>'+
    '<label class="acct-transfer-check"><input id="fin-transfer-reverse" type="checkbox"'+(r.fromEpoch&&r.toEpoch?' checked':'')+'> Reverse its changes to both Daily balances</label><p>Leave this off if your current bank balances already include the correction. A newer confirmed balance cannot be overwritten.</p>'+
    '<label class="acct-transfer-check"><input id="fin-transfer-void-confirm" type="checkbox" required> This transfer record needs to be voided.</label>','acctFinTransferVoidConfirm','Void transfer');
}
function acctFinTransferVoidConfirm(){if(acctToolDraft?.kind!=='transfer-void'||!document.getElementById('fin-transfer-void-confirm').checked)return false;return acctFinAccountSave((list,d)=>acctFinTransferVoidBuild(list,d.id,document.getElementById('fin-transfer-reverse').checked));}
function acctFinPaymentOpen(id,paymentId){
  const list=loadAccounts(),a=list.find(a=>a.id===id);if(!a||a.type!=='debt')return;
  const old=(a.repayments||[]).find(p=>p.id===paymentId);
  acctToolDraft={kind:'repayment',id,paymentId:old?.id||'',token:acctFinId('repayment'),signature:acctLinkSignature(),appliedEdited:!!old};
  if(old?.status==='posted'){
    acctToolForm('Review posted repayment','<p>'+fmtMoneyExact(old.amount)+' posted '+escText(fmtDate(old.date))+'. '+fmtMoneyExact(old.applied||0)+' matched to a statement.</p><p>Voiding keeps the record and removes its statement match. Correct entries by voiding and recording a new payment.</p>'+
      (old.affectsBalances?'<label class="acct-transfer-check"><input id="fin-payment-reverse" type="checkbox" checked> Reverse this payment’s recorded balance changes</label><p>Leave this off only when your current bank balances already include the correction.</p>':'<p>This was record-only. Current balances will stay as recorded.</p>')+
      '<label class="acct-transfer-check"><input id="fin-payment-void-confirm" type="checkbox" required> This payment record needs to be voided.</label>','acctFinPaymentVoid','Void repayment');return;
  }
  const current=acctFinStatements(a).find(r=>r.isCurrent),selected=old?.statementId||current?.id||'';
  const statements=acctFinStatements(a).filter(r=>!['paid','settled'].includes(r.status));
  const moves=(a.balanceMovements||[]).filter(r=>r.toAcctId===a.id&&!r.paymentId&&r.status!=='void'&&!(a.repayments||[]).some(p=>p.existingId===r.id&&p.status!=='void'));
  acctToolForm(old?'Update repayment':'Record repayment','<p>'+escText(a.name)+'. Pending, scheduled and failed payments do not reduce balances or statement amounts. A posted repayment is a transfer, not new spending.</p>'+
    '<div class="stg-field"><label for="fin-payment-status">Status</label><select id="fin-payment-status" onchange="acctFinPaymentPreview()">'+['posted','pending','scheduled','failed','cancelled'].map(s=>'<option value="'+s+'"'+((old?.status||'posted')===s?' selected':'')+'>'+acctFinPaymentStatus({status:s})+'</option>').join('')+'</select></div>'+
    acctToolField('fin-payment-date','Payment date','date',old?.date||getLocalDate())+acctToolField('fin-payment-amount','Payment amount','text',old?.amount||'')+
    '<div class="stg-field"><label for="fin-payment-from">Paid from</label><select id="fin-payment-from"><option value="">Not recorded</option>'+list.filter(acctTransferSource).filter(x=>!x.archivedAt).map(x=>'<option value="'+escAttr(x.id)+'"'+(x.id===old?.fromAcctId?' selected':'')+'>'+escText(x.name)+'</option>').join('')+'</select></div>'+
    '<div class="stg-field"><label for="fin-payment-statement">Match to statement</label><select id="fin-payment-statement"><option value="">Leave unmatched / other debt</option>'+statements.map(r=>'<option value="'+escAttr(r.id)+'"'+(r.id===selected?' selected':'')+'>'+(r.isCurrent?'Current · ':'')+escText(r.statementDate||r.dueDate||'Undated')+' · '+fmtMoneyExact(acctFinStatementProgress(a,r,old?.id).remaining)+' remaining</option>').join('')+'</select></div>'+
    acctToolField('fin-payment-applied','Amount matched to that statement','text',old?.applied||'0')+
    (moves.length?'<div class="stg-field"><label for="fin-payment-existing">Link an existing transfer (optional)</label><select id="fin-payment-existing" onchange="acctFinPaymentUseTransfer()"><option value="">New repayment record</option>'+moves.map(r=>'<option value="'+escAttr(r.id)+'">'+escText(r.date)+' · '+fmtMoneyExact(r.amount)+' · '+escText(r.fromName)+'</option>').join('')+'</select></div>':'')+
    '<div class="stg-field"><label for="fin-payment-reference">Reference / note (optional)</label><input id="fin-payment-reference" maxlength="160" value="'+escAttr(old?.reference||'')+'"></div>'+
    '<label class="acct-transfer-check"><input id="fin-payment-update" type="checkbox"> This has posted and is not included in either Daily balance — update both balances.</label>'+
    '<label class="acct-transfer-check"><input id="fin-payment-duplicate" type="checkbox"> If a similar payment exists, this is a separate payment.</label><p id="fin-payment-preview" role="status"></p>',
    'acctFinPaymentConfirm',old?'Save status':'Save repayment');
  document.getElementById('fin-payment-applied').addEventListener('input',()=>{acctToolDraft.appliedEdited=true;});
  document.querySelector('#acct-tools-dialog form').addEventListener('input',acctFinPaymentPreview);document.querySelector('#acct-tools-dialog form').addEventListener('change',acctFinPaymentPreview);acctFinPaymentPreview();
}
function acctFinPaymentInput(){const v=id=>document.getElementById(id)?.value||'';return {accountId:acctToolDraft.id,id:acctToolDraft.paymentId||acctToolDraft.token,from:v('fin-payment-from'),date:v('fin-payment-date'),amount:v('fin-payment-amount'),status:v('fin-payment-status'),statementId:v('fin-payment-statement'),applied:v('fin-payment-applied'),reference:v('fin-payment-reference'),existingId:v('fin-payment-existing'),updateBalances:document.getElementById('fin-payment-update').checked,duplicate:document.getElementById('fin-payment-duplicate').checked};}
function acctFinPaymentUseTransfer(){
  const a=loadAccounts().find(a=>a.id===acctToolDraft?.id),r=a?.balanceMovements?.find(r=>r.id===document.getElementById('fin-payment-existing').value);if(!r)return;
  document.getElementById('fin-payment-date').value=r.date;document.getElementById('fin-payment-amount').value=r.amount;document.getElementById('fin-payment-from').value=r.fromAcctId;document.getElementById('fin-payment-status').value='posted';document.getElementById('fin-payment-update').checked=false;acctFinPaymentPreview();
}
function acctFinPaymentPreview(){
  if(acctToolDraft?.kind!=='repayment')return;
  const el=document.getElementById('fin-payment-preview');if(!el)return;
  const posted=document.getElementById('fin-payment-status').value==='posted',box=document.getElementById('fin-payment-update');box.disabled=!posted;if(!posted)box.checked=false;
  if(!acctToolDraft.appliedEdited){const a=loadAccounts().find(a=>a.id===acctToolDraft.id),r=acctFinStatements(a).find(r=>r.id===document.getElementById('fin-payment-statement').value),amount=Number(document.getElementById('fin-payment-amount').value);document.getElementById('fin-payment-applied').value=r&&Number.isFinite(amount)?Math.max(0,Math.min(amount,acctFinStatementProgress(a,r).remaining)):0;}
  try{const input=acctFinPaymentInput(),next=acctFinPaymentBuild(loadAccounts(),input),a=next.find(a=>a.id===input.accountId),from=next.find(a=>a.id===input.from);el.textContent=input.updateBalances?'After saving: '+(from?from.name+' '+fmtMoneyExact(from.current)+' · ':'')+a.name+' '+fmtMoneyExact(a.current)+(a.current<0?' credit':' owed'):'Record only · balances stay unchanged. '+(input.status==='posted'?fmtMoneyExact(input.applied||0)+' will count toward the selected statement.':'Statement amounts stay unchanged until posted.');}
  catch(e){el.textContent=e.message;}
}
function acctFinPaymentConfirm(){if(acctToolDraft?.kind!=='repayment')return false;const input=acctFinPaymentInput();return acctFinAccountSave(list=>acctFinPaymentBuild(list,input));}
function acctFinPaymentVoid(){if(acctToolDraft?.kind!=='repayment'||!document.getElementById('fin-payment-void-confirm').checked)return false;return acctFinAccountSave((list,d)=>acctFinPaymentVoidBuild(list,d.id,d.paymentId,!!document.getElementById('fin-payment-reverse')?.checked));}

function acctFinStatementEditBuild(a,id,input){
  const before=acctFinStatements(a).find(r=>r.id===id);if(!before)throw new Error('This statement is no longer on record.');
  if(!budDateValid(input.statementDate)||!budDateValid(input.dueDate)||input.statementDate>getLocalDate()||input.dueDate<input.statementDate)throw new Error('Enter valid statement and due dates.');
  if(acctFinStatements(a).some(r=>r.id!==id&&r.statementDate===input.statementDate))throw new Error('Another statement already uses that statement date.');
  if(!String(input.reason||'').trim())throw new Error('Add a short reason for the correction.');
  const record={...before,id,statementDate:input.statementDate,dueDate:input.dueDate,statementBalance:acctMoney(input.balance),minimum:acctMoney(input.minimum,true),interest:acctMoney(input.interest,true),fees:acctMoney(input.fees,true)};
  if(typeof acctFinStatementExtra==='function')acctFinStatementExtra(record,input);
  if(record.periodStart&&record.periodStart>record.statementDate)throw new Error('The period start cannot follow the corrected statement date.');
  if(record.minimum!==null&&record.minimum>record.statementBalance)throw new Error('Minimum payment cannot exceed the closing balance.');
  const next=acctFinClone(a);delete record.isCurrent;
  next.statementCorrections=[...(a.statementCorrections||[]),{id:acctFinId('correction'),statementId:id,at:Date.now(),reason:String(input.reason).trim().slice(0,200),before,after:record}];
  if(before.isCurrent){next.statementBalance=record.statementBalance;next.dueDate=record.dueDate;next.statementDetails=record;}
  else if((next.statementHistory||[]).some(r=>acctFinStatementId(next,r)===id))next.statementHistory=next.statementHistory.map(r=>acctFinStatementId(next,r)===id?record:r);
  else next.statementSettlements=(next.statementSettlements||[]).map(r=>acctFinStatementId(next,{...r.details,...r})===id?{...r,statementBalance:record.statementBalance,dueDate:record.dueDate,details:record}:r);
  return next;
}
function acctFinStatementEditOpen(id,statementId){
  const a=loadAccounts().find(a=>a.id===id),r=a&&acctFinStatements(a).find(r=>r.id===statementId);if(!r)return;
  acctToolDraft={kind:'statement-edit',id,statementId,signature:acctLinkSignature()};
  acctToolForm('Review / correct statement','<p>Corrections retain the previous values and a reason. They never change spending, income or the current account balance.</p>'+
    acctToolField('fin-statement-date','Statement date','date',r.statementDate||'')+acctToolField('fin-statement-due','Due date','date',r.dueDate||'')+
    acctToolField('fin-statement-balance','Closing balance','text',r.statementBalance||0)+acctToolField('fin-statement-minimum','Minimum payment (optional)','text',r.minimum??'')+
    acctToolField('fin-statement-interest','Interest charged (optional)','text',r.interest??'')+acctToolField('fin-statement-fees','Fees charged (optional)','text',r.fees??'')+
    '<details><summary>Additional statement figures</summary>'+acctToolField('fin-statement-opening','Opening balance (optional)','text',r.openingBalance??'')+acctToolField('fin-statement-purchases','Purchases (optional)','text',r.purchases??'')+acctToolField('fin-statement-payments','Printed repayments total (optional)','text',r.printedRepayments??'')+acctToolField('fin-statement-credits','Other credits / refunds (optional)','text',r.credits??'')+acctToolField('fin-statement-start','Period start (optional)','date',r.periodStart||'')+'<div class="stg-field"><label for="fin-statement-source">Source / filename (optional)</label><input id="fin-statement-source" maxlength="160" value="'+escAttr(r.sourceName||'')+'"></div></details>'+
    '<div class="stg-field"><label for="fin-statement-reason">Reason for correction</label><input id="fin-statement-reason" maxlength="200" required></div>'+
    '<p>'+acctFinStatementProgress(a,r).paid+' in matched repayments. A changed closing balance may leave some repayment amount above the statement balance.</p>',
    'acctFinStatementEditConfirm','Save correction');
}
function acctFinStatementEditConfirm(){
  if(acctToolDraft?.kind!=='statement-edit')return false;
  const v=id=>document.getElementById('fin-statement-'+id).value;
  return acctFinAccountSave((list,d)=>list.map(a=>a.id===d.id?acctFinStatementEditBuild(a,d.statementId,{statementDate:v('date'),dueDate:v('due'),balance:v('balance'),minimum:v('minimum'),interest:v('interest'),fees:v('fees'),reason:v('reason'),openingBalance:v('opening'),purchases:v('purchases'),printedRepayments:v('payments'),credits:v('credits'),periodStart:v('start'),sourceName:v('source')}):a));
}
function acctFinStatementInline(a,next){
  const before=acctCurrentStatement(a),id=acctFinStatementId(a,before);
  if(before.statementDate&&next.dueDate&&next.dueDate<before.statementDate)throw new Error('The due date cannot precede the statement date.');
  next.statementDetails={...before,id,statementBalance:next.statementBalance,dueDate:next.dueDate};
  if(a.statementBalance!==next.statementBalance||a.dueDate!==next.dueDate)next.statementCorrections=[...(a.statementCorrections||[]),{id:acctFinId('correction'),statementId:id,at:Date.now(),reason:'Statement field corrected',before,after:next.statementDetails}];
}
function acctFinReconcileReceipt(a,balance,note){
  a.reconciliations=[...(a.reconciliations||[]),{id:acctFinId('balance-check'),date:getLocalDate(),at:Date.now(),previousBalance:a.current,confirmedBalance:balance,difference:acctFinMoney((acctFinCents(balance)-acctFinCents(a.current))/100),note:String(note||'').trim().slice(0,200)}];
}
function acctFinReconcileBuild(list,inputs){
  if(!inputs.length)throw new Error('Enter at least one bank balance. Blank fields are left unchanged.');
  const next=acctFinClone(list),seen=new Set();
  for(const input of inputs){
    const a=next.find(a=>a.id===input.id);if(!a||a.archivedAt||seen.has(input.id))throw new Error('Choose each active account once.');seen.add(input.id);
    if(!/^-?\d+(?:\.\d{1,2})?$/.test(String(input.balance).trim()))throw new Error('Enter balances with at most two decimal places.');
    const balance=acctFinMoney(input.balance);acctFinReconcileReceipt(a,balance,input.note);acctLinkSnapshot(a,balance);a.balanceEpoch=acctFinId('balance');a.current=balance;
    a.history=[...(a.history||[]).filter(r=>r.date!==getLocalDate()),{date:getLocalDate(),balance}].sort((x,y)=>x.date.localeCompare(y.date));
  }return next;
}
function acctFinActivity(a){
  const rows=[],current=acctFinEpoch(a),classify=r=>r.accountLink?(r.accountLink.anchor===current?'Included in calculated balance':'Included before a confirmed balance'):'Budget record only';
  const tx=lsLoad('daily_transactions',[]),ledger=lsLoad('daily_ledger',[]);
  (Array.isArray(tx)?tx:[]).filter(r=>r.acctId===a.id).forEach(r=>rows.push({date:r.date,amount:r.amount,label:r.merchant||r.note||'Expense',kind:Number(r.amount)<0?'Refund':'Spending',detail:classify(r)}));
  (Array.isArray(ledger)?ledger:[]).filter(r=>r.acctId===a.id).forEach(r=>rows.push({date:r.date,amount:r.amount,label:r.note||r.kind,kind:r.kind==='income'?'Income':r.kind==='bill_payment'?'Bill payment':r.kind,detail:classify(r)}));
  (a.balanceMovements||[]).forEach(r=>rows.push({date:r.date,amount:r.amount,label:r.fromAcctId===a.id?'To '+r.toName:'From '+r.fromName,kind:r.paymentId?'Repayment':'Transfer',detail:r.status==='void'?'Voided':'Recorded balance movement'}));
  (a.repayments||[]).filter(p=>!p.affectsBalances).forEach(p=>rows.push({date:p.date,amount:p.amount,label:p.reference||p.fromName||'Repayment',kind:acctFinPaymentStatus(p),detail:'Record only · '+fmtMoneyExact(p.applied||0)+' matched'}));
  (a.reconciliations||[]).forEach(r=>rows.push({date:r.date,amount:r.confirmedBalance,label:r.note||'Bank balance confirmed',kind:'Balance check',detail:'Previously '+fmtMoneyExact(r.previousBalance)+' · difference '+fmtMoneyExact(r.difference)}));
  return rows.sort((x,y)=>String(y.date||'').localeCompare(String(x.date||'')));
}
function acctFinActivityOpen(id){
  const a=loadAccounts().find(a=>a.id===id);if(!a)return;const rows=acctFinActivity(a);
  acctToolDraft={kind:'reconcile',id,signature:acctLinkSignature()};
  acctToolForm(escText(a.name)+' · activity','<p>Current '+fmtMoneyExact(a.current)+(a.type==='debt'?' owed':'')+'. Check the posted balance shown by your bank. The difference is a balance correction, not invented spending or income.</p>'+
    '<div class="fin-activity">'+(rows.length?rows.slice(0,200).map(r=>'<div class="acct-record"><strong>'+fmtMoneyExact(Number(r.amount)||0)+'</strong><span>'+escText(r.kind)+' · '+escText(r.date?fmtDate(r.date):'Date not recorded')+'</span><small>'+escText(r.label)+'</small><small>'+escText(r.detail)+'</small></div>').join(''):'<p>No dated activity recorded for this account.</p>')+'</div>'+
    (rows.length>200?'<p>Showing the latest 200 records. All records remain in your export.</p>':'')+
    acctToolField('fin-reconcile-balance','Current bank balance','text','')+'<div class="stg-field"><label for="fin-reconcile-note">Note (optional)</label><input id="fin-reconcile-note" maxlength="200"></div><p>Confirming a bank balance starts a fresh tracking point. Earlier entries remain in history and will not apply again.</p>',
    'acctFinReconcileConfirm','Confirm bank balance');
}
function acctFinReconcileConfirm(){if(acctToolDraft?.kind!=='reconcile')return false;return acctFinAccountSave((list,d)=>acctFinReconcileBuild(list,[{id:d.id,balance:document.getElementById('fin-reconcile-balance').value,note:document.getElementById('fin-reconcile-note').value}]));}
function acctFinCheckinOpen(ids){
  const list=loadAccounts().filter(a=>!a.archivedAt&&(!Array.isArray(ids)||ids.includes(a.id)));if(!list.length){showToast('Add an account first.');return;}
  acctToolDraft={kind:'checkin',signature:acctLinkSignature()};
  acctToolForm(Array.isArray(ids)?'Savings balance check':'Weekly account check-in','<p>Update whichever accounts you checked. Leave the rest blank. This works even when you have not logged individual purchases; spending, income and budgets stay unchanged.</p>'+
    list.map(a=>'<div class="stg-field"><label for="fin-check-'+escAttr(a.id)+'">'+escText(a.name)+' · Daily '+fmtMoneyExact(a.current)+(a.type==='debt'?' owed':'')+'</label><input id="fin-check-'+escAttr(a.id)+'" data-check-account="'+escAttr(a.id)+'" type="text" inputmode="decimal" placeholder="Leave unchanged"></div>').join('')+
    '<div class="stg-field"><label for="fin-check-note">Check-in note (optional)</label><input id="fin-check-note" maxlength="200"></div><p>Use posted balances, not available credit or spending limits. Linked tracking continues from the balances you confirm.</p>',
    'acctFinCheckinConfirm','Save checked balances');
}
function acctFinCheckinConfirm(){
  if(acctToolDraft?.kind!=='checkin')return false;
  const inputs=[...document.querySelectorAll('[data-check-account]')].filter(el=>el.value.trim()!=='').map(el=>({id:el.dataset.checkAccount,balance:el.value,note:document.getElementById('fin-check-note').value}));
  return acctFinAccountSave(list=>acctFinReconcileBuild(list,inputs));
}
function acctFinSavingsOpen(id){
  const a=loadAccounts().find(a=>a.id===id);if(!a||!acctIsSaver(a))return;const p=a.savingsPlan||{};
  acctToolDraft={kind:'savings-plan',id,signature:acctLinkSignature()};
  acctToolForm('Savings preferences','<p>Choose what Daily suggests when you finish a budget. Each transfer still needs your review and confirmation that it has posted.</p>'+
    '<div class="stg-field"><label for="fin-savings-mode">When a budget is finished</label><select id="fin-savings-mode"><option value="review"'+(p.mode!=='manual'?' selected':'')+'>Offer a transfer review</option><option value="manual"'+(p.mode==='manual'?' selected':'')+'>Keep savings updates manual</option></select></div>'+
    '<div class="stg-field"><label for="fin-savings-from">Usual source account (optional)</label><select id="fin-savings-from"><option value="">Choose each time</option>'+loadAccounts().filter(x=>acctTransferSource(x)&&x.id!==id).map(x=>'<option value="'+escAttr(x.id)+'"'+(p.fromId===x.id?' selected':'')+'>'+escText(x.name)+'</option>').join('')+'</select></div>'+
    acctToolField('fin-savings-goal','Savings balance goal (optional)','text',p.goal??'')+acctToolField('fin-savings-date','Goal date (optional)','date',p.targetDate||'')+
    '<p>Goals are planning figures. Only confirmed balance changes or posted transfers change the account.</p>','acctFinSavingsConfirm','Save savings preferences');
}
function acctFinSavingsConfirm(){
  if(acctToolDraft?.kind!=='savings-plan')return false;
  return acctFinAccountSave((list,d)=>{const fromId=document.getElementById('fin-savings-from').value,date=document.getElementById('fin-savings-date').value;
    if(fromId&&!list.some(a=>a.id===fromId&&acctTransferSource(a)&&a.id!==d.id))throw new Error('Choose an active source account.');
    if(date&&!budDateValid(date))throw new Error('Choose a valid goal date.');
    return list.map(a=>a.id===d.id?{...a,savingsPlan:{mode:document.getElementById('fin-savings-mode').value,fromId,goal:acctMoney(document.getElementById('fin-savings-goal').value,true),targetDate:date}}:a);});
}
function acctFinBudgetMoved(list,key){const seen=new Set();let amount=0;list.forEach(a=>(a.balanceMovements||[]).forEach(r=>{if(r.budgetKey===key&&r.status!=='void'&&!seen.has(r.id)){seen.add(r.id);amount+=acctFinCents(r.amount);}}));return amount/100;}
function acctFinSavingsOffer(proposal){
  const list=loadAccounts(),savers=list.filter(a=>acctIsSaver(a)&&!a.archivedAt),allowed=savers.filter(a=>a.savingsPlan?.mode!=='manual');
  if(!allowed.length)return;
  const remaining=acctFinMoney(Math.max(0,(acctFinCents(proposal.amount)-acctFinCents(acctFinBudgetMoved(list,proposal.key)))/100));
  if(!remaining){showToast('Savings for this budget is already recorded.');return;}
  acctTransferOpen({...proposal,amount:remaining,limit:proposal.amount,allowedTargets:allowed.map(a=>a.id)});
  if(acctToolDraft?.kind!=='transfer')return;
  if(allowed.length===1){document.getElementById('acct-transfer-to').value=allowed[0].id;document.getElementById('acct-transfer-from').value=allowed[0].savingsPlan?.fromId||'';acctTransferPreview();}
}
function acctFinArchiveOpen(id){
  const a=loadAccounts().find(a=>a.id===id);if(!a)return;
  acctToolDraft={kind:'archive',id,signature:acctLinkSignature()};
  acctToolForm(a.archivedAt?'Restore account':'Archive account','<p>'+escText(a.name)+'. '+(a.archivedAt?
    'Restore this account to your active accounts with its retained balance and history.':
    'Archive this account with its recorded balance of '+fmtMoneyExact(a.current)+'. Its balance, history, statements and payment records are kept. It will be excluded from active totals and reminders. Archiving does not settle a debt or cancel a payment. You can restore it later.')+'</p>',
    'acctFinArchiveConfirm',a.archivedAt?'Restore account':'Archive account');
}
function acctFinArchiveConfirm(){
  if(acctToolDraft?.kind!=='archive')return false;
  return acctFinAccountSave((list,d)=>list.map(a=>{if(a.id!==d.id)return a;const next={...a};if(a.archivedAt){delete next.archivedAt;return next;}
    // Freeze its recorded balance, including nonzero assets/debts. A later historical
    // purchase correction cannot silently change an archived account. No settlement occurs.
    if(acctLinkActive(next)){acctLinkCheckpoint(next);delete next.balanceLink;}
    next.balanceEpoch=acctFinId('balance');
    next.archivedAt=Date.now();return next;}));
}
function acctFinArchivedHtml(){const list=loadAccounts().filter(a=>a.archivedAt);return list.length?'<details class="card acct-records"><summary>Archived accounts ('+list.length+')</summary>'+list.map(a=>'<div class="acct-record"><strong>'+escText(a.name)+'</strong><span>Retained balance '+fmtMoneyExact(a.current)+'</span>'+acctFinButton('Restore','acctFinArchiveOpen',a.id)+'</div>').join('')+'</details>':'';}
