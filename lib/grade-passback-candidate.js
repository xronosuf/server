'use strict';

var gradeBoundaryPolicy = require('./grade-boundary-policy');

function controllingBoundaryType(passbackWindow) {
    if (!passbackWindow) {
        return null;
    }

    if (passbackWindow.source === 'canvas-until') {
        return gradeBoundaryPolicy.UNTIL_TYPE;
    }

    if (passbackWindow.source === 'xronos-due-date-setting') {
        return gradeBoundaryPolicy.DUE_TYPE;
    }

    return null;
}

function currentCandidate(bridge) {
    return gradeBoundaryPolicy.observationFromBridge(bridge);
}

/*
 * Select the Xronos observation that is allowed to participate in this
 * particular Canvas delivery.
 *
 * Before the passback window closes, the newest best observation is the
 * candidate. After a real Canvas Due/Until boundary closes, only a trusted
 * observation at or before that exact boundary may be delivered, and only
 * when Xronos knew that boundary value before it occurred.
 *
 * This deliberately does not reconstruct retroactive date changes from
 * ordinary milestones. Reconstruction is audit evidence, not permission to
 * write a historical grade back to Canvas automatically.
 */
function select(bridge, passbackWindow, now) {
    var nowTime = gradeBoundaryPolicy.timeValue(now);
    var boundaryType;
    var candidate;

    if (nowTime === null) {
        nowTime = Date.now();
    }

    if (
        !passbackWindow ||
        passbackWindow.time === null ||
        passbackWindow.time === undefined ||
        nowTime <= Number(passbackWindow.time)
    ) {
        candidate = currentCandidate(bridge);

        return {
            eligible: !!candidate,
            reason: candidate ? 'current-candidate' : 'no-current-candidate',
            boundaryBackedDelivery: false,
            boundaryType: null,
            boundaryAt: null,
            candidate: candidate
        };
    }

    boundaryType = controllingBoundaryType(passbackWindow);

    if (!boundaryType) {
        return {
            eligible: false,
            reason: 'closed-nonboundary-window',
            boundaryBackedDelivery: false,
            boundaryType: null,
            boundaryAt: passbackWindow.time,
            candidate: null
        };
    }

    if (
        !gradeBoundaryPolicy.dateWasKnownByBoundary(
            bridge,
            boundaryType
        )
    ) {
        return {
            eligible: false,
            reason: 'retroactive-boundary',
            boundaryBackedDelivery: true,
            boundaryType: boundaryType,
            boundaryAt: passbackWindow.time,
            candidate: null
        };
    }

    candidate = gradeBoundaryPolicy.bestObservationAtOrBefore(
        bridge,
        new Date(passbackWindow.time)
    );

    return {
        eligible: !!candidate,
        reason: candidate
            ? 'trusted-pre-boundary-candidate'
            : 'no-trusted-pre-boundary-candidate',
        boundaryBackedDelivery: true,
        boundaryType: boundaryType,
        boundaryAt: passbackWindow.time,
        candidate: candidate
    };
}

exports.controllingBoundaryType = controllingBoundaryType;
exports.currentCandidate = currentCandidate;
exports.select = select;
