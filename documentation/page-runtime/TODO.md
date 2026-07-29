# Shared Xronos Follow-Up To-Do List

## Purpose

This is the single collection point for discoveries made during the page
runtime inventory.

After the coordinator project stabilizes, the first follow-up task will be to
divide this list into coherent projects, priorities, and implementation
sequences.

Items here are not commitments to include all work in the current project.

## Runtime coordinator and diagnostics

- Build passive runtime event instrumentation.
- Provide `window.xronosInspectPageRuntime()`.
- Record service, operation, and component states separately.
- Add bounded startup and recent-event buffers.
- Add stable diagnostic codes and occurrence IDs.
- Record automatic reload and navigation causes.
- Detect unresolved visible loading indicators.
- Record page metadata version, bundle version, `/version`, and feature mode.
- Add operation IDs and generation IDs.
- Define an ownership adapter for each startup subsystem.
- Replace implicit callback completion with explicit terminal outcomes.
- Create the student and instructor support-report workflow.
- Create a support portal that accepts a code or copied report.
- Verify technical state rather than relying only on user reports.

## Saved state and WebSocket

- Distinguish:
  - state found
  - state not found
  - state retrieval failed
  - state retrieval timed out
  - state access unauthorized
- Stop converting state-query errors into successful empty state.
- Add bounded initial-state retry.
- Add acknowledged fresh nonpersistent fallback.
- Add a persistent nonpersistent-session warning.
- Add a dismissible recovery and reload prompt.
- Prevent late saved-state responses from overwriting fallback work.
- Add structured acknowledgements for patch and completion operations.
- Stop silently returning from invalid socket operation states.
- Report server differential patch failures.
- Investigate and repair swallowed state-patch exceptions.
- Distinguish socket-connected from state-synchronized.
- Do not show a positive saved-state status merely because the socket opened.

## Security

### HIGH - Authorize WebSocket state ownership

- Determine when a browser may request a learner ID different from its own.
- Bind normal student state access to authenticated or guest identity.
- Preserve legitimate authorized masquerade workflows.
- Require explicit verified instructor authorization for learner state access.
- Reject unauthorized `watch` requests with a structured error.
- Audit completion and differential operations under the same identity model.
- Ensure activity-room and user-room membership follows authorized identity.

## Answer and validator behavior

- Add an answer-submission transaction lifecycle.
- Preserve typed responses on validator failure.
- Distinguish button click from Enter-key behavior.
- Detect true page reload versus DOM replacement.
- Add validator exception diagnostics.
- Handle rejected asynchronous validators without generic alerts.
- Prevent stale validation results from overwriting newer attempts.
- Catch malformed validator results such as `null` or `undefined`.
- Prevent full activity reset after a localized answer failure.

### Grouped validator environment

- Verify answer boxes are consistently buttonless inside `validator`.
- Test one answer, several answers, and partially completed groups.
- Compare Enter with the enclosing validator button.
- Reproduce the historical blink and cleared-answer failure.
- Determine whether MathJax DOM replacement contributes.
- Submit grouped answers as one atomic operation.
- Decide whether individual correctness should remain hidden.
- Repair the environment as a later focused feature project.

## JavaScript authoring and randomization

### MEDIUM - Standardize JavaScript randomization and seed ownership

- Determine whether JavaScript and Sage share or overwrite persisted seed state.
- Prevent either engine from unintentionally changing the other's effective seed.
- Define a common context-scoped generation identity if appropriate.
- Derive engine-specific Sage and JavaScript seeds if appropriate.
- Determine how `Another` should affect JavaScript-generated content.
- Determine behavior for JavaScript-only randomized pages.
- Preserve compatibility with existing published activities.

### Author guidance

- Document `javascript` environments as the preferred definition and setup layer.
- Document `\js{...}` as the preferred result and call layer.
- Mirror the `sagesilent` plus `\sage` authoring model where appropriate.
- Document separate patterns for validators and non-mathematical interactions.
- Inventory happenstance-supported dynamic `\js` behavior.

## Sage

- Keep seed readiness conditional on actual seed consumers.
- Measure Sage request and display timings separately.
- Verify same-context deterministic sequencing.
- Later verify different LTI contexts produce different sequences.
- Verify effective seed participates in exact request and cache identity.
- Audit generation and seed reconstruction during fallback states.
- Investigate manual author seed overrides only if encountered.
- Prevent stale generation callbacks from replacing newer output.
- Separate request success from placeholder and display success.
- Harden Sage authorization after production stability using trusted origin and
  exact request or code authorization rather than page token alone.
