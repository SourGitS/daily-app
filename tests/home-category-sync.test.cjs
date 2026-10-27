const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {app,Cloud,Store}=require('./harness.cjs');
const model=require('../js/home-category-model.js');
class MultiCloud extends Cloud{
 constructor(seed){super(seed);this.subscribers=new Map();this.rejectWrites=false;}
 ref(path){const r=super.ref(path),cloud=this,owned=new Set();return {...r,
  on(_,fn){owned.add(fn);if(!cloud.subscribers.has(path))cloud.subscribers.set(path,new Set());cloud.subscribers.get(path).add(fn);},
  off(){owned.forEach(fn=>cloud.subscribers.get(path)?.delete(fn));owned.clear();},
  transaction(...args){return cloud.rejectWrites?Promise.reject(Error('Offline test')):r.transaction(...args);}
 };}
 emit(path){for(const fn of this.subscribers.get(path)||[])fn(this.snap(path));}
}
class NativeStore extends Store{get length(){return this.data.size;}key(i){return [...this.data.keys()][i]??null;}}
const scopeContext=vm.createContext({});
vm.runInContext(fs.readFileSync('js/account-storage.js','utf8').split('const dailyNativeStorage=')[0],scopeContext);
function device(cloud,uid='u',native=new NativeStore()){
 const storage=scopeContext.dailyScopedStorage(native,'user:'+uid),c=app(cloud,storage),handlers={},statuses=[];
 Object.assign(c,model,{document:{addEventListener:(n,f)=>(handlers[n]??=[]).push(f)},window:{addEventListener(){}},_activeSettingsKey:null,renderHome(){},renderHomeLayoutSection(){},setSyncStatus:s=>statuses.push(s)});
 c.auth.currentUser.uid=uid;c.S.view='home';
 vm.runInContext(fs.readFileSync('js/home-category.js','utf8'),c);
 return {c,storage,native,statuses,attach(){c.categoryAttachSync(uid);},apply(){const action={dataset:{catEditor:'apply'}};handlers.click.forEach(fn=>fn({target:{closest:s=>s==='[data-cat-editor]'?action:null}}));}};
}
const key=mode=>'daily_category_home_'+mode,path=(mode,uid='u')=>'users/'+uid+'/categoryHome'+(mode==='mobile'?'Mobile':'Desktop');
const saved=(enabled=true,hidden=[],order=['training','budget','weather'])=>({enabled,hidden,order});

