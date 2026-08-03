# Xronos Page Runtime Coordinator — Current Handoff

**Purpose:** living operational handoff for recovering the project’s full context in a new chat or after a long pause.
**Current file:** `documentation/page-runtime/Xronos_Page_Runtime_Coordinator_CURRENT_HANDOFF.md`
**Last updated:** 2026-08-03
**Working branch:** `page-runtime-coordinator`
**Validated runtime implementation commit:** `785cd8a` — `Block interaction after failed initial MathJax render`
**Previous documentation checkpoint:** `04bf796` — `Update MathJax coordinator handoff`
**Branch publication state:** the failed-render runtime implementation and this follow-up documentation update are intended to be pushed together. Verify the current local and remote tips rather than relying only on this recorded checkpoint.

> This file is an operational index and decision record. It does not replace the
> authoritative design, pipeline, ownership, degraded-state, inventory, or TODO
> documents. Update it whenever the active branch, current milestone, next step,
> or important constraint changes.

---

## Current milestone snapshot

The initial MathJax Process lifecycle migration has progressed substantially
beyond the earlier implementation-status snapshot.

Committed work through `efea315` includes:

- a reusable dependency-aware coordinator core;
- external coordinator signals and operation recovery;
- a passive coordinator adapter integrated with the existing runtime;
- coordinator ownership of several startup control seams;
- binding the authoritative initial MathJax `Begin Process` and `End Process`
  lifecycle to one generation;
- moving the initial MathJax readiness timeout into the coordinator task;
- rejecting mismatched or stale initial MathJax completion;
- associating initial MathJax parse and processing errors with the bound
  generation;
- recording initial MathJax terminal metadata;
- a browser fault-injection probe for initial MathJax processing errors;
- one-shot `sessionStorage` consumption for that probe.

Browser fault-injection evidence established that an initial MathJax processing
error commonly poisons the mathematical rendering across the page rather than
remaining confined to one expression.

The resulting policy decision is:

> Any processing error during the authoritative initial MathJax Process makes
> the authored mathematical coursework pedagogically untrustworthy for that
> page load. The page shell and clearly independent passive media may remain
> available, but student coursework interaction must be blocked until reload.

The underlying initial MathJax coordinator task should report `failed`.
Derived content, interaction, and page readiness may report `degraded` so the
page can expose a bounded failure state instead of remaining indefinitely
loading.

### Completed failed-render interaction work

Commit `785cd8a` implements the failed-render interaction policy in:

- `public/javascripts/main.js`
- `public/javascripts/page-runtime-coordinator-adapter.js`
- `public/javascripts/page-runtime.js`
- `test/page-runtime-coordinator-adapter.js`

The implementation:

- reports the generation-bound initial MathJax task as `failed` when associated
  processing errors are present;
- propagates that failure into degraded content, interaction, and page
  readiness;
- presents a persistent, visible mathematical-rendering failure notice;
- blocks mathematical coursework interaction for the remainder of the page
  load;
- disables existing and dynamically inserted matching controls;
- preserves the page shell and does not leave the loading spinner active;
- permits a clean reload to start a new lifecycle and restore ordinary
  interaction when MathJax succeeds.

Validation completed before commit:

- focused coordinator and fault-probe tests: 72 passing;
- browser bundle build succeeded inside `devximserver`;
- an injected initial processing failure produced 11 recorded processing
  errors and a failed initial MathJax task;
- content, interaction, and page readiness became `degraded`;
- the interaction block became `active`;
- all surviving answer controls were disabled;
- the failure notice was present and visible;
- the one-shot fault request was consumed;
- a normal reload returned all readiness tasks to `succeeded`, removed the
  notice and block, and enabled all 42 controls;
- a dynamically inserted root `.btn-ximera-submit` control was automatically
  disabled and marked by the MutationObserver.

A passive-media fixture such as an embedded YouTube video remains useful
follow-up coverage, but it does not block this completed runtime change.

### Development environment reminder

The verified development container is `devximserver`.

- Xronos Express listens on container port `2000`.
- Podman publishes that port as host port `2022`.
- Browser assets must be rebuilt inside the container at `/usr/var/server`.
- A direct request to `/javascripts/main.min.js` is not a valid bundle
  verification route in this application; Xronos may interpret `javascripts`
  as a repository slug.

---

## 1. How to use this handoff

At the start of a new work session:

1. Read this file first.
2. Verify the branch, HEAD, remote relationship, and working-tree state rather
   than trusting the values above.
3. Read the authoritative documents listed below, especially any sections this
   handoff marks as relevant to the next task.
4. Inspect the actual code around the next migration boundary before proposing a
   patch.
5. Preserve small, independently reversible commits.
6. Do not push merely because a commit was created; follow the current session’s
   explicit push decision.

Suggested prompt for a future chat:

> Read
> `documentation/page-runtime/Xronos_Page_Runtime_Coordinator_CURRENT_HANDOFF.md`
> and the authoritative documents it references. Verify the current branch and
> commits. Then summarize
> the project’s big-picture goal, current implementation state, unresolved
> reconciliation work, and the safest next patch before changing code.

---

## 2. Authoritative document map

Read these together:

- `documentation/page-runtime/COORDINATOR_DESIGN.md`
  - Target architecture, migration principles, dependency-graph model, phases,
    coordinator responsibilities, and non-responsibilities.
