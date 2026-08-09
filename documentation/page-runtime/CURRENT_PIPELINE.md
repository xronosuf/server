# Current Xronos Page Runtime Pipeline

## Status

This document records the current Xronos browser runtime observed on the
`page-runtime-coordinator` branch.

The original architecture inventory began at baseline commit:

`b235dc15fa1d409b52ebc7038ebdf967113f0cda`

The current coordinator/runtime description below is reconciled through:

`e794671`

It records current behavior, current ownership boundaries, and browser-validated
runtime contracts. Historical inventory sections are retained where still
accurate.

## Browser entrypoint

The main browser bundle is built from:

- `public/javascripts/main.js`

and emitted as:

- `public/javascripts/main.min.js`

`main.js` imports many feature modules. Several imported modules install
jQuery-ready handlers or other startup behavior merely by being required.

## Early synchronous request

Before most browser initialization, `main.js` performs a synchronous `HEAD`
request against the current page to retrieve the `X-Ximera-SubPath` header.

This blocks the browser main thread and creates an early network dependency
before normal runtime diagnostics exist.

## Independent startup owners

Automatic startup behavior has been identified in at least:

- `image-environment.js`
- `users.js`
- `database.js`
- `math-palette.js`
- `cache-bust.js`
- `profile.js`
- `sagemath.js`
- `activity.js`
- `main.js`
- `instructor.js`
- `xourse.js`
- `index.js`
- `chat.js`
- `sticky-scroll.js`
- `supervision.js`
- `invigilator.js`
- `problem.js`
- `version.js`

Additional runtime sequencing is controlled by:

- module-load side effects
- MathJax startup hooks and queues
- native `DOMContentLoaded`
- WebSocket messages
- AJAX responses
- timers
- dynamically loaded external scripts
- author-provided JavaScript

The page therefore does not currently have one authoritative startup sequence.

## Main document-ready flow

The visible `main.js` document-ready callback currently performs work including:

1. connect reference and label handling
2. capture the initial author-delivered Sage page manifest
3. start MathJax
4. run syntax highlighting
5. install clickable table rows
6. initialize xourse and navigation scrolling
7. initialize Bootstrap dropdowns and tooltips
8. invoke `.activity()` on the activity page

## MathJax ownership

MathJax participates in TeX parsing, references, answer construction, Sage
placeholder creation, author `\js` output, and later rerender/reprocess work.

The coordinator now owns the MathJax startup trigger and separately models the
authoritative initial full `Process`.

The first authoritative `Begin Process` binds `mathjax-initial-process` to one
generation; matching `End Process` settles it.

The coordinator owns the 15-second `XR-MATHJAX-INITIAL-101` deadline. Stale or
mismatched completion cannot settle the task. Matching late completion can
recover where policy permits while timeout history remains recorded.

Current policy is no longer passive: a parse/processing error associated with
the authoritative initial generation fails `mathjax-initial-process`, degrades
affected readiness, shows persistent failure UI, and blocks mathematical
coursework interaction until reload.

## Initial inline Sage display readiness

The runtime separately tracks the visible lifecycle of immutable initial-manifest
Sage expressions in `sage-inline-initial`.

This remains distinct from `canonical-sage`.

Terminal aggregate outcomes include `settled`, `degraded`, and `not-required`.

The 15-second `XR-SAGE-INLINE-INITIAL-101` deadline can actively convert
unresolved visible Sage work from a spinner into explicit failure/fallback UI.

A naturally late result for the same explicit request may still recover the
timed-out lifecycle while preserving timeout history.

Explicit Retry creates a new visible request attempt and a new coordinator
operation.

Each placeholder has a monotonically increasing request-attempt token.
Callbacks from an explicitly superseded attempt are ignored before changing DOM
or lifecycle state and are recorded as `stale-attempt-ignored`.

Known display attachment failures terminate visibly:

- missing MathJax source `inputID` routes through display-error handling
- missing exact placeholder DOM uses a controlled problem/activity/page/body
  fallback destination

Browser validation on the rebuilt bundle covers clean success,
missing-input-ID, missing-placeholder, and stale explicit attempt on 03,
repeated `Another` on 04, and mixed Sage/answer/author-JS behavior on 05.

## Initial saved-state gate

`activity.js` initializes most activity behavior only after:

