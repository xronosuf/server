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

    it('reserves synced wording for accepted passback', function() {
        var result = view({
            state: 'synced',
            reason: 'passback-accepted'
        });

        assert.strictEqual(result.state, 'synced');
        assert.strictEqual(result.label, 'Grade synced');
        assert(result.message.indexOf('accepted') !== -1);
    });

    it('shows queued passback as pending rather than synced', function() {
        var result = view({
            state: 'pending',
            reason: 'passback-pending'
        });

        assert.strictEqual(result.state, 'pending');
        assert.strictEqual(result.label, 'Grade sync pending');
    });

    it('shows a passback-capable unresolved bridge as connected', function() {
        var result = view({
            state: 'ready',
            reason: 'passback-ready'
        });

        assert.strictEqual(result.state, 'ready');
        assert.strictEqual(result.label, 'Grade sync connected');
        assert.notStrictEqual(result.label, 'Grade synced');
    });

    it('does not preserve the old server syncing claim as synced', function() {
        var result = view({
            state: 'syncing',
            hasActiveGradePassback: true,
            reason: 'active-passback'
        });

        assert.strictEqual(result.state, 'ready');
        assert.strictEqual(result.label, 'Grade sync connected');
    });

    it('distinguishes a closed passback window', function() {
        var result = view({
            state: 'not-syncing',
            reason: 'grade-passback-closed'
        });

        assert.strictEqual(result.label, 'Grade sync closed');
    });

    it('shows missing or absent bridge as not syncing', function() {
        [
            'no-bridge',
            'missing-passback-fields'
        ].forEach(function(reason) {
            var result = view({
                state: 'not-syncing',
                reason: reason
            });

            assert.strictEqual(result.state, 'not-syncing');
            assert.strictEqual(result.label, 'Grade not syncing');
        });
    });

    it('shows verification failures as unknown', function() {
        var result = view({state: 'error'});

        assert.strictEqual(result.state, 'error');
        assert.strictEqual(result.label, 'Grade sync unknown');
    });
});
