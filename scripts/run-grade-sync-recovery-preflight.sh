#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TMP_ROOT="${TMPDIR:-/tmp}/xronos-grade-sync-recovery-preflight"

before_app="$(sha256sum app.js | awk '{print $1}')"
before_gradebook="$(sha256sum public/javascripts/gradebook.js | awk '{print $1}')"

cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

rm -rf "$TMP_ROOT"
mkdir -p "$TMP_ROOT/public/javascripts"

echo "============================================================"
echo "XRONOS — GRADE SYNC RECOVERY NON-MUTATING PREFLIGHT"
echo "============================================================"
echo

echo "1. EXISTING REGRESSIONS"
echo "------------------------------------------------------------"
bash scripts/run-grade-sync-regression.sh

echo
echo "2. GENERATE PATCHED TEMPORARY COPIES"
echo "------------------------------------------------------------"

node <<'NODE'
'use strict';

var fs = require('fs');
var path = require('path');
var patcher = require('./scripts/modernization/apply-grade-sync-recovery-integration');

var tmpRoot = path.join(
    process.env.TMPDIR || '/tmp',
    'xronos-grade-sync-recovery-preflight'
);

var app = fs.readFileSync('app.js', 'utf8');
var gradebook = fs.readFileSync(
    'public/javascripts/gradebook.js',
    'utf8'
);

var patchedApp = patcher.patchApp(app);
var patchedGradebook = patcher.patchGradebook(gradebook);

if (patcher.patchApp(patchedApp) !== patchedApp) {
    throw new Error('app.js recovery patch is not idempotent');
}

if (patcher.patchGradebook(patchedGradebook) !== patchedGradebook) {
    throw new Error('gradebook.js recovery patch is not idempotent');
}

fs.writeFileSync(
    path.join(tmpRoot, 'app.js'),
    patchedApp,
    'utf8'
);
fs.writeFileSync(
    path.join(tmpRoot, 'public/javascripts/gradebook.js'),
    patchedGradebook,
    'utf8'
);

console.log('Temporary patched copies generated.');
NODE

echo
echo "3. SYNTAX CHECK GENERATED OPERATIONAL FILES"
echo "------------------------------------------------------------"

node --check "$TMP_ROOT/app.js"
node --check "$TMP_ROOT/public/javascripts/gradebook.js"

echo "Generated operational syntax passed."

echo
echo "4. VERIFY RECOVERY CONTRACTS IN GENERATED COPIES"
echo "------------------------------------------------------------"

grep -Fq \
  "gradeSyncRecovery = require('./routes/grade-sync-recovery')" \
  "$TMP_ROOT/app.js"

grep -Fq \
  "app.post( '/:repository/:path(*)/grade-sync-recovery'" \
  "$TMP_ROOT/app.js"

grep -Fq \
  "require('./grade-sync-recovery-policy')" \
  "$TMP_ROOT/public/javascripts/gradebook.js"

grep -Fq \
  "Recheck grade sync" \
  "$TMP_ROOT/public/javascripts/gradebook.js"

grep -Fq \
  "Show Canvas reconnect steps" \
  "$TMP_ROOT/public/javascripts/gradebook.js"

grep -Fq \
  "type: 'POST'" \
  "$TMP_ROOT/public/javascripts/gradebook.js"

grep -Fq \
  "view-canvas-relaunch-guidance" \
  "$TMP_ROOT/public/javascripts/gradebook.js"

grep -Fq \
  "function xronosRememberGradeSyncRecovery(recovery)" \
  "$TMP_ROOT/public/javascripts/gradebook.js"

grep -Fq \
  "gradeSyncSupportReport.MAX_RECOVERY_EVENTS" \
  "$TMP_ROOT/public/javascripts/gradebook.js"

grep -Fq \
  "recoveries: xronosGradeSyncRecoveries" \
  "$TMP_ROOT/public/javascripts/gradebook.js"

if grep -Fq "queueBridge(" "$TMP_ROOT/public/javascripts/gradebook.js"; then
  echo >&2 "Unexpected grade queue mutation appeared in browser recovery code."
  exit 1
fi

echo "Generated recovery contracts present."

echo
echo "5. VERIFY SUPPORT CORRELATION CONTRACTS"
echo "------------------------------------------------------------"

grep -Fq \
  "schemaVersion: 2" \
  public/javascripts/grade-sync-support-report.js

grep -Fq \
  "MAX_RECOVERY_EVENTS = 5" \
  public/javascripts/grade-sync-support-report.js

grep -Fq \
  "xronos-grade-sync-recovery-history" \
  scripts/grade-sync-recovery-report.js

grep -Fq \
  "gradeSyncRecoveryEvents" \
  routes/grade-sync-recovery.js

echo "Support correlation contracts present."

echo
echo "6. VERIFY REAL CHECKOUT WAS NOT MODIFIED"
echo "------------------------------------------------------------"

after_app="$(sha256sum app.js | awk '{print $1}')"
after_gradebook="$(sha256sum public/javascripts/gradebook.js | awk '{print $1}')"

printf 'app.js:       %s -> %s\n' "$before_app" "$after_app"
printf 'gradebook.js: %s -> %s\n' "$before_gradebook" "$after_gradebook"

test "$before_app" = "$after_app"
test "$before_gradebook" = "$after_gradebook"

git diff --check

echo
echo "============================================================"
echo "GRADE SYNC RECOVERY NON-MUTATING PREFLIGHT PASSED"
echo "============================================================"
echo
echo "No operational source file was modified by this preflight."
