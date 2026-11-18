// Real Settings controls, fake Firebase and synthetic account/device storage only.
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {plannerFixture,plannerSampleFiles,fixtureURL}=require('./planner-browser-fixture.cjs');
const output=path.resolve(__dirname,'../temp-analysis/tv-settings-20261118');fs.mkdirSync(output,{recursive:true});
const frame=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function fixture(context){
  await plannerFixture()(context);const sample=plannerSampleFiles(),original=sample('tests/sync-browser-fixture.js');
  const anchor='const initial=clone(stores),listeners=new Map(),writes=[],errors=[];';assert.ok(original.body.includes(anchor));
  await context.route('**/tests/sync-browser-fixture.js',route=>route.fulfill({...original,body:original.body.replace(anchor,anchor+'\nwindow.tvSettingsCloudWrites=writes;')}));
}
async function ready(page){
  await page.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady&&!_bootPhase&&!_syncApplying);
  await page.evaluate(()=>{obDismiss();dailyUpdateDismiss();foodCatalogueState.seenThisSession=true;weatherCancelRequest();weatherEnsureFresh=()=>Promise.resolve(false);});await frame(page);
}
async function appearance(page,query='television'){
  await page.evaluate(()=>{closeSettingsSection();setView('settings');});await page.getByLabel('Search settings',{exact:true}).fill(query);
  await page.locator('.stg-result').filter({hasText:'TV mode'}).first().click();await page.getByRole('switch',{name:'TV mode',exact:true}).waitFor({state:'visible'});await frame(page);
}
const money=()=>JSON.stringify([txnData,ledgerData,lsLoad('daily_budget',{}),loadAccounts(),lsLoad('daily_budget_cycles',null),S.sessions,S.weights,nutLog]);
const native=()=>Object.fromEntries(Array.from({length:window.localStorage.length},(_,i)=>window.localStorage.key(i)).sort().map(key=>[key,window.localStorage.getItem(key)]));
async function monitor(page){
  await page.evaluate(()=>{tvSettingsCloudWrites.length=0;window.tvSettingsEvents=[];if(!window.tvSettingsListen){window.tvSettingsListen=event=>tvSettingsEvents.push(event.detail);window.addEventListener('daily-tv-change',window.tvSettingsListen);}});
  return {native:await page.evaluate(native),money:await page.evaluate(money)};
}
async function onlyPreference(page,before,value){
  const after=await page.evaluate(native),without=value=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=='daily-tv-mode'));
  assert.deepEqual(without(after),without(before.native),'TV mode changes no account values, timestamps or other device keys');
  assert.equal(after['daily-tv-mode']??null,value);assert.equal(await page.evaluate(money),before.money);assert.deepEqual(await page.evaluate(()=>tvSettingsCloudWrites),[],'TV choices start no cloud writes');
}
async function state(page,on){
  assert.equal(await page.evaluate(()=>DailyTV.enabled),on);assert.equal(await page.locator('#stg-tv-mode-toggle').getAttribute('aria-checked'),String(on));
  assert.equal(await page.locator('#stg-tv-mode-toggle').innerText(),on?'On':'Off');assert.equal(await page.locator('#daily-tv-bar').isVisible(),on);
}
async function visibleSwitch(page){
  const view=await page.locator('#stg-tv-mode-toggle').evaluate(el=>{const r=el.getBoundingClientRect();return {focused:el===document.activeElement,top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:innerWidth,height:innerHeight};});
  assert.equal(view.focused,true,'the setting keeps focus after the layout changes');assert.ok(view.top>=0&&view.left>=0&&view.right<=view.width+1&&view.bottom<=view.height+1,'TV switch stays inside the viewport '+JSON.stringify(view));
}
async function choose(page,on,pointer=false){
  const button=page.getByRole('switch',{name:'TV mode',exact:true});if(pointer)await button.click();else{await button.focus();await page.keyboard.press('Enter');}
  await frame(page);await state(page,on);await visibleSwitch(page);
  const event=await page.evaluate(()=>tvSettingsEvents.at(-1));assert.equal(event.enabled,on);assert.equal(event.persisted,true);assert.equal(event.source,'settings');
}
async function noRepeatedScroll(page){
  const setup=await page.evaluate(()=>{
    const button=document.getElementById('stg-tv-mode-toggle');for(let el=button.parentElement;el;el=el.parentElement){const style=getComputedStyle(el);if(/auto|scroll/.test(style.overflowY)&&el.scrollHeight>el.clientHeight+1){window.tvSettingsScroller=el;el.scrollTop=0;document.getElementById('stg-tv-mode-feedback').appendChild(document.createTextNode(''));return {before:el.scrollTop};}}return null;
  });await frame(page);if(setup)assert.equal(await page.evaluate(()=>tvSettingsScroller.scrollTop),setup.before,'later refreshes do not pull a manually scrolled page back to the switch');
}
async function run(browser,engine,width,height,theme){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<1024,hasTouch:width<1024,timezoneId:'Australia/Sydney',reducedMotion:'reduce',serviceWorkers:'block'});await fixture(context);
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(8000);await page.clock.setFixedTime(new Date('2026-11-18T01:00:00Z'));
  const params=new URLSearchParams('preview&home-cards&planner-review&week-preview&ui=journal');params.set('switch','tv-settings-'+engine+'-'+width);const ordinary=fixtureURL+'?'+params+'#settings';
  await page.goto(ordinary);await ready(page);await page.evaluate(theme=>{S.theme=theme;applyTheme();},theme);await appearance(page);
  await state(page,false);assert.equal(await page.evaluate(()=>window.localStorage.getItem('daily-tv-mode')),null);
  const search=await page.locator('#stg-search-input').inputValue();await page.evaluate(()=>{window.tvSettingsSearchNode=document.getElementById('stg-search-input');window.tvSettingsSwitchNode=document.getElementById('stg-tv-mode-toggle');});
  let before=await monitor(page);await choose(page,true);await onlyPreference(page,before,'1');
  assert.equal(await page.evaluate(()=>document.getElementById('stg-search-input')===tvSettingsSearchNode&&document.getElementById('stg-tv-mode-toggle')===tvSettingsSwitchNode),true,'toggle updates in place');assert.equal(await page.locator('#stg-search-input').inputValue(),search,'existing Settings search draft is retained');
  await page.screenshot({path:path.join(output,engine+'-'+width+'-on.png')});await noRepeatedScroll(page);

  // A bookmarked TV URL and an ordinary browser restart both honour the remembered choice.
  const financial=await page.evaluate(money);await page.reload();await ready(page);await appearance(page,'controller');await state(page,true);assert.equal(await page.evaluate(money),financial);
  await page.goto(ordinary);await ready(page);await appearance(page,'remote');await state(page,true);assert.equal(new URL(page.url()).searchParams.has('tv'),false,'ordinary URL enables from the device choice');
  assert.equal(await page.evaluate(money),financial);before=await monitor(page);
  await page.evaluate(()=>{closeSettingsSection();const url=new URL(location.href);url.searchParams.set('tv','1');history.pushState(history.state,'',url.href);history.pushState(history.state,'',url.href);});
  await page.locator('#daily-tv-exit').click();await frame(page);assert.equal(await page.evaluate(()=>DailyTV.enabled),false);assert.equal(await page.locator('#stg-tv-mode-toggle').getAttribute('aria-checked'),'false');await onlyPreference(page,before,'0');
  await page.evaluate(()=>history.back());await page.waitForFunction(()=>DailyTV.enabled===true);assert.equal(await page.locator('#stg-tv-mode-toggle').getAttribute('aria-checked'),'true');assert.equal(await page.evaluate(()=>window.localStorage.getItem('daily-tv-mode')),'0','history changes active mode without changing the saved choice');
  await page.evaluate(()=>history.forward());await page.waitForFunction(()=>DailyTV.enabled===false);assert.equal(await page.locator('#stg-tv-mode-toggle').getAttribute('aria-checked'),'false');await onlyPreference(page,before,'0');

  // Pointer activation must focus the same switch, including WebKit's non-focusing buttons.
  await appearance(page);before=await monitor(page);await choose(page,true,true);await onlyPreference(page,before,'1');await choose(page,false);await onlyPreference(page,before,'0');
  await page.goto(ordinary);await ready(page);await appearance(page);await state(page,false);

  // Explicit TV links work without rewriting the remembered Off choice.
  const forced=new URL(ordinary);forced.searchParams.set('tv','1');await page.goto(forced.href);await ready(page);await appearance(page);await state(page,true);assert.equal(await page.evaluate(()=>window.localStorage.getItem('daily-tv-mode')),'0');
  before=await monitor(page);await choose(page,false);await onlyPreference(page,before,'0');

  // Quota failure keeps the session usable and reports that remembering failed.
  before=await monitor(page);await page.evaluate(()=>{window.tvSettingsSet=window.localStorage.setItem.bind(window.localStorage);window.localStorage.setItem=(key,value)=>{if(key==='daily-tv-mode')throw Error('Synthetic device preference quota');return window.tvSettingsSet(key,value);};});
  await page.getByRole('switch',{name:'TV mode',exact:true}).click();await frame(page);await state(page,true);await visibleSwitch(page);assert.match(await page.locator('#stg-tv-mode-feedback').innerText(),/Changed for now.*could not remember/i);
  assert.deepEqual(await page.evaluate(()=>({enabled:tvSettingsEvents.at(-1).enabled,persisted:tvSettingsEvents.at(-1).persisted,source:tvSettingsEvents.at(-1).source})),{enabled:true,persisted:false,source:'settings'});await onlyPreference(page,before,'0');
  await page.evaluate(()=>window.localStorage.setItem=window.tvSettingsSet);await page.goto(ordinary);await ready(page);await appearance(page);await state(page,false);

  // The preference belongs to this browser, not an account backup or restored data.
  if(engine==='chrome'&&width===1280){
  await monitor(page);await choose(page,true);const downloadEvent=page.waitForEvent('download');await page.evaluate(()=>exportAllData());const download=await downloadEvent,backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.equal(Object.keys(backup.data).some(key=>key.includes('tv-mode')),false);
  const restore=await page.evaluate(()=>{let report='';const result=restoreFromText(JSON.stringify({data:{'daily-tv-mode':'0'}}),message=>report=message);const plan=dailyRestoreStage({'daily-tv-mode':'0',daily_weight_goal:{target:80}},Date.now());return {result,report,ignored:!plan.writes.has('daily-tv-mode'),preference:window.localStorage.getItem('daily-tv-mode')};});
  assert.equal(restore.result,false);assert.match(restore.report,/No Daily data/);assert.equal(restore.ignored,true);assert.equal(restore.preference,'1');
  const accountBefore=await page.evaluate(()=>{const scope=dailyScopedStorage(dailyNativeStorage,'user:fixture');return Object.fromEntries(scope.keys().filter(key=>/^(daily_(accounts|transactions|ledger|budget)|wt_(sessions|weight))/.test(key)).map(key=>[key,scope.getItem(key)]));});
  await Promise.all([page.waitForEvent('domcontentloaded'),page.evaluate(()=>{dailyNativeStorage.setItem('fixture-user','fresh-fixture');dailySwitchAccount({uid:'fresh-fixture',displayName:'Second sample account'});})]);await ready(page);
  assert.equal(await page.evaluate(()=>localStorage.scope),'user:fresh-fixture');assert.equal(await page.evaluate(()=>DailyTV.enabled),true);await appearance(page);await state(page,true);
  const scoped=await page.evaluate(()=>{localStorage.clear();const prior=dailyScopedStorage(dailyNativeStorage,'user:fixture');return {preference:dailyNativeStorage.getItem('daily-tv-mode'),old:Object.fromEntries(prior.keys().filter(key=>/^(daily_(accounts|transactions|ledger|budget)|wt_(sessions|weight))/.test(key)).map(key=>[key,prior.getItem(key)]))};});
  assert.equal(scoped.preference,'1','account-scope reset leaves the native device preference intact');assert.deepEqual(scoped.old,accountBefore,'switching/resetting another sample account preserves the first account records');
  }
  assert.deepEqual(errors,[]);await context.close();console.log('PASS '+engine+' '+width+'×'+height+' Settings TV mode: keyboard/pointer, persistence, Exit/history, local-only storage and failure'+(engine==='chrome'&&width===1280?'; backup/account boundaries':''));
}
(async()=>{for(const [engine,type,launch]of [['chrome',chromium,{channel:'chrome',headless:true}],['webkit',webkit,{headless:true}]].filter(([name])=>!process.env.DAILY_TV_SETTINGS_BROWSER||name===process.env.DAILY_TV_SETTINGS_BROWSER)){
  const browser=await type.launch(launch);try{for(const [width,height,theme]of [[390,844,'dark'],[1280,720,'light']].filter(([width])=>!process.env.DAILY_TV_SETTINGS_WIDTH||width===Number(process.env.DAILY_TV_SETTINGS_WIDTH)))await run(browser,engine,width,height,theme);}finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
