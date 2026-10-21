# Prompt 49 — Implement the approved Daily identity and finish the data-safety work

## Outcome

Implement this in `C:\Users\FrancoisPeters\workout-tracker`.

Daily has previously lost existing training data when a fresh window/device signed in and
uploaded defaults over the real cloud data. Preventing a repeat is the highest priority.
Review and finish the existing local sync fixes, then integrate the approved logo PNGs.
Work through implementation and verification; do not stop at a plan or design critique.

Do not publish or push to `main` as part of this prompt. Prepare a tested, reviewable result
and report any remaining release blockers. A push to `main` deploys directly to GitHub Pages.

## 1. Codebase context and existing work

Read these before editing:

1. `AGENTS.md`, including its local sync-hardening section and data-preservation rules.
2. The relevant sync, boot, onboarding, restore, typography and logo sections of `CLAUDE.md`.
3. `tests/SYNC-SAFETY-REVIEW.md`.
4. `tests/sync-safety.test.cjs`, `tests/sync-browser-fixture.js`, and
   `tests/build-sync-browser.cjs`.
5. `assets/brand/refined/README.md` and `assets/brand/refined/preview.png`.
6. The actual current diff and call sites in `js/app.js`, `js/nutrition.js`,
   `index.html`, CSS, `manifest.json` and `service-worker.js`.

This is vanilla HTML/CSS/JavaScript with no build step or application package manager.
`js/nutrition.js` loads before the global-scope `js/app.js`. Preserve that structure and the
existing stylesheet order. UI typography is Manrope; numeric/wordmark typography elsewhere
uses Space Grotesk. The supplied logo is custom artwork, not text to re-typeset.

Firebase is Realtime Database, using compat SDKs, with data under `users/<uid>`.
localStorage is the on-device store. Blob and keyed-collection sync both exist.

### Uncommitted work is intentional

The prior agent has already edited `js/app.js`, `service-worker.js` and `AGENTS.md`, and
created the `tests/` and `assets/brand/refined/` material. Preserve and review that work.
Do not reset it, overwrite it with HEAD, or implement a second parallel sync system.
Unrelated files under `Prompts/` and `.claude/settings.local.json` must remain intact.

At handoff, the prepared service-worker cache name is `daily-v308`; verify the actual file.
There has been no deployment and no test against Francois's real signed-in cloud account.

The prior agent reported 17 passing isolated regression tests and a complete-app browser
fixture that restored synthetic existing workout data with no writes to those workout
stores. Those are useful evidence, not proof that every sync path or real Firebase scenario
is correct. Independently review and rerun them.

## 2. Data safety: independently review and finish the implementation

### Existing changes to audit

- `syncBlobPush`, `syncBlobCommit`, `lsSave`, `lsSaveTS`, `stampFor` and
  `syncBlobListenTS`: boot uploads suppressed; timestamp 0 retained; server-side transaction
  comparison; equal content adopts cloud timestamp; `_syncApplying` guards callback writes.
- `wtReadRecords`, `wtRecordTime`, `wtRecordKey`, `wtMergeRecords`, `wtPushRecords`,
  `wtAttachRecords`, `wtPersistRecords`, `persist` and `persistWeights`: per-record sync,
  record timestamps and deletion markers instead of wholesale history replacement.
- All session/weight callers: session creation, effort edits, exercise renaming, weight
  creation/update, deletion, initial sync and legacy weight migration.
- The new `storage` listener and how a second window updates its in-memory state.
- `_cloudWorkoutReady`, initial-read completion, onboarding finish, and restore messages.
- Backup restore's new record timestamp handling and the existing authoritative cloud push.

Correct defects in these changes rather than assuming the prior agent finished them.
In particular, check failure handling, asynchronous ordering and compatibility with old data.

### Required invariants

1. Merely opening/reloading Daily, loading a hash route, rendering a view, normalising data,
   or signing in must not make untouched defaults appear to be genuine newer edits.
2. Never turn a missing/zero timestamp into `Date.now()` during boot or sync reconciliation.
   Boot migrations/defaults respect `_bootPhase`. Read-time migrations after cloud restore
   also must not manufacture newer edits or echo unsafe writes.
3. An empty fresh device must adopt an existing saved program, exercise library, plans,
   workout history and weights without replacing them with empty/default local state.
4. Saving one workout or weight entry from an older window must not remove unrelated records
   created elsewhere. Compare against current server data at commit time, not only an earlier
   snapshot. Do not reintroduce whole-collection ordinary `.set()` writes.
5. Genuine offline edits must survive reconnect, while stale same-record copies cannot undo
   newer edits or resurrect deletions. Verify tie rules and delete markers explicitly.
6. Deletion markers remain in backups and the existing stores, but must never render as
   workouts/weights or contaminate PRs, statistics, charts, AI context, exports or counts.
   Audit raw-storage readers as well as `S.sessions` / `S.weights` readers.
7. Failed local or cloud writes must not silently clear the workout, delete a migration source,
   discard the only good copy, or report success. Check asynchronous errors and retry paths.
