'use strict';
// From remote/, with its dev dependencies installed and Java 21+ available:
// npx --no-install firebase emulators:exec --only database --project demo-daily-app --config ../firebase.sync-emulator.json "node --test ../tests/active-sync-emulator.cjs"
// To exercise the exact release SDK, point DAILY_BROWSER_FIREBASE_DIR at a local copy
// of the two firebase-{app,database}-compat.js scripts referenced by index.html.
const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {createRequire} = require('node:module');
const path = require('node:path');
const vm = require('node:vm');
const {setTimeout: delay} = require('node:timers/promises');
const {app, Store, extract, session} = require('./harness.cjs');

const projectId = 'demo-daily-app';
const host = '127.0.0.1';
const port = 9019;
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== host + ':' + port) {
  throw Error('Start the local demo database with firebase.sync-emulator.json.');
}
const fromRemote = createRequire(path.join(__dirname, '../remote/package.json'));
const {initializeTestEnvironment} = fromRemote('@firebase/rules-unit-testing');
const readProject = name => readFileSync(path.join(__dirname, '..', name), 'utf8');
const rows = snap => JSON.parse(snap.val().v);

function loadReleaseSdk(directory) {
  const sandbox = vm.createContext({
    console, setTimeout, clearTimeout, setInterval, clearInterval, URL, WebSocket,
    TextEncoder, TextDecoder, fetch, atob, btoa
  });
  sandbox.self = sandbox.window = sandbox;
  for (const component of ['app', 'database']) {
    const filename = 'firebase-' + component + '-compat.js';
    vm.runInContext(readFileSync(path.join(directory, filename), 'utf8'), sandbox, {filename});
  }
  const version = /\/firebasejs\/([^/]+)\/firebase-database-compat\.js/.exec(readProject('index.html'))[1];
  assert.equal(sandbox.firebase.SDK_VERSION, version, 'cached browser SDK must match the release');
  return sandbox.firebase;
}
const releaseSdk = process.env.DAILY_BROWSER_FIREBASE_DIR && loadReleaseSdk(process.env.DAILY_BROWSER_FIREBASE_DIR);
const releaseApps = [];

function device(env, uid, seed = {}) {
  let db;
  if (releaseSdk) {
    const app = releaseSdk.initializeApp({projectId, databaseURL: 'http://' + host + ':' + port + '?ns=' + projectId},
      'daily-device-' + releaseApps.length);
    releaseApps.push(app);
    db = app.database();
    db.useEmulator(host, port, {mockUserToken: {sub: uid}});
  } else {
    db = env.authenticatedContext(uid).database();
  }
  const disk = new Store(seed);
  disk.keys = () => [...disk.data.keys()];
  const client = app(db, disk);
  Object.assign(client, {
    auth: {currentUser: {uid}}, _cloudWorkoutReady: true, dailyRestoreBusy: false,
    document: {getElementById: () => null}, window: {addEventListener() {}},
    confirm: () => true, location: {reload() {}}, navigator: {onLine: true},
    dbRef: db.ref('users/' + uid + '/sessions')
  });
  vm.runInContext(readProject('js/ai-remote.js'), client);
  vm.runInContext(['loadTxns', 'saveTxns', 'loadLedger', 'saveLedger'].map(extract).join('\n') +
    '\nasync ' + extract('restorePushToCloud'), client);
  client.txnData = client.dailyFinanceView('transactions', client.loadTxns());
  client.ledgerData = client.dailyFinanceView('ledger', client.loadLedger());
  assert.equal(client.dailyRemoteOrigin(), '');
  return client;
}

async function until(condition, message) {
  const end = Date.now() + 8000;
  while (!condition()) {
    if (Date.now() >= end) assert.fail(message);
    await delay(20);
  }
}

function attachFinance(client, path) {
  const transactions = path === 'transactions';
  let observed = false;
  client.syncBlobListen(client.auth.currentUser.uid, path, transactions ? 'daily_transactions' : 'daily_ledger', () => {
    if (transactions) client.txnData = client.loadTxns();
    else client.ledgerData = client.loadLedger();
    observed = true;
  });
  return until(() => observed, path + ' initial sync');
}

function restore(client, data) {
  return new Promise((resolve, reject) => {
    client.alert = resolve;
    client.restoreFromText(JSON.stringify({data}), message => reject(Error(message)));
  });
}

