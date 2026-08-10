"use strict";

function stateIdentifierCount(data) {
    return (
        data &&
        typeof data === "object"
            ? Object.keys(data).length
            : undefined
    );
}

function serverResult(activityHash, err, state) {
    if (!activityHash) {
        return {
            outcome: "invalid-request",
            reason: "missing-activity-hash"
        };
    }

    if (err) {
        return {
            outcome: "failed",
            reason: "state-query-failed"
        };
    }

    if (!state) {
        return {
            outcome: "empty",
            data: {}
        };
    }

    return {
        outcome: "found",
        data:
            state.data &&
            typeof state.data === "object"
                ? state.data
                : {}
    };
}

function normalizeClientResult(result) {
    var outcome = result && result.outcome;
    var data = result && result.data;
    var reason = result && result.reason;

    if (
        outcome !== "found" &&
        outcome !== "empty" &&
        outcome !== "failed" &&
        outcome !== "invalid-request"
    ) {
        return {
            outcome: "failed",
            reason: "invalid-initial-state-result"
        };
    }

    if (outcome === "found" || outcome === "empty") {
        return {
            outcome: outcome,
            data:
                data &&
                typeof data === "object"
                    ? data
                    : {}
        };
    }

    return {
        outcome: outcome,
        reason: reason
    };
}

module.exports = {
    stateIdentifierCount: stateIdentifierCount,
    serverResult: serverResult,
    normalizeClientResult: normalizeClientResult
};
