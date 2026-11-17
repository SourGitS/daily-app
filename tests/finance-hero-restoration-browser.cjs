// The v462 budget hero remains independent of the additional dated-money report.
// All records, accounts and requests below belong to the isolated synthetic fixture.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {plannerFixture,plannerSampleFiles,fixtureURL}=require('./planner-browser-fixture.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'temp-analysis/finance-hero-restoration');
fs.mkdirSync(output,{recursive:true});
const heroFunction=source=>source.replace(/\r\n/g,'\n').match(/function budOvHeroHtml\(m\)\{[\s\S]*?\n\}/)[0];
const originalHero=heroFunction(execFileSync('git',['show','25c70c0:js/app.js'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}));
assert.equal(heroFunction(fs.readFileSync(path.join(root,'js/app.js'),'utf8')),originalHero,'keep the original released hero template');
const snapshot=()=>({records:JSON.stringify([txnData,ledgerData,budgetData,loadAccounts()]),stores:Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).filter(k=>/daily_budget|daily_accounts|daily_ledger|daily_transactions/.test(k)&&!/collapse|_ui/.test(k)).sort().map(k=>[k,localStorage.getItem(k)]))});
const heroSnapshot=()=>{const hero=document.querySelector('#budget-overview-view>.bov-position');return {html:hero.outerHTML,text:hero.textContent,range:hero.querySelector('.bov-hero-range').textContent};};
async function expectOriginalHero(page){
 const result=await page.evaluate(code=>{
  const p=budPeriodMoney(),m=p?budPeriodOverviewMoney(p):Object.assign({monday:getMondayOf(0),key:weekKey(getMondayOf(0))},budWeekMoney(budCurrentWeekBasis(),weekKey(getMondayOf(0))));
  const original=(0,eval)('('+code+')'),holder=document.createElement('div');holder.innerHTML=original(m);
  const hero=document.querySelector('#budget-overview-view>.bov-position');
  return {actual:hero.outerHTML,expected:holder.firstElementChild.outerHTML,available:m.available,spent:m.spent,committed:m.committed,saved:m.saved,range:hero.querySelector('.bov-hero-range').textContent};
 },originalHero);
 assert.equal(result.actual,result.expected,'render the original hero with the current budget model');
 return result;
}
(async()=>{
 for(const [engine,type,launch] of [['chrome',chromium,{channel:'chrome',headless:true}],['webkit',webkit,{headless:true}]].filter(([name])=>!process.env.DAILY_HERO_BROWSER||process.env.DAILY_HERO_BROWSER===name)){
  const browser=await type.launch(launch);
  try{
   for(const width of [320,390,844,1024,1440].filter(n=>!process.env.DAILY_HERO_WIDTH||Number(process.env.DAILY_HERO_WIDTH)===n))for(const theme of ['dark','light'].filter(n=>!process.env.DAILY_HERO_THEME||process.env.DAILY_HERO_THEME===n)){
    const context=await browser.newContext({viewport:{width,height:width===844?390:950},isMobile:width<1024,hasTouch:width<1024,timezoneId:'Australia/Sydney',reducedMotion:'reduce',serviceWorkers:'block'});
    await plannerFixture()(context);
    if(width===844){const sample=plannerSampleFiles();await context.route('**/*.css',route=>{const url=new URL(route.request().url()),file=sample(url.pathname.slice(1));return file?route.fulfill({...file,body:file.body.toString().replace(/\(-webkit-touch-callout:\s*none\)/g,'(display: block)')}):route.fulfill({status:404,body:''});});}
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    if(engine==='chrome'&&width===844){const client=await context.newCDPSession(page);await client.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,screenWidth:844,screenHeight:390,deviceScaleFactor:2,mobile:true,screenOrientation:{type:'landscapePrimary',angle:90}});await client.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:0,left:47,right:47,bottom:21}});}
    await page.goto(fixtureURL+'?preview&finance-links&overview&ui=journal');await page.getByText(/Local preview · sample money only/).waitFor();
    const dates=await page.evaluate(theme=>{
     S.theme=theme;applyTheme();const today=getLocalDate(),start=budDateAdd(today,-3),previous=budDateMonth(today.slice(0,8)+'01',-1),cat=loadVarCats()[0]?.id||'food';
     saveAccounts([{id:'hero-cash',name:'Cash sample',type:'asset',category:'cash',current:2000,history:[{date:today,balance:2000}]}]);
     saveFixCats([{id:'hero-rent',name:'Rent sample',amount:100,cycle:'weekly',chargeType:'bill',dueDate:budDateAdd(today,2)}]);
     txnData=[{id:'hero-current',date:today,amount:100,catId:cat,merchant:'Current purchase'},{id:'hero-earlier',date:budDateAdd(start,-5),amount:60,catId:cat,merchant:'Earlier this month'},{id:'hero-last-month',date:budDateAdd(previous,2),amount:9.99,catId:cat,merchant:'Last month purchase'}];
     ledgerData=[{id:'hero-income',kind:'income',date:start,amount:1000},{id:'hero-bill',kind:'bill_payment',date:budDateAdd(today,-1),amount:25,fixCatId:'hero-rent'},{id:'hero-savings',kind:'savings',date:today,amount:10}];budgetData={};
     const config={frequency:'fortnightly',anchor:start},p=budPeriodRange(config,today,0),record={start:p.start,end:p.end,fundingConfirmed:true,allocationsReviewed:true,opening:20,reserves:{'hero-rent':100},savings:50,goal:300};
     localStorage.setItem('daily_transactions',JSON.stringify(txnData));localStorage.setItem('daily_ledger',JSON.stringify(ledgerData));localStorage.setItem('daily_budget','{}');localStorage.setItem('daily_budget_cycles',JSON.stringify({config,periods:{[p.id]:record}}));
     budPeriodSelected='';budPeriodOffset=0;budOvMoneyRange={preset:'month',from:'',to:''};openBudgetOverview();return {today,start,previous};
    },theme);
    const before=await page.evaluate(snapshot),view=page.locator('#budget-overview-view'),hero=view.locator(':scope>.bov-position');
    const money=view.locator(':scope>.money-dashboard'),attention=view.locator(':scope>.bov-attention');
    assert.equal(await hero.count(),1);assert.equal(await money.count(),1);assert.equal(await view.locator('.money-budget').count(),0,'no duplicate collapsed budget card');
    assert.equal(await attention.locator('.card').count(),1,'the upcoming rent supplies a real attention state');
    const order=await view.evaluate(e=>Array.from(e.children).map(n=>n.className||n.id));
    assert.deepEqual(order.slice(0,3),['bov-position','bov-attention','money-dashboard'],'hero then attention then Your money');
    assert.equal(await view.evaluate(e=>e.querySelector('.bov-position').getBoundingClientRect().bottom<=e.querySelector('.bov-attention').getBoundingClientRect().top+1),true);
    assert.equal(await view.evaluate(e=>e.querySelector('.bov-attention').getBoundingClientRect().bottom<=e.querySelector('.money-dashboard').getBoundingClientRect().top+1),true);
    const expected=await expectOriginalHero(page);assert.equal(expected.available,770);assert.equal(expected.spent,125);assert.equal(expected.committed,75);assert.equal(expected.saved,50);
    assert.equal(await hero.locator('.hm-val').innerText(),'$770');assert.equal(await hero.getByRole('button',{name:'Add expense',exact:true}).isVisible(),true);
    const original=await page.evaluate(heroSnapshot),picker=page.locator('#bov-range-preset');
    await picker.selectOption('last-month');assert.equal(await money.locator('[data-money-metric="spent"] strong').innerText(),'$9.99');assert.deepEqual(await page.evaluate(heroSnapshot),original,'calendar presets cannot change the budget hero');
    await picker.selectOption('custom');await page.locator('#bov-range-from').fill(dates.today);await page.locator('#bov-range-to').fill(dates.today);await money.getByRole('button',{name:'Apply dates',exact:true}).click();
    assert.equal(await money.locator('[data-money-metric="spent"] strong').innerText(),'$100');assert.deepEqual(await page.evaluate(heroSnapshot),original,'custom dates cannot change hero amounts or budget dates');
    await hero.getByRole('button',{name:'Add expense',exact:true}).click();assert.equal(await page.locator('#txn-modal').isVisible(),true);assert.equal(await page.locator('#txn-date').inputValue(),dates.today);
    await page.locator('#txn-modal').getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual(await page.evaluate(snapshot),before,'expense cancellation writes no finance records');
    await hero.getByRole('button',{name:/^Open budget/}).click();assert.equal(await page.evaluate(()=>budgetView),'week');
    await page.getByRole('tablist',{name:'Finance views',exact:true}).getByRole('tab',{name:'Overview',exact:true}).click();
    assert.deepEqual(await page.evaluate(heroSnapshot),original);assert.equal(await view.locator('.money-budget').count(),0);assert.deepEqual(await page.evaluate(snapshot),before,'opening Budget and returning to Overview writes no finance records');
    const overflow=await view.evaluate(e=>({page:document.documentElement.scrollWidth-innerWidth,view:e.scrollWidth-e.clientWidth,hero:e.querySelector('.bov-position').scrollWidth-e.querySelector('.bov-position').clientWidth}));
    assert.ok(Object.values(overflow).every(n=>n<=1),JSON.stringify({engine,width,theme,overflow}));
    if(theme==='dark'&&(width===390||width===1440)){await view.evaluate(e=>{let scroll=e.parentElement;while(scroll&&!(scroll.scrollHeight>scroll.clientHeight&&/auto|scroll/.test(getComputedStyle(scroll).overflowY)))scroll=scroll.parentElement;(scroll||document.scrollingElement).scrollTop=0;});await page.screenshot({path:path.join(output,engine+'-'+width+'-hero.png')});}
    if(width===390&&theme==='dark'){
     await page.evaluate(()=>{saveFixCats([]);renderBudgetOverview();});const emptyBefore=await page.evaluate(snapshot);
     assert.equal(await attention.locator('.card').count(),0,'the attention strip may be empty');await expectOriginalHero(page);
     await picker.selectOption('month');assert.equal(await money.locator('[data-money-metric="spent"] strong').innerText(),'$185');assert.deepEqual(await page.evaluate(snapshot),emptyBefore);
     await page.evaluate(()=>{ledgerData=[];localStorage.setItem('daily_ledger','[]');const store=budCyclesLoad(),p=budPeriodCurrent();store.periods[p.id]={...store.periods[p.id],opening:0,fundingConfirmed:false};localStorage.setItem('daily_budget_cycles',JSON.stringify(store));budOvMoneyRange={preset:'month',from:'',to:''};renderBudgetOverview();});
     const unfundedBefore=await page.evaluate(snapshot),unknown=await expectOriginalHero(page);assert.equal(unknown.available,null);assert.equal(await hero.locator('.hm-val').innerText(),'—');assert.equal(await hero.getByRole('button',{name:'Add expense',exact:true}).count(),0);assert.equal(await money.isVisible(),true);
     const unfundedHero=await page.evaluate(heroSnapshot);await picker.selectOption('last-month');assert.deepEqual(await page.evaluate(heroSnapshot),unfundedHero);assert.deepEqual(await page.evaluate(snapshot),unfundedBefore);
    }
    assert.deepEqual(errors,[]);console.log('PASS restored original hero, independent date report and actions',engine,width+'x'+(width===844?390:950),theme);await context.close();
   }
  }finally{await browser.close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
