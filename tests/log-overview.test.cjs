// Regression cover for Log › Today — the training overview and the canonical state reader
// behind it.
//
// These run the REAL declarations out of js/app.js in a VM — no DOM, no network, no storage,
// no account. Every split, session and exercise below is invented for the test.
//
// They exist because the expensive failures here are silent contradictions rather than
// crashes: an overview that says "saved", prints the name of the NEXT rotation and opens a
// third thing; a draft quietly outranked by a session saved earlier the same day; a blank set
// row counted as a workout in progress; a target in kilograms on a timed hold; or Home and Log
// describing the same session differently.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { extract } = require('./harness.cjs');

const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../css/workout.css'), 'utf8');
// The Home session hero lives in the shared card vocabulary file.
const css2 = fs.readFileSync(path.join(__dirname, '../css/kitchen-extras.css'), 'utf8');
const body = (name) => extract(name);
function slice(from, to) {
  const a = source.indexOf(from);
  const b = source.indexOf(to, a + 1);
  assert.ok(a >= 0, 'anchor missing: ' + from);
  assert.ok(b > a, 'anchor missing or out of order: ' + to);
  return source.slice(a, b);
}

// ── The fixture ───────────────────────────────────────────────────
// Four rotation days. Push carries the interesting exercises: an externally loaded one with a
// rising-rep streak, a bodyweight one, a timed hold and an assisted (negative-load) one.
const SPLIT = {
  types: [
    { id: 'push', name: 'Push', exercises: [
      { name: 'Bench press', sets: 3 },
      { name: 'Pushups', sets: 2 },
      { name: 'Dead hangs', sets: 2, unit: 'secs' },
      { name: 'Pullups', sets: 3, allowNegative: true },
      { name: 'Overhead press', sets: 3 } ] },
    { id: 'pull', name: 'Pull', exercises: [{ name: 'Bent-over row', sets: 3 }] },
    { id: 'legs', name: 'Legs', exercises: [{ name: 'Squat', sets: 4 }] },
    { id: 'rest', name: 'Rest day', exercises: [] }
  ],
  schedule: [0, 1, 2, 3]
};
const wset = (w, r) => ({ weight: w, reps: r, type: 'working' });
const ex = (name, unit, sets) => ({ name, unit, sets });
const sess = (o) => Object.assign(
  { id: '1', date: '2026-09-01', dayNum: 1, sessionType: 'Push', duration: 50,
    exercises: [ex('Bench press', 'reps', [wset(60, 6)])], completed: true }, o);

const FNS = ['dateStr', 'localMidnight', 'getLocalDate',
  'splitTypes', 'splitSchedule', 'scheduleLen', 'typeIdxForDay', 'typeForDayIdx',
  'effectiveExercises', 'dayCustomFor', 'type', 'dn', 'suggestDay',
  'lastSessionOf', 'lastWorkingSetsFor', 'exerciseUnit', 'fmtSetAmount', 'fmtLoggedSet',
  'exerciseMetricInfo', 'setMetricValue',
  'poFirstWorkingSet', 'poHistoryFor', 'poShouldIncrease',
  'logDraftIsMeaningful', 'logSavedToday', 'logLastOfType', 'logSessionSetCount',
  'logTodayBrief', 'logRecentSessions', 'logPlanRowHtml', 'logDraftTouchedSinceSave'];

function ctx(state) {
  const context = vm.createContext({ console, Date, Math, JSON, Set, Map, Object, Array,
    String, Number, parseFloat, parseInt, isNaN });
  vm.runInContext(slice('const PO_STREAK_NEEDED=', 'function poFirstWorkingSet') +
    ';globalThis.PO_STEP_KG=PO_STEP_KG;', context);
  vm.runInContext('var dayCustom={}; var _secsNames=new Set(' +
    JSON.stringify(SPLIT.types.flatMap(t => t.exercises.filter(e => e.unit === 'secs').map(e => e.name))) + ');', context);
  vm.runInContext('var escText=s=>String(s==null?"":s); var escAttr=s=>String(s==null?"":s);', context);
  vm.runInContext(FNS.map(extract).join('\n'), context);
  context.splitCfg = () => SPLIT;
  // Swapped per case: logDraftTouchedSinceSave() reads wt_setdata to tell a draft that has
  // MOVED since the last save from the sets that produced it. Never written by these tests.
  context.localStorage = { getItem: () => null };
  context.S = Object.assign({
    dayIdx: 0, setData: {}, checked: new Set(), sessions: [], swaps: {},
    sessionNote: '', sessionStart: null, sessionAdds: []
  }, state || {});
  // getLocalDate() reads a real clock; pin it so "today" is a fixture value.
  vm.runInContext('var __today="2026-09-13"; getLocalDate=function(){return __today;};', context);
  context.brief = () => JSON.parse(JSON.stringify(context.logTodayBrief()));
  return context;
}
const blankRows = (names) => {
  const o = {}; names.forEach(n => { o[n] = [{ weight: '', reps: '', type: 'working', done: false }]; });
  return o;
};
const PUSH = ['Bench press', 'Pushups', 'Dead hangs', 'Pullups', 'Overhead press'];

