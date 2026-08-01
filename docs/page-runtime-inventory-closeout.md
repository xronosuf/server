# Page Runtime Inventory Closeout

## Status

The page-runtime inventory phase is complete.

The inventory exercised the current Xronos runtime against content generated
with the newer XimeraLaTeX toolchain. The restored test xourse contains eleven
activity pages covering answers, saved progress, validators, hints, foldables,
nested problems, and related runtime behavior.

## Verified grading path

The complete grading path was verified with a Canvas Test Student:

1. The browser calculated xourse progress.
2. The browser sent a gradebook update to Xronos.
3. Xronos stored an improved bridge score.
4. Xronos queued the Canvas passback.
5. Canvas accepted and displayed the updated grade.

During the single-page test, the verified values were approximately:

- Xronos points earned: `0.6666666666666666`
- Xronos points possible: `1`
- Canvas score: `66.67 / 100`

After restoring all eleven test pages, the browser correctly reported:

- Xronos points possible: `11`

This confirms that the xourse denominator is correctly calculated across
multiple weighted activity cards.

## Grading compatibility finding

Newer generated xourses may omit the older aggregate attribute
`main[data-points]`.

Individual activity cards still provide
`.activity-card[data-weight]`.

The existing gradebook client calculated earned points from activity-card
weights but previously read the denominator only from `main[data-points]`.
This produced a valid numerator with an undefined denominator.

Commit `4aa4c5c` adds a compatibility fallback that:

- preserves `main[data-points]` when it is present and valid;
- otherwise sums positive, finite activity-card weights;
- refuses to send a gradebook request when the resulting payload is invalid.

The fix was verified with both a one-page and an eleven-page xourse and with
an actual Canvas grade passback.

## Completed and documented runtime work

Relevant commits include:

- `4aa4c5c` — Support xourse points fallback
- `19dcf04` — Document grouped validator findings
- `ee769a4` — Document nested problem validation
- `e1bec6f` — Restore foldable initial state
- `19c5b4d` — Hide exhausted legacy hint buttons
- `c1c240f` — Observe legacy hint reveal lifecycle

## Inventory conclusions

### Confirmed compatible

- Standard answer controls render and persist.
- Multiple-choice and select-all controls participate in progress.
- Activity progress reaches the xourse page.
- Per-activity weights can supply the xourse denominator.
- Xronos can queue and complete Canvas grade passback.
- The restored eleven-page xourse produces a total weight of eleven.

### Confirmed compatibility gaps

- Newer xourses may omit `main[data-points]`.
- The older gradebook client did not recover the denominator from card weights.
- Grouped-validator and nested-problem combinations require the handling or
  author guidance documented by their inventory commits.

### Not caused by stale student data

The missing denominator was reproduced after hard reloads and after simplifying
the test content. The rendered content was current. The defect was in the
xourse-level metadata compatibility path, not an old LTI bridge or stale
student completion record.

## Next-phase priorities

### 1. Add server-side grade payload validation

The browser now rejects an invalid denominator, but the gradebook route should
also independently validate:

- `pointsEarned` is finite;
- `pointsPossible` is finite and greater than zero;
- the normalized score is finite;
- invalid requests return a clear non-success response.

### 2. Review grouped-validator compatibility

Use the documented findings to decide whether the resolution should be runtime
support, an authoring restriction, explicit diagnostics, or a combination.

### 3. Review nested-problem semantics

Define supported nesting, predictable completion propagation, and diagnostics
for unsupported structures.

### 4. Add automated grading compatibility tests

Cover:

- xourses with `main[data-points]`;
- xourses without it but with weighted cards;
- structural cards without weights;
- malformed or missing weights;
- invalid gradebook payloads;
- monotonic bridge updates;
- Canvas-point conversion.

### 5. Review and promote the branch

After remediation:

- run the eleven-page smoke test;
- rebuild browser assets inside the development container;
- verify the dev Canvas assignment;
- merge or promote through the normal deployment workflow.

## Build environment note

Browser assets currently need to be built inside `devximserver`, using
`/usr/var/server`.

The verified container environment uses Node `v12.22.12` and local Gulp
`4.0.2`. The host's Node 8 environment cannot run the currently installed
Gulp toolchain.
