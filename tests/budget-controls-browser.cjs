// Isolated UI regression: compact choices, contained dialogs and the existing safe transition writer.
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const assets=vm.runInNewContext(read('service-worker.js').match(/const ASSETS = (\[[\s\S]*?\]);/)[1]);
const allowed=new Set(assets.filter(p=>p.startsWith('./')&&!['./','./index.html'].includes(p)).map(p=>p.slice(2)).concat(['tests/sync-browser.html','tests/sync-browser-fixture.js']));
const server=http.createServer((req,res)=>{
 const file=decodeURIComponent(req.url.split('?')[0]).slice(1);if(!allowed.has(file)){res.writeHead(404).end();return;}
 try{
  let data=fs.readFileSync(path.join(root,file));
  if(file==='tests/sync-browser-fixture.js')data=data.toString().replace('const initial=clone(stores)',read('tests/category-home-fixture.js')+'\n const initial=clone(stores)');
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream','Content-Security-Policy':"connect-src 'self'; object-src 'none'"});res.end(data);
 }catch(e){res.writeHead(404).end('Missing');}
});
const financeSnapshot=()=>JSON.stringify({cycles:budCyclesLoad(),weeks:budgetData,expenses:txnData,ledger:ledgerData,accounts:loadAccounts(),income:loadIncCats(),fixed:loadFixCats()});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const [width,height] of [[320,700],[390,844],[844,390],[1024,768],[1440,900]])for(const theme of ['dark','light']){
   const label=width+' '+theme,context=await browser.newContext({viewport:{width,height},timezoneId:'Australia/Sydney',isMobile:width<1024});
   await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
   await context.addInitScript(()=>{window.Chart=class{constructor(){this.data={};this.options={};}destroy(){}update(){}};});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   const base='http://127.0.0.1:'+server.address().port+'/tests/sync-browser.html?preview&ui=journal&accent=385c72'+(theme==='light'?'&light':'');
   await page.goto(base+'&period#budget');await page.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady);
   await page.evaluate(()=>{obDismiss();dailyUpdateDismiss();setView('budget');setBudgetView('week');});
   const before=await page.evaluate(financeSnapshot),dialog=page.locator('#bud-period-dialog');
   const fit=async()=>{
    const rect=await dialog.evaluate(d=>{const r=d.getBoundingClientRect(),head=d.querySelector('.bp-dialog-head').getBoundingClientRect(),foot=d.querySelector('.bp-actions').getBoundingClientRect(),body=d.querySelector('.bp-dialog-content');return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,w:innerWidth,h:innerHeight,scroll:d.scrollWidth,client:d.clientWidth,bodyFits:body.scrollWidth<=body.clientWidth+1,headTop:head.top,footBottom:foot.bottom,footTop:foot.top};});
    assert.ok(rect.left>=0&&rect.right<=rect.w+1&&rect.top>=0&&rect.bottom<=rect.h+1&&rect.scroll<=rect.client+1&&rect.bodyFits&&rect.headTop>=0&&rect.footBottom<=rect.h+1&&rect.footTop>=rect.headTop,JSON.stringify({label,rect}));
    for(const box of await dialog.locator('input[type="radio"],input[type="checkbox"]').all())if(await box.isVisible())assert.ok(await box.evaluate(e=>{const r=e.getBoundingClientRect();return r.width<=24&&r.height<=24&&r.width>=18&&r.height>=18;}),label+' compact choice controls');
   };
   await page.evaluate(()=>budPeriodSetup());await fit();
   await dialog.locator('[name="source"]').selectOption('');
   for(const frequency of ['weekly','fortnightly','monthly','semimonthly','custom']){
    await dialog.locator('[name="frequency"]').selectOption(frequency);
    if(frequency==='semimonthly')await dialog.locator('[name="secondDay"]').fill('15');
    if(frequency==='custom'){const anchor=await dialog.locator('[name="anchor"]').inputValue();await dialog.locator('[name="end"]').fill(await page.evaluate(d=>budDateAdd(d,18),anchor));}
    assert.equal(await dialog.locator('#bp-second-day').isVisible(),frequency==='semimonthly');assert.equal(await dialog.locator('#bp-end-date').isVisible(),frequency==='custom');
    await dialog.locator('[name="transitionMode"][value="now"]').check();assert.doesNotMatch(await dialog.locator('#bp-transition-preview').innerText(),/Invalid Date|undefined|NaN/);
    await dialog.locator('[name="transitionMode"][value="next"]').check();await fit();
   }
   const source=await dialog.locator('[name="source"] option').nth(1).getAttribute('value');
   await dialog.locator('[name="source"]').selectOption(source);assert.equal(await dialog.locator('#bp-custom-dates').isVisible(),false);assert.equal(await dialog.locator('[name="anchor"]').isDisabled(),true);
   await dialog.locator('.bp-dialog-content').evaluate(e=>e.scrollTop=e.scrollHeight);await fit();
   await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.evaluate(financeSnapshot),before,label+' browsing/cancel preserves financial records');
   // The shared dialog also hosts recording and payday forms; cancel still writes nothing.
   for(const open of [()=>budIncomeEdit(loadIncCats()[0].id),()=>budPeriodRecord('income'),()=>budPeriodRecord('savings'),()=>budPeriodAdjust()]){
    await page.evaluate(open);await fit();await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.evaluate(financeSnapshot),before);
   }
   if(width===390&&theme==='dark'){
    const original=await page.evaluate(()=>budCyclesLoad());
    for(const mode of ['next','now']){
     await page.evaluate(store=>{budCyclesSave(store);budPeriodSetup();},original);
     await dialog.locator('[name="source"]').selectOption('');await dialog.locator('[name="frequency"]').selectOption('weekly');await dialog.locator('[name="transitionMode"][value="'+mode+'"]').check();
     await dialog.getByRole('button',{name:'Save budget dates',exact:true}).click();assert.equal(await dialog.evaluate(d=>d.open),false);
     const next=await page.evaluate(()=>budCyclesLoad());assert.equal(next.transition.mode,mode);assert.equal(next.transition.config.frequency,'weekly');
     for(const [id,value]of Object.entries(original.periods))assert.deepEqual(next.periods[id],value,'past plans remain exact');
     const financial=JSON.parse(await page.evaluate(financeSnapshot)),baseline=JSON.parse(before);delete financial.cycles;delete baseline.cycles;assert.deepEqual(financial,baseline,'changing dates does not alter transactions, balances or sources');
    }
    await page.evaluate(store=>{budCyclesSave({...store,config:{frequency:'weekly',anchor:getLocalDate()}});budPeriodSetup();},original);
    await dialog.locator('[name="transitionMode"][value="now"]').check();assert.doesNotMatch(await dialog.locator('#bp-transition-preview').innerText(),/Invalid Date/);await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
   }
   await page.goto(base+'&home-cards#home');await page.waitForFunction(()=>document.querySelector('.cat-habits input'));
   await page.evaluate(()=>{obDismiss();dailyUpdateDismiss();setView('home');});const habitFinance=await page.evaluate(financeSnapshot);
   const firstHabit=page.locator('.cat-habits input').first(),id=await firstHabit.getAttribute('data-cat-habit'),wasChecked=await firstHabit.isChecked();
   assert.ok(await firstHabit.evaluate(e=>{const r=e.getBoundingClientRect();return r.width===20&&r.height===20&&getComputedStyle(e).appearance==='none';}));
   await page.locator('.cat-habits [data-cat-habit="'+id+'"]').setChecked(!wasChecked);assert.equal(await page.locator('.cat-habits [data-cat-habit="'+id+'"]').isChecked(),!wasChecked);assert.equal(await page.evaluate(financeSnapshot),habitFinance);
   await page.evaluate(()=>categoryHabitDialog());const habits=page.locator('#category-habit-dialog');
   await habits.locator('[data-cat-habit="'+id+'"]').press('Space');assert.equal(await habits.locator('[data-cat-habit="'+id+'"]').isChecked(),wasChecked);
   assert.equal(await habits.locator('[data-cat-habit="'+id+'"]').evaluate(e=>document.activeElement===e),true,'habit dialog retains keyboard focus');
   assert.ok(await habits.locator('.cat-habit').first().evaluate(e=>e.getBoundingClientRect().height>=44));
   await habits.getByRole('button',{name:'Done',exact:true}).click();assert.equal(await page.evaluate(financeSnapshot),habitFinance);assert.deepEqual(errors,[]);
   console.log('PASS Budget choices and habits '+label);await context.close();
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
