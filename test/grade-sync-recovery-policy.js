var assert = require('assert');
var policy = require('../public/javascripts/grade-sync-recovery-policy');

describe('grade sync recovery policy', function() {
    it('does not offer recovery for a usable connection', function() {
        var result = policy.recovery({
            state: 'pending',
            reason: 'passback-pending',
            hasActiveGradePassback: true
        }, {
            launchMatch: {primary: 'exact'}
        });

        assert.strictEqual(result.kind, 'none');
        assert.strictEqual(result.canSelfRecover, false);
    });

    it('does not pretend a student can reopen a closed passback window', function() {
        var result = policy.recovery({
            state: 'closed',
            reason: 'grade-passback-closed'
        }, {
            launchMatch: {primary: 'exact'}
        });

        assert.strictEqual(result.kind, 'contact-support');
        assert.strictEqual(result.canSelfRecover, false);
    });

    it('offers a read-only recheck for transient verification failure', function() {
        var result = policy.recovery({
            state: 'error',
            queueStatusAvailable: false
        }, null);

        assert.strictEqual(result.kind, 'recheck-status');
        assert.strictEqual(result.canSelfRecover, true);
    });

    it('directs assignment/context mismatches back through Canvas', function() {
        [
            'same-context-different-assignment',
            'same-page-different-context',
            'current-launch-reference-unavailable',
            'no-matching-bridge',
            'missing-launch-metadata'
        ].forEach(function(primary) {
            var result = policy.recovery({
                state: 'not-connected',
                reason: 'no-active-passback'
            }, {
                launchMatch: {primary: primary}
            });

            assert.strictEqual(result.kind, 'relaunch-from-canvas');
            assert.strictEqual(result.canSelfRecover, true);
        });
    });

    it('directs missing bridge/passback metadata back through Canvas', function() {
        ['no-bridge', 'missing-passback-fields'].forEach(function(reason) {
            var result = policy.recovery({
                state: 'not-connected',
                reason: reason
            }, null);

            assert.strictEqual(result.kind, 'relaunch-from-canvas');
        });
    });

    it('falls back to a non-destructive recheck for unknown disconnected states', function() {
        var result = policy.recovery({
            state: 'not-connected',
            reason: 'unknown'
        }, {
            launchMatch: {primary: 'unknown'}
        });

        assert.strictEqual(result.kind, 'recheck-status');
        assert.strictEqual(result.canSelfRecover, true);
    });
});
