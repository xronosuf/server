# Shared Xronos Follow-Up To-Do List

## Purpose

This is the single collection point for discoveries made during the page
runtime inventory.

After the coordinator project stabilizes, the first follow-up task will be to
divide this list into coherent projects, priorities, and implementation
sequences.

Items here are not commitments to include all work in the current project.

## Runtime coordinator and diagnostics

Completed/current foundation:

- dependency-aware coordinator core exists;
- external lifecycle leaves and operation IDs exist;
- bounded event history exists;
- state/content/interaction/page readiness exists;
- multiple document-ready and MathJax startup control seams are coordinator-owned;
- initial MathJax generation binding and coordinator timeout are implemented;
- initial MathJax processing-failure policy is browser-validated;
- canonical initial Sage operation identity is implemented;
- initial visible Sage terminal settlement and stale explicit-attempt protection
  are browser-validated;
- initial math-answer identity, degradation, later repair, same-operation
  coordinator recovery, and transitive readiness recovery are browser-validated;
- initial-state `found`/`empty`/`failed`/`invalid-request` semantics and
  reconnect `state-resynchronization` are implemented and browser-validated;
- state WebSocket application heartbeat, pong liveness diagnostics, timer
  cleanup, and reconnect-backoff reset are implemented and browser-validated.

Remaining coordinator work:

- stabilize and document `window.xronosInspectPageRuntime()` as the next
  substantive support contract;
- reconcile remaining legacy initial-state watchdog ownership after the explicit
  protocol has accumulated enough evidence;
- add occurrence IDs and broader stable diagnostic coverage;
- record automatic reload/navigation causes;
- detect unresolved visible loading indicators across non-Sage components;
- record page metadata version, bundle version, `/version`, and relevant feature
  modes;
- continue replacing implicit callback completion with explicit terminal
  outcomes;
- reconcile duplicated legacy comparison/watchdog ownership one dependency at a
  time after evidence supports removal;
- create the student/instructor support-report workflow and support portal.

## Saved state and WebSocket

Completed/current:

- explicit server outcomes now distinguish:
  - state found
  - state not found
  - state retrieval failed
  - invalid request
- state-query errors no longer become successful empty state
- reconnect state is represented separately as `state-resynchronization`
- a passive 15-second initial-state readiness deadline remains
- an 18-second application heartbeat with immediate pong is active
- stale pong (>45 seconds) is reported through transport liveness diagnostics
- heartbeat timers are cleaned up across socket replacement
- successful open resets reconnect backoff to 1 second

Remaining:

- add structured `unauthorized` outcome after WebSocket ownership authorization
  is implemented
- decide whether bounded initial-state retry is desirable now that failures are
  explicit
- decide whether stale-pong degradation should eventually recycle a confirmed
  half-open socket
- add acknowledged fresh nonpersistent fallback only if explicit failure policy
  requires it
- add a persistent nonpersistent-session warning.
- Add a dismissible recovery and reload prompt.
- Prevent late saved-state responses from overwriting fallback work.
- Add structured acknowledgements for patch and completion operations.
- Stop silently returning from invalid socket operation states.
- Report server differential patch failures.
- Investigate and repair swallowed state-patch exceptions.
- Distinguish socket-connected from state-synchronized.
- Do not show a positive saved-state status merely because the socket opened.
- Investigate repeated `podman restart devximserver` shutdown behavior where
  SIGTERM does not stop the container within 10 seconds and Podman falls back to
  SIGKILL.
- Keep the transient state-document disappearance contradiction deferred unless
  it reproduces in a way that blocks protocol correctness.

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

- Logical initial-answer readiness is now implemented and browser-validated.
  - Readiness tracks stable logical answers rather than current DOM nodes.
  - Missing MathJax models are not counted as connected.
  - Attachment exceptions are contained and diagnosed.
  - Successful attachment is retained across MathJax DOM replacement and
    completed-answer rendering.
  - Ordinary rebinding does not emit repeated initial-readiness events.
  - A later MathJax pass can recover `initial-math-answers`,
    `interaction-ready`, and page readiness from degraded to ready while
    retaining the original failure event.
  - The coordinator accepts same-operation `degraded -> succeeded/not-required`
    recovery for `allow-late-success` external leaves and recomputes affected
    derived readiness.
  - Browser validation preserved authored `data-id`, generated persistence ID,
    and problem ID across the controlled repair.
