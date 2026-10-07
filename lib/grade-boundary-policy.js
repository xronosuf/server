'use strict';

var RECENT_BEST_LIMIT = 3;
var DUE_TYPE = 'due';
var UNTIL_TYPE = 'until';
var DUE_SOURCE = 'due-boundary';
var UNTIL_SOURCE = 'until-boundary';

function timeValue(value) {
    if (!value) {
        return null;
    }

    var time = new Date(value).getTime();
    return isFinite(time) ? time : null;
}

function finiteNumber(value) {
    var number;

    if (
        value === undefined ||
        value === null ||
        value === '' ||
        typeof value === 'boolean'
    ) {
        return null;
    }

    number = Number(value);
    return isFinite(number) ? number : null;
}

function boundarySource(type) {
    if (type === DUE_TYPE) {
        return DUE_SOURCE;
    }

    if (type === UNTIL_TYPE) {
        return UNTIL_SOURCE;
    }

    return null;
}

function boundaryField(type) {
    if (type === DUE_TYPE) {
        return 'dueDate';
    }

    if (type === UNTIL_TYPE) {
        return 'untilDate';
    }

    return null;
}

function boundaryObservedField(type) {
    if (type === DUE_TYPE) {
        return 'dueDateObservedAt';
    }

    if (type === UNTIL_TYPE) {
        return 'untilDateObservedAt';
    }

    return null;
}

function boundaryAt(bridge, type) {
    var field = boundaryField(type);
    return field ? timeValue(bridge && bridge[field]) : null;
}

function normalizeObservation(observation) {
    observation = observation || {};

    var resultScore = finiteNumber(observation.resultScore);
    var resultTotalScore = finiteNumber(observation.resultTotalScore);
    var observedAt = timeValue(observation.observedAt);

    if (
        resultScore === null ||
        resultTotalScore === null ||
        observedAt === null
    ) {
        return null;
    }

    return {
        resultScore: resultScore,
        resultTotalScore: resultTotalScore,
        pointsEarned: finiteNumber(observation.pointsEarned),
        pointsPossible: finiteNumber(observation.pointsPossible),
        observedAt: new Date(observedAt)
    };
}

function observationFromBridge(bridge) {
    if (!bridge) {
        return null;
    }

    return normalizeObservation({
        resultScore: bridge.resultScore,
        resultTotalScore: bridge.resultTotalScore,
        pointsEarned: bridge.resultPointsEarned,
        pointsPossible: bridge.resultPointsPossible,
        observedAt: bridge.resultScoreObservedAt
    });
}

function appendRecentBest(existing, observation, limit) {
    var normalized = normalizeObservation(observation);
    var values = (existing || [])
        .map(normalizeObservation)
        .filter(function(value) {
            return value !== null;
        });

    limit = limit || RECENT_BEST_LIMIT;

    if (!normalized) {
        return values.slice(0, limit);
    }

    values = values.filter(function(value) {
        return value.observedAt.getTime() !== normalized.observedAt.getTime();
    });

    values.unshift(normalized);
    values.sort(function(a, b) {
        return b.observedAt.getTime() - a.observedAt.getTime();
    });

    return values.slice(0, limit);
}

function bridgeObservations(bridge) {
    var values = (bridge && bridge.recentBestScoreObservations || [])
        .map(normalizeObservation)
        .filter(function(value) {
            return value !== null;
        });
    var current = observationFromBridge(bridge);

    if (current) {
        values = appendRecentBest(values, current, RECENT_BEST_LIMIT + 1);
    }

    return values;
}

function bestObservationAtOrBefore(bridge, boundary) {
    var boundaryTime = timeValue(boundary);

    if (boundaryTime === null) {
        return null;
    }

    var eligible = bridgeObservations(bridge)
        .filter(function(observation) {
            return observation.observedAt.getTime() <= boundaryTime;
        })
        .sort(function(a, b) {
            if (b.resultTotalScore !== a.resultTotalScore) {
                return b.resultTotalScore - a.resultTotalScore;
            }

            return b.observedAt.getTime() - a.observedAt.getTime();
        });

    return eligible.length ? eligible[0] : null;
}

function dateWasKnownByBoundary(bridge, type) {
    var observedField = boundaryObservedField(type);
    var boundaryTime = boundaryAt(bridge, type);
    var knownAt = timeValue(
        observedField && bridge && bridge[observedField]
    );

    return (
        boundaryTime !== null &&
        knownAt !== null &&
        knownAt <= boundaryTime
    );
}

function boundaryDescriptor(bridge, type) {
    var at = boundaryAt(bridge, type);

    if (at === null) {
        return null;
    }

    return {
        type: type,
        source: boundarySource(type),
        boundaryAt: new Date(at),
        dateObservedAt: bridge && bridge[boundaryObservedField(type)] || null,
        knownBeforeBoundary: dateWasKnownByBoundary(bridge, type)
    };
}

function descriptors(bridge) {
    return [DUE_TYPE, UNTIL_TYPE]
        .map(function(type) {
            return boundaryDescriptor(bridge, type);
        })
        .filter(function(value) {
            return value !== null;
        });
}

exports.RECENT_BEST_LIMIT = RECENT_BEST_LIMIT;
exports.DUE_TYPE = DUE_TYPE;
exports.UNTIL_TYPE = UNTIL_TYPE;
exports.DUE_SOURCE = DUE_SOURCE;
exports.UNTIL_SOURCE = UNTIL_SOURCE;
exports.timeValue = timeValue;
exports.boundarySource = boundarySource;
exports.boundaryField = boundaryField;
exports.boundaryObservedField = boundaryObservedField;
exports.boundaryAt = boundaryAt;
exports.normalizeObservation = normalizeObservation;
exports.observationFromBridge = observationFromBridge;
exports.appendRecentBest = appendRecentBest;
exports.bridgeObservations = bridgeObservations;
exports.bestObservationAtOrBefore = bestObservationAtOrBefore;
exports.dateWasKnownByBoundary = dateWasKnownByBoundary;
exports.boundaryDescriptor = boundaryDescriptor;
exports.descriptors = descriptors;
