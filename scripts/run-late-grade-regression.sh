#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TEST_FILES=(
  test/late-grade-policy.js
  test/late-grade-evidence.js
  test/late-grade-policy-authoritative-evidence.js
)

SOURCE_FILES=(
  lib/late-grade-policy.js
  lib/late-grade-evidence.js
)

run_syntax_checks() {
  echo "Syntax checks:"
  for file in "${SOURCE_FILES[@]}" "${TEST_FILES[@]}"; do
    node --check "$file"
  done
  echo "  passed"
}

run_mocha_direct() {
  echo "Running late-grade regression with local dependencies..."
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

  echo "Running late-grade regression in disposable container:"
  echo "  image: $image"
  echo "  checkout: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

  podman run --rm \
    --entrypoint /bin/sh \
    -v "$ROOT:/workspace:ro" \
    "$image" \
    -lc '
set -eu

TEST_ROOT=/tmp/xronos-late-grade-regression
rm -rf "$TEST_ROOT"
mkdir -p "$TEST_ROOT/lib" "$TEST_ROOT/test"

cp /workspace/lib/late-grade-policy.js "$TEST_ROOT/lib/"
cp /workspace/lib/late-grade-evidence.js "$TEST_ROOT/lib/"
cp /workspace/test/late-grade-policy.js "$TEST_ROOT/test/"
cp /workspace/test/late-grade-evidence.js "$TEST_ROOT/test/"
cp /workspace/test/late-grade-policy-authoritative-evidence.js "$TEST_ROOT/test/"

cd "$TEST_ROOT"

NODE_PATH=/usr/var/server/node_modules \
  /usr/var/server/node_modules/.bin/mocha \
  test/late-grade-policy.js \
  test/late-grade-evidence.js \
  test/late-grade-policy-authoritative-evidence.js
'
}

echo "============================================================"
echo "XRONOS — LATE GRADE REGRESSION"
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
echo "LATE GRADE REGRESSION PASSED"
echo "============================================================"