- Investigate the separate `testSuite/02-answers-saved-progress` attachment
  degradation observed during state testing: five expected answer models
  resolved, but zero attached and five attachment failures were reported.
  Treat this as separate from state synchronization until reproduced and
  localized.
- Add bounded detail for repeated pre-success attachment failures without
  creating unbounded per-answer history.
- Decide whether initial-answer readiness needs its own deadline only if
  answer attachment can remain unresolved after the initial MathJax pass has
  already ended and no later pass is naturally expected.
- Add an answer-submission transaction lifecycle.
- Preserve typed responses on validator failure.
- Distinguish button click from Enter-key behavior.
- Detect true page reload versus DOM replacement.
- Add validator exception diagnostics.
- Handle rejected asynchronous validators without generic alerts.
- Prevent stale validation results from overwriting newer attempts.
- Catch malformed validator results such as `null` or `undefined`.
- A grouped-validator Boolean-result guard now prevents functions and other
  non-Boolean results from entering persistent state; browser-validate the
  diagnostic and compatibility behavior before treating it as complete.
- Differential synchronization now contains unsupported-state errors and emits
  `XR-STATE-DIFF-101`; add offending persistent-data paths to the diagnostic.
- Prevent full activity reset after a localized answer failure.

### Grouped validator environment

Browser inventory is complete for the current stabilization scope.

Confirmed working behavior:

- Multi-answer grouped validators initialize and attach their logical answers.
- Correct grouped submission persists across reload.
- Typed responses remain visible and persist after ordinary incorrect results.
- A normal Boolean `false` marks the group and contained answers incorrect
  without emitting a runtime diagnostic.
- Partial grouped submission preserves entered responses and leaves untouched
  fields empty.
- Missing answer globals and other synchronous validator exceptions are
  contained as incorrect results and emit `XR-VALIDATOR-RESULT-101`.
- Malformed non-Boolean validator results are prevented from entering
  persistent state, avoiding later differential-synchronization failure.
- Grouped-validator failures remain localized and do not degrade page
  readiness.

Deferred grouped-validator defects and design work:

- Individual answer-box `?` buttons are supposed to be suppressed inside a
  validator environment, but remain visible.
- Pressing Enter in a contained answer triggers the individual answer form,
  evaluates the enclosing validator, and then performs an unprevented native
  GET form submission that reloads the page with a trailing `?`.
- Define the intended Enter-key behavior for grouped validators and prevent
  native form navigation.
- Partial submission currently marks untouched contained answers incorrect.
- Decide whether individual correctness should remain hidden.
- Submit grouped answers as one atomic operation instead of several immediate
  persistence transactions.
- Prevent stale asynchronous validation results from overwriting newer
  attempts.
- Handle rejected asynchronous validators without generic alerts.
- Reproduce and repair any remaining MathJax-related blink or DOM-replacement
  behavior only as part of the later focused grouped-validator project.


## JavaScript authoring and randomization

### Initial author JavaScript lifecycle

- Inventory every initial execution path in `javascript.js`, including:
  - `javascript` environment setup blocks
  - `\js{...}` result evaluation
  - saved-state-triggered execution
  - answer-driven `Javascript.reevaluate(...)`
  - MathJax rerenders caused by generated output
- Separate finite initial author JavaScript work from later interactive
  reevaluation.
- Determine whether initial author JavaScript can introduce additional:
  - required visible content
  - Sage requests
  - answer boxes
  - validators
  - MathJax processing or rerender work
- Define a finite initial manifest or generation identity rather than waiting
  for the page to become globally idle.
- Add explicit initial terminal outcomes such as settled, degraded, failed,
  or not-required only after the existing execution graph is understood.
- Keep ordinary answer-driven reevaluation outside page readiness unless it
  is repairing unresolved initial content.
- Isolate one author block failure so it does not silently prevent unrelated
  blocks from initializing.
- Passive setup-script and post-state inline-JavaScript lifecycle telemetry now
  exists; browser-validate its event ordering before promoting it.
- Decide whether parser-owned setup blocks should remain an authoring contract
  or be migrated to an explicit Xronos-owned execution phase.
