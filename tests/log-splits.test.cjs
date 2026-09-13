// The Splits picker runs existing configuration comparisons and save paths. These invented
// fixtures exercise the real declarations without touching an account, network or disk store.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { extract } = require('./harness.cjs');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const split = (extra = {}) => ({ types: [
  { id: 'push', name: 'Push', barColor: '#aabbcc', exercises: [
    { name: 'Bench press', sets: 3, reps: '6–8', notes: 'Controlled', detail: { tempo: ['3', '1', '1'] } }] },
  { id: 'pull', name: 'Pull', exercises: [{ name: 'Row', sets: 3 }] },
  { id: 'legs', name: 'Legs', exercises: [{ name: 'Squat', sets: 4 }] }
], schedule: [0, 1, 0, 2], ...extra });
const saved = (id, cfg = split(), extra = {}) => ({ id, name: 'Split ' + id,
  kind: 'split', description: 'Saved fixture', cfg: copy(cfg), createdAt: 100, ...extra });
const legacy = { id: 'old', name: 'Old routine', exercises: [{ name: 'Walk', sets: 1 }],
  history: [{ date: '2025-01-01', complete: true }] };
const documentPlan = { id: 'document', name: 'Training notes', type: 'html', content: '<h1>Keep me</h1>' };

function fixture(plans = [saved('a')], live = split()) {
  const writes = [], calls = [], alerts = [], prompts = [], savedValues = [], nodes = new Map();
  let exerciseLibrary = [{ id: 'bench', name: 'Bench press', muscle: 'chest' }];
  const data = new Map([['wt_plans', JSON.stringify({ plans: copy(plans), activePlanId: plans[0]?.id || null,
    streak: { lastDate: '2026-08-01', count: 4 } })], ['wt_split', JSON.stringify(live)]]);
  const get = id => {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, { id, innerHTML: '', textContent: '', value: '', style: { display: 'none', left: '0' },
        scrollTop: 0, dataset: {}, attributes: {}, classList: {
          add: (...items) => items.forEach(x => classes.add(x)),
          remove: (...items) => items.forEach(x => classes.delete(x)),
          contains: x => classes.has(x),
          toggle(x, on) { if (on === undefined) on = !classes.has(x); if (on) classes.add(x); else classes.delete(x); }
        }, setAttribute(name, value) { this.attributes[name] = value; },
        querySelectorAll: () => [], querySelector: () => null, focus() { calls.push(['focus', id]); },
        getBoundingClientRect: () => ({ top: 0, left: 0, right: 100, width: 100, height: 40 }) });
    }
    return nodes.get(id);
  };
  const c = vm.createContext({ console, Date, Math, JSON, Set, Map, Object, Array, String, Number,
    parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
    S: { view: 'log', dayIdx: 0, setData: {}, checked: new Set(), sessions: [],
      swaps: {}, sessionNote: '', sessionStart: null, sessionAdds: [] },
    splitConfig: copy(live), _splitPersisted: true, dayCustom: {},
    logSubTab: 'program', logTodayView: 'overview', logProgSel: null, plansDocSel: null,
    SE: { days: [], target: -1, pickerQuery: '', container: 'se-wrap', mode: 'live', name: '' },
    SPLIT_PALETTE: ['#111111', '#222222', '#333333'],
    localStorage: { getItem: key => data.get(key) ?? null,
      setItem(key, value) { writes.push(['setItem', key]); data.set(key, String(value)); },
      removeItem(key) { writes.push(['removeItem', key]); data.delete(key); } },
    lsSaveTS(key, value, timestampKey, cloudPath) {
      writes.push(['lsSaveTS', key, timestampKey, cloudPath]); savedValues.push([key, value]); data.set(key, JSON.stringify(value));
    },
    lsSave(key, value, cloudPath) { writes.push(['lsSave', key, cloudPath]); data.set(key, JSON.stringify(value)); },
    document: { getElementById: get, querySelector: () => null, querySelectorAll: () => [] },
    requestAnimationFrame: fn => fn(), setTimeout: fn => fn(),
    cardHeader: (icon, title, action = '') => '<header>' + title + action + '</header>',
    escText: value => String(value ?? ''), escAttr: value => String(value ?? ''),
    alert: message => alerts.push(message), confirm: message => { calls.push(['confirm', message]); return true; },
    prompt: (message, value) => { prompts.push([message, value]); return 'Chosen name'; },
    layoutIsDesktop: () => false, isLandscapePhone: () => false,
    aiHidePeerOverlays: () => {},
    setNavActive() {}, closeMenu() {}, renderLog: () => calls.push(['renderLog']),
    renderHome: () => calls.push(['renderHome']), renderLogOverview: () => calls.push(['renderLogOverview']),
    renderPlans: () => calls.push(['renderPlans']), renderTraining: () => calls.push(['renderTraining']),
    renderSplitEditor: () => calls.push(['renderSplitEditor']),
    loadExerciseLib: () => copy(exerciseLibrary),
    saveExerciseLib: value => { writes.push(['saveExerciseLib']); exerciseLibrary = copy(value); },
    libGuessMuscle: () => 'other',
    applyDayColour: () => calls.push(['applyDayColour']),
    showToast: message => calls.push(['toast', message]),
    rtResetAll: () => calls.push(['rtResetAll']), rtUpdateSessionLabels() {},
    dismissPostSaveWeight: () => calls.push(['dismissPostSaveWeight']),
    getLocalDate: () => '2026-09-14', _bootPhase: false,
    exCollapsed: new Set(), logEditMode: false, activeExIdx: -1
  });
  const names = ['sanitizeSplit', 'splitCfg', 'saveSplit', 'splitTypes', 'splitSchedule', 'scheduleLen',
    'typeIdxForDay', 'typeForDayIdx', 'dayCustomFor', 'effectiveExercises', 'type', 'dn',
    'loadPlans', 'savePlans', 'planSnapshotSplit', 'planCfgFingerprint', 'planIsProgram',
    'planIsWorkoutSaved', 'planAppliedState', 'logActiveProgram', 'logProgramList', 'logProgramSelected',
    'plansSaveCurrentAsProgram', 'plansUpdateFromCurrent', 'plansApply', 'plansRename', 'plansDelete',
    'plansRefreshViews', 'logDraftIsMeaningful', 'logDraftTouchedSinceSave', 'logSavedToday',
    'logCanContinueSaved', 'initDay', 'saveSetData', 'splitToDays', 'daysToSplit',
    'openSplitEditor', 'closeSplitEditor', 'saveSplitEditor'];
  const extraNames = [...source.matchAll(/^function (logSplit\w*|logProgSelect|logCloseSplitPreview|logConfirmSplitChange|logCancelSplitSwitch|logDiscardAndSwitch|logResetWorkoutForSplit|renderLogSplitPreview|plansNewId|plansDuplicate|plansSaveNewSplit|plansConfirmDelete|plansImportText|openNewSplitEditor|seEditorChrome|seOpenEditor|seSaveNewExercises|sePickCustom|sePick|seRerender|clearSetData)\(/gm)].map(match => match[1]);
  vm.runInContext([...new Set(names.concat(extraNames))].map(extract).join('\n'), c);
  [...source.matchAll(/^(?:let|const) logSplit\w+[^;]*;/gm)].forEach(match =>
    vm.runInContext(match[0].replace(/^(?:let|const) /, 'var '), c));
  c.renderLogProgram = () => calls.push(['renderLogProgram']);
  return { c, writes, calls, alerts, prompts, data, get, nodes, savedValues };
}
function draftSnapshot(c) {
  return copy({ ...c.S, checked: Array.from(c.S.checked), dayCustom: c.dayCustom });
}

