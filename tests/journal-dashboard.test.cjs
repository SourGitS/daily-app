// Journal's landing hierarchy, against the real builders in an isolated VM — no browser, no
// storage, no account. What these protect is the ORDER the screen puts things in (writing
// first, the timeline as the body, reminders and reflection subordinate), the promise that day
// context is recorded fact and never a score, and the promise that looking at Journal writes
// nothing. The storage model, the record shape and the sync path are deliberately untouched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { extract } = require('./harness.cjs');

const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const TODAY = '2026-09-15';
const CONTINUE = 'Continue today’s entry';

function fixture({ notes = [], facts = [] } = {}) {
  const ctx = vm.createContext({
    console, Date, Math, Number, String, Array, Object, JSON,
    getLocalDate: () => TODAY,
    escText: s => String(s), escAttr: s => String(s),
    jrnEntries: () => notes.filter(r => r.kind === 'entry'),
    jrnEntryDay: r => r.dateAbout,
    jrnLongDay: () => 'Tue, 15 Sept',
    jrnMoodLabel: m => ({ 3: 'OK', 4: 'Good' })[m] || '',
    jrnDayContext: () => facts
  });
  vm.runInContext(['jrnTodayEntries', 'jrnWriteBtnHtml', 'jrnTodayFactsHtml', 'jrnTodayHtml',
    'jrnReflectLinkHtml'].map(extract).join('\n'), ctx);
  return ctx;
}
const entry = (over = {}) => ({ id: 'jrn_1', kind: 'entry', dateAbout: TODAY, title: '',
  body: 'Rode to the market.', tags: [], createdAt: 2, ...over });

test('an empty day invites a first line and offers one clear primary action', () => {
  const html = fixture().jrnTodayHtml();
  assert.match(html, /<h2 class="jrn-today-ttl"/, 'Today is a real heading');
  assert.match(html, /A few lines about today is plenty/);
  assert.match(html, /data-jrn="write-today">Write today</);
  assert.equal((html.match(/<button/g) || []).length, 1, 'one action, not a row of them');
  // Nothing on this screen may keep score.
  assert.ok(!/streak|missed|goal|target|day in a row/i.test(html));
});

test('a day already written continues that entry instead of starting a second one', () => {
  const html = fixture({ notes: [entry()] }).jrnTodayHtml();
  assert.ok(html.includes('data-jrn="write-today">' + CONTINUE + '<'));
  assert.match(html, /class="jrn-today-peek" data-jrn="open" data-id="jrn_1"/);
  // A second, separate entry for the same day is still one press away.
  assert.match(html, /data-jrn="new-entry">\+ Add another moment</);
});

test('several entries today are counted, not ranked', () => {
  const html = fixture({ notes: [entry(), entry({ id: 'jrn_2', createdAt: 9, body: 'Later.', mood: 4 })] }).jrnTodayHtml();
  assert.match(html, /2 entries today · Good/);
  assert.match(html, /data-id="jrn_2"/, 'the newest entry is the one previewed');
});

test('day context is recorded fact, and an absent area produces nothing at all', () => {
  const none = fixture({ facts: [] });
  assert.equal(none.jrnTodayFactsHtml(TODAY), '', 'no facts means no block, not empty placeholders');
  assert.ok(!/jrn-today-facts/.test(none.jrnTodayHtml()));
  const some = fixture({ facts: [
    { kind: 'workout', label: 'Chest & Back', detail: 'Workout' },
    { kind: 'habits', label: '2 habits completed', detail: 'Habits' }
  ] });
  const html = some.jrnTodayFactsHtml(TODAY);
  assert.equal((html.match(/class="jrn-context-chip"/g) || []).length, 2, 'one chip per recorded fact');
  assert.match(html, /Anything not listed is unknown, not zero/);
  assert.ok(!/missing|incomplete|remaining|of 4|0 of/i.test(html),
    'absent areas are never reported as zero or as an unfinished list');
  // Chips are links back to the source, never editable copies of it.
  assert.match(html, /data-jrn="day-source" data-source="workout"/);
});

