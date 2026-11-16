// Exercise the full app on rotation. Chrome's device emulation does not implement
// -webkit-touch-callout, so opt into that specific iOS CSS feature query in the fixture.
// The simulated hardware insets are delivered by the browser's real CSS env() mechanism.
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {plannerFixture, plannerSampleFiles, fixtureURL} = require('./planner-browser-fixture.cjs');

const portrait = {width:390, height:844, left:0, right:0, bottom:34, angle:0};
const landscape = {width:844, height:390, left:47, right:47, bottom:21, angle:90};
const ref = process.env.DAILY_LANDSCAPE_REF;

async function rotate(client, page, size) {
  const {width,height,left,right,bottom,angle} = size;
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,height,screenWidth:width,screenHeight:height,deviceScaleFactor:2,mobile:true,
    screenOrientation:{type:!angle?'portraitPrimary':angle===90?'landscapePrimary':'landscapeSecondary',angle}
  });
  await client.send('Emulation.setSafeAreaInsetsOverride', {insets:{top:0,left,right,bottom}});
  // Geometry can settle a frame after the visual viewport and device metrics.
  await page.waitForFunction(({width,height})=>innerWidth===width && innerHeight===height, {width,height});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}

async function inspect(page) {
  return page.evaluate(()=>{
    const el = id => document.getElementById(id);
    const box = node => {
      const {left,top,right,bottom,width,height} = node.getBoundingClientRect();
      return {left,top,right,bottom,width,height};
    };
    const main=el('app-main'),deck=el('swipe-deck'),view=el('view-'+S.view),nav=el('bottom-nav');
    const marker=el('nav-pill'),active=nav.querySelector('.nav-btn.active');
    const buttons=[...nav.querySelectorAll('button[data-view]')].map(button=>{
      const b=box(button);
      return {...b,hit:button.contains(document.elementFromPoint(b.left+b.width/2,b.top+b.height/2))};
    });
    // Verify the emulated environment values themselves. Without this the test could
    // silently become another plain desktop window resized to phone dimensions.
    const probe=document.createElement('div');
    probe.style.cssText='position:fixed;inset:0;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
    const css=getComputedStyle(probe);
    const insets={left:parseFloat(css.paddingLeft),right:parseFloat(css.paddingRight),bottom:parseFloat(css.paddingBottom)};
    probe.remove();
    return {app:box(el('app')),main:box(main),panel:box(view),deck:box(deck),nav:box(nav),
      active:active&&box(active),pill:box(marker),buttons,insets,view:S.view,
      paddingBottom:parseFloat(getComputedStyle(main).paddingBottom),height:innerHeight,width:innerWidth,
      overflow:document.documentElement.scrollWidth>innerWidth+1};
  });
}

async function check(page, size, route, stage) {
  const m=await inspect(page), label=stage+' '+route+' '+size.width+'×'+size.height;
  const near=(a,b,detail)=>assert.ok(Math.abs(a-b)<=1,label+' '+detail+' ('+a+' vs '+b+')');
  assert.deepEqual(m.insets,{left:size.left,right:size.right,bottom:size.bottom},label+' browser hardware insets');
  assert.equal(m.view,route,label+' active destination');
  assert.ok(!m.overflow,label+' no horizontal document overflow');
  near(m.app.top,0,'shell starts at top');
  near(m.app.bottom,size.height,'shell reaches bottom');
  if(size.angle){
    near(m.nav.top,0,'left rail top');
    near(m.nav.bottom,size.height,'left rail bottom');
    near(m.main.left,m.nav.right,'content meets the inside edge of the rail');
    near(m.main.right,size.width-size.right,'content clears right cutout once');
    near(m.deck.bottom,m.main.bottom,'deck fills main height below header');
    near(m.panel.bottom,m.main.bottom,'active panel reaches bottom');
    assert.equal(m.paddingBottom,0,label+' no portrait bottom-bar reservation');
    assert.ok(m.buttons.every(b=>b.left>=size.left&&b.right<=m.main.left+1&&b.bottom<=size.height-size.bottom+1),label+' all rail controls clear cutout/home indicator');
    assert.ok(m.pill.left>=size.left&&m.pill.right<=m.main.left+1,label+' active selection clears the cutout');
  } else {
    near(m.nav.bottom,size.height,'bottom navigation at portrait bottom');
    near(m.main.left,0,'full portrait width');
    assert.ok(m.deck.bottom<=m.nav.top+1&&m.deck.bottom>=m.nav.top-24,label+' content and portrait navigation meet');
  }
  near(m.panel.left,m.main.left,'selected swipe panel aligned to main');
  near(m.panel.width,m.main.width,'selected swipe panel width');
  assert.ok(m.buttons.length===5 && m.buttons.every(b=>b.hit),label+' five independently reachable tabs');
}

