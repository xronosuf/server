var assert = require('assert');
var fs = require('fs');
var path = require('path');
var patcher = require('../scripts/modernization/apply-grade-sync-recovery-integration');

var root = path.join(__dirname, '..');

describe('grade sync recovery integration patcher', function() {
    it('adds one guarded recovery route and is idempotent', function() {
        var source = fs.readFileSync(
            path.join(root, 'app.js'),
            'utf8'
        );
        var patched = patcher.patchApp(source);

        assert.strictEqual(
            patcher.countOccurrences(
                patched,
                "gradeSyncRecovery = require('./routes/grade-sync-recovery')"
            ),
            1
        );
        assert.strictEqual(
            patcher.countOccurrences(
                patched,
                "app.post( '/:repository/:path(*)/grade-sync-recovery'"
            ),
            1
        );
        assert.ok(
            patched.indexOf('gradeSyncRecovery.recordAndRecheck') !== -1
        );
        assert.ok(
            patched.indexOf("app.put( '/:repository/:path(*)/gradebook'") !== -1
        );
        assert.strictEqual(patcher.patchApp(patched), patched);
    });

    it('adds bounded browser recovery controls and correlation context idempotently', function() {
        var source = fs.readFileSync(
            path.join(root, 'public/javascripts/gradebook.js'),
            'utf8'
        );
        var patched = patcher.patchGradebook(source);

        assert.strictEqual(
            patcher.countOccurrences(
                patched,
                "require('./grade-sync-recovery-policy')"
            ),
            1
        );
        assert.strictEqual(
            patcher.countOccurrences(
                patched,
                'function xronosRequestGradeSyncRecovery(action, callback) {'
            ),
            1
        );
        assert.strictEqual(
            patcher.countOccurrences(
                patched,
                'function xronosRememberGradeSyncRecovery(recovery) {'
            ),
            1
        );
        assert.strictEqual(
            patcher.countOccurrences(
                patched,
                'var xronosGradeSyncRecoveries = [];'
            ),
            1
        );
        assert.strictEqual(
            patcher.countOccurrences(
                patched,
                'recoveries: xronosGradeSyncRecoveries,'
            ),
            1
        );
        assert.strictEqual(
            patcher.countOccurrences(
                patched,
                "if (recovery.kind !== 'none') {"
            ),
            1
        );
        assert.ok(patched.indexOf('Recheck grade sync') !== -1);
        assert.ok(patched.indexOf('Show Canvas reconnect steps') !== -1);
        assert.ok(
            patched.indexOf("'recheck-status'") !== -1
        );
        assert.ok(
            patched.indexOf("'view-canvas-relaunch-guidance'") !== -1
        );
        assert.ok(
            patched.indexOf('xronosRememberGradeSyncRecovery(result.recovery)') !== -1
        );
        assert.ok(
            patched.indexOf('gradeSyncSupportReport.MAX_RECOVERY_EVENTS') !== -1
        );
        assert.ok(
            patched.indexOf("type: 'POST'") !== -1
        );
        assert.ok(
            patched.indexOf("'/grade-sync-recovery'") !== -1
        );
        assert.strictEqual(
            patched.indexOf('queueBridge('),
            -1
        );
        assert.strictEqual(patcher.patchGradebook(patched), patched);
    });
});
