# CODEX IMPLEMENTATION BRIEF — Safe, idempotent `archive_subscription` AI action

Implement one narrowly-scoped mutation in Daily's AI Inbox: an idempotent
`archive_subscription` action. Do not broaden the Inbox into arbitrary updates or deletes.

Read `AGENTS.md` completely first. Then inspect the live recurring-charge model, Budget Setup's
manual archive/restore path, Daily + AI subscription export, and the full validator → preview →
selection → revalidation → apply → undo pipeline in `js/app.js`. Preserve unrelated working-tree
changes. Do not commit or push unless Francois explicitly asks in the active conversation.

## Purpose

An assistant may identify a subscription that has genuinely ended and propose archiving it.
Daily must require the subscription's stable stored id, show the exact target and end date, require
deliberate user approval, and refuse to archive before that user-confirmed end date.

Archiving means the existing Budget category behaviour: retain the record and all historical data,
hide it from active entry/setup lists, and exclude it from future commitment totals. It is **not**
permanent deletion and must not rewrite historical Budget weeks.

## Accepted envelope

Keep `schema:"daily-actions"` and the currently supported schema version unless the existing parser
architecture genuinely requires a version bump. Add this action type:

```json
{
  "id": "archive-subscription-subabc-2026-09-26",
  "type": "archive_subscription",
  "data": {
    "subscriptionId": "subabc",
    "confirmedEndDate": "2026-09-26"
  }
}
```

Both ids have different jobs:

- top-level `id` is the stable, globally unique **action id** used for idempotency;
- `data.subscriptionId` is the exact stable id of the existing recurring Fixed category.

`confirmedEndDate` is the date the user says access/charging actually ended. It is not the next
billing date and must never be inferred from `dueDate`, cycle, status, transaction history, a name,
or today's date.

## Validation requirements

Add `archive_subscription` to the closed action registry/labels/validator dispatch and schema-copy
instructions. Its validator must:

1. Require a non-empty `subscriptionId` and reject an overlong value.
2. Resolve by exact stable id in `loadFixCats()` only. Do **not** accept
   `subscriptionName`, `name`, fuzzy matching or the generic name fallback in `aiResolveRef()`.
3. Require the target to be a recurring scheduled charge (`catIsRecurring`) in the live Fixed
   category model. The retired `daily_subscriptions` store is never read or written.
4. Require a non-empty `confirmedEndDate` and validate it as a real `YYYY-MM-DD` calendar date with
   `aiActValidDate()`.
5. Compare dates using Daily's local-date helpers and Sydney/local app semantics. If
   `getLocalDate() < confirmedEndDate`, return a field-specific blocking error such as:

   `Cannot archive Netflix before the confirmed end date 26 Sep. It will remain active until then.`

   Do not queue, schedule, partially apply, pause, cancel or write anything.
6. Perform the same date check again during the existing immediately-before-apply revalidation so
   a stale preview cannot bypass it.
7. If the subscription is already archived, return an honest `already` state with no write.
8. Respect the existing manual invariant that archiving cannot leave a category section with no
   active category. If the current manual `catArchive()` rule applies to this target, fail clearly
   rather than silently doing nothing.
9. Reject malformed/unknown fields only to the same strictness used by the other action validators;
   do not invent a second parser.

The action must not change amount, cycle, due date, payment account, charge type, price history,
name or historical values. Do not automatically change `status` unless inspection proves the
manual archive path already does so. Restoring later must preserve the exact pre-archive record.

## User-confirmation safeguard

The ordinary Inbox currently preselects every valid new action. That is not sufficient for this
state change.

- Mark the validated row with an explicit `requiresConfirmation` (or equivalently clear internal
  property).
- Preserve that property from validation into preview rows.
- In `aiInboxCheck()`, valid archive rows must start **unchecked** while ordinary additive actions
  retain their current default-selected behaviour.
- The row must clearly say, for example:

  `Archive Netflix after its confirmed end date, 26 Sep 2026. Historical spending is retained.`

- The user must deliberately tick that individual row before Apply includes it.
- The normal Apply button is the final confirmation; do not add a second modal unless the current
  interaction cannot make the unchecked destructive row unambiguous.
- Error/already rows remain unselectable.

An AI-supplied boolean such as `userConfirmed:true` is not proof of confirmation and must not be
accepted as the safeguard. Confirmation is the human interaction in Daily plus the required date.

