// Complete application, isolated synthetic records and fake Firebase. No production access.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const f=path.resolve(root,decodeURIComponent(req.url.split('?')[0]).slice(1));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(f,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':mime[path.extname(f)]||'text/plain','Content-Security-Policy':"connect-src 'self'"});res.end(err?'Missing':data);});});
const sizes=process.env.AI_WIDTHS?process.env.AI_WIDTHS.split(',').map(w=>[Number(w),900]):[[320,700],[390,844],[844,390],[1024,950],[1440,1000]];
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
  for(const [width,height] of sizes)for(const theme of ['light','dark']){
    const context=await browser.newContext({viewport:{width,height},timezoneId:'America/Los_Angeles',reducedMotion:'reduce'});
    await context.route(/firebaseio\.com|cloudfunctions\.net|api\.open-meteo\.com/,r=>r.abort());
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port+'/tests/sync-browser.html?preview&ui=journal&finance-links&switch=ai-workflow');
    await page.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady);
    await page.getByText('Local preview · sample money only. Changes here do not affect your saved finances.').waitFor();
    await page.evaluate(theme=>{obDismiss();dailyUpdateDismiss();S.theme=theme;applyTheme();weatherCancelRequest();weatherEnsureFresh=()=>Promise.resolve(false);
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.testClipboard=text;}}});openAIHub();},theme);
    const original=await page.evaluate(()=>({transactions:JSON.stringify(txnData),accounts:JSON.stringify(loadAccounts()),budget:JSON.stringify(budgetData),workouts:JSON.stringify(S.sessions)}));
    await page.getByRole('button',{name:'Check sign-in',exact:true}).click();
    assert.match(await page.locator('#daily-ai-identity').textContent(),/Sign-in verified at/);
    await page.getByRole('button',{name:'This week',exact:true}).click();
    assert.match(await page.locator('.daily-ai-bills').textContent(),/No dated bills scheduled|statement/i);
    await page.getByLabel('Your expense request',{exact:true}).fill('Log $18.50 for lunch today on my credit card');
    await page.getByRole('button',{name:'Copy expense request',exact:true}).click();
    const firstId=await page.evaluate(()=>dailyAIState.activeId);
    await page.getByRole('button',{name:'Copy expense request',exact:true}).click();
    assert.equal(await page.evaluate(()=>dailyAIState.activeId),firstId,'repeat Copy retains request ID');
    const payload=await page.evaluate(()=>JSON.stringify({schema:'daily-actions',version:1,source:'test',actions:[{id:dailyAIState.activeId,type:'add_expense',data:{amount:18.5,currency:'AUD',date:dailyAIToday(),merchant:'Lunch <test>',categoryId:'food',paymentAccountId:'card',note:'Reviewed note',essential:true}}]}));
    await page.getByLabel('Assistant’s JSON reply',{exact:true}).fill(payload);
    await page.getByRole('button',{name:'Check expense',exact:true}).click();
    assert.match(await page.locator('.aih-inbox-preview').textContent(),/Reviewed note/);
    assert.equal(await page.evaluate(()=>JSON.stringify(txnData)),original.transactions,'preview cannot write');
    await page.getByRole('button',{name:'Apply reviewed expense',exact:true}).click();
    await page.waitForFunction(()=>dailyAIRequests().some(r=>r.status==='applied'));
    await page.waitForFunction(()=>dailyAIReceipt(dailyAIRequests().find(r=>r.status==='applied')).startsWith('Saved to cloud'));
    const saved=await page.evaluate(id=>txnData.filter(t=>t.aiActionId===id),firstId);assert.equal(saved.length,1);assert.equal(saved[0].essential,true);
    assert.match(await page.locator('#daily-ai-activity').textContent(),/Record: txn_/);
    if(width===390){
      await page.reload();await page.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady);
      await page.getByText('Local preview · sample money only. Changes here do not affect your saved finances.').waitFor();
      await page.evaluate(theme=>{obDismiss();dailyUpdateDismiss();S.theme=theme;applyTheme();openAIHub();},theme);
      assert.equal(await page.evaluate(()=>dailyAIRequests().filter(r=>r.status==='applied').length),1,'audit survives reload');
      await page.getByRole('button',{name:'Retry cloud sync',exact:true}).click();
      await page.waitForFunction(()=>dailyAIReceipt(dailyAIRequests().find(r=>r.status==='applied')).startsWith('Saved to cloud'));
    }
    // Replay is refused both in the assistant UI and the legacy broader Inbox after Undo.
    await page.getByLabel('Assistant’s JSON reply',{exact:true}).fill(payload);
    await page.getByRole('button',{name:'Check expense',exact:true}).click();
    assert.match(await page.locator('#aihub-body [role="alert"]').first().textContent(),/already used/);
    await page.getByRole('button',{name:'Undo expense',exact:true}).click();
    await page.waitForFunction(()=>dailyAIRequests().some(r=>r.status==='undone'));
    assert.equal(await page.evaluate(()=>JSON.stringify(txnData)),original.transactions);
    await page.getByRole('button',{name:'Check expense',exact:true}).click();
    assert.match(await page.locator('#aihub-body [role="alert"]').first().textContent(),/already used/);
    const legacy=await page.evaluate(payload=>{const p=previewDailyActions(parseDailyActions(payload));return applyDailyActions(p.rows,'test');},payload);
    assert.equal(legacy.applied.length,0);assert.match(legacy.failed[0].error,/Assistant tab/);
    const after=await page.evaluate(()=>({accounts:JSON.stringify(loadAccounts()),budget:JSON.stringify(budgetData),workouts:JSON.stringify(S.sessions)}));
    for(const key of Object.keys(after))assert.equal(after[key],original[key],key+' must be unchanged');
    await page.getByRole('tab',{name:'Ask AI',exact:true}).click();await page.locator('#aihub-instructions').waitFor();
    await page.getByRole('tab',{name:'Import actions',exact:true}).click();await page.locator('#aihub-inbox-text').waitFor();
    await page.getByRole('tab',{name:'Assistant',exact:true}).click();
    await page.locator('.daily-ai-setup summary').click();assert.match(await page.locator('.daily-ai-setup').textContent(),/nothing to revoke/);
    const overflow=await page.locator('#aihub-body').evaluate(el=>el.scrollWidth>el.clientWidth+1);assert.equal(overflow,false,'horizontal overflow '+width);
    await page.getByRole('tab',{name:'Assistant',exact:true}).focus();await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(()=>document.activeElement.tagName==='BUTTON'));
    if(width===390&&theme==='light'){
      // Fault injection affects only this fake-Firebase page, never a real account.
      const faults=await page.evaluate(async()=>{
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.testClipboard=text;}}});
        const prepare=async label=>{dailyAIState.request=label;await dailyAIPrepare();dailyAIState.reply=JSON.stringify({schema:'daily-actions',version:1,actions:[{id:dailyAIState.activeId,type:'add_expense',data:{amount:12,currency:'AUD',date:dailyAIToday(),merchant:label,categoryId:'food',paymentAccountId:'card'}}]});dailyAICheck();return dailyAIState.activeId;};
        const before=JSON.stringify(txnData),push=syncBlobPush,reload=auth.currentUser.reload,save=lsSave;
        const id=await prepare('Offline lunch');
        Object.defineProperty(navigator,'onLine',{configurable:true,value:false});
        syncBlobPush=(path,...args)=>{if(!['transactions','aiRequests'].includes(path))push(path,...args);};
        await dailyAIApply();const offline={count:txnData.filter(t=>t.aiActionId===id).length,status:dailyAIReceipt(dailyAIRequest(id))};
        Object.defineProperty(navigator,'onLine',{configurable:true,value:true});syncBlobPush=push;dailyAIRetrySync();
        await new Promise(r=>setTimeout(r,30));const reconnected=dailyAIReceipt(dailyAIRequest(id));await dailyAIUndo(id);
        const revokedId=await prepare('Revoked request');auth.currentUser.reload=async()=>{throw Object.assign(new Error('Revoked'),{code:'auth/user-disabled'});};
        await dailyAIApply();const revoked={count:txnData.filter(t=>t.aiActionId===revokedId).length,error:dailyAIState.error};
        auth.currentUser.reload=reload;await dailyAICheckIdentity();
        const failId=await prepare('Local storage failure');lsSave=(k,...args)=>{if(k!=='daily_transactions')save(k,...args);};await dailyAIApply();lsSave=save;
        const failed={count:txnData.filter(t=>t.aiActionId===failId).length,state:dailyAIRequest(failId).status,error:dailyAIState.error};
        const changedId=await prepare('Changed expense');await dailyAIApply();const changed=txnData.find(t=>t.aiActionId===changedId);changed.note='Manual edit after apply';saveTxns();await dailyAIUndo(changedId);
        const guarded={count:txnData.filter(t=>t.aiActionId===changedId).length,error:dailyAIState.error};
        return {offline,reconnected,revoked,failed,guarded,before};
      });
      assert.equal(faults.offline.count,1);assert.match(faults.offline.status,/Saved locally/);assert.match(faults.reconnected,/Saved to cloud/);
      assert.equal(faults.revoked.count,0);assert.match(faults.revoked.error,/sign-in|Sign-in/);
      assert.equal(faults.failed.count,0);assert.equal(faults.failed.state,'failed');assert.match(faults.failed.error,/could not be saved/);
      assert.equal(faults.guarded.count,1);assert.match(faults.guarded.error,/changed or removed/);
    }
    // Exercise the enabled page with explicit synthetic server receipts. Actual OAuth,
    // network ownership and database transactions are tested in remote/test separately.
    await page.evaluate(()=>{
      window.DAILY_REMOTE_CONFIG={origin:'https://connector.example.test'};
      window.testRemote={enabled:true,account:{uid:auth.currentUser.uid,email:'sample@example.test'},connections:[{id:'synthetic-grant',status:'authorized',scopes:['bills:read','expenses:create'],createdAt:Date.now(),expiresAt:Date.now()+86400000}],operations:[{requestId:'daily_remote_synthetic01',status:'committed',summary:'Lunch · $18.50',recordId:'txn_synthetic01',cloudSave:'verified'}]};
      dailyRemoteFetch=async(path,body)=>{if(path==='/daily/revoke'){testRemote.connections[0].status='revoked';return {status:'revoked',cloudSave:'verified'};}if(path==='/daily/undo'){testRemote.operations[0].status='undone';return {status:'undone',recordId:'txn_synthetic01',cloudSave:'verified'};}return JSON.parse(JSON.stringify(testRemote));};
      dailyAIState.error='';renderAIHub();
    });
    await page.getByRole('button',{name:'Check connection and results',exact:true}).click();
    assert.match(await page.locator('#daily-remote').textContent(),/sample@example.test/);
    assert.match(await page.locator('#daily-remote').textContent(),/expense saved to cloud/);
    page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Undo assistant expense',exact:true}).click();
    assert.match(await page.locator('#daily-remote').textContent(),/undo saved to cloud/);
    page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Revoke connection',exact:true}).click();
    assert.match(await page.locator('#daily-remote').textContent(),/revoked/);assert.equal(await page.getByRole('button',{name:'Revoke connection',exact:true}).count(),0);
    assert.equal(await page.getByRole('link',{name:'Open ChatGPT plugins to connect or reconnect'}).getAttribute('href'),'https://chatgpt.com/plugins');
    await page.locator('.daily-remote-setup summary').click();assert.match(await page.locator('.daily-remote-setup').textContent(),/5 minutes/);
    assert.equal(await page.locator('#aihub-body').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'enabled page fits '+width);
    if(width===390||width===1440){await page.evaluate(()=>{document.getElementById('view-aihub').scrollTop=0;document.getElementById('toast-container').replaceChildren();});await page.screenshot({path:path.join(root,'temp-analysis','ai-'+width+'-'+theme+'.png'),fullPage:false});}
    assert.deepEqual(errors,[]);console.log('PASS '+width+'x'+height+' '+theme);await context.close();
  }
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
