"use strict";

var coordinatorCore = require(
    "./page-runtime-coordinator-core"
);

var LEAF_TASKS = [
    "initial-state",
    "mathjax-initial-process",
    "canonical-sage",
    "sage-inline-initial",
    "activity",
    "initial-math-answers"
];

var CONTROL_TASKS = [
    "document-ready",
    "activity-bootstrap-trigger",
    "activity-initialization-requested",
    "activity-initialization-release"
];

var DIMENSION_TASKS = [
    "state-synchronized",
    "content-ready",
    "interaction-ready",
    "page-readiness"
];

function terminalState(task) {
    if (!task) {
        return "waiting";
    }

    if (
        task.state === "succeeded" ||
        task.state === "not-required"
    ) {
        return "ready";
    }

    if (
        task.state === "degraded" ||
        task.state === "failed" ||
        task.state === "timed-out" ||
        task.state === "blocked"
    ) {
        return "degraded";
    }

    return "waiting";
}

function dependencyResult(
    coordinator,
    dependencyIds
) {
    var report = coordinator.inspect();
    var degraded = dependencyIds.some(
        function(taskId) {
            return (
                terminalState(
                    report.tasks[taskId]
                ) === "degraded"
            );
        }
    );

    return degraded
        ? {
            state: "degraded"
        }
        : {
            state: "succeeded"
        };
}

function registerExternalLeaf(
    coordinator,
    id
) {
    coordinator.register({
        id: id,
        external: true,
        recoveryPolicy:
            "allow-late-success"
    });
}

