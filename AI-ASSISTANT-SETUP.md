# Daily AI — available now and prepared connection

Updated 23 October 2026. Live **v406** remains the manual browser workflow described below.

The `codex/daily-remote-connector` branch now prepares the OAuth/MCP service, seven narrow tools, atomic expense receipts, revocation, guarded undo, protected device sync and Assistant controls. Hosting, billing, credentials, production rules and account grants remain **off**, following your request to avoid paying for anything now. Your actual ChatGPT account offers custom remote MCP with OAuth, and Fuji's cloud computer was visible; the deployed iPhone workflow still needs verification.

**You can now:** use Daily's bill reader, manual expense review, Ask AI and Import actions on your phone. Existing archives and the smaller savings check remain.

**You cannot yet:** ask Fuji to read/write Daily automatically with your laptop off. That requires hosting activation, consent and a real phone test. This branch does not claim that manual copying or local tests complete it.

The recommended Cloud Run/Firebase setup requires billing even if usage fits free allowances. No extra AI API or paid authentication subscription is required, but permanent zero cost is not guaranteed. Nothing needs purchasing or connecting now.

See the [prepared connection guide](remote/README.md) for exact configuration, required approvals, isolated tests and the bounded iPhone acceptance test. The first future step is approval of that hosting/security setup; no financial test is authorized by the code being ready.

## Live v406 manual workflow

Open Daily on your phone in Safari or Chrome. Open Daily AI → Assistant and check the displayed Daily account. “Check sign-in” asks Firebase to verify the current user online; it does not expose a token or connect an assistant.

- **Bills:** choose From/To or This week, then Show scheduled bills. Copy bills for assistant shares that dated report. Recurring charges reuse the existing calendar occurrence reader. Recorded payments are listed separately because existing bill-payment records do not reliably identify the scheduled occurrence they settle. Missing dates/amounts remain missing. Statement issue date, due date, statement balance, posted balance and pending repayments remain distinct.
- **Expense:** type or dictate into Your expense request, then Copy expense request. Paste into your assistant and resolve missing details there. Paste its JSON reply back in Daily, select Check expense, review the exact change, then Apply reviewed expense. Only one AUD expense, an existing active category and an existing active account are accepted. The new workflow records spending; it does not update bank/card balances or statement fields.
- **Result:** Recent assistant activity shows the stable request ID, resulting expense ID, local/cloud status and Undo expense. Copying the same prepared request retains its ID. Replaying a consumed/cancelled/undone request is refused. A recoverable interrupted result can be inspected with Recover result without creating another expense.
- **Undo:** available across reloads while the expense is unchanged and has no dependent ledger records. The existing Inbox undo path removes that exact AI-created record. The request remains consumed, so an old reply cannot recreate it.

Requests and receipts use `daily_ai_requests` / `users/<uid>/aiRequests`, registered in the existing account-scoped storage, blob-sync and backup machinery. This store holds audit/request information, not an independent financial ledger. Expenses remain in `daily_transactions` and use `aiValExpense`, `applyDailyActions`, `txnCreateRecord` and `saveTxns`.

Saving locally is not cloud proof. A “Saved to cloud” receipt requires server-committed Firebase transactions containing both the exact expense change and its audit record. Cached reads, local Firebase events, an aborted transaction and the global Synced badge do not qualify. After reload, confirmation starts unverified. Retry cloud sync can recommit identical content at the same timestamp, but cannot force older/different content over a newer cloud copy. Offline or failed changes remain explicitly local. Firebase security rules continue to restrict each user to their own UID.

No remote assistant grant exists to revoke. Cancel a prepared request to invalidate it. Account settings opens Daily's existing sign-out controls. Signing out of Daily is separate from disconnecting a future assistant connector; copied text remains in the destination chat/clipboard.

## Prepared automatic connection

The remote implementation and tested protections are now on the preparation branch. The [full connection guide](remote/README.md) replaces the earlier architecture proposal and lists exact deployment requirements. Remaining dependencies are approval/activation of hosting, credentials, IAM and rules, followed by real OAuth consent and the iPhone acceptance test. No payment, transfer or bank linking is supported.

## Verification and limits

Node tests exercise validation, account binding, expired sign-in, timestamp ordering, acknowledgement semantics, Sydney dates, bill recurrences and missing information. Browser tests use synthetic accounts and a fake Firebase service, and cover Apply, retry, reload, Undo, retained account balances, responsive layouts and existing AI tabs. Production Firebase, a physical iPhone/Safari, and a remote connector are not verified by those tests. No real financial or workout records are edited during development.

The current manual workflow supports a single reviewed request in a browser. It does not promise cross-device concurrent write atomicity or permanent assistant access. New API hosting, Firebase billing, credentials, security rules and production auth settings are unchanged.

Sources checked during implementation:

- [OpenAI: Add custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server)
- [OpenAI: Plugin authentication](https://developers.openai.com/plugins/build/auth)
- [ChatGPT: Plugins and supported surfaces](https://learn.chatgpt.com/docs/plugins)
