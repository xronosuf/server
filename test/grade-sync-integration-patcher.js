var assert = require('assert');
var fs = require('fs');
var path = require('path');
var patcher = require('../scripts/modernization/apply-grade-sync-integration');

var root = path.join(__dirname, '..');

describe('grade sync integration patcher', function() {
    it('patches the current login source exactly once', function() {
        var source = fs.readFileSync(
            path.join(root, 'login/index.js'),
            'utf8'
        );
        var patched = patcher.patchLogin(source);

        assert.ok(
            patched.indexOf(
                'var ltiLaunchReference = require("../lib/lti-launch-reference");'
            ) !== -1
        );
        assert.ok(
            patched.indexOf(
                'ltiLaunchReference.record(req, bridge);'
            ) !== -1
        );
        assert.throws(function() {
            patcher.patchLogin(patched);
        });
    });

    it('patches the current gradebook source exactly once', function() {
        var source = fs.readFileSync(
            path.join(root, 'routes/gradebook.js'),
            'utf8'
        );
        var patched = patcher.patchGradebook(source);

        assert.ok(
            patched.indexOf(
                "var gradeSyncRuntime = require('../lib/grade-sync-runtime');"
            ) !== -1
        );
        assert.ok(
            patched.indexOf('buildGradeSyncStatus') === -1
        );
        assert.ok(
            patched.indexOf(
                'gradeSync: runtime.status'
            ) !== -1
        );
        assert.ok(
            patched.indexOf(
                'gradeSyncDiagnostics:'
            ) !== -1
        );
        assert.ok(
            patched.indexOf(
                'ltiLaunchReference.read(req)'
            ) !== -1
        );
        assert.throws(function() {
            patcher.patchGradebook(patched);
        });
    });
});
