# Shared Xronos Future Work

## Purpose

Machine-facing durable backlog for future Xronos work. Keep unresolved goals,
constraints, acceptance criteria, and useful context. Completed implementation
history belongs in the status/handoff/architecture docs and git history, not
here.

This backlog is intentionally broader than the current stabilization project.
Some items may eventually be implemented only in the new server architecture,
but should remain here when current-server investigation can provide useful
compatibility evidence or migration requirements.

## Reliability, recovery, and diagnostics

### Runtime coordinator / support

- Reconcile remaining legacy initial-state watchdog/comparison ownership only
  after evidence supports removal.
- Record automatic reload/navigation causes in runtime/support diagnostics.
- Detect unresolved visible loading indicators across non-Sage components.
- Consider support-report schema v2 enrichment with application/bundle version,
  operation identity, resynchronization detail, canonical Sage state, and
  derived readiness where stable/privacy-safe.
- Add occurrence IDs only if they add support value beyond supportTraceId,
  runtime session ID, operation IDs, and bounded event history.
- Continue replacing implicit callback completion with explicit terminal
  outcomes where reliability/supportability materially improves.
- Consider broader support tooling/dedicated support portal only if the in-page
  report workflow proves insufficient.

### Deferred integrated support-path acceptance

- Deliberately exercise at least one `XR-ANSWER-INITIAL-101` or
  `XR-ACTIVITY-INITIAL-101` failure end-to-end through the finished recovery
  banner and generated/copyable support report.
- Reopen implementation only if that integrated browser test exposes a defect.

### Post-initial MathJax rerender errors

- Observe MathJax processing errors after initial page-ready, including completed
  answers whose rewritten TeX later produces visible `<merror>` output such as
  `Missing close brace`.
- Retain privacy-safe context sufficient to identify the affected expression.
- Surface an appropriate degraded/support diagnostic for later rerender failure;
  initial MathJax success must not imply later rerender success.
- Do not expose arbitrary authored TeX or internal stack traces to students by
  default.

## Saved state / WebSocket

- Add structured `unauthorized` outcome after WebSocket ownership authorization.
- Decide whether bounded initial-state retry is useful now that failures are
  explicit.
- Decide whether stale-pong degradation should recycle a confirmed half-open
  socket.
- Add acknowledged fresh nonpersistent fallback only if explicit failure policy
  requires it; provide persistent warning when operating nonpersistently.
- Determine whether the existing unified recovery UI fully supersedes the older
  request for a dismissible state-specific reload prompt; preserve any missing
  state-specific recovery behavior.
- Prevent late saved-state responses from overwriting fallback/newer work.
- Add structured acknowledgements for patch and completion operations.
- Stop silently returning from invalid socket operation states.
- Report server differential patch failures and investigate swallowed patch
  exceptions.
- Add offending persistent-data paths to `XR-STATE-DIFF-101` where privacy-safe.
- Ensure UI semantics distinguish socket-connected from state-synchronized and
  never imply saved-state health solely because the socket opened.
- Keep the transient state-document disappearance contradiction deferred unless
  it reproduces as a correctness blocker.
- Verify whether any remaining `podman restart devximserver` shutdown timeout /
  SIGKILL issue still exists after the PID-1 supervisor work; remove this item if
  current stop/restart behavior is consistently clean.

## Security

### HIGH — Authorize WebSocket state ownership

- Define when a browser may request a learner ID different from its own.
- Bind ordinary student state access to authenticated/guest identity.
- Preserve legitimate authorized instructor masquerade.
- Require explicit verified instructor authorization for learner state access.
- Reject unauthorized `watch`, completion, differential, room-membership, and
  related operations consistently.

## Answer / validator behavior

Initial logical answer readiness, MathJax repair, grouped-validator basic
containment, and malformed non-Boolean result protection are already implemented;
focus future work on the unresolved semantics below.

- Reproduce/localize the `testSuite/02-answers-saved-progress` attachment case
  where expected models existed but attachments failed.
- Add bounded detail for repeated pre-success attachment failures.
- Add an initial-answer-specific deadline only if evidence shows attachment can
  remain unresolved after MathJax has otherwise settled.
