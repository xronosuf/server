# Shared Xronos Future Work

## Purpose

Machine-facing durable backlog for future Xronos work. Keep unresolved goals,
constraints, acceptance criteria, and context useful for future maintenance or
new-server migration. Completed implementation history belongs in status,
handoff, architecture docs, and git history.

The current server is now primarily in stabilization/maintenance mode while the
new server architecture advances. Do not invest in major architectural work on
legacy subsystems unless it fixes a real current defect, adds missing error
handling/diagnostics, or produces compatibility/migration knowledge useful to
the new server.

## Reliability, recovery, and diagnostics

### Current-server runtime maintenance policy

The Page Runtime Coordinator is effectively feature-complete. Do not pursue new
coordinator architecture/features. Only modify it when needed to:
- fix a reproduced current bug;
- add missing error handling or diagnostics for an active subsystem;
- support recovery/support reporting for active failures;
- provide narrowly scoped evidence needed by another active project.

Keep future coordinator-related work limited to:
- record automatic reload/navigation causes in runtime/support diagnostics;
- detect unresolved visible loading indicators where an active component has no
  adequate terminal error/diagnostic;
- enrich support-report schema only when a concrete support need justifies new
  stable/privacy-safe fields such as application version, operation identity, or
  resynchronization detail;
- replace implicit callback completion only where an actual reliability defect
  or missing diagnostic requires it.

### Deferred integrated support-path acceptance

- Exercise at least one `XR-ANSWER-INITIAL-101` or `XR-ACTIVITY-INITIAL-101`
  failure end-to-end through the finished recovery banner and copyable support
  report.
- Reopen implementation only if that integrated browser test exposes a defect.

### Post-initial MathJax rerender errors

- Observe MathJax failures after initial page-ready, including completed answers
  whose rewritten TeX later produces visible `<merror>` such as `Missing close
  brace`.
- Retain privacy-safe context sufficient to identify the affected expression.
- Surface an appropriate degraded/support diagnostic for later rerender failure;
  initial MathJax success must not imply later rerender success.
- Do not expose arbitrary authored TeX or internal stack traces to students.

## Saved state / WebSocket

- Add structured `unauthorized` outcome after WebSocket ownership authorization.
- Decide whether bounded initial-state retry is useful now that failures are
  explicit.
- Decide whether stale-pong degradation should recycle a confirmed half-open
  socket.
- Add acknowledged fresh nonpersistent fallback only if explicit failure policy
  requires it; provide a persistent warning when operating nonpersistently.
- Prevent late saved-state responses from overwriting fallback/newer work.
- Add structured acknowledgements for patch/completion operations where needed
  to diagnose failed persistence.
- Stop silently returning from invalid socket operation states.
- Report server differential patch failures and investigate swallowed patch
  exceptions.
- Add offending persistent-data paths to `XR-STATE-DIFF-101` where privacy-safe.
- Ensure UI semantics distinguish socket-connected from state-synchronized and
  never imply saved-state health solely because the socket opened.
- Keep transient state-document disappearance deferred unless it reproduces as a
  correctness blocker.
- Verify whether any remaining `podman restart devximserver` shutdown timeout /
  SIGKILL issue still exists after PID-1 supervisor work; remove this item if
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

Initial answer readiness/late MathJax repair and basic grouped-validator failure
containment are already implemented. Remaining work:

- Reproduce/localize `testSuite/02-answers-saved-progress` attachment failures
  where expected models existed but attachments failed.
- Add bounded detail for repeated pre-success attachment failures.
- Add an initial-answer-specific deadline only if evidence shows attachment can
  remain unresolved after MathJax otherwise settles.
- Add an answer-submission transaction lifecycle.
- Preserve typed responses on validator/runtime failure.
- Prevent stale async validation results from overwriting newer attempts.
- Handle rejected async validators without generic alerts.
- Improve validator exception diagnostics/containment.
- Prevent localized answer failure from resetting the whole activity.

### Grouped validator project

- Suppress individual answer-box `?` buttons inside validator environments if
  that remains the intended contract.
- Fix Enter behavior: currently an individual form can evaluate the enclosing
  validator and then perform an unprevented native GET/navigation with trailing
  `?`; define keyboard semantics and prevent native navigation.
- Decide how untouched contained answers should be marked on partial submit.
- Decide whether individual correctness should remain hidden.
- Submit grouped answers atomically rather than as several immediate persistence
  transactions.
