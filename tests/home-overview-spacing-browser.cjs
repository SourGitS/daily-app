// Combined Home geometry, using production fonts and isolated sample records only.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,decodeURIComponent(req.url.split('?')[0]).slice(1));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Security-Policy':"connect-src 'self'"});res.end(err?'Missing':data);});});
const snapshot=()=>Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).map(k=>[k,localStorage.getItem(k)]));
let chartSource;
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const width of (process.env.OVERVIEW_WIDTHS||'1024,1100,1280,1440,1920').split(',').map(Number))for(const theme of ['dark','light']){
  const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'Australia/Sydney',reducedMotion:'reduce'});
  await context.route('**/*',async r=>{const url=new URL(r.request().url());if(url.hostname==='127.0.0.1'||['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname)||(url.hostname==='cdn.jsdelivr.net'&&url.pathname.startsWith('/npm/@tabler/icons-webfont@3.24.0/')))return r.continue();if(url.href==='https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js'){if(!chartSource)chartSource=r.fetch().then(response=>response.body());return r.fulfill({body:await chartSource,contentType:'application/javascript'});}return r.abort();});
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:'+server.address().port+'/tests/sync-browser.html?preview&ui=journal&finance-links&accent=006CCF');
  await p.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady&&S.view==='budget'&&budgetView==='accounts');
  await p.evaluate(theme=>{obDismiss();dailyUpdateDismiss();profileData.budgetRhythmSeen=2;S.theme=theme;applyTheme();weatherCancelRequest();weatherEnsureFresh=()=>Promise.resolve(false);window.spacingOriginalMoney=budPeriodMoney;window.spacingOriginalViewed=budPeriodViewed;window.spacingMoney=budPeriodMoney();setView('home');},theme);
  await p.evaluate(()=>document.fonts.ready);await p.addStyleTag({content:'*,*:before,*:after{animation:none!important;transition:none!important}'});
  for(const composition of ['grid','dashboard']){
   await p.evaluate(composition=>{const l=homeLayout('desktop');saveHomeLayout({...l,composition,wide:['session'],hidden:[],dashboard:{main:['session'],summary:['weather','budget']}},'desktop');renderHome();},composition);
   const before=await p.evaluate(snapshot);
   for(const state of ['normal','over budget','no goal','unknown','setup']){
    await p.evaluate(state=>{budPeriodViewed=state==='setup'?()=>null:spacingOriginalViewed;budPeriodMoney=()=>state==='setup'?null:{...spacingMoney,available:state==='unknown'?null:state==='over budget'?-42.5:607.44,income:1279,spent:371.48,incomplete:state==='unknown',record:{...spacingMoney.record,goal:state==='no goal'?0:450}};renderHome();},state);
    if(state==='normal')await p.evaluate(()=>{document.getElementById('hero-day-name').textContent='FBD1';document.getElementById('hero-meta').textContent='6 exercises';});
    const g=await p.evaluate(()=>{const host=document.querySelector('.home-card-combined'),card=host.querySelector('.home-widget-session'),body=card.querySelector('.home-training-body'),tools=card.querySelector('.home-customise-action'),budget=card.querySelector('.home-training-budget'),heading=budget.querySelector('.card-hd'),a=card.querySelector('.home-training-action'),b=budget.querySelector('.home-budget-add-labelled'),rect=e=>{const r=e.getBoundingClientRect();return {x:r.left,y:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};const style=e=>{const s=getComputedStyle(e);return Object.fromEntries(['fontFamily','fontSize','fontWeight','lineHeight','padding','borderRadius','borderWidth','backgroundColor','color','letterSpacing'].map(k=>[k,s[k]]));};return {aStyle:style(a),bStyle:style(b),host:rect(host),card:rect(card),body:rect(body),tools:rect(tools),budget:rect(budget),heading:rect(heading),a:rect(a),b:rect(b),overflow:[...card.querySelectorAll('*')].filter(e=>e.clientWidth&&e.scrollWidth>e.clientWidth+1).map(e=>e.className),hitTools:document.elementFromPoint(tools.getBoundingClientRect().left+15,tools.getBoundingClientRect().top+15)?.closest('button')===tools};});
    if(g.host.width>=560&&Math.abs(g.a.bottom-g.b.bottom)>1.1)console.log('alignment diagnostics',width,theme,composition,state,g);
    if(g.host.width>=560){assert.ok(g.heading.y<g.tools.bottom,'Budget heading must fill the header space');assert.ok(Math.abs(g.a.bottom-g.b.bottom)<1.1,'workout and expense actions must share their bottom edge');assert.ok(Math.abs(g.a.y-g.b.y)<1.1,'action buttons must share their top edge');}
    else assert.ok(g.budget.y>g.a.bottom,'narrow cards retain stacked sections');
    assert.ok(g.a.bottom<=g.body.bottom+1&&g.b.bottom<=g.body.bottom+1,'actions stay inside the blue section');
    assert.ok(Math.abs(g.a.width-g.b.width)<1.1&&Math.abs(g.a.height-g.b.height)<1.1,'paired buttons must have matching dimensions');
    assert.deepEqual(g.aStyle,g.bStyle,'paired buttons must have matching typography, padding and colours');
    assert.deepEqual(g.overflow,[],'card contents must fit');assert.equal(g.hitTools,true,'Customise remains above the budget card link');
    assert.equal(await p.locator('.home-training-budget .card-hd .tstat').count(),0,'status must not crowd the header');
    const status=p.locator('.home-budget-inline-status .tstat');
    assert.equal(await status.count(),['normal','over budget','no goal'].includes(state)?1:0);
    if(await status.count()){assert.equal(await status.textContent(),state==='over budget'?'Over budget':'On track');assert.deepEqual(await status.evaluate(e=>[getComputedStyle(e).backgroundColor,getComputedStyle(e).borderWidth,!!e.closest('.home-budget-totals')]),['rgba(0, 0, 0, 0)','0px',true]);}
    assert.equal(await p.locator('.home-customise-action').getAttribute('aria-label'),'Customise Home');
    assert.equal(await p.locator('.home-customise-action svg').count(),1);
    assert.equal(g.tools.width,44);assert.equal(g.tools.height,44);
    assert.equal(await p.locator('.home-training-strip').count(),1);assert.deepEqual(await p.evaluate(snapshot),before,'presentation must not save records');
    if(state==='normal'&&composition==='dashboard'&&width>=1440)await p.locator('.home-card-combined').screenshot({path:path.join(root,`temp-analysis/overview-spacing-${width}-${theme}.png`)});
   }
   await p.evaluate(()=>{budPeriodMoney=spacingOriginalMoney;budPeriodViewed=spacingOriginalViewed;renderHome();});
   await p.locator('.home-training-action').click();assert.equal(await p.evaluate(()=>S.view),'log');await p.evaluate(()=>setView('home'));
   await p.locator('.home-training-budget .home-budget-add-labelled').click();await p.locator('#txn-modal').waitFor({state:'visible'});await p.evaluate(()=>closeTxnModal());
   await p.locator('.home-customise-action').click();await p.locator('[data-hl-widget="session"]').waitFor();await p.evaluate(()=>{closeSettingsSection();setView('home');});
   assert.deepEqual(await p.evaluate(snapshot),before,'actions and cancel must preserve records');
  }
  assert.deepEqual(errors,[]);console.log('PASS overview spacing',width,theme);await context.close();
 }
}finally{await Promise.race([browser.close(),new Promise(r=>setTimeout(r,5000))]);server.close();}})().then(()=>process.exit(0),e=>{console.error(e);server.close();process.exit(1);});