- Patch stale-token refresh and retry behavior in the near term.

## Startup and performance

### MEDIUM - Remove synchronous startup HEAD request

- Determine why `X-Ximera-SubPath` cannot be rendered into page metadata.
- Replace the synchronous `HEAD` request.
- Preserve subpath availability before dependent URL construction.
- Add startup failure handling.

### General startup work

- Replace indefinite DOM polling with explicit component events.
- Classify xourse delayed relayout passes as visual-only operations.
- Measure timeout percentiles under:
  - warm and cold cache
  - LTI and direct launch
  - fast and slow connection
  - desktop and mobile
- Use separate timeout classes for:
  - initial saved state
  - Sage request
  - Sage display
  - MathJax processing
  - optional external libraries

## Optional interactives

- Add local timeouts and terminal errors.
- Add external-script failure handlers.
- Stop indefinite global-object polling.
- Ensure optional failures do not block `content-ready`.

### JSXGraph

- Determine whether any published content uses it.
- Determine whether XimeraLaTeX emits a supported contract.
- Classify as retain, deprecate, or remove.

### Three.js

- Determine whether any published content uses it.
- Determine whether XimeraLaTeX emits a supported contract.
- Classify as retain, deprecate, or remove.

### Numeric

- Determine whether any published content uses it.
- Determine whether XimeraLaTeX emits a supported contract.
- Classify as retain, deprecate, or remove.

## Identity and account UI

- Add localized `/users/me` failure handling.
- Show an account-menu identity diagnostic instead of leaving it blank.
- Distinguish:
  - authenticated
  - guest
  - request failed
  - malformed response
  - unauthorized operation
- Block only operations that truly require confirmed identity.
- Keep ordinary content usable during identity display failure.

## Supervision, chat, pencil, and legacy systems

### Live supervision

- Stop automatic browser initialization.
- Remove the Supervise menu entry.
- Remove real-time context-room observation.
- Remove related browser code.
- Remove backend support after compatibility review.

### Masquerade and SpeedGrader

- Retain authorized learner-specific instructor view.
- Keep masquerade distinct from real-time supervision.
- Diagnose the verification-string-length 500 error.
- Repair Canvas SpeedGrader launch behavior.
- Priority: low.

### Chat

- Stop automatic initialization.
- Remove browser UI and state-socket integration.
- Remove backend handlers after compatibility review.

### Pencil

- Stop automatic initialization on every activity.
- Remove full-page stylus drawing browser code.
- Determine whether historical persistent pencil keys need pruning.

### Annotator

- Confirm it is unused.
- Remove placeholder API integration and bundled dependency if safe.

### Invigilator

- Confirm no published authoring or routing dependency remains.
- Remove disabled browser implementation.
- Remove old template markup.
- Investigate whether any XimeraLaTeX markup support exists.

## Image environment

- Retain image modal behavior.
- Confirm responsive sizing and centering ownership in XimeraLaTeX and CSS.
- Ensure modal failure leaves ordinary images usable.

## Instructor statistics

- Replace polling for the Try Another statistics button with an explicit event.
- Add the online-content-coordinator aggregate statistics workflow.
- Protect coordinator access with explicit server-side authorization.
- Keep coordinator reports aggregate-only.
- Support custom date-range generation on demand.
- Preserve useful derived aggregate statistics before raw LRS data is purged.

## UI cleanup

- Merge profile and settings dropdowns if practical.
- Improve hover and pointer behavior so dropdowns do not disappear prematurely.
- Investigate or remove the nonfunctional See progress menu item.
- Preserve remove-your-answers behavior.
- Decide when to move Statistics into the unified account menu.
- Investigate Test Student role presentation under Canvas LTI.

## Testing repository

Prepare `.tex` fixtures covering:

1. static content and core MathJax
2. answers and saved progress
3. basic Sage
4. Sage generation and Another
5. mixed critical lifecycle
6. optional interactives
7. legacy and unusual features
8. identity and launch context

Include grouped-validator tests verifying:

- button visibility
- Enter behavior
- enclosing submit behavior
- response preservation
- validator failure containment

Use author `javascript` environments for glanceable test status where doing so
does not introduce unintended state or seed dependencies.

## Documentation follow-up

Create or complete:

- `LIFECYCLE_MODEL.md`
- `DIAGNOSTIC_CODE_MODEL.md`
- `SUPPORT_ESCALATION_MODEL.md`
- `SAGE_SEED_AND_CONTEXT_INVARIANTS.md`
- `TEST_MATRIX.md`

Do not finalize detailed coordinator APIs until passive instrumentation and
runtime evidence are available.