## Idempotency

Re-pasting or reapplying the same action must never toggle, duplicate or repeat the archive.

Use the established correction-action pattern rather than creating a new localStorage store. A
bounded action ledger inside an already-synced settings record such as `budDefaults` is acceptable
if it records enough to detect collisions:

```js
{ actionId, subscriptionId, confirmedEndDate }
```

Requirements:

- same action id + same subscription/date after a successful apply → `already`;
- same action id reused for a different subscription or date → reject as an id collision;
- target already archived manually or by another action → `already`, not a write;
- manually restoring a subscription does not erase the historical action id and does not allow the
  same pasted action to archive it again;
- keep the ledger bounded consistently with `aiAppliedGoalActions` or another existing convention;
- persist it through the existing Budget-default sync/backup/restore path; no new sync store.

Do not rely only on `archived===true` for idempotency: that fails after a later manual restore.

## Apply and undo

At Apply:

1. Re-resolve the exact subscription id.
2. Revalidate the real date and `today >= confirmedEndDate`.
3. Snapshot only the fields this action owns for in-session Undo.
4. Archive through the canonical Fixed-category save path so Budget Setup, Budget, Home, Stats,
   subscriptions export and Firebase all refresh consistently.
5. Record the action ledger entry only after the archive write succeeds.

Extend `aiUndoLastApply()` for this correction:

- Undo may unarchive only the exact subscription archived by this action.
- Undo must verify the record is still in the state produced by the action. A later manual change
  always wins.
- Undo removes the corresponding action-ledger entry only when it actually reverses the action.
- Undo must not alter any unrelated subscription field or other archived item.
- After undo, refresh every view the ordinary manual restore refreshes.

## AI context/schema instructions

`aiSubscriptionsScope()` already exports each recurring charge's stable `id`; preserve it. Update
the copied schema/instructions to say:

- `archive_subscription` requires `subscriptionId` from the exported subscription record and a
  user-confirmed `confirmedEndDate`;
- names are descriptive only and cannot target an archive;
- the action cannot be applied before the date;
- use it only after the user explicitly confirms that date;
- it archives history-preservingly; it does not permanently delete.

Include one correct example in the copied format without making it the default/only example.

## Required verification

Verify all of these against the running app:

1. Valid exact subscription id, end date today, deliberate tick → archives exactly one target.
2. End date yesterday → eligible; summary still states the confirmed historical date.
3. End date tomorrow/future → blocked in preview with zero writes.
4. Missing, malformed and impossible dates (`2026-02-31`) → field-specific errors.
5. Missing id, unknown id, id of an ordinary non-recurring Fixed category and id from the retired
   store → rejected with zero writes.
6. Supplying only a correct subscription name → rejected because stable id is mandatory.
7. Two subscriptions with the same display name → exact id archives only the intended record.
8. Valid archive row starts unchecked; no Apply occurs until the user ticks it.
9. Change the target or clock/date condition after preview but before Apply → immediate
   revalidation prevents an unsafe archive.
10. Re-paste the same action id → `already`, zero additional writes.
11. Manually restore, then paste the same action → still `already` because action id is durable.
12. Reuse the action id with a different target/date → explicit collision error.
13. Already-manually-archived target → `already`, no ledger corruption.
14. In-session Undo restores only its target and only when no later manual state change conflicts.
15. Historical Budget weeks/totals and price history remain byte-equivalent before/after archive.
16. Active recurring commitment and Upcoming charges exclude the archived item; restore includes it
    again according to its preserved status.
17. Subscription export reports the same stable id and `archived:true` after apply.
18. Mixed envelope with additive actions and one archive retains selective apply and global
    duplicate-id protection.
19. No executable/unescaped target name can alter Inbox markup.
20. Dark/light, arbitrary accents, iPhone portrait/landscape and desktop: confirmation row and
    summary remain readable with no overflow.
21. Reload and Firebase round-trip retain both archive state and idempotency ledger.
22. No new localStorage store; full backup/restore retains the result.
23. Existing action types and their Undo behaviour still pass regression checks.
24. `node --check js/app.js` and `git diff --check` pass; no console errors.

Because `js/app.js` and the cached UI change, bump `CACHE_NAME` in `service-worker.js` with an
accurate version comment. Report changed files, exact tests and any browser-emulation limitations.

Do not commit or push unless explicitly authorised; pushing `main` deploys immediately.
