# FUNCTIONAL SPEC — Log tab & the exercise system
### What it does today. Not a critique, not a design brief — read as ground truth.

---

## WHAT THIS IS

Personal lifestyle app (workouts, budget, habits, kitchen). Vanilla HTML/CSS/JS, no framework,
phone-first PWA. This spec covers **Log** — the workout-logging tab (one of the four bottom-nav
tabs) — and the exercise system underneath it: the training split, the exercise library,
mid-session swaps, and how a logged session feeds everything else in the app.

This is the tab requested for review specifically as *a workout tracker*: how well the pieces
— split, library, swaps, session, history, PRs — actually connect to each other, not just how
Log itself looks.

---

## THE DATA MODEL

**The training split** is user-built, not hardcoded to a fixed program. It's a set of "day
types" (e.g. "Legs", "Chest & Back") plus a repeating schedule of which type comes on which
day — the schedule can repeat any type any number of times in any order. Each day type carries
its own ordered exercise list, each with a target set count. A brand-new install seeds a
generic default; an install that already has history seeds the legacy split it was on, so
existing logs stay meaningful — this is a one-time migration decision, not something re-run
later.

**Per-day customisation** (`dayCustom`, keyed by day-type id) sits on top of the split without
touching it: exercises added, exercises hidden (a program default can be hidden rather than
truly deleted, since defaults regenerate from the program on every load), and a saved
drag-reordered sequence. This is where "+ Add exercise" from the Log screen itself normally
writes to — **except** a session-only add (see below).

**The exercise library** is not a separate authored list — it's *derived*: every exercise name
that appears anywhere across every day type in the split, automatically re-categorised by a
muscle-group guesser, plus whatever the user has explicitly added as a custom exercise (with
its own muscle group, or a user-defined custom muscle group beyond the built-in list). A
program exercise can be individually hidden from the library without touching the program
itself. Any library exercise (default or custom) can be flagged "allow negative/assisted" (for
assisted pull-ups, band-assisted dips, etc. — the set's weight input then accepts a ± sign) or
"timed" (tracked in seconds/reps rather than weight — affects PRs, charts, and the set row's
own unit label).

**A set**: `{weight, reps, type: 'working'|'warmup', done}`. Nothing more — no RPE per set, no
per-set notes.

**A session**, once saved: `{id, date, dayNum, sessionType, duration, exercises: [{name,
sets}], note?, effort?}`. `exercises[].name` is stored as **whatever name was actually being
displayed at the moment of saving** — see Swaps below, this matters.

---

## THE LOG SCREEN, TOP TO BOTTOM

1. **Day hero** — today's training-day name (in that day's own colour), exercise count,
   "N of M done" with a progress bar, a play/session-start affordance.
