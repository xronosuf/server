# Stage 4 — Repair this page

## Purpose

Stage 1 reduces the chance that a learner remains on stale Xronos application
or publication resources. Stage 4 still needs a student-driven first recovery
step for cases where answer boxes, mathematics, buttons, or other runtime
content appear stale, corrupted, or incompletely initialized.

The student-facing action is **Repair this page**.

It belongs in the unified runtime error banner before **Report this problem**.
It is deliberately separate from Canvas grade-sync recovery.

## Student wording

The recovery action should explain that Xronos will reload the activity using
fresh Xronos page resources. It must not claim to perform a browser "hard
refresh" or to clear every category of browser data.

## Recovery sequence

When the learner chooses **Repair this page**:

1. Xronos records a bounded repair-attempt marker in `sessionStorage` so a
   later support report can show that repair was already attempted.
2. Xronos unregisters historical Xronos service workers and deletes Cache
   Storage through the existing Stage-1 cleanup helper.
3. Xronos generates a one-shot random recovery token.
4. The browser navigates to the same activity path with `xronosRepair=TOKEN`.
5. The dynamic page response sends:
   - `Clear-Site-Data: "cache"`;
   - `Cache-Control: private, no-store, max-age=0, must-revalidate`;
   - legacy `Pragma` / `Expires` no-cache safeguards.
6. That response exposes the validated recovery token to the shared layouts.
7. The response-local `versionPath()` appends the token to versioned
   `/public/` and `/node_modules/` resources, creating unique resource URLs for
   the one-shot recovery load.
8. MathJax's dynamic versioned resource root receives the same token.
9. Existing query canonicalization removes the recovery query from the visible
   address after the page has loaded; future ordinary navigation returns to
   normal application-version URLs.

The combination is intentionally defense-in-depth. Browsers supporting
`Clear-Site-Data: "cache"` can clear their HTTP cache for the Xronos origin;
the unique top-level and critical-resource URLs also avoid depending on a
previously cached response during the recovery load.

## Data that Repair this page does NOT clear

The action must not clear or mutate:

- cookies or authentication state;
- `localStorage` or `sessionStorage` wholesale;
- IndexedDB or arbitrary browser storage;
- Xronos Mongo learner State;
- Completion or ProgressMilestone records;
- Canvas grades;
- LTI bridges or sourcedids;
- SageCell server caches;
- course publications or repository history.

Only the small `xronosPageRepair` session-storage marker is written by the
browser recovery helper.

## Unsafe-to-reload states

The unified support banner already has states that tell the learner to keep the
page open because work may be unsaved or the state connection is reconnecting.
**Repair this page must not be offered in those states.** The existing
save-safety guidance wins.

## Support reporting

Page-runtime support-report schema version 2 adds an allowlisted `pageRepair`
object containing only:

- recovery token;
- requested timestamp;
- page path.

No arbitrary session-storage data is copied into reports.

## Validation target

A browser acceptance test should prove that a repair request:

- reaches the server with a unique token;
- receives `Clear-Site-Data: "cache"` and `Cache-Control: no-store`;
- renders the same token in page metadata;
- requests `main.min.js`, CSS, and MathJax resources with the recovery token;
- canonicalizes the visible activity URL after load;
- restores the activity from normal saved learner state;
- records the repair attempt in a subsequent support report if the error
  persists;
- does not log the learner out or alter Canvas/LTI state.