- Add an answer-submission transaction lifecycle.
- Preserve typed responses on validator/runtime failure.
- Prevent stale async validation results from overwriting newer attempts.
- Handle rejected async validators without generic alerts.
- Improve validator exception diagnostics and containment.
- Prevent a localized answer failure from resetting the whole activity.

### Grouped validator project

- Suppress individual answer-box `?` buttons inside validator environments if
  that remains the intended contract.
- Fix Enter behavior: currently an individual form can evaluate the enclosing
  validator and then perform an unprevented native GET/navigation with trailing
  `?`; define intended keyboard semantics and prevent native navigation.
- Decide how untouched contained answers should be marked on partial submit.
- Decide whether individual correctness should remain hidden.
- Submit grouped answers atomically rather than as several immediate persistence
  transactions.
- Keep permanent coverage for button visibility, Enter, enclosing submit,
  response preservation, containment, and stale async results.
- Reproduce remaining MathJax blink/DOM-replacement behavior only within this
  focused project.

## Generated MathJax preamble / publisher noise

XimeraLaTeX/published pages can emit a large generated MathJax preamble with
unsupported package-internal commands, e.g.
`\newcommand {\?\c__siunitx_minus_tl }...`, causing a localized TeX parse error.
Current compatibility policy should remain: localized TeX parse errors are
reported but do not automatically make an otherwise functional page fatal;
true MathJax processing failure/timeouts and observable answer/render failures
remain real degraded conditions.

Future work:

- Locate which XimeraLaTeX/TeX4ht publication step serializes package internals
  into the browser preamble.
- Identify malformed/unsupported definitions and whether one parse failure skips
  later definitions that content may depend on.
- Prefer filtering/removing unsupported generated definitions during publication
  rather than tolerating them indefinitely at runtime.
- Determine whether the browser preamble can contain only definitions actually
  needed by the page.
- Add compiler/development diagnostics for rejected generated definitions
  without student-facing noise.

## Free response / manual grading

Current legacy free-response grading/storage is operationally opaque and nearly
unused; submission currently must not penalize a student merely because no
usable instructor grading workflow exists. Do not remove the feature solely due
to low usage, but do not preserve opaque internals as a design requirement.

Future redesign should work backward from the instructor grading workflow:

- Inventory current persistence and any historical records worth preserving.
- Define submission data model linking student, LTI/course context,
  repository/activity/interaction, text, timestamps, grading state, score, and
  optional feedback.
- Provide authorized server retrieval APIs and instructor UI for list/filter/open/
  grade.
- Define resubmission, regrading, override, audit/history, progress, and Canvas
  passback behavior.
- Add migration/compatibility handling and permanent tests.

## JavaScript authoring / publication / randomization

### Initial author JavaScript lifecycle

- Inventory initial execution paths: `javascript` setup, `\js{...}` result
  evaluation, saved-state-triggered execution, answer-driven reevaluation, and
  MathJax rerenders caused by generated output.
- Separate finite initial author-JS work from later interactive reevaluation.
- Determine whether initial author JS can introduce required visible content,
  Sage work, answers, validators, or MathJax work.
- Define finite initial manifest/generation identity and explicit terminal
  outcomes only after execution graph is understood.
- Keep ordinary answer-driven reevaluation outside page readiness unless it
  repairs unresolved initial content.
- Isolate one author block failure from unrelated blocks.
- Browser-validate existing passive setup/post-state lifecycle telemetry.
- Decide whether parser-owned setup remains an authoring contract or moves into
  an explicit Xronos execution phase.
- Define explicit post-state hook for code requiring persistent data/answers/
  validators/activity initialization.
- Random-marked setup blocks currently execute twice; inventory compatibility
  before removing either execution and document idempotence requirement.
- Replace textual `/random/` heuristic with explicit publisher contract.
- Determine whether duplicate `.mathjax-javascript` watcher nodes are required
  representation detail or removable generated markup.
- Add fixtures for persisted-answer restoration + post-load `\js` reevaluation,
  malformed ordinary-text `\js`, and `XR-JS-INLINE-101`.
- Decide whether author-facing UI should expose contained inline-JS diagnostics
  beyond existing fallback rendering.

### Publisher JavaScript correctness

- Harden XimeraLaTeX publication so authored `javascript`/`javascriptCode`
  becomes raw executable JS without authors needing CDATA-sensitive wrappers.