test('active split is matched against live configuration, never the selected or stored active ID', () => {
  const other = split({ schedule: [2, 1, 0] });
  const { c, data, writes } = fixture([saved('matches'), saved('selected', other)]);
  c.logProgSel = 'selected';
  const stored = JSON.parse(data.get('wt_plans')); stored.activePlanId = 'selected';
  data.set('wt_plans', JSON.stringify(stored));
  assert.equal(c.logActiveProgram().id, 'matches');
  assert.equal(c.planAppliedState(c.loadPlans().plans[1]), 'inactive');
  c.splitConfig.schedule = [2, 0, 1];
  assert.equal(c.logActiveProgram(), null, 'an edited live configuration does not claim an old copy is active');
  assert.deepEqual(writes, []);
});

test('workout collection preserves legacy records and keeps imported HTML in Plans', () => {
  const { c, data, writes } = fixture([saved('a'), legacy, documentPlan]);
  const before = data.get('wt_plans');
  assert.deepEqual(copy(c.logProgramList()).map(p => p.id), ['a', 'old']);
  assert.equal(c.planAppliedState(legacy), 'n/a');
  assert.equal(data.get('wt_plans'), before);
  assert.deepEqual(writes, []);
});

test('the existing split and plan save helpers retain their synced store contracts', () => {
  const { c, writes } = fixture();
  c.saveSplit(); c.savePlans(c.loadPlans());
  assert.deepEqual(writes, [
    ['lsSaveTS', 'wt_split', 'wt_split_ts', 'trainingSplit'],
    ['lsSaveTS', 'wt_plans', 'wt_plans_ts', 'plans']
  ]);
});

