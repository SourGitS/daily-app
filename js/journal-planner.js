// Calendar state is a view preference in memory; notes and Finance remain the source records.
const jrnPlannerState={view:'calendar',month:'',date:'',filter:'all',showNext:true,expanded:false,returnToCalendar:false};
let jrnPlannerMidnightTimer=0;
const JRN_NEXT_DAYS=7,JRN_NEXT_LIMIT=3;
function jrnPlannerDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')) return false;
 const d=new Date(value+'T12:00:00Z');return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
}
function jrnPlannerAdd(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function jrnPlannerWorkout(today,brief,canContinue){
 if(!brief)return null;
 let action;
 if(brief.state==='ready')action='Open';
 else if(brief.state==='inprogress'||(brief.state==='saved'&&!brief.completed&&canContinue))action='Continue';
 else return null;
 const count=brief.exCount,detail=action==='Open'?'Next in your training rotation':brief.state==='saved'?'Partial workout':'Workout in progress';
 return {kind:'workout',id:'today-workout',date:today,title:brief.dayName,detail:detail+(count>0?' · '+count+' exercise'+(count===1?'':'s'):''),action};
}
function jrnPlannerModel({month,selected,today,notes,bills,workout,filter='all',query=''}){
 const events=[],matches=s=>!query||String(s).toLowerCase().includes(query.toLowerCase());
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
 const order={workout:0,bill:1,entry:2,note:3};
 events.sort((a,b)=>a.date.localeCompare(b.date)||order[a.kind]-order[b.kind]||a.title.localeCompare(b.title));
 const days={};events.forEach(e=>{(days[e.date]||(days[e.date]=[])).push(e);});
 const through=jrnPlannerAdd(today,JRN_NEXT_DAYS-1);
 const upcoming=events.filter(e=>e.date>=today&&e.date<=through&&e.kind!=='entry');
 return {month,selected,today,days,selectedEvents:days[selected]||[],overdue:events.filter(e=>e.overdue),upcoming,events};
}
function jrnPlannerActive(){return jrnPlannerState.view==='calendar';}
function jrnPlannerRefreshSchedule(){
 if(typeof S==='object'&&S.view==='notes'&&jrnPlannerActive())jrnRerender();
}
function jrnPlannerControls(){
 return '<div class="seg-tabs seg-fill jp-view-switch" role="group" aria-label="Planner view"><button type="button" class="'+(jrnPlannerActive()?'on':'')+'" aria-pressed="'+jrnPlannerActive()+'" data-jp="calendar">Calendar</button><button type="button" class="'+(!jrnPlannerActive()?'on':'')+'" aria-pressed="'+!jrnPlannerActive()+'" data-jp="writing">Entries & notes</button></div>';
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
 const [y,m]=s.month.split('-').map(Number),from=new Date(y,m-1,1),monthEnd=new Date(y,m,0);
 const through=localMidnight(jrnPlannerAdd(today,JRN_NEXT_DAYS-1));
 const to=s.showNext&&through>monthEnd?through:monthEnd;
 const notes=jrnLive().map(r=>r.kind==='entry'&&!r.dateAbout?{...r,dateAbout:jrnEntryDay(r)}:r);
 return jrnPlannerModel({month:s.month,selected:s.date,today,notes,bills:billOccurrences(from,to),workout:jrnPlannerCurrentWorkout(today),filter:s.filter,query:jrnQuery.trim()});
}
function jrnPlannerEventHTML(event,withIcon=false){
 const bill=event.kind==='bill',workout=event.kind==='workout';
 const marker=withIcon?'<i class="jp-row-icon" aria-hidden="true">'+(workout?stgIcon('dumbbell'):cardIcon(bill?'receipt':'note'))+'</i>':'<i class="jp-dot '+event.kind+'" aria-hidden="true"></i>';
 const tail=bill?'<b>'+(event.amount===null?'Amount not set':escText(fmtMoneyExact(event.amount)))+'</b>':workout?'<b>'+event.action+' ›</b>':'<span class="jp-event-arrow" aria-hidden="true">›</span>';
 return '<button type="button" class="jp-event" data-jp="'+(bill?'bill':workout?'workout':'open')+'" data-date="'+event.date+'" data-id="'+escAttr(event.id)+'">'+marker+'<span><strong>'+escText(event.title)+'</strong><small>'+escText(event.detail)+(event.overdue?' · Overdue':'')+'</small></span>'+tail+'</button>';
}
function jrnPlannerCalendarHTML(model){
 const [year,month]=model.month.split('-').map(Number),lead=(new Date(year,month-1,1).getDay()+6)%7,days=new Date(year,month,0).getDate();
 let cells=Array.from({length:lead},()=>'<span class="jp-day-blank" aria-hidden="true"></span>').join('');
 for(let d=1;d<=days;d++){
  const date=model.month+'-'+String(d).padStart(2,'0'),events=model.days[date]||[],types=[...new Set(events.map(e=>e.kind))];
  const label=jrnLongDay(date)+(date===model.today?' · Today':'')+(events.length?' · '+events.map(e=>e.detail+': '+e.title).join('; '):' · Nothing scheduled');
  cells+='<button type="button" class="jp-day'+(date===model.selected?' selected':'')+(date===model.today?' today':'')+'" data-jp="day" data-date="'+date+'" aria-pressed="'+(date===model.selected)+'"'+(date===model.today?' aria-current="date"':'')+' aria-label="'+escAttr(label)+'" tabindex="'+(date===model.selected?'0':'-1')+'" onkeydown="jrnPlannerKey(event,this.dataset.date)"><span class="jp-day-num">'+d+'</span><span class="jp-day-dots">'+types.map(t=>'<i class="jp-dot '+t+'" aria-hidden="true"></i>').join('')+'</span>'+(events.length?'<span class="jp-day-peek">'+escText(events[0].title)+(events.length>1?'<small>+'+(events.length-1)+' more</small>':'')+'</span>':'')+'</button>';
 }
 return '<section class="jp-calendar" aria-label="Planning calendar"><header class="jp-month"><h2>'+escText(jrnMonthLabel(model.month+'-01'))+'</h2><div class="jp-month-nav"><button type="button" class="stg-btn" data-jp="today">Today</button><button type="button" class="jp-arrow" data-jp="prev" aria-label="Previous month">‹</button><button type="button" class="jp-arrow" data-jp="next" aria-label="Next month">›</button></div></header>'+
  '<div class="jp-calendar-body"><div class="jp-filters" role="group" aria-label="Calendar items">'+[['all','All'],['note','Tasks & notes'],['entry','Journal'],['bill','Bills']].map(([id,label])=>'<button type="button" data-jp="filter" data-filter="'+id+'" aria-pressed="'+(jrnPlannerState.filter===id)+'" class="'+(jrnPlannerState.filter===id?'on':'')+'">'+label+'</button>').join('')+'</div>'+
  '<div class="jp-days" role="group" aria-label="'+escAttr(jrnMonthLabel(model.month+'-01'))+'">'+['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>'<span class="jp-weekday">'+x+'</span>').join('')+cells+'</div><footer class="jp-legend">'+[['note','Tasks & notes'],['entry','Journal'],['bill','Scheduled bills'],['workout','Training']].map(([id,label])=>'<span><i class="jp-dot '+id+'" aria-hidden="true"></i>'+label+'</span>').join('')+'</footer></div></section>';
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
function jrnPlannerWatchDay(){
 clearTimeout(jrnPlannerMidnightTimer);
 const now=new Date(),next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
 jrnPlannerMidnightTimer=setTimeout(jrnPlannerRefreshSchedule,next-now+100);
}
function jrnRenderPlanner(wrap){
 const focused=document.activeElement,control=wrap.contains(focused)&&focused.closest('button[data-jp]');
 const search=focused?.id==='jrn-search'?[focused.selectionStart,focused.selectionEnd]:null;
 jrnDetachEditor();const ed=document.getElementById('jrn-editor');if(ed)ed.classList.remove('inline','open');
 const model=jrnPlannerRead(),overdue=model.overdue.filter(e=>e.date!==model.selected);
 const next=jrnPlannerState.showNext&&jrnPlannerState.filter!=='entry';
 const agenda='<aside class="jp-agenda">'+(next?jrnPlannerNextHTML(model):jrnPlannerDayHTML(model))+
  (overdue.length?'<section class="jp-agenda-card"><h3>Overdue notes <small>'+overdue.length+'</small></h3>'+overdue.slice(0,5).map(e=>jrnPlannerEventHTML({...e,detail:e.detail+' · '+jrnLongDay(e.date)})).join('')+(overdue.length>5?'<button type="button" class="stg-btn" data-jp="notes">View all notes</button>':'')+'</section>':'')+
  '<section class="jp-agenda-card jp-help"><p>Tasks and expiry notes stay saved after their date. Bills show the Finance schedule.</p><button type="button" class="stg-btn" data-jp="notes">Browse all notes</button></section></aside>';
 wrap.innerHTML='<div id="journal-root" class="jrn-planner">'+jrnHeadHtml(model)+'<div class="jp-layout">'+jrnPlannerCalendarHTML(model)+agenda+'</div></div>';
 jrnPlannerWatchDay();
 if(search){
  const input=wrap.querySelector('#jrn-search');if(input){input.focus({preventScroll:true});input.setSelectionRange(...search);}
 }else if(control){
  const actions=wrap.querySelectorAll('button[data-jp]');
  const match=Array.from(actions).find(b=>['jp','date','filter','id'].every(k=>b.dataset[k]===control.dataset[k]));
  const fallback=control.dataset.jp==='selected-day'?'.jp-day-agenda h2':'.jp-day.selected';
  (match||wrap.querySelector(fallback))?.focus({preventScroll:true});
 }
}
function jrnPlannerShow(view){
 jrnPlannerState.view=view;jrnPlannerState.returnToCalendar=false;
 if(view==='calendar'&&jrnEdId){jrnCloseEditor();return;}
 renderJournal();
}
function jrnPlannerShift(n){
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
if(typeof document!=='undefined')document.addEventListener('click',e=>{
 const el=e.target.closest&&e.target.closest('[data-jp]');if(!el)return;const act=el.dataset.jp;
 if(act==='calendar'||act==='writing'){
  jrnPlannerShow(act);
  document.querySelector('.jp-view-switch .on')?.focus({preventScroll:true});
 }
 else if(act==='prev'||act==='next')jrnPlannerShift(act==='prev'?-1:1);
 else if(act==='today')jrnPlannerPick(getLocalDate(),false,true);
 else if(act==='selected-day')jrnPlannerPick(getLocalDate());
 else if(act==='expand'){jrnPlannerState.expanded=!jrnPlannerState.expanded;renderJournal();}
 else if(act==='day')jrnPlannerPick(el.dataset.date);
 else if(act==='filter'){jrnPlannerState.filter=el.dataset.filter;jrnPlannerState.expanded=false;renderJournal();}
 else if(act==='open')jrnPlannerOpen(el.dataset.id);
 else if(act==='new-note')jrnPlannerOpen(null,'note');
 else if(act==='write'){const r=jrnEntries().find(r=>jrnEntryDay(r)===jrnPlannerState.date);jrnPlannerOpen(r?.id||null,'entry');}
 else if(act==='notes'){jrnTab='notes';jrnPlannerShow('writing');}
 else if(act==='bill')openBillsCalendar(el.dataset.date);
 else if(act==='workout')jrnPlannerOpenWorkout(el);
});
if(typeof module!=='undefined')module.exports={jrnPlannerDate,jrnPlannerAdd,jrnPlannerModel,jrnPlannerWorkout};
