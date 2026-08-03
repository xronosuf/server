# Page Runtime Coordinator Implementation Status

## Purpose

This document reconciles the canonical Page Runtime Coordinator design with
the current implementation.

It is a point-in-time implementation map, not a replacement for:

- `COORDINATOR_DESIGN.md`
- `CURRENT_PIPELINE.md`
- `RUNTIME_OWNERSHIP_MATRIX.md`
- `DEGRADED_STATE_POLICY.md`
- `TODO.md`

The project goal remains one page-runtime coordinator that represents page
startup and recovery as a dependency graph.

The coordinator should:

- allow independent lifecycle paths to progress independently;
- release dependent work only when its prerequisites reach accepted states;
- give every required task an explicit terminal outcome;
- distinguish success, degradation, failure, timeout, blocking, and
  not-required outcomes;
- preserve operation and generation identity;
- prevent duplicate ownership and stale completion;
- support safe late recovery;
- derive page readiness from state, content, and interaction readiness;
- expose a stable diagnostic report suitable for support and debugging.

The coordinator owns lifecycle sequencing, dependency state, and diagnostic
status. Feature modules continue to own their implementation details.

## Current architectural layers

The current runtime coordinator contains three different kinds of tasks.

### Active control tasks

These tasks have coordinator-configured runners. The coordinator decides when
the runner may execute and records its terminal result.

Current active control tasks include:

- document-ready activity bootstrap;
- state-dependent activity initialization release;
- MathJax startup trigger;
- MathJax Startup End UI finalization;
- document-ready static UI installation;
- document-ready kinetic navigation;
- document-ready references.

Legacy invocation paths remain guarded fallbacks if coordinator owner
configuration or request submission fails.

### External lifecycle leaves

These tasks are currently reported by the legacy runtime into the coordinator.
They are represented in the dependency graph, but the coordinator does not yet
own their complete lifecycle contract.

Current external leaves include:

- initial state;
- initial MathJax Process;
- canonical initial Sage;
- initial inline Sage display settlement;
- activity initialization completion;
- initial math-answer attachment.

All current external leaves permit late success so a timed-out or degraded
page can recover when authoritative completion arrives later.

### Derived readiness tasks

The coordinator derives:

- state synchronized;
- content ready;
- interaction ready;
- page ready.

These tasks recompute when dependency states change, including after allowed
late recovery.

## Implementation-status matrix

