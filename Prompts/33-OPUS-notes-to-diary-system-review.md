# OPUS REVIEW — Turn Notes into Daily's diary and reflection system

You are reviewing a real personal lifestyle PWA called **Daily**. This is a review and design
task only: **do not edit or implement the app in this run**. Inspect the repository, run the app
locally if useful, and return a direct, ranked product/design/function review that can become a
separate implementation brief later.

Read `AGENTS.md` completely first, then read the Notes-related parts of `CLAUDE.md`,
`index.html`, `js/app.js`, every relevant CSS rule, and prior Notes prompts in `Prompts/`
(especially the sync/home-card and fullscreen-editor work). Treat the code as ground truth when
written documentation has drifted.

## Product context

Daily is Francois's single-user "everything app": workouts, habits, body weight, food/calories,
budget and transactions, accounts, kitchen, plans, notes, and an explicit Daily + AI context
export/import bridge. It is vanilla HTML/CSS/JS, localStorage-first with Firebase mirroring, a
GitHub Pages PWA, and has no build step.

Phone is primary. Notes/diary entries will commonly be written at night on an iPhone, but the
desktop experience matters for longer reflection, review and search. Dark mode is the real
default. The runtime accent can be almost any colour, so do not design around one fixed hue.

The intended direction is not merely to rename Notes. Francois wants it to become a useful
**diary/journal log** that helps him remember what happened, reflect, and eventually understand
patterns across the rest of Daily. However, the current Notes feature also holds genuine general
notes, reminders, expiry dates, work/personal classification and priority notes. Decide how to
evolve it without destroying that useful job.

## What Notes does today

Verify this in code rather than accepting it blindly:

- Notes is a peer destination in desktop navigation and the mobile hamburger menu, plus an
  optional Home card.
- The saved model is broadly `{id,title,body,type,dateType,date,priority,createdAt}`.
  `type` is Work or Personal; `dateType` is none, reminder or expiry.
- The main screen has one large New Note button, All/Work/Personal filters, and a flat list.
  Priority and dated notes change sorting and badges.
- Tapping a note opens a compact modal. A second control opens a full-screen title/body editor
  which autosaves on a debounce and can copy the note.
- The Home Notes card separately buckets priority, urgent, recent-undated and later-upcoming
  notes.
- Notes are included in full backup and can be selected as a sensitive, default-off scope in
  Daily + AI.
- `wt_notes` is localStorage-first and mirrored to Firebase under the user's notes path. Inspect
  the exact reconciliation and whole-array write behaviour before suggesting any migration.

## Questions this review must answer

### 1. What should the product actually become?

Give a direct recommendation among these broad directions, or a better one:

- replace Notes entirely with a journal;
- create Journal and retain Notes as a separate tool;
- make one combined destination with clearly distinct Journal and Notes modes;
- use a daily timeline where diary entries, reminders and reference notes are different entry
  types within one system.

Do not hedge with "any could work." Pick the strongest option for this particular app and
explain what happens to every current note type. Say whether the navigation label should remain
Notes, become Journal/Diary, or use another name.

### 2. What is the minimum diary model that will remain useful in years?

Review the data model, not just the screen. Consider:

- the date the entry is **about**, separately from created/updated timestamps;
- multiple entries on one day versus one canonical daily entry;
- title being optional for fast journalling;
- free text, mood/energy, tags, favourites/pins, photos/attachments, prompts and location;
- editing historical dates, drafts, autosave, accidental deletion and recovery;
- search and filtering;
- whether journal context should link to workouts, habits, food, weight, spending and events by
  stable references, or merely show a generated day snapshot without copying data into the
  note;
- future calendar/work integration without inventing a calendar system now.

Rank these ruthlessly. A personal diary should not become a database form that asks ten questions
before Francois can write two sentences. Identify which fields belong in the first version,
which should be optional progressive disclosure, and which are overengineering.

### 3. What should capture feel like?

Design phone-first flows for:

- "write about today" in one tap;
- adding a second moment/update on the same day;
- jotting a general note that is not a diary entry;
- returning to an unfinished entry after the keyboard/app closes;
- writing a long entry on desktop;
- reviewing yesterday, the week, and an older date;
- searching for a person, event or phrase;
- optionally using a gentle prompt without making the app nag or manufacture content.

