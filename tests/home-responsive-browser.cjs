// Synthetic Firebase/localStorage only. Run with the same Playwright runtime as the Finance suites.
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  const target=path.resolve(root,decodeURIComponent(req.url.split('?')[0]).slice(1));
  if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(target,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':types[path.extname(target)]||'text/plain','Content-Security-Policy':"connect-src 'self'"});res.end(err?'Missing':data);});
});
const snapshot=()=>Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).map(k=>[k,localStorage.getItem(k)]));
let chartSource;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const width of [320,390,768,1023,1024,1280,1440,1920])for(const theme of ['dark','light']){
   const context=await browser.newContext({viewport:{width,height:950},timezoneId:'Australia/Sydney',reducedMotion:'reduce'});
   // Keep fonts and APIs deterministic; reuse the app's pinned Chart dependency across contexts.
   await context.route('**/*',async r=>{
    const url=new URL(r.request().url());if(url.hostname==='127.0.0.1')return r.continue();
    if(url.href==='https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js'){
      if(!chartSource)chartSource=r.fetch().then(response=>response.body());
      return r.fulfill({body:await chartSource,contentType:'application/javascript'});
    }
    return r.abort();
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port+'/tests/sync-browser.html?preview&ui=journal&finance-links');
   await page.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady);
   // The Finance fixture opens Accounts after load. Wait for that launch before opening Home.
   await page.waitForFunction(()=>S.view==='budget'&&budgetView==='accounts');
   await page.evaluate(()=>document.fonts.ready);
   await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}'});
   await page.evaluate(theme=>{
    obDismiss();dailyUpdateDismiss();S.theme=theme;applyTheme();
    saveHomeLayout({order:['notes','budget','weather','review','session'],hidden:['streak','prs'],updatedAt:12},'mobile');
    saveHomeLayout({order:['weather','session','notes','budget','review'],hidden:['weight','streak'],wide:['session','notes'],composition:'grid',dashboard:{main:['budget','notes'],summary:['weather','session']}},'desktop');
    const now=Date.now(),today=localMidnight(getLocalDate()).getTime();
    const sample={city:'Synthetic city',tempC:22,feelsC:20,tmax:24,tmin:14,code:1,isDay:1,placeholder:true,lat:-33.8,lon:151.2,timezone:'Australia/Sydney',fetchedAt:now,observedAt:now,
      daily:Array.from({length:7},(_,i)=>({time:today+i*864e5,tempMax:22+i,tempMin:14+i,code:1,rainProbability:30})),
      hourly:Array.from({length:6},(_,i)=>({time:now+(i+1)*36e5,tempC:22-i,code:1,isDay:1,rainProbability:30,precipitation:0}))};
    weatherCancelRequest();loadWeatherCache=()=>sample;weatherEnsureFresh=()=>Promise.resolve();
    weatherRefresh=()=>{renderWeatherInto(sample);return Promise.resolve(false);};
    window.homeWeatherSample=sample;setView('home');
   },theme);
   const before=await page.evaluate(snapshot);
   const expected=await page.evaluate(()=>effectiveHomeWidgetIds({session:1,budget:1,weather:1,notes:1,review:1,calories:1,weight:1,prs:1,streak:1,finance:1,balance:1,tiles:1,kitchen:1,habits:1,recent:1,manhua:1},layoutMode()));
   const actual=await page.locator('#home-content [data-card-id]').evaluateAll(a=>a.map(e=>e.dataset.cardId));
   assert.deepEqual(actual,expected.filter(id=>actual.includes(id)),'saved order changed');
   const mode=width>=1024?'desktop':'mobile';
   if(mode==='mobile'){
    assert.equal(await page.locator('.home-widget').count(),0);
    assert.equal(await page.locator('.home-mega.home-brief').count(),1);
    assert.equal(await page.locator('[data-embedded-widget="budget"]').count(),0);
    assert.equal(await page.locator('.home-phone-customise').isVisible(),true);
    assert.ok((await page.locator('.home-brief-body').boundingBox()).height<220,'phone training became a tall desktop panel');
    assert.ok((await page.locator('.home-budget-card').boundingBox()).height<360,'phone Budget has a fixed desktop footprint');
   }else{
    assert.equal(await page.locator('.home-widget').count(),2);
    assert.equal(await page.locator('[data-embedded-widget="budget"]').count(),1);
    assert.equal(await page.locator('.home-phone-customise').isVisible(),false);
    assert.equal(await page.locator('.home-training-body>.home-overview-tools').count(),1);
    assert.equal(await page.locator('.home-training-body').evaluate(e=>e.scrollHeight<=e.clientHeight+1),true,'ordinary combined card needs internal scrolling');
    assert.equal(await page.locator('.home-mega,.home-brief,.home-desktop-overview').count(),0);
    assert.ok((await page.locator('.home-widget-session').boundingBox()).height>=360);
    assert.equal((await page.locator('.home-widget-weather').boundingBox()).height,360);
   }
   assert.equal(await page.locator('#home-weather-forecast-toggle').getAttribute('aria-expanded'),mode==='mobile'?'true':'false');
   if(mode==='desktop')await page.locator('#home-weather-forecast-toggle').click();
   for(const state of ['fresh','stale','long error']){
    await page.evaluate(state=>{
      homeWeatherSample.fetchedAt=Date.now()-(state==='fresh'?0:5*36e5);
      _weatherStatus={state:state==='fresh'?'idle':'error',message:state==='fresh'?'':'Could not refresh weather'};
      renderWeatherInto(homeWeatherSample);
      if(state==='long error'){
        const notice=document.getElementById('home-weather-notice');notice.hidden=false;notice.textContent='A long connection error which must stay above the forecast. '.repeat(12);
        document.getElementById('home-weather-refresh').hidden=false;document.getElementById('home-weather-location').hidden=false;
      }
    },state);
    for(const period of ['week','today']){
      await page.locator('#home-weather-'+period).click();
      assert.equal(await page.locator('.weather-hour').count(),period==='week'?7:6);
      const geometry=await page.evaluate(()=>{const r=e=>{const b=e.getBoundingClientRect();return {l:b.left,r:b.right,t:b.top,b:b.bottom}};return {card:r(document.querySelector('.home-weather-card')),feedback:r(document.querySelector('.weather-feedback')),forecast:r(document.getElementById('home-weather-hours')),days:[...document.querySelectorAll('.weather-hour')].map(r)};});
      assert.ok(geometry.forecast.t>=geometry.feedback.b-1,'forecast overlaps status');
      for(const day of geometry.days)assert.ok(day.l>=geometry.card.l-1&&day.r<=geometry.card.r+1,'forecast clipped');
    }
   }
   await page.evaluate(()=>{renderHome();renderHome();});
   assert.deepEqual(await page.evaluate(snapshot),before,'render or forecast wrote saved records');
   const edges=await page.evaluate(()=>{
    const originalLayout=homeLayout,originalMoney=budPeriodMoney;
    try{
      for(let mask=0;mask<8;mask++){
        homeLayout=mode=>{const l=originalLayout(mode);return {...l,hidden:l.hidden.filter(id=>!['session','budget','weather'].includes(id)).concat(['session','budget','weather'].filter((id,i)=>!(mask&(1<<i))))};};
        renderHome();
        const ids=[...document.querySelectorAll('#home-content [data-card-id]')].map(e=>e.dataset.cardId);
        const mobile=layoutMode()==='mobile';
        ['session','weather'].forEach(id=>{const i=['session','budget','weather'].indexOf(id);if((mobile?document.querySelectorAll('[data-hero-section="'+id+'"]').length:ids.filter(x=>x===id).length)!==(mask&(1<<i)?1:0))throw Error('Hidden flag ignored '+id);});
        if(document.querySelectorAll('#home-content .home-budget-card').length!==(mask&2?1:0))throw Error('Budget repeated or hidden incorrectly');
        if(document.querySelectorAll('[data-embedded-widget="budget"]').length!==(!mobile&&(mask&3)===3?1:0))throw Error('Budget grouping ignored visibility');
        if(mobile?!document.querySelector('.home-phone-customise'):document.querySelectorAll('#home-content .home-customise-action').length!==1)throw Error('Customise control lost');
      }
      homeLayout=originalLayout;
      const m=originalMoney();
      if(m){budPeriodMoney=()=>({...m,available:null,incomplete:true});renderHome();if(layoutMode()==='desktop'?!document.querySelector('.home-budget-review')?.textContent.includes('Check your budget dates'):!document.querySelector('.home-budget-card .card-fig')?.textContent.includes('—'))throw Error('Unknown budget lost');}
      budPeriodMoney=()=>null;if(!budPeriodHomeCard().includes('Set up budget'))throw Error('Setup missing');
    }finally{homeLayout=originalLayout;budPeriodMoney=originalMoney;renderHome();}
    return document.documentElement.scrollWidth<=innerWidth;
   });assert.equal(edges,true);assert.deepEqual(await page.evaluate(snapshot),before);
   await page.locator(mode==='mobile'?'.home-brief-action':'.home-training-action').click();assert.equal(await page.evaluate(()=>S.view),'log');await page.evaluate(()=>setView('home'));
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.locator('#home-content .home-budget-add-labelled').click();await page.locator('#txn-modal').waitFor({state:'visible'});await page.evaluate(()=>closeTxnModal());
   await page.locator('.home-budget-destination').click();assert.equal(await page.evaluate(()=>S.view),'budget');await page.evaluate(()=>setView('home'));
   await page.evaluate(()=>openSettingsSection('homelayout'));
   await page.waitForSelector('[data-hl-widget="session"]');
   for(const id of ['session','weather'])assert.equal(await page.locator('[data-hl-widget="'+id+'"] .hl-order-actions button').count(),mode==='mobile'?0:2);
   assert.equal(await page.locator('[data-hl-widget="budget"] .hl-order-actions button').count(),mode==='mobile'?2:0);
   await page.evaluate(mode=>homeWidgetMove(mode==='mobile'?'budget':'session',-1,mode),mode);
   assert.deepEqual(await page.evaluate(snapshot),before,'layout draft saved without Apply');
   await page.evaluate(mode=>homeLayoutCancel(mode,true),mode);
   assert.deepEqual(await page.evaluate(snapshot),before,'Cancel changed saved data');
   await page.evaluate(()=>{closeSettingsSection();setView('home');});
   if(width===1440){
    const changed=await page.evaluate(()=>{const l=homeLayout('desktop');l.composition='dashboard';saveHomeLayout(l,'desktop');renderHome();return JSON.stringify(homeLayouts());});
    assert.deepEqual(await page.locator('[data-dash-col="main"] [data-card-id]').evaluateAll(a=>a.map(e=>e.dataset.cardId)).then(a=>a.slice(0,1)),['notes']);
    assert.deepEqual(await page.locator('[data-dash-col="summary"] [data-card-id]').evaluateAll(a=>a.map(e=>e.dataset.cardId)).then(a=>a.slice(0,2)),['weather','session']);
    const shared=await page.locator('.home-widget-session').innerHTML();
    await page.setViewportSize({width:390,height:950});await page.waitForFunction(()=>layoutMode()==='mobile');
    assert.equal(await page.locator('.home-widget-session').count(),0);
    assert.equal(await page.locator('.home-mega.home-brief').count(),1);
    assert.equal(await page.locator('[data-embedded-widget="budget"]').count(),0);
    await page.setViewportSize({width:1440,height:950});await page.waitForFunction(()=>layoutMode()==='desktop');
    assert.equal(await page.locator('.home-widget-session').innerHTML(),shared);
    assert.equal(await page.evaluate(()=>JSON.stringify(homeLayouts())),changed,'resizing overwrote layout choices');
   }
   assert.deepEqual(errors,[]);console.log(width,theme,'compact phone / preserved desktop Home passed');await context.close();
  }
 }finally{
  // Chrome can stall while closing on Windows after every assertion has finished.
  await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,5000))]);server.close();
 }
})().then(()=>process.exit(0),e=>{console.error(e);server.close();process.exit(1);});
