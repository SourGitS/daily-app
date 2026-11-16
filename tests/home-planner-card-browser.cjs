const assert = require('node:assert/strict');
const {chromium, webkit} = require('playwright');
const {plannerFixture, fixtureURL} = require('./planner-browser-fixture.cjs');

const cardSelector = '#home-content article[data-cat-id="planner"]';
const rowSelector = '[data-cat-planner-task]';
const gridSelector = '#home-content .cat-grid';

async function positions(page) {
  return page.evaluate(async selector => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const grid = document.querySelector(selector);
    const origin = grid.getBoundingClientRect();
    return [...grid.querySelectorAll('[data-cat-id]')].map(card => {
      const r = card.getBoundingClientRect();
      return {id:card.dataset.catId, x:Math.round(r.x-origin.x), y:Math.round(r.y-origin.y),
        width:Math.round(r.width), height:Math.round(r.height)};
    });
  }, gridSelector);
}

async function check(browser, mobile) {
  const width = mobile ? 390 : 1440, height = mobile ? 844 : 900;
  const mode = mobile ? 'mobile' : 'desktop', other = mobile ? 'desktop' : 'mobile';
  const context = await browser.newContext({viewport:{width,height}, timezoneId:'Australia/Sydney',
    isMobile:mobile, hasTouch:mobile, reducedMotion:'reduce', serviceWorkers:'block'});
  try {
    const url = new URL(fixtureURL);
    url.search = '?preview&home-cards&ui=journal&planner-review&week-preview&switch=home-planner'+(mobile?'&scenario=reordered':'');
    url.hash = 'home';
    await plannerFixture()(context);
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-11-16T03:00:00Z'));
    await page.goto(url.href);
    async function ready() {
      await page.waitForFunction(() => typeof _cloudWorkoutReady !== 'undefined' && _cloudWorkoutReady && !_bootPhase);
      await page.evaluate(() => { obDismiss(); dailyUpdateDismiss(); });
      await page.locator(gridSelector).waitFor();
    }
    await ready();
    const card = page.locator(cardSelector), rows = card.locator(rowSelector);
    const show = page.locator('[data-cat-show="planner"]'), mini = page.locator('[data-cat-mini="planner"]');
    const editor = action => page.locator('[data-cat-editor="'+action+'"]');
    const openEditor = () => page.getByRole('button',{name:'Customise Home layout'}).click();
    const navHome = page.locator(mobile ? '#bottom-nav [data-view="home"]' : '#desktop-sidebar [data-nav-quick="home"]');
    async function returnHome() {
      const back = page.locator('#view-settings-detail [data-back="closeSettingsSection"]');
      if (await back.isVisible()) await back.click();
      if (await page.evaluate(() => S.view !== 'home')) await navHome.click();
      await page.locator(gridSelector).waitFor();
    }
    const saved = device => page.evaluate(m => localStorage.getItem(categoryKey(m)), device);
    const originals = await positions(page);
    assert.ok(originals.length > 8);
    assert.equal(await card.count(), 0);
    const ownBefore = await saved(mode), otherBefore = await saved(other);
    if (mobile) assert.equal(originals[0].id, 'journal'); // Existing v461 custom order.
    await openEditor();
    await show.click();
    await mini.waitFor();
    await editor('cancel').click();
    await show.waitFor();
    assert.equal(await saved(mode), ownBefore);
    await show.click();
    await editor('apply').click();
    assert.equal(await saved(other), otherBefore);
    await returnHome();
    await card.waitFor();
    const enabled = await positions(page);
    assert.equal(enabled.at(-1).id, 'planner');
    assert.deepEqual(enabled.slice(0,-1), originals, 'adding Planner moved an existing card');
    assert.ok((await card.innerText()).replace(/^Planner/i,'').trim(), 'empty card should explain what to expect');
    assert.equal(await rows.count(), 0);
    await page.reload();
    await ready();
    await card.waitFor();
    const tasks = await page.evaluate(() => {
      const late = plannerCreateTask({title:'Collect the library book', date:'2026-11-29'});
      const second = plannerCreateTask({title:'Book the bike service', date:'2026-11-20'});
      const overdue = plannerCreateTask({title:'Call the insurance office about the renewal and compare the updated terms', date:'2026-11-10'});
      const done = plannerCreateTask({title:'Already finished', date:'2026-11-01'});
      plannerSetTaskDone(done.id, true);
      return {late,second,overdue};
    });
    await page.reload();
    await ready();
    async function verifyRows(expected) {
      const ids = expected.map(t => t.id);
      await page.waitForFunction(({selector,ids}) => {
        const actual = [...document.querySelectorAll(selector)].map(el => el.dataset.catPlannerTask);
        return actual.length === ids.length && actual.every((id,i) => id === ids[i]);
      }, {selector:cardSelector+' '+rowSelector, ids});
      for (const [i,task] of expected.entries()) {
        const row = rows.nth(i), date = row.locator('time');
        assert.ok((await row.innerText()).includes(task.title));
        assert.match(await row.getAttribute('aria-label'),/open in Planner Week/i);
        assert.equal(await date.getAttribute('datetime'), task.date);
        const label = new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',timeZone:'UTC'})
          .format(new Date(task.date+'T12:00:00Z'));
        assert.ok((await date.innerText()).includes(label));
        assert.ok((await row.boundingBox()).height >= 44);
      }
    }
    async function openTask(task) {
      const target = card.locator('[data-cat-planner-task="'+task.id+'"]');
      if (mobile) await target.tap();
      else await target.press('Enter');
      await page.waitForFunction(task => S.view==='notes' && jrnPlannerState.period==='week' &&
        jrnPlannerState.date===task.date && document.activeElement?.dataset.id===task.id, task);
      return page.locator('.jp-task[data-task="'+task.id+'"]');
    }
    await verifyRows([tasks.overdue,tasks.second]);
    for (const w of [width, mobile ? 320 : 1024]) {
      await page.setViewportSize({width:w,height});
      const [first,second] = await rows.evaluateAll(nodes => nodes.map(n => {
        const r = n.getBoundingClientRect();
        const title = n.querySelector('span').getBoundingClientRect(), date = n.querySelector('time').getBoundingClientRect();
        return {x:r.x, y:r.y, right:r.right, bottom:r.bottom, dateBelowTitle:date.top >= title.bottom-1};
      }));
      if (mobile) assert.ok(second.y >= first.bottom && Math.abs(second.x-first.x) <= 1, 'phone actions should stack');
      else {
        assert.ok(second.x >= first.right && Math.abs(second.y-first.y) <= 1, 'desktop actions should share a row');
        assert.ok(first.dateBelowTitle && second.dateBelowTitle, 'desktop dates belong below their respective titles');
      }
      const dimensions = await card.evaluate(n => [n.clientWidth,n.scrollWidth,n.getBoundingClientRect().width,n.parentElement.getBoundingClientRect().width]);
      assert.ok(dimensions[1] <= dimensions[0]+1, 'card content overflows at '+w);
      assert.ok(Math.abs(dimensions[2]-dimensions[3]) <= 1, 'card should fill the grid at '+w);
    }
    await page.setViewportSize({width,height});
    const row = await openTask(tasks.second);
    await row.getByRole('button',{name:'Move',exact:true}).click();
    const dialog = page.locator('#jp-task-dialog[open]');
    await dialog.getByLabel('Planned day').fill('2026-12-02');
    await dialog.getByRole('button',{name:'Move action'}).click();
    await returnHome();
    await verifyRows([tasks.overdue,tasks.late]);
    for (const task of [tasks.overdue,tasks.late,{...tasks.second,date:'2026-12-02'}]) {
      const action = await openTask(task);
      await action.getByRole('button',{name:'Mark done'}).click();
      await returnHome();
      if (task === tasks.overdue) await verifyRows([tasks.late,{...tasks.second,date:'2026-12-02'}]);
      if (task === tasks.late) await verifyRows([{...tasks.second,date:'2026-12-02'}]);
    }
    await verifyRows([]);
    const remote = await page.evaluate(async () => {
      const task = {id:'shared-action',title:'Book next year’s appointment',date:'2027-01-18',originalDate:'2027-01-18',
        done:false,source:null,createdAt:Date.now(),updatedAt:Date.now(),dateAt:0,doneAt:0,restoreGeneration:0};
      await fbRef('plannerTasks').child(task.id).set(task);
      return task;
    });
    await verifyRows([remote]);
    assert.match(await rows.locator('time').innerText(),/2027/);
    await page.evaluate(async task => {
      const now = task.updatedAt+1;
      await fbRef('plannerTasks').child(task.id).set({...task,done:true,updatedAt:now,doneAt:now});
    }, remote);
    await verifyRows([]);
    await openEditor();
    await page.locator('[data-cat-profile="'+other+'"]').click();
    await show.waitFor();
    await page.locator('[data-cat-profile="'+mode+'"]').click();
    await mini.click();
    await page.locator('[data-cat-hide="planner"]').click();
    await editor('apply').click();
    await returnHome();
    assert.equal(await card.count(),0);
    assert.deepEqual(await positions(page),originals,'hiding Planner changed the original grid');
    await openEditor();
    await show.click();
    await editor('reset').click();
    await show.waitFor();
    await editor('apply').click();
    await returnHome();
    await page.reload();
    await ready();
    assert.equal(await card.count(),0);
    assert.equal(await saved(other),otherBefore);
    assert.deepEqual(errors,[]);
    console.log('PASS '+mode+' Home Planner: off/on, order and geometry, both actions, move, complete, hide and reset');
  } finally { await context.close(); }
}

(async () => {
  const browser = process.argv.includes('--webkit') ? await webkit.launch() : await chromium.launch({channel:'chrome'});
  try {
    await check(browser, false);
    await check(browser, true);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
