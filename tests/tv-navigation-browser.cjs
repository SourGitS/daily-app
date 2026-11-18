// Desktop engines exercise the real web app with fake Firebase and synthetic records.
// These checks do not establish Android TV browser key forwarding or OS Back behaviour.
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {plannerFixture,fixtureURL}=require('./planner-browser-fixture.cjs');
const output=path.resolve(__dirname,'../temp-analysis/tv-navigation');fs.mkdirSync(output,{recursive:true});
const baseline=process.env.DAILY_TV_BASELINE||'d130ee3';
const frame=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function focus(page,selector){await page.locator(selector).first().evaluate(el=>DailyTV.focus(el));await frame(page);await focused(page);}
async function focused(page,scope){
  const state=await page.evaluate(scope=>{
    const el=document.activeElement,r=el?.getBoundingClientRect(),root=scope&&document.querySelector(scope);
    return {marked:el?.getAttribute('data-tv-focus')==='true',count:document.querySelectorAll('[data-tv-focus="true"]').length,
      usable:!!(r&&r.width&&r.height&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight&&!el.closest('[inert],[aria-hidden="true"]')&&!el.disabled),
      inside:!root||root.contains(el),label:el?.getAttribute('aria-label')||el?.textContent?.trim().slice(0,100)||el?.id};
  },scope);assert.equal(state.marked,true,JSON.stringify(state));assert.equal(state.count,1,JSON.stringify(state));assert.equal(state.usable,true,JSON.stringify(state));assert.equal(state.inside,true,JSON.stringify(state));
  return state;
}
async function press(page,key,scope){await page.keyboard.press(key);await frame(page);await focused(page,scope);}
async function footer(page,scope,name){
  for(let step=0;step<18;step++){
    const label=await page.evaluate(()=>document.activeElement.textContent.trim());if(label===name)break;
    await press(page,label==='Cancel'?'ArrowRight':'ArrowDown',scope);
  }
  assert.equal(await page.evaluate(()=>document.activeElement.textContent.trim()),name,'D-pad reaches '+name);
  const box=await page.evaluate(()=>{const r=document.activeElement.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight};});
  assert.ok(box.top>=0&&box.bottom<=box.height+1,'focused footer remains visible '+JSON.stringify(box));
}
async function idle(page){
  const mutations=await page.evaluate(()=>new Promise(resolve=>{
    let count=0;const observer=new MutationObserver(rows=>{count+=rows.filter(row=>row.attributeName?.startsWith('data-tv-')||row.target.id==='plan-html-frame'||row.target.closest?.('#daily-tv-bar,#daily-tv-plan-reader,.tv-layer-hint')).length;});
    observer.observe(document.body,{subtree:true,childList:true,attributes:true});setTimeout(()=>{observer.disconnect();resolve(count);},250);
  }));assert.ok(mutations<5,'idle remote UI has no repeating DOM mutation loop: '+mutations);return mutations;
}
async function benchmark(page,engine,width,view){
  const timings=await page.evaluate(()=>{const rows=[];for(let n=0;n<10;n++){const start=performance.now();DailyTV.refresh();rows.push(performance.now()-start);}return rows;});
  console.log('TV refresh '+JSON.stringify({engine,width,view,iterations:10,totalMs:Math.round(timings.reduce((a,b)=>a+b,0)*10)/10,maxMs:Math.round(Math.max(...timings)*10)/10}));
}
async function ready(page,tv){
  await page.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady&&!_bootPhase);
  await page.evaluate(()=>{obDismiss();dailyUpdateDismiss();foodCatalogueState.seenThisSession=true;if(document.getElementById('food-catalogue-dialog'))foodCatalogueClose();weatherCancelRequest();weatherEnsureFresh=()=>Promise.resolve(false);setView('home');});
  if(tv)await page.waitForFunction(()=>window.DailyTV?.enabled&&document.documentElement.dataset.tv==='true');
  await frame(page);
}
const financial=()=>JSON.stringify([txnData,ledgerData,budgetData,loadAccounts(),lsLoad('daily_budget_cycles',null),nutLog]);
async function navigate(page,id){
  const selector='#ds-nav [data-nav-quick="'+id+'"]';await focus(page,selector);await press(page,'Enter');
  assert.equal(await page.evaluate(()=>S.view),id==='budget'?'budget':id);assert.equal(new URL(page.url()).searchParams.get('tv'),'1','navigation preserves the explicit TV URL');return selector;
}
async function remoteJourneys(browser,engine,width,height,theme){
  const context=await browser.newContext({viewport:{width,height},timezoneId:'Australia/Sydney',reducedMotion:'reduce',serviceWorkers:'block'});
  await plannerFixture()(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
  await page.clock.setFixedTime(new Date('2026-11-18T01:00:00Z'));
  await page.goto(fixtureURL+'?preview&home-cards&planner-review&ui=journal&tv=1');await ready(page,true);
  await page.evaluate(theme=>{S.theme=theme;applyTheme();const list=loadAccounts(),card=list.find(a=>a.id==='sample-card');card.tracksStatement=true;card.statementBalance=100;card.dueDate=getLocalDate();saveAccounts(list);},theme);const initial=await page.evaluate(financial);
  await focus(page,'#ds-nav [data-nav-quick="home"]');await press(page,'ArrowDown');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.navQuick),'budget','sidebar Down reaches Finance');
  await press(page,'Enter');assert.equal(await page.evaluate(()=>S.view),'budget');await press(page,'ArrowRight');
  assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#desktop-sidebar')),false,'Right enters the active page');
  await page.screenshot({path:path.join(output,engine+'-'+width+'-'+theme+'-finance.png')});
  if(theme==='dark')await benchmark(page,engine,width,'Finance');

  // A native dialog followed by a custom modal must keep navigation inside the top layer.
  await focus(page,'#desktop-sidebar [data-shared-add]');await press(page,'Enter','#shared-add-dialog');
  assert.equal(await page.locator('#shared-add-dialog').evaluate(el=>el.open),true);
  await focus(page,'#shared-add-dialog [data-add-kind="expense"]');await press(page,'ArrowDown','#shared-add-dialog');await press(page,'ArrowUp','#shared-add-dialog');
  await press(page,'Enter','#txn-modal');assert.equal(await page.locator('#txn-modal').evaluate(el=>!el.classList.contains('hidden')),true);
  await focus(page,'#txn-amount');await press(page,'Enter','#txn-modal');assert.equal(await page.evaluate(()=>DailyTV.mode),'editing');
  await page.keyboard.type('12.50');await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('#txn-amount').evaluate(el=>el===document.activeElement),true);
  await press(page,'Escape','#txn-modal');assert.equal(await page.evaluate(()=>DailyTV.mode),'navigation');assert.equal(await page.locator('#txn-amount').inputValue(),'12.50');
  await focus(page,'#txn-account');await press(page,'Enter','#txn-modal');await page.keyboard.press('ArrowDown');await frame(page);
  assert.equal(await page.locator('#txn-account').inputValue(),'sample-everyday','select retains native option arrows in editing mode');
  await press(page,'Escape','#txn-modal');assert.equal(await page.evaluate(()=>DailyTV.mode),'navigation');
  await focus(page,'#txn-balance-setup');await press(page,'Enter','#acct-tools-dialog');await footer(page,'#acct-tools-dialog','Save tracking choice');
  await press(page,'Escape','#txn-modal');assert.equal(await page.locator('#acct-tools-dialog').evaluate(el=>el.open),false);
  assert.equal(await page.locator('#txn-amount').inputValue(),'12.50','Back from a nested native dialog preserves the expense draft');
  await footer(page,'#txn-modal','Save expense');
  await press(page,'Escape');assert.equal(await page.locator('#txn-modal').evaluate(el=>el.classList.contains('hidden')),true);
  await page.evaluate(()=>accountMarkPaid('sample-card'));await frame(page);await focus(page,'#acct-statement-remaining');await press(page,'Enter','#acct-statement-dialog');
  assert.equal(await page.locator('#acct-statement-dialog .tv-layer-hint').isVisible(),true);await press(page,'Escape','#acct-statement-dialog');await footer(page,'#acct-statement-dialog','Confirm payment');
  await press(page,'Escape');assert.equal(await page.locator('#acct-statement-dialog').evaluate(el=>el.open),false);

  // Existing native widget arrow owners run exactly once, even when their DOM is rebuilt.
  await page.evaluate(()=>openBudgetOverview());await focus(page,'#bud-money-plot');const beforeChart=await page.evaluate(()=>budMoneyUI.selected);
  await press(page,'ArrowLeft');assert.notEqual(await page.evaluate(()=>budMoneyUI.selected),beforeChart);assert.equal(await page.evaluate(()=>document.activeElement.id),'bud-money-plot');
  await press(page,'ArrowUp');assert.notEqual(await page.evaluate(()=>document.activeElement.id),'bud-money-plot','chart has a vertical escape');
  await navigate(page,'notes');await page.evaluate(()=>{jrnPlannerState.period='month';renderJournal();});await focus(page,'.jp-day.selected');
  const beforeDay=await page.evaluate(()=>jrnPlannerState.date);await press(page,'ArrowRight');
  assert.equal(await page.evaluate(()=>jrnPlannerState.date),await page.evaluate(date=>jrnPlannerAdd(date,1),beforeDay));
  assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('jp-day')),true);
  await page.screenshot({path:path.join(output,engine+'-'+width+'-'+theme+'-planner.png')});
  await press(page,'Escape');assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('jp-day')),false,'Back exits a native all-arrow calendar without changing the date');

  // Log and Food remain reachable from the same persistent navigation.
  await navigate(page,'log');await press(page,'ArrowRight');await focused(page,'#view-log');
  await page.screenshot({path:path.join(output,engine+'-'+width+'-'+theme+'-log.png')});
  await navigate(page,'food');await press(page,'ArrowRight');await focused(page,'#view-food');
  await page.evaluate(()=>nutOpenFoodSheet('snacks'));await frame(page);await focus(page,'#nutrition-food-overlay .nut-search');
  await press(page,'Enter','#nutrition-food-overlay');await page.keyboard.type('rice');await frame(page);
  assert.equal(await page.locator('#nutrition-food-overlay .nut-search').inputValue(),'rice','text survives live result rerenders');
  assert.equal(await page.locator('#nutrition-food-overlay .nut-search').evaluate(el=>el===document.activeElement),true);
  for(const finalInput of [false,true]){
    await page.evaluate(finalInput=>{
      const field=document.querySelector('#nutrition-food-overlay .nut-search');window.tvIMEInputs=0;
      window.tvIMECount=event=>{if(event.target.classList?.contains('nut-search'))window.tvIMEInputs++;};document.addEventListener('input',window.tvIMECount);
      field.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));
      for(const value of ['米','米飯']){field.value=value;field.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:value,isComposing:true}));if(!field.isConnected)throw Error('Composition node was replaced before IME finished');}
      field.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'米飯'}));
      if(finalInput)field.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'米飯',isComposing:false}));
    },finalInput);await frame(page);
    assert.equal(await page.locator('#nutrition-food-overlay .nut-search').inputValue(),'米飯');assert.equal(await page.evaluate(()=>nutSearch),'米飯');assert.equal(await page.evaluate(()=>DailyTV.mode),'editing');
    assert.equal(await page.evaluate(()=>window.tvIMEInputs),1,'IME completion reaches the existing live-search handler once');await page.evaluate(()=>document.removeEventListener('input',window.tvIMECount));
  }
  await press(page,'Escape','#nutrition-food-overlay');assert.equal(await page.evaluate(()=>DailyTV.mode),'navigation');
  await page.evaluate(()=>{nutSearch='';nutRenderFoodSheet();});await frame(page);await focus(page,'#nutrition-food-overlay .nut-food-row');
  const scrolling=()=>{const active=document.activeElement,rows=[];for(let el=active?.parentElement;el;el=el.parentElement)if(el.scrollHeight>el.clientHeight+1)rows.push({tag:el.id||el.className,top:el.scrollTop});return rows;};
  const beforeScroll=await page.evaluate(scrolling);for(let n=0;n<12;n++)await press(page,'ArrowDown','#nutrition-food-overlay');
  assert.notDeepEqual(await page.evaluate(scrolling),beforeScroll,'D-pad scrolls the nested food results/body');
  await press(page,'Escape');assert.equal(await page.locator('#nutrition-food-overlay').evaluate(el=>el.classList.contains('hidden')),true);
  await page.screenshot({path:path.join(output,engine+'-'+width+'-'+theme+'-food.png')});
  if(theme==='dark')await benchmark(page,engine,width,'Food');
  await page.evaluate(()=>{kitRecipes=[{id:'tv-sample-recipe',name:'TV sample rice',category:'dinner',servings:1,ingredients:[{name:'Rice',amount:1,unit:'cup'}],steps:['Cook the rice.']}];foodSetTab('recipes');});await frame(page);
  await focus(page,'#kit-list .kit-card');await press(page,'Enter');assert.equal(await page.evaluate(()=>kitState.selectedId),'tv-sample-recipe');
  assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('kit-card')),true,'custom clickable recipe card remains focusable after activation/rerender');
  await page.evaluate(()=>kitRenderList());await frame(page);await focused(page);assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('kit-card')),true);
  await focus(page,'#kit-list .kit-card .kit-menu-btn');await press(page,'Enter','.kit-menu-dropdown');await press(page,'Escape');
  assert.equal(await page.locator('.kit-menu-dropdown').count(),0,'Back closes only the recipe action menu');
  const recipeBefore=await page.evaluate(()=>JSON.stringify(kitRecipes[0]));await page.evaluate(()=>{nutReviewRecipe('tv-sample-recipe');nutPickIngredient('tv-sample-recipe','shared:0');});await frame(page);
  assert.equal(await page.locator('#nutrition-food-box .modal-title').innerText(),'Match ingredient');await focus(page,'#nutrition-food-box .back-btn');await press(page,'Escape','#nutrition-food-overlay');
  assert.equal(await page.locator('#nutrition-food-box .modal-title').innerText(),'Nutrition Review','Back from ingredient matching preserves the recipe review');assert.equal(await page.evaluate(()=>JSON.stringify(kitRecipes[0])),recipeBefore);
  await press(page,'Escape');assert.equal(await page.locator('#nutrition-food-overlay').evaluate(el=>el.classList.contains('hidden')),true,'the next Back closes the review');

  // Re-rendered Home controls recover their identity rather than falling to the page body.
  await navigate(page,'home');await page.screenshot({path:path.join(output,engine+'-'+width+'-'+theme+'-home-return.png')});await focus(page,'[aria-label="Customise Home layout"]');await page.evaluate(()=>renderHome());await frame(page);
  assert.equal((await focused(page)).label,'Customise Home layout');
  await page.screenshot({path:path.join(output,engine+'-'+width+'-'+theme+'-home.png')});
  const homeIdle=await idle(page);if(theme==='dark')console.log('TV idle '+JSON.stringify({engine,width,scope:'Home',durationMs:250,mutations:homeIdle}));

  // Imported HTML remains isolated; the optional TV reader inserts plain text only.
  const plan=await page.evaluate(()=>{
    window.tvPlanParentExecuted=0;const color=getComputedStyle(document.body).color;
    const source='<!doctype html><html><head><style>body{color:rgb(255,0,255)!important}</style><script>try{parent.tvPlanParentExecuted=1}catch(e){}<\/script></head><body><h1>Sample reading plan</h1><img src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E" onload="window.tvPlanParentExecuted=2">'+Array.from({length:100},(_,i)=>'<p>Reading section '+(i+1)+': Take your time and keep the movement comfortable.</p>').join('')+'<button onclick="window.tvPlanParentExecuted=3">Untrusted source button</button></body></html>';
    const plans=loadPlans();plans.plans.push({id:'tv-html-plan',name:'Sample reading plan',type:'html',content:source});savePlans(plans);
    const stored=localStorage.getItem('wt_plans');plansOpenHTML('tv-html-plan');return {source,stored,color};
  });await page.locator('#daily-tv-plan-reader').waitFor({state:'visible'});await focus(page,'#daily-tv-plan-reader');const readerIdle=await idle(page);if(theme==='dark')console.log('TV idle '+JSON.stringify({engine,width,scope:'HTML reader',durationMs:250,mutations:readerIdle}));
  assert.equal(await page.locator('#daily-tv-plan-reader').locator('button,iframe,script,style,img,a').count(),0);
  assert.doesNotMatch(await page.locator('#daily-tv-plan-reader').innerText(),/tvPlanParentExecuted|rgb\(255/);
  assert.equal(await page.locator('#plan-html-frame').getAttribute('sandbox'),'allow-scripts');assert.equal(await page.locator('#plan-html-frame').getAttribute('srcdoc'),plan.source);
  const readerTop=await page.locator('#daily-tv-plan-reader').evaluate(el=>el.scrollTop);await press(page,'ArrowDown','#daily-tv-plan-reader');
  assert.ok(await page.locator('#daily-tv-plan-reader').evaluate(el=>el.scrollTop)>readerTop,'Down scrolls long read-only HTML-plan text');
  await press(page,'End','#daily-tv-plan-reader');const readerEnd=await page.locator('#daily-tv-plan-reader').evaluate(el=>el.scrollTop);await press(page,'ArrowUp','#daily-tv-plan-reader');assert.ok(await page.locator('#daily-tv-plan-reader').evaluate(el=>el.scrollTop)<readerEnd);
  await page.screenshot({path:path.join(output,engine+'-'+width+'-'+theme+'-plan-reader.png')});await press(page,'Escape');
  assert.equal(await page.locator('#plan-html-overlay').isVisible(),false);assert.equal(await page.evaluate(()=>localStorage.getItem('wt_plans')),plan.stored,'reading preserves the raw saved HTML bytes');
  await page.evaluate(()=>plansOpenHTML('tv-html-plan'));await page.locator('#daily-tv-plan-reader').waitFor({state:'visible'});
  await page.evaluate(()=>{const frame=document.getElementById('plan-html-frame');frame.srcdoc=frame.srcdoc.replace('Sample reading plan','Updated reading title');});
  await page.waitForFunction(()=>document.getElementById('daily-tv-plan-reader')?.textContent.includes('Updated reading title'));assert.equal(await page.evaluate(()=>localStorage.getItem('wt_plans')),plan.stored);
  await page.evaluate(()=>{plansOpenHTML('tv-html-plan');plansCloseHTML();plansOpenHTML('tv-html-plan');DailyTV.setEnabled(false);});await frame(page);
  assert.equal(await page.locator('#daily-tv-plan-reader').count(),0);assert.equal(await page.locator('#plan-html-frame').isVisible(),true,'disabling TV restores the original isolated iframe');
  assert.equal(await page.locator('#plan-html-frame').getAttribute('srcdoc'),plan.source);assert.equal(await page.locator('#plan-html-frame').getAttribute('sandbox'),'allow-scripts');
  assert.equal(await page.evaluate(()=>window.tvPlanParentExecuted),0);assert.equal(await page.evaluate(()=>getComputedStyle(document.body).color),plan.color);
  assert.equal(await page.evaluate(()=>localStorage.getItem('wt_plans')),plan.stored);await page.evaluate(()=>{plansCloseHTML();DailyTV.setEnabled(true);});await frame(page);

  // Empty/loading layers remain contained and recover when their first control appears.
  await page.evaluate(()=>{const dialog=document.createElement('dialog');dialog.id='tv-test-loading';dialog.innerHTML='<p role="status">Loading sample choices…</p>';document.body.appendChild(dialog);dialog.showModal();DailyTV.refresh();});await frame(page);
  await press(page,'ArrowDown','#tv-test-loading');await page.evaluate(()=>{const button=document.createElement('button');button.id='tv-test-loaded';button.textContent='Sample choice ready';button.onclick=()=>window.tvLoadedActivations=(window.tvLoadedActivations||0)+1;document.getElementById('tv-test-loading').appendChild(button);});await frame(page);
  await press(page,'ArrowDown','#tv-test-loading');await press(page,'Enter','#tv-test-loading');assert.equal(await page.evaluate(()=>window.tvLoadedActivations),1,'one Centre press activates once');
  await page.evaluate(()=>{const field=document.createElement('textarea');field.id='tv-test-textarea';field.setAttribute('aria-label','Sample writing');document.getElementById('tv-test-loading').appendChild(field);});await focus(page,'#tv-test-textarea');await press(page,'Enter','#tv-test-loading');
  await page.keyboard.type('First line');await page.keyboard.press('Enter');await page.keyboard.type('Second line');assert.equal(await page.locator('#tv-test-textarea').inputValue(),'First line\nSecond line','Enter stays native inside a text editor');
  await press(page,'Escape','#tv-test-loading');await page.evaluate(()=>document.getElementById('tv-test-textarea').remove());await frame(page);
  await page.evaluate(()=>{const button=document.getElementById('tv-test-loaded'),range=document.createElement('input');range.type='range';range.id='tv-test-range';range.min='0';range.max='10';range.value='5';range.setAttribute('aria-label','Sample intensity');range.style.display='block';range.style.marginBottom='20px';button.style.display='block';button.before(range);});await focus(page,'#tv-test-range');
  await press(page,'ArrowRight','#tv-test-loading');assert.equal(await page.locator('#tv-test-range').inputValue(),'6');await press(page,'ArrowLeft','#tv-test-loading');assert.equal(await page.locator('#tv-test-range').inputValue(),'5');
  await press(page,'ArrowDown','#tv-test-loading');assert.equal(await page.evaluate(()=>document.activeElement.id),'tv-test-loaded','Down leaves the native range widget');
  await page.evaluate(()=>{window.tvCancelGuard=event=>{event.preventDefault();window.tvGuardCalls=(window.tvGuardCalls||0)+1;};document.getElementById('tv-test-loading').addEventListener('cancel',window.tvCancelGuard);});
  await press(page,'Escape','#tv-test-loading');assert.equal(await page.locator('#tv-test-loading').evaluate(el=>el.open),true,'existing native cancel guard can retain an open editor');assert.equal(await page.evaluate(()=>window.tvGuardCalls),1,'Back invokes the cancel guard once');
  await page.evaluate(()=>document.getElementById('tv-test-loading').removeEventListener('cancel',window.tvCancelGuard));
  await press(page,'Escape');assert.equal(await page.locator('#tv-test-loading').evaluate(el=>el.open),false);await page.evaluate(()=>document.getElementById('tv-test-loading').remove());
  assert.equal(await page.evaluate(financial),initial,'browsing and cancelled drafts write no financial or food records');

  // A new-user text field is reachable; exiting editing retains the draft without completing setup.
  await page.evaluate(()=>{showOnboarding();const index=obSteps().indexOf('focus');obStep=index;renderObStep();});await frame(page);await focus(page,'#ob-name');
  await press(page,'Enter','#onboarding-overlay');await page.keyboard.type('Sample TV user');await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#ob-name').evaluate(el=>el===document.activeElement),true);await press(page,'Escape','#onboarding-overlay');
  assert.equal(await page.locator('#ob-name').inputValue(),'Sample TV user');assert.equal(await page.evaluate(()=>DailyTV.mode),'navigation');await page.evaluate(()=>obDismiss());
  await page.evaluate(()=>history.pushState(history.state,'',location.href));await focus(page,'#daily-tv-exit');await page.keyboard.press('Enter');await frame(page);
  assert.equal(await page.evaluate(()=>DailyTV.enabled),false);assert.notEqual(await page.locator('html').getAttribute('data-tv'),'true');assert.equal(await page.locator('[data-tv-focus]').count(),0);
  assert.equal(new URL(page.url()).searchParams.has('tv'),false,'Exit TV mode removes the opt-in URL flag');
  await page.evaluate(()=>history.back());await page.waitForFunction(()=>DailyTV.enabled);assert.equal(new URL(page.url()).searchParams.get('tv'),'1','Back re-enables an earlier explicit TV URL');
  await page.evaluate(()=>history.forward());await page.waitForFunction(()=>!DailyTV.enabled);assert.equal(new URL(page.url()).searchParams.has('tv'),false,'Forward restores the ordinary URL without trapping history');
  assert.deepEqual(errors,[]);await context.close();console.log('PASS '+engine+' '+width+'×'+height+' '+theme+' TV D-pad journeys, editing, focus and nested layers');
}
async function normalMode(browser,engine){
  const snapshots=[];
  for(const revision of [baseline,undefined]){
    const context=await browser.newContext({viewport:{width:1280,height:720},timezoneId:'Australia/Sydney',reducedMotion:'reduce',serviceWorkers:'block'});await plannerFixture(revision)(context);
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-11-18T01:00:00Z'));
    await page.goto(fixtureURL+'?preview&home-cards&planner-review&ui=journal');await ready(page,false);
    const views=[];for(const view of ['home','budget','log','food','notes']){
      await page.evaluate(view=>view==='budget'?openBudgetOverview():setView(view),view);await frame(page);
      views.push(await page.evaluate(view=>{
        const root=document.getElementById('view-'+view),visible=el=>{const r=el.getBoundingClientRect();return !!(r.width&&r.height);};
        return {view,text:root.innerText.replace(/\s+/g,' ').trim(),controls:[...root.querySelectorAll('button,input,select,textarea,a')].filter(visible).slice(0,24).map(el=>{const r=el.getBoundingClientRect();return {tag:el.tagName,label:el.getAttribute('aria-label')||el.textContent.trim(),box:[r.x,r.y,r.width,r.height].map(n=>Math.round(n*10)/10)};})};
      },view));
    }
    assert.notEqual(await page.locator('html').getAttribute('data-tv'),'true');assert.equal(await page.locator('[data-tv-focus]').count(),0);
    await page.evaluate(()=>{jrnPlannerState.period='month';renderJournal();document.querySelector('.jp-day.selected').focus();});const date=await page.evaluate(()=>jrnPlannerState.date);
    await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>jrnPlannerState.date),await page.evaluate(date=>jrnPlannerAdd(date,1),date));
    const untouched=await page.evaluate(()=>{const button=document.createElement('button');button.textContent='Ordinary keyboard probe';document.body.appendChild(button);button.focus();const event=new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true});button.dispatchEvent(event);const result=!event.defaultPrevented&&document.activeElement===button;button.remove();return result;});assert.equal(untouched,true,'normal arrows retain browser ownership');
    assert.deepEqual(errors,[]);snapshots.push(views);await context.close();
  }
  assert.deepEqual(snapshots[1],snapshots[0],'non-TV Home, Finance, Log, Food and Planner preserve the baseline layout and content');
  console.log('PASS '+engine+' normal-mode five-view baseline and native keyboard preservation ('+baseline+')');
}
async function motionSmoke(browser){
  const context=await browser.newContext({viewport:{width:1280,height:720},timezoneId:'Australia/Sydney',reducedMotion:'no-preference',serviceWorkers:'block'});await plannerFixture()(context);
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(8000);
  await page.goto(fixtureURL+'?preview&home-cards&planner-review&ui=journal&tv=1');await ready(page,true);const before=await page.evaluate(financial);
  await focus(page,'#desktop-sidebar [data-shared-add]');await page.keyboard.press('Enter');await page.waitForFunction(()=>document.getElementById('shared-add-dialog').open&&document.activeElement.closest('#shared-add-dialog'));
  await focused(page,'#shared-add-dialog');await focus(page,'#shared-add-dialog [data-add-kind="expense"]');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.activeElement.getAttribute('data-tv-focus')==='true'&&document.activeElement.closest('#txn-modal')&&!document.getElementById('txn-modal').classList.contains('hidden'));
  await focus(page,'#txn-amount');await press(page,'Enter','#txn-modal');await page.keyboard.type('8.75');await press(page,'Escape','#txn-modal');await press(page,'Escape');
  assert.equal(await page.locator('#txn-modal').evaluate(el=>el.classList.contains('hidden')),true);
  await page.evaluate(()=>{const dialog=document.createElement('dialog');dialog.id='tv-motion-dialog';dialog.style.transition='opacity 140ms linear';dialog.style.opacity='0';dialog.innerHTML='<p role="status">Loading sample controls…</p>';document.body.appendChild(dialog);dialog.showModal();requestAnimationFrame(()=>dialog.style.opacity='1');});
  await page.waitForFunction(()=>document.activeElement.getAttribute('data-tv-focus')==='true'&&document.activeElement.closest('#tv-motion-dialog'));await focused(page,'#tv-motion-dialog');
  await page.evaluate(()=>{const button=document.createElement('button');button.id='tv-motion-choice';button.textContent='Ready';button.onclick=()=>window.tvMotionClicks=(window.tvMotionClicks||0)+1;document.getElementById('tv-motion-dialog').appendChild(button);});
  await page.waitForFunction(()=>document.activeElement.id==='tv-motion-choice');await press(page,'Enter','#tv-motion-dialog');assert.equal(await page.evaluate(()=>window.tvMotionClicks),1);
  await press(page,'Escape');assert.equal(await page.locator('#tv-motion-dialog').evaluate(el=>el.open),false);await page.evaluate(()=>document.getElementById('tv-motion-dialog').remove());
  assert.equal(await page.evaluate(financial),before);assert.deepEqual(errors,[]);await context.close();console.log('PASS chrome 1280×720 normal-motion Add/expense/Back and loading native-dialog focus');
}
(async()=>{for(const [engine,type,launch]of [['chrome',chromium,{channel:'chrome',headless:true}],['webkit',webkit,{headless:true}]].filter(([name])=>!process.env.DAILY_TV_BROWSER||name===process.env.DAILY_TV_BROWSER)){
  const browser=await type.launch(launch);try{
    if(process.env.DAILY_TV_MOTION_ONLY){if(engine==='chrome')await motionSmoke(browser);continue;}
    if(!process.env.DAILY_TV_ONLY)await normalMode(browser,engine);
    for(const [width,height]of [[1280,720],[1920,1080]].filter(([width])=>!process.env.DAILY_TV_WIDTH||width===Number(process.env.DAILY_TV_WIDTH)))for(const theme of ['dark','light'].filter(theme=>!process.env.DAILY_TV_THEME||theme===process.env.DAILY_TV_THEME))await remoteJourneys(browser,engine,width,height,theme);
    if(!process.env.DAILY_TV_ONLY&&engine==='chrome')await motionSmoke(browser);
  }finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
