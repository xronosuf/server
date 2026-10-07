'use strict';

var assert = require('assert');
var policy = require('../lib/grade-boundary-policy');

function bridge(overrides) {
    return Object.assign({
        _id: 'bridge-1',
        dueDate: new Date('2026-10-05T23:59:00Z'),
        dueDateObservedAt: new Date('2026-10-01T12:00:00Z'),
        untilDate: new Date('2026-10-06T23:59:00Z'),
        untilDateObservedAt: new Date('2026-10-01T12:00:00Z'),
        resultScore: 0.87,
        resultTotalScore: 8.7,
        resultScoreObservedAt: new Date('2026-10-05T23:58:47Z'),
        resultPointsEarned: 87,
        resultPointsPossible: 100,
        recentBestScoreObservations: []
    }, overrides || {});
}

describe('grade boundary policy', function() {
    it('keeps only the three newest trusted best-score observations', function() {
        var values = [];

        [1, 2, 3, 4].forEach(function(second) {
            values = policy.appendRecentBest(values, {
                resultScore: second / 10,
                resultTotalScore: second,
                observedAt: new Date(
                    '2026-10-05T23:58:0' + second + 'Z'
                )
            });
        });

        assert.strictEqual(values.length, 3);
        assert.strictEqual(values[0].resultTotalScore, 4);
        assert.strictEqual(values[2].resultTotalScore, 2);
    });

    it('selects the best trusted observation at or before a boundary', function() {
        var b = bridge({
            resultScore: 0.91,
            resultTotalScore: 9.1,
            resultScoreObservedAt:
                new Date('2026-10-06T00:00:12Z'),
            recentBestScoreObservations: [
                {
                    resultScore: 0.91,
                    resultTotalScore: 9.1,
                    observedAt:
                        new Date('2026-10-06T00:00:12Z')
                },
                {
                    resultScore: 0.87,
                    resultTotalScore: 8.7,
                    observedAt:
                        new Date('2026-10-05T23:58:47Z')
                }
            ]
        });

        var observation = policy.bestObservationAtOrBefore(
            b,
            b.dueDate
        );

        assert.ok(observation);
        assert.strictEqual(observation.resultScore, 0.87);
        assert.strictEqual(
            observation.observedAt.toISOString(),
            '2026-10-05T23:58:47.000Z'
        );
    });

    it('treats a date learned before the boundary as authoritative', function() {
        assert.strictEqual(
            policy.dateWasKnownByBoundary(bridge(), policy.DUE_TYPE),
            true
        );
    });

    it('detects a deadline moved retroactively into the past', function() {
        var b = bridge({
            dueDate: new Date('2026-10-05T23:59:00Z'),
            dueDateObservedAt:
                new Date('2026-10-06T12:00:00Z')
        });

        assert.strictEqual(
            policy.dateWasKnownByBoundary(b, policy.DUE_TYPE),
            false
        );
    });

    it('does not convert missing values into real zero observations', function() {
        assert.strictEqual(
            policy.normalizeObservation({
                resultScore: null,
                resultTotalScore: null,
                observedAt: new Date()
            }),
            null
        );
    });

    it('describes due and until independently even when they match', function() {
        var at = new Date('2026-10-05T23:59:00Z');
        var descriptions = policy.descriptors(bridge({
            dueDate: at,
            untilDate: at
        }));

        assert.strictEqual(descriptions.length, 2);
        assert.strictEqual(descriptions[0].source, 'due-boundary');
        assert.strictEqual(descriptions[1].source, 'until-boundary');
    });
});
