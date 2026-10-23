# Daily ↔ Fuji: prepared connection

This branch prepares the remote connection requested on 23 October 2026. **It does not activate hosting, billing, credentials, OAuth grants, production rules or a real financial test.** Live Daily remains v406 (`a9995a1`) until a separate release. `js/ai-remote-config.js` is deliberately `null`.

## Fuji route and current evidence

The signed-in ChatGPT account was inspected read-only: Plugins → Add offers **Add custom MCP server**, with a remote **Server URL** and **OAuth**. Fuji exists in that same account; its profile showed **Fuji’s computer — Ready**. The blank connection dialog was cancelled. No plugin, grant or credential was created.

This supports using this particular Dot. OpenAI documents [Dot cloud computers and supported plugins](https://learn.chatgpt.com/docs/dots/computers-and-apps) and [the same Dot across phone, desktop and web](https://learn.chatgpt.com/docs/dots). Installed plugins still depend on account/environment permissions. The deployed OAuth handshake, tool availability in Fuji's iPhone conversation, mobile confirmations and laptop-off test **remain unverified**. Browser persistence and WebMCP do not substitute for this proof.

## Recommended hosting and costs

Use one **Google Cloud Run** service in the existing Firebase project: request-based billing, minimum instances 0, maximum instances 1 initially. Retain Firebase Authentication and Realtime Database, with `oidc-provider` for OAuth/PKCE and the official MCP SDK for stateless Streamable HTTP. No additional AI API, Auth0 subscription, bank connection or second finance database is needed.

Cloud Run requires a billing account; Spark-only Firebase cannot activate this design. Light personal use may fit free allowances. **US$0–5/month is a planning estimate, not a quote or cap.** Database bandwidth, builds/container storage, secrets, logs and excess requests may add charges. Budget alerts do not stop spending. See [Cloud Run pricing](https://cloud.google.com/run/pricing) and [Firebase plans](https://firebase.google.com/pricing). No chargeable service has been enabled by this work.

## Tools and guarantees

| Tool | Permission | Behavior |
|---|---|---|
| `connection_status` | authenticated grant | Verified account, currency, Sydney date and expiry |
| `scheduled_bills` | `bills:read` | Inclusive date range; recorded schedules/statements and separate payment records |
| `expense_references` | `expenses:create` | Existing active categories and accounts |
| `preview_expense` | `expenses:create` | Validate exact AUD expense; save pending preview, no expense |
| `commit_expense` | `expenses:create` | Commit exact reviewed preview; return record ID and cloud receipt |
| `operation_result` | `expenses:create` | Durable result for the same ID after retry/lost response |
| `undo_expense` | `expenses:create` | Remove unchanged created expense without dependent ledger records |

Require positive AUD amounts with at most two decimal places, date, description, existing category and account. Fuji must ask about ambiguity and retain platform confirmations. Previews last 10 minutes and bind account, grant, request ID, exact payload, references and warnings. Duplicate warnings need explicit acknowledgment; changed references require another preview. Never replace the request ID merely because a response was lost.

`build-core.cjs` compiles named canonical functions from Daily's existing writer, validators, duplicate detection and bill readers. It records source hashes and fails if a required function disappears. There is no second expense algorithm. The canonical writer modifies a transaction-private draft; only the Firebase transaction persists it.

Expense, idempotency and audit metadata remain in existing `users/{uid}/transactions` and `aiRequests` envelopes, atomically committed at the user's root. That transaction also checks grants, reference changes, duplicate IDs and undo dependencies. Requests use stable `daily_remote_…` IDs. Undo retains a tombstone so retry cannot recreate the expense. A lost cloud response is **unknown**, not failed or committed; retrieve the same ID. `pending` means a saved preview, not a saved expense.

Expense logging does not change posted balance, pending charges, statement balance, statement issue date, due date, savings allocations or bill payment status. Payments remain separate from scheduled occurrences; unknown amounts/dates remain unknown. Workouts, account archives, the small savings-check row and unrelated app features retain their existing logic.

## Security and revocation

- Public OAuth client `daily-fuji`, exact registered ChatGPT callback, authorization code with required S256 PKCE, audience/resource bound to the HTTPS `/mcp` URL. No dynamic client registration, password grant, shared API key or caller-supplied UID.
- Standard Firebase sign-in on the consent page establishes ownership. Its SDK sends the owner's ID token to this first-party service, never to the model/chat. Server credentials use ADC/workload identity, without downloaded service-account keys.
- Access tokens last 5 minutes; rotating refresh tokens and the authoritative grant expire within 30 days. Reconnect uses a real OAuth/consent flow. Firebase account disablement and session revocation are checked at use time.
- OAuth payloads are AES-GCM encrypted in private `dailyConnectorOAuth` storage; indexes and keys are hashed. Production keys belong in Secret Manager. Public config contains only an HTTPS origin. Credentials and request bodies are not intentionally logged.
- Daily revoke, OAuth revocation and refresh-replay grant destruction serialize their revocation with financial commits. After an acknowledged revocation, later operations fail. Protected sync stays enabled after revoking assistant access.
- A dedicated runtime identity requires database Admin access and Firebase Auth user lookup plus access to its specific secrets. IAM is service/project-level: **server code enforces per-user ownership**. Review this boundary before production. Avoid Owner/Editor and Firebase configuration roles on the runtime.
- Exact-origin browser CORS, no-store responses, body limits and bounded per-instance request throttling are provided. These do not replace hosting limits or guarantee a spending cap.

## Concurrent devices and old clients

For enabled accounts, `transactions`, `ledger` and `aiRequests` use `js/ai-remote.js`. Existing writers retain normal local records. The owner-authenticated `/daily/sync` API merges a persisted baseline, current local records and current cloud records within the same transaction boundary as assistant writes. Independent additions survive; conflicting edits/deletions fail closed. Remote audit receipts are server-owned. New ledger dependencies cannot reference an undone expense.

The candidate rules remove blanket user-root writes and reject direct writes to those three stores only for enabled users. Old clients cannot erase remote expenses with newer snapshot timestamps. Other owner-specific stores retain write access. Root replacements/deletions are deliberately denied: review backup/restore and account deletion procedures before activation. **Production `database.rules.json` and `firebase.json` remain unchanged.**

Baselines are account-scoped and separate from backups. Local edits made while a request is in flight survive its acknowledgment. Interrupted baseline/local writes leave a durable recovery journal and block guessing. A device with different local data but no baseline must export/review it before loading the cloud copy. The Assistant panel supports that explicit recovery and retains a local recovery copy. Offline edits remain local until confirmed. Update all devices and reload after enabling protected sync.

## Isolated tests

```text
cd remote
npm ci --ignore-scripts
npm test
npm run test:emulator
```

The emulator requires Java 21+ on PATH and uses only `demo-daily-connector` on 127.0.0.1:9009; its test refuses another address. On Windows app-container hosts, Java may need `-Djdk.net.unixdomain.tmpdir=<workspace temp>` and `-Djava.io.tmpdir=<workspace temp>` in `JAVA_TOOL_OPTIONS`. Test runtimes and logs remain ignored.

Coverage includes canonical validation, ambiguity, archived choices, dates/DST/leap years, preview changes, concurrent duplicate/independent commits, durable results, guarded undo, two Admin SDK clients, stale direct snapshots, user isolation, revocation races, encrypted OAuth storage and one-time consume. Real local HTTP tests exercise PKCE, CSRF and callback rejection, token exchange/refresh/expiry/revocation, MCP initialization and tools. Identity and external ChatGPT are synthetic there; this is not a production OAuth acceptance test.

At the repository root, `node --test tests/*.test.cjs` covers app and bridge behavior. Build the browser fixture with `node tests/build-sync-browser.cjs`, then run `tests/ai-assistant-browser.cjs` with Playwright/Chrome available. Its synthetic mobile/desktop checks preserve manual workflows and exercise enabled/revoked/undo controls. Physical Safari remains unverified.

Production dependencies reported no audit advisories when checked. Firebase's development-only emulator/test dependency tree reports advisories; those packages are pruned from the runtime image. Do not expose the emulator publicly. Recheck audits before deployment; do not blindly downgrade the Firebase SDK to satisfy an audit suggestion.

## Activation later: approvals and exact order

**Do not execute these steps just to review code.** They create paid infrastructure, production permissions or persistent credentials. Francois has asked to leave these off for now.

1. Obtain specific approval for billing/Cloud Run and expected costs; runtime IAM; Secret Manager credentials; OAuth client/consent; Firebase authorized domain/protected rules; and the app release. Real financial test approval is separate.
2. Review the branch, source hashes, candidate rules, backup/restore and deletion procedures. Rerun isolated tests. Export an owner-controlled Daily backup. No account is enabled automatically.
3. In ChatGPT web → Plugins → Add → Add custom MCP server, choose URL/OAuth and record the **exact callback shown**. Use preconfigured public client ID `daily-fuji`, without a client secret. Do not guess a callback or create the connection before the service is ready. Follow [OpenAI OAuth setup](https://developers.openai.com/plugins/build/auth); this issuer advertises response issuer identification.
4. After credential approval, run `prepare-secrets.mjs` in a private operator environment with `DAILY_APPROVED_OPERATION=create-connector-secrets`. It creates a new `.local` directory with three secret files and prints no values. Import them directly into Secret Manager. Restrict and then securely remove local copies according to operator policy. Never paste them into chat, Git, public config or screenshots. Rotation must retain required old keys or explicitly revoke/reconnect grants; replacing encryption keys invalidates old artifacts.
5. Build from the repository root with `docker build -f remote/Dockerfile .`; publish the image and deploy Cloud Run with the reviewed dedicated identity. Allow public HTTP invocation for OAuth metadata/consent; `/mcp` and account APIs enforce authentication themselves. Set min 0/max 1, request-based CPU, a suitable request timeout and budget alerts. Use the Cloud Run HTTPS origin; a paid custom domain is unnecessary.
6. Configure the variables below using Secret Manager bindings for secrets, not literal command arguments. Copy only public Firebase web configuration from Daily. Add the connector hostname to Firebase Auth's authorized domains. Verify email and Google sign-in in the phone browser.
7. Prepare the Daily release with `window.DAILY_REMOTE_CONFIG={origin:'https://YOUR-SERVICE'}`. Publish before account activation. Cache v407 is prepared here; use a newer number if another release has happened meanwhile. Update all active devices, sync pending edits and reload.
8. After rule approval, compare live rules, then deploy the candidate **only to the database**, not the existing notification functions. Use an explicit temporary Firebase config pointing to `remote/database.rules.candidate.json` and the verified project ID. The existing production configuration is intentionally untouched in this branch.
9. With operator ADC and `DAILY_DATABASE_URL`, run `node admin.mjs plan` to compare installed rules. For the exact verified owner UID, run `node admin.mjs enable UID` only with `DAILY_APPROVED_OPERATION=enable:UID`. It refuses a rules mismatch, validates record IDs, and does not rewrite financial records. Reload all devices; resolve any missing baseline by exporting/reviewing local data. Verify with an isolated test account before the real owner.
10. Finish creating the ChatGPT plugin using the HTTPS `/mcp` URL. Complete real Daily sign-in/consent for only bill reading and expense creation. Enable the plugin for **Fuji**. Check identity, permissions and expiry in Daily and through Fuji's `connection_status`. A grant alone is not proof of a successful tool call.
11. Perform the iPhone test below. Only then describe this as deployed **and verified end to end**.

| Runtime variable | Contents |
|---|---|
| `DAILY_CONNECTOR_ORIGIN` | Exact public HTTPS origin, no trailing slash |
| `DAILY_DATABASE_URL` | Existing Firebase database URL |
| `DAILY_OAUTH_REDIRECT_URIS` | JSON array of exact ChatGPT callback URI(s) |
| `DAILY_FIREBASE_WEB_CONFIG` | Public Firebase configuration JSON for Daily's existing project |
| `DAILY_OIDC_JWKS` | Secret Manager: private signing JWKS |
| `DAILY_COOKIE_KEYS` | Secret Manager: JSON array of long cookie signing keys |
| `DAILY_CONNECTOR_KEY` | Secret Manager: 32 random bytes, base64, for encryption and domain-separated HMAC |
| `TZ` | `Australia/Sydney`, set by Dockerfile |

Operator maintenance: `admin.mjs revoke-all UID` requires its exact matching approval value and retains protected sync. `prune-oauth` removes at most 100 expired artifacts per model per run, with its own approval value; run manually or schedule only after approving maintenance. Finance receipts/tombstones remain. Restore an unavailable service without relaxing rules. Rolling back to v406 after activation requires a reviewed data migration because v406 lacks the protected transport.

## Real iPhone acceptance: still outstanding

1. Open the actual ChatGPT iPhone app and existing **Fuji** Dot conversation. Confirm the plugin is available there. Turn the laptop fully off. This local coding task cannot supply that physical proof.
2. Ask Fuji to verify the Daily account and read scheduled bills for explicit dates. Compare dates/amounts with Daily. Scheduled/past-due does not establish unpaid/paid status.
3. Before writing, Francois chooses and explicitly approves **one exact** test AUD amount, date, description, existing category and account. It records an expense only; it does not change a balance or make a payment.
4. Preview/commit under one stable request ID, retaining platform confirmations. Retrieve its durable result/record ID and confirm exactly one expense in Daily. Retry the same ID to verify it still identifies that single record.
5. Only after separate undo approval, undo that exact request and confirm its `undone` receipt. Revoke in Daily; Fuji's next tool call must fail. Reconnect through OAuth if desired.

If the exact iPhone Dot cannot use the plugin, record that platform/account limitation and stop activation. Do not substitute another app or claim success based on a desktop demo.