// ── The canonical state ───────────────────────────────────────────

test('Ready uses suggestDay(), not whichever day the logger happens to hold', () => {
  // Last saved session was dayNum 1, so the next rotation is index 1 (Pull) — while the logger
  // is sitting on index 2 because the user browsed there. The overview must advertise Pull.
  const c = ctx({ dayIdx: 2, sessions: [sess({ date: '2026-09-11' })], setData: blankRows(['Squat']) });
  assert.equal(c.suggestDay(), 1);
  const b = c.brief();
  assert.equal(b.state, 'ready');
  assert.equal(b.dayIdx, 1, 'the advertised day is suggestDay()');
  assert.equal(b.dayName, 'Pull');
  assert.equal(b.exCount, 1);
  assert.equal(b.lastDate, '', 'no Pull session has ever been saved in this fixture');
});

test('In progress uses the draft’s actual S.dayIdx, never the next rotation', () => {
  const c = ctx({ dayIdx: 2, sessions: [sess({ date: '2026-09-11' })],
    setData: { Squat: [{ weight: '90', reps: '5', type: 'working', done: false }] } });
  const b = c.brief();
  assert.equal(b.state, 'inprogress');
  assert.equal(b.dayIdx, 2, 'the day the logger actually holds');
  assert.equal(b.dayName, 'Legs');
  assert.notEqual(b.dayIdx, c.suggestDay(), 'this is exactly the case the old overview got wrong');
});

test('a meaningful draft outranks a session already saved today', () => {
  const saved = sess({ id: 's1', date: '2026-09-13', dayNum: 1, sessionType: 'Push' });
  const c = ctx({ dayIdx: 2, sessions: [saved],
    setData: { Squat: [{ weight: '90', reps: '5', type: 'working', done: false }] } });
  // A draft that has been edited has a wt_setdata of its own — that is what makes it NEWER
  // than the record (see the tie-break test below).
  c.localStorage = { getItem: () => JSON.stringify({ date: '2026-09-13', dayIdx: 2 }) };
  const b = c.brief();
  assert.equal(b.state, 'inprogress');
  assert.equal(b.dayName, 'Legs');
  // …and with the draft cleared, the same fixture resolves to the saved session.
  const c2 = ctx({ dayIdx: 2, sessions: [saved], setData: blankRows(['Squat']) });
  assert.equal(c2.brief().state, 'saved');
});

test('blank initialised set rows are not a workout in progress', () => {
  const base = { dayIdx: 0, sessions: [sess({ date: '2026-09-11' })] };
  // Opening the logger creates one empty working row per exercise. That is not a workout.
  assert.equal(ctx(Object.assign({ setData: blankRows(PUSH) }, base)).logDraftIsMeaningful(), false);
  // Adding a second blank row is still not one.
  const twoBlank = blankRows(PUSH);
  twoBlank['Bench press'].push({ weight: '', reps: '', type: 'working', done: false });
  assert.equal(ctx(Object.assign({ setData: twoBlank }, base)).logDraftIsMeaningful(), false);
  // Each of these IS.
  const meaningful = [
    { setData: blankRows(PUSH), sessionStart: Date.now() },
    { setData: blankRows(PUSH), checked: new Set([0]) },
    { setData: blankRows(PUSH), sessionAdds: [{ name: 'Face pull' }] },
    { setData: blankRows(PUSH), sessionNote: 'felt good' },
    { setData: { 'Bench press': [{ weight: '60', reps: '', type: 'working', done: false }] } },
    { setData: { 'Bench press': [{ weight: '', reps: '8', type: 'working', done: false }] } },
    { setData: { 'Bench press': [{ weight: '', reps: '', type: 'working', done: true }] } }
  ];
  meaningful.forEach((s, i) =>
    assert.equal(ctx(Object.assign({}, base, s)).logDraftIsMeaningful(), true, 'case ' + i));
});

test('a saved session uses its own sessionType, and names the next rotation separately', () => {
  // Saved a Push session today; suggestDay() has already advanced to Pull. The hero describes
  // PUSH — the record — and Pull is a separate, labelled line.
  const c = ctx({ dayIdx: 0, sessions: [sess({ id: 's1', date: '2026-09-13', dayNum: 1,
    sessionType: 'Push', duration: 52, completed: true })], setData: blankRows(PUSH) });
  const b = c.brief();
  assert.equal(b.state, 'saved');
  assert.equal(b.dayName, 'Push', 'the record’s own sessionType');
  assert.equal(c.suggestDay(), 1);
  assert.equal(b.nextName, 'Pull', 'the next rotation, named separately');
  assert.notEqual(b.dayName, b.nextName);
  assert.equal(b.nextExCount, 1);
});

