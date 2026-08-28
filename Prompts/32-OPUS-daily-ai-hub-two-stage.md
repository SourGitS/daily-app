# PROMPT 32 — Daily + AI Hub: Context Export First, Safe Write-Back Second

## YOUR OPERATING RULE

This is deliberately one prompt with **two implementation stages**.

Complete **Stage 1 only**, run every Stage 1 verification item, report the results, and then
**STOP**. Do not start Stage 2, do not create the AI Inbox, and do not commit or push Stage 2
until I explicitly reply with permission to continue.

At the pause point, tell me exactly what is complete, what files changed, what remains for
Stage 2, and whether any Stage 1 issue needs my decision. A message such as “Stage 1 complete
— may I continue to Stage 2?” is required.

---

## CODEBASE CONTEXT

This is **Daily**, a personal lifestyle PWA for workouts, Budget, Accounts, habits, Kitchen
and notes. It is vanilla HTML/CSS/JS with no framework or build step:

- `index.html`
- six CSS files in their existing cascade order
- `js/app.js` for application logic
- `service-worker.js` for a cache-first PWA
- Firebase Realtime Database mirrors localStorage when signed in
- GitHub Pages deploys directly from `main`

Read `AGENTS.md` completely before editing. Read the relevant Daily + Home / desktop-layout /
Settings / Budget sections of `CLAUDE.md`, then inspect the actual current code before making
assumptions. The written docs can be stale.

Important current systems to preserve:

- Budget has live Income, weekly commitments, recurring Fixed categories used as bills and
  subscriptions, Variable categories, individual transactions, frozen historical fixed rates,
  weekly notes, and Month/Year history.
- A recurring Fixed category can now contain `status`, `dueDate`, `site`, `priceHistory`,
  `archived`, and `paymentAccountId`.
- Active and Trial subscriptions count as chargeable; Paused and Cancelled do not. Archived
  categories must remain in historical data but not appear in active planning or current
  upcoming-charge totals.
- Payment-account attribution is informational. Linking a transaction/subscription to an
  Account must **never** mutate its balance.
- Transactions take precedence over manual Variable totals. Use the canonical transaction-aware
  helpers, not raw `var_<id>` reads.
- Historical Fixed values must remain frozen: a subscription price changed today must not
  rewrite an old week’s export.
- `daily_subscriptions` is retired. Live recurring Fixed categories are the subscription model.
- LocalStorage/Firebase sync has strict safety rules. Never introduce an unregistered
  sync-relevant store and never make boot-time writes with a fresh `Date.now()` timestamp.

There may be unrelated local changes. Preserve them. Do not reset, overwrite, discard, or fold
unrelated work into this feature’s commit. Do not push to `main` unless I explicitly ask.

## PRODUCT PRINCIPLE

**Daily is the source of truth. ChatGPT, Claude, and future AI tools are interfaces into it.**

This feature is provider-neutral. Do not add OpenAI, Anthropic, or any other API call. Do not
make ChatGPT and Claude communicate with each other. The initial bridge works by copy/paste and
download, while defining schemas that could later support a shared MCP server.

The product has three concepts:

1. **Context export** — factual, user-selected information Daily already knows.
2. **Review request** — optional instructions the user wants to give an AI.
3. **AI Inbox** — validated, previewed, user-approved proposed actions returning to Daily.

Stage 1 implements the first two and provides an immediately useful way to analyse spending,
transactions and subscriptions. Stage 2 implements the third.

---

# STAGE 1 — DAILY + AI CONTEXT HUB

## 1. Replace the inaccurate AI Review architecture

Settings → Export & Restore currently contains an AI Review export, implemented around
`buildAIReviewMarkdown()`, `copyAIReport()` and `exportAIReport()`.

Do not keep extending that large hard-coded Markdown function. It is inaccurate and too tightly
coupled to Budget. Replace its calculation and formatting logic with a canonical context builder
and renderers. A temporary compatibility wrapper is acceptable only if it delegates completely
to the new context system.

Before building UI, establish reusable read-only helpers so the export agrees with the Budget
screen exactly:

- Variable category actuals: use `varCatAmount(weekRecord, weekKey, catId)`.
- Weekly Variable totals: use `weekVarTotal(weekRecord, weekKey)`.
- Fixed amounts: follow the same precedence as `weekFixedTotal()` — explicit `fix_<id>`, then
  frozen `fixRates[id]`, then only the current chargeable rate for an unfrozen legacy/current
  week.
- Do not label prorated recurring commitments as actual spending. Use distinct fields such as
  `actualSpent`, `committed`, `saved`, and `available`.
