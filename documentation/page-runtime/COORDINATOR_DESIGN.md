# Xronos Page Runtime Coordinator Design

## Status

This document is the canonical design and reorientation point for the Xronos
Page Runtime Coordinator project.

It reconciles the completed runtime inventory, the existing passive readiness
instrumentation, the degraded-state policy, and the intended dependency-aware
execution model.

The coordinator is not a clean-room replacement for the current runtime.
It is an incremental promotion of existing observability into explicit runtime
ownership.

## Related authoritative documents

Read this document together with:

- `CURRENT_PIPELINE.md`
- `RUNTIME_OWNERSHIP_MATRIX.md`
- `DEGRADED_STATE_POLICY.md`
- `FEATURE_INVENTORY.md`
- `TODO.md`
- `../../docs/page-runtime-inventory-closeout.md`

`CURRENT_PIPELINE.md` records observed behavior.

`RUNTIME_OWNERSHIP_MATRIX.md` records current owners, triggers, dependencies,
terminal signals, timeouts, and intended treatment.

`DEGRADED_STATE_POLICY.md` defines failure isolation and terminal-state policy.

This document defines the target coordinator architecture and migration path.

## Project goal

Replace the current network of loosely cooperating startup callbacks with an
explicit, dependency-aware page runtime coordinator that:

- understands the page's partly parallel initialization paths;
- starts work when its actual prerequisites are satisfied;
- records explicit terminal outcomes;
- prevents duplicate initialization;
- applies bounded deadlines;
- localizes recoverable failures;
- blocks dependent work after prerequisite failure;
- supports late recovery when safe;
- exposes stable diagnostics;
- declares page readiness from explicit dependency joins.

The coordinator owns lifecycle sequencing and status. Individual components
continue to own their component-specific behavior.

## Name

The canonical name is:

**Page Runtime Coordinator**

This is broader and more accurate than "rendering orchestrator." The runtime
coordinates saved state, MathJax, Sage, answer attachment, activity bootstrap,
component initialization, event binding, diagnostics, and readiness.

## Existing foundation

The coordinator is now an active runtime layer rather than only passive
instrumentation.

Implemented foundation includes:

- dependency validation and dependency joins;
- external lifecycle leaves;
- task and operation identity;
- timeouts and retained timeout history;
- stale completion recording;
- bounded event history;
- recomputable derived readiness;
- `allow-late-success`;
- transitive recovery;
- active ownership of several startup trigger/release seams.

Current derived readiness dimensions are:

- `state-synchronized`;
- `content-ready`;
- `interaction-ready`;
- `page-readiness`.

Current 15-second readiness deadlines are:

| Dependency | Dimension | Deadline | Diagnostic code | Current ownership |
|---|---|---:|---|---|
| `initial-state` | `state-synchronized` | 15,000 ms | `XR-STATE-INITIAL-101` | legacy state watchdog currently reports the external leaf deadline |
| `mathjax-initial-process` | `content-ready` | 15,000 ms | `XR-MATHJAX-INITIAL-101` | coordinator-owned |
| `sage-inline-initial` | `content-ready` | 15,000 ms | `XR-SAGE-INLINE-INITIAL-101` | visible-settlement lifecycle converts unresolved placeholders to terminal UI |

Late safe recovery may move current readiness from degraded to ready while the
earlier timeout remains in diagnostic history.

The initial MathJax failure policy and initial visible Sage terminality are now
implemented behavior rather than only passive-observation goals.

## Architectural principle

The coordinator is a dependency graph, not a single linear startup sequence.

Unrelated tasks may run concurrently.

Dependent tasks begin only after all required prerequisites reach acceptable
terminal states.

Readiness is a join across required dependency paths.

## Initial dependency model

The current high-level graph is approximately:

```text
bundle execution
├── page metadata and subpath discovery
├── parser-owned author setup JavaScript
└── module registration

DOM ready
├── independent visual and account UI
├── page/component discovery
├── state socket startup
└── activity bootstrap request

state socket + authorized watch
└── initial saved-state outcome

MathJax startup
└── initial MathJax Process
    ├── initial logical answer discovery and attachment
    └── canonical inline Sage discovery

inline Sage discovery + Sage results + required rerenders
└── initial inline Sage terminal outcome

initial saved state
└── state-dependent activity initialization
    ├── problems and validators
    ├── hints and feedback
    ├── author inline JavaScript
    ├── progress behavior
    └── optional interactives

required content path
└── content-ready

required interaction path
└── interaction-ready

saved-state path
└── state-synchronized

content-ready + interaction-ready + state-synchronized
└── page readiness
```

