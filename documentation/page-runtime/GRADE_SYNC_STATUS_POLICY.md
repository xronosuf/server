# Grade-sync status policy

This document records the Stage 2/3 policy for the legacy Xronos grade-sync indicator and diagnostics.

## Student-facing question

The grade-sync pill should answer one practical question:

> Is this Xronos assignment currently connected in the way required for progress to reach this Canvas assignment?

The pill is intentionally not a transport-debug display. Students should not need to distinguish a passback-capable bridge from a queued grade update or an already-accepted Canvas score.

## Student-facing states

The primary pill vocabulary is:

- `Grade sync connected`
- `Grade sync not connected`
- `Grade sync closed`
- `Checking grade sync`
- `Grade sync unavailable`

Detailed internal states such as passback-ready, passback-pending, and passback-accepted remain useful evidence for support and diagnostics, but collapse to `Grade sync connected` for the student-facing pill.

## Meaning of connected

`Grade sync connected` means Xronos has a currently usable assignment-specific Canvas grade-passback pathway for the learner and Xronos page being viewed.

An accepted Canvas passback is stronger evidence that the whole path has worked, but it is not required for the student-facing pill to be green. Requiring an already-accepted score would create false negatives during normal queue/debounce/retry windows.

## Meaning of not connected

`Grade sync not connected` means Xronos does not currently have a usable grade-passback pathway for this assignment. Typical underlying reasons include no matching bridge or a bridge missing required passback fields.

Student-facing wording should advise returning to Canvas and opening this assignment from its Canvas link. Diagnostic wording must not claim that the learner never launched from Canvas merely because no matching bridge record exists.

## Meaning of closed

`Grade sync closed` is distinct from `not connected`.

It means Xronos has Canvas grade-sync information for this assignment, but the grade-passback window that the legacy server actually enforces is closed. Reopening Xronos from Canvas will not by itself reopen that window.

This distinction is important because relaunch advice is appropriate for a missing connection but misleading when the assignment is already closed.

## Current legacy closure behavior

The current legacy gradebook implementation uses `bridge.dueDate` as the passback-open boundary:

- `bridgeIsOpen()` returns false once `dueDate < now`;
- `queueBridge()` caps the queue time at `dueDate`;
- gradebook recording silently skips passback once `bridgeIsOpen()` is false.

The LTI bridge also stores `untilDate` from Canvas `custom_lock_at`, but the current passback-open check does not use `untilDate`.

Stage 2 should therefore report the server's actual current behavior rather than silently changing due/lock semantics. Whether the legacy passback policy itself should use `untilDate`, `dueDate`, or a combination is a separate operational policy decision and should be tested explicitly before changing it.

## Diagnostic layer

Stage 3 diagnostics may expose richer evidence, including:

- exact matching bridge recorded;
- same Canvas context but different resource link;
- same Xronos page but different Canvas context;
- bridge missing launch/passback metadata;
- no matching bridge recorded;
- passback-capable bridge;
- queued/retried passback;
- Canvas-accepted passback;
- passback window closed;
- relevant recorded due/lock timestamps.

Use privacy-safe retained bridge metadata only. Do not store or expose full LTI launch POST bodies, OAuth secrets, cookies, authorization headers, or unrelated PII.

## Support wording

Absence of a matching bridge is evidence about Xronos records, not proof of learner behavior. Prefer wording such as:

> No matching LTI bridge creation is recorded for this assignment.

Avoid:

> You never launched from Canvas.