test('active Daily app with independent authenticated RTDB clients', {timeout: 50000}, async t => {
  const env = await initializeTestEnvironment({projectId, database: {
    host, port, rules: readProject('database.rules.json')
  }});
  t.after(() => env.cleanup());
  t.after(() => Promise.all(releaseApps.map(app => app.delete())));
  if (releaseSdk) t.diagnostic('Application clients use the release browser SDK ' + releaseSdk.SDK_VERSION + '.');

  for (const path of ['transactions', 'ledger']) {
    await t.test(path + ' retries a cold first write and merges two independently created records', async () => {
      const uid = 'sync-' + path;
      const observer = env.authenticatedContext(uid).database().ref('users/' + uid + '/' + path);
      const original = {id: 'existing', amount: 10};
      await observer.set({v: JSON.stringify([original]), t: 1});
      const clients = [device(env, uid), device(env, uid)];
      const field = path === 'transactions' ? 'txnData' : 'ledgerData';
      const save = path === 'transactions' ? 'saveTxns' : 'saveLedger';
      // No listener or read on these clients. Observe the real SDK invoking the app's
      // update on a cold null cache, then again with the current database value.
      const calls = clients.map(() => []);
      clients.forEach((client, i) => {
        const fbRef = client.fbRef;
        client.fbRef = requested => {
          assert.equal(requested, path);
          const ref = fbRef(requested);
          return {transaction(fn, complete, applyLocally) {
            assert.equal(applyLocally, false);
            return ref.transaction(raw => {
              calls[i].push(raw);
              return fn(raw);
            }, complete, applyLocally);
          }};
        };
        client[field].push({id: 'device-' + i, amount: i + 1});
        assert.equal(client[save](), true);
      });
      await Promise.all(clients.map(client => until(() => !client.dailyFinanceDirty(path), 'pending save acknowledgement')));
      for (const values of calls) {
        assert.equal(values[0], null);
        assert.ok(values.some(raw => raw && JSON.parse(raw.v).some(row => row.id === original.id)));
      }
      assert.deepEqual(rows(await observer.once('value')).sort((a,b) => a.id.localeCompare(b.id)),
        [{id: 'device-0', amount: 1}, {id: 'device-1', amount: 2}, original]);
      assert.equal((await observer.child('recordSync').once('value')).val(), 1);
      await assert.rejects(observer.set({v: JSON.stringify([original]), t: Date.now()}), /permission.denied/i);
      await Promise.all(clients.map(client => attachFinance(client, path)));
      for (const client of clients) assert.equal(client[field].length, 3);
    });
  }

  await t.test('a cold retry of a conflicting edit settles and keeps both versions available for review', async () => {
    const uid = 'conflicting-record';
    const cloud = env.authenticatedContext(uid).database().ref('users/' + uid + '/transactions');
    const original = {id: 'same', amount: 10};
    await cloud.set({v: JSON.stringify([original]), t: 10});
    const first = device(env, uid);
    const second = device(env, uid);
    await Promise.all([attachFinance(first, 'transactions'), attachFinance(second, 'transactions')]);
    const oldDisk = Object.fromEntries(second.localStorage.data);
    second.db.goOffline();
    first.txnData[0].amount = 20;
    assert.equal(first.saveTxns(), true);
    await until(() => !first.dailyFinanceDirty('transactions'), 'first device acknowledgement');

    // Reload the second device from its real saved baseline. The SDK has no transaction
    // cache, so the incompatible server value arrives on a later invocation of its updater.
    const reloaded = device(env, uid, oldDisk);
    reloaded.txnData[0].amount = 30;
    assert.equal(reloaded.saveTxns(), true);
    const job = vm.runInContext("dailyFinanceQueues.get('transactions')", reloaded);
    let failure;
    job.then(() => {failure = 'save succeeded';}, error => {failure = error.message;});
    await until(() => failure !== undefined, 'conflicting SDK retry must settle');
    assert.match(failure, /another device changed the same financial record/i);
    assert.equal(reloaded.dailyFinanceDirty('transactions'), true);
    assert.equal(reloaded.loadTxns()[0].amount, 30);
    assert.deepEqual(rows(await cloud.once('value')), [{id: 'same', amount: 20}]);
    assert.equal(vm.runInContext("dailyFinanceConflicts.has('transactions')", reloaded), true);
  });

  await t.test('connected restore replaces supplied collections and a reconnecting peer respects the replacement', async () => {
    const uid = 'restore';
    const root = env.authenticatedContext(uid).database().ref('users/' + uid);
    const original = {id: 'before', amount: 5};
    const profile = {name: 'keep'};
    await root.set({
      profile, sessions: {removed: session('removed', 15)}, habits: ['Run'],
      transactions: {v: JSON.stringify([original]), t: 10}
    });
    const editor = device(env, uid);
    const peer = device(env, uid);
    await Promise.all([attachFinance(editor, 'transactions'), attachFinance(peer, 'transactions')]);
    // This edit is recorded while away and before the explicit replacement.
    peer.db.goOffline();
    peer.txnData.push({id: 'offline', amount: 20});
    assert.equal(peer.saveTxns(), true);
    assert.equal(peer.dailyFinanceDirty('transactions'), true);
    await delay(10);
    const message = await restore(editor, {wt_sessions: '[]', daily_transactions: '[]', daily_habits: '[]'});
    assert.match(message, /restored and synced/);
    const saved = (await root.once('value')).val();
    assert.deepEqual(saved.profile, profile);
    assert.ok(saved.sessions.__dailyRestoredAt > 0);
    assert.deepEqual(Object.keys(saved.sessions), ['__dailyRestoredAt']);
    assert.deepEqual(JSON.parse(saved.transactions.v), []);
    assert.deepEqual(Array.from(editor.dailyRestoreUnwrap(saved.habits)), []);
    assert.deepEqual(JSON.parse(editor.localStorage.getItem('wt_sessions')), []);
    peer.localStorage.setItem('wt_sessions', JSON.stringify([session('removed', 15)]));
    peer.db.goOnline();
    let received = false;
    peer.wtAttachRecords(peer.dbRef, 'wt_sessions', 'id', values => {peer.S.sessions = values; received = true;});
    await until(() => received && !peer.dailyFinanceDirty('transactions') && peer.txnData.length === 0, 'stale peer converges');
    assert.deepEqual(Array.from(peer.S.sessions), []);
    const external = (await root.once('value')).val();
    assert.deepEqual(Object.keys(external.sessions), ['__dailyRestoredAt']);
    assert.deepEqual(JSON.parse(external.transactions.v), []);
  });

  await t.test('an actual change to a supplied store during restore preserves both cloud and local records', async () => {
    const uid = 'restore-race';
    const local = [session('local', 10)];
    const editor = device(env, uid, {wt_sessions: JSON.stringify(local)});
    const other = env.authenticatedContext(uid).database().ref('users/' + uid);
    await other.set({sessions: {original: session('original', 1)}, habits: ['Walk']});
    // Sign-in normally opens the data listeners before the restore control is available.
    await attachFinance(editor, 'transactions');
    const db = editor.db;
    const latest = session('during', 50);
    let raceTriggered = false;
    editor.db = {ref(key) {
      const ref = db.ref(key);
      if (key !== 'users/' + uid) return ref;
      const transaction = ref.transaction.bind(ref);
      ref.transaction = async (...args) => {
        await other.child('sessions/during').set(latest);
        raceTriggered = true;
        return transaction(...args);
      };
      return ref;
    }};
    await assert.rejects(restore(editor, {wt_sessions: '[]', daily_habits: '[]'}), /changed during restore/);
    assert.equal(raceTriggered, true);
    const cloud = (await other.once('value')).val();
    assert.deepEqual(cloud.sessions.during, latest);
    assert.deepEqual(cloud.habits, ['Walk']);
    assert.deepEqual(JSON.parse(editor.localStorage.getItem('wt_sessions')), local);
  });

  await t.test('the server rejects a pre-restore queued workout and accepts the next genuine edit', async () => {
    const uid = 'queued-workout';
    const cloud = env.authenticatedContext(uid).database().ref('users/' + uid);
    await cloud.set({sessions: {previous: session('previous', 1)}});
    const peer = device(env, uid);
    peer.wtAttachRecords(peer.dbRef, 'wt_sessions', 'id', values => {peer.S.sessions = values;});
    await until(() => peer.S.sessions.length === 1, 'workout baseline');
    peer.db.goOffline();
    const {upload} = peer.wtPersistRecords('wt_sessions', 'id', [session('queued', 1)], ['queued'], [], peer.dbRef);
    const local = JSON.parse(peer.localStorage.getItem('wt_sessions'));
    const stamp = local.find(row => row.id === 'queued').updatedAt;
    const plan = peer.dailyRestoreStage({wt_sessions: '[]'}, stamp + 1);
    // Isolate stale replay from restore submission by installing the exact confirmed
    // snapshot generated by the app, while the peer still has an outstanding SDK write.
    await cloud.update({...plan.updates});
    peer.db.goOnline();
    await assert.rejects(upload, /permission.denied/i);
    await until(() => peer.S.sessions.length === 0, 'reconnected list excludes pre-restore workouts');
    const stored = (await cloud.child('sessions').once('value')).val();
    assert.equal(stored.__dailyRestoredAt, stamp + 1);
    assert.equal(stored.queued, undefined);
    assert.deepEqual(JSON.parse(peer.localStorage.getItem('wt_sessions')), []);
    const next = peer.wtPersistRecords('wt_sessions', 'id', [session('later')], ['later'], [], peer.dbRef);
    await next.upload;
    const saved = (await cloud.child('sessions/later').once('value')).val();
    assert.equal(saved.id, 'later');
    assert.ok(saved.updatedAt >= stamp + 1);
  });

  for (const [path, key, field] of [['sessions','wt_sessions','id'], ['weights','wt_weight','date']]) {
    await t.test(path + ' protects a restore even when the disconnected device clock is a day ahead', async () => {
      const uid = 'skew-' + path;
      const parent = env.authenticatedContext(uid).database().ref('users/' + uid);
      const peer = device(env, uid);
      const ref = peer.db.ref('users/' + uid + '/' + path);
      const cutoff = Date.now(), oldGeneration = cutoff - 86400000;
      const record = date => field === 'date' ? {date, weight: 70} : session(date);
      const initial = {...record('2026-10-20'), updatedAt:oldGeneration, restoreGeneration:oldGeneration};
      await parent.child(path).set({__dailyRestoredAt:oldGeneration,
        [peer.wtRecordKey(initial, field)]:initial});
      let visible = [];
      peer.wtAttachRecords(ref, key, field, rows => {visible = rows;});
      await until(() => visible.length === 1, 'observe the initial generation');
      peer.db.goOffline();
      peer.Date = class extends Date { static now() {return cutoff + 86400000;} };
      const queued = record('2026-10-21');
      const {upload} = peer.wtPersistRecords(key, field, [queued], [queued[field]], [], ref);
      const pending = JSON.parse(peer.localStorage.getItem(key)).find(row => row[field] === queued[field]);
      assert.ok(pending.updatedAt > cutoff, 'a clock-only guard would accept this write');
      assert.equal(pending.restoreGeneration, oldGeneration);
      const plan = peer.dailyRestoreStage({[key]:'[]'}, cutoff);
      await parent.update({...plan.updates});
      peer.db.goOnline();
      await assert.rejects(upload, /permission.denied/i);
      await until(() => visible.length === 0 && Number(peer.localStorage.getItem(key + '_restore_ts')) === cutoff,
        'reconnect and observe the new generation');
      const before = (await parent.child(path).once('value')).val();
      assert.deepEqual(before, {__dailyRestoredAt:cutoff});
      peer.Date = class extends Date { static now() {return cutoff - 60000;} };
      const later = record('2026-10-22');
      await peer.wtPersistRecords(key, field, [later], [later[field]], [], ref).upload;
      const saved = (await parent.child(path + '/' + peer.wtRecordKey(later, field)).once('value')).val();
      assert.equal(saved.restoreGeneration, cutoff);
      assert.ok(saved.updatedAt >= cutoff, 'an intentional edit after observing the restore survives a slow clock');
    });
  }

  await t.test('each keyed collection retains its restore marker across older client saves', async () => {
    const uid = 'legacy-keyed';
    const cloud = env.authenticatedContext(uid).database().ref('users/' + uid);
    const cutoff = 1000;
    const stores = {sessions: 'updatedAt', weights: 'updatedAt', notes: 'updatedAt',
      weeklyReviews: 'updatedAt', budgetData: 'updatedAt', savingsLog: 't'};
    await cloud.set(Object.fromEntries(Object.keys(stores).map(key => [key, {__dailyRestoredAt: cutoff}])));
    for (const [key, time] of Object.entries(stores)) {
      const ref = cloud.child(key);
      await assert.rejects(ref.set({earlier: {[time]: cutoff - 1}}), /permission.denied/i, key);
      await assert.rejects(ref.remove(), /permission.denied/i, key);
      await assert.rejects(ref.child('earlier').set({[time]: cutoff - 1}), /permission.denied/i, key);
      const later = {[time]: cutoff + 1};
      if (key === 'sessions' || key === 'weights') later.restoreGeneration = cutoff;
      await ref.child('later').set(later);
      assert.deepEqual((await ref.once('value')).val(), {__dailyRestoredAt: cutoff, later});
    }
    const single = env.authenticatedContext('single-store').database().ref('users/single-store/sessions');
    await single.set({__dailyRestoredAt: cutoff});
    await assert.rejects(single.set({}), /permission.denied/i, 'an otherwise empty account keeps its restore cutoff');
    assert.equal((await single.child('__dailyRestoredAt').once('value')).val(), cutoff);
  });
});
