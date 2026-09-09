#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TMP="$(mktemp -d /tmp/xronos-page-repair-preflight.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

FILES=(
  app.js
  views/layouts/main.pug
  views/layouts/grid.pug
  public/javascripts/application-version-path.js
  public/javascripts/mathjax.js
  public/javascripts/page-runtime-support-report.js
  public/javascripts/page-runtime-support-ui.js
)

echo "============================================================"
echo "XRONOS — PAGE REPAIR NON-MUTATING PREFLIGHT"
echo "============================================================"
echo

echo "1. CURRENT SOURCE REGRESSION"
echo "------------------------------------------------------------"
bash scripts/run-page-repair-regression.sh

echo
echo "2. COPY PATCH TARGETS TO TEMP TREE"
echo "------------------------------------------------------------"
mkdir -p \
  "$TMP/views/layouts" \
  "$TMP/public/javascripts" \
  "$TMP/scripts/modernization" \
  "$TMP/lib"

for file in "${FILES[@]}"; do
  mkdir -p "$TMP/$(dirname "$file")"
  cp "$file" "$TMP/$file"
done
cp lib/page-repair.js "$TMP/lib/"
cp public/javascripts/page-repair.js "$TMP/public/javascripts/"
cp public/javascripts/legacy-cache-cleanup.js "$TMP/public/javascripts/"
cp scripts/modernization/apply-page-repair-integration.js "$TMP/scripts/modernization/"

echo "Temporary tree: $TMP"

echo
echo "3. APPLY PATCHER ONLY IN TEMP TREE"
echo "------------------------------------------------------------"
node - "$TMP" <<'NODE'
'use strict';
var fs = require('fs');
var path = require('path');
var tmp = process.argv[2];
var patcher = require(path.join(process.cwd(), 'scripts/modernization/apply-page-repair-integration'));
var targets = [
    ['app.js', patcher.patchApp],
    ['views/layouts/main.pug', patcher.patchLayout],
    ['views/layouts/grid.pug', patcher.patchLayout],
    ['public/javascripts/application-version-path.js', patcher.patchApplicationVersionPath],
    ['public/javascripts/mathjax.js', patcher.patchMathJax],
    ['public/javascripts/page-runtime-support-report.js', patcher.patchSupportReport],
    ['public/javascripts/page-runtime-support-ui.js', patcher.patchSupportUi]
];
targets.forEach(function(target) {
    var filename = path.join(tmp, target[0]);
    var source = fs.readFileSync(filename, 'utf8');
    var patched = target[1](source);
    if (patched === source) {
        throw new Error('Expected pre-integration source for ' + target[0]);
    }
    if (target[1](patched) !== patched) {
        throw new Error('Patcher is not idempotent for ' + target[0]);
    }
    fs.writeFileSync(filename, patched);
});
NODE

echo
echo "4. VERIFY GENERATED CONTRACT"
echo "------------------------------------------------------------"
grep -Fq "xronosPageRepair.applyRecoveryResponse" "$TMP/app.js"
grep -Fq 'meta(name="xronos-repair-token"' "$TMP/views/layouts/main.pug"
grep -Fq 'meta(name="xronos-repair-token"' "$TMP/views/layouts/grid.pug"
grep -Fq "'xronosRepair=' + encodeURIComponent(token)" "$TMP/public/javascripts/application-version-path.js"
grep -Fq 'pageRepairToken(document)' "$TMP/public/javascripts/mathjax.js"
grep -Fq 'var REPORT_SCHEMA_VERSION = 2;' "$TMP/public/javascripts/page-runtime-support-report.js"
grep -Fq '"Repair this page"' "$TMP/public/javascripts/page-runtime-support-ui.js"
grep -Fq 'pageRepair.repairCurrentPage()' "$TMP/public/javascripts/page-runtime-support-ui.js"
grep -Fq 'pageRepair.lastRepair(window)' "$TMP/public/javascripts/page-runtime-support-ui.js"
grep -Fq 'presentation.showPageRepair = false;' "$TMP/public/javascripts/page-runtime-support-ui.js"

grep -Fq "res.set('Clear-Site-Data', '\"cache\"')" lib/page-repair.js
if grep -F "Clear-Site-Data" lib/page-repair.js | grep -Eq 'cookies|storage|\*'; then
  echo >&2 "Unsafe Clear-Site-Data directive found."
  exit 1
fi

if grep -Fq 'localStorage.clear' public/javascripts/page-repair.js || \
   grep -Fq 'sessionStorage.clear' public/javascripts/page-repair.js; then
  echo >&2 "Broad browser storage clearing is not allowed."
  exit 1
fi

echo "Generated integration has the intended bounded recovery behavior."

echo
echo "5. SYNTAX CHECK GENERATED JAVASCRIPT"
echo "------------------------------------------------------------"
node --check "$TMP/app.js"
node --check "$TMP/public/javascripts/application-version-path.js"
node --check "$TMP/public/javascripts/mathjax.js"
node --check "$TMP/public/javascripts/page-runtime-support-report.js"
node --check "$TMP/public/javascripts/page-runtime-support-ui.js"

echo
echo "6. VERIFY REAL TARGET FILES WERE NOT CHANGED"
echo "------------------------------------------------------------"
test -z "$(git status --porcelain)"
git diff --check

echo
echo "============================================================"
echo "PAGE REPAIR NON-MUTATING PREFLIGHT PASSED"
echo "============================================================"
