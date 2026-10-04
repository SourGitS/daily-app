'use strict';

const BUD_PERIOD_FREQUENCIES=[['weekly','Weekly'],['fortnightly','Fortnightly'],['monthly','Monthly'],['custom','Custom dates']];
let budPeriodOffset=0, budPeriodSelected='', budLegacyOpen=false;
function budDateValid(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
  const d=new Date(value+'T12:00:00Z');
  return !isNaN(d)&&d.toISOString().slice(0,10)===value;
}
function budDateAdd(value,n){
  const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);
}
function budDateDays(a,b){return Math.round((new Date(b+'T12:00:00Z')-new Date(a+'T12:00:00Z'))/864e5);}
function budDateMonth(anchor,n){
  const d=new Date(anchor+'T12:00:00Z'),day=d.getUTCDate();
  d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
  d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10);
}
function budPeriodRange(config,today,offset){
  if(!config||!budDateValid(config.anchor)||!budDateValid(today))return null;
  const anchor=config.anchor,shift=Number(offset)||0;
  let start,end;
  if(config.frequency==='monthly'){
    const a=new Date(anchor+'T12:00:00Z'),d=new Date(today+'T12:00:00Z');
    let n=(d.getUTCFullYear()-a.getUTCFullYear())*12+d.getUTCMonth()-a.getUTCMonth();
    if(budDateMonth(anchor,n)>today)n--;
    n+=shift;start=budDateMonth(anchor,n);end=budDateAdd(budDateMonth(anchor,n+1),-1);
  }else{
    const days=config.frequency==='weekly'?7:config.frequency==='fortnightly'?14:
      config.frequency==='custom'&&budDateValid(config.end)?budDateDays(anchor,config.end)+1:0;
    if(days<1||days>366)return null;
    // Custom dates are an explicit range; navigation moves by its chosen length.
    const n=(config.frequency==='custom'?0:Math.floor(budDateDays(anchor,today)/days))+shift;
    start=budDateAdd(anchor,n*days);end=budDateAdd(start,days-1);
  }
  return {id:start+'_'+end,start,end,days:budDateDays(start,end)+1};
}
function budCyclesLoad(){
  const v=lsLoad('daily_budget_cycles',null);
  return v&&typeof v==='object'&&!Array.isArray(v)?{config:v.config||null,periods:v.periods||{}}:{config:null,periods:{}};
}
function budCyclesSave(v){lsSave('daily_budget_cycles',v,'budgetCycles');}
function budPeriodActive(){return !!budPeriodCurrent();}
function budPeriodCurrent(){return budPeriodRange(budCyclesLoad().config,getLocalDate(),0);}
function budPeriodViewed(){
  const s=budCyclesLoad(),saved=s.periods[budPeriodSelected];
  return saved&&budDateValid(saved.start)&&budDateValid(saved.end)
    ?{id:budPeriodSelected,start:saved.start,end:saved.end,days:budDateDays(saved.start,saved.end)+1}
    :budPeriodRange(s.config,getLocalDate(),budPeriodOffset);
}
function budPeriodLabel(p){
  if(!p)return '';
  const label=budRangeLabel(localMidnight(p.start),localMidnight(p.end));
  const a=p.start.slice(0,4),b=p.end.slice(0,4);
  return label+(a!==b?' · '+a+'–'+b:a!==getLocalDate().slice(0,4)?' · '+a:'');
}
function budMoneyRound(n){return Math.round((Number(n)||0)*100)/100;}
function budPeriodCompute(range,record,events,expenses,periods,legacy){
  const r=record||{},within=x=>x&&budDateValid(x.date)&&x.date>=range.start&&x.date<=range.end&&!x.deletedAt;
  const rows=(events||[]).filter(within),purchases=(expenses||[]).filter(within);
  const sum=items=>budMoneyRound(items.reduce((a,x)=>a+(Number(x.amount)||0),0));
  const income=sum(rows.filter(x=>x.kind==='income'))+(legacy?.income||0);
  const payments=rows.filter(x=>x.kind==='bill_payment');
  const paidBy={};payments.forEach(x=>{paidBy[x.fixCatId]=(paidBy[x.fixCatId]||0)+(Number(x.amount)||0);});
  const reserved=Object.entries(r.reserves||{}).reduce((a,[id,n])=>a+Math.max(0,(Number(n)||0)-(paidBy[id]||0)),0);
  const incoming=Object.values(periods||{}).reduce((a,p)=>a+(p.rollover?.to===range.id&&p.rollover.destination==='budget'?(Number(p.rollover.amount)||0):0),0);
  const outgoing=Number(r.rollover?.amount)||0;
  const spent=sum(purchases)+(legacy?.spent||0),billPaid=sum(payments),opening=Number(r.opening)||0,savings=Number(r.savings)||0;
  const funded=income+opening+incoming;
  const known=budMoneyRound(funded-spent-billPaid-reserved-savings-outgoing);
  const incomplete=!!legacy?.incomplete,allocationReview=!!legacy?.allocationReview&&!r.fundingConfirmed;
  return {range,record:r,rows,purchases,income:budMoneyRound(income),spent:budMoneyRound(spent),billPaid,
    reserved:budMoneyRound(reserved),opening,savings,incoming:budMoneyRound(incoming),outgoing,
    funded:budMoneyRound(funded),known,available:incomplete||allocationReview||(!funded&&!r.fundingConfirmed)?null:known,incomplete,allocationReview,
    legacyIncome:legacy?.income||0,legacySpent:legacy?.spent||0};
}
function budPeriodLegacy(range){
  let income=0,spent=0,incomplete=false,allocationReview=false;
  Object.entries(budgetData||{}).forEach(([start,w])=>{
    if(!budDateValid(start))return;
    const end=budDateAdd(start,6);if(end<range.start||start>range.end)return;
    if(Number(w.sav_amount)>0||Object.values(w.fixRates||{}).some(n=>Number(n)>0)||Object.keys(w).some(k=>k.startsWith('fix_')&&Number(w[k])>0))allocationReview=true;
    const datedIncome=ledgerOf('income').filter(x=>x.date>=start&&x.date<=end).reduce((s,x)=>s+(Number(x.amount)||0),0);
    const datedSpend=txnData.filter(x=>x.date>=start&&x.date<=end).reduce((s,x)=>s+(Number(x.amount)||0),0);
    const oldIncome=Math.max(0,weekIncome(w)-datedIncome),oldSpend=Math.max(0,weekVarTotal(w,start)-datedSpend);
    if(start>=range.start&&end<=range.end){income+=oldIncome;spent+=oldSpend;}
    else if(oldIncome>.005||oldSpend>.005)incomplete=true;
    // Fixed totals may be weekly accruals, not dated payments: retain them in weekly history.
  });
  return {income:budMoneyRound(income),spent:budMoneyRound(spent),incomplete,...(allocationReview?{allocationReview:true}:{})};
}
function budPeriodMoney(range){
  const p=range||budPeriodCurrent();if(!p)return null;
  const store=budCyclesLoad();return budPeriodCompute(p,store.periods[p.id],ledgerData,txnData,store.periods,budPeriodLegacy(p));
}
function budPeriodNavigate(n){budPeriodSelected='';budPeriodOffset=n===0?0:budPeriodOffset+n;renderBudgetTab();}
function budPeriodRefresh(){
  if(S.view==='budget')renderBudgetTab();
  if(S.view==='home')renderHome();
  if(S.view==='stats')refreshStatsForData(['finance','overview','review']);
}
function budPeriodDialog(title,html){
  let d=document.getElementById('bud-period-dialog');
  if(!d){d=document.createElement('dialog');d.id='bud-period-dialog';d.className='bp-dialog';document.body.appendChild(d);}
  d.innerHTML='<form id="bp-form"><div class="bp-dialog-head"><h2>'+escText(title)+'</h2><button type="button" aria-label="Close" onclick="document.getElementById(\'bud-period-dialog\').close()">×</button></div>'+html+'<p id="bp-error" role="alert"></p><div class="bp-actions"><button type="button" class="stg-btn" onclick="document.getElementById(\'bud-period-dialog\').close()">Cancel</button><button type="submit" class="stg-btn primary">Save</button></div></form>';
  if(!d.open)d.showModal();return d;
}
function budPeriodError(message){document.getElementById('bp-error').textContent=message;}
function budPeriodSetup(){
  const store=budCyclesLoad(),config=store.config||{};
  const main=activeCats(loadIncCats()).find(c=>c.payDate&&['weekly','fortnightly','monthly'].includes(c.payCycle));
  const frequency=config.frequency||main?.payCycle||'weekly',anchor=config.anchor||main?.payDate||dateStr(getMondayOf(0));
  budPeriodDialog('Choose your budget period','<p>Choose the dates your spending budget covers. Your income sources can each have their own pay schedule.</p>'+
    '<label>Budget frequency<select name="frequency">'+BUD_PERIOD_FREQUENCIES.map(([id,label])=>'<option value="'+id+'"'+(frequency===id?' selected':'')+'>'+label+'</option>').join('')+'</select></label>'+
    '<label>Starting date<input type="date" name="anchor" required value="'+escAttr(anchor)+'"></label>'+
    '<label>Ending date <small>For custom dates only</small><input type="date" name="end" value="'+escAttr(config.end||'')+'"></label>'+
    '<p class="bp-note">Weekly history stays available. Changing the schedule keeps saved period plans and never divides old weekly totals into invented dates.</p>');
  document.getElementById('bp-form').onsubmit=e=>{
    e.preventDefault();const f=new FormData(e.target),next={frequency:f.get('frequency'),anchor:f.get('anchor'),end:f.get('end')};
    if(!budPeriodRange(next,getLocalDate(),0)){budPeriodError('Choose valid dates. Custom periods can cover 1–366 days.');return;}
    const previous=budPeriodCurrent();
    if(previous&&!store.periods[previous.id])store.periods[previous.id]={start:previous.start,end:previous.end,updatedAt:Date.now()};
    store.config=next;budCyclesSave(store);budPeriodOffset=0;budPeriodSelected='';budLegacyOpen=false;
    document.getElementById('bud-period-dialog').close();setView('budget');setBudgetView('week');budPeriodRefresh();
  };
}
function budPeriodAdjust(){
  const p=budPeriodViewed();if(!p)return budPeriodSetup();
  const store=budCyclesLoad(),r=store.periods[p.id]||{},cats=activeCats(loadFixCats());
  budPeriodDialog('Allocate this budget','<p>'+escText(budPeriodLabel(p))+'</p>'+
    '<label>Existing money allocated to this period<input name="opening" type="number" min="0" step="0.01" value="'+(r.opening||'')+'" placeholder="0"></label>'+
    '<p class="bp-note">Only money available from before this period. Income received during these dates belongs in Record income.</p>'+
    '<label>Savings allocation<input name="savings" type="number" min="0" step="0.01" value="'+(r.savings||'')+'" placeholder="0"></label>'+
    '<label>Spending goal<input name="goal" type="number" min="0" step="0.01" value="'+(r.goal??'')+'" placeholder="Optional"></label>'+
    '<h3>Total bill allowances</h3><p class="bp-note">Include payments already recorded in this period. Only the unpaid part stays reserved, so a bill is never deducted twice. This does not mark a bill paid or move money between accounts.</p>'+
    cats.map(c=>'<label>'+escText(catLabel(c))+'<small>'+fmtMoneyExact(Number(catAmount(c))||0)+' '+escText(catCycle(c))+'</small><input name="reserve:'+escAttr(c.id)+'" type="number" min="0" step="0.01" value="'+(r.reserves?.[c.id]??'')+'" placeholder="0"></label>').join(''));
  document.getElementById('bp-form').onsubmit=e=>{
    e.preventDefault();const f=new FormData(e.target),reserves={...(r.reserves||{})};
    cats.forEach(c=>reserves[c.id]=budMoneyRound(f.get('reserve:'+c.id)));
    store.periods[p.id]={...r,start:p.start,end:p.end,opening:budMoneyRound(f.get('opening')),savings:budMoneyRound(f.get('savings')),
      goal:f.get('goal')===''?null:budMoneyRound(f.get('goal')),reserves,fundingConfirmed:true,updatedAt:Date.now()};
    budCyclesSave(store);document.getElementById('bud-period-dialog').close();budPeriodRefresh();
  };
}
function budPeriodRecord(kind){
  const income=kind==='income',cats=activeCats(income?loadIncCats():loadFixCats());
  if(!cats.length){showToast(income?'Add an income source in Budget setup first.':'Add a bill in Budget setup first.');openBudgetEditor();return;}
  const hasUndatedIncome=income&&Object.entries(budgetData).some(([week,w])=>budDateValid(week)&&
    weekIncome(w)-ledgerOf('income').filter(x=>x.date>=week&&x.date<=budDateAdd(week,6)).reduce((sum,x)=>sum+Number(x.amount||0),0)>.005);
  budPeriodDialog(income?'Record received income':'Record a bill payment',
    '<label>'+(income?'Income source':'Bill')+'<select name="category">'+cats.map(c=>'<option value="'+escAttr(c.id)+'">'+escText(catLabel(c))+'</option>').join('')+'</select></label>'+
    '<label>Amount received / paid<input name="amount" type="number" min="0.01" step="0.01" required inputmode="decimal"></label>'+
    '<label>Date<input name="date" type="date" required max="'+getLocalDate()+'" value="'+getLocalDate()+'"></label>'+
    (hasUndatedIncome?'<label>Is this income already in weekly history?<select name="weekMode"><option value="">New payment (usual choice)</option><option value="add">Additional to an older weekly total</option><option value="record_only">Already included — add its payment date only</option></select></label>':'')+
    '<label>Note<input name="note" maxlength="200"></label><p class="bp-note">Record actual '+(income?'money received':'payments')+'. Account balances remain your separately recorded balances.</p>');
  document.getElementById('bp-form').onsubmit=e=>{
    e.preventDefault();const f=new FormData(e.target),amount=budMoneyRound(f.get('amount')),date=f.get('date'),id=f.get('category');
    if(!(amount>0)||!budDateValid(date)||date>getLocalDate()){budPeriodError('Enter a positive amount and a date on or before today.');return;}
    const wk=txnWeekOf(date),field='inc_'+id,w=budgetData[wk]||{},before=Number(w[field])||0;
    let mode=f.get('weekMode')||'add';
    const dated=ledgerOf('income').filter(x=>x.streamId===id&&txnWeekOf(x.date)===wk).reduce((sum,x)=>sum+Number(x.amount||0),0);
    if(income&&before-dated>.005&&!f.get('weekMode')){budPeriodError('This week has older income without payment dates. Choose whether this payment is additional or already included.');return;}
    if(income&&mode==='record_only'&&amount>before-dated+.005){budPeriodError('This is more than the undated income left in that week. Record additional income instead.');return;}
    const entry={id:genLedgerId(),kind,date,amount,note:f.get('note'),createdAt:Date.now(),manual:true};
    if(income){entry.streamId=id;entry.weekKey=wk;entry.weekMode=mode;entry.weekBefore=before;entry.weekAfter=mode==='add'?budMoneyRound(before+amount):before;}
    else entry.fixCatId=id;
    ledgerData.push(entry);saveLedger();
    if(income&&mode==='add'){
      budgetData[wk]={...w,wk,[field]:String(entry.weekAfter),draft:!w.saved,updatedAt:Date.now()};budSaveData(wk);
    }
    document.getElementById('bud-period-dialog').close();budPeriodRefresh();
  };
}
function budPeriodRollover(){
  const p=budPeriodViewed(),m=p&&budPeriodMoney(p);if(!m)return;
  if(p.end>=getLocalDate()){showToast('Rollover is available after this budget period ends.');return;}
  const store=budCyclesLoad(),r=store.periods[p.id]||{},next=budPeriodRange(store.config,budDateAdd(p.end,1),0);
  if(!next||next.start<=p.end){showToast('Choose the next budget dates before rolling over.');return;}
  const max=m.available===null?0:Math.max(0,m.available+m.outgoing);
  budPeriodDialog('Choose what carries forward','<p>'+escText(budPeriodLabel(p))+' → '+escText(budPeriodLabel(next))+'</p>'+
    '<label>Amount<input type="number" name="amount" min="0" max="'+max+'" step="0.01" value="'+(r.rollover?.amount||max)+'"></label>'+
    '<label>Use this money<select name="destination">'+[['budget','Carry into the next budget'],['savings','Reserve as a savings allocation'],['unallocated','Leave unallocated']].map(([id,label])=>'<option value="'+id+'"'+(r.rollover?.destination===id?' selected':'')+'>'+label+'</option>').join('')+'</select></label>'+
    '<p class="bp-note">This moves a budget allocation, not money in your accounts. No income or savings deposit is created.</p>');
  document.getElementById('bp-form').onsubmit=e=>{
    e.preventDefault();const f=new FormData(e.target),amount=budMoneyRound(f.get('amount'));
    if(m.incomplete||amount<0||amount>max){budPeriodError('Only a known positive remainder can be rolled over. Review the period first.');return;}
    store.periods[p.id]={...r,start:p.start,end:p.end,rollover:{to:next.id,amount,destination:f.get('destination')},updatedAt:Date.now()};
    budCyclesSave(store);document.getElementById('bud-period-dialog').close();budPeriodRefresh();
  };
}
function budPeriodHero(m,compact){
  const p=m.range,remaining=m.available,label=budPeriodLabel(p);
  const days=Math.max(0,budDateDays(getLocalDate()>p.start?getLocalDate():p.start,p.end)+1);
  const pay=nextPayInfo();
  return '<div class="bp-hero'+(compact?' bp-hero-compact':'')+'"><div class="bp-eyebrow">Budget · '+escText(label)+'</div>'+
    '<div class="bp-amount">'+(remaining===null?'—':fmtMoneyExact(remaining))+'</div><div>Remaining spending budget</div>'+
    '<p>'+(days?days+' days left':'Period ended')+(pay?' · Next pay '+escText(fmtDate(dateStr(pay.date))):'')+'</p>'+
    (m.incomplete?'<p class="bp-warning">Some older weekly totals overlap these dates. Review Weekly history; Daily cannot assign them to individual days. Dated records and allocations below remain available.</p>':
      m.allocationReview?'<p class="bp-warning">This period overlaps older weekly bill or savings allocations. Use Adjust budget to confirm the allowances for these dates; the original plans remain in Weekly history.</p>':remaining===null?'<p>Record received income or allocate existing money to begin.</p>':'')+
    (compact?'':statsSplit([['Received',fmtMoneyExact(m.income)],['Spent',fmtMoneyExact(m.spent+m.billPaid)],['Reserved for bills',fmtMoneyExact(m.reserved)],['Savings allocation',fmtMoneyExact(m.savings)]])+ '<p class="bp-note">A budget allocation, separate from account balances.</p>')+
    '<div class="bp-actions"><button class="stg-btn primary" onclick="openTxnModal({date:getLocalDate()})">＋ Add expense</button>'+
    '<button class="stg-btn" onclick="budPeriodRecord(\'income\')">Record income</button></div></div>';
}
function budPeriodScheduleHtml(p){
  const bills=billOccurrences(localMidnight(p.start),localMidnight(p.end));
  return bills.length?bills.map(b=>'<div class="bp-row"><span>'+escText(b.name)+'<small>'+escText(fmtDate(b.key||dateStr(b.date)))+' · Scheduled bill</small></span><strong>'+fmtMoneyExact(b.amount)+'</strong></div>').join(''):'<p class="bp-note">No dated bills scheduled in these dates.</p>';
}
function budPeriodPage(){
  const p=budPeriodViewed(),store=budCyclesLoad();
  if(!p)return '<div class="card bp-start">'+cardHeader('wallet','A budget that fits your pay')+'<h2>Choose the dates your money needs to cover.</h2><p>Weekly, fortnightly, monthly or your own dates. Add income once, record spending as it happens, and keep your bills in view.</p><div class="bp-actions"><button class="stg-btn primary" onclick="budPeriodSetup()">Choose my budget period</button><button class="stg-btn" onclick="openBudgetEditor()">Income &amp; bills setup</button></div><p class="bp-note">Existing weekly records remain in Weekly history below.</p></div>';
  const m=budPeriodMoney(p),r=m.record;
  const entries=m.rows.filter(x=>x.kind==='income'||x.kind==='bill_payment').map(x=>({date:x.date,amount:x.amount,eventId:x.manual?x.id:null,name:x.kind==='income'?'Income · '+(loadIncCats().find(c=>c.id===x.streamId)?.name||'Income source'):'Bill payment · '+(loadFixCats().find(c=>c.id===x.fixCatId)?.name||'Bill')}))
    .concat(m.purchases.map(x=>({date:x.date,amount:x.amount,name:x.merchant||loadVarCats().find(c=>c.id===x.catId)?.name||'Expense',expenseId:x.id}))).sort((a,b)=>b.date.localeCompare(a.date));
  const goal=Number(r.goal)||0,goalCopy=goal?fmtMoneyExact(m.spent)+' of '+fmtMoneyExact(goal):'No spending goal set';
  return '<div class="bp-navigation"><button class="stg-btn" aria-label="Previous budget period" onclick="budPeriodNavigate(-1)">←</button><button class="stg-btn" onclick="budPeriodNavigate(0)">Current budget</button><button class="stg-btn" aria-label="Next budget period" onclick="budPeriodNavigate(1)">→</button><button class="stg-btn" onclick="budPeriodSetup()">Period settings</button><button class="stg-btn" onclick="budPeriodCSV()">Export period</button></div>'+
    budPeriodHero(m,false)+'<div class="bp-grid"><section class="card">'+cardHeader('wallet','Your allocation')+
    '<div class="bp-row"><span>Existing money allocated</span><strong>'+fmtMoneyExact(m.opening)+'</strong></div><div class="bp-row"><span>Carried in</span><strong>'+fmtMoneyExact(m.incoming)+'</strong></div>'+
    '<div class="bp-row"><span>Spending goal</span><strong>'+goalCopy+'</strong></div>'+
    (goal?'<div class="card-bar"><div class="card-bar-fill" style="width:'+Math.min(100,m.spent/goal*100)+'%"></div></div>':'')+
    '<p class="bp-note">'+(goal?(m.spent>goal?'Above your spending goal.':fmtMoneyExact(goal-m.spent)+' to your spending goal.'):'Set a spending goal when allocating this period.')+'</p>'+
    (m.outgoing?'<p>'+fmtMoneyExact(m.outgoing)+' '+(r.rollover.destination==='budget'?'carried forward':r.rollover.destination==='savings'?'reserved as savings':'left unallocated')+'</p>':'')+
    '<div class="bp-actions"><button class="stg-btn" onclick="budPeriodAdjust()">Adjust budget</button><button class="stg-btn" onclick="budPeriodRollover()">Rollover</button></div></section>'+
    '<section class="card">'+cardHeader('calendar','Bills in this period')+budPeriodScheduleHtml(p)+'<div class="bp-actions"><button class="stg-btn" onclick="budPeriodRecord(\'bill_payment\')">Record bill payment</button><button class="stg-btn" onclick="openBudgetEditor()">Income &amp; bills setup</button></div></section>'+
    '<section class="card bp-span">'+cardHeader('list','Recorded activity')+(entries.length?entries.map(x=>'<div class="bp-row"><span>'+escText(x.name)+'<small>'+escText(fmtDate(x.date))+'</small></span><strong>'+fmtMoneyExact(x.amount)+'</strong>'+(x.expenseId?'<button class="stg-btn quiet" data-entry-id="'+escAttr(x.expenseId)+'" onclick="openTxnModal({id:this.dataset.entryId})">Edit</button>':x.eventId?'<button class="stg-btn quiet" data-entry-id="'+escAttr(x.eventId)+'" onclick="budPeriodEdit(this.dataset.entryId)">Edit</button>':'')+'</div>').join(''):'<p>No dated income or spending recorded for this period yet.</p>')+
    ((m.legacyIncome||m.legacySpent)?'<p class="bp-note">Includes '+fmtMoneyExact(m.legacyIncome)+' income and '+fmtMoneyExact(m.legacySpent)+' spending from complete legacy weeks. Those totals have no individual payment dates.</p>':'')+'</section></div>'+
    '<label class="bp-history">Saved period plans<select onchange="budPeriodSelected=this.value;renderBudgetTab()"><option value="">Current schedule</option>'+Object.entries(store.periods).sort((a,b)=>b[0].localeCompare(a[0])).map(([id,b])=>'<option value="'+escAttr(id)+'"'+(id===budPeriodSelected?' selected':'')+'>'+escText(budPeriodLabel(b))+'</option>').join('')+'</select></label>';
}
function budPeriodRender(){
  const host=document.getElementById('budget-period-view'),legacy=document.getElementById('budget-legacy-week');if(!host||!legacy)return;
  host.innerHTML=budPeriodPage()+'<button class="stg-btn bp-legacy-toggle" aria-expanded="'+budLegacyOpen+'" onclick="budLegacyOpen=!budLegacyOpen;renderBudgetTab()">'+(budLegacyOpen?'Hide':'Open')+' weekly history &amp; legacy editor</button>';
  legacy.classList.toggle('hidden',!budLegacyOpen);
}
function budPeriodOverview(){
  const p=budPeriodCurrent(),host=document.getElementById('budget-overview-view');if(!host)return false;
  if(!p){host.innerHTML=budPeriodPage()+'<div class="bp-grid"><section class="card">'+cardHeader('calendar','Scheduled bills')+budPeriodScheduleHtml({start:getLocalDate(),end:budDateAdd(getLocalDate(),13)})+'</section><section>'+budOvAccountsHtml()+budOvMonthHtml()+'</section></div>';return true;}
  const m=budPeriodMoney(p);host.innerHTML=budPeriodHero(m,false)+'<div class="bp-grid"><section class="card">'+cardHeader('calendar','Next 14 days')+budPeriodScheduleHtml({start:getLocalDate(),end:budDateAdd(getLocalDate(),13)})+'<button class="stg-btn" onclick="setBudgetView(\'week\')">Open Budget →</button></section><section>'+budOvAccountsHtml()+budOvMonthHtml()+'</section></div>';return true;
}
function budPeriodHomeCard(){
  const m=budPeriodMoney();if(!m)return '<div class="card home-budget-card">'+cardHeader('wallet','Budget')+'<h3>Your money, on your dates</h3><p class="card-cap">Choose a budget period. Your weekly history stays available.</p><button class="home-budget-add-labelled" onclick="budPeriodSetup()">Set up budget →</button></div>';
  const goal=Number(m.record.goal)||0;
  return '<div class="card home-budget-card">'+cardHeader('wallet','Budget · '+budPeriodLabel(m.range))+
    '<div class="card-fig">'+(m.available===null?'—':fmtMoneyExact(m.available))+'</div><div class="card-fig-u">Remaining spending budget</div>'+
    '<p class="card-cap">'+(m.incomplete?'Review overlapping weekly totals':fmtMoneyExact(m.income)+' income received')+'</p>'+
    '<button class="home-budget-add-labelled" onclick="openTxnModal({date:getLocalDate()})">＋ Add expense</button>'+
    '<div class="home-budget-spending"><span>Spending goal</span><strong>'+fmtMoneyExact(m.spent)+(goal?' / '+fmtMoneyExact(goal):' spent')+'</strong></div>'+
    (goal?'<div class="card-bar"><div class="card-bar-fill" style="width:'+Math.min(100,m.spent/goal*100)+'%"></div></div>':'')+
    '<div class="home-budget-footer"><span class="card-cap">'+(goal?(m.spent>goal?'Above goal':fmtMoneyExact(goal-m.spent)+' to goal'):'No spending goal set')+'</span><button class="home-budget-link" onclick="homeOpenBudgetWeek()">View budget ↗</button></div></div>';
}
function dailyUpdateBannerHtml(){
  if(typeof profileData==='undefined'||profileData.budgetRhythmSeen>=1||!profileData.onboardingVersion)return '';
  if(typeof auth!=='undefined'&&auth?.currentUser&&!_cloudWorkoutReady)return '';
  return '<aside class="daily-update-banner" aria-label="What’s new in Daily"><svg viewBox="0 0 180 100" aria-hidden="true"><rect x="10" y="12" width="160" height="78" rx="14" fill="currentColor" opacity=".12"/><path d="M10 36h160M44 7v17M136 7v17" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="44" cy="62" r="10" fill="currentColor"/><circle cx="136" cy="62" r="10" fill="none" stroke="currentColor" stroke-width="3"/><path d="M65 62h48m-8-7 8 7-8 7" fill="none" stroke="currentColor" stroke-width="3"/></svg><div><span class="bp-eyebrow">New in Daily</span><h2>Your budget, your rhythm</h2><p>Choose weekly, fortnightly, monthly or custom dates. Week is now Budget. Your desktop briefing is simpler, and Customise Home is easier to find.</p><div class="bp-actions"><button class="stg-btn primary" onclick="dailyUpdateDismiss();budPeriodSetup()">Choose my budget period</button><button class="stg-btn" onclick="dailyUpdateDismiss()">Later</button></div></div><button class="daily-update-close" aria-label="Dismiss update announcement" onclick="dailyUpdateDismiss()">×</button></aside>';
}
function dailyUpdateDismiss(){
  profileData.budgetRhythmSeen=1;localStorage.setItem('daily_profile',JSON.stringify(profileData));
  const r=fbRef('profile');if(r)r.child('budgetRhythmSeen').transaction(v=>Math.max(Number(v)||0,1));
  document.querySelectorAll('.daily-update-banner').forEach(e=>e.remove());
}
function dailyUpdateRefresh(){
  ['finance-update-announcement','home-update-announcement'].forEach(id=>{const slot=document.getElementById(id);if(slot)slot.innerHTML=dailyUpdateBannerHtml();});
}
function incomeTwiceMonthlyNext(c,from){
  if(!budDateValid(c.payDate)||!budDateValid(from))return null;
  const first=Number(c.payDate.slice(8)),second=Number(c.paySecondDay);
  if(!Number.isInteger(second)||second<1||second>31||first===second)return null;
  const start=from>c.payDate?from:c.payDate,d=localMidnight(start);
  for(let m=0;m<3;m++){
    const last=new Date(d.getFullYear(),d.getMonth()+m+1,0).getDate();
    const days=[...new Set([Math.min(first,last),Math.min(second,last)])].sort((a,b)=>a-b);
    for(const day of days){const date=new Date(d.getFullYear(),d.getMonth()+m,day);if(dateStr(date)>=start)return date;}
  }
  return null;
}
function budPeriodCheckin(){
  const m=budPeriodMoney();if(!m)return '';
  const pay=nextPayInfo();
  return '<div class="card">'+cardHeader('calendar','Finance check-in')+'<p>'+escText(budPeriodLabel(m.range))+'</p><p>'+(m.available===null?'Finish setting up your budget':fmtMoneyExact(m.available)+' remaining spending budget')+'</p><p class="card-cap">'+(pay?'Next scheduled pay: '+escText(pay.name)+' · '+escText(fmtDate(dateStr(pay.date))):'No next payday scheduled')+'</p><button class="stg-btn" onclick="openBudgetWeek()">Open Budget →</button></div>';
}
function budPeriodAllocationsCard(m,payTiles){
  return '<div class="card">'+cardHeader('wallet','Budget allocations')+'<p class="card-cap">'+escText(budPeriodLabel(m.range))+'</p>'+statsSplit([['Bills reserved',fmtMoneyExact(m.reserved)],['Savings allocation',fmtMoneyExact(m.savings)],['Carried in',fmtMoneyExact(m.incoming)]])+'<div class="mt-grid">'+payTiles+'</div></div>';
}
function budPeriodReport(hostId){
  const host=document.getElementById(hostId);if(!host)return;
  const id=hostId+'-period-report';let el=document.getElementById(id);
  if(!el){el=document.createElement('section');el.id=id;el.className='card bp-report';host.prepend(el);}
  const m=budPeriodMoney();if(!m){el.remove();return;}
  el.innerHTML=budPeriodReportHtml();
}
function budPeriodReportHtml(){
  const m=budPeriodMoney();if(!m)return '';
  return cardHeader('wallet','Current budget · '+budPeriodLabel(m.range))+statsSplit([['Income recorded',fmtMoneyExact(m.income)],['Purchases',fmtMoneyExact(m.spent)],['Bills paid',fmtMoneyExact(m.billPaid)]])+'<p class="card-cap">'+(m.incomplete?'Some older weekly totals overlap these dates and cannot be assigned to individual days. ':'')+'Expected pay is excluded. Savings and bill reserves are allocations, not payments. The reports below retain their labelled calendar ranges and legacy weekly basis.</p><button class="stg-btn" onclick="openBudgetWeek()">Review this budget →</button>';
}
function budPeriodExport(){
  const m=budPeriodMoney();if(!m)return null;
  return {start:m.range.start,end:m.range.end,frequency:budCyclesLoad().config.frequency,
    receivedIncome:m.income,purchases:m.spent,billsPaid:m.billPaid,existingMoneyAllocated:m.opening,
    billReserveRemaining:m.reserved,savingsAllocation:m.savings,carriedIn:m.incoming,rolledOut:m.outgoing,
    remainingSpendingBudget:m.available,incompleteLegacyDates:m.incomplete,
    legacyUndatedIncome:m.legacyIncome,legacyUndatedSpending:m.legacySpent,
    basis:'Recorded dated events plus explicitly labelled complete legacy weeks; expected pay and account balances excluded.'};
}
function budPeriodCSVText(m){
  const cell=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
  const rows=[['Budget period',m.range.start,m.range.end],['Metric','Amount'],
    ['Received income',m.income],['Purchases',m.spent],['Bills paid',m.billPaid],['Existing money allocated',m.opening],
    ['Bill reserve remaining',m.reserved],['Savings allocation (not deposit)',m.savings],['Carried in',m.incoming],
    ['Rolled out',m.outgoing],['Remaining spending budget',m.available],['Incomplete legacy dates',m.incomplete],
    ['Legacy allocations need review',m.allocationReview],['Undated legacy income included',m.legacyIncome],['Undated legacy spending included',m.legacySpent],[],
    ['Dated activity ID','Date','Kind','Amount']];
  m.rows.filter(x=>['income','bill_payment'].includes(x.kind)).forEach(x=>rows.push([x.id,x.date,x.kind,x.amount]));
  m.purchases.forEach(x=>rows.push([x.id,x.date,'purchase',x.amount]));
  return rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
function budPeriodCSV(){
  const p=budPeriodViewed(),m=p&&budPeriodMoney(p);if(!m)return;
  const url=URL.createObjectURL(new Blob([budPeriodCSVText(m)],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='daily-budget-'+p.start+'-'+p.end+'.csv';
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function budRecordedRange(start,end){
  const range={id:start+'_'+end,start,end,days:budDateDays(start,end)+1};
  const legacy=budPeriodLegacy(range),m=budPeriodCompute(range,{},ledgerData,txnData,{},legacy);
  m.hasRecords=m.rows.some(r=>['income','bill_payment'].includes(r.kind))||m.purchases.length>0||legacy.income>0||legacy.spent>0;
  return m;
}
function budRecordedSpend(start,end){
  const m=budRecordedRange(start,end);return m.hasRecords?budMoneyRound(m.spent+m.billPaid):null;
}
function budCalendarFactsHtml(start,end,title){
  const m=budRecordedRange(start,end);
  return '<section class="card bp-report">'+cardHeader('receipt',title)+
    '<p class="card-cap">'+escText(fmtDate(start))+' – '+escText(fmtDate(end))+'</p>'+
    (m.hasRecords?statsSplit([['Income received',fmtMoneyExact(m.income)],['Purchases',fmtMoneyExact(m.spent)],['Bills paid',fmtMoneyExact(m.billPaid)]]):'<p>No received income or paid expenses recorded in these dates.</p>')+
    (m.incomplete?'<p class="bp-warning bp-note">Older weekly totals cross this calendar boundary. Only dated records and complete legacy weeks are included; the undated remainder stays in weekly history.</p>':'')+
    ((m.legacyIncome||m.legacySpent)?'<p class="bp-note">Includes complete undated legacy weeks: '+fmtMoneyExact(m.legacyIncome)+' income, '+fmtMoneyExact(m.legacySpent)+' variable spending.</p>':'')+
    '<p class="bp-note">Recorded payments only. Scheduled bills, transfers, reserves and expected pay are excluded.</p></section>';
}
function budCalendarMonthHtml(date){
  const start=dateStr(new Date(date.getFullYear(),date.getMonth(),1)),end=dateStr(new Date(date.getFullYear(),date.getMonth()+1,0));
  const today=getLocalDate();
  return budCalendarFactsHtml(start,start<=today&&end>=today?today:end,'Calendar month · recorded money');
}
function budCalendarReport(hostId,kind,date){
  const host=document.getElementById(hostId);if(!host)return;
  const id=hostId+'-recorded';let el=document.getElementById(id);
  if(!budPeriodActive()){if(el)el.remove();return;}
  if(!el){el=document.createElement('div');el.id=id;host.prepend(el);}
  const year=typeof budViewedYear==='function'?budViewedYear():Number(getLocalDate().slice(0,4));
  el.innerHTML=kind==='month'?budCalendarMonthHtml(date):budCalendarFactsHtml(year+'-01-01',year===Number(getLocalDate().slice(0,4))?getLocalDate():year+'-12-31',year+' · recorded money');
  let history=host.querySelector('.bp-calendar-legacy');
  const nav=host.querySelector(':scope > .week-nav');
  if(nav)host.insertBefore(nav,el);
  if(!history){
    history=document.createElement('details');history.className='bp-calendar-legacy';
    history.innerHTML='<summary>Legacy weekly budget history</summary><p class="bp-note">Original weekly allocations and Monday-based grouping, preserved for reference. These figures use a different basis from dated payments above.</p>';
    Array.from(host.children).filter(child=>child!==el&&child!==nav).forEach(child=>history.appendChild(child));
    host.appendChild(history);
  }
  const sub=document.getElementById(kind==='month'?'month-label-sub':'year-label-sub');if(sub)sub.textContent='Recorded calendar dates';
}
function budStatsCompose(){
  if(!budPeriodActive())return;
  const host=document.getElementById('sub-finance');if(!host)return;
  budPeriodReport('sub-finance');
  const report=document.getElementById('sub-finance-period-report');
  report.innerHTML=budPeriodReportHtml()+budCalendarMonthHtml(localMidnight(getLocalDate()));
  let history=document.getElementById('bp-stats-legacy');
  if(!history){history=document.createElement('details');history.id='bp-stats-legacy';history.className='bp-calendar-legacy';history.innerHTML='<summary>Legacy weekly budget analysis</summary><p class="bp-note">Completed weekly records and their original allocations. These are separate from the dated payment totals above.</p>';host.insertBefore(history,report.nextSibling);}
  ['bs-finrange-wrap','bs-finpic-wrap','bs-trend-wrap-card','bs-week-wrap','bs-catbreak-wrap'].forEach(id=>{const el=document.getElementById(id);if(el&&el.parentElement!==history)history.appendChild(el);});
  host.classList.add('bp-stats-mode');
}
function budPeriodEdit(id){
  const entry=ledgerData.find(x=>x.id===id&&x.manual);if(!entry)return;
  budPeriodDialog(entry.kind==='income'?'Correct received income':'Correct bill payment',
    '<label>Amount<input name="amount" type="number" min="0.01" step="0.01" required value="'+entry.amount+'"></label>'+
    '<label>Date<input name="date" type="date" required max="'+getLocalDate()+'" value="'+escAttr(entry.date)+'"></label>'+
    '<label>Note<input name="note" maxlength="200" value="'+escAttr(entry.note||'')+'"></label>'+
    '<p class="bp-note">This corrects the recorded event. Income added through Budget also corrects its weekly history total. Payments linked to an older typed total keep that total and must stay within its week.</p>');
  document.getElementById('bp-form').onsubmit=e=>{
    e.preventDefault();const f=new FormData(e.target),amount=budMoneyRound(f.get('amount')),date=f.get('date');
    if(!(amount>0)||!budDateValid(date)||date>getLocalDate()){budPeriodError('Enter a positive amount and a valid past or current date.');return;}
    const oldWeek=txnWeekOf(entry.date),newWeek=txnWeekOf(date),field='inc_'+entry.streamId;
    if(entry.kind==='income'&&entry.weekMode==='record_only'&&(oldWeek!==newWeek||amount!==entry.amount)){
      budPeriodError('This payment dates an older weekly total. Correct that total in Weekly history before changing its amount or week.');return;
    }
    if(entry.kind==='income'&&entry.weekMode==='add'){
      const oldTotal=Number(budgetData[oldWeek]?.[field])||0;
      if(oldTotal<entry.amount){budPeriodError('The weekly total has changed separately. Review Weekly history before correcting this payment.');return;}
      budgetData[oldWeek]={...budgetData[oldWeek],[field]:String(budMoneyRound(oldTotal-entry.amount)),updatedAt:Date.now()};
      budgetData[newWeek]={...(budgetData[newWeek]||{}),[field]:String(budMoneyRound((Number(budgetData[newWeek]?.[field])||0)+amount)),updatedAt:Date.now()};
      [...new Set([oldWeek,newWeek])].forEach(w=>budSaveData(w));
    }
    Object.assign(entry,{amount,date,note:f.get('note'),weekKey:entry.kind==='income'?newWeek:undefined,updatedAt:Date.now()});
    saveLedger();document.getElementById('bud-period-dialog').close();budPeriodRefresh();
  };
}
function homeDesktopTraining(brief){
  return '<div class="home-desktop-training"><div class="bp-eyebrow">'+escText(brief.eyebrow)+'</div><h2 id="hero-day-name">'+escText(brief.title)+'</h2><p id="hero-meta">'+escText(brief.meta)+'</p><button class="home-budget-add-labelled" onclick="setView(\'log\')">'+escText(brief.action)+' →</button>'+homeTrainingStrip()+'</div>';
}
function homeCustomiseHint(){
  const el=document.getElementById('home-customise-hint');if(!el)return;
  el.innerHTML=profileData.homeCustomiseSeen?'':'<span>Make this space yours: show, hide and arrange cards.</span><button aria-label="Dismiss customisation hint" onclick="homeCustomiseDismiss()">×</button>';
}
function homeCustomiseDismiss(){
  profileData.homeCustomiseSeen=1;localStorage.setItem('daily_profile',JSON.stringify(profileData));syncProfileToFirebase();homeCustomiseHint();
}
