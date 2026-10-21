// The whole forecast must be visible, including in the desktop widget. Hiding a scrollbar
// or checking only column widths does not establish that the forecast fits.
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,decodeURIComponent(req.url.split('?')[0]).slice(1));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream','Content-Security-Policy':"connect-src 'self'"});res.end(err?'Missing':data);});
});
const snapshot=()=>Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).map(k=>[k,localStorage.getItem(k)]));
let chartSource;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const width of (process.env.WEATHER_WIDTHS||'320,390,768,1023,1024,1100,1280,1440,1920').split(',').map(Number))for(const theme of ['dark','light']){
   const context=await browser.newContext({viewport:{width,height:950},timezoneId:'Australia/Sydney',reducedMotion:'reduce'});
   await context.route('**/*',async r=>{
    const url=new URL(r.request().url());if(url.hostname==='127.0.0.1')return r.continue();
    // Load the production type and icon fonts: missing icons understate each row's height.
    if((url.hostname==='cdn.jsdelivr.net'&&url.pathname.startsWith('/npm/@tabler/icons-webfont@3.24.0/'))||['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return r.continue();
    if(url.href==='https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js'){
     if(!chartSource)chartSource=r.fetch().then(response=>response.body());
     return r.fulfill({body:await chartSource,contentType:'application/javascript'});
    }return r.abort();
   });
   const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.goto('http://127.0.0.1:'+server.address().port+'/tests/sync-browser.html?preview&ui=journal&finance-links');
   await p.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady&&S.view==='budget'&&budgetView==='accounts');
   await p.evaluate(theme=>{
    obDismiss();dailyUpdateDismiss();profileData.budgetRhythmSeen=2;S.theme=theme;applyTheme();
    const now=Date.now(),today=localMidnight(getLocalDate()).getTime();
    window.overflowWeather={city:'Sydney',tempC:22,feelsC:20,tmax:24,tmin:14,code:61,isDay:1,placeholder:false,lat:-33.8,lon:151.2,timezone:'Australia/Sydney',fetchedAt:now,observedAt:now,
     daily:Array.from({length:7},(_,i)=>({time:today+i*864e5,tempMax:22+i,tempMin:14+i,code:61,rainProbability:80})),
     hourly:Array.from({length:6},(_,i)=>({time:now+(i+1)*36e5,tempC:22-i,code:61,isDay:1,rainProbability:80,precipitation:1}))};
    weatherCancelRequest();loadWeatherCache=()=>overflowWeather;weatherEnsureFresh=()=>Promise.resolve(false);weatherRefresh=()=>Promise.resolve(false);
    _weatherStatus={state:'idle',message:''};setView('home');renderWeatherInto(overflowWeather);
   },theme);
   await p.evaluate(()=>document.fonts.ready);
   await p.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}'});
   for(const composition of (width>=1024?['dashboard','grid']:['mobile'])){
    if(width>=1024)await p.evaluate(composition=>{const l=homeLayout('desktop');saveHomeLayout({...l,composition},'desktop');renderHome();},composition);
    const before=await p.evaluate(snapshot);
    for(const state of ['fresh','stale','sample','long error','empty']){
     await p.evaluate(state=>{
      overflowWeather.fetchedAt=Date.now()-(state==='stale'||state==='long error'?5*36e5:0);
      overflowWeather.placeholder=state==='sample';
      _weatherStatus={state:state==='stale'||state==='long error'?'error':'idle',message:''};
      renderWeatherInto(overflowWeather);
      if(state==='long error'){
       const el=document.getElementById('home-weather-notice');el.hidden=false;el.textContent='Connection unavailable. Please retry when your network is back. '.repeat(12);
      }
     },state);
     for(const period of ['today','week']){
      await p.evaluate(({period,state})=>{
       homeSetWeatherPeriod(period);
       if(state==='empty'){
        const strip=document.getElementById('home-weather-hours');strip.hidden=true;
        const msg=document.getElementById('home-weather-forecast-empty');msg.hidden=false;msg.textContent='Forecast unavailable. Please try again.';
        document.getElementById('home-weather-forecast-retry').hidden=false;
       }
      },{period,state});
      await p.evaluate(()=>document.fonts.ready);
      if(state!=='empty')assert.ok(await p.locator('.weather-hour .ti').first().evaluate(e=>e.getBoundingClientRect().height>=18),'production weather icons must be loaded');
      const geometry=await p.evaluate(()=>{
       const card=document.querySelector('.home-weather-card'),preview=document.getElementById('home-weather-preview'),controls=card.querySelector('.weather-mobile-controls');
       const rect=e=>{const r=e.getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom,h:r.height};};
       const scroll=[card,...card.querySelectorAll('*')].filter(e=>{
        const s=getComputedStyle(e);return (/auto|scroll/.test(s.overflowX)&&e.scrollWidth>e.clientWidth+1)||(/auto|scroll/.test(s.overflowY)&&e.scrollHeight>e.clientHeight+1);
       }).map(e=>({class:e.className,client:[e.clientWidth,e.clientHeight],scroll:[e.scrollWidth,e.scrollHeight]}));
       return {scroll,card:rect(card),wrapper:rect(card.closest('.home-card')||card),preview:rect(preview),controls:rect(controls),feedback:rect(card.querySelector('.weather-feedback')),items:[...preview.querySelectorAll('.weather-hour>*,.weather-summary,.weather-forecast-empty,.weather-forecast-retry')].filter(e=>e.getClientRects().length).map(rect)};
      });
      const label=[width,theme,composition,state,period].join(' ');
      if(geometry.scroll.length){
       await p.locator('.home-weather-card').screenshot({path:path.join(root,'temp-analysis/weather-overflow-before.png')});
       console.log(label,JSON.stringify(geometry));
      }
      assert.deepEqual(geometry.scroll,[],label+' has an internal scrollbar');
      assert.ok(geometry.preview.t>=geometry.feedback.b-1,label+' overlaps feedback');
      for(const item of geometry.items){
       assert.ok(item.t>=geometry.preview.t-1&&item.b<=geometry.preview.b+1,label+' clips a forecast row');
       assert.ok(item.l>=geometry.card.l-1&&item.r<=geometry.card.r+1,label+' clips a forecast column');
       assert.ok(item.b<=geometry.controls.t+1,label+' hides a row behind controls');
      }
      assert.ok(geometry.controls.b<=geometry.card.b+1,label+' hides forecast controls');
      assert.ok(geometry.card.b<=geometry.wrapper.b+1,label+' escapes its Home layout slot');
      if(width===1440&&state==='fresh')assert.equal(geometry.card.h,360,label+' unnecessarily enlarged an ordinary card');
      if(width===1440&&theme==='dark'&&composition==='dashboard'&&state==='stale'&&period==='today'){
       await p.locator('.home-weather-card').screenshot({path:path.join(root,'temp-analysis/weather-overflow-after.png')});
      }
      await p.evaluate(()=>homeToggleWeatherForecast());
      assert.equal(await p.locator('#home-weather-forecast-toggle').getAttribute('aria-expanded'),'false');
      await p.evaluate(()=>homeToggleWeatherForecast());
     }
    }
    assert.deepEqual(await p.evaluate(snapshot),before,'forecast changed saved data');
   }
   assert.deepEqual(errors,[]);console.log('PASS weather',width,theme);await context.close();
  }
 }finally{await Promise.race([browser.close(),new Promise(r=>setTimeout(r,5000))]);server.close();}
})().then(()=>process.exit(0),e=>{console.error(e);server.close();process.exit(1);});
