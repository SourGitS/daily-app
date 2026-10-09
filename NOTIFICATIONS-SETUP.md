# Daily notifications — local implementation and activation

Prepared 9 October 2026. **Client commit and push authorised; Firebase setup deferred. Remote
push delivery has not been verified.** Do not enable billing, deploy the backend or activate
the push feature flag until Francois explicitly asks to revisit it.

## What is ready

Settings → Account → Reminders has separate workout and budget reminders, workout prompts,
budget update prompts, and weekly report prompts. New categories default off. Each has a time,
selected weekdays and a frequency limit. Quiet hours skip alerts, including intervals spanning
midnight. Wording rotates between delivered occurrences. Weekly-report alerts open Stats → Review, workout
alerts open Log, and budget alerts open Finance. No notification permission request runs at
startup, on a timer, or when changing a category. Only an explicit enable button asks.

The existing `daily_reminders` object, enabled choices, times, legacy budget `day`, unrelated
fields and acknowledgement dates are retained. No boot migration, recipe change or new synced
application store was introduced. Reminder preferences remain specific to the current account
on this device and retain their existing backup path. Closed-app settings are mirrored to the
device connection only after explicit connection or a subsequent user edit/restore. Push
subscriptions, device tokens and delivery receipts stay out of backups.

The optional open-app mode checks every 30 seconds while visible, and on resume. It uses the
service worker's notification API. It explicitly says it cannot deliver while Daily is closed.
An already configured reminder still needs the explicit device enable action in this build;
its chosen settings are preserved.

Closed-app delivery uses standard encrypted Web Push, a Firebase callable management endpoint,
and one Firebase scheduled function running each minute. GitHub Pages continues to host Daily.
No hosting migration or paid third-party notification vendor is necessary. The backend has no
ability to edit workout, finance or recipe records. It reads dated workout sessions to suppress
workout notifications and accepts an immediate completion signal from the current device.

## Decision needed before activation

Approve using the existing Firebase project `workout-tracker-5dd55` for this notification backend,
including a Blaze billing account if it is currently on Spark. The current billing plan and
deployed database rules were not inspected. This change does **not** enable billing.

