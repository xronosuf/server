# Stage 4 integration checkpoint

Stage 4 student grade-sync recovery source is integrated on the
`diagnostics-recovery` branch but is not yet deployed to the test application.

Integrated source commit:

`5cc86e7e38bc1d91d00ea40bbd219e201d8e1116`

Verified before deployment:

- non-mutating recovery preflight passes without changing operational source;
- grade-sync/recovery regression: 64 passing;
- late-grade regression: 33 passing;
- guarded integration changes exactly `app.js` and
  `public/javascripts/gradebook.js`;
- integration patcher is idempotent;
- browser recovery path contains no grade-queue mutation;
- running test application remains the live-validated Stage 3 image
  `localhost/xronos-server:15a76a9` with marker
  `15a76a9dff0dd4df221cb588a653c9c6c558a6e4`.

Student recovery policy:

- healthy/open grade sync: no recovery action;
- closed grade-passback window: contact instructor/support, no fake recovery;
- transient/unavailable verification state: read-only **Recheck grade sync**;
- missing/stale/wrong Canvas launch identity: **Show Canvas reconnect steps**
  directing the student through the exact Canvas assignment link.

Recovery actions do not submit grades, create/delete LTI bridges, clear saved
state, or force a page reload. Each accepted recovery action records a bounded
privacy-safe recovery event with 90-day TTL. Grade-sync support reports use
schema version 2 and may include up to five recent recovery correlations so a
student report can be matched to server-side recovery history.

Support can inspect recovery history with the read-only
`scripts/grade-sync-recovery-report.js` command.

Next checkpoint: build/deploy the integrated Stage 4 source to the test VM,
validate the healthy browser path, then deliberately exercise recovery-event
recording and disconnected/relaunch cases on Test Student before Stage 4 is
considered complete.