function createPassiveCoordinator(options) {
    var coordinator =
        coordinatorCore.create(options);
    var activityBootstrapRunner = null;
    var activityInitializationRunner = null;

    LEAF_TASKS.forEach(function(taskId) {
        registerExternalLeaf(
            coordinator,
            taskId
        );
    });

    coordinator.register({
        id: "document-ready",
        external: true
    });

    coordinator.register({
        id: "activity-bootstrap-trigger",
        dependsOn: [
            "document-ready"
        ],
        accepts: {
            "document-ready": [
                "succeeded"
            ]
        },
        run: function() {
            if (
                typeof activityBootstrapRunner !==
                    "function"
            ) {
                throw new Error(
                    "Activity bootstrap runner is not configured."
                );
            }

            return activityBootstrapRunner();
        }
    });

    coordinator.register({
        id: "activity-initialization-requested",
        external: true
    });

    coordinator.register({
        id: "activity-initialization-release",
        dependsOn: [
            "initial-state",
            "activity-initialization-requested"
        ],
        accepts: {
            "initial-state": [
                "succeeded"
            ],
            "activity-initialization-requested": [
                "succeeded"
            ]
        },
        run: function() {
            if (
                typeof activityInitializationRunner !==
                    "function"
            ) {
                throw new Error(
                    "Activity initialization runner is not configured."
                );
            }

            return activityInitializationRunner();
        }
    });

    coordinator.register({
        id: "state-synchronized",
        dependsOn: [
            "initial-state"
        ],
        accepts: {
            "initial-state": [
                "succeeded",
                "not-required",
                "degraded",
                "failed",
                "timed-out"
            ]
        },
        recomputeOnDependencyChange:
            true,
        run: function() {
            return dependencyResult(
                coordinator,
                [
                    "initial-state"
                ]
            );
        }
    });

    coordinator.register({
        id: "content-ready",
        dependsOn: [
            "mathjax-initial-process",
            "canonical-sage",
            "sage-inline-initial"
        ],
        accepts: {
            "mathjax-initial-process": [
                "succeeded",
                "not-required",
                "degraded",
                "failed",
                "timed-out"
            ],
            "canonical-sage": [
                "succeeded",
                "not-required",
                "degraded",
                "failed",
                "timed-out"
            ],
            "sage-inline-initial": [
                "succeeded",
                "not-required",
                "degraded",
                "failed",
                "timed-out"
            ]
        },
        recomputeOnDependencyChange:
            true,
        run: function() {
            return dependencyResult(
                coordinator,
                [
                    "mathjax-initial-process",
                    "canonical-sage",
                    "sage-inline-initial"
                ]
            );
        }
    });

    coordinator.register({
        id: "interaction-ready",
        dependsOn: [
            "activity",
            "initial-math-answers"
        ],
        accepts: {
            activity: [
                "succeeded",
                "not-required",
                "degraded",
                "failed",
                "timed-out"
            ],
            "initial-math-answers": [
                "succeeded",
                "not-required",
                "degraded",
                "failed",
                "timed-out"
            ]
        },
        recomputeOnDependencyChange:
            true,
        run: function() {
            return dependencyResult(
                coordinator,
                [
                    "activity",
                    "initial-math-answers"
                ]
            );
        }
    });

    coordinator.register({
        id: "page-readiness",
        dependsOn: [
            "state-synchronized",
            "content-ready",
            "interaction-ready"
        ],
        accepts: {
            "state-synchronized": [
                "succeeded",
                "degraded"
            ],
            "content-ready": [
                "succeeded",
                "degraded"
            ],
            "interaction-ready": [
                "succeeded",
                "degraded"
            ]
        },
        recomputeOnDependencyChange:
            true,
        run: function() {
            return dependencyResult(
                coordinator,
                [
                    "state-synchronized",
                    "content-ready",
                    "interaction-ready"
                ]
            );
        }
    });

    coordinator.setActivityBootstrapRunner =
        function(runner) {
            if (typeof runner !== "function") {
                throw new Error(
                    "Activity bootstrap runner must be a function."
                );
            }

            activityBootstrapRunner = runner;

            coordinator.record(
                "activity-bootstrap-runner-configured",
                "activity-bootstrap-trigger"
            );

            return true;
        };

    coordinator.requestActivityBootstrap =
        function(details) {
            var report =
                coordinator.inspect();
            var trigger =
                report.tasks[
                    "activity-bootstrap-trigger"
                ];

            if (
                trigger &&
                (
                    trigger.state === "running" ||
                    trigger.state === "succeeded" ||
                    trigger.state === "not-required"
                )
            ) {
                coordinator.record(
                    "duplicate-activity-bootstrap-request-ignored",
                    "activity-bootstrap-trigger",
                    {
                        state: trigger.state
                    }
                );

                return true;
            }

            return coordinator.signal(
                "document-ready",
                "succeeded",
                details
            );
        };

    coordinator.setActivityInitializationRunner =
        function(runner) {
            if (typeof runner !== "function") {
                throw new Error(
                    "Activity initialization runner must be a function."
                );
            }

            activityInitializationRunner =
                runner;

            coordinator.record(
                "activity-initialization-runner-configured",
                "activity-initialization-release"
            );

            return true;
        };

    coordinator.requestActivityInitialization =
        function(details) {
            var report =
                coordinator.inspect();
            var release =
                report.tasks[
                    "activity-initialization-release"
                ];

            if (
                release &&
                (
                    release.state === "running" ||
                    release.state === "succeeded" ||
                    release.state === "not-required"
                )
            ) {
                coordinator.record(
                    "duplicate-activity-initialization-request-ignored",
                    "activity-initialization-release",
                    {
                        state: release.state
                    }
                );

                return true;
            }

            return coordinator.signal(
                "activity-initialization-requested",
                "succeeded",
                details
            );
        };

    coordinator.start({
        mode:
            "active-activity-bootstrap-trigger"
    });

    return coordinator;
}