- Define an explicit post-state author hook for code that requires persistent
  data, answer globals, validators, or initialized activity behavior.
- Random-marked setup blocks currently execute twice: once during parsing and
  again through post-state `$.globalEval(...)`. Inventory compatibility before
  removing either execution and document that random setup must be idempotent.
- Replace the textual `/random/` heuristic with an explicit generated authoring
  contract after compatibility review; comments, strings, and unrelated names
  can currently classify a setup block as randomized.

- Decide whether the current duplicate `.mathjax-javascript` watcher nodes are
  an intentional MathJax representation detail or generated markup that can be
  simplified. Current reevaluation safely deduplicates them by MathJax frame.
- Add a permanent fixture covering persisted-answer restoration and post-load
  answer-driven `\js{...}` reevaluation.

- Add permanent coverage for malformed ordinary-text `\js{...}` evaluation
  and diagnostic `XR-JS-INLINE-101`.
- Decide whether author-facing UI should expose contained inline-JavaScript
  diagnostics beyond the existing hollow-square fallback.

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

Completed/current behavior:

- the initial canonical request has stable coordinator operation identity;
- explicit Retry creates a new canonical coordinator operation;
- legitimate browser Sage execution is canonical-only;
- obsolete standalone `.sage` / `.sageOutput`, browser kernel/iopub, queue, and
  batching compatibility has been removed;
- canonical execution is unconditional and the old deployment flag is inert;
- canonical request and visible settlement remain separate lifecycles;
- the initial visible deadline converts unresolved spinners into explicit
  terminal UI;
- missing MathJax `inputID` and missing-placeholder paths terminate visibly;
- each visible placeholder has explicit request-attempt identity;
- callbacks from superseded explicit Retry attempts are ignored;
- repeated canonical `Another` is browser-validated;
- 60 KB remains the compiled canonical request safety ceiling.

Remaining/deferred Sage work:

- keep seed readiness conditional on actual seed consumers;
- continue measuring canonical request and display timings separately;
- verify same-context deterministic sequencing and later cross-LTI-context
  expectations when needed;
- verify effective seed remains part of exact canonical request/cache identity;
- investigate manual author seed overrides only if encountered;
- expired page-auth token refresh/retry is already implemented: the browser
  refreshes through `/sagecell/auth` and retries the original Sage request once;
  keep this behavior covered by regression tests rather than treating it as
  unfinished work;
- verify deployment uses a persistent `SAGECELL_PAGE_AUTH_SECRET` (or legacy
  signing-secret equivalent) so process restarts do not invalidate otherwise
  valid page tokens; this is deployment configuration, not missing browser retry
  behavior;
- keep regression coverage for the resolved Sage reliability policy:
  `XronosSagePageResultError` is transient/retryable, while local SageCell
  transport/missing-response and HTTP 408/429/500/502/503/504 failures trigger
  automatic fallback;
- after production stability, harden authorization using trusted origin plus
  exact authorized request/code hashes or a build-time manifest rather than page
  token alone;
- remove only the dead `XRONOS_CANONICAL_PAGE_SAGE_ENABLED` `.env` entry during
  deployment cleanup, leaving unrelated `.env` entries intact.

### Reliability audit classification

A fresh post-canonicalization audit at `fdb015b` rechecked every known Sage
failure class against the stronger reliability goal: valid author Sage with a
healthy browser connection and healthy Xronos/SageCell components should not
surface avoidable internal/transient failures to students.

The audit confirmed these are **not unfinished reliability bugs**:

- expired page authorization already refreshes through `/sagecell/auth` and
  retries the original request once;
- missing/invalid/malformed/incomplete authorization remains fail-closed by
  design; only the specifically expired-token case is safe to refresh
  automatically;
- canonical invariants such as `missing-snapshot`, `missing-trace-entry`,
  `generation-unmapped-call`, `stale-generation`, and other unresolved canonical
  mappings intentionally fail closed rather than executing an unverified legacy
  Sage string;
- the 60 KB compiled canonical request ceiling remains an intentional safety
  boundary supported by the earlier content-size audit;
- missing MathJax input IDs, missing visible placeholders, deadline settlement,
  and callbacks from superseded explicit Retry attempts already have visible or
  stale-safe terminal handling;
