# Diagnostics / Recovery Work Status

This document captures the current legacy-server stabilization program on the
`diagnostics-recovery` branch. Further legacy work is justified only when it
fixes a current operational defect, adds support/recovery needed to operate the
server safely, or produces compatibility knowledge/tooling reusable by the
replacement server.

## Four-stage program

1. Reduce problems that are currently "fixed" by a hard reload.
2. Make the LTI / Canvas grade-sync indicator report real assignment-specific connection state.
3. Add student/support grade-sync diagnostics for cases where Canvas grades do not update.
4. Add student-driven recovery actions and record those actions for support.

Root causes should be corrected before recovery controls are added, so recovery
features do not hide defects.

## Stage 1 — reload-sensitive runtime hardening

Status: **closed for the defects identified in this audit**.

Completed/validated work includes latest-publication navigation, cache-safe
application generations, retirement of the legacy service worker/cache paths,
bounded optional-interactive loading, removal of synchronous startup subpath
discovery, stale WebSocket recycling, and retirement of the obsolete Update UI.
A controlled SIGSTOP/SIGCONT test verified the stale-heartbeat recovery path
without replacing the application process.

No further Page Runtime Coordinator architecture is planned for its own sake.

## Late Canvas passback policy — implemented and verified

Late passback became a prerequisite for trustworthy Stage 2/3 diagnostics and
is implemented on the branch and deployed on the test VM.

Current policy:

- normal passback before `dueDate`;
- late passback through Canvas `untilDate` when available;
- documented 130-day fallback horizon when Canvas supplied no `untilDate`;
- read current Canvas `readResult` immediately before a late write;
- never knowingly lower the current effective Canvas grade;
- defer near the next late interval boundary so safety prediction and write use the same interval;
- read Canvas immediately after an accepted late write and store the raw/effective observation.

Controlled Canvas testing established that `readResult` is the effective
post-penalty score and that Canvas can retroactively recalculate an existing
submission when the due date changes.

### Authoritative evidence rules

Only an immediate post-write `readResult` is allowed to teach Canvas
late-policy mechanics. Pre-write reads remain current-state truth, but cannot be
interpreted causally as the transformation of an earlier Xronos passback.

Exact context-wide deduction evidence outranks weaker bridge-local lower-bound
evidence. This rule was added after a controlled test reproduced a lowering
defect: a manually-entered Canvas grade of 3.50/10 caused local evidence to
infer an optimistic deduction rate and Xronos incorrectly submitted a result
that Canvas reduced to 3.36/10. The corrected implementation blocks that exact
reproduction in regression tests.

Grade floors are learned only from authoritative post-write observations that
exceed an already-known exact floorless prediction. A merely low observed grade
is not considered floor evidence.

The regression runner is `scripts/run-late-grade-regression.sh`; the targeted
suite has 33 passing tests after floor inference was added. The real controlled
observation history was also checked read-only: four authoritative post-write
observations derive an exact 10% deduction per late interval and no grade floor;
ambiguous pre-write observations are excluded.

Validated/deployed test application commit:

`fd3f10741e5a13b46cf9a5456f3643a2a6574dcf`

Rollback container retained on the test VM:

`devximserver-pre-late-floor`

### Manual-grade behavior

A controlled test showed that a later automatic LTI passback can replace a
manually entered Canvas grade. Reliable manual-grade provenance is not available
from the current LTI 1.1 `readResult` interface, so legacy Xronos will not add
heuristic manual-grade suppression at this time. The non-lowering invariant
still applies.

## Student reset utility — implemented and verified

`scripts/reset-student-data.js` provides a guarded reset path for repeated Test
Student work and rare support resets.

Safety behavior:

- dry-run by default;
- default target is the unique Xronos user named exactly `Test Student`;
- `--execute` required for mutation;
- explicit `--user OBJECT_ID` targeting supported;
- executing an explicit-user reset also requires `--confirm-non-test`;
- `User` identity is preserved;
- State, Completion, ProgressMilestone, AuditToken, LtiBridge, and queued Redis gradebook members are removed;
- context-wide late-policy evidence is preserved by default and removed only with `--purge-policy-evidence`.

