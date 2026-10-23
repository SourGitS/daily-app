const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{const target=path.resolve(root,decodeURIComponent(req.url.split('?')[0]).replace(/^\/daily-app\//,'')||'index.html');if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}fs.readFile(target,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':types[path.extname(target)]||'text/plain'});res.end(err?'Missing':data);});});
const keys=['daily_transactions','daily_ledger','daily_budget','daily_budget_cycles','wt_sessions','wt_weight'];
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true}),url='http://127.0.0.1:'+server.address().port+'/daily-app/tests/sync-browser.html?preview&finance-links';
  try{
    for(const width of [320,390,1440])for(const theme of ['light','dark']){
      const context=await browser.newContext({viewport:{width,height:950}});await context.route(/firebaseio\.com|cloudfunctions\.net/,r=>r.abort());
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.getByText(/Local preview · sample money only/).waitFor();
      const before=await page.evaluate(({theme,keys})=>{S.theme=theme;applyTheme();openAccounts();return Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]));},{theme,keys});
      // The compact presentation keeps tools reachable without changing saved records.
      const originalAccounts=await page.evaluate(()=>localStorage.getItem('daily_accounts'));
      const cashCard=page.locator('.acct-account-card[data-account="cash"]'),card=page.locator('.acct-account-card[data-account="card"]');
      assert.equal(await page.getByRole('button',{name:'Record repayment',exact:true}).isVisible(),false);
      assert.equal(await card.locator('.acct-util-strip').isVisible(),true);
      assert.match(await card.locator('.acct-quick-status').innerText(),/Statement \$400/);
      assert.match(await card.locator('.acct-quick-status').innerText(),/\$100 pending/);
      await cashCard.locator(':scope > summary').click();
      assert.equal(await page.locator('#acct-bal-cash').isVisible(),false);
      assert.match(await cashCard.locator('.acct-collapsed-balance').innerText(),/1,215/);
      await page.evaluate(()=>renderAccountsPage());assert.equal(await cashCard.evaluate(e=>e.open),false);
      await page.getByRole('button',{name:'Edit',exact:true}).click();assert.equal(await cashCard.evaluate(e=>e.open),true);
      await page.getByRole('button',{name:'Done',exact:true}).click();assert.equal(await cashCard.evaluate(e=>e.open),false);
      await cashCard.locator(':scope > summary').press('Enter');assert.equal(await cashCard.evaluate(e=>e.open),true);
      await cashCard.locator(':scope > summary').press('Space');assert.equal(await cashCard.evaluate(e=>e.open),false);
      await cashCard.locator(':scope > summary').press('Enter');
      for(const summary of await page.locator('.acct-options > summary').all())await summary.click();
      await page.evaluate(()=>renderAccountsPage());assert.equal(await card.locator('.acct-options').evaluate(e=>e.open),true);
      assert.equal(await page.getByRole('button',{name:'Record repayment',exact:true}).isVisible(),true);
      assert.equal(await page.getByRole('button',{name:'Import statements',exact:true}).isVisible(),false);
      await page.getByText('Statements & charges (2)',{exact:true}).click();
      assert.equal(await page.getByRole('button',{name:'Add statement',exact:true}).isVisible(),true);
      assert.equal(await page.getByRole('button',{name:'Import statements',exact:true}).isVisible(),true);
      await page.getByText('Statements & charges (2)',{exact:true}).click();
      const cardsFit=await page.locator('.acct-account-card').evaluateAll(cards=>cards.every(c=>c.scrollWidth<=c.clientWidth+1));
      assert.equal(cardsFit,true);assert.equal(await page.evaluate(()=>localStorage.getItem('daily_accounts')),originalAccounts);
      const dialog=page.locator('#acct-tools-dialog'),read=()=>page.evaluate(()=>({balances:loadAccounts().map(a=>a.current),remaining:acctStatementRemaining(loadAccounts().find(a=>a.id==='card')),payments:loadAccounts().find(a=>a.id==='card').repayments}));
      const fit=async()=>{const b=await dialog.evaluate(d=>({l:d.getBoundingClientRect().left,r:d.getBoundingClientRect().right,w:innerWidth,scroll:d.scrollWidth,client:d.clientWidth}));assert.ok(b.l>=0&&b.r<=b.w+1&&b.scroll<=b.client+1,JSON.stringify(b));};
      // The initial pending transfer is only a record; posting reduces both accounts once.
      await page.getByText('Repayments (1)',{exact:true}).click();await page.getByRole('button',{name:'Update status',exact:true}).click();
      await page.getByLabel('Status',{exact:true}).selectOption('posted');await page.locator('#fin-payment-update').check();await fit();
      assert.match(await page.locator('#fin-payment-preview').innerText(),/1,115|1115/);
      await page.getByRole('button',{name:'Save status',exact:true}).click();assert.equal(await dialog.evaluate(d=>d.open),false);
      let state=await read();assert.deepEqual(state.balances,[1115,500,645]);assert.equal(state.remaining,300);assert.equal(state.payments.length,1);
      // A fresh pending payment suggests the amount to match, but affects neither balance.
      await page.getByRole('button',{name:'Record repayment',exact:true}).click();await page.getByLabel('Payment amount',{exact:true}).fill('50');await page.getByLabel('Paid from',{exact:true}).selectOption('cash');
      assert.equal(await page.getByLabel('Amount matched to that statement',{exact:true}).inputValue(),'50');await page.getByLabel('Status',{exact:true}).selectOption('pending');
      assert.equal(await page.locator('#fin-payment-update').isDisabled(),true);await fit();
      if(width===390)await page.screenshot({path:path.join(root,'temp-analysis/finance-repayment-'+theme+'.png')});
      await page.getByRole('button',{name:'Save repayment',exact:true}).click();state=await read();assert.deepEqual(state.balances,[1115,500,645]);assert.equal(state.remaining,300);assert.equal(state.payments.length,2);
      // Statement imports review before save, preserve raw budgets and skip duplicate records.
      await page.getByText('Statements & charges (2)',{exact:true}).click();
      await page.getByRole('button',{name:'Import statements',exact:true}).click();await page.locator('#fin-import-text').fill('statement_date,due_date,closing_balance,minimum,interest,fees,status,source\n2026-08-16,2026-09-10,250,15,2.50,0,paid,"Sample, August"');
      await page.getByRole('button',{name:'Review rows',exact:true}).click();await fit();assert.match(await page.locator('#fin-import-preview').innerText(),/Ready for review/);
      if(width===390)await page.screenshot({path:path.join(root,'temp-analysis/finance-import-'+theme+'.png')});
      await page.getByRole('button',{name:'Import selected statements',exact:true}).click();assert.equal(await dialog.evaluate(d=>d.open),false);
      assert.equal(await page.evaluate(()=>loadAccounts().find(a=>a.id==='card').statementHistory.length),2);assert.deepEqual((await read()).balances,[1115,500,645]);
      await page.getByText('Statements & charges (3)',{exact:true}).click();assert.match(await page.locator('#accounts-list').innerText(),/Sample, August/);
      const currentId=await page.evaluate(()=>acctCurrentStatement(loadAccounts().find(a=>a.id==='card')).id);
      await page.locator('[onclick="acctFinStatementEditOpen(this.dataset.account,this.dataset.record)"][data-record="'+currentId+'"]').click();await page.getByLabel('Fees charged (optional)',{exact:true}).fill('25');await page.getByLabel('Reason for correction',{exact:true}).fill('Checked sample statement');await fit();await page.getByRole('button',{name:'Save correction',exact:true}).click();
      assert.equal(await page.evaluate(()=>loadAccounts().find(a=>a.id==='card').statementCorrections.length),1);assert.equal((await read()).remaining,300);
      // Weekly check-in works without purchase logging and starts a new tracking point.
      await page.getByRole('button',{name:'Check balances',exact:true}).click();await page.locator('[data-check-account="cash"]').fill('1100');await page.locator('[data-check-account="savings"]').fill('525');await fit();
      if(width===390)await page.screenshot({path:path.join(root,'temp-analysis/finance-checkin-'+theme+'.png')});
      await page.getByRole('button',{name:'Save checked balances',exact:true}).click();assert.deepEqual((await read()).balances,[1100,525,645]);
      assert.equal(await page.locator('#accounts-savers-reconcile details').getAttribute('open'),null);
      assert.equal(await page.locator('#accounts-savers-reconcile .card-fig').count(),0);
      await page.locator('#accounts-savers-reconcile summary').click();assert.match(await page.locator('#accounts-savers-reconcile').innerText(),/check is complete/);
      await page.locator('#accounts-savers-reconcile').getByRole('button',{name:'Check again',exact:true}).click();assert.equal(await page.locator('[data-check-account]').count(),1);assert.match(await dialog.innerText(),/Savings balance check/);await page.getByRole('button',{name:'Cancel',exact:true}).click();
      // After checking the bank balance, a payment cannot be reversed over that newer snapshot.
      await page.getByText('Repayments (2)',{exact:true}).click();await page.getByRole('button',{name:'Review / void',exact:true}).click();await page.locator('#fin-payment-void-confirm').check();await page.getByRole('button',{name:'Void repayment',exact:true}).click();assert.match(await page.locator('#acct-tools-error').innerText(),/confirmed/);assert.deepEqual((await read()).balances,[1100,525,645]);
      await page.locator('#fin-payment-reverse').uncheck();await page.getByRole('button',{name:'Void repayment',exact:true}).click();assert.equal((await read()).remaining,400);assert.deepEqual((await read()).balances,[1100,525,645]);
      await page.getByRole('button',{name:'Savings preferences',exact:true}).click();await page.locator('#fin-savings-mode').selectOption('manual');await page.locator('#fin-savings-goal').fill('2000');await fit();await page.getByRole('button',{name:'Save savings preferences',exact:true}).click();assert.match(await page.locator('#accounts-list').innerText(),/manual updates/);
      await page.locator('[onclick="acctFinActivityOpen(this.dataset.account)"][data-account="cash"]').click();await fit();assert.match(await dialog.innerText(),/Balance check/);await page.keyboard.press('Escape');
      await page.getByRole('button',{name:'Record transfer',exact:true}).click();await page.getByLabel('From account',{exact:true}).selectOption('cash');await page.getByLabel('To account',{exact:true}).selectOption('savings');await page.getByLabel('Amount received',{exact:true}).fill('10');await page.locator('#acct-transfer-posted').check();await page.getByRole('button',{name:'Update both balances',exact:true}).click();assert.deepEqual((await read()).balances,[1090,535,645]);
      await page.getByText('Recorded transfers (1)',{exact:true}).first().click();await page.getByRole('button',{name:'Review / void transfer',exact:true}).first().click();await fit();await page.locator('#fin-transfer-void-confirm').check();await page.getByRole('button',{name:'Void transfer',exact:true}).click();assert.deepEqual((await read()).balances,[1100,525,645]);
      const after=await page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),keys);assert.deepEqual(after,before);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      if(width===390){await page.evaluate(()=>document.getElementById('toast-container').replaceChildren());await page.screenshot({path:path.join(root,'temp-analysis/finance-complete-'+theme+'.png'),fullPage:true});}
      // Export carries exact account and source records, including manual corrections and payment audit.
      const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export Finance',exact:true}).click();const download=await downloadPromise;const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
      assert.equal(exported.records.daily_accounts[0].reconciliations.at(-1).confirmedBalance,1100);assert.deepEqual(exported.records.daily_transactions,JSON.parse(before.daily_transactions));
      if(width===390&&theme==='dark'){
        // A mocked quota failure leaves the complete check-in open and all saved balances unchanged.
        await page.getByRole('button',{name:'Check balances',exact:true}).click();await page.locator('[data-check-account="cash"]').fill('900');
        await page.evaluate(()=>{window.__realSave=lsSave;lsSave=(k,v,p)=>{if(k!=='daily_accounts')window.__realSave(k,v,p);};});await page.getByRole('button',{name:'Save checked balances',exact:true}).click();assert.match(await page.locator('#acct-tools-error').innerText(),/could not be saved/);assert.deepEqual((await read()).balances,[1100,525,645]);await page.evaluate(()=>{lsSave=window.__realSave;});await page.keyboard.press('Escape');
        // A complete statement can settle a card that is in credit without a double deduction.
        await page.evaluate(()=>{let list=loadAccounts();const card=list.find(a=>a.id==='card');card.repayments=card.repayments.map(p=>p.status==='pending'?{...p,status:'failed'}:p);list=acctFinPaymentBuild(list,{accountId:'card',id:'credit-payment',date:getLocalDate(),amount:'745',from:'cash',status:'posted',statementId:acctCurrentStatement(card).id,applied:'400',updateBalances:true});saveAccounts(list);openAccounts();accountMarkPaid('card');});
        assert.equal(await page.locator('#acct-statement-remaining').inputValue(),'-100.00');await page.evaluate(()=>accountConfirmStatement());assert.equal((await read()).balances[2],-100);
      }
      // Archive a nonzero savings account from the same dialog that previously rejected it.
      const archiveBefore=await page.evaluate(()=>loadAccounts().find(a=>a.id==='savings'));
      await page.evaluate(()=>acctFinArchiveOpen('savings'));assert.match(await dialog.innerText(),/recorded balance of \$525/);
      await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual(await page.evaluate(()=>loadAccounts().find(a=>a.id==='savings')),archiveBefore);
      await page.evaluate(()=>acctFinArchiveOpen('savings'));await page.getByRole('button',{name:'Archive account',exact:true}).click();
      const archived=await page.evaluate(()=>loadAccounts().find(a=>a.id==='savings'));assert.ok(archived.archivedAt);assert.equal(archived.current,525);assert.deepEqual(archived.history,archiveBefore.history);
      assert.equal(await page.locator('.acct-account-card[data-account="savings"]').count(),0);
      await page.getByText('Archived accounts (1)',{exact:true}).click();await page.getByRole('button',{name:'Restore',exact:true}).click();
      await page.getByRole('button',{name:'Restore account',exact:true}).click();const restored=await page.evaluate(()=>loadAccounts().find(a=>a.id==='savings'));
      assert.equal(restored.archivedAt,undefined);assert.equal(restored.current,525);assert.deepEqual(restored.history,archiveBefore.history);
      assert.equal(await page.locator('.acct-account-card[data-account="savings"]').count(),1);
      assert.deepEqual(errors,[]);console.log(`Complete Finance assertions passed ${width}px ${theme}`);await context.close();
    }
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