- Prevent `<`, `>`, `&&`, etc. from becoming `&lt;`, `&gt;`, `&amp;&amp;` inside
  executable script blocks.
- Improve browser/audit diagnostics for author `SyntaxError`, preserving useful
  source/location evidence and recognizing HTML-escaped operators as a likely
  stale-publication hint without confusing ordinary author syntax errors with
  Xronos defects.

### MEDIUM — JavaScript/Sage randomization ownership

- Determine whether JS and Sage share/overwrite persisted seed state.
- Prevent either engine from unintentionally changing the other's effective
  seed.
- Define context-scoped generation identity and engine-specific derived seeds if
  appropriate.
- Define `Another` behavior for JS-generated and JS-only randomized pages.
- Preserve existing published activity compatibility.

### Author guidance

- Document `javascript` environments as preferred setup/definition layer and
  `\js{...}` as preferred result/call layer.
- Mirror `sagesilent` + `\sage` concepts where useful.
- Document validator/non-mathematical interaction patterns and inventory
  happenstance-supported dynamic `\js` behavior.

## Sage

- Keep seed readiness conditional on actual consumers.
- Continue measuring canonical request and visible-display timing separately.
- Verify same-context deterministic sequencing, cross-LTI-context expectations,
  and effective seed participation in exact request/cache identity as needed.
- Investigate manual author seed overrides only if encountered.
- Add instructor/author-facing browser-console Sage diagnostics with safe
  exception category/message (including common `ZeroDivisionError` / symbolic
  divide-by-zero) for initial and `Another` generations; do not expose arbitrary
  code/tracebacks in student banners.
- Keep regression coverage for expired page-auth refresh/retry and transient
  fallback classifications.
- Verify deployment uses persistent `SAGECELL_PAGE_AUTH_SECRET` (or legacy
  equivalent) across process restarts.
- After production stability, consider stronger authorization based on trusted
  origin plus exact authorized request/code hashes or build-time manifest rather
  than page token alone.
- Remove only the dead `XRONOS_CANONICAL_PAGE_SAGE_ENABLED` deployment entry
  during config cleanup.

### SageCell support-trace deployment

- Cross-check standalone `xronosuf/sagecell-server`: verify deployed image
  contains the support-trace patch and validate report -> Xronos -> SageCell
  trace correlation.
- Do not restore the retired embedded SageCell implementation or rebuild
  SageCell merely to activate logging outside controlled maintenance.

## Startup / performance / initialization ordering

### MEDIUM — Remove synchronous startup HEAD

- Determine why `X-Ximera-SubPath` cannot be rendered into page metadata.
- Replace synchronous HEAD while preserving subpath availability before URL
  construction and add failure handling.

### General initialization audit

- Replace indefinite DOM/global polling with explicit component events where
  feasible.
- Classify xourse delayed relayout passes as visual-only operations.
- Continue systematic audit of document-ready, delayed callbacks, polling, and
  runtime order dependencies; prioritize failures plausibly relieved by reload.
- Measure timeout percentiles across warm/cold cache, LTI/direct, fast/slow,
  desktop/mobile.
- Refine timeout classes for optional external libraries.
- Add a canonical Sage request-level deadline only if production evidence shows
  current proxy/request timeout behavior is insufficient.
- Measure whether current 15-second readiness deadlines are appropriate.

## Optional interactives

General:
- Add local timeouts/terminal errors and external-script failure handlers.
- Stop indefinite global-object polling.
- Ensure optional failures never block core `content-ready`.

For JSXGraph, Three.js, and Numeric individually:
- Inventory actual published-content use.
- Determine XimeraLaTeX authoring/publication contract.
- Classify retain/deprecate/remove.

## Identity / account / LTI UI

- Add localized `/users/me` failure handling and account-menu diagnostics for
  authenticated, guest, request-failed, malformed-response, and unauthorized
  states.
- Block only operations requiring confirmed identity; keep ordinary content
  usable during identity-display failure.
- Improve LTI grade-sync pill so it reflects actual bridge/passback state and
  distinguishes meaningful failure classes rather than collapsing them.
- Add grade-sync diagnostics able to distinguish exact bridge, same-context
  different assignment, same page different context, missing metadata, and no
  successful bridge evidence; use evidence-based wording rather than claiming a
  student never launched from Canvas.
