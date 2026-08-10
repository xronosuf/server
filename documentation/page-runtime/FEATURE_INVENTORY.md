# Xronos Browser Feature Inventory

## Purpose

This document records browser features, authoring contracts, backend
dependencies, current status, and intended disposition discovered during the
page-runtime inventory.

## Authoring contracts

An authoring contract is generated markup, metadata, or behavior emitted by
XimeraLaTeX that the Xronos browser runtime deliberately recognizes.

Examples include:

- generated answer-box markup for `\answer`
- validator wrappers for the `validator` environment
- Sage scripts and placeholders
- `javascript` environments
- inline `\js` output
- interactive callback metadata
- problem-environment hierarchy

A decorative CSS class is not necessarily an authoring contract unless browser
behavior depends upon it.

## Retained activity features

### Activity page bootstrap

- Browser owner: `activity.js`
- Contract: `.activity` page container
- Role: initializes the runtime inside one activity or tile page
- Disposition: `RETAIN`
- Coordinator treatment: central stateful-interaction adapter

### Problem environments

- Browser owner: `problem.js`
- Contract: `.problem-environment`
- Role: answer registration, nested availability, completion, recursive credit
- Disposition: `RETAIN`
- Compatibility risk: high

### Math answers

- Browser owner: `math-answer.js`
- Contract: generated answer markup and MathJax answer commands
- Role: input, parsing, validation, state, feedback, and statistics
- Disposition: `RETAIN`
- Compatibility risk: very high

### Validator environment

- Browser owners: `validator.js`, `math-answer.js`
- Contract: `.validator` wrapper with generated validator function
- Intended role: submit and assess contained answer boxes as one unit
- Current concerns:
  - historical blink and cleared-response behavior
  - possibly inconsistent buttonless rendering
  - opaque validator exceptions
- Disposition: `RETAIN`
- Current-project treatment: instrument and test
- Later-project treatment: repair grouped submission behavior

### Math palette

- Browser owner: `math-palette.js`
- Role: Guppy-based math input helper
- Disposition: `RETAIN`
- Note: unrelated to pencil or supervision drawing

### Sage

- Browser owners: `sagemath.js`, `main.js`
- Backend owner: Sage proxy in `app.js`
- Current authoring/runtime contracts:
  - `sagesilent` / generated `script[type="text/sagemath"]`
  - canonical `\sage{...}`
  - seeded canonical generation
  - `Another`
  - replay/reprocessing including Sage answer-key use
- Current architecture:
  - immutable pre-MathJax manifest
  - canonical-only browser execution
  - separate `canonical-sage` computation lifecycle
  - separate `sage-inline-initial` visible lifecycle
  - explicit per-placeholder Retry-attempt identity
- Removed compatibility:
  - standalone `.sage` / `.sageOutput` autoevaluation
  - browser `createKernel` / iopub emulation
  - legacy browser request queues and batching
- Disposition: `RETAIN`
- Phase 1 treatment:
  - canonical operation identity is implemented
  - visible terminal settlement is implemented and browser-validated
  - retryable result-reading failure uses the visible Retry path
  - page requests carry the non-secret Xronos support trace for server
    correlation
  - SageCell-side trace logging is source-ready but deployment-deferred
- Future work:
  - deployment cleanup, reproducible SageCell build/deploy work, and
    authorization hardening without restoring legacy execution

### Author JavaScript block

- Browser owner: `javascript.js`
- Contract: `javascript` environment
- Intended author model: definitions, helpers, setup, and computation
- Disposition: `RETAIN`

### Inline author JavaScript

- Browser owners: `javascript.js`, MathJax
- Contract: `\js{...}`
- Intended author model: call previously defined JavaScript and display a result
- Disposition: `RETAIN`
- Note: some dynamic interaction may work incidentally rather than by contract

### Optional interactives

- Browser owner: `interactives.js`
- Contract: generated `window.interactives` callback records
- Dependencies may include:
  - persistent state
  - reset behavior
  - parameters
  - Desmos
  - Three.js
  - JSXGraph
  - Numeric
- Disposition: `RETAIN` pending consumer inventory
- Coordinator treatment: `DECOUPLE_FROM_PAGE_READY`
- Failure treatment: local timeout and local terminal error

### Image environment modal

- Browser owner: `image-environment.js`
- Contract: `.image-environment` plus generated modal markup
- Current browser behavior:
  - click image to open larger modal
  - use image alt text as modal caption
- Responsive sizing and centering appear to be generated markup or CSS concerns
- Disposition: `RETAIN`
- Coordinator treatment: `DECOUPLE_FROM_PAGE_READY`

### Xourse navigation

- Browser owners: `xourse.js`, `activity-card.js`
- Contract: xourse, toc, and activity-card markup
- Role: activity collection, navigation, completion labels, and layout
- Disposition: `RETAIN`
- Coordinator treatment: visual lifecycle separate from activity readiness

