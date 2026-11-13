// Calendar state is a view preference in memory; notes and Finance remain the source records.
const jrnPlannerState={view:'calendar',month:'',date:'',filter:'all',returnToCalendar:false};
function jrnPlannerDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')) return false;
 const d=new Date(value+'T12:00:00Z');return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
}
function jrnPlannerAdd(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function jrnPlannerModel({month,selected,today,notes,bills,filter='all',query=''}){
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
  events.push({kind:'bill',id:'bill-'+i,date:b.key,title:b.name||'Scheduled bill',detail:b.kind==='statement'?'Statement due':'Scheduled bill',amount:Number.isFinite(b.amount)&&b.amount>0?b.amount:null});
 });
 events.sort((a,b)=>a.date.localeCompare(b.date)||a.kind.localeCompare(b.kind)||a.title.localeCompare(b.title));
 const days={};events.forEach(e=>{(days[e.date]||(days[e.date]=[])).push(e);});
 return {month,selected,today,days,selectedEvents:days[selected]||[],overdue:events.filter(e=>e.overdue),events};
}
function jrnPlannerActive(){return jrnPlannerState.view==='calendar';}
function jrnPlannerRefreshSchedule(){
 if(typeof S==='object'&&S.view==='notes'&&jrnPlannerActive())jrnRerender();
}
function jrnPlannerControls(){
 return '<div class="jp-view-switch" role="group" aria-label="Journal view"><button type="button" class="'+(jrnPlannerActive()?'on':'')+'" aria-pressed="'+jrnPlannerActive()+'" data-jp="calendar">Calendar</button><button type="button" class="'+(!jrnPlannerActive()?'on':'')+'" aria-pressed="'+!jrnPlannerActive()+'" data-jp="writing">Entries & notes</button></div>';
}
function jrnPlannerRead(){
 const s=jrnPlannerState,today=getLocalDate();if(!s.date)s.date=today;if(!s.month)s.month=s.date.slice(0,7);
 const [y,m]=s.month.split('-').map(Number),from=new Date(y,m-1,1),to=new Date(y,m,0);
 const notes=jrnLive().map(r=>r.kind==='entry'&&!r.dateAbout?{...r,dateAbout:jrnEntryDay(r)}:r);
 return jrnPlannerModel({month:s.month,selected:s.date,today,notes,bills:billOccurrences(from,to),filter:s.filter,query:jrnQuery.trim()});
}
function jrnPlannerEventHTML(event){
 const bill=event.kind==='bill';
 return '<button type="button" class="jp-event" data-jp="'+(bill?'bill':'open')+'"'+(bill?'':' data-id="'+escAttr(event.id)+'"')+'><i class="jp-dot '+event.kind+'" aria-hidden="true"></i><span><strong>'+escText(event.title)+'</strong><small>'+escText(event.detail)+(event.overdue?' · Overdue':'')+'</small></span>'+(bill?'<b>'+(event.amount===null?'Amount not set':escText(fmtMoneyExact(event.amount)))+'</b>':'<span class="jp-event-arrow" aria-hidden="true">›</span>')+'</button>';
}
function jrnPlannerCalendarHTML(model){
 const [year,month]=model.month.split('-').map(Number),lead=(new Date(year,month-1,1).getDay()+6)%7,days=new Date(year,month,0).getDate();
 let cells=Array.from({length:lead},()=>'<span class="jp-day-blank" aria-hidden="true"></span>').join('');
 for(let d=1;d<=days;d++){
  const date=model.month+'-'+String(d).padStart(2,'0'),events=model.days[date]||[],types=[...new Set(events.map(e=>e.kind))];
  const label=jrnLongDay(date)+(date===model.today?' · Today':'')+(events.length?' · '+events.map(e=>e.detail+': '+e.title).join('; '):' · Nothing scheduled');
  cells+='<button type="button" class="jp-day'+(date===model.selected?' selected':'')+(date===model.today?' today':'')+'" data-jp="day" data-date="'+date+'" aria-pressed="'+(date===model.selected)+'"'+(date===model.today?' aria-current="date"':'')+' aria-label="'+escAttr(label)+'" tabindex="'+(date===model.selected?'0':'-1')+'" onkeydown="jrnPlannerKey(event,this.dataset.date)"><span class="jp-day-num">'+d+'</span><span class="jp-day-dots">'+types.map(t=>'<i class="jp-dot '+t+'" aria-hidden="true"></i>').join('')+'</span>'+(events.length?'<span class="jp-day-peek">'+escText(events[0].title)+(events.length>1?'<small>+'+(events.length-1)+' more</small>':'')+'</span>':'')+'</button>';
 }
 return '<section class="jp-calendar" aria-label="Planning calendar"><header class="jp-month"><h2>'+escText(jrnMonthLabel(model.month+'-01'))+'</h2><button type="button" class="stg-btn" data-jp="today">Today</button><button type="button" class="jp-arrow" data-jp="prev" aria-label="Previous month">‹</button><button type="button" class="jp-arrow" data-jp="next" aria-label="Next month">›</button></header>'+
  '<div class="jp-filters" role="group" aria-label="Calendar items">'+[['all','All'],['note','Tasks & notes'],['entry','Journal'],['bill','Bills']].map(([id,label])=>'<button type="button" data-jp="filter" data-filter="'+id+'" aria-pressed="'+(jrnPlannerState.filter===id)+'" class="'+(jrnPlannerState.filter===id?'on':'')+'">'+label+'</button>').join('')+'</div>'+
  '<div class="jp-days" role="group" aria-label="'+escAttr(jrnMonthLabel(model.month+'-01'))+'">'+['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>'<span class="jp-weekday">'+x+'</span>').join('')+cells+'</div><footer class="jp-legend">'+[['note','Tasks & notes'],['entry','Journal'],['bill','Scheduled bills']].map(([id,label])=>'<span><i class="jp-dot '+id+'" aria-hidden="true"></i>'+label+'</span>').join('')+'</footer></section>';
}
function jrnRenderPlanner(wrap){
 jrnDetachEditor();const ed=document.getElementById('jrn-editor');if(ed)ed.classList.remove('inline','open');
 const model=jrnPlannerRead(),today=model.today,selected=model.selected,overdue=model.overdue.filter(e=>e.date!==selected);
 const agenda='<aside class="jp-agenda"><section class="jp-agenda-card"><header>'+cardHeader('calendar',selected===today?'Today':escText(jrnLongDay(selected)))+'<h2>'+escText(jrnLongDay(selected))+'</h2></header><div class="jp-agenda-actions"><button type="button" class="stg-btn" data-jp="new-note">+ Task / note</button>'+(selected<=today?'<button type="button" class="stg-btn" data-jp="write">Write entry</button>':'')+'</div>'+
  (model.selectedEvents.length?model.selectedEvents.map(jrnPlannerEventHTML).join(''):'<p class="jp-empty">Nothing scheduled for this day.</p>')+'</section>'+
  (overdue.length?'<section class="jp-agenda-card"><h3>Overdue notes <small>'+overdue.length+'</small></h3>'+overdue.slice(0,5).map(e=>jrnPlannerEventHTML({...e,detail:e.detail+' · '+jrnLongDay(e.date)})).join('')+(overdue.length>5?'<button type="button" class="stg-btn" data-jp="notes">View all notes</button>':'')+'</section>':'')+
  '<section class="jp-agenda-card jp-help"><p>Tasks and expiry notes stay saved after their date. Bills show the Finance schedule.</p><button type="button" class="stg-btn" data-jp="notes">Browse all notes</button></section></aside>';
 wrap.innerHTML='<div id="journal-root" class="jrn-planner"><header class="jrn-page-head">'+jrnHeadHtml()+'<p>Your days, notes and plans.</p>'+jrnPlannerControls()+'</header><div class="jp-layout">'+jrnPlannerCalendarHTML(model)+agenda+'</div></div>';
}
function jrnPlannerShow(view){
 jrnPlannerState.view=view;jrnPlannerState.returnToCalendar=false;
 if(view==='calendar'&&jrnEdId){jrnCloseEditor();return;}
 renderJournal();
}
function jrnPlannerShift(n){
 const [y,m]=jrnPlannerState.month.split('-').map(Number),date=new Date(y,m-1+n,1),day=Math.min(Number(jrnPlannerState.date.slice(-2)),new Date(date.getFullYear(),date.getMonth()+1,0).getDate());
 jrnPlannerState.month=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');jrnPlannerState.date=jrnPlannerState.month+'-'+String(day).padStart(2,'0');renderJournal();
}
function jrnPlannerPick(date,focus){
 if(!jrnPlannerDate(date))return;jrnPlannerState.date=date;jrnPlannerState.month=date.slice(0,7);renderJournal();
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
if(typeof document!=='undefined')document.addEventListener('click',e=>{
 const el=e.target.closest&&e.target.closest('[data-jp]');if(!el)return;const act=el.dataset.jp;
 if(act==='calendar'||act==='writing')jrnPlannerShow(act);
 else if(act==='prev'||act==='next')jrnPlannerShift(act==='prev'?-1:1);
 else if(act==='today')jrnPlannerPick(getLocalDate());
 else if(act==='day')jrnPlannerPick(el.dataset.date);
 else if(act==='filter'){jrnPlannerState.filter=el.dataset.filter;renderJournal();}
 else if(act==='open')jrnPlannerOpen(el.dataset.id);
 else if(act==='new-note')jrnPlannerOpen(null,'note');
 else if(act==='write'){const r=jrnEntries().find(r=>jrnEntryDay(r)===jrnPlannerState.date);jrnPlannerOpen(r?.id||null,'entry');}
 else if(act==='notes'){jrnTab='notes';jrnPlannerShow('writing');}
 else if(act==='bill')openBillsCalendar();
});
if(typeof module!=='undefined')module.exports={jrnPlannerDate,jrnPlannerAdd,jrnPlannerModel};
