# PROMPT 30 — Overhaul “AI Review” into a Daily ↔ AI Bridge

## CODEBASE CONTEXT

This is **Daily**, Francois Peters’s personal lifestyle PWA. It is vanilla HTML/CSS/JS with
no build step or framework:

- `index.html`
- six CSS files loaded in a fixed cascade order
- `js/app.js` containing the application logic
- Firebase Realtime Database plus localStorage
- GitHub Pages serves `main` directly
- the service worker is cache-first

Read `AGENTS.md` completely before editing. Read the relevant sections of `CLAUDE.md`, then
inspect the current code rather than trusting the line numbers in this prompt. This repository
has recently received a transaction ledger, recurring-charge/subscription management, frozen
historical fixed rates, payment-account attribution, a revised Budget hero, and redesigned
Month/Year views. Preserve those systems.

There may be unrelated uncommitted landscape-layout work in `css/layout.css`, `index.html`,
`js/app.js`, and `manifest.json`. Do not discard or overwrite it. If that work is still in
progress, finish or commit it separately before beginning this feature so the two changes do
not become one inseparable commit.

This prompt does **not** add an OpenAI or Anthropic API call. It builds a provider-neutral
bridge that works immediately by copy/paste with ChatGPT, Claude, or another assistant, and
can later become the internal contract for one shared MCP server.

## THE PROBLEM

Settings → Export & Restore currently contains an **AI review** card. Its implementation is
primarily `buildAIReviewMarkdown(months)`, `copyAIReport()` and `exportAIReport()`.

Despite its label, this is not a general AI export. It is one very large, hard-coded Markdown
prompt that:

- always prioritises Budget;
- always includes Accounts and personal information when present;
- offers only a 1/3/6/12-month selector;
- combines factual data, calculations, privacy decisions, formatting, and assistant
  instructions in one function;
- has no structured/versioned format;
- provides no controlled path for changes to come back into Daily.

More importantly, it has become **factually inconsistent with the current app**:

1. Its per-category Variable analysis reads `d['var_'+c.id]` directly. The current Budget
   model gives transactions precedence through `varCatAmount()` / `weekVarTotal()`. The AI
   report can therefore show a correct weekly Variable total but incorrect category totals.
2. Its fixed-category reader falls back to `c.default`. Current fixed spending uses billing
   cycles, `catChargeableBudget()`, `catBudget()`, and frozen per-week `fixRates`. The report can
   show a correct Total fixed figure beside incorrect individual recurring categories.
3. The old report intentionally removed its Subscriptions section when subscriptions became
   fixed categories. That now omits the fields which make the new recurring-charge system
   useful: billed amount, cycle, status, next due date, price history, upcoming charges, and
   payment account where available.
4. Transactions are reduced to weekly totals. Merchant, date, note, category and payment
   account are absent, even though the embedded prompt asks where money actually went.
5. Weekly Budget notes are not included, so unusual weeks lose their explanation.
6. Personal information and account balances cannot be excluded.
7. `Date#setMonth()` in `aiRangeStart()` has end-of-month rollover behaviour, so “last N
   months” can have a surprising boundary.

Do not merely patch two readers and keep extending the same 280-line Markdown function. Fix
the immediate inaccuracies, then replace the architecture.

## PRODUCT PRINCIPLE

**Daily is the source of truth. ChatGPT and Claude are interfaces into it.**

The new feature has three distinct concepts:

1. **Context export** — facts Daily knows, selected by the user.
2. **Review request** — optional instructions describing what the user wants an AI to do.
3. **AI Inbox** — structured, validated, user-approved actions proposed by an AI.

Do not make ChatGPT and Claude talk to one another, do not store their chat histories, and do
not add provider-specific branches. Both receive and return the same Daily schemas.

---

## PART 1 — CORRECT THE CURRENT EXPORT BEFORE REPLACING IT

Before restructuring, establish canonical helpers for export calculations and verify them
against the Budget UI:

- Variable category actuals must use `varCatAmount(weekRecord, weekKey, catId)`.
- Weekly Variable totals must use `weekVarTotal(weekRecord, weekKey)`.
- Fixed category actuals must obey the same precedence as `weekFixedTotal()`:
  explicit `fix_<id>` → frozen `fixRates[id]` → current chargeable budget only for an
  unfrozen legacy/current week.
- Paused/cancelled recurring charges must not be presented as current commitments.
- Historical fixed values must remain frozen. Changing a subscription today must never rewrite
  the context exported for an old week.
- Monthly grouping by the Monday of a week is acceptable, but state this explicitly in the
  exported metadata rather than silently implying transaction-month accounting.

Write these as reusable calculation helpers consumed by the new context builder. Do not
duplicate a fourth interpretation of Budget data.

## PART 2 — BUILD ONE CANONICAL, VERSIONED CONTEXT OBJECT

Create a pure function along the lines of:

```js
buildDailyContext(options)
```

It must return plain serialisable data and must not read form controls directly, mutate stores,
write timestamps, trigger sync, or format Markdown.

Use this top-level contract:

```json
{
  "schema": "daily-context",
  "version": 1,
  "generatedAt": "ISO timestamp",
  "timezone": "Australia/Sydney",
  "currency": "AUD",
  "range": {
    "kind": "last_4_weeks",
    "from": "YYYY-MM-DD",
    "to": "YYYY-MM-DD",
    "weekGrouping": "week attributed to month containing its Monday"
  },
  "scopes": ["budget", "transactions", "subscriptions"],
  "request": {
    "preset": "spending_review",
    "instructions": ""
  },
  "data": {}
}
```

Use `Intl.DateTimeFormat().resolvedOptions().timeZone` when available, falling back to the
app’s known local timezone behaviour. Currency can remain AUD for now, but it belongs in
metadata rather than prose scattered through the report.

### Supported scopes

Implement these independently selectable scopes:

- `budget`
- `transactions`
- `subscriptions`
- `accounts`
- `workouts`
- `body`
- `habits`
- `kitchen`
- `notes`

Do not include a scope when it is not selected. Do not fill an unselected scope with an empty
object. The exported `scopes` list and `data` keys must agree.

### Budget scope

Include:

- current weekly targets;
- each relevant week’s income, actual Variable spend, committed/accrued Fixed amount, saved,
  available/leftover, spending goal, finalised/draft state, and weekly note;
- per-category totals derived through the canonical transaction/fixed readers;
- monthly rollups with the Monday-grouping rule identified;
- planned versus actual versus committed labelled clearly.

Do not use the word **spent** for prorated recurring commitments. In the schema distinguish:

- `actualSpent`
- `committed`
- `saved`
- `available`

### Transactions scope

Include individual transactions inside the selected date range:

```json
{
  "id": "txn_...",
  "date": "YYYY-MM-DD",
  "merchant": "Woolworths",
  "categoryId": "groceries",
  "categoryName": "Groceries",
  "amount": 18.5,
  "paymentAccountId": "optional",
  "paymentAccountName": "optional",
  "note": "optional"
}
```

Never export an orphaned ID without also resolving the human-readable name when the referenced
record still exists.

### Subscriptions scope

Read the live recurring fixed categories, **not** retired `daily_subscriptions`. Include:

- stable category/subscription ID;
- clean display name;
- status (`active`, `trial`, `paused`, `cancelled`);
- billed amount and billing cycle;
- derived weekly commitment;
- next billing date and days until due when known;
- website when present;
- price history;
- upcoming charge state;
- payment account if the live model supports it.

Keep cancelled and paused subscriptions in history when selected, but label them. Do not count
them in active commitment totals.

### Accounts scope

Include current account type, balance, category, saver status, and balance history within the
selected range. Do not include Firebase identifiers or authentication information.

### Workouts/body/habits scopes