### User identity and account menu

- Browser owner: `users.js`
- Backend route: `/users/me`
- Role:
  - reveal authenticated or guest menu
  - display the user's first name
  - expose authorized instructor links
  - expose progress-audit links
  - display assignment due-date information
- Disposition: `RETAIN`
- Failure UI: localized account-menu identity error
- Ordinary content blocking: no
- Sensitive-operation blocking: operation-specific

### Runtime support and diagnostics

- Browser owners: `page-runtime-support-snapshot.js`,
  `page-runtime-support-policy.js`, `page-runtime-support-ui.js`,
  `page-runtime-support-report.js`
- Server correlation owners: `app.js`, `routes/state.js`
- Role:
  - stable subsystem-level support codes
  - recovery guidance
  - privacy-bounded copied diagnostics
  - report-to-Xronos-log support-trace correlation
  - configured support contact through `XRONOS_SUPPORT_EMAIL`
- Disposition: `RETAIN`
- Phase 1 status: implemented and browser-validated for the agreed support scope
- Important boundary: support trace is diagnostic-only; SageCell-side trace
  logging remains deployment-deferred

## Features requiring investigation

### JSXGraph

- Reported history: likely unfinished graphing attempt
- Current loader: remote optional script
- Status: `INVESTIGATE`
- Questions:
  - Does any published content consume it?
  - Does XimeraLaTeX emit a supported contract?
  - Should it be retained, deprecated, or removed?

### Three.js

- Current loader: remote optional script
- Status: `INVESTIGATE`
- Questions:
  - Which published activities request it?
  - Is there a supported authoring contract?

### Numeric

- Current loader: remote optional script
- Status: `INVESTIGATE`
- Questions:
  - Which published activities request it?
  - Is there a supported authoring contract?

### Instructor module

- Browser owner: `instructor.js`
- Current visible role:
  - answer statistics
  - Try Another statistics
- Status: `RETAIN`
- Follow-up: document responsibility more precisely
- Note: LTI instructor identity is primarily supplied through server user and
  bridge information

## Discontinued or dormant features

### Live supervision

- Browser owners: `supervision.js`, `users.js`
- Backend owners: `routes/state.js`, `routes/supervising.js`
- Behavior:
  - instructors join LTI context rooms
  - instructors receive real-time learner entry and completion activity
- Ethical disposition: retire
- Target:
  - `STOP_AUTO_INITIALIZATION`
  - `REMOVE_BROWSER_CODE`
  - `REMOVE_BACKEND_SUPPORT`

### Masquerade

- Backend owner: `routes/supervising.js`
- Behavior: authorized instructor views a specific learner's page and state
- Authorization checks compare:
  - role
  - tool consumer
  - LTI context
  - repository
- Ethical disposition: acceptable to retain
- Important use: Canvas SpeedGrader launch
- Current reported status:
  - SpeedGrader path returns a verification-string-length 500 error
- Target: `RETAIN`
- Repair priority: low

### Pencil

- Browser owner: `pencil.js`
- Behavior:
  - full-page shared SVG stylus drawing
  - persisted as ordinary page state
- Status: automatically initialized on every activity page
- Target:
  - `STOP_AUTO_INITIALIZATION`
  - later `REMOVE_BROWSER_CODE`
- Backend: no dedicated protocol found
- Follow-up: determine treatment of historical pencil state keys

### Annotator

- Browser owner: `annotator.js`
- Behavior: defines an annotation plugin
- Status:
  - activity initializer commented out
  - placeholder API URL remains
- Target:
  - `DEPRECATE`
  - likely `REMOVE_BROWSER_CODE`

### Invigilator

- Browser owner: `invigilator.js`
- Historical behavior:
  - hard-coded Calculus Knowledge Pre-Assessment sequence
  - timed and answer-sensitive navigation
  - localStorage persistence
- Status: disabled by immediate return
- Target:
  - `DEPRECATE`
  - likely `REMOVE_BROWSER_CODE`
- Follow-up:
  - investigate old template references
  - investigate any remaining XimeraLaTeX support

### Chat

- Browser owners: `chat.js`, `database.js`
- Backend owner: `routes/state.js`
- Status: still integrated with the main page state transport
- Target:
  - `STOP_AUTO_INITIALIZATION`
  - later `REMOVE_BROWSER_CODE`
  - later `REMOVE_BACKEND_SUPPORT`

## Homepage and profile-only features

### Homepage animation

- Browser owner: `index.js`
- Behavior: decorative moving X characters
- Disposition: independent visual choice
- Coordinator relevance: none

### Profile management

- Browser owner: `profile.js`
- Behavior:
  - relative dates
  - linked accounts
  - API credentials
  - bridge deletion
- Disposition: `RETAIN`
- Scope: profile and account-management pages