8. Authentication success is not proof that cloud restore has completed. Slow/failed reads
   must not enable onboarding to overwrite a still-loading existing account. A timeout must
   not be interpreted as proof that the account has no saved data.
9. A user-confirmed backup restore remains authoritative. Review record timestamps, tombstones,
   pending transactions, listeners, empty collections, old backup formats, and retry behavior.
   Do not perform a real restore on Francois's account for testing.
10. Do not add a sync-relevant localStorage key without integrating its sync and backup/restore
    registration correctly. Prefer the existing stores. Do not maintain a second hardcoded
    list of blob paths; use `SYNC_BLOB_REG`.

### Do not ignore the remaining paths

Trace writes that can run during initial load, auth callbacks, re-render, reconnect, and
cross-window updates, especially:

- Budget-week seeding and convergence, savings log and balance writes.
- Custom nutrition and home-layout reconciliation that bypasses the generic blob helper.
- Legacy profile, personal-info, habits and other one-shot reconcile flows.
- Listener cleanup and callbacks after sign-out/account changes; captured account references
  versus mutable globals must not cross account boundaries.
- `wt_setdata` (unfinished workout state): verify opening another window does not clear it.
  Determine how concurrent editing is handled and report any remaining last-save-wins limit.
- Device clock skew and mixed old/new app versions.

Fix additional confirmed overwrite paths relevant to opening a window/signing in. Keep the
work focused on data preservation; do not redesign unrelated features or data models.
If a broader architectural change is necessary, finish all safe independent work and explain
the exact remaining problem and proposed change. Do not claim all data is safe while known
reachable overwrite paths remain unaddressed.

Client-side fixes cannot guarantee protection from an older authorized app version still
issuing whole-store writes. Explain the rollout/update limitation honestly. Do not weaken
Firebase security rules or introduce unreviewed rules changes as a shortcut.

## 3. Integrate the approved logo assets

The visual direction is approved. Do not generate more concepts, replace the font, rebuild
the mark, or return to the earlier framed badge.

### Approved identity

- Heavy forward-slanted uppercase DAILY wordmark and joined DA app monogram.
- Four-point star integrated into the D's silhouette/negative space.
- Borderless: no old rounded rectangular inner frame.
- The icon uses the larger star treatment already present in the supplied artwork.
- No extra sparkle, shadow, glow, bevel, metallic effect or background panel on the wordmark.

### Files already available

Under `assets/brand/refined/`:

- `daily-wordmark-mask.png` — real alpha transparency, 1877 × 412.
- `daily-wordmark-light.png` — black on transparency, identical dimensions/geometry.
- `daily-wordmark-dark.png` — white on transparency, identical dimensions/geometry.
- `daily-app-icon-1024.png` — static white DA/star on charcoal.
- `daily-app-icon-512.png` — 512 × 512.
- `daily-app-icon-192.png` — 192 × 192.
- `daily-app-icon-180.png` — 180 × 180 Apple touch icon.
- `daily-brand.css` — proposed CSS mask treatment, not yet loaded by the app.
- `preview.png` — a visual check, not a production logo asset.

Do not use `daily-wordmark-source-opaque.png`: its checkerboard is painted into the image.
Do not use a concept-board screenshot, the ZIP, the original generated master or the export
script as a runtime asset. The finished transparent PNGs and sized icons are the deliverables.

### In-app logo follows the existing system colour

Use the PNG alpha mask with standard and `-webkit-` CSS mask support, or an equally robust
implementation preserving exact artwork. Use Daily's existing `--accent-text` (or its
canonical equivalent after code inspection), which is adjusted for the current theme.
Do not blindly apply dark `--accent` as foreground ink on a dark background.

The logo follows the accent the user actually selected: preset, custom, training-day or
weather-driven appearance. It changes when that existing accent changes. Do not build a
second weather palette, geolocation request, timer, setting, persisted key or sync path.
Do not infer colours from the demonstration blue in `preview.png`.

Provide accessible naming once per visible logo and a reliable black/white image fallback
when masking is unavailable. Keep the transparent background and natural aspect ratio.

Find every existing logo placement and generated-markup caller, including:

- Mobile/header title.
- Desktop sidebar.
- Mobile navigation menu.
- Onboarding/welcome.
- `applyLogoDayColour()` and its theme/accent/pageshow/boot callers.

Adapt existing logo sizing selectors that currently target `.wordmark-img`. Preserve layout
and navigation behavior; ensure a replacement span cannot collapse or stretch. Start from the
existing 16/22/28 px placement sizes where applicable, then make a minimal measured adjustment
if needed for legibility. Verify the star and letters on an actual small rendered header.

Review `applyLogoDayColour()` rather than leaving an old filter/tint effect stacked on the
new mask. If CSS replaces its purpose, remove obsolete code and callers safely. Retain any
unrelated behavior that function genuinely owns.

### App icon stays static

