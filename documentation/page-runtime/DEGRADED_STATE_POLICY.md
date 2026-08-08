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

Sage request success and Sage display success are different outcomes.

A Sage component must distinguish:

- request failed
- request succeeded but response mapping failed
- response mapped but placeholder was not found
- placeholder found but MathJax processing failed
- display completed
- fallback panel displayed

A successful compute request must not leave a visible component spinning
forever.

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

Asynchronous work must carry IDs so that:

- late callbacks after timeout cannot overwrite fallback state
- an older answer submission cannot overwrite a newer submission
- an older Sage generation cannot replace the current generation
- diagnostics can correlate related events

Relevant IDs may include:

- page session ID
- operation ID
- answer-submission ID
- Sage generation ID
- component instance ID

## Diagnostic presentation

Student-facing failures should use:

- plain-language summary
- stable diagnostic code
- occurrence or session ID
- exact student action
- recheck action where useful
- copyable sanitized report

Example:

```text
We could not restore your saved work.

Code: XR-STATE-104
Occurrence: 7K3M-P9Q2
```

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

The intended support workflow is:

1. Detect
2. Diagnose
3. Guide
4. Verify
5. Escalate

Student UI, instructor support tools, and developer diagnostics should share
the same error catalog and occurrence identifiers.

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

## Sage terminal-state policy

Sage degradation must be explicit and bounded.

The existing Sage implementation distinguishes multiple operational and
content-level failure classes and may offer retry or fallback UI. Coordinator
integration must preserve that behavior while ensuring that classification of a
failure also permits the relevant runtime work to stop waiting.

A retryable Sage failure is not equivalent to a still-running request. The
failed attempt may be terminal while the UI separately offers a new retry
attempt.

Likewise, canonical Sage computation and visible Sage settlement are separate
facts:

- `canonical-sage` answers whether the page-level canonical computation reached
  a classified terminal outcome;
- `sage-inline-initial` answers whether each required initial visible Sage
  component reached an explicit visible terminal outcome.

A canonical failure may therefore degrade or fail dependent visible work, but
must not leave it indefinitely pending merely because retry is theoretically
possible.

For required initial Sage content, an indefinite spinner/loading indicator is
not an acceptable degraded state. Once success, degraded output, explicit
failure, permanent fallback, not-required, or timeout/fallback can be
determined, the corresponding component and derived readiness must transition
out of waiting.

Late retry or recovery may subsequently improve the state. Such recovery should
retain prior failure/timeout evidence for diagnostics.
