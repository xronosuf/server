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
used.

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

## Current repository state

Implemented but **not wired into the live application**:

- `public/javascripts/grade-sync-recovery-policy.js`
- `routes/grade-sync-recovery.js`
- `test/grade-sync-recovery-policy.js`
- `test/grade-sync-recovery.js`

These files are included in the grade-sync regression runner, but no `app.js`
route and no browser recovery button have been installed yet. This keeps the
already-passing Stage 3 support-report work independently deployable.

## Remaining integration work

After Stage 3 support-report deployment/acceptance:

1. mount a guarded POST route such as
   `/:repository/:path(*)/grade-sync-recovery` using
   `repositories.normalizeName` and `gradeSyncRecovery.recordAndRecheck`;
2. use `grade-sync-recovery-policy.js` inside the grade-sync `?` modal;
3. add **Recheck grade sync** only for policy states that can benefit from a
   read-only recheck;
4. display Canvas-relaunch guidance for launch/bridge mismatch states without
   pretending Xronos can synthesize the missing LTI launch;
5. record the guidance/recheck action through the recovery endpoint;
6. on successful recheck, replace the modal/pill's current status and diagnostic
   snapshot with the newly returned evidence;
7. retain recovery event ids in the browser's bounded support-report context so
   a copied report can correlate with server-side recovery history;
8. browser-test healthy, unavailable, wrong-assignment/context, missing bridge,
   and closed-window cases before considering Stage 4 complete.

No automatic grade passback, bridge deletion/recreation, saved-state clearing, or
forced page reload belongs in this Stage 4 recovery path unless later evidence
shows a specific defect that requires it.
