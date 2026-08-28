# OPUS IMPLEMENTATION — Safely turn Notes into Journal

Implement the accepted Notes-to-Journal review in Daily. This is a data-sensitive, multi-stage
change. Follow the checkpoint instructions exactly: **complete Stage A, verify it, then stop and
ask Francois for permission before beginning Stage B.** Do not treat the permission checkpoint as
optional merely because the rest of this prompt is already visible.

## Start here

1. Read `AGENTS.md` completely.
2. Read the Notes, navigation, Home-card, sync, backup/restore and Daily + AI sections of
   `CLAUDE.md`, but re-grep the implementation because documentation has drifted.
3. Read the existing Notes paths in `index.html`, `js/app.js` and all CSS files.
4. Read the earlier Notes prompts in `Prompts/`, especially the notes sync/home-card and
   fullscreen-editable prompts.
5. Inspect the current git status and recent history. Preserve unrelated user/agent work. Do not
   reset, discard, overwrite or silently fold unrelated changes into this feature.
6. Pull only if the working tree and current collaboration state make it safe. Do not use a
   destructive git command.

Daily is a vanilla HTML/CSS/JS PWA with no framework or build step. localStorage is the on-device
source of truth and Firebase Realtime Database mirrors it when signed in. GitHub Pages serves
`main` directly. Phone is primary; desktop is real. Dark mode is the actual default, light mode
must work, and the runtime accent may be almost any colour.

## Accepted product direction

The destination becomes **Journal**, not Diary and not Notes.

It remains one peer destination in the desktop sidebar and mobile hamburger menu. Do not add a
fifth swipe-deck/bottom-nav panel.

Journal contains two structurally separate jobs on one screen:

1. **Journal entries** — permanent reflections about a day, displayed in a reverse-chronological
   timeline grouped by the day they describe.
2. **Open Loops** — the current reminder/expiry/reference-note job, permanently positioned above
   the timeline so future-facing items never get buried in past-facing prose.

Do not implement a Journal/Notes mode toggle and do not mix reminders into the diary timeline.

Every existing record becomes `kind:'note'`. Do not heuristically reclassify any existing note as
a journal entry. Preserve its id, title, body, Work/Personal meaning, reminder/expiry meaning,
date, priority/pin and all available timestamps. The journal begins empty.

Accepted defaults:

- many journal entries may exist on one day;
- mood is optional and included in v1 as a skippable five-choice field;
- title is optional for journal entries;
- Open Loops remains inside Journal rather than becoming a separate destination;
- a weekly reflection surface may appear on Sundays and remain reachable on demand, but it must
  never create a streak, missed-day counter or nag notification.

## Critical defects already reproduced

Do not spend the session rediscovering whether these exist; verify their exact current call sites
and fix them:

1. Raw note title/body text is interpolated into `innerHTML` and into quoted input/textarea
   markup. Quotes, `<unknown>` text and `</textarea>` can truncate or destroy stored prose when
   opened and saved.
2. `wt_notes` is not correctly covered by the authoritative restore-to-cloud path, so restored
   notes can be replaced by the older cloud copy after reload.
3. `saveNotes()` writes the whole array while sign-in performs only a one-shot reconcile. Two
   active devices can silently overwrite one another.
4. `createdAt` has day precision, so same-day records cannot be ordered.
5. Delete is immediate and permanent with no confirmation or recovery.
6. Opening fullscreen for an unsaved new note can create a blank synced record.
7. Closing fullscreen does not reliably refresh the list/Home card.
8. Debounced autosave is not flushed on `pagehide`/`visibilitychange`, risking loss of the last
   keystrokes when an iPhone locks or backgrounds.
9. The list sort can throw when a legacy record has no `createdAt`.
10. `renderNotes()` and `notesFilter()` duplicate the sort and card renderer.
11. The Daily + AI Notes scope ignores the selected date range and drops relevant metadata.

## Non-negotiable data rules

- Existing personal text must survive byte-for-byte. Verify quotes, angle brackets, ampersands,
  emoji, line breaks and literal `</textarea>` content.
- Never assign user-entered text through executable HTML. Prefer `textContent` and setting
  input/textarea `.value` properties after element creation. Where HTML strings are unavoidable,
  use the correct existing escaper for the exact HTML context; attribute escaping and text-node
  escaping are not interchangeable.
- No migration/default may receive a fresh timestamp during boot in a way that outranks genuine
  cloud data. Respect `_bootPhase`, `stampFor()` and every invariant in `AGENTS.md`.
- No new sync-relevant localStorage key unless it is properly registered for sync, full backup,
  restore and authoritative restore-to-cloud. Prefer versioning records inside the existing
  `wt_notes` store so old backups remain reachable.
