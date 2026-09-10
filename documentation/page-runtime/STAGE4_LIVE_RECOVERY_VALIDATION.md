# Stage 4 Live Recovery Validation

Date completed: 2026-09-09
Final live-validated application commit: `8e6bd61b48654bae03caa0edf69c1397cc3b04f5`

Stage 4 recovery was exercised end to end on the separate Xronos test VM using the Canvas Test Student workflow and controlled browser/server fault injection.

## Healthy grade-sync path

A Test Student Canvas launch with an exact assignment/context/resource match showed:

- `Grade sync connected`;
- no unnecessary recovery buttons in the help modal;
- grade-sync support report schema version 2;
- deployed application version present;
- no recovery event before an action was attempted.

This confirms Stage 4 does not add distracting recovery UI to an already healthy connection.

## Recheck-status recovery path

The browser's normal gradebook request was intentionally blocked to force the student-facing state to `Grade sync unavailable`. The help modal correctly offered `Recheck grade sync`.

After request blocking was removed, the student clicked `Recheck grade sync`.

Observed behavior:

- the live grade-sync pill returned to `Grade sync connected`;
- the recovery request read current server evidence without resubmitting a grade;
- a bounded recovery event was recorded server-side;
- the copied support report contained the matching recovery event correlation;
- the read-only support CLI retrieved the same event;
- the recovery event remained available after application-container replacement.

The first live event was `67198c19-2025-44c1-b8b0-90fe12d59c58` with action `recheck-status`.

The first live recheck exposed a stale-modal UI issue. Commit `b293dd09c5a5fc93b829e91b8b5d6d56e4f0fa4b` corrected it by closing the modal after a successful recheck so reopening help rebuilds from fresh status. A second browser test confirmed the corrected behavior.

## Relaunch-from-Canvas guidance path

The Test Student bridge path was temporarily changed so the current Xronos page no longer matched an assignment-specific bridge. No Canvas relaunch was performed during the test.

After a normal reload:

- the pill showed `Grade sync not connected`;
- the help modal showed `Reopen this assignment from Canvas`;
- the modal explained that a fresh Canvas launch creates or refreshes the assignment-specific grade-sync connection;
- `Show Canvas reconnect steps` displayed instructions to open the exact assignment from its Canvas link;
- the instructions explicitly stated that refreshing only the existing Xronos page does not create a new Canvas assignment launch;
- the UI did not falsely claim that the guidance button repaired the connection.

This validates the `relaunch-from-canvas` recovery policy branch.

## Closed passback-window path

The Test Student bridge was restored to the normal Xronos path and its `untilDate` was temporarily moved into the past.

After a normal reload:

- the pill showed `Grade sync closed`;
- the help modal explained that Xronos had Canvas grade-sync information but the recorded passback window was closed;
- the modal explicitly stated that reopening the assignment from Canvas would not reopen the closed passback window;
- there was no `Recheck grade sync` button;
- there was no `Show Canvas reconnect steps` button;
- support contact and diagnostic-report generation remained available.

This validates the `contact-support` closed-window policy branch without offering a false student self-recovery action.

## General page/browser recovery

The Stage 4 page-recovery control is labeled `Repair this page` and is presented in reload-safe runtime error states before `Report this problem`. It is intentionally not described as a browser hard refresh.

The recovery design uses a one-shot `xronosRepair` token, legacy Xronos service-worker/Cache Storage cleanup, a cache-only `Clear-Site-Data` response, strong no-store headers, tokenized public resources, and a path-based repair namespace for dynamically loaded `node_modules` resources.

### Live browser validation

A Sage runtime failure was deliberately induced by blocking Sage in browser developer tools. The runtime error banner correctly offered `Repair this page`.

The repaired navigation propagated one token through:

- the document;
- `base.css`;
- shared branding CSS;
- `math-expressions_umd.js`;
- `main.min.js`;
- Xronos branding resources;
- the dynamically loaded MathJax tree.

An initial MathJax implementation incorrectly placed the token in the MathJax root query string, causing MathJax-appended paths to become part of the query value and return 404. The repair namespace was changed to the path form:

`/node_modules/v<version>/repair/<token>/mathjax/...`

Commit `8e6bd61b48654bae03caa0edf69c1397cc3b04f5` implements that correction.

Final browser validation showed all copied repair-token resource URLs returning HTTP 200, including MathJax config, input/output jax, TeX extensions, font data, accessibility extensions, and autoload resources.

With Sage unblocked, a subsequent `Repair this page` restored the deliberately broken page to a stable normal state in approximately 3–5 seconds.

The one earlier approximately 10–15 second repair occurred while the malformed MathJax repair URLs were generating repeated 404s; repeated tests after the namespace correction completed in approximately 3–5 seconds, so no additional cleanup-delay change was made.

## Final regression state

At Stage 4 closeout:

- page-repair regression: **18 passing**;
- grade-sync/recovery regression: **65 passing**;
- late-grade regression: **33 passing**.

## Result

Stage 4 is **complete and live-validated** across:

- healthy grade-sync behavior;
- transient read-only recheck recovery;
- missing/stale/wrong-launch guidance;
- closed passback-window handling;
- general page/browser repair.

No automatic grade passback, bridge deletion/recreation, broad browser-storage clearing, or forced Canvas relaunch is part of the student recovery UI.
