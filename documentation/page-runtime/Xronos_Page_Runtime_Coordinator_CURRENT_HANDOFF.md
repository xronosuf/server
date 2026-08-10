# Xronos Page Runtime Coordinator — Current Handoff

**Purpose:** living operational handoff for continuing the Page Runtime
Coordinator project after a chat/session boundary.

**Last reconciled:** 2026-08-10
**Working branch:** `page-runtime-coordinator`
**Last known local HEAD:** `ea1d0aa` — `Restore WebSocket heartbeat and reconnect recovery`
**Last known remote HEAD:** `ea1d0aa` — `Restore WebSocket heartbeat and reconnect recovery`
**Last known branch relation:** synchronized
**Pushed?** Yes; the checkpoint through `ea1d0aa` is backed up on
`origin/page-runtime-coordinator`.

Always verify Git state before changing code.

## 1. Project goal

Replace Xronos's implicit browser startup network of import-time side effects,
DOM-ready handlers, MathJax callbacks, WebSocket callbacks, Sage promises,
answer attachment, and readiness flags with an explicit dependency-aware Page
Runtime Coordinator.

The coordinator should provide operation identity, explicit terminal outcomes,
bounded deadlines, stale-completion rejection, safe late recovery, dependency
joins, and privacy-safe diagnostics while leaving mature feature algorithms in
their existing modules.

## 2. Authoritative document map

- `COORDINATOR_DESIGN.md` — target architecture and migration principles
- `CURRENT_PIPELINE.md` — factual current browser execution
- `DEGRADED_STATE_POLICY.md` — failure isolation and recovery policy
- `FEATURE_INVENTORY.md` — supported/dormant/investigation feature inventory
- `IMPLEMENTATION_STATUS.md` — durable current implementation checkpoint
- `RUNTIME_OWNERSHIP_MATRIX.md` — owner/trigger/dependency/terminal-state map
- `TODO.md` — remaining/deferred work
- this file — current operational state and immediate next boundary

When documents disagree, reconcile the repository rather than silently choosing
one.

## 3. Current branch checkpoint

```text
eed8ae4 Refresh runtime coordinator checkpoint docs
7c5913f Close final canonical Sage reliability gaps
fdb015b Reconcile page runtime coordinator documentation
e794671 Harden inline Sage visible failure handling
43f97e0 Make canonical browser Sage unconditional
03603fe Remove legacy browser Sage executor
b9fed4d Enforce canonical-only browser Sage execution
7a97229 Remove obsolete standalone Sage compatibility
10f6eb5 Settle timed-out initial inline Sage visibly
843cc5c Recover initial inline Sage across visible retries
5bf6acc Correct canonical Sage permanent-fallback status
a5fc246 Bind canonical Sage retries to coordinator operations
6f06bfa Document Sage terminal-state acceptance criteria
c57d6a4 Finalize coordinator milestone cleanup
efbdced Record failed-render browser validation
785cd8a Block interaction after failed initial MathJax render
```

Local and remote are synchronized at `ea1d0aa`.

The current pushed checkpoint includes:

- the completed initial math-answer reconciliation;
- explicit initial-state terminal semantics and reconnect resynchronization;
- a shared, directly tested initial-state protocol helper;
- restored application-level WebSocket heartbeat/pong liveness checks;
- heartbeat timer cleanup across reconnects; and
- reconnect backoff reset to 1 second after a successful socket open.
## 4. Coordinator foundation already completed

Implemented foundation includes:

- dependency-aware coordinator core
- external lifecycle leaves
- operation IDs
- task timeouts
- stale completion recording
- bounded event history
- derived/recomputable readiness
- `allow-late-success`
- transitive recovery
- active startup seams for activity, MathJax startup/UI, static UI, navigation,
  and references

External leaves:

```text
initial-state
mathjax-initial-process
canonical-sage
sage-inline-initial
activity
initial-math-answers
```

Derived graph:

```text
initial-state
└── state-synchronized

mathjax-initial-process + canonical-sage + sage-inline-initial
└── content-ready

activity + initial-math-answers
└── interaction-ready

state-synchronized + content-ready + interaction-ready
└── page-readiness
```

## 5. Initial MathJax Process milestone

The authoritative first full MathJax Process is generation-bound.

Implemented:

- Begin/End Process binding
- coordinator-owned `XR-MATHJAX-INITIAL-101` 15-second deadline
- stale/mismatched completion rejection
- generation-associated processing errors
- terminal pass/answer/Sage metadata
- safe matching late recovery with retained timeout history
- one-shot MathJax processing fault injection

Current policy from `785cd8a` is that an initial parse/processing error makes the
mathematical coursework untrustworthy for that page load. The leaf fails,
affected readiness degrades, persistent failure UI appears, and mathematical
coursework interaction is blocked until reload.

Do not revert to the older “errors are diagnostic only” wording without new
browser evidence and an explicit policy decision.

## 6. Sage current-publisher contract

Highest-confidence current-publisher evidence is in `testsuite.git`:

- `testSuite/03-basic-sage.tex`
- `testSuite/04-sage-generation-another.tex`
- `testSuite/05-mixed-critical-lifecycle.tex`

Supported behavior includes:

- `sagesilent`
- visible `\sage{...}`
- seeded canonical generation
- `Another`
- replay/reprocessing including Sage answer-key values

No current-publisher evidence supports restoring the old standalone
`.sageOutput`, browser kernel, or `text/x-sage` execution model.

## 7. Canonical-only Sage architecture

The current local cleanup removed:

- standalone `.sage` / `.sageOutput` execution compatibility
- `createKernel` compatibility
- iopub emulation
- legacy browser request queue/cache state
- batching
- legacy `exports.sage`
- canonical-to-legacy arbitrary-code execution fallback

Every legitimate browser Sage call must resolve to deterministic canonical
identity. Failure to identify/authorize a canonical request must not mean
“execute the arbitrary string through a legacy path.”

`43f97e0` also removed the browser/server canonical rollout feature gate.
`XRONOS_CANONICAL_PAGE_SAGE_ENABLED=true` is now inert; later remove only that
individual `.env` entry while leaving all unrelated entries intact.

Keep the 60,000 UTF-8-byte compiled-request safety ceiling unless real content
provides contrary evidence.

`stripCDATA()` is shared canonical parsing infrastructure and was correctly
restored in `e794671` after its accidental removal with legacy code.

## 8. Canonical Sage and visible Sage remain separate

`canonical-sage` represents computation/result availability.

`sage-inline-initial` represents whether all required initial visible Sage
consumers reached explicit terminal display state.

Retryable canonical failure is terminal for that attempt. Explicit Retry creates
a new coordinator operation.

Canonical computation success does not prove visible settlement.

## 9. Initial visible Sage reliability

Core invariant:

> Known Sage failure must not leave a required visible component indefinitely
> loading.

Implemented:

- visible deadline settlement at `XR-SAGE-INLINE-INITIAL-101`
- explicit Retry
- safe same-request late recovery
- missing MathJax `inputID` visible failure
- missing exact placeholder visible fallback destination
- per-placeholder request-attempt identity
- stale callback rejection across explicit Retry

`e794671` adds `requestAttempt`. A delayed callback from an explicitly
superseded attempt emits `stale-attempt-ignored` and cannot mutate the current
result. The deadline does not increment the token, preserving same-request late
recovery.

Fallback destination order when the exact placeholder is missing:

1. owning problem container
2. `main.activity`
3. `#page-content`
4. `document.body`

## 10. Sage reliability probe and browser validation

Development-only probe:

```text
public/javascripts/sage-inline-fault-probe.js
test/sage-inline-fault-probe.js
```

Faults:

- `missing-input-id`
- `missing-placeholder`
- `stale-attempt`
- `page-result-error`

Browser validation on the rebuilt bundle:

- 03 clean startup: PASS
- 03 missing input ID: PASS
- 03 missing placeholder: PASS
- 03 stale attempt after explicit Retry: PASS
- 03 canonical page-result parsing fault followed by successful Retry: PASS
- 04 repeated `Another`: PASS
- 05 mixed Sage/answer/author-JS lifecycle: PASS

The stale-attempt runtime showed attempt 2 rendering successfully, followed by
the delayed attempt 1 being ignored, with final state/content/interaction/page
readiness all ready and final coordinator/legacy comparison matching.
## 11. Browser build environment

The browser serves `public/javascripts/main.min.js`; source changes are not
browser-tested until that bundle is rebuilt.

Verified build environment:

```text
container: devximserver
workdir: /usr/var/server
Node v12.22.12
npm 6.14.16
Gulp local 4.0.2
```