Use the white-on-charcoal DA/star icon for the manifest, favicon, Apple touch icon and any
other existing app-icon consumers (including notification icons if present).
Do not create weather variants or dynamically rewrite installed-app icon URLs.

Use correct actual dimensions in the manifest. Keep safe padding for maskable icons and let
the platform provide the external corner shape. Check the maskable safe zone.
Do not promise that already-installed iOS/Android icons will refresh immediately; report any
reinstallation/platform-cache limitation separately from in-app logo updates.

Choose one canonical runtime location for assets, update all consumers, and include required
runtime images/CSS in the service-worker precache. Do not include source/export/test files in
the precache. Preserve existing stylesheet order; any new stylesheet is appended.

## 4. Verification workflow

Start with the existing tests, then add meaningful regression coverage for additional defects.

```text
node --test tests/sync-safety.test.cjs
node --check js/app.js
node --check js/nutrition.js
node --check service-worker.js
git diff --check
```

For the isolated complete-app fixture:

```text
node tests/build-sync-browser.cjs
```

Serve the repo over HTTP and open `/tests/sync-browser.html`. The fixture replaces Firebase
and localStorage with fabricated in-memory data. It must never use Francois's live account.
Check the visible assertions and browser console. Do not ship the generated test HTML as
an application asset.

The existing transaction mock is not a full Firebase implementation. Where available, verify
with the real SDK against a local Firebase emulator/disposable test account, including delayed
initial reads, offline/reconnect, rejected writes and two clients. Keep test dependencies out
of the runtime app; do not add a bundler or build step.

Before any real-account verification, preserve a full backup from the trusted device and
confirm the test approach is non-destructive. Never clear that device's localStorage, use it
as a disposable test profile, or restore test data into it. Use a separate fresh profile and
an allowed auth origin. Keep real-account checks to comparison/restoration observation;
perform intentional mutations only on designated disposable test data.

If authentication, an emulator or real-account access is unavailable, complete the code,
isolated tests, logo integration and documentation. Report the exact verification gap as a
release blocker; do not invent a pass or request credentials in chat.

## 5. Numbered acceptance checklist

### Data safety

1. Existing saved workouts, sets, weights, training split, exercises and plans are unchanged
   when an empty fresh profile restores synthetic existing cloud data.
2. Opening a second window and reloading it does not upload blank/default replacements.
3. An older window saving a new session preserves sessions added or edited elsewhere.
4. Offline additions and edits converge on reconnect without losing unrelated records.
5. Deliberate deletions do not reappear after a stale device reconnects; tombstones remain
   absent from visible history, statistics, exports and AI context.
6. Weight records survive the equivalent fresh-profile, multi-window and reconnect checks.
7. Legacy weight sources survive failed uploads and are removed only after successful transfer.
8. Startup/read-time normalisation retains the correct timestamps and does not echo fresh writes.
9. Equal-content sync adopts the authoritative timestamp without unnecessary data writes.
10. Slow/failed initial cloud reads cannot lead onboarding to overwrite existing saved data.
11. Failed local/cloud saves preserve the usable local workout and show an honest status.
12. Backup restore remains authoritative in isolated/disposable tests, including old backups,
    timestamps, empty lists and deletion markers.
13. In-progress workout behavior, auth cleanup/account switching and mixed-version limits are
    tested or specifically documented; no unsupported blanket safety claim is made.
14. Additional initial-load sync paths identified above have been reviewed, and any remaining
    overwrite risk is clearly listed as unresolved.

### Logos and app icon

15. Every existing in-app logo placement uses the approved borderless DAILY/star artwork.
16. The logo looks correct in light and dark mode with no checkerboard or opaque rectangle.
17. It follows existing preset, custom, training-day and weather accents without adding data
    stores or a second colour/weather system.
18. Dark/night and pale/custom accents remain visible against the current background.
19. Mobile portrait, landscape and desktop headers/sidebar/menu/onboarding remain correctly
    sized; the small star treatment is reviewed at actual rendered size.
20. The static white-on-charcoal DA/star is used consistently for app-icon consumers, with
    correct dimensions, platform mask padding and accessible logo naming.
21. The app starts without JavaScript errors or missing local assets. Mask fallback works.
22. Service-worker cache and asset list include the final runtime changes. Preserve the prepared
    v308 bump if it has never shipped; use a newer name if the repository has since advanced.
    Update its version comment to cover both sync safety and the logo integration.

## 6. Handoff

Update `AGENTS.md` and the relevant parts of `CLAUDE.md` / the safety review to match the final
code and actual verification status. Preserve the distinction between isolated tests and
real-account verification.

Report concisely:

- What was corrected in the existing sync patch and what additional risks were fixed.
- Which logo/icon consumers changed, with light/dark and mobile/desktop screenshots.
- Tests actually run and their results.
- Any remaining data-safety, platform-update or live-verification blockers.
- The final prepared cache version and confirmation that nothing was deployed.

Do not push to `main`, deploy Firebase rules, clear real data, or perform a live restore.
Leave the result ready for Francois to review and approve for deployment.
