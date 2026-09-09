'use strict';

var lateGradePolicy = require('./late-grade-policy');

function finitePositive(value) {
    var number = Number(value);

    return isFinite(number) && number > 0;
}

function bridgeHasGradePassback(bridge) {
    return !!(
        bridge &&
        bridge.lisResultSourcedid &&
        bridge.lisOutcomeServiceUrl &&
        finitePositive(bridge.pointsPossible)
    );
}

function bridgeIsOpen(bridge, now) {
    return lateGradePolicy.bridgeIsPassbackWindowOpen(
        bridge,
        now
    );
}

function bridgeId(bridge) {
    if (!bridge || bridge._id === undefined || bridge._id === null) {
        return undefined;
    }

    return bridge._id.toString();
}

function queuedLookup(queuedBridgeIds) {
    var lookup = {};

    (queuedBridgeIds || []).forEach(function(id) {
        if (id !== undefined && id !== null) {
            lookup[id.toString()] = true;
        }
    });

    return lookup;
}

function build(bridges, queuedBridgeIds, now) {
    bridges = bridges || [];
    now = now || Date.now();

    var queued = queuedLookup(queuedBridgeIds);
    var status = {
        bridgeCount: bridges.length,
        gradePassbackBridgeCount: 0,
        activeGradePassbackBridgeCount: 0,
        queuedGradePassbackCount: 0,
        acceptedGradePassbackCount: 0,
        unresolvedActiveGradePassbackCount: 0,
        hasGradePassback: false,
        hasActiveGradePassback: false,
        queuedGradePassback: false,
        hasAcceptedGradePassback: false,
        state: 'not-syncing',
        reason: 'no-bridge'
    };

    bridges.forEach(function(bridge) {
        var id;
        var isQueued;

        if (!bridgeHasGradePassback(bridge)) {
            return;
        }

        status.gradePassbackBridgeCount += 1;

        if (!bridgeIsOpen(bridge, now)) {
            return;
        }

        status.activeGradePassbackBridgeCount += 1;

        id = bridgeId(bridge);
        isQueued = !!(id && queued[id]);

        if (isQueued) {
            status.queuedGradePassbackCount += 1;
            return;
        }

        if (bridge.submittedScore === true) {
            status.acceptedGradePassbackCount += 1;
            return;
        }

        status.unresolvedActiveGradePassbackCount += 1;
    });

    status.hasGradePassback = status.gradePassbackBridgeCount > 0;
    status.hasActiveGradePassback =
        status.activeGradePassbackBridgeCount > 0;
    status.queuedGradePassback =
        status.queuedGradePassbackCount > 0;
    status.hasAcceptedGradePassback =
        status.acceptedGradePassbackCount > 0;

    if (status.bridgeCount === 0) {
        status.state = 'not-syncing';
        status.reason = 'no-bridge';
    } else if (!status.hasGradePassback) {
        status.state = 'not-syncing';
        status.reason = 'missing-passback-fields';
    } else if (!status.hasActiveGradePassback) {
        status.state = 'not-syncing';
        status.reason = 'grade-passback-closed';
    } else if (status.queuedGradePassback) {
        status.state = 'pending';
        status.reason = 'passback-pending';
    } else if (status.unresolvedActiveGradePassbackCount > 0) {
        /*
         * An open bridge is capable of passback, but submittedScore does not
         * prove that the current best score has been accepted by Canvas. This
         * includes a newly-created bridge, a better score not yet queued, and
         * a permanent passback failure after the queue entry was consumed.
         * Stage 3 diagnostics can distinguish those cases with additional
         * evidence; the student-facing Stage 2 pill must not call them synced.
         */
        status.state = 'ready';
        status.reason = 'passback-ready';
    } else if (
        status.acceptedGradePassbackCount ===
        status.activeGradePassbackBridgeCount
    ) {
        status.state = 'synced';
        status.reason = 'passback-accepted';
    } else {
        status.state = 'ready';
        status.reason = 'passback-ready';
    }

    return status;
}

exports.bridgeHasGradePassback = bridgeHasGradePassback;
exports.bridgeIsOpen = bridgeIsOpen;
exports.build = build;