| Lifecycle responsibility | Current implementation owner | Coordinator representation | Current mode | Identity | Deadline and recovery | Status / next action |
| --- | --- | --- | --- | --- | --- | --- |
| Document ready | Browser and `main.js` | Control prerequisite | Active | Coordinator task/request | Task terminal state; guarded legacy fallback | Implemented |
| Activity bootstrap trigger | `main.js` runner | Control task | Active | Coordinator task/request | Explicit terminal result; guarded fallback | Implemented |
| Activity initialization release | Coordinator plus activity module | Control task followed by external completion leaf | Hybrid | Control task plus activity operation/component state | Existing completion reporting; fallback preserved | Implemented control seam; terminal ownership may be refined later |
| Static Bootstrap UI | Shared Bootstrap installer and component-local installers | Control task plus local component installation | Active/local | Idempotent DOM marker identity | Repeated installation is safe | Implemented |
| Kinetic navigation | `main.js` runner | Control task | Active | Coordinator task/request | Explicit terminal result; guarded fallback | Implemented |
| Document references | `main.js` runner and references module | Control task | Active | Coordinator task/request | Explicit terminal result; guarded fallback | Implemented |
| MathJax startup trigger | `main.js` runner and MathJax | Control task | Active | Coordinator task/request | Explicit terminal result; guarded fallback | Implemented |
| MathJax Startup End UI | `main.js` runner | Control task | Active | Coordinator task/request | Explicit terminal result; guarded fallback | Implemented |
| Initial MathJax Process | MathJax Begin/End Process hooks and `main.js` | External lifecycle leaf | Passive/hybrid | MathJax generation exists outside coordinator | Legacy 15-second watchdog; late success allowed | Next substantive migration |
| Initial Sage manifest | Sage module before MathJax startup | Runtime component/diagnostic metadata | Passive metadata | Immutable pre-MathJax manifest, stable expression IDs | No separate coordinator task deadline | Model explicitly as input identity for initial MathJax/Sage operations |
| Canonical initial Sage request | Sage module | External lifecycle leaf through `sage-initial` component states | Passive | Immutable manifest, stable IDs, request timing, compiled hash | Retryable operational failures; permanent eligibility fallbacks cached | Promote after initial MathJax Process contract |
| Initial Sage result quality | Sage module | Included in canonical Sage leaf | Passive | Per-stable-ID result records and failure counts | Results may be available but degraded | Preserve separately from visible display settlement |
| Initial inline Sage display | `main.js`, MathJax queues, and Sage resolver | External lifecycle leaf through `sage-inline-initial` | Passive | Placeholder IDs plus manifest stable IDs | Legacy 15-second watchdog; aggregate late success allowed | Promote after canonical request; add per-placeholder coordinator identity |
| Dynamic Sage generations | Sage module | Diagnostics only | Legacy-owned | Generation ID, seed, call mappings, pass cursor, promise counts | Generation guards and stale-generation rejection | Keep outside core initial readiness for now |
| Initial math-answer attachment | MathJax and math-answer module | External lifecycle leaf | Passive | Answer identity and partial MathJax generation metadata | Later MathJax passes can repair unresolved attachments | Promote after initial MathJax Process contract |
| Initial state | Database/WebSocket modules | External lifecycle leaf | Passive | Limited operation identity | Legacy 15-second watchdog; late success allowed | Expand terminal semantics after MathJax/Sage/answer work |
| State readiness | Coordinator | Derived task | Active derived | Dependency graph | Recomputes after recovery | Implemented |
| Content readiness | Coordinator | Derived task | Active derived | Dependency graph | Recomputes after recovery | Implemented |
| Interaction readiness | Coordinator | Derived task | Active derived | Dependency graph | Recomputes after recovery | Implemented |
| Page readiness | Coordinator | Derived join | Active derived | Dependency graph | Recomputes after recovery | Implemented |
| Support report | Page-runtime inspectors and coordinator inspection | Parallel diagnostic interfaces | Partial | Runtime session, tasks, operations, services, components, events | Bounded histories and deadline metadata | Reconcile into stable support contract after lifecycle promotion |

## Initial MathJax Process boundary

The coordinator should not replace MathJax's internal scheduler.

The next migration should use a hybrid active/pass-observed contract:

1. The coordinator owns the expectation that an initial Process pass must
   occur after the MathJax startup trigger.
2. The first authoritative `Begin Process` binds the initial Process
   operation to one MathJax generation.
3. Initial `New Math` events contribute answer and Sage discovery under that
   same generation.
4. The matching `End Process` settles the initial Process task.
5. TeX parse or Math Processing errors are associated with the bound
   generation and operation.
6. The readiness deadline belongs to the coordinator task rather than a
   separate legacy watchdog.
7. Late completion is accepted only when it belongs to the bound initial
   Process generation.
8. The terminal task result includes answer-discovery and Sage-discovery
   metadata.
9. Existing MathJax event ordering and rendering behavior remain unchanged.

This migration promotes existing runtime facts into a coordinator lifecycle
contract; it does not replace MathJax execution.

## Sage lifecycle boundaries

Canonical Sage request success and visible Sage display success are separate
lifecycle outcomes and must remain separate coordinator dependencies.

### Immutable initial manifest

Before MathJax startup, the Sage module captures and freezes the original
author-delivered Sage manifest.

The manifest provides:

- stable expression IDs;
- expression order;
- answer-key identity;
- problem identity;
- silent setup blocks;
- an immutable pre-MathJax source snapshot.

### Canonical initial request

The canonical initial request already records:

- waiting for seed;
- compilation;
- compiled size and debug hash;
- request submission;
- response receipt;
- response parsing;
- result count;
- expression-level failure count;
- success;
- permanent fallback;
- retryable failure.

The coordinator does not need to execute the Sage request implementation
directly. The Sage module should bind this state machine to a stable
coordinator operation identity.

### Initial visible settlement

Each initial Sage placeholder already records stages including:

- discovered;
- request started;
- result resolved;
- MathML applied;
- rerender queued;
- rerender completed;
- fallback shown;
- rerender unavailable;
- display failed;
- fallback placeholder missing.

Initial content readiness must not treat successful Sage computation as
successful visible display.

The aggregate initial-inline-Sage outcome should remain:

- `settled` when every expected initial placeholder visibly completes;
- `not-required` when the immutable manifest contains no expressions;
- `degraded` when every expected placeholder reaches a terminal state but one
  or more failed or displayed fallback UI;
- waiting until discovery is closed and every expected placeholder settles;
- timed out only through the coordinator lifecycle deadline;
- recoverable if the correct initial placeholders settle later.

Future promotion should give each placeholder a coordinator component identity
that links:

- initial MathJax generation;
- manifest stable ID;
- canonical Sage request operation;
- placeholder ID;
- problem ID;
- visible terminal outcome.

## Agreed migration order

### Phase 1: documentation reconciliation

- Add and review this implementation-status document.
- Keep historical design documents intact.
- After review, link this status from the runtime TODO or documentation index.

### Phase 2: initial MathJax Process lifecycle

- Introduce a coordinator-owned/hybrid initial Process contract.
- Bind the first Begin/End Process pair to one generation.
- Move the initial MathJax deadline into the coordinator task.
- Associate parse and processing errors with that task.
- Preserve current answer and Sage discovery ordering.
- Add focused coordinator and browser fixture tests.

### Phase 3: canonical initial Sage operation

- Bind the canonical initial request state machine to a stable coordinator
  operation.
- Preserve immutable manifest and stable-ID mapping.
- Preserve retryable versus permanent fallback classification.
- Keep result quality distinct from display settlement.

### Phase 4: initial Sage visible components

- Register initial placeholders as identifiable coordinator components.
- Link placeholders to manifest entries and the canonical request.
- Move the inline-Sage deadline into the coordinator.
- Preserve fallback UI and late recovery.
- Verify that no visible placeholder can remain indefinitely nonterminal.

### Phase 5: initial math-answer attachment

- Bind initial answer discovery and attachment to the initial MathJax
  generation.
- Preserve logical answer identity across DOM replacement.
- Guard stale and duplicate attachment.
- Keep later-pass repair behavior.

### Phase 6: initial-state lifecycle

- Distinguish found state, confirmed empty state, unauthorized state,
  unavailable persistence, request failure, timeout, and permitted fallback.
- Bind WebSocket/database events to one initial-state operation.
- Move the initial-state deadline into the coordinator.

### Phase 7: support contract

- Reconcile existing inspectors into one stable support report.
- Include page and bundle metadata, graph state, ownership, operations,
  components, blocked work, deadlines, recovery, and diagnostic codes.
- Preserve existing useful inspection and benchmark interfaces where
  practical.

## Non-goals for the next migration

The next migration should not:

- serialize all page startup work;
- move MathJax scheduling implementation into the coordinator;
- combine canonical Sage request and visible Sage settlement;
- make dynamic Sage generations part of initial page readiness;
- remove guarded legacy fallbacks before active ownership is validated;
- perform unrelated Bootstrap or formatting cleanup in the same commit;
- declare the overall coordinator migration complete.

## Immediate next action after this document

After this document is reviewed and committed, inspect and design the smallest
initial-MathJax lifecycle patch that:

- introduces explicit coordinator APIs for initial Process begin, error, and
  matching completion;
- binds the coordinator task to the existing MathJax generation;
- moves timeout ownership without changing browser-visible behavior;
- leaves the legacy runtime readiness calculation in parallel for comparison;
- adds unit tests before browser fixture validation.
