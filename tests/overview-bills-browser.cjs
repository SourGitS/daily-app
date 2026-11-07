// Synthetic data only: monthly facts, activity, bill views and financial preservation.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1));
 if(!file.startsWith(root+path.sep)){res.writeHead(404).end();return;}
 fs.readFile(file,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':mime[path.extname(file)]||'text/plain','Cache-Control':'no-store','Content-Security-Policy':"connect-src 'self'"});res.end(e?'Missing':data);});
});
const snapshot=()=>Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).filter(k=>/daily_budget|daily_accounts|daily_ledger|daily_transactions/.test(k)&&!/collapse|_ui/.test(k)).map(k=>[k,localStorage.getItem(k)]));
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const width of [320,390,768,1024,1440])for(const theme of ['dark','light']){
   const context=await browser.newContext({viewport:{width,height:950},timezoneId:'Australia/Sydney',reducedMotion:'reduce'});
   await context.route(/firebaseio\.com|cloudfunctions\.net|open-meteo\.com/,r=>r.abort());
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port+'/tests/sync-browser.html?preview&finance-links&overview&ui=journal&accent=385c72');
   await page.getByText(/Local preview · sample money only/).waitFor();
   await page.evaluate(theme=>{
    S.theme=theme;applyTheme();Chart.defaults.animation=false;
    const today=getLocalDate();
    saveFixCats([
     {id:'gym',name:'Gym sample',amount:14,cycle:'weekly',chargeType:'subscription',dueDate:today},
     {id:'internet',name:'Internet sample',amount:65.25,cycle:'monthly',chargeType:'bill',dueDate:today},
     {id:'cover',name:'Insurance sample',amount:45,cycle:'fortnightly',chargeType:'bill',dueDate:budDateAdd(today,5)}
    ]);openBudgetOverview();
   },theme);
   const view=page.locator('#budget-overview-view'),bills=page.locator('#bov-bills');
   const list=page.getByRole('tab',{name:'List',exact:true}),calendar=page.getByRole('tab',{name:'Calendar',exact:true});
   const before=await page.evaluate(snapshot);
   const monthly=page.getByRole('region',{name:'Monthly spending',exact:true}),activity=page.getByRole('region',{name:'Recent activity',exact:true});
   const monthMoney=await page.evaluate(()=>{
    const today=getLocalDate(),m=budPeriodCompute({start:today.slice(0,8)+'01',end:today},{},ledgerData,txnData,{},null);
    return {total:fmtMoneyExact(m.spent+m.billPaid),income:fmtMoneyExact(m.income),savings:fmtMoneyExact(m.savingsRecorded)};
   });
   assert.equal(await monthly.locator('.card-fig').innerText(),monthMoney.total);
   assert.match(await monthly.innerText(),new RegExp(monthMoney.income.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
   assert.match(await monthly.innerText(),/First \d+ days? vs/);
   const visibleRows=()=>activity.locator('.bov-activity-item:visible').count();
   const baseCount=await visibleRows();assert.ok(width>=1200?baseCount>6:baseCount===6);
   if(width>=1200){
    await page.waitForFunction(()=>Math.abs(document.querySelector('.bov-month').getBoundingClientRect().bottom-document.querySelector('.bov-activity').getBoundingClientRect().bottom)<1);
   }
   await monthly.locator('.bov-daily>summary').press('Enter');
   assert.equal(await monthly.locator('.bov-daily-table').isVisible(),true);
   assert.equal(await monthly.locator('tbody tr').count(),await page.evaluate(()=>Number(getLocalDate().slice(8))));
   if(width>=1200)await page.waitForFunction(n=>document.querySelectorAll('.bov-activity-item:not([hidden])').length>n,baseCount);
   await monthly.locator('.bov-daily>summary').press('Enter');
   await activity.locator('.bov-activity-item>summary').first().press('Enter');
   await activity.getByRole('button',{name:'Edit record →',exact:true}).click();
   assert.equal(await page.locator('#bud-period-dialog').isVisible(),true);
   await page.locator('#bud-period-dialog').getByRole('button',{name:'Cancel',exact:true}).click();
   await activity.locator('.bov-activity-item>summary').first().press('Enter');
   if(width>=1200){
    await page.waitForFunction(n=>document.querySelectorAll('.bov-activity-item:not([hidden])').length>=n,baseCount);
    const extra=activity.locator('.bov-activity-item').nth(6);
    await extra.locator('summary').press('Enter');
    assert.equal(await extra.getAttribute('open'),'');assert.equal(await extra.getAttribute('hidden'),null);
    assert.equal(await extra.locator('.bov-activity-detail').isVisible(),true);
    await extra.locator('summary').press('Enter');
   }
   await view.locator('.bov-insights').screenshot({path:path.join(root,'temp-analysis/overview-spending-'+width+'-'+theme+'.png')});
   const insightFit=await view.locator('.bov-insights').evaluate(e=>Array.from(e.querySelectorAll('.card,.bov-month-money,.bov-activity-list')).map(n=>({w:n.clientWidth,s:n.scrollWidth})));
   assert.ok(insightFit.every(r=>r.s<=r.w+1),JSON.stringify({width,theme,insightFit}));
   assert.equal(await page.getByRole('tablist',{name:'Finance views',exact:true}).getByRole('tab').count(),4);
   assert.equal(await page.locator('#bv-bills-btn,#budget-bills-view').count(),0);
   assert.equal(await view.locator('.bov-fig-row').count(),0);
   const expected=await page.evaluate(()=>{
    const d=localMidnight(getLocalDate()),items=billOccurrences(d,new Date(d.getFullYear(),d.getMonth()+1,0));
    return {count:items.length,total:fmtMoneyExact(items.reduce((s,o)=>s+o.amount,0)),day:getLocalDate()};
   });
   assert.equal(await page.locator('#bov-bills-list .bill-row').count(),expected.count);
   assert.equal(await bills.locator('.bov-bills-summary strong').innerText(),expected.total);
   assert.ok(await bills.locator('.bov-agenda-week').count()>1);
   assert.equal(await bills.locator('.bov-agenda-week[open]').count(),1);
   const lastWeek=bills.locator('.bov-agenda-week').last(),lastWeekKey=await lastWeek.getAttribute('data-week');
   await lastWeek.locator('summary').press('Enter');
   await list.press('End');assert.equal(await calendar.getAttribute('aria-selected'),'true');
   await calendar.press('Home');assert.equal(await bills.locator('.bov-agenda-week[data-week="'+lastWeekKey+'"]').getAttribute('open'),'');
   await list.press('End');
   await page.locator('#bov-bill-day-'+expected.day).click();
   assert.equal(await bills.locator('.bov-cal-detail .bill-row').count(),2);
   await bills.screenshot({path:path.join(root,'temp-analysis/overview-calendar-'+width+'-'+theme+'.png')});
   await page.locator('#bov-bill-day-'+expected.day).press('ArrowRight');
   assert.equal(await page.evaluate(()=>document.activeElement.id),'bov-bill-day-'+await page.evaluate(()=>budDateAdd(getLocalDate(),1)));
   await page.evaluate(()=>renderBudgetOverview());assert.equal(await calendar.getAttribute('aria-selected'),'true');
   const fit=await view.evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,bills:e.querySelector('#bov-bills').clientWidth,billsScroll:e.querySelector('#bov-bills').scrollWidth}));
   assert.ok(fit.scroll<=fit.width+1&&fit.billsScroll<=fit.bills+1,JSON.stringify({width,theme,fit}));
   await page.getByRole('button',{name:'Next bill month',exact:true}).click();
   const month=await bills.locator('.bov-bills-month>span').innerText();
   await calendar.press('Home');assert.equal(await list.getAttribute('aria-selected'),'true');
   assert.equal(await bills.locator('.bov-bills-month>span').innerText(),month);
   await page.getByRole('button',{name:'This month',exact:true}).click();
   await page.evaluate(()=>openBillsCalendar());assert.equal(await calendar.getAttribute('aria-selected'),'true');
   assert.equal(await page.evaluate(()=>budgetView),'overview');
   await list.click();
   await bills.getByRole('button',{name:'Manage bills',exact:true}).click();
   await page.locator('#view-budget-editor').getByRole('button',{name:'Done',exact:true}).click();
   assert.deepEqual(await page.evaluate(snapshot),before,'browsing the schedule must never write financial records');
   await page.screenshot({path:path.join(root,'temp-analysis/overview-list-'+width+'-'+theme+'.png')});
   if(width===390&&theme==='dark'){
    await view.locator('.bov-budget-open').click();assert.equal(await page.evaluate(()=>budgetView),'week');
    await page.getByRole('tab',{name:'Overview',exact:true}).click();
    await view.getByRole('button',{name:'Add expense',exact:true}).click();assert.equal(await page.locator('#txn-modal').isVisible(),true);
    await page.locator('#txn-modal').getByRole('button',{name:'Cancel',exact:true}).click();
    await monthly.getByRole('button',{name:'View month →',exact:true}).click();
    assert.equal(await page.evaluate(()=>budgetView),'plan');assert.equal(await page.evaluate(()=>currentMonthOffset),0);
    await page.getByRole('tab',{name:'Budget',exact:true}).click();
    await page.getByRole('tab',{name:'Upcoming',exact:true}).click();
    await page.getByRole('button',{name:'View bills calendar →',exact:true}).click();
    assert.equal(await calendar.getAttribute('aria-selected'),'true');assert.equal(await page.evaluate(()=>budgetView),'overview');
   }
   if(width===320){
    await page.evaluate(()=>{saveFixCats([{id:'undated',name:'Undated sample',amount:20,cycle:'monthly',chargeType:'bill'}]);saveAccounts([]);openBudgetOverview();});
    await list.click();assert.match(await bills.innerText(),/No more scheduled bills/);assert.match(await bills.innerText(),/1 bill needs a date/);
    await calendar.click();assert.match(await bills.locator('.bov-cal-detail').innerText(),/Nothing scheduled/);
    await page.evaluate(()=>{
     ledgerData=[];budgetData={};txnData=[];
     saveFixCats([{id:'funding-example',name:'Bill without budget funding',amount:25,cycle:'monthly',chargeType:'bill',dueDate:getLocalDate()}]);
     openBudgetOverview();
    });
    assert.match(await monthly.innerText(),/No dated activity this month/);
    assert.match(await activity.innerText(),/No dated activity yet/);
    assert.equal(await view.locator('.bov-hero .hm-val').innerText(),'—');
    assert.equal(await bills.locator('.bov-bills-summary strong').innerText(),'$25');
    await page.evaluate(()=>{
     const date=getLocalDate(),wk=weekKey(getMondayOf(0));budgetData={[wk]:{wk,var_older:'90'}};
     txnData=[{id:'long',date,amount:123456.78,catId:'food',merchant:'A very long grocery shop name with extra details '.repeat(6)},
       {id:'prior',date:budDateMonth(date.slice(0,8)+'01',-1),amount:30,catId:'food'}];openBudgetOverview();
    });
    assert.match(await monthly.innerText(),/Comparison unavailable/);assert.equal(await monthly.locator('.bov-coverage').count(),1);
    await monthly.locator('.bov-coverage>summary').press('Enter');assert.match(await monthly.innerText(),/Undated weekly totals remain/);
    const longFit=await view.locator('.bov-insights').evaluate(e=>Array.from(e.querySelectorAll('.card,.bov-activity-item,.bov-month-money')).map(n=>({w:n.clientWidth,s:n.scrollWidth})));
    assert.ok(longFit.every(r=>r.s<=r.w+1),JSON.stringify({width,theme,longFit}));
   }
   assert.deepEqual(errors,[]);console.log('Overview bills passed',width,theme);await context.close();
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