function mappedSignal(
    collectionName,
    name,
    state,
    details
) {
    if (
        collectionName === "operations" &&
        name === "initial-state"
    ) {
        if (state === "available") {
            return {
                taskId: "initial-state",
                state: "succeeded"
            };
        }

        if (
            state === "fallback" ||
            state === "failed" ||
            state === "degraded"
        ) {
            return {
                taskId: "initial-state",
                state: "degraded"
            };
        }
    }

    if (
        collectionName === "operations" &&
        name === "mathjax-pass" &&
        state === "ended" &&
        details &&
        details.passType === "process"
    ) {
        return {
            taskId: "mathjax-initial-process",
            state: "succeeded",
            value: {
                generation:
                    details.generation === undefined
                        ? null
                        : details.generation
            }
        };
    }

    if (
        collectionName === "components" &&
        name === "sage-initial"
    ) {
        if (state === "results-available") {
            return {
                taskId: "canonical-sage",
                state: "succeeded"
            };
        }

        if (state === "not-required") {
            return {
                taskId: "canonical-sage",
                state: "not-required"
            };
        }

        if (
            state === "results-degraded" ||
            state === "fallback" ||
            state === "failed" ||
            state === "degraded"
        ) {
            return {
                taskId: "canonical-sage",
                state: "degraded"
            };
        }
    }

    if (
        collectionName === "components" &&
        name === "sage-inline-initial"
    ) {
        if (
            state === "degraded" &&
            details &&
            details.deadlineExceeded === true
        ) {
            return {
                taskId: "sage-inline-initial",
                state: "timed-out"
            };
        }

        if (state === "settled") {
            return {
                taskId: "sage-inline-initial",
                state: "succeeded"
            };
        }

        if (state === "not-required") {
            return {
                taskId: "sage-inline-initial",
                state: "not-required"
            };
        }

        if (
            state === "degraded" ||
            state === "failed"
        ) {
            return {
                taskId: "sage-inline-initial",
                state: "degraded"
            };
        }
    }

    if (
        collectionName === "components" &&
        name === "activity"
    ) {
        if (state === "initialized") {
            return {
                taskId: "activity",
                state: "succeeded"
            };
        }

        if (
            state === "failed" ||
            state === "degraded"
        ) {
            return {
                taskId: "activity",
                state: "degraded"
            };
        }
    }

    if (
        collectionName === "components" &&
        name === "initial-math-answers"
    ) {
        if (state === "settled") {
            return {
                taskId: "initial-math-answers",
                state: "succeeded"
            };
        }

        if (state === "not-required") {
            return {
                taskId: "initial-math-answers",
                state: "not-required"
            };
        }

        if (
            state === "degraded" ||
            state === "failed"
        ) {
            return {
                taskId: "initial-math-answers",
                state: "degraded"
            };
        }
    }

    return null;
}

function signalTransition(
    coordinator,
    collectionName,
    name,
    state,
    details
) {
    var signal = mappedSignal(
        collectionName,
        name,
        state,
        details
    );

    if (!signal) {
        return false;
    }

    return coordinator.signal(
        signal.taskId,
        signal.state,
        signal.value
    );
}

function signalDeadline(
    coordinator,
    dependency
) {
    var taskId = null;

    if (dependency === "initial-state") {
        taskId = "initial-state";
    } else if (
        dependency ===
        "mathjax-initial-process"
    ) {
        taskId =
            "mathjax-initial-process";
    } else if (
        dependency ===
        "sage-inline-initial"
    ) {
        taskId =
            "sage-inline-initial";
    }

    if (!taskId) {
        return false;
    }

    return coordinator.signal(
        taskId,
        "timed-out"
    );
}

function readinessSnapshot(coordinator) {
    var report = coordinator.inspect();

    return {
        stateSynchronized:
            terminalState(
                report.tasks[
                    "state-synchronized"
                ]
            ),
        contentReady:
            terminalState(
                report.tasks[
                    "content-ready"
                ]
            ),
        interactionReady:
            terminalState(
                report.tasks[
                    "interaction-ready"
                ]
            ),
        pageReadiness:
            terminalState(
                report.tasks[
                    "page-readiness"
                ]
            )
    };
}

function compareReadiness(
    coordinator,
    legacy
) {
    var coordinatorReadiness =
        readinessSnapshot(coordinator);
    var legacyReadiness = {
        stateSynchronized:
            legacy.stateSynchronized ||
            "waiting",
        contentReady:
            legacy.contentReady ||
            "waiting",
        interactionReady:
            legacy.interactionReady ||
            "waiting",
        pageReadiness:
            legacy.pageReadiness ||
            "waiting"
    };
    var mismatches = [];

    Object.keys(legacyReadiness).forEach(
        function(name) {
            if (
                legacyReadiness[name] !==
                coordinatorReadiness[name]
            ) {
                mismatches.push({
                    name: name,
                    legacy:
                        legacyReadiness[name],
                    coordinator:
                        coordinatorReadiness[name]
                });
            }
        }
    );

    return {
        matches:
            mismatches.length === 0,
        legacy:
            legacyReadiness,
        coordinator:
            coordinatorReadiness,
        mismatches:
            mismatches
    };
}

module.exports = {
    create:
        createPassiveCoordinator,
    signalTransition:
        signalTransition,
    signalDeadline:
        signalDeadline,
    readinessSnapshot:
        readinessSnapshot,
    compareReadiness:
        compareReadiness,
    mappedSignal:
        mappedSignal,
    leafTasks:
        LEAF_TASKS.slice(),
    controlTasks:
        CONTROL_TASKS.slice(),
    dimensionTasks:
        DIMENSION_TASKS.slice()
};
