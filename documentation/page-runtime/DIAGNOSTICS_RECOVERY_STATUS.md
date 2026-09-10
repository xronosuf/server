# Diagnostics / Recovery Work Status

Date closed: 2026-09-09
Branch: `diagnostics-recovery`
Final live-validated application commit: `8e6bd61b48654bae03caa0edf69c1397cc3b04f5`

This document records the final status of the legacy Xronos stabilization program. The four-stage program is complete. Further legacy work should be undertaken only when it:

1. fixes a current operational defect;
2. adds diagnostics or recovery needed to support the legacy server safely; or
3. produces compatibility knowledge/tooling reusable by the replacement server.

No further Page Runtime Coordinator architecture is planned for its own sake.

## Stage 1 — reload-sensitive runtime hardening

Status: **complete and live-validated**.

Completed work includes latest-publication navigation, generation-versioned public and node_modules assets, retirement of legacy service-worker/cache paths, stale WebSocket recycling, bounded optional-interactive loading, removal of synchronous startup subpath discovery, and retirement of the obsolete Update UI.

The final A -> B browser acceptance used:

- A: `22ef78e29f3fbf637291bc4d34e4b482d00df950`
- B: `8e6bd61b48654bae03caa0edf69c1397cc3b04f5`

Observed behavior:

- a page loaded while A was live reported A in its application-version meta tag and loaded A-version public/MathJax resources;
- after B was deployed, the untouched open tab remained internally on A with 29 A-version resources still associated with that page;
- a plain browser reload moved the page to B;
- the reloaded page used B-version public assets and the B-version MathJax tree;
- filtering the new navigation for A-version public/node_modules resources returned an empty list.

This is the intended contract: already-open pages remain stable, while a normal reload/navigation receives the current publication and its corresponding resources.

## Late Canvas passback policy

Status: **implemented and verified**.

The late-passback work remains a prerequisite for trustworthy grade-sync status and diagnostics. The policy uses Canvas `untilDate` when available, applies the documented fallback horizon otherwise, reads the current Canvas result before late writes, never knowingly lowers the current effective Canvas grade, and learns late-policy evidence only from authoritative immediate post-write reads.

The targeted late-grade regression suite remains at **33 passing**.

Manual Canvas testing established that later LTI passback can replace a manually entered grade. Legacy Xronos does not attempt heuristic manual-grade provenance detection through the LTI 1.1 interface; the non-lowering invariant remains the safety rule.

## Test Student reset utility

Status: **implemented and verified**.

`scripts/reset-student-data.js` remains the supported guarded reset utility for repeated Test Student work and rare support resets. It is dry-run by default and preserves the user identity while removing disposable learner/bridge state when executed.

## Stage 2 — Canvas grade-sync indicator

Status: **complete and live-validated**.

Student-facing states are:

- `Grade sync connected`
- `Grade sync not connected`
- `Grade sync closed`
- `Checking grade sync`
- `Grade sync unavailable`

The indicator is based on real assignment-specific Mongo/Redis passback evidence rather than request-local placeholders. Usable open transport states collapse to the student-facing connected state while detailed evidence remains available to diagnostics.

## Stage 3 — grade-sync diagnostics

Status: **complete and live-validated**.

Diagnostics distinguish exact assignment/context/resource matches, same-context different-assignment cases, same-page different-context cases, missing launch metadata, unavailable current-launch reference, queue failures, and no matching bridge without exposing LTI secrets or full launch payloads.

Support reports include the deployed application version, bounded browser/environment context, sanitized grade-sync diagnostics, and bounded recovery-event history.

## Stage 4 — student recovery

Status: **complete and live-validated**.

Stage 4 contains two separate recovery families.

### Grade-sync recovery

Live browser validation covered all intended policy branches:

- healthy connection: no unnecessary recovery action;
- transient/unavailable verification: `Recheck grade sync` reads current state without resubmitting a grade and refreshes the UI;
- missing/stale/wrong launch: `Reopen this assignment from Canvas` and `Show Canvas reconnect steps` correctly explain that a fresh launch of the exact Canvas assignment is required;
- closed passback window: `Grade sync closed` explicitly explains that reopening from Canvas does not reopen the window and offers support/reporting rather than a false self-recovery action.

The grade-sync/recovery targeted regression suite remains at **65 passing**.

### General page/browser recovery

`Repair this page` is implemented as first-line troubleshooting for reload-safe runtime failures. It intentionally does not claim to perform a browser hard refresh.

The recovery path:

- cleans legacy Xronos service-worker/Cache Storage state;
- performs a one-shot same-page repair navigation;
- applies cache-only `Clear-Site-Data` and no-store response headers;
- propagates a repair token through primary public resources;
- uses a path-based repair namespace for dynamically loaded MathJax resources;
- returns to ordinary versioned resource URLs after the repaired navigation.

Live browser validation confirmed that the document, CSS, bundled JS, MathExpressions, branding resources, and dynamically loaded MathJax tree all used the same repair generation and returned HTTP 200. After a deliberately blocked Sage failure was unblocked, `Repair this page` restored the page to normal in approximately 3–5 seconds.

The MathJax repair-namespace correction is commit:

`8e6bd61b48654bae03caa0edf69c1397cc3b04f5`

The page-repair regression suite is **18 passing** at closeout.

## Final regression/acceptance state

At closeout:

- page-repair regression: **18 passing**;
- grade-sync/recovery regression: **65 passing**;
- late-grade regression: **33 passing**;
- Stage 1 A -> B browser freshness acceptance: passed;
- Stage 2 live Canvas/browser acceptance: passed;
- Stage 3 diagnostic/support-report acceptance: passed;
- Stage 4 grade-sync recovery policy acceptance: passed;
- Stage 4 general page-repair acceptance: passed.

See `FOUR_STAGE_STABILIZATION_CLOSEOUT.md` and `STAGE4_LIVE_RECOVERY_VALIDATION.md` for the final closeout and live-validation summaries.
