// Actual app navigation and editing, with synthetic data and blocked production connections.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {plannerFixture, fixtureURL}=require('./planner-browser-fixture.cjs');
const captures=path.resolve(__dirname,'..','temp-analysis','planner-v453'),serveFixture=plannerFixture();
const records=()=>JSON.stringify({notes:loadNotes(),sessions:S.sessions,habits:habitsLog,transactions:txnData,budget:budgetData,accounts,ledger:ledgerData,storage:Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).sort().map(k=>[k,localStorage.getItem(k)]))});
const finance=()=>JSON.stringify({transactions:txnData,budget:budgetData,accounts,ledger:ledgerData});
(async()=>{
 fs.mkdirSync(captures,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const [width,height] of [[320,740],[390,844],[844,390],[1024,768],[1440,900],[1920,1080]])for(const theme of ['dark','light']){
  const label=width+' '+theme,context=await browser.newContext({viewport:{width,height},timezoneId:'Australia/Sydney',isMobile:width<1024,hasTouch:width<1024,reducedMotion:'reduce'});
  await serveFixture(context);
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(fixtureURL+'?preview&home-cards&planner-review&polish&ui=journal&accent=385c72'+(theme==='light'?'&light':'')+'#notes');
  await p.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady&&document.querySelector('.jp-calendar'));
  await p.waitForFunction(()=>[...document.querySelectorAll('.jp-day')].some(e=>e.getAttribute('aria-label').includes('Internet')));
  if(width===390&&theme==='dark'){
   await p.evaluate(()=>{obDismiss();dailyUpdateDismiss();});
   const due=await p.evaluate(()=>jrnPlannerAdd(getLocalDate(),2));await p.locator('.jp-day[data-date="'+due+'"]').click();
   await p.evaluate(async due=>{
    const stamp=Date.now(),ref=firebase.database().ref('users/fixture');
    await ref.child('budgetFixCats').set({v:JSON.stringify([{id:'review-internet',name:'Internet — updated remotely',amount:75,cycle:'monthly',chargeType:'bill',dueDate:due}]),t:stamp});
    await ref.child('accounts').set({v:JSON.stringify([{id:'review-card',name:'Card — updated remotely',type:'debt',current:120,tracksStatement:true,statementBalance:120,dueDate:due}]),t:stamp});
   },due);
   await p.waitForFunction(()=>document.querySelector('.jp-agenda').textContent.includes('Internet — updated remotely')&&document.querySelector('.jp-agenda').textContent.includes('Statement due'));
   assert.match(await p.locator('.jp-agenda').innerText(),/\$75/);assert.match(await p.locator('.jp-agenda').innerText(),/\$120/);
   await p.locator('[data-jp="today"]').click();
  }
  await p.evaluate(()=>{obDismiss();dailyUpdateDismiss();setView('food');foodCatalogueClose();setView('home');});
  if(width<1024)await p.waitForFunction(()=>Math.abs(document.getElementById('view-home').getBoundingClientRect().left-document.getElementById('app-main').getBoundingClientRect().left)<1);
  const baseline=await p.evaluate(records),fin=await p.evaluate(finance);
  const activity=p.locator('.cat-activity');assert.equal(await activity.locator('[role="img"]').count(),14);
  assert.equal(await activity.locator('.cat-habit-meter').count(),0);assert.equal(await activity.locator('.cat-week-row').last().locator('small').count(),0);
  const fit=await activity.evaluate(e=>{const marks=[...e.querySelectorAll('.cat-day-mark')].map(x=>x.getBoundingClientRect());return e.scrollWidth<=e.clientWidth+1&&marks.every(r=>r.width===marks[0].width&&r.height===marks[0].height);});assert.ok(fit,label+' matching tick geometry');
  assert.ok(await activity.locator('.cat-day-mark.on svg').count()>0);assert.ok(await activity.locator('.cat-day-mark.over svg').count()>0);assert.ok(await activity.locator('.cat-day-mark.unscored').count()>0);
  if(width===390||width===1440){await activity.scrollIntoViewIfNeeded();await p.screenshot({path:path.join(captures,'home-activity-'+width+'-'+theme+'.png')});}
  await p.evaluate(()=>{setView('log');setLogTab('exercises',true);});
  await p.waitForFunction(()=>{const r=document.getElementById('log-topnav').getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight;});
  assert.ok(await p.locator('.lib-open').count()>=60);
  for(const top of [400,1000,1600]){
   await p.evaluate(({width,height,top})=>{const e=document.getElementById(width>=1024?'app-main':height<600?'log-sub-exercises':'view-log');e.scrollTop=top;}, {width,height,top});
   await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const stack=await p.evaluate(()=>{const nav=document.getElementById('log-topnav'),head=document.querySelector('.lib-header'),n=nav.getBoundingClientRect(),h=head.getBoundingClientRect();return {navBottom:n.bottom,headTop:h.top,headBottom:h.bottom,navOwnsRight:!!document.elementFromPoint(n.right-5,n.top+5)?.closest('.page-topnav'),headOwnsRight:!!document.elementFromPoint(h.right-5,h.top+5)?.closest('.lib-header')};});
   assert.ok(Math.abs(stack.headTop-stack.navBottom)<=1.5&&stack.navOwnsRight&&stack.headOwnsRight,label+' opaque contiguous pinned headers '+JSON.stringify(stack));
  }
  await p.getByRole('searchbox',{name:'Search exercise library'}).fill('chest movement');assert.equal(await p.locator('.lib-open').count(),5);await p.getByRole('searchbox',{name:'Search exercise library'}).fill('');
  for(const view of ['food','stats']){
   await p.evaluate(view=>{setView(view);const e=document.getElementById(innerWidth>=1024?'app-main':'view-'+view);e.scrollTop=350;},view);
   await p.waitForFunction(view=>{const r=document.querySelector('#view-'+view+' .page-topnav').getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1;},view);
   await p.evaluate(()=>new Promise(requestAnimationFrame));
   assert.ok(await p.locator('#view-'+view+' .page-topnav').evaluate(e=>{const r=e.getBoundingClientRect();return !!document.elementFromPoint(r.right-4,r.top+4)?.closest('.page-topnav');}),label+' '+view+' full-width header backing');
  }
  await p.evaluate(()=>setView('notes'));
  assert.ok(await p.locator('.jp-calendar').isVisible());assert.equal(await p.locator('.jp-view-switch [data-jp="calendar"]').getAttribute('aria-pressed'),'true');
  const hero=p.locator('.jp-calendar-hero');
  assert.ok(await hero.locator('.jp-month h2').isVisible(),label+' month in the calendar hero');
  assert.match(await hero.evaluate(el=>getComputedStyle(el).backgroundImage),/linear-gradient/);
  const filterBoxes=await hero.getByRole('group',{name:'Calendar items'}).getByRole('button').evaluateAll(buttons=>buttons.map(b=>b.getBoundingClientRect().toJSON()));
  assert.equal(filterBoxes.length,4);
  assert.ok(filterBoxes.every(b=>b.width>=44&&b.height>=44&&b.y===filterBoxes[0].y),label+' filters share one row of touch targets in the hero');
  await p.getByRole('button',{name:'Search Planner',exact:true}).click();await p.locator('#jrn-search').fill('Internet');
  assert.equal(await p.locator('.jp-day[aria-label*="Internet"]').count(),1);assert.match(await p.locator('.jrn-search-count').innerText(),/^1 match$/);
  assert.match(await p.locator('.jp-next-up .jp-event').innerText(),/Internet/);
  await p.getByRole('button',{name:'Search Planner',exact:true}).click();
  const dates=await p.evaluate(()=>({today:getLocalDate(),future:jrnPlannerAdd(getLocalDate(),3),expiry:jrnPlannerAdd(getLocalDate(),4),bill:jrnPlannerAdd(getLocalDate(),2)}));
  await p.locator('.jp-day.selected').press('ArrowRight');assert.equal(await p.locator('.jp-day.selected').getAttribute('data-date'),await p.evaluate(()=>jrnPlannerAdd(getLocalDate(),1)));
  await p.locator('[data-jp="next"]').click();await p.locator('[data-jp="prev"]').click();await p.locator('[data-jp="today"]').click();
  await p.locator('.jp-filters [data-filter="note"]').click();
  assert.deepEqual(await p.locator('.jp-next-up .jp-event strong').allTextContents(),['Call about the bike service','Plan the coming week']);
  assert.ok(await p.locator('.jp-agenda-card').filter({hasText:'Overdue notes'}).getByRole('button',{name:/Review a saved offer/}).isVisible());
  await p.locator('.jp-filters [data-filter="all"]').click();
  await p.locator('[data-jp="selected-day"]').click();
  assert.ok(await p.locator('.jp-day-agenda').getByRole('button',{name:/A slower morning/}).isVisible());
  assert.ok(await p.locator('.jp-day-agenda').getByRole('button',{name:/Call about the bike service/}).isVisible());
  await p.locator('.jp-day[data-date="'+dates.bill+'"]').click();assert.match(await p.locator('.jp-agenda').innerText(),/Internet/);
  await p.locator('.jp-agenda [data-jp="bill"]').filter({hasText:'Internet'}).click();assert.equal(await p.evaluate(()=>S.view),'budget');assert.equal(await p.evaluate(()=>budBillsState().selected),dates.bill);assert.equal(await p.evaluate(finance),fin);
  await p.evaluate(()=>setView('notes'));await p.locator('.jp-day[data-date="'+dates.future+'"]').click();
  const prior=await p.evaluate(()=>JSON.stringify(loadNotes()));
  await p.locator('[data-jp="new-note"]').click();assert.equal(await p.locator('#jrn-ed-due').inputValue(),dates.future);
  if(width>=1240)await p.locator('[data-jp="calendar"]').click();else await p.locator('#jrn-editor [data-back="jrnCloseEditor"]').click();
  await p.waitForFunction(()=>!document.getElementById('jrn-editor').classList.contains('open'));
  assert.equal(await p.evaluate(()=>JSON.stringify(loadNotes())),prior,label+' cancelling dated blank note writes nothing');
  assert.equal(await p.evaluate(records),baseline,label+' browse, scroll and blank cancel preserve stores');
  if(width===390||width===1440){await p.locator('[data-jp="today"]').click();await p.screenshot({path:path.join(captures,'calendar-'+width+'-'+theme+'.png')});await p.locator('.jp-day[data-date="'+dates.future+'"]').click();}
  await p.locator('[data-jp="new-note"]').click();await p.locator('#jrn-ed-title').fill('Sample task '+label);await p.locator('#jrn-ed-body').fill('Keep this planned note.');
  await p.locator('[data-jrn="ed-dtype"][data-dtype="expiry"]').click();
  await p.locator('#jrn-ed-due').fill(dates.expiry);await p.locator('#jrn-ed-title').click();
  if(width>=1240)await p.locator('[data-jp="calendar"]').click();else await p.locator('#jrn-editor [data-back="jrnCloseEditor"]').click();
  await p.waitForFunction(()=>!document.getElementById('jrn-editor').classList.contains('open'));
  await p.locator('.jp-day[data-date="'+dates.expiry+'"]').click();assert.match(await p.locator('.jp-agenda').innerText(),new RegExp('Sample task '+label));
  const saved=await p.evaluate(title=>loadNotes().find(r=>r.title===title),'Sample task '+label);assert.equal(saved.dateType,'expiry');assert.equal(saved.dueDate,dates.expiry);assert.equal(await p.evaluate(finance),fin);
  if(width===390&&theme==='dark'){
   await p.locator('[data-jp="new-note"]').click();await p.locator('#jrn-ed-title').fill('Quick switch — keep this');await p.locator('#jrn-ed-body').fill('Do not lose pending text.');
   const old=await p.evaluate(()=>jrnEdId);await p.locator('#jrn-editor [data-back="jrnCloseEditor"]').click();
   await p.evaluate(()=>jrnPlannerOpen(null,'note'));
   await p.waitForTimeout(350);
   assert.ok(await p.locator('#jrn-editor').evaluate(e=>e.classList.contains('open')),'stale dismiss callback must not close the newly opened editor');
   assert.notEqual(await p.evaluate(()=>jrnEdId),old);assert.equal(await p.evaluate(id=>loadNotes().find(r=>r.id===id)?.body,old),'Do not lose pending text.');
   await p.evaluate(()=>jrnCloseEditor());
  }
  assert.deepEqual(await p.evaluate(ids=>loadNotes().filter(r=>ids.includes(r.id)),JSON.parse(prior).map(r=>r.id)),JSON.parse(prior),label+' older notes preserved');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' page fits');
  assert.ok(await p.locator('.jp-calendar').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&[...e.querySelectorAll('button')].every(b=>b.getBoundingClientRect().height>=44&&b.scrollWidth<=b.clientWidth+1)),label+' calendar fits and controls remain touchable');
  assert.deepEqual(errors,[],label+' app errors');console.log('PASS Home / scroll / Journal '+label);await context.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
