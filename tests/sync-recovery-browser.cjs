'use strict';
// Synthetic cloud and isolated storage only; download a rejected change through the real UI.
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {chromium,webkit}=require('playwright');
const {plannerFixture,fixtureURL}=require('./planner-browser-fixture.cjs');
async function check(browser,width){
  const context=await browser.newContext({viewport:{width,height:width<1000?844:900},timezoneId:'Australia/Sydney',acceptDownloads:true});
  try{
    await plannerFixture()(context);const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(fixtureURL+'?preview&switch=sync-recovery-'+width);
    await page.waitForFunction(()=>_cloudWorkoutReady&&!_bootPhase);
    await page.evaluate(()=>{
      obDismiss();dailyUpdateDismiss();
      const original=fbRef;let newer=false;
      fbRef=path=>{
        const ref=original(path);if(path!=='budgetVarCats')return ref;
        return {transaction(fn,complete,applyLocally){
          const write=()=>ref.transaction(fn,complete,applyLocally);
          if(newer)return write();newer=true;
          return ref.set({v:JSON.stringify([{id:'shared',name:'Cloud sample category'}]),t:Date.now()+60000}).then(write);
        }};
      };
      lsSave('daily_budget_var_cats',[{id:'mine',name:'My retained sample category'}],'budgetVarCats');
    });
    await page.waitForFunction(()=>dailyBlobRecoveryKeys().length===1);
    const open=async()=>{
      await page.evaluate(()=>{setView('settings');openSettingsSection('export');setSyncStatus('Synced ✓');});
      const review=page.locator('#finance-sync-review');assert.equal(await review.isVisible(),true);
      assert.equal(await review.innerText(),'Review saved changes');await review.click();
      const dialog=page.getByRole('dialog',{name:'Review saved changes'});await dialog.waitFor();return dialog;
    };
    let dialog=await open();
    assert.match(await dialog.innerText(),/Expense categories/);
    assert.equal(await dialog.evaluate(element=>{const r=element.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&element.scrollWidth<=element.clientWidth+1;}),true);
    const [download]=await Promise.all([page.waitForEvent('download'),dialog.getByRole('button',{name:'Download my change'}).click()]);
    const payload=JSON.parse(await fs.readFile(await download.path(),'utf8'));
    assert.equal(payload.app,'daily');assert.deepEqual(Object.keys(payload.data),['daily_budget_var_cats']);
    assert.deepEqual(JSON.parse(payload.data.daily_budget_var_cats),[{id:'mine',name:'My retained sample category'}]);
    await dialog.getByRole('button',{name:'Done',exact:true}).click();
    await page.reload();await page.waitForFunction(()=>_cloudWorkoutReady&&!_bootPhase);
    assert.equal(await page.evaluate(()=>dailyBlobRecoveryKeys().length),1,'a reload retains the rejected change');
    dialog=await open();
    page.once('dialog',event=>event.accept());
    await dialog.getByRole('button',{name:'Keep current version'}).click();await dialog.waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>dailyBlobRecoveryKeys().length),0);
    assert.equal(await page.locator('#finance-sync-review').isHidden(),true);
    assert.deepEqual(errors,[]);
    console.log('PASS '+width+'px rejected save: visible review, restorable download, reload and explicit resolution');
  }finally{await context.close();}
}
(async()=>{
 const browser=process.argv.includes('--webkit')?await webkit.launch():await chromium.launch({channel:'chrome'});
 try{for(const width of [390,1440])await check(browser,width);}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
