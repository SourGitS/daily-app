// Isolated sample expenses/layouts only. No production services or saved user data.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{const f=path.resolve(root,decodeURIComponent(req.url.split('?')[0]).slice(1));if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(f,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':mime[path.extname(f)]||'text/plain','Content-Security-Policy':"connect-src 'self'"});res.end(err?'Missing':data);});});
const snapshot=()=>Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)).map(k=>[k,localStorage.getItem(k)]));
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const sizes=process.env.DAILY_TOOLS_WIDTHS?(process.env.DAILY_TOOLS_WIDTHS.split(',').map(Number).map(w=>[w,950])):[[320,720],[390,844],[568,320],[844,390],[1024,950],[1100,950],[1180,950],[1240,950],[1440,950],[1920,1080]];
 for(const [width,height] of sizes)for(const theme of ['dark','light']){
  const context=await browser.newContext({viewport:{width,height},timezoneId:'Australia/Sydney',reducedMotion:'reduce'});
  await context.route(/firebaseio\.com|cloudfunctions\.net|api\.open-meteo\.com/,r=>r.abort());
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:'+server.address().port+'/tests/sync-browser.html?preview&ui=journal&finance-links');
  await p.waitForFunction(()=>typeof _cloudWorkoutReady!=='undefined'&&_cloudWorkoutReady);
  await p.getByText('Local preview · sample money only. Changes here do not affect your saved finances.').waitFor();
  await p.addStyleTag({content:'*,*:before,*:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}'});
  await p.evaluate(theme=>{obDismiss();dailyUpdateDismiss();profileData.budgetRhythmSeen=2;foodCatalogueState.seenThisSession=true;S.theme=theme;applyTheme();weatherCancelRequest();weatherEnsureFresh=()=>Promise.resolve(false);setView('budget');bcalcClear();bcalcDigit('8');},theme);
  const initial=await p.evaluate(snapshot),accounts=await p.evaluate(()=>JSON.stringify(loadAccounts()));
  await p.evaluate(()=>openTxnModal());await p.locator('#txn-amount').fill('7.50');
  assert.equal(await p.locator('#txn-calculator').getAttribute('open'),null);
  await p.locator('#txn-calculator summary').click();
  const keys=p.locator('#txn-calculator .bcalc-pad');await keys.getByRole('button',{name:'Clear calculator',exact:true}).focus();
  await p.keyboard.type('12.5*2=');assert.equal(await p.locator('#txn-calc-display').textContent(),'25');
  assert.equal(await p.locator('#txn-amount').inputValue(),'7.50','scratchpad must leave amount alone');
  await p.locator('#txn-calc-use').click();assert.equal(await p.locator('#txn-amount').inputValue(),'25.00');
  await p.locator('#txn-calculator summary').click();await keys.getByRole('button',{name:'Clear calculator',exact:true}).click();
  for(const name of ['4','Divide','0','Equals'])await keys.getByRole('button',{name,exact:true}).click();
  assert.equal(await p.locator('#txn-calc-use').isDisabled(),true);
  assert.equal(await p.locator('#txn-amount').inputValue(),'25.00');
  await keys.getByRole('button',{name:'7',exact:true}).click();await keys.getByRole('button',{name:'Add',exact:true}).click();await keys.getByRole('button',{name:'3',exact:true}).click();
  await p.locator('#txn-calc-use').click();assert.equal(await p.locator('#txn-amount').inputValue(),'10.00','Use result resolves a pending sum');
  await p.evaluate(()=>closeTxnModal());assert.deepEqual(await p.evaluate(snapshot),initial,'cancel and calculator must write no records');
  assert.equal(await p.evaluate(()=>_bcalc.entry),'8','weekly calculator stays independent');
  await p.evaluate(()=>openTxnModal());await p.locator('#txn-amount').fill('');
  assert.equal(await p.locator('#txn-calculator').getAttribute('open'),null);assert.equal(await p.locator('#txn-calc-display').textContent(),'0');
  await p.locator('#txn-calculator summary').click();for(const name of ['2','Divide','4','Equals'])await keys.getByRole('button',{name,exact:true}).click();
  const boxes=await p.locator('#txn-calculator .bcalc-key').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height};}));assert.ok(boxes.every(r=>r.w>=44&&r.h>=44),'key targets stay usable');
  assert.equal(await p.locator('#txn-modal-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'calculator fits the form');
  const footer=await p.locator('#txn-modal-footer').boundingBox();assert.ok(footer.y>=0&&footer.y+footer.height<=height+1,'Save and Cancel remain on screen');
  if(width===1440||width===390)await p.screenshot({path:path.join(root,`temp-analysis/tools-calculator-${width}-${theme}.png`)});
  await p.locator('#txn-calc-use').click();await p.locator('#txn-merchant').fill('Calculator sample');await p.locator('#txn-account').selectOption('');
  await p.locator('#txn-save-btn').click();await p.waitForFunction(()=>txnData.some(t=>t.merchant==='Calculator sample'));
  assert.equal(await p.evaluate(()=>txnData.find(t=>t.merchant==='Calculator sample').amount),0.5);
  assert.equal(await p.evaluate(()=>JSON.stringify(loadAccounts())),accounts,'calculating and saving an unlinked expense leaves balances alone');
  // Same editor/draft machinery, with paired groups matching the preview on desktop.
  await p.evaluate(()=>{setView('settings');openSettingsSection('homelayout');homeLayoutChooseProfile('desktop');homeCompositionChoose('dashboard');});
  const groups=p.locator('.hl-dashboard-editor > .hl-col-group');assert.equal(await groups.count(),2);
  const a=await groups.nth(0).boundingBox(),b=await groups.nth(1).boundingBox();
  if(width>=1024){assert.ok(Math.abs(a.y-b.y)<1&&b.x>=a.x+a.width,'desktop groups must sit side by side');assert.ok(Math.abs(a.width/b.width-1.5)<0.05,'columns match preview proportions');}
  else assert.ok(b.y>=a.y+a.height,'phone editor remains stacked');
  const overflowing=await p.locator('.hl-dashboard-editor .hl-widget').evaluateAll(es=>es.filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.dataset.hlWidget));assert.deepEqual(overflowing,[],'editor rows must fit');
  const financial=await p.evaluate(()=>JSON.stringify([txnData,loadAccounts()]));
  const before=await p.evaluate(()=>JSON.stringify(homeLayouts()));
  await p.locator('[data-hl-widget="notes"] .hl-col-btn').click();
  assert.equal(await p.evaluate(()=>JSON.stringify(homeLayouts())),before,'move is a draft');
  assert.equal(await p.evaluate(()=>document.activeElement.dataset.hlFocus),'notes:col','move retains keyboard focus');
  await p.evaluate(()=>homeLayoutCancel('desktop',true));assert.equal(await p.evaluate(()=>JSON.stringify(homeLayouts())),before);
  await p.evaluate(()=>homeCompositionChoose('dashboard'));await p.locator('[data-hl-widget="notes"] .hl-col-btn').click();
  const draft=await p.evaluate(()=>JSON.stringify(homeDashColumns(hlView('desktop'))));await p.evaluate(()=>homeLayoutApply('desktop'));
  assert.equal(await p.evaluate(()=>JSON.stringify(homeDashColumns(homeLayout('desktop')))),draft,'Apply retains column placement');
  assert.equal(await p.evaluate(()=>JSON.stringify([txnData,loadAccounts()])),financial,'layout changes leave financial records alone');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'page must fit');
  assert.deepEqual(errors,[],width+' '+theme+' browser errors');console.log('PASS tools',width,height,theme);
  if(width===1440||width===390)await p.screenshot({path:path.join(root,`temp-analysis/tools-layout-${width}-${theme}.png`),fullPage:true});
  await context.close();
 }
}finally{await Promise.race([browser.close(),new Promise(r=>setTimeout(r,5000))]);server.close();}})().then(()=>process.exit(0),e=>{console.error(e);server.close();process.exit(1);});