- Consider short-retention privacy-bounded LTI launch diagnostics for cases not
  explainable from existing bridge records.

## Recovery / support self-service

After reducing fixable bugs, add/finish student-driven recovery so support
reports can record which recovery actions were actually attempted:

1. controlled non-destructive clean reload + record attempt;
2. native hard-reload instructions as fallback;
3. page-state reset with warning/copy-answer guidance, confirmed sync, then true
   navigation/new JS runtime.

Do not let recovery mechanisms hide reproducible defects that should instead be
fixed.

## Browser cache / frontend generation

Current cache-hardening work established current-generation immutable URLs,
revalidating unversioned fallbacks, obsolete-generation 404s, service-worker
retirement, legacy Cache Storage cleanup, versioned dynamic MathJax/Guppy paths,
and packaged Guppy/KaTeX fonts. Remaining completion work:

- Continue auditing first-party runtime-created URLs, CSS-relative assets,
  redirects/aliases, and other paths that can escape the generation namespace.
- Verify HTML/bootstrap revalidation on representative authenticated activity
  routes, not only generic/root responses.
- Audit any external/CDN assets for whether their own explicit versioning is
  sufficient.
- Before final production rollout, perform deliberate frontend/cache-generation
  rollover so ordinary navigation abandons all previously stale resource
  generations without requiring users to know how to hard refresh.
- Verify rollout end-to-end with stale-old-HTML/JS scenarios as practical.
- Preserve invariant: current versioned URL => immutable bytes; old/foreign
  version namespace must never alias current bytes; unversioned fallback must
  revalidate.

## CSS / rendering architecture — HIGH MIGRATION VALUE

Treat this as an architecture/inventory project, not a hand-cleanup of
`base.css`. It is valuable both for the current server and as a compatibility
specification/roadmap for the new server because author `global.css` and
XimeraLaTeX/TeX4ht-generated styling will continue to exist while the new server
still needs sane default styling that reproduces legacy visual results.

Current effective styling can combine:
- Xronos `base.scss` / generated `base.css`;
- Bootstrap, Guppy, Font Awesome, MathJax, CodeMirror, etc.;
- repository author `global.css`;
- CSS embedded/emitted by published activity content;
- XimeraLaTeX/TeX4ht configuration/classes including `ximera.4ht`, `xourse.4ht`,
  `ximera.cfg`, `xourse.cfg`, `ximera.cls`, `xourse.cls`;
- historical late-cascade overrides added instead of reconciling earlier rules.

Do not start by deleting apparently unused declarations or inserting dummy
production defaults: inheritance/specificity/cascade can make harmless-looking
changes nonlocal.

Suggested stages:

1. Generate CSS inventory/provenance map: selectors, declarations, custom
   properties, media queries, keyframes, font faces, imports/assets; source file
   where possible; first-party vs third-party vs author `global.css` vs
   XimeraLaTeX/published-content origin; duplicate selectors/properties and
   likely override chains.
2. Capture representative computed-style baselines on a broad corpus of real
   pages/UI states/courses/content generations, including mobile/responsive and
   answer states. Source CSS says what may apply; computed style records what
   actually won. Add visual regression screenshots where useful.
3. Define explicit documented default CSS contract. Prefer named custom
   properties/design tokens where appropriate. For each default, record what it
   controls and likely override sources. The desired end state need not be one
   monolithic `base.css`.
4. Refactor one styling domain at a time with computed-style/render equivalence
   checks; remove historical override chains only after their effective behavior
   is accounted for.
5. Use resulting provenance map/default contract as new-server migration input,
   allowing cleaner implementation while reproducing legacy rendering.

### CSS-relative asset integrity

- Parse generated CSS URL graph and verify every first-party font/image/SVG/etc.
  is packaged in the same frontend generation.
- Cache-hardening found Guppy CSS emitted relative KaTeX font URLs such as
  `fonts/KaTeX_Main-Regular.woff2` without packaging those files beside
  `base.css`; this is now fixed for current builds.
- Historical observation: font 404 appeared on some pages but not others. Do not
  assume one cause. Investigate cache generation, whether a page actually uses
  the relevant face/weight, differing publication/generated CSS, stylesheet
  relative-path context, and fallback fonts masking the failure.
- Audit both declared CSS URLs and actual browser network requests.

## Legacy systems / feature retirement