Use project-local Gulp inside `devximserver`.

The host Node 8/global-Gulp environment is not a valid browser build path.

Latest focused tests for the pushed `a717d28` reconciliation:

```text
page-runtime coordinator core:     33
page-runtime coordinator adapter:  42
initial math-answer fault probe:    5
Sage reliability policy:            4
sage-inline fault probe:            6
initial MathJax fault probe:         5
total:                              95 passing
```

The served browser bundle was rebuilt inside `devximserver`, and host/container
SHA-256 hashes matched.
## 11A. Fresh Sage reliability audit before push

After commit `fdb015b`, a new read-only Sage audit rechecked all known failure
paths before backing up the branch.

The audit confirmed several apparent issues were already solved or deliberately
fail-closed:

- expired page-auth refresh/retry is implemented;
- persistent page-auth signing secret is deployment configuration, not missing
  browser recovery logic;
- canonical identity/invariant failures deliberately reject rather than restore
  legacy execution;
- the 60 KB compiled canonical request ceiling remains intentional;
- missing input ID, missing placeholder, deadline fallback, same-request late
  recovery, explicit Retry, and stale explicit-attempt callbacks already have
  explicit handling;
- local transport failures and HTTP 502/503/504 already use fallback SageCell
  when service mode is `local-with-fallback`.

Both narrow items found by the audit are now resolved:

1. `XronosSagePageResultError` is explicitly transient/retryable and uses the
   existing visible Retry path.
2. Local SageCell transport/missing-response and HTTP
   408/429/500/502/503/504 failures now qualify for automatic fallback.

Production uses directly tested policy helpers for both decisions. The focused
suite passes 57 tests. Browser validation on `03-basic-sage` with the one-shot
`page-result-error` probe confirmed retryable visible failure followed by a
successful fresh Retry.

Canonical identity checks remain fail-closed and legacy execution was not
restored.

## 12. Initial math-answer reconciliation

This lifecycle is reconciled for the current coordinator scope.

Important identity finding:

- authored `\answer[id=...]` reaches the browser as semantic `data-id`;
- Xronos separately assigns the generated persistence/DOM ID used by persistence
  and answer activity;
- MathJax render IDs are a third, transient rendering identity;
- do not collapse these identities or replace the generated persistence scheme
  without a reproduced defect.

Browser evidence on `testSuite/02-answers-saved-progress`:

- authored target: `runtimeInteger`
- generated persistence ID: `answer0problem2`
- owning problem: `problem2`
- ordinary `Reprocess` replaced the answer DOM node while preserving authored ID,
  persistence ID, and problem ID
- a development-only one-shot `missing-answer-model` probe produced an initial
  degraded state with 2/3 answers attached and `answer0problem2` unresolved
- the initial MathJax Process itself still completed successfully
- a later `Reprocess` resolved and attached the missing model, giving 3/3 attached
  and zero unresolved
- the runtime component changed `degraded -> settled`
- the coordinator leaf changed `degraded -> succeeded` on the same attempt and
  operation
- `interaction-ready` and `page-readiness` recomputed from degraded to succeeded

The browser run exposed one real coordinator defect: `allow-late-success`
previously accepted late external recovery only from `timed-out`, so a second
signal after `degraded` was counted but rejected. The `a717d28` core fix permits
same-operation `degraded -> succeeded/not-required` recovery for
`allow-late-success` external leaves, records `task-recovered`, and uses the
existing derived recomputation path.

Development-only probe files:

```text
public/javascripts/math-answer-initial-fault-probe.js
test/math-answer-initial-fault-probe.js
```

Storage key:

```text
xronosMathAnswerInitialFault
```

No answer-specific timeout was added, and no production answer identity scheme
was changed.

## 13. Initial state terminal semantics

This lifecycle is now reconciled for the current coordinator scope.

Server `watch` now sends an explicit `initial-state-result` with one of:

- `found`
- `empty`
- `failed`
- `invalid-request`

The browser no longer infers first-state success from an ordinary `sync`.
`sync` remains a compatibility/differential resynchronization path.

First acquisition behavior:

- `found` or `empty` initializes `SHADOW` and `DATABASE`;
- queued `fetchData()` consumers are released only after a successful
  `found`/`empty` terminal result;
- `failed` and `invalid-request` remain terminal failures and do not manufacture
  fresh empty state.