- `documentation/page-runtime/CURRENT_PIPELINE.md`
  - Observed current behavior and sequencing, including legacy behavior and
    browser evidence.
- `documentation/page-runtime/RUNTIME_OWNERSHIP_MATRIX.md`
  - Current and intended owner, trigger, prerequisites, terminal signals,
    deadlines, fallback behavior, and migration status for each runtime concern.
- `documentation/page-runtime/DEGRADED_STATE_POLICY.md`
  - Failure isolation, acceptable degraded outcomes, blocking behavior, and late
    recovery policy.
- `documentation/page-runtime/FEATURE_INVENTORY.md`
  - Runtime feature and subsystem inventory.
- `documentation/page-runtime/TODO.md`
  - Broader backlog and deferred work.
- `documentation/page-runtime/IMPLEMENTATION_STATUS.md`
  - Durable factual snapshot of what has been implemented and what remains.
- `docs/page-runtime-inventory-closeout.md`
  - Inventory closeout and supporting conclusions.
- This file: `documentation/page-runtime/CURRENT_HANDOFF.md`
  - Active operational state, sequencing, cautions, and immediate next work.

Older context that remains useful but is not authoritative over the newer docs:

- `Xronos_Page_Runtime_Coordinator_Handoff_2026-07-29.md`
  - Original project motivation, broad architecture, rollout strategy, test
    matrix, and failure-injection ideas.

When documents disagree, resolve the disagreement explicitly in the repository.
Do not silently choose whichever version is convenient.

---

## 3. Project framing

### 3.1 Core goal

Replace Xronos’s organically grown network of startup callbacks, import-time
side effects, DOM-ready handlers, MathJax signals, WebSocket callbacks, Sage
promises, display callbacks, and readiness flags with an explicit,
dependency-aware **Page Runtime Coordinator**.

The coordinator should:

- understand partly parallel initialization paths;
- start work when actual prerequisites are satisfied;
- prevent duplicate starts;
- assign task and operation identity;
- record explicit terminal outcomes;
- apply bounded deadlines;
- classify failures and blocked descendants;
- localize recoverable failures;
- support safe late recovery;
- expose bounded, privacy-safe diagnostics;
- derive page readiness from explicit dependency joins.

The coordinator orchestrates existing services. It does not immediately replace
their mature internal implementations.

### 3.2 Why the project exists

The immediate motivation was a class of browser-side failures where Xronos
appeared to complete server-side Sage computation successfully but left a user
with an indefinite spinner or otherwise unfinished page state.

Earlier evidence showed that a canonical Sage request could be submitted,
receive HTTP 200, parse successfully, map every result, and report success while
the visible placeholder lifecycle had not conclusively completed. This exposed
a larger architectural issue: successful computation, successful mapping,
successful DOM replacement, successful MathJax rerender, and usable page
readiness were being conflated or inferred from loosely coupled callbacks.

The same architectural weakness also affects saved-state synchronization,
MathJax processing, answer attachment, activity initialization, optional
services, repeated passes, timeouts, and late callbacks.

### 3.3 Explicit non-goals

This project is not a general Xronos modernization project.

Do not broaden it into:

- upgrading Xronos to a modern Node release;
- upgrading MathJax 2 to a newer major version;
- replacing the browser stack with React, Vue, or another framework;
- redesigning answer correctness algorithms;
- rewriting validator business logic;
- replacing Sage evaluation;
- replacing persistence or Canvas grade passback;
- republishing all existing author content;
- fixing every optional interactive at once.

Modernizing Node, dependencies, MathJax, and the broader stack is desirable
future work, but it is outside the current coordinator scope unless a minimal
compatibility fix is strictly required for this project.

---

## 4. Architectural principles and invariants

### 4.1 Dependency graph, not a linear startup script

The runtime permits several valid orders. The coordinator must model a graph.

Examples:

- initial saved state may arrive before or after MathJax completes;
- MathJax may discover answers before activity initialization finishes;
- Sage results and required rerenders may complete in different orders;
- pages without Sage must settle `not-required`;
- pages without answers must settle `not-required`;
- optional interactives may finish after core readiness;
- late successful work may repair an earlier degraded state;
- repeated MathJax passes must not redefine initial logical completion;
- parser-owned author JavaScript may execute before DOM ready and before saved
  state is available.

No patch should assume one universal total ordering when the runtime allows
several.

### 4.2 Preserve the three runtime layers

Do not collapse everything into one generic “ready” flag.

- **Services:** long-lived capabilities such as WebSocket state, MathJax, Sage
  proxy, current-user identity, and optional libraries.
- **Operations:** bounded attempts such as one state retrieval, one MathJax
  pass, one Sage request, one answer submission, one initialization, or one
  rerender.
- **Components:** page- or element-level consumers such as activity, problem,
  logical answer, grouped validator, Sage placeholder, hint, video, or optional
  interactive.

### 4.3 Exactly-once and stale-work safety

Every operation must be safe against:

- duplicate invocation;
- callback plus timeout races;
- resolution after timeout;
- rejection after success;
- stale completion from a replaced operation;
- late callbacks after teardown;
- repeated MathJax passes;
- detached or replaced DOM targets.

Generation or operation identity must be carried wherever a later callback
could otherwise complete the wrong operation.

### 4.4 Failure isolation

A local failure should not leave the entire page indefinitely loading.

