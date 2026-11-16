// Exercise the real page shell and editors with isolated sample records.
// DAILY_HOME_COMPARE_REF optionally compares every Home card with a previous version.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {chromium} = require('playwright');
const {plannerFixture, fixtureURL} = require('./planner-browser-fixture.cjs');
const serveCurrent = plannerFixture();
const servePrevious = process.env.DAILY_HOME_COMPARE_REF && plannerFixture(process.env.DAILY_HOME_COMPARE_REF);

async function openHome(browser, size, serve) {
  const {width,height,theme,scenario} = size;
  const context = await browser.newContext({
    viewport:{width,height}, timezoneId:'Australia/Sydney', isMobile:width<1024,
    hasTouch:width<1024, reducedMotion:'reduce', serviceWorkers:'block'
  });
  await serve(context);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-11-16T01:00:00Z'));
  const params = new URLSearchParams('preview&home-cards&planner-review&polish&ui=journal&accent=385c72');
  if (theme==='light') params.set('light','');
  if (scenario) params.set('scenario',scenario);
  await page.goto(fixtureURL+'?'+params+'#home');
  await page.waitForFunction(() => typeof _cloudWorkoutReady !== 'undefined' && _cloudWorkoutReady && document.querySelector('.cat-grid'));
  await page.evaluate(async () => {
    obDismiss(); dailyUpdateDismiss();
    await document.fonts.ready;
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  });
  return {page, context, errors};
}

function cardLayout(page) {
  return page.locator('.cat-grid [data-cat-id]').evaluateAll(cards => cards.map(card => {
    const {x,y,width,height}=card.getBoundingClientRect();
    return {id:card.dataset.catId, box:[x,y,width,height]};
  }));
}

async function compareHome(browser, size, page) {
  if (!servePrevious) return;
  const prior = await openHome(browser,size,servePrevious);
  try {
    assert.deepEqual(await cardLayout(page),await cardLayout(prior.page),'Home card order, positions and dimensions');
  } finally {await prior.context.close();}
}

async function clickAdd(page, kind) {
  const button = page.locator('[data-shared-add]:visible');
  assert.equal(await button.count(),1,'one Add button in view');
  await button.click();
  const dialog = page.locator('#shared-add-dialog[open]');
  assert.equal(await dialog.locator('[data-add-kind]').count(),5);
  await dialog.locator('[data-add-kind="'+kind+'"]').click();
  await dialog.waitFor({state:'hidden'});
}

async function openPlanner(page,phone) {
  await page.locator(phone?'#bottom-nav [data-view="notes"]':'#ds-nav [data-nav-quick="notes"]').click();
  await page.locator('.jp-calendar').waitFor();
}

async function checkActions(page, phone, capture) {
  const records = () => JSON.stringify({transactions:txnData, notes:loadNotes(), weights:S.weights, sessions:S.sessions,
    accounts, ledger:ledgerData, food:nutLog});
  const before = await page.evaluate(records);
  const launch = page.locator('[data-shared-add]:visible');
  const choices = page.locator('#shared-add-choices button');
  if (phone) await launch.tap();
  else await launch.click();
  assert.equal(await page.locator('#shared-add-title').evaluate(e=>document.activeElement===e),true,'pointer opens on the Add heading');
  assert.equal(await choices.evaluateAll(rows=>rows.every(row=>getComputedStyle(row).backgroundColor==='rgba(0, 0, 0, 0)' && !row.matches(':focus-visible'))),true,'no choice is highlighted on open');
  if (capture) await capture('add');
  await page.keyboard.press('Escape');
  assert.equal(await launch.evaluate(e=>document.activeElement===e),true,'dismiss restores focus');
  await launch.press('Enter');
  assert.equal(await choices.first().evaluate(e=>e.dataset.addKind==='expense' && e.matches(':focus-visible')),true,'keyboard opens on a visibly focused Expense');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.addKind),'food');
  await page.keyboard.press('Escape');
  if (phone) {
    await launch.tap();
    assert.equal(await choices.evaluateAll(rows=>rows.every(row=>!row.matches(':focus'))),true,'a new tap clears the previous keyboard choice');
    await page.getByRole('button',{name:'Close Add menu'}).tap();
    const box = await launch.boundingBox();
    assert.ok(box.width>=44 && box.height>=44,'phone Add touch target');
  }
  await clickAdd(page,'expense');
  await page.locator('#txn-modal').getByRole('button',{name:'Close expense form'}).click();
  await clickAdd(page,'food');
  await page.locator('#nutrition-food-overlay').getByRole('button',{name:'Close',exact:true}).click();
  // An editor can navigate to its owning section. Use the app's route to return.
  await page.evaluate(()=>setView('home'));
  await clickAdd(page,'weight');
  await page.getByRole('button',{name:'Close weight editor'}).click();
  await openPlanner(page,phone);
  assert.equal(await page.locator('.jp-next-up').count(),1);
  const next = page.locator('.jp-next-up');
  assert.match(await next.innerText(),/Call about the bike service/);
  assert.match(await next.innerText(),/Internet/);
  assert.match(await next.innerText(),/Full body A/);
  if (capture) {
    await capture('planner');
    if (phone) {
      await next.scrollIntoViewIfNeeded();
      await capture('next-up');
    }
  }
  const expand=next.locator('[data-jp="expand"]');
  await expand.click();
  assert.match(await next.innerText(),/Plan the coming week/);
  await expand.click();
  assert.equal(await next.locator('.jp-event').count(),3);
  await next.locator('[data-jp="workout"]').click();
  await page.waitForFunction(()=>S.view==='log' && logTodayView==='session');
  assert.match(await page.locator('#log-session #log-day-hero').innerText(),/Full body A/i);
  await openPlanner(page,phone);
  const today = await page.evaluate(()=>getLocalDate());
  await page.locator('.jp-day[data-date="'+today+'"]').click();
  assert.match(await page.locator('.jp-agenda').innerText(),/A slower morning/);
  const future = await page.evaluate(()=>jrnPlannerAdd(getLocalDate(),3));
  await page.locator('.jp-day[data-date="'+future+'"]').click();
  await clickAdd(page,'note');
  assert.equal(await page.locator('#jrn-ed-due').inputValue(),future);
  await closeJournal(page);
  await page.locator('[data-jp="today"]').click();
  await clickAdd(page,'entry');
  await page.locator('#jrn-editor.open').waitFor();
  await closeJournal(page);
  assert.equal(await page.evaluate(records),before,'browsing and cancelling leave sample records intact');

  await page.locator('[data-jp="today"]').click();
  await clickAdd(page,'note');
  await page.locator('#jrn-ed-title').fill('Review the training plan');
  await closeJournal(page);
  const saved = await page.evaluate(()=>loadNotes().filter(n=>n.title==='Review the training plan'));
  assert.equal(saved.length,1);
  assert.equal(saved[0].dueDate,today);
}

