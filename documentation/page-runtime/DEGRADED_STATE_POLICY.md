# Page Runtime Degraded-State Policy

## Core rule

No visible runtime component may remain indefinitely in a generic loading state.

Every service, operation, and component must eventually reach one of:

- success
- degraded
- recoverable error
- fatal error

## Separate state layers

The runtime must not collapse all status into one page-level flag.

### Service state

Examples:

- WebSocket connection
- current-user request
- Sage proxy
- MathJax engine
- external interactive library

### Operation state

Examples:

- initial saved-state retrieval
- answer submission
- Sage request
- Sage display
- grade submission
- version check
- state patch

### Component state

Examples:

- one answer box
- one grouped validator
- one Sage placeholder
- one optional interactive
- account-menu identity
- one video

## Page readiness levels

The intended page-level states are:

- `content-ready`
- `interaction-ready`
- `state-synchronized`
- `page-ready`
- `page-degraded`

Optional feature failure must not prevent core content readiness.

A page may be content-ready while state synchronization or an optional
interactive remains degraded.

## Saved-state outcomes

Initial saved-state retrieval must distinguish:

- state found
- confirmed no existing state
- state retrieval failed
- state retrieval timed out
- state identity or authorization rejected

An empty data object is not sufficient proof that no saved state exists.

## Retry behavior

Saved-state retrieval should use bounded retries.

Retry behavior must expose:

- retry count
- last failure reason
- next retry timing
- final terminal outcome

Retries must not leave the student in an indefinite loading state.

## Fresh nonpersistent fallback

When saved state cannot be retrieved after bounded retries, an ordinary
activity may offer a fresh nonpersistent session when policy allows it.

The student must receive a prominent warning explaining:

- prior progress could not be retrieved in this session
- current new work will not be saved
- the page is starting from a fresh state
- the warning will remain visible

The warning must not claim that prior work was lost.

The student must acknowledge this condition before beginning the fresh session.

## Recovery during a nonpersistent session

If saved-state connectivity later returns, Xronos must not merge restored state
into the active nonpersistent page.

Instead, show a dismissible prompt explaining:

- the saved page is available again
- reloading restores the saved page
- reloading discards the current nonpersistent page state
- the student may close the prompt
- the student may inspect, copy, or screenshot current answers first
- a later manual refresh will also restore the saved page

Closing the prompt must not hide or trap the current work.

## Fresh-fallback policy

Fresh fallback should be available by default for ordinary activities, but the
runtime must support a page-level policy equivalent to:

```text
freshFallbackAllowed = false
```

Potential future exceptions include:

- generation-dependent activities
- graded assessment contexts where a fresh page would be misleading
- uncertain identity or authorization
- instructor-only workflows
- external grade overwrite operations
- destructive author JavaScript
- activities whose downstream content materially depends on restored state

No current published page is yet designated as requiring this restriction.

## Answer-validation failure

A validation failure must be contained at the answer box or grouped-validator
boundary.

Desired behavior:

- preserve the student's typed response
- prevent accidental navigation or form submission
- restore usable submit controls
- show a localized validation error
- record a stable diagnostic code and occurrence ID
- leave unrelated page content usable
- prevent duplicate or stale operations from overwriting newer state

A validator exception must not reset the whole activity runtime.

## Sage failure

Canonical Sage computation and visible Sage display are separate outcomes.

A Sage component must distinguish at least:

- canonical request/authorization/network failure
- canonical identity/invariant failure
- result-mapping or expression-level failure
- request succeeded but MathJax source attachment failed
- request succeeded but exact placeholder disappeared
- MathJax rerender/display failure
- visible failure/fallback shown
- display completed

A successful compute request must not leave a visible component spinning
forever.

Retryable failure is terminal for that attempt even when Retry is offered.
Explicit Retry creates a new attempt.

Same-request late completion after the visible deadline may recover when still
current. A callback from an explicitly superseded Retry attempt must be ignored
and cannot overwrite the newer result.

## MathJax failure

MathJax failures should be localized when possible.

The runtime should distinguish:

- startup failure
- page-level typesetting failure
- one-container rerender failure
- author `\js` failure
- Sage-output processing failure
- DOM replacement or detached-component failure

A local rendering failure should produce a local error panel when the remainder
of the page remains usable.

## Optional interactive failure

Optional interactives must use bounded startup and loading behavior.

Failure of Desmos, Three.js, JSXGraph, Numeric, or another optional library
must:

- stop its own loading indicator
- show a local terminal error
- record a diagnostic event
- leave the rest of the page usable
- not prevent `content-ready`

## Identity failure

A failed `/users/me` request should produce a localized account-menu identity
state rather than leaving the account area blank.

Suggested visible state:

```text
Account unavailable
XR-IDENTITY-101
```

Ordinary content viewing should remain available.

Operations that require confirmed identity or authorization must be blocked
individually.

## Reload and navigation visibility

Automatic navigation owners must emit diagnostics before reloading when
possible.

Known owners include:

- application-version mismatch
- cache-bust query handling
- explicit content-update links
- ordinary navigation helpers

Runtime reports must distinguish true document navigation from:

- in-page DOM replacement
- MathJax reconstruction
- answer-input recreation
- local component rerendering

## Operation and generation identity

Asynchronous work must carry identity so stale completion cannot overwrite newer
state.

Relevant identity includes:

- page session ID
- coordinator operation ID
- MathJax generation ID
- Sage generation ID
- Sage per-placeholder request-attempt token
- answer-submission ID
- component logical/instance ID

Late recovery is valid only when it belongs to the still-relevant operation or
an explicitly permitted recovery generation/request.

For initial visible Sage, the deadline does not create a new request-attempt
token, so same-request late recovery can still succeed. Explicit Retry increments
the token; callbacks from earlier explicit attempts are ignored and recorded.

## Diagnostic presentation

Student-facing failures use:

- a plain-language summary;
- a stable support code;
- a recovery action appropriate to the failure class;
- the page-level non-secret `supportTraceId` in the copied diagnostic report;
- exact student action, including retry, keep-open, or hard-reload guidance;
- a copyable sanitized report.

The Phase 1 support codes include:

- `XR-STATE-INITIAL-101`
- `XR-STATE-CONNECTION-101`
- `XR-STATE-DIFF-101`
- `XR-MATHJAX-INITIAL-101`
- `XR-SAGE-INLINE-INITIAL-101`
- `XR-ANSWER-INITIAL-101`
- `XR-ACTIVITY-INITIAL-101`

Occurrence IDs remain optional future enrichment; the existing support trace,
runtime session ID, operation identities, subsystem snapshot, and recent bounded
events are the current correlation contract.

## Sanitization

Copied reports must not include:

- authentication tokens
- cookies
- complete learner identifiers
- complete answer contents
- raw Sage source
- private LTI secrets
- session secrets

## Late callbacks

When an operation has timed out, failed, or entered fallback, later callbacks
from the obsolete operation must not change the visible result.

The runtime should ignore or explicitly log late completion from stale
operations.

## Support workflow

The Phase 1 support workflow is implemented as:

1. Detect the active subsystem failure through the runtime/support snapshot.
2. Classify it with a stable support code and recovery action.
3. Guide the student through the unified recovery banner.
4. Offer **Report this problem** for reportable failures.
5. Generate and copy a bounded privacy-safe diagnostic report.
6. Correlate the report's `supportTraceId` with Xronos server logs when server
   interaction must be investigated.
7. When `XRONOS_SUPPORT_EMAIL` is configured, show that support address in the
   report modal; otherwise retain generic instructor/course-support guidance.

The support trace is diagnostic-only and must never be treated as
authentication.

The support report is an allowlist, not a sanitized dump. It must continue to
exclude answer contents/IDs, Sage source/code, full state, cookies,
authentication material, LTI/Canvas secrets, and arbitrary event details.

## Initial MathJax processing errors as pedagogical failure

An error during the authoritative initial MathJax Process is not treated as an
ordinary isolated visual defect.

