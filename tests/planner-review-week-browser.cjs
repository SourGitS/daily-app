// An existing Review priority through both real screens. No production services are used.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {plannerFixture,fixtureURL}=require('./planner-browser-fixture.cjs');

async function check(browser,width,height){
  const context=await browser.newContext({viewport:{width,height},timezoneId:'Australia/Sydney',
    isMobile:width<1024,hasTouch:width<1024,reducedMotion:'reduce',serviceWorkers:'block'});
  try{
    await plannerFixture()(context);
    const page=await context.newPage(), errors=[];
    page.setDefaultTimeout(7000);
    page.on('pageerror',error=>errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-11-16T03:00:00Z'));
    const query='?preview&week-preview&switch=e2e&ui=journal&home-cards&planner-review&polish&accent=385c72'+(width===1440?'&light':'');
    await page.goto(fixtureURL+query+'#notes');
    await page.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady&&wkrReview('2026-11-09'));
    const baseline=await page.evaluate(()=>{
      obDismiss();dailyUpdateDismiss();
      return JSON.stringify({notes:loadNotes(),bills:loadFixCats(),priorities:wkrReview('2026-11-09').reflection.priorities});
    });
    await page.getByRole('group',{name:'Planner view'}).getByRole('button',{name:'Week',exact:true}).click();
    await page.getByRole('button',{name:'Open Weekly Review'}).click();
    const row=page.locator('.wkr-priority-row').filter({hasText:'Get the bike serviced'});
    const plan=row.getByRole('button',{name:/Plan this/});
    await plan.press('Enter');
    const editor=page.locator('#jp-task-dialog[open]');
    await editor.getByLabel('Action',{exact:true}).fill('Call the bike shop');
    await editor.getByLabel('Planned day').fill('2026-11-17');
    await editor.getByRole('button',{name:'Save action'}).click();
    await row.getByRole('button',{name:/in Planner/}).click();
    const action=page.locator('.jp-task').filter({hasText:'Call the bike shop'});
    const move=action.getByRole('button',{name:'Move',exact:true});
    const geometry=await move.evaluate(el=>({button:el.getBoundingClientRect().toJSON(),
      nav:document.getElementById('bottom-nav').getBoundingClientRect().top,width:innerWidth,
      canvas:document.documentElement.scrollWidth}));
    assert.ok(geometry.button.height>=44&&geometry.canvas<=geometry.width);
    if(width<1024)assert.ok(geometry.button.y>=0&&geometry.button.bottom<=geometry.nav,'first action is fully above bottom navigation');
    await move.click();
    await editor.getByLabel('Planned day').fill('2026-11-18');
    await editor.getByRole('button',{name:'Move action'}).click();
    await action.getByRole('button',{name:'Mark done'}).click();
    await action.locator('[data-jp="review-source"]').click();
    assert.match(await row.innerText(),/Done/);
    assert.match(await row.innerText(),/18 Nov/);
    assert.match(await row.innerText(),/Moved from.*17 Nov/);
    assert.equal(await row.getByRole('button',{name:/Plan this/}).count(),0);
    await row.getByRole('button',{name:/in Planner/}).click();
    await action.getByRole('button',{name:'Undo completion'}).click();
    await page.reload();
    await page.waitForFunction(()=>_cloudWorkoutReady&&document.querySelector('.jp-week-card .jp-task'));
    const result=await page.evaluate(()=>({tasks:plannerTasks(),baseline:JSON.stringify({
      notes:loadNotes(),bills:loadFixCats(),priorities:wkrReview('2026-11-09').reflection.priorities})}));
    assert.equal(result.tasks.length,1);
    assert.equal(result.tasks[0].date,'2026-11-18');
    assert.equal(result.tasks[0].originalDate,'2026-11-17');
    assert.equal(result.tasks[0].done,false);
    assert.equal(result.baseline,baseline);
    await action.locator('[data-jp="review-source"]').click();
    assert.match(await row.innerText(),/Planned/);
    assert.deepEqual(errors,[]);
    console.log('PASS',width+'×'+height,'Review → plan → move → complete → Review → undo → reload');
  }finally{await context.close();}
}

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{for(const [width,height] of [[390,844],[1440,900],[320,740]])await check(browser,width,height);}
  finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
