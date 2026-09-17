# Instructor settings framework

## Purpose

The instructor settings framework stores LMS-course-shell configuration that instructional staff can manage from Xronos. The current implementation is driven by validated LTI launches and the UI is named **Canvas Integration Settings**, because Canvas is the LMS currently used for this workflow.

The storage layer is intentionally more general: an LMS course context means a specific course shell, such as one Canvas course shell or one Blackboard course shell. Settings belong to that shell, not to an individual instructor.

An instructor or teaching assistant is an authorized editor. Instructor identity is audit metadata only and is never part of settings identity or resolution.

## Authoritative LMS identity

Global shell settings are keyed by:

- `toolConsumerInstanceGuid`
- `contextId`

A global settings document is created only from a persisted `LtiBridge` produced by the validated LTI authentication flow. Merely having context-looking strings on a Xronos user, request, or session is not sufficient.

`bridgeHasAuthoritativeLtiContext()` additionally requires the persisted bridge identity, LTI identifier, OAuth consumer key, LMS instance GUID, and LMS context ID.

Ordinary Xronos users who did not arrive through a legitimate LTI launch therefore do not create instructor-settings documents.

The first valid launch for a shell may be a learner launch. Instructor participation is not required to create the shell defaults.

## Storage

Collection: `instructorSettings`

Each settings document has a scope. The global record has:

```text
toolConsumerInstanceGuid
contextId
scope = global
repository = null
path = null
settings = {...}
fallbackGradeSyncEndAt
createdAt
updatedAt
updatedBy
```

The unique identity is:

```text
(toolConsumerInstanceGuid, contextId, scope, repository, path)
```

This supports future page-local documents keyed by the same LMS shell plus repository/path without storing all page overrides in one ever-growing shell document.

Local records are **not** created preemptively. A future local record should exist only when a real page override needs storage.

The `settings` payload is sparse and definition-driven. A local-only document must not receive defaults for unrelated global-only settings.

## Audit metadata

- `createdAt`: when the settings document was created.
- `updatedAt`: creation time initially; later changed only when a setting is changed.
- `updatedBy`: null for automatically created defaults; the Xronos user ID of the instructional staff member who later changed a setting.

This is lightweight debugging/audit metadata, not a full append-only history. A separate audit-event collection can be added later if full change history becomes useful.

## Settings definitions

`lib/instructor-settings.js` owns the definitions table. Each setting declares its supported scopes, default value, and allowed values.

The first setting is:

```text
gradeSyncCutoff
scopes: global only
default: late-policy
allowed: late-policy, due-date
```

The user-facing control is **Stop grade sync at the due date**:

- Off -> `late-policy`
- On -> `due-date`

The setting is deliberately unavailable at page scope. The **This Page** control is gray/non-interactive rather than pretending that Off or Inherit has meaning.

## Grade-sync fallback horizon

When a global settings document is first created, Xronos stores:

```text
fallbackGradeSyncEndAt = createdAt + 130 days
```

This is an intentionally simple semester-sized emergency fallback. It does not attempt to reconstruct the real semester start date.

For a materialized bridge:

### `late-policy`

1. Use Canvas `untilDate` when present.
2. Otherwise use the shell's fixed `fallbackGradeSyncEndAt`.

### `due-date`

1. Use Canvas `dueDate` when present.
2. Otherwise use the shell's fixed `fallbackGradeSyncEndAt`.

Window-source diagnostics distinguish:

- `canvas-until`
- `xronos-due-date-setting`
- `shell-fallback`

Bridges that predate this rollout and have not yet been refreshed retain the historical late-grade fallback temporarily (`untilDate`, else due date + 130 days, else no end). A validated LTI launch materializes the shell policy onto that bridge.

## Why policy is materialized onto LTI bridges

The authoritative configuration lives in `instructorSettings`, but grade passback is processed by background workers with no browser request or LMS-launch session.

To preserve the existing synchronous grade-policy call graph, the current shell policy is materialized onto every bridge as:

```text
gradeSyncCutoff
fallbackGradeSyncEndAt
```

On first shell-settings creation, existing bridges for that shell are populated. On a later validated launch, the current bridge is refreshed. When an instructor changes a global setting, all bridges in that LMS shell are updated.

This lets the existing `late-grade-policy`, gradebook queue/write path, grade-sync status, and diagnostics resolve one consistent window without introducing a parallel asynchronous gradebook mechanism.

## Instructor authorization

Reading or changing settings requires:

1. an authenticated Xronos user;
2. a current LTI launch reference in the authenticated session;
3. the referenced bridge to belong to that user;
4. exact agreement between launch reference and persisted bridge for bridge ID, LMS instance, LMS context, resource link, repository, and path;
5. an authoritative persisted LTI context;
6. a current `Instructor` or `TeachingAssistant` role from the bridge roles refreshed by the LTI launch.

The API does not trust shell/context identifiers supplied by the browser.

The menu item is hidden until the current-settings endpoint succeeds. Hiding the UI is convenience only; the server performs the authorization independently.

## UI

Modal title: **Canvas Integration Settings**

Columns:

- **This Page** — page-specific settings when supported.
- **All Xronos Content** — all Xronos content launched from this specific LMS course shell, not all Xronos content everywhere.

Question-mark help text explains both scopes.

The grade-sync setting currently has an unavailable This Page cell and an Off/On global segmented switch.

Changes autosave after a one-second debounce. The browser shows `Change pending`, then `Saving`, then `Saved` only after the server confirms the canonical state. Sequence checks prevent an older response from overwriting a newer rapid selection.

## Test-server validation checklist

Before rollout:

1. Run the full Mocha suite and the instructor-settings policy/contract tests.
2. Run the normal JS/CSS build.
3. Launch a learner from a fresh Canvas shell and verify exactly one global `instructorSettings` document is created with default `late-policy`, null `updatedBy`, timestamps, and a 130-day fallback horizon.
4. Verify a normal non-LTI Xronos visit creates no instructor-settings document.
5. Launch an instructor from that same shell and verify the Canvas Integration Settings menu appears only after the authorized settings probe succeeds.
6. Toggle **Stop grade sync at the due date** and verify the UI autosaves and `updatedAt`/`updatedBy` change.
7. Verify every bridge in the same LMS shell receives the materialized policy while another Canvas shell remains unchanged.
8. Verify the This Page control is gray and non-interactive for this setting.
9. Verify due-date mode closes passback at `dueDate`, even when Canvas has a later `untilDate`.
10. Verify late-policy mode uses `untilDate` when present and the shell fallback otherwise.
11. Verify status/diagnostics report the same resolved window source as the actual gradebook worker.
12. Verify learner requests to the settings API are rejected.
13. Verify an instructor launch reference from another shell/resource link cannot edit this shell.
14. Run existing late-grade, grade-sync, recovery, page-repair, and Sage/heartbeat regressions before production rollout.
