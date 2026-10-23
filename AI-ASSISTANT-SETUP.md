# Daily AI — supported workflow and connector plan

Updated 23 October 2026. This release implements a browser workflow. It does **not** deploy a remote assistant connector or issue an assistant access grant.

## What works now

Open Daily on your phone in Safari or Chrome. Open Daily AI → Assistant and check the displayed Daily account. “Check sign-in” asks Firebase to verify the current user online; it does not expose a token or connect an assistant.

- **Bills:** choose From/To or This week, then Show scheduled bills. Copy bills for assistant shares that dated report. Recurring charges reuse the existing calendar occurrence reader. Recorded payments are listed separately because existing bill-payment records do not reliably identify the scheduled occurrence they settle. Missing dates/amounts remain missing. Statement issue date, due date, statement balance, posted balance and pending repayments remain distinct.
- **Expense:** type or dictate into Your expense request, then Copy expense request. Paste into your assistant and resolve missing details there. Paste its JSON reply back in Daily, select Check expense, review the exact change, then Apply reviewed expense. Only one AUD expense, an existing active category and an existing active account are accepted. The new workflow records spending; it does not update bank/card balances or statement fields.
- **Result:** Recent assistant activity shows the stable request ID, resulting expense ID, local/cloud status and Undo expense. Copying the same prepared request retains its ID. Replaying a consumed/cancelled/undone request is refused. A recoverable interrupted result can be inspected with Recover result without creating another expense.
- **Undo:** available across reloads while the expense is unchanged and has no dependent ledger records. The existing Inbox undo path removes that exact AI-created record. The request remains consumed, so an old reply cannot recreate it.

Requests and receipts use `daily_ai_requests` / `users/<uid>/aiRequests`, registered in the existing account-scoped storage, blob-sync and backup machinery. This store holds audit/request information, not an independent financial ledger. Expenses remain in `daily_transactions` and use `aiValExpense`, `applyDailyActions`, `txnCreateRecord` and `saveTxns`.

Saving locally is not cloud proof. A “Saved to cloud” receipt requires server-committed Firebase transactions containing both the exact expense change and its audit record. Cached reads, local Firebase events, an aborted transaction and the global Synced badge do not qualify. After reload, confirmation starts unverified. Retry cloud sync can recommit identical content at the same timestamp, but cannot force older/different content over a newer cloud copy. Offline or failed changes remain explicitly local. Firebase security rules continue to restrict each user to their own UID.

No remote assistant grant exists to revoke. Cancel a prepared request to invalidate it. Account settings opens Daily's existing sign-out controls. Signing out of Daily is separate from disconnecting a future assistant connector; copied text remains in the destination chat/clipboard.

## Architecture for automatic, laptop-independent access

Recommended: a hosted HTTPS MCP service, authenticated by an established OAuth provider, with explicit user consent for `bills:read` and `expenses:create`. Use a server-owned mapping from the verified OAuth subject to the Daily Firebase UID; never accept a caller-selected UID. Verify issuer, audience, expiry and scope on every call, and consult revoked grants before any read/write. Reconnection must go through the real authorization flow. Do not pass Daily browser tokens to an assistant.

OpenAI documents authenticated custom MCP plugins and their setup on the web. Its plugin documentation describes mobile use for plugins available to the account. Availability and the specific Daily integration still need verification on Francois's phone. A local tunnel needs a running host; browser login and WebMCP are not background mobile access.

Dependencies still unresolved:

1. Hosting provider, domain, cost/billing approval and deployed runtime. Existing Firebase Functions are for notifications and have not been repurposed or deployed.
2. OAuth provider and user-to-Firebase identity linking. Persistent credentials and consent grants require approval before creation.
3. A server-safe extraction of the existing expense validator/writer. The current financial store is a timestamped array blob. It is **not** suitable for claiming globally atomic concurrent remote expense writes. Before remote writes, integrate per-request idempotency and expense creation in one authoritative transaction, address older-device compatibility, and preserve manual/AI writers as one financial model.
4. A preview/apply protocol with a short-lived preview token bound to subject, normalized payload and data version; request-hash conflict detection; durable result retrieval; transactional undo and tombstones; and real connection/revoke endpoints.
5. End-to-end tests against an isolated deployed tenant, including access revocation, expiry, cross-account attempts, concurrency, lost acknowledgements, duplicate retries and mobile use with the laptop off.

Only after these dependencies are implemented and approved: add the actual server URL in ChatGPT's custom MCP plugin setup, choose OAuth, complete the Daily authorization flow yourself, install/select the plugin, then verify bill reading and a reviewed test expense on your phone. There is intentionally no invented URL or Connect button in Daily today.

## Verification and limits

Node tests exercise validation, account binding, expired sign-in, timestamp ordering, acknowledgement semantics, Sydney dates, bill recurrences and missing information. Browser tests use synthetic accounts and a fake Firebase service, and cover Apply, retry, reload, Undo, retained account balances, responsive layouts and existing AI tabs. Production Firebase, a physical iPhone/Safari, and a remote connector are not verified by those tests. No real financial or workout records are edited during development.

The current manual workflow supports a single reviewed request in a browser. It does not promise cross-device concurrent write atomicity or permanent assistant access. New API hosting, Firebase billing, credentials, security rules and production auth settings are unchanged.

Sources checked during implementation:

- [OpenAI: Add custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server)
- [OpenAI: Plugin authentication](https://developers.openai.com/plugins/build/auth)
- [ChatGPT: Plugins and supported surfaces](https://learn.chatgpt.com/docs/plugins)
