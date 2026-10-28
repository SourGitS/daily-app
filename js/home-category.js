// Default Category Home. Explicit legacy choices, saved layouts and record writers stay intact.
let categoryEditing=false,categoryDrafts={},categoryBases={},categoryEditMode='mobile',categorySelected='training',categoryTopic='strength',categoryHabitRows=null;
const categoryKey=mode=>'daily_category_home_'+mode;
const categoryPath=mode=>'categoryHome'+(mode==='desktop'?'Desktop':'Mobile');
function categoryLoad(mode){return categoryProfile(localStorage.getItem(categoryKey(mode)),mode);}
function categoryAttachSync(uid){
 categoryEditing=false;categoryDrafts={};categoryBases={};categoryHabitRows=null;
 ['mobile','desktop'].forEach(mode=>syncTrack(syncBlobListen(uid,categoryPath(mode),categoryKey(mode),()=>{
  if(S.view==='home')renderHome();
  if(_activeSettingsKey==='homelayout')renderHomeLayoutSection();
 })));
}
function categorySave(mode,value){
 if(_bootPhase||_syncApplying)return false;
 const key=categoryKey(mode),old=localStorage.getItem(key),oldT=localStorage.getItem(key+'_ts');
 try{localStorage.setItem(key,JSON.stringify(categoryProfile(value,mode)));localStorage.setItem(key+'_ts',String(Math.max(Date.now(),Number(oldT||0)+1)));}
 catch(e){try{old===null?localStorage.removeItem(key):localStorage.setItem(key,old);oldT===null?localStorage.removeItem(key+'_ts'):localStorage.setItem(key+'_ts',oldT);}catch(_){}showToast('Could not save the layout. Your draft is still open.');return false;}
 syncBlobPush(categoryPath(mode),key);return true;
}
function categoryEscape(v){return escText(String(v??''));}
function categoryDate(v){return v?fmtDate(v):'';}
function categoryHeading(id,meta=''){const c=CATEGORY_HOME_CARDS.find(c=>c.id===id);return '<header class="cat-heading"><h2>'+cardIcon(c.icon)+c.label+'</h2>'+(meta?'<small>'+categoryEscape(meta)+'</small>':'')+'</header>';}
function categoryLink(id,label){return '<a class="cat-route" href="#'+id+'" data-cat-nav="'+id+'" aria-label="'+escAttr(label||'Open '+CATEGORY_HOME_CARDS.find(c=>c.id===id)?.label)+'"><span aria-hidden="true">↗</span></a>';}
function categoryAction(action,label,primary=false){const expense=action==='expense';return '<button type="button" class="cat-action'+(primary?' cat-primary':'')+(expense?' stg-btn':'')+'" data-cat-action="'+action+'"'+(expense?' aria-label="Add expense"':'')+'>'+label+'</button>';}
function categoryTraining(profile){
 const combined=layoutMode()==='desktop'&&!profile.hidden.includes('budget');
 const b=logTodayBrief(),saved=b.state==='saved',eyebrow=saved?(b.completed?'Completed today':'Saved today'):b.state==='inprogress'?'In progress':b.state==='empty'?'Your next session':'Next workout';
 const meta=saved?[b.duration?fmtDuration(b.duration):'',b.exCount+' exercises',b.setCount+' working sets'].filter(Boolean).join(' · '):b.exCount+' exercises'+(b.state==='inprogress'?' · '+b.doneCount+' checked':'');
 const next=saved?b.nextName:(b.exercises||[]).slice(0,3).map(e=>e.name).join(' · ');
 const body='<section class="cat-training-focus">'+categoryHeading('training')+'<p class="cat-eyebrow">'+eyebrow+'</p><h3 class="cat-title">'+categoryEscape(b.dayName)+'</h3><p class="cat-copy">'+(b.state==='empty'?'Choose a plan to get started.':categoryEscape(meta))+'</p>'+(next?'<p class="cat-training-next"><strong>'+(saved?'Next in your plan':'First up')+'</strong>'+categoryEscape(next)+'</p>':'')+categoryLink('training')+'</section>';
 return '<div class="cat-blue cat-training-body'+(combined?' cat-combined':'')+'">'+body+(combined?categoryBudget(true):'')+'</div>'+homeTrainingStrip();
}
function categoryBudget(embedded){
 const m=budPeriodMoney(),has=m&&m.available!==null,goal=m?Number(m.record.goal)||0:0;
 const phone=!embedded&&layoutMode()==='mobile',period=m?budPeriodLabel(m.range):'';
 const content=categoryHeading('budget',period)+'<p class="cat-eyebrow">Available to spend</p>'+
 (has?'<div class="cat-money"><strong class="cat-figure">'+fmtMoneyExact(m.available)+'</strong><span>'+(m.available<0?'Over budget':'✓ On track')+'</span></div>':'<h3 class="cat-feature">'+(m?'Check your budget':'Set your budget')+'</h3><p class="cat-copy">'+(m?'Confirm your income and budget dates.':'Choose your budget period in Finance.')+'</p>')+
 (has?'<div class="cat-track" role="img" aria-label="'+escAttr(fmtMoneyExact(m.spent)+' recorded spending'+(goal?' of '+fmtMoneyExact(goal)+' spending target':''))+'"><i style="width:'+Math.max(0,Math.min(100,goal?m.spent/goal*100:(m.spent/(m.spent+Math.max(0,m.available)||1))*100))+'%"></i></div><p class="cat-budget-caption"><span>'+fmtMoneyExact(m.spent)+' spent</span><span>'+(goal?fmtMoneyExact(goal)+' target':'No spending target')+'</span></p>':'');
 const action=categoryAction(m?'expense':'budget-setup',m?'<span class="cat-expense-label">Add expense</span><svg class="cat-expense-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>':'Set up budget',true);
 const remaining=goal>0&&m&&!m.incomplete&&Number.isFinite(m.spent)?goal-m.spent:null;
 const summary=m?'<span class="cat-expense-summary"><span>'+(goal>0?fmtMoneyExact(goal)+(m.range.days===7?' weekly goal':' period goal'):'No spending goal')+'</span><strong>'+(remaining===null?(goal>0?'Spending needs review':'Set a goal in Finance'):fmtMoneyExact(Math.abs(remaining))+(remaining<0?' over goal':' left to spend'))+'</strong></span>':'';
 return '<section class="cat-budget'+(embedded?'':' cat-blue')+'">'+content+(phone?'':action)+categoryLink('budget')+'</section>'+(phone?'<footer class="cat-footer cat-budget-expense">'+action+summary+'</footer>':'');
}
function categoryFood(){
 const s=nutDaySummary(getLocalDate()),target=nutTarget(),meals=categoryMealModel(s,NUT_MEALS),known=s.calories!==null&&(s.status!=='partial'||meals.some(m=>m.calories!==null));
 const recipes=[...(kitRecipes||[])],favs=recipes.filter(r=>r.favourite),pick=(favs.length?favs:recipes).sort((a,b)=>(a.lastCooked||0)-(b.lastCooked||0))[0];
 const ring=target>0&&known&&s.status!=='partial'?'<svg class="cat-ring" viewBox="0 0 110 110" role="img" aria-label="'+escAttr(s.calories+' of '+target+' kcal logged')+'"><circle cx="55" cy="55" r="47"/><circle cx="55" cy="55" r="47" style="stroke-dasharray:'+Math.min(1,s.calories/target)*295.31+' 295.31"/></svg>':'';
 return '<div class="cat-blue cat-food-body">'+categoryHeading('food')+'<div class="cat-food-total"><p class="cat-eyebrow">'+(s.status==='partial'?'Known subtotal':'Logged today')+'</p><p class="cat-figure">'+(known?Math.round(s.calories).toLocaleString():'—')+' <small>kcal</small></p><p class="cat-copy">'+(s.status==='partial'?s.unknown+(s.unknown===1?' entry needs calories':' entries need calories'):s.status==='legacy'?'Saved daily total · meal detail unavailable':!known?'No food logged yet':target?'Daily target · '+Math.round(target).toLocaleString()+' kcal':'No daily target set')+'</p></div>'+
 '<section class="cat-meals" aria-label="Calories by meal"><p>By meal · kcal</p><dl>'+meals.map(m=>'<div><dt>'+categoryEscape(m.label)+'</dt><dd aria-label="'+escAttr(m.count?(m.unknown?'Known calories; '+m.unknown+' unknown entries':m.calories+' kilocalories'):'Not logged')+'">'+(m.calories===null?(m.unknown?'?':'—'):Math.round(m.calories).toLocaleString())+(m.unknown&&m.calories!==null?' + ?':'')+'</dd></div>').join('')+'</dl></section>'+ring+categoryAction('food','Log food <span aria-hidden="true">+</span>',true)+'</div><footer class="cat-footer">Recipe idea<strong>'+categoryEscape(pick?.name||'Add a recipe to your collection')+'</strong></footer>'+categoryLink('food');
}
function categoryActivityModel(){
 const dates=homeTrainingDays([],getLocalDate()).map(d=>d.date),weekly={};
 dates.forEach(date=>{const key=txnWeekOf(date);if(weekly[key])return;const w=budgetData[key],all=txnsForWeek(key),sum=all.reduce((n,t)=>n+(Number(t.amount)||0),0),period=budPeriodMoney();
  const current=key===txnWeekOf(getLocalDate()),hasSavedTarget=w&&w.var_goal!==undefined&&w.var_goal!==null&&w.var_goal!=='';
  let goal=current||hasSavedTarget?getWeekVarGoal(w):null;if(period&&period.range.start===key&&period.range.days===7)goal=Number(period.record.goal)||goal;
  // Aggregate-only legacy spending cannot be assigned to individual days.
  weekly[key]={goal,incomplete:Math.abs(weekVarTotal(w,key)-sum)>.01||!!(period?.incomplete&&period.range.start===key)};
 });
 return categoryPaceModel({dates,today:getLocalDate(),weekly,transactions:txnData,habitLog:habitsLog,habitCount:habitsData.length});
}
function categoryActivity(){
 const data=categoryActivityModel(),labels={on:'Within weekly pace',over:'Above weekly pace','no-target':'No weekly spending target','no-entries':'No spending entries',unknown:'Spending needs a date check',future:'Future day'};
 const row=(name,content)=>'<div class="cat-week-row"><span class="cat-week-label">'+name+'</span>'+content+'</div>';
 return categoryHeading('activity',categoryDate(data[0].date)+' – '+categoryDate(data[6].date))+'<div class="cat-week" role="group" aria-label="Habits and weekly spending pace">'+
 row('',data.map(d=>'<span><b>'+localMidnight(d.date).toLocaleDateString('en-AU',{weekday:'short'})+'</b><small>'+localMidnight(d.date).getDate()+'</small></span>').join(''))+
 row('Spending',data.map(d=>'<span><i class="cat-day-mark '+d.state+'" title="'+escAttr(categoryDate(d.date)+': '+labels[d.state]+(d.allowance!==null?' · '+fmtMoneyExact(d.spent)+' recorded / '+fmtMoneyExact(d.allowance)+' pace':''))+'" aria-label="'+escAttr(labels[d.state])+'">'+(d.state==='on'?'✓':d.state==='over'?'!':'—')+'</i></span>').join(''))+
 row('Habits',data.map(d=>'<span aria-label="'+escAttr(d.habits===null?'No habit log':d.habits+' of '+d.habitCount+' habits')+'"><i class="cat-habit-meter"><i style="width:'+(d.habits!==null&&d.habitCount?d.habits/d.habitCount*100:0)+'%"></i></i><small>'+(d.habits===null?'—':d.habits+'/'+d.habitCount)+'</small></span>').join(''))+'</div><p class="cat-caption">Weekly spending pace · ✓ within · ! above · — unscored. Today is so far.</p>'+categoryLink('activity','Open spending in Budget');
}
function categoryHabits(all=false){
 const done=new Set((habitsLog[getLocalDate()]||[]).filter(i=>i>=0&&i<habitsData.length));
 const limit=layoutMode()==='mobile'?6:2;
 if(!categoryHabitRows||categoryHabitRows.date!==getLocalDate()||categoryHabitRows.total!==habitsData.length||categoryHabitRows.limit!==limit)categoryHabitRows={date:getLocalDate(),total:habitsData.length,limit,ids:habitsData.map((_,i)=>i).filter(i=>!done.has(i)).concat([...done]).slice(0,limit)};
 const ids=all||habitsData.length<=limit?habitsData.map((_,i)=>i):categoryHabitRows.ids;
 const heading=categoryHeading('habits')+'<p class="cat-feature">'+done.size+' <small>/ '+habitsData.length+' done today</small></p>';
 const rows='<div class="cat-habit-list">'+ids.map(i=>'<label class="cat-habit"><input type="checkbox" data-cat-habit="'+i+'"'+(done.has(i)?' checked':'')+'><span>'+categoryEscape(habitsData[i])+'</span></label>').join('')+(!habitsData.length?'<p class="cat-copy">Add a habit to start your routine.</p>':'')+'</div>';
 return (all?'<header class="cat-habit-head">'+heading+'<button class="cat-close" type="button" aria-label="Close habits" onclick="this.closest(\'dialog\').close()">×</button></header>':heading)+rows+(all?'<footer class="cat-habit-actions"><button type="button" class="stg-btn" data-cat-action="habits-edit">Manage habits</button><button type="button" class="stg-btn primary" onclick="this.closest(\'dialog\').close()">Done</button></footer>':categoryAction(habitsData.length>limit?'habits':'habits-edit',habitsData.length>limit?'View all '+habitsData.length:'Manage habits'));
}
function categoryShopping(){const p=kitShopComputePlan(),items=p.pantryNeeds.concat(Object.values(p.normal).filter(x=>!kitShopRowChecked(x,p.pantryId)));return categoryHeading('shopping')+'<p class="cat-feature">'+kitShopCountLeft(p)+' <small>items to pick up</small></p><p class="cat-copy">'+categoryEscape(items.slice(0,3).map(x=>x.name).join(', ')||'Your shopping list is clear.')+'</p>'+categoryLink('shopping');}
function categoryWeight(){const readings=[...(S.weights||[])].filter(w=>w&&typeof w.date==='string'&&Number.isFinite(Number(w.weight))&&Number(w.weight)>0).sort((a,b)=>a.date.localeCompare(b.date)),last=readings.at(-1);return categoryHeading('weight',last?categoryDate(last.date):'')+'<p class="cat-figure">'+(last?categoryEscape(last.weight):'—')+' <small>kg</small></p><p class="cat-copy">'+(last?'Latest recorded weight':'No weight logged yet')+'</p><div class="cat-weight-history">'+readings.slice(-3).map(w=>'<span>'+categoryDate(w.date)+'<strong>'+categoryEscape(w.weight)+'</strong></span>').join('')+'</div>'+categoryAction('weight','Log weight <span aria-hidden="true">+</span>')+categoryLink('weight');}
function categoryRecord(){const r=computePRHistory().at(-1);return categoryHeading('records')+(r?'<p class="cat-copy">'+categoryEscape(r.name)+' · '+categoryDate(r.date)+'</p><p class="cat-figure">'+categoryEscape(r.val)+' <small>'+categoryEscape(r.metric.unit+(r.metric.kind==='load'&&r.reps?' × '+r.reps+' reps':''))+'</small></p><p class="cat-caption">'+(r.prev===null?'First recorded result':'Previous · '+categoryEscape(r.prev+' '+r.metric.unit))+'</p>':'<p class="cat-copy">Your first recorded sets establish a baseline.</p>')+categoryLink('records');}
function categoryStatsData(){
 if(categoryTopic==='weight'){const rows=[...(S.weights||[])].filter(w=>w&&typeof w.date==='string'&&Number.isFinite(Number(w.weight))&&Number(w.weight)>0).sort((a,b)=>a.date.localeCompare(b.date)).slice(-4);return {title:'Weight over time',unit:'kg',rows:rows.map(r=>({date:r.date,value:Number(r.weight)})),caption:'Recorded weigh-ins · no goal judgement'};}
 if(categoryTopic==='consistency'){const rows=[-4,-3,-2,-1].map(offset=>{const d=getMondayOf(offset),date=weekKey(d);return {date,value:homeTrainingDays(S.sessions,budDateAdd(date,6)).filter(x=>x.count).length};});return {title:'Training days',unit:'days',rows,caption:'Distinct days with saved workouts · completed weeks'};}
 const r=computePRHistory().at(-1);if(!r)return {title:'Your progress starts here',unit:'',rows:[],caption:'Record a session to begin your history.'};
 const days=new Map();(S.sessions||[]).forEach(s=>(s.exercises||[]).filter(e=>e.name===r.name).forEach(e=>(e.sets||[]).forEach(set=>{if(r.metric.kind==='load'&&Number(set.reps)!==r.reps)return;const v=setMetricValue(set,r.metric);if(v!==null)days.set(s.date,Math.max(days.get(s.date)??-Infinity,v));})));
 return {title:r.name,unit:r.metric.unit+(r.metric.kind==='load'&&r.reps?' × '+r.reps+' reps':''),rows:[...days].sort((a,b)=>a[0].localeCompare(b[0])).slice(-4).map(([date,value])=>({date,value})),caption:r.metric.kind==='load'?'Recorded sets at matching repetitions':'Recorded results using the same metric'};
}
function categoryStats(){
 const m=categoryStatsData(),last=m.rows.at(-1),min=Math.min(...m.rows.map(r=>r.value)),max=Math.max(...m.rows.map(r=>r.value)),range=max-min||1;
 const pts=m.rows.map((r,i)=>({x:24+i*(272/Math.max(1,m.rows.length-1)),y:max===min?58:86-(r.value-min)/range*56,...r}));
 const chart=pts.length>1?'<svg viewBox="0 0 320 120" role="img" aria-label="'+escAttr(m.rows.map(r=>categoryDate(r.date)+': '+r.value+' '+m.unit).join('; '))+'"><polyline points="'+pts.map(p=>p.x+','+p.y).join(' ')+'"/>'+pts.map(p=>'<circle cx="'+p.x+'" cy="'+p.y+'" r="3"/><text x="'+p.x+'" y="'+(p.y-10)+'">'+p.value+'</text><text x="'+p.x+'" y="115">'+localMidnight(p.date).toLocaleDateString('en-AU',{day:'numeric',month:'short'})+'</text>').join('')+'</svg>':'';
 return '<div class="cat-blue cat-stats-body">'+categoryHeading('stats')+'<div class="cat-tabs seg-tabs" role="tablist" aria-label="Stats topic">'+[['strength','Strength'],['weight','Weight'],['consistency','Consistency']].map(([id,label])=>'<button type="button" role="tab" data-cat-topic="'+id+'" aria-selected="'+(id===categoryTopic)+'">'+label+'</button>').join('')+'</div><div class="cat-stat-summary"><div><h3>'+categoryEscape(m.title)+'</h3>'+(last?'<p class="cat-stat-date">'+(categoryTopic==='consistency'?'Week of ':'Latest · ')+categoryDate(last.date)+'</p>':'')+'</div><p class="cat-figure">'+(last?last.value:'—')+'<small>'+categoryEscape(m.unit)+'</small></p></div>'+(chart?'<div class="cat-chart">'+chart+'</div>':'')+'</div><footer class="cat-footer"><strong>'+categoryEscape(categoryStatsComparison(m.rows,categoryTopic,m.unit))+'</strong><span>'+categoryEscape(m.caption)+'</span></footer>'+categoryLink('stats');
}
function categoryJournal(){const entries=jrnEntries().slice().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)),e=entries[0],text=e?(e.body||e.title||'Untitled'):'A thought, a small win, or something to remember.';return categoryHeading('journal',e?categoryDate(e.dateAbout):'')+'<blockquote>'+categoryEscape(text)+'</blockquote>'+categoryAction('journal-write','<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6ZM14 5l5 5M4 16l4 4"/></svg>Write a note')+categoryLink('journal');}
function categoryReview(){
 const week=wkrPendingWeek()||weekKey(getMondayOf(-1)),rec=wkrReview(week),plan=wkrEffectivePlan(rec,week),money=wkrDisplayActuals(week,rec,plan),frozen=rec?.status==='completed'&&rec.actualSnapshot;
 const days=frozen?(Number.isFinite(frozen.trainingDays)?frozen.trainingDays:'—'):wkrTrainingDays(week),logs=Array.from({length:7},(_,i)=>nutDaySummary(budDateAdd(week,i))).filter(s=>s.status!=='missing').length;
 const focus=rec?.reflection?.priorities?.filter(x=>typeof x==='string'?x.trim():x?.text).map(x=>typeof x==='string'?x:x.text)[0];
 return categoryHeading('review',homeWeekRangeLabel(week))+'<div class="cat-review-facts"><div><strong>'+days+' days</strong><span>Training</span></div><div><strong>'+(money.hasData?fmtMoney(money.spendTotal):'—')+'</strong><span>Recorded spending</span></div><div><strong>'+logs+' of 7</strong><span>Food log days · current records</span></div></div><p class="cat-copy">'+categoryEscape(focus||(frozen?'Saved review · training and spending use its recorded snapshot.':'What would you like to carry into next week?'))+'</p>'+categoryAction('review',rec?.status==='completed'?'Read review':'Choose a focus <span aria-hidden="true">+</span>')+categoryLink('review');
}
function categoryWeather(){return '<div class="home-widget home-widget-weather">'+buildWeatherCard(true,true).replace('<div class="weather-fx"','<div class="cat-weather-scene"><div class="weather-fx"').replace('<div class="weather-forecast-dock">','</div><div class="weather-forecast-dock">')+'</div>';}
function categoryCard(id,profile){
 const builders={training:()=>categoryTraining(profile),budget:()=>categoryBudget(false),weather:categoryWeather,activity:categoryActivity,food:categoryFood,stats:categoryStats,habits:categoryHabits,shopping:categoryShopping,weight:categoryWeight,records:categoryRecord,journal:categoryJournal,review:categoryReview};
 return '<article class="cat-card cat-'+id+(id==='training'?' home-widget-session':'')+'" data-cat-id="'+id+'">'+builders[id]()+'</article>';
}
// Home shares the normal app header with Finance and Stats.
function categoryRenderHome(wrap){
 const mode=layoutMode(),profile=categoryLoad(mode);wrap.classList.toggle('category-home',profile.enabled);document.getElementById('view-home').classList.toggle('category-home-active',profile.enabled);
 if(!profile.enabled)return false;
 const visible=categoryVisible(profile,mode),cells=categoryCells(visible,mode);
 wrap.innerHTML='<header class="cat-page-heading"><div><p>'+localMidnight(getLocalDate()).toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'})+'</p><h1>Today</h1></div><button type="button" class="stg-btn" data-cat-action="layout" aria-label="Home layout settings">'+cardIcon('grid')+'<span>Customise</span></button></header><div class="cat-grid">'+visible.map(id=>categoryCard(id,profile)).join('')+'</div>'+(visible.length?'':'<p class="cat-empty">Your cards are hidden. Use Customise to add them back.</p>');
 wrap.querySelectorAll('[data-cat-id]').forEach(el=>{const c=cells[el.dataset.catId];el.style.setProperty('--cat-span',c.span);el.style.setProperty('--cat-row',c.row);});
 applyDayColour();homeObserveWeatherHeight();
 if(visible.includes('weather')){loadWeatherWidget();categoryWeatherLabel();}else weatherEnsureFresh();
 return true;
}
function categoryWeatherLabel(){const label=document.getElementById('home-weather-forecast-toggle-label');if(label&&document.getElementById('home-content')?.classList.contains('category-home'))label.textContent='Forecast';}
function categoryDesktopWeather(){return layoutMode()==='desktop'&&!!document.getElementById('home-content')?.classList.contains('category-home');}
function categoryWeatherHeading(entry){
 if(!categoryDesktopWeather())return;
 const card=document.querySelector('.cat-weather'),city=document.getElementById('home-weather-city');
 if(!card||!city)return;
 card.classList.toggle('cat-weather-city-condition',!!entry);
 if(entry){const condition=weatherLook(entry)[1];city.innerHTML=categoryEscape(entry.city||'Weather')+', <span class="cat-weather-condition">'+categoryEscape(condition.charAt(0).toLowerCase()+condition.slice(1))+'</span>'+(entry.placeholder?'<span class="cat-weather-sample"> · sample</span>':'');city.setAttribute('aria-label','Weather details and location: '+(entry.city||'Weather')+', '+condition+(entry.placeholder?' · sample':''));}
}
function categoryNavigate(id){
 if(id==='training'){const b=logTodayBrief();logOpenPlannedDay(b.dayIdx);return;}
 if(['budget','activity'].includes(id)){homeOpenBudgetWeek();return;}
 if(id==='food'){openFoodToday();return;}if(id==='shopping'){openFoodShopping();return;}if(id==='journal'){setView('notes');return;}
 if(id==='review'){wkrOpenWeek(wkrPendingWeek()||weekKey(getMondayOf(-1)));return;}
 setView('stats');if(id==='stats'){setStatsTab(categoryTopic==='weight'?'body':'training');return;}if(id==='weight')setStatsTab('body');else if(id==='records')setStatsTab('training');
}
function categoryHabitDialog(){let d=document.getElementById('category-habit-dialog');if(!d){d=document.createElement('dialog');d.id='category-habit-dialog';d.className='cat-dialog';d.setAttribute('aria-labelledby','cat-habit-title');document.body.append(d);}const focus=d.contains(document.activeElement)?document.activeElement.dataset.catHabit:null,top=d.querySelector('.cat-habit-list')?.scrollTop||0;d.innerHTML=categoryHabits(true);d.querySelector('h2').id='cat-habit-title';if(!d.open)d.showModal();d.querySelector('.cat-habit-list').scrollTop=top;if(focus!=null)d.querySelector('[data-cat-habit="'+focus+'"]')?.focus({preventScroll:true});}
document.addEventListener('change',e=>{const input=e.target.closest('[data-cat-habit]');if(!input)return;toggleHabit(Number(input.dataset.catHabit));if(S.view==='home')renderHome();if(document.getElementById('category-habit-dialog')?.open)categoryHabitDialog();});
document.addEventListener('click',e=>{
 const nav=e.target.closest('[data-cat-nav]');if(nav){e.preventDefault();categoryNavigate(nav.dataset.catNav);return;}
 const topic=e.target.closest('[data-cat-topic]');if(topic){categoryTopic=topic.dataset.catTopic;const el=document.querySelector('.cat-card.cat-stats');if(el){el.innerHTML=categoryStats();el.querySelector('[data-cat-topic="'+categoryTopic+'"]').focus();}return;}
 const a=e.target.closest('[data-cat-action]');if(!a)return;
 const id=a.dataset.catAction;if(id==='layout'){openHomeLayoutEditor();return;}if(id==='expense'){openTxnModal({date:getLocalDate()});return;}if(id==='budget-setup'){budPeriodSetup();return;}
 if(id==='food'){nutOpen();return;}if(id==='weight'){openLogWeight();return;}if(id==='habits'){categoryHabitDialog();return;}
 if(id==='habits-edit'){document.getElementById('category-habit-dialog')?.close();openHabitsEditModal();return;}
 if(id==='journal-write'){setView('notes');jrnOpenEditor(null,'entry');return;}if(id==='review')categoryNavigate('review');
});