```javascript
activity.fetchData(function() {
    // activity initialization
});
```

`fetchData()` stores its callback until `database.js` receives the initial
WebSocket `sync` message.

If initial state synchronization never reaches `sync`, the following may never
initialize:

- problem environments
- answer boxes
- grouped validators
- hints and feedback
- free responses
- author inline JavaScript
- YouTube players
- optional interactives
- progress monitoring
- activity cards

The underlying `fetchData()` gate still has no fallback or release path when
initial state does not arrive. Queued consumers may therefore remain blocked.

The passive runtime coordinator now applies a 15-second diagnostic readiness
deadline to this dependency:

- dependency: `initial-state`
- readiness dimension: `state-synchronized`
- diagnostic code: `XR-STATE-INITIAL-101`
- deadline event: `readiness-deadline-exceeded`

When the deadline is exceeded, `state-synchronized` and page readiness become
degraded for diagnostic purposes. The watchdog does not:

- manufacture empty saved state
- release queued `fetchData()` callbacks
- stop WebSocket reconnection
- suppress a later valid `sync`
- show a user-facing fallback or error

If valid initial state arrives later, the readiness dimension recovers to
`ready`. The timeout remains recorded as historical diagnostic metadata.

## Browser state connection

The browser currently:

1. opens the main page WebSocket
2. sends `watch(learnerId, activityHash)`
3. waits for the server to send `sync`
4. initializes the browser database
5. records initial state as available
6. releases queued `fetchData()` callbacks

The availability signal now precedes callback delivery so coordinator tasks can
become eligible while the callback batch is being released.

The save-status UI currently becomes positive when the WebSocket opens, before
initial saved-state synchronization has succeeded.

## Server state connection

`app.js` creates the WebSocket server.

`routes/state.js` owns the main state protocol.

The server `watch` handler:

1. accepts a requested learner ID and activity hash
2. joins user and activity rooms
3. retrieves completion information
4. queries `mdb.State`
5. sends `sync` with stored data or an empty object

The current implementation treats both a failed state query and a confirmed
missing state record as an empty state:

```javascript
if (err || (!state))
    state = {data: {}};
```

The browser therefore cannot distinguish:

- confirmed no existing state
- saved-state lookup failure

This ambiguity must be resolved before fresh-session fallback can be considered
safe.

## State protocol

Relevant WebSocket operations include:

- `watch`
- `sync`
- `patch`
- `patched`
- `out-of-sync`
- `want-differential`
- `have-differential`
- `completion`
- `completions`
- `want-commit`
- `commit`
- `push`

Several handlers silently return when required socket identity or activity
state is missing.

Some server patch exceptions are swallowed without being reported to the
browser.

## State ownership authorization

The `watch` handler currently accepts a browser-supplied learner ID.

The source contains an explicit warning that security checks are missing.

Normal learner state access should eventually be bound to the authenticated or
guest identity.

Authorized instructor masquerade must remain a distinct, explicitly verified
workflow.

## Passive coordinator browser agreement

At commit `ee5bb03`, the passive coordinator was deployed on the development
server and compared against legacy readiness on all eleven page-runtime browser
fixtures.

Every settled fixture reported:

- `comparison.matches === true`;
- legacy page readiness `ready`;
- coordinator page readiness `ready`;
- no final mismatches;
- exactly one terminal signal for each applicable external readiness leaf.

The fixtures covered Sage required/not-required and initial math answers
succeeded/not-required combinations.

## Active activity-trigger browser validation

The first active ownership transfer was deployed and exercised across all
eleven page-runtime browser fixtures.

Every settled fixture reported:

- the activity-bootstrap trigger succeeded on its first attempt;
- the trigger result identified the coordinator as owner;
- the existing activity completion leaf subsequently succeeded;
- no guarded legacy fallback occurred;
- no duplicate activity invocation occurred;
- final coordinator and legacy readiness matched.

Temporary readiness mismatches were observed while external leaf signals and
derived coordinator tasks were being scheduled. These diagnostics converged
without fallback or recovery and were not terminal mismatches.

## Activity bootstrap

In this codebase, `.activity()` is effectively the activity-page runtime
bootstrapper rather than a small widget initializer.

The first active ownership transfer controls the one-shot document-ready
invocation of this existing initializer. A guard prevents duplicate invocation,
and a direct legacy fallback remains available if coordinator ownership cannot
be configured or requested.

