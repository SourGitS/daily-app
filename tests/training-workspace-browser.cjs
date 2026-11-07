// Real UI, isolated synthetic records and blocked production connections.
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),assets=vm.runInNewContext(fs.readFileSync(path.join(root,'service-worker.js'),'utf8').match(/const ASSETS = (\[[\s\S]*?\]);/)[1]);
const allowed=new Set(assets.filter(a=>a.startsWith('./')).map(a=>a.slice(2)).concat(['tests/sync-browser.html','tests/sync-browser-fixture.js']));
const server=http.createServer((req,res)=>{
 const file=decodeURIComponent(req.url.split('?')[0]).slice(1);if(!allowed.has(file)){res.writeHead(404).end();return;}
 fs.readFile(path.join(root,file),(err,data)=>{res.writeHead(err?404:200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream','Content-Security-Policy':"connect-src 'self'"});res.end(err?'Missing':data);});
});
const snapshot=()=>JSON.stringify({sessions:S.sessions,storage:Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).sort().map(k=>[k,localStorage.getItem(k)])),swaps:S.swaps});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const [width,height] of [[320,700],[390,844],[844,390],[1024,768],[1440,900]])for(const theme of ['dark','light']){
   const label=width+' '+theme,context=await browser.newContext({viewport:{width,height},timezoneId:'Australia/Sydney',hasTouch:width<1024,isMobile:width<1024});
   await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
   await context.addInitScript(()=>{window.Chart=class{constructor(){this.data={};this.options={};}destroy(){}update(){}};});
   const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.goto('http://127.0.0.1:'+server.address().port+'/tests/sync-browser.html?preview&training&ui=journal&accent=385c72&switch=training-'+width+'-'+theme+(theme==='light'?'&light':'')+'#log');
   await p.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady&&document.querySelector('#log-coverage'));
   await p.evaluate(()=>{obDismiss();dailyUpdateDismiss();setView('log');});
   const before=await p.evaluate(snapshot);
   const switchFit=await p.locator('.lg-coverage-tabs').evaluate(e=>{
    const buttons=Array.from(e.querySelectorAll('button')).map(b=>b.getBoundingClientRect());
    return e.scrollWidth<=e.clientWidth+1&&Math.abs(buttons[0].width-buttons[1].width)<1&&buttons.every(b=>b.height>=44&&b.right<=e.getBoundingClientRect().right+1);
   });
   assert.ok(switchFit,label+' coverage switch has equal, contained touch targets');
   await p.locator('#lg-ex-btn').click();
   assert.equal(await p.locator('#log-sub-exercises select').count(),0,label+' visible categories replace dropdown');
   assert.ok(await p.locator('#lib-filter-row button').count()>5,label+' muscle groups in view');
   await p.getByRole('searchbox',{name:'Search exercise library'}).fill('db curls');
   assert.equal(await p.locator('.lib-open').count(),1,label+' library search');
   assert.equal(await p.locator('.lib-group').getAttribute('aria-label'),'Arms exercises',label+' grouped search results');
   await p.getByRole('searchbox',{name:'Search exercise library'}).fill('');
   await p.locator('#lib-filter-row button[data-muscle="back"]').click();
   assert.equal(await p.locator('.lib-open').count(),2,label+' back category');
   assert.equal(await p.locator('.lib-group').getAttribute('aria-label'),'Back exercises',label+' group header');
   await p.locator('#lib-filter-row button[data-muscle="all"]').click();
   await p.locator('.lib-open').last().scrollIntoViewIfNeeded();
   const addBox=await p.getByRole('button',{name:'Add exercise',exact:true}).boundingBox();
   assert.ok(addBox.y>=0&&addBox.y+addBox.height<height*.5,label+' pinned Add at end of library '+JSON.stringify(addBox));
   await p.getByRole('button',{name:'Add exercise',exact:true}).click();
   assert.ok(await p.locator('#exlib-new-name').isVisible(),label+' Add opens exercise form');
   await p.locator('#exlib-add-modal').getByRole('button',{name:'Cancel',exact:true}).click();
   assert.equal(await p.evaluate(snapshot),before,label+' library browse/filter/cancel does not write');
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' library width');
   await p.locator('#lg-today-btn').click();
   await p.locator('.lg-coverage-tabs button').nth(1).click();
   assert.match(await p.locator('.lg-coverage-summary').innerText(),/12\s+recorded working sets/,label+' recorded coverage');
   await p.locator('.lg-body-muscle[data-muscle="core"] path').first().click();
   assert.match(await p.locator('.lg-muscle-detail').innerText(),/No recorded sets/,label+' empty group');
   await p.locator('.lg-coverage-tabs button').first().click();
   assert.equal(await p.evaluate(snapshot),before,label+' read-only coverage');
   const surface=await p.locator('.lg-training-dock').evaluate(e=>getComputedStyle(e).backgroundColor);
   assert.match(surface,/rgb\(/,label+' opaque neutral footer');
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' overview width');
   await p.getByRole('button',{name:'Open workout →',exact:true}).click();
   await p.evaluate(()=>{
    const name=type(S.dayIdx).exercises[0].name;S.setData[name]=[{weight:'55',reps:'8',type:'working',done:true}];
    S.sessionNote='Preserved session note';S.sessionStart=Date.now()-30000;recomputeChecked();saveSetData();renderLog();
   });
   const draft=await p.evaluate(()=>JSON.stringify({sets:S.setData,note:S.sessionNote,start:S.sessionStart,sessions:S.sessions,swaps:S.swaps}));
   await p.locator('#log-edit-btn').click();
   await p.getByRole('button',{name:'Move Low-incline Smith chest press down',exact:true}).click();
   assert.equal(await p.evaluate(()=>type(S.dayIdx).exercises[1].name),'Low-incline Smith chest press',label+' move down');
   assert.equal(await p.evaluate(()=>JSON.stringify({sets:S.setData,note:S.sessionNote,start:S.sessionStart,sessions:S.sessions,swaps:S.swaps})),draft,label+' reorder preserved draft');
   assert.ok(await p.evaluate(()=>S.checked.has(1)),label+' checked follows exercise');
   await p.locator('#ec1 .ex-drag-handle').press('Alt+ArrowUp');
   assert.equal(await p.evaluate(()=>type(S.dayIdx).exercises[0].name),'Low-incline Smith chest press',label+' keyboard reorder');
   if(width===390){
    await p.evaluate(()=>{exCollapsed=new Set(type(S.dayIdx).exercises.map((_,i)=>i));renderLog();});
    await p.locator('#ec0 .ex-drag-handle').scrollIntoViewIfNeeded();
    const a=await p.locator('#ec0 .ex-drag-handle').boundingBox(),b=await p.locator('#ec1').boundingBox(),cdp=await context.newCDPSession(p);
    const x=a.x+a.width/2,y=a.y+a.height/2,end=b.y+b.height-10;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+(end-y)*i/8}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await p.evaluate(()=>type(S.dayIdx).exercises[1].name),'Low-incline Smith chest press',label+' touch reorder');
    assert.equal(await p.evaluate(()=>S.setData['Low-incline Smith chest press'][0].weight),'55',label+' touch retained sets');
    await cdp.detach();
   }
   if(width===1440){
    const a=await p.locator('#ec0 .ex-drag-handle').boundingBox(),b=await p.locator('#ec1').boundingBox();
    await p.mouse.move(a.x+a.width/2,a.y+a.height/2);await p.mouse.down();await p.mouse.move(b.x+100,b.y+b.height-4,{steps:8});await p.mouse.up();
    assert.equal(await p.evaluate(()=>type(S.dayIdx).exercises[1].name),'Low-incline Smith chest press',label+' pointer reorder');
   }
   // Pick a blank source, so the repetitions/seconds guard can be tested separately.
   await p.evaluate(()=>{logEditMode=false;renderLog();openSwapModal(type(S.dayIdx).exercises.findIndex(e=>e.name==='Lat pulldown'));});
   await p.getByRole('searchbox',{name:'Search replacement exercises'}).fill('db curl');
   assert.equal(await p.locator('.swap-result').count(),1,label+' abbreviation result');
   await p.getByRole('searchbox',{name:'Search replacement exercises'}).fill('carry');
   assert.match(await p.locator('.swap-result').innerText(),/Farmer’s carry/,label+' earlier exercise found');
   await p.getByRole('searchbox',{name:'Search replacement exercises'}).fill('cable seated');
   assert.match(await p.locator('.swap-result').innerText(),/Seated cable row/,label+' reordered terms');
   if(width<1024){
    await p.evaluate(()=>{
     const h=window.innerHeight>500?360:280;
     window.realTrainingVV=window.visualViewport;Object.defineProperty(window,'visualViewport',{configurable:true,value:{height:h,offsetTop:12,width:innerWidth}});swapSyncKeyboard();
    });
    const geometry=await p.locator('#swap-modal').evaluate(e=>{const r=e.getBoundingClientRect(),a=e.querySelector('.se-picker-actions').getBoundingClientRect();return {top:r.top,bottom:r.bottom,footer:a.bottom,list:e.querySelector('.se-picker-list').clientHeight};});
    assert.ok(geometry.top>=19&&geometry.bottom<=12+(height>500?360:280)-7,label+' keyboard bounds '+JSON.stringify(geometry));
    assert.ok(geometry.footer<=geometry.bottom&&geometry.list>15,label+' keyboard actions/list');
    await p.evaluate(()=>{Object.defineProperty(window,'visualViewport',{configurable:true,value:window.realTrainingVV});swapSyncKeyboard();});
   }
   await p.locator('.swap-result').click();
   assert.ok(await p.locator('#swap-modal').evaluate(e=>e.classList.contains('hidden')),label+' selection dismisses picker '+JSON.stringify(await p.evaluate(()=>({target:swapTargetName,day:swapTargetDay,query:document.getElementById('swap-input').value,swaps:S.swaps})))+' errors '+errors.join(','));
   assert.equal(await p.evaluate(()=>S.swaps['Lat pulldown']),'Seated cable row',label+' correct swap');
   await p.evaluate(()=>openSwapModal(type(S.dayIdx).exercises.findIndex(e=>e.name==='Lat pulldown')));
   await p.getByRole('searchbox',{name:'Search replacement exercises'}).fill('thrust');
   await p.getByRole('button',{name:'Cancel',exact:true}).click();
   assert.equal(await p.evaluate(()=>S.swaps['Lat pulldown']),'Seated cable row',label+' cancellation preserves swap');
   const retained=await p.evaluate(()=>JSON.stringify({setData:S.setData,note:S.sessionNote,sessionStart:S.sessionStart,order:type(S.dayIdx).exercises.map(e=>e.name)}));
   await p.reload();await p.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady);
   assert.deepEqual(await p.evaluate(()=>type(S.dayIdx).exercises.map(e=>e.name)),JSON.parse(retained).order,label+' order survives reload');
   assert.equal(await p.evaluate(()=>S.setData['Low-incline Smith chest press'][0].weight),'55',label+' restored sets');
   assert.equal(await p.evaluate(()=>S.sessionNote),'Preserved session note',label+' restored note');
   assert.equal(await p.evaluate(()=>S.swaps['Lat pulldown']),'Seated cable row',label+' replacement survives reload');
   await p.evaluate(()=>{logOpenSession();openSwapModal(type(S.dayIdx).exercises.findIndex(e=>e.name==='Low-incline Smith chest press'));});
   await p.getByRole('searchbox',{name:'Search replacement exercises'}).fill('plank');
   await p.locator('.swap-result').click();
   assert.equal(await p.evaluate(()=>S.swaps['Low-incline Smith chest press']),undefined,label+' unit-change guard');
   assert.equal(await p.evaluate(()=>S.setData['Low-incline Smith chest press'][0].reps),'8',label+' unit guard retained reps');
   await p.getByRole('button',{name:'Cancel',exact:true}).click();
   const history=await p.evaluate(()=>JSON.stringify(S.sessions));
   await p.waitForFunction(()=>!_vpSettleRaf);
   await p.getByRole('button',{name:'Save partial workout',exact:true}).click();
   try{await p.waitForFunction(()=>S.sessions.some(s=>s.note==='Preserved session note'),{},{timeout:5000});}catch(error){
    console.error(label,await p.evaluate(()=>({sets:S.setData,note:S.sessionNote,view:S.view,logTodayView,day:S.dayIdx,msg:document.getElementById('save-msg').textContent})),errors);
    await p.screenshot({path:path.join(root,'temp-analysis/training-failure.png')});throw error;
   }
   assert.equal(await p.evaluate(()=>JSON.stringify(S.sessions.slice(0,-1))),history,label+' earlier records preserved');
   assert.equal(await p.evaluate(()=>S.sessions.at(-1).exercises[0].name),'Low-incline Smith chest press',label+' saved reordered set identity');
   assert.equal(await p.evaluate(()=>S.sessions.at(-1).exercises[0].sets[0].weight),55,label+' saved entered weight');
   assert.equal(await p.evaluate(()=>S.sessions.at(-1).note),'Preserved session note',label+' saved note');
   assert.deepEqual(errors,[],label+' runtime errors');
   console.log('PASS '+label);await context.close();
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
