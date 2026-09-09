'use strict';

var DAY_MS = 24 * 60 * 60 * 1000;
var DEFAULT_FALLBACK_DAYS = 130;
var DEFAULT_BOUNDARY_BUFFER_MS = 5 * 60 * 1000;
var EPSILON = 1e-9;
var EVIDENCE_TOLERANCE = 1e-6;

function timeValue(value) {
    if (!value) {
        return null;
    }

    var valueTime = new Date(value).getTime();

    return isFinite(valueTime) ? valueTime : null;
}

function bridgeIsBeforeDueDate(bridge, now) {
    var due = timeValue(bridge && bridge.dueDate);

    now = now === undefined ? Date.now() : now;

    return due === null || now <= due;
}

function bridgeIsLate(bridge, now) {
    var due = timeValue(bridge && bridge.dueDate);

    now = now === undefined ? Date.now() : now;

    return due !== null && now > due;
}

function passbackWindowEnd(bridge, fallbackDays) {
    var until = timeValue(bridge && bridge.untilDate);
    var due = timeValue(bridge && bridge.dueDate);

    fallbackDays = fallbackDays === undefined
        ? DEFAULT_FALLBACK_DAYS
        : fallbackDays;

    if (until !== null) {
        return {
            time: until,
            source: 'canvas-until'
        };
    }

    if (due !== null) {
        return {
            time: due + fallbackDays * DAY_MS,
            source: 'fallback-after-due'
        };
    }

    return {
        time: null,
        source: 'no-end-date'
    };
}

function bridgeIsPassbackWindowOpen(bridge, now, fallbackDays) {
    var end = passbackWindowEnd(bridge, fallbackDays);

    now = now === undefined ? Date.now() : now;

    return end.time === null || now <= end.time;
}

function lateIntervalNumber(bridge, now) {
    var due = timeValue(bridge && bridge.dueDate);

    now = now === undefined ? Date.now() : now;

    if (due === null || now <= due) {
        return 0;
    }

    return Math.ceil((now - due) / DAY_MS);
}

function nextLateIntervalBoundary(bridge, now) {
    var due = timeValue(bridge && bridge.dueDate);
    var interval = lateIntervalNumber(bridge, now);

    now = now === undefined ? Date.now() : now;

    if (due === null || interval === 0) {
        return null;
    }

    return due + interval * DAY_MS;
}

function lateBoundaryDecision(bridge, now, bufferMs) {
    var boundary;
    var remaining;

    now = now === undefined ? Date.now() : now;
    bufferMs = bufferMs === undefined
        ? DEFAULT_BOUNDARY_BUFFER_MS
        : bufferMs;

    if (!bridgeIsLate(bridge, now)) {
        return {
            defer: false,
            reason: 'not-late',
            retryAt: null
        };
    }

    boundary = nextLateIntervalBoundary(bridge, now);

    if (boundary === null) {
        return {
            defer: false,
            reason: 'no-boundary',
            retryAt: null
        };
    }

    remaining = boundary - now;

    if (remaining > 0 && remaining <= bufferMs) {
        return {
            defer: true,
            reason: 'late-interval-boundary',
            retryAt: boundary + 5000
        };
    }

    return {
        defer: false,
        reason: 'safe-interval',
        retryAt: null
    };
}

function finiteScore(value) {
    var number = Number(value);

    return isFinite(number) ? number : null;
}

function normalizedRawScore(resultTotalScore, pointsPossible) {
    var total = finiteScore(resultTotalScore);
    var possible = finiteScore(pointsPossible);

    if (total === null || possible === null || possible <= 0) {
        return null;
    }

    return total / possible;
}

