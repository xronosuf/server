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

function observation(raw, effective, intervals, bridgeId) {
    return {
        rawScore: raw,
        effectiveScore: effective,
        lateIntervals: intervals,
        bridge: bridgeId || 'bridge-1'
    };
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

    it('normalizes the actual Canvas raw-point basis', function() {
        assert.strictEqual(
            policy.normalizedRawScore(8.21, 10),
            0.821
        );
    });

    it('derives the observed 10 percent lower bound from the Canvas experiment', function() {
        var normalized = policy.normalizeObservation(
            observation(0.821, 0.621, 2)
        );

        assert.ok(normalized);
        assert.ok(
            Math.abs(normalized.deductionLowerBound - 0.1) < 1e-12
        );
    });

    it('treats one effective-score level as a lower bound, not an exact context rate', function() {
        var derived = policy.deriveContextPolicy([
            observation(0.821, 0.621, 2)
        ]);

        assert.strictEqual(derived.usable, true);
        assert.strictEqual(derived.exact, false);
        assert.strictEqual(derived.reason, 'deduction-lower-bound-only');
        assert.ok(
            Math.abs(derived.deductionLowerBound - 0.1) < 1e-12
        );
    });

    it('infers an exact context deduction once effective scores differ', function() {
        var derived = policy.deriveContextPolicy([
            observation(0.821, 0.621, 2, 'bridge-a'),
            observation(0.901, 0.701, 2, 'bridge-a')
        ]);

        assert.strictEqual(derived.usable, true);
        assert.strictEqual(derived.exact, true);
        assert.strictEqual(derived.reason, 'exact-context-deduction');
        assert.ok(
            Math.abs(derived.deductionPerInterval - 0.1) < 1e-12
        );
    });

    it('can infer an exact context deduction across different assignments', function() {
        var derived = policy.deriveContextPolicy([
            observation(0.821, 0.621, 2, 'bridge-a'),
            observation(0.95, 0.75, 2, 'bridge-b')
        ]);

        assert.strictEqual(derived.exact, true);
        assert.ok(
            Math.abs(derived.deductionPerInterval - 0.1) < 1e-12
        );
    });

    it('rejects inconsistent context evidence', function() {
        var derived = policy.deriveContextPolicy([
            observation(0.821, 0.621, 2, 'bridge-a'),
            observation(0.95, 0.70, 2, 'bridge-b'),
            observation(0.90, 0.80, 1, 'bridge-c')
        ]);

        assert.strictEqual(derived.usable, false);
        assert.strictEqual(derived.exact, false);
        assert.strictEqual(derived.reason, 'inconsistent-context-evidence');
    });

    it('allows a first positive late result when Canvas has no result', function() {
        assert.deepStrictEqual(
            policy.latePassbackDecision({
                canvasHasResult: false,
                candidateRawScore: 0.821,
                currentLateIntervals: 2
            }),
            {
                allow: true,
                reason: 'canvas-has-no-result'
            }
        );
    });

    it('uses local evidence to account for the current late interval before writing', function() {
        var decision = policy.latePassbackDecision({
            canvasHasResult: true,
            canvasScore: 0.621,
            candidateRawScore: 0.90,
            currentLateIntervals: 2,
            localObservation: observation(0.821, 0.621, 2)
        });

        assert.strictEqual(decision.allow, true);
        assert.strictEqual(decision.reason, 'safe-from-local-late-evidence');
        assert.ok(Math.abs(decision.predictedFloorlessScore - 0.70) < 1e-12);
        assert.ok(Math.abs(decision.deductionPerIntervalUsed - 0.1) < 1e-12);
    });

    it('blocks a local late update when another day of penalty could lower Canvas', function() {
        var decision = policy.latePassbackDecision({
            canvasHasResult: true,
            canvasScore: 0.621,
            candidateRawScore: 0.90,
            currentLateIntervals: 3,
            localObservation: observation(0.821, 0.621, 2)
        });

        assert.strictEqual(decision.allow, false);
        assert.strictEqual(
            decision.reason,
            'local-evidence-cannot-prove-nonlowering'
        );
        assert.ok(Math.abs(decision.predictedFloorlessScore - 0.60) < 1e-12);
    });

    it('uses an exact context policy for a different assignment', function() {
        var contextPolicy = policy.deriveContextPolicy([
            observation(0.821, 0.621, 2, 'bridge-a'),
            observation(0.901, 0.701, 2, 'bridge-a')
        ]);
        var decision = policy.latePassbackDecision({
            canvasHasResult: true,
            canvasScore: 0.55,
            candidateRawScore: 0.90,
            currentLateIntervals: 3,
            contextPolicy: contextPolicy
        });

        assert.strictEqual(decision.allow, true);
        assert.strictEqual(decision.reason, 'safe-from-exact-context-policy');
        assert.ok(Math.abs(decision.predictedFloorlessScore - 0.60) < 1e-12);
    });

    it('blocks a different assignment when context evidence is only a lower bound', function() {
        var contextPolicy = policy.deriveContextPolicy([
            observation(0.821, 0.621, 2, 'bridge-a')
        ]);
        var decision = policy.latePassbackDecision({
            canvasHasResult: true,
            canvasScore: 0.55,
            candidateRawScore: 0.90,
            currentLateIntervals: 3,
            contextPolicy: contextPolicy
        });

        assert.strictEqual(decision.allow, false);
        assert.strictEqual(decision.reason, 'insufficient-late-policy-evidence');
    });

    it('blocks an exact context write when its current-date prediction is lower', function() {
        var contextPolicy = policy.deriveContextPolicy([
            observation(0.821, 0.621, 2, 'bridge-a'),
            observation(0.901, 0.701, 2, 'bridge-a')
        ]);
        var decision = policy.latePassbackDecision({
            canvasHasResult: true,
            canvasScore: 0.70,
            candidateRawScore: 0.90,
            currentLateIntervals: 3,
            contextPolicy: contextPolicy
        });

        assert.strictEqual(decision.allow, false);
        assert.strictEqual(decision.reason, 'context-policy-predicts-lower-grade');
    });
});
