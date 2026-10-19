// Synthetic Firebase only. Run with Playwright available through NODE_PATH.
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const moneyKeys=['daily_budget','daily_transactions','daily_ledger','daily_budget_cycles','daily_budget_inc_cats','daily_budget_fix_cats','daily_budget_var_cats','daily_budget_config','wt_sessions','wt_weight'];
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  const target=path.resolve(root,decodeURIComponent(req.url.split('?')[0]).replace(/^\/daily-app\//,'')||'index.html');
  if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(target,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':types[path.extname(target)]||'text/plain'});res.end(err?'Missing':data);});
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    for(const width of [320,390,1440])for(const theme of ['light','dark'])for(const period of [false,true]){
      const context=await browser.newContext({viewport:{width,height:900}});
      await context.route(/firebaseio\.com|cloudfunctions\.net/,route=>route.abort());
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(origin+'/daily-app/tests/sync-browser.html?preview&ui=journal'+(period?'&period':''));
      await page.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady);
      const before=await page.evaluate(({theme,moneyKeys})=>{
        obDismiss();dailyUpdateDismiss();S.theme=theme;applyTheme();
        const today=getLocalDate(),yesterday=new Date(today+'T12:00:00');yesterday.setDate(yesterday.getDate()-1);
        saveAccounts([{id:'test-card',name:'Synthetic card',type:'debt',category:'card',tracksStatement:true,current:650.35,statementBalance:400.25,dueDate:dateStr(yesterday),limit:2000,history:[{date:'2026-01-01',balance:700}]},{id:'cash',name:'Synthetic cash',type:'asset',current:2000,history:[]}]);
        openAccounts();
        return Object.fromEntries(moneyKeys.map(k=>[k,localStorage.getItem(k)]));
      },{theme,moneyKeys});
      await page.locator('.acct-options[data-account="test-card"] > summary').click();
      await page.getByRole('button',{name:'Mark statement as paid',exact:true}).click();
      const dialog=page.locator('#acct-statement-dialog');await dialog.waitFor({state:'visible'});
      assert.equal(await page.locator('#acct-statement-remaining').inputValue(),'250.10');
      const dims=await dialog.evaluate(d=>({left:d.getBoundingClientRect().left,right:d.getBoundingClientRect().right,width:innerWidth,client:d.clientWidth,scroll:d.scrollWidth}));
      assert.ok(dims.left>=0&&dims.right<=dims.width+1&&dims.scroll<=dims.client+1,JSON.stringify(dims));
      assert.equal(await page.evaluate(()=>document.activeElement.id),'acct-statement-cancel');
      await page.keyboard.press('Escape');assert.equal(await dialog.evaluate(d=>d.open),false);
      assert.equal(await page.evaluate(()=>accounts[0].current),650.35);
      // Clicking Pay directly after an edit must survive the input's blur/change event.
      await page.locator('input[onchange*="statementBalance"]').fill('300.25');
      await page.getByRole('button',{name:'Mark statement as paid',exact:true}).click();
      await dialog.waitFor({state:'visible'});assert.equal(await page.locator('#acct-statement-remaining').inputValue(),'350.10');
      if(width===390)await page.screenshot({path:path.join(root,'temp-analysis/credit-payment-'+theme+'.png')});
      await page.getByRole('button',{name:'Confirm payment',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('acct-statement-dialog').open);
      const after=await page.evaluate(moneyKeys=>({card:loadAccounts()[0],cash:loadAccounts()[1].current,debts:accountsDebtsTotal(),net:accountsNetWorth(),
        stores:Object.fromEntries(moneyKeys.map(k=>[k,localStorage.getItem(k)])),
        banner:document.getElementById('bud-due-banner').textContent,tools:document.getElementById('cc-card-block').textContent}),moneyKeys);
      assert.equal(after.card.current,350.1);assert.equal(after.card.statementBalance,0);assert.equal(after.card.dueDate,'');assert.equal(after.card.statementSettlements.length,1);
      assert.equal(after.cash,2000);assert.equal(after.debts,350.1);assert.equal(after.net,1649.9);assert.deepEqual(after.stores,before);assert.equal(after.banner,'');assert.match(after.tools,/350/);
      assert.equal(await page.locator('#acct-bal-test-card').inputValue(),'350.1');
      await page.evaluate(()=>{setBudgetView('overview');});
      assert.doesNotMatch(await page.locator('#budget-overview-view').innerText(),/Synthetic card statement is overdue/);
      // Set another statement, then change the account while its confirmation is open.
      await page.evaluate(()=>{openAccounts();accountSetStatementField('test-card','statementBalance','100');accountMarkPaid('test-card');accountLogBalance('test-card',325);});
      await page.getByRole('button',{name:'Confirm payment',exact:true}).click();
      assert.match(await page.locator('#acct-statement-error').innerText(),/changed/);assert.equal(await page.evaluate(()=>accounts[0].current),325);
      await page.getByRole('button',{name:'Cancel',exact:true}).click();
      assert.deepEqual(errors,[]);await context.close();
    }
    console.log('Credit statement browser checks passed: 320/390/1440px, both themes, weekly and pay-period modes, safe initial focus, Escape/cancel, direct edit-to-payment click, exact debt/history save, cleared due alerts, refreshed totals, unchanged financial/workout stores and cash, stale-account rejection. Synthetic data only.');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