2. **Session timer + rest timer**, one combined card. The rest timer is a stopwatch (counts
   up, lap-capable, timestamp-based so backgrounding the phone can't make it drift). **The
   session timer has no separate "start" action of its own** — it starts on whichever happens
   first: pressing the rest-timer's Start, or typing a value into any set's weight/reps field.
   There is no way to time a session without either of those two things happening.
3. **Per-exercise cards**, one per exercise in today's effective list, each with:
   - A swap affordance (opens a library picker — see Swaps below)
   - Set rows: weight/reps inputs, a warmup toggle per set (excludes it from PR/progressive-
     overload calculations and from the exercise's "done" state), a done checkbox per set, and
     — if the exercise allows it — a ± sign toggle for negative/assisted loads.
   - An exercise counts as **done** once it has at least one working set and every working set
     is checked. Marking the last set of an exercise done auto-collapses that card after a
     short delay; completing every exercise in the day triggers its own celebration state,
     distinct from the per-set toast.
   - Cards can be drag-reordered (custom touch implementation, not HTML5 drag-and-drop, which
     doesn't work on iOS) — the order persists per day type via `dayCustom.order`, independent
     of anything already logged.
   - The one exercise judged "next up" (the first not-yet-done one, or whichever was last
     interacted with) gets a visual "active" treatment.
4. **"+ Add exercise"** — can add permanently to this day type, or as a **session-only**
   addition that appears in today's rendered list and gets written into today's saved history,
   but is never added to `dayCustom` — it will not reappear the next time this day type comes
   around.
5. **Session notes** — free text, per session, saved with it.
6. **Optional effort rating** (Easy/Moderate/Hard/Brutal) and **optional hours-worked
   tracking** — both opt-in, both stored on the saved session object.
7. **Save** — validates at least one set has a real weight or rep value logged (across the
   whole day, not per exercise) before it will write the session.

---

## SWAPS — HOW THEY ACTUALLY WORK (the main interconnectedness finding)

Swapping an exercise (e.g. Bench Press → Incline Bench Press, mid-session) is **global and
permanent**, not scoped to today or to one occurrence of the day type. It's a single map,
original-name → replacement-name, and it applies everywhere that exercise's original name
appears in the split from the moment it's set, until it's explicitly reset back to default.

**History is stored under whatever name was literally being displayed at save time** — not the
original program name, and not resolved back to it later. Concretely: log three sessions of
"Bench Press" swapped to "Incline Bench Press," then reset the swap back to default, and your
history now contains sessions under two different literal name strings for what was
conceptually "the same slot" in your program. Nothing in the data model or read path merges
these back together automatically.

**This is a known, accepted trade-off, not a bug** — the exercise-detail view (opened from
Stats → Training) carries an explicit amber banner when the exercise you're viewing is
currently swapped, naming the replacement and linking straight to its history, precisely
because the split is visible there.

**That same banner does not appear on the Stats → Training per-exercise chart/PR card** — the
one reached from the dropdown picker, which is a separate code path querying the exact same
underlying data by the exact same exact-match rule. A PR or chart that looks lower than
expected, or a session that seems to be "missing," right after a swap has no explanation
visible at that specific screen, even though the identical situation is explained one screen
over.

The **picker itself is swap-aware in one direction only**: its dropdown *label* always shows
the exercise's current display name, but the underlying value it queries by is always the
original program name — so the label you see and the data you get can silently refer to
different literal history entries whenever a swap is or has been active.

---

## HOW A SAVED SESSION FEEDS THE REST OF THE APP

- **Home**: the day-progress hero reads live in-progress state (`S.checked`) directly, not a
  saved session. The "Recent sessions" card and the streak/weekly-count card both read from
  `S.sessions` after save. The Personal Records card walks `S.sessions` once per render
  (excluding warmup sets) to find every all-time best, independent of the swap-fragmentation
  issue above only because it doesn't query by a fixed original name — it just take whatever
  name each set was actually logged under.
- **Progressive overload**: immediately after a save, the app compares the just-saved session
  against prior sessions of the *same exercise name, same day type* and may suggest a weight
  increase with a stated reason, in a modal shown right after save completes.
- **Stats → Training**: per-exercise history/PR/chart (subject to the swap caveat above), an
  8-week consistency grid, volume trend, and a muscle-balance view — all built from
  `S.sessions`.
- **Settings → Home Layout / day colours**: each day type has its own colour, used across the
  hero, the log screen, and anywhere a day name is shown.

---

## THINGS I NOTICED (flags, not asks)

- **The swap-fragmentation asymmetry is the headline one** — explained clearly in one place
  (exercise detail) and completely silent in another (the Stats chart/PR picker) for the exact
  same underlying condition.
- **The PO (progressive-overload) suggestion and the swap system don't coordinate.** A PO
  suggestion is keyed to the exercise name at save time, same as history — so a swap
  immediately before a session could plausibly cause a PO comparison against a near-empty or
  differently-named history, with no visible link to the fact that a swap is why.
- **No per-set RPE or per-set note** — only a whole-session effort rating and a whole-session
  note. If effort/fatigue tracking at finer granularity than "one word for the whole day" is
  wanted, that's a genuinely new field, not a display change.
- **A session-only exercise add is easy to lose track of** — nothing in the UI distinguishes it
  from a permanent add once it's on screen, until it silently doesn't reappear next time.

---

## SETTLED — DON'T RE-PROPOSE

1. **The training split is user-built and schedule-driven, not a fixed program.** Any
   redesign has to keep working for an arbitrary number of day types in an arbitrary repeating
   order — not assume a fixed 3- or 4-day rotation.
2. **The exercise library is derived from the split, not independently authored.** Proposals
   that assume a standalone, hand-curated master exercise list would be describing a different
   feature.
3. **Swaps are global, not per-session.** A "swap just for today" feature would be new scope,
   not a fix to existing behaviour — flag it as a feature proposal if you think it's worth it,
   don't assume it already works that way.
4. **The app's accent colour is not fixed** — it can follow live weather, the training day
   itself, or a static pick, and can be any hue at runtime. Per-day colours are a separate,
   existing, user-configurable system (see above) — don't conflate the two or assume a single
   fixed accent to design around.
5. **Dark mode is the default and what's actually used.** Any proposal needs to work in both
   themes, designed dark-first.

---

## OUTPUT WANTED

1. **A direct opinion on the swap-fragmentation asymmetry** — is the missing banner on the
   Stats chart/PR picker worth fixing (and if so, how), or is the current one-sided explanation
   good enough?
2. **Ranked proposals** for anything else in the exercise system's interconnectedness —
   swaps, the library, session-only adds, PO suggestions — most impactful first.
3. **Ranked design proposals** for the Log screen itself, phone-first.
4. **Anything you spot that's a function problem, not a design one** — a flow that takes two
   taps and should take one, a missing state, something confusing regardless of how it looks.
5. **A "don't bother" list** for anything considered but not worth doing.

Be direct. If something is genuinely bad, say so plainly rather than softening it.
