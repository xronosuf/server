'use strict';

var SCORE_TOLERANCE = 1e-4;

function finiteNumber(value) {
    var number = Number(value);
    return isFinite(number) ? number : null;
}

function validDate(value) {
    if (!value) {
        return null;
    }

    var date = new Date(value);
    return isFinite(date.getTime()) ? date : null;
}

function sameNumber(a, b) {
    var left = finiteNumber(a);
    var right = finiteNumber(b);

    return left !== null &&
        right !== null &&
        Math.abs(left - right) <= SCORE_TOLERANCE;
}

function successfulSubmission(bridge) {
    if (!bridge || bridge.submissionSubmittedAtAccepted !== true) {
        return null;
    }

    var resultScore = finiteNumber(
        bridge.lastSuccessfulSubmittedResultScore
    );
    var resultTotalScore = finiteNumber(
        bridge.lastSuccessfulSubmittedResultTotalScore
    );
    var observedAt = validDate(
        bridge.lastSuccessfulSubmittedObservedAt
    );

    if (
        resultScore !== null &&
        resultTotalScore !== null &&
        observedAt
    ) {
        return {
            resultScore: resultScore,
            resultTotalScore: resultTotalScore,
            observedAt: observedAt
        };
    }

    /*
     * Rollout compatibility: older bridges recorded the raw accepted score,
     * but not the exact submittedAt value. Recover that timestamp only when a
     * trusted stored candidate has the same raw result. Never use
     * lastSubmittedAt here; that is the server acceptance time, not the
     * student's trusted score-observation time.
     */
    var legacyScore = finiteNumber(bridge.lastSubmittedResultScore);
    var legacyTotal = finiteNumber(
        bridge.lastSubmittedResultTotalScore
    );

    if (legacyScore === null || legacyTotal === null) {
        return null;
    }

    var candidates = [
        bridge.dueBoundaryCandidate,
        bridge.untilBoundaryCandidate
    ].concat(bridge.recentBestScoreObservations || []);

    for (var i = 0; i < candidates.length; i += 1) {
        var candidate = candidates[i];
        var candidateObservedAt =
            candidate && validDate(candidate.observedAt);

        if (
            candidate &&
            candidateObservedAt &&
            sameNumber(candidate.resultScore, legacyScore) &&
            sameNumber(candidate.resultTotalScore, legacyTotal)
        ) {
            return {
                resultScore: legacyScore,
                resultTotalScore: legacyTotal,
                observedAt: candidateObservedAt
            };
        }
    }

    return null;
}

function candidateSubmittedAt(bridge, candidate) {
    if (
        !bridge ||
        bridge.submissionSubmittedAtAccepted !== true ||
        !candidate
    ) {
        return null;
    }

    var observedAt = validDate(candidate.observedAt);
    return observedAt ? observedAt.toISOString() : null;
}

function canvasDidNotDecrease(beforeScore, afterScore) {
    var before = finiteNumber(beforeScore);
    var after = finiteNumber(afterScore);

    if (before === null || after === null) {
        return false;
    }

    return after + SCORE_TOLERANCE >= before;
}

function applySuccessfulSubmission(
    bridge,
    candidate,
    submittedAt,
    acceptedAt
) {
    if (!bridge || !candidate) {
        return bridge;
    }

    var observedAt = validDate(submittedAt);

    bridge.submittedScore = true;
    bridge.lastSubmittedResultScore = candidate.resultScore;
    bridge.lastSubmittedResultTotalScore =
        candidate.resultTotalScore;
    bridge.lastSubmittedAt =
        acceptedAt instanceof Date
            ? acceptedAt
            : new Date(acceptedAt || Date.now());

    bridge.lastSuccessfulSubmittedResultScore =
        candidate.resultScore;
    bridge.lastSuccessfulSubmittedResultTotalScore =
        candidate.resultTotalScore;
    bridge.lastSuccessfulSubmittedObservedAt =
        observedAt || undefined;

    return bridge;
}

exports.SCORE_TOLERANCE = SCORE_TOLERANCE;
exports.applySuccessfulSubmission = applySuccessfulSubmission;
exports.candidateSubmittedAt = candidateSubmittedAt;
exports.canvasDidNotDecrease = canvasDidNotDecrease;
exports.successfulSubmission = successfulSubmission;