function normalizeObservation(observation) {
    observation = observation || {};

    var raw = finiteScore(observation.rawScore);
    var effective = finiteScore(observation.effectiveScore);
    var intervals = Number(observation.lateIntervals);

    if (
        raw === null ||
        effective === null ||
        !isFinite(intervals) ||
        intervals <= 0 ||
        Math.floor(intervals) !== intervals ||
        effective > raw + EVIDENCE_TOLERANCE
    ) {
        return null;
    }

    return {
        rawScore: raw,
        effectiveScore: effective,
        lateIntervals: intervals,
        deductionLowerBound: Math.max(0, (raw - effective) / intervals),
        bridge: observation.bridge,
        observedAt: observation.observedAt
    };
}

function deriveContextPolicy(observations) {
    var valid = (observations || [])
        .map(normalizeObservation)
        .filter(function(observation) {
            return observation !== null;
        });

    if (valid.length === 0) {
        return {
            usable: false,
            exact: false,
            reason: 'no-valid-context-evidence',
            deductionPerInterval: null,
            evidenceCount: 0
        };
    }

    var minimumEffective = valid.reduce(function(minimum, observation) {
        return Math.min(minimum, observation.effectiveScore);
    }, Infinity);

    var definitelyNotFloored = valid.filter(function(observation) {
        return observation.effectiveScore >
            minimumEffective + EVIDENCE_TOLERANCE;
    });

    if (definitelyNotFloored.length === 0) {
        return {
            usable: true,
            exact: false,
            reason: 'deduction-lower-bound-only',
            deductionPerInterval: null,
            deductionLowerBound: valid.reduce(function(maximum, observation) {
                return Math.max(maximum, observation.deductionLowerBound);
            }, 0),
            minimumObservedEffectiveScore: minimumEffective,
            evidenceCount: valid.length
        };
    }

    var deduction = definitelyNotFloored[0].deductionLowerBound;
    var inconsistent = definitelyNotFloored.some(function(observation) {
        return Math.abs(observation.deductionLowerBound - deduction) >
            EVIDENCE_TOLERANCE;
    });

    if (!inconsistent) {
        inconsistent = valid.some(function(observation) {
            var floorless = observation.rawScore -
                observation.lateIntervals * deduction;

            if (
                observation.effectiveScore >
                minimumEffective + EVIDENCE_TOLERANCE
            ) {
                return Math.abs(floorless - observation.effectiveScore) >
                    EVIDENCE_TOLERANCE;
            }

            return floorless >
                observation.effectiveScore + EVIDENCE_TOLERANCE;
        });
    }

    if (inconsistent) {
        return {
            usable: false,
            exact: false,
            reason: 'inconsistent-context-evidence',
            deductionPerInterval: null,
            evidenceCount: valid.length
        };
    }

    return {
        usable: true,
        exact: true,
        reason: 'exact-context-deduction',
        deductionPerInterval: deduction,
        minimumObservedEffectiveScore: minimumEffective,
        evidenceCount: valid.length
    };
}

function sameEffectiveScore(a, b) {
    return Math.abs(a - b) <= EVIDENCE_TOLERANCE;
}

function localObservationDecision(options) {
    var observation = normalizeObservation(options.localObservation);
    var canvasScore = finiteScore(options.canvasScore);
    var candidateRawScore = finiteScore(options.candidateRawScore);
    var currentLateIntervals = Number(options.currentLateIntervals);

    if (
        !observation ||
        canvasScore === null ||
        candidateRawScore === null ||
        !isFinite(currentLateIntervals) ||
        currentLateIntervals <= 0 ||
        Math.floor(currentLateIntervals) !== currentLateIntervals
    ) {
        return null;
    }

    if (!sameEffectiveScore(canvasScore, observation.effectiveScore)) {
        return null;
    }

    if (candidateRawScore <= observation.rawScore + EPSILON) {
        return {
            allow: false,
            reason: 'candidate-not-higher-than-local-evidence',
            predictedFloorlessScore: null
        };
    }

    var predictedFloorless = candidateRawScore -
        currentLateIntervals * observation.deductionLowerBound;

    return {
        allow: predictedFloorless + EVIDENCE_TOLERANCE >= canvasScore,
        reason:
            predictedFloorless + EVIDENCE_TOLERANCE >= canvasScore
                ? 'safe-from-local-late-evidence'
                : 'local-evidence-cannot-prove-nonlowering',
        predictedFloorlessScore: predictedFloorless,
        deductionPerIntervalUsed: observation.deductionLowerBound
    };
}

