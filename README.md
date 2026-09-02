# Xronos / Ximera Server

This repository contains the Ximera server used by Xronos deployments.

The codebase includes the Node/Express server, browser runtime, Pug templates,
stylesheets, operational scripts, tests, and deployment configuration needed by
the Xronos server. Course repositories/content are separate from this source
tree.

## Current maintainer documentation

Start with the document that matches the work being performed:

- `documentation/CLEANUP_CLOSEOUT.md` — completed repository cleanup, retained
  compatibility boundaries, and deferred projects.
- `documentation/page-runtime/IMPLEMENTATION_STATUS.md` — factual Page Runtime
  Coordinator implementation status.
- `documentation/page-runtime/CURRENT_PIPELINE.md` — current browser/runtime
  execution pipeline.
- `documentation/page-runtime/RUNTIME_OWNERSHIP_MATRIX.md` — lifecycle
  ownership and dependencies.
- `documentation/page-runtime/TODO.md` — durable deferred/follow-up work.
- `SAGECELL.md` — Xronos-to-SageCell proxy, service selection, caching, and
  current standalone SageCell workflow.
- `public/branding/README.md` — institutional branding asset organization.

The older
`documentation/page-runtime/Xronos_Page_Runtime_Coordinator_CURRENT_HANDOFF.md`
is retained as the closeout handoff for the Page Runtime Coordinator project.
Its original branch/checkpoint history is useful context, but the current
repository has since integrated that work and completed a separate cleanup
project.

## Repository cleanup status

The dead-code/repository cleanup project is complete at cleanup checkpoint
`873e86c50d477f5de2e685759a19d4f99ef98d30`.

The cleanup removed obsolete runtime subsystems, unused templates/assets,
historical deployment material, dead commented implementations, and transitive
orphans while preserving active compatibility surfaces.

See `documentation/CLEANUP_CLOSEOUT.md` for the detailed scope and exceptions.

## SageCell

The old SageCell build/deployment tree embedded in this repository has been
retired.

Xronos continues to proxy Sage requests to a configured SageCell service, but
SageCell image/build maintenance now belongs in the standalone
`xronosuf/sagecell-server` repository.

See `SAGECELL.md` before changing Sage routing, caching, fallback behavior, or
container operation.

## Legacy retired activity routes

Xronos contains a small explicit deny-list for historical activity URLs that
were accidentally published and should no longer resolve.

In September 2026, an early publication of the consolidated `mac2233`
repository was made before four section xourse files were placed at their
intended paths. This created valid-looking but incorrect public aliases under:

- `/mac2233/Limits/`
- `/mac2233/ApplicationsOfDerivatives/`
- `/mac2233/TheoryOfDerivatives/`
- `/mac2233/Integration/`

The supported publications use these prefixes instead:

- `/mac2233/limitsSection/Limits/`
- `/mac2233/applicationsOfDerivatives/ApplicationsOfDerivatives/`
- `/mac2233/theoryOfDerivatives/TheoryOfDerivatives/`
- `/mac2233/integrationSection/Integration/`

The bad aliases can resolve to the same underlying activity blobs as the
correct paths, so deleting publication blobs is not an appropriate cleanup.
They are therefore rejected explicitly before normal activity resolution.

This deny-list records specific historical mistakes only. Do **not** infer from
it that every activity must have an associated xourse, and do not generalize
the implementation into such a publication rule. Future publication
architecture, including Modulus, may use different routing semantics.

## Build/runtime note

The current server still depends on a historical base-image / preinstalled
`node_modules` arrangement. The root `Dockerfile` layers this repository onto
that base environment.

Do not interpret that legacy build foundation as permission to delete runtime
dependencies or rewrite package metadata during unrelated maintenance.
Dependency/version modernization is intentionally a separate project.

For the development/test deployment, validate browser builds and runtime tests
inside the actual Xronos development container rather than assuming the host
Node/npm environment matches the application environment.

## Change discipline

For significant maintenance:

1. verify host, repository, branch, commit, and clean worktree;
2. inventory/reachability-check before deleting code;
3. keep edits to one logical scope;
4. run syntax/template/tests appropriate to the affected subsystem;
5. verify the exact changed-file set and `git diff --check`;
6. commit/push only after validation; and
7. keep production rollout separate from test-branch development.

Historical compatibility, alternate authentication, institutional examples,
operational scripts, browser entry points, and special template render paths
should not be removed solely because a simple static search reports no inbound
module edge.