Preserve the useful existing summaries, but make the source records defensive against missing
legacy fields. Workouts should not crash the entire export because one old session lacks an
`exercises` or `sets` array.

### Kitchen scope

Include a compact summary by default: recipe names/categories/tags, shopping items, and pantry
items. Do not automatically export every recipe’s full ingredients and steps unless the user
explicitly selects **Full recipe contents** as a sub-option.

### Notes scope

Treat this as sensitive and default it OFF. Include titles, dates, and body only when selected.

## PART 3 — RENDERERS, NOT ANOTHER SECOND SOURCE OF TRUTH

Create two renderers consuming the exact same context object:

```js
renderDailyContextMarkdown(context)
renderDailyContextJSON(context)
```

The JSON renderer may simply pretty-print the object. The Markdown renderer should be readable
when pasted into an ordinary ChatGPT or Claude conversation, but must not independently
recalculate financial totals.

At the top of Markdown, explain briefly:

- that the content is data supplied by the user from Daily;
- the date range, timezone and currency;
- which scopes are present;
- the selected request/preset;
- that missing data must not be guessed.

Keep Markdown materially shorter than the current report. Prefer compact tables and omit empty
sections. Do not repeat the same number in narrative prose and multiple tables unless the
second appearance adds meaning.

## PART 4 — MAKE “DAILY + AI” ITS OWN NAVIGATION DESTINATION

This feature is too important and too large to remain buried in Settings → Export & Restore.
Create a dedicated **Daily + AI** destination with its own full screen/view.

### Navigation placement

- Add **Daily + AI** to the permanent desktop sidebar.
- Add **Daily + AI** to the mobile hamburger/side menu under Navigate.
- Do **not** add a fifth item to the phone’s four-item bottom navigation. Home, Budget, Log and
  Kitchen remain the primary thumb destinations.
- Use one consistent icon from the app’s existing SVG/icon language — not an OS emoji.
- Place it with the secondary personal tools (Accounts, Plans, Notes), not inside a Settings
  subsection. A reasonable order is Accounts → Plans → Notes → Daily + AI, but inspect the
  current navigation and choose the position that reads most naturally without disrupting the
  four main areas.
- Add a small shortcut row in Settings → Export & Restore where the old AI review card lived:
  title **Daily + AI**, one-sentence explanation, and **Open Daily + AI →**. Do not duplicate
  the full builder inside Settings.

Follow the established peer-destination behaviour used by Accounts/Exercise Library/Plans/Notes:

- opening it closes the mobile menu;
- the correct desktop sidebar item becomes active;
- choosing any other destination closes Daily + AI cleanly;
- on mobile it has a visible Back control;
- on desktop the redundant Back control is hidden if that is the convention used by the other
  sidebar peers;
- opening/closing it must not reset partially entered request text, scope selection, pasted
  Inbox JSON, or validation results unless the user deliberately clears them;
- browser Back/forward and swipe behaviour must not become inconsistent with the existing app.

Use a dedicated view ID and clearly named functions such as `openAIHub()` / `closeAIHub()` or
the closest existing navigation convention. Do not overload `view-settings-detail` with this
large feature.

### Responsive layout

Use the app’s established card, input, segmented-control, modal and button styling. Design
dark-first and respect the runtime accent.

- **Phone portrait:** one stacked flow — purpose/range → data selection → context preview and
  output actions → AI Inbox. Important controls must remain comfortably tappable.
- **Phone landscape:** participate in the real landscape layout if that work has shipped; no
  rotate placeholder and no clipped fixed-height panel.
- **Desktop:** use the available width. Prefer a two-column working layout with Context Builder
  and scope controls on the left, and sticky Preview / AI Inbox workspace on the right. Do not
  stretch text fields into unreadably wide full-screen lines.
- Preview and Inbox may each collapse on phone, but their state and entered text must survive
  navigation away and back during the current app session.

### A. Purpose preset

Offer:

- General context
- Spending review
- Subscription audit
- Workout review
- Meal planning
- Weekly review
- Custom