test('default Home appears without creating local timestamps or cloud layouts',async()=>{
 const cloud=new MultiCloud(),a=device(cloud);a.attach();
 assert.equal(a.c.categoryLoad('mobile').enabled,true);assert.equal(a.c.categoryLoad('desktop').enabled,true);
 await cloud.settle();assert.equal(a.storage.length,0);assert.equal(cloud.writes.length,0);
});
test('two devices sync phone and desktop independently and never write legacy layouts or records',async()=>{
 const cloud=new MultiCloud({users:{u:{homeLayout:{v:'legacy',t:1},transactions:{v:'expenses',t:2}}}}),a=device(cloud),b=device(cloud);a.attach();b.attach();
 a.c.categorySave('mobile',saved(true,['weather'],['food','training']));b.c.categorySave('desktop',saved(true,['journal'],['stats','training']));await cloud.settle();cloud.emit(path('mobile'));cloud.emit(path('desktop'));
 for(const d of [a,b]){assert.equal(d.c.categoryLoad('mobile').hidden[0],'weather');assert.equal(d.c.categoryLoad('desktop').hidden[0],'journal');assert.equal(d.c.categoryLoad('mobile').order[0],'food');assert.equal(d.c.categoryLoad('desktop').order[0],'stats');}
 assert.equal(cloud.get('users/u/homeLayout').v,'legacy');assert.equal(cloud.get('users/u/transactions').v,'expenses');assert.ok(cloud.writes.every(w=>/categoryHome(Mobile|Desktop)$/.test(w.path)));
});
test('fresh-device cloud restore respects an explicit old-layout choice and its timestamp',async()=>{
 const value=JSON.stringify(saved(false,['stats'])),cloud=new MultiCloud({users:{u:{categoryHomeMobile:{v:value,t:700}}}}),a=device(cloud);a.attach();cloud.emit(path('mobile'));await cloud.settle();
 assert.equal(a.c.categoryLoad('mobile').enabled,false);assert.equal(a.storage.getItem(key('mobile')+'_ts'),'700');assert.equal(a.c.categoryLoad('desktop').enabled,true);assert.equal(cloud.writes.length,0);
});
test('newer cloud layout makes an open draft stale and Apply cannot overwrite it',async()=>{
 const cloud=new MultiCloud(),a=device(cloud);a.attach();a.c.categoryDraft('mobile').hidden=['weather'];
 const remote=JSON.stringify(saved(true,['journal']));cloud.put(path('mobile'),{v:remote,t:Date.now()+10000});cloud.emit(path('mobile'));a.apply();await cloud.settle();
 assert.equal(cloud.get(path('mobile')).v,remote);assert.equal(cloud.writes.length,0);assert.equal(a.c.categoryLoad('mobile').hidden[0],'journal');
});
test('a cloud edit arriving between local Apply and transaction commit wins over the stale upload',async()=>{
 const cloud=new MultiCloud(),a=device(cloud);a.attach();a.c.categorySave('mobile',saved(true,['weather']));
 const remote=JSON.stringify(saved(false,['journal']));cloud.put(path('mobile'),{v:remote,t:Date.now()+10000});await cloud.settle();cloud.emit(path('mobile'));
 assert.equal(cloud.get(path('mobile')).v,remote);assert.equal(a.c.categoryLoad('mobile').enabled,false);assert.equal(a.c.categoryLoad('mobile').hidden[0],'journal');
});
test('offline layout changes survive reload and upload on reconnect without touching the other device layout',async()=>{
 const cloud=new MultiCloud(),a=device(cloud);a.c.firebaseReady=false;a.c.categorySave('mobile',saved(true,['shopping']));await cloud.settle();assert.equal(cloud.writes.length,0);
 const reloaded=device(cloud,'u',a.native);reloaded.attach();await cloud.settle();assert.equal(JSON.parse(cloud.get(path('mobile')).v).hidden[0],'shopping');assert.equal(cloud.get(path('desktop')),null);
});
test('failed cloud upload retains the local layout and converges on reconnect',async()=>{
 const cloud=new MultiCloud(),a=device(cloud);a.attach();await cloud.settle();cloud.rejectWrites=true;a.c.categorySave('mobile',saved(true,['weight']));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(a.c.categoryLoad('mobile').hidden[0],'weight');assert.ok(a.statuses.includes('Sync failed'));assert.equal(cloud.get(path('mobile')),null);
 cloud.rejectWrites=false;a.c.syncDetachAll();a.attach();await cloud.settle();assert.equal(JSON.parse(cloud.get(path('mobile')).v).hidden[0],'weight');
});
test('account switch detaches listeners and keeps both layout keys and backup enumeration scoped',async()=>{
 const cloud=new MultiCloud(),native=new NativeStore(),a=device(cloud,'A',native);a.attach();a.c.categorySave('mobile',saved(false,['food']));await cloud.settle();a.c.syncDetachAll();
 const b=device(cloud,'B',native);b.attach();await cloud.settle();assert.equal(b.c.categoryLoad('mobile').enabled,true);assert.equal(b.storage.getItem(key('mobile')),null);
 cloud.put(path('mobile','A'),{v:JSON.stringify(saved(true,['journal'])),t:Date.now()+10000});cloud.emit(path('mobile','A'));assert.equal(b.storage.getItem(key('mobile')),null);assert.equal(a.c.categoryLoad('mobile').enabled,false);
 assert.equal(b.storage.length,0);assert.ok(Array.from({length:a.storage.length},(_,i)=>a.storage.key(i)).includes(key('mobile')));
 assert.deepEqual(Array.from(b.c.SYNC_BLOB_REG,b=>[b.path,b.lsKey,b.tsKey]),[['categoryHomeMobile',key('mobile'),key('mobile')+'_ts'],['categoryHomeDesktop',key('desktop'),key('desktop')+'_ts']]);
});
