# Shared Xronos Follow-Up To-Do List

## Purpose

This is the single collection point for discoveries made during the page
runtime inventory.

Phase 1 of the Page Runtime Coordinator is complete. This file is now the
durable collection point for work deliberately deferred beyond that Phase 1
boundary and for unrelated follow-up discovered during the project.

Items here are not commitments to include all work in one future project.

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
  cleanup, and reconnect-backoff reset are implemented and browser-validated;
- the stable support taxonomy and recovery-action policy are implemented;
- the unified student recovery banner and **Report this problem** modal are
  implemented;
- the privacy-bounded support-report schema v1 and automatic copy workflow are
  implemented and browser-validated;
- each page runtime has a non-secret `supportTraceId` that is included in the
  report and correlates state/Sage requests with Xronos server logs;
- `XRONOS_SUPPORT_EMAIL` provides the server-configured support contact shown in
  the report modal, with generic instructor/course-support wording when unset.

Remaining/deferred coordinator work:

- reconcile remaining legacy initial-state watchdog ownership only after the
  explicit protocol has accumulated enough evidence;
- add occurrence IDs only if they provide support value beyond the existing
  page `supportTraceId`, runtime session ID, operation IDs, and bounded events;
- record automatic reload/navigation causes;
- detect unresolved visible loading indicators across non-Sage components;
- consider support-report schema v2 enrichment with application/bundle version,
  explicit operation/occurrence identity, resynchronization detail, canonical
  Sage state, and derived readiness where those fields can be safely and
  stably defined;
- continue replacing implicit callback completion with explicit terminal
  outcomes where doing so materially improves reliability or supportability;
- reconcile duplicated legacy comparison/watchdog ownership one dependency at a
  time after evidence supports removal;
- broader support tooling or a dedicated support portal, if later needed,
  remains separate from the completed in-page report workflow.

### Deferred final answer/activity support-path acceptance

- The final support policy/report code has direct unit coverage, and earlier
  browser work validated initial-answer degradation and later recovery.
- The audit could not establish that an `XR-ANSWER-INITIAL-101` or
  `XR-ACTIVITY-INITIAL-101` failure was subsequently exercised end-to-end
  through the finished unified support banner plus generated/copyable report.
- This is not currently considered a Phase 1 blocker because the component
  behavior and final support presentation/report pieces are independently
  tested, but the exact integrated browser acceptance state is ambiguous.
- During a future browser reliability pass, deliberately exercise at least one
  of these broader coordinator failures through the completed support UI and
  record the result. Reopen implementation only if that test exposes a defect.

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


### Generated MathJax preamble pollution / compiler noise

Field discovery on 2026-08-10 immediately after the Page Runtime Coordinator
Phase 1 production deployment exposed a longstanding browser-side MathJax
preamble problem that had previously been mostly silent.

The production page

`/mac1140universalproperties/universalObjectsAndProperties/functions/Practice/fxNotation-Practice1`

raised `XR-MATHJAX-INITIAL-101` after a hard reload. The runtime report showed
one initial MathJax error, but the authoritative MathJax Process itself
completed, all 9 expected math answers resolved and attached, all 18 initial
Sage placeholders settled and rerendered, activity initialization succeeded,
and the state WebSocket remained healthy.

Browser inspection identified the actual MathJax event as:

`TeX Jax - parse error: Illegal control sequence name for \newcommand`

The failing input was not an authored equation. It was a generated
`script[type="math/tex"]` element with parent class `preamble`
(`MathJax-Element-1` in the reproduced page), approximately 9 KB long, containing
a large dump of macro definitions apparently derived from loaded LaTeX packages
or XimeraLaTeX's compilation/export pipeline.

The generated preamble included many package-internal definitions that were not
written by the activity author. In particular, it contained definitions such as:

```tex
\newcommand {\?\c__siunitx_minus_tl }[0]{...}
\newcommand {\?\c__siunitx_mu_tl }[0]{...}
```

MathJax rejected the generated command name as illegal. Despite that parse
error, no `.MathJax_Error` elements were present in the rendered page and the
student-visible mathematical/answer/Sage lifecycle completed successfully in
the reproduced case.

This is separate from longstanding console messages such as:

`Instructor error in \answer: ParseError: Invalid location of ')'`

Those arise from the Ximera answer-expression parser rather than the MathJax
`TeX Jax - parse error` hook.

Current compatibility policy:

- a localized `TeX Jax - parse error` remains diagnostic but should not by
  itself make the authoritative initial MathJax Process page-fatal or disable
  every math-dependent interaction;
- true MathJax `Math Processing Error`, initial Process timeout, and separately
  observed answer/render failures remain real degraded/failure conditions;
