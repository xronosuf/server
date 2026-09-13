'use strict';

var lateGradePolicy = require('./late-grade-policy');

var AUTHORITATIVE_POLICY_SOURCE = 'post-write-read-result';

function contextIdentity(bridge) {
    if (
        !bridge ||
        !bridge.toolConsumerInstanceGuid ||
        !bridge.contextId
    ) {
        return null;
    }

    return {
        toolConsumerInstanceGuid: bridge.toolConsumerInstanceGuid,
        contextId: bridge.contextId
    };
}

function candidateRawScore(bridge) {
    return lateGradePolicy.normalizedRawScore(
        bridge && bridge.resultTotalScore,
        bridge && bridge.pointsPossible
    );
}

function lastSubmittedRawScore(bridge) {
    return lateGradePolicy.normalizedRawScore(
        bridge && bridge.lastSubmittedResultTotalScore,
        bridge && bridge.pointsPossible
    );
}

function observationFromLastSubmission(bridge, effectiveScore) {
    var identity = contextIdentity(bridge);
    var rawScore = lastSubmittedRawScore(bridge);
    var submittedAt = bridge && bridge.lastSubmittedAt;
    var lateIntervals;

    if (!identity || rawScore === null || !submittedAt) {
        return null;
    }

    lateIntervals = lateGradePolicy.lateIntervalNumber(
        bridge,
        new Date(submittedAt).getTime()
    );

    if (lateIntervals <= 0) {
        return null;
    }

    /*
     * This is intentionally retained as diagnostic history only. A later
     * Canvas readResult can differ from the last Xronos submission because of
     * an instructor edit, a due-date change, or another Canvas-side action.
     * It therefore must never teach the late-policy model.
     */
    return {
        toolConsumerInstanceGuid: identity.toolConsumerInstanceGuid,
        contextId: identity.contextId,
        bridge: bridge._id,
        rawScore: rawScore,
        effectiveScore: Number(effectiveScore),
        lateIntervals: lateIntervals,
        observedAt: new Date(),
        source: 'pre-write-read-result'
    };
}

function observationFromAcceptedLatePassback(
    bridge,
    rawScore,
    effectiveScore,
    lateIntervals,
    observedAt
) {
    var identity = contextIdentity(bridge);

    if (!identity) {
        return null;
    }

    return {
        toolConsumerInstanceGuid: identity.toolConsumerInstanceGuid,
        contextId: identity.contextId,
        bridge: bridge._id,
        rawScore: Number(rawScore),
        effectiveScore: Number(effectiveScore),
        lateIntervals: Number(lateIntervals),
        observedAt: observedAt || new Date(),
        source: AUTHORITATIVE_POLICY_SOURCE
    };
}

function isAuthoritativePolicyObservation(document) {
    return !!(
        document &&
        document.source === AUTHORITATIVE_POLICY_SOURCE
    );
}

function policyObservations(documents) {
    return (documents || [])
        .filter(isAuthoritativePolicyObservation)
        .map(function(document) {
            return {
                rawScore: document.rawScore,
                effectiveScore: document.effectiveScore,
                lateIntervals: document.lateIntervals,
                bridge: document.bridge,
                observedAt: document.observedAt,
                source: document.source
            };
        });
}

exports.AUTHORITATIVE_POLICY_SOURCE = AUTHORITATIVE_POLICY_SOURCE;
exports.contextIdentity = contextIdentity;
exports.candidateRawScore = candidateRawScore;
exports.lastSubmittedRawScore = lastSubmittedRawScore;
exports.observationFromLastSubmission = observationFromLastSubmission;
exports.observationFromAcceptedLatePassback =
    observationFromAcceptedLatePassback;
exports.isAuthoritativePolicyObservation = isAuthoritativePolicyObservation;
exports.policyObservations = policyObservations;
