var assert = require('assert');
var fs = require('fs');
var path = require('path');
var patcher = require('../scripts/modernization/apply-grade-sync-integration');

var root = path.join(__dirname, '..');

function integratedLogin(source) {
    return (
        source.indexOf(
            'var ltiLaunchReference = require("../lib/lti-launch-reference");'
        ) !== -1 &&
        source.indexOf('ltiLaunchReference.stage(req, bridge);') !== -1 &&
        source.indexOf('ltiLaunchReference.record(req, bridge);') === -1
    );
}

function integratedGradebook(source) {
    return (
        source.indexOf(
            "var gradeSyncRuntime = require('../lib/grade-sync-runtime');"
        ) !== -1 &&
        source.indexOf('buildGradeSyncStatus') === -1 &&
        source.indexOf('gradeSync: runtime.status') !== -1 &&
        source.indexOf('gradeSyncDiagnostics:') !== -1 &&
        source.indexOf('ltiLaunchReference.read(req)') !== -1
    );
}

describe('grade sync integration patcher', function() {
    it('can patch the current login source or verify the staged integration state', function() {
        var source = fs.readFileSync(
            path.join(root, 'login/index.js'),
            'utf8'
        );
        var patched = patcher.patchLogin(source);

        assert.strictEqual(integratedLogin(patched), true);
        assert.strictEqual(
            patcher.patchLogin(patched),
            patched
        );
    });

    it('can patch the current gradebook source or verify it is already integrated', function() {
        var source = fs.readFileSync(
            path.join(root, 'routes/gradebook.js'),
            'utf8'
        );

        if (integratedGradebook(source)) {
            assert.strictEqual(integratedGradebook(source), true);
            return;
        }

        var patched = patcher.patchGradebook(source);

        assert.strictEqual(integratedGradebook(patched), true);
        assert.throws(function() {
            patcher.patchGradebook(patched);
        });
    });
});