Reconnect behavior:

- the one-shot `initial-state` result remains unchanged;
- a later `initial-state-result` updates `SHADOW` only;
- the runtime records a separate `state-resynchronization` operation;
- live local `DATABASE` is preserved so reconnect does not erase offline/local
  changes before differential synchronization.

`XR-STATE-INITIAL-101` remains the 15-second diagnostic deadline. The legacy
watchdog can still record timeout history, but it does not overwrite an already
terminal degraded result. Detailed watchdog ownership cleanup remains later work.

A shared pure helper now defines server/client protocol normalization:

```text
public/javascripts/initial-state-protocol.js
test/initial-state-protocol.js
```

Focused protocol coverage includes `found`, `empty`, `failed`,
`invalid-request`, malformed client outcomes, and identifier counting.

Browser validation confirmed:

- normal first acquisition uses `source: initial-state-result`;
- `initial-state` reaches `available`;
- `state-synchronized` reaches `ready`;
- reconnect leaves the original `initial-state` timestamp unchanged;
- reconnect records separate `state-resynchronization: available`.

A transient test-environment contradiction was observed where a page reported a
found state while a later standalone Mongo count showed no matching document.
Public routing and Mongo target identity were verified. No state deletion/TTL
path was found. This investigation is intentionally deferred because the
protocol boundary is directly tested and the browser lifecycle is validated.

## 14. WebSocket reliability

Application-level heartbeat is restored.

Current behavior:

- browser sends `ping` every 18 seconds;
- the server immediately echoes the timestamp in `pong`;
- browser records `state-websocket-liveness`;
- successful pongs report `healthy` with measured latency;
- a pong older than 45 seconds reports `degraded`;
- stale-pong degradation is diagnostic only and does not currently force-close
  the socket;
- heartbeat timers are cleared when the owning socket closes and replaced
  cleanly on reconnect;
- reconnect backoff resets to 1 second on every successful socket open.

Browser validation confirmed a healthy ~70 ms pong on the initial connection,
then a server restart produced multiple reconnect attempts, a successful later
open with `reconnectBackoffMilliseconds: 1000`, a separate successful
`state-resynchronization`, and a resumed healthy heartbeat.

Nginx retains the 3600-second WebSocket proxy read/send timeout as an outer
transport safety net rather than the primary liveness mechanism.

## 15. Phase 1 success definition

The Page Runtime Coordinator project should not remain open-ended. For this first
major project run, success is defined by two practical support outcomes rather
than by eliminating every legacy callback or completing every follow-up item.

### 15.1 Student-facing success criterion

The most common reasons a student would otherwise send a vague
"Xronos doesn't work" message should either already be prevented or should end
in a clear student-facing error/recovery message that tells the student what to
do next.

The four highest-value cases are:

#### A. Grade synchronization / incorrect launch

Status: **complete for Phase 1**.

The existing grade-sync notification and associated `?` help affordance explain
when the assignment was not launched in a way that allows Canvas grade
synchronization.

Do not reopen this area during the coordinator closeout unless a reproduced
defect shows the current notification is incorrect or misleading.

#### B. Initial MathJax/cache corruption

Status: **detection and lifecycle handling are implemented; student recovery UI
remains**.

The authoritative initial MathJax Process now has:

- generation identity;
- explicit completion/failure;
- processing-error association;
- `XR-MATHJAX-INITIAL-101` deadline/failure diagnostics;
- interaction blocking when the rendered mathematical page cannot be trusted;
- safe late recovery rules where appropriate.

A common real-world failure mode is browser cache corruption or stale assets
causing MathJax processing failure. The usual student remedy is a hard refresh.

Phase 1 should therefore add a prominent student-facing failure banner for the
initial MathJax failure class. The message should:

- say that Xronos could not process the mathematics on the page;
- instruct the student to perform a hard refresh;
- provide concise hard-refresh help/instructions;
- display the relevant stable error/support code prominently;
- tell the student to include that code when contacting the instructor if the
  problem continues.

Do not expose stack traces or internal MathJax implementation details to the
student.

#### C. Work did not save / server connection loss

Status: **major suspected transport cause repaired; student disconnect guidance
remains; definitive end-to-end persistence acknowledgement is deferred unless
testing proves it necessary for Phase 1**.

The historical lost-work reports may have been related to WebSocket idle
disconnect/reconnect behavior, but this has not been proven causally.

