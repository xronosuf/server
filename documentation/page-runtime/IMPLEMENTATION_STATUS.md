# Page Runtime Coordinator Implementation Status

## Purpose

This document is the current factual implementation map for the Xronos Page
Runtime Coordinator.

Read it with `COORDINATOR_DESIGN.md`, `CURRENT_PIPELINE.md`,
`RUNTIME_OWNERSHIP_MATRIX.md`, `DEGRADED_STATE_POLICY.md`, `FEATURE_INVENTORY.md`,
`TODO.md`, and the current handoff.

The coordinator remains an incremental dependency-aware orchestration layer. It
does not replace MathJax, Sage evaluation, answer correctness, persistence, or
Canvas grade passback.

## Current repository checkpoint

```text
branch: page-runtime-coordinator
local HEAD: eed8ae4 Refresh runtime coordinator checkpoint docs
remote HEAD: eed8ae4 Refresh runtime coordinator checkpoint docs
branch relation: synchronized; current initial-answer reconciliation is uncommitted
```

The pushed checkpoint through `eed8ae4` includes the canonical-only Sage cleanup,
visible reliability hardening, and refreshed coordinator checkpoint docs. The
current worktree additionally contains the browser-validated initial math-answer
reconciliation described below; it has not yet been staged, committed, or pushed.
## Current coordinator model

External leaves:

- `initial-state`
- `mathjax-initial-process`
- `canonical-sage`
- `sage-inline-initial`
- `activity`
- `initial-math-answers`

Active coordinator-owned control seams include:

- document-ready activity bootstrap
- state-dependent activity initialization release
- MathJax startup trigger
- MathJax Startup End UI finalization
- document-ready static UI
- kinetic navigation
- references

Derived readiness:

- `state-synchronized`
- `content-ready`
- `interaction-ready`
- `page-readiness`

## Current lifecycle status

| Lifecycle | Current state |
| --- | --- |
| Coordinator core and derived readiness | Implemented |
| Activity/bootstrap control seams | Implemented incrementally |
| Initial MathJax Process | Generation-bound, coordinator deadline, browser-validated failure policy |
| Immutable Sage manifest | Implemented |
| Canonical initial Sage operation | Implemented |
| Initial visible Sage settlement | Implemented and browser-validated |
| Dynamic Sage / Another | Canonical generation path; outside initial readiness |
| Initial math-answer attachment | Reconciled and browser-validated, including degraded-to-settled repair and derived readiness recovery |
| Initial state | Partial; detailed terminal semantics are the next major lifecycle target |
| Stable support contract | Partial |

## Initial MathJax Process

The first authoritative full `Process` is bound to one generation.

Implemented behavior includes:

- matching Begin/End Process generation binding
- coordinator-owned 15-second `XR-MATHJAX-INITIAL-101` deadline
- stale/mismatched completion rejection
- associated parse/processing error recording
- terminal pass, answer-discovery, and Sage-discovery metadata
- permitted generation-safe late recovery with retained timeout history

Current policy from `785cd8a` is that any parse/processing error associated with
that authoritative initial generation makes the mathematical coursework
untrustworthy for the page load. The leaf reports failed, affected readiness
degrades, persistent failure UI is shown, and mathematical coursework
interaction is blocked until reload. Browser validation is recorded by
`efbdced`.

## Canonical Sage architecture

Current-publisher support is:

- `sagesilent`
- visible `\sage{...}`
- seeded generation
- `Another`
- replay/reprocessing including Sage answer-key values

Before MathJax transforms the page, the Sage module captures an immutable
manifest with stable expression identity, ordering, problem identity when
available, answer-key identity, silent setup blocks, and original source.

`stripCDATA()` remains shared canonical manifest parsing infrastructure. It was
accidentally removed with legacy code and restored in `e794671` without
restoring legacy execution.

The canonical page request has explicit identity through seed waiting,
compilation, request, response, parsing, mapping, and terminal classification.

The compiled-request safety ceiling remains:

```text
60000 UTF-8 bytes
```

This empirical ceiling was chosen after real-content auditing found practical
requests around 35-40 KB.

## Canonical-only Sage execution

