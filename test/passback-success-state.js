'use strict';

var assert = require('assert');
var state = require('../lib/passback-success-state');

describe('Canvas passback successful-submission state', function() {
    it('prefers the explicit last-known-good outbound payload', function() {
        var saved = state.successfulSubmission({
            submissionSubmittedAtAccepted: true,
            lastSuccessfulSubmittedResultScore: 0.8,
            lastSuccessfulSubmittedResultTotalScore: 8,
            lastSuccessfulSubmittedObservedAt:
                new Date('2026-10-13T18:00:00.000Z')
        });

        assert.strictEqual(saved.resultScore, 0.8);
        assert.strictEqual(saved.resultTotalScore, 8);
        assert.strictEqual(
            saved.observedAt.toISOString(),
            '2026-10-13T18:00:00.000Z'
        );
    });

    it('can recover a rollout bridge from a matching trusted boundary candidate', function() {
        var saved = state.successfulSubmission({
            submissionSubmittedAtAccepted: true,
            lastSubmittedResultScore: 0.35,
            lastSubmittedResultTotalScore: 35,
            dueBoundaryCandidate: {
                resultScore: 0.35,
                resultTotalScore: 35,
                observedAt:
                    new Date('2026-10-14T17:58:26.041Z')
            }
        });

        assert.ok(saved);
        assert.strictEqual(saved.resultScore, 0.35);
        assert.strictEqual(saved.resultTotalScore, 35);
        assert.strictEqual(
            saved.observedAt.toISOString(),
            '2026-10-14T17:58:26.041Z'
        );
    });

    it('refuses a legacy rollback when the trusted timestamp cannot be reconstructed', function() {
        assert.strictEqual(
            state.successfulSubmission({
                submissionSubmittedAtAccepted: true,
                lastSubmittedResultScore: 0.35,
                lastSubmittedResultTotalScore: 35,
                lastSubmittedAt:
                    new Date('2026-10-14T18:01:27.000Z')
            }),
            null
        );
    });

    it('does not expose rollback state when Canvas did not advertise submittedAt support', function() {
        assert.strictEqual(
            state.successfulSubmission({
                submissionSubmittedAtAccepted: false,
                lastSuccessfulSubmittedResultScore: 0.8,
                lastSuccessfulSubmittedResultTotalScore: 8,
                lastSuccessfulSubmittedObservedAt:
                    new Date('2026-10-13T18:00:00.000Z')
            }),
            null
        );
    });

    it('advances explicit successful state only when the caller asks it to', function() {
        var bridge = {};
        var candidate = {
            resultScore: 0.9,
            resultTotalScore: 9
        };

        state.applySuccessfulSubmission(
            bridge,
            candidate,
            '2026-10-14T18:20:00.000Z',
            new Date('2026-10-14T18:20:03.000Z')
        );

        assert.strictEqual(
            bridge.lastSuccessfulSubmittedResultScore,
            0.9
        );
        assert.strictEqual(
            bridge.lastSuccessfulSubmittedResultTotalScore,
            9
        );
        assert.strictEqual(
            bridge.lastSuccessfulSubmittedObservedAt.toISOString(),
            '2026-10-14T18:20:00.000Z'
        );
        assert.strictEqual(
            bridge.lastSubmittedAt.toISOString(),
            '2026-10-14T18:20:03.000Z'
        );
    });

    it('treats an equal or higher Canvas readback as non-lowering', function() {
        assert.strictEqual(
            state.canvasDidNotDecrease(0.70, 0.70),
            true
        );
        assert.strictEqual(
            state.canvasDidNotDecrease(0.70, 0.71),
            true
        );
        assert.strictEqual(
            state.canvasDidNotDecrease(0.70, 0.69),
            false
        );
    });
});