- Paused, Cancelled and Archived subscriptions must not contribute to active commitment totals.
- For monthly rollups, attribute a week to the month containing its Monday and state that rule
  explicitly in export metadata.
- Do not use an unclamped `Date#setMonth()` range calculation. Month boundaries must work on
  the 29th, 30th and 31st.

## 2. Build one versioned context object

Create a pure, serialisable builder along these lines:

```js
buildDailyContext(options)
```

It must not read form controls directly, mutate stores, write timestamps, trigger Firebase sync,
or format Markdown. It returns data in this shape:

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

Use `Intl.DateTimeFormat().resolvedOptions().timeZone` when available, with a safe local
fallback. Currency can remain AUD but belongs in metadata, not scattered prose.

Implement these independently selectable scopes. Do not include an unselected scope as an empty
placeholder; `scopes` and `data` keys must agree.

- `budget`
- `transactions`
- `subscriptions`
- `accounts`
- `workouts`
- `body`
- `habits`
- `kitchen`
- `notes`

### Budget scope

Include current targets and, for each relevant week:

- income
- actual Variable spend
- committed/accrued Fixed amount
- saved amount
- available/leftover amount
- spending goal
- finalised/draft state
- weekly note
- canonical per-category totals
- monthly rollups using the stated Monday grouping

### Transactions scope

Include individual transactions in the selected date range:

```json
{
  "id": "txn_...",
  "date": "YYYY-MM-DD",
  "merchant": "Woolworths",
  "categoryId": "...",
  "categoryName": "Groceries",
  "amount": 18.5,
  "paymentAccountId": "optional",
  "paymentAccountName": "optional",
  "note": "optional"
}
```

Resolve human-readable category and account names whenever the referenced record still exists.

### Subscriptions scope

Read live recurring Fixed categories, never `daily_subscriptions`. Include:

- stable category/subscription ID and display name
- `active`, `trial`, `paused`, or `cancelled` status
- whether it is archived
- billed amount, billing cycle and derived weekly commitment
- next billing date and days-until-due where known
- website and price history where present
- upcoming-charge state
- `paymentAccountId` and payment-account name where linked

Keep Paused, Cancelled and Archived subscriptions available for historical analysis, clearly
labelled, but exclude them from active commitment totals.

### Accounts scope

Include account type, balance, category, saver status and in-range balance history. Do not
include Firebase IDs, authentication information, raw sync timestamps or backup envelopes.

### Workouts, body and habits

Keep useful existing summaries and make source readers defensive: a malformed old session with
missing `exercises` or `sets` must not crash the entire export.

### Kitchen and notes

- Kitchen defaults to compact information: recipe names/categories/tags, shopping items and
  pantry items. Add an explicit **Full recipe contents** option before including ingredients
  and steps.
- Notes are sensitive and default OFF. Include title, date and body only when selected.

## 3. Create renderer boundaries

Create renderers that consume the same context object without recalculating anything:

```js
renderDailyContextMarkdown(context)
renderDailyContextJSON(context)
```

Markdown must be clear when pasted into an ordinary ChatGPT or Claude conversation. Start it
with a brief statement that the content is user-supplied Daily data, the period/timezone/currency,
the included scopes, selected request, and that missing information must not be guessed.

Keep it substantially shorter and clearer than the old report. Prefer compact tables. Omit empty
sections. Do not repeat the same figure in prose and tables unless the second use adds meaning.

## 4. Add a dedicated Daily + AI destination

This is too large to remain buried in Export & Restore.

Create a full-screen **Daily + AI** destination with its own view and functions such as
`openAIHub()` / `closeAIHub()` (or the closest existing navigation convention).

Navigation requirements:

- Add **Daily + AI** to the desktop sidebar with an icon from the existing SVG/currentColor
  language — no emoji card chrome.
- Add it to the mobile hamburger/side menu under Navigate.
- Do not add a fifth item to the phone’s four-item bottom nav.
- Place it among Accounts, Plans and Notes in a natural secondary-tools order.
- The correct desktop item becomes active.
- Opening it closes the mobile menu; choosing another destination closes it cleanly.
- Mobile has a working Back control; desktop follows existing peer-destination conventions.
- Browser Back/forward, phone swipe behaviour and normal navigation must remain consistent.

Replace the old Settings AI Review card with a concise **Daily + AI** shortcut and an **Open
Daily + AI →** action. Do not duplicate the full builder in Settings.

### Layout requirements

- **Phone portrait:** one comfortably tappable flow: purpose/range → data selection → preview →
  output actions.