In observed failure injection, one processing error commonly caused the page's
mathematical rendering to collapse broadly into Math Processing Error output.
Even when only one expression initially triggers the failure, the resulting
page cannot be assumed to preserve the author's mathematical meaning.

Accordingly:

- the `mathjax-initial-process` coordinator task reports `failed` when one or
  more processing or parse errors are associated with its bound generation;
- derived content, interaction, and page readiness may report `degraded` so the
  runtime presents a bounded failure state rather than an indefinite spinner;
- mathematical coursework interaction must be blocked for the remainder of
  that page load;
- a later rerender must not silently restore coursework interaction during the
  same failed page load;
- reloading the page starts a new lifecycle and may restore ordinary behavior
  when the initial MathJax Process completes cleanly;
- clearly independent passive content, such as a remotely hosted video that
  does not rely on the failed mathematical rendering, may remain available;
- the failure notice must explain that mathematical content may be incomplete
  or misleading and that answer checking has been disabled.

This is a deliberate page-level pedagogical-safety policy. It is stronger than
the usual localized-degradation rule because allowing students to interact
with incorrectly rendered mathematics may produce misleading instruction or
invalid assessment behavior.

The interaction-block implementation is completed and browser-validated in
commit `785cd8a`. Validation confirmed failed leaf state, degraded
derived readiness, a visible failure notice, disabled existing and dynamically
inserted controls, one-shot fault consumption, and clean recovery after an
ordinary reload.

## Sage reliability classification after canonical audit

The post-canonicalization reliability audit distinguishes failures that may
recover transparently from failures that must remain fail-closed.

Already-supported transparent or bounded recovery includes:

- expired page authorization: refresh `/sagecell/auth`, then retry the original
  Sage request once;
- local SageCell transport failure, missing response, and HTTP
  408/429/500/502/503/504 in `local-with-fallback` mode: try the configured
  fallback service;
- same-request late visible result after the initial inline deadline: reopen and
  recover when still current;
- explicit student Retry: create a new request attempt and ignore callbacks from
  superseded attempts.

The following are intentionally **not** automatic-recovery signals:

- missing, invalid, malformed, or incomplete authorization;
- canonical identity/invariant failures;
- the compiled canonical request safety ceiling;
- authored Sage setup/expression errors.

Those states may indicate a security boundary, an Xronos programming defect, or
author/content failure. They must not be converted into arbitrary fallback
execution.

The transient-classification discrepancies found by the final audit are
resolved:

- `XronosSagePageResultError` is now transient/retryable and therefore exposes
  the grouped Retry path;
- local HTTP 408/429/500 now trigger the same automatic fallback policy as
  transport failure and HTTP 502/503/504.

The full server fallback decision and browser result-error classification are
covered by direct policy tests. The browser `page-result-error` one-shot probe
also verified visible Retry followed by successful normal recomputation.

## Sage terminal-state policy

Sage visible terminality is now an implemented runtime invariant.

Keep these coordinator leaves separate:

- `canonical-sage`: canonical computation/result availability
- `sage-inline-initial`: visible settlement of required initial Sage consumers

For `canonical-sage`, every explicit attempt reaches a coordinator-visible
terminal outcome. Retryable failure is terminal for that attempt; explicit Retry
creates a new coordinator operation. Canonical invariant failure never falls
back to arbitrary legacy execution.

For `sage-inline-initial`, every required placeholder must reach a visible
terminal outcome. The deadline can replace unresolved loading state with explicit
failure/fallback UI. Missing MathJax `inputID` becomes visible failure. Missing
exact placeholder DOM uses a controlled visible fallback destination.
Same-request late completion may recover; a callback from a superseded explicit
Retry attempt is stale and cannot mutate current DOM or lifecycle state.

The ambiguous permanent Sage spinner is a correctness failure, not an acceptable
degraded state.

Browser validation has exercised clean success, missing-input-ID,
missing-placeholder, stale explicit attempt, repeated `Another`, and mixed
Sage/answer/author-JavaScript behavior. Timeout/failure history remains available
after safe recovery.
