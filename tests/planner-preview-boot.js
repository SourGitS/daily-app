// Only served in the local sample app. All actions go through the real app UI or writers.
window.Chart = class {constructor(){this.data={};this.options={};} destroy(){} update(){} resize(){}};
addEventListener('load', () => {
  const timer=setInterval(() => {
    if(typeof _cloudWorkoutReady==='undefined'||!_cloudWorkoutReady)return;
    clearInterval(timer);
    obDismiss();dailyUpdateDismiss();
    const today=getLocalDate(), weekday=new Date(today+'T12:00:00Z').getUTCDay();
    const monday=jrnPlannerAdd(today,-((weekday+6)%7)), prior=jrnPlannerAdd(monday,-7);
    const source={week:prior,text:'Get the bike serviced',occurrence:0};
    if(!sessionStorage.getItem('planner-preview-seeded')){
      const task=plannerCreateTask({title:'Call the bike shop',date:jrnPlannerAdd(monday,1),source});
      if(task)sessionStorage.setItem('planner-preview-seeded','1');
    }
    const screen=new URLSearchParams(location.search).get('screen');
    // Opening a gallery example selects that screen once. A browser reload exercises
    // the app's normal route and saved Month/Week preference.
    if(performance.getEntriesByType('navigation')[0]?.type==='reload'){
      document.documentElement.dataset.previewReady='reload';
      return;
    }
    if(screen==='review')wkrOpenPriorityWeek(prior);
    else if(screen==='log')logGoto('today');
    else if(screen==='finance')openBudgetOverview();
    else if(screen==='month'){setView('notes');jrnPlannerShow('calendar');}
    else{
      jrnPlannerOpenWeek(today);
      if(screen==='editor')document.querySelector('[data-jp="add-task"]')?.click();
    }
    document.documentElement.dataset.previewReady=screen||'week';
  },50);
});