- Required dependencies must settle success, not-required, degraded, failed, or
  timed-out according to policy.
- Optional services must not block core readiness unless explicitly required.
- Degraded state must identify which capability is unavailable.
- Late safe recovery may move readiness from degraded to ready while preserving
  the earlier timeout or failure in diagnostic history.

### 4.5 Compatibility

Preserve existing published content and established public functions whenever
possible. Migrate ownership behind compatibility surfaces rather than forcing
all callers to change simultaneously.

Relevant compatibility surfaces include:

- `fetchData()`;
- `persistentData()`;
- existing Sage exports and author macros;
- existing MathJax macros and hooks;
- current activity and answer initialization entry points.

### 4.6 Privacy-safe diagnostics

Do not log or expose:

- access tokens;
- cookies;
- full Sage authorization values;
- LTI secrets;
- raw student answers by default;
- complete user identifiers unless explicitly needed and authorized;
- full author code sent to Sage outside administrator-only debugging.

Prefer counts, hashes, lengths, operation IDs, generations, phase names,
sanitized error types, and short messages.

---

## 5. High-level dependency model

The working model is approximately:

```text
bundle execution
├── page metadata and subpath discovery
├── parser-owned author setup JavaScript
└── module registration

DOM ready
├── independent static/account UI
├── page/component discovery
├── state socket startup
└── activity bootstrap request

state socket + authorized watch
└── initial saved-state outcome

MathJax startup
└── initial MathJax Process
    ├── initial logical answer discovery and attachment
    └── canonical inline Sage discovery

canonical Sage request
└── canonical Sage result availability

inline Sage discovery + results + required rerenders
└── initial inline Sage visible terminal outcome

initial saved state + activity initialization request
└── activity initialization release
    ├── problems and validators
    ├── hints and feedback
    ├── author inline JavaScript
    ├── progress behavior
    └── optional interactives that remain historically coupled

initial-state
└── state-synchronized

mathjax-initial-process + canonical-sage + sage-inline-initial
└── content-ready

activity + initial-math-answers
└── interaction-ready

state-synchronized + content-ready + interaction-ready
└── page-readiness
```

This graph is descriptive and must evolve as ownership is clarified.

---

## 6. Coordinator task model currently implemented

### 6.1 External leaf tasks

The adapter currently registers these external leaves:

- `initial-state`
- `mathjax-initial-process`
- `canonical-sage`
- `sage-inline-initial`
- `activity`
- `initial-math-answers`

All currently use:

```text
recoveryPolicy: allow-late-success
```

This permits safe late terminal recovery after timeout where the adapter and
generation rules accept the late result.

### 6.2 Active control tasks

Current control tasks include:

- `document-ready`
- `activity-bootstrap-trigger`
- `activity-initialization-requested`
- `activity-initialization-release`
- `mathjax-startup-requested`
- `mathjax-startup-trigger`
- `mathjax-startup-ended`
- `mathjax-startup-ui-finalization`
- `document-ready-static-ui-requested`
- `document-ready-static-ui`
- `document-ready-kinetic-navigation-requested`
- `document-ready-kinetic-navigation`
- `document-ready-references-requested`
- `document-ready-references`

These represent incremental ownership transfers. Some control tasks own only
the trigger or release boundary while the internal legacy implementation remains
in place.

### 6.3 Derived readiness tasks

- `state-synchronized`
- `content-ready`
- `interaction-ready`
- `page-readiness`

Derived tasks recompute after recoverable dependency changes so a previously
degraded dimension can become ready after safe late recovery.

### 6.4 Coordinator core capabilities

The standalone coordinator core currently supports:

- dependency validation;
- missing-dependency detection;
- cycle detection;
- independent task execution;
- explicit accepted dependency states;
- synchronous and Promise-based tasks;
- task timeouts;
- external waiting tasks;
- buffered external signals;
- duplicate and conflicting signal handling;
- operation IDs;
- stale completion recording;
- bounded event history;
- blocked descendants;
- recomputable derived tasks;
- `allow-late-success`;
- transitive recovery and unblocking;
- deterministic inspection reports.

---

## 7. Implementation history and milestone state

This is a concise project history, not a substitute for `git log`.

### 7.1 Inventory and passive diagnostics

Completed earlier:

- broad runtime inventory from `main.js` through imported modules;
- module-load side effects and DOM-ready behavior mapped;
- MathJax, state, Sage, answer, activity, UI, and optional-service paths
  documented;
- passive page-runtime event recorder and unified inspector introduced;
- passive coordinator adapter added;
- coordinator and legacy readiness compared in shadow mode.

Browser evidence showed agreement on eleven representative page-runtime
fixtures at an earlier milestone. The fixtures covered applicable combinations
of Sage required/not-required and initial answers succeeded/not-required.

### 7.2 First active ownership transfers

Ownership was moved incrementally, including:

- guarded one-shot activity bootstrap trigger;
- state-dependent activity initialization request/release boundary;
- MathJax startup trigger;
- MathJax Startup End UI finalization;
- document-ready static UI;
- kinetic navigation;
- references;
- Bootstrap UI initialization for dynamically created elements.

Important distinction: transferring a trigger does not mean the coordinator
owns every internal operation initiated by that trigger.

### 7.3 Durable implementation status checkpoint

Commit:

```text
a2b88ba Document coordinator implementation status
```