test('split summaries preserve the actual repeated rotation rather than listing each type once', () => {
  const { c, writes } = fixture();
  assert.deepEqual(copy(c.logSplitRotation(split())), ['Push', 'Pull', 'Push', 'Legs']);
  assert.deepEqual(copy(c.logSplitRotation(split({ schedule: [] }))), ['Push', 'Pull', 'Legs']);
  assert.deepEqual(writes, []);
});

test('identical saved copies choose one actual active match without trusting a mismatched active ID', () => {
  const a = saved('a', split(), { lastAppliedAt: 100 });
  const b = saved('b', split(), { lastAppliedAt: 200 });
  const mismatch = saved('other', split({ schedule: [2, 1, 0] }), { lastAppliedAt: 999 });
  const { c, data, writes } = fixture([a, b, mismatch]);
  const stored = JSON.parse(data.get('wt_plans')); stored.activePlanId = 'other';
  data.set('wt_plans', JSON.stringify(stored));
  assert.equal(c.logActiveProgram().id, 'b');
  assert.equal(c.logActiveProgram().id, 'b', 'active choice remains stable across browsing');
  assert.deepEqual(writes, []);
});

test('preview opening and closing preserve all stores, logger fields and collection scroll', () => {
  const { c, data, writes, get } = fixture([saved('a'), saved('b', split({ schedule: [2, 1, 0] }))]);
  c.S.setData = { 'Bench press': [{ weight: '60', reps: '8', done: true, type: 'working' }] };
  c.S.checked = new Set([0]); c.S.sessionNote = 'Unsaved note';
  const before = draftSnapshot(c), stores = Array.from(data.entries()), live = copy(c.splitConfig);
  get('view-log').scrollTop = 410; get('app-main').scrollTop = 320;
  c.logProgSelect('b');
  assert.equal(c.logProgSel, 'b');
  assert.equal(c.logSplitPreviewId, 'b');
  c.logCloseSplitPreview();
  assert.equal(c.logProgSel, 'b', 'closing retains the selected stable ID');
  assert.equal(get('view-log').scrollTop, 410);
  assert.equal(get('app-main').scrollTop, 320);
  assert.deepEqual(draftSnapshot(c), before);
  assert.deepEqual(copy(c.splitConfig), live);
  assert.deepEqual(Array.from(data.entries()), stores);
  assert.deepEqual(writes, []);
});

test('cancelling a switch preserves every unsaved workout field and does not persist', () => {
  const { c, data, writes, calls } = fixture([saved('a'), saved('b', split({ schedule: [2, 1, 0] }))]);
  c.S.setData = { 'Bench press': [{ weight: '60', reps: '8', done: true, type: 'warmup' }] };
  c.S.checked = new Set([0]); c.S.sessionNote = 'Keep my session'; c.S.sessionStart = 12345;
  c.S.sessionAdds = [{ name: 'Face pull', muscle: 'shoulders' }];
  c.S.swaps = { 'Bench press': 'Dumbbell press' };
  c.dayCustom = { push: { added: [{ name: 'Pushup', sets: 3 }], hidden: ['Bench press'] } };
  c.saveSetData(); writes.length = 0;
  const before = draftSnapshot(c), live = copy(c.splitConfig), stores = Array.from(data.entries());
  c.plansApply('b');
  assert.equal(typeof c.logSplitPendingSwitch, 'function', 'the switch must wait for a decision');
  c.logCancelSplitSwitch();
  assert.deepEqual(draftSnapshot(c), before);
  assert.deepEqual(copy(c.splitConfig), live);
  assert.deepEqual(Array.from(data.entries()), stores);
  assert.deepEqual(writes, []);
  assert.ok(!calls.some(call => call[0] === 'rtResetAll'));
});

