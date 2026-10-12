'use strict';

var assert = require('assert');
var candidate = require('../lib/grade-passback-candidate');

function bridge(overrides) {
    return Object.assign({
        gradeSyncCutoff: 'late-policy',
        pointsPossible: 10,
        dueDate: new Date('2026-10-05T23:59:00.000Z'),
        dueDateObservedAt: new Date('2026-10-05T22:59:00.000Z'),
        untilDate: new Date('2026-10-05T23:59:00.000Z'),
        untilDateObservedAt: new Date('2026-10-05T22:59:00.000Z'),
        resultScore: 0.87,
        resultTotalScore: 8.7,
        resultScoreObservedAt:
            new Date('2026-10-05T23:58:57.000Z'),
        resultPointsEarned: 87,
        resultPointsPossible: 100,
        recentBestScoreObservations: [{
            resultScore: 0.87,
            resultTotalScore: 8.7,
            pointsEarned: 87,
            pointsPossible: 100,
            observedAt:
                new Date('2026-10-05T23:58:57.000Z')
        }]
    }, overrides || {});
}

describe('Canvas passback candidate selection', function() {
    it('uses the current candidate before the passback boundary', function() {
        var b = bridge();
        var selected = candidate.select(
            b,
            {
                source: 'canvas-until',
                time: Date.parse('2026-10-05T23:59:00.000Z')
            },
            Date.parse('2026-10-05T23:58:58.000Z')
        );

        assert.strictEqual(selected.eligible, true);
        assert.strictEqual(
            selected.boundaryBackedDelivery,
            false
        );
        assert.strictEqual(
            selected.candidate.resultScore,
            0.87
        );
    });

    it('reproduces the original race: T-3s candidate is eligible at T+6s', function() {
        var b = bridge();
        var selected = candidate.select(
            b,
            {
                source: 'canvas-until',
                time: Date.parse('2026-10-05T23:59:00.000Z')
            },
            Date.parse('2026-10-05T23:59:06.000Z')
        );

        assert.strictEqual(selected.eligible, true);
        assert.strictEqual(
            selected.reason,
            'trusted-pre-boundary-candidate'
        );
        assert.strictEqual(
            selected.candidate.resultScore,
            0.87
        );
        assert.strictEqual(
            selected.candidate.observedAt.toISOString(),
            '2026-10-05T23:58:57.000Z'
        );
    });

    it('freezes 87% even when latest Xronos progress becomes 95% after cutoff', function() {
        var b = bridge({
            resultScore: 0.95,
            resultTotalScore: 9.5,
            resultScoreObservedAt:
                new Date('2026-10-05T23:59:20.000Z'),
            resultPointsEarned: 95,
            resultPointsPossible: 100
        });
        var selected = candidate.select(
            b,
            {
                source: 'canvas-until',
                time: Date.parse('2026-10-05T23:59:00.000Z')
            },
            Date.parse('2026-10-05T23:59:21.000Z')
        );

        assert.strictEqual(selected.eligible, true);
        assert.strictEqual(
            selected.candidate.resultScore,
            0.87
        );
        assert.strictEqual(
            selected.candidate.resultTotalScore,
            8.7
        );
    });

    it('refuses automatic delivery when the boundary was learned retroactively', function() {
        var b = bridge({
            untilDateObservedAt:
                new Date('2026-10-05T23:59:05.000Z')
        });
        var selected = candidate.select(
            b,
            {
                source: 'canvas-until',
                time: Date.parse('2026-10-05T23:59:00.000Z')
            },
            Date.parse('2026-10-05T23:59:06.000Z')
        );

        assert.strictEqual(selected.eligible, false);
        assert.strictEqual(
            selected.reason,
            'retroactive-boundary'
        );
    });

    it('does not reopen a non-boundary fallback after it closes', function() {
        var selected = candidate.select(
            bridge(),
            {
                source: 'xronos-shell-fallback',
                time: Date.parse('2026-10-05T23:59:00.000Z')
            },
            Date.parse('2026-10-05T23:59:06.000Z')
        );

        assert.strictEqual(selected.eligible, false);
        assert.strictEqual(
            selected.reason,
            'closed-nonboundary-window'
        );
    });
});