This added or updated:

```text
documentation/page-runtime/IMPLEMENTATION_STATUS.md
```

At the time it was pushed, local and remote were synchronized at `a2b88ba`.

### 7.4 Initial MathJax Process generation binding

Commit:

```text
20b2e7b Bind coordinator to initial MathJax process generation
```

This is the first reconcile patch for the initial MathJax Process lifecycle.

It adds:

- explicit binding of the first initial Process generation;
- explicit completion API for the bound generation;
- generation-associated MathJax error observation;
- rejection of mismatched completion;
- rejection of a later legacy completion that would bypass the bound generation;
- compatibility with the legacy `mathjax-pass: ended` path when no explicit
  generation has been bound;
- focused tests for all of the above.

This commit is the rebased equivalent of the earlier local commit `ba32fea`.

### 7.5 Coordinator-owned initial MathJax timeout

Current local commit:

```text
60c053f Move initial MathJax timeout into coordinator
```

This transfers ownership of the initial MathJax Process deadline into the
coordinator while retaining the legacy watchdog for independent comparison.

It adds:

- a 15-second timeout on the external `mathjax-initial-process` task;
- timeout start at coordinator/module initialization, preserving the legacy
  boundary and allowing timeout before `Begin Process`;
- diagnostic code `XR-MATHJAX-INITIAL-101`;
- timeout metadata containing phase, bound generation, begun/completed flags,
  observed error count, attempt, and coordinator operation ID;
- generation-safe late recovery;
- rejection of mismatched late completion;
- recomputation of derived readiness after matching late completion;
- generic coordinator timeout-detail callbacks;
- persistent `lastTimeout` inspection data after recovery;
- clearing of the current timeout error after successful recovery;
- Node-only timer `unref()` support without changing browser timer behavior;
- stricter rejection of MathJax error observations that omit the bound
  generation.

The legacy MathJax watchdog remains active, records its own deadline event, and
continues to drive legacy readiness comparison. It no longer signals or
double-settles the coordinator task.

Last known branch state:

```text
60c053f (HEAD -> page-runtime-coordinator)
20b2e7b Bind coordinator to initial MathJax process generation
91cc8b6 (origin/page-runtime-coordinator)
```

These commits were pushed as part of the synchronized `9b80564` checkpoint.

### 7.6 Initial MathJax terminal metadata

Current local commit:

```text
23c2cb7 Add initial MathJax terminal metadata
```

This is a metadata-only extension of the initial MathJax Process completion
payload.

It adds:

- a nested `pass` summary containing the existing Process-pass counters;
- an `answers` summary from `initialMathAnswerDetails()`;
- an `inlineSage` summary from `initialInlineSageDetails()`;
- preservation of the existing flat pass counters for compatibility;
- adapter passthrough tests proving the richer payload remains available under
  `task.result.details`.

The adapter continues to own the top-level terminal error metadata:

- `errorCount`;
- `errors`.

This commit does not change:

- Process generation binding;
- timeout ownership;
- late-recovery policy;
- derived readiness;
- answer readiness classification;
- inline Sage readiness classification;
- MathJax error terminal policy.

Last known branch state:

```text
23c2cb7 (HEAD -> page-runtime-coordinator)
9b80564 (origin/page-runtime-coordinator)
```

`23c2cb7` is intentionally unpushed pending this handoff update.

---

## 8. Detailed MathJax contract and current reconciliation

### 8.1 Actual event source

MathJax pass observation is driven by:

```javascript
MathJax.Hub.signal.Interest(function(message) {
    // observes Begin/End Process, Reprocess, and Rerender
});
```

The listener recognizes:

- `Begin Process`
- `End Process`
- `Begin Reprocess`
- `End Reprocess`
- `Begin Rerender`
- `End Rerender`
- `New Math`

The runtime does not use separate `StartupHook("Begin Process")` and
`StartupHook("End Process")` registrations.

### 8.2 Generation tracking

`beginMathJaxPass()`:

- normalizes the pass type;
- assigns a monotonically increasing generation;
- records starting counters;
- stores the active pass by type;
- reports non-rerender pass start.

`endMathJaxPass()`:

- rejects/records orphan ends;
- computes duration and counter deltas;
- records completed passes;
- treats the first completed `process` as the initial logical Process;
- finalizes initial answer readiness;
- finalizes initial inline Sage discovery;
- reports pass completion and aggregate pass state.

### 8.3 Initial Process semantic rule

Only the first completed full `Process` defines:

- the initial MathJax generation;
- initial logical answer discovery/attachment completion;
- initial inline Sage discovery completion.

Later full Process passes may repair unresolved answers, but they must not:

- replace the original initial generation;
- emit another initial terminal event;
- complete the initial coordinator leaf for a different generation.

### 8.4 New generation-safe APIs

After `ba32fea`, the adapter exposes lifecycle methods equivalent to:

- `beginInitialMathJaxProcess(details)`
- `observeInitialMathJaxProcessError(details)`
- `completeInitialMathJaxProcess(details)`
- guarded legacy initial Process completion

`page-runtime.js` exposes wrappers and browser diagnostics.

`main.js` calls:

- begin API when the Process generation is created;
- error-observation API from MathJax parse/processing error hooks;
- completion API after initial answer and inline Sage discovery finalization.

### 8.5 Error handling status