The second bounded transfer controls release of the activity's state-dependent
initialization callback. The activity still registers through `fetchData()`,
but its callback now records availability and requests the coordinator-owned
`activity-initialization-release` task. That task requires both initial-state
success and an activity initialization request.

The generic `fetchData()` queue remains owned by `database.js`; other consumers
continue to receive initial state directly. The internal activity initialization
body remains in `activity.js`.

After initial state arrives, it initializes features including:

- problem environments
- answer types
- grouped validators
- hints
- feedback
- author JavaScript
- videos
- optional interactives
- activity cards
- progress behavior

### Hidden hints and feedback

Hint and feedback contents are already present in the DOM during initial page
processing. Their mathematics and author inline JavaScript participate in the
normal initial lifecycle while the containers remain hidden.

For UF publications whose frozen XimeraLaTeX package emits hints using the
KU Leuven accordion structure, the server currently converts those accordions
into `.xronos-legacy-hint` containers and sequential reveal buttons.

The source accordion heading and panel are hidden by stylesheet rules before
JavaScript runs, preventing hint content from flashing during startup.

Opening a legacy hint is a later user interaction. It:

- displays one already-initialized hint;
- records `legacy-hint-reveal`;
- queues a whole-problem MathJax `Rerender`;
- records `legacy-hint-rerender` completion.

This reveal-time rerender does not participate in initial page readiness.

## Nested-problem browser validation

A three-level nested-problem fixture was browser-tested on July 31, 2026.

The fixture contained:

- one top-level blocking problem;
- one immediate nested blocking problem;
- one second-level nested blocking problem;
- one answer at each level;
- hidden nested mathematics;
- author inline JavaScript in nested content.

Observed initial behavior:

- the top-level problem was available and visible;
- the child and grandchild were unavailable and hidden;
- all three logical answers attached during the initial MathJax process;
- hidden nested mathematics and inline JavaScript initialized normally;
- page readiness reached `ready` with no diagnostics.

Observed unlock behavior:

- completing the parent unlocked only its immediate child;
- completing the child unlocked only its immediate child;
- completing the grandchild completed the full hierarchy.

Observed progress values were:

- initial: `0`;
- parent complete: `0.5`;
- parent and child complete: `0.75`;
- all three complete: `1`.

This reflects the current recursive hierarchy weighting in `progress-bar.js`,
rather than assigning equal flat weight to every answer.

After saved state synchronized, a hard reload restored:

- all three problems as available;
- all three problems as complete;
- all three problems as visible;
- activity score `1`;
- three of three logical answers attached;
- page readiness `ready`;
- no diagnostics.

A possible brief first-paint display of unavailable nested problems was not
investigated and is currently outside the stabilization scope.

## Problem and completion runtime

`problem.js`:

- registers answer-bearing descendants through `ximera:answer-needed`
- marks problems as blocking
- tracks nested problem availability
- declares a problem complete when all registered answers are correct
- emits `ximera:complete`
- unlocks immediate nested problem environments

Historical comments in this module state that MathJax can replace DOM elements
with copies whose event handlers are no longer attached.

The code contains defensive filtering for detached answer elements and MathJax
semantic duplicates.

## Answers and validators

A standard `\answer` box performs its own validation.

A `validator` environment is intended to group multiple contained answer boxes
into one validation unit.

The current math-answer implementation attempts to make answer boxes inside a
validator environment buttonless and redirects Enter to the enclosing
validator button.

Historical observed behavior indicates that:

- buttonless rendering may not be consistent in all content
- Enter in grouped validators may cause a visible blink and cleared answers
- clicking the enclosing validator button may behave differently

Generic validator exceptions are converted to incorrect results and logged to
the browser console, but students receive no useful localized error.

## Sage runtime

Current legitimate browser Sage execution is canonical-only.

Current-publisher contracts include:

- generated `script[type="text/sagemath"]` from `sagesilent`
- visible canonical `\sage{...}`
- seeded canonical generation
- `Another`
- replay/reprocessing including Sage answer-key use

Before MathJax startup, the Sage module captures an immutable manifest with
stable expression identity, ordering, problem identity when available,
answer-key entries, and silent setup blocks.

