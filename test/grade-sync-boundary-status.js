'use strict';

var assert = require('assert');
var status = require('../lib/grade-sync-status');

function bridge(overrides) {
    return Object.assign({
        _id: 'bridge-1',
        lisResultSourcedid: 'result-1',
        lisOutcomeServiceUrl: 'https://canvas.example/outcomes',
        pointsPossible: 10,
        gradeSyncCutoff: 'late-policy',
        dueDate: new Date('2026-10-01T23:59:00Z'),
        dueDateObservedAt: new Date('2026-09-25T12:00:00Z'),
        untilDate: new Date('2026-10-05T23:59:00Z'),
        untilDateObservedAt: new Date('2026-09-25T12:00:00Z'),
        resultScore: 0.87,
        resultTotalScore: 8.7,
        resultScoreObservedAt:
            new Date('2026-10-05T23:58:47Z'),
        submittedScore: false
    }, overrides || {});
}

describe('grade sync boundary delivery status', function() {
    it('keeps a trusted pre-until candidate deliverable after Until', function() {
        var b = bridge();
        var now = Date.parse('2026-10-06T00:00:10Z');

        assert.strictEqual(status.bridgeIsOpen(b, now), false);
        assert.strictEqual(
            status.bridgeHasDeliverableFrozenCandidate(b, now),
            true
        );

        var summary = status.build(
            [b],
            ['bridge-1'],
            now
        );

        assert.strictEqual(summary.state, 'pending');
        assert.strictEqual(summary.reason, 'passback-pending');
    });

    it('does not treat a post-boundary candidate as deliverable', function() {
        var b = bridge({
            resultScoreObservedAt:
                new Date('2026-10-06T00:00:02Z')
        });
        var now = Date.parse('2026-10-06T00:00:10Z');

        assert.strictEqual(
            status.bridgeHasDeliverableFrozenCandidate(b, now),
            false
        );
    });

    it('does not automatically deliver across a retroactively learned cutoff', function() {
        var b = bridge({
            untilDateObservedAt:
                new Date('2026-10-06T00:00:05Z')
        });
        var now = Date.parse('2026-10-06T00:00:10Z');

        assert.strictEqual(
            status.bridgeHasDeliverableFrozenCandidate(b, now),
            false
        );
    });

    it('honors the instructor due-date cutoff for frozen delivery', function() {
        var b = bridge({
            gradeSyncCutoff: 'due-date',
            resultScoreObservedAt:
                new Date('2026-10-01T23:58:30Z')
        });
        var now = Date.parse('2026-10-02T00:00:05Z');

        assert.strictEqual(
            status.bridgeHasDeliverableFrozenCandidate(b, now),
            true
        );
    });
});
