'use strict';

let budPlanDraft=null,budPlanTargetDraft=null;
function budPlanWorkspaceKey(event){
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  const section=event.key==='Home'?'future':event.key==='End'?'review':budgetPlanSection==='future'?'review':'future';
  setBudgetPlanSection(section);document.getElementById('plan-'+section+'-tab')?.focus({preventScroll:true});
}
function budPlanOwner(){return JSON.stringify([acctToolUid(),localStorage.scope||'legacy']);}
function budPlanEnsureDraft(){
  const owner=budPlanOwner();
  if(!budPlanDraft||budPlanDraft.owner!==owner){
    budPlanDraft={owner,starting:'',income:'0',spending:'',savings:'0',months:'3',covered:[],ran:false};
    budPlanTargetDraft=null;
  }
  return budPlanDraft;
}
function budPlanWindow(today,months){
  const count=[1,3,6,12].includes(Number(months))?Number(months):3;
  return {start:today,end:budDateAdd(budDateMonth(today.slice(0,8)+'01',count),-1),months:count};
}
function budPlanChargeKey(o){return [o.kind,o.key,o.cat?.id||o.acct?.id||o.acctId||o.name].join('|');}
function budPlanCommitments(today=getLocalDate(),months=3){
  const range=budPlanWindow(today,months),items=billOccurrences(localMidnight(range.start),localMidnight(range.end));
  const buckets=Array.from({length:range.months},(_,i)=>{
    const start=budDateMonth(today.slice(0,8)+'01',i),rows=items.filter(o=>o.key.slice(0,7)===start.slice(0,7));
    return {key:start.slice(0,7),start:i?start:today,end:budDateAdd(budDateMonth(start,1),-1),items:rows,
      total:budMoneyRound(rows.reduce((n,o)=>n+o.amount,0))};
  });
  return {range,items,months:buckets,unscheduled:billsUndatedCount(),total:budMoneyRound(buckets.reduce((n,m)=>n+m.total,0))};
}
function budPlanScenario(input,commitments){
  const starting=acctMoney(input.starting),income=acctMoney(input.income),spending=acctMoney(input.spending),savings=acctMoney(input.savings||'0');
  const cents=n=>Math.round(n*100),range=commitments.range,covered=new Set(input.covered||[]),due=new Map();
  let coveredTotal=0;
  commitments.items.forEach(o=>{
    if(covered.has(budPlanChargeKey(o))){coveredTotal+=cents(o.amount);return;}
    due.set(o.key,(due.get(o.key)||0)+cents(o.amount));
  });
  const monthly={income:cents(income),spending:cents(spending),savings:cents(savings)};
  let balance=cents(starting),lowest=balance,firstShortfall=null;
  const rows=[];
  for(let date=range.start;date<=range.end;date=budDateAdd(date,1)){
    const month=date.slice(0,7),day=Number(date.slice(8)),last=Number(budDateAdd(budDateMonth(month+'-01',1),-1).slice(8));
    if(rows.at(-1)?.month!==month)rows.push({month,start:date,end:date,opening:balance/100,income:0,spending:0,savings:0,bills:0,closing:0});
    const row=rows.at(-1),amounts={};
    // Differences of cumulative rounded cents reconcile a full month exactly, including
    // partial starting months, without assuming a payday or manufacturing income records.
    Object.entries(monthly).forEach(([key,n])=>{amounts[key]=Math.round(n*day/last)-Math.round(n*(day-1)/last);row[key]+=amounts[key];});
    const bills=due.get(date)||0;row.bills+=bills;
    balance+=amounts.income-amounts.spending-amounts.savings-bills;
    if(!Number.isSafeInteger(balance))throw new Error('Those amounts are too large to calculate safely.');
    lowest=Math.min(lowest,balance);if(balance<0&&!firstShortfall)firstShortfall=date;
    row.end=date;row.closing=balance/100;
  }
  rows.forEach(r=>{['income','spending','savings','bills'].forEach(k=>{r[k]/=100;});});
  return {range,rows,ending:balance/100,lowest:lowest/100,gap:Math.max(0,-lowest)/100,firstShortfall,coveredTotal:coveredTotal/100,unscheduled:commitments.unscheduled||0};
}
function budPlanBudgetSignature(){
  return JSON.stringify([budPlanOwner(),budCyclesLoad(),budgetData,budLoadData(),ledgerData,txnData,lsLoad('daily_accounts',[]),loadIncCats(),loadFixCats(),budDefaults]);
}
function budPlanBudgetState(){
  const p=budPeriodCurrent();
  if(p){const m=budPeriodMoney(p),saved=budCyclesLoad().periods[p.id];
    const owned=saved&&(saved.fundingConfirmed||saved.allocationsReviewed||Object.prototype.hasOwnProperty.call(saved,'reserves'));
    return {period:true,range:p,key:p.start,kind:!owned&&m.record.inheritedWeeklyPlan?'week':'period',
    savings:Number(m.record.savings)||0,goal:m.record.goal??null,recorded:m.savingsRecorded,committed:m.savingsCommitted,
    available:m.available,bills:m.reserved};}
  const start=weekKey(getMondayOf(0)),w=budgetData[start]||{},range={start,end:budDateAdd(start,6),days:7,id:start+'_'+budDateAdd(start,6)};
  const money=budWeekMoney(w,start),recorded=budPeriodCompute(range,{},ledgerData,txnData,{},null).savingsRecorded;
  return {period:false,range,key:start,kind:'week',savings:weekSavedAmt(w),goal:getWeekVarGoal(w),recorded,
    committed:money.saved,available:money.available,bills:money.committed};
}
function budPlanGoalFacts(accountsList,range,today=getLocalDate()){
  return accountsList.filter(a=>!a.archivedAt&&acctIsSaver(a)).map(a=>{
    const goal=Number(a.savingsPlan?.goal)||0,balance=a.current!==null&&a.current!==''&&Number.isFinite(Number(a.current))?Number(a.current):null;
    const remaining=balance===null?null:Math.max(0,budMoneyRound(goal-balance));
    const date=budDateValid(a.savingsPlan?.targetDate)?a.savingsPlan.targetDate:null;
    const days=date?Math.max(1,budDateDays(today,date)+1):null;
    const contribution=goal>0&&remaining!==null&&days?Math.min(remaining,Math.ceil(remaining*100*range.days/days)/100):null;
    return {account:a,goal,balance,remaining,date,contribution};
  });
}
function budPlanCommitmentsHtml(c,state){
  const max=Math.max(...c.months.map(m=>m.total),1),busiest=c.months.reduce((a,b)=>b.total>a.total?b:a);
  const label=d=>localMidnight(d).toLocaleDateString('en-AU',{day:'numeric',month:'short'});
  const large=[...c.items].sort((a,b)=>b.amount-a.amount).slice(0,3),undated=billsUndatedCount();
  return cardHeader('calendar','Future commitments','<span class="plan-muted">Next 3 calendar months</span>')+
    statsFigure(c.items.length?fmtMoneyExact(c.total):'—','','Scheduled from '+escText(label(c.range.start))+' to '+escText(label(c.range.end)))+
    (c.items.length?'<div class="plan-months">'+c.months.map((m,i)=>'<div class="plan-month"><div><strong>'+escText(localMidnight(m.start).toLocaleDateString('en-AU',{month:'long',year:'numeric'}))+'</strong><b>'+fmtMoneyExact(m.total)+'</b></div>'+
      '<div class="card-bar"><div class="card-bar-fill" style="width:'+(m.total/max*100)+'%"></div></div><small>'+(i===0?'Remaining dates · ':'')+m.items.length+' scheduled '+(m.items.length===1?'charge':'charges')+'</small></div>').join('')+'</div>':'')+
    (c.items.length?'<p class="plan-caption">Heaviest month · '+escText(localMidnight(busiest.start).toLocaleDateString('en-AU',{month:'long'}))+' '+fmtMoneyExact(busiest.total)+'</p>':'<p class="plan-caption">Add billing dates to see future commitments.</p>')+
    (large.length?'<details class="plan-large"><summary>Funding guide for larger costs</summary><p class="plan-caption">Estimates assume none of that cost is funded yet.</p>'+large.map(o=>{
      const days=Math.max(1,budDateDays(getLocalDate(),o.key)+1),perBudget=Math.min(o.amount,Math.ceil(o.amount*100*state.range.days/days)/100);
      return '<div class="plan-line"><span>'+escText(o.name)+'<small>'+escText(fmtDate(o.key))+(o.kind==='statement'?' · known card statement':'')+'<br>'+fmtMoneyExact(perBudget)+' / budget to set aside</small></span><strong>'+fmtMoneyExact(o.amount)+'</strong></div>';
    }).join('')+'</details>':'')+
    '<div class="plan-line"><span>Budget bill allowance remaining<small>'+escText(budPeriodLabel(state.range))+'</small></span><strong>'+fmtMoneyExact(state.bills)+'</strong></div>'+
    (undated?'<p class="plan-caption">'+undated+' bill'+(undated===1?' needs':'s need')+' a billing date.</p>':'')+
    '<footer class="plan-card-actions"><button type="button" class="stg-btn quiet" onclick="openBudgetEditor()">Manage commitments</button><button type="button" class="cat-action" onclick="openBillsCalendar()">View schedule →</button></footer>';
}
function budPlanTargetsHtml(state){
  const goals=budPlanGoalFacts(loadAccounts(),state.range),suggested=goals.reduce((n,g)=>n+(g.contribution||0),0);
  return cardHeader('target','Targets','<button type="button" class="card-hd-btn plan-edit-targets" aria-label="Edit budget targets" title="Edit budget targets" onclick="budPlanBudgetTargetsOpen()">Edit</button>')+'<p class="plan-caption">Budget · '+escText(budPeriodLabel(state.range))+'</p>'+
    statsSplit([['Savings reserved',fmtMoneyExact(state.savings)],['Spending goal',state.goal>0?fmtMoneyExact(state.goal):'Not set']])+
    '<div class="plan-goals-heading"><h3>Savings goals</h3><span class="plan-muted">Linked to Accounts</span></div>'+
    (goals.length?goals.map(g=>'<div class="plan-goal"><div class="plan-line"><span>'+escText(g.account.name)+
      '<small>'+(g.goal>0?(g.remaining===null?'Balance needs review':fmtMoneyExact(g.remaining)+' to go'):'Set a balance target')+'</small></span>'+
      '<button type="button" class="card-hd-btn" data-account="'+escAttr(g.account.id)+'" onclick="budPlanSavingsGoalOpen(this.dataset.account)">'+(g.goal>0?'Edit':'Set target')+'</button></div>'+
      (g.goal>0?'<div class="plan-goal-values"><strong>'+(g.balance===null?'—':fmtMoneyExact(g.balance))+'</strong><span>of '+fmtMoneyExact(g.goal)+'</span></div>'+
        (g.balance===null?'':'<progress max="'+g.goal+'" value="'+Math.max(0,Math.min(g.goal,g.balance))+'" aria-label="'+escAttr(g.account.name+' savings goal progress')+'"></progress>'):'')+
      (g.date?'<p class="plan-caption">'+escText(localMidnight(g.date).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}))+(g.date<getLocalDate()?' · date passed':'')+(g.contribution!==null&&g.remaining>0?' · '+fmtMoneyExact(g.contribution)+' / budget suggested':'')+'</p>':'')+'</div>').join(''):
      '<p class="plan-caption">Mark an account as savings in Accounts to give it a balance goal.</p>')+
    (suggested>0?'<button type="button" class="cat-action" data-suggestion="'+budMoneyRound(suggested)+'" onclick="budPlanBudgetTargetsOpen(this.dataset.suggestion)">Review suggested savings · '+fmtMoneyExact(suggested)+' →</button>':'')+
    '<footer class="plan-card-actions"><span class="plan-muted">Targets reserve money; savings records track what you put aside.</span><button type="button" class="cat-action" onclick="openAccounts()">Accounts →</button></footer>';
}
function budPlanBudgetTargetsOpen(suggestion){
  const state=budPlanBudgetState();
  budPlanTargetDraft={owner:budPlanOwner(),signature:budPlanBudgetSignature(),state};
  budPeriodDialog('Budget targets','<p>'+escText(budPeriodLabel(state.range))+' · this budget only</p>'+
    '<label>Savings to reserve<input name="savings" type="text" inputmode="decimal" value="'+escAttr(suggestion===undefined?state.savings:suggestion)+'"></label>'+
    '<label>Spending goal<input name="goal" type="text" inputmode="decimal" value="'+escAttr(state.goal>0?state.goal:'')+'" placeholder="No goal"></label>'+
    '<p class="bp-note">Savings reduce available spending. The spending goal is a limit, not another deduction. Leave it blank to remove this budget’s goal.</p>'+
    '<p id="plan-target-impact" class="plan-target-impact"></p><p class="bp-note">Saving targets creates no income, payment or account transfer.</p>');
  const form=document.getElementById('bp-form');form.onsubmit=budPlanBudgetTargetsSave;
  form.oninput=budPlanBudgetTargetsPreview;budPlanBudgetTargetsPreview();
  form.querySelector('[type=submit]').textContent='Save targets';
}
function budPlanBudgetTargetsPreview(){
  const host=document.getElementById('plan-target-impact');if(!host||!budPlanTargetDraft)return;
  try{const s=budPlanTargetDraft.state,n=acctMoney(document.getElementById('bp-form').elements.savings.value,true)||0;
    const next=s.available===null?null:budMoneyRound(s.available+s.committed-(s.period?Math.max(s.recorded,n):n));
    host.textContent=next===null?'Available spending needs a funding or date review in Budget.':'Available to spend after this target: '+fmtMoneyExact(next);
  }catch(e){host.textContent=e.message;}
}
function budPlanBudgetTargetsCommit(draft,savings,goal){
  savings=acctMoney(savings);goal=acctMoney(goal);
  if(!draft||draft.owner!==budPlanOwner()||draft.signature!==budPlanBudgetSignature())throw new Error('Financial records or budget dates changed. Close and reopen Targets to review them.');
  const state=budPlanBudgetState();
  if(state.range.id!==draft.state.range.id||state.kind!==draft.state.kind)throw new Error('The budget period changed. Reopen Targets.');
  if(savings===state.savings&&goal===Number(state.goal||0))return false;
  if(state.kind==='week'){
    const old=budgetData[state.key],next=JSON.parse(JSON.stringify(old||{}));
    Object.assign(next,{wk:state.key,sav_amount:String(savings),var_goal:String(goal),updatedAt:Date.now()});
    budEnsureFixRates(next);budEnsureStatsSnapshot(next,state.key,true);if(!next.saved)next.draft=true;
    budgetData[state.key]=next;
    try{budSaveData(state.key);if(JSON.stringify(budLoadData()[state.key])!==JSON.stringify(next))throw new Error('Targets could not be saved on this device.');}
    catch(e){if(old===undefined)delete budgetData[state.key];else budgetData[state.key]=old;throw e;}
  }else{
    const store=budCyclesLoad();
    store.periods[state.range.id]={...(store.periods[state.range.id]||{}),start:state.range.start,end:state.range.end,savings,goal,updatedAt:Date.now()};
    delete store.periods[state.range.id].inheritedWeeklyPlan;
    budCyclesSave(store);
    const saved=budCyclesLoad().periods[state.range.id];
    if(saved?.savings!==savings||saved?.goal!==goal)throw new Error('Targets could not be saved on this device.');
  }
  return true;
}
function budPlanBudgetTargetsSave(event){
  event.preventDefault();
  try{
    const f=new FormData(event.target),savings=acctMoney(f.get('savings'),true)||0,goal=acctMoney(f.get('goal'),true)||0;
    budPlanBudgetTargetsCommit(budPlanTargetDraft,savings,goal);budPlanTargetDraft=null;
    document.getElementById('bud-period-dialog').close();budPeriodRefresh();
  }catch(e){budPeriodError(e.message);}
}
function budPlanSavingsGoalOpen(id){
  const a=loadAccounts().find(a=>a.id===id&&!a.archivedAt&&acctIsSaver(a));if(!a)return;
  acctToolDraft={kind:'plan-savings-goal',id,signature:acctLinkSignature()};
  acctToolForm('Savings goal','<p>'+escText(a.name)+'</p>'+acctToolField('plan-goal-amount','Target balance','text',a.savingsPlan?.goal??'')+
    acctToolField('plan-goal-date','Target date (optional)','date',a.savingsPlan?.targetDate||'')+
    '<p>Budget contributions are set separately in Targets. This goal changes no account balance.</p>','budPlanSavingsGoalSave','Save goal');
}
function budPlanSavingsGoalSave(){
  if(acctToolDraft?.kind!=='plan-savings-goal')return false;
  return acctFinAccountSave((list,d)=>{
    const a=list.find(a=>a.id===d.id&&!a.archivedAt&&acctIsSaver(a));if(!a)throw new Error('This savings account changed. Reopen its goal.');
    const goal=acctMoney(document.getElementById('plan-goal-amount').value,true),date=document.getElementById('plan-goal-date').value;
    if(date&&(!budDateValid(date)||!(goal>0)))throw new Error('Use a valid goal date and a target amount.');
    return list.map(a=>a.id===d.id?{...a,savingsPlan:{...(a.savingsPlan||{}),goal,targetDate:date}}:a);
  });
}
function budPlanScenarioFormHtml(d){
  const field=(id,label,value,required)=>'<label for="plan-sim-'+id+'">'+label+'<input id="plan-sim-'+id+'" name="'+id+'" type="text" inputmode="decimal" value="'+escAttr(value)+'"'+(required?' required':'')+'></label>';
  return cardHeader('trend','What if?','<span class="plan-scenario-tag">Scenario only</span>')+
    '<p class="plan-caption">Try a different income, spending level or savings contribution.</p>'+
    '<form id="plan-scenario-form" onsubmit="budPlanScenarioRun(event)" oninput="budPlanScenarioCapture(this)">'+
      '<div class="plan-scenario-fields">'+field('starting','Funds available for this scenario',d.starting,true)+field('income','Income / month · assumed',d.income,true)+
      field('spending','Everyday spending / month',d.spending,true)+field('savings','Savings / month',d.savings,false)+
      '<div><label for="plan-sim-months">Months shown</label><select id="plan-sim-months" name="months" onchange="budPlanScenarioCoverageRefresh()">'+[1,3,6,12].map(n=>'<option value="'+n+'"'+(String(n)===d.months?' selected':'')+'>'+n+(n===1?' month':' months')+'</option>').join('')+'</select></div></div>'+
      '<p class="plan-caption">Enter funds you can use for these costs, including bill money. Keep protected savings out. Everyday spending excludes the scheduled bills below.</p>'+
      '<details class="plan-covered"><summary>Charges covered outside these funds</summary><p class="plan-caption">Exclude a charge only when its funding is already held outside your starting funds, or it is already paid. This records no payment.</p><div id="plan-covered-options"></div></details>'+
      '<div class="plan-scenario-actions"><button type="submit" class="stg-btn">Run scenario</button><button type="button" class="cat-action" onclick="budPlanScenarioReset()">Reset</button></div>'+
      '<p class="plan-caption">Monthly assumptions are spread evenly across calendar days. Bills use their scheduled dates. Future card statements and unrecorded costs are unknown.</p>'+
      '<p id="plan-scenario-error" role="alert"></p></form><div id="plan-scenario-result" aria-live="polite"></div>';
}
function budPlanScenarioCapture(form){
  const d=budPlanEnsureDraft(),before=JSON.stringify([d.starting,d.income,d.spending,d.savings,d.months,d.covered]);
  ['starting','income','spending','savings','months'].forEach(k=>{d[k]=form.elements[k].value;});
  d.covered=[...form.querySelectorAll('[data-covered]:checked')].map(el=>el.dataset.covered);
  if(d.ran&&before!==JSON.stringify([d.starting,d.income,d.spending,d.savings,d.months,d.covered]))document.getElementById('plan-scenario-result').innerHTML='<p class="plan-caption">Inputs changed. Run the scenario to update the result.</p>';
}
function budPlanScenarioCoverageRefresh(){
  const form=document.getElementById('plan-scenario-form');if(!form)return;
  budPlanScenarioCapture(form);const d=budPlanEnsureDraft(),c=budPlanCommitments(getLocalDate(),d.months),held=new Set(d.covered);
  const host=document.getElementById('plan-covered-options');
  host.innerHTML=c.items.length?c.items.map(o=>'<label class="plan-covered-row"><input type="checkbox" data-covered="'+escAttr(budPlanChargeKey(o))+'"'+(held.has(budPlanChargeKey(o))?' checked':'')+'><span>'+escText(o.name)+'<small>'+escText(fmtDate(o.key))+'</small></span><strong>'+fmtMoneyExact(o.amount)+'</strong></label>').join(''):'<p class="plan-caption">No scheduled charges in these dates.</p>';
}
function budPlanScenarioResultHtml(result){
  const monthLabel=key=>localMidnight(key+'-01').toLocaleDateString('en-AU',{month:'short',year:'numeric'});
  const fullDate=date=>localMidnight(date).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
  return '<div class="plan-scenario-outcome'+(result.firstShortfall?' has-gap':'')+'">'+
    '<div><span>'+(result.firstShortfall?'Additional funds needed':'Scenario funds at end')+'</span>'+statsFigure(fmtMoneyExact(result.firstShortfall?result.gap:result.ending),'','')+'</div>'+
    '<p>'+(result.firstShortfall?'First projected shortfall · '+escText(fullDate(result.firstShortfall)):'No shortfall in these dates, based on your assumptions and known scheduled costs.')+'</p>'+
    statsSplit([[result.firstShortfall?'Ending scenario funds':'Everyday spending',fmtMoneyExact(result.firstShortfall?result.ending:result.rows.reduce((n,r)=>n+r.spending,0))],['Bills included',fmtMoneyExact(result.rows.reduce((n,r)=>n+r.bills,0))]])+'</div>'+
    '<div class="plan-scenario-table" tabindex="0" role="region" aria-label="Scenario month-by-month amounts"><table><caption>'+escText(fullDate(result.range.start)+' – '+fullDate(result.range.end))+' · scenario, not recorded money</caption><thead><tr><th scope="col">Month</th><th scope="col">Income</th><th scope="col">Everyday</th><th scope="col">Bills</th><th scope="col">Savings</th><th scope="col">Ending</th></tr></thead><tbody>'+
    result.rows.map(r=>'<tr><th scope="row">'+escText(monthLabel(r.month))+'</th><td>'+fmtMoneyExact(r.income)+'</td><td>'+fmtMoneyExact(r.spending)+'</td><td>'+fmtMoneyExact(r.bills)+'</td><td>'+fmtMoneyExact(r.savings)+'</td><td>'+fmtMoneyExact(r.closing)+'</td></tr>').join('')+'</tbody></table></div>'+
    (result.coveredTotal?'<p class="plan-caption">'+fmtMoneyExact(result.coveredTotal)+' of scheduled charges marked covered outside these funds.</p>':'')+
    (result.unscheduled?'<p class="plan-caption">'+result.unscheduled+' bill'+(result.unscheduled===1?' has':'s have')+' no billing date and '+(result.unscheduled===1?'is':'are')+' excluded from this scenario.</p>':'');
}
function budPlanScenarioRun(event){
  event.preventDefault();const form=event.target;budPlanScenarioCapture(form);
  try{const d=budPlanEnsureDraft(),c=budPlanCommitments(getLocalDate(),d.months),result=budPlanScenario(d,c);
    d.ran=true;d.basis=JSON.stringify([c.range,c.items.map(o=>[budPlanChargeKey(o),o.amount])]);
    document.getElementById('plan-scenario-error').textContent='';document.getElementById('plan-scenario-result').innerHTML=budPlanScenarioResultHtml(result);
  }catch(e){document.getElementById('plan-scenario-error').textContent=e.message;document.getElementById('plan-scenario-result').innerHTML='';}
}
function budPlanScenarioReset(){budPlanDraft=null;document.getElementById('plan-scenario').dataset.owner='';budPlanWorkspaceRender();}
function budPlanWorkspaceRender(){
  const d=budPlanEnsureDraft(),state=budPlanBudgetState(),c=budPlanCommitments();
  document.getElementById('plan-commitments').innerHTML=budPlanCommitmentsHtml(c,state);
  document.getElementById('plan-targets').innerHTML=budPlanTargetsHtml(state);
  const scenario=document.getElementById('plan-scenario');
  if(scenario.dataset.owner!==d.owner){scenario.innerHTML=budPlanScenarioFormHtml(d);scenario.dataset.owner=d.owner;}
  else if(d.ran){const schedule=budPlanCommitments(getLocalDate(),d.months);
    if(d.basis!==JSON.stringify([schedule.range,schedule.items.map(o=>[budPlanChargeKey(o),o.amount])]))document.getElementById('plan-scenario-result').innerHTML='<p class="plan-caption">The schedule changed. Run your scenario again to include the latest costs.</p>';}
  budPlanScenarioCoverageRefresh();
}
