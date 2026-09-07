const test = require('node:test');
const assert = require('node:assert/strict');
const { app, Cloud, Store, session } = require('./harness.cjs');

test('signed-in boot defaults never upload or acquire a fresh timestamp', async () => {
  const cloud = new Cloud({ users: { u: { trainingSplit: { v: 'real program', t: 800 } } } });
  const a = app(cloud); a._bootPhase = true;
  a.lsSave('wt_split', { types: [] }, 'trainingSplit');
  a.lsSaveTS('wt_exercise_lib', [], 'wt_exercise_lib_ts', 'exerciseLib');
  await cloud.settle();
  assert.equal(a.localStorage.getItem('wt_split_ts'), '0');
  assert.equal(a.localStorage.getItem('wt_exercise_lib_ts'), '0');
  assert.equal(cloud.writes.length, 0);
});
test('an unstamped upload cannot beat an existing program, even after boot', async () => {
  const cloud = new Cloud({ users: { u: { trainingSplit: { v: 'real', t: 800 } } } });
  const a = app(cloud); a.localStorage.setItem('wt_split','defaults');
  a.syncBlobPush('trainingSplit','wt_split'); await cloud.settle();
  assert.equal(cloud.get('users/u/trainingSplit').v,'real');
  assert.equal(cloud.writes.length,0);
});
test('a server edit between seed-read and commit survives', async () => {
  const cloud = new Cloud(), a = app(cloud);
  a.localStorage.setItem('wt_split','defaults');
  a.syncBlobListen('u','trainingSplit','wt_split');
  cloud.put('users/u/trainingSplit',{v:'another device saved',t:900});
  await cloud.settle();
  assert.equal(cloud.get('users/u/trainingSplit').v,'another device saved');
});
test('fresh profile restores split, exercise library and plans without uploading defaults', async () => {
  const cloud = new Cloud(), a = app(cloud);
  for (const [path,key] of [['trainingSplit','wt_split'],['exerciseLib','wt_exercise_lib'],['plans','wt_plans']]) {
    cloud.put('users/u/'+path,{v:JSON.stringify({saved:path}),t:500});
    a._bootPhase=true; a.lsSave(key,{empty:true},path); a._bootPhase=false;
    a.syncBlobListen('u',path,key);
    cloud.emit('users/u/'+path);
    assert.equal(a.localStorage.getItem(key),JSON.stringify({saved:path}));
  }
  await cloud.settle(); assert.equal(cloud.writes.length,0);
});
test('identical blob content still adopts the cloud timestamp', () => {
  const cloud = new Cloud({users:{u:{plans:{v:'same',t:900}}}}), a=app(cloud);
  a.localStorage.setItem('wt_plans','same'); a.localStorage.setItem('wt_plans_ts','10');
  a.syncBlobListen('u','plans','wt_plans'); cloud.emit('users/u/plans');
  assert.equal(a.localStorage.getItem('wt_plans_ts'),'900');
});
test('read-time normalisation cannot restamp or upload cloud data', async () => {
  const cloud = new Cloud({users:{u:{trainingSplit:{v:'cloud',t:900}}}}), a=app(cloud);
  a.syncBlobListen('u','trainingSplit','wt_split',()=>a.lsSave('wt_split','normalised','trainingSplit'));
  cloud.emit('users/u/trainingSplit'); await cloud.settle();
  assert.equal(a.localStorage.getItem('wt_split_ts'),'900');
  assert.equal(cloud.writes.length,0); assert.equal(a._syncApplying,0);
});
test('legacy raw cloud blobs beat untouched defaults; explicit newer clearing still works', async () => {
  const cloud = new Cloud({users:{u:{plans:'legacy saved plans'}}}), a=app(cloud);
  a.localStorage.setItem('wt_plans','defaults'); a.syncBlobListen('u','plans','wt_plans');
  cloud.emit('users/u/plans');
  assert.equal(a.localStorage.getItem('wt_plans'),'legacy saved plans');
  a.lsSaveTS('wt_plans',{plans:[]},'wt_plans_ts','plans'); await cloud.settle();
  assert.equal(cloud.get('users/u/plans').v,'{"plans":[]}');
});
test('empty fresh workout profile restores full history without cloud writes', async () => {
  const cloud=new Cloud({users:{u:{sessions:{a:session('a'),b:session('b')}}}}), a=app(cloud);
  a.wtAttachRecords(a.dbRef,'wt_sessions','id',rows=>a.S.sessions=rows);
  cloud.emit('users/u/sessions'); await cloud.settle();
  assert.equal(a.S.sessions.length,2); assert.equal(cloud.writes.length,0);
});
test('stale window adding a session preserves cloud-only sessions and newer edits', async () => {
  const cloud=new Cloud({users:{u:{sessions:{a:session('a',500,{effort:'hard'}),b:session('b',600)}}}});
  const a=app(cloud); a.S.sessions=[session('a'),session('c')];
  a.localStorage.setItem('wt_sessions',JSON.stringify([session('a')]));
  a.persist(['c']); await cloud.settle();
  assert.deepEqual(Object.keys(cloud.get('users/u/sessions')).sort(),['a','b','c']);
  assert.equal(cloud.get('users/u/sessions/a').effort,'hard');
  assert.ok(cloud.writes.every(w=>w.path.split('/').length===4));
});
test('two devices saving concurrently preserve both new workouts', async () => {
  const cloud=new Cloud(), a=app(cloud), b=app(cloud);
  a.S.sessions=[session('a')]; b.S.sessions=[session('b')];
  a.persist(['a']); b.persist(['b']); await cloud.settle();
  assert.deepEqual(Object.keys(cloud.get('users/u/sessions')).sort(),['a','b']);
});
test('shared-storage stale window cannot replace another window history', async () => {
  const storage=new Store(), cloud=new Cloud(), a=app(cloud,storage), b=app(cloud,storage);
  a.S.sessions=[session('a')]; a.persist(['a']);
  b.S.sessions=[session('b')]; b.persist(['b']); await cloud.settle();
  assert.deepEqual(JSON.parse(storage.getItem('wt_sessions')).map(r=>r.id).sort(),['a','b']);
});
test('offline deletion survives a stale device reconnect and remains out of visible history', async () => {
  const cloud=new Cloud({users:{u:{sessions:{a:session('a'),b:session('b')}}}}), a=app(cloud);
  a.localStorage.setItem('wt_sessions',JSON.stringify([session('a'),session('b')]));
  a.S.sessions=[session('b')]; a.dbRef=null; a.persist([],['a']);
  a.dbRef=cloud.ref('users/u/sessions'); a.wtAttachRecords(a.dbRef,'wt_sessions','id',rows=>a.S.sessions=rows);
  cloud.emit('users/u/sessions'); await cloud.settle();
  const stale=app(cloud); stale.S.sessions=[session('a')]; stale.persist(); await cloud.settle();
  assert.ok(cloud.get('users/u/sessions/a').deletedAt);
  assert.deepEqual(Array.from(a.load(),r=>r.id),['b']);
});
test('weight edits retain other dates and cloud wins stale same-date collisions', async () => {
  const cloud=new Cloud({users:{u:{weights:{20260901:{date:'2026-09-01',weight:80,updatedAt:500},20260902:{date:'2026-09-02',weight:81}}}}});
  const a=app(cloud); a.S.weights=[{date:'2026-09-01',weight:70},{date:'2026-09-07',weight:82}];
  await a.persistWeights(['2026-09-07']);
  assert.equal(cloud.get('users/u/weights/20260901').weight,80);
  assert.equal(Object.keys(cloud.get('users/u/weights')).length,3);
});
test('failed local save uploads nothing and reports failure', async () => {
  const cloud=new Cloud(),a=app(cloud); a.localStorage.fail=true;a.S.sessions=[session('a')];
  assert.equal(a.persist(['a']),false);await cloud.settle();assert.equal(cloud.writes.length,0);
});
test('onboarding finish cannot run ahead of cloud restore', () => {
  const a=app(); let message=''; a.showToast=s=>message=s;
  a.finishOnboarding(); assert.match(message,/still loading/);
});
test('boot preserves an existing edit timestamp', () => {
  const a=app(); a._bootPhase=true;
  a.localStorage.setItem('wt_split_ts','1234');
  a.lsSave('wt_split','normalised','trainingSplit');
  assert.equal(a.localStorage.getItem('wt_split_ts'),'1234');
});
test('explicit backup restore restamps record conflicts and retains deletion markers', () => {
  const a=app(); a.firebaseReady=false; a.confirm=()=>true; a.alert=()=>{}; a.location={reload:()=>{}};
  assert.equal(a.restoreFromText(JSON.stringify({data:{wt_sessions:JSON.stringify([
    session('a',5),session('deleted',5,{deletedAt:5})
  ]),wt_weight:JSON.stringify([{date:'2026-09-07',weight:80,updatedAt:5}])}})),true);
  const rows=JSON.parse(a.localStorage.getItem('wt_sessions'));
  assert.ok(rows[0].updatedAt>5);
  assert.equal(rows[1].deletedAt,rows[1].updatedAt);
  assert.equal(a.load().length,1);
  assert.ok(JSON.parse(a.localStorage.getItem('wt_weight'))[0].updatedAt>5);
});
