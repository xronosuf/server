# Stage 4 Live Recovery Validation

Date: 2026-09-09

Stage 4 recovery was live-tested on the separate Xronos test VM after deployment of commit:

`b293dd09c5a5fc93b829e91b8b5d6d56e4f0fa4b`

## Healthy path

A Test Student Canvas launch with an exact assignment/context/resource match showed:

- `Grade sync connected`;
- no recovery buttons in the help modal;
- grade-sync support report schema version 2;
- deployed application version present;
- `recoveries: []` before any recovery action.

This confirms Stage 4 does not add distracting recovery UI to an already healthy connection.

## Recheck-status recovery path

The browser's normal gradebook request was intentionally blocked to force the student-facing state to `Grade sync unavailable`. The help modal then correctly offered `Recheck grade sync`.

After request blocking was removed, the student clicked `Recheck grade sync`.

Observed behavior:

- the live grade-sync pill returned to green / `Grade sync connected`;
- the recovery request read current server evidence and returned a healthy usable state;
- a bounded recovery event was recorded server-side;
- the copied support report contained the matching recovery event correlation;
- the read-only support CLI retrieved the same event;
- the recovery event remained available after application-container replacement.

The first live event was:

`67198c19-2025-44c1-b8b0-90fe12d59c58`

with action:

`recheck-status`

The first live recheck exposed one UI issue: the modal was built from the old unavailable state and remained visually stale even though the pill had recovered. Commit `b293dd09c5a5fc93b829e91b8b5d6d56e4f0fa4b` corrected this by closing the help modal after a successful recheck so reopening help reconstructs it from fresh status.

A second live browser test confirmed the corrected behavior:

1. gradebook request blocked;
2. pill changed to `Grade sync unavailable`;
3. help modal offered `Recheck grade sync`;
4. request unblocked;
5. recheck clicked;
6. modal closed immediately;
7. pill returned to green / connected.

## Regression state

After the modal-refresh repair:

- grade-sync / recovery targeted regression: 65 passing;
- late-grade targeted regression: 33 passing.

## Remaining Stage 4 live validation

The remaining policy branches to exercise are:

- missing/stale/wrong launch guidance (`relaunch-from-canvas`);
- closed passback-window behavior (`contact-support`, no false self-recovery option).

No automatic grade passback, bridge deletion/recreation, state clearing, or forced page reload is part of Stage 4 recovery.
