const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  const target=path.resolve(root,decodeURIComponent(req.url.split('?')[0]).replace(/^\/daily-app\//,'')||'index.html');
  if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(target,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':types[path.extname(target)]||'text/plain'});res.end(err?'Missing':data);});
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    for(const width of [320,390,1440])for(const theme of ['light','dark']){
      const context=await browser.newContext({viewport:{width,height:950}});
      await context.route(/firebaseio\.com|cloudfunctions\.net/,route=>route.abort());
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto('http://127.0.0.1:'+server.address().port+'/daily-app/tests/sync-browser.html?preview&ui=journal');
      await page.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady);
      const preserved=await page.evaluate(theme=>{
        obDismiss();dailyUpdateDismiss();S.theme=theme;applyTheme();
        saveAccounts([{id:'cash',name:'Everyday',type:'asset',category:'cash',current:1000,history:[{date:'2026-08-01',balance:800}]},
          {id:'save',name:'Savings',type:'asset',category:'savings',saver:true,current:200,history:[]},
          {id:'card',name:'Credit card',type:'debt',category:'card',tracksStatement:true,current:700,statementBalance:400,dueDate:budDateAdd(getLocalDate(),20),history:[]}]);
        saveVarCats([{id:'food',name:'Food',icon:'cart'}]);
        saveIncCats([{id:'salary',name:'Salary',payMode:'variable',payCycle:'weekly',payDate:getLocalDate()}]);
        budgetData={'2026-08-03':{wk:'2026-08-03',inc_salary:'600',var_food:'75',sav_amount:'150',saved:true,updatedAt:100}};budSaveData('2026-08-03');
        txnData=[{id:'legacy',date:'2026-08-04',amount:15,catId:'food',acctId:'cash',merchant:'Earlier purchase',createdAt:1}];saveTxns();
        ledgerData=[{id:'legacy-income',date:'2026-08-04',amount:600,kind:'income',streamId:'salary',acctId:'cash'}];saveLedger();openAccounts();
        return {week:JSON.stringify(budgetData['2026-08-03']),txn:JSON.stringify(txnData[0]),income:JSON.stringify(ledgerData[0]),history:JSON.stringify(accounts[0].history[0])};
      },theme);
      const balance=async id=>page.evaluate(id=>loadAccounts().find(a=>a.id===id).current,id);
      const openExpense=async (amount,account,update=true,id=null)=>{
        await page.evaluate(id=>openTxnModal(id?{id}:{catId:'food',date:getLocalDate()}),id);
        await page.locator('#txn-amount').fill(String(amount));await page.locator('#txn-account').selectOption(account);
        if(await page.locator('#txn-update-balance').isEnabled())await page.locator('#txn-update-balance').setChecked(update);
      };
      const saveExpense=async()=>{
        await page.getByRole('button',{name:/^Save expense$|^Save changes$/}).click();
        assert.equal(await page.locator('#txn-modal').evaluate(e=>e.classList.contains('hidden')),true,await page.locator('#txn-err').innerText());
      };
      const connect=async id=>{
        await page.evaluate(()=>openAccounts());
        const options=page.locator('.acct-options[data-account="'+id+'"]');if(!await options.evaluate(e=>e.open))await options.locator(':scope > summary').click();
        await page.locator('.acct-link-status button[data-account="'+id+'"]').click();
        await page.locator('#acct-link-mode').selectOption('linked');
        const d=page.locator('#acct-tools-dialog');
        assert.equal(await d.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
        await page.getByRole('button',{name:'Save tracking choice',exact:true}).click();
        assert.equal(await d.evaluate(e=>e.open),false,await page.locator('#acct-tools-error').innerText());
      };
      // Manual is the default, including new spending assigned to an account.
      await openExpense(20,'cash');assert.equal(await page.locator('#txn-update-balance').isEnabled(),false);await saveExpense();assert.equal(await balance('cash'),1000);
      // Setup from an expense keeps its draft and still requires explicit account confirmation.
      await openExpense(25.50,'cash');await page.locator('#txn-merchant').fill('Draft purchase');
      const beforeSetup=await page.evaluate(()=>({accounts:localStorage.getItem('daily_accounts'),txns:localStorage.getItem('daily_transactions')}));
      await page.locator('#txn-balance-setup').click();await page.locator('#acct-tools-dialog').waitFor({state:'visible'});
      assert.equal(await page.locator('#acct-link-mode').inputValue(),'linked');
      await page.keyboard.press('Tab');assert.equal(await page.locator('#acct-tools-dialog').evaluate(d=>d.contains(document.activeElement)),true);
      await page.keyboard.press('Escape');assert.equal(await page.locator('#acct-tools-dialog').evaluate(d=>d.open),false);
      assert.equal(await page.locator('#txn-modal').evaluate(d=>d.classList.contains('hidden')),false);
      assert.equal(await page.locator('#txn-amount').inputValue(),'25.5');assert.equal(await page.locator('#txn-merchant').inputValue(),'Draft purchase');
      assert.deepEqual(await page.evaluate(()=>({accounts:localStorage.getItem('daily_accounts'),txns:localStorage.getItem('daily_transactions')})),beforeSetup);
      await page.locator('#txn-balance-setup').click();await page.getByRole('button',{name:'Save tracking choice',exact:true}).click();
      assert.equal(await page.locator('#acct-tools-dialog').evaluate(d=>d.open),false,await page.locator('#acct-tools-error').innerText());
      assert.equal(await page.locator('#txn-update-balance').isEnabled(),true);assert.equal(await page.locator('#txn-update-balance').isChecked(),false);
      assert.equal(await page.locator('#txn-merchant').inputValue(),'Draft purchase');assert.equal(await balance('cash'),1000);
      assert.equal(await page.evaluate(()=>localStorage.getItem('daily_transactions')),beforeSetup.txns);
      await page.locator('.txn-flag').filter({has:page.locator('#txn-update-balance')}).click();assert.equal(await page.locator('#txn-update-balance').isChecked(),true);
      await page.locator('#txn-update-balance').focus();await page.keyboard.press('Space');assert.equal(await page.locator('#txn-update-balance').isChecked(),false);
      await page.evaluate(()=>closeTxnModal());
      await connect('card');await connect('save');
      await openExpense(25.50,'cash');await saveExpense();assert.equal(await balance('cash'),974.5);
      const expenseId=await page.evaluate(()=>txnData.at(-1).id);
      await page.evaluate(()=>txnSave());assert.equal(await page.evaluate(()=>txnData.length),3,'closed form cannot save twice');
      await openExpense(35.50,'cash',true,expenseId);await saveExpense();assert.equal(await balance('cash'),964.5);
      await openExpense(35.50,'cash',true,expenseId);await page.getByRole('button',{name:'Delete this expense'}).click();assert.equal(await balance('cash'),1000);
      await openExpense(60,'card');await saveExpense();assert.equal(await balance('card'),760);
      // Actual income has its own optional destination. Corrections apply the difference once.
      await page.evaluate(()=>budPeriodRecord('income'));
      await page.locator('#bp-form [name="amount"]').fill('500');await page.locator('#bp-form [name="account"]').selectOption('cash');
      assert.equal(await page.locator('#bp-form [name="updateBalance"]').isChecked(),true);
      if(width===390){await page.evaluate(()=>document.getElementById('toast-container').replaceChildren());await page.screenshot({path:path.join(root,'temp-analysis/finance-income-'+theme+'.png')});}
      await page.getByRole('button',{name:'Confirm received',exact:true}).click();
      assert.equal(await page.locator('#bud-period-dialog').evaluate(e=>e.open),false,await page.locator('#bp-error').innerText());assert.equal(await balance('cash'),1500);
      const incomeId=await page.evaluate(()=>ledgerData.at(-1).id);
      await page.evaluate(id=>budPeriodEdit(id),incomeId);await page.locator('#bp-form [name="amount"]').fill('510');await page.locator('#bp-form button[type="submit"]').click();
      assert.equal(await balance('cash'),1510);assert.equal(await page.evaluate(()=>Number(budgetData[txnWeekOf(getLocalDate())].inc_salary)),510);
      // A weekly balance check takes precedence over entries already included in it.
      await page.evaluate(()=>openAccounts());await page.locator('#acct-bal-cash').fill('1400');
      await page.locator('[onclick="accountUpdateBalanceFromInput(\'cash\')"]').click();assert.equal(await balance('cash'),1400);
      await page.evaluate(id=>budPeriodEdit(id),incomeId);await page.locator('#bp-form [name="amount"]').fill('520');await page.locator('#bp-form button[type="submit"]').click();assert.equal(await balance('cash'),1400);
      await openExpense(10,'cash');await saveExpense();assert.equal(await balance('cash'),1390);
      await openExpense(20,'cash',false);await saveExpense();assert.equal(await balance('cash'),1390);
      await page.evaluate(()=>openAccounts());await page.getByRole('button',{name:'Record transfer',exact:true}).click();
      await page.getByLabel('From account',{exact:true}).selectOption('cash');await page.getByLabel('To account',{exact:true}).selectOption('save');
      await page.getByLabel('Amount received',{exact:true}).fill('75');await page.locator('#acct-transfer-posted').check();
      await page.getByRole('button',{name:'Update both balances',exact:true}).click();assert.equal(await balance('cash'),1315);assert.equal(await balance('save'),275);
      assert.equal(await page.evaluate(()=>ledgerSavingsMovement(getLocalDate(),getLocalDate()).contributions),75);
      // Local failure and a remote edit while a form is open must leave the new expense unsaved.
      if(width===390&&theme==='dark'){
        await openExpense(50,'cash');
        await page.evaluate(()=>{window.__testSave=lsSave;lsSave=(k,v,p)=>{if(k!=='daily_transactions')window.__testSave(k,v,p);};});
        await page.getByRole('button',{name:'Save expense',exact:true}).click();assert.match(await page.locator('#txn-err').innerText(),/could not be saved/);assert.equal(await balance('cash'),1315);
        await page.evaluate(()=>{lsSave=window.__testSave;});await saveExpense();assert.equal(await balance('cash'),1265);
        await openExpense(5,'cash');await page.evaluate(()=>{const list=loadAccounts();list[0].name='Everyday updated';saveAccounts(list);});
        await page.getByRole('button',{name:'Save expense',exact:true}).click();assert.match(await page.locator('#txn-err').innerText(),/changed/);assert.equal(await balance('cash'),1265);await page.evaluate(()=>closeTxnModal());
        const incomeCount=await page.evaluate(()=>ledgerData.length);
        await page.evaluate(()=>budPeriodRecord('income'));await page.locator('#bp-form [name="amount"]').fill('30');await page.locator('#bp-form [name="account"]').selectOption('cash');await page.locator('#bp-form [name="duplicate"]').check();
        await page.evaluate(()=>{lsSave=(k,v,p)=>{if(k!=='daily_ledger')window.__testSave(k,v,p);};});
        await page.getByRole('button',{name:'Confirm received',exact:true}).click();assert.match(await page.locator('#bp-error').innerText(),/could not be saved/);assert.equal(await balance('cash'),1265);
        await page.evaluate(()=>{lsSave=window.__testSave;window.__testBudgetSave=budSaveData;budSaveData=()=>{throw Error('Synthetic storage failure');};});
        await page.getByRole('button',{name:'Confirm received',exact:true}).click();assert.equal(await balance('cash'),1295);assert.equal(await page.evaluate(()=>ledgerData.length),incomeCount+1);
        assert.match(await page.locator('#bud-period-dialog').innerText(),/Income saved/);
        await page.evaluate(()=>{budSaveData=window.__testBudgetSave;});await page.getByRole('button',{name:'Retry weekly total',exact:true}).click();
        assert.equal(await balance('cash'),1295);assert.equal(await page.evaluate(()=>ledgerData.length),incomeCount+1);assert.equal(await page.evaluate(()=>Number(budgetData[txnWeekOf(getLocalDate())].inc_salary)),550);
        await page.evaluate(()=>openAccounts());
        const cashOptions=page.locator('.acct-options[data-account="cash"]');if(!await cashOptions.evaluate(e=>e.open))await cashOptions.locator(':scope > summary').click();
        await page.locator('.acct-link-status button[data-account="cash"]').click();await page.locator('#acct-link-mode').selectOption('manual');await page.getByRole('button',{name:'Save tracking choice',exact:true}).click();
        await openExpense(8,'cash');assert.equal(await page.locator('#txn-update-balance').isEnabled(),false);await saveExpense();assert.equal(await balance('cash'),1295);
        await connect('cash');assert.equal(await balance('cash'),1295,'re-enabling does not replay earlier entries');await openExpense(2,'cash');await saveExpense();assert.equal(await balance('cash'),1293);
        await page.evaluate(()=>{openAccounts();accountMarkPaid('card');});await page.locator('#acct-statement-remaining').fill('300');
        await page.evaluate(()=>accountConfirmStatement());assert.equal(await balance('card'),300);assert.equal(await page.evaluate(()=>loadAccounts().find(a=>a.id==='card').statementBalance),0);
        assert.equal(await page.evaluate(()=>loadAccounts().find(a=>a.id==='card').balanceCheckpoints.at(-1).calculatedBalance),760);
      }
      // Existing history is retained verbatim; re-reading cannot replay entries.
      const after=await page.evaluate(()=>({week:JSON.stringify(budgetData['2026-08-03']),txn:JSON.stringify(txnData.find(x=>x.id==='legacy')),income:JSON.stringify(ledgerData.find(x=>x.id==='legacy-income')),history:JSON.stringify(accounts[0].history[0])}));
      assert.deepEqual(after,preserved);
      await page.evaluate(()=>{accounts=loadAccounts();openAccounts();});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      if(width===390){await page.evaluate(()=>document.getElementById('toast-container').replaceChildren());await page.screenshot({path:path.join(root,'temp-analysis/finance-linked-accounts-'+theme+'.png'),fullPage:true});}
      await openExpense(8,'cash');
      assert.equal(await page.locator('#txn-modal-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
      if(width===390){await page.evaluate(()=>document.getElementById('toast-container').replaceChildren());await page.screenshot({path:path.join(root,'temp-analysis/finance-linked-expense-'+theme+'.png')});}
      assert.deepEqual(errors,[]);console.log(`Linked Finance assertions passed ${width}px ${theme}`);await context.close();
    }
    const context=await browser.newContext();await context.route(/firebaseio\.com|cloudfunctions\.net/,route=>route.abort());
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port+'/daily-app/tests/sync-browser.html?preview&finance-links');
    await page.getByText(/Local preview · sample money only/).waitFor();
    const check=()=>page.evaluate(()=>({balances:loadAccounts().map(a=>a.current),stored:JSON.parse(localStorage.getItem('daily_accounts')).map(a=>a.current),
      stamps:['daily_accounts','daily_transactions','daily_ledger'].map(k=>localStorage.getItem(k+'_ts'))}));
    const restored=await check();assert.deepEqual(restored,{balances:[1215,500,745],stored:[1000,500,700],stamps:['500','500','500']});
    await page.reload();await page.getByText(/Local preview · sample money only/).waitFor();assert.deepEqual(await check(),restored);assert.deepEqual(errors,[]);
    await context.close();console.log('Populated mock-cloud restore and reload preserve raw balances, records and timestamps; projections reconstruct exactly.');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