The following sequence removed obsolete browser execution paths:

```text
7a97229 Remove obsolete standalone Sage compatibility
b9fed4d Enforce canonical-only browser Sage execution
03603fe Remove legacy browser Sage executor
43f97e0 Make canonical browser Sage unconditional
```

Removed compatibility includes:

- standalone `.sage` / `.sageOutput` autoevaluation
- embedded browser kernel / `createKernel` emulation
- iopub emulation
- legacy browser request queues and batching
- legacy `exports.sage`
- arbitrary-code canonical-to-legacy fallback

Every legitimate browser Sage computation must resolve to deterministic
canonical identity. Failure to do so is an explicit canonical invariant failure,
not authorization to execute an arbitrary legacy string.

Canonical browser Sage is now unconditional. The old
`XRONOS_CANONICAL_PAGE_SAGE_ENABLED` deployment variable may still exist in
`repositories/.env`, but current source no longer reads it. Later deployment
cleanup should remove only that dead entry and preserve all unrelated `.env`
settings.

## Initial visible Sage lifecycle

`canonical-sage` and `sage-inline-initial` remain separate.

`canonical-sage` means canonical computation/results reached a classified
terminal outcome.

`sage-inline-initial` means every required initial visible Sage consumer reached
explicit terminal display state.

Implemented invariant:

> A known failure must not leave a required initial Sage component indefinitely
> displaying a loading spinner.

The 15-second `XR-SAGE-INLINE-INITIAL-101` deadline can convert unresolved
visible Sage work into explicit failure/fallback UI.

Same-request late completion may still recover safely and preserve timeout
history.

Explicit Retry is a new visible request attempt and a new coordinator operation.

`e794671` adds a per-placeholder monotonically increasing `requestAttempt`.
Callbacks from an explicitly superseded attempt are recorded as
`stale-attempt-ignored` and cannot mutate current DOM or lifecycle state. The
deadline itself does not increment the request token, preserving legitimate
same-request late recovery.

Known visible attachment failures now terminate visibly:

- missing MathJax `inputID` routes through display-error handling
- missing exact placeholder DOM falls back to problem, activity, page-content,
  or body as the visible failure destination

## Sage reliability fault probe

Development-only one-shot probe files:

```text
public/javascripts/sage-inline-fault-probe.js
test/sage-inline-fault-probe.js
```

Storage key:

```text
xronosSageInlineFault
```

Supported faults:

- `missing-input-id`
- `missing-placeholder`
- `stale-attempt`
- `page-result-error`

The request is consumed before parse/injection so a malformed or successful
probe does not repeat on reload.
## Browser validation through `7c5913f`

After rebuilding the actual served browser bundle:

### `03-basic-sage`

- clean startup: PASS
- missing input ID: visible terminal failure, no stuck spinner: PASS
- missing placeholder: visible controlled fallback: PASS
- stale explicit attempt: Retry attempt 2 succeeds; delayed attempt 1 later
  reports `stale-attempt-ignored`; attempt 1 cannot overwrite attempt 2; final
  readiness all ready and coordinator/legacy comparison matches: PASS
- canonical page-result parsing fault: visible retryable error appears; explicit
  Retry starts a fresh attempt and normal Sage completes successfully: PASS

### `04-sage-generation-another`

- normal canonical generation: PASS
- repeated `Another`: PASS

### `05-mixed-critical-lifecycle`

- Sage: PASS
- answers: PASS
- author JavaScript interaction: PASS
## Browser build environment

The browser serves `public/javascripts/main.min.js`; changing `main.js` alone is
not browser validation.

Verified build environment:

```text
container: devximserver
workdir: /usr/var/server
Node v12.22.12
npm 6.14.16
Gulp local 4.0.2
```

Use the project-local Gulp executable inside `devximserver`.

The host Node 8/global-Gulp environment cannot build the current bundle.

Latest focused validation in the current uncommitted reconciliation worktree:

```text
page-runtime coordinator core:     33 passing
page-runtime coordinator adapter:  42 passing
initial math-answer fault probe:    5 passing
Sage reliability policy:            4 passing
sage-inline fault probe:            6 passing
initial MathJax fault probe:         5 passing
                                    ----------
total:                              95 passing
```

