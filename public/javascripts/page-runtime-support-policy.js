"use strict";

/*
 * Stable Phase-1 support policy.
 *
 * This module is intentionally pure:
 * - no DOM access;
 * - no page-runtime dependency;
 * - no student-facing prose;
 * - no transport or recovery side effects.
 *
 * Runtime integration supplies a small normalized snapshot. This module
 * decides which student-relevant support issues are currently active and
 * which recovery action the UI should offer.
 */

var SUPPORT_CODES = {
    INITIAL_STATE:
        "XR-STATE-INITIAL-101",
    STATE_CONNECTION:
        "XR-STATE-CONNECTION-101",
    STATE_SAVE:
        "XR-STATE-DIFF-101",
    INITIAL_MATHJAX:
        "XR-MATHJAX-INITIAL-101",
    INITIAL_SAGE:
        "XR-SAGE-INLINE-INITIAL-101",
    INITIAL_ANSWERS:
        "XR-ANSWER-INITIAL-101",
    INITIAL_ACTIVITY:
        "XR-ACTIVITY-INITIAL-101"
};

var RECOVERY_ACTIONS = {
    HARD_RELOAD:
        "hard-reload",
    RETRY_THEN_HARD_RELOAD:
        "retry-then-hard-reload",
    KEEP_OPEN_UNTIL_RECONNECTED:
        "keep-open-until-reconnected",
    KEEP_OPEN_UNTIL_SAVE_SAFE:
        "keep-open-until-save-safe"
};

var PRIORITY = {
    "state-save": 10,
    "state-connection": 20,
    "initial-state": 30,
    "initial-mathjax": 40,
    "initial-sage": 50,
    "initial-answers": 60,
    "initial-activity": 70
};

function observedState(value) {
    if (!value) {
        return undefined;
    }

    if (typeof value === "string") {
        return value;
    }

    return value.state;
}

function observedDetails(value) {
    if (
        value &&
        typeof value === "object" &&
        value.details &&
        typeof value.details === "object"
    ) {
        return value.details;
    }

    return {};
}

function isFailureState(state) {
    return (
        state === "failed" ||
        state === "degraded" ||
        state === "timed-out" ||
        state === "blocked"
    );
}

function isConnectionFailureState(state) {
    return (
        state === "construction-failed" ||
        state === "error" ||
        state === "closed"
    );
}

function issue(
    code,
    subsystem,
    state,
    reason,
    recoveryAction,
    options
) {
    options = options || {};

    return {
        code: code,
        subsystem: subsystem,
        state: state || null,
        reason: reason || null,
        severity: options.severity || "error",
        recoveryAction: recoveryAction,
        reportable:
            options.reportable !== false,
        recoverable:
            options.recoverable === true,
        persistent:
            options.persistent === true
    };
}

function stateConnectionIssue(snapshot) {
    var websocket =
        snapshot.stateWebsocket;
    var liveness =
        snapshot.websocketLiveness;
    var websocketState =
        observedState(websocket);
    var livenessState =
        observedState(liveness);
    var details;

    if (isConnectionFailureState(websocketState)) {
        details = observedDetails(websocket);

        return issue(
            SUPPORT_CODES.STATE_CONNECTION,
            "state-connection",
            websocketState,
            details.reason || websocketState,
            RECOVERY_ACTIONS
                .KEEP_OPEN_UNTIL_RECONNECTED,
            {
                severity: "warning",
                recoverable: true,
                persistent: false
            }
        );
    }

    if (livenessState === "degraded") {
        details = observedDetails(liveness);

        return issue(
            SUPPORT_CODES.STATE_CONNECTION,
            "state-connection",
            livenessState,
            details.reason || "liveness-degraded",
            RECOVERY_ACTIONS
                .KEEP_OPEN_UNTIL_RECONNECTED,
            {
                severity: "warning",
                recoverable: true,
                persistent: false
            }
        );
    }

    return null;
}

