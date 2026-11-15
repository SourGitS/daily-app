'use strict';
const assert = require('node:assert/strict');

// Runs against the current app and synthetic account served by review-reliability-browser.cjs.
module.exports = async function checkImportedContent(context) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? 'Sample training plan' : undefined));
  try {
    await page.goto('https://daily-test.invalid/app?preview&ui=journal');
    await page.waitForFunction(() => _cloudWorkoutReady);
    await page.evaluate(() => { obDismiss(); dailyUpdateDismiss(); setView('plans'); });

    const fileChooser = page.waitForEvent('filechooser');
    await page.getByRole('button', {name:'Import an HTML plan'}).click();
    await (await fileChooser).setFiles({
      name:'training.html', mimeType:'text/html',
      buffer:Buffer.from('<!doctype html><h1>Training for Tuesday</h1><button onclick="this.textContent=\'Completed\'">Finish stretch</button>')
    });
    await page.waitForFunction(() => plansDocList().some(plan => plan.name === 'Sample training plan'));
    await page.evaluate(() => plansDocSelect(plansDocList().find(plan => plan.name === 'Sample training plan').id));
    await page.locator('#plans-content').getByRole('button', {name:'Open', exact:true}).click();
    const viewer = page.frameLocator('#plan-html-frame');
    await viewer.getByRole('heading', {name:'Training for Tuesday'}).waitFor();
    assert.equal(await viewer.locator('body').evaluate(() => self.origin), 'null');
    await viewer.getByRole('button', {name:'Finish stretch'}).tap();
    await viewer.getByRole('button', {name:'Completed'}).waitFor();
    await page.evaluate(() => {
      plansCloseHTML();
      setView('food',null,{foodTab:'recipes'});
      if (document.querySelector('#food-catalogue-dialog')?.open) foodCatalogueClose();
      kitOpenImport();
    });

    const name = 'Rice bowl review';
    const emoji = '🍲 <Rice> & "Tea"';
    await page.locator('#kit-import-text').fill(JSON.stringify({
      name, emoji, category:'dinner', servings:2,
      ingredients:[{name:'Rice',amount:200,unit:'g'}], steps:['Cook the rice.']
    }));
    await page.locator('#kit-import-overlay').getByRole('button', {name:'Import',exact:true}).tap();
    const card = page.locator('#kit-list .kit-card').filter({hasText:name});
    assert.equal(await card.locator('.kit-cat-tile').textContent(), emoji);
    assert.equal(await card.locator('.kit-cat-tile').evaluate(tile => tile.childElementCount), 0);
    await card.getByRole('button', {name:'More actions'}).click();
    await card.getByRole('button', {name:/Edit/}).click();
    assert.equal(await page.locator('#kit-f-emoji').inputValue(), emoji);
    assert.deepEqual(errors, []);
    console.log('PASS interactive isolated HTML plan and phone recipe import, list and editor');
  } finally {
    await page.close();
  }
};
