# Xronos Page Runtime Coordinator — Current Handoff

**Purpose:** living operational handoff for continuing the Page Runtime
Coordinator project after a chat/session boundary.

**Last reconciled:** 2026-08-09
**Working branch:** `page-runtime-coordinator`
**Last known local HEAD:** `eed8ae4` — `Refresh runtime coordinator checkpoint docs`
**Last known remote HEAD:** `eed8ae4` — `Refresh runtime coordinator checkpoint docs`
**Last known branch relation:** synchronized; current initial-answer work is uncommitted
**Pushed?** The checkpoint through `eed8ae4` is backed up on
`origin/page-runtime-coordinator`; the current initial-answer reconciliation is
not yet staged, committed, or pushed.

Always verify Git state before changing code.

## 1. Project goal

Replace Xronos's implicit browser startup network of import-time side effects,
DOM-ready handlers, MathJax callbacks, WebSocket callbacks, Sage promises,
answer attachment, and readiness flags with an explicit dependency-aware Page
Runtime Coordinator.

The coordinator should provide operation identity, explicit terminal outcomes,
bounded deadlines, stale-completion rejection, safe late recovery, dependency
joins, and privacy-safe diagnostics while leaving mature feature algorithms in
their existing modules.

## 2. Authoritative document map

- `COORDINATOR_DESIGN.md` — target architecture and migration principles
- `CURRENT_PIPELINE.md` — factual current browser execution
- `DEGRADED_STATE_POLICY.md` — failure isolation and recovery policy
- `FEATURE_INVENTORY.md` — supported/dormant/investigation feature inventory
- `IMPLEMENTATION_STATUS.md` — durable current implementation checkpoint
- `RUNTIME_OWNERSHIP_MATRIX.md` — owner/trigger/dependency/terminal-state map
- `TODO.md` — remaining/deferred work
- this file — current operational state and immediate next boundary

When documents disagree, reconcile the repository rather than silently choosing
one.

## 3. Current branch checkpoint

```text
eed8ae4 Refresh runtime coordinator checkpoint docs
7c5913f Close final canonical Sage reliability gaps
fdb015b Reconcile page runtime coordinator documentation
e794671 Harden inline Sage visible failure handling
43f97e0 Make canonical browser Sage unconditional
03603fe Remove legacy browser Sage executor
b9fed4d Enforce canonical-only browser Sage execution
7a97229 Remove obsolete standalone Sage compatibility
10f6eb5 Settle timed-out initial inline Sage visibly
843cc5c Recover initial inline Sage across visible retries
5bf6acc Correct canonical Sage permanent-fallback status
a5fc246 Bind canonical Sage retries to coordinator operations
6f06bfa Document Sage terminal-state acceptance criteria
c57d6a4 Finalize coordinator milestone cleanup
efbdced Record failed-render browser validation
785cd8a Block interaction after failed initial MathJax render
```

Local and remote commits are synchronized at `eed8ae4`; the worktree contains
the uncommitted initial math-answer reconciliation and its documentation cleanup.
## 4. Coordinator foundation already completed

Implemented foundation includes:

- dependency-aware coordinator core
- external lifecycle leaves
- operation IDs
- task timeouts
- stale completion recording
- bounded event history
- derived/recomputable readiness
- `allow-late-success`
- transitive recovery
- active startup seams for activity, MathJax startup/UI, static UI, navigation,
  and references

External leaves:

```text
initial-state
mathjax-initial-process
canonical-sage
sage-inline-initial
activity
initial-math-answers
```

Derived graph:

```text
initial-state
└── state-synchronized

mathjax-initial-process + canonical-sage + sage-inline-initial
└── content-ready

activity + initial-math-answers
└── interaction-ready

state-synchronized + content-ready + interaction-ready
└── page-readiness
```

## 5. Initial MathJax Process milestone

The authoritative first full MathJax Process is generation-bound.

Implemented:

- Begin/End Process binding
- coordinator-owned `XR-MATHJAX-INITIAL-101` 15-second deadline
- stale/mismatched completion rejection
- generation-associated processing errors
- terminal pass/answer/Sage metadata
- safe matching late recovery with retained timeout history
- one-shot MathJax processing fault injection

Current policy from `785cd8a` is that an initial parse/processing error makes the
mathematical coursework untrustworthy for that page load. The leaf fails,
affected readiness degrades, persistent failure UI appears, and mathematical
coursework interaction is blocked until reload.

Do not revert to the older “errors are diagnostic only” wording without new
browser evidence and an explicit policy decision.

## 6. Sage current-publisher contract

Highest-confidence current-publisher evidence is in `testsuite.git`:

- `testSuite/03-basic-sage.tex`
- `testSuite/04-sage-generation-another.tex`
- `testSuite/05-mixed-critical-lifecycle.tex`

Supported behavior includes:

- `sagesilent`
- visible `\sage{...}`
- seeded canonical generation
- `Another`
- replay/reprocessing including Sage answer-key values

No current-publisher evidence supports restoring the old standalone
`.sageOutput`, browser kernel, or `text/x-sage` execution model.

