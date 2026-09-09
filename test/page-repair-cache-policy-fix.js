'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var fixer = require('../scripts/modernization/apply-page-repair-cache-policy-fix');

var root = path.join(__dirname, '..');

function source(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('page repair cache policy fix', function() {
    it('preserves no-store for repair responses and leaves ordinary GET policy intact', function() {
        var patched = fixer.patchApp(source('app.js'));

        assert.ok(
            patched.indexOf("req.method === 'GET' &&\n            !res.locals.xronosRepairToken") !== -1
        );
        assert.ok(patched.indexOf("'private, no-cache'") !== -1);
        assert.strictEqual(fixer.patchApp(patched), patched);
    });

    it('teaches the integration patcher the same cache-policy guard', function() {
        var patched = fixer.patchIntegrationPatcher(
            source('scripts/modernization/apply-page-repair-integration.js')
        );

        assert.ok(patched.indexOf("'app.js repair cache-policy guard'") !== -1);
        assert.ok(patched.indexOf('!res.locals.xronosRepairToken') !== -1);
        assert.strictEqual(fixer.patchIntegrationPatcher(patched), patched);
    });
});
