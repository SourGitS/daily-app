// Remember the chosen calendar period on this device. Visiting a date or opening a note
// is transient and never changes the saved preference.
function jrnPlannerSavedPeriod(){
 try{return localStorage.getItem('daily_planner_period')==='week'?'week':'calendar';}
 catch{return 'calendar';}
}
const jrnPlannerState={view:'calendar',period:jrnPlannerSavedPeriod(),month:'',date:'',filter:'all',showNext:true,expanded:false,completedOpen:false,returnToCalendar:false};
let jrnPlannerMidnightTimer=0;
const JRN_NEXT_DAYS=7,JRN_NEXT_LIMIT=3;
function jrnPlannerDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')) return false;
 const d=new Date(value+'T12:00:00Z');return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
}
function jrnPlannerAdd(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function jrnPlannerWeekRange(date){
 const weekday=new Date(date+'T12:00:00Z').getUTCDay();
 const start=jrnPlannerAdd(date,-((weekday+6)%7));
 return {start,end:jrnPlannerAdd(start,6)};
}
function jrnPlannerWorkout(today,brief,canContinue){
 if(!brief)return null;
 let action;
 if(brief.state==='ready')action='Open';
 else if(brief.state==='inprogress'||(brief.state==='saved'&&!brief.completed&&canContinue))action='Continue';
 else return null;
 const count=brief.exCount,detail=action==='Open'?'Next in your training rotation':brief.state==='saved'?'Partial workout':'Workout in progress';
 return {kind:'workout',id:'today-workout',date:today,title:brief.dayName,detail:detail+(count>0?' · '+count+' exercise'+(count===1?'':'s'):''),action};
}
function jrnPlannerModel({month,selected,today,notes,bills,workout,tasks,filter='all',query=''}){
 const events=[],matches=s=>!query||String(s).toLowerCase().includes(query.toLowerCase());
 if(filter==='all'||filter==='note')(tasks||[]).forEach(task=>{
  if(!task||!jrnPlannerDate(task.date)||!matches([task.title,task.source?.text].join(' ')))return;
  events.push({kind:'task',id:task.id,date:task.date,title:task.title,detail:task.done?'Completed action':'Planned action',task});
 });
 (notes||[]).forEach(r=>{
  if(!r||r.deletedAt||!matches([r.title,r.body,...(r.tags||[])].join(' '))) return;
  const entry=r.kind==='entry',date=entry?r.dateAbout:r.dateType!=='none'?r.dueDate:'';
  if(!jrnPlannerDate(date)) return;
  const kind=entry?'entry':'note';if(filter!=='all'&&filter!==kind) return;
  events.push({kind,id:r.id,date,title:r.title||String(r.body||'').trim().split('\n')[0]||'Untitled',detail:entry?'Journal entry':r.dateType==='expiry'?'Expiry':'Task / reminder',overdue:!entry&&date<today});
 });
 if(filter==='all'||filter==='bill')(bills||[]).forEach((b,i)=>{
  if(!b||!jrnPlannerDate(b.key)||!matches(b.name)) return;
  if(b.cat&&!jrnPlannerDate(String(b.cat.dueDate||'').slice(0,10)))return;
  const knownAmount=Number.isFinite(b.amount)&&(b.amount>0||(b.kind==='charge'&&b.amount===0));
  const id=b.cat?.id||b.acct?.id||i;
  events.push({kind:'bill',id:(b.kind||'bill')+'-'+id,date:b.key,title:b.name||'Scheduled bill',detail:b.kind==='statement'?'Statement due':'Scheduled bill',amount:knownAmount?b.amount:null});
 });
 if(workout&&filter==='all'&&matches(workout.title+' '+workout.detail))events.push(workout);
 const order={task:-1,workout:0,bill:1,entry:2,note:3};
 events.sort((a,b)=>a.date.localeCompare(b.date)||order[a.kind]-order[b.kind]||a.title.localeCompare(b.title));
 const days={};events.forEach(e=>{(days[e.date]||(days[e.date]=[])).push(e);});
 const through=jrnPlannerAdd(today,JRN_NEXT_DAYS-1);
 const upcoming=events.filter(e=>e.date>=today&&e.date<=through&&e.kind!=='entry'&&!e.task?.done);
 return {month,selected,today,days,selectedEvents:days[selected]||[],overdue:events.filter(e=>e.overdue),upcoming,events};
}
function jrnPlannerActive(){return jrnPlannerState.view==='calendar';}
function jrnPlannerRefreshSchedule(){
 if(typeof S==='object'&&S.view==='notes'&&jrnPlannerActive())jrnRerender();
}
function jrnPlannerControls(){
 const current=jrnPlannerActive()?jrnPlannerState.period:'writing';
 const views=[['week','Week'],['calendar','Month'],['writing','Entries &amp; notes']];
 return '<div class="seg-tabs seg-fill jp-view-switch" role="group" aria-label="Planner view">'+views.map(([id,label])=>'<button type="button" class="'+(current===id?'on':'')+'" aria-pressed="'+(current===id)+'" data-jp="'+id+'">'+label+'</button>').join('')+'</div>';
}
function jrnPlannerLoading(){
 return !!(auth&&auth.currentUser&&!_cloudWorkoutReady&&!_cloudReadFailed&&navigator.onLine!==false);
}
function jrnPlannerCurrentWorkout(today){
 if(jrnPlannerLoading())return null;
 const brief=logTodayBrief(),canContinue=brief.state==='saved'&&logCanContinueSaved(brief.session);
 return jrnPlannerWorkout(today,brief,canContinue);
}
function jrnPlannerRead(){
 const s=jrnPlannerState,today=getLocalDate();
 if(s.showNext||!s.date){s.date=today;s.month=today.slice(0,7);}
 const [y,m]=s.month.split('-').map(Number),week=jrnPlannerWeekRange(s.date);
 const inWeek=s.period==='week',from=inWeek?localMidnight(week.start):new Date(y,m-1,1),monthEnd=new Date(y,m,0);
 const through=localMidnight(jrnPlannerAdd(today,JRN_NEXT_DAYS-1));
 const to=inWeek?localMidnight(week.end):s.showNext&&through>monthEnd?through:monthEnd;
 const notes=jrnLive().map(r=>r.kind==='entry'&&!r.dateAbout?{...r,dateAbout:jrnEntryDay(r)}:r);
 const model=jrnPlannerModel({month:s.month,selected:s.date,today,notes,bills:billOccurrences(from,to),workout:jrnPlannerCurrentWorkout(today),tasks:typeof plannerTasks==='function'?plannerTasks():[],filter:inWeek?'all':s.filter,query:jrnQuery.trim()});
 if(inWeek){model.week=week;model.weekEvents=model.events.filter(e=>e.date>=week.start&&e.date<=week.end);}
 return model;
}
function jrnPlannerEventHTML(event,withIcon=false){
 if(event.kind==='task'){
  return '<button type="button" class="jp-event" data-jp="week-task" data-date="'+event.date+'" data-id="'+escAttr(event.id)+'"><i class="jp-dot task" aria-hidden="true"></i><span><strong>'+escText(event.title)+'</strong><small>'+escText(event.detail)+'</small></span><span class="jp-event-arrow" aria-hidden="true">›</span></button>';
 }
 const bill=event.kind==='bill',workout=event.kind==='workout';
 const marker=withIcon?'<i class="jp-row-icon" aria-hidden="true">'+(workout?stgIcon('dumbbell'):cardIcon(bill?'receipt':'note'))+'</i>':'<i class="jp-dot '+event.kind+'" aria-hidden="true"></i>';
 const tail=bill?'<b>'+(event.amount===null?'Amount not set':escText(fmtMoneyExact(event.amount)))+'</b>':workout?'<b>'+event.action+' ›</b>':'<span class="jp-event-arrow" aria-hidden="true">›</span>';
 return '<button type="button" class="jp-event" data-jp="'+(bill?'bill':workout?'workout':'open')+'" data-date="'+event.date+'" data-id="'+escAttr(event.id)+'">'+marker+'<span><strong>'+escText(event.title)+'</strong><small>'+escText(event.detail)+(event.overdue?' · Overdue':'')+'</small></span>'+tail+'</button>';
}
function jrnPlannerPeriodHeader(period,title,{eyebrow='',filters=''}={}){
 const week=period==='week';
 const heading='<h2'+(week?' id="jp-week-title"':'')+'>'+escText(title)+'</h2>';
 const navigation='<div class="jp-month-nav"><button type="button" class="stg-btn" data-jp="today">Today</button>'+
  '<button type="button" class="jp-arrow" data-jp="prev" aria-label="Previous '+period+'">‹</button><button type="button" class="jp-arrow" data-jp="next" aria-label="Next '+period+'">›</button></div>';
 return '<header class="jp-calendar-hero'+(week?' jp-week-hero':'')+'"><div class="jp-month">'+
  (eyebrow?'<div><p class="jp-week-kicker">'+escText(eyebrow)+'</p>'+heading+'</div>':heading)+navigation+'</div>'+filters+'</header>';
}
function jrnPlannerCalendarHTML(model){
 const [year,month]=model.month.split('-').map(Number),lead=(new Date(year,month-1,1).getDay()+6)%7,days=new Date(year,month,0).getDate();
 let cells=Array.from({length:lead},()=>'<span class="jp-day-blank" aria-hidden="true"></span>').join('');
 for(let d=1;d<=days;d++){
  const date=model.month+'-'+String(d).padStart(2,'0'),events=model.days[date]||[],types=[...new Set(events.map(e=>e.kind))];
  const label=jrnLongDay(date)+(date===model.today?' · Today':'')+(events.length?' · '+events.map(e=>e.detail+': '+e.title).join('; '):' · Nothing scheduled');
  cells+='<button type="button" class="jp-day'+(date===model.selected?' selected':'')+(date===model.today?' today':'')+'" data-jp="day" data-date="'+date+'" aria-pressed="'+(date===model.selected)+'"'+(date===model.today?' aria-current="date"':'')+' aria-label="'+escAttr(label)+'" tabindex="'+(date===model.selected?'0':'-1')+'" onkeydown="jrnPlannerKey(event,this.dataset.date)"><span class="jp-day-num">'+d+'</span><span class="jp-day-dots">'+types.map(t=>'<i class="jp-dot '+t+'" aria-hidden="true"></i>').join('')+'</span>'+(events.length?'<span class="jp-day-peek">'+escText(events[0].title)+(events.length>1?'<small>+'+(events.length-1)+' more</small>':'')+'</span>':'')+'</button>';
 }
 const filters='<div class="jp-filters" role="group" aria-label="Calendar items">'+[['all','All'],['note','Tasks & notes'],['entry','Journal'],['bill','Bills']].map(([id,label])=>'<button type="button" data-jp="filter" data-filter="'+id+'" aria-pressed="'+(jrnPlannerState.filter===id)+'">'+label+'</button>').join('')+'</div>';
 return '<section class="jp-calendar" aria-label="Planning calendar">'+jrnPlannerPeriodHeader('month',jrnMonthLabel(model.month+'-01'),{filters})+
  '<div class="jp-calendar-body"><div class="jp-days" role="group" aria-label="'+escAttr(jrnMonthLabel(model.month+'-01'))+'">'+['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>'<span class="jp-weekday">'+x+'</span>').join('')+cells+'</div><footer class="jp-legend">'+[['note','Tasks & notes'],['entry','Journal'],['bill','Scheduled bills'],['workout','Training']].map(([id,label])=>'<span><i class="jp-dot '+id+'" aria-hidden="true"></i>'+label+'</span>').join('')+'</footer></div></section>';
}
function jrnPlannerAgendaActions(canWrite){
 return '<div class="jp-agenda-actions"><button type="button" class="stg-btn" data-jp="new-note">+ Task / note</button>'+(canWrite?'<button type="button" class="stg-btn" data-jp="write">Write entry</button>':'')+'</div>';
}
function jrnPlannerNextHTML(model){
 const expanded=jrnPlannerState.expanded,items=expanded?model.upcoming:model.upcoming.slice(0,JRN_NEXT_LIMIT);
 const dates=[...new Set(items.map(e=>e.date))],tomorrow=jrnPlannerAdd(model.today,1);
 const groups=dates.map(date=>{
  const prefix=date===model.today?'Today · ':date===tomorrow?'Tomorrow · ':'';
  return '<section class="jp-next-group"><h3>'+prefix+escText(jrnLongDay(date))+'</h3>'+items.filter(e=>e.date===date).map(e=>jrnPlannerEventHTML(e,true)).join('')+'</section>';
 }).join('');
 const loading=jrnPlannerLoading();
 const more=model.upcoming.length>JRN_NEXT_LIMIT?'<button type="button" class="jp-text-btn" data-jp="expand" aria-expanded="'+expanded+'">'+(expanded?'Show fewer':'View all '+model.upcoming.length+' upcoming')+'</button>':'';
 const empty=jrnQuery.trim()||jrnPlannerState.filter!=='all'?'No matching items in the next seven days.':'Nothing scheduled in the next seven days.';
 return '<section class="jp-agenda-card jp-next-up" aria-labelledby="jp-next-title"><header><h2 id="jp-next-title">'+cardIcon('check')+'Next up</h2><p>Today and the next six days</p></header>'+jrnPlannerAgendaActions(true)+groups+
  (loading?'<p class="jp-empty" role="status">Loading your schedule…</p>':!items.length?'<p class="jp-empty">'+empty+'</p>':'')+
  '<div class="jp-next-actions">'+more+'<button type="button" class="jp-text-btn" data-jp="selected-day">Today’s agenda</button></div></section>';
}
function jrnPlannerDayHTML(model){
 const {today,selected,selectedEvents}=model;
 return '<section class="jp-agenda-card jp-day-agenda"><header>'+cardHeader('calendar',selected===today?'Today':'Day agenda')+'<h2 tabindex="-1">'+escText(jrnLongDay(selected))+'</h2></header>'+jrnPlannerAgendaActions(selected<=today)+
  (selectedEvents.length?selectedEvents.map(e=>jrnPlannerEventHTML(e)).join(''):'<p class="jp-empty">Nothing scheduled for this day.</p>')+'</section>';
}
function jrnPlannerRangeLabel(start,end){
 const sameYear=start.slice(0,4)===end.slice(0,4),sameMonth=start.slice(0,7)===end.slice(0,7);
 const format=(date,showMonth)=>localMidnight(date).toLocaleDateString('en-AU',{day:'numeric',...(showMonth?{month:'short'}:{}),...(!sameYear?{year:'numeric'}:{})});
 return format(start,!sameMonth)+'–'+format(end,true);
}
function jrnPlannerWeekGroups(events,renderRow,today){
 const groups=new Map();
 for(const event of events){
  if(!groups.has(event.date))groups.set(event.date,[]);
  groups.get(event.date).push(event);
 }
 return Array.from(groups,([date,rows])=>'<section class="jp-week-day"><h4>'+escText((date===today?'Today · ':'')+jrnLongDay(date))+'</h4>'+rows.map(renderRow).join('')+'</section>').join('');
}
function jrnPlannerTaskHTML(event){
 const task=event.task,id=escAttr(task.id);
 const text=task.source?'<button type="button" class="jp-source-link" data-jp="review-source" data-id="'+id+'" aria-label="'+escAttr(task.title+' — open review priority: '+task.source.text)+'"><strong>'+escText(task.title)+'</strong><small>Review · '+escText(task.source.text)+' <span aria-hidden="true">›</span></small></button>':'<strong>'+escText(task.title)+'</strong>';
 return '<article class="jp-task" data-task="'+id+'"><i class="jp-row-icon" aria-hidden="true">'+cardIcon(task.done?'check':'calendar')+'</i><div class="jp-task-content">'+text+
  '<div class="jp-task-actions"><button type="button" class="stg-btn" data-jp="toggle-task" data-id="'+id+'" data-done="'+task.done+'">'+(task.done?'Undo completion':'Mark done')+'</button>'+
  (task.done?'':'<button type="button" class="jp-text-btn" data-jp="move-task" data-id="'+id+'">Move</button>')+'</div></div></article>';
}
function jrnPlannerWeekHTML(model){
 const {week,today,weekEvents}=model;
 const open=weekEvents.filter(e=>e.kind==='task'&&!e.task.done);
 const done=weekEvents.filter(e=>e.kind==='task'&&e.task.done);
 const context=weekEvents.filter(e=>e.kind!=='task');
 const isThisWeek=today>=week.start&&today<=week.end;
 const label=jrnPlannerRangeLabel(week.start,week.end),search=!!jrnQuery.trim();
 const groups=(events,row)=>jrnPlannerWeekGroups(events,row,today);
 // Archive past context below the dates the person can still act on. Overdue open
 // tasks remain in the main actions list and never disappear into this disclosure.
 const elapsed=isThisWeek?context.filter(e=>e.date<today):[];
 const current=isThisWeek?context.filter(e=>e.date>=today):context;
 const contextRow=e=>jrnPlannerEventHTML(e,true);
 const completed=done.length?'<details class="jp-week-details" data-jp-completed '+(jrnPlannerState.completedOpen?'open':'')+'><summary>Completed <span>'+done.length+'</span></summary>'+groups(done,jrnPlannerTaskHTML)+'</details>':'';
 const reviewLink=!search&&!open.length&&!done.length?'<button type="button" class="jp-text-btn" data-jp="open-review" data-date="'+week.start+'">Open Weekly Review</button>':'';
 return '<section class="jp-calendar jp-week-card" aria-labelledby="jp-week-title">'+jrnPlannerPeriodHeader('week',label,{eyebrow:isThisWeek?'This week':week.start.slice(0,4)})+
  '<div class="jp-week-columns"><section class="jp-week-section"><div class="jp-week-heading"><h3>Planned actions</h3><button type="button" class="stg-btn" data-jp="add-task">+ Add action</button></div>'+
  (open.length?groups(open,jrnPlannerTaskHTML):'<p class="jp-empty">'+(search?'No matching open actions.':done.length?'All actions complete.':'No actions planned for this week.')+'</p>')+reviewLink+completed+'</section>'+
  '<section class="jp-week-section jp-week-context"><div class="jp-week-heading"><h3>On your calendar</h3></div>'+groups(current,contextRow)+
  (elapsed.length?'<details class="jp-week-details"><summary>Earlier this week <span>'+elapsed.length+'</span></summary>'+groups(elapsed,contextRow)+'</details>':'')+
  (jrnPlannerLoading()?'<p class="jp-empty" role="status">Loading your schedule…</p>':!context.length?'<p class="jp-empty">'+(search?'No matching calendar items.':'Nothing else scheduled this week.')+'</p>':'')+'</section></div></section>';
}
function jrnPlannerRememberPeriod(period){
 if(jrnPlannerState.period===period)return;
 jrnPlannerState.period=period;
 try{localStorage.setItem('daily_planner_period',period);}catch{}
}
function jrnPlannerOpenWeek(date,taskId){
 if(!jrnPlannerDate(date))return;
 jrnPlannerRememberPeriod('week');
 Object.assign(jrnPlannerState,{view:'calendar',date,month:date.slice(0,7),showNext:false,returnToCalendar:false});
 jrnQuery='';
 const task=taskId&&plannerTasks().find(record=>record.id===taskId);
 jrnPlannerState.completedOpen=!!task?.done;
 if(jrnEdId)jrnCloseEditor();
 if(S.view!=='notes')setView('notes');else renderJournal();
 if(taskId)jrnPlannerFocusTask(taskId);
}
function jrnPlannerFocusTask(id,action='toggle-task'){
 const container=document.getElementById('notes-content');
 const button=Array.from(container?.querySelectorAll('[data-jp="'+action+'"]')||[]).find(el=>el.dataset.id===id);
 if(button){
  button.focus({preventScroll:true});
  button.closest('.jp-task').scrollIntoView({block:'nearest'});
 }
}
function jrnPlannerFindControl(wrap,control){
 return Array.from(wrap.querySelectorAll('button[data-jp]')).find(button=>
  ['jp','date','filter','id'].every(key=>button.dataset[key]===control.dataset[key]));
}
function jrnPlannerTaskDialog({source=null,date=getLocalDate(),task=null,onSave,onClose}={}){
 const existing=document.getElementById('jp-task-dialog');
 if(existing?.open)return;
 const dialog=document.createElement('dialog'),opener=document.activeElement,scope=localStorage.scope;
 dialog.id='jp-task-dialog';
 const title=task?'Move action':source?'Plan this priority':'Add action';
 const sourceText=source||task?.source;
 const fields=(sourceText?'<p class="bp-intro">Review priority · '+escText(sourceText.text)+'</p>':'')+
  (task?'<strong class="jp-edit-task">'+escText(task.title)+'</strong>':'<label>Action<input name="title" required maxlength="240" autocomplete="off" value="'+escAttr(source?.text||'')+'"></label>')+
  '<label>Planned day<input name="date" type="date" required value="'+escAttr(task?.date||date)+'"></label><p class="jp-form-error" role="alert"></p>';
 const form=dailyFormDialogLayout(dialog,'jp-edit-title',title,fields,task?'Move action':'Save action');
 document.body.append(dialog);
 const error=dialog.querySelector('[role="alert"]');
 let saved=null,seenDate=task?.date;
 form.onsubmit=event=>{
  event.preventDefault();
  if(scope!==localStorage.scope||document.body.inert){error.textContent='Your account has changed. Close this editor and try again.';return;}
  const day=form.elements.date.value,action=form.elements.title?.value.trim();
  if(!jrnPlannerDate(day)||(!task&&!action)){error.textContent='Enter an action and a valid planned day.';return;}
  if(task){
   const current=plannerTasks().find(record=>record.id===task.id);
   if(!current||current.done){error.textContent='This action is no longer open. Close the editor to see its latest state.';return;}
   if(current.date!==seenDate){
    seenDate=current.date;
    error.textContent='The planned day changed to '+jrnLongDay(current.date)+'. Check the date and choose Move action again.';
    return;
   }
   saved=plannerMoveTask(task.id,day);
  }else saved=plannerCreateTask({title:action,date:day,source});
  if(!saved){error.textContent='Couldn’t save this action. Your changes are still here.';return;}
  dialog.close();
 };
 dialog.addEventListener('close',()=>{
  dialog.remove();
  let returnTo=opener?.isConnected?opener:null;
  if(!returnTo&&opener?.dataset.jp&&S.view==='notes'){
   // Sync may replace the row while the editor is open. Return to its current
   // control or the active tab if the action has since moved to a different week.
   returnTo=jrnPlannerFindControl(document.getElementById('notes-content'),opener)||document.querySelector('.jp-view-switch .on');
  }
  returnTo?.focus({preventScroll:true});
  if(saved)onSave?.(saved);
  else onClose?.();
 },{once:true});
 dialog.showModal();
 const field=task?form.elements.date:form.elements.title;
 field.focus();if(!task&&source)field.select();
}
function jrnPlannerWatchDay(){
 clearTimeout(jrnPlannerMidnightTimer);
 const now=new Date(),next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
 jrnPlannerMidnightTimer=setTimeout(jrnPlannerRefreshSchedule,next-now+100);
}
function jrnPlannerMonthHTML(model){
 const overdue=model.overdue.filter(e=>e.date!==model.selected);
 const next=jrnPlannerState.showNext&&jrnPlannerState.filter!=='entry';
 const agenda='<aside class="jp-agenda">'+(next?jrnPlannerNextHTML(model):jrnPlannerDayHTML(model))+
  (overdue.length?'<section class="jp-agenda-card"><h3>Overdue notes <small>'+overdue.length+'</small></h3>'+overdue.slice(0,5).map(e=>jrnPlannerEventHTML({...e,detail:e.detail+' · '+jrnLongDay(e.date)})).join('')+(overdue.length>5?'<button type="button" class="stg-btn" data-jp="notes">View all notes</button>':'')+'</section>':'')+
  '<section class="jp-agenda-card jp-help"><p>Tasks and expiry notes stay saved after their date. Bills show the Finance schedule.</p><button type="button" class="stg-btn" data-jp="notes">Browse all notes</button></section></aside>';
 return '<div class="jp-layout">'+jrnPlannerCalendarHTML(model)+agenda+'</div>';
}
function jrnRenderPlanner(wrap){
 const focused=document.activeElement,control=wrap.contains(focused)&&focused.closest('button[data-jp]');
 const search=focused?.id==='jrn-search'?[focused.selectionStart,focused.selectionEnd]:null;
 jrnDetachEditor();const ed=document.getElementById('jrn-editor');if(ed)ed.classList.remove('inline','open');
 const model=jrnPlannerRead(),content=model.week?jrnPlannerWeekHTML(model):jrnPlannerMonthHTML(model);
 wrap.innerHTML='<div id="journal-root" class="jrn-planner">'+jrnHeadHtml(model)+content+'</div>';
 jrnPlannerWatchDay();
 if(search){
  const input=wrap.querySelector('#jrn-search');if(input){input.focus({preventScroll:true});input.setSelectionRange(...search);}
 }else if(control){
  const match=jrnPlannerFindControl(wrap,control);
  const fallback=control.dataset.jp==='selected-day'?'.jp-day-agenda h2':'.jp-day.selected';
  (match||wrap.querySelector(fallback))?.focus({preventScroll:true});
 }
}
function jrnPlannerShow(view){
 if(view!=='writing')jrnPlannerRememberPeriod(view);
 jrnPlannerState.view=view==='writing'?'writing':'calendar';jrnPlannerState.returnToCalendar=false;
 if(jrnPlannerActive()&&jrnEdId){jrnCloseEditor();return;}
 renderJournal();
}
function jrnPlannerShift(n){
 if(jrnPlannerState.period==='week'){
  jrnPlannerState.completedOpen=false;
  jrnPlannerPick(jrnPlannerAdd(jrnPlannerState.date,7*n));return;
 }
 const [y,m]=jrnPlannerState.month.split('-').map(Number),date=new Date(y,m-1+n,1),day=Math.min(Number(jrnPlannerState.date.slice(-2)),new Date(date.getFullYear(),date.getMonth()+1,0).getDate());
 jrnPlannerPick(date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(day).padStart(2,'0'));
}
function jrnPlannerPick(date,focus,showNext=false){
 if(!jrnPlannerDate(date))return;
 Object.assign(jrnPlannerState,{date,month:date.slice(0,7),showNext,expanded:false});renderJournal();
 if(focus)document.querySelector('.jp-day.selected')?.focus({preventScroll:true});
}
function jrnPlannerKey(event,date){
 const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];if(delta==null)return;
 event.preventDefault();jrnPlannerPick(jrnPlannerAdd(date,delta),true);
}
function jrnPlannerOpen(id,kind){
 jrnPlannerState.returnToCalendar=true;jrnOpenEditor(id,kind);
 if(!id&&jrnEdPending){
  if(kind==='note'){jrnEdPending={...jrnEdPending,dateType:'reminder',dueDate:jrnPlannerState.date};}
  else jrnEdPending={...jrnEdPending,dateAbout:jrnPlannerState.date};
  jrnEdRenderFoot();
 }
}
function jrnPlannerEditorOpen(){jrnPlannerState.view='writing';}
function jrnPlannerEditorClosed(){if(jrnPlannerState.returnToCalendar){jrnPlannerState.view='calendar';jrnPlannerState.returnToCalendar=false;}}
function jrnPlannerOpenWorkout(button){
 const today=getLocalDate(),brief=logTodayBrief(),canContinue=brief.state==='saved'&&logCanContinueSaved(brief.session);
 const workout=jrnPlannerWorkout(today,brief,canContinue);
 if(jrnPlannerLoading()||button.dataset.date!==today||!workout||workout.title!==button.querySelector('strong').textContent){
  jrnPlannerRefreshSchedule();return;
 }
 logGoto('today');
 if(brief.state==='ready')logOpenPlannedDay(brief.dayIdx);
 else if(brief.state==='saved')logContinueSavedWorkout();
 else logOpenSession();
}
if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{
 if(!document.hidden)jrnPlannerRefreshSchedule();
});
if(typeof window!=='undefined')window.addEventListener('planner-tasks-changed',jrnPlannerRefreshSchedule);
if(typeof document!=='undefined')document.addEventListener('toggle',e=>{
 if(e.target.matches?.('[data-jp-completed]')&&e.target.isConnected)jrnPlannerState.completedOpen=e.target.open;
},true);
if(typeof document!=='undefined')document.addEventListener('click',e=>{
 const el=e.target.closest&&e.target.closest('[data-jp]');if(!el)return;const act=el.dataset.jp;
 if(act==='calendar'||act==='week'||act==='writing'){
  jrnPlannerShow(act);
  document.querySelector('.jp-view-switch .on')?.focus({preventScroll:true});
 }
 else if(act==='prev'||act==='next')jrnPlannerShift(act==='prev'?-1:1);
 else if(act==='today')jrnPlannerPick(getLocalDate(),false,true);
 else if(act==='selected-day')jrnPlannerPick(getLocalDate());
 else if(act==='expand'){jrnPlannerState.expanded=!jrnPlannerState.expanded;renderJournal();}
 else if(act==='day')jrnPlannerPick(el.dataset.date);
 else if(act==='week-task')jrnPlannerOpenWeek(el.dataset.date,el.dataset.id);
 else if(act==='open-review'){
  const prior=jrnPlannerAdd(el.dataset.date,-7);
  wkrOpenPriorityWeek(wkrVisibleWeeks().includes(prior)?prior:wkrCurrentWeek());
 }
 else if(act==='add-task')jrnPlannerTaskDialog({date:jrnPlannerState.date,onSave:task=>jrnPlannerOpenWeek(task.date,task.id)});
 else if(act==='move-task'){
  const task=plannerTasks().find(record=>record.id===el.dataset.id);
  if(task&&!task.done)jrnPlannerTaskDialog({task,onSave:updated=>jrnPlannerOpenWeek(updated.date,updated.id)});
 }
 else if(act==='toggle-task'){
  const done=el.dataset.done!=='true';
  const task=plannerSetTaskDone(el.dataset.id,done);
  if(!task){showToast('Couldn’t update this action. Try again.');return;}
  jrnPlannerState.completedOpen=done;
  renderJournal();jrnPlannerFocusTask(task.id);
  showToast(done?'Action marked done':'Action reopened');
 }
 else if(act==='review-source'){
  const task=plannerTasks().find(record=>record.id===el.dataset.id);
  if(task?.source)wkrOpenPriorityWeek(task.source.week,task.id);
 }
 else if(act==='filter'){jrnPlannerState.filter=el.dataset.filter;jrnPlannerState.expanded=false;renderJournal();}
 else if(act==='open')jrnPlannerOpen(el.dataset.id);
 else if(act==='new-note')jrnPlannerOpen(null,'note');
 else if(act==='write'){const r=jrnEntries().find(r=>jrnEntryDay(r)===jrnPlannerState.date);jrnPlannerOpen(r?.id||null,'entry');}
 else if(act==='notes'){jrnTab='notes';jrnPlannerShow('writing');}
 else if(act==='bill')openBillsCalendar(el.dataset.date);
 else if(act==='workout')jrnPlannerOpenWorkout(el);
});
if(typeof module!=='undefined')module.exports={jrnPlannerDate,jrnPlannerAdd,jrnPlannerWeekRange,jrnPlannerModel,jrnPlannerWorkout};
