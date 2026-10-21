// Isolated sample data. Keep transitions enabled: interrupted motion is the regression.
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,decodeURIComponent(req.url.split('?')[0]).slice(1));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream','Content-Security-Policy':"connect-src 'self'"});res.end(err?'Missing':data);});
});
const snapshot=()=>Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).map(k=>[k,localStorage.getItem(k)]));
const failures=[];
function check(value,message){if(!value)failures.push(message);}
let chartSource;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const sizes=process.env.BASELINE?[[390,844]]:[[320,700],[390,844],[430,932],[844,390]];
  for(const [width,height] of sizes)for(const theme of (process.env.BASELINE?['dark']:['dark','light'])){
   const label=width+'x'+height+' '+theme;
   const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1,timezoneId:'Australia/Sydney'});
   await context.route('**/*',async r=>{
    const url=new URL(r.request().url());if(url.hostname==='127.0.0.1')return r.continue();
    if(url.href==='https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js'){
     if(!chartSource)chartSource=r.fetch().then(response=>response.body());
     return r.fulfill({body:await chartSource,contentType:'application/javascript'});
    }
    return r.abort();
   });
   const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.goto('http://127.0.0.1:'+server.address().port+'/tests/sync-browser.html?preview&ui=journal&finance-links');
   await p.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady&&S.view==='budget'&&budgetView==='accounts');
   await p.evaluate(theme=>{
    obDismiss();dailyUpdateDismiss();profileData.budgetRhythmSeen=2;foodCatalogueState.seenThisSession=true;S.theme=theme;applyTheme();
    const now=Date.now(),today=localMidnight(getLocalDate()).getTime();
    const sample={city:'Synthetic city',tempC:22,feelsC:20,tmax:24,tmin:14,code:1,isDay:1,placeholder:true,lat:-33.8,lon:151.2,timezone:'Australia/Sydney',fetchedAt:now,observedAt:now,
     daily:Array.from({length:7},(_,i)=>({time:today+i*864e5,tempMax:22+i,tempMin:14+i,code:1,rainProbability:30})),
     hourly:Array.from({length:6},(_,i)=>({time:now+(i+1)*36e5,tempC:22-i,code:1,isDay:1,rainProbability:30,precipitation:0}))};
    weatherCancelRequest();loadWeatherCache=()=>sample;weatherEnsureFresh=()=>Promise.resolve();weatherRefresh=()=>Promise.resolve(false);
    window.touchWeather=sample;setView('home');renderWeatherInto(sample);
    window.touchRefreshes=0;refreshHomeTab=()=>{touchRefreshes++;};
    window.qaTouch=(type,dx=0,dy=0,count=1,selector='.swipe-panel.deck-active')=>{
     const el=document.querySelector(selector),r=el.getBoundingClientRect();
     const points=Array.from({length:count},(_,i)=>new Touch({identifier:i+1,target:el,clientX:r.left+200+dx+i*10,clientY:r.top+100+dy}));
     el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:/end|cancel/.test(type)?[]:points,changedTouches:points}));
    };
   },theme);
   await p.waitForTimeout(450);
   const before=await p.evaluate(snapshot);
   const home=async()=>{await p.evaluate(()=>{setView('home');renderWeatherInto(touchWeather);document.getElementById('view-home').scrollTop=0;});await p.waitForTimeout(400);};
   const aligned=()=>p.evaluate(()=>{
    const panel=document.querySelector('.swipe-panel.deck-active'),main=document.getElementById('app-main');
    return Math.abs(panel.getBoundingClientRect().left-main.getBoundingClientRect().left)<1&&!deckDragging&&!deckRaf&&!deckSnapH;
   });
   // A light tap or a vertical scroll must not strand an animated navigation halfway.
   for(const vertical of [false,true]){
    await home();await p.evaluate(()=>setView('budget'));await p.waitForTimeout(65);
    await p.evaluate(vertical=>{qaTouch('touchstart');if(vertical)qaTouch('touchmove',0,45);qaTouch('touchend',0,vertical?45:0);},vertical);
    await p.waitForTimeout(600);check(await aligned(),label+' interrupted snap ('+(vertical?'vertical':'tap')+')');
   }
   // Cancel and a second finger must restore the active page, never commit a swipe.
   for(const multi of [false,true]){
    await home();await p.evaluate(multi=>{qaTouch('touchstart');qaTouch('touchmove',-130);if(multi)qaTouch('touchstart',-130,0,2);qaTouch(multi?'touchend':'touchcancel',-130);},multi);
    await p.waitForTimeout(450);check(await p.evaluate(()=>S.view==='home'),label+' '+(multi?'multitouch':'cancel')+' changed tab');
    check(await aligned(),label+' cancelled gesture alignment');
   }
   // A text field on Finance uses an untransformed pager for the iOS caret. Touches must
   // retain that position and normal selection/editing instead of adding a second offset.
   await p.evaluate(()=>{setView('budget');const e=document.createElement('input');e.id='qa-text';e.value='Select these words';document.querySelector('#view-budget').prepend(e);e.focus();e.setSelectionRange(0,6);});
   await p.evaluate(()=>{qaTouch('touchstart',0,0,1,'#qa-text');qaTouch('touchmove',-90,0,1,'#qa-text');qaTouch('touchend',-90,0,1,'#qa-text');});
   await p.waitForTimeout(450);
   check(await p.evaluate(()=>S.view==='budget'&&deckTextInputMode&&document.getElementById('qa-text').selectionEnd===6),label+' editing/caret gesture changed page');
   check(await p.locator('#qa-text').evaluate(e=>getComputedStyle(e).userSelect==='text'),label+' editable field lost native selection');
   await p.locator('#qa-text').fill('Editing still works');
   await p.evaluate(()=>setView('log'));await p.waitForTimeout(450);
   check(await aligned(),label+' navigation from editing stacked offsets');
   await p.evaluate(()=>document.getElementById('qa-text').remove());await home();
   check(await p.locator('.home-brief').evaluate(e=>getComputedStyle(e).userSelect==='none'),label+' UI text remains selectable');
   // All forecast cells fit; no nested horizontal or vertical scroll area is needed on phone.
   for(const period of ['today','week']){
    await p.evaluate(period=>homeSetWeatherPeriod(period),period);await p.waitForTimeout(400);
    assert.equal(await p.locator('#home-weather-hours .weather-hour').count(),period==='today'?6:7,label+' forecast data');
    const boxes=await p.evaluate(()=>[document.querySelector('.home-weather-card'),...document.querySelectorAll('.home-weather-card *')].filter(e=>{
     const s=getComputedStyle(e);return (/auto|scroll/.test(s.overflowX)&&e.scrollWidth>e.clientWidth+1)||(/auto|scroll/.test(s.overflowY)&&e.scrollHeight>e.clientHeight+1);
    }).map(e=>({class:e.className,x:[e.clientWidth,e.scrollWidth],y:[e.clientHeight,e.scrollHeight]})));
    check(!boxes.length,label+' '+period+' weather scroll areas: '+JSON.stringify(boxes));
    check(await p.locator('#home-weather-hours').evaluate(e=>[...e.children].every(c=>{const r=c.getBoundingClientRect(),s=e.getBoundingClientRect();return r.left>=s.left-1&&r.right<=s.right+1;})),label+' forecast clipped');
   }
   // Native Chromium touch input (including generated clicks/cancellation), with real motion.
   const cdp=await context.newCDPSession(p);
   const native=async(start,end,cancel=false)=>{
    const send=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:/End|Cancel/.test(type)?[]:[{x,y,id:1}]});
    await send('touchStart',...start);
    for(let i=1;i<=8;i++){await send('touchMove',start[0]+(end[0]-start[0])*i/8,start[1]+(end[1]-start[1])*i/8);await p.waitForTimeout(16);}
    await send(cancel?'touchCancel':'touchEnd',...end);await p.waitForTimeout(450);
   };
   await home();
   const region=await p.locator('#view-home').boundingBox(),y=region.y+60;
   await native([region.x+region.width*.85,y],[region.x+region.width*.15,y]);
   check(await p.evaluate(()=>S.view==='budget'),label+' native swipe did not reach Finance');check(await aligned(),label+' native swipe alignment');
   // Repeated navigation and missing transitionend must still settle on the chosen panel.
   for(const view of ['stats','food','budget','home','log']){await p.evaluate(view=>setView(view),view);await p.waitForTimeout(35);}
   await p.waitForTimeout(500);check(await aligned(),label+' rapid nav alignment');
   await p.evaluate(()=>{setView('home');document.getElementById('swipe-deck').style.transition='none';});
   await p.waitForTimeout(500);check(await aligned(),label+' absent transitionend cleanup');
   await p.evaluate(()=>{qaTouch('touchstart');setView('notes');qaTouch('touchmove',-130,0,1,'#view-home');qaTouch('touchend',-130,0,1,'#view-home');});
   check(await p.evaluate(()=>S.view==='notes'),label+' stale touch escaped an overlay');await home();
   // Rotation during a drag cancels it rather than applying an obsolete starting offset.
   await p.evaluate(()=>{qaTouch('touchstart');qaTouch('touchmove',-90);});
   await p.setViewportSize({width:height,height:width});
   await p.evaluate(()=>qaTouch('touchend',-90));await p.waitForTimeout(450);
   check(await aligned(),label+' rotation during drag');
   await p.setViewportSize({width,height});await home();
   // Forecast gestures reach the pager, and vertical gestures scroll the whole Home page.
   const show=async selector=>{
    await p.evaluate(selector=>{const el=document.querySelector(selector),panel=document.getElementById('view-home');panel.scrollTop+=el.getBoundingClientRect().top-panel.getBoundingClientRect().top-65;pinDeckScroll();},selector);
    await p.waitForTimeout(100);return p.locator(selector).boundingBox();
   };
   await p.evaluate(()=>homeSetWeatherPeriod('today'));await p.waitForTimeout(400);
   const forecast=await show('#home-weather-hours');
   await native([forecast.x+forecast.width*.85,forecast.y+20],[forecast.x+forecast.width*.15,forecast.y+20]);
   check(await p.evaluate(()=>S.view==='budget'),label+' native forecast swipe blocked');check(await aligned(),label+' forecast swipe alignment');
   await home();await show('.home-weather-card');
   const scrollBefore=await p.locator('#view-home').evaluate(e=>e.scrollTop);
   const area=await p.locator('#view-home').boundingBox();
   await native([area.x+area.width*.5,area.y+area.height*.7],[area.x+area.width*.5,area.y+area.height*.25]);
   check(await p.locator('#view-home').evaluate((e,b)=>e.scrollTop>b,scrollBefore),label+' vertical Home scroll blocked');
   check(await p.evaluate(()=>S.view==='home'),label+' vertical scroll changed tab');
   // A stretched card remains tappable, while dragging across it only changes one tab.
   const link=await show('[data-card-id="notes"] .home-card-destination');
   await native([link.x+link.width*.85,link.y+30],[link.x+link.width*.15,link.y+30]);
   check(await p.evaluate(()=>S.view==='budget'),label+' card drag activated its link');
   await home();const tap=await show('[data-card-id="notes"] .home-card-destination');
   await p.touchscreen.tap(tap.x+tap.width/2,tap.y+30);await p.waitForTimeout(350);
   check(await p.evaluate(()=>S.view==='notes'),label+' card tap was swallowed after a swipe');
   // A short diagonal cancelled/returning swipe cannot accidentally pull to refresh.
   await home();await p.evaluate(()=>{qaTouch('touchstart');qaTouch('touchmove',50,90);qaTouch('touchcancel',50,90);});
   check(await p.evaluate(()=>touchRefreshes===0),label+' cancel refreshed Home');
   await p.evaluate(()=>{qaTouch('touchstart');qaTouch('touchmove',-100,10);qaTouch('touchmove',-20,100);qaTouch('touchend',-20,100);});
   check(await p.evaluate(()=>touchRefreshes===0),label+' diagonal page drag refreshed Home');
   await home();await p.evaluate(()=>{qaTouch('touchstart');qaTouch('touchmove',0,100);qaTouch('touchend',0,100);});
   check(await p.evaluate(()=>touchRefreshes===1),label+' deliberate pull-to-refresh stopped working');
   await home();
   if(width===320||width===390){
    await p.screenshot({path:path.join(root,`temp-analysis/mobile-touch-${width}-${theme}.png`)});
   }
   assert.deepEqual(await p.evaluate(snapshot),before,label+' gesture or forecast changed saved data');
   assert.deepEqual(errors,[],label+' browser errors');
   console.log('CHECKED',label);await context.close();assert.deepEqual(failures,[]);
  }
 }finally{await Promise.race([browser.close(),new Promise(r=>setTimeout(r,5000))]);server.close();}
 assert.deepEqual(failures,[]);
})().then(()=>process.exit(0),e=>{console.error(e);server.close();process.exit(1);});
