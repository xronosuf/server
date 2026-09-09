var assert = require('assert');
var evidence = require('../lib/late-grade-evidence');

var CANVAS_TOLERANCE = 1e-4;

function assertClose(actual, expected, tolerance) {
    tolerance = tolerance === undefined ? CANVAS_TOLERANCE : tolerance;

    assert.ok(
        Math.abs(actual - expected) < tolerance,
        'expected ' + actual + ' to be within ' + tolerance + ' of ' + expected
    );
}

function bridge(overrides) {
    var value = {
        _id: 'bridge-1',
        toolConsumerInstanceGuid: 'canvas.example.edu',
        contextId: 'course-123',
        dueDate: new Date('2026-09-08T03:59:59.000Z'),
        pointsPossible: 10,
        resultTotalScore: 9.21,
        lastSubmittedResultTotalScore: 8.21,
        lastSubmittedAt: new Date('2026-09-09T16:00:00.000Z')
    };

    Object.keys(overrides || {}).forEach(function(key) {
        value[key] = overrides[key];
    });

    return value;
}

describe('late grade evidence helpers', function() {
    it('scopes evidence by Canvas consumer and context', function() {
        assert.deepStrictEqual(
            evidence.contextIdentity(bridge()),
            {
                toolConsumerInstanceGuid: 'canvas.example.edu',
                contextId: 'course-123'
            }
        );
    });

    it('uses resultTotalScore over Canvas pointsPossible as candidate raw score', function() {
        assertClose(
            evidence.candidateRawScore(bridge()),
            0.921
        );
    });

    it('uses last submitted total over Canvas pointsPossible for prior raw score', function() {
        assertClose(
            evidence.lastSubmittedRawScore(bridge()),
            0.821
        );
    });

    it('builds a late observation from the actual submission time', function() {
        var value = evidence.observationFromLastSubmission(
            bridge(),
            0.621
        );

        assertClose(value.rawScore, 0.821);
        assertClose(value.effectiveScore, 0.621);
        assert.strictEqual(value.lateIntervals, 2);
        assert.strictEqual(value.source, 'pre-write-read-result');
    });

    it('does not treat an on-time prior submission as late-policy evidence', function() {
        var value = evidence.observationFromLastSubmission(
            bridge({
                lastSubmittedAt: new Date('2026-09-08T03:00:00.000Z')
            }),
            0.821
        );

        assert.strictEqual(value, null);
    });

    it('builds post-write evidence using the captured current late interval', function() {
        var observedAt = new Date('2026-09-10T16:00:00.000Z');
        var value = evidence.observationFromAcceptedLatePassback(
            bridge(),
            0.921,
            0.621,
            3,
            observedAt
        );

        assertClose(value.rawScore, 0.921);
        assertClose(value.effectiveScore, 0.621);
        assert.strictEqual(value.lateIntervals, 3);
        assert.strictEqual(value.observedAt, observedAt);
        assert.strictEqual(value.source, 'post-write-read-result');
    });
});