Presets set sensible scope defaults and provide editable request instructions. They must not
lock the user out of changing scopes.

Suggested defaults:

- Spending review: Budget + Transactions + Subscriptions
- Subscription audit: Subscriptions + Transactions
- Workout review: Workouts + Body
- Meal planning: Kitchen; full recipe contents off
- Weekly review: Budget + Transactions + Workouts + Habits
- General context: compact Budget + Subscriptions + Workouts + Habits + compact Kitchen

Accounts, Notes, personal Body details, and full recipe contents should never be silently
enabled merely because “General context” was selected.

### B. Period

Offer:

- This week
- Last 4 weeks
- Last 3 months
- This year
- Custom dates

Implement safe calendar boundaries. Do not use an unclamped `setMonth()` on an arbitrary day
of month.

### C. Data selection and privacy

Show checkboxes/toggles for every supported scope. Mark Accounts, Body and Notes as sensitive.
Default Notes off. Before copying sensitive data, show a small inline statement of exactly what
will be included; do not add a blocking confirmation on every copy after the user has plainly
selected it.

### D. Preview

Before Copy/Download, show:

- selected scopes;
- number of weeks/transactions/subscriptions/sessions/recipes/notes included;
- approximate character count and rough token estimate (`Math.ceil(chars/4)` is sufficient and
  must be labelled approximate);
- a collapsible text preview.

### E. Output controls

Provide:

- **Copy for AI** (Markdown)
- **Download Markdown**
- **Download JSON**

Use filenames including schema version, preset, date range, and export date. Continue supporting
iOS clipboard fallback.

Persist only harmless UI preferences such as last preset, range and selected scopes. If stored,
use an existing settings store or a deliberately registered sync store; do not create an
unregistered sync-relevant key.

## PART 5 — ADD AN AI INBOX WITH A SMALL, SAFE V1 ACTION SET

Below Context Export, add **AI Inbox**. It accepts pasted JSON using this envelope:

```json
{
  "schema": "daily-actions",
  "version": 1,
  "source": "chatgpt",
  "actions": [
    {
      "id": "globally_unique_action_id",
      "type": "add_expense",
      "data": {}
    }
  ]
}
```

`source` is descriptive only. Accept `chatgpt`, `claude`, or another short string; behaviour
must never depend on which provider produced it.

### Supported V1 action types

Implement only:

1. `add_expense`
2. `add_subscription`
3. `add_recipe`
4. `add_shopping_item`

Do not implement delete, account-balance mutation, session logging, backup restore, arbitrary
localStorage writes, or arbitrary function calls through this importer.

### Validation

- Reject the whole envelope when schema/version/actions are invalid.
- Validate every action before any write occurs.
- Unknown action types are errors, never silently ignored.
- Require a non-empty stable action `id`.
- Reject duplicate action IDs inside the same paste.
- Show field-specific errors.
- Apply no action until the user reviews the preview and presses Apply.
- Allow individual valid actions to be unchecked before Apply.
- Escape all AI-provided strings before inserting preview HTML.
- Put explicit maximum lengths on strings and a reasonable maximum action count per import.

### Action semantics

#### `add_expense`

Required: positive amount, date, category reference. Optional: merchant, note, payment account.
Resolve category/account by stable ID first; an optional exact case-insensitive name fallback is
acceptable only when it resolves to exactly one live record. Reuse/refactor the same pure save
path as `txnSave()` rather than faking DOM inputs or maintaining a second transaction writer.

#### `add_subscription`

Required: name, positive billed amount, cycle. Optional: status, next billing date, website,
category/account fields already supported by the live subscription model. It must create a
recurring Fixed category through the same canonical persistence path as Settings → Budget
categories. Never write retired `daily_subscriptions`.

#### `add_recipe`

Use the existing strict recipe import schema and validation (`kitParseImport()` or a cleanly
extracted shared validator). Preserve the deliberate valid empty ingredient unit and the
`kg`/`L` protections documented in `AGENTS.md`.

