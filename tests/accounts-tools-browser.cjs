const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  const target=path.resolve(root,decodeURIComponent(req.url.split('?')[0]).replace(/^\/daily-app\//,'')||'index.html');
  if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(target,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':types[path.extname(target)]||'text/plain'});res.end(err?'Missing':data);});
});
const keys=['daily_budget','daily_transactions','daily_ledger','daily_budget_cycles','wt_sessions','wt_weight'];
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    for(const width of [320,390,1440])for(const theme of ['light','dark']){
      const context=await browser.newContext({viewport:{width,height:950}});
      await context.route(/firebaseio\.com|cloudfunctions\.net/,route=>route.abort());
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(origin+'/daily-app/tests/sync-browser.html?preview&ui=journal');
      await page.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady);
      const before=await page.evaluate(({theme,keys})=>{
        obDismiss();dailyUpdateDismiss();S.theme=theme;applyTheme();
        saveAccounts([{id:'cash',name:'Everyday',type:'asset',category:'cash',current:1000,history:[]},
          {id:'save',name:'Savings',type:'asset',category:'savings',saver:true,current:50.05,history:[]},
          {id:'card',name:'Credit card',type:'debt',category:'card',tracksStatement:true,current:700,statementBalance:400,dueDate:budDateAdd(getLocalDate(),-1),history:[]}]);
        openAccounts();return Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]));
      },{theme,keys});
      for(const summary of await page.locator('.acct-options > summary').all())await summary.click();
      await page.getByText('Statements & charges (1)',{exact:true}).click();
      await page.getByRole('button',{name:'Add statement',exact:true}).click();
      const dialog=page.locator('#acct-tools-dialog');await dialog.waitFor({state:'visible'});
      const today=await page.evaluate(()=>getLocalDate()),due=await page.evaluate(()=>budDateAdd(getLocalDate(),22));
      await page.getByLabel('Statement date',{exact:true}).fill(today);
      await page.getByLabel('Repayment due date',{exact:true}).fill(due);
      await page.getByLabel('Closing statement balance',{exact:true}).fill('600');
      await page.getByLabel('Minimum payment (optional)',{exact:true}).fill('25');
      await page.getByLabel('Interest charged (optional)',{exact:true}).fill('3.40');
      const bounds=await dialog.evaluate(d=>({left:d.getBoundingClientRect().left,right:d.getBoundingClientRect().right,width:innerWidth,client:d.clientWidth,scroll:d.scrollWidth}));
      assert.ok(bounds.left>=0&&bounds.right<=bounds.width+1&&bounds.scroll<=bounds.client+1,JSON.stringify(bounds));
      if(width===390)await page.screenshot({path:path.join(root,'temp-analysis/accounts-statement-'+theme+'.png')});
      await page.getByRole('button',{name:'Save statement',exact:true}).click();
      assert.equal(await dialog.evaluate(d=>d.open),false);
      const card=await page.evaluate(()=>loadAccounts().find(a=>a.id==='card'));
      assert.equal(card.current,700);assert.equal(card.statementHistory.length,1);assert.equal(card.statementHistory[0].statementBalance,400);assert.equal(card.statementDetails.interest,3.4);
      await page.getByText('Statements & charges (2)',{exact:true}).click();
      assert.match(await page.locator('#accounts-list').innerText(),/unmatched/);
      await page.getByRole('button',{name:'Record transfer',exact:true}).click();
      await page.getByLabel('From account',{exact:true}).selectOption('cash');await page.getByLabel('To account',{exact:true}).selectOption('save');
      await page.getByLabel('Amount received',{exact:true}).fill('100.25');
      assert.match(await page.locator('#acct-transfer-preview').innerText(),/899.75/);
      assert.match(await page.locator('#acct-transfer-preview').innerText(),/150.30/);
      await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>accounts[0].current),1000);
      await page.getByRole('button',{name:'Record transfer',exact:true}).click();
      await page.getByLabel('From account',{exact:true}).selectOption('cash');await page.getByLabel('To account',{exact:true}).selectOption('save');
      await page.getByLabel('Amount received',{exact:true}).fill('100.25');await page.locator('#acct-transfer-posted').check();
      if(width===390)await page.screenshot({path:path.join(root,'temp-analysis/accounts-transfer-'+theme+'.png')});
      await page.getByRole('button',{name:'Update both balances',exact:true}).click();
      const saved=await page.evaluate(keys=>({a:loadAccounts(),movement:ledgerSavingsMovement(getLocalDate(),getLocalDate()),stores:Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]))}),keys);
      assert.equal(saved.a[0].current,899.75);assert.equal(saved.a[1].current,150.3);assert.equal(saved.movement.contributions,100.25);assert.equal(saved.movement.transfers,1);assert.deepEqual(saved.stores,before);
      await page.getByRole('button',{name:'+ Add account',exact:true}).click();await page.getByLabel('Account name',{exact:true}).fill('New savings');
      await page.getByLabel('Account category',{exact:true}).selectOption('savings');assert.equal(await page.getByLabel('Account name',{exact:true}).inputValue(),'New savings');
      await page.getByRole('button',{name:'Add account',exact:true}).click();
      assert.equal(await page.evaluate(()=>accounts.find(a=>a.name==='New savings').saver),true);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      if(width===390)await page.screenshot({path:path.join(root,'temp-analysis/accounts-page-'+theme+'.png'),fullPage:true});
      if(width===390&&theme==='dark'){
        await page.evaluate(()=>{budLegacyOpen=true;currentWeekIdx=0;setBudgetView('week');renderBudgetTab();});
        const accountBefore=await page.evaluate(()=>localStorage.getItem('daily_accounts'));
        await page.getByRole('button',{name:/Savings allocation/}).click();
        await page.locator('#sav-amount').fill('75');await page.locator('#sav-amount').press('Tab');
        assert.equal(await page.evaluate(()=>localStorage.getItem('daily_accounts')),accountBefore,'budget draft cannot move money');
        await page.locator('#save-week-btn').click();await dialog.waitFor({state:'visible'});
        assert.equal(await page.locator('#acct-transfer-amount').inputValue(),'75');
        await page.getByLabel('From account',{exact:true}).selectOption('cash');await page.getByLabel('To account',{exact:true}).selectOption('save');
        await page.locator('#acct-transfer-posted').check();await page.getByRole('button',{name:'Update both balances',exact:true}).click();
        const settled=await page.evaluate(()=>localStorage.getItem('daily_accounts'));
        await page.locator('#save-week-btn').click();assert.equal(await dialog.evaluate(d=>d.open),false);
        assert.equal(await page.evaluate(()=>localStorage.getItem('daily_accounts')),settled,'repeat Finish cannot duplicate savings');
        await page.evaluate(()=>{const monday=weekKey(getMondayOf(0));budCyclesSave({config:{frequency:'weekly',anchor:monday},periods:{}});budLegacyOpen=false;renderBudgetTab();});
        await page.locator('#sav-amount').fill('75');await page.locator('#save-week-btn').click();
        assert.equal(await dialog.evaluate(d=>d.open),false,'same range in period mode cannot duplicate the weekly transfer');
        assert.equal(await page.evaluate(()=>localStorage.getItem('daily_accounts')),settled);
      }
      assert.deepEqual(errors,[]);await context.close();
    }
    console.log('Accounts browser checks passed: 320/390/1440px, light/dark; statement archive without balance changes; transfer preview/cancel/confirm; exact balances and single savings movement; preserved unrelated stores; category creation; no overflow or page errors. Synthetic data only.');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