Treat iPhone keyboard behaviour, safe areas, sticky actions, large text editing and one-handed
use as functional constraints. Decide whether the current modal-to-fullscreen transition should
survive or be replaced by one honest editing surface.

### 4. What should browsing and reflection look like?

Propose the information architecture for phone and desktop. Directly assess:

- reverse-chronological timeline versus calendar-first versus a hybrid;
- grouping by day/week/month;
- previews, empty days and multiple entries on one day;
- whether desktop benefits from master/detail, a reading column, or another layout;
- a weekly reflection/review surface;
- how current reminders/expiry notes remain discoverable rather than being buried in diary prose;
- what, if anything, belongs on the Home card.

Use diagrams or compact wireframes only where they clarify a relationship. Do not produce visual
mockups for decoration.

### 5. How should Diary connect to the rest of Daily?

This is a major reason to build it inside Daily instead of using a generic journal app. Evaluate
useful, privacy-respecting connections such as:

- a read-only "Today in Daily" context strip showing a completed workout, habits, calories,
  weight and spending without duplicating those values into the entry;
- opening the source workout/budget/day from a journal entry;
- journal markers or excerpts in Stats;
- week-review prompts that reference real recorded data;
- Daily + AI export controls for a date range, redaction and explicit opt-in;
- assistant-proposed reflection prompts or summaries that never overwrite the user's words.

Separate genuinely useful connection from gimmicks. Do not recommend automatic sentiment
analysis, therapy-style claims, fabricated causal conclusions, or silently sending diary text to
an AI service.

## Required technical/data-safety audit

Call out function problems even if they are not visible design issues. At minimum inspect:

- whether user-entered note titles/bodies are escaped at every `innerHTML` render point;
- whether date sorting and the current date-difference calculation are reliable in the Sydney
  timezone and around midnight/DST;
- whether `createdAt` currently has enough precision to order multiple same-day entries;
- whether full-screen autosave can leave blank/half-created notes or lose non-title metadata;
- destructive delete with no undo/recovery;
- whole-array Firebase writes, one-shot reconciliation, concurrent edits on phone/desktop, and
  how a migration can avoid resurrecting/deleting entries;
- the `_bootPhase` timestamp invariant and sync/restore registration rules in `AGENTS.md`;
- idempotent migration of every existing note, preserving ids, text, type, date, priority and
  timestamps;
- backup/restore and Daily + AI sensitive-scope compatibility.

Do not casually propose a brand-new localStorage store. If a new or versioned model is justified,
spell out how it is registered for sync/restore and how old data is preserved. Existing notes are
real personal data and **zero-loss migration is non-negotiable**.

## Constraints and settled decisions

- Vanilla HTML/CSS/JS; do not propose React, a database service replacement or a build system.
- localStorage remains the on-device source of truth and Firebase remains optional mirroring.
- Phone-first, desktop-real, dark-first, both themes supported.
- Runtime accent is arbitrary; semantic success/warning/danger must not depend on it.
- Notes/diary content remains sensitive and excluded from AI context unless deliberately selected.
- Do not turn diary writing into another habit streak, score or guilt mechanism.
- Do not re-propose undoing established app-wide navigation, Home's fixed two-column desktop grid,
  service-worker strategy or Firebase security model without a specific causal argument.
- Do not implement anything in this review.

## Required output

Format the answer in this order:

1. **Direct verdict** — what Notes should become and why.
2. **Current-system diagnosis** — what works, what is merely dated, and what is genuinely bad.
3. **Recommended information architecture** — phone and desktop.
4. **Ranked product/function proposals** — most impactful first, each with user benefit,
   behaviour, data implications, complexity/risk and dependencies.
5. **Recommended entry schema and zero-loss migration mapping** — concise but concrete.
6. **Cross-feature connections** — what to build now, later, and never.
7. **Technical/data-safety findings** — ranked separately from visual design.
8. **Phased implementation plan** — smallest coherent release first; do not write code.
9. **Don't bother list** — attractive ideas that are not worth the complexity or intrusion.
10. **Open decisions for Francois** — only choices that materially change the product, with your
    recommended default first.

Be direct. If the current Notes model is the wrong foundation for a diary, say so plainly. Prefer
a coherent personal system over an impressive feature list.