- Do not replace a synced store wholesale during ordinary sync.
- A backup restore is explicitly authoritative and must beat the prior cloud state.
- Migrations must be idempotent, version-aware and safe when an old-format record arrives later
  from an unupgraded device.
- Deletion must converge across devices. A union merge that omits deleted records is insufficient
  because another device will resurrect them; use tombstones or an equivalent proven mechanism.
- Journal text remains sensitive, default-off in Daily + AI and permanently outside AI Inbox
  write actions.

# STAGE A — Make the current Notes feature safe

Stage A deliberately makes no product rename, schema migration or large visual redesign. It must
ship as an independently safe checkpoint.

## A1. Collapse duplicated rendering

Create one canonical sort/filter/card-render path used by the initial Notes render and filter
changes. Do not leave two copies of the comparator/template. Preserve current visible behaviour
for All/Work/Personal, priority and date badges.

The comparator must tolerate missing/malformed legacy fields and remain deterministic. Do not call
`.localeCompare()` on an unknown value.

## A2. Stop text corruption and unsafe rendering

Fix every Notes rendering point, including:

- main list and filtered list;
- Home Notes card;
- compact editor fields;
- fullscreen editor fields;
- copy/export previews if they render user text as HTML.

For edit fields, render empty controls and assign `.value` as a property. Test the following exact
values through open → no edits → Save and confirm exact equality in storage:

- title: `Call the landlord re: 5\" pipe`
- body: `Closing tag test </textarea><b>must stay text</b> & \"quotes\"`
- body: `He said <urgent> and to text back.`
- multiline text, apostrophes and emoji.

Confirm none creates a script/image element or event attribute in the UI.

## A3. Remove ghost/stale/lost-draft behaviour

- Do not persist a newly-created note until it has meaningful content or the user explicitly
  saves it.
- Opening fullscreen and leaving without typing must not change the record count.
- Closing fullscreen after a valid edit must refresh the list and Home card immediately.
- Flush pending autosave synchronously through the existing save path on `pagehide` and when
  document visibility becomes hidden. Do not produce a new whole-array Firebase write for every
  keystroke more frequently than the existing debounce intends.
- Preserve every current metadata field when transitioning between editing surfaces.

Stage A may simplify internals, but do not build the new Journal editor yet.

## A4. Make current deletion less dangerous

Add a clear confirmation before deleting an existing note. Do not build the full Trash/tombstone UI
until Stage B, but do not leave one-tap permanent deletion in Stage A.

## A5. Repair authoritative backup restore coverage

Trace `exportAllData()`, import/restore, `restorePushToCloud()`, `fbReconcile`, and the current Notes
Firebase path. Make a restored `wt_notes` value authoritative over the pre-existing cloud notes on
the immediate reload, matching the already-settled restore behaviour for the rest of Daily.

Do this without pretending the old Notes sync is a normal timestamped blob if it is not. Choose the
smallest safe Stage-A bridge that works with the current Firebase shape and can be cleanly replaced
by Stage B's per-record sync. Add a concise comment explaining why the special handling exists.

## A6. Stage-A verification

Verify at minimum:

1. Every exact text case in A2 survives list render, compact edit, fullscreen edit, Save, reload and
   Firebase round-trip without alteration.
2. Work/Personal filtering, priority, reminder and expiry badges remain correct.
3. A legacy record missing `createdAt`, `date`, `type` or `dateType` cannot blank the screen.
4. New note → fullscreen → type nothing → close leaves record count unchanged locally and in the
   cloud.
5. Rename/body edit in fullscreen appears in the list and Home card immediately.
6. Type, then background/lock simulation before the debounce expires; the final characters persist.
7. Delete requires confirmation; cancel preserves the record.
8. Export a backup, change/delete the notes, restore the backup while signed in, reload and verify
   the restored notes remain both locally and in Firebase.
9. Fresh profile with no local Notes signs into an account with cloud Notes: cloud data wins; no
   boot/default write can erase it.
10. No console errors, `node --check js/app.js` passes and `git diff --check` is clean.
11. Both themes and iPhone portrait/landscape still render the current feature without overflow.

If a test requires using preview-browser localStorage, back it up first or explicitly state that the
test profile—not Francois's signed-in production data—will be replaced.

Because cached assets change, bump `CACHE_NAME` in `service-worker.js` with an accurate comment.

## MANDATORY CHECKPOINT

After Stage A:

- report files changed and exact behaviours fixed;
- report every verification result, including anything not testable;
- show the intended Stage-B schema/sync design in concise form;
- do not commit or push unless Francois explicitly asked in the active conversation;
- **STOP and ask: “Stage A is safe and verified. May I continue with the Journal migration and
  visible redesign in Stage B?”**

Do not begin Stage B until Francois answers yes.

# STAGE B — Versioned model and convergent sync

