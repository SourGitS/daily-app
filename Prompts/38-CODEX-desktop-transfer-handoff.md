# Desktop handoff — Daily App Assistant

Use this file when opening Daily in Codex on Francois's desktop computer.

## What this project is

Daily is Francois Peters's personal phone-first lifestyle PWA. It combines Home, workout
logging, Stats, Journal, Kitchen, Budget, Accounts, Plans, habits and Daily + AI. The code is
vanilla HTML/CSS/JavaScript and is hosted directly from the repository's `main` branch on
GitHub Pages.

Repository: `https://github.com/SourGitS/daily-app`

The Codex project previously called **Daily App Assistant** on the laptop was a local Codex
project pointing at `C:\Users\FrancoisPeters\workout-tracker`. The desktop should create a new
local Codex project pointing at its own existing clone of this repository. Do not copy the
laptop's `.codex/worktrees` directory or its Git metadata.

## Canonical starting state

At handoff, the authoritative remote state is:

- Branch: `main`
- Commit: `4c0c2a5` — `Finish Journal and calibrate Stats overview`
- Required service-worker cache: `daily-v246`
- Laptop worktree: clean; no uncommitted app changes remained after the push

Before doing any work on the desktop, run:

```powershell
git status
git fetch origin
git pull --ff-only origin main
git log -1 --oneline
```

The final command should show commit `4c0c2a5` or a newer deliberate commit on `origin/main`.
If the desktop has uncommitted changes, do not overwrite, reset or discard them. Inspect them
and resolve ownership first.

## Required reading

Read `AGENTS.md` completely before taking any action. It is the safety-critical operating
reference. Read relevant parts of `CLAUDE.md` before layout or design work. Trust the current
code over stale prose, and use the functional specifications in `Prompts/` for the area being
changed.

The most important invariants are:

- Local storage is the on-device source of truth; Firebase mirrors it.
- Boot-time defaults and migrations must never receive a fresh timestamp that can outrank
  genuine cloud data.
- New sync stores must participate in the existing canonical sync registration/restore path.
- Budget transactions override manual variable-category amounts.
- Historical records must not be reinterpreted through today's settings.
- User-built training splits and literal performed-exercise history remain authoritative.
- Any shipped cached-asset change requires a real service-worker cache bump.
- Pushing `main` immediately deploys the live app. Never commit, push or deploy unless Francois
  explicitly asks.

## Recently completed work

### Journal

- Notes was rebuilt as Journal while persisted `notes` navigation/layout identifiers were
  deliberately retained for compatibility.
- Journal has a permanent Today composer, Open Loops, a chronological entry timeline, search,
  date navigation, Trash/restore and one editing surface.
- Existing legacy notes migrate conservatively to Open Loops; no content is guessed into the
  diary timeline.
- Journal data uses the merge-safe, tombstone-aware sync model already documented in code.
- Journal can open date-scoped Daily facts and return from source views without exposing
  sensitive prose by default.

### Stats

- Stats now has six ordered tabs: Overview, Review, Training, Body, Nutrition and Finance.
- Overview provides compact cross-domain orientation; Review is limited to a few ranked,
  supportable conclusions.
- Training distinguishes trained days from sessions and separates comparable positive-load
  work from timed, reps-only, assisted/negative and mixed-unit movements.
- Body leads with measured weight and withholds noisy or unsupported pace claims.
- Nutrition is honest about calorie coverage and the absence of historical macro persistence.
- Finance uses canonical transaction precedence and saved historical week/category semantics.
- Evidence drill-downs connect Stats to exact workout days, exercises, Budget weeks,
  transactions and Journal context, with source-return navigation.
- The completed calibration prompt is `Prompts/37-OPUS-stats-calibration-and-overview.md`.

## Verification baseline

The last completed implementation was checked at phone portrait, phone landscape and desktop,
in light and dark themes with an arbitrary custom accent. JavaScript syntax checks and
`git diff --check` passed. Finance precedence, historical labels, warm-up PR exclusion,
incomparable training metrics, weight-noise gating and source-return paths were exercised with
populated fixtures.

There is no automated test suite or staging environment. Follow the manual release checklist
in `AGENTS.md` before every requested push.

## First prompt on the desktop

Paste this into the new desktop Codex project:

> Read `AGENTS.md` completely first. Then verify that this desktop clone is clean and matches
> the latest `origin/main`; do not discard or overwrite any local work. Read
> `Prompts/38-CODEX-desktop-transfer-handoff.md` and inspect recent Git history to establish
> the current state. Continue working on Daily from the desktop repository. Preserve all sync,
> historical-data, canonical-helper and service-worker-cache invariants. Do not commit, push or
> deploy unless Francois explicitly asks after reviewing the result.

## What does not transfer through Git

The repository transfers code, `AGENTS.md`, design history, prompts and this handoff. It does
not transfer the laptop's local Codex saved-project entry, local task execution state, browser
sessions, authentication tokens or machine-specific `.codex` configuration. Recreate the
desktop Codex project by selecting the desktop repository folder and sign into the same
ChatGPT account. Keep machine-specific secrets and local settings out of Git.
