# Diagnostics / Recovery Work Status

This document captures the current legacy-server stabilization program on the
`diagnostics-recovery` branch. It is intentionally narrower than the older
Page Runtime Coordinator design documents: further legacy work is justified
only when it fixes a current operational defect, adds support/recovery needed
to operate the server safely, or produces compatibility knowledge/tooling that
is reusable by the replacement server.

## Four-stage program

1. Reduce problems that are currently "fixed" by a hard reload.
2. Make the LTI / Canvas grade-sync indicator report real sync state.
3. Add student-facing grade-sync diagnostics for cases where Canvas grades do
   not update.
4. Add student-driven recovery actions and record those actions for support.

Root causes should be corrected before recovery controls are added, so recovery
features do not hide defects.

## Stage 1 — reload-sensitive runtime hardening

Status: **closed for the defects identified in this audit**.

### Publication / cache policy

The legacy per-learner historical-publication selection has been retired.
Every new page request, navigation, or reload now selects the latest published
activity. An already-open browser tab is not forcibly replaced mid-session.
Old `State` records remain stored; if the latest publication has a different
activity hash it naturally receives a fresh state record.

Consequences:

- old `?<commitSHA>` publication-selection URLs no longer select historical
  content;
- the old manual Update modal is obsolete and is no longer triggered;
- repository-served mutable assets use revalidation so page and repository
  assets share the same latest-publication intent;
- normal reload/navigation is the transition to the newest publication.

A controlled republish test verified that Redis publication-history cache
invalidation occurs on publication, a normal reload selects the newest
publication, an old explicit commit query cannot pin the page backward, and an
already-open tab remains unchanged until navigation/reload.

### Browser cache / application generation

Application-owned static assets use the application-version namespace and
immutable caching. Unversioned compatibility paths revalidate. The legacy
service worker and legacy browser Cache Storage entries are retired. A stale
application-version marker is detectable.

### Optional interactive dependencies

Optional external interactive libraries no longer wait indefinitely. Desmos
loading is bounded, generic optional interactive dependency failures are
contained to the relevant interactive, and failure is recorded through the
privacy-safe runtime diagnostics instead of blocking unrelated page content.

### Startup ordering

The synchronous startup `HEAD` request that existed only to discover the
Xronos subpath has been removed. Normal layouts now render
`meta[name="xronos-subpath"]`; browser startup reads that metadata with a
local-storage fallback for malformed/nonstandard pages.

Existing activity initialization remains gated by the initial-state protocol.
The audit did not find evidence that additional Page Runtime Coordinator
architecture would improve current operational reliability, so no new
coordinator work is planned for its own sake.

### State WebSocket recovery

The state WebSocket now:

- actively recycles a transport whose heartbeat is stale rather than leaving a
  locally-`OPEN` socket in place;
- retries after WebSocket construction failure instead of falling through into
  listener setup on an invalid socket;
- binds sends and message handlers to the socket that actually raised the
  event rather than the mutable module-global socket;
- ignores close/error events from superseded sockets;
- clears the current socket before the existing reconnect/backoff path runs.

The old publication-update WebSocket handler now records only a
`new-publication-available` runtime event with the action
`use-latest-on-next-navigation`; it does not expose the obsolete manual Update
button.

### Stage-1 validation completed on the test VM

Validated application commit:

`74cc17f0aead8ca2592cc117133263c06de93e2b`

Validation included:

- focused reload-sensitive contract tests;
- existing application-version, legacy-cache, static-asset, initial-state, and
  runtime-coordinator tests;
- full frontend build;
- deployed version / repository / container-marker identity checks;
- normal browser save -> reload -> restore, followed by edit -> save -> reload
  -> restore;
- normal browser offline recovery: the support banner reported that work was
  not syncing, connectivity was restored without reloading, a new answer was
  saved, and the new value survived a later normal reload;
- half-dead WebSocket recovery: only the in-container `node app.js` process was
  suspended with `SIGSTOP` while the container, TCP stack, Mongo, Redis, and
  SageCell remained running. The browser raised the sync-warning banner during
  the stall, the warning cleared immediately after `SIGCONT`, and a new answer
  saved after recovery survived a later normal reload. The same application
  PID survived the STOP/CONT test.

This directly validates the stale-heartbeat recovery path rather than only the
ordinary socket-close path.

## Stage 2 — grade-sync indicator audit

Status: **in progress**.

### Current semantic defect

The current green `Grade syncing` indicator is not proof that the current
best grade has reached Canvas. The server currently classifies a bridge as
`syncing` when it is passback-capable and still open: it has
`lisResultSourcedid`, `lisOutcomeServiceUrl`, a positive Canvas
`pointsPossible`, and is not beyond the bridge due date.

That is a useful **connection/capability** fact, but it is weaker than actual
sync state.

The data model and gradebook worker already contain stronger signals:

- `LtiBridge.submittedScore` is set to `false` when a better Xronos score is
  recorded and is set to `true` only after Canvas returns both HTTP 2xx and an
  IMS response containing `imsx_codeMajor=success`;
- pending passbacks live in the Redis sorted set `gradebook`;
- the current grade-sync response already contains placeholder
  `queuedGradePassbackCount` / `queuedGradePassback` fields, but they are not
  populated;
- the current response distinguishes `no-bridge`, `missing-passback-fields`,
  `grade-passback-closed`, and `active-passback`.

Therefore Stage 2 should not treat `active-passback` as synonymous with
"synced".

### Proposed Stage-2 status model

Keep bridge/capability reasons available for diagnostics, while exposing a
student-facing state based on the strongest evidence available:

1. **no-bridge** — no bridge for this user/repository/path.
2. **missing-passback-fields** — a bridge exists but cannot pass a grade to
   Canvas.
3. **grade-passback-closed** — a passback-capable bridge exists but its grade
   passback window is closed.
4. **passback-ready** — an open, passback-capable bridge exists, but there is
   no evidence that the current best score has been accepted by Canvas and it
   is not currently known to be queued.
5. **passback-pending** — the current bridge is present in the Redis gradebook
   queue (including transient retry requeues).
6. **passback-accepted** — `submittedScore === true`, meaning the last queued
   best score for that bridge received an accepted Canvas LTI 1.1 passback
   response.

If a permanent Canvas failure leaves `submittedScore === false` and no queue
entry, that is materially different from both pending and accepted. Stage 2
should preserve enough reason information for Stage 3 to explain this case
without incorrectly claiming that the student never launched from Canvas.

### Stage-2 implementation boundary

The next code change should:

- populate queue state from Redis instead of leaving the queue fields dead;
- classify each relevant bridge with the strongest available evidence;
- avoid the label `Grade syncing` when the only known fact is bridge
  capability;
- retain safe reason codes for the later Stage-3 diagnostic report;
- add focused tests for the status classifier before changing student-visible
  wording;
- avoid storing OAuth secrets, cookies, authorization headers, full LTI POST
  bodies, or other unnecessary personal data.

No LTI 1.3 migration is part of this legacy-server work; the purpose is to make
existing LTI 1.1 behavior observable and supportable.