Firebase documents Cloud Scheduler at **US$0.10 per job per month**, with three jobs per Google
account allowed at no charge. This implementation uses one job (about 43,200 function runs in a
30-day month). Function compute, database traffic, build/artifact storage, outbound traffic and
secret access may add charges. A free scheduler allowance is not a promise of a zero total bill.
Choose a billing budget and alert threshold before deployment; alerts are not a hard spending
cap. With small personal use, costs may be low, but a project-specific quote requires its
current quotas, region and usage. Sources:
[Firebase scheduled functions](https://firebase.google.com/docs/functions/schedule-functions),
[Firebase pricing](https://firebase.google.com/pricing).

No Apple Developer membership or APNs certificate is required for standard Web Push.
For iPhone/iPad, use iOS/iPadOS 16.4 or later, install Daily using Share → Add to Home Screen,
open that installed app, sign in, choose categories, then tap Enable notifications and allow
the system prompt. Permission denial leaves delivery off and provides Settings guidance.
[Apple's requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

## Deployment procedure after approval

1. Verify the existing production rules and account isolation. The private root
   `notificationDevices` must remain unreadable and unwritable by clients. The source rules
   already deny this root; existing `users/$uid` rules are unchanged. Do not overwrite different
   production rules without reviewing them.
2. Install Node 22 and Firebase CLI; run `npm ci --prefix functions` and
   `node functions/build.cjs`. `firebase.json` also rebuilds the shared scheduling module before
   deployment. Dependencies are pinned with a lockfile; installation audited with no known
   vulnerabilities at implementation time. Local tests used Node 24, not deployed Node 22.
3. Generate a VAPID key pair locally using `web-push.generateVAPIDKeys()`. Keep the private key
   out of this repository and GitHub Pages. Save `DAILY_VAPID_PUBLIC_KEY` and
   `DAILY_VAPID_PRIVATE_KEY` using Firebase Secret Manager. Set `DAILY_VAPID_SUBJECT` to a real
   administrator contact (`mailto:` or HTTPS). No contact address has been invented.
4. Deploy only the `daily-notifications` function codebase to the chosen project. Region is
   `australia-southeast1`. The callable allows the production origin `https://sourgits.github.io`
   and validates Firebase authentication, device ownership and subscription endpoints. Default
   Scheduler service-account IAM is handled by Firebase deployment. Confirm both callable and
   scheduled functions are healthy before enabling clients.
5. Put the public VAPID key in `js/notification-config.js` and enable its feature flag in an
   isolated test build first. Never put the private key there. The flag is intentionally false
   in this prepared build. Align the client and backend region. Changing keys later requires
   unsubscribing old subscriptions and reconnecting devices.
6. Test a fresh signed-in profile against an existing account without clearing its real data.
   Verify existing records are retained and that notification registration writes only its own
   device registry. This is still required by AGENTS.md before a production release.
7. Verify real closed-app delivery on an installed iPhone and a supported desktop/Android
   browser: choose a near-future time and day, close Daily, lock the device, confirm receipt and
   tap destination; repeat for all categories, quiet hours, denial, opt-out, saved workout,
   account switching and duplicate prevention. Use test accounts and synthetic content.
8. Release the client changes only after approval. Pushing `main` publishes GitHub Pages;
   it is deployment, not merely saving work. Cache version is prepared as `daily-v381`.

## Delivery guarantees and limits

- Server transactions claim each category/date once per device; multiple scheduler runs and
  tabs do not repeat it. IndexedDB receipts suppress duplicate push packets across worker
  restarts. A custom reminder takes priority over its matching system prompt on its chosen day.
- The 15-minute scheduling window catches short interruptions, not hours-old reminders.
  Payloads queue for at most 15 minutes and expire sooner at quiet hours or midnight. During a
  daylight-saving skipped hour, that occurrence is skipped; the repeated hour sends once.
- Delivery is **at most once**, not guaranteed exact-time delivery. An ambiguous transport
  timeout is not retried because it could duplicate an already delivered alert. If a process
  stops after claiming but before sending, that occurrence can be missed. Connectivity,
  browser/device policy and iPhone Focus can delay or prevent presentation.
- A workout already synced to the account, or recorded on the receiving device, suppresses
  workout alerts. A workout saved offline on a different device cannot be known by the server
  until it syncs. A notification dispatched before a workout is logged may already be queued;
  the receiving device suppresses it if it has recorded that workout locally.
- Quiet-hour alerts are skipped, not rescheduled. Wording invites a weekly review; it does not
  claim that a new report document has been generated.
- Stop all revokes the device token immediately, closes displayed notifications, unsubscribes
  the browser and disables the server connection. Failed server edits pause this device's
  delivery until retried online. Account changes revoke the binding before reload. Delayed old
  tokens cannot open another account. Preferences remain available for deliberate re-enabling.
- Connections expire after 30 days without opening Daily. Opening it renews the lease; an
  expired or invalid connection requires Enable notifications again. Expired subscriptions
  (HTTP 404/410) are disabled; stale registry entries are removed after their lease expires.
- Subscriptions from Apple, Google FCM and Mozilla are supported. Other push endpoint hosts
  are rejected rather than allowing the sender to contact arbitrary destinations.
- The dispatcher pages the device registry. This is designed for Daily's current small user
  count, not mass marketing. Larger deployments need a due-time index/queue and load tests.
- Browsers may revoke notification permissions for push events intentionally suppressed as
  stale/opted-out. Reconnect through the explicit enable action if permission is revoked.

## Verification evidence

Local automated checks cover preservation/defaults, weekdays/times, quiet hours, frequency,
time zones and DST, saved-workout suppression, repeated scheduler invocations, permission
denial, iPhone installation gating, offline-update retry, opt-out during a pending update,
device/account ownership, endpoint validation, expired subscriptions and all destinations.
All 548 Node checks pass, including 25 notification checks. JavaScript syntax and diff checks
pass. A stale Budget UI test now names the existing `routine` group instead of calling the
group-aware reader without an argument; no Budget behavior was changed.

The synthetic Firebase browser fixture passed at 320px, 390px and 1440px in light/dark themes:
settings save, no overflow, real IndexedDB claim transactions, review destination, workout
suppression, opt-out and account mismatch. A native Chrome service worker passed synthetic
push display, duplicate suppression, stale-account rejection, click URL under `/daily-app/`,
and queued-push rejection after opt-out. Production Firebase access was blocked in these tests.

These were **local/synthetic checks**, not remote Web Push or physical iPhone delivery.
No production account was read or changed, no billing was enabled, no service secrets were
created. Francois subsequently authorised committing and pushing the client update with
Firebase delivery disabled, accepting the disclosed limits. Backend activation remains deferred.