- Keep permanent coverage for button visibility, Enter, enclosing submit,
  response preservation, containment, and stale async results.
- Reproduce remaining MathJax blink/DOM-replacement behavior only within this
  focused project.

## Generated MathJax preamble / publisher noise

XimeraLaTeX/published pages can emit large generated MathJax preambles with
unsupported package-internal commands such as
`\newcommand {\?\c__siunitx_minus_tl }...`, causing localized TeX parse errors.
Current compatibility policy: localized parse errors are diagnostic but do not
automatically make an otherwise functional page fatal; true processing failure,
timeout, or observable answer/render failure remains degraded.

Future work:
- locate which XimeraLaTeX/TeX4ht publication step serializes package internals
  into the browser preamble;
- determine whether one malformed definition can suppress later required ones;
- prefer removing/filtering unsupported generated definitions during
  publication rather than tolerating them indefinitely at runtime;
- determine whether the browser preamble can contain only definitions actually
  needed by the page;
- add compiler/development diagnostics without student-facing noise.

## Free response / manual grading

Legacy free-response grading/storage is operationally opaque and nearly unused;
submission must not penalize students merely because no usable instructor
workflow exists. Do not remove the feature solely due to low usage, but do not
preserve opaque internals as a design requirement.

Future redesign should work backward from instructor grading:
- inventory current persistence/historical records worth preserving;
- define submission model linking student, LTI/course context,
  repository/activity/interaction, text, timestamps, grading state, score, and
  optional feedback;
- provide authorized retrieval APIs and instructor list/filter/open/grade UI;
- define resubmission, regrading, override, audit/history, progress, and Canvas
  passback behavior;
- add migration/compatibility handling and permanent tests.

## JavaScript authoring / publication / randomization

### Author-JavaScript lifecycle

Keep this only where current bugs or new-server authoring compatibility justify
work; do not extend the legacy coordinator merely to model author JS more deeply.

- Inventory execution paths: `javascript` setup, `\js{...}` evaluation,
  saved-state-triggered execution, answer-driven reevaluation, and MathJax
  rerenders caused by generated output.
- Determine which behaviors are true authoring contracts that the new server
  must reproduce versus accidental legacy behavior.
- Isolate one author block failure from unrelated blocks.
- Define an explicit post-state author hook if needed for a stable authoring
  contract.
- Random-marked setup blocks currently execute twice; inventory compatibility
  before changing this and document idempotence requirement.
- Replace textual `/random/` heuristic with explicit publisher contract when the
  publication/new-server path is ready.
- Add fixtures for persisted-answer restoration + post-load `\js` reevaluation,
  malformed ordinary-text `\js`, and `XR-JS-INLINE-101`.
- Decide whether author-facing UI needs stronger inline-JS diagnostics.

### Publisher JavaScript correctness

- Harden XimeraLaTeX publication so authored `javascript`/`javascriptCode`
  becomes raw executable JS without authors needing CDATA-sensitive wrappers.
- Prevent `<`, `>`, `&&`, etc. from becoming `&lt;`, `&gt;`, `&amp;&amp;` inside
  executable script blocks.
- Improve browser/audit diagnostics for author `SyntaxError`, preserving useful
  source/location evidence and recognizing HTML-escaped operators as a likely
  stale-publication hint without confusing author errors with Xronos defects.

### JavaScript/Sage randomization ownership

- Determine whether JS and Sage share/overwrite persisted seed state.
- Prevent either engine from unintentionally changing the other's effective
  seed.
- Define context-scoped generation identity and engine-specific derived seeds if
  appropriate.
- Define `Another` behavior for JS-generated and JS-only randomized pages.
- Preserve existing published activity compatibility and carry the resulting
  contract into the new server.

### Author guidance

- Document `javascript` environments as preferred setup/definition layer and
  `\js{...}` as preferred result/call layer.
- Mirror `sagesilent` + `\sage` concepts where useful.
- Document validator/non-mathematical interaction patterns and inventory
  happenstance-supported dynamic `\js` behavior.

## Future browser ↔ Sage execution subsystem — NEW-SERVER RELEVANT

Current SageCell service deployment is stable; do not keep routine SageCell
maintenance/support-trace work in this TODO.

Retain only future work relevant to a browser-facing Sage execution boundary that
can serve the new server and may also be prototyped/used with the current server:

- design authorization so a student browser may execute only Sage requests that
  are legitimately associated with authorized published content/context;
