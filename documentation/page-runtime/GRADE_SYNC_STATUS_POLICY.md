# Grade-sync status policy

This document records the Stage 2/3 policy for the legacy Xronos grade-sync indicator and diagnostics.

## Student-facing question

The grade-sync pill should answer one practical question:

> Is this Xronos assignment currently connected in the way required for progress to reach this Canvas assignment?

The pill is intentionally not a transport-debug display. Students should not need to distinguish a passback-capable bridge from a queued grade update or an already-accepted Canvas score.

## Student-facing states

The primary pill vocabulary is:

- `Grade sync connected`
- `Grade sync not connected`
- `Grade sync closed`
- `Checking grade sync`
- `Grade sync unavailable`

Detailed internal states such as passback-ready, passback-pending, and passback-accepted remain useful evidence for support and diagnostics, but collapse to `Grade sync connected` for the student-facing pill.

## Meaning of connected

`Grade sync connected` means Xronos has a currently usable assignment-specific Canvas grade-passback pathway for the learner and Xronos page being viewed.

An accepted Canvas passback is stronger evidence that the whole path has worked, but it is not required for the student-facing pill to be green. Requiring an already-accepted score would create false negatives during normal queue/debounce/retry windows.

## Meaning of not connected

`Grade sync not connected` means Xronos does not currently have a usable grade-passback pathway for this assignment. Typical underlying reasons include no matching bridge or a bridge missing required passback fields.

Student-facing wording should advise returning to Canvas and opening this assignment from its Canvas link. Diagnostic wording must not claim that the learner never launched from Canvas merely because no matching bridge record exists.

## Meaning of closed

`Grade sync closed` is distinct from `not connected`.

It means Xronos has Canvas grade-sync information for this assignment, but the grade-passback window that the legacy server actually enforces is closed. Reopening Xronos from Canvas will not by itself reopen that window.

This distinction is important because relaunch advice is appropriate for a missing connection but misleading when the assignment is already closed.

## Current legacy passback-window behavior

The legacy passback policy was deliberately changed during the diagnostics/recovery work so late work can continue to reach Canvas while Canvas still makes the assignment available.

The current behavior is:

- before `dueDate`, normal passback is allowed;
- after `dueDate`, passback remains available through `untilDate` when Canvas supplied `custom_lock_at`;
- when Canvas did not supply an `untilDate`, Xronos uses a documented 130-day fallback horizon after the due date;
- late writes perform a Canvas `readResult` immediately before passback and are allowed only when Xronos can prove that the resulting effective Canvas grade will not be lower than the current Canvas grade;
- a write near the next late-interval boundary is deferred so the safety prediction and Canvas write use the same late interval.

This replaces the older behavior that simply stopped passback at `dueDate`.

## Late-penalty evidence and the non-lowering invariant

The operational invariant is:

> Xronos must never knowingly replace the current Canvas grade with a lower effective grade.

Canvas applies its late policy after LTI 1.1 Basic Outcomes passback. `readResult` returns the effective post-penalty Canvas score. Xronos therefore models the late policy from observed raw/effective pairs.

Evidence rules are intentionally conservative:

- only the `readResult` taken immediately after an accepted Xronos passback is authoritative evidence for learning Canvas late-policy mechanics;
- a pre-write `readResult` is current Canvas truth for the non-lowering comparison, but is not causal evidence about how Canvas transformed a prior Xronos write;
- exact context-wide deduction evidence outranks weaker bridge-local lower-bound evidence;
- a grade floor is inferred only when an authoritative post-write observation exceeds the already-known exact floorless prediction;
- the lowest observed effective score is not, by itself, evidence of a floor;
- unexpected or inconsistent evidence blocks conservatively rather than triggering speculative policy relearning.

The model assumes the Canvas late policy is normally stable within a course/context. Mid-assignment policy changes are not an explicit legacy-server support target.

## Manual Canvas grades

The current legacy behavior allows a later automatic Xronos LTI passback to replace a manually entered Canvas grade. Controlled test-shell work confirmed that Canvas accepts such a replacement.

Whether instructor-entered grades should instead suppress all later automatic Xronos passback is a policy decision still to be discussed. Reliable detection would require stronger Canvas-side provenance than the existing LTI 1.1 `readResult` response provides, so no heuristic manual-grade suppression is being added to the legacy server at this time.

The non-lowering invariant still applies: Xronos must not knowingly submit an automatic result whose predicted effective Canvas grade is below the grade Canvas currently reports.

## Diagnostic layer

Stage 3 diagnostics may expose richer evidence, including:

- exact matching bridge recorded;
- same Canvas context but different resource link;
- same Xronos page but different Canvas context;
- bridge missing launch/passback metadata;
- no matching bridge recorded;
- passback-capable bridge;
- queued/retried passback;
- Canvas-accepted passback;
- unresolved open bridge where the current best score is not known to be accepted;
- passback window closed;
- relevant recorded due/lock timestamps;
- whether queue state itself was available when the diagnostic snapshot was built.

Use privacy-safe retained bridge metadata only. Do not store or expose full LTI launch POST bodies, OAuth secrets, cookies, authorization headers, or unrelated PII.

## Support wording

Absence of a matching bridge is evidence about Xronos records, not proof of learner behavior. Prefer wording such as:

> No matching LTI bridge creation is recorded for this assignment.

Avoid:

> You never launched from Canvas.

## Test/reset tooling

`scripts/reset-student-data.js` provides a guarded learner reset utility for repeated integration testing and rare support cases.

- dry-run is the default;
- the default target is the single Xronos user named exactly `Test Student`;
- `--execute` performs the reset;
- `--user OBJECT_ID` selects another Xronos user;
- executing an explicit-user reset also requires `--confirm-non-test`;
- the `User` identity is preserved while State, Completion, ProgressMilestone, AuditToken, LtiBridge, and queued gradebook work are removed;
- context-wide late-policy observations are preserved by default and are removed only with the explicit `--purge-policy-evidence` option.

The full Test Student scrub was exercised successfully on the separate test VM and verified to preserve the Test Student user identity while removing all disposable test records and queued gradebook work.