The full Test Student scrub was exercised on the separate test VM. It removed
72 State records, 63 Completion records, 19 ProgressMilestones, 10 LTI bridges,
8 explicitly-selected controlled late-policy observations, and one queued Redis
gradebook member while preserving the same Test Student User ObjectId and LTI
user id. A follow-up dry run reported zero disposable records.

## Stage 2 — grade-sync indicator

Status: **core implementation complete; server-route integration prepared but not yet applied/deployed**.

The student-facing question is deliberately narrow:

> Is this Xronos assignment currently connected in the way required for progress to reach this Canvas assignment?

Student-facing vocabulary:

- `Grade sync connected`
- `Grade sync not connected`
- `Grade sync closed`
- `Checking grade sync`
- `Grade sync unavailable`

Implemented components:

- `lib/grade-sync-status.js` classifies no bridge, missing passback fields,
  closed window, passback-ready, queued/pending, and Canvas-accepted states;
- `public/javascripts/grade-sync-presentation.js` collapses usable open states
  to the student-facing `Grade sync connected` pill while retaining detailed
  transport state for diagnostics;
- `public/javascripts/gradebook.js` now uses the shared presentation policy and
  no longer hard-codes the obsolete `Grade syncing` / `Grade not syncing`
  labels;
- `lib/grade-sync-runtime.js` reads actual membership in the Redis `gradebook`
  sorted set and builds the status from real queue evidence instead of
  request-local placeholder counters;
- queue lookup failure is recorded as `queueStatusAvailable=false` without
  falsely turning an otherwise usable bridge into a disconnected state.

A guarded one-time integration patcher is prepared at:

`scripts/modernization/apply-grade-sync-integration.js`

It asserts the exact current route/login source before editing and is covered by
regression tests. It replaces the old inline route classifier with the runtime
evidence helper and returns the shared status from the gradebook response.

## Stage 3 — grade-sync diagnostics

Status: **diagnostic model and launch-reference mechanism complete; route integration prepared but not yet applied/deployed**.

Implemented components:

- `lib/lti-bridge-diagnostics.js` classifies exact assignment/context/resource
  match, same-context/different-resource, same-page/different-context, missing
  metadata, and no matching bridge;
- `lib/grade-sync-runtime.js` emits a sanitized per-bridge passback snapshot
  containing capability/open/queued/accepted/window information without
  sourcedids, OAuth keys, outcome URLs, secrets, cookies, or full LTI payloads;
- `lib/grade-sync-diagnostic-report.js` combines bridge-match evidence with the
  runtime passback snapshot into a versioned privacy-safe report;
- missing current-session launch identity is reported explicitly as
  `current-launch-reference-unavailable` rather than guessed from historical
  bridge data;
- `lib/lti-launch-reference.js` records only the saved bridge id,
  consumer/context/resource identifiers, Xronos repository/path, and timestamp
  in the session. It does not retain the launch POST body or credentials.

The guarded integration patcher records the saved LTI bridge as the current
session launch reference and returns `gradeSyncDiagnostics` alongside
`gradeSync` from the gradebook response. Because the existing gradebook query
already returns all bridges for the same user + Xronos assignment path, this is
enough to diagnose the duplicate-Canvas-assignment and different-context cases
seen in testing without adding another database query to every progress update.

Diagnostic wording intentionally avoids claiming that a student never launched
from Canvas merely because Xronos lacks a matching bridge record.

## Grade-sync regression runner

`scripts/run-grade-sync-regression.sh` is the reusable Stage 2/3 test entrypoint.
It covers the status classifier, student presentation, LTI bridge diagnostics,
Redis runtime evidence, diagnostic report, launch-session reference, browser
integration contract, and the guarded route/login patcher.

## Stage 4 — recovery

Status: **not started beyond support tooling**.

The verified Test Student reset utility is operational support tooling, not the
student-facing Stage-4 recovery UI.

Student-facing recovery should be added only after Stage 2/3 expose enough
evidence to distinguish a stale/missing bridge, closed passback window,
transient status failure, and healthy connection. Recovery actions should record
what was attempted so support can interpret repeated failures without asking the
student to reconstruct browser behavior from memory.