Begin only after explicit permission at the checkpoint.

## B1. Versioned record model

Use a concrete versioned shape appropriate to the existing codebase. It should support at least:

```js
{
  id,
  schemaVersion: 2,
  kind: 'entry' | 'note',
  title: '',
  body: '',
  dateAbout: 'YYYY-MM-DD',       // journal day; optional for a timeless note
  createdAt: 0,                  // epoch ms
  updatedAt: 0,                  // epoch ms
  deletedAt: null,               // epoch ms tombstone when deleted
  mood: null,                    // optional fixed id, not inferred text
  tags: [],
  pinned: false,
  dateType: 'none' | 'reminder' | 'expiry',
  dueDate: ''
}
```

Field names may change if an existing convention gives a materially safer implementation, but the
semantics may not. Keep migration mappings explicit:

- all legacy records → `kind:'note'`;
- `priority` → `pinned`;
- Work/Personal → normalised tags without losing the original meaning;
- legacy `dateType` retained;
- legacy `date` → due/expiry date for notes, not `dateAbout`;
- legacy `createdAt:'YYYY-MM-DD'` → deterministic epoch milliseconds derived from that local day,
  never the migration time;
- missing timestamps get deterministic fallback values, not `Date.now()` during boot;
- ids, title and body remain unchanged.

The migration must be idempotent and safe to run repeatedly. It must also normalise a legacy record
received later from an old device.

## B2. Per-record/convergent sync

Replace whole-array Firebase writes with a per-record or equivalently convergent pattern already
proven in this repository. Ordinary edits must not replace unrelated records.

Requirements:

- union by stable id;
- newer `updatedAt` wins for edits;
- a newer tombstone beats an older live record;
- a newer live record may beat an older tombstone only when it represents an intentional restore;
- live updates reach both open devices;
- old cloud arrays and new keyed objects are both read safely during transition;
- local `wt_notes` remains covered by full export/import;
- authoritative restore writes the complete restored truth to the new cloud shape;
- any sync registry/restore registration required by `AGENTS.md` is present;
- no boot-time timestamps outrank genuine cloud data.

Add Trash support retaining tombstones/recoverable deleted records for 30 days. Purge only when it
is safe for cross-device convergence; if safe automatic purge cannot be guaranteed within this
architecture, retain tombstones and document that choice rather than risking resurrection.

## B3. Stage-B verification

Use two isolated browser profiles or equivalent controlled clients:

1. Edit record A on phone/client A while client B edits record B; both edits converge.
2. Edit the same record on both; the newer `updatedAt` wins deterministically.
3. Delete on A while B is offline; reconnect B and confirm the record does not resurrect.
4. Restore the deleted record from Trash and confirm intentional recovery converges.
5. Old-format cloud array migrates without losing or duplicating records.
6. Old-format record arriving after migration normalises safely.
7. Backup made before this feature restores correctly after migration.
8. Fresh device sign-in cannot overwrite populated cloud Journal data.
9. Migration run twice produces byte-equivalent records apart from legitimate sync metadata.
10. No duplicate ids, ghost blanks or new localStorage stores.

# STAGE C — Build the Journal experience

## C1. Navigation and naming

Rename the peer destination and its relevant labels from Notes to **Journal** in desktop sidebar,
mobile hamburger, view heading, Home Layout description/preview and accessibility labels. Do not
rename session notes, Budget week notes, transaction notes or CSV Notes columns; those are different
concepts.

Correct the stale mobile-nav sentence in `CLAUDE.md` while working in this area: the live bottom nav
is Home, Budget, Log, Kitchen; Stats is in the hamburger/desktop sidebar.

## C2. Phone information architecture

Top to bottom:

1. Compact Journal header with search and jump-to-date actions.
2. Permanent one-tap **Write about today** composer stub. If today already has entries, it still
   permits another entry; do not force one-per-day.
3. **Open Loops** strip containing pinned and due/expiry items, with an explicit `+` for a new note
   and an All Notes path for undated/reference notes.
4. Reverse-chronological journal timeline grouped by `dateAbout`, with month dividers as needed.

Do not render empty days. Multiple entries under one day header stack and show their creation time.
Cards show an optional title, body preview and optional mood; user prose is always inert text.

Search covers title, body and tags case-insensitively. A calendar/jump sheet marks days containing
entries but is not the primary browse surface and does not portray missing days as failures.

## C3. One honest editor

Retire the compact-modal → fullscreen two-surface path. Use one full-screen editor for both entries
and notes:

