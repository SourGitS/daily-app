// Exercise the Home shortcuts through the real Weekly Review and Planner forms.
const assert = require('node:assert/strict');
const {chromium,webkit} = require('playwright');
const {plannerFixture, fixtureURL} = require('./planner-browser-fixture.cjs');

const sourceWeek = '2026-11-09';
const priority = 'Book a service for the bike';
const title = 'Call the bike shop';
const selectedDay = '2026-11-24';
const movedDay = '2026-12-02';

async function check(browser, width, height, completed = false) {
  const context = await browser.newContext({viewport:{width,height}, timezoneId:'Australia/Sydney',
    isMobile:width<1024, hasTouch:width<1024, reducedMotion:'reduce', serviceWorkers:'block'});
  try {
    await plannerFixture()(context);
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(6000);
    page.on('pageerror', error=>errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-11-16T03:00:00Z'));
    const url = fixtureURL+'?preview&week-preview&ui=journal&home-cards&planner-review&switch=home-review&home-focus='+(completed?'completed':'empty')+'#home';
    await page.goto(url);
    await page.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined' && _cloudWorkoutReady && wkrPlan.enabled);
    await page.evaluate(()=>{obDismiss(); dailyUpdateDismiss();});
    const card = page.locator('#home-content .cat-review');
    const home = page.locator(width<1024?'#bottom-nav [data-view="home"]':'#desktop-sidebar [data-nav-quick="home"]');
    const link = card.getByRole('link', {name:/Open weekly review/i});
    const records = ()=>page.evaluate(()=>[WKR_REVIEWS_KEY,'daily_planner_tasks'].map(k=>localStorage.getItem(k)));
    const checkReview = async () => {
      await page.waitForFunction(week=>S.view==='stats' && wkrUI.week===week && wkrUI.section==='overview',sourceWeek);
      assert.equal(await page.locator('#stats-tab-row button.on').innerText(),'Review');
    };
    assert.equal(await link.getAttribute('data-week'), sourceWeek);
    await link.press('Enter');
    await checkReview();
    await home.click();
    if (completed) {
      await card.getByRole('button',{name:'Read review'}).click();
      await checkReview();
      assert.match(await page.locator('#view-stats').innerText(),/Reopen this review/);
    } else {
      const set = card.getByRole('button',{name:'Set a priority'});
      const plan = card.getByRole('button',{name:'Schedule in Planner'});
      const viewAction = card.getByRole('button',{name:'View in Planner'});
      const priorities = page.getByRole('dialog',{name:'Priorities for next week'});
      const editor = page.locator('#jp-task-dialog[open]');
      const empty = await records();
      await set.press('Enter');
      await priorities.getByLabel('Priority 1').fill('Discard this');
      await priorities.getByRole('button',{name:'Cancel'}).click();
      await page.waitForFunction(()=>document.activeElement?.dataset.catAction==='review-set');
      assert.deepEqual(await records(),empty);
      await set.click();
      await priorities.getByLabel('Priority 1').fill(priority);
      await priorities.getByRole('button',{name:'Save priorities'}).click();
      await plan.waitFor();
      assert.equal(await page.evaluate(()=>S.view),'home');
      assert.match(await card.innerText(),new RegExp(priority));
      assert.deepEqual(await page.evaluate(week=>wkrReview(week).reflection.priorities,sourceWeek),[priority]);
      const savedPriority = await records();
      await plan.click();
      assert.equal(await editor.getByLabel('Action',{exact:true}).inputValue(),priority);
      assert.equal(await editor.getByLabel('Planned day').inputValue(),'2026-11-16');
      await editor.getByLabel('Planned day').fill(selectedDay);
      await editor.getByRole('button',{name:'Cancel'}).click();
      assert.deepEqual(await records(),savedPriority);
      await plan.click();
      await editor.getByLabel('Action',{exact:true}).fill(title);
      await editor.getByLabel('Planned day').fill(selectedDay);
      await editor.getByRole('button',{name:'Save action'}).click();
      const action = page.locator('.jp-task').filter({hasText:title});
      await action.waitFor();
      const task = await page.evaluate(()=>plannerTasks()[0]);
      assert.deepEqual(task.source,{week:sourceWeek,text:priority,occurrence:0});
      assert.equal(task.date,selectedDay);
      assert.equal(await action.getAttribute('data-task'),task.id);
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),task.id);
      await action.getByRole('button',{name:'Move',exact:true}).click();
      await editor.getByLabel('Planned day').fill(movedDay);
      await editor.getByRole('button',{name:'Move action'}).click();
      await home.click();
      assert.match(await card.innerText(),/2 Dec/);
      await viewAction.click();
      await action.getByRole('button',{name:'Mark done'}).click();
      await home.click();
      await page.reload();
      await page.waitForFunction(()=>_cloudWorkoutReady && plannerTasks().some(t=>t.done));
      assert.match(await card.innerText(),/Done in Planner.*2 Dec/s);
      const done = await records();
      await viewAction.click();
      await action.getByRole('button',{name:'Undo completion'}).waitFor();
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.id),task.id);
      assert.equal(await page.evaluate(()=>jrnPlannerState.date),movedDay);
      assert.deepEqual(await records(),done);
      assert.equal(await page.evaluate(()=>plannerTasks().length),1);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS Home review',width+'×'+height,completed?'completed review':'choose, schedule, move, complete and reload');
  } finally { await context.close(); }
}

(async()=>{
  const browser=process.argv.includes('--webkit')?await webkit.launch():await chromium.launch({channel:'chrome'});
  try {
    for(const [width,height] of [[390,844],[1440,900],[320,740]]) await check(browser,width,height);
    await check(browser,390,844,true);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
