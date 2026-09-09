'use strict';

var DAY_MS = 24 * 60 * 60 * 1000;
var DEFAULT_FALLBACK_DAYS = 130;
var DEFAULT_BOUNDARY_BUFFER_MS = 5 * 60 * 1000;
var EPSILON = 1e-9;

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

function latePassbackDecision(options) {
    options = options || {};

    var candidateRawScore = finiteScore(options.candidateRawScore);
    var lastSubmittedRawScore = finiteScore(options.lastSubmittedRawScore);
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

    if (lastSubmittedRawScore === null) {
        return {
            allow: false,
            reason: 'unknown-last-submitted-score'
        };
    }

    if (canvasScore > lastSubmittedRawScore + EPSILON) {
        return {
            allow: false,
            reason: 'canvas-score-above-last-xronos-score'
        };
    }

    if (candidateRawScore <= lastSubmittedRawScore + EPSILON) {
        return {
            allow: false,
            reason: 'candidate-not-higher'
        };
    }

    return {
        allow: true,
        reason: 'monotonic-raw-increase'
    };
}

exports.DAY_MS = DAY_MS;
exports.DEFAULT_FALLBACK_DAYS = DEFAULT_FALLBACK_DAYS;
exports.DEFAULT_BOUNDARY_BUFFER_MS = DEFAULT_BOUNDARY_BUFFER_MS;
exports.bridgeIsBeforeDueDate = bridgeIsBeforeDueDate;
exports.bridgeIsLate = bridgeIsLate;
exports.passbackWindowEnd = passbackWindowEnd;
exports.bridgeIsPassbackWindowOpen = bridgeIsPassbackWindowOpen;
exports.lateIntervalNumber = lateIntervalNumber;
exports.nextLateIntervalBoundary = nextLateIntervalBoundary;
exports.lateBoundaryDecision = lateBoundaryDecision;
exports.latePassbackDecision = latePassbackDecision;
