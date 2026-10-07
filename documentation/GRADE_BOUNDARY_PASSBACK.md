# Grade boundary snapshots and boundary-safe Canvas passback

## Purpose

This feature removes a deadline race in the existing three-minute Canvas grade
passback debounce.

Previously, a better score observed shortly before the Canvas passback cutoff
could be debounced until the exact cutoff timestamp. The gradebook worker polls
on a timer, so it could pick that queue entry up a few seconds after the cutoff
and refuse to send it. A student could therefore have substantial Xronos
progress before the deadline while Canvas retained an older score or no useful
score.

The new design separates:

1. **grade eligibility time** — when Xronos trustedly observed the score; from
2. **delivery time** — when the background worker successfully delivers that
   already-eligible score to Canvas.

The Xronos server receipt time is authoritative. Browser/local-machine clocks
are not trusted for grade eligibility.

## Branch relationship

This work is built on top of the `instructor-settings` branch.

That branch materializes the shell-level `gradeSyncCutoff` policy onto each
LTI bridge:

- `late-policy` -> Canvas Until when present;
- `due-date` -> Canvas Due when present.

Both Due and Until snapshots are recorded regardless of which boundary controls
grade passback.

## Trusted score observations

Each bridge now stores:

- the current best score;
- `resultScoreObservedAt` — Xronos server receipt time for that best score;
- the Xronos points associated with it when available;
- at most three recent best-score observations.

The three-entry bridge history is intentionally small. Long-term audit history
remains in `ProgressMilestone`.

A request received before a cutoff remains eligible even if Mongo/worker work
finishes after the cutoff. The eligibility check uses the captured server
receipt timestamp rather than a later `Date.now()`.

## Canvas date versioning

Each bridge also stores:

- `dueDateObservedAt`;
- `untilDateObservedAt`.

These timestamps record when Xronos first learned the current exact Canvas date
value. If the date remains unchanged, the first-seen timestamp is preserved.

When an instructor changes a date:

- a later future extension schedules a new boundary normally;
- an earlier future date can still become authoritative if Xronos learns it
  before it occurs;
- a date moved into the past is treated as retroactive and is not automatically
  promoted to authoritative boundary evidence.

Old boundary snapshots remain immutable. Audit display resolves the snapshot
whose `boundaryAt` exactly matches the bridge's current Due/Until value, so
"latest row" or "latest date" is never used to guess which boundary is current.

## Boundary milestones

Special rows remain in the `ProgressMilestone` collection:

- `source = due-boundary`
- `source = until-boundary`

Boundary rows have:

- `boundaryKey` — sparse unique idempotency key;
- `boundaryAt` — exact Canvas boundary value Xronos used;
- `boundaryEvidence`;
- `qualifyingObservedAt` when a real trusted score observation exists.

The exact identity is effectively:

`bridge + boundary type + boundaryAt`.

Ordinary five-minute milestone lookups explicitly exclude Due/Until boundary
rows.

### Evidence states

**authoritative**

Xronos knew the boundary before it occurred and has a trusted server-observed
best score at or before it.

**inferred-zero-no-prior-observation**

No trusted score observation or ordinary progress milestone exists at or before
the boundary. Instructor-facing audit output reports 0% while clearly labeling
that 0% as inferred from lack of pre-boundary evidence.

**approximate/reconstructed**

No authoritative boundary snapshot exists, but ordinary milestone history does.
This commonly occurs for retroactive earlier-date changes or legacy data. Audit
output reconstructs conservatively from ordinary milestone history and labels
the value approximate.

## Boundary scheduling

Redis sorted set:

`gradebook-boundaries`

Members encode:

`bridge | due-or-until | exact-boundary-timestamp`

The worker validates the queued timestamp against the bridge's **current** date
before creating any snapshot. Stale queue members left by Canvas date changes
are therefore harmless.

Passed boundaries are also reconciled during an LTI launch and when progress
requests cross a boundary. Competing paths remain safe because `boundaryKey`
is unique.

## Boundary-safe passback

If the ordinary three-minute debounce would cross the controlling passback
boundary, the queue entry is scheduled just after the boundary rather than at
the exact closing instant.

After the cutoff, Xronos may deliver the bridge candidate only when:

1. the controlling boundary is Canvas Until or the instructor Due cutoff;
2. Xronos knew that exact boundary value before it occurred;
3. `resultScoreObservedAt <= controlling boundary`.

Post-cutoff progress never becomes the frozen Canvas candidate.

Retroactively moved-past boundaries are not automatically resent from
reconstructed evidence.

## Canvas submittedAt

Canvas advertises LTI 1.1 support using:

`ext_outcome_submission_submitted_at_accepted=true`

Xronos stores that capability on the bridge.

Only a frozen boundary delivery sent after the cutoff includes:

`submissionDetails/submittedAt`

The value is the trusted Xronos `resultScoreObservedAt`, not the boundary time
and not the later network delivery time.

Normal pre-cutoff passbacks keep their existing behavior.

## Retry policy

Transient Canvas/network failures persist retry metadata on the bridge.

Automatic retry behavior:

- normal one-minute retry cadence for the first hour;
- hourly retry cadence after the first hour;
- automatic retry horizon of 24 hours from the first transient failure.

At exhaustion, retry metadata remains available to diagnostics and a manual
resend can be performed after the underlying outage is resolved.

A new better candidate resets the retry state.

## Progress audit token display

The normal requested-time result remains unchanged in meaning.

A separate **Assignment boundary information** section always shows the
currently applicable Due/Until evidence when those dates exist, even when the
boundary dates fall outside the instructor's selected audit time.

For an inferred zero:

- display **0%** prominently;
- immediately state that Xronos had no recorded score observation at or before
  the deadline.

For an approximate reconstructed value:

- make **Approximate** visually obvious;
- show the supporting milestone observation time;
- use the short note:
  "Student submission most likely occurred within the 5 minutes prior to the
  listed milestone observation time."

## Tests

Normal suite:

```bash
npm test
```

Targeted unit/contract tests are included for:

- three-entry best-score history;
- pre-boundary candidate selection;
- retroactive boundary detection;
- frozen post-cutoff deliverability;
- instructor Due cutoff behavior;
- retroactive cutoff resend protection;
- conditional LTI `submittedAt` XML.

Disposable Mongo smoke test for the isolated test server:

```bash
NODE_ENV=test node scripts/test-grade-boundaries.js
```

The smoke test creates fake bridge/milestone records, verifies authoritative,
retroactive/reconstructed, and inferred-zero behavior, then deletes every record
it created.

## Test-server validation still required

Before production rollout:

1. run `npm test`;
2. run the disposable boundary smoke test;
3. run the normal JS/CSS build;
4. exercise a real Canvas test assignment with Due = Until and an improvement
   inside the final three-minute debounce window;
5. verify Canvas receives the pre-boundary score after the cutoff and uses the
   trusted Xronos observation as submission time;
6. verify post-cutoff score improvements remain Xronos progress only;
7. verify the audit-token UI shows Due/Until boundary information;
8. test a future extension and a retroactive earlier-date change;
9. test both instructor setting modes (`late-policy` and `due-date`);
10. verify transient-failure/retry diagnostics if a safe failure simulation is
    available.
