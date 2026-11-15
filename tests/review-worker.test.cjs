const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),scope='https://example.test/daily/',weather='https://api.open-meteo.com/v1/forecast?latitude=1&longitude=2';
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
function fixture(){
  const listeners={},stores=new Map(),key=r=>typeof r==='string'?r:r.url;
  const caches={keys:async()=>[...stores.keys()],delete:async n=>stores.delete(n),open:async n=>{
    if(!stores.has(n))stores.set(n,new Map());const data=stores.get(n);
    return {keys:async()=>[...data.keys()].map(x=>new Request(x)),match:async k=>data.get(key(k))?.clone(),
      put:async(k,r)=>data.set(key(k),r),delete:async k=>data.delete(key(k)),addAll:async paths=>{for(const p of paths)data.set(new URL(p,scope).href,new Response('precache'));}};
  }};
  const ctx=vm.createContext({caches,Request,Response,URL,importScripts(){},self:{registration:{scope},clients:{claim(){}},skipWaiting(){},addEventListener:(name,fn)=>listeners[name]=fn}});
  vm.runInContext(read('js/cache-scope.js')+'\n'+read('service-worker.js'),ctx);
  const run=name=>new Promise((res,rej)=>listeners[name]({waitUntil:p=>p.then(res,rej)}));
  const fetch=(url,options={})=>{let response;listeners.fetch({request:{method:'GET',mode:'cors',cache:'default',headers:new Headers(),url,...options},respondWith:p=>response=p});return response;};
  const put=async(n,url,body)=>{const c=await caches.open(n);await c.put(url,new Response(body))};
  return {run,fetch,ctx,stores,caches,put};
}
test('forecast, arbitrary API, authorization and no-store requests bypass Cache Storage',async()=>{
  const f=fixture();await f.run('install');
  for(const [url,opts] of [[weather,{}],[scope+'api/data',{}],[scope+'js/app.js',{headers:new Headers({Authorization:'example'})}],[scope+'index.html',{cache:'no-store'}]]){
    assert.equal(f.fetch(url,opts),undefined);
  }
  f.ctx.fetch=async()=>new Response('private',{headers:{'Cache-Control':'no-store'}});
  await f.fetch(scope+'js/app.js');f.ctx.fetch=async()=>{throw Error('offline')};
  assert.equal(await (await f.fetch(scope+'js/app.js')).text(),'precache');
});
test('activation preserves sibling assets and removes outdated Daily caches and legacy coordinates',async()=>{
  const f=fixture();await f.run('install');const prefix=f.ctx.dailyCachePrefix(scope),sibling=f.ctx.dailyCachePrefix('https://example.test/other/');
  for(const n of [prefix+'daily-v0',sibling+'daily-v1','other-app-v1','daily-v450'])await f.put(n,'https://example.test/other/app.js','other');
  await f.put('daily-v450',scope+'js/app.js','old');await f.put('daily-v450',weather,'old');
  await f.put('daily-v451',scope+'js/app.js','old');await f.put('daily-v451',weather,'old');
  await f.run('activate');
  assert.ok(!f.stores.has(prefix+'daily-v0')&&!f.stores.has('daily-v451'));
  for(const n of [sibling+'daily-v1','other-app-v1','daily-v450'])assert.ok(f.stores.get(n).has('https://example.test/other/app.js'));
  assert.ok(!f.stores.get('daily-v450').has(weather));
});
test('manual location removal purges only identified Daily caches, including legacy entries',async()=>{
  const f=fixture();const owned=f.ctx.dailyCachePrefix(scope)+'daily-v452';
  for(const name of [owned,'daily-v451','different-app'])await f.put(name,weather,'fixture');
  await f.put('daily-v451',scope+'js/app.js','old');await f.ctx.dailyClearWeatherResponses(scope);
  assert.ok(!f.stores.get(owned).has(weather)&&!f.stores.get('daily-v451').has(weather));
  assert.ok(f.stores.get('different-app').has(weather));
});
test('an offline or previously unseen query opens the scoped shell, and query responses never replace it',async()=>{
  const f=fixture();await f.run('install');
  f.ctx.fetch=async()=>new Response('one-time response');
  assert.equal(await (await f.fetch(scope+'?first=1',{mode:'navigate'})).text(),'one-time response');
  f.ctx.fetch=async()=>{throw Error('offline')};
  for(const tail of ['?new=1','index.html?new=1',''])assert.equal(await(await f.fetch(scope+tail,{mode:'navigate'})).text(),'precache');
  assert.equal(f.fetch(scope+'unknown?new=1',{mode:'navigate'}),undefined);
});
test('online assets remain accessible when browser cache storage is unavailable',async()=>{
  const f=fixture();f.caches.open=async()=>{throw Error('storage unavailable')};
  f.ctx.fetch=async()=>new Response('online');assert.equal(await(await f.fetch(scope+'js/app.js')).text(),'online');
});
