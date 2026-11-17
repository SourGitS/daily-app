// Isolated existing-user update lifecycle; the three visuals use illustrative UI only.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {plannerFixture,fixtureURL}=require('./planner-browser-fixture.cjs');
const output=path.resolve(__dirname,'../temp-analysis/daily-update-popup');fs.mkdirSync(output,{recursive:true});
const financeSnapshot=()=>({records:JSON.stringify([budgetData,txnData,ledgerData,loadAccounts()]),stores:Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).filter(k=>/daily_budget|daily_accounts|daily_ledger|daily_transactions/.test(k)&&!/collapse|_ui/.test(k)).sort().map(k=>[k,localStorage.getItem(k)]))});
async function openExisting(page){
 await page.evaluate(()=>{dailyUpdatePopupRemove();profileData.budgetRhythmSeen=2;localStorage.setItem('daily_profile',JSON.stringify(profileData));dailyUpdatePopupCheck();});
 await page.locator('#daily-update-dialog').waitFor({state:'visible'});
}
async function checkGeometry(dialog,description){
 const layout=await dialog.evaluate(el=>{
  const box=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  return {dialog:box(el),viewport:{width:innerWidth,height:innerHeight},footer:box(el.querySelector('.du-foot')),scroll:el.scrollHeight-el.clientHeight,
   art:box(el.querySelector('#daily-update-art')),miniature:box(el.querySelector('.du-visual')),
   overflowing:[...el.querySelectorAll('.du-page,h2,p,.du-visual')].filter(node=>node.scrollWidth>node.clientWidth+1).map(node=>node.id||node.className),
   buttons:[...el.querySelectorAll('button')].map(node=>({label:node.getAttribute('aria-label')||node.textContent.trim(),box:box(node)}))};
 });
 assert.ok(layout.dialog.x>=7&&layout.dialog.y>=7&&layout.dialog.right<=layout.viewport.width-7&&layout.dialog.bottom<=layout.viewport.height-7,description+' '+JSON.stringify(layout));
 assert.ok(layout.footer.y>=layout.dialog.y&&layout.footer.bottom<=layout.dialog.bottom+1,description+' footer stays visible');
 assert.ok(layout.scroll<=1,description+' only the page body may scroll');assert.deepEqual(layout.overflowing,[],description+' content fits');
 assert.ok(layout.miniature.x>=layout.art.x-1&&layout.miniature.right<=layout.art.right+1&&layout.miniature.y>=layout.art.y-1&&layout.miniature.bottom<=layout.art.bottom+1,description+' the transformed miniature fits its frame '+JSON.stringify({art:layout.art,miniature:layout.miniature}));
 assert.ok(layout.buttons.every(button=>button.box.width>=43.5&&button.box.height>=43.5),description+' '+JSON.stringify(layout.buttons));
}
(async()=>{
 for(const [engine,type,launch] of [['chrome',chromium,{channel:'chrome',headless:true}],['webkit',webkit,{headless:true}]].filter(([name])=>!process.env.DAILY_UPDATE_BROWSER||process.env.DAILY_UPDATE_BROWSER===name)){
  const browser=await type.launch(launch);
  try{
   for(const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1440,height:900}].filter(size=>!process.env.DAILY_UPDATE_WIDTH||Number(process.env.DAILY_UPDATE_WIDTH)===size.width))for(const theme of ['dark','light'].filter(theme=>!process.env.DAILY_UPDATE_THEME||process.env.DAILY_UPDATE_THEME===theme)){
    const context=await browser.newContext({viewport:size,hasTouch:size.width<1024,timezoneId:'Australia/Sydney',reducedMotion:'reduce',serviceWorkers:'block'});
    await plannerFixture()(context);const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(fixtureURL+'?preview&ui=journal&switch=popup-version3');await page.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady&&!_bootPhase);
    await page.evaluate(theme=>{obDismiss();foodCatalogueState.seenThisSession=true;S.theme=theme;applyTheme();},theme);await openExisting(page);
    const dialog=page.locator('#daily-update-dialog'),before=await page.evaluate(financeSnapshot),originalProfile=await page.evaluate(()=>JSON.stringify({...profileData,budgetRhythmSeen:3}));
    assert.equal(await dialog.locator('#daily-update-back').isDisabled(),true);assert.equal(await dialog.locator('.du-dots button').count(),3);
    for(const [index,label] of ['Finance','Home','Planner'].entries()){
     assert.equal(await dialog.locator('#daily-update-kicker').textContent(),label);assert.equal(await dialog.locator('#daily-update-count').innerText(),(index+1)+' / 3');
     assert.equal(await dialog.locator('#daily-update-art').getAttribute('aria-hidden'),'true');assert.equal(await dialog.locator('#daily-update-art .du-visual').count(),1);
     assert.equal(await dialog.locator('#daily-update-art button,#daily-update-art input,#daily-update-art a').count(),0,'miniatures cannot edit app data');
     assert.equal(await dialog.locator('.du-dots button[aria-current="step"]').getAttribute('aria-label'),'Update '+(index+1)+' of 3');
     await checkGeometry(dialog,[engine,size.width,theme,label].join(' '));
     if(size.width===320||size.width===390)await dialog.screenshot({path:path.join(output,[engine,size.width,theme,label.toLowerCase()].join('-')+'.png')});
     await dialog.locator('#daily-update-copy').scrollIntoViewIfNeeded();await checkGeometry(dialog,'scrolled '+[engine,size.width,theme,label].join(' '));
     assert.deepEqual(await page.evaluate(financeSnapshot),before,'reading or paging updates never changes financial records');
     if(index<2)await dialog.locator('#daily-update-next').click();
    }
    assert.equal(await dialog.locator('#daily-update-next').innerText(),'Got it');
    await dialog.press('ArrowLeft');assert.equal(await dialog.locator('#daily-update-kicker').textContent(),'Home');
    await dialog.getByRole('button',{name:'Update 1 of 3',exact:true}).click();assert.equal(await dialog.locator('#daily-update-kicker').textContent(),'Finance');
    await dialog.getByRole('button',{name:'Update 3 of 3',exact:true}).click();await dialog.getByRole('button',{name:'Got it',exact:true}).click();
    await dialog.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>profileData.budgetRhythmSeen),3);assert.equal(await page.evaluate(()=>localStorage.getItem('daily_profile')),originalProfile);
    await page.evaluate(()=>dailyUpdateRefresh());assert.equal(await dialog.count(),0,'acknowledged profiles do not reopen');assert.deepEqual(await page.evaluate(financeSnapshot),before);
    await page.reload();await page.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady&&!_bootPhase);
    assert.equal(await page.evaluate(()=>profileData.budgetRhythmSeen),3);assert.equal(await dialog.count(),0,'acknowledgement survives reload and an older restored cloud profile');assert.deepEqual(await page.evaluate(financeSnapshot),before);
    if(size.width===390&&theme==='dark'){
     await page.evaluate(()=>{dailyUpdatePopupRemove();profileData.budgetRhythmSeen=2;toggleMenu();dailyUpdatePopupCheck();});assert.equal(await dialog.count(),0,'the open menu postpones the popup');
     await page.getByRole('button',{name:'Close menu',exact:true}).click();await dialog.waitFor({state:'visible'});assert.equal(await page.locator('#side-menu').evaluate(el=>el.inert),true,'the closed menu does not block the popup');await dialog.getByRole('button',{name:'Dismiss updates',exact:true}).click();
     await page.evaluate(()=>{dailyUpdatePopupRemove();profileData.budgetRhythmSeen=2;openTxnModal();dailyUpdatePopupCheck();});assert.equal(await dialog.count(),0,'the expense editor postpones the popup');
     await page.locator('#txn-modal').getByRole('button',{name:'Cancel',exact:true}).click();await dialog.waitFor({state:'visible'});await dialog.getByRole('button',{name:'Dismiss updates',exact:true}).click();
     await page.evaluate(()=>{dailyUpdatePopupRemove();profileData.budgetRhythmSeen=2;_cloudWorkoutReady=false;dailyUpdatePopupCheck();});assert.equal(await dialog.count(),0);
     await page.evaluate(()=>{_cloudWorkoutReady=true;dailyUpdateRefresh();});await dialog.waitFor({state:'visible'});await dialog.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>profileData.budgetRhythmSeen),3);
     await page.evaluate(()=>{profileData.budgetRhythmSeen=2;const overlay=document.getElementById('onboarding-overlay');overlay.classList.remove('hidden');dailyUpdatePopupCheck();});assert.equal(await dialog.count(),0);
     await page.evaluate(()=>document.getElementById('onboarding-overlay').classList.add('hidden'));await dialog.waitFor({state:'visible'});await dialog.getByRole('button',{name:'Dismiss updates',exact:true}).click();
     await page.evaluate(()=>{profileData.budgetRhythmSeen=2;const blocker=document.createElement('dialog');blocker.id='update-test-blocker';document.body.appendChild(blocker);blocker.showModal();dailyUpdatePopupCheck();});assert.equal(await dialog.count(),0);
     await page.evaluate(()=>{const blocker=document.getElementById('update-test-blocker');blocker.close();blocker.remove();});await dialog.waitFor({state:'visible'});
     await page.evaluate(async()=>{await fbRef('profile').child('budgetRhythmSeen').set(3);});await dialog.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>profileData.budgetRhythmSeen),3);
     await openExisting(page);await page.evaluate(()=>localStorage.setItem('daily_profile',JSON.stringify({...profileData,budgetRhythmSeen:6})));await dialog.getByRole('button',{name:'Dismiss updates',exact:true}).click();
     assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('daily_profile')).budgetRhythmSeen),6);assert.equal(await page.evaluate(async()=>(await fbRef('profile').child('budgetRhythmSeen').once('value')).val()),6);
     await openExisting(page);const oldStored=await page.evaluate(()=>localStorage.getItem('daily_profile'));
     await page.evaluate(()=>{auth.currentUser={uid:'other-update-account'};profileData={name:'Other user',onboardingVersion:2,budgetRhythmSeen:2};dailyUpdateDismiss();});
     assert.equal(await dialog.count(),0);assert.equal(await page.evaluate(()=>profileData.budgetRhythmSeen),2);assert.equal(await page.evaluate(()=>localStorage.getItem('daily_profile')),oldStored,'stale-account dismissal cannot acknowledge another account');
     assert.deepEqual(await page.evaluate(financeSnapshot),before);
    }
    assert.deepEqual(errors,[]);console.log('PASS visual update pages, lifecycle and no finance writes',engine,size.width+'x'+size.height,theme);await context.close();
   }
  }finally{await browser.close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