test('the writing action comes before the facts', () => {
  const html = fixture({ facts: [{ kind: 'workout', label: 'Chest & Back', detail: 'Workout' }] }).jrnTodayHtml();
  assert.ok(html.indexOf('jrn-write-btn') < html.indexOf('jrn-today-facts'),
    'facts are context for the write, not a checklist to clear first');
  assert.ok(html.indexOf('jrn-today-invite') < html.indexOf('jrn-write-btn'));
});

test('reflection is one quiet optional line, never a weekly task', () => {
  const html = fixture().jrnReflectLinkHtml();
  assert.match(html, /data-jrn="reflect"/);
  assert.match(html, /Weekly reflection/);
  assert.ok(!/due|overdue|complete|required|ready to review/i.test(html));
  // The Sunday card that read as a weekly obligation is gone, and so is its compact renderer.
  assert.ok(!/jrnSundayReflectHtml/.test(source));
  assert.ok(!/jrn-reflect-card/.test(source));
});

// ── Page order ────────────────────────────────────────────────────
// Read off renderJournal / jrnNavHtml rather than a rendered string: both layouts compose their
// sections there, and the order IS the design.

test('the phone page is Today, the timeline, then Open Loops, then reflection', () => {
  const fn = extract('renderJournal');
  const phone = fn.slice(fn.indexOf(': jrnHeadHtml()'), fn.indexOf('wrap.innerHTML'));
  const at = name => phone.indexOf(name);
  ['jrnTodayHtml', 'jrnBodyHtml', 'jrnLoopsHtml', 'jrnReflectLinkHtml']
    .forEach(n => assert.ok(at(n) > 0, 'missing ' + n));
  assert.ok(at('jrnTodayHtml') < at('jrnBodyHtml'), 'Today comes first');
  assert.ok(at('jrnBodyHtml') < at('jrnLoopsHtml'), 'the timeline is the body, above the reminders');
  assert.ok(at('jrnLoopsHtml') < at('jrnReflectLinkHtml'), 'reflection is last');
});

test('the desktop rail uses the same order', () => {
  const fn = extract('jrnNavHtml');
  const at = name => fn.indexOf(name);
  assert.ok(at('jrnTodaySectionHtml') < at('jrnBodyHtml'));
  assert.ok(at('jrnBodyHtml') < at('jrnLoopsHtml'));
  assert.ok(at('jrnLoopsHtml') < at('jrnReflectLinkHtml'));
  // The open entry's own context block is already on screen beside the rail; printing the same
  // chips in both places is a duplication the phone layout cannot have.
  assert.ok(!/jrnTodayFactsHtml/.test(extract('jrnTodaySectionHtml')));
  assert.match(extract('jrnTodaySectionHtml'), /jrnWriteBtnHtml/, 'the rail still offers the action');
});

test('Open Loops keeps every behaviour it had; only its position changed', () => {
  const fn = extract('jrnOpenLoops');
  ['pinned', 'due', 'later', 'undated'].forEach(k => assert.match(fn, new RegExp(k + '\\s*:')));
  assert.match(fn, /dateType!=='none'/, 'dated vs undated is unchanged');
  const row = extract('jrnLoopRow');
  assert.match(row, /jrnDueText/);
  assert.match(row, /jrnDueColour/);
  assert.match(row, /Pinned/);
  assert.match(row, /data-jrn="open"/, 'a loop still opens for editing');
});

// ── Nothing is written by looking ─────────────────────────────────

