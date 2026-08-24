# Xronos Server Cleanup Closeout

## Status

The repository cleanup project is complete in the `cleanup` branch at
`873e86c50d477f5de2e685759a19d4f99ef98d30`
(`Remove disabled unsaved-data warning`).

The cleanup was performed after the Page Runtime Coordinator work had already
established the current runtime architecture. Its purpose was not to redesign
working features. It was to remove code, assets, deployment material, and
historical implementation paths that were no longer part of the supported
Xronos server while preserving active compatibility surfaces.

The production math-answer hotfix
`5dcaecf4fa9ff97e0d391d290807a2184897b742`
(`Fix completed answers inside nested TeX`) was merged into `cleanup` with a
real merge commit before closeout. That hotfix therefore remains shared Git
history rather than a duplicated cherry-pick.

## Cleanup principles

The cleanup used the following rules:

1. Remove code that is no longer reachable or no longer part of the supported
   runtime.
2. Follow dead dependencies transitively instead of deleting only obvious
   top-level entry points.
3. Remove explicitly retired or deprecated implementations when the active
   replacement is established.
4. Preserve active compatibility behavior, even when Xronos itself does not use
   every supported deployment/authentication variant.
5. Separate cleanup from unrelated modernization. In particular, package
   version/dependency modernization is a later project.
6. Verify every destructive change against the current test-server checkout and
   actual runtime/container environment before committing it.

## Major retired surfaces

The cleanup removed or retired the following broad categories.

### Embedded SageCell deployment

The old SageCell build/deployment material embedded under the Xronos server
repository was removed.

SageCell is now treated as a separate service. The authoritative operational
description remains `SAGECELL.md`, and SageCell image/build maintenance belongs
in the standalone `xronosuf/sagecell-server` repository.

The Xronos-side Sage proxy/runtime integration remains active.

### Legacy statistics and summary pipeline

The obsolete summary pipeline was retired after the active answer-attempt
statistics path was established.

The modern summary/statistics helpers that remain in `summarize/`, `scripts/`,
and `routes/statistics.js` are active and intentionally retained.

### Live instructor interaction / supervision remnants

Legacy browser/server surfaces for old live supervision, annotation, chat,
invigilation, and related presentation paths were removed when they were shown
to be dead or transitively orphaned.

Active instructor, gradebook, repository, and ordinary user-management routes
remain supported.

### Obsolete presentation and template code

Old Jade layouts, unused Pug fragments, legacy presentation helpers, commented
historical UI implementations, and unused landing/blog content were removed.

The remaining Pug tree was re-audited after cleanup. Every tracked template is
reachable through an include/extend/render path or an intentional special
render path.

### Historical deployment and build artifacts

Obsolete deployment material was removed, including the old root deployment
script and broken legacy Docker Compose configuration.

The current root `Dockerfile`, `start.sh`, operational scripts, and current
container workflow remain active.

### Cached/generated and source artifacts

Historical cached package snapshots, obsolete image-source artifacts, unused
STIX webfonts, old test material, and other non-runtime artifacts were removed
where they no longer served a reproducibility or maintenance purpose.

One important exception is the historical Pagedown dependency. Rather than
depending on an unavailable/unreproducible external copy, the exact historical
Pagedown implementation is now vendored under `vendor/pagedown-bootstrap/`.
That directory is therefore intentional third-party source, not cleanup debt.

### Commented-out implementations

The final pass removed commented implementations that had clear active
replacements or were explicitly marked as removed.

Commented compatibility examples remain intentionally in a few places,
including alternate authentication/deployment/UI examples. Do not treat those
as dead code without first verifying their cross-deployment purpose.

## Intentional compatibility and deployment exceptions

The cleanup deliberately retained several surfaces that can look obsolete in a
UF-focused deployment.

### Alternate authentication

Alternate authentication mechanisms and examples are retained for other Ximera
deployments. A mechanism should not be deleted merely because the UF Xronos
deployment primarily enters through LTI.

### Institutional UI examples

KU Leuven, OSU, Colorado State, and other institutional styling/edit examples
may remain as compatibility/reference material. Active visible branding cleanup
is a separate project.

### Stylesheet deployment difference

`public/stylesheets/.gitignore` and tracked `public/stylesheets/base.css` are
intentional.

The UF deployment can provide a local tracked `base.css`, while other
deployments historically obtain their base stylesheet differently. Do not
normalize or remove these files solely because the nested ignore file appears
unusual.

### Favicon source

`public/images/icons/favicon/icon.xcf` and its local Makefile are retained as
the editable source/build path for the active favicon.

## Verification at closeout

The cleanup closeout included:

- clean-branch/checkpoint verification before each destructive phase;
- JavaScript syntax checks for modified runtime files;
- compilation of all current Pug templates;
- repeated JS/Pug reachability censuses;
- explicit checks that protected compatibility remnants remained;
- exact changed-file-scope checks before commits;
- `git diff --check` validation;
- targeted/runtime tests for affected subsystems where appropriate; and
- confirmation that the production deployment was not modified by cleanup
  operations.

At the final audit, the remaining zero-inbound browser JavaScript files were
known browser/service-worker entry points rather than CommonJS orphans, and
there were no zero-inbound/zero-render Pug templates.

## Package modernization is separate

`package.json` and `package-lock.json` should not be treated as unfinished
cleanup work.

Some dependency cleanup occurred earlier when direct evidence was available,
but broad dependency/version modernization was explicitly separated from this
project. Future package work should be performed as its own modernization and
security project with dedicated build/runtime validation.

The Dependabot/security count reported by GitHub is therefore not a cleanup
closeout criterion.

## Deferred work that remains valid

The cleanup did not attempt to solve unrelated known work. Current deferred
items remain collected primarily in `documentation/page-runtime/TODO.md`.

Important examples include:

- package/dependency modernization;
- visible/institutional branding cleanup;
- the deferred free-response grading redesign;
- the missing-static-asset HTTP routing issue;
- future coordinator/runtime reliability work;
- online-content-coordinator aggregate statistics;
- future SageCell hardening/authorization work; and
- other explicitly documented architecture/UI follow-up.

Those items should be evaluated as separate projects rather than reopened as
part of dead-code cleanup.

## Maintainer guidance

When evaluating a future deletion, distinguish among:

- active runtime code;
- command-line/operational entry points;
- browser/service-worker entry points;
- special render paths;
- compatibility examples for other Ximera deployments;
- historical but intentionally vendored dependencies;
- editable sources for active generated assets; and
- genuinely unreachable/deprecated code.

A zero inbound CommonJS edge, a commented line, or an unfamiliar institutional
reference is not by itself sufficient proof that a file is dead.

For the detailed current page-runtime architecture and deferred work, see
`documentation/page-runtime/`.

For current SageCell proxy/service operation, see `SAGECELL.md`.