Current MathJax errors are associated with the bound initial generation and
retained in the terminal result metadata.

They do **not yet** automatically degrade or fail the initial Process task.

This is intentional pending policy work because:

- some parse errors may be localized while the overall Process still ends;
- `Math Processing Error` may or may not prevent useful content;
- terminal policy should be based on observed MathJax behavior and degraded-state
  design, not on the mere presence of an error hook.

### 8.6 Current MathJax timeout ownership

The coordinator now owns the 15-second deadline for
`mathjax-initial-process`.

The timeout is armed when the dependency-free external task is armed during
coordinator creation. This matches the legacy watchdog’s module-evaluation
boundary and intentionally permits timeout before an initial Process generation
has been bound.

On timeout, inspection exposes:

- diagnostic code `XR-MATHJAX-INITIAL-101`;
- deadline milliseconds;
- phase: `waiting-for-process` or `process-running`;
- bound generation, if any;
- begun and completed flags;
- observed initial-generation error count;
- coordinator attempt and operation ID.

A matching late completion may recover the task because its recovery policy
remains `allow-late-success`. A mismatched generation is rejected before it can
signal the coordinator.

After recovery:

- the current task state and result describe the successful completion;
- the current error is cleared;
- `lastTimeout` preserves the earlier timeout error and structured metadata;
- the original timeout transition remains in coordinator event history;
- derived readiness is recomputed.

The legacy initial MathJax watchdog remains temporarily in
`page-runtime.js`. It records the legacy deadline and readiness evidence for
comparison but no longer owns or double-settles the coordinator task.

### 8.7 Current MathJax terminal metadata

The successful initial Process result now exposes three related views under
`task.result.details`.

The compatibility fields remain flat:

- `generation`;
- `passType`;
- `durationMilliseconds`;
- `newMathMessages`;
- `discoveredAnswerInstances`;
- `answerConnectionAttempts`;
- `missingAnswerModels`;
- `uniqueAnswersAdded`.

The nested `pass` summary repeats the Process-pass counters in an explicit
sub-object for clearer inspection.

The nested `answers` summary comes from `initialMathAnswerDetails()` and
includes:

- generation;
- expected answers;
- model-resolved answers;
- attached answers;
- unresolved answer count and IDs;
- connection attempts;
- Process duration;
- Process-complete state.

The nested `inlineSage` summary comes from `initialInlineSageDetails()` and
includes:

- expected and discovered placeholders;
- started requests;
- MML-applied count;
- rerender-completed count;
- failed and settled counts;
- Process-complete state.

The adapter adds top-level `errorCount` and `errors` beside `details`. This keeps
MathJax error association owned by the generation-safe adapter rather than
duplicating it in `main.js`.

### 8.8 Remaining MathJax reconcile work

The terminal metadata collection step is complete. The next MathJax work is
evidence-based error classification.

Likely work:

1. inventory real callback ordering for localized TeX parse errors;
2. inventory real callback ordering for `Math Processing Error`;
3. determine whether `End Process` still occurs for each error class;
4. determine whether answer discovery, answer attachment, and inline Sage
   discovery remain usable after each error class;
5. define diagnostic-only, degraded, and failed classifications;
6. add browser fixtures or controlled fault injection before changing policy;
7. retain current successful completion semantics until evidence supports a
   stricter terminal outcome;
8. retain generation-safe timeout and late recovery unchanged.

Do not remove the legacy watchdog until representative browser comparison shows
parity or an intentional, documented improvement.

---

## 9. Sage architecture and current understanding

Sage must remain split into distinct layers.

### 9.1 Immutable pre-MathJax manifest

Captured before MathJax transforms the page.

It provides stable identity for:

- expression entries;
- answer-key entries;
- problem identity;
- silent blocks;
- ordering and mapping.

The manifest must not be reconstructed from already transformed DOM when a
stable pre-processing identity is required.

### 9.2 Canonical page request

The canonical initial request lifecycle includes:

- waiting for seed when required;
- manifest compilation;
- compiled-size validation;
- request submission;
- response receipt;
- response parsing;
- result and expression-failure counts;
- permanent fallback versus retryable failure;
- deduplicated `initialPromise`.

Permanent eligibility/manifest failures may be cached. Network, authorization,
and parse failures must remain retryable where policy allows.

### 9.3 Per-call mapping and generation

The mapping layer includes:

- generation ID and seed;
- stale-generation rejection;
- call mappings;
- pass cursor;
- prefix restarts;
- preliminary calls;
- pending and settled promises;
- guarded release of “Show me another.”

A successful canonical request is not, by itself, proof that every visible
consumer has settled.

### 9.4 Visible placeholder settlement

Each visible placeholder needs its own lifecycle, including:

- discovered;
- request started;
- result resolved;
- MathML applied;
- rerender queued;
- rerender completed;
- fallback shown;
- rerender unavailable;
- display failure;
- missing fallback placeholder.

Successful computation and successful visible display are separate terminal
facts.

### 9.5 Separate coordinator leaves

Keep these leaves distinct:

- `canonical-sage`
- `sage-inline-initial`

`canonical-sage` answers whether the canonical computation/results became
available or were not required/degraded.

`sage-inline-initial` answers whether all required initial visible inline Sage
consumers settled, including required rerenders or direct fallback.

### 9.6 Future placeholder identity

A robust placeholder record should link:

- initial MathJax generation;
- manifest stable expression ID;
- canonical Sage request/generation;
- placeholder DOM identity;
- problem identity;
- terminal display outcome.

---

## 10. Initial state and activity reconciliation

### 10.1 Initial state

The current initial-state path remains an external coordinator leaf translated
from legacy runtime events.

The legacy 15-second watchdog still exists with diagnostic code:

```text
XR-STATE-INITIAL-101
```

The coordinator currently receives deadline signals from that legacy watchdog
and supports allowed late recovery.

Future reconciliation must determine:

- exact coordinator ownership boundary for connection/watch/state outcome;
- whether the timeout begins at socket startup, authorized watch, or state
  request;
- what interaction is safe before state is available;
- how late state is reconciled with already initialized UI;
- which operations are disabled in degraded state;
- how persistence risk is communicated to the user.

### 10.2 Activity bootstrap versus internal initialization

These are distinct:

- the coordinator owns a guarded one-shot document-ready bootstrap trigger;
- the legacy activity implementation still performs internal setup;
- state-dependent initialization uses an explicit request/release boundary;
- activity component completion remains separate from trigger completion.

Do not treat “bootstrap trigger succeeded” as “activity fully initialized.”

### 10.3 Initial math answers

Initial answer readiness is a separate external leaf.

The initial MathJax Process discovers and attempts to connect logical answer
instances. The terminal outcome must distinguish:

- succeeded;
- not required;
- degraded due to missing/unresolved answer models;
- later repairs during reprocessing.

Repeated passes may repair unresolved answers but must not redefine the original
initial Process identity.

---

## 11. Current legacy watchdogs and duplicated ownership

Three legacy 15-second watchdogs remain in `page-runtime.js`:

| Dependency | Code |
|---|---|
| `initial-state` | `XR-STATE-INITIAL-101` |
| `mathjax-initial-process` | `XR-MATHJAX-INITIAL-101` |
| `sage-inline-initial` | `XR-SAGE-INLINE-INITIAL-101` |

At present they:

- maintain legacy readiness details;
- signal coordinator deadlines;
- preserve parallel comparison;
- clear or record late completion;
- feed existing inspection and support diagnostics.

The migration strategy is not “delete all three immediately.”

For each leaf:

1. establish explicit identity and terminal contract;
2. move timeout ownership to the coordinator;
3. compare against legacy behavior;
4. preserve late-recovery and diagnostic semantics;
5. remove duplicate legacy ownership only after evidence supports it.

---

## 12. The broader reconcile patch remains active work

The recent MathJax commit is only the first reconciliation step.

Earlier ownership-transfer work was intentionally narrow and sometimes moved a
trigger without yet carrying all of the robust behavior intended by the final
coordinator design.

The broader reconciliation still includes:

- coordinator-owned deadlines rather than legacy timers merely signaling the
  coordinator;
- operation/generation-safe late recovery;
- richer terminal result metadata;
- explicit failure classification;
- blocked-descendant behavior;
- visible display terminality for Sage;
- separation of computation, mapping, rerender, and display;
- reconciliation of initial state and activity initialization;
- removal of duplicate paths after shadow comparison;
- documentation updates after each refined dependency or ownership boundary.

Do not interpret a task name’s existence in the coordinator as proof that its
full lifecycle has been migrated.

---

## 13. Testing and runtime environment

### 13.1 Host environment

Last observed host tools:

```text
Node v8.17.0
npm 6.13.4
```

The host checkout had no `node_modules`.

### 13.2 Prebuilt Ximera image used for focused validation

Image:

```text
ghcr.io/ximeraproject/ximeraserver:v2.9
```

Observed inside the image:

```text
Node v12.22.12
npm 6.14.16
Mocha 10.0.0
Gulp 4.0.2
MathJax package 2.7.5
```

The image’s startup design links:

```text
/usr/var/server/node_modules
    -> /usr/var/server.base/node_modules
```

The application checkout itself may not contain a local dependency tree.

Important: this image proves the available test image uses Node 12. It does not
prove every deployed or historical Xronos environment uses Node 12. Production
or older environments may use Node 6 or 8. Verify the actual target environment
before making compatibility claims.

### 13.3 Dependency files

`package.json` and `cached-package.json` contain many deliberately old or pinned
dependencies required by the legacy stack.

Relevant observations:

- `package-lock.json` uses lockfile version 1;
- Mocha is locked at `10.0.0`;
- the base image contains the prebuilt dependency tree;
- `start.sh` links that tree rather than installing at startup;
- modernization of these dependencies is outside this project.

### 13.4 Validated result for `20b2e7b`

Focused test command covered:

- `test/page-runtime-coordinator-adapter.js`
- `test/page-runtime-coordinator-core.js`

Result after the generation-binding and legacy-bypass guard:

```text
60 passing
```

JavaScript build:

```text
gulp js
```

Result:

```text
successful
```

Static `node --check` validation also passed for the touched JavaScript and test
files.

### 13.5 Validated result for `60c053f`

Focused test command covered:

- `test/page-runtime-coordinator-adapter.js`
- `test/page-runtime-coordinator-core.js`

Validation used the prebuilt legacy-compatible image with its default entrypoint
explicitly bypassed:

```text
ghcr.io/ximeraproject/ximeraserver:v2.9
Node 12.22.12
npm 6.14.16
Mocha 10.0.0
Gulp 4.0.2
```

