'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var patcher = require('../scripts/modernization/apply-page-repair-mathjax-namespace-fix');

var root = path.join(__dirname, '..');

function source(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('page repair MathJax namespace fix', function() {
    it('uses a path namespace instead of a query string for repaired node_modules roots', function() {
        var patched = patcher.patchApplicationVersionPath(
            source('public/javascripts/application-version-path.js')
        );

        assert.ok(
            patched.indexOf("prefix += 'repair/' + encodeURIComponent(repairToken) + '/';") !== -1
        );
        assert.ok(
            patched.indexOf("return appendRepairToken(\n        '/node_modules/v'") === -1
        );
        assert.strictEqual(
            patcher.patchApplicationVersionPath(patched),
            patched
        );
    });

    it('mounts the repair namespace before the ordinary versioned node_modules namespace', function() {
        var patched = patcher.patchStaticAssetRoutes(
            source('lib/static-asset-routes.js')
        );
        var repairIndex = patched.indexOf("'/node_modules/v' + applicationVersion + '/repair'");
        var normalIndex = patched.indexOf("'/node_modules',", repairIndex);

        assert.ok(repairIndex !== -1);
        assert.ok(normalIndex > repairIndex);
        assert.ok(patched.indexOf('repairTokenIsValid') !== -1);
        assert.ok(patched.indexOf('private, no-store, max-age=0, must-revalidate') !== -1);
        assert.strictEqual(
            patcher.patchStaticAssetRoutes(patched),
            patched
        );
    });

    it('updates the original integration patcher so it cannot recreate the malformed MathJax root', function() {
        var patched = patcher.patchIntegrationPatcher(
            source('scripts/modernization/apply-page-repair-integration.js')
        );

        assert.ok(
            patched.indexOf("prefix += \'repair/\' + encodeURIComponent(repairToken) + \'/\';") !== -1
        );
        assert.strictEqual(
            patcher.patchIntegrationPatcher(patched),
            patched
        );
    });
});