This graph is descriptive rather than final. Each migration must update the
ownership matrix and this document when dependencies are refined.

## Parallel and variable load paths

The coordinator must support variable ordering.

Examples:

- initial saved state may arrive before or after MathJax completes;
- MathJax may discover answers before activity initialization finishes;
- Sage results and rerenders may complete in different orders;
- pages without Sage must produce `not-required`, not remain waiting;
- pages without answers must produce `not-required`, not remain waiting;
- optional interactives may initialize after core readiness;
- late successful work may repair an earlier degraded state;
- repeated MathJax passes must not repeat logical initial-answer completion;
- parser-owned author JavaScript may execute before DOM ready and before saved
  state is available.

No implementation may assume one universal total ordering when the actual
runtime permits several valid orders.

## Coordinator responsibilities

The coordinator owns:

- dependency registration;
- dependency validation;
- task and operation identity;
- start eligibility;
- duplicate-start prevention;
- explicit task state transitions;
- deadline observation;
- failure classification;
- blocked-descendant classification;
- readiness aggregation;
- bounded diagnostic history;
- current and historical runtime reports;
- late-recovery rules;
- lifecycle events for other runtime modules.

The coordinator does not own:

- answer correctness algorithms;
- validator business logic;
- MathJax internals;
- Sage evaluation;
- database persistence implementation;
- component-specific DOM rendering;
- Canvas grade passback.

## Runtime entities

The runtime must continue to distinguish three layers.

### Services

Long-lived capabilities such as:

- state WebSocket;
- MathJax;
- Sage proxy;
- current-user identity;
- optional external libraries.

### Operations

Bounded attempts such as:

- initial state retrieval;
- one MathJax processing pass;
- one Sage request;
- one answer submission;
- one component initialization;
- one rerender.

### Components

Page-level or element-level consumers such as:

- activity;
- problem;
- logical answer;
- grouped validator;
- Sage placeholder;
- hint;
- video;
- optional interactive.

Page readiness must not collapse these layers into one generic flag.

## Task registration contract

A future coordinator-owned task should be representable approximately as:

```javascript
{
    id: 'restore-initial-state',
    phase: 'state',
    dependsOn: [
        'dom-ready',
        'initial-state-response'
    ],
    requiredFor: [
        'state-synchronized',
        'interaction-ready'
    ],
    timeoutMs: 15000,
    failurePolicy: 'degrade',
    recoveryPolicy: 'allow-late-success',
    run: function(context) {
        // Return a value, Promise, or supported callback adapter.
    }
}
```

The exact public API must not be finalized until the existing passive runtime
interfaces have been reconciled with this contract.

## Task states

Coordinator-owned tasks require explicit states:

- `registered`
- `waiting`
- `running`
- `succeeded`
- `not-required`
- `degraded`
- `failed`
- `timed-out`
- `blocked`
- `skipped`

Definitions:

- `not-required` is a successful terminal state for a conditional dependency.
- `degraded` means the operation reached a usable fallback outcome.
- `failed` means it reached an unsuccessful terminal outcome.
- `timed-out` records a deadline event; it may or may not remain the current
  state if late recovery is allowed.
- `blocked` means a prerequisite made execution impossible or invalid.
- `skipped` means coordinator policy intentionally did not run the task.

A blocked task must identify the prerequisite that blocked it.

## Dependency acceptance

Dependencies should declare which terminal states satisfy them.

Typical policies:

- strict dependency:
  - accepts `succeeded` or `not-required`;
- degradable dependency:
  - accepts `succeeded`, `not-required`, or `degraded`;
- recovery dependency:
  - may first observe `timed-out` and later accept `succeeded`;
- optional dependency:
  - never blocks core page readiness.

This is more precise than treating every completed callback as success.

## Readiness model

The existing readiness dimensions remain the initial canonical model.

### `state-synchronized`

Initial saved-state retrieval reached an explicit terminal outcome.

Future state outcomes must distinguish:

- state found;
- confirmed no saved state;
- retrieval failed;
- retrieval timed out;
- access unauthorized;
- acknowledged nonpersistent fallback.

### `content-ready`

Required visible mathematical and generated content reached a usable terminal
outcome.

This currently includes:

- initial MathJax Process;
- canonical initial inline Sage display, or `not-required`.

Optional visual features must not block this dimension.

### `interaction-ready`

Required activity interaction reached a usable terminal outcome.

This currently includes:

- activity initialization;
- logical initial math-answer attachment, or `not-required`.

Later component-specific requirements may be added only with explicit evidence.

### Page readiness

The current public states remain:

- `waiting`
- `degraded`
- `ready`

A future truly unrecoverable startup condition may introduce `failed`, but that
must not be added casually. Existing pages currently degrade rather than enter
a distinct page-failed state.

## Required and optional work

Every task must state whether it participates in:

- `state-synchronized`;
- `content-ready`;
- `interaction-ready`;
- no core readiness dimension.

Examples of work normally decoupled from core readiness:

- account-menu identity;
- image modal;
- sticky scrolling;
- clickable rows;
- xourse delayed relayout;
- optional interactives;
- external author libraries that are not required for core content.

Optional work still requires a terminal status and local diagnostics. It may
not remain indefinitely loading.

## Error and diagnostic model

Existing stable diagnostic codes must be preserved.

New diagnostics should follow the existing subsystem-oriented `XR-*` model
rather than introducing a conflicting second namespace.

A diagnostic record should include, where applicable:

```javascript
{
    code: 'XR-MATHJAX-INITIAL-101',
    pageSessionId: '...',
    occurrenceId: '...',
    operationId: '...',
    generationId: '...',
    phase: 'content',
    service: 'mathjax',
    operation: 'initial-process',
    component: null,
    state: 'timed-out',
    severity: 'degraded',
    recoverable: true,
    message: 'Initial MathJax processing exceeded its readiness deadline.',
    cause: null,
    context: {},
    occurredAt: 0
}
```

Not every field is required for every diagnostic, but identifiers and ownership
must be explicit.

## Error classification

Failures must be classified by:

- subsystem;
- service, operation, or component layer;
- required versus optional impact;
- contained versus propagating impact;
- recoverable versus terminal behavior;
- current state versus historical event.

A single component failure should not automatically become a page-level
failure.

A failed prerequisite should not cause a cascade of misleading secondary
exceptions. Dependents should become `blocked` with the original prerequisite
identified.

## Deadlines and timeouts

A deadline is an observed readiness boundary, not automatically cancellation.

Current passive deadlines:

- record the deadline event;
- degrade the affected readiness dimension;
- allow safe late success;
- preserve the earlier timeout in history.

Future active cancellation must be operation-specific.

For any task with active cancellation, the design must define:

- whether the underlying work can actually be cancelled;
- whether a late callback may still arrive;
- how stale callbacks are rejected;
- which operation or generation ID controls the result;
- whether user-entered work must be preserved.

## Operation and generation identity

Asynchronous work must carry identifiers so old callbacks cannot overwrite
newer state.

Relevant identifiers include:

- page session ID;
- occurrence ID;
- operation ID;
- generation ID;
- logical component ID;
- answer-submission ID;
- MathJax pass ID;
- Sage request or generation ID.

Late completion may repair readiness only when it belongs to the still-relevant
operation or an explicitly allowed recovery generation.

## Duplicate-start prevention

Coordinator-owned initialization must be idempotent or explicitly single-run.

The coordinator must prevent:

- duplicate activity bootstrap;
- duplicate logical initial-answer completion;
- duplicate handler registration;
- duplicate readiness events;
- repeated initial Sage manifest accounting;
- stale rerender callbacks reclassifying initial readiness;
- multiple startup owners running the same responsibility.

Rebinding required after DOM replacement is not the same as repeating logical
initialization.

## Parser-owned author JavaScript

Ordinary setup JavaScript currently executes as parser-owned inline script and
may run:

- while `document.readyState` is `loading`;
- before later markup exists;
- before state synchronization;
- before activity initialization.

The coordinator cannot retroactively own or prove successful parser execution.

The migration must therefore distinguish:

- parser-owned setup presence and observed failure;
- DOM-ready author hooks;
- future Xronos-owned post-state hooks;
- ordinary answer-driven reevaluation outside initial readiness.

No migration may silently change author execution timing without compatibility
testing.

## Recovery policy

Recovery is permitted when:

- the later result belongs to the relevant operation or generation;
- applying it cannot overwrite newer user work;
- the subsystem explicitly supports late success;
- the earlier failure remains visible in diagnostic history.

Current verified recovery examples include:

- late initial saved state;
- late initial MathJax completion;
- late initial inline Sage settlement;
- later MathJax attachment of an initially missing logical answer.

## Diagnostics interface

The existing runtime inspection and benchmark interfaces must be reconciled,
not replaced casually.

The intended stable support interface should eventually expose:

- page session metadata;
- current readiness dimensions;
- current page readiness;
- registered dependencies and ownership;
- current service states;
- current operation states;
- component states;
- deadline records;
- blocked tasks;
- bounded diagnostic history;
- recovery history;
- bundle and page versions.