test('building the landing writes nothing and touches no store', () => {
  ['jrnTodayHtml', 'jrnTodayFactsHtml', 'jrnTodayEntries', 'jrnWriteBtnHtml', 'jrnReflectLinkHtml',
   'jrnTodaySectionHtml', 'renderJournal', 'jrnNavHtml', 'buildHomeNotesCard'].forEach(name => {
    const fn = extract(name);
    [/localStorage/, /lsSave/, /jrnPut\(/, /jrnSaveLocal/, /jrnPushOne/, /firebase/, /Date\.now/]
      .forEach(re => assert.ok(!re.test(fn), name + ' must not contain ' + re));
  });
  // The one gate that decides when a record becomes real is untouched.
  assert.match(extract('jrnEdPatch'), /meaningful && hasSubstance/);
  assert.match(extract('jrnLoadEditor'), /Not persisted until it has content/);
});

test('the store, its schema and its sync path are unchanged', () => {
  assert.match(source, /const JRN_SCHEMA = 2;/);
  assert.match(extract('jrnSaveLocal'), /lsSaveTS\('wt_notes', arr, 'wt_notes_ts', null\)/);
  assert.match(extract('jrnMerge'), /updatedAt/, 'newer-updatedAt merge survives');
  assert.match(extract('jrnDelete'), /deletedAt/, 'deletion is still a tombstone');
  assert.match(extract('jrnRestore'), /deletedAt/);
  assert.ok(!/daily_journal|wt_journal/.test(source), 'no second Journal store');
});

// ── Boot safety ───────────────────────────────────────────────────
// Journal's screen state is let/const, so it must be initialised before init() can reach
// setView('notes'). It was not: opening the app on #notes threw "Cannot access 'JRN_SPLIT_MIN'
// before initialization" and replaced the whole app with the boot-failure screen.

test('Journal screen state is declared above the boot block', () => {
  const boot = source.indexOf('\ntry {\n');
  assert.ok(boot > 0, 'boot block anchor');
  ['const JRN_SPLIT_MIN=', 'let jrnTab=', 'let jrnSelId=', 'let jrnEdId=', 'const JRN_MOODS=',
   'const JRN_MEANINGFUL_KEYS=', 'let jrnCalMonth='].forEach(decl => {
    const at = source.indexOf('\n' + decl);
    assert.ok(at > 0, 'missing declaration: ' + decl);
    assert.ok(at < boot, decl + ' must be initialised before init() can render Journal from a #hash');
  });
});

test('the split point still agrees with the stylesheet', () => {
  assert.match(source, /const JRN_SPLIT_MIN=1240;/);
  const css = fs.readFileSync(path.join(__dirname, '../css/journal.css'), 'utf8');
  assert.match(css, /@media \(min-width:1240px\)/,
    'jrnIsDesktop() and the two-pane media query are two decisions about one number');
});

// ── Home card ─────────────────────────────────────────────────────

test('the Home card opens the dashboard, and Write today opens the write', () => {
  const fn = extract('buildHomeNotesCard');
  assert.match(fn, /class="jrn-composer is-peek" data-jrn-home="all"/, 'the main area is the way in');
  assert.match(fn, /data-jrn-home="write"/);
  assert.ok(!/data-jrn-home="new"/.test(fn), 'the preview no longer opens the editor itself');
  assert.match(fn, /slice\(0,1\)/, 'at most one Open Loop — this is a shortcut, not a second screen');
  // The saved widget identity, and therefore every stored Home layout, is untouched.
  assert.match(extract('renderHomeNotesBubble'), /\[data-card-id="notes"\]/);
});

test('the Journal task changed no navigation', () => {
  const ctx = vm.createContext({ console });
  const from = source.indexOf('const NAV_ORDER=');
  const to = source.indexOf('// ── Journal screen state');
  assert.ok(from >= 0 && to > from, 'navigation registry anchors');
  vm.runInContext(source.slice(from, to) + '\nglobalThis.__n={NAV_ORDER,NAV_QUICK,NAV_TREE};', ctx);
  const { NAV_ORDER, NAV_QUICK, NAV_TREE } = JSON.parse(JSON.stringify(ctx.__n));
  assert.deepEqual(NAV_ORDER, ['home', 'budget', 'log', 'food', 'stats'],
    'the five-item phone deck is untouched');
  assert.deepEqual(NAV_QUICK.map(q => q.view),
    ['home', 'budget', 'log', 'food', 'stats', 'settings']);
  assert.ok(!NAV_QUICK.some(q => /journal|notes/i.test(q.view + q.label)),
    'Journal must not join Quick Access');
  const journal = NAV_TREE.find(g => g.id === 'more').rows.find(r => r.id === 'journal');
  assert.equal(journal.view, 'notes', 'Journal keeps its row, its internal id and its route');
});
