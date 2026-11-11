// Real controls, isolated sample records and no production connections.
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),assets=vm.runInNewContext(fs.readFileSync(path.join(root,'service-worker.js'),'utf8').match(/const ASSETS = (\[[\s\S]*?\]);/)[1]);
const allowed=new Set(assets.filter(a=>a.startsWith('./')).map(a=>a.slice(2)).concat(['tests/sync-browser.html','tests/sync-browser-fixture.js']));
const server=http.createServer((req,res)=>{
 const file=decodeURIComponent(req.url.split('?')[0]).slice(1);if(!allowed.has(file)){res.writeHead(404).end();return;}
 fs.readFile(path.join(root,file),(err,data)=>{res.writeHead(err?404:200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream','Content-Security-Policy':"connect-src 'self'"});res.end(err?'Missing':data);});
});
const records=()=>JSON.stringify({sessions:S.sessions,swaps:S.swaps,storage:Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).sort().map(k=>[k,localStorage.getItem(k)]))});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const [width,height] of [[320,700],[390,844],[527,884],[844,390],[1024,768],[1440,900]])for(const theme of ['dark','light']){
   const label=width+'x'+height+' '+theme,context=await browser.newContext({viewport:{width,height},timezoneId:'Australia/Sydney',hasTouch:width<1024,isMobile:width<1024});
   await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
   await context.addInitScript(()=>{window.Chart=class{constructor(){this.data={};this.options={};}destroy(){}update(){}};});
   const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.goto('http://127.0.0.1:'+server.address().port+'/tests/sync-browser.html?preview&training&ui=journal&accent=385c72'+(theme==='light'?'&light':'')+'#log');
   await p.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady&&document.querySelector('#log-coverage'));
   await p.evaluate(()=>{obDismiss();dailyUpdateDismiss();setView('log');});
   const before=await p.evaluate(records),todaySelection=await p.evaluate(()=>logCoverageMuscle);
   await p.locator('#lg-hist-btn').click();
   assert.equal(await p.locator('#history-list .lg-body-svg').count(),0,label+' closed cards do not mount diagrams');
   const lower=p.locator('details.hist-session[data-session-key="lower"]');await lower.locator('summary.hist-preview-toggle').click();
   await lower.locator('.lg-body-svg').first().waitFor();
   assert.equal(await lower.locator('.hist-exercise').count(),3,label+' preview recorded exercises');
   await lower.locator('.hist-muscle[data-muscle="quads"]').click();
   assert.equal(await lower.locator('.hist-exercise').count(),1);assert.match(await lower.locator('.hist-sets').innerText(),/Smith squat/);
   await lower.locator('.lg-body-muscle[data-muscle="chest"] path').first().click();
   assert.match(await lower.locator('.hist-sets').innerText(),/No exercises recorded/);
   await lower.locator('.hist-muscle[data-muscle=""]').click();
   assert.equal(await lower.locator('.hist-exercise').count(),3);
   await lower.locator('summary.hist-preview-toggle').press('Enter');assert.equal(await lower.getAttribute('open'),null);
   await lower.locator('summary.hist-preview-toggle').press('Enter');
   assert.equal(await p.evaluate(records),before,label+' history browse/filter is read-only');
   assert.equal(await p.evaluate(()=>logCoverageMuscle),todaySelection,label+' Today selection isolated');
   await p.evaluate(()=>{
    S.sessions.push({id:'history-edge',sessionType:'A long saved workout name with <text> & groups from an earlier program',completed:false,note:'Saved note\nwith a second line.',exercises:[
     {name:'Assisted movement',muscle:'my special group',unit:'reps',sets:[{weight:-15,reps:8,type:'working'}]},
     {name:'Saved hold',muscle:'core',unit:'secs',sets:[{weight:0,reps:45,type:'working'}]},
     {name:'Old squat',muscle:'legs',sets:[{weight:60,reps:6,type:'working'},{weight:20,reps:10,type:'warmup'}]},
     {name:'Unknown movement',sets:[{reps:10,type:'working'}]}]});renderHistory();
   });
   const edge=p.locator('details[data-session-key="history-edge"]');await edge.locator('summary.hist-preview-toggle').click();
   await edge.locator('.hist-exercise').first().waitFor();
   assert.match(await edge.innerText(),/Date not recorded/i);assert.match(await edge.innerText(),/Partial workout/);
   assert.match(await edge.innerText(),/45s/);assert.match(await edge.innerText(),/-15kg × 8/);assert.match(await edge.innerText(),/estimated groups/);
   assert.match(await edge.innerText(),/Saved note/);assert.equal(await edge.locator('.hist-muscle[data-muscle="legs"]').count(),1);
   assert.ok(await edge.evaluate(e=>e.scrollWidth<=e.clientWidth+1),label+' history edge containment');
   const readOnly=await p.evaluate(records);await p.locator('#lg-today-btn').click();
   await p.getByRole('button',{name:'Open workout',exact:true}).click();
   assert.equal(await p.locator('.ldh-dock #log-timer-card').count(),1);
   assert.ok(await p.locator('.ldh-dock').evaluate(e=>e.lastElementChild.classList.contains('ldh-action')&&e.querySelector('.ldh-start').getBoundingClientRect().top>=e.querySelector('#log-timer-card').getBoundingClientRect().bottom-1),label+' Start workout follows the timers at the bottom of the dock');
   const layout=await p.locator('.log-day-hero-card').evaluate(e=>{
    const r=e.getBoundingClientRect(),buttons=[...e.querySelectorAll('button')];return {page:document.documentElement.scrollWidth<=innerWidth+1,card:e.scrollWidth<=e.clientWidth+1,buttons:buttons.every(b=>b.getBoundingClientRect().height>=44&&b.scrollWidth<=b.clientWidth+1),visible:buttons.every(b=>{const q=b.getBoundingClientRect();return q.top>=-1&&q.bottom<=innerHeight;})};
   });
   assert.ok(layout.page&&layout.card&&layout.buttons&&layout.visible,label+' hero '+JSON.stringify(layout));
   assert.ok(await p.locator('.ldh-dock').evaluate(e=>[...e.querySelectorAll('.lt-time,.lt-session')].every(t=>getComputedStyle(t).color===getComputedStyle(e).color)),label+' both clocks use the readable dock text color');
   const fits=await p.locator('#ec0').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&[...e.querySelectorAll('.set-row input,.set-check,.set-actions button')].every(b=>b.getBoundingClientRect().height>=44&&b.scrollWidth<=b.clientWidth+1));
   assert.ok(fits,label+' set input/action containment');
   if(width===390||width===1440)await p.screenshot({path:path.join(root,'temp-analysis/workout-session-v450-'+width+'-'+theme+'.png')});
   await p.getByRole('button',{name:'Start rest',exact:true}).click();
   await p.waitForFunction(()=>rtRunning&&S.sessionStart);
   assert.equal(await p.getByRole('button',{name:'Start workout',exact:true}).isVisible(),false,label+' rest start hides redundant workout start');
   const start=await p.evaluate(()=>S.sessionStart);
   await p.evaluate(()=>{rtStartTime=Date.now()-65000;rtUpdateDisplay(rtGetElapsed());});
   assert.match(await p.locator('#rt-bar-time').innerText(),/^1:0[5-9]$/);
   await p.getByRole('button',{name:'Pause rest',exact:true}).click();
   const elapsed=await p.evaluate(()=>rtGetElapsed());
   await p.getByRole('button',{name:'Open timer',exact:true}).click();
   assert.ok(await p.locator('#rt-fullscreen').isVisible());assert.match(await p.locator('#rt-fs-time').innerText(),/^1:0[5-9]\.\d$/);
   await p.evaluate(()=>{rtCloseFullscreen();renderLog();});
   assert.equal(await p.evaluate(()=>rtGetElapsed()),elapsed,label+' repaint does not reset paused timer');
   assert.equal(await p.evaluate(()=>S.sessionStart),start,label+' session clock stable');
   await p.locator('#ec0 .set-kg').fill('60');await p.locator('#ec0 .set-reps').fill('8');
   await p.locator('#ec0 .set-check').click();assert.ok(await p.evaluate(()=>S.checked.has(0)));
   await p.locator('#ec0 .add-warmup-btn').click();assert.equal(await p.locator('#ec0 .set-warmup-btn.active').count(),1);
   await p.locator('#ec0 .add-set-btn').click();assert.equal(await p.locator('#ec0 .set-row').count(),3);
   assert.match(await p.locator('#ec5 .set-col-labels').innerText(),/Seconds/);
   assert.equal(await p.evaluate(()=>JSON.stringify(S.sessions)),JSON.stringify(JSON.parse(readOnly).sessions),label+' editing draft does not rewrite history');
   await p.locator('#lg-hist-btn').click();
   assert.equal(await p.locator('#lap-fab').isVisible(),false,label+' history is clear of floating workout controls');
   assert.ok(await edge.getAttribute('open')!==null,label+' disclosure retained');
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if(width===390||width===1440){await edge.locator('summary.hist-preview-toggle').click();await lower.locator('summary.hist-preview-toggle').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(root,'temp-analysis/workout-history-v450-'+width+'-'+theme+'.png')});}
   if(width===320||width===390){
    await p.evaluate(()=>{
     logOpenSession();const saved=loadExerciseLib,name=type(S.dayIdx).exercises[0].name;
     loadExerciseLib=()=>saved().filter(e=>e.name!==name).concat([{id:'assisted-sample',name,muscle:'back',allowNegative:true,custom:true}]);renderLog();
    });
    const assisted=p.locator('#ec0 .set-row:not(.set-warmup)').first();
    await assisted.locator('.set-sign-btn').click();assert.equal(await assisted.locator('.set-kg').inputValue(),'-60',label+' assisted sign control survives compact rows');
    assert.ok(await assisted.evaluate(e=>e.scrollWidth<=e.clientWidth+1),label+' assisted row containment');
    await p.evaluate(()=>{S.sessions=[];openWorkoutHistory();});
    assert.match(await p.locator('#history-list').innerText(),/No sessions yet/);
   }
   assert.deepEqual(errors,[],label+' application errors');
   console.log('PASS session/history '+label);await context.close();
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