test('just-saved retained sets do not block a switch, while a note-only edit after saving does', () => {
  [false, true].forEach(edited => {
    const { c, writes } = fixture([saved('a'), saved('b', split({ schedule: [2, 1, 0] }))]);
    c.S.sessions = [{ id: 's1', date: '2026-09-14', dayNum: 1, sessionType: 'Push', completed: false,
      exercises: [{ name: 'Bench press', sets: [{ weight: 60, reps: 8, type: 'working' }] }] }];
    c.S.setData = { 'Bench press': [{ weight: '60', reps: '8', type: 'working', done: true }] };
    c.S.checked = new Set([0]);
    c.S.sessionNote = edited ? 'New note without a storage marker' : '';
    c.plansApply('b');
    if (edited) {
      assert.equal(typeof c.logSplitPendingSwitch, 'function');
      assert.equal(c.logActiveProgram().id, 'a');
      assert.deepEqual(writes, []);
    } else {
      assert.equal(c.logActiveProgram().id, 'b');
      assert.ok(writes.some(write => write[1] === 'wt_split'));
    }
  });
});

test('a note on an empty training day still receives unsaved-workout protection', () => {
  const empty = split({ types: [{ id: 'empty', name: 'Rest', exercises: [] }], schedule: [0] });
  const { c, writes } = fixture([saved('a', empty), saved('b')], empty);
  c.S.sessionNote = 'This typed note must survive';
  c.plansApply('b');
  assert.equal(typeof c.logSplitPendingSwitch, 'function');
  c.logCancelSplitSwitch();
  assert.equal(c.S.sessionNote, 'This typed note must survive');
  assert.deepEqual(writes, []);
});

test('explicit discard switches through existing saves, clears only the draft and preserves workout history', () => {
  const next = split({ types: [{ id: 'new', name: 'Full body', exercises: [{ name: 'Deadlift', sets: 3 }] }], schedule: [0] });
  const { c, data, writes, calls } = fixture([saved('a'), saved('b', next)]);
  c.S.dayIdx = 3; c.S.setData = { Squat: [{ weight: '90', reps: '5', type: 'working', done: true }] };
  c.S.checked = new Set([0]); c.S.sessionNote = 'Discard this'; c.S.sessionStart = 12345;
  c.S.sessionAdds = [{ name: 'Face pull' }]; c.S.swaps = { Squat: 'Goblet squat' };
  c.S.sessions = [{ id: 'history', date: '2026-09-13', exercises: [{ name: 'Squat', sets: [{ weight: 80, reps: 5 }] }] }];
  c.dayCustom = { push: { added: [{ name: 'Pushup', sets: 2 }], hidden: [] } };
  const history = copy(c.S.sessions), custom = copy(c.dayCustom), swaps = copy(c.S.swaps);
  c.saveSetData(); writes.length = 0;
  c.plansApply('b');
  assert.deepEqual(writes, [], 'showing the decision is write-free');
  c.logDiscardAndSwitch();
  assert.equal(c.logActiveProgram().id, 'b');
  assert.equal(c.loadPlans().activePlanId, 'b', 'the existing source hint follows the intentional activation');
  assert.equal(c.S.dayIdx, 0, 'an out-of-range retained rotation index is clamped');
  assert.equal(c.S.sessionNote, ''); assert.equal(c.S.sessionStart, null);
  assert.equal(c.S.checked.size, 0); assert.deepEqual(copy(c.S.sessionAdds), []);
  assert.deepEqual(copy(c.S.setData), { Deadlift: [{ weight: '', reps: '', type: 'working', done: false }] });
  assert.equal(data.has('wt_setdata'), false);
  assert.deepEqual(copy(c.S.sessions), history);
  assert.deepEqual(copy(c.dayCustom), custom);
  assert.deepEqual(copy(c.S.swaps), swaps);
  assert.ok(writes.some(write => write[0] === 'lsSaveTS' && write[1] === 'wt_split' && write[3] === 'trainingSplit'));
  assert.ok(writes.some(write => write[0] === 'lsSaveTS' && write[1] === 'wt_plans' && write[3] === 'plans'));
  assert.ok(calls.some(call => call[0] === 'rtResetAll'));
});