async function closeJournal(page) {
  const close = page.locator('#jrn-editor [data-back="jrnCloseEditor"]');
  if (await close.isVisible()) await close.click();
  else await page.locator('[data-jp="calendar"]').click();
  await page.locator('#jrn-editor.open').waitFor({state:'hidden'});
}

async function checkNavigation(page,phone) {
  if (phone) {
    const buttons=page.locator('#bottom-nav [data-view]');
    assert.equal(await buttons.last().getAttribute('data-view'),'notes');
    assert.equal((await buttons.last().innerText()).trim(),'Planner');
    const menu=page.getByRole('button',{name:'Menu',exact:true});
    assert.deepEqual(await page.locator('#header-actions button').evaluateAll(list=>list.map(b=>b.getAttribute('aria-label'))),['Add','Menu']);
    const tile=await menu.evaluate(button=>{
      const face=button.querySelector('.header-avatar-face'), gear=button.querySelector('.header-avatar-gear');
      const outer=button.getBoundingClientRect(), inner=face.getBoundingClientRect(), badge=gear.getBoundingClientRect();
      return {
        size:[outer.width,outer.height], photoSize:[inner.width,inner.height],
        corners:[getComputedStyle(button).borderTopLeftRadius,getComputedStyle(face).borderTopLeftRadius],
        filled:getComputedStyle(button).backgroundColor!=='rgba(0, 0, 0, 0)',
        gearInside:badge.right<=outer.right && badge.bottom<=outer.bottom && badge.left<inner.right
      };
    });
    assert.deepEqual(tile,{size:[44,44],photoSize:[32,32],corners:['12px','8px'],filled:true,gearInside:true});
    assert.equal(await menu.getAttribute('aria-controls'),'side-menu');
    assert.equal(await menu.getAttribute('aria-expanded'),'false');
    await menu.press('Enter');
    assert.equal(await menu.getAttribute('aria-expanded'),'true');
    await page.keyboard.press('Escape');
    assert.equal(await menu.evaluate(b=>b===document.activeElement),true);
    assert.equal(await page.locator('#side-menu').evaluate(e=>e.inert),true);
    await menu.tap();
    await page.locator('#side-menu-account').tap();
    assert.equal(await menu.getAttribute('aria-expanded'),'false');
    await page.locator('#view-settings-detail #settings-account-section').getByRole('button',{name:'Sign out'}).waitFor();
    await page.locator('#view-settings-detail [data-back="closeSettingsSection"]').click();
    await menu.click();
    await page.locator('#side-menu-list [data-nav-quick="stats"]').click();
  } else await page.locator('#ds-nav [data-nav-quick="stats"]').click();
  await page.waitForFunction(()=>S.view==='stats');
  assert.ok(await page.locator('#view-stats').isVisible());
  await openPlanner(page,phone);
  await page.goBack();
  await page.waitForFunction(()=>S.view==='stats');
  await page.goForward();
  await page.waitForFunction(()=>S.view==='notes');
  await page.reload();
  await page.locator('.jp-calendar').waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
}

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    for (const size of [
      {width:320,height:740,theme:'light'}, {width:390,height:844,theme:'dark'},
      {width:1024,height:768,theme:'light'}, {width:1440,height:900,theme:'dark'},
      {width:390,height:844,theme:'light',scenario:'reordered'},
      {width:1440,height:900,theme:'light',scenario:'hidden'}
    ]) {
      const {page,context,errors}=await openHome(browser,size,serveCurrent);
      const label=[size.width,size.theme,size.scenario].filter(Boolean).join(' ');
      try {
        await compareHome(browser,size,page);
        assert.equal(await page.locator('#view-home .jp-next-up').count(),0);
        if (!size.scenario) {
          let capture;
          if (process.env.DAILY_PLANNER_SCREENSHOTS && [390,1440].includes(size.width)) {
            const dir=path.join(__dirname,'..','temp-analysis','planner-v453');
            fs.mkdirSync(dir,{recursive:true});
            capture=name=>page.screenshot({path:path.join(dir,name+'-'+size.width+'.png')});
          }
          await checkActions(page,size.width<1024,capture);
          await checkNavigation(page,size.width<1024);
        }
        assert.deepEqual(errors,[]);
        console.log('PASS Planner / shared Add / Home '+label);
      } catch(error) {error.message=label+': '+error.message;throw error;}
      finally {await context.close();}
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