The canonical page request compiles that manifest, enforces the 60,000 UTF-8-byte
safety ceiling, submits it through the Xronos SageCell proxy, parses the
response, and maps results by canonical identity.

`canonical-sage` represents computation/result availability.
`sage-inline-initial` represents visible settlement.

The browser no longer maintains the old standalone/embedded executor. Removed
compatibility includes `.sage` / `.sageOutput` standalone autoevaluation,
browser `createKernel`/iopub emulation, legacy request queues/batching, and
arbitrary-code fallback after canonical identity failure.

A live Sage call that cannot resolve to deterministic canonical identity is an
explicit invariant failure.

Dynamic `Another` generations are canonical and stale-generation guarded, but
remain outside initial page readiness.

`stripCDATA()` remains shared canonical parsing infrastructure, not legacy
executor code.

## Author JavaScript

Author-provided JavaScript has multiple contracts.

### `javascript` environment

A block of author-provided setup, definitions, helpers, or computation.

### `\js{...}`

An inline call or expression that may produce page or mathematical content and
may require MathJax reprocessing.

### Browser-validated setup timing

A non-random `javascript` environment was instrumented in the browser on
July 31, 2026.

Observed behavior:

1. the generated `.javascript script` executed while
   `document.readyState` was `loading`
2. later author-supplied host markup was not yet present
3. `initial-state` and the activity component had not yet been observed
4. page readiness was still `waiting`
5. a callback deferred to `DOMContentLoaded` ran at `interactive`
6. that callback could access later DOM markup, but saved state and activity
   initialization were still unavailable

Therefore:

- ordinary setup blocks are parser-owned inline scripts
- setup definitions may execute before later page markup
- DOM-dependent installation must wait for an appropriate DOM event
- `DOMContentLoaded` is not a saved-state or activity-readiness boundary
- work depending on answer globals, validators, persistent data, or initialized
  activity behavior requires a later Xronos-owned lifecycle
- Xronos cannot directly prove successful parser execution after the fact; it
  can only observe that setup-script markup exists

A random-marked setup block was also browser-tested. It executed twice:

1. once through normal parser-owned script execution while the document was
   `loading`, before state or activity initialization
2. once through the legacy `$.globalEval(...)` path after initial state released
   the JavaScript seed consumer and after activity initialization

Random setup blocks must therefore currently tolerate repeated execution. Code
that installs DOM, listeners, globals, or external resources should be
idempotent. Removing the duplicate execution requires a compatibility review
because existing content may rely on either the early parser pass or the later
seeded pass.

The passive runtime now records:

### Author JavaScript reevaluation

Browser testing confirmed the `\js{...}` reevaluation path:

1. restoring a persisted answer requested one reevaluation
2. changing the answer requested one reevaluation
3. the 250 ms debounce retained the originating request ID and trigger
4. duplicate watcher nodes in the same MathJax frame collapsed to one target
5. each changed value queued exactly one targeted MathJax `Reprocess`
6. malformed or detached watcher frames are contained rather than throwing

The runtime records:

- `author-javascript-reevaluation`
  - `requested`
  - request ID and triggering element
  - inline JavaScript and MathJax watcher counts
- `author-javascript-mathjax-reevaluation`
  - `scanning`
  - `queued` or `not-required`
  - target count and target MathJax IDs
- `author-javascript-mathjax-watcher`
  - `frame-missing`
  - diagnostic `XR-JS-WATCHER-101`

A startup request can observe fewer watcher nodes than its delayed scan because
MathJax may still be completing duplicate semantic/rendered watcher markup
during the debounce window. Targeting remains frame-based and deduplicated.

### Inline author-JavaScript failure containment

Ordinary-text `\js{...}` content remains in the DOM as
`.inline-javascript`. Activity initialization attaches its reevaluation handler
after initial state is available and performs the initial evaluation.

Browser testing confirmed that a malformed generated inline function:

- remains local to the inline value
- renders the existing hollow-square fallback
- does not throw through activity initialization
- does not degrade page readiness
- does not prevent unrelated optional interactives from working

Contained failures now emit:

- operation: `author-inline-javascript-evaluation`
- state: `failed-contained`
- diagnostic: `XR-JS-INLINE-101`
- inline element ID
- JavaScript error name and message

This is distinct from math-delimited `\js{...}` content, which uses
`.mathjax-javascript` watchers and targeted MathJax reprocessing.

