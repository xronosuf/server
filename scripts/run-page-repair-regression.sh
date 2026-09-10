#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TEST_FILES=(
  test/page-repair.js
  test/page-repair-server.js
  test/page-repair-integration-patcher.js
  test/page-repair-support-report-contract.js
  test/page-repair-cache-policy-fix.js
  test/page-repair-mathjax-namespace-fix.js
)

SOURCE_FILES=(
  lib/page-repair.js
  public/javascripts/legacy-cache-cleanup.js
  public/javascripts/page-repair.js
  scripts/modernization/apply-page-repair-integration.js
  scripts/modernization/apply-page-repair-cache-policy-fix.js
  scripts/modernization/apply-page-repair-mathjax-namespace-fix.js
)

for file in "${SOURCE_FILES[@]}" "${TEST_FILES[@]}"; do
  node --check "$file"
done

echo "============================================================"
echo "XRONOS — PAGE REPAIR REGRESSION"
echo "============================================================"
echo

if [[ -x ./node_modules/.bin/mocha ]]; then
  ./node_modules/.bin/mocha "${TEST_FILES[@]}"
elif command -v podman >/dev/null 2>&1; then
  IMAGE="${XRONOS_TEST_IMAGE:-$(podman inspect "${XRONOS_APP_CONTAINER:-devximserver}" --format '{{.ImageName}}')}"
  echo "Running page-repair regression in disposable container:"
  echo "  image: $IMAGE"
  echo "  checkout: $(git rev-parse --short HEAD)"

  podman run --rm \
    --entrypoint /bin/sh \
    -v "$ROOT:/workspace:ro" \
    "$IMAGE" \
    -lc '
set -eu
TEST_ROOT=/tmp/xronos-page-repair-regression
rm -rf "$TEST_ROOT"
mkdir -p "$TEST_ROOT/lib" "$TEST_ROOT/public/javascripts" "$TEST_ROOT/scripts/modernization" "$TEST_ROOT/test" "$TEST_ROOT/views/layouts"
cp /workspace/lib/page-repair.js "$TEST_ROOT/lib/"
cp /workspace/lib/static-asset-routes.js "$TEST_ROOT/lib/"
cp /workspace/public/javascripts/legacy-cache-cleanup.js "$TEST_ROOT/public/javascripts/"
cp /workspace/public/javascripts/page-repair.js "$TEST_ROOT/public/javascripts/"
cp /workspace/public/javascripts/application-version-path.js "$TEST_ROOT/public/javascripts/"
cp /workspace/public/javascripts/mathjax.js "$TEST_ROOT/public/javascripts/"
cp /workspace/public/javascripts/page-runtime-support-report.js "$TEST_ROOT/public/javascripts/"
cp /workspace/public/javascripts/page-runtime-support-ui.js "$TEST_ROOT/public/javascripts/"
cp /workspace/scripts/modernization/apply-page-repair-integration.js "$TEST_ROOT/scripts/modernization/"
cp /workspace/scripts/modernization/apply-page-repair-cache-policy-fix.js "$TEST_ROOT/scripts/modernization/"
cp /workspace/scripts/modernization/apply-page-repair-mathjax-namespace-fix.js "$TEST_ROOT/scripts/modernization/"
cp /workspace/test/page-repair.js "$TEST_ROOT/test/"
cp /workspace/test/page-repair-server.js "$TEST_ROOT/test/"
cp /workspace/test/page-repair-integration-patcher.js "$TEST_ROOT/test/"
cp /workspace/test/page-repair-support-report-contract.js "$TEST_ROOT/test/"
cp /workspace/test/page-repair-cache-policy-fix.js "$TEST_ROOT/test/"
cp /workspace/test/page-repair-mathjax-namespace-fix.js "$TEST_ROOT/test/"
cp /workspace/app.js "$TEST_ROOT/"
cp /workspace/views/layouts/main.pug "$TEST_ROOT/views/layouts/"
cp /workspace/views/layouts/grid.pug "$TEST_ROOT/views/layouts/"
cd "$TEST_ROOT"
NODE_PATH=/usr/var/server/node_modules \
  /usr/var/server/node_modules/.bin/mocha \
  test/page-repair.js \
  test/page-repair-server.js \
  test/page-repair-integration-patcher.js \
  test/page-repair-support-report-contract.js \
  test/page-repair-cache-policy-fix.js \
  test/page-repair-mathjax-namespace-fix.js
'
else
  echo >&2 "Mocha is not installed locally and podman is unavailable."
  exit 1
fi

echo
echo "============================================================"
echo "PAGE REPAIR REGRESSION PASSED"
echo "============================================================"