test('saved partial and completed are different claims', () => {
  const partial = ctx({ sessions: [sess({ date: '2026-09-13', completed: false })],
    setData: blankRows(PUSH) }).brief();
  const done = ctx({ sessions: [sess({ date: '2026-09-13', completed: true })],
    setData: blankRows(PUSH) }).brief();
  assert.equal(partial.completed, false, 'a partial save is Saved today, never Completed today');
  assert.equal(done.completed, true);
  // Only the record's own canonical flag may say completed — a missing flag is not a yes.
  const noFlag = ctx({ sessions: [sess({ date: '2026-09-13', completed: undefined })],
    setData: blankRows(PUSH) }).brief();
  assert.equal(noFlag.completed, false);
  // The hero renders the two differently.
  const hero = body('logHeroHtml');
  assert.match(hero, /'Completed today'/);
  assert.match(hero, /'Saved today'/);
  assert.match(hero, /b\.completed\?'Completed today':'Saved today'/);
});

// ── A saved session is described by the record, and only by the record ──────
// A session stores its performed exercises, its working sets, its duration, its effort and its
// `completed` flag. It does NOT store how many exercises were planned when it was saved, so
// nothing may reconstruct that number — deriving it from the current program at the record's
// dayNum made an old partial workout's displayed progress change when the program was edited.

test('the sets that produced today’s record stop counting as a newer draft', () => {
  // saveSession() clears wt_setdata but deliberately LEAVES the entered sets in S.setData so a
  // partial workout can be carried on. Without the second question those sets kept reading as
  // a meaningful draft, and the overview said "In progress" the instant you pressed Save —
  // caught by the end-to-end save run, not by the in-memory fixtures.
  const saved = sess({ id: 's1', date: '2026-09-13', dayNum: 1, sessionType: 'Push',
    completed: false, exercises: [ex('Bench press', 'reps', [wset(60, 8)])] });
  const live = { 'Bench press': [{ weight: '60', reps: '8', type: 'working', done: false }] };

  // Straight after the save: wt_setdata is gone, so the record wins.
  const afterSave = ctx({ dayIdx: 0, sessions: [saved], setData: live });
  afterSave.localStorage = { getItem: () => null };
  assert.equal(afterSave.logDraftIsMeaningful(), true, 'the sets are still loaded…');
  assert.equal(afterSave.brief().state, 'saved', '…but they are not a NEWER workout');

  // Touch a set again and wt_setdata comes back: the draft is genuinely newer.
  const touched = ctx({ dayIdx: 0, sessions: [saved], setData: live });
  touched.localStorage = { getItem: () => JSON.stringify({ date: '2026-09-13', dayIdx: 0 }) };
  assert.equal(touched.brief().state, 'inprogress');

  // A draft from ANOTHER day's leftover key does not resurrect.
  const stale = ctx({ dayIdx: 0, sessions: [saved], setData: live });
  stale.localStorage = { getItem: () => JSON.stringify({ date: '2026-09-01', dayIdx: 0 }) };
  assert.equal(stale.brief().state, 'saved');

  // With NOTHING saved today the key is irrelevant — a draft is a draft.
  const noSave = ctx({ dayIdx: 0, sessions: [], setData: live });
  noSave.localStorage = { getItem: () => null };
  assert.equal(noSave.brief().state, 'inprogress');

  // The tie-break READS localStorage and must never write to it.
  const fn = body('logDraftTouchedSinceSave');
  assert.match(fn, /localStorage\.getItem\('wt_setdata'\)/);
  assert.ok(!/setItem|removeItem/.test(fn));
  assert.match(body('logTodayBrief'), /!saved\.latest \|\| logDraftTouchedSinceSave\(\)/);
});

