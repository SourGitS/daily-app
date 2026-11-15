// Network-isolated browser regression checks. Run with Playwright and Chrome available.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const mealPage=`<!doctype html><button id="add" onclick="nutOpenManual()">Add food</button><div id="nutrition-food-overlay"><div id="nutrition-food-box"></div></div>
<script>window.localStorage.setItem('daily-account-active','guest');const getLocalDate=()=>'2026-11-16';const showToast=m=>document.body.dataset.message=m;</script>
<script src="/js/account-storage.js"></script><script src="/js/nutrition.js"></script><script>nutInit();</script>`;
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Australia/Sydney',isMobile:true,hasTouch:true});
    await ctx.route('**/*',async r=>{
      const u=new URL(r.request().url());if(u.host!=='daily-test.invalid')return r.abort();
      let body,type='text/html';
      if(u.pathname==='/app')body=read('index.html').replace('<head>','<head><script src="/tests/sync-browser-fixture.js"></script>')
          .replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"><\/script>/g,'');
      else if(u.pathname==='/meal')body=mealPage;
      else{
        const file=path.resolve(root,'.'+u.pathname);
        if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return r.abort();
        type=({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.webp':'image/webp'})[path.extname(file)];
        if(!type)return r.abort();body=fs.readFileSync(file);
      }
      await r.fulfill({contentType:type,body});
    });
    await ctx.addInitScript(()=>{window.Chart=class{constructor(){this.data={};this.options={}}destroy(){}update(){}resize(){}};});
    const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.goto('https://daily-test.invalid/app?preview&ui=journal#%');
    await p.waitForFunction(()=>window.location.hash==='#home'&&_cloudWorkoutReady);
    assert.ok(!await p.getByText('Something went wrong loading the app').count());
    const status=await p.evaluate(()=>{
      const action=document.getElementById('finance-sync-review'),label=document.getElementById('sync-status');
      const initiallyHidden=getComputedStyle(action).display==='none';
      dailyFinanceIssue('ledger',Error('Synthetic conflict'));setSyncStatus('Synced ✓');
      const visible=!action.hidden,conflict=label.textContent;
      dailyFinanceConflicts.delete('ledger');setSyncStatus('Synced ✓');
      return {initiallyHidden,visible,conflict,cleared:action.hidden};
    });
    assert.deepEqual(status,{initiallyHidden:true,visible:true,conflict:'Financial sync needs review',cleared:true});
    await p.evaluate(()=>{obDismiss();dailyUpdateDismiss();setView('notes')});
    await p.locator('[data-jp="next"]').focus();
    for(const action of ['next','next','prev','today']){
      const b=p.locator('[data-jp="'+action+'"]'),before=await p.locator('.jp-month h2').textContent();await b.press('Enter');
      if(action!=='today')assert.notEqual(await p.locator('.jp-month h2').textContent(),before);
      assert.ok(await b.evaluate(el=>document.activeElement===el));
    }
    const filter=p.locator('[data-jp="filter"][data-filter="note"]');await filter.press('Enter');
    await p.evaluate(()=>jrnPlannerRefreshSchedule());assert.ok(await filter.evaluate(el=>el===document.activeElement));
    const viewport=await p.locator('meta[name=viewport]').getAttribute('content');
    assert.doesNotMatch(viewport,/maximum-scale|user-scalable\s*=\s*(no|0)/i);
    await p.evaluate(()=>{history.pushState(null,'','#%');history.pushState({dailyView:'notes'},'','#notes');history.back()});
    await p.waitForFunction(()=>S.view==='home'&&location.hash==='#home');
    await p.goForward();await p.waitForFunction(()=>S.view==='notes');
    const cdp=await ctx.newCDPSession(p);
    await cdp.send('Emulation.setDeviceMetricsOverride',{mobile:true,width:390,height:844,deviceScaleFactor:2});
    for(const view of ['home','budget','notes']){
      await p.evaluate(view=>setView(view),view);
      await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});
      await p.waitForFunction(()=>visualViewport.scale>=1.9,null,{timeout:4000});
      assert.ok(await p.locator('#view-'+view+' button:visible').count()>0);
    }
    await p.locator('[data-jp="next"]').press('Enter');assert.ok(await p.locator('[data-jp="next"]').evaluate(el=>el===document.activeElement));
    assert.deepEqual(errors,[]);console.log('PASS malformed launch, Back and Forward, repeated month/filter focus, 2× mobile viewport in Home, Finance and Journal');
    await p.close();
    await require('./imported-content-browser.cjs')(ctx);
    for(const fallback of [false,true]){
      const pages=await Promise.all([ctx.newPage(),ctx.newPage()]);
      for(const page of pages){
        if(fallback)await page.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined}));
        await page.goto('https://daily-test.invalid/meal');
      }
      for(const [i,page] of pages.entries()){
        await page.locator('#add').click();await page.locator('#nut-man-name').fill((fallback?'IDB':'Locks')+i);await page.locator('#nut-man-cal').fill('100');
      }
      await Promise.all(pages.map(page=>page.getByRole('button',{name:'Save',exact:true}).click()));
      for(const page of pages)await page.waitForFunction(()=>document.body.dataset.message==='Food logged');
      const label=fallback?'IDB':'Locks';
      for(const page of pages){
        await page.waitForFunction(label=>nutEntries('2026-11-16').filter(entry=>entry.name.startsWith(label)).length===2,label);
        await page.evaluate(label=>nutEditEntry(nutEntries('2026-11-16').find(entry=>entry.name===label+'0').id),label);
      }
      await pages[0].locator('#nut-man-cal').fill('200');
      await pages[0].getByRole('button',{name:'Save',exact:true}).click();
      await pages[0].waitForFunction(()=>document.body.dataset.message==='Entry updated');
      await pages[1].locator('#nut-man-cal').fill('300');
      await pages[1].getByRole('button',{name:'Save',exact:true}).click();
      await pages[1].waitForFunction(()=>document.body.dataset.message?.includes('This entry changed'));
      assert.ok(await pages[1].locator('#nut-man-cal').isVisible());
      await pages[0].reload();
      const names=await pages[0].evaluate(()=>nutEntries('2026-11-16').map(e=>e.name));
      for(const i of [0,1])assert.ok(names.includes((fallback?'IDB':'Locks')+i));
      assert.equal(await pages[0].evaluate(label=>nutEntries('2026-11-16').find(e=>e.name===label+'0').nutrition.calories,label),200);
      console.log('PASS simultaneous meals, live peer refresh and stale-edit protection using '+(fallback?'IndexedDB fallback':'Web Locks'));
      await Promise.all(pages.map(page=>page.close()));
    }
    await ctx.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