test('creating and cancelling starts a separate editable draft without changing live or saved splits', () => {
  const { c, data, writes } = fixture([saved('a'), legacy, documentPlan]);
  const before = Array.from(data.entries()), live = copy(c.splitConfig);
  c.openNewSplitEditor();
  assert.equal(c.SE.mode, 'new');
  c.SE.name = 'New draft';
  c.SE.days.push({ id: 'new-day', name: 'New day', exercises: [{ name: 'Pushup', sets: 2 }] });
  c.closeSplitEditor();
  assert.deepEqual(copy(c.splitConfig), live);
  assert.deepEqual(Array.from(data.entries()), before);
  assert.deepEqual(writes, []);
});

test('saving a new split stores a named independent copy without activating it', () => {
  const { c, writes } = fixture([saved('a'), legacy, documentPlan]);
  const live = copy(c.splitConfig), originals = copy(c.loadPlans().plans);
  c.openNewSplitEditor(); c.SE.name = 'New full body';
  c.SE.days = [{ id: 'draft-day', name: 'Full body', exercises: [{ name: 'Deadlift', sets: 3 }] }];
  c.saveSplitEditor();
  const after = copy(c.loadPlans().plans), added = after.find(plan => !originals.some(old => old.id === plan.id));
  assert.ok(added); assert.equal(added.name, 'New full body'); assert.equal(added.kind, 'split');
  assert.deepEqual(after.filter(plan => plan.id !== added.id), originals);
  assert.deepEqual(copy(c.splitConfig), live);
  assert.equal(c.logActiveProgram().id, 'a');
  assert.ok(writes.some(write => write[1] === 'wt_plans'));
  assert.ok(!writes.some(write => write[1] === 'wt_split'));
});

test('split editor round-trip preserves repeated day references and nested exercise metadata', () => {
  const { c, writes } = fixture();
  const original = split(), days = c.splitToDays(original);
  assert.deepEqual(copy(c.daysToSplit(days)), original);
  assert.notEqual(days[0].exercises[0].detail, original.types[0].exercises[0].detail);
  days[0].exercises[0].detail.tempo[0] = '5';
  assert.equal(original.types[0].exercises[0].detail.tempo[0], '3');
  assert.equal(days[2].exercises[0].detail.tempo[0], '3', 'editing one occurrence cannot mutate another');
  const edited = c.daysToSplit(days);
  assert.notEqual(edited.schedule[0], edited.schedule[2], 'a changed repeated occurrence becomes its own day');
  assert.deepEqual(writes, []);
});

test('duplicate uses a new ID and independent nested objects before persistence serialization', () => {
  const { c, savedValues, writes } = fixture([saved('a', split(), { lastAppliedAt: 500 }), legacy, documentPlan]);
  const before = copy(c.loadPlans().plans);
  c.plansDuplicate('a');
  const persisted = savedValues.find(([key]) => key === 'wt_plans')[1];
  const original = persisted.plans.find(plan => plan.id === 'a');
  const duplicate = persisted.plans.find(plan => !before.some(old => old.id === plan.id));
  assert.ok(duplicate); assert.notEqual(duplicate.id, original.id);
  assert.notEqual(duplicate.cfg, original.cfg);
  assert.notEqual(duplicate.cfg.types[0].exercises[0].detail, original.cfg.types[0].exercises[0].detail);
  assert.equal(duplicate.lastAppliedAt, undefined);
  duplicate.cfg.types[0].exercises[0].detail.tempo[0] = '8';
  assert.equal(original.cfg.types[0].exercises[0].detail.tempo[0], '3');
  assert.ok(!writes.some(write => write[1] === 'wt_split'));
});

