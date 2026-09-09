var assert = require('assert');
var gradeSyncStatus = require('../lib/grade-sync-status');

function bridge(overrides) {
    var value = {
        _id: 'bridge-1',
        lisResultSourcedid: 'result-id',
        lisOutcomeServiceUrl: 'https://canvas.example.test/outcome',
        pointsPossible: 10,
        submittedScore: false
    };

    Object.keys(overrides || {}).forEach(function(key) {
        value[key] = overrides[key];
    });

    return value;
}

describe('grade sync status classifier', function() {
    var now = Date.UTC(2026, 8, 8, 18, 0, 0);

    it('reports no bridge', function() {
        var status = gradeSyncStatus.build([], [], now);

        assert.strictEqual(status.state, 'not-syncing');
        assert.strictEqual(status.reason, 'no-bridge');
    });

    it('reports a bridge missing required passback fields', function() {
        var status = gradeSyncStatus.build([
            bridge({lisResultSourcedid: undefined})
        ], [], now);

        assert.strictEqual(status.state, 'not-syncing');
        assert.strictEqual(status.reason, 'missing-passback-fields');
    });

    it('keeps a past-due bridge active through Canvas untilDate', function() {
        var status = gradeSyncStatus.build([
            bridge({
                dueDate: new Date(now - 1000),
                untilDate: new Date(now + 24 * 60 * 60 * 1000)
            })
        ], [], now);

        assert.strictEqual(status.state, 'ready');
        assert.strictEqual(status.reason, 'passback-ready');
        assert.strictEqual(status.hasActiveGradePassback, true);
    });

    it('reports a closed passback window after Canvas untilDate', function() {
        var status = gradeSyncStatus.build([
            bridge({
                dueDate: new Date(now - 2 * 24 * 60 * 60 * 1000),
                untilDate: new Date(now - 1000)
            })
        ], [], now);

        assert.strictEqual(status.state, 'not-syncing');
        assert.strictEqual(status.reason, 'grade-passback-closed');
    });

    it('keeps a bridge without untilDate active during the fallback horizon', function() {
        var status = gradeSyncStatus.build([
            bridge({
                dueDate: new Date(now - 10 * 24 * 60 * 60 * 1000),
                untilDate: undefined
            })
        ], [], now);

        assert.strictEqual(status.state, 'ready');
        assert.strictEqual(status.reason, 'passback-ready');
    });

    it('does not call a merely passback-capable bridge synced', function() {
        var status = gradeSyncStatus.build([
            bridge()
        ], [], now);

        assert.strictEqual(status.state, 'ready');
        assert.strictEqual(status.reason, 'passback-ready');
        assert.strictEqual(status.hasActiveGradePassback, true);
        assert.strictEqual(status.hasAcceptedGradePassback, false);
    });

    it('reports a queued active bridge as pending', function() {
        var status = gradeSyncStatus.build([
            bridge()
        ], ['bridge-1'], now);

        assert.strictEqual(status.state, 'pending');
        assert.strictEqual(status.reason, 'passback-pending');
        assert.strictEqual(status.queuedGradePassbackCount, 1);
        assert.strictEqual(status.queuedGradePassback, true);
    });

    it('reports an accepted active bridge as synced', function() {
        var status = gradeSyncStatus.build([
            bridge({submittedScore: true})
        ], [], now);

        assert.strictEqual(status.state, 'synced');
        assert.strictEqual(status.reason, 'passback-accepted');
        assert.strictEqual(status.acceptedGradePassbackCount, 1);
        assert.strictEqual(status.hasAcceptedGradePassback, true);
    });

    it('prefers pending when one active duplicate bridge is queued', function() {
        var status = gradeSyncStatus.build([
            bridge({_id: 'accepted', submittedScore: true}),
            bridge({_id: 'pending', submittedScore: false})
        ], ['pending'], now);

        assert.strictEqual(status.state, 'pending');
        assert.strictEqual(status.reason, 'passback-pending');
        assert.strictEqual(status.activeGradePassbackBridgeCount, 2);
    });

    it('does not call mixed accepted and unresolved active bridges synced', function() {
        var status = gradeSyncStatus.build([
            bridge({_id: 'accepted', submittedScore: true}),
            bridge({_id: 'unresolved', submittedScore: false})
        ], [], now);

        assert.strictEqual(status.state, 'ready');
        assert.strictEqual(status.reason, 'passback-ready');
        assert.strictEqual(status.acceptedGradePassbackCount, 1);
        assert.strictEqual(status.unresolvedActiveGradePassbackCount, 1);
    });

    it('accepts ObjectId-like bridge identifiers for queue matching', function() {
        var status = gradeSyncStatus.build([
            bridge({
                _id: {
                    toString: function() {
                        return 'object-id';
                    }
                }
            })
        ], ['object-id'], now);

        assert.strictEqual(status.state, 'pending');
        assert.strictEqual(status.queuedGradePassbackCount, 1);
    });
});
