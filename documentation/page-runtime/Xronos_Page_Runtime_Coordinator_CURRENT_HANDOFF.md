# Xronos Page Runtime Coordinator — Current Handoff

**Purpose:** living operational handoff for recovering the project’s full context in a new chat or after a long pause.  
**Canonical location:** `documentation/page-runtime/CURRENT_HANDOFF.md`  
**Last reconstructed:** 2026-08-03  
**Working branch:** `page-runtime-coordinator`  
**Last known local HEAD:** `ba32fea` — `Bind coordinator to initial MathJax process generation`  
**Last known remote HEAD:** `a2b88ba` — `Document coordinator implementation status`  
**Last known branch state:** local branch ahead of `origin/page-runtime-coordinator` by one commit; `ba32fea` intentionally not pushed yet.

> This file is an operational index and decision record. It does not replace the
> authoritative design, pipeline, ownership, degraded-state, inventory, or TODO
> documents. Update it whenever the active branch, current milestone, next step,
> or important constraint changes.

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

> Read `documentation/page-runtime/CURRENT_HANDOFF.md` and the authoritative
> documents it references. Verify the current branch and commits. Then summarize
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

Current local commit:

```text
ba32fea Bind coordinator to initial MathJax process generation
```

This commit is the first reconcile patch for the initial MathJax Process
lifecycle. It is intentionally narrower than the complete timeout transfer.

It adds:

- explicit binding of the first initial Process generation;
- explicit completion API for the bound generation;
- generation-associated MathJax error observation;
- rejection of mismatched completion;
- rejection of a later legacy completion that would bypass the bound generation;
- compatibility with the legacy `mathjax-pass: ended` path when no explicit
  generation has been bound;
- focused tests for all of the above.

Last known branch state:

```text
ba32fea (HEAD -> page-runtime-coordinator)
a2b88ba (origin/page-runtime-coordinator)
```

`ba32fea` was intentionally not pushed before the pause.

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

### 8.6 Remaining MathJax reconcile work

The legacy initial MathJax watchdog still owns the 15-second timer in
`page-runtime.js`.

Next intended reconcile step:

1. configure the `mathjax-initial-process` external task with a coordinator-owned
   timeout;
2. preserve diagnostic code `XR-MATHJAX-INITIAL-101`;
3. bind timeout and late recovery to the initial operation/generation;
4. accept late success only for the bound generation;
5. preserve timeout history after recovery;
6. expose richer terminal metadata through inspection;
7. compare coordinator behavior with the legacy watchdog;
8. remove or demote the legacy timer only after evidence shows parity or
   intentional improvement.

Do not remove the legacy watchdog in the same patch that first introduces
coordinator timeout ownership unless the comparison and rollback story are
clear.

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

### 13.4 Validated result for `ba32fea`

Focused test command covered:

- `test/page-runtime-coordinator-adapter.js`
- `test/page-runtime-coordinator-core.js`

Result after the legacy bypass guard:

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

### 13.5 Full recursive test warning

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
HEAD: ba32fea
origin/page-runtime-coordinator: a2b88ba
working tree: clean
ahead: 1
```

### 14.2 Review relevant files

For the next MathJax timeout reconcile patch, inspect:

- `public/javascripts/page-runtime-coordinator-core.js`
- `public/javascripts/page-runtime-coordinator-adapter.js`
- `public/javascripts/page-runtime.js`
- `public/javascripts/main.js`
- `test/page-runtime-coordinator-core.js`
- `test/page-runtime-coordinator-adapter.js`
- relevant MathJax sections in:
  - `COORDINATOR_DESIGN.md`
  - `CURRENT_PIPELINE.md`
  - `RUNTIME_OWNERSHIP_MATRIX.md`
  - `DEGRADED_STATE_POLICY.md`
  - `IMPLEMENTATION_STATUS.md`

### 14.3 Intended next patch

Move the initial MathJax Process deadline into the coordinator while preserving
parallel legacy comparison.

The patch should likely:

- add a configured timeout for `mathjax-initial-process`;
- preserve `allow-late-success`;
- preserve diagnostic code and elapsed/deadline metadata;
- expose bound generation and operation ID;
- reject late completion for another generation;
- allow late completion for the bound generation;
- preserve the earlier timeout event after recovery;
- keep the legacy watchdog temporarily for comparison, but prevent it from
  owning or double-settling the coordinator task;
- add focused tests for:
  - timeout before Process begin;
  - timeout after bound begin;
  - matching late completion recovery;
  - mismatched late completion rejection;
  - duplicate completion;
  - legacy deadline/completion compatibility during transition;
  - derived readiness recomputation after recovery.

Do not bundle MathJax error terminal policy into the same patch unless evidence
and degraded-state rules are ready.

---

## 15. Recommended subsequent sequence

After coordinator-owned initial MathJax timeout:

1. **MathJax terminal metadata**
   - refine result shape;
   - include answer/Sage discovery counts and observed errors;
   - document error classification without prematurely failing the task.

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

- Do not push `ba32fea` without checking the current desired checkpoint policy.
- Do not assume the coordinator fully owns a lifecycle merely because a task
  exists.
- Do not let the legacy `mathjax-pass: ended` path bypass bound-generation
  validation.
- Do not remove the MathJax watchdog before coordinator timeout parity and late
  recovery are tested.
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
content and mature service implementations. A passive coordinator, readiness
dimensions, diagnostics, core dependency engine, and several bounded ownership
transfers are already implemented. The current local commit `ba32fea` adds
generation-safe ownership of the initial MathJax Process lifecycle and prevents
legacy completion from bypassing the bound generation; focused coordinator
tests report 60 passing and the JavaScript build succeeds. The broader
reconciliation is still active: the legacy MathJax, initial-state, and inline
Sage watchdogs remain, and the next intended patch is to move the initial
MathJax timeout into the coordinator with operation/generation-safe late
recovery while retaining temporary legacy comparison. This project must not
expand into Node/MathJax modernization or a framework rewrite.