- **Phone landscape:** real usable layout; no rotation placeholder or clipped fixed-height panel.
- **Desktop:** purposeful workspace, preferably builder/options on the left and preview on the
  right. Do not make controls or text fields uncomfortably wide.
- Dark-first, light theme supported, and runtime accent supported.
- Partially entered request text and selections survive navigating away and back for the current
  app session. Persist only harmless UI preferences through an existing registered store or a
  properly registered new one.

### Purpose presets

Offer editable presets. Presets set sensible defaults but never lock scope controls:

- General context
- Spending review
- Subscription audit
- Workout review
- Meal planning
- Weekly review
- Custom

Suggested defaults:

| Preset | Default scopes |
| --- | --- |
| Spending review | Budget, Transactions, Subscriptions |
| Subscription audit | Subscriptions, Transactions |
| Workout review | Workouts, Body |
| Meal planning | Kitchen; full recipes off |
| Weekly review | Budget, Transactions, Workouts, Habits |
| General context | Budget, Subscriptions, Workouts, Habits, compact Kitchen |

Never silently enable Accounts, Notes, personal Body details or full recipe contents merely
because General context was chosen.

### Period, privacy and preview

Offer This week, Last 4 weeks, Last 3 months, This year and Custom dates.

Mark Accounts, Body and Notes as sensitive. Notes default off. Before copying selected sensitive
data, clearly state exactly which sensitive scopes will be included; do not add repeated blocking
confirmation after a user has deliberately selected them.

Before Copy or Download, show:

- selected scopes
- counts of weeks, transactions, subscriptions, sessions, recipes and notes
- character count and an **approximate** token estimate using `Math.ceil(chars / 4)`
- a collapsible text preview

Provide:

- **Copy for AI** (Markdown)
- **Download Markdown**
- **Download JSON**

Use sensible filenames containing schema version, preset, date range and export date. Preserve
the existing iOS clipboard fallback.

## 5. Stage 1 safety rules

- Never export Firebase config, UIDs, auth tokens, raw localStorage, sync envelopes or internal
  timestamps.
- Never send information over the network. Copy/download only.
- Do not change Firebase rules.
- Preserve existing IDs and historical records.
- Use existing `lsSave` / feature save functions and respect `_bootPhase` / `stampFor()`.
- Bump `CACHE_NAME` in `service-worker.js` with an accurate comment if HTML, CSS or JS changes.

## 6. Stage 1 verification

Before pausing, verify all of the following:

1. Existing unrelated work remains separate and untouched.
2. Desktop sidebar and mobile hamburger both contain Daily + AI; the four-item phone nav is
   unchanged.
3. Settings → Export & Restore has only the concise shortcut, not a duplicate builder.
4. Desktop workspace, 390×844 phone portrait and supported landscape-phone layout have no
   horizontal overflow or clipped actions.
5. Dark and light themes work with arbitrary runtime accents.
6. Enter custom request text and change scopes, navigate away and back, and confirm the in-session
   values remain.
7. A Spending review based only on manual Variable entries matches Budget totals.
8. A Spending review containing transactions reconciles weekly/category/transaction totals.
9. Merchant, note and payment account appear only when Transactions is selected.
10. A recurring charge with no explicit weekly input exports the same committed value as Budget.
11. Changing today’s subscription price does not change an older frozen week in context.
12. Active, Trial, Paused, Cancelled and Archived subscriptions are labelled correctly; only
    Active/Trial non-archived items count toward active commitments.
13. Subscription audit includes dates, price history and payment-account linkage where present.
14. Weekly Budget notes are exported in the Budget scope.
15. Accounts and Notes are absent unless deliberately selected; Notes default off.
16. Compact Kitchen excludes ingredients/steps; Full recipe contents includes them.
17. Range boundaries work around month ends, including the 29th–31st.
18. JSON and Markdown come from the same context: headline totals/counts agree.
19. Empty scopes and malformed legacy workout data show concise safe results, never fabricated
   trends or crashes.
20. Copy and both downloads work, including the iOS fallback where available.
21. `node --check js/app.js`, `git diff --check` and browser-console checks pass.

## REQUIRED PAUSE

When every Stage 1 requirement is complete, stop. Do not begin the section below. Do not build
Inbox parsing, validation, Apply, Undo or action imports yet.

Report the Stage 1 implementation and verification results, then ask exactly:

> Stage 1 is complete. Would you like me to continue with Stage 2: the safe AI Inbox write-back?

Wait for my answer.

---

# STAGE 2 — SAFE AI INBOX WRITE-BACK

**Do not start this stage until I explicitly approve it after the Stage 1 pause.**

