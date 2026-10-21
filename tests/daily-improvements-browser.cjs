// Sample data only: checks the complete review pass without production Firebase or weather.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{const f=path.resolve(root,decodeURIComponent(req.url.split('?')[0]).slice(1));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(f,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':mime[path.extname(f)]||'text/plain','Content-Security-Policy':"connect-src 'self'"});res.end(err?'Missing':data);});});
const snapshot=()=>Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).map(k=>[k,localStorage.getItem(k)]));
async function readyView(page,view){await page.evaluate(view=>setView(view),view);try{await page.waitForFunction(view=>{const e=document.getElementById('view-'+view),r=e.getBoundingClientRect(),a=document.getElementById('app-main').getBoundingClientRect();return S.view===view&&r.width>0&&Math.abs(r.left-a.left)<45;},view,{timeout:5000});}catch(e){console.log('view diagnostics',view,await page.evaluate(view=>({state:S.view,rect:document.getElementById('view-'+view).getBoundingClientRect().toJSON(),deck:document.getElementById('swipe-deck').style.cssText,textMode:deckTextInputMode,active:document.activeElement?.id,app:document.getElementById('app-main').getBoundingClientRect().toJSON()}),view));throw e;}}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const b=await chromium.launch({channel:'chrome',headless:true});try{
 const sizes=process.env.DAILY_REVIEW_EXTRA?[[568,320],[844,390],[1100,950],[1239,950],[1240,950]]:(process.env.DAILY_REVIEW_WIDTHS||'320,390,768,1023,1024,1440,1920').split(',').map(Number).map(width=>[width,950]);
 for(const [width,height] of sizes)for(const theme of ['dark','light']){
  const context=await b.newContext({viewport:{width,height},timezoneId:'Australia/Sydney',reducedMotion:'reduce'});
  await context.route(/firebaseio\.com|cloudfunctions\.net|api\.open-meteo\.com/,r=>r.abort());
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:'+server.address().port+'/tests/sync-browser.html?preview&ui=journal&finance-links');
  await p.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady);
  await p.getByText('Local preview · sample money only. Changes here do not affect your saved finances.').waitFor();
  await p.addStyleTag({content:'#swipe-deck.snapping{transition:none!important}*,*:before,*:after{animation:none!important}'});
  await p.evaluate(theme=>{obDismiss();dailyUpdateDismiss();profileData.budgetRhythmSeen=2;foodCatalogueState.seenThisSession=true;S.theme=theme;applyTheme();weatherCancelRequest();
   const now=Date.now(),midday=localMidnight(getLocalDate()).getTime()+12*36e5;
   window.qaWeather={city:'Sydney',lat:-33.8,lon:151.2,tempC:22,feelsC:20,tmax:24,tmin:14,code:1,isDay:1,fetchedAt:now,observedAt:now,timezone:'Australia/Sydney',
    daily:Array.from({length:7},(_,i)=>({time:midday+i*864e5,tempMax:24+i,tempMin:14,code:1,rainProbability:30})),
    hourly:Array.from({length:6},(_,i)=>({time:now+(i+1)*36e5,tempC:22-i,code:1,isDay:1,rainProbability:30,precipitation:0}))};
   loadWeatherCache=()=>qaWeather;weatherEnsureFresh=()=>Promise.resolve(false);weatherRefresh=()=>{renderWeatherInto(qaWeather);return Promise.resolve(false);};_weatherStatus={state:'idle',message:''};setView('home');renderWeatherInto(qaWeather);
  },theme);
  const initial=await p.evaluate(snapshot);
  assert.deepEqual(await p.locator('#bottom-nav .nav-btn').evaluateAll(es=>es.map(e=>e.dataset.view)),['home','budget','log','food','stats']);
  assert.equal(await p.locator('#swipe-deck #view-notes').count(),0);
  assert.equal(await p.locator('#app-main > #view-notes').count(),1);
  assert.equal(await p.locator('#ds-nav [data-nav-quick="notes"]').count(),1);
  assert.equal(await p.locator('#home-weather-refresh').isVisible(),false,'healthy weather must not show refresh');
  await p.locator('#home-weather-forecast-toggle').click();await p.locator('#home-weather-week').click();
  assert.equal(await p.locator('#home-weather-hours .weather-hour').count(),7);
  assert.equal(await p.locator('#home-weather-hours').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'forecast must fit');
  await p.evaluate(()=>{qaWeather.fetchedAt=Date.now()-5*36e5;_weatherStatus={state:'idle'};renderWeatherStatus();});
  assert.equal(await p.locator('#home-weather-refresh').isVisible(),false,'stale weather updates automatically');
  await p.evaluate(()=>{_weatherStatus={state:'error',message:'Failed'};renderWeatherStatus();});
  assert.equal(await p.locator('#home-weather-refresh').isVisible(),true,'a failed update offers recovery');
  await p.evaluate(()=>{_weatherStatus={state:'loading'};renderWeatherStatus();});
  assert.equal(await p.locator('#home-weather-refresh').isVisible(),false);
  await p.evaluate(()=>{qaWeather.fetchedAt=Date.now();_weatherStatus={state:'idle'};renderWeatherStatus();});
  const journal=p.locator('[data-card-id="notes"] .home-card-destination');
  assert.equal(await p.locator('[data-card-id="notes"] .card-hd-act').count(),0);
  await journal.click({position:{x:20,y:20}});await readyView(p,'notes');
  assert.equal(await p.locator('#journal-root h1').textContent(),'Journal');
  await p.locator('.jrn-browse-tabs [data-tab-id="notes"]').click();
  await p.locator('#journal-root [data-jrn="new-note"]').click();
  assert.equal(await p.evaluate(()=>!!jrnEdRec()&&jrnEdRec().kind==='note'),true);
  await p.evaluate(()=>jrnCloseEditor());
  await readyView(p,'home');await p.locator('[data-card-id="notes"] .home-card-destination').focus();await p.keyboard.press('Enter');await readyView(p,'notes');
  assert.deepEqual(await p.evaluate(snapshot),initial,'navigation and viewing must preserve sample records');
  await p.locator('[data-jrn="tab"][data-tab-id="timeline"]').click();
  if([320,390,1440].includes(width))await p.screenshot({path:path.join(root,`temp-analysis/improvements-journal-${width}-${theme}.png`)});
  // Five phone tabs plus Journal's separate Home/sidebar destination must all land correctly.
  for(const view of ['home','budget','log','food','stats','notes'])await readyView(p,view);
  if(width<1024){await readyView(p,'home');await p.locator('#header-menu').click();await p.locator('#side-menu-list [data-nav-quick="notes"]').click();await readyView(p,'notes');}
  if(width>=1024){await p.locator('#ds-nav [data-nav-quick="notes"]').click();await readyView(p,'notes');const gap=await p.evaluate(()=>document.querySelector('#ds-nav .nv-quick-label').getBoundingClientRect().top-document.querySelector('.ds-logo .wordmark').getBoundingClientRect().bottom);assert.ok(gap>=28,'brand needs breathing room');}
  if(width===390&&theme==='dark'){
   await readyView(p,'stats');
   const swipe=async direction=>p.evaluate(direction=>{const el=document.querySelector('.swipe-panel.deck-active'),r=el.getBoundingClientRect(),a=direction==='next'?.85:.15,b=1-a,y=r.top+100;
    const event=(type,x)=>{const touch=new Touch({identifier:1,target:el,clientX:r.left+r.width*x,clientY:y});return new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[touch],changedTouches:[touch]});};
    el.dispatchEvent(event('touchstart',a));el.dispatchEvent(event('touchmove',b));el.dispatchEvent(event('touchend',b));},direction);
   await swipe('next');assert.equal(await p.evaluate(()=>S.view),'stats','Stats remains the last phone tab');
   await swipe('previous');await p.waitForFunction(()=>S.view==='food');
   await readyView(p,'home');await readyView(p,'notes');await p.goBack();await p.waitForFunction(()=>S.view==='home');await p.goForward();await p.waitForFunction(()=>S.view==='notes');
   const count=await p.evaluate(()=>jrnEntries().length);
   await p.evaluate(()=>jrnOpenEditor(null,'entry'));await p.locator('#jrn-ed-body').fill('Sample reflection kept while resizing.');
   await p.waitForFunction(()=>jrnEntries().some(n=>n.body==='Sample reflection kept while resizing.'));
   const id=await p.evaluate(()=>jrnEdRec().id);
   await p.setViewportSize({width:1440,height:950});await p.waitForFunction(()=>document.getElementById('jrn-editor').classList.contains('inline'));
   assert.equal(await p.locator('#jrn-ed-body').inputValue(),'Sample reflection kept while resizing.');
   await p.setViewportSize({width:390,height:950});await p.waitForFunction(()=>!document.getElementById('jrn-editor').classList.contains('inline'));
   assert.deepEqual(await p.evaluate(id=>[jrnEntries().length,jrnEdRec().id,loadNotes().find(n=>n.id===id).body],id),[count+1,id,'Sample reflection kept while resizing.']);
   await p.evaluate(()=>jrnCloseEditor());
  }
  await readyView(p,'home');
  if([320,390,1440].includes(width))await p.locator('.home-weather-card').screenshot({path:path.join(root,`temp-analysis/improvements-weather-${width}-${theme}.png`)});
  // A blank card area and the old header-control position now use the same native link.
  for(const [id,view] of [['prs','stats'],['weight','stats'],['kitchen','food'],['finance','budget'],['balance','budget'],['recent','log'],['review','stats']]){
   const a=p.locator('[data-card-id="'+id+'"] .home-card-destination');if(!await a.count())continue;
   await a.click({position:{x:20,y:20}});
   if(id==='review'){assert.equal(await p.locator('#wr-modal').isVisible(),true);await p.evaluate(()=>closeWeekReviewModal());}
   else assert.equal(await p.evaluate(()=>S.view),view,id+' destination');
   await readyView(p,'home');
  }
  await p.evaluate(()=>{homeEditMode=true;applyHomeEditMode();});
  assert.equal(await p.locator('[data-card-id="notes"] .home-card-destination').getAttribute('tabindex'),'-1');
  await p.evaluate(()=>{homeEditMode=false;applyHomeEditMode();});
  await readyView(p,'budget');await p.evaluate(()=>{currentWeekIdx=-3;budPeriodOffset=-2;budPeriodSelected='old';setBudgetView('overview');});
  await p.locator('.bov-act-lead').click();
  assert.deepEqual(await p.evaluate(()=>[budgetView,currentWeekIdx,budPeriodOffset,budPeriodSelected]),['week',0,0,'']);
  await p.evaluate(()=>openTxnModal());
  assert.equal(await p.locator('#txn-essential').isChecked(),false);
  assert.equal(await p.locator('#txn-essential').evaluate(e=>e.getBoundingClientRect().top<document.getElementById('txn-merchant').getBoundingClientRect().top),true,'essential must be easy to find');
  await p.locator('#txn-amount').fill('7.50');await p.locator('#txn-merchant').fill('Sample laundry');await p.locator('#txn-essential').check();
  await p.locator('#txn-account').selectOption('');
  const accountsBefore=await p.evaluate(()=>JSON.stringify(loadAccounts()));
  await p.locator('#txn-save-btn').click();
  await p.waitForFunction(()=>txnData.some(t=>t.merchant==='Sample laundry'&&t.essential===true));
  const id=await p.evaluate(()=>txnData.find(t=>t.merchant==='Sample laundry').id);
  assert.equal(await p.evaluate(()=>JSON.stringify(loadAccounts())),accountsBefore,'tagging must not adjust account balances');
  await p.evaluate(id=>openTxnModal({id}),id);assert.equal(await p.locator('#txn-essential').isChecked(),true);
  await p.locator('#txn-essential').uncheck();await p.locator('#txn-save-btn').click();
  assert.equal(await p.evaluate(id=>'essential' in txnData.find(t=>t.id===id),id),false);
  assert.equal(await p.evaluate(()=>txnData.filter(t=>t.merchant==='Sample laundry').length),1);
  await p.evaluate(()=>openTxnModal());assert.equal(await p.locator('#txn-essential').isChecked(),false);await p.evaluate(()=>closeTxnModal());
  assert.deepEqual(errors,[],width+' '+theme+' browser errors');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'page overflow');
  console.log('PASS',width,theme);await context.close();
 }
}finally{await Promise.race([b.close(),new Promise(r=>setTimeout(r,5000))]);server.close();}})().then(()=>process.exit(0),e=>{console.error(e);server.close();process.exit(1);});
