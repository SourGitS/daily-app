'use strict';

// Presentation only. All amounts come from the same dated readers as Finance's reports.
const budMoneyUI={chart:'daily',selected:'',activityDay:'',showAll:false};
function budMoneyDate(date,year=false){
  return localMidnight(date).toLocaleDateString('en-AU',{day:'numeric',month:'short',...(year?{year:'numeric'}:{})});
}
function budMoneyRangeLabel(range){
  return budMoneyDate(range.start,range.start.slice(0,4)!==range.end.slice(0,4))+' – '+budMoneyDate(range.end,true);
}
function budMoneyFacts(range=budOvRangeWindow()){
  const money=budOvDatedMoney(range.start,range.end),entries=budOvRangeEntries(range),groups=budOvSpendGroups(money);
  const legacy=budPeriodLegacy(range),movement=ledgerSavingsMovement(range.start,range.end);
  const length=budDateDays(range.start,range.end)+1;
  const monthCount=(Number(range.end.slice(0,4))-Number(range.start.slice(0,4)))*12+Number(range.end.slice(5,7))-Number(range.start.slice(5,7))+1;
  const unit=length<=35?'day':length<=210?'week':monthCount<=48?'month':'year';
  const days=[];
  for(let date=range.start;date<=range.end;){
    let next=unit==='day'?budDateAdd(date,1):unit==='week'?budDateAdd(date,7):unit==='month'?budDateMonth(date.slice(0,8)+'01',1):String(Number(date.slice(0,4))+1).padStart(4,'0')+'-01-01';
    const end=next>range.end?range.end:budDateAdd(next,-1);
    days.push({date,end,spent:0,income:0,count:0});date=next;
  }
  const add=(row,field)=>{
    const bucket=days.find(day=>row.date>=day.date&&row.date<=day.end);if(!bucket)return;
    bucket[field]=budMoneyRound(bucket[field]+Number(row.amount));if(field==='spent')bucket.count++;
  };
  money.purchases.forEach(row=>add(row,'spent'));
  money.rows.forEach(row=>{if(row.kind==='bill_payment')add(row,'spent');else if(row.kind==='income')add(row,'income');});
  const latestExpense=[...money.purchases,...money.rows.filter(row=>row.kind==='bill_payment')].map(row=>row.date).sort().at(-1)||'';
  const savings=movement.transfers?{amount:movement.net,kind:'transfers',...movement}:
    money.savingsRecorded?{amount:money.savingsRecorded,kind:'records',...movement}:{amount:null,kind:'none',...movement};
  return {range,money,entries,groups,days,unit,bucketLabel:unit==='day'?'Daily spending':unit==='week'?'Weekly spending':unit==='month'?'Monthly spending':'Yearly spending',
    difference:budMoneyRound(money.income-money.total),latestExpense,savings,
    undated:!!(money.incomplete||money.legacySpent||legacy.incomplete||legacy.spent||legacy.income),invalid:money.invalid};
}
function budMoneySelected(f){
  let index=f.days.findIndex(day=>day.date===budMoneyUI.selected);
  if(index<0)index=f.days.findIndex(day=>f.latestExpense>=day.date&&f.latestExpense<=day.end);
  return index<0?f.days.length-1:index;
}
function budMoneyMetric(name,label,value,extra=''){
  return '<div class="money-metric money-metric-'+name+'" data-money-metric="'+name+'"><span>'+label+'</span><strong>'+value+'</strong>'+(extra?'<small>'+extra+'</small>':'')+'</div>';
}
function budMoneySavingsHtml(f){
  const savings=f.savings;
  return '<div class="money-savings" data-money-metric="savings"><div><span>'+(savings.kind==='records'?'Savings logged':'Savings transfers')+'</span><strong>'+(savings.amount===null?'—':fmtMoneyExact(savings.amount))+'</strong></div>'+
    '<small>'+(savings.kind==='none'?'None recorded':savings.kind==='records'?'Manually recorded':fmtMoneyExact(savings.contributions)+' in · '+fmtMoneyExact(savings.withdrawals)+' out')+'</small></div>';
}
function budMoneyChartHtml(f){
  const running=budMoneyUI.chart==='total',selected=budMoneySelected(f),day=f.days[selected],width=700,height=178;
  let sum=0;const values=f.days.map(row=>running?(sum=budMoneyRound(sum+row.spent)):row.spent);
  const max=Math.max(...values,0),min=Math.min(...values,0),span=Math.max(max-min,1);
  const power=Math.pow(10,Math.floor(Math.log10(span))),step=power*(span/power<=2?0.5:span/power<=5?1:2);
  const ceiling=Math.max(step,Math.ceil(max/step)*step),floor=Math.min(0,Math.floor(min/step)*step);
  const y=n=>height-(n-floor)/(ceiling-floor)*height;
  const slot=width/f.days.length,x=index=>(index+.5)*slot;
  const barWidth=Math.max(2,Math.min(26,slot*.62));
  const grid=[ceiling,(ceiling+floor)/2,floor];
  const path=values.map((value,index)=>(index?'L':'M')+x(index).toFixed(2)+' '+y(value).toFixed(2)).join(' ');
  const mark=running?'<defs><linearGradient id="money-spend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity=".2"/><stop offset="100%" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>'+
    '<path class="money-chart-area" d="'+path+' L'+x(values.length-1).toFixed(2)+' '+y(0).toFixed(2)+' L'+x(0).toFixed(2)+' '+y(0).toFixed(2)+'Z"/>'+
    '<path class="money-chart-line" d="'+path+'"/><circle class="money-chart-point" cx="'+x(selected).toFixed(2)+'" cy="'+y(values[selected]).toFixed(2)+'" r="4"/>':
    values.map((value,index)=>'<rect data-money-bar="'+index+'" class="money-chart-bar'+(index===selected?' is-selected':'')+'" x="'+(x(index)-barWidth/2).toFixed(2)+'" y="'+Math.min(y(value),y(0)).toFixed(2)+'" width="'+barWidth.toFixed(2)+'" height="'+(value===0?0:Math.max(1,Math.abs(y(value)-y(0)))).toFixed(2)+'" rx="3"/>').join('');
  const ticks=[...new Set([0,Math.floor((f.days.length-1)/3),Math.floor((f.days.length-1)*2/3),f.days.length-1])];
  const dateLabel=row=>f.unit==='month'?localMidnight(row.date).toLocaleDateString('en-AU',{month:'short'}):f.unit==='year'?row.date.slice(0,4):budMoneyDate(row.date);
  const bucketDate=day.date===day.end?budMoneyDate(day.date):budMoneyDate(day.date)+' – '+budMoneyDate(day.end);
  return '<div class="money-chart-heading"><h3>'+(running?'Spending to date':f.bucketLabel)+'</h3><div class="money-chart-modes" role="group" aria-label="Spending chart view">'+
    [['daily','By '+f.unit],['total','Running total']].map(([id,label])=>'<button type="button" data-money-mode="'+id+'" aria-pressed="'+((running?'total':'daily')===id)+'" onclick="budMoneyChartMode(\''+id+'\')">'+escText(label)+'</button>').join('')+'</div></div>'+
    '<div class="money-chart-layout"><div class="money-chart-axis" aria-hidden="true">'+grid.map(n=>'<span>'+nwCompactMoney(n)+'</span>').join('')+'</div>'+
    '<div class="money-chart-main"><svg id="bud-money-plot" class="money-chart-plot" viewBox="0 0 '+width+' '+height+'" preserveAspectRatio="none" role="img" tabindex="0" aria-label="'+escAttr((running?'Running total of spending':'Spending by '+f.unit)+' for '+budMoneyRangeLabel(f.range)+'. '+fmtMoneyExact(f.money.total)+' total. Use arrow keys to inspect dates.')+'" onpointerdown="budMoneyChartPointer(event)" onkeydown="budMoneyChartKey(event)">'+
    grid.map(n=>'<path class="money-chart-grid" d="M0 '+y(n).toFixed(2)+'H'+width+'"/>').join('')+(floor<0?'<path class="money-chart-zero" d="M0 '+y(0).toFixed(2)+'H'+width+'"/>':'')+
    '<path class="money-chart-guide" d="M'+x(selected).toFixed(2)+' 0V'+height+'"/>'+mark+'</svg>'+
    '<div class="money-chart-dates" aria-hidden="true">'+ticks.map(index=>'<span style="left:'+((index+.5)/f.days.length*100).toFixed(2)+'%">'+escText(dateLabel(f.days[index]))+'</span>').join('')+'</div></div></div>'+
    '<div class="money-chart-inspect"><button type="button" class="money-day-arrow" aria-label="Previous chart date"'+(selected===0?' disabled':'')+' onclick="budMoneyChartSelect('+Math.max(0,selected-1)+')">‹</button>'+
    '<div id="bud-money-chart-caption" aria-live="polite"><span>'+escText(bucketDate)+'</span><strong>'+fmtMoneyExact(running?values[selected]:day.spent)+'</strong><small>'+(running?'Running total':day.count?day.count+' '+(day.count===1?'expense':'expenses'):'None recorded')+'</small></div>'+
    '<button type="button" class="money-day-arrow" aria-label="Next chart date"'+(selected===f.days.length-1?' disabled':'')+' onclick="budMoneyChartSelect('+Math.min(f.days.length-1,selected+1)+')">›</button>'+
    '<button type="button" class="money-day-open" onclick="budMoneyOpenChartDay()">View activity '+cardIcon('arrow-right')+'</button></div>';
}
function budMoneyChartRefresh(){
  const host=document.getElementById('bud-money-chart');if(!host)return;
  const focus=document.activeElement?.id;host.innerHTML=budMoneyChartHtml(budMoneyFacts());
  if(focus==='bud-money-plot')document.getElementById(focus)?.focus({preventScroll:true});
}
function budMoneyChartMode(mode){
  if(!['daily','total'].includes(mode))return;budMoneyUI.chart=mode;budMoneyChartRefresh();
  document.querySelector('[data-money-mode="'+mode+'"]')?.focus({preventScroll:true});
}
function budMoneyChartSelect(index){
  const f=budMoneyFacts(),day=f.days[Math.max(0,Math.min(f.days.length-1,Number(index)||0))];
  budMoneyUI.selected=day.date;budMoneyChartRefresh();
}
function budMoneyChartPointer(event){
  const rect=event.currentTarget.getBoundingClientRect(),f=budMoneyFacts();
  budMoneyChartSelect(Math.floor((event.clientX-rect.left)/Math.max(1,rect.width)*f.days.length));
}
function budMoneyChartKey(event){
  const f=budMoneyFacts(),selected=budMoneySelected(f);
  const index=event.key==='ArrowLeft'?selected-1:event.key==='ArrowRight'?selected+1:event.key==='Home'?0:event.key==='End'?f.days.length-1:null;
  if(index!==null){event.preventDefault();budMoneyChartSelect(index);}
  else if(event.key==='Enter'){event.preventDefault();budMoneyOpenChartDay();}
}
function budMoneyGroupsHtml(f){
  const groups=f.groups,magnitude=groups.reduce((sum,group)=>sum+Math.abs(group.amount),0);
  const row=group=>'<div class="money-category"><div><span>'+escText(group.name)+'</span><strong>'+fmtMoneyExact(group.amount)+'</strong></div><div class="money-category-track"><i style="width:'+Math.min(100,magnitude?Math.abs(group.amount)/magnitude*100:0).toFixed(2)+'%"></i></div></div>';
  return '<section class="money-categories" aria-label="Spending by category"><h3>Where it went</h3>'+
    (groups.length?groups.slice(0,5).map(row).join('')+(groups.length>5?'<details class="money-more-categories"><summary>'+String(groups.length-5)+' more categories</summary>'+groups.slice(5).map(row).join('')+'</details>':''):'<p class="money-empty">No spending recorded</p>')+'</section>';
}
function budMoneyActivityHtml(f){
  const bucket=f.days.find(day=>day.date===budMoneyUI.activityDay),rows=bucket?f.entries.filter(row=>row.date>=bucket.date&&row.date<=bucket.end):f.entries;
  const shown=budMoneyUI.showAll?rows:rows.slice(0,6),categories={purchase:loadVarCats(),income:loadIncCats(),bill_payment:loadFixCats()};
  const labels={purchase:'Purchase',income:'Income',bill_payment:'Bill payment',savings:'Savings logged',transfer:'Transfer',reimbursement:'Reimbursement'};
  return '<section class="card money-activity" aria-label="Activity for selected dates"><header><div><h2 id="bud-money-activity-title" tabindex="-1">Activity</h2><span>'+(bucket?escText(budMoneyDate(bucket.date)+(bucket.end!==bucket.date?' – '+budMoneyDate(bucket.end):''))+' · ':'')+rows.length+' '+(rows.length===1?'entry':'entries')+'</span></div>'+
    (bucket?'<button type="button" class="cat-action" onclick="budMoneyActivityReset()">All dates</button>':'')+'</header>'+
    (shown.length?shown.map(row=>{
      const cat=(categories[row.kind]||[]).find(cat=>cat.id===(row.catId||row.streamId||row.fixCatId));
      const name=row.kind==='purchase'?(row.merchant||cat?.name||'Expense'):row.kind==='income'?(cat?.name||'Income received'):row.kind==='bill_payment'?(cat?.name||'Bill payment'):labels[row.kind];
      const label=row.kind==='purchase'&&Number(row.amount)<0?'Refund':labels[row.kind];
      const positive=row.kind==='income'||row.kind==='reimbursement'||row.kind==='purchase'&&Number(row.amount)<0;
      const source=row.source&&[row.source.file,row.source.row?'row '+row.source.row:''].filter(Boolean).join(' · ');
      const from=loadAccounts().find(account=>account.id===row.fromAcctId),to=loadAccounts().find(account=>account.id===row.toAcctId);
      const account=loadAccounts().find(account=>account.id===row.acctId);
      return '<details class="money-activity-row"><summary><span class="money-activity-symbol" aria-hidden="true">'+cardIcon(row.kind==='income'?'arrow-down':row.kind==='transfer'?'repeat':row.kind==='savings'?'bank':'receipt')+'</span><span class="money-activity-name"><strong>'+escText(name)+'</strong><small>'+escText(budMoneyDate(row.date)+' · '+label)+'</small></span><strong class="money-activity-amount'+(positive?' is-positive':'')+'">'+(row.kind==='income'||row.kind==='reimbursement'?'+':'')+fmtMoneyExact(Number(row.amount))+'</strong><span class="money-chevron" aria-hidden="true">⌄</span></summary>'+
        '<div class="money-entry-detail">'+(account?'<span>'+escText(account.name)+'</span>':'')+(row.kind==='transfer'?'<span>'+escText((from?.name||row.fromName||'Unknown account')+' → '+(to?.name||row.toName||'Unknown account'))+'</span>':'')+(row.note?'<p>'+escText(row.note)+'</p>':'')+(source?'<small>'+escText(source)+'</small>':'')+
        ((row.kind==='purchase'||row.manual)&&row.id?'<button type="button" class="cat-action" data-entry-kind="'+escAttr(row.kind)+'" data-entry-id="'+escAttr(row.id)+'" onclick="budMoneyOpenEntry(this.dataset.entryKind,this.dataset.entryId)">Open entry →</button>':'')+'</div></details>';
    }).join(''):'<p class="money-empty">No entries recorded for these dates</p>')+
    (rows.length>6?'<button type="button" class="money-show-activity" onclick="budMoneyActivityMore()">'+(budMoneyUI.showAll?'Show recent entries':'View all '+rows.length+' entries')+'</button>':'')+'</section>';
}
function budMoneyActivityRefresh(){
  const host=document.getElementById('bud-money-activity');if(host)host.innerHTML=budMoneyActivityHtml(budMoneyFacts());
}
function budMoneyOpenChartDay(){
  const f=budMoneyFacts();budMoneyUI.activityDay=f.days[budMoneySelected(f)].date;budMoneyUI.showAll=false;budMoneyActivityRefresh();
  document.getElementById('bud-money-activity-title')?.focus();
}
function budMoneyActivityReset(){budMoneyUI.activityDay='';budMoneyUI.showAll=false;budMoneyActivityRefresh();}
function budMoneyActivityMore(){budMoneyUI.showAll=!budMoneyUI.showAll;budMoneyActivityRefresh();}
function budMoneyOpenEntry(kind,id){
  const row=budMoneyFacts().entries.find(row=>row.id===id&&row.kind===kind);if(!row)return;
  if(kind==='purchase')openTxnModal({id});else if(row.manual&&['income','savings','bill_payment'].includes(kind))budPeriodEdit(id);
}
function budMoneyBudgetHtml(m){
  const unknown=m.available===null||m.available===undefined;
  const range=m.period||{start:dateStr(m.monday),end:budDateAdd(dateStr(m.monday),6)};
  return '<details class="card money-budget"><summary><span>'+cardIcon('wallet')+'<strong>Budget</strong><small>'+escText(budMoneyRangeLabel(range))+'</small></span><span class="money-budget-status">'+(unknown?'Review funding':fmtMoneyExact(m.available)+' available')+'</span><span class="money-chevron" aria-hidden="true">⌄</span></summary>'+
    '<div class="money-budget-body">'+[['Available',unknown?'—':fmtMoneyExact(m.available)],['Bills reserved',fmtMoneyExact(m.committed)],['Savings allocated',fmtMoneyExact(m.saved)]].map(([label,value])=>'<div><span>'+label+'</span><strong>'+value+'</strong></div>').join('')+'<button type="button" class="stg-btn" onclick="homeOpenBudgetWeek()">Open budget →</button></div></details>';
}
function budMoneyOverviewHtml(m){
  const f=budMoneyFacts(),money=f.money,hasActivity=money.purchases.length||money.rows.length;
  const controls=budOvRangeControls(f.range);
  return '<div class="money-dashboard"><section class="card money-overview" aria-label="Money overview"><div class="money-heading"><div><h1>Your money</h1><span>'+escText(budMoneyRangeLabel(f.range))+'</span></div>'+controls+'</div>'+
    '<div class="money-evidence"><span>Recorded activity</span>'+(f.latestExpense?'<span>Last expense '+escText(budMoneyDate(f.latestExpense))+'</span>':'')+
    (f.undated||f.invalid?'<a href="#money-totals-info" class="money-coverage" onclick="document.getElementById(\'money-totals-info\').open=true">'+(f.invalid?'Entries need review':'Some totals undated')+'</a>':'')+'</div>'+
    '<div class="money-metrics">'+budMoneyMetric('spent','Spent',hasActivity?fmtMoneyExact(money.total):'—')+budMoneyMetric('income','Income',fmtMoneyExact(money.income))+budMoneyMetric('difference','Income − spending',hasActivity?fmtMoneyExact(f.difference):'—')+'</div>'+
    budMoneySavingsHtml(f)+'<div class="money-breakdown"><div id="bud-money-chart" class="money-chart">'+budMoneyChartHtml(f)+'</div>'+budMoneyGroupsHtml(f)+'</div>'+
    '<details id="money-totals-info" class="money-totals-info"><summary>About these figures</summary><div><p>Spent includes dated purchases, expense refunds and paid bills. Income is money recorded as received. Income − spending is the difference for these dates.</p><p>Savings transfers and savings logged manually are separate records. Budget allowances, account balances and separate reimbursements are excluded from spending. Undated weekly totals stay in Weekly history.</p>'+
    '<div class="money-total-components"><span>Purchases '+fmtMoneyExact(money.spent)+'</span><span>Bills paid '+fmtMoneyExact(money.billPaid)+'</span><span>Savings logged '+fmtMoneyExact(money.savingsRecorded)+'</span></div></div></details></section>'+
    '<div id="bud-money-activity">'+budMoneyActivityHtml(f)+'</div></div>';
}
