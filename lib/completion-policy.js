'use strict';

/*
 * Completion is historical credit, not the state of the current working
 * attempt.  Ordinary student actions (including Erase and Another) may lower
 * the current page-state calculation, but they must never lower the stored
 * completion earned for an activity.
 */

function normalize(value) {
    var number = parseFloat(value);

    if (!isFinite(number)) {
        return null;
    }

    return Math.max(0, Math.min(1, number));
}

function maximum(previous, incoming) {
    var previousValue = normalize(previous);
    var incomingValue = normalize(incoming);

    if (incomingValue === null) {
        return previousValue;
    }

    if (previousValue === null) {
        return incomingValue;
    }

    return Math.max(previousValue, incomingValue);
}

exports.normalize = normalize;
exports.maximum = maximum;
