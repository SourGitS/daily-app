# Daily data-safety review — 2026-09-07

Status: local fixes and isolated verification complete; **not deployed, and not verified against
a real signed-in account**. This is not a blanket certification of every data store or of older
app versions still running on other devices.

Two passes are recorded here. Pass 1 covered workout history, weights, generic timestamped blobs
and setup timing. Pass 2 audited that work and continued into the write paths it had explicitly
left out.

## Pass 1 — confirmed risks addressed

1. `syncBlobPush` used `parsedTimestamp || Date.now()`, making timestamp 0 look like a fresh
   edit. Boot writers could call the upload path directly, bypassing the intended boot-age
   protection. Boot/cloud-apply writes now stay local, and uploads never invent an age.
2. Blob reconciliation checked an earlier snapshot before calling `.set()`. A new server edit
   between those operations could be overwritten. Uploads now compare inside a transaction.
3. Session saves, session sign-in convergence, weight saves and initial weight seeding replaced
   entire cloud collections. An older window could erase records created elsewhere. Writes now
   target individual children, and the transaction preserves the newer record (cloud wins ties).
4. Session union previously resurrected deletions and always preferred stale local same-ID
   records. Deletion markers and per-record timestamps now survive offline/reconnect. Markers
   live in the existing stores and are filtered out of UI readers, not discarded from backups.
5. Legacy weight sources were removed before replacement writes had been acknowledged. Cleanup
   now waits for successful upload. Previously deleted canonical dates are not reimported.
6. Onboarding could finish after authentication but before saved training data arrived; a
   timeout even described a slow account as empty. Completion now waits for the initial reads.
7. Explicit backup restore now also refreshes record-level timestamps so the new conflict rule
   does not undo the user's authoritative restore.

## Pass 2 — defects found in that work, and paths it had not reached

1. **The savings log still replaced its whole cloud node on every save.** `pushSavings()` and
   the sign-in convergence both wrote `savingsLog` as one object — the same shape as the
   session bug, so a window holding a stale copy erased any balance entry added elsewhere since.
   Both now write one child per date through `wtPushRecords`, newest `t` wins, and the sign-in
   path pushes only the entries the cloud is actually missing or older on.
2. **Budget weeks were written as one node.** `syncBudgetDataToFirebase()` with no key, and the
   listener's convergence branch, both called `.set(budgetData)`. A week created on another
   device between the read and the write was erased. `mergeBudgetWeeks` now reports WHICH weeks
   the cloud is behind on, and `budPushWeeks` writes those weeks as separate children, each
   guarded by an `updatedAt` comparison inside the transaction.
3. **`budgetConfig` was written unconditionally** from two sign-in branches and from
   `saveBudgetConfig`. It is one object with its own `updatedAt`, so `budPushConfig` now
   compares that age at commit time. `saveBudgetConfig` also stamped `Date.now()`
   unconditionally, which meant a boot migration or a cloud-apply re-save could manufacture a
   newer edit; it now respects `_bootPhase` / `_syncApplying` like `stampFor()`.
4. **Every `if(!snap.exists()) ref.set(...)` seed was a race** (personal info, habits,
   `fbReconcile`, budget data, budget config, home layout). The check read a value that could
   change before the write landed. `fbSeedIfEmpty()` re-checks emptiness inside the transaction.
5. **Cloud-apply callbacks could echo.** Applying a snapshot re-renders, and a render can reach
   a save function. `syncApply()` raises `_syncApplying` around every apply block (personal
   info, savings, habits, budget data, budget config, `fbReconcile`, home layout, nutrition
   log), so anything written there keeps the age it already had. The three untimestamped config
   pushes (`profile`, `personalInfo`, `budgetDefaults`) are suppressed during it as well.
6. **Listeners outlived their account.** `piRef`, `savRef`, `habitsRef`, `budDataRef` and the
   category refs were declared with `let` INSIDE the `onAuthStateChanged` callback, so the
   sign-out invocation saw a fresh set of undefined variables and detached nothing — the
   previous account's listeners kept writing that account's data into this device's
   localStorage after a switch. Every listener is now registered with `syncTrack()` and
   released by `syncDetachAll()` at the TOP of each auth change.
7. **The readiness gate could deadlock.** `_cloudWorkoutReady` was set only when the initial
   reads resolved; if they failed (offline), the onboarding Finish button was unusable forever.
   A failure is still not treated as evidence that the account is empty — `_cloudReadFailed`
   now turns the gate from "wait" into an explicit confirmation, stated plainly, so the person
   decides. The gate additionally waits for the workout listeners to have APPLIED a snapshot
   (`_cloudApplied`), not merely for a parallel `once()` to resolve.