Current transport reliability now includes:

- 18-second application heartbeat;
- immediate server pong;
- liveness diagnostics;
- reconnect handling;
- reconnect backoff reset after successful open;
- state resynchronization after reconnect;
- 3600-second nginx WebSocket timeout as an outer safety net.

For Phase 1, the important student-facing behavior is:

- if the runtime knows the state socket is disconnected/degraded, show a
  prominent warning;
- tell the student to keep the page/tab open while Xronos reconnects;
- explicitly warn against closing the tab while disconnected because the most
  recent work may not yet have reached the server;
- clear or replace the warning when the connection is restored;
- show a stable state/WebSocket support code if the problem persists.

Do not claim that socket-open alone proves the latest state is durably persisted.

Full state-operation acknowledgement remains a later TODO unless browser testing
shows that Phase 1 cannot meet its support goal without it. The stronger future
contract would be:

```text
browser state changed
-> patch sent
-> server accepted patch
-> persistence succeeded
-> client received acknowledgement
```

Wrong-account work remains a separate identity/user-behavior case. Xronos must
not silently reassign work from one identity to another.

#### D. Sage "spinning wheel of death"

Status: **core reliability problem complete; presentation should be unified with
the Phase 1 support/error-code system**.

The implemented invariant is:

> A known Sage failure must not leave a required visible Sage component
> indefinitely displaying a loading spinner.

Current protection includes:

- canonical Sage operation identity;
- separate visible Sage settlement;
- retryable/permanent failure classification;
- visible deadline settlement;
- missing-anchor/missing-placeholder handling;
- explicit Retry;
- safe same-request late recovery;
- stale-attempt rejection;
- browser fault-probe validation.

Phase 1 should preserve the existing Sage-specific visible failure/retry behavior
while ensuring the student can also see a stable support/error code that
identifies Sage as the failing subsystem.

### 15.2 Instructor/support success criterion

If a student still contacts the instructor with "Xronos doesn't work", the page
should provide enough visible diagnostic identity that the instructor no longer
has to infer the failing subsystem from a screenshot.

The student-facing layer should be deliberately simple:

- plain-language problem description;
- concrete recovery action;
- stable error/support code;
- instruction to include that code when contacting the instructor.

Examples of subsystem-level distinctions include:

```text
MathJax / initial math processing
state acquisition
WebSocket connection/liveness
Sage computation/display
initial answer attachment
activity/bootstrap/readiness
```

The support/instructor layer should expose a richer bounded report behind a
"Copy diagnostic information" or equivalent affordance.

The support report should include, where available and privacy-safe:

- stable support/error code;
- affected subsystem;
- terminal state/outcome;
- coordinator operation ID;
- occurrence ID;
- timestamp and elapsed time;
- page path/repository;
- activity/content hash;
- application/bundle/version metadata;
- initial-state outcome;
- state-resynchronization outcome;
- WebSocket connection state;
- heartbeat/liveness state and recent latency;
- initial MathJax state;
- canonical Sage state;
- initial visible Sage state;
- initial math-answer state;
- derived state/content/interaction/page readiness;
- a bounded recent diagnostic/event history relevant to the failure.

The support report must not become an unbounded dump of page state, answers,
Sage source, secrets, tokens, or other unnecessary student data.

The primary Phase 1 support goal is:

> A student-visible failure should identify which major runtime subsystem failed,
> and the copied diagnostic report should give enough context to determine where
> in that subsystem's lifecycle the failure occurred.

## 16. Remaining Phase 1 milestones

The remaining work for this first major coordinator project should stay focused
on converting existing runtime knowledge into actionable student recovery and
support diagnostics.

### Milestone 1: stable support/error taxonomy

Define the small set of top-level runtime failure classes that should produce
student-visible support codes.

Prefer existing `XR-*` diagnostics where they already express the correct
failure. Do not create a second unrelated error-code vocabulary.

For each student-visible failure class, define:

- subsystem;
- trigger/terminal state;
- support/error code;
- student message;
- recommended student action;
- whether interaction should remain available;
- whether automatic recovery is possible;
- what diagnostic details belong in the copied support report.

The support taxonomy should distinguish **stable support codes** from lower-level
**reason/category diagnostics**.

A support code answers:

> Which student-relevant Xronos subsystem failed?