- for a new journal entry, focus body immediately;
- journal title optional;
- dateAbout defaults to today with a Yesterday shortcut and date picker;
- five optional moods with stable ids and accessible labels; never infer mood;
- optional tags behind progressive disclosure;
- pin and delete/Trash actions available without dominating writing;
- for an Open Loop note, show Work/Personal tags and none/reminder/expiry date controls;
- autosave after meaningful content, debounced and flushed on background/pagehide;
- no blank record from merely opening/closing;
- visible saved/saving state that does not flicker or nag;
- safe-area and keyboard behaviour tested on iPhone portrait and landscape;
- a readable desktop measure around 68–76 characters.

Plain text only. Do not add rich text, Markdown, attachments, locations or photos.

## C4. Desktop

At desktop width, use master/detail rather than full-width cards:

- a roughly 320–360px left rail with search, Open Loops, today's composer and the grouped timeline;
- the selected entry in a capped reading/editing column to the right;
- no modal for ordinary writing;
- empty and no-selection states that make the next action obvious.

Do not change the app-wide max-width or Home's fixed two-column grid.

## C5. Home card

Retain the saved Home card id/order/wide settings so existing Home layouts do not reset.

Change its content to:

- primary line: `Write about today →`, or `Today's entry` plus a short first-line preview when an
  entry exists;
- below it, up to three pinned or soon-due Open Loops;
- honest empty state: `Nothing due. Nothing written yet today.`

No streak, missed-day count or guilt language. Keep the cap/show-all behaviour required by
`HOME_CAPPABLE` for unbounded list cards.

# STAGE D — Daily context, weekly reflection and AI export

## D1. “That day in Daily”

For journal entries, compute a read-only context strip from `dateAbout`; do not copy these values
into the journal record. Use canonical existing accessors and source data for:

- saved workout/session;
- habit completion;
- calorie total;
- weight entry;
- variable spending/transactions for that day or the containing budget week, clearly labelled.

Only show facts actually recorded. Missing data is absent/unknown, never zero by assumption. Tapping
a chip navigates to the most relevant existing source view without creating another copy of the
record.

## D2. Weekly reflection

Add a restrained weekly reflection entry point on Sundays and on demand. It may summarise recorded
workouts, habits, spending, calories and weight movement, then offer one optional open question.
It must not auto-write prose, create a journal entry, mark an incomplete week as failure, or make
causal/health claims.

## D3. Daily + AI

Evolve the sensitive Notes scope into Journal-compatible controls without weakening privacy:

- Journal remains sensitive and default off.
- Selected date range must be honoured.
- Offer titles/metadata only versus full text, defaulting to titles/metadata only.
- Open Loops and journal entries must be distinguishable.
- Preview counts accurately reflect what will be copied/downloaded.
- No preset silently selects Journal.
- No AI Inbox action may add, edit, summarise into or delete a journal entry.

# Explicitly out of scope

- Photos/attachments or Firebase Storage.
- Rich text/Markdown editor.
- Location permission or automatic location.
- Journal passcode/encryption theatre.
- Streaks, word counts, reminders to journal or push notifications.
- Multiple notebooks/journals.
- Calendar-first browsing.
- Automatic sentiment analysis, mental-health interpretation or inferred mood.
- Automatic AI export, AI-authored entries or AI write-back.
- Cross-domain causal claims such as “you are happier on gym days.”
- A new framework, build step or database service.

# Final verification before handoff

After the permitted stages are complete, verify all of the following and report results explicitly:

1. Every pre-existing note remains present with exact text and metadata after migration.
2. All existing notes appear only in Open Loops/All Notes; none is guessed into the timeline.
3. Multiple journal entries on one day order deterministically.
4. Entry date can differ from created date.
5. Optional title, mood/tags skipped and every mood choice all save correctly.
6. Literal HTML-like prose remains inert and byte-preserved across every UI and sync path.
7. Autosave survives backgrounding before debounce completion.
8. Search and date jump find the expected records.
9. Delete → Trash → restore works and converges across devices.
10. Phone portrait, phone landscape and desktop master/detail have no horizontal overflow or
    controls hidden under navigation/safe areas.
11. Dark/light themes and multiple arbitrary accent colours remain legible.
12. Home layout order/wide/hidden preferences survive the renamed card.
13. Daily context chips agree with their source screens and never store duplicated values.
14. Journal is absent from AI output by default; selected date range and titles-only/full-text
    choice are honoured exactly.
15. Full backup/restore works from both a pre-Journal backup and a new backup.
16. Fresh-profile sign-in preserves populated cloud data.
17. No console errors; all touched JavaScript passes `node --check`; `git diff --check` is clean.
18. Service-worker cache version is bumped once per shipped checkpoint with accurate comments.

Do not claim screenshots were checked if the preview browser could not composite them. Use DOM
geometry and functional assertions as fallback, but state the limitation and request a real-device
rotation/keyboard check where appropriate.

At the final handoff, list commits only if Francois authorised commits. Do not push unless explicitly
asked; pushing `main` deploys immediately.