- consider trusted-origin plus exact request/code hashes, signed manifests, or
  equivalent capability-style authorization instead of trusting arbitrary
  browser-submitted code;
- define cache identity for authorized Sage requests so deterministic results can
  be safely reused across requests/users only where the content/seed/context
  contract permits it;
- define interaction between cache key, effective random seed, publication
  generation, course/LTI context, and `Another` semantics;
- ensure browser-facing failure responses distinguish author-code failure,
  authorization failure, cache behavior, and SageCell/infrastructure failure
  without exposing arbitrary source/traceback to students;
- prefer a subsystem/API boundary reusable by the new server rather than adding
  more legacy-server-specific Sage architecture.

## Startup / performance / initialization ordering

### Remove synchronous startup HEAD

- Determine why `X-Ximera-SubPath` cannot be rendered into page metadata.
- Replace synchronous HEAD while preserving subpath availability before URL
  construction and add failure handling.

### Reload-sensitive initialization audit

This is a current bug-finding project, not coordinator feature development.

- Continue systematic audit of document-ready handlers, delayed callbacks,
  polling, and runtime order dependencies; prioritize failures plausibly relieved
  by reload.
- Replace indefinite DOM/global polling with explicit component events only when
  it fixes a real reliability problem or yields worthwhile diagnostics.
- Classify xourse delayed relayout passes as visual-only operations.
- Measure timeout behavior across warm/cold cache, LTI/direct, fast/slow,
  desktop/mobile when evidence warrants tuning.
- Refine timeout/error handling for optional external libraries.

## Optional interactives

- Add local timeouts/terminal errors and external-script failure handlers where
  missing.
- Stop indefinite global-object polling when it causes reliability/support
  problems.
- Ensure optional failures never block core `content-ready`.
- For JSXGraph, Three.js, and Numeric: inventory actual published use and
  XimeraLaTeX contract; classify retain/deprecate/remove.

## Identity / account / LTI UI

- Add localized `/users/me` failure handling and account-menu diagnostics for
  authenticated, guest, request-failed, malformed-response, and unauthorized
  states.
- Block only operations requiring confirmed identity; keep ordinary content
  usable during identity-display failure.
- Improve LTI grade-sync pill so it reflects actual bridge/passback state and
  distinguishes meaningful failure classes.
- Add grade-sync diagnostics able to distinguish exact bridge, same-context
  different assignment, same page different context, missing metadata, and no
  successful bridge evidence; use evidence-based wording.
- Consider short-retention privacy-bounded LTI launch diagnostics for cases not
  explainable from existing bridge records.

## Recovery / support self-service — PHASE 4

The older standalone request for a dismissible recovery/reload prompt is
superseded by the unified error/recovery banner plus this planned student-driven
recovery work.

After reducing fixable bugs, add/finish recovery so support reports can record
which actions were actually attempted:
1. controlled non-destructive clean reload + record attempt;
2. native hard-reload instructions as fallback;
3. page-state reset with warning/copy-answer guidance, confirmed sync, then true
   navigation/new JS runtime.

Do not let recovery mechanisms hide reproducible defects that should instead be
fixed.

## Browser cache / frontend generation

Current cache-hardening established current-generation immutable URLs,
revalidating unversioned fallbacks, obsolete-generation 404s, service-worker
retirement, legacy Cache Storage cleanup, versioned dynamic MathJax/Guppy paths,
and packaged Guppy/KaTeX fonts. Remaining completion work:

- continue auditing first-party runtime-created URLs, CSS-relative assets,
  redirects/aliases, and paths that can escape the generation namespace;
- verify HTML/bootstrap revalidation on representative authenticated activity
  routes, not only generic/root responses;
- audit external/CDN assets for sufficient explicit versioning;
- before production rollout, perform deliberate frontend/cache-generation
  rollover so ordinary navigation abandons all previously stale generations
  without requiring users to know how to hard refresh;
- test stale-old-HTML/JS migration scenarios as practical;
- preserve invariant: current versioned URL => immutable bytes; old/foreign
  namespace never aliases current bytes; unversioned fallback revalidates.

## CSS / rendering architecture — HIGH MIGRATION VALUE

Treat as an architecture/inventory project, not hand-cleanup of `base.css`.
Useful both now and as new-server compatibility specification because author
`global.css` and XimeraLaTeX/TeX4ht-generated styling continue while the new
server still needs sane defaults reproducing legacy visual results.