8. **The nutrition log's convergence was a whole-node `.set()`** of a merge computed from an
   earlier snapshot. It is now a transaction that re-merges against the value at commit time.

## Verification performed

- `node --test tests/sync-safety.test.cjs tests/sync-extra.test.cjs`: **32 passing tests**
  executing the real app helpers, extracted from `js/app.js` into a VM (`tests/harness.cjs`)
  against a cloud mock whose unconditional `.set()` throws. Covers boot defaults, retained
  timestamps, stale transactions, legacy raw blobs, identical content with newer timestamps,
  normalisation callbacks, empty fresh profiles, stale windows, concurrent saves, shared
  localStorage, offline deletions, weight conflicts, storage failure, onboarding readiness and
  its failure branch, authoritative restore, per-date savings writes, per-week budget writes,
  budget-config ageing, boot stamping, seed races, listener release, and cloud-apply echo.
- Complete app loaded in a browser with synthetic Firebase and empty in-memory localStorage
  (`tests/sync-browser.html`). Existing program, two sessions, exercise library, saved plan and
  weight record remained byte-identical in the simulated cloud; sessions, weight and program
  restored; `writesToWorkoutStores` empty; no errors. Re-run after the logo integration.
- Ordinary local app boot, Log overview, light/dark themes and the logo placements opened with
  no console errors.
- `node --check` on `js/app.js`, `js/nutrition.js`, `service-worker.js`; `git diff --check`.
  Firebase security rules unchanged.

The transaction mock exercises re-checking a server value after an initial empty cache, but
does not replace testing the real Firebase SDK, authorization rules, network and auth timing.
Firebase documents transaction retries and an initially null client cache at
https://firebase.google.com/docs/database/web/read-and-write#save_data_as_transactions .

## Required before release

1. Preserve a full backup from the trusted device. Do not clear that device's local data.
2. Use a separate fresh profile for the candidate build and sign in to the same account with
   existing data. Confirm its allowed auth origin first; do not weaken database rules.
3. Compare saved program, exercise library, plan names, session count, selected session sets,
   and weight history with the trusted device. Confirm the trusted device remains unchanged.
4. Check two windows, a reload and a delayed/offline reconnect. Test deliberate edits/deletes
   only on designated disposable records, keeping the backup and trusted device intact.
5. Verify explicit restore in a disposable account/isolated fixture before trying it on real
   data. Refresh or close old app versions before testing mixed-device behavior.

No real account was used, no user data was cleared, and no push/deployment was performed.

## Boundaries still relevant

- **Older builds are the biggest remaining exposure.** Any device still running a build from
  before this change can issue whole-store writes and undo everything above. A client-side fix
  cannot prevent that under the current rules; the practical mitigation is to open Daily on
  every device once after release so each one takes the new service worker. Until then, treat a
  device that has not been refreshed as capable of overwriting.
- Untimestamped single-object stores (`profile`, `personalInfo`, `budgetDefaults`, `weightGoal`,
  `subscriptions`, `habits`) remain last-writer-wins BETWEEN devices. Boot and cloud-apply
  writes can no longer masquerade as edits, and seeds can no longer lose a race, so an untouched
  device cannot clobber a real edit — but two genuine edits to the same object still resolve by
  arrival order, with no per-field merge. Giving them timestamped envelopes is a data-model
  change and was deliberately left out of a data-preservation pass.
- In-progress sets (`wt_setdata`) are device-local and never synced. `clearSetData()` has
  exactly one caller — immediately after a session saves — so opening or reloading a second
  window neither clears nor uploads it. Two windows editing the SAME unfinished workout on one
  device still resolve last-save-wins through shared localStorage; this is unfinished state, not
  workout history, and it is not merged.
- Multi-account switching now detaches listeners, but data already written into localStorage by
  a previous account is not partitioned per account; signing into a second account on one
  device merges by timestamp like any other device would.
- Clock skew is unresolved. Timestamp conflict resolution assumes reasonably correct device
  clocks, and same-record concurrent edits use newer-record-wins rather than field-by-field
  merging.
- Not comprehensively hardened, and not certified by these tests: journal rekeying (a one-time
  legacy array-to-keyed conversion that writes a superset), weekly-review week writes (already
  per child), and any store added after this review.

## Reproduce the browser fixture

Run `node tests/build-sync-browser.cjs`, serve the repository statically, and visit
`/tests/sync-browser.html`. The fixture uses only fabricated data, captures errors and shows
its assertions in a visible report. The generated HTML is not an application asset and can be
removed after the check.
