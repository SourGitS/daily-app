// Requires Playwright + Chromium. Synthetic Firebase fixture only; no production account.
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  const rel=decodeURIComponent(req.url.split('?')[0]).replace(/^\/daily-app\//,'');
  const target=path.resolve(root,rel||'index.html');
  if(!target.startsWith(root+path.sep)&&target!==root){res.writeHead(403);res.end();return;}
  fs.readFile(target,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':types[path.extname(target)]||'text/plain'});res.end(err?'Missing':data);});
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const context=await browser.newContext({permissions:['notifications']});
    await context.route(/firebaseio\.com|cloudfunctions\.net/,route=>route.abort());
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/daily-app/tests/sync-browser.html?preview&ui=journal');
    await page.waitForFunction(()=>typeof openSettingsSection==='function'&&typeof S!=='undefined');
    await page.evaluate(()=>{obDismiss();setView('settings');openSettingsSection('account');});
    await page.locator('#rem-workout-enabled').waitFor({state:'attached'});
    for(const width of [320,390,1440]){
      await page.setViewportSize({width,height:900});
      await page.waitForTimeout(250);
      await page.evaluate(()=>openSettingsSection('account'));
      await page.locator('#reminders-inner').waitFor({state:'visible'});
      for(const light of [false,true]){
        await page.evaluate(light=>{S.theme=light?'light':'dark';applyTheme();},light);
        const geometry=await page.locator('#reminders-inner').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
        assert.ok(geometry.scroll<=geometry.width+1,JSON.stringify({width,light,geometry}));
        await page.locator('#rem-quiet-start').scrollIntoViewIfNeeded();
        const quiet=await page.locator('#rem-quiet-start').boundingBox();
        assert.ok(quiet&&quiet.y>=0&&quiet.y+quiet.height<=900,'Quiet hours remain reachable');
        if(width===390||width===1440)await page.screenshot({path:path.join(root,'temp-analysis/notifications-'+width+'-'+(light?'light':'dark')+'.png')});
      }
    }
    await page.locator('label.toggle-switch').filter({has:page.locator('#rem-workout-enabled')}).click();
    await page.locator('#rem-workout-time').fill('09:15');
    await page.locator('#rem-workout-time').dispatchEvent('change');
    assert.equal(await page.evaluate(()=>loadReminders().workout.time),'09:15');
    await page.getByRole('button',{name:'Enable notifications',exact:true}).click();
    assert.match(await page.locator('#notification-status').innerText(),/awaiting push-service/);
    // Exercise real IndexedDB transactions concurrently without producing an OS alert.
    const receipts=await page.evaluate(async()=>{
      const token=crypto.randomUUID();
      await dailyNotifyBind({scope:dailyNotifyScope(),token,enabled:true,remote:false});
      return Promise.all([dailyNotifyClaim(token,'budget_2026-10-09','budget',20735),dailyNotifyClaim(token,'budget_2026-10-09','budget',20735)]);
    });assert.deepEqual(receipts.sort(),[false,true]);
    await page.evaluate(async()=>{
      const b=await dailyNotifyBinding();await dailyNotifyOpen({scope:b.scope,token:b.token,route:'stats'});
    });
    assert.equal(await page.evaluate(()=>S.view),'stats');
    assert.equal(await page.evaluate(()=>statsSubTab),'review');
    await page.evaluate(async()=>{
      const b=await dailyNotifyBinding();await dailyNotifyWorkoutSaved('2026-10-09');
      if(await dailyNotifyClaim(b.token,'workout_2026-10-09','workout',20735))throw new Error('Saved workout not suppressed');
    });
    await page.evaluate(()=>dailyNotifyStop());
    assert.equal(await page.evaluate(async()=>(await dailyNotifyBinding()).enabled),false);
    await page.evaluate(async()=>{
      const b=await dailyNotifyBinding();await dailyNotifyOpen({scope:b.scope,token:b.token,route:'log'});
    });assert.equal(await page.evaluate(()=>S.view),'stats');
    await page.evaluate(async()=>{
      await dailyNotifyBind({scope:'user:someone-else',token:crypto.randomUUID(),enabled:true,remote:true});
      await dailyNotifyResume();
    });assert.equal(await page.evaluate(async()=>(await dailyNotifyBinding()).enabled),false);
    assert.deepEqual(errors,[]);
    const workerPage=await context.newPage();
    await workerPage.goto(origin+'/daily-app/tests/notifications-worker.html');
    await workerPage.evaluate(()=>navigator.serviceWorker.ready);
    const worker=context.serviceWorkers()[0];
    assert.ok(worker,'Native service worker registered');
    const pushToken=await workerPage.evaluate(async()=>{
      const token=crypto.randomUUID();await dailyNotifyBind({scope:'user:test',token,enabled:true,remote:true});return token;
    });
    const sent=await worker.evaluate(async token=>{
      const payload={token,scope:'user:test',channel:'budget',id:'budget_2026-10-09',day:20735,route:'budget',body:'Synthetic reminder',expiresAt:Date.now()+60000};
      async function push(data){const jobs=[];const e=new Event('push');e.data={json:()=>data};e.waitUntil=p=>jobs.push(p);self.dispatchEvent(e);await Promise.all(jobs);}
      await push(payload);await push(payload);
      await push({...payload,scope:'user:other',id:'budget_2026-10-10'});
      return (await self.registration.getNotifications()).map(n=>({tag:n.tag,data:n.data}));
    },pushToken);
    assert.equal(sent.length,1);assert.equal(sent[0].tag,'budget_2026-10-09');
    const click=await worker.evaluate(async()=>{
      const notes=await self.registration.getNotifications(),jobs=[];let destination='';
      const saved=self.clients.matchAll;
      self.clients.matchAll=async()=>[{url:self.registration.scope+'tests/notifications-worker.html',navigate:async url=>destination=url,focus:async()=>{}}];
      const e=new Event('notificationclick');e.notification=notes[0];e.waitUntil=p=>jobs.push(p);self.dispatchEvent(e);await Promise.all(jobs);
      self.clients.matchAll=saved;return destination;
    });
    assert.equal(new URL(click).searchParams.get('dailyNotification'),'budget');
    assert.ok(new URL(click).pathname.startsWith('/daily-app/'));
    await workerPage.evaluate(async()=>{const b=await dailyNotifyBinding();await dailyNotifyPatch(b.scope,b.token,{enabled:false});});
    await worker.evaluate(async token=>{
      const jobs=[],e=new Event('push');e.data={json:()=>({token,scope:'user:test',channel:'budget',id:'budget_2026-10-10',day:20736,route:'budget',expiresAt:Date.now()+60000})};e.waitUntil=p=>jobs.push(p);self.dispatchEvent(e);await Promise.all(jobs);
      if((await self.registration.getNotifications()).length)throw new Error('Opt-out did not block a queued push');
    },pushToken);
    console.log('Browser checks passed: 320/390/1440px; both themes; settings persistence; no overflow; IndexedDB duplicate claim; weekly-review destination; workout suppression; opt-out; account isolation.');
    console.log('Native worker checks passed with synthetic push events: notification display; duplicate suppression; stale-account rejection; click URL under /daily-app/; opt-out blocks queued alerts. Not remote push delivery.');
    await context.close();
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
