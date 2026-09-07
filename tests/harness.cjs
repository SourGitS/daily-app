// Shared fixture for the sync tests: extracts the real helpers out of js/app.js and runs
// them against in-memory stores. Nothing here touches a real account, network or DOM.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/app.js'), 'utf8');
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

// Execute the real application helpers without a DOM, credentials, or network connection.
function extract(name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name);
  let depth = 0, state = '', quote = '';
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (state === 'line') { if (c === '\n') state = ''; continue; }
    if (state === 'comment') { if (c === '*' && next === '/') { state = ''; i++; } continue; }
    if (state === 'string') { if (c === '\\') i++; else if (c === quote) state = ''; continue; }
    if (c === '/' && next === '/') { state = 'line'; i++; continue; }
    if (c === '/' && next === '*') { state = 'comment'; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { state = 'string'; quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('Unclosed function ' + name);
}
class Store {
  constructor(seed = {}) { this.data = new Map(Object.entries(seed)); this.fail = false; }
  getItem(k) { return this.data.has(k) ? this.data.get(k) : null; }
  setItem(k, v) { if (this.fail) throw new Error('quota'); this.data.set(k, String(v)); }
  removeItem(k) { this.data.delete(k); }
}
class Cloud {
  constructor(seed = {}) { this.data = copy(seed); this.listeners = new Map(); this.writes = []; this.jobs = []; }
  get(path) { return copy(path.split('/').reduce((v, k) => v && v[k], this.data) ?? null); }
  put(path, value) {
    const keys = path.split('/'); let node = this.data;
    for (const key of keys.slice(0, -1)) node = node[key] ||= {};
    node[keys.at(-1)] = copy(value);
  }
  snap(path) { const value = this.get(path); return { val: () => copy(value), exists: () => value !== null }; }
  ref(path) {
    const db = this;
    return {
      child: key => db.ref(path + '/' + key),
      once: () => Promise.resolve(db.snap(path)),
      on: (_, fn) => { db.listeners.set(path, fn); },
      transaction: (fn, complete, applyLocally) => {
        assert.equal(applyLocally, false, 'do not publish speculative empty-cache writes');
        fn(null); // Firebase may first invoke with an empty client cache.
        const job = Promise.resolve().then(() => {
          const value = fn(db.get(path));
          if (value !== undefined) { db.put(path, value); db.writes.push({ path, value: copy(value) }); }
          return { committed: value !== undefined, snapshot: db.snap(path) };
        });
        db.jobs.push(job); return job;
      },
      set: () => { throw new Error('Unconditional cloud overwrite: ' + path); }
    };
  }
  emit(path) { this.listeners.get(path)(this.snap(path)); }
  async settle() { for (let n = 0; n < 5; n++) await Promise.all(this.jobs); }
}
function app(cloud = new Cloud(), storage = new Store()) {
  const ctx = vm.createContext({
    console, Promise, Map, Set, Date, localStorage: storage, db: cloud,
    firebaseReady: true, auth: { currentUser: { uid: 'u' } },
    _bootPhase: false, _syncApplying: 0, _cloudWorkoutReady: false,
    _cloudReadFailed: false, _cloudApplied: {}, _syncRefs: [],
    SYNC_BLOB_REG: [], S: { sessions: [], weights: [] },
    budgetData: {}, budgetConfig: {}, incomeStreams: [], savingsLog: [],
    setSyncStatus: () => {}, showToast: () => {}, confirm: () => false,
    dbRef: cloud.ref('users/u/sessions'), weightDbRef: cloud.ref('users/u/weights')
  });
  const names = ['lsLoad','stampFor','lsSave','lsSaveTS','fbRef','syncBlobCommit','syncBlobPush',
    'syncBlobListenTS','syncBlobListen','wtReadRecords','wtRecordTime','wtRecordKey','wtMergeRecords',
    'wtPushRecords','wtAttachRecords','wtPersistRecords','persist','persistWeights','load','loadWeights',
    'finishOnboarding','restoreFromText','fbSeedIfEmpty','syncApply','syncTrack','syncDetachAll',
    'mergeBudgetWeeks','budPushWeeks','budPushConfig','syncBudgetDataToFirebase',
    'savingsTime','pushSavings','mergeSavings','saveBudgetConfig'];
  vm.runInContext(names.map(extract).join('\n'), ctx);
  return ctx;
}
const session = (id, updatedAt = 0, extra = {}) => ({ id, date: '2026-09-07', exercises: [{ name: 'Squat', sets: [{ weight: 100, reps: 5 }] }], updatedAt, ...extra });

module.exports = { extract, Store, Cloud, app, session, copy };
