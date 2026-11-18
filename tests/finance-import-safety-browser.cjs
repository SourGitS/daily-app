// Real app controls and writers with isolated sample accounts and fake Firebase only.
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {plannerFixture,fixtureURL}=require('./planner-browser-fixture.cjs');
const output=path.resolve(__dirname,'../temp-analysis/finance-import-safety');fs.mkdirSync(output,{recursive:true});
const payload=actions=>JSON.stringify({schema:'daily-actions',version:1,source:'synthetic regression',actions});
async function check(page,actions){await page.locator('#aihub-inbox-text').fill(payload(actions));await page.getByRole('button',{name:'Check actions',exact:true}).click();}
async function checkQuotaRetry(page,action,key){
  await check(page,[action]);const row=page.locator('.aih-row[role="checkbox"]');if(await row.getAttribute('aria-checked')!=='true')await row.click();
  const result=await page.evaluate(key=>{
    const snapshot=()=>JSON.stringify([txnData,ledgerData,budgetData,loadAccounts(),loadFixCats(),loadIncCats(),loadVarCats(),kitRecipes,kitShopManual]);
    window.importQuotaBefore=snapshot();window.importQuotaSnapshot=snapshot;window.importQuotaSet=localStorage.setItem.bind(localStorage);
    localStorage.setItem=(name,value)=>{if(name===key)throw Error('Synthetic import quota');return window.importQuotaSet(name,value);};return true;
  },key);assert.equal(result,true);
  await page.getByRole('button',{name:'Apply 1 action',exact:true}).click();
  assert.match(await page.locator('.aih-result').innerText(),/0 imported/);assert.match(await page.locator('#aihub-body').innerText(),/Synthetic import quota/);
  assert.equal(await page.evaluate(()=>{localStorage.setItem=window.importQuotaSet;return window.importQuotaSnapshot()===window.importQuotaBefore;}),true,'failed action restores all mutable app records');
  await check(page,[action]);const retryRow=page.locator('.aih-row[role="checkbox"]');if(await retryRow.getAttribute('aria-checked')!=='true')await retryRow.click();
  await page.getByRole('button',{name:'Apply 1 action',exact:true}).click();assert.match(await page.locator('.aih-result').innerText(),/1 imported/);
  assert.equal(await page.evaluate(action=>{
    const list=({add_subscription:loadFixCats,add_income_stream:loadIncCats,add_expense_category:loadVarCats,add_recipe:()=>kitRecipes,add_shopping_item:()=>kitShopManual,add_income:()=>ledgerData})[action.type]();
    return list.filter(r=>r.aiActionId===action.id).length;
  },action),1,'retry creates the action once');
}
async function changePeriod(page,date,frequency,anchor,mode){
  await page.evaluate(date=>{getLocalDate=()=>date;budPeriodSetup();},date);
  const dialog=page.locator('#bud-period-dialog');await dialog.locator('[name="source"]').selectOption('');
  await dialog.locator('[name="frequency"]').selectOption(frequency);await dialog.locator('[name="anchor"]').fill(anchor);
  await dialog.locator('[name="transitionMode"][value="'+mode+'"]').check();
  await dialog.getByRole('button',{name:'Save budget dates',exact:true}).click();assert.equal(await dialog.isVisible(),false);
}
(async()=>{
  let cases=0;
  for(const [name,type,launch]of [['chrome',chromium,{channel:'chrome',headless:true}],['webkit',webkit,{headless:true}]].filter(([name])=>!process.env.DAILY_SAFETY_BROWSER||name===process.env.DAILY_SAFETY_BROWSER)){
    const browser=await type.launch(launch);
    try{for(const width of [390,1440]){
      const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Australia/Sydney',reducedMotion:'reduce',serviceWorkers:'block',isMobile:width<1024,hasTouch:width<1024});
      await plannerFixture()(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(fixtureURL+'?preview&finance-links&ui=journal');await page.getByText(/Local preview · sample money only/).waitFor();
      await page.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady&&!_bootPhase&&!_syncApplying);
      await page.evaluate(()=>{
        obDismiss();dailyUpdateDismiss();weatherCancelRequest();weatherEnsureFresh=()=>Promise.resolve(false);getLocalDate=()=> '2026-11-18';
        saveIncCats([{id:'salary-safe',name:'Salary sample',payCycle:'fortnightly'}]);
        saveVarCats([{id:'food-safe',name:'Food sample'}]);saveFixCats([]);
        saveAccounts([{id:'cash-safe',name:'Cash sample',type:'asset',current:1000,history:[]}]);
        txnData=[];saveTxns();ledgerData=[];saveLedger();budgetData={};localStorage.setItem('daily_budget','{}');
        openAIHub();aiHubState.mode='inbox';renderAIHub();
      });
      await page.getByRole('tab',{name:'Import actions',exact:true}).click();
      const income={id:'income-review',type:'add_income',data:{amount:100,date:'2026-11-18',streamId:'salary-safe',weekMode:'replace',incomeType:'salary'}};
      await check(page,[income]);assert.match(await page.locator('.aih-row-s').first().textContent(),/not set/);
      await page.evaluate(()=>{const key=txnWeekOf('2026-11-18');budgetData[key]={inc_salarySafe:'untouched', 'inc_salary-safe':'500',updatedAt:Date.now()};budSaveData(key);});
      await page.getByRole('button',{name:'Apply 1 action',exact:true}).click();
      assert.match(await page.locator('#aihub-body').textContent(),/changed since this preview/);
      assert.equal(await page.evaluate(()=>ledgerData.length),0);assert.equal(await page.evaluate(()=>budgetData[txnWeekOf('2026-11-18')]['inc_salary-safe']),'500');
      assert.ok(await page.locator('#aihub-inbox-text').inputValue(),'a blocked apply keeps the pasted response');
      await check(page,[income]);assert.match(await page.locator('.aih-row-c').textContent(),/overwrites an existing weekly total/);
      await page.getByRole('button',{name:'Apply 1 action',exact:true}).click();
      assert.equal(await page.evaluate(()=>budgetData[txnWeekOf('2026-11-18')]['inc_salary-safe']),'100');
      await page.evaluate(()=>{const key=txnWeekOf('2026-11-18');budgetData[key]['inc_salary-safe']='900';budgetData[key].updatedAt=Date.now();budSaveData(key);});
      await page.getByRole('button',{name:'Undo this import',exact:true}).click();
      assert.equal(await page.evaluate(()=>budgetData[txnWeekOf('2026-11-18')]['inc_salary-safe']),'900');assert.equal(await page.evaluate(()=>ledgerData.length),1);
      const future={...income,id:'future-pay',data:{...income.data,date:'2026-11-25',amount:700}};await check(page,[future]);
      assert.match(await page.locator('.aih-row-bad').textContent(),/already have arrived/);assert.equal(await page.getByRole('button',{name:'Apply 1 action',exact:true}).count(),0);
      if(width===390){
        for(const [action,key]of [
          [{id:'quota-subscription',type:'add_subscription',data:{name:'Sample subscription',amount:10,cycle:'monthly'}},'daily_budget_fix_cats'],
          [{id:'quota-stream',type:'add_income_stream',data:{name:'Sample side income'}},'daily_budget_inc_cats'],
          [{id:'quota-category',type:'add_expense_category',data:{name:'Sample travel'}},'daily_budget_var_cats'],
          [{id:'quota-recipe',type:'add_recipe',data:{name:'Sample rice',category:'dinner',servings:1,ingredients:[{name:'Rice',amount:1,unit:'cup'}],steps:['Cook the rice.']}},'kitchen_recipes'],
          [{id:'quota-shopping',type:'add_shopping_item',data:{name:'Sample rice',category:'Other'}},'kitchen_shopping_manual'],
          [{id:'quota-income',type:'add_income',data:{...income.data,amount:30,weekMode:'add'}},'daily_budget']
        ])await checkQuotaRetry(page,action,key);
        assert.equal(await page.evaluate(()=>budgetData[txnWeekOf('2026-11-18')]['inc_salary-safe']),'930','income retry updates the weekly total once');
      }
      // A later correction and a later reimbursement each prevent destructive purchase Undo.
      const expense={id:'expense-review',type:'add_expense',data:{amount:20,date:'2026-11-18',categoryId:'food-safe',merchant:'Sample lunch',paymentAccountId:'cash-safe'}};
      await check(page,[expense]);await page.getByRole('button',{name:'Apply 1 action',exact:true}).click();
      await page.evaluate(()=>{txnData.find(r=>r.aiActionId==='expense-review').amount=25;saveTxns();});
      await page.getByRole('button',{name:'Undo this import',exact:true}).click();assert.equal(await page.evaluate(()=>txnData.find(r=>r.aiActionId==='expense-review').amount),25);
      const second={...expense,id:'expense-dependent',data:{...expense.data,amount:30,merchant:'Another sample'}};
      await check(page,[second]);await page.getByRole('button',{name:'Apply 1 action',exact:true}).click();
      await page.evaluate(()=>{const t=txnData.find(r=>r.aiActionId==='expense-dependent');ledgerData.push({id:'manual-reimbursement',kind:'reimbursement',date:t.date,expenseId:t.id,amount:5,createdAt:Date.now()});saveLedger();});
      await page.getByRole('button',{name:'Undo this import',exact:true}).click();assert.equal(await page.evaluate(()=>txnData.some(r=>r.aiActionId==='expense-dependent')),true);
      // Inject a second-store quota failure into the fixture's own localStorage, then retry.
      const third={...expense,id:'expense-atomic',data:{...expense.data,amount:40,merchant:'Atomic sample'}};
      await check(page,[third]);await page.getByRole('button',{name:'Apply 1 action',exact:true}).click();
      const atomic=await page.evaluate(()=>{
        const item={id:'ledger-atomic',type:'add_transfer'};ledgerData.push({id:'ledger-atomic',aiActionId:item.id,kind:'transfer',date:getLocalDate(),amount:1});saveLedger();
        aiInboxState.lastApply.items.push(item);aiInboxState.lastApply.ids.push(item.id);item.guard=aiUndoGuardCapture(item);
        const values=()=>JSON.stringify([txnData,ledgerData,[...Array(localStorage.length)].map((_,i)=>localStorage.key(i)).sort().map(k=>[k,localStorage.getItem(k)])]);
        const before=values(),set=localStorage.setItem.bind(localStorage);let failed=false;
        localStorage.setItem=(key,value)=>{if(!failed&&key==='daily_ledger'){failed=true;throw Error('synthetic quota');}return set(key,value);};
        const result=aiUndoLastApply();localStorage.setItem=set;
        return {failed:result.failed,unchanged:values()===before,retry:aiUndoLastApply(),expenseLeft:txnData.some(r=>r.aiActionId==='expense-atomic'),ledgerLeft:ledgerData.some(r=>r.id==='ledger-atomic')};
      });
      assert.equal(atomic.failed,true);assert.equal(atomic.unchanged,true);assert.equal(atomic.retry.failed,undefined);assert.equal(atomic.expenseLeft,false);assert.equal(atomic.ledgerLeft,false);
      await page.evaluate(()=>{
        closeAIHub();
        budCyclesSave({config:{frequency:'weekly',anchor:'2026-09-28'},periods:{'2026-09-28_2026-10-04':{start:'2026-09-28',end:'2026-10-04',notes:'Original weekly plan',opening:250,reserves:{rent:20}}}});
        getLocalDate=()=> '2026-10-03';openBudgetOverview();
      });
      await changePeriod(page,'2026-10-03','monthly','2026-10-01','next');
      await page.evaluate(()=>{const s=budCyclesLoad();s.periods['2026-10-05_2026-10-31'].notes='October bridge plan';s.periods['2026-10-05_2026-10-31'].opening=400;budCyclesSave(s);});
      await changePeriod(page,'2026-11-18','weekly','2026-11-16','now');
      await changePeriod(page,'2026-11-20','fortnightly','2026-11-25','next');
      const history=await page.evaluate(()=>{
        const s=budCyclesLoad(),before=JSON.stringify(s),ranges=[];let p=budPeriodRangeForStore(s,'2026-10-03');
        for(let i=0;i<8;i++){const next=budPeriodAdjacent(s,p,1);ranges.push({end:p.end,start:next.start,back:budPeriodAdjacent(s,next,-1).id===p.id});p=next;}
        return {unchanged:JSON.stringify(budCyclesLoad())===before,history:s.history.length,bridge:budPeriodRangeForStore(s,'2026-10-15'),notes:s.periods['2026-10-05_2026-10-31'].notes,opening:s.periods['2026-10-05_2026-10-31'].opening,ranges};
      });
      assert.equal(history.history,2);assert.equal(history.bridge.start,'2026-10-05');assert.equal(history.bridge.end,'2026-10-31');assert.equal(history.notes,'October bridge plan');assert.equal(history.opening,400);assert.equal(history.unchanged,true);
      for(const p of history.ranges){assert.equal(new Date(p.start)-new Date(p.end),86400000);assert.equal(p.back,true);}
      await page.locator('button[onclick="changeWeek(-1)"]:visible').first().click();await page.locator('button[onclick="changeWeek(-1)"]:visible').first().click();
      const viewed=await page.evaluate(()=>budPeriodViewed());assert.equal(viewed.start,'2026-10-05');assert.equal(viewed.end,'2026-10-31');
      assert.equal(await page.locator('#week-notes').inputValue(),'October bridge plan');
      await page.screenshot({path:path.join(output,name+'-'+width+'.png'),fullPage:true});assert.deepEqual(errors,[]);cases++;await context.close();
    }}finally{await browser.close();}
  }
  console.log('PASS '+cases+' Chrome/WebKit import review, protected Undo, atomic retry and repeated period UI cases');
})().catch(error=>{console.error(error);process.exitCode=1;});
