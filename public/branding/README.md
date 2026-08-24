# Xronos branding

Institution-specific branding assets are centralized here so that core Xronos
presentation code can be distinguished from deployment-specific branding.

## Maintained directories

- `shared/` contains branding used by the Xronos application itself.
- `uf/` contains University of Florida deployment assets and is maintained with
  the active UF Xronos deployment.

## Reference examples

`examples/` contains branding retained from other Ximera/Xronos deployments.
These files are useful examples for institutions adapting Xronos, but they are
not expected to track the active UF design.

Reference packs currently include:

- Ohio State University (`examples/osu/`)
- Colorado State University (`examples/colorado-state/`)
- KU Leuven (`examples/kul/`)

Application/runtime code should not depend on files under `examples/`.