The copied diagnostic report can then carry the more detailed reason, such as a
Sage authorization/transient/display/code failure or a WebSocket
`socket-closed`, `pong-stale`, or `heartbeat-send-failed` reason.

Do not create a separate student-visible code for every internal exception or
runtime event.

The initial Phase 1 support-code set should be kept deliberately small and may
include:

- `XR-STATE-INITIAL-101` for initial-state acquisition failure/deadline;
- a new stable state/WebSocket connection support code for active connection or
  liveness loss;
- `XR-STATE-DIFF-101` when the browser cannot construct/save the page-state
  differential;
- `XR-MATHJAX-INITIAL-101` for the authoritative initial MathJax failure/deadline;
- `XR-SAGE-INLINE-INITIAL-101` for initial visible Sage settlement failure;
- a new stable initial-answer attachment support code if initial answer
  attachment prevents interaction;
- a new stable activity-initialization support code if activity startup itself
  fails.

Localized developer/content diagnostics such as `XR-JS-INLINE-101`,
`XR-JS-WATCHER-101`, and `XR-VALIDATOR-RESULT-101` should normally remain in the
copied report or localized UI rather than becoming whole-page student banners.

### Recovery-order policy

When reload is the correct recovery action, the student-facing instruction must
say **hard reload**, not merely "reload" or "refresh".

The UI must explicitly explain that a hard reload is **not the same thing as
clicking the browser's ordinary Refresh button**. The hard-reload help should
tell the student that a hard reload forces the browser to fetch fresh Xronos
assets rather than reusing cached files, and should provide concise
browser/platform instructions.

The recovery order should be:

- **Initial MathJax failure:** hard reload immediately. The page is already
  considered unsafe for math-dependent interaction.
- **Transient/retryable Sage failure:** use the provided **Retry computation**
  action first. If the problem continues, perform a true hard reload. If it
  still continues, report the problem.
- **Permanent/display Sage failure:** perform a true hard reload once; if the
  problem remains, report it.
- **State/WebSocket disconnected or liveness lost:** **do not reload yet**.
  Keep the tab open while Xronos reconnects. Warn the student that the most
  recent work may not yet have reached the server.
- **State/WebSocket recovered but the page still behaves incorrectly:** perform
  a true hard reload; report if the problem remains.
- **Initial-state failure:** if a connection/reconnect condition is still
  active, wait for recovery first; otherwise hard reload once, then report if
  the problem remains.
- **Initial-answer/activity initialization failure:** hard reload once, then
  report if the problem remains.
- **State differential/save failure:** keep the page open initially and avoid
  reload while unsaved work may be stranded; recover/save if possible, then
  hard reload only once it is safe. Report persistent failure.

The "do not reload while unsaved work may be stranded" rule is the main
exception to using hard reload as the default recovery action.

### Milestone 2: standardized student recovery banner

Create one reusable student-facing error/recovery presentation for major runtime
failures.

The banner should be driven by runtime/coordinator terminal outcomes rather than
by unrelated feature-specific guesses.

The standardized banner should expose recovery actions appropriate to the active
issue, including where relevant:

- **Retry computation**;
- **Hard reload instructions**;
- **Report this problem**.

A recovered transient issue should not continue presenting an alarming active
banner merely because its history is retained for diagnostics. In particular,
the state/WebSocket disconnect warning should clear or be replaced after the
socket is open, liveness is healthy, and state resynchronization has recovered.

It must distinguish at least the Phase 1 high-value cases:

- initial MathJax failure -> hard-refresh guidance;
- state/WebSocket disconnection -> keep-tab-open/reconnect guidance;
- Sage failure -> existing visible Retry/recovery plus support code;
- other major coordinator readiness failure -> identify the subsystem and
  provide a useful support code rather than a generic "Xronos broke" message.

Avoid surfacing minor transient degradation that has already recovered unless
the retained history is useful only in the copied diagnostic report.

### Milestone 3: stable support report contract

Stabilize the public support-facing runtime report, likely through
`window.xronosInspectPageRuntime()` or a narrow wrapper around the existing
runtime report.

Separate:

- contractual support fields;
- internal/debug-only fields.

The support contract should be:

- bounded;
- deterministic enough for support use;
- privacy-safe;
- versioned or otherwise evolvable;
- usable by a simple "Copy diagnostic information" UI;
- resilient when one subsystem itself is partially failed.

### Student reporting workflow