Cross-check these against completed dead-code cleanup before doing more work;
remove TODO entries that repo audit proves already complete.

### Live supervision
- Verify whether automatic initialization/menu/context-room observation/browser
  code/backend support still remain; remove after compatibility review if so.

### Chat
- Verify/remove automatic initialization, browser UI/state-socket integration,
  and backend handlers if still present.

### Pencil
- Verify/remove automatic full-page stylus initialization/code if still present;
  decide whether historical persistent pencil keys need pruning.

### Annotator
- Confirm unused; remove placeholder API integration/dependency if still present.

### Invigilator
- Confirm no published authoring/routing/XimeraLaTeX dependency; remove disabled
  browser/template remnants if still present.

### Masquerade / SpeedGrader
- Retain authorized learner-specific instructor view distinct from supervision.
- Diagnose verification-string-length 500 if still reproducible.
- Repair Canvas SpeedGrader launch behavior.
- Low priority.

## Image environment

- Retain image modal behavior.
- Confirm responsive sizing/centering ownership across XimeraLaTeX and CSS.
- Ensure modal failure leaves ordinary images usable.

## Instructor statistics

- Replace Try Another statistics-button polling with explicit event.
- Add online-content-coordinator aggregate workflow with explicit server-side
  authorization, aggregate-only reports, custom date ranges, and preservation of
  useful derived aggregates before raw LRS purge.

## UI / content behavior

- Consolidate duplicated xourse-entry classification/view-model logic shared by
  master tile page and in-activity sidebar/TOC while preserving intentionally
  different DOM/CSS render modes.
- Merge profile/settings dropdowns if practical; improve hover/pointer behavior.
- Investigate/remove nonfunctional See progress item.
- Preserve remove-your-answers behavior.
- Decide Statistics placement in unified account menu.
- Investigate Test Student role presentation under Canvas LTI.

### Foldable / expandable
- Restore clear accordion visual affordance (low priority).
- Decide whether open state should persist across reload before changing current
  behavior.

### Hints / feedback
- Clarify why current frozen publications emit ordinary `hint` through KU Leuven
  accordion structure; retain UF legacy conversion until authoring contract and
  republish path are understood.
- Reevaluate whole-problem MathJax rerender on hint reveal after source-output
  path is corrected.
- Test persisted hint visibility, feedback availability, multiple sequential
  hints, reveal order, and first-paint hiding.
- Low priority: fix hint counter wording (`2 of 3` currently represents next
  reveal rather than already-revealed count).

### Nested problems
- Preserve immediate-child unlock and recursive hierarchy weighting unless an
  intentional product decision changes them.
- Possible first-paint flash of unavailable nested problems remains low priority.

### Completion accounting
- Low priority: required interactions inside `hint` should initialize/persist but
  not contribute to page completion percentage.

## Production/content auditing and testing

### Active vs historical publications

- Build student-facing production-health audit from current active xourse
  reachability rather than every historically published artifact.
- Preserve separate historical/orphan inventory for cleanup/compatibility/
  forensic use; classify retained inactive content distinctly (`HISTORICAL` /
  `ORPHAN`) instead of inflating navigation failures.
- Keep crawler/audit work aware that old direct URLs may intentionally 404 after
  removal from active content.

### Regression repository

Keep repeatable browser fixtures covering:
1. static/core MathJax;
2. answers/saved progress;
3. canonical Sage + missing-input-ID/missing-placeholder/stale-attempt faults;
4. Sage generation/repeated Another;
5. mixed critical lifecycle;
6. optional interactives;
7. legacy/unusual features;
8. identity/launch context.

Also:
- grouped-validator button/Enter/enclosing-submit/preservation/containment tests;
- authenticated LTI learner/role/context propagation test in addition to direct
  development identity fixture;
- preserve fixture authoring lessons where needed in fixture docs rather than
  expanding this TODO.

## Documentation artifacts if genuinely useful

Possible maintainership references:
- `LIFECYCLE_MODEL.md`
- `DIAGNOSTIC_CODE_MODEL.md`
- `SUPPORT_ESCALATION_MODEL.md`
- `SAGE_SEED_AND_CONTEXT_INVARIANTS.md`
- `TEST_MATRIX.md`

Do not create them merely to duplicate existing reconciled durable docs.
