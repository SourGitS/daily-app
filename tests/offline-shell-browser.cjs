// Install the real worker in a temporary Chromium profile. Only fixture contents enter its cache.
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const cacheVersion=fs.readFileSync(path.join(root,'service-worker.js'),'utf8').match(/const CACHE_NAME = '([^']+)'/)[1];
const previousVersion=cacheVersion.replace(/\d+$/,version=>String(Number(version)-1));
const pageHTML='<title>Daily offline fixture</title><h1>Daily offline fixture</h1>';

(async()=>{
  let online=true,forecast=19;
  const server=http.createServer((req,res)=>{
    if(!online){req.socket.destroy();return;}
    const url=new URL(req.url,'http://localhost'),file=url.pathname.slice('/daily/'.length);
    if(!url.pathname.startsWith('/daily/')){res.writeHead(404).end();return;}
    if(['service-worker.js','js/cache-scope.js','js/notification-storage.js'].includes(file)){
      res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(root,file)));return;
    }
    res.setHeader('Content-Type',file===''||file==='index.html'?'text/html':'text/plain');
    res.end(file===''||file==='index.html'?pageHTML:'fixture');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true,args:['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
    const ctx=await browser.newContext(),base='http://127.0.0.1:'+server.address().port+'/daily/';
    await ctx.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin===new URL(base).origin)return route.continue();
      if(url.origin==='https://api.open-meteo.com'){
        if(forecast==null)return route.abort();
        return route.fulfill({headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'},body:String(forecast)});
      }
      if(url.hostname==='cdnjs.cloudflare.com'||url.hostname==='www.gstatic.com'){
        return route.fulfill({headers:{'Access-Control-Allow-Origin':'*','Content-Type':'text/javascript'},body:'/* fixture */'});
      }
      return route.abort();
    });
    const p=await ctx.newPage();await p.goto(base);
    const weather='https://api.open-meteo.com/v1/forecast?latitude=1&longitude=2';
    const previousShell=await p.evaluate(async({weather,previousVersion})=>{
      const legacy=await caches.open('daily-v451'),other=await caches.open('sibling-fixture');
      await legacy.put(new URL('js/app.js',location.href),new Response('old Daily'));
      await legacy.put(weather,new Response('old weather'));
      await other.put(new URL('/sibling/icon.png',location.href),new Response('sibling'));
      const previous='daily-shell:'+encodeURIComponent(new URL('./',location.href).href)+':'+previousVersion;
      await (await caches.open(previous)).put(new URL('js/app.js',location.href),new Response('previous installed shell'));
      await navigator.serviceWorker.register('service-worker.js');
      return previous;
    },{weather,previousVersion});
    await p.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:20000});
    const names=await p.evaluate(()=>caches.keys());
    assert.ok(names.includes('sibling-fixture'));assert.ok(!names.includes('daily-v451'));
    assert.ok(!names.includes(previousShell),'the previous installed shell is retired');
    assert.ok(names.some(name=>name.startsWith('daily-shell:')&&name.endsWith(cacheVersion)));
    assert.equal(await p.evaluate(async()=>!!await caches.match(new URL('js/finance-overview.js',location.href))),true,'the Finance overview is included in the offline shell');
    for(const file of ['js/tv-navigation.js','css/tv-navigation.css']){
      assert.equal(await p.evaluate(async file=>!!await caches.match(new URL(file,location.href)),file),true,file+' is included in the offline shell');
    }
    const readForecast=()=>p.evaluate(async url=>(await fetch(url)).text(),weather);
    assert.equal(await readForecast(),'19');forecast=31;assert.equal(await readForecast(),'31');
    forecast=null;await assert.rejects(readForecast);
    assert.equal(await p.evaluate(async url=>!!await caches.match(url),weather),false);
    online=false;
    assert.equal(await p.evaluate(async()=>(await fetch('js/finance-overview.js')).text()),'fixture','the new Finance code remains available offline');
    for(const file of ['js/tv-navigation.js','css/tv-navigation.css']){
      assert.equal(await p.evaluate(async file=>(await fetch(file)).text(),file),'fixture',file+' remains available offline');
    }
    for(const suffix of ['?new-link=1','index.html?another=1','?tv=1']){
      const response=await p.goto(base+suffix);
      assert.ok(response.fromServiceWorker());
      assert.equal(await p.title(),'Daily offline fixture');
    }
    console.log('PASS worker install, scoped upgrade, fresh weather and outage, offline root and index query links');
  }finally{
    await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