Existing interfaces include runtime inspection and benchmark helpers. Their
support contract must be documented before renaming or removal.

## Migration strategy

Migration must be incremental.

### Phase 1: canonical model

- establish this design document;
- reconcile terminology across runtime documents;
- preserve current passive behavior;
- identify the existing `page-runtime.js` public and internal contracts.

### Phase 2: coordinator core

- add dependency registration and validation;
- add explicit task state transitions;
- add operation and occurrence IDs;
- add cycle and missing-dependency detection;
- test parallel eligibility and dependency joins;
- do not yet move all startup ownership.

### Phase 3: passive adapters

- adapt current readiness observations into coordinator dependencies;
- preserve existing readiness results and diagnostics;
- expose graph state through the inspection report;
- verify no user-visible behavior changes.

### Phase 4: first active owner

Status: completed and expanded.

The first active ownership transfer was the one-shot document-ready activity
bootstrap trigger. State-dependent activity initialization release followed.

Additional coordinator-owned startup seams now include:

- MathJax startup trigger;
- MathJax Startup End UI finalization;
- document-ready static UI;
- kinetic navigation;
- references.

This phase established an important migration rule: moving a trigger or release
boundary does not automatically move every internal operation owned by the
feature module.

### Phase 5: incremental ownership transfer

For each subsystem:

1. document current owner and trigger;
2. define prerequisites;
3. define terminal outcomes;
4. define deadline and fallback policy;
5. add an adapter;
6. test existing and variable orderings;
7. move startup authority;
8. remove the obsolete autonomous trigger;
9. update the ownership matrix.

### Phase 6: user-facing recovery

After ownership is reliable:

- local component error panels;
- persistent nonpersistent-state warning;
- reload or recovery actions;
- support-code and copied-report workflow;
- instructor-visible diagnostics where appropriate.

## Testing requirements

The coordinator core requires tests for:

- independent tasks running without artificial serialization;
- a task waiting for all prerequisites;
- several valid completion orders;
- missing dependency rejection;
- dependency cycle rejection;
- duplicate task registration;
- duplicate start signals;
- synchronous success;
- Promise success and rejection;
- callback adaptation where retained;
- timeout observation;
- allowed late recovery;
- stale late completion rejection;
- degraded prerequisite acceptance;
- failed prerequisite blocking descendants;
- optional failure not blocking page readiness;
- `not-required` satisfying conditional dependencies;
- bounded diagnostic history;
- deterministic reports.

Integration testing must retain the existing browser fixtures for:

- static MathJax;
- answers and saved progress;
- basic Sage;
- Sage generation and Try Another;
- mixed critical lifecycle;
- optional interactives;
- legacy and unusual features;
- identity and launch context;
- grouped validators;
- nested problems;
- hidden hints and foldables.

## Non-goals for the first implementation

The first coordinator increment will not:

- rewrite all browser modules;
- remove every jQuery-ready handler;
- change parser-owned author JavaScript timing;
- make optional interactives block readiness;
- redesign validator semantics;
- redesign nested-problem semantics;
- change Canvas grade passback;
- replace MathJax or Sage;
- introduce user-facing fatal panels before terminal outcomes are reliable.

## Current implementation target

The initial math-answer reconciliation target is complete for the current scope.

That reconciliation established:

1. authored answer `data-id`, generated persistence/DOM ID, and MathJax render
   identity are separate contracts;
2. ordinary MathJax replacement requires rebinding the replacement DOM node but
   does not require redefining logical initial completion;
3. no production answer-ID redesign is justified by the observed runtime;
4. controlled initial missing-model failure degrades the logical answer leaf;
5. a later legitimate MathJax pass can repair the same logical answer;
6. `allow-late-success` external leaves support same-operation
   `degraded -> succeeded/not-required` recovery;
7. derived interaction/page readiness recomputes transitively after that repair;
8. answer correctness and submission semantics remain outside this
   initial-attachment reconciliation.

The next substantive lifecycle target is initial-state terminal semantics and
ownership reconciliation. The same discipline applies: inventory actual
operation outcomes and ownership before introducing fallback or retry behavior.

## Reorientation checklist

When resuming this project:

1. read this file;
2. read `CURRENT_PIPELINE.md`;
3. review `RUNTIME_OWNERSHIP_MATRIX.md`;
4. review `DEGRADED_STATE_POLICY.md`;
5. inspect the latest page-runtime commits;
6. confirm which migration phase is active;
7. run the focused coordinator tests before changing ownership;
8. update this document and the ownership matrix when architecture changes.
