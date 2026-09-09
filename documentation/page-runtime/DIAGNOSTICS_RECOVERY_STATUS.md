# Diagnostics / Recovery Work Status

This document captures the current legacy-server stabilization program on the
`diagnostics-recovery` branch. It is intentionally narrower than the older
Page Runtime Coordinator design documents: further legacy work is justified
only when it fixes a current operational defect, adds support/recovery needed
to operate the server safely, or produces compatibility knowledge/tooling that
is reusable by the replacement server.

## Four-stage program

1. Reduce problems that are currently "fixed" by a hard reload.
2. Make the LTI / Canvas grade-sync indicator report real assignment-specific connection state.
3. Add student/support grade-sync diagnostics for cases where Canvas grades do not update.
4. Add student-driven recovery actions and record those actions for support.

Root causes should be corrected before recovery controls are added, so recovery
features do not hide defects.

## Stage 1 — reload-sensitive runtime hardening

Status: **closed for the defects identified in this audit**.

The major Stage-1 changes are complete and validated on the test VM:

- every new navigation/reload selects the latest publication rather than a historical learner-pinned blob;
- old explicit commit-query selection no longer pins normal learner navigation backward;
- application-owned static assets use application-version namespaces and cache-safe routing;
- legacy service-worker/cache-storage behavior is retired;
- optional external interactives use bounded failure handling rather than blocking the page indefinitely;
- synchronous startup subpath discovery was removed in favor of rendered metadata;
- stale/half-dead WebSockets are actively recycled;
- obsolete Update UI is removed while already-open tabs remain stable until navigation/reload.

A controlled SIGSTOP/SIGCONT test verified stale-heartbeat recovery without replacing the application process. Normal save/reload, offline recovery, publication refresh, and browser-generation checks also passed.

No further Page Runtime Coordinator architecture is planned for its own sake.

## Late Canvas passback policy — implemented and verified

Late passback became a prerequisite for trustworthy Stage 2/3 diagnostics and is now implemented on the branch and deployed on the test VM.

Current policy:

- normal passback before `dueDate`;
- late passback through Canvas `untilDate` when available;
- documented 130-day fallback horizon when Canvas supplied no `untilDate`;
- read current Canvas `readResult` immediately before a late write;
- never knowingly lower the current effective Canvas grade;
- defer near the next late interval boundary so safety prediction and write use the same interval;
- read Canvas immediately after an accepted late write and store the raw/effective observation.

Controlled Canvas testing established that `readResult` is the effective post-penalty score and that Canvas can retroactively recalculate an existing submission when the due date changes.

### Authoritative evidence rules

Only an immediate post-write `readResult` is allowed to teach Canvas late-policy mechanics. Pre-write reads remain current-state truth, but cannot be interpreted causally as the transformation of an earlier Xronos passback.

Exact context-wide deduction evidence outranks weaker bridge-local lower-bound evidence. This rule was added after a controlled test reproduced a real lowering defect: a manually-entered Canvas grade of 3.50/10 caused local evidence to infer an optimistic deduction rate and Xronos incorrectly submitted a result that Canvas reduced to 3.36/10. The corrected implementation blocks that exact reproduction in regression tests.

Grade floors are learned only from authoritative post-write observations that exceed an already-known exact floorless prediction. A merely low observed grade is not considered floor evidence.

The late-grade regression runner is:

`scripts/run-late-grade-regression.sh`

Current targeted suite: 33 passing tests after floor inference was added.

The real controlled observation history was also checked read-only: four authoritative post-write observations derive an exact 10% deduction per late interval and no grade floor; ambiguous pre-write observations are excluded.

Validated/deployed test application commit for this work:

`fd3f10741e5a13b46cf9a5456f3643a2a6574dcf`

Rollback container retained on the test VM:

`devximserver-pre-late-floor`

### Manual-grade behavior

A controlled test showed that a later automatic LTI passback can replace a manually entered Canvas grade. Reliable manual-grade provenance is not available from the current LTI 1.1 `readResult` interface, so legacy Xronos will not attempt heuristic manual-grade suppression at this time. Policy discussion may revisit this later.

## Student reset utility — implemented and verified

`scripts/reset-student-data.js` provides a guarded reset path for repeated Test Student work and rare support resets.

Safety behavior:

- dry-run by default;
- default target is the unique Xronos user named exactly `Test Student`;
- `--execute` required for mutation;
- explicit `--user OBJECT_ID` targeting supported;
- executing an explicit-user reset also requires `--confirm-non-test`;
- `User` identity is preserved;
- State, Completion, ProgressMilestone, AuditToken, LtiBridge, and queued Redis gradebook members are removed;
- context-wide late-policy evidence is preserved by default and removed only with `--purge-policy-evidence`.

The full Test Student scrub was exercised on the separate test VM. It removed 72 State records, 63 Completion records, 19 ProgressMilestones, 10 LTI bridges, 8 explicitly-selected controlled late-policy observations, and one queued Redis gradebook member while preserving the same Test Student User ObjectId and LTI user id. A follow-up dry run reported zero disposable records.

## Stage 2 — grade-sync indicator

Status: **classifier/presentation complete; live integration in progress**.

The student-facing question is deliberately narrow:

> Is this Xronos assignment currently connected in the way required for progress to reach this Canvas assignment?

Student-facing vocabulary:

- `Grade sync connected`
- `Grade sync not connected`
- `Grade sync closed`
- `Checking grade sync`
- `Grade sync unavailable`

The server-side classifier already distinguishes:

- no bridge;
- bridge missing passback fields;
- passback window closed;
- open/passback-ready bridge;
- queued/pending bridge;
- Canvas-accepted passback.

Detailed ready/pending/accepted transport state belongs in diagnostics while all usable open states collapse to `Grade sync connected` for the primary pill.

Remaining Stage-2 integration work:

- replace the old inline route classifier with `lib/grade-sync-status.js`;
- populate queue state from Redis rather than incrementing placeholder counts only when the current request happens to enqueue something;
- replace the old browser `Grade syncing` presentation with `public/javascripts/grade-sync-presentation.js`;
- preserve graceful behavior when queue-state lookup itself is unavailable;
- add route-level integration regression before deployment.

## Stage 3 — grade-sync diagnostics

Status: **classification core complete; response/UI integration in progress**.

`lib/lti-bridge-diagnostics.js` classifies privacy-safe retained bridge metadata into:

- exact assignment/context/resource-link match;
- same Canvas context, different assignment/resource link;
- same Xronos page, different Canvas context;
- missing bridge launch metadata;
- no matching bridge recorded.

Diagnostic wording intentionally avoids claiming that a student never launched from Canvas merely because Xronos lacks a matching bridge record.

Next Stage-3 integration should combine:

- launch/bridge-match classification;
- passback capability/open/queued/accepted state;
- due/lock timestamps and passback-window source;
- current candidate/last accepted bridge state where useful;
- a reason when queue state cannot be checked.

No full LTI POST bodies, OAuth secrets, cookies, authorization headers, or unrelated PII should be retained or exposed.

The immediate implementation target is a privacy-safe diagnostic snapshot returned alongside the gradebook response so the browser/support UI can consume the same evidence without creating another persistence layer.

## Stage 4 — recovery

Status: **not started beyond support tooling**.

The verified Test Student reset utility is operational support tooling, not the student-facing Stage-4 recovery UI.

Student-facing recovery should be added only after Stage 2/3 expose enough evidence to distinguish a stale/missing bridge, closed passback window, transient status failure, and healthy connection. Recovery actions should record what was attempted so support can interpret repeated failures without asking the student to reconstruct browser behavior from memory.
