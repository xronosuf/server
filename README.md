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

The deny-list is implemented in `routes/page.js` as
`retiredActivityRoutePrefixes`. It is checked by
`activitiesFromRecentCommitsOnMaster` before normal repository/activity
resolution. Each entry is scoped to a repository name and contains one or more
case-sensitive path prefixes. If the requested repository and path match a
listed prefix, Xronos immediately renders the normal 404 response instead of
attempting activity resolution.

The current deny-list contains only these `mac2233` prefixes:

- `Limits/`
- `ApplicationsOfDerivatives/`
- `TheoryOfDerivatives/`
- `Integration/`

Equivalently, the retired public URL families are:

- `/mac2233/Limits/`
- `/mac2233/ApplicationsOfDerivatives/`
- `/mac2233/TheoryOfDerivatives/`
- `/mac2233/Integration/`

These aliases were created in September 2026 by an early publication of the
consolidated `mac2233` repository before four section xourse files were placed
at their intended paths. The supported publications use these prefixes instead:

- `/mac2233/limitsSection/Limits/`
- `/mac2233/applicationsOfDerivatives/ApplicationsOfDerivatives/`
- `/mac2233/theoryOfDerivatives/TheoryOfDerivatives/`
- `/mac2233/integrationSection/Integration/`

The bad aliases can resolve to the same underlying activity blobs as the
correct paths, so deleting publication blobs is not an appropriate cleanup.
They are therefore rejected explicitly before normal activity resolution.

### Maintaining the deny-list

To retire another known-bad historical route family, add the repository/path
prefix to `retiredActivityRoutePrefixes` in `routes/page.js`. Keep entries as
narrow as possible and prefer a specific historical prefix over a generalized
routing rule. After editing, verify both sides of the behavior: representative
retired URLs should return 404, while the intended/canonical URLs must continue
to return 200.

To restore a previously retired route family, remove only its corresponding
prefix from `retiredActivityRoutePrefixes`, rebuild/redeploy the application,
and verify that the route once again reaches normal activity resolution. If an
entire repository entry becomes empty, remove that repository key as well.

Changes to the deny-list require a new application image/deployment because
`routes/page.js` is baked into the Xronos application image; changing the Git
working tree alone does not modify the running server container.

When adding or removing an entry, also update this README so the documented
current list remains authoritative for maintainers. If a crawler or external
audit inventory explicitly lists the retired URLs, update that inventory too so
intentional 404s are not reported as regressions.

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