test('deleting a saved copy currently in use preserves live configuration, legacy data and HTML', () => {
  const { c, writes } = fixture([saved('a'), legacy, documentPlan]);
  const live = copy(c.splitConfig), history = copy(c.S.sessions);
  c.plansDelete('a');
  assert.deepEqual(writes, [], 'the deletion explanation is not the delete');
  c.plansConfirmDelete('a');
  assert.deepEqual(copy(c.loadPlans().plans), [legacy, documentPlan]);
  assert.deepEqual(copy(c.splitConfig), live);
  assert.deepEqual(copy(c.S.sessions), history);
  assert.equal(c.logActiveProgram(), null, 'the live split still works without a saved name');
  assert.ok(writes.some(write => write[1] === 'wt_plans'));
  assert.ok(!writes.some(write => write[1] === 'wt_split'));
});

test('import stores validated workout JSON without applying it and rejects invalid JSON without writes', () => {
  const { c, data, writes } = fixture([saved('a'), legacy, documentPlan]);
  const live = copy(c.splitConfig);
  c.plansImportText(JSON.stringify(saved('imported', split({ schedule: [2, 1, 0] }))));
  assert.ok(c.loadPlans().plans.some(plan => plan.id === 'imported'));
  assert.deepEqual(copy(c.splitConfig), live);
  assert.equal(c.logActiveProgram().id, 'a');
  const before = data.get('wt_plans'); writes.length = 0;
  assert.throws(() => c.plansImportText('{broken'), /JSON|property/i);
  assert.equal(data.get('wt_plans'), before);
  assert.deepEqual(writes, []);
});

test('Create cancellation discards a custom exercise staged in the new split editor', () => {
  const { c, writes, data } = fixture();
  const library = c.loadExerciseLib(), stores = Array.from(data.entries());
  c.openNewSplitEditor(); c.SE.target = 0; c.SE.pickerQuery = 'New invented exercise';
  c.sePickCustom();
  assert.equal(c.SE.days[0].exercises[0].name, 'New invented exercise');
  assert.equal(c.SE.customExercises.length, 1);
  assert.deepEqual(c.loadExerciseLib(), library);
  c.closeSplitEditor();
  assert.deepEqual(c.loadExerciseLib(), library);
  assert.deepEqual(Array.from(data.entries()), stores);
  assert.deepEqual(writes, []);
});

test('Create save persists only staged custom exercises still used by the saved split', () => {
  const { c, writes } = fixture();
  c.openNewSplitEditor(); c.SE.name = 'Custom split';
  c.SE.target = 0; c.SE.pickerQuery = 'Kept exercise'; c.sePickCustom();
  c.SE.target = 0; c.SE.pickerQuery = 'Removed exercise'; c.sePickCustom();
  c.SE.days[0].exercises = c.SE.days[0].exercises.filter(e => e.name !== 'Removed exercise');
  assert.deepEqual(writes, []);
  c.saveSplitEditor();
  assert.ok(c.loadExerciseLib().some(e => e.name === 'Kept exercise'));
  assert.ok(!c.loadExerciseLib().some(e => e.name === 'Removed exercise'));
  assert.equal(writes.filter(write => write[0] === 'saveExerciseLib').length, 1);
  assert.ok(!writes.some(write => write[1] === 'wt_split'));
});

test('an unchanged current editor closes without rewriting live or saved data', () => {
  const { c, writes, data } = fixture();
  const stores = Array.from(data.entries()), live = copy(c.splitConfig);
  c.openSplitEditor(); c.saveSplitEditor();
  assert.deepEqual(copy(c.splitConfig), live);
  assert.deepEqual(Array.from(data.entries()), stores);
  assert.deepEqual(writes, []);
});

test('switch confirmation cannot later apply a saved split deleted while the decision was open', () => {
  const { c, writes, data } = fixture([saved('a'), saved('b', split({ schedule: [2, 1, 0] }))]);
  c.S.sessionNote = 'Keep until a valid switch';
  c.plansApply('b');
  const stored = JSON.parse(data.get('wt_plans')); stored.plans = stored.plans.filter(p => p.id !== 'b');
  data.set('wt_plans', JSON.stringify(stored));
  c.logDiscardAndSwitch();
  assert.equal(c.S.sessionNote, 'Keep until a valid switch');
  assert.equal(c.logActiveProgram().id, 'a');
  assert.deepEqual(writes, []);
});

