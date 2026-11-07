// Synthetic records only. Covers the merged panes retaining data, dates and state through
// recalculation, collapse and resizing, plus schedule recovery and historical periods.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const path=require('node:path'),http=require('node:http'),fs=require('node:fs');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1));
 if(!file.startsWith(root+path.sep)){res.writeHead(404).end();return;}
 fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':mime[path.extname(file)]||'text/plain','Cache-Control':'no-store','Content-Security-Policy':"connect-src 'self'"});res.end(error?'Missing':data);});
});
const snapshot=()=>Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).filter(k=>/daily_budget|daily_ledger|daily_transactions|daily_accounts/.test(k)&&!/collapse|_ui/.test(k)).map(k=>[k,localStorage.getItem(k)]));
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const width of [320,390,1024,1440])for(const theme of ['dark','light']){
   const context=await browser.newContext({viewport:{width,height:950},timezoneId:'Australia/Sydney',reducedMotion:'reduce'});
   await context.route(/firebaseio\.com|cloudfunctions\.net|open-meteo\.com/,r=>r.abort());
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port+'/tests/sync-browser.html?preview&ui=journal&period&accent=385c72');
   await page.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady);
   await page.evaluate(theme=>{
    obDismiss();dailyUpdateDismiss();S.theme=theme;applyTheme();
    const today=getLocalDate(),start=budDateAdd(today,-1),end=budDateAdd(today,12);
    budgetData={};txnData=[];ledgerData=[
     {id:'money-income',kind:'income',date:today,amount:900,note:'Pay received',streamId:'pay',manual:true},
     {id:'money-savings',kind:'savings',date:today,amount:120,note:'Emergency fund',manual:true}
    ];
    saveFixCats([
     {id:'gym',name:'Gym sample',amount:20,cycle:'weekly',chargeType:'subscription',dueDate:today},
     {id:'cover',name:'Insurance sample',amount:120,cycle:'monthly',chargeType:'bill',dueDate:budDateAdd(today,1)},
     {id:'annual',name:'Annual sample',amount:365,cycle:'yearly',chargeType:'bill',dueDate:budDateAdd(today,5)}
    ]);
    saveIncCats([{id:'pay',name:'Pay sample',payMode:'fixed',payAmount:2000,payCycle:'fortnightly',payDate:budDateAdd(today,7)}]);
    budCyclesSave({config:{frequency:'fortnightly',anchor:start},periods:{[start+'_'+end]:{start,end,opening:2000,savings:200,reserves:budPeriodSuggestedReserves({days:14}),fundingConfirmed:true}}});
    budPeriodSelected='';budPeriodOffset=0;budLegacyOpen=false;setView('budget');setBudgetView('week');
   },theme);
   const card=page.locator('#bud-fixed-card'),aside=page.getByRole('tab',{name:'Set aside',exact:true}),upcoming=page.getByRole('tab',{name:'Upcoming',exact:true});
   const before=await page.evaluate(snapshot),amount=await page.locator('#bud-hero-avail').innerText();
   assert.equal(await card.locator('#bud-outlook-card').count(),1);
   assert.equal(await page.locator('[data-bud-key="outlook"]').count(),0);
   assert.equal(await page.locator('#bud-fixed-allowance').innerText(),await page.locator('#sum-fix').innerText());
   assert.notEqual(await page.locator('#bud-fixed-allowance').innerText(),'$0');
   assert.equal(await card.locator('#bud-fix-body input').count(),0);
   const money=page.locator('#bud-plan-card'),incomeTab=page.getByRole('tab',{name:'Income',exact:true}),savingsTab=page.getByRole('tab',{name:'Savings',exact:true});
   assert.match(await money.locator('#bud-money-income').innerText(),/\$900[\s\S]*Pay received/);
   assert.equal(await money.locator('#bud-money-income').getByText('Emergency fund',{exact:true}).count(),0);
   assert.equal(await page.locator('#bud-plan-sav').isVisible(),false);
   await savingsTab.click();
   assert.equal(await money.locator('#bud-money-income').isVisible(),false);
   assert.match(await money.locator('#bud-money-savings').innerText(),/\$120[\s\S]*Emergency fund/);
   assert.equal(await page.locator('#bud-plan-sav').isVisible(),true);
   const targetValue=await page.locator('#sav-amount').inputValue();
   assert.equal(targetValue,'200');
   await page.evaluate(()=>{renderBudgetTab();budRecalc();});
   assert.equal(await savingsTab.getAttribute('aria-selected'),'true');
   await savingsTab.press('Home');assert.equal(await incomeTab.getAttribute('aria-selected'),'true');
   await incomeTab.press('End');assert.equal(await savingsTab.getAttribute('aria-selected'),'true');
   for(const view of [incomeTab,savingsTab]){
    await view.click();
    const geometry=await money.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,action:[...el.querySelectorAll('[role="tabpanel"]')].find(p=>!p.hidden).querySelector('.bud-record-action').getBoundingClientRect().height}));
    assert.ok(geometry.scroll<=geometry.width+1,JSON.stringify({width,theme,geometry}));assert.equal(geometry.action,44);
    await money.screenshot({path:path.join(root,`temp-analysis/money-${await view.innerText()}-${width}-${theme}.png`)});
   }
   assert.equal(await page.locator('#sav-amount').inputValue(),targetValue);
   assert.deepEqual(await page.evaluate(snapshot),before,'money tabs keep savings targets and records intact');
   await upcoming.click();assert.equal(await page.locator('#bud-fixed-set-aside').isVisible(),false);
   assert.equal(await page.locator('#bud-fixed-upcoming').isVisible(),true);
   assert.equal(await page.locator('#bud-outlook-card .bill-row').count(),4,'two weekly charges plus monthly and annual charges');
   await page.evaluate(()=>{renderBudgetTab();budRecalc();});
   assert.equal(await upcoming.getAttribute('aria-selected'),'true');
   assert.equal(await page.locator('#bud-hero-avail').innerText(),amount);
   await upcoming.press('Home');assert.equal(await aside.getAttribute('aria-selected'),'true');
   await aside.press('End');assert.equal(await upcoming.getAttribute('aria-selected'),'true');
   await card.locator(':scope > .bud-toggle').click();await page.evaluate(()=>renderBudgetTab());
   assert.equal(await card.evaluate(e=>e.classList.contains('bud-collapsed')),true);
   await card.locator(':scope > .bud-toggle').click();assert.equal(await upcoming.getAttribute('aria-selected'),'true');
   for(const view of [aside,upcoming]){
    await view.click();
    const geometry=await card.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,buttons:[...el.querySelectorAll('.bud-bills-tabs button')].map(b=>b.getBoundingClientRect().height)}));
    assert.ok(geometry.scroll<=geometry.width+1,JSON.stringify({width,theme,geometry}));
    assert.ok(geometry.buttons.every(h=>h>=44));
   }
   await aside.click();await card.screenshot({path:path.join(root,`temp-analysis/bills-set-aside-${width}-${theme}.png`)});
   await upcoming.click();await card.screenshot({path:path.join(root,`temp-analysis/bills-upcoming-${width}-${theme}.png`)});
   await page.setViewportSize({width:width<1024?1440:390,height:950});
   assert.equal(await card.locator('#bud-outlook-card').count(),1);
   await page.evaluate(()=>budOpenFixedCard());assert.equal(await aside.getAttribute('aria-selected'),'true');
   assert.deepEqual(await page.evaluate(snapshot),before,'viewing, recalculating and resizing cannot change financial records');
   if(width===390&&theme==='dark'){
    await money.getByRole('button',{name:'+ Record savings',exact:true}).click();
    await page.locator('#bud-period-dialog').getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal(await savingsTab.getAttribute('aria-selected'),'true');
    await card.getByRole('button',{name:'+ Record bill payment',exact:true}).click();
    await page.locator('#bud-period-dialog').getByRole('button',{name:'Cancel',exact:true}).click();
    assert.deepEqual(await page.evaluate(snapshot),before,'opening and cancelling payment must preserve the records');
   }
   if(width===1440&&theme==='dark'){
    await page.evaluate(()=>budPeriodNavigate(-1));await upcoming.click();
    assert.match(await card.innerText(),/Counted from today/);
    await page.evaluate(()=>{budPeriodNavigate(0);saveIncCats([]);renderBudgetTab();});
    assert.equal(await card.locator('.fc-fig').count(),0,'no payday means schedule only');
    await page.evaluate(()=>{saveFixCats(loadFixCats().map(c=>({...c,dueDate:''})));renderBudgetTab();});
    assert.match(await card.innerText(),/without a billing date/);
    await page.evaluate(()=>{saveFixCats([]);renderBudgetTab();});
    assert.match(await card.innerText(),/No scheduled bills/);
    await page.evaluate(()=>{
     saveFixCats([{id:'weekly',name:'Legacy sample',budget:50}]);
     const week=weekKey(getMondayOf(0));budgetData[week]={wk:week,fix_weekly:'35',inc_salary:'1000'};
     budLegacyOpen=true;currentWeekIdx=0;renderBudgetTab();
    });
    const legacyBefore=await page.evaluate(snapshot);
    await upcoming.click();await page.evaluate(()=>budRecalc());
    assert.equal(await page.locator('#fix-weekly').inputValue(),'35','hidden legacy fields must remain mounted for save readers');
    await aside.click();assert.equal(await page.locator('#fix-weekly').inputValue(),'35');
    assert.deepEqual(await page.evaluate(snapshot),legacyBefore);
   }
   // Monday-aligned saved weeks keep their existing writers while using the new Money tabs.
   await page.setViewportSize({width,height:950});
   await page.evaluate(()=>{
    const week=weekKey(getMondayOf(0)),today=getLocalDate();
    saveFixCats([]);saveIncCats([{id:'pay',name:'Weekly pay sample',payMode:'variable',payCycle:'weekly',payDate:today}]);
    budgetData={[week]:{wk:week,inc_pay:'250',sav_amount:'50',var_goal:'200',updatedAt:1}};
    ledgerData=[{id:'weekly-income',kind:'income',streamId:'pay',date:today,amount:250,manual:true}];
    txnData=[{id:'weekly-purchase',date:today,amount:80,catId:'food',merchant:'Sample groceries'}];
    budCyclesSave({config:{frequency:'weekly',anchor:week},periods:{}});
    budLegacyOpen=false;budPeriodSelected='';budPeriodOffset=0;currentWeekIdx=0;renderBudgetTab();
   });
   assert.equal(await page.evaluate(()=>budPeriodCardMode()),false,'the weekly save path is retained');
   assert.match(await money.locator('.bud-head-label').innerText(),/Money in & saved/i);
   assert.equal(await money.locator('.bud-week-fields').isVisible(),false);
   await incomeTab.click();assert.match(await money.locator('#bud-money-income').innerText(),/\$250/);
   assert.equal(await page.locator('#bud-hero-avail').innerText(),'$120');
   const inheritedBefore=await page.evaluate(snapshot);
   await savingsTab.click();assert.equal(await page.locator('#sav-amount').inputValue(),'50');
   await page.evaluate(()=>{renderBudgetTab();budRecalc();});
   assert.equal(await savingsTab.getAttribute('aria-selected'),'true');
   assert.deepEqual(await page.evaluate(snapshot),inheritedBefore,'inherited Money tabs never migrate weekly data');
   await money.screenshot({path:path.join(root,`temp-analysis/money-inherited-${width}-${theme}.png`)});
   await money.getByRole('button',{name:'+ Record savings',exact:true}).click();
   await page.locator('#bud-period-dialog').getByRole('button',{name:'Cancel',exact:true}).click();
   assert.deepEqual(await page.evaluate(snapshot),inheritedBefore);
   const savingsTarget=money.getByRole('button',{name:/Savings target/});
   if(await savingsTarget.getAttribute('aria-expanded')!=='true')await savingsTarget.click();
   await page.locator('#sav-amount').fill('75');await page.locator('#sav-amount').press('Tab');
   assert.equal(await page.evaluate(()=>budgetData[weekKey(getMondayOf(0))].inc_pay),'250');
   assert.equal(Number(await page.evaluate(()=>budgetData[weekKey(getMondayOf(0))].sav_amount)),75);
   assert.equal(await page.evaluate(()=>Object.keys(budCyclesLoad().periods).length),0,'no second period plan is created');
   assert.equal(await page.locator('#bud-hero-avail').innerText(),'$95');
   await page.evaluate(()=>{budLegacyOpen=true;renderBudgetTab();});
   assert.match(await money.locator('.bud-head-label').innerText(),/Week plan/i);
   await page.evaluate(()=>{budLegacyOpen=false;renderBudgetTab();});
   assert.equal(await savingsTab.isVisible(),true);assert.equal(await page.locator('#sav-amount').inputValue(),'75');
   if(width===1440&&theme==='dark'){
    await page.evaluate(()=>{ledgerData=[];renderBudgetTab();});await incomeTab.click();
    assert.match(await money.locator('#bud-money-income').innerText(),/\$250 is retained/);
    await money.getByRole('button',{name:'Review weekly totals',exact:true}).click();
    assert.equal(await page.locator('#inc-pay').inputValue(),'250');
    await money.getByRole('button',{name:'Back to received income',exact:true}).click();
    assert.equal(await incomeTab.isVisible(),true);
    assert.equal(await page.evaluate(()=>budgetData[weekKey(getMondayOf(0))].inc_pay),'250');
    assert.equal(await page.locator('#bud-hero-avail').innerText(),'$95');
   }
   assert.deepEqual(errors,[]);console.log('Bill and inherited Money cards passed',width,theme);
   await context.close();
  }
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