async function checkLateInset(page,client,side) {
  // iOS can revise its usable width after reporting the final orientation. Change just
  // the hardware insets, without a window resize call that would explicitly fix the pager.
  const insetChange=async left=>{
    const size={...side,left};
    await client.send('Emulation.setSafeAreaInsetsOverride',{insets:{left,right:size.right,top:0,bottom:size.bottom}});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await check(page,size,'notes','late inset');
  };
  await page.waitForTimeout(650); // past both the pager animation and its last settle timer
  await insetChange(0);
  await page.getByRole('button',{name:'Search Planner',exact:true}).tap();
  const search=page.locator('#jrn-search');
  await search.fill('Internet');
  await page.waitForFunction(()=>document.activeElement?.id==='jrn-search');
  await page.waitForTimeout(650); // allow the field focus and its viewport updates to finish
  await insetChange(59);
  assert.equal(await search.inputValue(),'Internet');
  assert.ok(await search.evaluate(e=>e===document.activeElement),'focused field survives inset change');
  await page.getByRole('button',{name:'Search Planner',exact:true}).tap();
}

async function dismissExpenseKeyboard(page) {
  const records=()=>page.evaluate(()=>JSON.stringify([txnData,ledgerData]));
  const before=await records();
  await page.locator('[data-shared-add]:visible').tap();
  await page.locator('#shared-add-choices [data-add-kind="expense"]').tap();
  const modal=page.locator('#txn-modal');
  await modal.getByRole('textbox',{name:'Amount in dollars'}).fill('42.10');
  // The desktop browser has no on-screen iPhone keyboard. Shrink only its visual viewport,
  // just as the keyboard does, leaving the app’s layout viewport at the portrait height.
  const geometry=await modal.evaluate(el=>{
    Object.defineProperty(visualViewport,'height',{configurable:true,value:420});
    Object.defineProperty(visualViewport,'offsetTop',{configurable:true,value:18});
    visualViewport.dispatchEvent(new Event('resize'));
    return [el.style.height,el.style.top,document.activeElement.id];
  });
  assert.deepEqual(geometry,['420px','18px','txn-amount']);
  await modal.getByRole('button',{name:'Close expense form'}).tap();
  await page.evaluate(()=>{
    delete visualViewport.height;
    delete visualViewport.offsetTop;
    visualViewport.dispatchEvent(new Event('resize'));
  });
  assert.ok(await modal.isHidden());
  assert.ok(await modal.evaluate(el=>['top','left','right','bottom','width','height'].every(key=>!el.style[key])),
    'closing the expense editor releases all keyboard viewport overrides');
  assert.equal(await records(),before,'dismissing the expense leaves the sample ledger intact');
}

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
      timezoneId:'Australia/Sydney',reducedMotion:'reduce',serviceWorkers:'block'});
    await plannerFixture(ref)(context);
    const sample=plannerSampleFiles(ref);
    await context.route('**/*.css',route=>{
      const url=new URL(route.request().url());
      if(url.origin!==new URL(fixtureURL).origin)return route.abort();
      const file=sample(url.pathname.slice(1));
      if(!file)return route.fulfill({status:404,body:''});
      const css=file.body.toString().replace(/\(-webkit-touch-callout:\s*none\)/g,'(display: block)');
      return route.fulfill({...file,body:css});
    });
    const page=await context.newPage(),client=await context.newCDPSession(page),errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    await page.goto(fixtureURL+'?preview&planner-review&home-cards&ui=journal&accent=385c72#home');
    await page.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady&&document.querySelector('.cat-grid'));
    await page.evaluate(()=>{obDismiss();dailyUpdateDismiss();foodCatalogueState.seenThisSession=true;});
    for(const [i,route] of ['home','budget','log','food','notes'].entries()){
      await rotate(client,page,portrait);
      await page.locator('#bottom-nav [data-view="'+route+'"]').tap();
      await page.waitForFunction(route=>S.view===route&&!deckSnapH&&Math.abs(deckMisalignPx())<=1,route);
      await check(page,portrait,route,'initial portrait');
      if(route==='budget')await dismissExpenseKeyboard(page);
      const side={...landscape,...(i%2?{angle:270,left:0,right:47}:{})};
      // First landscape layout with browser bars expanded; the final height follows
      // while on the same tab without another orientation change.
      await rotate(client,page,{...side,height:336});
      await check(page,{...side,height:336},route,'short landscape');
      await rotate(client,page,side);
      await check(page,side,route,'settled landscape');
      if(route==='notes')await checkLateInset(page,client,side);
      await rotate(client,page,portrait);
      await check(page,portrait,route,'portrait again');
      console.log('PASS rotation, safe areas, panel position and navigation:',route);
    }
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
