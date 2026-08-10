"use strict";

/*
 * Normalize the live page-runtime observations into the intentionally small
 * snapshot consumed by page-runtime-support-policy.js.
 *
 * This module is pure. It does not inspect the DOM, mutate runtime state,
 * perform recovery, or decide student-facing policy.
 */

function copyValue(value) {
    if (value === undefined) {
        return undefined;
    }

    return JSON.parse(JSON.stringify(value));
}

function copyObserved(value) {
    return value === undefined
        ? undefined
        : copyValue(value);
}

function detailsOf(value) {
    if (
        value &&
        value.details &&
        typeof value.details === "object"
    ) {
        return copyValue(value.details);
    }

    return {};
}

function withState(value, state, extraDetails) {
    var normalized =
        copyObserved(value) || {};
    var details =
        detailsOf(value);
    var key;

    if (extraDetails) {
        for (key in extraDetails) {
            if (
                Object.prototype.hasOwnProperty.call(
                    extraDetails,
                    key
                )
            ) {
                details[key] =
                    copyValue(extraDetails[key]);
            }
        }
    }

    normalized.state = state;

    if (Object.keys(details).length > 0) {
        normalized.details = details;
    }

    return normalized;
}

function normalizedInitialState(
    operations,
    watchdogs
) {
    var observed =
        operations["initial-state"];
    var watchdog =
        watchdogs.initialState || {};

    if (
        watchdog.timedOut === true &&
        !(
            observed &&
            observed.state === "available"
        )
    ) {
        return withState(
            observed,
            "timed-out",
            {
                deadlineExceeded: true,
                deadlineMilliseconds:
                    watchdog.deadlineMilliseconds,
                timedOutAtElapsedMs:
                    watchdog.timedOutAtElapsedMs
            }
        );
    }

    return copyObserved(observed);
}

function normalizedInitialMathJax(watchdogs) {
    var watchdog =
        watchdogs.initialMathJax || {};
    var state;

    if (watchdog.completed === true) {
        state =
            watchdog.errorCount > 0
                ? "failed"
                : "completed";
    } else if (watchdog.timedOut === true) {
        state = "timed-out";
    } else {
        return undefined;
    }

    return {
        state: state,
        details: {
            deadlineExceeded:
                watchdog.timedOut === true,
            deadlineMilliseconds:
                watchdog.deadlineMilliseconds,
            timedOutAtElapsedMs:
                watchdog.timedOutAtElapsedMs,
            completed:
                watchdog.completed === true,
            completedAtElapsedMs:
                watchdog.completedAtElapsedMs,
            generation:
                watchdog.generation === undefined
                    ? null
                    : watchdog.generation,
            errorCount:
                watchdog.errorCount || 0
        }
    };
}

function fromRuntime(runtime, watchdogs) {
    var services;
    var operations;
    var components;

    runtime = runtime || {};
    watchdogs = watchdogs || {};

    services =
        runtime.services || {};
    operations =
        runtime.operations || {};
    components =
        runtime.components || {};

    return {
        stateWebsocket:
            copyObserved(
                services[
                    "state-websocket"
                ]
            ),
        websocketLiveness:
            copyObserved(
                services[
                    "state-websocket-liveness"
                ]
            ),
        stateDifferentialSync:
            copyObserved(
                operations[
                    "state-differential-sync"
                ]
            ),
        initialState:
            normalizedInitialState(
                operations,
                watchdogs
            ),
        initialMathJax:
            normalizedInitialMathJax(
                watchdogs
            ),
        initialSage:
            copyObserved(
                components[
                    "sage-inline-initial"
                ]
            ),
        initialMathAnswers:
            copyObserved(
                components[
                    "initial-math-answers"
                ]
            ),
        activity:
            copyObserved(
                components.activity
            )
    };
}

module.exports = {
    fromRuntime: fromRuntime
};