Effective styling can combine:
- Xronos `base.scss` / generated `base.css`;
- Bootstrap, Guppy, Font Awesome, MathJax, CodeMirror, etc.;
- repository author `global.css`;
- CSS embedded/emitted by published activity content;
- XimeraLaTeX/TeX4ht sources including `ximera.4ht`, `xourse.4ht`, `ximera.cfg`,
  `xourse.cfg`, `ximera.cls`, `xourse.cls`;
- historical late-cascade overrides added instead of reconciling earlier rules.

Do not begin by deleting apparently unused declarations or inserting dummy
production defaults: cascade/inheritance/specificity can make changes nonlocal.

Suggested stages:
1. Generate CSS inventory/provenance map: selectors, declarations, custom
   properties, media queries, keyframes, font faces, imports/assets; source
   origin where possible; duplicate/override chains.
2. Capture representative computed-style baselines across real pages/UI states,
   content generations, mobile/responsive, and answer states; add visual
   regression artifacts where useful.
3. Define documented default CSS contract, preferably using named custom
   properties/design tokens where appropriate and recording expected override
   sources.
4. Refactor one styling domain at a time with computed-style/render equivalence
   checks; remove historical override chains only after accounting for effective
   behavior.
5. Use provenance/default contract as new-server migration input so the new
   implementation can be cleaner while reproducing legacy rendering.

### CSS-relative asset integrity

- Parse generated CSS URL graph and verify every first-party font/image/SVG/etc.
  is packaged in the same frontend generation.
- Cache-hardening found Guppy CSS emitted relative KaTeX font URLs such as
  `fonts/KaTeX_Main-Regular.woff2` without packaging those files beside
  `base.css`; current builds now package them.
- Historical font 404 appeared on some pages but not others. Do not assume one
  cause: consider cache generation, whether the page uses the face/weight,
  publication/generated CSS differences, relative-path context, and fallback
  fonts masking failure.
- Audit both declared CSS URLs and actual browser network requests.

## Masquerade / SpeedGrader

- Retain authorized learner-specific instructor view.
- Diagnose verification-string-length 500 if still reproducible.
- Repair Canvas SpeedGrader launch behavior.
- Low priority.

## Image environment

- Retain image modal behavior.
- Confirm responsive sizing/centering ownership across XimeraLaTeX and CSS.
- Ensure modal failure leaves ordinary images usable.

## Instructor statistics

- Replace Try Another statistics-button polling with explicit event only if the
  current implementation remains worth maintaining before new-server migration.
- Preserve requirements for future/new-server coordinator statistics: explicit
  server-side authorization, aggregate-only reports, custom date ranges, and
  preservation of useful derived aggregates before raw LRS purge.

## UI / content behavior

- Consolidate duplicated xourse-entry classification/view-model logic shared by
  master tile page and in-activity sidebar/TOC if useful for current maintenance
  or new-server migration; preserve distinct DOM/CSS render modes.
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
- Clarify why frozen publications emit ordinary `hint` through KU Leuven
  accordion structure; retain UF legacy conversion until authoring contract and
  republish path are understood.
- Reevaluate whole-problem MathJax rerender on hint reveal after source-output
  path is corrected.
- Test persisted hint visibility, feedback availability, sequential hints,
  reveal order, and first-paint hiding.
- Low priority: fix hint counter wording (`2 of 3` currently describes next
  reveal rather than already-revealed count).

### Nested problems
- Preserve immediate-child unlock and recursive hierarchy weighting unless an
  intentional product decision changes them.
- Possible first-paint flash of unavailable nested problems is low priority.

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
3. canonical Sage fault handling;
4. Sage generation/repeated Another;
5. mixed critical lifecycle;
6. optional interactives;
7. unusual/compatibility features;
8. identity/launch context.

Also retain:
- grouped-validator button/Enter/enclosing-submit/preservation/containment tests;
- authenticated LTI learner/role/context propagation test in addition to direct
  development identity fixture;
- fixture authoring lessons in fixture documentation rather than expanding this
  backlog.

## Documentation artifacts if genuinely useful

Possible maintainership references:
- `LIFECYCLE_MODEL.md`
- `DIAGNOSTIC_CODE_MODEL.md`
- `SUPPORT_ESCALATION_MODEL.md`
- `SAGE_SEED_AND_CONTEXT_INVARIANTS.md`
- `TEST_MATRIX.md`

Do not create them merely to duplicate existing durable docs.
