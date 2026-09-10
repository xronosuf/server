# Four-Stage Legacy Stabilization Closeout

Date: 2026-09-09
Branch: `diagnostics-recovery`
Final live-validated application commit: `8e6bd61b48654bae03caa0edf69c1397cc3b04f5`

## Purpose

This document formally closes the four-stage legacy Xronos stabilization program. The project was intended to reduce hard-reload-dependent failures, make Canvas grade-sync state truthful and supportable, add diagnostics for failure cases, and provide bounded student self-recovery without turning the legacy server into an open-ended redesign project.

The four stages are now complete and live-validated.

## Final scope boundary

Further legacy Xronos work should be undertaken only when it satisfies at least one of these conditions:

1. it fixes a current operational defect;
2. it adds diagnostics or recovery needed to operate/support the legacy server safely; or
3. it produces compatibility knowledge/tooling that is reusable by the replacement server.

No further Page Runtime Coordinator architecture should be pursued for its own sake.

## Stage 1 — reduce problems previously fixed by hard reload

**Closed: complete and live-validated.**

The stabilization work removed or reduced major reload-sensitive failure modes by introducing current-publication navigation, application-generation resource paths, cache-safe static-resource behavior, retirement of legacy browser caches/service workers, stale-WebSocket recovery, and runtime initialization hardening.

Final A -> B acceptance used application versions:

- A: `22ef78e29f3fbf637291bc4d34e4b482d00df950`
- B: `8e6bd61b48654bae03caa0edf69c1397cc3b04f5`

A page loaded under A remained internally stable after B was deployed. A plain browser reload then moved the page to B and loaded B-version public and MathJax resources. The new navigation contained no A-version public/node_modules resources.

This validates the intended publication contract: existing tabs remain coherent while reload/navigation receives the current generation.

## Stage 2 — truthful Canvas grade-sync indicator

**Closed: complete and live-validated.**

The student-facing grade-sync pill now reports assignment-specific connection state based on actual Xronos/Canvas bridge and Redis queue evidence.

The supported student states are:

- `Grade sync connected`
- `Grade sync not connected`
- `Grade sync closed`
- `Checking grade sync`
- `Grade sync unavailable`

Usable transport states are deliberately collapsed to the simpler connected presentation while detailed transport evidence remains available to diagnostics.

## Stage 3 — grade-sync diagnostics and support reporting

**Closed: complete and live-validated.**

The server now distinguishes important launch/passback cases including exact matches, same-context different-assignment cases, same-page different-context cases, missing launch metadata, unavailable current-launch reference, unavailable queue evidence, and no matching bridge.

The student/support report is bounded and privacy-safe: it includes deployed application version, sanitized grade-sync evidence, limited browser/environment information, and bounded recovery history without exposing LTI sourcedids, OAuth credentials, outcome URLs, cookies, or full launch payloads.

## Stage 4 — student self-recovery

**Closed: complete and live-validated.**

Stage 4 has two distinct recovery tracks.

### Grade-sync recovery

Live browser acceptance covered:

- healthy connection: no recovery UI when none is needed;
- transient/unavailable verification: `Recheck grade sync`, which rereads current status without resubmitting a grade;
- missing/stale/wrong assignment launch: `Reopen this assignment from Canvas` plus exact reconnect guidance;
- closed passback window: no false self-recovery; student is directed to support/reporting and told that reopening from Canvas does not reopen the closed window.

### General page/browser recovery

`Repair this page` is the first-line recovery action for reload-safe runtime failures. It uses a one-shot repair navigation with fresh Xronos-controlled resources, cache-only site-data clearing, no-store recovery responses, and a path-based repair namespace for dynamically loaded MathJax resources.

Live testing deliberately induced a Sage runtime failure, exercised the repair control, verified HTTP 200 responses for the repaired document/public/MathJax resource tree, and then confirmed that once Sage was unblocked the same control restored the page to a stable working state in approximately 3–5 seconds.

The final MathJax repair namespace correction is application commit:

`8e6bd61b48654bae03caa0edf69c1397cc3b04f5`

## Related Canvas late-passback work

The late-passback safety work was completed as a prerequisite for trustworthy Stage 2/3 behavior. Legacy Xronos reads current Canvas state before potentially risky late writes and follows the invariant:

> Xronos should never replace a Canvas grade with a lower grade, under any circumstances.

Only authoritative immediate post-write Canvas reads are allowed to teach deduction/floor behavior. Manual-grade provenance cannot be reliably inferred through the current LTI 1.1 interface, so no heuristic manual-grade suppression was added.

## Final regression state

At closeout:

- page-repair regression: **18 passing**;
- grade-sync/recovery regression: **65 passing**;
- late-grade regression: **33 passing**.

Live acceptance also passed for:

- Stage 1 A -> B publication/resource freshness;
- Stage 2 Canvas grade-sync presentation;
- Stage 3 diagnostic/support reporting;
- Stage 4 healthy/recheck/relaunch/closed grade-sync branches;
- Stage 4 general page repair including repaired MathJax loading.

## Operational test-state cleanup

The separate test VM contains disposable/non-production learner data. Controlled tests temporarily altered the Test Student bridge path and `untilDate` to exercise recovery-policy branches. Those values should be returned to a normal usable state after closeout so future test sessions do not begin from a deliberately abnormal condition.

The normal bridge values used for closeout are:

- repository: `testsuite`
- path: `test-suite-xourse`
- `untilDate`: `2026-10-01T03:59:59Z`

A reset/verification of this disposable test state is operational cleanup only; it does not change the source-code closeout status.

## Closeout decision

The four-stage stabilization project is complete. Future work should be treated as maintenance/support or replacement-server compatibility work, not continuation of this stabilization project, unless a newly discovered operational defect requires reopening a specific area.
