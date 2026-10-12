'use strict';

var assert = require('assert');
var canvasBoundaryDate = require('../lib/canvas-boundary-date');
var policy = require('../lib/grade-boundary-policy');

function bridge() {
    return {
        dueDate: new Date('2026-10-05T23:59:00Z'),
        dueDateObservedAt: new Date('2026-10-01T12:00:00Z'),
        untilDate: new Date('2026-10-05T23:59:00Z'),
        untilDateObservedAt: new Date('2026-10-01T12:00:00Z'),
        resultScore: 0.95,
        resultTotalScore: 9.5,
        resultScoreObservedAt: new Date('2026-10-05T23:59:20Z'),
        resultPointsEarned: 95,
        resultPointsPossible: 100,
        dueBoundaryCandidate: {
            boundaryAt: new Date('2026-10-05T23:59:00Z'),
            resultScore: 0.87,
            resultTotalScore: 8.7,
            observedAt: new Date('2026-10-05T23:58:57Z')
        },
        untilBoundaryCandidate: {
            boundaryAt: new Date('2026-10-05T23:59:00Z'),
            resultScore: 0.87,
            resultTotalScore: 8.7,
            observedAt: new Date('2026-10-05T23:58:57Z')
        }
    };
}

describe('Canvas boundary date observation', function() {
    it('leaves the stored date unchanged when the launch parameter is absent', function() {
        var b = bridge();

        var result = canvasBoundaryDate.apply(
            b,
            policy.UNTIL_TYPE,
            undefined,
            new Date('2026-10-06T00:00:00Z'),
            false
        );

        assert.strictEqual(result.reason, 'parameter-absent');
        assert.strictEqual(
            b.untilDate.toISOString(),
            '2026-10-05T23:59:00.000Z'
        );
        assert.ok(b.untilBoundaryCandidate);
    });

    it('does not clear a date for an unexpanded Canvas placeholder', function() {
        var b = bridge();

        var result = canvasBoundaryDate.apply(
            b,
            policy.UNTIL_TYPE,
            '$Canvas.assignment.lockAt.iso8601',
            new Date('2026-10-06T00:00:00Z'),
            true
        );

        assert.strictEqual(result.reason, 'placeholder');
        assert.strictEqual(
            b.untilDate.toISOString(),
            '2026-10-05T23:59:00.000Z'
        );
        assert.ok(b.untilBoundaryCandidate);
    });

    it('clears the current Until date and exact candidate for an explicit empty value', function() {
        var b = bridge();

        var result = canvasBoundaryDate.apply(
            b,
            policy.UNTIL_TYPE,
            '',
            new Date('2026-10-06T00:00:00Z'),
            true
        );

        assert.strictEqual(result.reason, 'cleared');
        assert.strictEqual(b.untilDate, undefined);
        assert.strictEqual(b.untilDateObservedAt, undefined);
        assert.strictEqual(b.untilBoundaryCandidate, undefined);
    });

    it('clears the current Due date and exact candidate for explicit null', function() {
        var b = bridge();

        var result = canvasBoundaryDate.apply(
            b,
            policy.DUE_TYPE,
            null,
            new Date('2026-10-06T00:00:00Z'),
            true
        );

        assert.strictEqual(result.reason, 'cleared');
        assert.strictEqual(b.dueDate, undefined);
        assert.strictEqual(b.dueDateObservedAt, undefined);
        assert.strictEqual(b.dueBoundaryCandidate, undefined);
    });

    it('replaces an exact boundary and reseeds from latest eligible progress', function() {
        var b = bridge();
        var observedAt =
            new Date('2026-10-06T00:00:00Z');

        var result = canvasBoundaryDate.apply(
            b,
            policy.UNTIL_TYPE,
            '2026-10-06T00:10:00Z',
            observedAt,
            true
        );

        assert.strictEqual(result.reason, 'updated');
        assert.strictEqual(
            b.untilDate.toISOString(),
            '2026-10-06T00:10:00.000Z'
        );
        assert.strictEqual(
            b.untilDateObservedAt.toISOString(),
            observedAt.toISOString()
        );
        assert.ok(b.untilBoundaryCandidate);
        assert.strictEqual(
            b.untilBoundaryCandidate.resultScore,
            0.95
        );
        assert.strictEqual(
            new Date(
                b.untilBoundaryCandidate.boundaryAt
            ).toISOString(),
            '2026-10-06T00:10:00.000Z'
        );
    });
});