#### `add_shopping_item`

Use the existing Kitchen shopping persistence function and duplicate rules. Required: item
name. Optional: amount/unit/category/note only when the existing model supports them; do not
invent fields that will be discarded.

### Duplicate protection and source attribution

Each created destination record must carry `aiActionId` and `aiSource` metadata where the
record schema safely permits extra fields. Before applying an action, scan the relevant
destination collection for the same `aiActionId`; report it as already applied rather than
creating a duplicate. Metadata must never alter existing calculations or UI.

Do not introduce a new standalone sync store merely for idempotency unless you fully register
it with the existing sync/restore system and design its merge semantics. Destination-record
metadata is preferable for V1 because it travels with the created object through the store’s
existing sync path.

### Review and apply

The preview must say plainly what will happen, for example:

- “Add $18.50 Woolworths expense to Groceries on 27 Aug, paid with Visa.”
- “Add Spotify at $13.99/month, next due 4 Sep.”

After Apply:

- save through existing canonical functions;
- sync through existing mechanisms;
- refresh the affected visible screens;
- show applied/skipped counts;
- retain a copyable error report for anything that could not be applied;
- clear the textarea only after at least one action succeeds.

Implement an in-session Undo for the most recent successful Inbox application if it can be
done safely by remembering the IDs of records created by that operation. Undo may remove only
those newly created records; it must never reverse unrelated edits made afterward. If this
cannot be made safe for one of the four stores, omit Undo for that action and state that in its
preview rather than pretending it is reversible.

## PART 6 — PRIVACY, DATA AND SYNC SAFETY

- Never export Firebase config, UID, auth tokens, internal sync timestamps, backup envelopes,
  or raw localStorage.
- Never send anything over the network. Copy and download are local browser actions.
- Never accept executable code, HTML, event handlers, storage keys or function names from the
  AI action payload.
- All imported text is untrusted data.
- Use the existing `lsSave`/feature save functions. Respect `_bootPhase` and `stampFor()`.
- Do not add raw `Date.now()` timestamps during boot, migration or default seeding.
- Any genuinely new sync-relevant store must register through the existing sync system so full
  restore can find it.
- Do not change Firebase security rules.
- Do not rewrite stores wholesale during ordinary import.
- Preserve existing IDs and historical records.

## PART 7 — MAINTAINABILITY

Break the old monolith into clearly scoped functions, for example:

```js
dailyContextRange(options)
dailyContextBudget(options)
dailyContextTransactions(options)
dailyContextSubscriptions(options)
dailyContextWorkouts(options)
buildDailyContext(options)
renderDailyContextMarkdown(context)
renderDailyContextJSON(context)
parseDailyActions(text)
validateDailyAction(action)
previewDailyActions(parsed)
applyDailyActions(selected)
```

Names may differ, but preserve these boundaries:

- reading/building context;
- formatting output;
- parsing/validating actions;
- applying approved actions;
- UI rendering.

Do not leave the old `buildAIReviewMarkdown()` active beside the new system. A thin compatibility
wrapper is acceptable temporarily only if all calculations flow through `buildDailyContext()`.

Add concise comments only for non-obvious constraints: historical fixed-rate freezing,
transaction precedence, untrusted AI input, idempotency, and sync behaviour.

## OUT OF SCOPE

- OpenAI, Anthropic or other model API calls
- MCP server hosting
- Chat history synchronisation
- Google Calendar or work integrations
- Bank connections
- Automatic statement upload/parsing
- Background automation
- AI-triggered deletes or account-balance changes
- Broad redesign of Budget, Accounts, Kitchen or Settings outside this feature

## REQUIRED VERIFICATION

Complete this checklist before committing:

1. Existing landscape/unrelated work remains intact and is not silently folded into this
   feature’s commit.
