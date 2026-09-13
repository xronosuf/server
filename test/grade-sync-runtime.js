var assert = require('assert');
var runtime = require('../lib/grade-sync-runtime');

function bridge(id, overrides) {
    var value = {
        _id: id,
        repository: 'testsuite',
        path: 'test-suite-xourse',
        lisResultSourcedid: 'sourced-' + id,
        lisOutcomeServiceUrl: 'https://canvas.example.edu/outcomes',
        pointsPossible: 10,
        dueDate: new Date('2026-09-08T03:59:59.000Z'),
        untilDate: new Date('2026-10-01T03:59:59.000Z'),
        submittedScore: false
    };

    Object.keys(overrides || {}).forEach(function(key) {
        value[key] = overrides[key];
    });

    return value;
}

describe('grade sync runtime evidence', function() {
    var now = new Date('2026-09-09T18:00:00.000Z').getTime();

    it('maps Redis zscore results to queued bridge ids', function() {
        var bridges = [bridge('a'), bridge('b'), bridge('c')];

        assert.deepStrictEqual(
            runtime.queuedIdsFromScores(
                bridges,
                ['1750000000000', null, '1750000001000']
            ),
            ['a', 'c']
        );
    });

    it('classifies pending and accepted bridges from the same evidence snapshot', function() {
        var result = runtime.build([
            bridge('pending'),
            bridge('accepted', {
                submittedScore: true,
                lastSubmittedAt: new Date('2026-09-09T17:00:00.000Z'),
                lastSubmittedResultTotalScore: 8.5
            })
        ], ['pending'], now);

        assert.strictEqual(result.status.state, 'pending');
        assert.strictEqual(result.status.reason, 'passback-pending');
        assert.strictEqual(result.status.queuedGradePassbackCount, 1);
        assert.strictEqual(result.status.acceptedGradePassbackCount, 1);
        assert.strictEqual(result.diagnostics.bridges[0].state, 'passback-pending');
        assert.strictEqual(result.diagnostics.bridges[1].state, 'passback-accepted');
        assert.strictEqual(result.diagnostics.bridges[1].hasLastAcceptedScore, true);
    });

    it('reports missing fields and closed windows without exposing LTI secrets', function() {
        var missing = bridge('missing', {
            lisOutcomeServiceUrl: null,
            oauthConsumerKey: 'secret-ish-key',
            lisResultSourcedid: null
        });
        var closed = bridge('closed', {
            untilDate: new Date('2026-09-09T17:00:00.000Z')
        });

        var result = runtime.build([missing, closed], [], now);
        var serialized = JSON.stringify(result.diagnostics);

        assert.strictEqual(
            result.diagnostics.bridges[0].state,
            'missing-passback-fields'
        );
        assert.strictEqual(
            result.diagnostics.bridges[1].state,
            'grade-passback-closed'
        );
        assert.strictEqual(serialized.indexOf('secret-ish-key'), -1);
        assert.strictEqual(serialized.indexOf('sourced-missing'), -1);
        assert.strictEqual(serialized.indexOf('outcomes'), -1);
    });

    it('marks queue state unavailable without turning a usable bridge into disconnected', function(done) {
        var redis = {
            pipeline: function() {
                return {
                    zscore: function() {
                        return this;
                    },
                    exec: function(callback) {
                        callback(new Error('redis unavailable'));
                    }
                };
            }
        };

        runtime.load(redis, [bridge('ready')], now, function(err, result) {
            assert.ifError(err);
            assert.strictEqual(result.status.queueStatusAvailable, false);
            assert.strictEqual(result.status.state, 'ready');
            assert.strictEqual(result.status.reason, 'passback-ready');
            assert.strictEqual(result.diagnostics.queueStatusAvailable, false);
            done();
        });
    });

    it('loads queued bridge ids from a Redis pipeline', function(done) {
        var requested = [];
        var redis = {
            pipeline: function() {
                return {
                    zscore: function(key, id) {
                        requested.push([key, id]);
                        return this;
                    },
                    exec: function(callback) {
                        callback(null, [
                            [null, null],
                            [null, '1750000000000']
                        ]);
                    }
                };
            }
        };

        runtime.loadQueuedBridgeIds(
            redis,
            [bridge('first'), bridge('second')],
            function(err, ids) {
                assert.ifError(err);
                assert.deepStrictEqual(requested, [
                    ['gradebook', 'first'],
                    ['gradebook', 'second']
                ]);
                assert.deepStrictEqual(ids, ['second']);
                done();
            }
        );
    });
});
