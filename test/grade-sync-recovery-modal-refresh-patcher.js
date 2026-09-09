var assert = require('assert');
var fs = require('fs');
var path = require('path');
var patcher = require('../scripts/modernization/apply-grade-sync-recovery-modal-refresh');

var root = path.join(__dirname, '..');

describe('grade sync recovery modal refresh patcher', function() {
    it('closes stale help content after a successful recheck and is idempotent', function() {
        var source = fs.readFileSync(
            path.join(root, 'public/javascripts/gradebook.js'),
            'utf8'
        );
        var patched = patcher.patchGradebook(source);

        assert.strictEqual(
            patcher.countOccurrences(patched, patcher.NEW_BLOCK),
            1
        );
        assert.strictEqual(
            patcher.countOccurrences(patched, patcher.OLD_BLOCK),
            0
        );
        assert.ok(
            patched.indexOf("modal.modal('hide');") !== -1
        );
        assert.ok(
            patched.indexOf('xronosRememberGradeSyncRecovery(result.recovery);') !== -1
        );
        assert.strictEqual(patcher.patchGradebook(patched), patched);
    });
});