## 1. Add AI Inbox below Context Export

AI Inbox accepts pasted JSON only, using this envelope:

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

`source` is descriptive only. Accept `chatgpt`, `claude`, or another short string. Behaviour
must never branch by provider.

## 2. Implement only these V1 actions

1. `add_expense`
2. `add_subscription`
3. `add_recipe`
4. `add_shopping_item`

Explicitly out of scope: delete actions, account-balance mutation, workout session logging,
backup restore, arbitrary localStorage writes, arbitrary function calls, executable code, HTML
handlers and network requests.

## 3. Parse, validation and review

Use clear boundaries such as:

```js
parseDailyActions(text)
validateDailyAction(action)
previewDailyActions(parsed)
applyDailyActions(selected)
```

Requirements:

- Reject the whole envelope if schema, version or `actions` is invalid.
- Validate all selected actions before any write.
- Unknown action types are errors, never silently ignored.
- Require a non-empty stable action ID and reject duplicate IDs within a paste.
- Use field-specific, human-readable errors.
- Cap action count and every supplied string length.
- Escape every AI-supplied string in preview HTML; treat imported text as untrusted data.
- Show a plain-language preview and individual checkboxes before Apply.
- Apply nothing until the user presses Apply.
- Keep a copyable error report for skipped/invalid actions.

Preview examples:

- “Add $18.50 Woolworths expense to Groceries on 27 Aug, paid with Visa.”
- “Add Spotify at $13.99/month, next due 4 Sep, paid with Everyday account.”

## 4. Action semantics

### `add_expense`

Required: positive amount, date and category reference. Optional: merchant, note and payment
account.

Resolve category/account by stable ID first. Exact case-insensitive name fallback is allowed
only if it resolves to exactly one live record. Reuse/refactor the same canonical persistence
path as `txnSave()`; do not fake DOM inputs or create a second transaction writer.

### `add_subscription`

Required: name, positive billed amount and cycle. Optional: status, next billing date, website,
payment-account ID/name and other fields already supported by live recurring Fixed categories.

Create a recurring Fixed category through the same canonical persistence path as Settings →
Budget Setup. Never write `daily_subscriptions`. It must support the current optional
`paymentAccountId` linkage and include it in the preview after resolution.

### `add_recipe`

Use the existing strict recipe schema/validator (`kitParseImport()` or a cleanly extracted shared
validator). Preserve the deliberate valid empty ingredient unit and the `kg` / `L` protections.

### `add_shopping_item`

Use existing Kitchen shopping persistence and duplicate rules. Require item name. Support only
amount, unit, category or note fields that the current model actually stores; do not invent data
that Daily will discard.

## 5. Idempotency, source metadata and undo

Where an existing destination record safely permits extra fields, add `aiActionId` and
`aiSource`. Before Apply, scan the relevant destination collection for a matching
`aiActionId`; report it as already applied and do not create a duplicate.

Do not create a separate unregistered idempotency store. Destination metadata is preferred
because it travels through the existing sync system.

After successful Apply:

- persist and sync through existing canonical feature paths
- refresh affected views
- show applied/skipped counts
- clear the text area only after at least one action succeeds

Implement in-session Undo only if it can safely remove **only** records created by the most
recent Apply. It must never reverse unrelated edits. If safe Undo is not possible for an action,
omit it and disclose that before Apply rather than claiming reversibility.

## 6. Stage 2 verification

1. A valid four-action envelope previews all actions; unchecking one applies only the other
   three.
2. Re-pasting the same IDs reports already-applied actions and creates nothing.
3. Invalid schema/version/type, duplicate IDs, missing required fields, negative amounts,
   invalid dates, ambiguous names and oversized fields fail with useful errors and no writes.
4. AI-provided `<script>`, quotes, ampersands and HTML-looking text render as data and never
   execute.
5. `add_expense` follows transaction precedence and does not double-count a manual Variable
   total.
6. `add_subscription` creates a live recurring Fixed category with correct status/due date and
   optional payment-account link; it never writes the retired store.
7. `add_recipe` preserves `unit:""`, `kg` and `L` after opening/saving the resulting recipe.
8. `add_shopping_item` follows existing duplicate behaviour.
9. Refresh persists applied records locally; signed-in testing confirms existing sync handles
   them with no new unregistered store.
10. Undo, where offered, removes only records from its own most recent Apply.
11. Check dark/light, 390×844, desktop and supported landscape, console output, `node --check`
    and `git diff --check`.

Commit Stage 2 as its own coherent commit only after verification. Do not push unless I
explicitly ask.
