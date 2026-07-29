# Current Xronos Page Runtime Pipeline

## Status

This document records the current Xronos browser runtime observed on the
`page-runtime-coordinator` branch at baseline commit:

`b235dc15fa1d409b52ebc7038ebdf967113f0cda`

It describes existing behavior. It is not yet a detailed replacement design.

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

MathJax currently participates in:

- TeX parsing
- references and labels
- answer-box construction
- Sage placeholder creation
- author `\js` output
- rerendering and reprocessing
- hiding the global loading spinner

The global loading spinner is hidden when MathJax reports startup `End`.

That event does not prove that saved state, Sage display, answer
initialization, optional interactives, or grade-related operations are ready.

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

There is currently no timeout or degraded terminal path for this gate.

## Browser state connection

The browser currently:

1. opens the main page WebSocket
2. sends `watch(learnerId, activityHash)`
3. waits for the server to send `sync`
4. initializes the browser database
5. releases queued `fetchData()` callbacks

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

## Activity bootstrap

In this codebase, `.activity()` is effectively the activity-page runtime
bootstrapper rather than a small widget initializer.

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

Sage has two distinct jQuery-ready handlers:

1. create and bind the hidden `Another` button
2. initialize Sage only when Sage markers exist

Current Sage markers include:

- `.sage`
- `.sageOutput`
- `script[type="text/sagemath"]`

This supports the rule that Sage readiness should affect only pages with actual
Sage consumers.

Sage request, result mapping, MathJax processing, placeholder discovery, and
visible display are separate runtime operations.

## Author JavaScript

Author-provided JavaScript has multiple contracts.

### `javascript` environment

A block of author-provided setup, definitions, helpers, or computation.

### `\js{...}`

An inline call or expression that may produce page or mathematical content and
may require MathJax reprocessing.

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

## Current architectural conclusion

The present runtime is a network of cooperating callbacks rather than a single
coordinated lifecycle.

The first coordinator milestone should make this behavior observable without
changing normal page behavior.

Explicit ownership, terminal outcomes, degraded behavior, and orchestration
should then be introduced incrementally.