test('normal blank rows switch directly; selecting the already matching split cannot clear an unsaved workout', () => {
  const { c, writes } = fixture([saved('a'), saved('b', split({ schedule: [2, 1, 0] }))]);
  c.S.setData = { 'Bench press': [{ weight: '', reps: '', type: 'working', done: false }] };
  c.plansApply('b');
  assert.equal(c.logActiveProgram().id, 'b');
  c.S.sessionNote = 'Keep this note'; const before = draftSnapshot(c); writes.length = 0;
  c.plansApply('b');
  assert.deepEqual(draftSnapshot(c), before);
  assert.deepEqual(writes, []);
});

test('landing page stays compact and marks exactly one actual matching saved item', () => {
  const { c, get, writes } = fixture([saved('a'), saved('b'), legacy]);
  vm.runInContext(extract('renderLogProgram'), c);
  c.renderLogProgram();
  const output = get('log-program-content').innerHTML;
  assert.match(output, /Current split/); assert.match(output, /Your splits/);
  assert.match(output, /Push · Pull · Push · Legs/);
  assert.equal((output.match(/>In use</g) || []).length, 1);
  assert.doesNotMatch(output, /Bench press|Save current split into this|Import &amp; export/);
  assert.match(output, /Create split/); assert.match(output, /onclick="openSplitEditor\(\)"/);
  let depth = 0;
  for (const tag of output.matchAll(/<\/?button\b[^>]*>/g)) {
    if (tag[0].startsWith('</')) depth--;
    else { assert.equal(depth, 0, 'overflow buttons must not be nested inside the preview button'); depth++; }
  }
  assert.equal(depth, 0);
  assert.deepEqual(writes, []);
});

test('modern preview includes planned details and legacy preview remains viewable without apply', () => {
  const { c, get, writes } = fixture([saved('a'), saved('b', split({ schedule: [2, 1, 0] })), legacy, documentPlan]);
  c.logProgSelect('a');
  let output = get('log-split-preview-content').innerHTML;
  assert.match(output, /Currently in use/); assert.doesNotMatch(output, /Use this split/);
  assert.match(output, /Bench press/); assert.match(output, /3 sets · 6–8 reps/);
  c.logCloseSplitPreview(); c.logProgSelect('b');
  output = get('log-split-preview-content').innerHTML;
  assert.match(output, /Use this split/); assert.match(output, /plansApply/);
  c.logCloseSplitPreview(); c.logProgSelect('old');
  output = get('log-split-preview-content').innerHTML;
  assert.match(output, /Older workout format/); assert.match(output, /Walk/);
  assert.doesNotMatch(output, /Use this split|plansApply/);
  c.logSplitMenu('old');
  output = get('log-split-sheet-box').innerHTML;
  ['Rename', 'Duplicate', 'Export', 'Delete'].forEach(action => assert.ok(output.includes(action)));
  assert.deepEqual(writes, []);
});

test('reimporting an existing ID adds a copy and cannot replace a split or HTML document', () => {
  const { c, writes } = fixture([saved('a'), legacy, documentPlan]);
  const before = copy(c.loadPlans().plans);
  const importedId = c.plansImportText(JSON.stringify(saved('document')));
  assert.notEqual(importedId, 'document');
  const after = copy(c.loadPlans().plans);
  assert.deepEqual(after.filter(p => p.id !== importedId), before);
  assert.equal(after.length, before.length + 1);
  assert.ok(!writes.some(write => write[1] === 'wt_split'));
});

test('Splits is the visible destination while the existing program IDs and history route remain', () => {
  const { c } = fixture();
  c.LOG_TABS = { today: 'log-sub-today', program: 'log-sub-program', exercises: 'log-sub-exercises', history: 'log-sub-history' };
  c.NAV_VIEW_ALIAS = {};
  c.location = { pathname: '/daily/', search: '' };
  vm.runInContext(['navResolve', 'dailyHistoryView', 'dailyHistoryTarget', 'dailyHistoryUrl'].map(extract).join('\n'), c);
  assert.equal(c.dailyHistoryTarget('log/program').logTab, 'program');
  assert.equal(c.dailyHistoryUrl('log', 'program'), '/daily/#log/program');
  assert.match(html, /id="lg-prog-btn"[^>]*onclick="setLogTab\('program'\)"[^>]*>Splits<\/button>/);
  assert.match(html, /id="log-sub-program"/);
  assert.match(source, /id:'log-program',\s*label:'Splits',\s*view:'log',\s*sub:'program'/);
  assert.match(source, /s:'training',label:'Saved splits',\s*sub:'Log \\u203a Splits'/);
});