- `author-javascript-setup`
  - `observed` or `not-required`
  - script count and random-script count
  - parser ownership and lack of direct execution observability
- `author-javascript-random-setup`
  - the existing explicit random setup path waiting for state and evaluating
- `author-inline-javascript`
  - post-state inline-JavaScript initialization performed by `activity.js`

### Interactive callbacks

Generated callbacks exposed through `window.interactives`, with optional
dependencies such as:

- persistent state
- reset behavior
- parameters
- Desmos
- Three.js
- JSXGraph
- Numeric

These contracts are related but should not be treated as one lifecycle unit.

## Optional interactives

Optional interactive libraries currently have unbounded failure paths.

Examples include:

- external script loads without failure callbacks
- polling indefinitely for a global object
- asynchronous sequences whose callback may never be invoked

These failures should eventually become local terminal errors without blocking
core page readiness.

## Identity component

`users.js` requests `/users/me` and then:

- reveals authenticated or guest account UI
- populates the user's first name
- exposes authorized instructor menu items
- exposes progress-audit links
- displays assignment due-date information

There is no visible failure handler.

A failed request may leave the account-menu identity area blank or unpopulated.

The intended future identity component should distinguish:

- authenticated user
- guest user
- request failed
- malformed response
- operation-specific authorization failure

Ordinary content viewing should not be blocked by identity display failure.

## Version and cache reloads

`version.js` compares the page-embedded application version with `/version` and
may reload the page when they differ.

`cache-bust.js` reloads pages carrying a query string after removing the query
from browser history.

These are independent navigation owners and should eventually emit explicit
diagnostic events.

## Passive readiness dimensions

The current coordinator derives three independent readiness dimensions:

- `state-synchronized`
  - initial saved state is available
- `content-ready`
  - initial MathJax `Process` completed
  - canonical Sage results are available or not required
- `interaction-ready`
  - activity initialization completed
  - every logical initial math answer attached successfully at least once, or
    no initial math answers were required

Initial answer readiness is based on retained logical answer identities, not
current DOM presence. MathJax may recreate answer elements, and a completed
answer may replace its input form with blue submitted-answer TeX.

For each answer discovered during the initial MathJax `Process`, the runtime
records:

- stable logical answer ID
- connection attempts before first success
- whether the MathJax answer model resolved
- whether attachment completed successfully at least once
- the latest pre-success failure category

A missing MathJax model is not counted as a successful connection.
`connectMathAnswer()` exceptions are contained and reported as attachment
failures instead of being counted as connected.

Once a logical initial answer attaches successfully, that terminal success is
retained permanently for initial readiness. Ordinary MathJax recreation and
rebinding do not increment its initial attempt count or emit repeated
`initial-math-answers` readiness events.

If an initial answer fails to attach during the first `Process`, a later
`Rerender` or other `New Math` pass can attach the same stable logical answer
and recover:

- `initial-math-answers`: `degraded` to `settled`
- `interaction-ready`: `degraded` to `ready`
- page readiness: `degraded` to `ready`

The original degraded component event remains in bounded runtime history.

The implementation was browser-validated for:

1. three successful initial answer attachments
2. ordinary MathJax rebinding without duplicate readiness events
3. correct-answer replacement with no readiness regression
4. one forced initial `missing-answer-model` failure targeted through authored
   `data-id="runtimeInteger"`
5. degraded initial state with 2/3 attached answers and unresolved
   `answer0problem2`
6. later `Reprocess` recovery to 3/3 attached answers and zero unresolved answers
7. same-operation coordinator leaf recovery from `degraded` to `succeeded`
8. transitive recomputation of `interaction-ready` and `page-readiness` from
   degraded to ready
9. preservation of authored ID, generated persistence ID, and problem ID across
   the repair

Page readiness is derived from those dimensions and may be:

- `waiting`
- `degraded`
- `ready`

The three current readiness deadlines are passive diagnostics:

| Dependency | Dimension | Deadline | Code |
|---|---|---:|---|
| `initial-state` | `state-synchronized` | 15,000 ms | `XR-STATE-INITIAL-101` |
| `mathjax-initial-process` | `content-ready` | 15,000 ms | `XR-MATHJAX-INITIAL-101` |
| `sage-inline-initial` | `content-ready` | 15,000 ms | `XR-SAGE-INLINE-INITIAL-101` |