function stateSaveIssue(snapshot) {
    var operation =
        snapshot.stateDifferentialSync;
    var state =
        observedState(operation);

    if (state !== "failed") {
        return null;
    }

    return issue(
        SUPPORT_CODES.STATE_SAVE,
        "state-save",
        state,
        observedDetails(operation).reason ||
            "state-differential-sync-failed",
        RECOVERY_ACTIONS
            .KEEP_OPEN_UNTIL_SAVE_SAFE,
        {
            severity: "error",
            recoverable: true,
            /*
             * A later confirmed successful save should clear this
             * active issue. It is not a remainder-of-page-load
             * failure like an unsafe initial MathJax render.
             */
            persistent: false
        }
    );
}

function initialStateIssue(snapshot) {
    var operation =
        snapshot.initialState;
    var state =
        observedState(operation);
    var details;

    if (!isFailureState(state)) {
        return null;
    }

    details = observedDetails(operation);

    return issue(
        SUPPORT_CODES.INITIAL_STATE,
        "initial-state",
        state,
        details.reason ||
            details.outcome ||
            state,
        RECOVERY_ACTIONS.HARD_RELOAD,
        {
            recoverable: true,
            persistent: true
        }
    );
}

function initialMathJaxIssue(snapshot) {
    var operation =
        snapshot.initialMathJax;
    var state =
        observedState(operation);
    var details;

    if (!isFailureState(state)) {
        return null;
    }

    details = observedDetails(operation);

    return issue(
        SUPPORT_CODES.INITIAL_MATHJAX,
        "math-processing",
        state,
        details.errorType ||
            details.reason ||
            state,
        RECOVERY_ACTIONS.HARD_RELOAD,
        {
            recoverable: true,
            persistent: true
        }
    );
}

function initialSageIssue(snapshot) {
    var component =
        snapshot.initialSage;
    var state =
        observedState(component);
    var details;
    var retryable;

    if (!isFailureState(state)) {
        return null;
    }

    details = observedDetails(component);
    retryable =
        details.retryable === true;

    return issue(
        SUPPORT_CODES.INITIAL_SAGE,
        "sage",
        state,
        details.category ||
            details.reason ||
            state,
        retryable
            ? RECOVERY_ACTIONS
                .RETRY_THEN_HARD_RELOAD
            : RECOVERY_ACTIONS
                .HARD_RELOAD,
        {
            recoverable: true,
            persistent: true
        }
    );
}

function initialAnswersIssue(snapshot) {
    var component =
        snapshot.initialMathAnswers;
    var state =
        observedState(component);

    if (!isFailureState(state)) {
        return null;
    }

    return issue(
        SUPPORT_CODES.INITIAL_ANSWERS,
        "initial-answers",
        state,
        observedDetails(component).reason ||
            "initial-answer-attachment-failed",
        RECOVERY_ACTIONS.HARD_RELOAD,
        {
            recoverable: true,
            persistent: true
        }
    );
}

function initialActivityIssue(snapshot) {
    var component =
        snapshot.activity;
    var state =
        observedState(component);

    if (!isFailureState(state)) {
        return null;
    }

    return issue(
        SUPPORT_CODES.INITIAL_ACTIVITY,
        "activity-initialization",
        state,
        observedDetails(component).reason ||
            "activity-initialization-failed",
        RECOVERY_ACTIONS.HARD_RELOAD,
        {
            recoverable: true,
            persistent: true
        }
    );
}

function classify(snapshot) {
    var issues;

    snapshot = snapshot || {};

    issues = [
        stateSaveIssue(snapshot),
        stateConnectionIssue(snapshot),
        initialStateIssue(snapshot),
        initialMathJaxIssue(snapshot),
        initialSageIssue(snapshot),
        initialAnswersIssue(snapshot),
        initialActivityIssue(snapshot)
    ].filter(function(value) {
        return value !== null;
    });

    issues.sort(function(left, right) {
        return (
            PRIORITY[left.subsystem] -
            PRIORITY[right.subsystem]
        );
    });

    /*
     * An active connection problem changes the safe recovery order for
     * initial-state failure. Keep both diagnostics, but make the connection
     * issue primary so UI does not tell a student to hard reload while work
     * may still be stranded.
     */
    return issues;
}

function primaryIssue(snapshot) {
    var issues =
        classify(snapshot);

    return issues.length > 0
        ? issues[0]
        : null;
}

module.exports = {
    SUPPORT_CODES: SUPPORT_CODES,
    RECOVERY_ACTIONS: RECOVERY_ACTIONS,
    classify: classify,
    primaryIssue: primaryIssue
};
