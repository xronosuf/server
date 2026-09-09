# Late Canvas Grade Passback Policy

## Scope

Xronos supports Canvas LTI 1.1 Basic Outcomes grade passback.  The legacy
implementation treated the Canvas due date as the end of passback and silently
ignored later Xronos progress.  That is incorrect when Canvas still accepts
late submissions.

The required invariant is stronger than simply supporting late work:

> Xronos must never replace a Canvas grade with a lower grade.

Instructor/manual Canvas grades remain authoritative.  Basic Outcomes
`readResult` does not expose grade provenance, so this implementation detects
only manual/other grades that are provably inconsistent with the last raw
Xronos result.  Broader manual-grade provenance remains a separate diagnostic
problem.

## Canvas behavior verified September 9, 2026

A controlled dev-shell Test Student bridge had:

- Canvas points possible: 10
- due date: 2026-09-08T03:59:59Z
- until date: 2026-10-01T03:59:59Z
- Canvas late policy already active
- no existing Canvas result

Xronos sent the same rounded values produced by the legacy gradebook for
10.666666666666666 / 13 progress:

- `resultScore = 0.83`
- `resultTotalScore = 8.21`

Canvas accepted the LTI `replaceResult`.  Canvas displayed 6.21 / 10 and an
immediate LTI `readResult` returned 0.621.  Therefore Canvas Basic Outcomes
`readResult` exposes the effective post-late-policy grade rather than the raw
0.83 LTI result.

For the configured 10%-per-day policy, the observed 6.21 is consistent with a
2-point deduction from the 10-point assignment maximum during the second late
interval.

## Passback window

Due date and passback-close date are separate concepts.

- Before or at `dueDate`: ordinary passback.
- After `dueDate` and through `untilDate`: late passback is eligible, subject to
  safety checks.
- After `untilDate`: automatic passback is closed.
- If Canvas supplies no `untilDate` but does supply a due date, Xronos uses a
  130-day fallback passback horizon.
- If neither date exists, Xronos does not invent a close date.

The fallback horizon is intentionally distinguishable from an explicit Canvas
`untilDate` in diagnostics.

## Late intervals

Canvas late intervals are measured from the exact due timestamp in elapsed
24-hour intervals.  Any positive lateness is interval 1; more than 24 hours is
interval 2, and so on.

A write is deferred when it would occur within five minutes before the next
late-interval boundary.  The queue retries just after the boundary, then reads
Canvas again.  This prevents the late deduction from changing between the
safety read and the grade write.

## Safe late-write rule

For a late bridge, Xronos reads the current Canvas effective result immediately
before deciding whether to write.

1. If Canvas has no result, the first positive Xronos result may be written.
2. If Canvas already has a result, Xronos requires a known raw Xronos result
   that Canvas previously accepted.
3. The new raw Xronos result must be strictly higher than that last accepted raw
   result.
4. If the current Canvas result is greater than the last accepted raw Xronos
   result, automatic passback is blocked because Canvas contains a grade that
   Xronos cannot explain as a late-policy deduction.
5. Otherwise the higher raw result is safe to submit during the same late
   interval.  For the supported Canvas late-policy form (fixed deduction from
   assignment points possible, with a minimum-grade floor), the effective grade
   is monotone nondecreasing as the raw result increases while lateness is held
   fixed.

If `readResult` fails or cannot be parsed, Xronos does not guess; it requeues
rather than writing a late grade.

## Bridge bookkeeping

`resultScore` and `resultTotalScore` continue to represent the newest/best
Xronos candidate.  Late safety also requires separate fields recording the raw
candidate that Canvas last accepted:

- `lastSubmittedResultScore`
- `lastSubmittedResultTotalScore`
- `lastSubmittedAt`

For pre-upgrade bridges, if legacy `submittedScore === true`, the existing raw
result is captured as the initial last-submitted baseline before a better
candidate overwrites it.

## Known limitation: manual grade provenance

LTI 1.1 `readResult` returns the current effective score but does not identify
whether that score was produced by LTI passback or manually entered by an
instructor.  A Canvas score above Xronos's last accepted raw score is therefore
a clear reason to stop automatic passback, but every possible manual override
cannot be distinguished from a legitimate late-policy deduction using Basic
Outcomes alone.

The late-passback implementation is conservative wherever provenance is
unknown and does not weaken the never-lower-Canvas invariant.
