#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TEST_FILES=(
  test/grade-sync-status.js
  test/grade-sync-presentation.js
  test/lti-bridge-diagnostics.js
  test/grade-sync-runtime.js
  test/grade-sync-diagnostic-report.js
  test/grade-sync-support-report.js
  test/grade-sync-recovery-policy.js
  test/grade-sync-recovery.js
  test/lti-launch-reference.js
  test/grade-sync-browser-contract.js
  test/grade-sync-integration-patcher.js
  test/lti-launch-session-integration-patcher.js
)

SOURCE_FILES=(
  lib/grade-sync-status.js
  lib/lti-bridge-diagnostics.js
  lib/grade-sync-runtime.js
  lib/grade-sync-diagnostic-report.js
  lib/lti-launch-reference.js
  public/javascripts/grade-sync-presentation.js
  public/javascripts/grade-sync-support-report.js
  public/javascripts/grade-sync-recovery-policy.js
  public/javascripts/gradebook.js
  routes/grade-sync-recovery.js
  scripts/modernization/apply-grade-sync-integration.js
  scripts/modernization/apply-lti-launch-session-fix.js
)

run_syntax_checks() {
  echo "Syntax checks:"
  for file in "${SOURCE_FILES[@]}" "${TEST_FILES[@]}"; do
    node --check "$file"
  done
  echo "  passed"
}

run_mocha_direct() {
  echo "Running grade-sync regression with local dependencies..."
  ./node_modules/.bin/mocha "${TEST_FILES[@]}"
}

running_app_image() {
  local app="${XRONOS_APP_CONTAINER:-devximserver}"

  podman inspect "$app" --format '{{.ImageName}}' 2>/dev/null || true
}

run_mocha_in_container() {
  local image="${XRONOS_TEST_IMAGE:-}"

  if [[ -z "$image" ]]; then
    image="$(running_app_image)"
  fi

  if [[ -z "$image" ]]; then
    echo >&2 "Could not determine a container image with installed dependencies."
    echo >&2 "Set XRONOS_TEST_IMAGE explicitly or run where ./node_modules/.bin/mocha exists."
    exit 1
  fi

  echo "Running grade-sync regression in disposable container:"
  echo "  image: $image"
  echo "  checkout: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

  podman run --rm \
    --entrypoint /bin/sh \
    -v "$ROOT:/workspace:ro" \
    "$image" \
    -lc '
set -eu

TEST_ROOT=/tmp/xronos-grade-sync-regression
rm -rf "$TEST_ROOT"
mkdir -p "$TEST_ROOT/lib" "$TEST_ROOT/public/javascripts" "$TEST_ROOT/scripts/modernization" "$TEST_ROOT/routes" "$TEST_ROOT/login" "$TEST_ROOT/test"

cp /workspace/lib/grade-sync-status.js "$TEST_ROOT/lib/"
cp /workspace/lib/lti-bridge-diagnostics.js "$TEST_ROOT/lib/"
cp /workspace/lib/grade-sync-runtime.js "$TEST_ROOT/lib/"
cp /workspace/lib/grade-sync-diagnostic-report.js "$TEST_ROOT/lib/"
cp /workspace/lib/lti-launch-reference.js "$TEST_ROOT/lib/"
cp /workspace/lib/late-grade-policy.js "$TEST_ROOT/lib/"
cp /workspace/public/javascripts/grade-sync-presentation.js "$TEST_ROOT/public/javascripts/"
cp /workspace/public/javascripts/grade-sync-support-report.js "$TEST_ROOT/public/javascripts/"
cp /workspace/public/javascripts/grade-sync-recovery-policy.js "$TEST_ROOT/public/javascripts/"
cp /workspace/public/javascripts/gradebook.js "$TEST_ROOT/public/javascripts/"
cp /workspace/routes/grade-sync-recovery.js "$TEST_ROOT/routes/"
cp /workspace/scripts/modernization/apply-grade-sync-integration.js "$TEST_ROOT/scripts/modernization/"
cp /workspace/scripts/modernization/apply-lti-launch-session-fix.js "$TEST_ROOT/scripts/modernization/"
cp /workspace/routes/gradebook.js "$TEST_ROOT/routes/"
cp /workspace/login/index.js "$TEST_ROOT/login/"
cp /workspace/app.js "$TEST_ROOT/"
cp /workspace/test/grade-sync-status.js "$TEST_ROOT/test/"
cp /workspace/test/grade-sync-presentation.js "$TEST_ROOT/test/"
cp /workspace/test/lti-bridge-diagnostics.js "$TEST_ROOT/test/"
cp /workspace/test/grade-sync-runtime.js "$TEST_ROOT/test/"
cp /workspace/test/grade-sync-diagnostic-report.js "$TEST_ROOT/test/"
cp /workspace/test/grade-sync-support-report.js "$TEST_ROOT/test/"
cp /workspace/test/grade-sync-recovery-policy.js "$TEST_ROOT/test/"
cp /workspace/test/grade-sync-recovery.js "$TEST_ROOT/test/"
cp /workspace/test/lti-launch-reference.js "$TEST_ROOT/test/"
cp /workspace/test/grade-sync-browser-contract.js "$TEST_ROOT/test/"
cp /workspace/test/grade-sync-integration-patcher.js "$TEST_ROOT/test/"
cp /workspace/test/lti-launch-session-integration-patcher.js "$TEST_ROOT/test/"

cd "$TEST_ROOT"

NODE_PATH=/usr/var/server/node_modules \
  /usr/var/server/node_modules/.bin/mocha \
  test/grade-sync-status.js \
  test/grade-sync-presentation.js \
  test/lti-bridge-diagnostics.js \
  test/grade-sync-runtime.js \
  test/grade-sync-diagnostic-report.js \
  test/grade-sync-support-report.js \
  test/grade-sync-recovery-policy.js \
  test/grade-sync-recovery.js \
  test/lti-launch-reference.js \
  test/grade-sync-browser-contract.js \
  test/grade-sync-integration-patcher.js \
  test/lti-launch-session-integration-patcher.js
'
}

echo "============================================================"
echo "XRONOS — GRADE SYNC REGRESSION"
echo "============================================================"
echo

run_syntax_checks

echo
if [[ -x ./node_modules/.bin/mocha ]]; then
  run_mocha_direct
elif command -v podman >/dev/null 2>&1; then
  run_mocha_in_container
else
  echo >&2 "Mocha is not installed locally and podman is unavailable."
  exit 1
fi

echo
echo "============================================================"
echo "GRADE SYNC REGRESSION PASSED"
echo "============================================================"