## 7. Canonical-only Sage architecture

The current local cleanup removed:

- standalone `.sage` / `.sageOutput` execution compatibility
- `createKernel` compatibility
- iopub emulation
- legacy browser request queue/cache state
- batching
- legacy `exports.sage`
- canonical-to-legacy arbitrary-code execution fallback

Every legitimate browser Sage call must resolve to deterministic canonical
identity. Failure to identify/authorize a canonical request must not mean
“execute the arbitrary string through a legacy path.”

`43f97e0` also removed the browser/server canonical rollout feature gate.
`XRONOS_CANONICAL_PAGE_SAGE_ENABLED=true` is now inert; later remove only that
individual `.env` entry while leaving all unrelated entries intact.

Keep the 60,000 UTF-8-byte compiled-request safety ceiling unless real content
provides contrary evidence.

`stripCDATA()` is shared canonical parsing infrastructure and was correctly
restored in `e794671` after its accidental removal with legacy code.

## 8. Canonical Sage and visible Sage remain separate

`canonical-sage` represents computation/result availability.

`sage-inline-initial` represents whether all required initial visible Sage
consumers reached explicit terminal display state.

Retryable canonical failure is terminal for that attempt. Explicit Retry creates
a new coordinator operation.

Canonical computation success does not prove visible settlement.

## 9. Initial visible Sage reliability

Core invariant:

> Known Sage failure must not leave a required visible component indefinitely
> loading.

Implemented:

- visible deadline settlement at `XR-SAGE-INLINE-INITIAL-101`
- explicit Retry
- safe same-request late recovery
- missing MathJax `inputID` visible failure
- missing exact placeholder visible fallback destination
- per-placeholder request-attempt identity
- stale callback rejection across explicit Retry

`e794671` adds `requestAttempt`. A delayed callback from an explicitly
superseded attempt emits `stale-attempt-ignored` and cannot mutate the current
result. The deadline does not increment the token, preserving same-request late
recovery.

Fallback destination order when the exact placeholder is missing:

1. owning problem container
2. `main.activity`
3. `#page-content`
4. `document.body`

## 10. Sage reliability probe and browser validation

Development-only probe:

```text
public/javascripts/sage-inline-fault-probe.js
test/sage-inline-fault-probe.js
```

Faults:

- `missing-input-id`
- `missing-placeholder`
- `stale-attempt`
- `page-result-error`

Browser validation on the rebuilt bundle:

- 03 clean startup: PASS
- 03 missing input ID: PASS
- 03 missing placeholder: PASS
- 03 stale attempt after explicit Retry: PASS
- 03 canonical page-result parsing fault followed by successful Retry: PASS
- 04 repeated `Another`: PASS
- 05 mixed Sage/answer/author-JS lifecycle: PASS

The stale-attempt runtime showed attempt 2 rendering successfully, followed by
the delayed attempt 1 being ignored, with final state/content/interaction/page
readiness all ready and final coordinator/legacy comparison matching.
## 11. Browser build environment

The browser serves `public/javascripts/main.min.js`; source changes are not
browser-tested until that bundle is rebuilt.

Verified build environment:

```text
container: devximserver
workdir: /usr/var/server
Node v12.22.12
npm 6.14.16
Gulp local 4.0.2
```

Use project-local Gulp inside `devximserver`.

The host Node 8/global-Gulp environment is not a valid browser build path.

Latest focused tests in the current reconciliation worktree:

```text
page-runtime coordinator core:     33
page-runtime coordinator adapter:  42
initial math-answer fault probe:    5
Sage reliability policy:            4
sage-inline fault probe:            6
initial MathJax fault probe:         5
total:                              95 passing
```

The served browser bundle was rebuilt inside `devximserver`, and host/container
SHA-256 hashes matched.
## 11A. Fresh Sage reliability audit before push

After commit `fdb015b`, a new read-only Sage audit rechecked all known failure
paths before backing up the branch.

The audit confirmed several apparent issues were already solved or deliberately
fail-closed:

- expired page-auth refresh/retry is implemented;
- persistent page-auth signing secret is deployment configuration, not missing
  browser recovery logic;
- canonical identity/invariant failures deliberately reject rather than restore
  legacy execution;
- the 60 KB compiled canonical request ceiling remains intentional;
- missing input ID, missing placeholder, deadline fallback, same-request late
  recovery, explicit Retry, and stale explicit-attempt callbacks already have
  explicit handling;
- local transport failures and HTTP 502/503/504 already use fallback SageCell
  when service mode is `local-with-fallback`.

Both narrow items found by the audit are now resolved:

1. `XronosSagePageResultError` is explicitly transient/retryable and uses the
   existing visible Retry path.
2. Local SageCell transport/missing-response and HTTP
   408/429/500/502/503/504 failures now qualify for automatic fallback.

Production uses directly tested policy helpers for both decisions. The focused
suite passes 57 tests. Browser validation on `03-basic-sage` with the one-shot
`page-result-error` probe confirmed retryable visible failure followed by a
successful fresh Retry.