Result:

```text
67 passing
```

The focused tests cover:

- timeout before initial Process begin;
- timeout after binding a generation;
- diagnostic timeout metadata;
- matching late completion recovery;
- mismatched generation rejection;
- derived readiness recomputation;
- preserved timeout history through `lastTimeout`;
- cleared current error after recovery;
- missing-generation MathJax error rejection;
- generic external-task timeout metadata.

JavaScript build:

```text
gulp js
```

Result:

```text
successful
```

Static `node --check` validation also passed for all five touched source and test
files.

A first container attempt accidentally used the image’s default `start.sh`
entrypoint, which launched Redis, MongoDB, a full build, and the application
server. The named container was stopped, and subsequent focused validation used
`--entrypoint /bin/bash`. The real checkout was unchanged.

### 13.5 Validated result for `23c2cb7`

Focused test command covered:

- `test/page-runtime-coordinator-adapter.js`;
- `test/page-runtime-coordinator-core.js`.

Validation used an isolated application copy at `/usr/var/server` with
`node_modules` linked to the image’s prebuilt dependency tree:

```text
/usr/var/server.base/node_modules
```

Toolchain:

```text
Node 12.22.12
npm 6.14.16
Mocha 10.0.0
Gulp CLI 2.2.0
Gulp local 4.0.2
```

Focused result:

```text
67 passing
```

JavaScript build:

```text
gulp js
```

Result:

```text
successful
```

Static `node --check` validation passed for:

- `public/javascripts/main.js`;
- `test/page-runtime-coordinator-adapter.js`.

A direct `/workspace` mount with `NODE_PATH` pointed at the external prebuilt
tree allowed the tests to run but caused Browserify to resolve an invalid
relative dependency path during `gulp js`. Revalidating in the image’s expected
`/usr/var/server` layout resolved that environmental issue. The real checkout
remained unchanged throughout validation.

### 13.6 Full recursive test warning

Do not run the full recursive suite in a bare temporary application container
without required services.

A previous `mocha --recursive` attempt loaded application/integration tests and
produced repeated Redis connection errors and MongoDB buffering timeouts because
Redis, MongoDB, repositories, and keys were absent.

Observed full-suite result in that invalid environment:

```text
77 passing
3 failing
```

The failures were integration/environment failures, not coordinator unit-test
failures.

The Redis client continued retrying and spammed the terminal. The container had
to be killed from another terminal.

For ordinary coordinator patches:

- run focused coordinator tests;
- run static checks;
- run the JavaScript build;
- run broader integration tests only in a properly provisioned environment;
- name temporary containers and apply a hard timeout;
- never use indiscriminate `podman kill --all`.

---

## 14. Current safest next step

### 14.1 Verify state first

Before changing anything, verify:

```bash
hostname -f
git branch --show-current
git rev-parse --short HEAD
git status --short --branch
git --no-pager log -3 --oneline --decorate
```

Expected from the last session, but do not assume:

```text
branch: page-runtime-coordinator
HEAD: 23c2cb7
parent: 9b80564
origin/page-runtime-coordinator: 9b80564
working tree: clean
ahead: 1
```

### 14.2 Review relevant files

For the next MathJax error-classification investigation, inspect:

- `public/javascripts/main.js`;
- `public/javascripts/page-runtime.js`;
- `public/javascripts/page-runtime-coordinator-adapter.js`;
- MathJax error hooks and Process signal handling;
- browser diagnostics for the initial Process task;
- representative pages that can produce localized TeX parse errors;
- representative pages or controlled fixtures for `Math Processing Error`;
- relevant MathJax sections in:
  - `COORDINATOR_DESIGN.md`;
  - `CURRENT_PIPELINE.md`;
  - `RUNTIME_OWNERSHIP_MATRIX.md`;
  - `DEGRADED_STATE_POLICY.md`;
  - `IMPLEMENTATION_STATUS.md`.

### 14.3 Intended next patch

Do not begin with a policy-changing patch. First collect browser evidence about
how each MathJax error class affects the bound initial Process and its dependent
content.

The investigation should establish:

- whether `End Process` still occurs;
- whether the bound generation remains correct;
- whether answer discovery completes;
- whether initial answers attach or remain unresolved;
- whether inline Sage discovery completes;
- whether the page remains usable despite a localized error;
- whether current coordinator success, degraded readiness, or failure best
  represents the observed outcome.

Only after that evidence should a narrow error-classification patch be designed.
Timeout ownership, late recovery, and the new terminal metadata shape should
remain unchanged during the investigation.

---

## 15. Recommended subsequent sequence

After initial MathJax generation binding, timeout ownership, and terminal
metadata:

1. **MathJax error classification evidence**
   - collect browser evidence for TeX parse errors and Math Processing Error;
   - determine callback ordering and whether `End Process` still occurs;
   - compare answer and inline Sage readiness after each error class;
   - define diagnostic-only, degraded, and failed policy only after evidence.

2. **Inline Sage timeout ownership**
   - move deadline into the coordinator;
   - bind visible placeholder settlement;
   - preserve late recovery and fallback evidence.

3. **Initial-state timeout ownership**
   - define exact start point and degraded interaction policy;
   - move deadline into coordinator;
   - validate late state reconciliation.

