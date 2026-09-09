var assert = require('assert');
var fs = require('fs');
var path = require('path');

var source = fs.readFileSync(
    path.join(__dirname, '../public/javascripts/gradebook.js'),
    'utf8'
);

describe('grade sync browser integration', function() {
    it('uses the shared grade-sync presentation policy', function() {
        assert.ok(
            source.indexOf("require('./grade-sync-presentation')") !== -1
        );
        assert.ok(
            source.indexOf('gradeSyncPresentation.presentation(gradeSync)') !== -1
        );
    });

    it('does not retain the obsolete Grade syncing labels', function() {
        assert.strictEqual(source.indexOf("label.textContent = 'Grade syncing'"), -1);
        assert.strictEqual(source.indexOf("label.textContent = 'Grade not syncing'"), -1);
        assert.strictEqual(source.indexOf("label.textContent = 'Grade sync unknown'"), -1);
    });

    it('opens a report modal instead of the legacy help alert', function() {
        assert.ok(
            source.indexOf("require('./grade-sync-support-report')") !== -1
        );
        assert.ok(
            source.indexOf('xronosShowGradeSyncHelp(indicator, checking)') !== -1
        );
        assert.ok(
            source.indexOf('Generate & Copy Grade Sync Report') !== -1
        );
        assert.strictEqual(source.indexOf('window.alert(message)'), -1);
    });

    it('uses the shared configured Xronos support email', function() {
        assert.ok(source.indexOf('window.xronosSupportEmail') !== -1);
        assert.ok(
            source.indexOf('Generate and copy the diagnostic report below') !== -1
        );
    });

    it('retains only the latest grade sync diagnostic response for reporting', function() {
        assert.ok(
            source.indexOf('xronosLatestGradeSyncDiagnostics') !== -1
        );
        assert.ok(
            source.indexOf('result && result.gradeSyncDiagnostics') !== -1
        );
        assert.ok(
            source.indexOf('xronosLatestGradeSyncDiagnostics = null;') !== -1
        );
    });
});