2. Desktop sidebar contains Daily + AI with a real icon; clicking it opens the dedicated view,
   sets the correct active state, and clicking every other sidebar destination closes it.
3. Mobile hamburger menu contains Daily + AI; it opens the same dedicated view, closes the
   menu, and provides a working mobile Back control. The four-item bottom nav is unchanged.
4. Settings → Export & Restore contains only a concise Daily + AI shortcut, not a duplicated
   context builder.
5. Enter custom instructions and paste Inbox JSON, navigate away and back, and confirm the
   in-session work is still present.
6. At ≥1024px the builder and Preview/Inbox use a purposeful two-column workspace; at 390×844
   they stack without horizontal overflow; the landscape-phone layout is usable if enabled.
7. Generate a Spending review containing a week backed entirely by manual Variable totals;
   exported weekly and category totals match Budget.
8. Generate the same review for a week containing individual transactions; exported weekly,
   category and transaction totals all reconcile exactly.
9. A merchant, note and payment account on a transaction appear only when Transactions is
   selected.
10. A recurring charge with no explicit weekly input exports the same committed amount as
   Budget’s Fixed total.
11. Change a current subscription price and confirm an older frozen week retains its old fixed
   amount in the export.
12. Active/trial/paused/cancelled subscriptions are labelled correctly; paused/cancelled are
   excluded from current active commitment totals.
13. Upcoming subscription dates and price history appear in Subscription audit.
14. Weekly Budget notes appear in the Budget scope.
15. Account balances do not appear unless Accounts is selected.
16. Notes default off and do not appear unless deliberately selected.
17. Full recipe ingredients/steps stay out of compact Kitchen context and appear when the full
    recipe option is selected.
18. This week, Last 4 weeks, Last 3 months, This year and custom dates all produce correct,
    inclusive boundaries, including a test run on/around the 29th–31st day of a month.
19. JSON and Markdown derive from the same context: compare counts and headline totals.
20. Empty scopes render concise empty states and do not crash or fabricate zero trends.
21. One malformed legacy workout/session record cannot crash the whole export.
22. Preview shows scopes, record counts, character count and approximate tokens before copy.
23. Markdown copies successfully on desktop and iOS/PWA fallback; both downloads have sensible
    filenames and MIME types.
24. Paste a valid four-action Inbox envelope, uncheck one action, Apply, and confirm only the
    selected three appear in their real feature screens.
25. Paste the same action IDs again; they are reported as already applied and create nothing.
26. Invalid schema version, unknown type, missing required fields, negative expense, invalid
    date, ambiguous category and oversized text all fail with useful errors and no writes.
27. AI-provided `<script>`, quotes, ampersands and HTML-looking text render as text in preview
    and resulting records; nothing executes.
28. `add_expense` uses transaction precedence and does not double-count an existing manual
    weekly category total.
29. `add_subscription` creates a live recurring Fixed category, never a retired
    `daily_subscriptions` entry.
30. `add_recipe` preserves `unit:""`, `kg`, and `L` after opening and saving the recipe.
31. `add_shopping_item` follows existing duplicate behaviour.
32. In-session Undo removes only records created by that application and leaves unrelated data
    untouched; any intentionally non-undoable action was clearly disclosed before Apply.
33. Refresh and verify applied records persist locally; if signed in, verify they sync through
    the established stores without creating new unregistered data.
34. Export/restore still works and does not include executable or transient UI state.
35. Check dark and light themes at 390×844 phone size and desktop ≥1024px. Controls remain
    readable, previews do not overflow, and the settings overlay scrolls correctly.
36. No console errors on load, navigation, export, copy, download, Inbox parse, Apply or Undo.
37. Run `node --check js/app.js` and `git diff --check`.
38. Because HTML/CSS/JS will change, bump `CACHE_NAME` in `service-worker.js` with an accurate
    version comment.

Commit the AI bridge as its own coherent commit after verification. Do not push to `main` unless
Francois explicitly asks; pushing is the live GitHub Pages deployment.