function categoryEditorOpen(){
 if(['mobile','desktop'].some(m=>hlDirty(m))){showToast('Apply or cancel your existing layout changes first.');return;}
 categoryEditing=true;categoryEditMode=homeLayoutEditorMode();categoryDraft(categoryEditMode).enabled=true;renderHomeLayoutSection();
}
function categoryDraft(mode){if(!categoryDrafts[mode]){categoryDrafts[mode]=categoryLoad(mode);categoryBases[mode]=localStorage.getItem(categoryKey(mode));}return categoryDrafts[mode];}
function categoryLayoutOffer(wrap){if(wrap.querySelector('.cat-layout-offer,.cat-layout-editor'))return;const offer=document.createElement('div');offer.className='stg-card cat-layout-offer';offer.innerHTML='<h3>Category Home</h3><p class="stg-help">A category-led layout with separate phone and desktop arrangements. Your existing layouts stay available.</p><button class="stg-btn primary" type="button" onclick="categoryEditorOpen()">Try Category Home</button>';wrap.prepend(offer);}
function categoryMini(id,p,mode){
 const label=CATEGORY_HOME_CARDS.find(c=>c.id===id).label,combined=mode==='desktop'&&id==='training'&&!p.hidden.includes('budget');let text='',foot='',blue=['training','budget','food','stats'].includes(id);
 if(id==='training'){text=logTodayBrief().dayName;foot=combined?'Budget · '+(budPeriodMoney()?.available!==null&&budPeriodMoney()?fmtMoneyExact(budPeriodMoney().available):'Set up'):'Last 7 days';}
 if(id==='budget')text=budPeriodMoney()?.available!==null&&budPeriodMoney()?fmtMoneyExact(budPeriodMoney().available):'Set up your budget';
 if(id==='budget'&&mode==='mobile')foot=budPeriodMoney()?'Add expense':'Set up budget';
 if(id==='food'){const s=nutDaySummary(getLocalDate());text=s.calories===null?'Nothing logged':s.calories+' kcal';foot='Calories by meal';}
 if(id==='stats'){text=categoryStatsData().title;foot='Your recorded progress';}
 if(id==='activity'){text='M  T  W  T  F  S  S';foot='Spending pace · Habits';}
 if(id==='habits')text=habitsData.length+' daily habits';
 if(id==='weight')text=S.weights.length?S.weights.at(-1).weight+' kg':'Log your weight';
 if(id==='shopping')text=kitShopCountLeft(kitShopComputePlan())+' items to pick up';
 if(id==='records')text=computePRHistory().at(-1)?.name||'Your first milestone';
 if(id==='journal')text=jrnEntries()[0]?.title||'A thought for today';
 if(id==='review')text='Training · Spending · Food logs';
 if(id==='weather'){text='Weather';foot='Forecast';}
 return '<span class="cat-mini-content'+(blue?' is-hero':'')+(id==='weather'?' is-weather':'')+'"><strong>'+label+'</strong><span>'+categoryEscape(text)+'</span></span>'+(foot?'<span class="cat-mini-foot">'+categoryEscape(foot)+'</span>':'');
}
function categoryLayoutSection(wrap){
 const actual=homeLayoutEditorMode();if(!categoryEditing&&!categoryLoad(actual).enabled)return false;
 if(!categoryEditing){categoryEditing=true;categoryEditMode=actual;}
 const mode=categoryEditMode,p=categoryDraft(mode),ids=categoryVisible(p,mode),cells=categoryCells(ids,mode),stale=categoryBases[mode]!==localStorage.getItem(categoryKey(mode));
 if(!ids.includes(categorySelected))categorySelected=ids[0]||'';
 const selected=CATEGORY_HOME_CARDS.find(c=>c.id===categorySelected);
 wrap.innerHTML='<section class="stg-card cat-layout-editor"><header><h2>Home layout</h2><p class="stg-help">Drag cards using the grip. Tap a card for its controls.<span class="cat-keyboard-hint"> Alt + ↑ or ↓ also moves a focused card.</span></p></header><div class="seg-tabs seg-fill" role="tablist" aria-label="Layout device">'+['mobile','desktop'].map(m=>'<button type="button" role="tab" data-cat-profile="'+m+'" aria-selected="'+(m===mode)+'" class="'+(m===mode?'on':'')+'">'+(m==='mobile'?'Phone':'Desktop')+'</button>').join('')+'</div><label class="cat-layout-choice"><input type="checkbox" id="cat-enabled"'+(p.enabled?' checked':'')+'> Use Category Home on '+(mode==='mobile'?'phone':'desktop')+'</label><p class="stg-help">Uncheck to return to your existing '+(mode==='mobile'?'phone':'Grid/Dashboard')+' layout. Its saved arrangement stays intact.</p><div class="cat-layout-workspace"><div class="cat-layout-map '+mode+'" aria-label="Draft Home arrangement">'+ids.map(id=>'<button type="button" class="cat-mini'+(id===categorySelected?' selected':'')+'" data-cat-mini="'+id+'" style="--mini-span:'+cells[id].span+'" aria-label="Select '+CATEGORY_HOME_CARDS.find(c=>c.id===id).label+'" aria-pressed="'+(id===categorySelected)+'">'+categoryMini(id,p,mode)+'<span class="cat-grip" aria-hidden="true">⠿</span></button>').join('')+'</div>'+(ids.length?'':'<p class="stg-help">All cards are hidden. Add one below or Reset.</p>')+'</div><div class="cat-layout-selection">'+(selected?'<strong>'+selected.label+'</strong><button type="button" class="stg-btn quiet" data-cat-hide="'+selected.id+'">Hide</button>':'')+(selected?.id==='training'&&mode==='desktop'?'<label><input type="checkbox" id="cat-budget-visible"'+(!p.hidden.includes('budget')?' checked':'')+'> Include Budget</label>':'')+'</div>'+(p.hidden.length?'<div class="cat-hidden"><p>Hidden cards</p>'+p.hidden.map(id=>'<button type="button" class="stg-btn quiet" data-cat-show="'+id+'">Show '+CATEGORY_HOME_CARDS.find(c=>c.id===id).label+'</button>').join('')+'</div>':'')+(stale?'<p class="cat-layout-error" role="alert">This layout changed on another device. Cancel to load that version before editing again.</p>':'')+'<footer class="cat-layout-actions"><button class="stg-btn quiet" type="button" data-cat-editor="reset">Reset</button><button class="stg-btn quiet" type="button" data-cat-editor="cancel">Cancel</button><button class="stg-btn primary" type="button" data-cat-editor="apply"'+(stale?' disabled':'')+'>Apply layout</button></footer><p class="stg-help" role="status" id="cat-layout-status">Changes stay in this draft until you Apply.</p></section>';
 // Hidden cards belong in the scrollable arrangement, keeping Apply in reach.
 const hiddenCards=wrap.querySelector('.cat-hidden');if(hiddenCards)wrap.querySelector('.cat-layout-workspace').append(hiddenCards);
 categoryBindDrag(wrap);return true;
}
function categoryMove(id,target,after=false){const p=categoryDraft(categoryEditMode),order=p.order.filter(x=>x!==id),at=order.indexOf(target);if(at<0)return;order.splice(at+(after?1:0),0,id);p.order=order;categorySelected=id;renderHomeLayoutSection();document.querySelector('[data-cat-mini="'+id+'"]')?.focus();}
let categoryDragCancel=null,categorySuppressClick=0;
function categoryBindDrag(wrap){
 const map=wrap.querySelector('.cat-layout-map'),scroll=wrap.querySelector('.cat-layout-workspace');let drag=null,raf=0;
 const cleanup=()=>{if(!drag)return;drag.ghost?.remove();map.querySelectorAll('.cat-drop-before,.cat-drop-after,.is-dragging').forEach(e=>e.classList.remove('cat-drop-before','cat-drop-after','is-dragging'));try{map.releasePointerCapture(drag.pid);}catch(e){}cancelAnimationFrame(raf);drag=null;};categoryDragCancel=cleanup;
 const locate=()=>{if(!drag?.active)return;map.querySelectorAll('.cat-drop-before,.cat-drop-after').forEach(e=>e.classList.remove('cat-drop-before','cat-drop-after'));const bounds=scroll.getBoundingClientRect();if(drag.x<bounds.left||drag.x>bounds.right||drag.y<bounds.top||drag.y>bounds.bottom){drag.target=null;return;}const tile=document.elementFromPoint(drag.x,drag.y)?.closest('[data-cat-mini]');if(!tile||tile===drag.tile){drag.target=null;return;}const r=tile.getBoundingClientRect();drag.target=tile.dataset.catMini;drag.after=drag.y>r.top+r.height*.55||(drag.y>r.top+r.height*.25&&drag.x>r.left+r.width*.65);tile.classList.add(drag.after?'cat-drop-after':'cat-drop-before');};
 const tick=()=>{if(!drag?.active)return;const r=scroll.getBoundingClientRect();if(drag.y<r.top+40)scroll.scrollTop-=8;else if(drag.y>r.bottom-40)scroll.scrollTop+=8;locate();raf=requestAnimationFrame(tick);};
 map.addEventListener('pointerdown',e=>{if(e.button||e.isPrimary===false)return;const tile=e.target.closest('[data-cat-mini]');if(!tile||(e.pointerType==='touch'&&!e.target.closest('.cat-grip')))return;drag={tile,id:tile.dataset.catMini,pid:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,active:false,target:null};map.setPointerCapture(e.pointerId);});
 map.addEventListener('pointermove',e=>{if(!drag||drag.pid!==e.pointerId)return;drag.x=e.clientX;drag.y=e.clientY;if(!drag.active&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)<6)return;e.preventDefault();if(!drag.active){drag.active=true;const r=drag.tile.getBoundingClientRect();drag.offsetX=drag.startX-r.left;drag.offsetY=drag.startY-r.top;drag.ghost=drag.tile.cloneNode(true);drag.ghost.removeAttribute('data-cat-mini');drag.ghost.setAttribute('aria-hidden','true');drag.ghost.className+=' cat-drag-ghost';Object.assign(drag.ghost.style,{width:r.width+'px',height:r.height+'px'});document.body.append(drag.ghost);drag.tile.classList.add('is-dragging');raf=requestAnimationFrame(tick);}drag.ghost.style.left=drag.x-drag.offsetX+'px';drag.ghost.style.top=drag.y-drag.offsetY+'px';locate();});
 map.addEventListener('pointerup',e=>{if(!drag||drag.pid!==e.pointerId)return;const d=drag;categorySuppressClick=Date.now()+500;cleanup();if(d.active&&d.target)categoryMove(d.id,d.target,d.after);else if(!d.active){categorySelected=d.id;renderHomeLayoutSection();}});
 map.addEventListener('pointercancel',cleanup);map.addEventListener('lostpointercapture',cleanup);
}
window.addEventListener('blur',()=>categoryDragCancel?.());
document.addEventListener('keydown',e=>{if(e.key==='Escape')categoryDragCancel?.();const tile=e.target.closest?.('[data-cat-mini]');if(!tile||!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const ids=categoryVisible(categoryDraft(categoryEditMode),categoryEditMode),i=ids.indexOf(tile.dataset.catMini),next=i+(e.key==='ArrowUp'?-1:1);if(next>=0&&next<ids.length)categoryMove(ids[i],ids[next],next>i);});
document.addEventListener('change',e=>{if(e.target.id==='cat-enabled')categoryDraft(categoryEditMode).enabled=e.target.checked;if(e.target.id==='cat-budget-visible'){const p=categoryDraft(categoryEditMode);p.hidden=p.hidden.filter(id=>id!=='budget');if(!e.target.checked)p.hidden.push('budget');renderHomeLayoutSection();}});
document.addEventListener('click',e=>{
 const tile=e.target.closest('[data-cat-mini]');if(tile){if(Date.now()<categorySuppressClick){e.preventDefault();return;}categorySelected=tile.dataset.catMini;renderHomeLayoutSection();return;}
 const profile=e.target.closest('[data-cat-profile]');if(profile){categoryDragCancel?.();categoryEditMode=profile.dataset.catProfile;renderHomeLayoutSection();return;}
 const hide=e.target.closest('[data-cat-hide]'),show=e.target.closest('[data-cat-show]');if(hide||show){const p=categoryDraft(categoryEditMode);if(hide)p.hidden.push(hide.dataset.catHide);else p.hidden=p.hidden.filter(id=>id!==show.dataset.catShow);renderHomeLayoutSection();return;}
 const action=e.target.closest('[data-cat-editor]');if(!action)return;const mode=categoryEditMode;
 if(action.dataset.catEditor==='reset'){categoryDrafts[mode]={...categoryProfile(null,mode),enabled:true};renderHomeLayoutSection();return;}
 if(action.dataset.catEditor==='cancel'){delete categoryDrafts[mode];delete categoryBases[mode];categoryEditing=false;renderHomeLayoutSection();return;}
 if(action.dataset.catEditor==='apply'){
  if(categoryBases[mode]!==localStorage.getItem(categoryKey(mode))){renderHomeLayoutSection();return;}
  if(categorySave(mode,categoryDraft(mode))){delete categoryDrafts[mode];delete categoryBases[mode];categoryEditing=false;renderHome();renderHomeLayoutSection();showToast('Home layout saved');}
 }
});
