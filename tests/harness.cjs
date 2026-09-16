// Shared fixture for the sync tests: extracts the real helpers out of js/app.js and runs
// them against in-memory stores. Nothing here touches a real account, network or DOM.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/app.js'), 'utf8');
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

// A regex LITERAL, not a division: `/` is only a regex when what precedes it cannot end an
// expression. Without this the scanner reads the `"` inside kitEsc's `.replace(/"/g, ...)` as
// the start of a string and runs on past the end of the function — which it silently did
// until a top-level `const` landed in the text it was swallowing.
function regexStartsAt(src, i) {
  for (let k = i - 1; k >= 0; k--) {
    const p = src[k];
    if (p === ' ' || p === '\t' || p === '\n' || p === '\r') continue;
    return '(,=:[!&|?{};+-*%<>~^'.indexOf(p) >= 0;
  }
  return true;
}
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
    if (state === 'regex') { if (c === '\\') i++; else if (c === '[') state = 'class'; else if (c === '/') state = ''; continue; }
    if (state === 'class') { if (c === '\\') i++; else if (c === ']') state = 'regex'; continue; }
    if (c === '/' && next === '/') { state = 'line'; i++; continue; }
    if (c === '/' && next === '*') { state = 'comment'; i++; continue; }
    if (c === '/' && regexStartsAt(source, i)) { state = 'regex'; continue; }
    if (c === '"' || c === "'" || c === '`') { state = 'string'; quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('Unclosed function ' + name);
}
// The real `const NAME = ...;` declaration, brackets balanced, so a fixture uses the app's own
// table rather than a copy of it that can drift (KIT_VULGAR_FRACTIONS, KIT_QTY_GLYPHS, ...).
function extractConst(name) {
  const start = source.search(new RegExp('^const ' + name + '\\s*=', 'm'));
  assert.ok(start >= 0, name + ' must be a real top-level const');
  let depth = 0, state = '', quote = '';
  for (let i = start; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (state === 'line') { if (c === '\n') state = ''; continue; }
    if (state === 'comment') { if (c === '*' && next === '/') { state = ''; i++; } continue; }
    if (state === 'string') { if (c === '\\') i++; else if (c === quote) state = ''; continue; }
    if (state === 'regex') { if (c === '\\') i++; else if (c === '[') state = 'class'; else if (c === '/') state = ''; continue; }
    if (state === 'class') { if (c === '\\') i++; else if (c === ']') state = 'regex'; continue; }
    if (c === '/' && next === '/') { state = 'line'; i++; continue; }
    if (c === '/' && next === '*') { state = 'comment'; i++; continue; }
    if (c === '/' && regexStartsAt(source, i)) { state = 'regex'; continue; }
    if (c === '"' || c === "'" || c === '`') { state = 'string'; quote = c; continue; }
    if (c === '{' || c === '[' || c === '(') depth++;
    if (c === '}' || c === ']' || c === ')') depth--;
    if (c === ';' && depth === 0) return source.slice(start, i + 1);
    if (c === '\n' && depth === 0 && /=\s*[^\s]/.test(source.slice(start, i))) return source.slice(start, i) + ';';
  }
  throw new Error('Unclosed const ' + name);
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

module.exports = { extract, extractConst, Store, Cloud, app, session, copy };
