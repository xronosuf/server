# Stage 4 — Student recovery design

This document captures the intended student-facing recovery work that follows the
validated Stage 2/3 Canvas grade-sync diagnostics.

Stage 4 must not turn every problem into a reload button. Recovery is selected
from the evidence already produced by Stage 2/3, and recovery attempts are
recorded so support can distinguish repeated failures from first-time reports.

## Recovery classes

### Healthy connection

Examples:

- `passback-ready`
- `passback-pending`
- `passback-accepted`
- another state with an active grade-passback bridge

Student action: none. Do not show a recovery button merely because the detailed
transport state differs from the simplified `Grade sync connected` pill.

### Closed passback window

Evidence: `grade-passback-closed`.

Student action: no automatic recovery. Reopening the assignment from Canvas does
not reopen a closed passback window. Direct the student to the configured support
contact/instructor and make the Stage 3 diagnostic report available.

### Transient/unavailable status

Examples:

- browser/server grade-sync request failure;
- queue evidence unavailable;
- otherwise unknown disconnected state where a fresh read could resolve the
  uncertainty.

Student action: **Recheck grade sync**.

The recheck is read-only with respect to Canvas grades. It rereads the current
Xronos bridge + Redis queue evidence and current-session launch reference. It
must not submit a grade, create a bridge, clear state, or reload the page.

### Missing/stale/wrong Canvas launch identity

Examples:

- `current-launch-reference-unavailable`;
- `no-matching-bridge`;
- `same-context-different-assignment`;
- `same-page-different-context`;
- `missing-launch-metadata`;
- no bridge / missing grade-passback fields.

Student action: **Reopen this assignment from Canvas**.

Only a real LTI launch can create or refresh the assignment-specific bridge.
Xronos should not fabricate a replacement bridge or guess Canvas context/resource
identity from historical records.

## Recovery event recording

The Stage 4 scaffold defines `GradeSyncRecoveryEvent` in
`routes/grade-sync-recovery.js` without modifying the central legacy `mdb.js`
model list. The model is created lazily only when the recovery route is actually
used. The collection name is explicitly pinned to `gradeSyncRecoveryEvents` so
support tooling can read it without instantiating the Mongoose model.

A recovery record contains only:

- generated event id;
- authenticated Xronos user id;
- repository/path;
- bounded action name;
- observation/expiry timestamps;
- grade-sync state/reason;
- launch-match primary category;
- whether a current launch reference exists;
- bridge counts / active-passback count / queue-evidence availability;
- current launch bridge id when available.

It deliberately excludes sourcedids, OAuth keys/secrets, outcome URLs, cookies,
full LTI POST data, grades, answer state, and arbitrary client payloads.

Initial retention policy is 90 days through a TTL index. This is long enough for
ordinary course support while preventing indefinite accumulation of recovery
telemetry. The retention period can be revisited before production rollout.

Persistence failure must not prevent the student from receiving a fresh status
snapshot; the response reports whether the recovery event was successfully
recorded.

## Support-report correlation

Stage 4 advances the copied `xronos-grade-sync-report` to schema version 2. The
report retains at most the five most recent recovery response summaries from the
current browser page:

- recovery event id;
- bounded action name;
- whether the server recorded the event;
- observation timestamp.

The browser history is deliberately bounded and passes through the same
allowlist-style report builder as the Stage 3 diagnostic data. Arbitrary server
or client response fields cannot flow into the copied report.

`scripts/grade-sync-recovery-report.js` is a read-only support lookup command. It
requires either `--event EVENT_ID` or `--user USER_OBJECT_ID`, accepts optional
repository/path filters and a bounded limit, queries the pinned collection
directly, and prints only the recovery-event fields listed above. It does not
instantiate the recovery-event model and does not create indexes or write data.

## Current repository state

Implemented but **not yet wired into the live application**:

- `public/javascripts/grade-sync-recovery-policy.js`;
- `routes/grade-sync-recovery.js`;
- bounded recovery correlation in `grade-sync-support-report.js`;
- read-only `scripts/grade-sync-recovery-report.js`;
- policy/event/report/integration-patcher regression tests;
- guarded `scripts/modernization/apply-grade-sync-recovery-integration.js`;
- non-mutating `scripts/run-grade-sync-recovery-preflight.sh`.

The operational `app.js` route and browser recovery controls remain absent until
the non-mutating preflight is run against the reconciled Stage 4 checkout. This
keeps the already-live-validated Stage 3 application independently recoverable.

## Remaining integration work

After reconciling the checkout with the Stage 4 branch:

1. run `scripts/run-grade-sync-recovery-preflight.sh`; it patches only temporary
   copies, checks idempotence/syntax/contracts, runs the grade-sync regressions,
   and verifies real `app.js` / `gradebook.js` hashes are unchanged;
2. apply the guarded recovery integration patcher to mount
   `/:repository/:path(*)/grade-sync-recovery` with
   `repositories.normalizeName` and `gradeSyncRecovery.recordAndRecheck`;
3. use `grade-sync-recovery-policy.js` inside the grade-sync `?` modal;
4. add **Recheck grade sync** only for policy states that can benefit from a
   read-only recheck;
5. display Canvas-relaunch guidance for launch/bridge mismatch states without
   pretending Xronos can synthesize the missing LTI launch;
6. record the guidance/recheck action through the recovery endpoint;
7. on successful recheck, replace the modal/pill's current status and diagnostic
   snapshot with the newly returned evidence;
8. retain the five most recent recovery event correlations in copied support
   reports;
9. browser-test healthy, unavailable, wrong-assignment/context, missing bridge,
   and closed-window cases before considering Stage 4 complete.

No automatic grade passback, bridge deletion/recreation, saved-state clearing, or
forced page reload belongs in this Stage 4 recovery path unless later evidence
shows a specific defect that requires it.