The standardized failure UI should include a **Report this problem** action for
persistent reportable failures.

That action should open a modal dialog containing:

- the configured Xronos support email address;
- concise instructions telling the student to send an ordinary email using
  their normal institutional/webmail workflow;
- a **Generate & Copy Report** button;
- confirmation after the diagnostic report has been copied.

Do **not** use or depend on a `mailto:` link. The Phase 1 design deliberately
avoids `mailto:` because client/browser/institutional mail-handler behavior is
unreliable and often confusing for students.

The support email address should be server-configurable rather than hard-coded
into browser source. The initial deployment may point to the primary Xronos
support/instructor address, while other deployments can use a departmental or
local support address.

If no support email is configured, the UI should still allow the student to
generate and copy the diagnostic report.

The generated copied text should already be usable as an email body without the
student needing to understand the diagnostic fields. It should contain:

- a human-readable Xronos problem heading;
- the active support/error code;
- the affected subsystem/problem summary;
- page/repository/activity identification;
- report timestamp;
- recovery steps the student was asked to try where useful;
- a clearly delimited diagnostic section.

The diagnostic section should be produced from an **allowlist** of safe fields,
not by serializing a broad runtime object and attempting to remove sensitive
fields afterward.

Useful allowlisted fields may include:

- support/error code;
- lower-level reason/category;
- subsystem;
- terminal state/outcome;
- coordinator operation ID;
- occurrence ID;
- runtime session ID;
- timestamp and elapsed time;
- repository and activity path;
- activity/content hash;
- Xronos application/bundle/version metadata;
- browser/user-agent and platform information useful for diagnosis;
- browser language and timezone;
- online/offline observation;
- initial-state outcome;
- state-resynchronization outcome;
- WebSocket connection/liveness state and recent latency;
- initial MathJax state/generation/error category;
- canonical Sage state;
- initial visible Sage state and error category;
- initial math-answer state;
- derived state/content/interaction/page readiness;
- a bounded recent set of runtime events relevant to the failure.

The report must exclude by default:

- authentication tokens;
- cookies;
- Canvas/LTI secrets;
- Sage authorization tokens;
- server environment values;
- a full page-state/DATABASE dump;
- student answer contents;
- arbitrary Sage source/code;
- unbounded console/runtime logs;
- any other data not needed to diagnose the support condition.

The student should be able to complete the reporting workflow with essentially:

```text
Report this problem
-> Generate & Copy Report
-> open normal email/webmail
-> paste
-> send to the displayed support address
```

They should not need developer tools, console access, knowledge of their browser
internals, or an understanding of coordinator/runtime terminology.

### Milestone 4: browser failure-injection acceptance pass

Before calling Phase 1 complete, deliberately trigger representative failures
and verify the entire student/support path.

Acceptance should cover at least:

1. initial MathJax processing failure:
   - visible banner;
   - hard-refresh instruction;
   - MathJax support code;
   - useful copied diagnostics;

2. state/WebSocket interruption:
   - visible disconnected warning;
   - keep-tab-open instruction;
   - successful recovery clears/replaces warning;
   - copied diagnostics distinguish socket/liveness/resynchronization;

3. Sage known failure:
   - no indefinite spinner;
   - visible retry/failure state;
   - Sage support code;
   - copied diagnostics identify canonical/visible Sage lifecycle state;

4. one broader coordinator degradation:
   - visible subsystem-level code rather than a generic screenshot-only failure;
   - bounded support report remains available.

5. student reporting workflow:
   - **Report this problem** opens the support modal;
   - configured support address is displayed without relying on `mailto:`;
   - **Generate & Copy Report** produces a bounded allowlisted report;
   - no tokens, secrets, full page-state dumps, or answer contents are copied;
   - the student can paste the result directly into ordinary email/webmail.

6. hard-reload guidance:
   - instructions explicitly distinguish a true hard reload from ordinary
     browser Refresh;
   - MathJax and persistent Sage paths present the correct hard-reload guidance;
   - active state/WebSocket disconnect paths explicitly warn the student not to
     reload while unsaved work may be stranded.

The project can be considered a Phase 1 success when these common support cases
are handled coherently even though the broader TODO list remains open.

## 17. Explicit Phase 1 scope boundary

Do not let the final Phase 1 work expand into every valid follow-up discovered
during the runtime inventory.