4. **Activity/internal initialization reconciliation**
   - distinguish request, release, initialization, and component completion;
   - carry operation identity through callbacks;
   - prevent duplicate starts and stale completion.

5. **Legacy comparison and removal**
   - compare coordinator and legacy outcomes on the representative browser
     fixture set;
   - remove duplicated timers/flags one dependency at a time;
   - retain rollback capability during observation.

6. **Feature-gated rollout**
   - diagnostics;
   - shadow mode;
   - controlled development fixtures;
   - selected repositories;
   - limited production allowlist;
   - broader rollout only after evidence.

---

## 16. Open design decisions

These remain unresolved or intentionally deferred.

### MathJax

- Which parse/processing errors should degrade the initial Process?
- Can an initial Process reach a useful terminal success with localized errors?
- Which MathJax callbacks are guaranteed after each error class?
- Should an orphan `End Process` ever recover a timed-out initial task?

### State

- When does the initial-state deadline start?
- May students interact before persistence is confirmed?
- Which actions must be disabled in degraded state?
- How is a late saved seed reconciled with already rendered randomized content?

### Sage

- What exact event proves visible display terminality?
- When is direct DOM fallback safe?
- How should detached placeholders settle?
- Which failures are permanent, retryable, or localized?
- How should required rerender timeout be classified?
- How should “Another” share the same terminal-operation model?

### Activity and answers

- Which internal activity operations truly require state?
- Which may initialize before state?
- How should later answer repair affect initial readiness history?
- What is the exact boundary between answer discovery, model connection,
  validator initialization, and saved-state application?

### Optional services

- Which currently block startup only due to historical coupling?
- Which are actually required by specific content?
- How should optional failures be shown locally?

---

## 17. Operational working style

The established safe workflow for this branch is:

- provide guarded, copy/pasteable Bash blocks;
- check expected host, branch, HEAD, remote relation, and working tree;
- make narrow changes;
- use exact insertion points;
- run `git diff --check`;
- run syntax checks;
- run focused tests in the legacy-compatible prebuilt image;
- run `gulp js`;
- inspect the exact diff and changed-file allowlist;
- commit only after review;
- push only after an explicit decision;
- never claim success beyond pasted terminal evidence.

For temporary containers:

- give them an explicit name;
- install a cleanup trap;
- apply `timeout --signal=TERM --kill-after=...`;
- do not start the full application unless services are provisioned;
- do not run the full recursive suite by default.

---

## 18. Documentation maintenance rule

Update this file after any of the following:

- branch or remote changes;
- a commit is created, amended, pushed, reverted, or superseded;
- a coordinator task gains or loses ownership;
- a legacy watchdog is removed;
- a dependency edge changes;
- a terminal-state policy changes;
- a new browser fixture or failure-injection result changes confidence;
- a design decision is resolved;
- the immediate next patch changes.

Each update should modify at least:

- header commit/branch state;
- implementation history;
- current next step;
- open decisions;
- testing evidence;
- legacy ownership table if relevant.

Do not let this file become a second complete design specification. Link to the
authoritative document and record only the current operational interpretation.

---

## 19. End-of-session update template

Append or revise the relevant sections using this checklist:

```text
Date:
Branch:
HEAD:
origin/<branch>:
Working tree:
Pushed?:

Commit(s) created:
Files changed:
Ownership transferred:
Legacy path retained:
Legacy path removed:

Focused tests:
Build:
Browser fixtures:
Known failures/environment limits:

Current design decision:
Next patch:
Do not accidentally:
```

---

## 20. Immediate “do not accidentally” list

- Do not push `23c2cb7` without checking whether this handoff update should be
  committed with it as one remote checkpoint.
- Do not assume the coordinator fully owns a lifecycle merely because a task
  exists.
- Do not let the legacy `mathjax-pass: ended` path bypass bound-generation
  validation.
- Do not reintroduce legacy deadline settlement for
  `mathjax-initial-process`.
- Do not remove the legacy MathJax watchdog before browser comparison confirms
  parity or intentional improvement.
- Do not make every MathJax error terminal without policy evidence.
- Do not conflate canonical Sage success with visible placeholder success.
- Do not combine canonical Sage and inline visible Sage into one leaf.
- Do not treat activity bootstrap invocation as activity completion.
- Do not run the full recursive test suite in an unprovisioned container.
- Do not modernize Node, MathJax, or the dependency stack as part of this
  coordinator reconciliation.
- Do not expose sensitive runtime values in diagnostics.
- Do not assume production uses the same Node version as the available test
  image; verify it.

---

## 21. One-paragraph recovery summary

The project is incrementally replacing Xronos’s loosely coupled browser startup
callbacks with an explicit Page Runtime Coordinator while preserving existing
content and mature service implementations. The initial MathJax Process is now
bound to its first generation, owns a coordinator-managed 15-second deadline,
supports generation-safe late recovery, and exposes structured timeout history.
Commit `23c2cb7` adds richer successful terminal metadata under
`task.result.details`: compatibility pass counters, a nested pass summary,
initial answer readiness details, and initial inline Sage discovery/settlement
details. Adapter-owned `errorCount` and `errors` remain separate, and no
readiness or error terminal policy changed. Focused coordinator tests report 67
passing and the JavaScript build succeeds. The next work is browser evidence
collection for MathJax error classification, not further metadata plumbing or
dependency modernization.