test('preview and decision state exist before boot and browsing helpers have no persistence calls', () => {
  const boot = source.indexOf('// ── Boot');
  ['logProgSel', 'logSplitPreviewId', 'logSplitPendingSwitch'].forEach(name => {
    const index = source.search(new RegExp('(?:let|const) ' + name + '\\b'));
    assert.ok(index > 0 && index < boot, name + ' must be safe during hash boot');
  });
  ['logSplitRotation', 'logProgSelect', 'logCloseSplitPreview', 'renderLogSplitPreview',
    'renderLogProgram', 'logSplitMenu', 'logCancelSplitSwitch'].forEach(name =>
    assert.doesNotMatch(extract(name), /(?:localStorage\.(?:setItem|removeItem)|\b(?:lsSave|lsSaveTS|savePlans|saveSplit|saveSetData))\s*\(/,
      name + ' cannot persist a selection or preview'));
});

test('legacy empty day slots remain viewable without being rewritten or offered as a usable split', () => {
  const oldDays = { id: 'old-days', name: 'Older weekly plan', days: {
    0: null, 1: { name: 'Tuesday', exercises: [{ name: 'Walking', sets: 1 }] }, 2: {}
  }, history: [{ date: '2025-01-01', note: 'Keep this record' }] };
  const { c, data, get, writes } = fixture([saved('a'), oldDays, documentPlan]);
  const before = data.get('wt_plans');
  assert.doesNotThrow(() => c.logProgSelect('old-days'));
  const output = get('log-split-preview-content').innerHTML;
  assert.match(output, /Older workout format/);
  assert.match(output, /Tuesday/); assert.match(output, /Walking/);
  assert.match(output, /No exercises saved for this day/);
  assert.doesNotMatch(output, /Use this split|plansApply/);
  c.logCloseSplitPreview();
  assert.equal(data.get('wt_plans'), before);
  assert.deepEqual(writes, []);
});

test('preview shows textual exercise notes without leaking object metadata into visible copy', () => {
  const { c, writes } = fixture();
  const objectDetails = { name: 'Bench press', sets: 3, detail: { tempo: ['3', '1', '1'] } };
  const before = copy(objectDetails);
  assert.doesNotMatch(c.logSplitExerciseHtml(objectDetails), /\[object Object\]/);
  assert.match(c.logSplitExerciseHtml({ name: 'Bench press', note: 'Keep shoulders steady' }), /Keep shoulders steady/);
  assert.match(c.logSplitExerciseHtml({ name: 'Bench press', detail: 'Pause at the bottom' }), /Pause at the bottom/);
  assert.deepEqual(objectDetails, before);
  assert.deepEqual(writes, []);
});

test('numeric legacy IDs keep their type through generated actions and open the matching preview', () => {
  const old = { id: 42, name: 'Numeric legacy routine', exercises: [{ name: 'Walking', sets: 1 }] };
  const { c, data, get, writes } = fixture([saved('a'), old, documentPlan]);
  const before = data.get('wt_plans');
  const action = c.logSplitAction('logProgSelect', old.id);
  vm.runInContext(action, c);
  assert.equal(c.logProgSel, 42);
  assert.equal(c.logSplitPreviewId, 42);
  assert.equal(get('log-split-preview-title').textContent, 'Numeric legacy routine');
  assert.match(get('log-split-preview-content').innerHTML, /Walking/);
  c.logCloseSplitPreview();
  vm.runInContext(c.logSplitAction('logSplitMenu', old.id), c);
  assert.match(get('log-split-sheet-box').innerHTML, /Numeric legacy routine/);
  assert.equal(c.logProgSel, 42);
  assert.equal(data.get('wt_plans'), before);
  assert.deepEqual(writes, []);
});