- local SageCell transport failures and HTTP 502/503/504 already trigger the
  configured local-to-fallback service path when running in
  `local-with-fallback` mode.

The two transient-classification items found by that audit were resolved
without weakening canonical fail-closed behavior:

1. `XronosSagePageResultError` is explicitly transient/retryable.
2. Local SageCell transport/missing-response and HTTP
   408/429/500/502/503/504 failures use automatic fallback.

The production decisions are directly unit-tested. The focused suite passes
57 tests, and the browser `page-result-error` one-shot probe validated the full
visible error -> Retry -> successful recomputation path on `03-basic-sage`.

If a canonical invariant occurs under valid current-publisher content, continue
to treat it as an Xronos defect requiring diagnosis rather than authorization to
execute a different path.

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
- Separate diagnostic deadline classes now exist for:
  - initial saved state
  - initial MathJax processing
  - initial inline Sage display
- Continue adding or refining timeout classes for:
  - optional external libraries
- Canonical Sage attempts already have explicit terminal classification; add a
  separate request-level deadline only if production evidence shows one is
  necessary beyond current request/proxy timeout behavior.
- Measure whether the current 15-second readiness deadlines are appropriate
  before treating them as a stable operational policy.

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

## Foldable and expandable content

- Low priority: restore a clear visual affordance for accordion headings.
  Expandable and foldable headings remain clickable, but the historical
  border, bar, or arrow treatment is no longer sufficiently visible.
- Inventory whether foldable/expandable open state should persist across
  reload before changing the current non-persistent accordion behavior.

## Hints and feedback

- Clarify with XimeraLaTeX developers why current frozen publications emit
  ordinary `hint` environments through the KU Leuven accordion structure.
- Retain the UF legacy accordion conversion until that authoring contract is
  understood and affected publications can be republished safely.
- Decide later whether the whole-problem MathJax rerender on legacy hint reveal
  remains necessary after the source-output path is corrected.
- Test persisted hint visibility and feedback availability across reload.
- Verify multiple sequential hints preserve reveal order and first-paint hiding.
- Low priority: correct the sequential hint-button counter wording. After one
  of three hints is revealed, the button currently shows the next reveal number
  (`2 of 3`) rather than the number already revealed (`1 of 3`), which can be
  misleading.

## Nested problem behavior

- Three-level nested availability, completion, answer attachment, progress,
  and reload persistence were browser-validated on July 31, 2026.
- Preserve the current immediate-child unlock behavior.
- Preserve the current recursive hierarchy weighting unless a later product
  decision intentionally changes how nested work contributes to grades.
- Possible first-paint flashing of unavailable nested problems is currently
  out of scope.

## Completion accounting

- Low priority: answers and other required interactions inside a `hint`
  environment should initialize and persist normally, but should not contribute
  to or be required for page completion percentage.

## Testing repository

The eight-page direct-launch browser suite passed on July 31, 2026 after fixture
corrections. Keep the fixtures as a repeatable regression suite covering:

1. static content and core MathJax
2. answers and saved progress
3. basic canonical Sage plus missing-input-ID, missing-placeholder, and
   stale-attempt fault cases
4. canonical Sage generation and repeated Another
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

Fixture lessons:

- A grouped validator must invoke its helper in the optional argument, for
  example
  `\begin{validator}[helper(answerA,answerB)]`, rather than merely returning
  the helper function.
- Numeric globals used by an author validator should use an explicit numeric
  answer format when ordinary JavaScript arithmetic is expected.
- Raw HTML fixture markup should use `\htmlOnly{...}` with `\HCode{...}`;
  literal tags inside `htmlOnly` are escaped.
- The identity fixture covered a direct development launch. Authenticated LTI
  learner, role, and Canvas-context propagation still require a separate LTI
  launch test.

## Documentation follow-up

Create or complete:

- `LIFECYCLE_MODEL.md`
- `DIAGNOSTIC_CODE_MODEL.md`
- `SUPPORT_ESCALATION_MODEL.md`
- `SAGE_SEED_AND_CONTEXT_INVARIANTS.md`
- `TEST_MATRIX.md`

Do not finalize detailed coordinator APIs until passive instrumentation and
runtime evidence are available.
