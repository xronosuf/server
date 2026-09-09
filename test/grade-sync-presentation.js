var assert = require('assert');
var presenter = require('../public/javascripts/grade-sync-presentation');

function view(status) {
    return presenter.presentation(status);
}

describe('grade sync indicator presentation', function() {
    it('shows checking before status is known', function() {
        var result = view();

        assert.strictEqual(result.state, 'checking');
        assert.strictEqual(result.label, 'Checking grade sync');
    });

    it('collapses accepted passback to connected', function() {
        var result = view({
            state: 'synced',
            reason: 'passback-accepted'
        });

        assert.strictEqual(result.state, 'connected');
        assert.strictEqual(result.label, 'Grade sync connected');
    });

    it('collapses queued passback to connected', function() {
        var result = view({
            state: 'pending',
            reason: 'passback-pending'
        });

        assert.strictEqual(result.state, 'connected');
        assert.strictEqual(result.label, 'Grade sync connected');
    });

    it('shows a passback-capable bridge as connected', function() {
        var result = view({
            state: 'ready',
            reason: 'passback-ready'
        });

        assert.strictEqual(result.state, 'connected');
        assert.strictEqual(result.label, 'Grade sync connected');
    });

    it('preserves compatibility with the legacy syncing response', function() {
        var result = view({
            state: 'syncing',
            hasActiveGradePassback: true,
            reason: 'active-passback'
        });

        assert.strictEqual(result.state, 'connected');
        assert.strictEqual(result.label, 'Grade sync connected');
    });

    it('distinguishes a closed passback window', function() {
        var result = view({
            state: 'not-syncing',
            reason: 'grade-passback-closed'
        });

        assert.strictEqual(result.state, 'closed');
        assert.strictEqual(result.label, 'Grade sync closed');
        assert(result.message.indexOf('Reopening Xronos from Canvas') !== -1);
    });

    it('shows missing or absent bridge as not connected', function() {
        [
            'no-bridge',
            'missing-passback-fields'
        ].forEach(function(reason) {
            var result = view({
                state: 'not-syncing',
                reason: reason
            });

            assert.strictEqual(result.state, 'not-connected');
            assert.strictEqual(result.label, 'Grade sync not connected');
        });
    });

    it('shows verification failures as unavailable', function() {
        var result = view({state: 'error'});

        assert.strictEqual(result.state, 'unavailable');
        assert.strictEqual(result.label, 'Grade sync unavailable');
    });
});
