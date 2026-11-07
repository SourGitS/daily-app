// Isolated sample accounts only. No production service worker or Firebase connections.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
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
   await page.goto('http://127.0.0.1:'+server.address().port+'/tests/sync-browser.html?preview&finance-links&overview&plan&ui=journal&accent=385c72');
   await page.getByText(/Local preview · sample money only/).waitFor();
   await page.evaluate(theme=>{S.theme=theme;applyTheme();},theme);
   const plan=page.locator('#budget-plan-view'),scenario=page.getByRole('region',{name:'What-if scenario',exact:true}),targets=page.getByRole('region',{name:'Targets',exact:true});
   assert.equal(await page.getByRole('tab',{name:'Plan',exact:true}).getAttribute('aria-selected'),'true');
   assert.equal(await page.getByRole('tab',{name:'Plan ahead',exact:true}).getAttribute('aria-selected'),'true');
   assert.equal(await plan.locator('.plan-month').count(),3);assert.equal(await targets.locator('.plan-goal').count(),1);
   const before=await page.evaluate(snapshot);
   await scenario.getByLabel('Funds available for this scenario',{exact:true}).fill('2000');
   await scenario.getByLabel('Everyday spending / month',{exact:true}).fill('400');
   await scenario.getByLabel('Savings / month',{exact:true}).fill('50');
   await scenario.getByRole('button',{name:'Run scenario',exact:true}).click();
   assert.equal(await plan.locator('.plan-scenario-outcome').count(),1);
   await scenario.locator('.plan-covered>summary').press('Enter');await scenario.locator('[data-covered]').first().check();
   await scenario.getByRole('button',{name:'Run scenario',exact:true}).click();assert.match(await scenario.innerText(),/scheduled charges marked covered/);
   await scenario.getByLabel('Months shown',{exact:true}).selectOption('6');await scenario.getByRole('button',{name:'Run scenario',exact:true}).click();
   assert.equal(await scenario.locator('tbody tr').count(),6);
   await scenario.getByLabel('Funds available for this scenario',{exact:true}).fill('-10');await scenario.getByRole('button',{name:'Run scenario',exact:true}).click();
   assert.match(await plan.locator('#plan-scenario-error').innerText(),/amount/);
   await scenario.getByLabel('Funds available for this scenario',{exact:true}).fill('2000');await scenario.getByRole('button',{name:'Run scenario',exact:true}).click();
   await scenario.locator('.plan-covered>summary').press('Enter');
   await page.getByRole('tab',{name:'Review',exact:true}).press('Enter');
   assert.equal(await page.getByRole('heading',{name:'Monthly review',exact:true}).isVisible(),true);
   const month=await page.locator('#month-label-main').innerText();await page.locator('#budget-month-view>.week-nav button').first().click();
   assert.notEqual(await page.locator('#month-label-main').innerText(),month);
   await page.getByRole('button',{name:'Yearly',exact:true}).click();assert.equal(await page.getByRole('heading',{name:'Yearly review',exact:true}).isVisible(),true);
   await page.locator('#budget-year-view>.week-nav button').first().click();
   await page.getByRole('tab',{name:'Plan ahead',exact:true}).press('Enter');
   assert.equal(await scenario.getByLabel('Funds available for this scenario',{exact:true}).inputValue(),'2000');
   assert.equal(await scenario.locator('.plan-scenario-outcome').count(),1,'unchanged scenarios survive Review');
   await targets.getByRole('button',{name:'Edit budget targets',exact:true}).click();
   const budgetDialog=page.locator('#bud-period-dialog');
   await budgetDialog.getByLabel('Savings to reserve',{exact:true}).fill('100');
   await budgetDialog.getByLabel('Spending goal',{exact:true}).fill('180');
   assert.match(await budgetDialog.locator('#plan-target-impact').innerText(),/Available to spend after this target/);
   await budgetDialog.getByRole('button',{name:'Cancel',exact:true}).click();
   await targets.getByRole('button',{name:'Edit',exact:true}).click();
   await page.locator('#acct-tools-dialog').getByRole('button',{name:'Cancel',exact:true}).click();
   assert.deepEqual(await page.evaluate(snapshot),before,'browsing, scenarios and Cancel write no financial records');
   const fit=await plan.evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth,children:[...e.querySelectorAll('.plan-forward-grid>.card,#plan-scenario,.plan-scenario-fields')].map(n=>[n.clientWidth,n.scrollWidth])}));
   assert.ok(fit.scroll<=fit.width+1&&fit.children.every(([w,s])=>s<=w+1),JSON.stringify({width,theme,fit}));
   if(width===1440){
    if(theme==='light')await page.evaluate(()=>{
     const today=getLocalDate(),start=today.slice(0,8)+'01',p=budPeriodRange({frequency:'fortnightly',anchor:start},today,0);
     budCyclesSave({config:{frequency:'fortnightly',anchor:start},periods:{[p.id]:{start:p.start,end:p.end,savings:50,goal:200,reserves:budPeriodSuggestedReserves(p),fundingConfirmed:true,allocationsReviewed:true},old:{start:'2026-09-01',end:'2026-09-14',savings:10,finished:true,updatedAt:2}}});renderPlan();
    });
    const recordsBefore=await page.evaluate(()=>({ledger:JSON.stringify(ledgerData),txns:JSON.stringify(txnData),accounts:loadAccounts(),periods:budCyclesLoad().periods,week:JSON.parse(JSON.stringify(budgetData)),available:budPlanBudgetState().available}));
    await targets.getByRole('button',{name:'Edit budget targets',exact:true}).click();
    await budgetDialog.getByLabel('Savings to reserve',{exact:true}).fill('100');await budgetDialog.getByLabel('Spending goal',{exact:true}).fill('180');
    await budgetDialog.getByRole('button',{name:'Save targets',exact:true}).click();
    const current=await page.evaluate(()=>budPlanBudgetState());assert.equal(current.savings,100);assert.equal(current.goal,180);
    assert.ok(Math.abs(current.available-(recordsBefore.available-50))<.005);
    await page.getByRole('tab',{name:'Budget',exact:true}).click();
    assert.equal(await page.evaluate(()=>budPeriodMoney(budPeriodCurrent()).record.savings),100);
    await page.getByRole('tab',{name:'Plan',exact:true}).click();
    await targets.getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByLabel('Target balance',{exact:true}).fill('1800');
    await page.getByRole('button',{name:'Save goal',exact:true}).click();
    const after=await page.evaluate(()=>({ledger:JSON.stringify(ledgerData),txns:JSON.stringify(txnData),accounts:loadAccounts(),periods:budCyclesLoad().periods,week:budgetData}));
    assert.equal(after.ledger,recordsBefore.ledger);assert.equal(after.txns,recordsBefore.txns);
    const a=after.accounts.find(x=>x.id==='savings'),old=recordsBefore.accounts.find(x=>x.id==='savings');
    assert.equal(a.savingsPlan.goal,1800);assert.equal(a.current,old.current);assert.deepEqual(a.history,old.history);assert.equal(a.savingsPlan.mode,old.savingsPlan.mode);
    if(theme==='light'){assert.deepEqual(after.periods.old,recordsBefore.periods.old);assert.deepEqual(after.week,recordsBefore.week);}
    else assert.deepEqual(after.periods,recordsBefore.periods);
   }
   if(width===320&&theme==='dark'){
    await page.evaluate(()=>{budgetData={};ledgerData=[];txnData=[];saveAccounts([]);budCyclesSave({config:null,periods:{}});
      saveFixCats([{id:'needs-date',name:'Bill without date',amount:20,cycle:'monthly',chargeType:'bill'}]);renderPlan();});
    const emptyBefore=await page.evaluate(snapshot);
    assert.equal(await plan.locator('.plan-month').count(),0);assert.equal(await targets.locator('.plan-goal').count(),0);
    assert.match(await page.locator('#plan-commitments').innerText(),/needs a billing date/);
    await scenario.getByLabel('Funds available for this scenario',{exact:true}).fill('100');
    await scenario.getByLabel('Everyday spending / month',{exact:true}).fill('50');await scenario.getByRole('button',{name:'Run scenario',exact:true}).click();
    assert.match(await page.locator('#plan-scenario-result').innerText(),/no billing date.*excluded/);
    assert.deepEqual(await page.evaluate(snapshot),emptyBefore);
   }
   await page.getByRole('tab',{name:'Plan ahead',exact:true}).click();
   await page.locator('#plan-scenario-form').getByRole('button',{name:'Run scenario',exact:true}).click();
   await page.screenshot({path:path.join(root,'temp-analysis/plan-ahead-'+width+'-'+theme+'.png')});
   assert.deepEqual(errors,[]);console.log('Plan workspace passed',width,theme);await context.close();
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