- this tolerance is for legacy compatibility and does not mean the generated
  preamble is known to be correct or harmless in every possible page.

Future investigation should locate the source of the generated preamble in the
XimeraLaTeX -> published artifact -> Xronos/MathJax pipeline and determine:

1. why full-LaTeX/package-internal definitions are serialized into the browser
   MathJax preamble;
2. which package or conversion step introduces malformed names such as
   `\?\c__siunitx_minus_tl`;
3. whether a parse error skips later generated definitions that a page could
   legitimately depend on;
4. whether the generated preamble can be filtered to only the definitions
   actually needed by browser MathJax;
5. whether invalid/unsupported definitions should be removed during publication
   instead of tolerated at runtime;
6. whether compiler/development diagnostics can flag rejected generated
   preamble entries without student-facing noise.

This production incident demonstrates both sides of the problem: the generated
preamble is objectively producing a MathJax parse error, but treating that one
localized error as a page-wide mathematical failure caused a false-positive
support banner and disabled otherwise functional answer interaction.

## Free response / manual grading

### Historical status and current compatibility policy

Free response was intended to let a student submit written content to Xronos
and have that response retained so an instructor could review and grade it
manually later.

Historically, that workflow never became operationally usable. Although the
browser can submit free-response content and historical code stores associated
state/data, the relationship among the stored response, student identity,
course/LTI context, activity, and an instructor-facing grading workflow has
been sufficiently opaque that instructors have not had a sane way to retrieve
and grade submissions. In practice this made the feature effectively
ungradable and therefore essentially unused.

As a workaround, the deployed behavior has been changed so that submitting a
free response does not lower a student's grade: submission is effectively
treated as full credit rather than waiting for manual grading that instructors
cannot practically perform. This is a compatibility workaround, not the
intended final grading model.

Operationally, free response is believed to have extremely little authored
usage. As of August 2026, the known deployment is believed to contain only one
remaining rendered free-response box, in MAC1140 content, and that authored use
was already considered a candidate for removal. Re-inventory published content
before relying on that count.

Do **not** remove the Xronos free-response feature solely because current usage
is negligible. The intended capability remains desirable and should eventually
be rebuilt around an explicit instructor grading workflow. At the same time,
do not spend substantial compatibility effort preserving undocumented or
opaque legacy storage/grading internals merely because they exist.

Until the redesign occurs, the practical compatibility bar is deliberately
low:

- preserve the feature surface so free response can be rebuilt later;
- preferably keep the text box renderable and submission path functional;
- a submitted response must not penalize a student merely because no usable
  instructor grading workflow exists;
- do not treat preservation of the current opaque manual-grading/storage
  mechanism as a requirement;
- regressions isolated to currently unused free-response grading behavior are
  not page-runtime stabilization blockers unless they affect unrelated active
  functionality.

### Future redesign

Build an explicit end-to-end free-response submission and manual-grading
pipeline. Before implementation, inventory the current persistence path and any
historical free-response records so useful data is not accidentally orphaned.

The replacement should provide, at minimum:

- a documented submission data model with stable links to:
  - student identity;
  - LTI/course context where applicable;
  - repository/activity/page;
  - the specific free-response interaction;
  - submitted text;
  - submission/update timestamps;
- a clear server API for retrieving authorized free-response submissions;
- an instructor-facing interface that can list, filter, open, and grade
  submissions without direct database inspection;
- explicit grading state such as ungraded versus graded;
- instructor-entered score and, if useful, feedback;
- appropriate authorization so students cannot view or alter other students'
  submissions or instructor grades;
- a defined interaction with Xronos progress and Canvas/LTI grade passback;
- a deliberate policy for resubmission, regrading, and instructor overrides;
- enough audit/history information to understand who graded a response and
  when;
- migration or compatibility handling for any historical records worth
  preserving;
- permanent fixtures and tests covering submission, persistence, identity
  association, instructor retrieval, grading, and passback.

When this work is undertaken, redesign the workflow from the instructor's
grading task backward rather than treating the existing database representation
as the required architecture.

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
- Harden XimeraLaTeX JavaScript publication so authored `javascript` /
  `javascriptCode` content is emitted as raw executable JavaScript without
  requiring authors to remember CDATA-sensitive wrappers. In particular,
  prevent operators such as `<`, `>`, `&&`, and related syntax from being
  serialized into executable `<script>` blocks as HTML entities such as
  `&lt;`, `&gt;`, and `&amp;&amp;`. Preserve compatibility with existing authored
  JavaScript while moving this correctness responsibility into the publishing
  pipeline rather than individual activity authors.