The browser bundle was rebuilt with project-local Gulp inside `devximserver`,
and host/container SHA-256 hashes matched before browser validation.
## Fresh Sage reliability audit at `fdb015b`

A final read-only Sage pipeline audit was run after the documentation
reconciliation commit.

The audit reclassified several apparent gaps as already-settled behavior:

- expired page-auth tokens are automatically detected, refreshed through
  `/sagecell/auth`, and the original Sage request is retried once;
- persistent `SAGECELL_PAGE_AUTH_SECRET` is a deployment requirement so tokens
  survive process restart, not missing browser recovery logic;
- canonical invariant failures intentionally fail closed instead of restoring
  legacy execution;
- the 60 KB compiled-request ceiling remains an intentional safety/content
  boundary;
- missing input ID, missing placeholder, visible deadline settlement, and stale
  explicit-Retry callbacks already have terminal/stale-safe handling;
- local transport errors plus HTTP 502/503/504 already use the configured
  fallback SageCell path in `local-with-fallback` mode.

The two narrow reliability discrepancies found by the audit have now been
resolved:

1. canonical response marker/JSON parsing failures
   (`XronosSagePageResultError`) are explicitly transient/retryable;
2. automatic local-to-fallback switching now treats HTTP
   408/429/500/502/503/504 as infrastructure failures, in addition to transport
   or missing-response failures.

The production predicates are factored into directly tested policy helpers.
The focused Sage/coordinator/MathJax suite now passes 57 tests.

Browser validation on `03-basic-sage` used the one-shot `page-result-error`
probe. The first attempt produced the intended retryable result-reading error;
clicking `Retry computation` started a fresh normal attempt and Sage completed
successfully without a stale failure overwriting the result.

The final Sage reliability audit is therefore closed without weakening
canonical fail-closed invariants.

The audit also corrected one documentation error: stale-token refresh/retry is
already implemented and must not remain listed as future browser work.

## Initial math-answer reconciliation

The existing `initial-math-answers` lifecycle is now reconciled for the current
scope.

Confirmed behavior:

- authored `data-id`, generated Xronos persistence/DOM ID, and transient MathJax
  rendering identity remain distinct;
- ordinary MathJax `Reprocess` replaces the answer DOM node but preserves the
  authored ID, generated persistence ID, and owning problem ID in the validated
  fixture;
- no new answer-identity scheme is warranted by the observed runtime behavior;
- discovery during the authoritative initial MathJax generation, model
  resolution, attachment attempts, and contained attachment exceptions remain
  the production ownership boundaries;
- successful logical initial attachment remains terminal across ordinary DOM
  replacement/rebinding;
- a development-only one-shot `missing-answer-model` probe can target a known
  authored answer without changing production identity semantics;
- a forced initial missing model produces `initial-math-answers: degraded` with
  the unresolved generated answer ID recorded;
- a later MathJax `Reprocess` repairs that same logical answer and changes the
  runtime component from `degraded` to `settled`;
- coordinator external leaves using `allow-late-success` now permit same-operation
  `degraded -> succeeded/not-required` recovery;
- that leaf recovery recomputes `interaction-ready` and then `page-readiness`
  from `degraded` to `succeeded`;
- the repaired leaf retains the same attempt and operation ID, while derived
  readiness tasks correctly begin new recomputation attempts.

Browser validation on `testSuite/02-answers-saved-progress` used authored ID
`runtimeInteger` and generated persistence ID `answer0problem2`. The controlled
initial failure produced 2/3 attached answers and one unresolved answer; a later
`Reprocess` produced 3/3 attached answers, zero unresolved answers, and successful
interaction/page readiness recovery.

No answer-specific deadline was added: unresolved initial attachment is still
bounded by the authoritative initial MathJax Process, and later repair remains
available when another legitimate MathJax pass occurs.

## Remaining major coordinator work

1. initial-state terminal semantics and ownership reconciliation
2. stable support-report contract
3. removal/demotion of duplicated legacy comparison/watchdog ownership where
   evidence supports it
4. optional-service terminality and broader cleanup

The overall coordinator migration is not complete.