test('the saved state carries no reconstructed planned total', () => {
  const c = ctx({ sessions: [sess({ date: '2026-09-13', completed: false,
    exercises: [ex('Bench press', 'reps', [wset(60, 8)])] })], setData: blankRows(PUSH) });
  const b = c.brief();
  assert.equal(b.state, 'saved');
  assert.equal('plannedCount' in b, false, 'plannedCount must not exist on the brief');
  // …and no consumer may reintroduce it.
  assert.ok(!/plannedCount/.test(source.replace(/\/\/.*$/gm, '')),
    'no code may reference a reconstructed planned total');
  // The brief reads the record, not the program, for everything it reports about it.
  const fn = body('logTodayBrief');
  const savedBranch = fn.slice(fn.indexOf('if(saved.latest)'), fn.indexOf('// Ready:'));
  assert.ok(!/dayOf\(s\.dayNum/.test(savedBranch),
    'the saved branch must not look the record’s day up in the current program');
});

test('a saved partial claims no fraction, percentage or bar', () => {
  const c = ctx({ sessions: [sess({ date: '2026-09-13', completed: false, duration: 40,
    exercises: [ex('Bench press', 'reps', [wset(60, 8)])] })], setData: blankRows(PUSH) });
  const b = c.brief();
  assert.equal(b.completed, false);
  assert.equal(b.exCount, 1);
  assert.equal(b.setCount, 1);
  assert.equal(b.duration, 40);
  // Log's hero prints only record facts.
  const hero = body('logHeroHtml');
  assert.match(hero, /exercise'\+\(b\.exCount===1\?'':'s'\)\+' saved'/);
  // Scoped to the saved branch: the in-progress branch legitimately says "1 of 5 done".
  const savedBranch = hero.slice(hero.indexOf("} else if(b.state==='saved'){"),
                                 hero.indexOf('} else {')).replace(/^\s*\/\/.*$/gm, '');
  assert.ok(savedBranch.length > 40, 'the saved branch should still be there');
  assert.ok(!/ of /.test(savedBranch), 'no X of Y in the saved branch');
  assert.ok(!/%/.test(savedBranch), 'no percentage in the saved branch');
  assert.ok(!/doneCount|Math\.round/.test(savedBranch), 'and nothing computing one');
  // Home omits the progress row and the track entirely for a partial save.
  const home = body('renderHome');
  assert.match(home, /const mSavedDone=mBrief\.state==='saved'&&mBrief\.completed/);
  assert.match(home, /mShowProgress=mBrief\.state==='ready'\|\|mBrief\.state==='inprogress'\|\|mSavedDone/);
  assert.match(home, /const heroProgress=mShowProgress/);
  assert.match(home, /heroProgress\+/, 'the row and track are interpolated, not hard-coded');
  assert.match(home, /exercise'\+\(mExCount===1\?'':'s'\)\+' saved'/);
});

test('editing the current program cannot change a saved partial summary', () => {
  const saved = sess({ date: '2026-09-13', completed: false, duration: 40,
    exercises: [ex('Bench press', 'reps', [wset(60, 8)])] });
  const read = (types) => {
    const c = ctx({ sessions: [saved], setData: blankRows(PUSH) });
    if (types) c.splitCfg = () => ({ types, schedule: SPLIT.schedule });
    const b = c.brief();
    return { state: b.state, dayName: b.dayName, exCount: b.exCount,
             setCount: b.setCount, duration: b.duration, completed: b.completed };
  };
  const before = read(null);
  // The Push day loses three exercises and gains a different one; the saved record is untouched.
  const edited = JSON.parse(JSON.stringify(SPLIT.types));
  edited[0].exercises = [{ name: 'Bench press', sets: 3 }, { name: 'Dips', sets: 3 }];
  const after = read(edited);
  assert.deepEqual(after, before, 'the saved summary must be pure record');
  // And a program swapped out entirely still cannot move it.
  const replaced = JSON.parse(JSON.stringify(SPLIT.types));
  replaced[0].exercises = [];
  assert.deepEqual(read(replaced), before);
});

test('a completed saved session still presents as completed, from its own count', () => {
  const c = ctx({ sessions: [sess({ date: '2026-09-13', completed: true, duration: 55,
    exercises: [ex('Bench press', 'reps', [wset(60, 8)]), ex('Pushups', 'reps', [wset(0, 15)])] })],
    setData: blankRows(PUSH) });
  const b = c.brief();
  assert.equal(b.completed, true);
  assert.equal(b.exCount, 2);
  const home = body('renderHome');
  // Completed fills the bar, and the denominator is the record's OWN exercise count.
  assert.match(home, /const mExCount=mBrief\.exCount\|\|0/);
  assert.match(home, /const mDone=mBrief\.state==='inprogress'\?mBrief\.doneCount:\(mSavedDone\?mExCount:0\)/);
  assert.match(body('logHeroHtml'), /b\.completed\?'Completed today':'Saved today'/);
});

test('Home’s empty state agrees with Log and shows no progress at all', () => {
  const home = body('renderHome');
  assert.match(home, /mBrief\.state==='empty'\?'NO EXERCISES YET'/);
  assert.match(home, /mBrief\.state==='empty'\?'Set up program'/);
  assert.match(home, /mBrief\.state==='empty'\s*\r?\n?\s*\? 'No exercises configured'/);
  // 'empty' is not in the progress list, so the row, the percentage and the track are omitted.
  assert.ok(!/mShowProgress=.*'empty'/.test(home));
  assert.match(home, /hero-workout-card'\+\(mShowProgress\?'':' hero-flat'\)/);
  assert.match(css2, /\.hero-workout-card\.hero-flat \.hero-meta\{margin-bottom:0\}/,
    'the omitted rows must not leave .hero-meta’s bottom margin dangling');
  // Home still opens the OVERVIEW; the overview's own action opens Program.
  assert.match(home, /onclick="setView\(\\'log\\'\)"/);
  assert.ok(!/logGoto\('program'\)/.test(home), 'Home must not bypass the overview');
  assert.match(body('logHeroHtml'), /logGoto\('program'\)/);
});

test('Home and Log word all four canonical states the same way', () => {
  const home = body('renderHome'), log = body('logHeroHtml');
  [['saved', 'completed'], ['saved', 'partial'], ['inprogress'], ['ready'], ['empty']].forEach(() => {});
  // Eyebrows, pair for pair.
  [['COMPLETED TODAY', 'Completed today'], ['SAVED TODAY', 'Saved today'],
   ['IN PROGRESS', 'In progress'], ['UP NEXT', 'Up next'],
   ['NO EXERCISES YET', 'No exercises yet']].forEach(([h, l]) => {
    assert.ok(home.includes(h), 'Home is missing the ' + h + ' eyebrow');
    assert.ok(log.includes(l), 'Log is missing the ' + l + ' eyebrow');
  });
  // Both read the one reader, and neither derives state from anything else.
  // Comments stripped: the block explaining WHY the second calculation went still names it.
  const homeCode = home.replace(/^\s*\/\/.*$/gm, '');
  assert.match(homeCode, /logTodayBrief\(\)/);
  assert.ok(!/S\.checked\.size/.test(homeCode));
  assert.ok(!/type\(S\.dayIdx\)/.test(homeCode));
});

test('the correction touched no schema, store, migration, Firebase path or sync helper', () => {
  // The session object saveSession() writes is unchanged, field for field.
  const save = body('saveSession');
  ['id:', 'date:', 'dayNum:', 'sessionType:', 'duration:', 'exercises,', 'completed:']
    .forEach(f => assert.ok(save.includes(f), 'saveSession lost ' + f));
  assert.ok(!/plannedCount/.test(save), 'nothing was added to the record to support a denominator');
  assert.ok(!/exerciseCount|plannedExercises/.test(save));
  // No migration or backfill was introduced for old records. Comments stripped — the note
  // recording WHY the denominator is not reconstructed still names it.
  assert.ok(!/plannedCount/.test(source.replace(/\/\/.*$/gm, '')));
  const brief = body('logTodayBrief');
  [/localStorage/, /lsSave/, /persist\(/, /S\.sessions\[[^\]]*\]\s*=[^=]/, /\.completed\s*=[^=]/]
    .forEach(re => assert.ok(!re.test(brief), 'logTodayBrief must not contain ' + re));
  // And the sync contract is the same one.
  assert.match(source, /wtAttachRecords\(dbRef,'wt_sessions','id'/);
  assert.match(source, /db\.ref\('users\/'\+user\.uid\+'\/sessions'\)/);
});

test('multiple sessions today use the latest record, and never reorder S.sessions', () => {
  const a = sess({ id: 'a', date: '2026-09-13', dayNum: 1, sessionType: 'Push' });
  const b2 = sess({ id: 'b', date: '2026-09-13', dayNum: 2, sessionType: 'Pull' });
  const older = sess({ id: 'old', date: '2026-09-10' });
  const c = ctx({ sessions: [older, a, b2], setData: blankRows(PUSH) });
  const order = c.S.sessions.map(s => s.id).join(',');
  const b = c.brief();
  assert.equal(b.dayName, 'Pull', 'the latest record, not the first');
  assert.equal(b.savedCount, 2);
  assert.equal(c.S.sessions.map(s => s.id).join(','), order, 'the canonical array is untouched');
  // Reading it twice must be stable — the helper is pure.
  assert.deepEqual(c.brief(), b);
});

test('a training day with no exercises offers Program setup instead of an empty logger', () => {
  // Last session was dayNum 3, so the next rotation is index 3 — the empty Rest day.
  const c = ctx({ sessions: [sess({ date: '2026-09-11', dayNum: 3 })] });
  assert.equal(c.suggestDay(), 3);
  const b = c.brief();
  assert.equal(b.state, 'empty');
  assert.equal(b.dayName, 'Rest day');
  assert.equal(b.exCount, 0);
  const hero = body('logHeroHtml');
  assert.match(hero, /Set up program/);
  assert.match(hero, /logGoto\('program'\)/);
  assert.ok(!/saveSession|initDay/.test(hero), 'the empty state must not start or save anything');
});

test('the reader is pure: no writes, no seeding, no sort of S.sessions', () => {
  ['logTodayBrief', 'logDraftIsMeaningful', 'logSavedToday', 'logLastOfType',
   'logSessionSetCount', 'logRecentSessions'].forEach(n => {
    const fn = body(n);
    [/localStorage/, /lsSave/, /saveSetData/, /persist\(/, /Date\.now\(\)\s*;/, /S\.sessions\.sort/,
     /S\.sessions\.push/, /initDay/].forEach(re =>
      assert.ok(!re.test(fn), n + ' must not contain ' + re));
  });
  // logRecentSessions sorts a CLONE.
  assert.match(body('logRecentSessions'), /\.map\(\(s,i\)=>\(\{s,i\}\)\)/);
  assert.ok(!/^\s*\(?S\.sessions\)?\.sort/m.test(body('logRecentSessions')));
});

test('recent sessions come back newest first without touching the canonical array', () => {
  const c = ctx({ sessions: [
    sess({ id: '1', date: '2026-09-01' }), sess({ id: '2', date: '2026-09-11' }),
    sess({ id: '3', date: '2026-09-05' }), sess({ id: '4', date: '2026-09-11' })] });
  const order = c.S.sessions.map(s => s.id).join(',');
  assert.deepEqual(c.logRecentSessions(3).map(s => s.id), ['4', '2', '3'],
    'newest date first; a same-date tie keeps record order, latest first');
  assert.equal(c.S.sessions.map(s => s.id).join(','), order);
});

// ── The plan rows ─────────────────────────────────────────────────

test('a progression target appears only where poShouldIncrease() supports one', () => {
  // Bench press: three Push sessions at 60kg with rising reps → the rule fires.
  const rising = [
    sess({ id: '1', date: '2026-09-01', exercises: [ex('Bench press', 'reps', [wset(60, 6)])] }),
    sess({ id: '2', date: '2026-09-05', exercises: [ex('Bench press', 'reps', [wset(60, 7)])] }),
    sess({ id: '3', date: '2026-09-09', exercises: [ex('Bench press', 'reps', [wset(60, 9)])] })];
  const c = ctx({ sessions: rising });
  const t = c.type(0);
  const row = c.logPlanRowHtml(t.exercises[0], t);
  assert.match(row, /Last: 60kg × 9/);
  assert.match(row, /Try 62\.5 kg/, 'the existing +' + c.PO_STEP_KG + 'kg step, not a new formula');
  assert.match(row, /reps up 3 sessions running/, 'and it says why');

  // One session at that load is not a trend: last result, no target.
  const c2 = ctx({ sessions: [rising[2]] });
  const row2 = c2.logPlanRowHtml(c2.type(0).exercises[0], c2.type(0));
  assert.match(row2, /Last: 60kg × 9/);
  assert.ok(!/Try /.test(row2), 'no recommendation means no target');
  assert.ok(!/lg-focus-target/.test(row2));
});

test('unit-sensitive exercises are never labelled in kilograms they do not use', () => {
  const c = ctx({ sessions: [sess({ id: '1', date: '2026-09-09', exercises: [
    ex('Pushups', 'reps', [wset(0, 16)]),
    ex('Dead hangs', 'secs', [wset(0, 45)]),
    ex('Pullups', 'reps', [wset(-10, 8)])] })] });
  const t = c.type(0);
  const row = n => c.logPlanRowHtml(t.exercises.find(e => e.name === n), t);

  const push = row('Pushups');
  assert.match(push, /Last: 16 reps/, 'a bodyweight set is reps, not "0kg × 16"');
  assert.ok(!/kg/.test(push));

  const hang = row('Dead hangs');
  assert.match(hang, /Last: 45s/, 'a timed hold is seconds');
  assert.ok(!/kg/.test(hang));
  assert.ok(!/reps/.test(hang.split('planned ·')[1] || ''), 'and never described as reps');

  const pull = row('Pullups');
  assert.match(pull, /Last: -10kg × 8/, 'an assisted set keeps its negative load');

  // None of the three can carry a kg target: the overload rule only reaches loaded movements.
  [push, hang, pull].forEach(r => assert.ok(!/Try /.test(r)));
});

test('an exercise with no comparable history says so rather than inventing one', () => {
  const c = ctx({ sessions: [] });
  const t = c.type(0);
  assert.match(c.logPlanRowHtml(t.exercises[0], t), /No comparable history yet/);
  // A history whose saved unit changed is refused, not averaged.
  const c2 = ctx({ sessions: [
    sess({ id: '1', date: '2026-09-01', exercises: [ex('Bench press', 'reps', [wset(60, 6)])] }),
    sess({ id: '2', date: '2026-09-05', exercises: [ex('Bench press', 'secs', [wset(0, 40)])] })] });
  assert.match(c2.logPlanRowHtml(c2.type(0).exercises[0], c2.type(0)),
    /more than one unit/);
});

test('the plan row reads the unit resolver and the logger’s own last-session reader', () => {
  const fn = body('logPlanRowHtml');
  assert.match(fn, /exerciseUnit\(ex\)/);
  assert.match(fn, /lastWorkingSetsFor\(t, ex\.name\)/,
    'the same swap-aware reader the set-row hints use');
  assert.match(fn, /fmtLoggedSet\(lw, unit\)/);
  assert.match(fn, /poShouldIncrease\(hist\)/);
  assert.match(fn, /PO_STEP_KG/);
  assert.ok(!/\+\s*2\.5/.test(fn), 'the step is the shared constant, not a second literal');
  // One constant, two printers (the post-save modal and this row).
  assert.equal((source.match(/const PO_STEP_KG=/g) || []).length, 1);
  assert.match(body('showPOModal'), /PO_STEP_KG/);
});

// ── Composition, wording and what left ────────────────────────────

test('Last 7 days reports facts, with no target and no consistency judgement', () => {
  const fn = body('logWeekCardHtml');
  assert.match(fn, /'Last 7 days'/);
  assert.match(fn, /Sessions/);
  assert.match(fn, /Days trained/);
  assert.match(fn, /Logged time/);
  assert.ok(!/\/ 7/.test(fn), 'seven training days is not a goal anyone set');
  assert.ok(!/consistency/i.test(fn.replace(/lg-consistency[-a-z]*/g, '')),
    'no consistency score — only the strip keeps the legacy class name');
  [/readiness/i, /streak/i, /target/i, /missed/i, /recovery/i, /score/i].forEach(re =>
    assert.ok(!re.test(fn), 'must not invent ' + re));
  // Today plus the preceding six local calendar days, unchanged.
  assert.match(fn, /for\(let i=6;i>=0;i--\)/);
  assert.match(fn, /aria-label=/, 'each day names its date and saved session count');
  assert.ok(!/lg-consistency-score/.test(source), 'the "3 / 7 days" figure is gone');
  assert.ok(!/lg-consistency-score/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')),
    'only the comment explaining its removal may still name it');
});

test('weight left Log › Today, and every canonical weight path stayed', () => {
  ['renderLogWeightCard', 'logTodayWeight'].forEach(n =>
    assert.ok(!source.includes('function ' + n + '('), n + ' should be gone'));
  assert.ok(!/log-weight-input/.test(source) && !/log-weight-input/.test(html));
  assert.ok(!/lg-weight-/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'its CSS left with it');
  const ov = slice('function renderLogOverview(){', '\n}');
  assert.ok(!/weight/i.test(ov));
  // …while the canonical weight functionality is untouched.
  ['addWeightEntry', 'loadWeights', 'showPostSaveWeightPrompt', 'renderWeightChart']
    .filter(n => source.includes('function ' + n + '('))
    .forEach(n => assert.ok(body(n).length > 0, n + ' must remain'));
  assert.match(source, /function addWeightEntry\(/);
  assert.match(source, /showPostSaveWeightPrompt\(\)/, 'the post-save prompt still fires');
  assert.match(source, /setStatsTab\('body'/, 'Stats › Body is still reachable');
});

test('the improvement card retired into the plan rows, with no caller left behind', () => {
  ['renderLogImprovementCard', 'logImprovementSuggestions'].forEach(n => {
    assert.ok(!source.includes('function ' + n + '('), n + ' should be gone');
    assert.ok(!source.includes(n + '('), n + ' still has a caller');
  });
  assert.ok(!/What should I improve\?/.test(source));
  // Its job is done by the rows beside the exercises they apply to.
  assert.match(body('logPlanCardHtml'), /logPlanRowHtml/);
});

test('Home and Log read one canonical state, and Home does not start a workout', () => {
  const home = body('renderHome');
  assert.match(home, /const mBrief=logTodayBrief\(\)/);
  assert.ok(!/const mCurType=type\(S\.dayIdx\)/.test(home),
    'the second state calculation is what let the two surfaces disagree');
  assert.match(home, /mBrief\.dayName/, 'the same session name');
  assert.match(home, /mBrief\.state==='saved'/, 'the same saved/active distinction');
  assert.match(home, /onclick="setView\(\\'log\\'\)"/,
    'Home opens Log › Today’s overview and stops there');
  assert.ok(!/logOpenSession|logOpenPlannedDay|saveSession/.test(home),
    'Home must not bypass the overview or begin a workout');
});

test('the overview is one stack on a phone and two independent columns on desktop', () => {
  const fn = body('renderLogOverview');
  // DOM order IS the mobile reading order: hero → plan → last 7 days → recent.
  assert.match(fn, /lg-col-main">'\+logHeroHtml\(b\)\+logPlanCardHtml\(b\)/);
  assert.match(fn, /lg-col-side">'\+logWeekCardHtml\(\)\+logRecentCardHtml\(\)/);
  assert.ok(!/order:/.test(fn), 'no CSS order — the DOM is the order');
  // Two flex stacks, becoming a grid of two independent columns at the desktop boundary.
  assert.match(css, /\.lg-cols\{display:flex;flex-direction:column\}/);
  assert.match(css, /\.lg-cols\{display:grid;grid-template-columns:minmax\(0,1\.05fr\) minmax\(0,1fr\);\s*\r?\n?\s*gap:0 18px;align-items:start\}/);
  assert.ok(!/\.lg-col\{[^}]*flex:1[^}]*\}/.test(css), 'a column must not stretch to its neighbour');
});

// ── The logger and its invariants ─────────────────────────────────

test('opening the advertised day prepares it without discarding a draft', () => {
  const fn = body('logOpenPlannedDay');
  assert.match(fn, /!logDraftIsMeaningful\(\)/, 'a meaningful draft is never initialised over');
  assert.match(fn, /S\.dayIdx!==idx/, 'and an already-correct day is left completely alone');
  assert.match(fn, /initDay\(idx\)/);
  assert.match(fn, /logOpenSession\(\)/);
  // NOT selectDay(): its reset side effects are "discard this workout", the wrong verb here.
  assert.ok(!/selectDay\(/.test(fn));
  assert.ok(!/rtResetAll|dismissPostSaveWeight/.test(fn));
  // The Ready hero dispatches to it with the exact advertised index.
  assert.match(body('logHeroHtml'), /logOpenPlannedDay\('\+b\.dayIdx\+'\)/);
  // Continue does NOT re-initialise anything — it just shows the logger.
  assert.match(body('logHeroHtml'), /act='Continue workout'; run='logOpenSession\(\)'/);
});

test('the set logger and its state are untouched', () => {
  // The overview swaps in and out of the same container it always did.
  assert.match(body('renderLogToday'), /logTodayView==='session'/);
  assert.match(body('logBackToOverview'), /logTodayView='overview'/);
  assert.match(body('logOpenSession'), /logTodayView='session'/);
  // Re-tapping Today returns to the overview.
  assert.match(body('setLogTab'), /logTodayView='overview'/);
  // #view-log is a .swipe-panel inside the transformed deck.
  assert.ok(!/scrollIntoView/.test(body('setLogTab')));
  assert.match(body('setLogTab'), /segScrollToTab/);
  // Save, restore and sync are byte-for-byte the app's own.
  ['saveSession', 'saveSetData', 'restoreSetData', 'clearSetData', 'persist', 'checkPO',
   'showPostSaveWeightPrompt', 'showPostSaveEffortPrompt', 'selectDay', 'initDay',
   'recomputeChecked'].forEach(n =>
    assert.ok(source.includes('function ' + n + '(') || source.includes(n + '='), n + ' missing'));
  assert.match(body('saveSession'), /clearSetData\(\)/);
  assert.match(body('saveSession'), /showPostSaveWeightPrompt\(\)/);
  assert.match(body('saveSession'), /showPOModal\(poSuggestions\)/);
  assert.match(body('restoreSetData'), /o\.date!==getLocalDate\(\)/, 'same-day drafts only');
});

test('Log hub state is still declared above the boot block, where let cannot trip it', () => {
  // Boot is the bare try{} at the bottom of js/app.js (the docs call it init()). It restores a
  // #hash through setView(), setView() reads logTodayView, and `let`/`const` do not hoist — a
  // late declaration aborts boot with a TDZ error, silently, because the restore only fires
  // when the URL actually carries a hash.
  const boot = source.indexOf('// ── Boot ─');
  assert.ok(boot > 0, 'the boot block marker should still be there');
  ['logTodayView', 'logSubTab', 'LOG_TABS', 'LOG_TAB_BTNS', 'logProgSel', 'plansDocSel',
   'NAV_ORDER', 'BUD_VIEWS'].forEach(n => {
    const at = source.search(new RegExp('(const|let) ' + n + '\\b'));
    assert.ok(at > 0 && at < boot, n + ' must be declared above the boot block');
  });
  // The canonical reader is a function declaration, so it hoists — but renderHome() calls it
  // and boot runs renderHome(), so it has to live in the same script.
  assert.ok(source.includes('function logTodayBrief('));
});

test('a synced session snapshot refreshes the overview without changing the listener contract', () => {
  const attach = slice("wtAttachRecords(dbRef,'wt_sessions','id'", 'weightDbRef =');
  assert.match(attach, /logSubTab==='today'&&logTodayView==='overview'.*renderLogOverview\(\)/);
  assert.match(attach, /S\.sessions=records/, 'the records themselves are applied as before');
  [/lsSave/, /persist\(/, /\.set\(/, /updatedAt=/].forEach(re =>
    assert.ok(!re.test(attach), 'the refresh must not write: ' + re));
});