All three watchdogs support degraded-to-ready recovery. A late successful
dependency changes the current readiness state to `ready`, but does not erase
the fact that the diagnostic deadline was previously exceeded.

The benchmark object exposes the watchdog records under:

- `deadlines.initialState`
- `deadlines.initialMathJax`
- `deadlines.initialInlineSage`

It also exposes dependency-specific timeout milestones:

- `milestones.initialStateTimedOut`
- `milestones.initialMathJaxTimedOut`
- `milestones.initialInlineSageTimedOut`
- `milestones.initialInlineSageSettled`
- `milestones.initialInlineSageDegraded`
- `milestones.initialInlineSageNotRequired`

The milestones are filtered by dependency so one timeout cannot be mistaken for
another.


## Eight-page direct-launch regression suite

The page-runtime fixtures were browser-tested on July 31, 2026:

| Fixture | Result | Main contract |
|---|---|---|
| Static MathJax | Pass | Initial MathJax completes; no Sage or answers required |
| Answers and saved progress | Pass | Logical answers attach once and submitted state survives reload |
| Basic Sage | Pass | Canonical Sage results complete all initial inline rerenders |
| Sage generation and Another | Pass | Later generation remains outside initial readiness |
| Mixed critical lifecycle | Pass | State, content, and interaction dimensions aggregate independently |
| Optional interactive | Pass | Optional author interaction works without blocking critical readiness |
| Legacy and unusual features | Pass | Parent, nested, and hidden hint answers attach and persist |
| Identity and launch context | Pass | Repository, path, hash, and direct-launch saved-state context agree |

The suite exposed one malformed grouped-validator fixture that returned a
function rather than a Boolean. Once that function entered persistent state,
`jsondiffpatch` rejected every later differential synchronization and subsequent
answers did not survive reload. The fixture was corrected to invoke its helper
with explicitly numeric answer globals.

The direct identity test does not establish authenticated LTI learner, role, or
Canvas-context behavior.

## Sage reliability audit classification

A post-reconciliation audit at `fdb015b` verified the remaining Sage error
paths against the intended reliability boundary.

Already-settled paths:

- an expired page-auth token is refreshed through `/sagecell/auth`; after
  successful refresh the same Sage request is retried once;
- missing, invalid, malformed, or incomplete page authorization is deliberately
  not auto-refreshed because the browser cannot safely reconstruct trust from
  those states;
- canonical invariant failures remain fail-closed and never authorize legacy
  string execution;
- `compiled-size-limit` remains a deliberate 60 KB safety boundary rather than
  an infrastructure retry condition;
- visible missing-anchor/input-ID cases and stale explicit-Retry callbacks have
  explicit terminal/stale-safe handling;
- in the default `local-with-fallback` service mode, local transport errors and
  HTTP 502/503/504 trigger remote SageCell fallback.

The two discrepancies found by that audit are now resolved:

- `XronosSagePageResultError` is explicitly classified as transient/retryable,
  so canonical marker/JSON response failures reach the existing visible Retry
  path rather than nonretryable `unexpected`;
- local SageCell HTTP 408/429/500 now join transport failures and
  502/503/504 as automatic local-to-fallback infrastructure failures.

The production decisions use small directly tested policy helpers. The earlier
Sage/coordinator/MathJax checkpoint passed 57 focused tests. The current
initial-answer reconciliation worktree passes 95 focused coordinator,
answer-probe, Sage, and MathJax tests. A browser one-shot `page-result-error`
fault on `03-basic-sage` was also validated: the first
attempt displayed the retryable result-reading error, explicit Retry started a
fresh attempt, and normal Sage then completed successfully.

Canonical correctness failures remain separate and fail closed.

## Current architectural conclusion

The runtime still contains multiple mature feature-owned internal paths, but
startup is no longer only a passive network of callbacks.

The coordinator owns multiple startup control seams and explicit lifecycle
contracts for the initial MathJax Process plus canonical and visible initial
Sage.

The `initial-math-answers` reconciliation is complete for the current scope,
including browser-proven degraded-to-settled repair and coordinator-derived
readiness recovery. The next substantive reconciliation target is initial-state
terminal semantics and ownership, followed by the stable support contract.