The following are important but should remain later TODO/project work unless a
reproduced blocker shows they are required for the Phase 1 success criteria:

- full answer-submission transaction redesign;
- atomic acknowledgement for every state patch/completion;
- grouped-validator overhaul;
- broad optional-interactive terminality cleanup;
- coordinator aggregate statistics work;
- account/profile dropdown cleanup;
- WebSocket learner-state authorization;
- SIGTERM/SIGKILL container shutdown investigation;
- transient Mongo state-document disappearance investigation;
- the separate newly observed math-answer attachment degradation unless it
  reproduces as a common student-visible regression;
- broader Sage authorization hardening;
- removal of every legacy watchdog/comparison path;
- LRS retention/pruning work;
- unrelated dependency modernization.

The coordinator may still need small changes in these areas if they are directly
required to make a Phase 1 failure detectable, actionable, or supportable. Such
changes should remain narrow and justified by the success criteria above.

## 18. Other separate follow-up

Keep separate from the next coordinator patch:

- remove only the dead canonical-Sage `.env` entry later
- verify persistent `SAGECELL_PAGE_AUTH_SECRET` deployment configuration on each target
- post-rollout trusted-origin/exact-request Sage authorization hardening
- coordinator-only aggregate statistics workflow
- LRS retention/pruning and aggregate preservation
- account/profile dropdown cleanup
- investigate the test-page math-answer attachment degradation observed after
  the state purge experiment: five expected models resolved, but zero attached
  and five attachment failures were reported
- investigate why `podman restart devximserver` repeatedly fails to stop on
  SIGTERM within 10 seconds and falls back to SIGKILL

## 19. Operational rules

- verify host/branch/HEAD/staged/dirty state before edits
- use narrow guarded changes
- use `git --no-pager diff`
- run `git diff --check`
- run focused tests
- rebuild browser JS inside `devximserver` after browser-source changes
- verify host/container hashes
- browser-test the rebuilt bundle
- stage only explicit files
- commit only after review
- push only after explicit decision
- avoid recursive greps into generated bundles when narrow source-file grep is
  sufficient

## 20. Do not accidentally

- weaken the failed-initial-MathJax interaction block without evidence
- conflate canonical Sage computation and visible Sage settlement
- restore the legacy browser Sage executor
- treat canonical invariant failure as arbitrary-code authorization
- let an old explicit Sage Retry attempt overwrite a newer result
- leave known Sage failure represented only by a spinner
- erase timeout/failure history after safe recovery
- reconstruct the immutable Sage manifest from MathJax-mutated DOM
- remove `repositories/.env` as general cleanup
- print secrets
- treat activity bootstrap invocation as activity completion
- modernize Node/MathJax/dependencies inside lifecycle work
- call a browser-source patch validated before rebuilding `main.min.js`

## 21. Recovery summary

The Page Runtime Coordinator has progressed from passive observation to active
startup ownership and explicit initial MathJax/Sage/answer/state lifecycle
contracts.

The pushed checkpoint through `ea1d0aa` includes:

- canonical-only Sage and visible terminal Sage handling;
- reconciled initial math-answer lifecycle and same-operation repair;
- explicit initial-state terminal outcomes with a tested shared protocol helper;
- separate reconnect `state-resynchronization` semantics;
- an 18-second application heartbeat with immediate server pong;
- transport liveness diagnostics and clean heartbeat timer ownership;
- reconnect backoff reset after successful open.

The focused initial-state/coordinator regression set passes 83 tests. Browser
validation confirms first-state readiness, reconnect resynchronization, healthy
heartbeat, and backoff reset. The larger historical 95-test checkpoint remains
the latest broader Sage/answer/MathJax suite cited above; the current heartbeat
patch did not alter those feature algorithms.

The remaining Phase 1 goal is no longer broad runtime discovery. It is to turn
the coordinator's existing lifecycle knowledge into practical student recovery
and instructor support:

1. define the stable support/error taxonomy;
2. add standardized student-facing recovery banners for the common failure
   classes;
3. stabilize a bounded privacy-safe support report and copy-diagnostics path;
4. browser-test representative MathJax, state/WebSocket, Sage, and broader
   coordinator failures end to end.

Phase 1 is successful when the common "Xronos doesn't work" cases either tell
the student how to recover without contacting the instructor or, when contact is
still necessary, provide a visible subsystem-level support code and useful
diagnostic report.
