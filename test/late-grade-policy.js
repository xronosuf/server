var assert = require('assert');
var policy = require('../lib/late-grade-policy');

function bridge(overrides) {
    var value = {
        dueDate: new Date('2026-09-08T03:59:59.000Z'),
        untilDate: new Date('2026-10-01T03:59:59.000Z')
    };

    Object.keys(overrides || {}).forEach(function(key) {
        value[key] = overrides[key];
    });

    return value;
}

describe('late grade passback policy', function() {
    it('keeps Canvas-until assignments open after the due date', function() {
        var now = Date.parse('2026-09-09T15:49:44.000Z');

        assert.strictEqual(
            policy.bridgeIsBeforeDueDate(bridge(), now),
            false
        );
        assert.strictEqual(
            policy.bridgeIsPassbackWindowOpen(bridge(), now),
            true
        );
        assert.strictEqual(
            policy.passbackWindowEnd(bridge()).source,
            'canvas-until'
        );
    });

    it('closes passback after Canvas untilDate', function() {
        var now = Date.parse('2026-10-01T04:00:00.000Z');

        assert.strictEqual(
            policy.bridgeIsPassbackWindowOpen(bridge(), now),
            false
        );
    });

    it('uses the documented fallback horizon when untilDate is absent', function() {
        var b = bridge({untilDate: undefined});
        var end = policy.passbackWindowEnd(b);

        assert.strictEqual(end.source, 'fallback-after-due');
        assert.strictEqual(
            end.time,
            Date.parse('2026-09-08T03:59:59.000Z') +
                130 * policy.DAY_MS
        );
    });

    it('does not invent an end date when neither due nor until exists', function() {
        var end = policy.passbackWindowEnd(
            bridge({dueDate: undefined, untilDate: undefined})
        );

        assert.strictEqual(end.time, null);
        assert.strictEqual(end.source, 'no-end-date');
    });

    it('counts Canvas late intervals from the exact due timestamp', function() {
        var b = bridge();

        assert.strictEqual(
            policy.lateIntervalNumber(
                b,
                Date.parse('2026-09-08T04:00:00.000Z')
            ),
            1
        );
        assert.strictEqual(
            policy.lateIntervalNumber(
                b,
                Date.parse('2026-09-09T15:49:44.000Z')
            ),
            2
        );
    });

    it('defers writes just before the next late interval boundary', function() {
        var b = bridge();
        var now = Date.parse('2026-09-10T03:58:00.000Z');
        var decision = policy.lateBoundaryDecision(b, now);

        assert.strictEqual(decision.defer, true);
        assert.strictEqual(decision.reason, 'late-interval-boundary');
        assert.strictEqual(
            decision.retryAt,
            Date.parse('2026-09-10T04:00:04.000Z')
        );
    });

    it('allows a first positive late result when Canvas has no result', function() {
        assert.deepStrictEqual(
            policy.latePassbackDecision({
                canvasHasResult: false,
                candidateRawScore: 0.83
            }),
            {
                allow: true,
                reason: 'canvas-has-no-result'
            }
        );
    });

    it('allows a higher raw Xronos result when Canvas is at or below the last submitted raw result', function() {
        assert.deepStrictEqual(
            policy.latePassbackDecision({
                canvasHasResult: true,
                canvasScore: 0.621,
                lastSubmittedRawScore: 0.83,
                candidateRawScore: 0.90
            }),
            {
                allow: true,
                reason: 'monotonic-raw-increase'
            }
        );
    });

    it('blocks a late write when the current Canvas score exceeds the last Xronos raw result', function() {
        assert.deepStrictEqual(
            policy.latePassbackDecision({
                canvasHasResult: true,
                canvasScore: 0.95,
                lastSubmittedRawScore: 0.83,
                candidateRawScore: 1.0
            }),
            {
                allow: false,
                reason: 'canvas-score-above-last-xronos-score'
            }
        );
    });

    it('blocks an existing Canvas result when the last accepted Xronos raw score is unknown', function() {
        assert.deepStrictEqual(
            policy.latePassbackDecision({
                canvasHasResult: true,
                canvasScore: 0.5,
                candidateRawScore: 0.9
            }),
            {
                allow: false,
                reason: 'unknown-last-submitted-score'
            }
        );
    });
});