function contextPolicyDecision(options) {
    var policy = options.contextPolicy || {};
    var canvasScore = finiteScore(options.canvasScore);
    var candidateRawScore = finiteScore(options.candidateRawScore);
    var currentLateIntervals = Number(options.currentLateIntervals);

    if (
        !policy.usable ||
        !policy.exact ||
        !isFinite(Number(policy.deductionPerInterval)) ||
        canvasScore === null ||
        candidateRawScore === null ||
        !isFinite(currentLateIntervals) ||
        currentLateIntervals <= 0 ||
        Math.floor(currentLateIntervals) !== currentLateIntervals
    ) {
        return null;
    }

    var deduction = Number(policy.deductionPerInterval);
    var predictedFloorless = candidateRawScore -
        currentLateIntervals * deduction;

    return {
        allow: predictedFloorless + EVIDENCE_TOLERANCE >= canvasScore,
        reason:
            predictedFloorless + EVIDENCE_TOLERANCE >= canvasScore
                ? 'safe-from-exact-context-policy'
                : 'context-policy-predicts-lower-grade',
        predictedFloorlessScore: predictedFloorless,
        deductionPerIntervalUsed: deduction
    };
}

function latePassbackDecision(options) {
    options = options || {};

    var candidateRawScore = finiteScore(options.candidateRawScore);
    var canvasScore = finiteScore(options.canvasScore);

    if (candidateRawScore === null) {
        return {
            allow: false,
            reason: 'invalid-candidate-score'
        };
    }

    if (!options.canvasHasResult) {
        return {
            allow: candidateRawScore > 0,
            reason: candidateRawScore > 0
                ? 'canvas-has-no-result'
                : 'zero-first-result'
        };
    }

    if (canvasScore === null) {
        return {
            allow: false,
            reason: 'invalid-canvas-score'
        };
    }

    var localDecision = localObservationDecision(options);

    if (localDecision) {
        return localDecision;
    }

    var contextDecision = contextPolicyDecision(options);

    if (contextDecision) {
        return contextDecision;
    }

    if (
        options.contextPolicy &&
        options.contextPolicy.reason === 'inconsistent-context-evidence'
    ) {
        return {
            allow: false,
            reason: 'inconsistent-context-evidence'
        };
    }

    return {
        allow: false,
        reason: 'insufficient-late-policy-evidence'
    };
}

exports.DAY_MS = DAY_MS;
exports.DEFAULT_FALLBACK_DAYS = DEFAULT_FALLBACK_DAYS;
exports.DEFAULT_BOUNDARY_BUFFER_MS = DEFAULT_BOUNDARY_BUFFER_MS;
exports.EVIDENCE_TOLERANCE = EVIDENCE_TOLERANCE;
exports.bridgeIsBeforeDueDate = bridgeIsBeforeDueDate;
exports.bridgeIsLate = bridgeIsLate;
exports.passbackWindowEnd = passbackWindowEnd;
exports.bridgeIsPassbackWindowOpen = bridgeIsPassbackWindowOpen;
exports.lateIntervalNumber = lateIntervalNumber;
exports.nextLateIntervalBoundary = nextLateIntervalBoundary;
exports.lateBoundaryDecision = lateBoundaryDecision;
exports.normalizedRawScore = normalizedRawScore;
exports.normalizeObservation = normalizeObservation;
exports.deriveContextPolicy = deriveContextPolicy;
exports.latePassbackDecision = latePassbackDecision;
