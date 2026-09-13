# Page Repair Integration Checkpoint

Status: **repo-side implementation prepared; operational patch not yet applied or deployed**.

Prepared on `diagnostics-recovery` after live validation of the Stage-4
`recheck-status` grade-sync recovery path.

## Prepared components

- `lib/page-repair.js`
  - validates the one-shot `xronosRepair` token;
  - sends only `Clear-Site-Data: "cache"` for repair responses;
  - makes the repair page response non-cacheable;
  - creates a response-local `versionPath()` that appends the one-shot token.
- `public/javascripts/page-repair.js`
  - creates a random repair token;
  - records a bounded last-attempt marker in `sessionStorage`;
  - unregisters historical service workers and clears Cache Storage through the
    existing Stage-1 helper;
  - navigates to the same activity with the repair token;
  - proceeds even when browser storage or legacy-cache cleanup is unavailable.
- `scripts/modernization/apply-page-repair-integration.js`
  - guarded/idempotent operational patcher;
  - targets only `app.js`, both shared layouts, the application-version path
    helper, MathJax root setup, page-runtime support report, and page-runtime
    support UI.
- `scripts/run-page-repair-regression.sh`
  - dedicated pure/integration regression runner.
- `scripts/run-page-repair-preflight.sh`
  - non-mutating generated-integration preflight.
- `documentation/page-runtime/PAGE_REPAIR_DESIGN.md`
  - behavioral, privacy, and browser-cache boundary.

## Intended student flow

For reload-safe runtime failures the unified banner shows:

1. subsystem-specific retry when available (for example Sage retry);
2. **Repair this page**;
3. **Report this problem**.

The repair action is suppressed when the current support policy says the page
must remain open because work may be unsaved or the state connection is still
reconnecting.

## Safety boundary

The repair action does not clear cookies, broad browser storage, Mongo learner
state, completions, Canvas grades, LTI bridges, repository publications, or
SageCell server caches.

The server uses `Clear-Site-Data: "cache"` only. No `cookies`, `storage`, or
wildcard directive is permitted by the preflight.

## Next step

Run the guarded non-mutating preflight on the test VM, apply the patcher only if
it passes, verify the exact operational diff allowlist, run page-repair plus
existing grade-sync/late-grade regressions, then build/deploy and perform a
browser acceptance test from a deliberately triggered runtime error banner.
