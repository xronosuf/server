var assert = require('assert');
var policy = require('../lib/late-grade-policy');
var evidence = require('../lib/late-grade-evidence');

function assertClose(actual, expected) {
    assert.ok(
        Math.abs(actual - expected) < policy.EVIDENCE_TOLERANCE,
        'expected ' + actual + ' to be close to ' + expected
    );
}

function postWrite(raw, effective, intervals, bridge) {
    return {
        rawScore: raw,
        effectiveScore: effective,
        lateIntervals: intervals,
        bridge: bridge || 'bridge-1',
        source: 'post-write-read-result'
    };
}

describe('authoritative Canvas late-policy evidence', function() {
    it('does not let a pre-write Canvas value teach the context policy', function() {
        var documents = [
            postWrite(0.869, 0.669, 2),
            {
                rawScore: 0.898,
                effectiveScore: 0.350,
                lateIntervals: 6,
                bridge: 'bridge-1',
                source: 'pre-write-read-result'
            },
            postWrite(0.936, 0.336, 6)
        ];

        var policyEvidence = evidence.policyObservations(documents);
        var derived = policy.deriveContextPolicy(policyEvidence);

        assert.strictEqual(policyEvidence.length, 2);
        assert.strictEqual(derived.usable, true);
        assert.strictEqual(derived.exact, true);
        assert.strictEqual(derived.reason, 'exact-context-deduction');
        assertClose(derived.deductionPerInterval, 0.10);
    });

    it('blocks the reproduced 3.50 to 3.36 lowering case', function() {
        var contextPolicy = policy.deriveContextPolicy([
            postWrite(0.869, 0.669, 2),
            postWrite(0.879, 0.279, 6)
        ]);

        var misleadingLocalObservation = {
            rawScore: 0.898,
            effectiveScore: 0.350,
            lateIntervals: 6,
            bridge: 'bridge-1',
            source: 'pre-write-read-result'
        };

        var decision = policy.latePassbackDecision({
            canvasHasResult: true,
            canvasScore: 0.350,
            candidateRawScore: 0.936,
            currentLateIntervals: 6,
            localObservation: misleadingLocalObservation,
            contextPolicy: contextPolicy
        });

        assert.strictEqual(decision.allow, false);
        assert.strictEqual(
            decision.reason,
            'context-policy-predicts-lower-grade'
        );
        assertClose(decision.predictedFloorlessScore, 0.336);
        assertClose(decision.deductionPerIntervalUsed, 0.10);
    });

    it('refuses to use a pre-write observation as standalone local policy evidence', function() {
        var decision = policy.latePassbackDecision({
            canvasHasResult: true,
            canvasScore: 0.350,
            candidateRawScore: 0.936,
            currentLateIntervals: 6,
            localObservation: {
                rawScore: 0.898,
                effectiveScore: 0.350,
                lateIntervals: 6,
                bridge: 'bridge-1',
                source: 'pre-write-read-result'
            }
        });

        assert.strictEqual(decision.allow, false);
        assert.strictEqual(
            decision.reason,
            'insufficient-late-policy-evidence'
        );
    });

    it('still allows matching immediate post-write local evidence when no exact context policy exists', function() {
        var decision = policy.latePassbackDecision({
            canvasHasResult: true,
            canvasScore: 0.621,
            candidateRawScore: 0.900,
            currentLateIntervals: 2,
            localObservation: postWrite(0.821, 0.621, 2)
        });

        assert.strictEqual(decision.allow, true);
        assert.strictEqual(
            decision.reason,
            'safe-from-local-late-evidence'
        );
        assertClose(decision.predictedFloorlessScore, 0.700);
    });

    it('lets exact context evidence override a weaker local estimate even when both are sourced post-write', function() {
        var contextPolicy = policy.deriveContextPolicy([
            postWrite(0.869, 0.669, 2),
            postWrite(0.879, 0.279, 6)
        ]);

        var decision = policy.latePassbackDecision({
            canvasHasResult: true,
            canvasScore: 0.350,
            candidateRawScore: 0.936,
            currentLateIntervals: 6,
            localObservation: postWrite(0.898, 0.350, 6),
            contextPolicy: contextPolicy
        });

        assert.strictEqual(decision.allow, false);
        assert.strictEqual(
            decision.reason,
            'context-policy-predicts-lower-grade'
        );
        assertClose(decision.predictedFloorlessScore, 0.336);
    });
});
