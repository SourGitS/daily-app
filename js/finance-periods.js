'use strict';

const BUD_PERIOD_FREQUENCIES=[['weekly','Weekly'],['fortnightly','Fortnightly'],['monthly','Monthly'],['semimonthly','Twice monthly'],['custom','Custom dates']];
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
  if(config.frequency==='semimonthly'){
    const first=Number(anchor.slice(8)),second=Number(config.secondDay);
    if(!Number.isInteger(second)||second<1||second>31||second===first)return null;
    const base=today.slice(0,7)+'-01',dates=new Set();
    for(let n=-2-Math.abs(shift);n<=2+Math.abs(shift);n++){
      const month=budDateMonth(base,n),last=Number(budDateAdd(budDateMonth(month,1),-1).slice(8));
      [first,second].forEach(day=>dates.add(month.slice(0,8)+String(Math.min(day,last)).padStart(2,'0')));
    }
    const ordered=[...dates].sort(),i=ordered.findLastIndex(d=>d<=today)+shift;
    start=ordered[i];end=ordered[i+1]&&budDateAdd(ordered[i+1],-1);
    if(!start||!end)return null;
  }else if(config.frequency==='monthly'){
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
  const store=v&&typeof v==='object'&&!Array.isArray(v)?{config:v.config||null,periods:v.periods||{}}:{config:null,periods:{}};
  if(store.config?.sourceId){
    const source=activeCats(loadIncCats()).find(c=>c.id===store.config.sourceId),follow=source&&budIncomePeriodConfig(source);
    if(follow)store.config={...store.config,...follow};
  }
  return store;
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
  const incomplete=!!legacy?.incomplete,allocationReview=!!legacy?.allocationReview&&!r.fundingConfirmed&&!r.allocationsReviewed;
  return {range,record:r,rows,purchases,income:budMoneyRound(income),spent:budMoneyRound(spent),billPaid,
    reserved:budMoneyRound(reserved),opening,savings,incoming:budMoneyRound(incoming),outgoing,
    funded:budMoneyRound(funded),known,available:incomplete||allocationReview||(!funded&&!r.fundingConfirmed)?null:known,incomplete,allocationReview,
    legacyIncome:legacy?.income||0,legacySpent:legacy?.spent||0};
}
function budPeriodLegacy(range,weeks){
  let income=0,spent=0,incomplete=false,allocationReview=false;
  Object.entries(weeks||budgetData||{}).forEach(([start,w])=>{
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
function budPeriodMoney(range,weekOverride){
  const p=range||budPeriodCurrent();if(!p)return null;
  const store=budCyclesLoad(),legacy=budPeriodLegacy(p,weekOverride?{...budgetData,[p.start]:weekOverride}:null),record=budPeriodInheritedPlan(p,store.periods[p.id],weekOverride);
  if(record.inheritedWeeklyPlan)legacy.allocationReview=false;
  return budPeriodCompute(p,record,ledgerData,txnData,store.periods,legacy);
}
// An exact saved week already defines its allocations. Reading it must neither seed a
// second plan nor force the user to confirm the same numbers again.
function budPeriodInheritedPlan(p,saved,basis){
  if(saved&&saved.fundingConfirmed)return saved;
  if(p.days!==7||localMidnight(p.start).getDay()!==1)return saved||{};
  if(typeof weekFixedTotal!=='function')return saved||{};
  const w=basis||budgetData[p.start]||{},reserves={};
  const ids=new Set(loadFixCats().map(c=>c.id));
  Object.keys(w.fixRates||{}).forEach(id=>ids.add(id));
  Object.keys(w).filter(k=>k.startsWith('fix_')).forEach(k=>ids.add(k.slice(4)));
  ids.forEach(id=>{reserves[id]=weekFixedContribution(w,id);});
  const remainder=budMoneyRound(weekFixedTotal(w)-Object.values(reserves).reduce((s,n)=>s+n,0));
  if(remainder>0)reserves.__unitemised=remainder;
  return {...(saved||{}),reserves,savings:weekSavedAmt(w),goal:getWeekVarGoal(w),inheritedWeeklyPlan:true};
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
function budIncomeMode(c){return c.payMode||((Number(c.payAmount)>0&&!getHourlyRate(c.id))?'fixed':'variable');}
function budIncomePeriodConfig(c){
  const frequency=incomePayCycle(c);
  if(!budDateValid(c.payDate)||!['weekly','fortnightly','monthly','semimonthly'].includes(frequency))return null;
  const config={frequency,anchor:c.payDate,secondDay:c.paySecondDay||'',sourceId:c.id};
  return budPeriodRange(config,getLocalDate(),0)?config:null;
}
function budIncomeManage(){
  const cats=activeCats(loadIncCats());
  const d=budPeriodDialog('Income & paydays','<p class="bp-note">Set up your usual pay here. Record it in Budget when the money arrives.</p>'+
    cats.map(c=>{const next=incomeNextPay(c);return '<div class="bp-row"><span>'+escText(catLabel(c))+'<small>'+
      (budIncomeMode(c)==='fixed'&&Number(c.payAmount)>0?fmtMoneyExact(c.payAmount)+' · ':'Amount varies · ')+
      escText(INC_PAY_CYCLES.find(x=>x.id===incomePayCycle(c))?.label||'No schedule')+
      (next?' · Next '+escText(fmtDate(dateStr(next))):'')+'</small></span><button type="button" class="stg-btn" data-source="'+escAttr(c.id)+'" onclick="budIncomeEdit(this.dataset.source)">Edit</button></div>';}).join('')+
    (!cats.length?'<p>No income sources yet. Add your wage, salary or another source of income.</p>':'')+
    '<button type="button" class="add-cat-btn" onclick="budIncomeEdit()">+ Add income source</button>'+
    (loadIncCats().some(catIsArchived)?'<details><summary>Archived sources</summary>'+loadIncCats().filter(catIsArchived).map(c=>'<div class="bp-row"><span>'+escText(catLabel(c))+'</span><button class="stg-btn" type="button" data-source="'+escAttr(c.id)+'" onclick="budIncomeArchive(this.dataset.source,false)">Restore</button></div>').join('')+'</details>':''));
  d.querySelector('.bp-actions').innerHTML='<button type="button" class="stg-btn" onclick="document.getElementById(\'bud-period-dialog\').close()">Done</button>';
}
function budIncomeEdit(id){
  const cats=loadIncCats(),c=cats.find(x=>x.id===id)||{id:genCatId('inc'),name:'',payCycle:'fortnightly',payMode:'fixed'};
  const baseline=JSON.stringify(cats),store=budCyclesLoad(),cycleBaseline=JSON.stringify(store.config),savedRate=getHourlyRate(c.id);
  const date=c.payDate||(incomeNextPay(c)?dateStr(incomeNextPay(c)):'');
  const d=budPeriodDialog(id?'Edit income source':'Add income source',
    '<label>Source name<input name="name" maxlength="80" required placeholder="e.g. My salary" value="'+escAttr(c.name)+'"></label>'+
    '<label>Payment amount<select name="mode" onchange="budIncomeFields()"><option value="fixed"'+(budIncomeMode(c)==='fixed'?' selected':'')+'>Same amount each payday</option><option value="variable"'+(budIncomeMode(c)==='variable'?' selected':'')+'>Amount varies</option></select></label>'+
    '<label id="bi-fixed">Usual take-home pay<input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" value="'+(Number(c.payAmount)>0?Number(c.payAmount):'')+'" placeholder="0.00"><small>Prefilled when you record a payment. You can change it before saving.</small></label>'+
    '<label>How often are you paid?<select name="cycle" onchange="budIncomeFields()">'+INC_PAY_CYCLES.map(x=>'<option value="'+x.id+'"'+(x.id===incomePayCycle(c)?' selected':'')+'>'+x.label+'</option>').join('')+'</select></label>'+
    '<label id="bi-date">A payday in your schedule<input name="payDate" type="date" value="'+escAttr(date)+'"><small>Your next payday, or a previous payday you know.</small></label>'+
    '<label id="bi-second">Second payday of the month<input name="secondDay" type="number" min="1" max="31" value="'+(Number(c.paySecondDay)||'')+'"><small>For example, the 15th and the last day (31).</small></label>'+
    '<details id="bi-variable"><summary>Optional hourly estimate</summary><label>Hourly rate<input name="rate" type="number" inputmode="decimal" min="0" step="0.01" value="'+(getHourlyRate(c.id)||'')+'"><small>Hours × rate is only an estimate. Check the actual take-home amount when recording pay.</small></label></details>'+
    '<label class="bi-follow"><input name="follow" type="checkbox"'+(!store.config||store.config.sourceId===c.id?' checked':'')+'> <span>Follow this payday for my budget<small>Budget dates run from one payday to the day before the next. Other income can keep its own schedule.</small></span></label>');
  budIncomeFields();
  d.querySelector('.bp-actions button[type="submit"]').textContent='Save income source';
  if(id){
    const archive=document.createElement('button');archive.type='button';archive.className='bud-edit-btn';archive.textContent='Archive source';
    archive.onclick=()=>budIncomeArchive(id,true);d.querySelector('.bp-actions').before(archive);
  }
  document.getElementById('bp-form').onsubmit=e=>{
    e.preventDefault();
    if(JSON.stringify(loadIncCats())!==baseline||JSON.stringify(budCyclesLoad().config)!==cycleBaseline||getHourlyRate(c.id)!==savedRate){budPeriodError('Income settings changed elsewhere. Close and reopen this form to use the latest settings.');return;}
    const f=new FormData(e.target),mode=f.get('mode'),cycle=f.get('cycle'),amount=Number(f.get('amount'));
    if(!String(f.get('name')).trim()||(mode==='fixed'&&!(Number.isFinite(amount)&&amount>0))){budPeriodError('Enter a name and a positive take-home amount for fixed pay.');return;}
    const next={...c,name:String(f.get('name')).trim(),payMode:mode,payCycle:cycle,payDate:f.get('payDate'),paySecondDay:f.get('secondDay')};
    next.payAmount=mode==='fixed'?budMoneyRound(amount):'';
    if(cycle!=='irregular'&&!budDateValid(next.payDate)){budPeriodError('Choose a payday to anchor this schedule.');return;}
    const config=budIncomePeriodConfig(next),follow=f.has('follow');
    if(cycle==='semimonthly'&&!config){budPeriodError('Choose two different calendar days for twice-monthly pay.');return;}
    if(follow&&!config){budPeriodError('A regular payday is needed to follow this income. Untick Follow this payday to keep your current budget dates.');return;}
    const previous=budPeriodCurrent();
    store.periods=budCyclesLoad().periods;
    saveIncCats(id?cats.map(x=>x.id===id?next:x):[...cats,next]);
    if(mode==='variable'){setHourlyRate(c.id,f.get('rate'));localStorage.setItem('daily_budget_defaults',JSON.stringify(budDefaults));syncBudDefaultsToFirebase();}
    if(follow||store.config?.sourceId===c.id){
      if(previous&&!store.periods[previous.id])store.periods[previous.id]={start:previous.start,end:previous.end,updatedAt:Date.now()};
      store.config=follow?config:{...store.config};
      if(!follow)delete store.config.sourceId;
      budCyclesSave(store);budPeriodOffset=0;budPeriodSelected='';
    }
    renderBudgetConfig();budPeriodRefresh();budIncomeManage();showToast('Income source saved');
  };
}
function budIncomeArchive(id,on){
  const store=budCyclesLoad();
  if(on&&store.config?.sourceId===id){delete store.config.sourceId;budCyclesSave(store);}
  catArchive('inc',id,on);budPeriodRefresh();budIncomeManage();
}
function budIncomeFields(){
  const f=document.getElementById('bp-form'),fixed=f.elements.mode.value==='fixed',cycle=f.elements.cycle.value;
  document.getElementById('bi-fixed').hidden=!fixed;f.elements.amount.disabled=!fixed;f.elements.amount.required=fixed;
  document.getElementById('bi-variable').hidden=fixed;f.elements.rate.disabled=fixed;
  document.getElementById('bi-date').hidden=cycle==='irregular';f.elements.payDate.required=cycle!=='irregular';
  document.getElementById('bi-second').hidden=cycle!=='semimonthly';f.elements.secondDay.disabled=cycle!=='semimonthly';f.elements.secondDay.required=cycle==='semimonthly';
  f.elements.follow.disabled=cycle==='irregular';if(cycle==='irregular')f.elements.follow.checked=false;
}
function budIncomeSection(range,weekly){
  const events=ledgerOf('income').filter(x=>x.date>=range.start&&x.date<=range.end);
  const cats=loadIncCats().filter(c=>!catIsArchived(c)||Number(weekly?.['inc_'+c.id])||events.some(x=>x.streamId===c.id));
  return '<div class="bi-caption">Received '+(weekly?'this week':'in this period')+'</div>'+
    cats.map(c=>{
      const rows=events.filter(x=>x.streamId===c.id),received=weekly?Number(weekly['inc_'+c.id]||0):rows.reduce((s,x)=>s+Number(x.amount||0),0),next=catIsArchived(c)?null:incomeNextPay(c);
      return '<div class="bi-source"><div class="bp-row"><span>'+escText(catLabel(c))+'<small>'+
        (next?'Next expected '+escText(fmtDate(dateStr(next)))+(budIncomeMode(c)==='fixed'&&Number(c.payAmount)>0?' · '+fmtMoneyExact(c.payAmount):''):'No payday scheduled')+'</small></span><strong>'+fmtMoneyExact(received)+'</strong></div>'+
        rows.map(x=>'<button class="bud-edit-btn" data-entry-id="'+escAttr(x.id)+'" onclick="budPeriodEdit(this.dataset.entryId)">'+escText(fmtDate(x.date))+' · '+fmtMoneyExact(x.amount)+'</button>').join('')+'</div>';
    }).join('')+(!cats.length?'<p class="bp-note">Add your income source to set up paydays and quickly record your pay.</p>':'')+
    (weekly&&weekIncome(weekly)-events.reduce((s,x)=>s+Number(x.amount||0),0)>.005?'<button class="bud-edit-btn" onclick="budLegacyOpen=true;renderBudgetTab()">Review older weekly totals</button>':'')+
    '<div class="bi-actions">'+(cats.length?'<button class="stg-btn primary" onclick="budPeriodRecord(\'income\')">Record income</button>':'')+'<button class="bud-edit-btn" onclick="budIncomeManage()">'+(cats.length?'Income & paydays':'+ Set up income')+'</button></div>';
}
function budIncomeRecordFill(){
  const f=document.getElementById('bp-form'),c=activeCats(loadIncCats()).find(x=>x.id===f.elements.category.value);
  if(!c)return;
  f.elements.amount.value=budIncomeMode(c)==='fixed'&&Number(c.payAmount)>0?budMoneyRound(c.payAmount):'';
  const estimate=document.getElementById('bi-estimate');
  if(estimate){estimate.hidden=budIncomeMode(c)!=='variable';estimate.open=false;f.elements.hours.value='';}
  const hint=document.getElementById('bi-record-hint');
  if(hint)hint.textContent=budIncomeMode(c)==='fixed'?'Your usual take-home pay is filled in. Check the amount and date, then confirm it arrived.':'Enter the take-home amount you actually received.';
}
function budIncomeEstimate(){
  const f=document.getElementById('bp-form'),rate=getHourlyRate(f.elements.category.value),hours=Number(f.elements.hours.value);
  const out=document.getElementById('bi-estimate-result');
  if(!(rate>0&&hours>0)){out.textContent='Add an hourly rate in Income & paydays and enter your hours.';return;}
  f.elements.amount.value=budMoneyRound(rate*hours);out.textContent='Estimate applied. Check deductions and confirm your actual take-home pay.';
}
function budPeriodSetup(){
  const store=budCyclesLoad(),config=store.config||{};
  const baseline=JSON.stringify(store.config);
  const sources=activeCats(loadIncCats()).filter(c=>budIncomePeriodConfig(c));
  const main=sources[0];
  const frequency=config.frequency||main?.payCycle||'weekly',anchor=config.anchor||main?.payDate||dateStr(getMondayOf(0));
  budPeriodDialog('Choose your budget period','<p>Choose the dates your spending budget covers. Your income sources can each have their own pay schedule.</p>'+
    '<label>Budget dates<select name="source" onchange="budPeriodSetupFields()"><option value="">Choose my own dates</option>'+sources.map(c=>'<option value="'+escAttr(c.id)+'"'+((config.sourceId===c.id||!store.config&&main===c)?' selected':'')+'>Follow '+escText(catLabel(c))+' payday</option>').join('')+'</select></label><div id="bp-custom-dates">'+
    '<label>Budget frequency<select name="frequency" onchange="budPeriodSetupFields()">'+BUD_PERIOD_FREQUENCIES.map(([id,label])=>'<option value="'+id+'"'+(frequency===id?' selected':'')+'>'+label+'</option>').join('')+'</select></label>'+
    '<label>Starting date<input type="date" name="anchor" required value="'+escAttr(anchor)+'"></label>'+
    '<label id="bp-second-day">Second day of each month<input type="number" name="secondDay" min="1" max="31" value="'+(Number(config.secondDay)||'')+'"></label>'+
    '<label id="bp-end-date">Ending date<input type="date" name="end" value="'+escAttr(config.end||'')+'"></label></div>'+
    '<p class="bp-note">Your saved budgets and weekly history stay available.</p>');
  budPeriodSetupFields();
  document.getElementById('bp-form').onsubmit=e=>{
    e.preventDefault();const f=new FormData(e.target),source=activeCats(loadIncCats()).find(c=>c.id===f.get('source'));
    const latest=budCyclesLoad();
    if(JSON.stringify(latest.config)!==baseline){budPeriodError('Budget dates changed elsewhere. Close and reopen to use the latest schedule.');return;}
    store.periods=latest.periods;
    const next=source?budIncomePeriodConfig(source):{frequency:f.get('frequency'),anchor:f.get('anchor'),end:f.get('end'),secondDay:f.get('secondDay')};
    if(!budPeriodRange(next,getLocalDate(),0)){budPeriodError('Choose valid dates. Custom periods can cover 1–366 days.');return;}
    const previous=budPeriodCurrent();
    if(previous&&!store.periods[previous.id])store.periods[previous.id]={start:previous.start,end:previous.end,updatedAt:Date.now()};
    store.config=next;budCyclesSave(store);budPeriodOffset=0;budPeriodSelected='';budLegacyOpen=false;
    document.getElementById('bud-period-dialog').close();setView('budget');setBudgetView('week');budPeriodRefresh();
  };
}
function budPeriodSetupFields(){
  const f=document.getElementById('bp-form'),follow=!!f.elements.source.value,wrap=document.getElementById('bp-custom-dates');
  wrap.hidden=follow;wrap.querySelectorAll('input,select').forEach(el=>el.disabled=follow);
  document.getElementById('bp-second-day').hidden=f.elements.frequency.value!=='semimonthly';
  document.getElementById('bp-end-date').hidden=f.elements.frequency.value!=='custom';
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
  if(!cats.length){if(income)budIncomeManage();else{showToast('Add a bill in Budget setup first.');openBudgetEditor();}return;}
  const hasUndatedIncome=income&&Object.entries(budgetData).some(([week,w])=>budDateValid(week)&&
    weekIncome(w)-ledgerOf('income').filter(x=>x.date>=week&&x.date<=budDateAdd(week,6)).reduce((sum,x)=>sum+Number(x.amount||0),0)>.005);
  budPeriodDialog(income?'Record received income':'Record a bill payment',
    '<label>'+(income?'Income source':'Bill')+'<select name="category">'+cats.map(c=>'<option value="'+escAttr(c.id)+'">'+escText(catLabel(c))+'</option>').join('')+'</select></label>'+
    '<label>Amount received / paid<input name="amount" type="number" min="0.01" step="0.01" required inputmode="decimal"></label>'+
    '<label>Date<input name="date" type="date" required max="'+getLocalDate()+'" value="'+getLocalDate()+'"></label>'+
    (hasUndatedIncome?'<label id="bi-history" hidden>This week already includes income without dates<select name="weekMode"><option value="">Choose how to record this payment</option><option value="add">It is an additional payment</option><option value="record_only">It is already included — add its date only</option></select></label>':'')+
    (income?'<p id="bi-record-hint" class="bp-note"></p><details id="bi-estimate" hidden><summary>Estimate from hours</summary><label>Hours worked<input name="hours" type="number" min="0" step="0.01" inputmode="decimal"></label><button class="stg-btn" type="button" onclick="budIncomeEstimate()">Use hours × saved rate</button><p id="bi-estimate-result" class="bp-note">Check deductions before recording take-home pay.</p></details><label id="bi-duplicate" class="bi-follow" hidden><input name="duplicate" type="checkbox"><span>This is another payment on the same date<small>A payment from this source is already recorded for this day.</small></span></label>':'')+
    '<label>Note<input name="note" maxlength="200"></label><p class="bp-note">Record actual '+(income?'money received':'payments')+'. Account balances remain your separately recorded balances.</p>');
  let submitted=false;
  if(income){
    budIncomeRecordFill();budIncomeRecordReview();
    const form=document.getElementById('bp-form');
    form.elements.category.onchange=()=>{budIncomeRecordFill();budIncomeRecordReview();};
    form.elements.date.onchange=budIncomeRecordReview;
    form.querySelector('button[type="submit"]').textContent='Confirm received';
  }
  document.getElementById('bp-form').onsubmit=e=>{
    e.preventDefault();if(submitted)return;
    const f=new FormData(e.target),amount=budMoneyRound(f.get('amount')),date=f.get('date'),id=f.get('category');
    if(!(amount>0)||!Number.isFinite(amount)||!budDateValid(date)||date>getLocalDate()){budPeriodError('Enter a positive amount and a date on or before today.');return;}
    if(!activeCats(income?loadIncCats():loadFixCats()).some(c=>c.id===id)){budPeriodError('This source is no longer active. Close and reopen to choose a current source.');return;}
    if(income&&ledgerOf('income').some(x=>x.streamId===id&&x.date===date)&&!f.has('duplicate')){budIncomeRecordReview();budPeriodError('A payment is already recorded for this date. Confirm this is another payment before saving.');return;}
    const wk=txnWeekOf(date),field='inc_'+id,w=budgetData[wk]||{},before=Number(w[field])||0;
    let mode=f.get('weekMode')||'add';
    const dated=ledgerOf('income').filter(x=>x.streamId===id&&txnWeekOf(x.date)===wk).reduce((sum,x)=>sum+Number(x.amount||0),0);
    if(income&&before-dated>.005&&!f.get('weekMode')){budPeriodError('This week has older income without payment dates. Choose whether this payment is additional or already included.');return;}
    if(income&&mode==='record_only'&&amount>before-dated+.005){budPeriodError('This is more than the undated income left in that week. Record additional income instead.');return;}
    const entry={id:genLedgerId(),kind,date,amount,note:f.get('note'),createdAt:Date.now(),manual:true};
    if(income){entry.streamId=id;entry.weekKey=wk;entry.weekMode=mode;entry.weekBefore=before;entry.weekAfter=mode==='add'?budMoneyRound(before+amount):before;}
    else entry.fixCatId=id;
    submitted=true;ledgerData.push(entry);saveLedger();
    if(income&&mode==='add'){
      budgetData[wk]={...w,wk,[field]:String(entry.weekAfter),draft:!w.saved,updatedAt:Date.now()};budSaveData(wk);
    }
    document.getElementById('bud-period-dialog').close();budPeriodRefresh();
  };
}
function budIncomeRecordReview(){
  const f=document.getElementById('bp-form'),id=f.elements.category.value,date=f.elements.date.value;
  if(!budDateValid(date))return;
  const wk=txnWeekOf(date),received=Number(budgetData[wk]?.['inc_'+id]||0),events=ledgerOf('income');
  const undated=received-events.filter(x=>x.streamId===id&&txnWeekOf(x.date)===wk).reduce((s,x)=>s+Number(x.amount||0),0);
  const history=document.getElementById('bi-history');if(history){history.hidden=undated<=.005;f.elements.weekMode.value='';}
  const duplicate=document.getElementById('bi-duplicate');duplicate.hidden=!events.some(x=>x.streamId===id&&x.date===date);f.elements.duplicate.checked=false;
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
  const p=budPeriodViewed();
  host.innerHTML='<div class="bud-period-toolbar"><button class="bud-edit-btn" onclick="budPeriodSetup()">'+(p?'Budget period · '+escText(budPeriodLabel(p)):'Choose budget period')+'</button>'+
    (p?'<button class="bud-edit-btn" onclick="budLegacyOpen=!budLegacyOpen;renderBudgetTab()">'+(budLegacyOpen?'Return to budget period':'Weekly history')+'</button>':'')+'</div>';
  legacy.classList.remove('hidden');
}
function budPeriodOverview(){
  return false;
}
function budPeriodHomeCard(){
  const m=budPeriodMoney();if(!m)return '<div class="card home-budget-card">'+cardHeader('wallet','Budget')+'<h3>Your money, on your dates</h3><p class="card-cap">Choose a budget period. Your weekly history stays available.</p><button class="home-budget-add-labelled" onclick="budPeriodSetup()">Set up budget →</button></div>';
  const goal=Number(m.record.goal)||0;
  return '<div class="card budget-snapshot-card home-budget-card">'+cardHeader('wallet','Budget · '+budPeriodLabel(m.range),
    m.available===null?tstat('warn','Needs a date check','info',true):m.available<0?tstat('neg','Over budget','alert',true):tstat('pos','On track','check',true))+
    '<div class="home-budget-totals"><div><div class="card-fig">'+(m.available===null?'—':fmtMoneyExact(m.available))+'</div><div class="card-fig-u">Available to spend</div></div>'+
    '<div class="home-budget-received"><strong>'+fmtMoneyExact(m.income)+'</strong><span>Income received</span></div></div>'+
    (m.incomplete?'<p class="card-cap">Review overlapping weekly totals</p>':'')+
    '<div class="home-budget-spending"><span>Spending goal</span><strong>'+fmtMoneyExact(m.spent)+(goal?' / '+fmtMoneyExact(goal):' spent')+'</strong></div>'+
    (goal?'<div class="card-bar"><div class="card-bar-fill" style="width:'+Math.min(100,m.spent/goal*100)+'%"></div></div>':'')+
    '<div class="home-budget-goal-note card-cap">'+(goal?(m.spent>goal?'Above goal':fmtMoneyExact(goal-m.spent)+' to goal'):'No spending goal set')+'</div>'+
    '<div class="home-budget-footer"><button class="home-budget-add-labelled" onclick="openTxnModal({date:getLocalDate()})">＋ Add expense</button><button class="home-budget-link" onclick="homeOpenBudgetWeek()">View budget ↗</button></div></div>';
}
function dailyUpdateBannerHtml(){
  return '';
}
function dailyUpdateDismiss(){
  profileData.budgetRhythmSeen=2;localStorage.setItem('daily_profile',JSON.stringify(profileData));
  const r=fbRef('profile');if(r)r.child('budgetRhythmSeen').transaction(v=>Math.max(Number(v)||0,2));
  const popup=document.getElementById('daily-update-dialog');if(popup){popup.close();popup.remove();}
  document.querySelectorAll('.daily-update-banner').forEach(e=>e.remove());
}
function dailyUpdateRefresh(){
  ['finance-update-announcement','home-update-announcement'].forEach(id=>{const slot=document.getElementById(id);if(slot)slot.innerHTML=dailyUpdateBannerHtml();});
  if(typeof dailyUpdatePopupCheck==='function')dailyUpdatePopupCheck();
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

function budPeriodDaysLeft(p){
  const today=getLocalDate();return today<p.start||today>p.end?0:budDateDays(today,p.end)+1;
}
function budPeriodCardMode(){
  const p=budPeriodViewed();return !!(p&&!budLegacyOpen&&!budPeriodMoney(p).record.inheritedWeeklyPlan);
}
function budPeriodOverviewMoney(m){
  return {period:m.range,monday:localMidnight(m.range.start),key:m.range.start,
    week:{var_goal:m.record.goal},income:m.funded,committed:m.reserved,spent:m.spent+m.billPaid,saved:m.savings,
    available:m.available,variableSpent:m.spent};
}
function budPeriodForecast(m){
  const pay=nextPayInfo();if(!pay)return null;
  const today=localMidnight(getLocalDate()),until=localMidnight(budDateAdd(dateStr(pay.date),-1));
  const bills=until<today?[]:billOccurrences(today,until),scheduled=bills.reduce((s,b)=>s+b.amount,0);
  const paid={},used={};m.rows.filter(x=>x.kind==='bill_payment').forEach(x=>paid[x.fixCatId]=(paid[x.fixCatId]||0)+Number(x.amount||0));
  let addBack=0;
  bills.forEach(b=>{const id=b.cat?.id;if(b.kind!=='charge'||!id||used[id]||dateStr(b.date)>m.range.end)return;
    used[id]=true;const due=bills.filter(x=>x.kind==='charge'&&x.cat?.id===id&&dateStr(x.date)<=m.range.end).reduce((s,x)=>s+x.amount,0);
    addBack+=Math.min(due,Math.max(0,Number(m.record.reserves?.[id]||0)-(paid[id]||0)));});
  // Do not extrapolate a period allocation beyond its own end.
  const projected=m.available===null||dateStr(until)>m.range.end?null:budMoneyRound(m.available+addBack-scheduled);
  return {pay,until,bills,scheduled,addBack,available:m.available,projected,period:true};
}
function budPeriodPaintMoney(m){
  // A count-up started before cloud restore must not overwrite the restored figures later.
  const put=(id,text)=>{const el=document.getElementById(id);if(el){if(el._countUpFrame){cancelAnimationFrame(el._countUpFrame);el._countUpFrame=null;}el.textContent=text;}};
  const avail=m.available,used=m.spent+m.billPaid+m.reserved+m.savings+m.outgoing;
  put('bud-hero-avail',avail===null?'—':fmtMoneyExact(avail));
  put('bud-hero-avail-lbl',avail!==null&&avail<0?'Over budget':'Available to spend');
  put('bud-hero-income-note',fmtMoneyExact(m.income)+' income'+(m.opening+m.incoming?' · '+fmtMoneyExact(m.opening+m.incoming)+' allocated':'') );
  put('bud-hero-spent',fmtMoneyExact(m.spent+m.billPaid));put('bud-hero-committed',fmtMoneyExact(m.reserved));put('bud-hero-saved',fmtMoneyExact(m.savings));
  put('bud-hero-pace',m.incomplete?'Older weekly totals cross these dates; check income and spending dates.':budPaceText(avail,budPeriodDaysLeft(m.range)));
  put('week-status-pill-hero',avail===null?'Check dates / income':avail<0?'⚠ Over budget':'✓ On track');
  put('budget-bar-label-l',fmtMoneyExact(used)+' allocated');put('budget-bar-label-r',m.funded?Math.round(used/m.funded*100)+'% of funds':'');
  const bar=document.getElementById('budget-bar');if(bar)bar.style.width=(m.funded?Math.min(100,Math.max(0,used/m.funded*100)):0)+'%';
  put('calc-variable',fmtMoneyExact(m.spent));put('sum-var',fmtMoneyExact(m.spent));
  put('sum-inc',fmtMoneyExact(m.income));put('sum-fix',fmtMoneyExact(m.reserved+m.billPaid));put('plan-fix-sum',fmtMoneyExact(m.reserved+m.billPaid));
  put('sav-head-sum',fmtMoneyExact(m.savings));put('plan-avail',avail===null?'—':fmtMoneyExact(avail+m.spent));put('sum-plan',avail===null?'—':fmtMoneyExact(avail+m.spent));
  updateVarGoalCard(m.spent);
  if(budPeriodCardMode()){
    put('sav-goal-label','Allocation for '+budPeriodLabel(m.range));
    const goal=document.getElementById('vargoal-defaultline');if(goal)goal.textContent='';
    const pace=document.getElementById('vargoal-pace');if(pace&&!budPeriodDaysLeft(m.range))pace.textContent='';
  }
}

// Keep the existing card shells, column order, disclosures and expense editor. Only
// the rows whose dates span several weeks need a period-aware reader/editor.
function budPeriodRenderCards(){
  const p=budPeriodViewed(),m=budPeriodMoney(p),r=m.record;
  const put=(id,text)=>{const el=document.getElementById(id);if(el)el.textContent=text;};
  put('week-label-main','Budget period');put('week-label-sub',budPeriodLabel(p));put('bud-compact-week',budPeriodLabel(p));
  document.getElementById('week-next-btn').style.opacity='1';document.getElementById('bud-compact-next').style.opacity='1';
  document.getElementById('week-edit-btn').style.display='none';
  document.getElementById('bud-hero-act').innerHTML='<button class="bud-hero-add" onclick="openTxnModal({date:getLocalDate()})"><span class="bud-hero-add-plus">+</span>Add expense</button>';
  document.getElementById('bud-spend-card').innerHTML=renderSpendCard({var_goal:r.goal??null},true).replaceAll('weekly goal','period goal').replaceAll('this week','this period').replaceAll('This week','This period');
  document.getElementById('bud-setup-card').innerHTML='';
  document.getElementById('bud-fix-body').innerHTML=budPeriodFixedRows(m);
  document.querySelector('#bud-fixed-card .bud-head-unit').textContent='/period';
  document.querySelector('#bud-plan-card .bud-head-label span').textContent='Budget plan';
  document.getElementById('bud-plan-inc').innerHTML=budPlanSection('inc','wallet','Income','sum-inc',budIncomeSection(p,null)+
    (m.legacyIncome?'<p class="bp-note">'+fmtMoneyExact(m.legacyIncome)+' recorded in complete weekly totals.</p>':''),null,true);
  const sav=document.getElementById('sav-amount');sav.disabled=false;sav.value=r.savings||'';sav.style.opacity='1';
  document.getElementById('sav-status').innerHTML='';
  const notes=document.getElementById('week-notes');notes.disabled=false;notes.value=r.notes||'';notes.placeholder='What happened this period?';
  put('closeout-sum',r.finished?'Finished':'Open');put('save-week-hint','Save your notes and mark this budget period reviewed.');
  document.getElementById('save-week-btn').style.display='block';put('save-week-btn',r.finished?'✓ Period finished — tap to update':'Finish period');
  document.getElementById('save-week-msg').style.display='none';
  document.querySelector('#bud-closeout-card .bud-head-label span').textContent='Close out period';
  document.getElementById('closeout-state').innerHTML=tstat(r.finished?'pos':'warn',r.finished?'Period finished':'Not finished yet',r.finished?'check':'flat',true);
  let extra=document.getElementById('bud-period-tools');if(!extra){extra=document.createElement('div');extra.id='bud-period-tools';document.getElementById('bud-tools-card').appendChild(extra);}
  extra.innerHTML='<div class="bud-spend-tools"><button class="bud-edit-btn" onclick="budPeriodAdjust()">Allocate existing money</button><button class="bud-edit-btn" onclick="budPeriodRollover()">Rollover</button><button class="bud-edit-btn" onclick="budPeriodCSV()">Export period</button></div>';
  _budSecOpen.add('inc');budSecApply();budPeriodPaintMoney(m);renderOutlookCard(m.available,{});
  renderPrevWeeks();renderBudgetConfig();loadCCInput();renderDueBanner(localMidnight(p.start));budApplyLayout();restoreBudgetCollapseState();
  if(budgetView==='overview')renderBudgetOverview();else if(budgetView==='plan')renderPlan();
}
function budPeriodSaveFields(finish){
  if(S.view!=='budget'||budgetView!=='week')return;
  const p=budPeriodViewed(),store=budCyclesLoad(),old=store.periods[p.id]||{},next={...old,start:p.start,end:p.end};
  const capture=(id,key)=>{const el=document.getElementById(id);if(el)next[key]=key==='notes'?el.value:el.value===''?null:budMoneyRound(el.value);};
  capture('sav-amount','savings');capture('vargoal-input','goal');capture('week-notes','notes');
  document.querySelectorAll('[data-period-reserve]').forEach(el=>{next.reserves={...(next.reserves||{}),[el.dataset.periodReserve]:budMoneyRound(el.value)};});
  if(finish)next.finished=true;
  const reservesChanged=Object.entries(next.reserves||{}).some(([id,n])=>Number(n||0)!==Number(old.reserves?.[id]||0));
  const savingChanged=Number(next.savings||0)!==Number(old.savings||0);
  if((next.notes||'')===(old.notes||'')&&(next.goal??null)===(old.goal??null)&&!reservesChanged&&!savingChanged&&!!next.finished===!!old.finished)return;
  if(reservesChanged||savingChanged)next.allocationsReviewed=true;
  next.updatedAt=Date.now();store.periods[p.id]=next;budCyclesSave(store);
}
function budPeriodFixedRows(m){
  const rows=activeCats(loadFixCats()).map(c=>'<div class="bud-row bud-cat-row">'+budCatNameHtml('fix',c,true,budEditMode.fix)+
    '<input class="bud-row-input" type="number" min="0" step="0.01" aria-label="'+escAttr(catLabel(c))+' period allowance" data-period-reserve="'+escAttr(c.id)+'" value="'+(m.record.reserves?.[c.id]??'')+'" placeholder="$0" oninput="budSaveDraft();budRecalc()">'+(budEditMode.fix?'<button class="delete-cat-btn" data-type="fix" data-id="'+escAttr(c.id)+'" aria-label="Remove category">×</button>':'')+'</div>').join('');
  return '<div class="bud-fix-cap">Allowances for '+escText(budPeriodLabel(m.range))+'. Recorded bill payments use their allowance once; Outlook shows the scheduled charges.</div>'+
    '<div class="bud-spend-tools"><button class="bud-edit-btn" data-type="fix" data-action="bud-edit-toggle">Edit</button><button class="bud-edit-btn" onclick="openBudgetEditor()">Recurring bills</button></div>'+rows+
    (budEditMode.fix?'<button class="add-cat-btn" data-type="fix">+ Add fixed expense</button>':'')+'<button class="add-cat-btn" onclick="budPeriodRecord(\'bill_payment\')">+ Record bill payment</button>'+
    m.rows.filter(x=>x.kind==='bill_payment').map(x=>'<button class="txn-item" data-entry-id="'+escAttr(x.id)+'" onclick="budPeriodEdit(this.dataset.entryId)"><span>'+escText(loadFixCats().find(c=>c.id===x.fixCatId)?.name||'Bill')+' · '+escText(fmtDate(x.date))+'</span><span>'+fmtMoneyExact(x.amount)+'</span></button>').join('');
}
function budPeriodVarRows(){
  const m=budPeriodMoney(budPeriodViewed()),cats=loadVarCats(),ids=new Set([...activeCats(cats).map(c=>c.id),...m.purchases.map(x=>x.catId)]);
  return [...ids].map(id=>{const c=cats.find(c=>c.id===id)||{id,name:'Archived category'},rows=m.purchases.filter(x=>x.catId===id),total=rows.reduce((s,x)=>s+Number(x.amount||0),0);
    return '<div class="bud-row bud-cat-row">'+budCatNameHtml('var',c,true,budEditMode.var)+'<button class="bud-row-calc txn-total" data-cat="'+escAttr(id)+'" onclick="txnToggleCat(this.dataset.cat)">'+fmtMoneyExact(total)+'<span class="txn-count">'+rows.length+'</span></button>'+(budEditMode.var?'<button class="delete-cat-btn" data-type="var" data-id="'+escAttr(id)+'" aria-label="Remove category">×</button>':'')+'</div>'+
      (_txnOpenCats.has(id)?'<div class="txn-list">'+rows.map(x=>'<button class="txn-item" data-id="'+escAttr(x.id)+'" onclick="openTxnModal({id:this.dataset.id})"><span class="txn-item-l"><span class="txn-item-name">'+escText(x.merchant||'Expense')+'</span><span class="txn-item-meta">'+escText(fmtDate(x.date))+'</span></span><span class="txn-item-amt">'+fmtMoneyExact(x.amount)+'</span></button>').join('')+'<button class="txn-add-inline" data-cat="'+escAttr(id)+'" onclick="openTxnModal({catId:this.dataset.cat})">+ Add expense</button></div>':'');
  }).join('')+(m.legacySpent?'<p class="bp-note">'+fmtMoneyExact(m.legacySpent)+' from complete weekly totals; retained in weekly history.</p>':'')+
    '<div class="bud-row"><span>Total variable</span><span id="calc-variable">'+fmtMoneyExact(m.spent)+'</span></div>'+(budEditMode.var?'<button class="add-cat-btn" data-type="var">+ Add variable expense</button>':'');
}
function budPeriodDaySpend(){
  const p=budPeriodViewed(),m=budPeriodMoney(p),out={days:[],dated:0,carry:0,carryCount:0,undated:m.legacySpent,txnCount:0,max:0,busiest:null};
  for(let i=0;i<p.days;i++){
    const key=budDateAdd(p.start,i),dt=localMidnight(key),txns=m.purchases.filter(x=>x.date===key&&!txnIsCarryRecord(x)),total=txns.reduce((s,x)=>s+Number(x.amount||0),0);
    const row={key,dt,name:dt.toLocaleDateString('en-AU',{weekday:'short'}),txns,total};out.days.push(row);out.dated+=total;out.txnCount+=txns.length;
    if(total>out.max){out.max=total;out.busiest=row;}
  }
  m.purchases.filter(txnIsCarryRecord).forEach(x=>{out.carry+=Number(x.amount||0);out.carryCount++;});return out;
}
function budPeriodEssentialHtml(){return budEssentialLineHtml(budEssentialSummary(budPeriodMoney(budPeriodViewed()).purchases),'this period');}
function budPeriodLiveMoney(){
  const m=budPeriodMoney(budPeriodViewed()),r={...m.record,reserves:{...(m.record.reserves||{})}};
  if(S.view==='budget'&&budgetView==='week'){
    const sav=document.getElementById('sav-amount');if(sav)r.savings=budMoneyRound(sav.value);
    document.querySelectorAll('[data-period-reserve]').forEach(el=>r.reserves[el.dataset.periodReserve]=budMoneyRound(el.value));
  }
  return budPeriodCompute(m.range,r,ledgerData,txnData,budCyclesLoad().periods,budPeriodLegacy(m.range));
}

const DAILY_UPDATE_PAGES=[
  {icon:'calendar',title:'Money that fits your payday',body:'Week is now Budget, with weekly, fortnightly, monthly and custom periods. Set income sources and paydays, and enter fortnightly bills. Improved bill conversions and balance calculations keep your familiar Finance cards and saved weekly plans together.'},
  {icon:'home',title:'A clearer, calmer Home',body:'Gradient heroes and status are back, with gentler orange spending warnings. Desktop weather fills its side of the briefing, with the date inside. Today and Week forecasts slide from the bottom controls on phone and desktop. One Customise Home button keeps layout choices together.'},
  {icon:'wallet',title:'Smoother first steps',body:'Account data stays separate when signing in or switching users. The Daily logo is visible in light-mode onboarding, and new users start with the recommended six Home cards. Swipe through this update, then dismiss it when you’re ready.'}
];
let dailyUpdatePage=0;
function dailyUpdatePopupEligible(){
  return typeof profileData!=='undefined'&&!!profileData.onboardingVersion&&(Number(profileData.budgetRhythmSeen)||0)<2&&
    !(typeof auth!=='undefined'&&auth?.currentUser&&!_cloudWorkoutReady);
}
function dailyUpdatePopupCheck(){
  if(!dailyUpdatePopupEligible()||document.getElementById('daily-update-dialog'))return;
  const ob=document.getElementById('onboarding-overlay');
  if(ob&&!ob.classList.contains('hidden'))return;
  if(document.querySelector('dialog[open],#whats-new-overlay'))return;
  const d=document.createElement('dialog');d.id='daily-update-dialog';d.className='daily-update-dialog';
  d.setAttribute('aria-labelledby','daily-update-title');
  d.innerHTML='<div class="du-head"><span>Daily · Quality-of-life update</span><button type="button" aria-label="Dismiss updates" onclick="dailyUpdateDismiss()">×</button></div>'+
    '<div class="du-page" id="daily-update-page" tabindex="0" aria-live="polite"><div id="daily-update-art" aria-hidden="true"></div><h2 id="daily-update-title"></h2><p id="daily-update-copy"></p></div>'+
    '<div class="du-dots" aria-label="Update pages">'+DAILY_UPDATE_PAGES.map((_,i)=>'<button type="button" aria-label="Update '+(i+1)+' of '+DAILY_UPDATE_PAGES.length+'" onclick="dailyUpdateGo('+i+')"></button>').join('')+'</div>'+
    '<div class="du-foot"><button class="stg-btn" id="daily-update-back" onclick="dailyUpdateGo(dailyUpdatePage-1)">Back</button><span id="daily-update-count"></span><button class="stg-btn primary" id="daily-update-next" onclick="dailyUpdateNext()">Next</button></div>';
  d.addEventListener('cancel',e=>{e.preventDefault();dailyUpdateDismiss();});
  d.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();dailyUpdateGo(dailyUpdatePage+(e.key==='ArrowRight'?1:-1));}});
  let start=null;
  const page=d.querySelector('.du-page');
  page.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};});
  page.addEventListener('pointerup',e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.5)dailyUpdateGo(dailyUpdatePage+(dx<0?1:-1));});
  page.addEventListener('pointercancel',()=>{start=null;});
  document.body.appendChild(d);dailyUpdatePage=0;dailyUpdateGo(0);d.showModal();
}
function dailyUpdateGo(n){
  const d=document.getElementById('daily-update-dialog');if(!d)return;
  dailyUpdatePage=Math.max(0,Math.min(DAILY_UPDATE_PAGES.length-1,n));const p=DAILY_UPDATE_PAGES[dailyUpdatePage];
  d.querySelector('#daily-update-art').innerHTML=cardIcon(p.icon);
  d.querySelector('#daily-update-title').textContent=p.title;d.querySelector('#daily-update-copy').textContent=p.body;
  d.querySelector('#daily-update-count').textContent=(dailyUpdatePage+1)+' / '+DAILY_UPDATE_PAGES.length;
  d.querySelector('#daily-update-back').disabled=dailyUpdatePage===0;
  d.querySelector('#daily-update-next').textContent=dailyUpdatePage===DAILY_UPDATE_PAGES.length-1?'Got it':'Next';
  d.querySelectorAll('.du-dots button').forEach((el,i)=>el.setAttribute('aria-current',i===dailyUpdatePage?'step':'false'));
}
function dailyUpdateNext(){if(dailyUpdatePage===DAILY_UPDATE_PAGES.length-1)dailyUpdateDismiss();else dailyUpdateGo(dailyUpdatePage+1);}
