// Isolated synthetic records; no bank or production Firebase connections.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {plannerFixture,fixtureURL}=require('./planner-browser-fixture.cjs');
const output=path.resolve(__dirname,'../temp-analysis/finance-recorded-range');
fs.mkdirSync(output,{recursive:true});
const snapshot=()=>({stores:Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).filter(k=>/daily_budget|daily_accounts|daily_ledger|daily_transactions/.test(k)&&!/collapse|_ui/.test(k)).sort().map(k=>[k,localStorage.getItem(k)])),records:JSON.stringify([budgetData,txnData,ledgerData,loadAccounts()])});
(async()=>{
 for(const [engine,type,launch] of [['chrome',chromium,{channel:'chrome',headless:true}],['webkit',webkit,{headless:true}]].filter(([name])=>!process.env.DAILY_RANGE_BROWSER||process.env.DAILY_RANGE_BROWSER===name)){
  const browser=await type.launch(launch);
  try{
   for(const width of [320,390,1024,1440].filter(n=>!process.env.DAILY_RANGE_WIDTH||Number(process.env.DAILY_RANGE_WIDTH)===n))for(const theme of ['dark','light'].filter(n=>!process.env.DAILY_RANGE_THEME||process.env.DAILY_RANGE_THEME===n)){
    const context=await browser.newContext({viewport:{width,height:950},timezoneId:'Australia/Sydney',reducedMotion:'reduce'});
    await plannerFixture()(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(fixtureURL+'?preview&finance-links&overview&ui=journal');await page.getByText(/Local preview · sample money only/).waitFor();
    const dates=await page.evaluate(theme=>{
     S.theme=theme;applyTheme();
     const today=getLocalDate(),start=budDateAdd(today,-4),previous=budDateMonth(today.slice(0,8)+'01',-1);
     saveAccounts([{id:'range-cash',name:'Everyday sample',type:'asset',category:'cash',current:300,history:[]},{id:'range-save',name:'Savings sample',type:'asset',category:'savings',saver:true,current:200,history:[]}]);
     const cat=loadVarCats()[0]?.id||'sample-food';
     txnData=[{id:'range-first',date:start,amount:100.11,catId:cat,merchant:'First purchase',source:{file:'sample-bank.csv',row:'1'}},
      {id:'range-refund',date:budDateAdd(today,-2),amount:-20.03,catId:cat,merchant:'Expense refund'},
      {id:'range-last',date:today,amount:30.25,catId:cat,merchant:'Last purchase'},
      {id:'range-previous',date:budDateAdd(previous,2),amount:9.99,catId:cat,merchant:'Previous month purchase'}];
     ledgerData=[{id:'range-income',kind:'income',date:start,amount:200},
      {id:'range-bill',kind:'bill_payment',date:today,amount:6.25},
      {id:'range-saved',kind:'savings',date:budDateAdd(today,-1),amount:10},
      {id:'range-into',kind:'transfer',date:start,amount:40,fromAcctId:'range-cash',toAcctId:'range-save',savingsMove:'contribution'},
      {id:'range-out',kind:'transfer',date:budDateAdd(today,-1),amount:15,fromAcctId:'range-save',toAcctId:'range-cash',savingsMove:'withdrawal'}];
     budgetData={};
     localStorage.setItem('daily_transactions',JSON.stringify(txnData));localStorage.setItem('daily_ledger',JSON.stringify(ledgerData));localStorage.setItem('daily_budget','{}');
     localStorage.setItem('daily_budget_cycles',JSON.stringify({config:{frequency:'fortnightly',anchor:start},periods:{}}));
     budOvMoneyRange={preset:'month',from:'',to:''};openBudgetOverview();
     return {today,start,previous};
    },theme);
    const before=await page.evaluate(snapshot),card=page.locator('#budget-overview-view'),picker=page.locator('#bov-range-preset');
    const metric=kind=>card.locator('[data-money-metric="'+kind+'"] strong');
    assert.equal(await picker.inputValue(),'month');assert.match(await card.innerText(),/Your money/i);
    assert.equal(await metric('spent').innerText(),'$116.58');assert.equal(await metric('income').innerText(),'$200');
    assert.equal(await metric('difference').innerText(),'$83.42');assert.equal(await metric('savings').innerText(),'$25');
    await picker.selectOption('last-month');assert.equal(await metric('spent').innerText(),'$9.99');
    await picker.selectOption('30-days');assert.equal(await metric('spent').innerText(),'$116.58');
    await picker.selectOption('budget');assert.equal(await metric('spent').innerText(),'$116.58');
    await picker.selectOption('custom');await page.locator('#bov-range-from').fill(dates.today);await page.locator('#bov-range-to').fill(dates.start);
    await card.getByRole('button',{name:'Apply dates',exact:true}).click();assert.match(await page.locator('#bov-range-error').innerText(),/start date/);assert.equal(await metric('spent').innerText(),'$116.58');
    await page.locator('#bov-range-from').fill(dates.start);await page.locator('#bov-range-to').fill(dates.today);await card.getByRole('button',{name:'Apply dates',exact:true}).click();
    assert.equal(await metric('spent').innerText(),'$116.58');assert.equal(await metric('difference').innerText(),'$83.42');assert.equal(await metric('savings').innerText(),'$25');
    await page.evaluate(()=>renderBudgetOverview());assert.equal(await picker.inputValue(),'custom');assert.equal(await page.locator('#bov-range-from').inputValue(),dates.start);
    const chart=card.locator('svg[role="img"][tabindex="0"]'),caption=page.locator('#bud-money-chart-caption');
    assert.equal(await chart.count(),1);assert.doesNotMatch(await chart.evaluate(e=>e.outerHTML),/NaN|Infinity/);
    await card.getByRole('button',{name:'Running total',exact:true}).click();assert.equal(await card.getByRole('button',{name:'Running total',exact:true}).getAttribute('aria-pressed'),'true');
    await card.getByRole('button',{name:'By day',exact:true}).click();assert.equal(await card.getByRole('button',{name:'By day',exact:true}).getAttribute('aria-pressed'),'true');
    await chart.press('Home');const firstCaption=await caption.innerText();await chart.press('End');assert.notEqual(await caption.innerText(),firstCaption);
    await chart.press('ArrowLeft');const previousCaption=await caption.innerText();await chart.press('ArrowRight');assert.notEqual(await caption.innerText(),previousCaption);
    if(theme==='dark'&&(width===390||width===1440)){
     await page.evaluate(()=>document.activeElement?.blur());
     await card.evaluate(e=>{
      let scroll=e.parentElement;while(scroll&&!(scroll.scrollHeight>scroll.clientHeight&&/auto|scroll/.test(getComputedStyle(scroll).overflowY)))scroll=scroll.parentElement;
      (scroll||document.scrollingElement).scrollTop=0;
     });
     await page.screenshot({path:path.join(output,engine+'-'+width+'-summary.png')});
    }
    const fit=await card.evaluate(e=>Array.from(e.querySelectorAll('[data-money-metric],.bov-range-dates,.bov-range-form,input,select')).filter(n=>n.getClientRects().length).map(n=>({text:n.textContent.slice(0,35),w:n.clientWidth,s:n.scrollWidth,h:n.getBoundingClientRect().height})));
    assert.ok(fit.every(r=>r.s<=r.w+1),JSON.stringify({engine,width,theme,fit}));
    const targets=await card.locator('.money-dashboard input,.money-dashboard select,.money-dashboard button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>({label:n.textContent.trim()||n.id,height:n.getBoundingClientRect().height})));
    assert.ok(targets.every(n=>n.height>=43.5),JSON.stringify({engine,width,theme,targets}));
    await chart.press('Home');await card.getByRole('button',{name:/View activity/i}).click();
    assert.match(await card.innerText(),/First purchase/);
    const record=card.locator('.money-activity-row').filter({hasText:'First purchase'}).first();
    await record.locator('summary').click();assert.match(await record.innerText(),/sample-bank.csv[\s\S]*row 1/i);
    if(theme==='dark'&&(width===390||width===1440)){await record.evaluate(e=>e.scrollIntoView({block:'center'}));await page.screenshot({path:path.join(output,engine+'-'+width+'-detail.png')});}
    if(width===390&&theme==='dark'){
     await record.getByRole('button',{name:'Open entry →',exact:true}).click();assert.equal(await page.locator('#txn-modal').isVisible(),true);
     await page.locator('#txn-modal').getByRole('button',{name:'Cancel',exact:true}).click();
    }
    await picker.selectOption('30-days');assert.match(await page.locator('#bud-money-activity .money-activity>header').innerText(),/8 entries/,'changing the date range clears the chart-day activity filter');
    await picker.selectOption('custom');
    await page.locator('#bov-range-from').fill(dates.today);await page.locator('#bov-range-to').fill(dates.today);await card.getByRole('button',{name:'Apply dates',exact:true}).click();
    assert.equal(await metric('spent').innerText(),'$36.50');assert.equal(await metric('income').innerText(),'$0');assert.match(await metric('difference').innerText(),/-\$36.50|\$-36.50/);assert.match(await metric('savings').innerText(),/—/);
    assert.deepEqual(await page.evaluate(snapshot),before,'browsing and invalid dates must not write financial records');assert.deepEqual(errors,[]);
    console.log('Recorded range passed',engine,width,theme);await context.close();
   }
  }finally{await browser.close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