- Improve browser/audit diagnostics for authored JavaScript parse failures.
  Distinguish a browser `SyntaxError` in authored inline JavaScript from a
  Xronos runtime defect, retain actionable source/location evidence when
  available, and recognize HTML-escaped operators as a strong hint that stale
  content should be republished with the current XimeraLaTeX toolchain. Keep
  ordinary author syntax errors distinct from this stale-publication hint so
  reports do not overstate the cause.

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
- add instructor/author-facing Sage execution diagnostics to the browser console.
  When canonical Sage execution fails, preserve and emit a safe exception
  category/message so instructors testing authored content can distinguish
  author-code failures from Xronos/SageCell infrastructure failures. Cover both
  initial generation and explicit `Another` generations. In particular,
  identify `ZeroDivisionError` / symbolic division-by-zero failures so an
  instructor can immediately see that a randomized generation divided by zero.
  More generally, surface useful Sage exception information in the developer
  console without exposing arbitrary traceback/code details in student-facing
  banners by default;
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

### Deferred SageCell support-trace deployment

- Xronos now generates and propagates the non-secret
  `X-Xronos-Support-Trace` correlation identity, and Xronos-side state/Sage
  logging has been browser/log validated.
- The SageCell-side support-trace implementation has been migrated to the
  standalone `xronosuf/sagecell-server` repository. Its canonical
  `patch_sagecell.py` adds the same strictly validated opaque trace at SageCell
  `/service` entry without logging Sage source, learner identity, cookies,
  authorization material, or arbitrary headers.
- The old embedded `server/sagecell-docker-v2` implementation has been retired;
  do not restore or deploy SageCell from that historical copy.
- Before marking this item complete, verify the deployed standalone SageCell
  image contains the support-trace patch and validate end-to-end
  report -> Xronos -> SageCell trace correlation.
- Do not rebuild/recreate SageCell merely to activate this logging outside a
  controlled SageCell maintenance change.

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

- Consolidate the duplicated xourse-entry presentation logic used by the
  master xourse tile page and the in-activity sidebar/table of contents.
  Both presentations consume the same underlying xourse activity information
  but currently duplicate `xourseCard` classification/rendering logic in
  `views/activity-card.pug` and `views/activity-list.pug`. Preserve their
  intentionally different DOM/CSS presentations while introducing one shared
  source/view-model or classification layer with explicit tile and TOC render
  modes. Treat this as a later architecture/UI project, not part of dead-code
  cleanup.

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

### Production audit scope: active vs retained historical content

- Distinguish current active course content from retained historical publication
  artifacts when building production-audit inventories.
- Xronos intentionally may retain HTML or publication records for activities
  that were published previously but later removed from the current xourse.
  Those retained artifacts should not automatically count as current production
  navigation failures merely because their old direct URLs now return 404.
- Build the student-facing production-health audit primarily from activities
  reachable through current active xourse structure rather than treating every
  ever-published HTML artifact as currently active content.
- Preserve a separate historical/orphan inventory so retained publications
  remain discoverable for storage, cleanup, compatibility, or forensic work.
- Classify retained but no-longer-active publications separately (for example,
  `HISTORICAL` or `ORPHAN`) rather than inflating `NAV` failure counts.
- Where practical, run both views:
  1. an active-content audit used to assess current student-facing production
     health; and
  2. a historical/orphan audit used to understand retained publication state.
- The August 2026 production crawl exposed six examples in `mac2233limits`:
  old `digIn...` activities that had been intentionally removed from the active
  content long ago but remained discoverable through the broader publication
  inventory and therefore appeared as HTTP 404 NAV failures.

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

### Final project documentation reconciliation

The final page-runtime documentation reconciliation was performed after the
support-contact follow-up at committed checkpoint `2759508`.

The reconciliation updates the durable documents to:

- treat the Phase 1 support taxonomy, recovery banner, support report, support
  trace, and configured support contact as completed behavior;
- remove stale language that still described completed state, answer, MathJax,
  Sage, WebSocket, or support work as the next project target;
- remove the obsolete state-protocol description that incorrectly collapsed
  state-query failure into successful empty state;
- preserve deliberately deferred work in this TODO list;
- distinguish deployed Xronos support correlation from the source-ready but
  deployment-deferred SageCell support-trace logger;
- preserve the unresolved integrated answer/activity support-path browser
  acceptance as a deferred test rather than a Phase 1 blocker.

Possible future documentation artifacts, if they become useful as separate
maintainer references:

- `LIFECYCLE_MODEL.md`
- `DIAGNOSTIC_CODE_MODEL.md`
- `SUPPORT_ESCALATION_MODEL.md`
- `SAGE_SEED_AND_CONTEXT_INVARIANTS.md`
- `TEST_MATRIX.md`

Do not create these merely to duplicate the reconciled durable documents above.