Canonical identity checks remain fail-closed and legacy execution was not
restored.

## 12. Initial math-answer reconciliation

This lifecycle is reconciled for the current coordinator scope.

Important identity finding:

- authored `\answer[id=...]` reaches the browser as semantic `data-id`;
- Xronos separately assigns the generated persistence/DOM ID used by persistence
  and answer activity;
- MathJax render IDs are a third, transient rendering identity;
- do not collapse these identities or replace the generated persistence scheme
  without a reproduced defect.

Browser evidence on `testSuite/02-answers-saved-progress`:

- authored target: `runtimeInteger`
- generated persistence ID: `answer0problem2`
- owning problem: `problem2`
- ordinary `Reprocess` replaced the answer DOM node while preserving authored ID,
  persistence ID, and problem ID
- a development-only one-shot `missing-answer-model` probe produced an initial
  degraded state with 2/3 answers attached and `answer0problem2` unresolved
- the initial MathJax Process itself still completed successfully
- a later `Reprocess` resolved and attached the missing model, giving 3/3 attached
  and zero unresolved
- the runtime component changed `degraded -> settled`
- the coordinator leaf changed `degraded -> succeeded` on the same attempt and
  operation
- `interaction-ready` and `page-readiness` recomputed from degraded to succeeded

The browser run exposed one real coordinator defect: `allow-late-success`
previously accepted late external recovery only from `timed-out`, so a second
signal after `degraded` was counted but rejected. The current uncommitted core
patch permits same-operation `degraded -> succeeded/not-required` recovery for
`allow-late-success` external leaves, records `task-recovered`, and uses the
existing derived recomputation path.

Development-only probe files:

```text
public/javascripts/math-answer-initial-fault-probe.js
test/math-answer-initial-fault-probe.js
```

Storage key:

```text
xronosMathAnswerInitialFault
```

No answer-specific timeout was added, and no production answer identity scheme
was changed.

## 13. Initial state remains unresolved

Important current facts:

- the browser waits for WebSocket `sync`
- generic `fetchData()` consumers can remain blocked if sync never arrives
- the server currently conflates lookup failure and confirmed no saved state by
  sending empty data
- `XR-STATE-INITIAL-101` remains the 15-second state-readiness deadline
- late valid state can recover readiness

Do not design fresh nonpersistent fallback until “confirmed empty” and “lookup
failed” can be distinguished.

## 14. Remaining major sequence

1. reconcile initial-state operation/outcome semantics
2. stabilize the support-report contract
3. remove/demote duplicated legacy comparison/watchdog ownership where evidence
   permits
4. address optional-service terminality and broader cleanup afterward

The overall coordinator project is not complete.

## 15. Other separate follow-up

Keep separate from the next coordinator patch:

- remove only the dead canonical-Sage `.env` entry later
- verify persistent `SAGECELL_PAGE_AUTH_SECRET` deployment configuration on each target
- post-rollout trusted-origin/exact-request Sage authorization hardening
- coordinator-only aggregate statistics workflow
- LRS retention/pruning and aggregate preservation
- account/profile dropdown cleanup

## 16. Operational rules

- verify host/branch/HEAD/staged/dirty state before edits
- use narrow guarded changes
- use `git --no-pager diff`
- run `git diff --check`
- run focused tests
- rebuild browser JS inside `devximserver` after browser-source changes
- verify host/container hashes
- browser-test the rebuilt bundle
- stage only explicit files
- commit only after review
- push only after explicit decision
- avoid recursive greps into generated bundles when narrow source-file grep is
  sufficient

## 17. Do not accidentally

- weaken the failed-initial-MathJax interaction block without evidence
- conflate canonical Sage computation and visible Sage settlement
- restore the legacy browser Sage executor
- treat canonical invariant failure as arbitrary-code authorization
- let an old explicit Sage Retry attempt overwrite a newer result
- leave known Sage failure represented only by a spinner
- erase timeout/failure history after safe recovery
- reconstruct the immutable Sage manifest from MathJax-mutated DOM
- remove `repositories/.env` as general cleanup
- print secrets
- treat activity bootstrap invocation as activity completion
- modernize Node/MathJax/dependencies inside lifecycle work
- call a browser-source patch validated before rebuilding `main.min.js`

## 18. Recovery summary

The Page Runtime Coordinator has progressed from passive observation to active
startup ownership and explicit initial MathJax/Sage/answer-readiness lifecycle
contracts. The pushed checkpoint through `eed8ae4` contains the completed Sage
milestones and refreshed checkpoint docs. The current uncommitted worktree closes
the `initial-math-answers` reconciliation with a development fault probe,
same-operation degraded external recovery in the coordinator core, 95 focused
passing tests, and browser proof that a forced missing answer model degrades then
repairs to settled while interaction/page readiness recover transitively. No
answer identity redesign or answer-specific deadline was introduced.

The next substantive lifecycle is initial-state operation/outcome semantics,
followed by the stable support-report contract.
