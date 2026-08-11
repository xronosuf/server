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

var INITIAL_MATHJAX_TIMEOUT_MS = 15000;
var INITIAL_MATHJAX_TIMEOUT_CODE =
    "XR-MATHJAX-INITIAL-101";

var CONTROL_TASKS = [
    "document-ready",
    "activity-bootstrap-trigger",
    "activity-initialization-requested",
    "activity-initialization-release",
    "mathjax-startup-requested",
    "mathjax-startup-trigger",
    "mathjax-startup-ended",
    "mathjax-startup-ui-finalization",
    "document-ready-static-ui-requested",
    "document-ready-static-ui",
    "document-ready-kinetic-navigation-requested",
    "document-ready-kinetic-navigation",
    "document-ready-references-requested",
    "document-ready-references"
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
    id,
    options
) {
    var specification = {
        id: id,
        external: true,
        recoveryPolicy:
            "allow-late-success"
    };

    options = options || {};

    if (
        typeof options.timeoutMs === "number"
    ) {
        specification.timeoutMs =
            options.timeoutMs;
    }

    if (
        typeof options.timeoutDetails ===
            "function"
    ) {
        specification.timeoutDetails =
            options.timeoutDetails;
    }

    coordinator.register(specification);
}

function createPassiveCoordinator(options) {
    options = options || {};

    var coordinator =
        coordinatorCore.create(options);
    var activityBootstrapRunner = null;
    var activityInitializationRunner = null;
    var mathJaxStartupRunner = null;
    var mathJaxStartupUiRunner = null;
    var initialMathJaxProcess = {
        generation: null,
        begun: false,
        completed: false,
        errors: []
    };
    var documentReadyStaticUiRunner = null;
    var documentReadyKineticNavigationRunner = null;
    var documentReadyReferencesRunner = null;

    LEAF_TASKS.forEach(function(taskId) {
        var leafOptions = {};

        if (
            taskId ===
            "mathjax-initial-process"
        ) {
            leafOptions.timeoutMs =
                typeof options
                    .initialMathJaxTimeoutMs ===
                    "number"
                    ? options
                        .initialMathJaxTimeoutMs
                    : INITIAL_MATHJAX_TIMEOUT_MS;

            leafOptions.timeoutDetails =
                function(context, operation) {
                    return {
                        code:
                            INITIAL_MATHJAX_TIMEOUT_CODE,
                        deadlineMilliseconds:
                            leafOptions.timeoutMs,
                        phase:
                            initialMathJaxProcess
                                .generation === null
                                ? "waiting-for-process"
                                : "process-running",
                        generation:
                            initialMathJaxProcess
                                .generation,
                        begun:
                            initialMathJaxProcess
                                .begun,
                        completed:
                            initialMathJaxProcess
                                .completed,
                        observedErrorCount:
                            initialMathJaxProcess
                                .errors.length,
                        attempt:
                            operation.attempt,
                        operationId:
                            operation.operationId
                    };
                };
        }

        registerExternalLeaf(
            coordinator,
            taskId,
            leafOptions
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
        id: "mathjax-startup-requested",
        external: true
    });

    coordinator.register({
        id: "mathjax-startup-trigger",
        dependsOn: [
            "mathjax-startup-requested"
        ],
        accepts: {
            "mathjax-startup-requested": [
                "succeeded"
            ]
        },
        run: function() {
            if (
                typeof mathJaxStartupRunner !==
                    "function"
            ) {
                throw new Error(
                    "MathJax startup runner is not configured."
                );
            }

            return mathJaxStartupRunner();
        }
    });

    coordinator.register({
        id: "mathjax-startup-ended",
        external: true
    });

    coordinator.register({
        id: "mathjax-startup-ui-finalization",
        dependsOn: [
            "mathjax-startup-ended"
        ],
        accepts: {
            "mathjax-startup-ended": [
                "succeeded"
            ]
        },
        run: function() {
            if (
                typeof mathJaxStartupUiRunner !==
                    "function"
            ) {
                throw new Error(
                    "MathJax startup UI runner is not configured."
                );
            }

            return mathJaxStartupUiRunner();
        }
    });

    coordinator.register({
        id: "document-ready-static-ui-requested",
        external: true
    });

    coordinator.register({
        id: "document-ready-static-ui",
        dependsOn: [
            "document-ready-static-ui-requested"
        ],
        accepts: {
            "document-ready-static-ui-requested": [
                "succeeded"
            ]
        },
        run: function() {
            if (
                typeof documentReadyStaticUiRunner !==
                    "function"
            ) {
                throw new Error(
                    "Document-ready static UI runner is not configured."
                );
            }

            return documentReadyStaticUiRunner();
        }
    });

    coordinator.register({
        id: "document-ready-kinetic-navigation-requested",
        external: true
    });

    coordinator.register({
        id: "document-ready-kinetic-navigation",
        dependsOn: [
            "document-ready-kinetic-navigation-requested"
        ],
        accepts: {
            "document-ready-kinetic-navigation-requested": [
                "succeeded"
            ]
        },
        run: function() {
            if (
                typeof documentReadyKineticNavigationRunner !==
                    "function"
            ) {
                throw new Error(
                    "Document-ready kinetic navigation runner is not configured."
                );
            }

            return documentReadyKineticNavigationRunner();
        }
    });

    coordinator.register({
        id: "document-ready-references-requested",
        external: true
    });

    coordinator.register({
        id: "document-ready-references",
        dependsOn: [
            "document-ready-references-requested"
        ],
        accepts: {
            "document-ready-references-requested": [
                "succeeded"
            ]
        },
        run: function() {
            if (
                typeof documentReadyReferencesRunner !==
                    "function"
            ) {
                throw new Error(
                    "Document-ready references runner is not configured."
                );
            }

            return documentReadyReferencesRunner();
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
            "mathjax-initial-process",
            "activity",
            "initial-math-answers"
        ],
        accepts: {
            "mathjax-initial-process": [
                "succeeded",
                "not-required",
                "degraded",
                "failed",
                "timed-out"
            ],
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
                    "mathjax-initial-process",
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

    coordinator.setMathJaxStartupRunner =
        function(runner) {
            if (typeof runner !== "function") {
                throw new Error(
                    "MathJax startup runner must be a function."
                );
            }

            mathJaxStartupRunner =
                runner;

            coordinator.record(
                "mathjax-startup-runner-configured",
                "mathjax-startup-trigger"
            );

            return true;
        };

    coordinator.requestMathJaxStartup =
        function(details) {
            var report =
                coordinator.inspect();
            var trigger =
                report.tasks[
                    "mathjax-startup-trigger"
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
                    "duplicate-mathjax-startup-request-ignored",
                    "mathjax-startup-trigger",
                    {
                        state: trigger.state
                    }
                );

                return true;
            }

            return coordinator.signal(
                "mathjax-startup-requested",
                "succeeded",
                details
            );
        };

    coordinator.beginInitialMathJaxProcess =
        function(details) {
            details = details || {};

            var generation =
                details.generation;

            if (
                generation === undefined ||
                generation === null
            ) {
                coordinator.record(
                    "initial-mathjax-process-begin-rejected",
                    "mathjax-initial-process",
                    {
                        reason:
                            "missing-generation"
                    }
                );

                return false;
            }

            if (
                initialMathJaxProcess
                    .generation !== null
            ) {
                if (
                    initialMathJaxProcess
                        .generation ===
                    generation
                ) {
                    coordinator.record(
                        "duplicate-initial-mathjax-process-begin-ignored",
                        "mathjax-initial-process",
                        {
                            generation:
                                generation
                        }
                    );

                    return true;
                }

                coordinator.record(
                    "initial-mathjax-process-begin-rejected",
                    "mathjax-initial-process",
                    {
                        reason:
                            "generation-already-bound",
                        boundGeneration:
                            initialMathJaxProcess
                                .generation,
                        attemptedGeneration:
                            generation
                    }
                );

                return false;
            }

            initialMathJaxProcess
                .generation =
                    generation;
            initialMathJaxProcess
                .begun = true;

            coordinator.record(
                "initial-mathjax-process-begun",
                "mathjax-initial-process",
                {
                    generation:
                        generation,
                    details:
                        details
                }
            );

            return true;
        };

    coordinator.observeInitialMathJaxProcessError =
        function(details) {
            details = details || {};

            var generation =
                details.generation;

            if (
                initialMathJaxProcess
                    .generation === null
            ) {
                coordinator.record(
                    "initial-mathjax-process-error-unbound",
                    "mathjax-initial-process",
                    {
                        generation:
                            generation === undefined
                                ? null
                                : generation,
                        details:
                            details
                    }
                );

                return false;
            }

            if (
                generation === undefined ||
                generation === null
            ) {
                coordinator.record(
                    "initial-mathjax-process-error-rejected",
                    "mathjax-initial-process",
                    {
                        reason:
                            "missing-generation",
                        boundGeneration:
                            initialMathJaxProcess
                                .generation,
                        attemptedGeneration:
                            generation === undefined
                                ? null
                                : generation,
                        details:
                            details
                    }
                );

                return false;
            }

            if (
                generation !==
                    initialMathJaxProcess
                        .generation
            ) {
                coordinator.record(
                    "initial-mathjax-process-error-rejected",
                    "mathjax-initial-process",
                    {
                        reason:
                            "generation-mismatch",
                        boundGeneration:
                            initialMathJaxProcess
                                .generation,
                        attemptedGeneration:
                            generation,
                        details:
                            details
                    }
                );

                return false;
            }

            initialMathJaxProcess.errors.push(
                details
            );

            coordinator.record(
                "initial-mathjax-process-error-observed",
                "mathjax-initial-process",
                {
                    generation:
                        initialMathJaxProcess
                            .generation,
                    errorCount:
                        initialMathJaxProcess
                            .errors.length,
                    details:
                        details
                }
            );

            return true;
        };

    coordinator.acceptLegacyInitialMathJaxProcessCompletion =
        function(details) {
            details = details || {};

            if (
                initialMathJaxProcess
                    .generation !== null
            ) {
                coordinator.record(
                    "legacy-initial-mathjax-process-completion-ignored",
                    "mathjax-initial-process",
                    {
                        reason:
                            "explicit-generation-bound",
                        boundGeneration:
                            initialMathJaxProcess
                                .generation,
                        attemptedGeneration:
                            details.generation === undefined
                                ? null
                                : details.generation
                    }
                );

                return false;
            }

            return coordinator.signal(
                "mathjax-initial-process",
                "succeeded",
                {
                    generation:
                        details.generation === undefined
                            ? null
                            : details.generation,
                    source:
                        "legacy-mathjax-pass-ended"
                }
            );
        };

    coordinator.completeInitialMathJaxProcess =
        function(details) {
            details = details || {};

            var generation =
                details.generation;

            if (
                initialMathJaxProcess
                    .generation === null
            ) {
                coordinator.record(
                    "initial-mathjax-process-completion-rejected",
                    "mathjax-initial-process",
                    {
                        reason:
                            "process-not-bound",
                        attemptedGeneration:
                            generation === undefined
                                ? null
                                : generation
                    }
                );

                return false;
            }

            if (
                generation !==
                    initialMathJaxProcess
                        .generation
            ) {
                coordinator.record(
                    "initial-mathjax-process-completion-rejected",
                    "mathjax-initial-process",
                    {
                        reason:
                            "generation-mismatch",
                        boundGeneration:
                            initialMathJaxProcess
                                .generation,
                        attemptedGeneration:
                            generation === undefined
                                ? null
                                : generation
                    }
                );

                return false;
            }

            if (
                initialMathJaxProcess
                    .completed
            ) {
                coordinator.record(
                    "duplicate-initial-mathjax-process-completion-ignored",
                    "mathjax-initial-process",
                    {
                        generation:
                            generation
                    }
                );

                return true;
            }

            var errorCount =
                initialMathJaxProcess
                    .errors.length;
            var processingErrorCount =
                initialMathJaxProcess
                    .errors.filter(
                        function(error) {
                            return (
                                error &&
                                error.errorType ===
                                    "processing-error"
                            );
                        }
                    ).length;

            /*
             * A localized TeX parse error may occur in generated
             * preamble material while the authoritative MathJax Process,
             * answer attachment, and visible page rendering still
             * complete successfully. Preserve those errors
             * diagnostically, but reserve page-fatal failure here for
             * MathJax's Process-wide "Math Processing Error" signal.
             * Timeout handling remains independent and unchanged.
             */
            var terminalState =
                processingErrorCount > 0
                    ? "failed"
                    : "succeeded";

            var accepted =
                coordinator.signal(
                    "mathjax-initial-process",
                    terminalState,
                    {
                        generation:
                            generation,
                        errorCount:
                            errorCount,
                        processingErrorCount:
                            processingErrorCount,
                        errors:
                            initialMathJaxProcess
                                .errors.slice(),
                        details:
                            details
                    }
                );

            if (accepted) {
                initialMathJaxProcess
                    .completed = true;

                coordinator.record(
                    "initial-mathjax-process-completed",
                    "mathjax-initial-process",
                    {
                        generation:
                            generation,
                        errorCount:
                            errorCount,
                        processingErrorCount:
                            processingErrorCount,
                        terminalState:
                            terminalState
                    }
                );
            }

            return accepted;
        };

    coordinator.setMathJaxStartupUiRunner =
        function(runner) {
            if (typeof runner !== "function") {
                throw new Error(
                    "MathJax startup UI runner must be a function."
                );
            }

            mathJaxStartupUiRunner =
                runner;

            coordinator.record(
                "mathjax-startup-ui-runner-configured",
                "mathjax-startup-ui-finalization"
            );

            return true;
        };

    coordinator.requestMathJaxStartupUiFinalization =
        function(details) {
            var report =
                coordinator.inspect();
            var task =
                report.tasks[
                    "mathjax-startup-ui-finalization"
                ];

            if (
                task &&
                (
                    task.state === "running" ||
                    task.state === "succeeded" ||
                    task.state === "not-required"
                )
            ) {
                coordinator.record(
                    "duplicate-mathjax-startup-ui-request-ignored",
                    "mathjax-startup-ui-finalization",
                    {
                        state: task.state
                    }
                );

                return true;
            }

            return coordinator.signal(
                "mathjax-startup-ended",
                "succeeded",
                details
            );
        };

    coordinator.setDocumentReadyStaticUiRunner =
        function(runner) {
            if (typeof runner !== "function") {
                throw new Error(
                    "Document-ready static UI runner must be a function."
                );
            }

            documentReadyStaticUiRunner =
                runner;

            coordinator.record(
                "document-ready-static-ui-runner-configured",
                "document-ready-static-ui"
            );

            return true;
        };

    coordinator.requestDocumentReadyStaticUi =
        function(details) {
            var report =
                coordinator.inspect();
            var task =
                report.tasks[
                    "document-ready-static-ui"
                ];

            if (
                task &&
                (
                    task.state === "running" ||
                    task.state === "succeeded" ||
                    task.state === "not-required"
                )
            ) {
                coordinator.record(
                    "duplicate-document-ready-static-ui-request-ignored",
                    "document-ready-static-ui",
                    {
                        state: task.state
                    }
                );

                return true;
            }

            return coordinator.signal(
                "document-ready-static-ui-requested",
                "succeeded",
                details
            );
        };

    coordinator.setDocumentReadyKineticNavigationRunner =
        function(runner) {
            if (typeof runner !== "function") {
                throw new Error(
                    "Document-ready kinetic navigation runner must be a function."
                );
            }

            documentReadyKineticNavigationRunner =
                runner;

            coordinator.record(
                "document-ready-kinetic-navigation-runner-configured",
                "document-ready-kinetic-navigation"
            );

            return true;
        };

    coordinator.requestDocumentReadyKineticNavigation =
        function(details) {
            var report =
                coordinator.inspect();
            var task =
                report.tasks[
                    "document-ready-kinetic-navigation"
                ];

            if (
                task &&
                (
                    task.state === "running" ||
                    task.state === "succeeded" ||
                    task.state === "not-required"
                )
            ) {
                coordinator.record(
                    "duplicate-document-ready-kinetic-navigation-request-ignored",
                    "document-ready-kinetic-navigation",
                    {
                        state: task.state
                    }
                );

                return true;
            }

            return coordinator.signal(
                "document-ready-kinetic-navigation-requested",
                "succeeded",
                details
            );
        };

    coordinator.setDocumentReadyReferencesRunner =
        function(runner) {
            if (typeof runner !== "function") {
                throw new Error(
                    "Document-ready references runner must be a function."
                );
            }

            documentReadyReferencesRunner =
                runner;

            coordinator.record(
                "document-ready-references-runner-configured",
                "document-ready-references"
            );

            return true;
        };

    coordinator.requestDocumentReadyReferences =
        function(details) {
            var report =
                coordinator.inspect();

            var task =
                report.tasks[
                    "document-ready-references"
                ];

            if (
                task &&
                (
                    task.state === "running" ||
                    task.state === "succeeded" ||
                    task.state === "not-required"
                )
            ) {
                coordinator.record(
                    "duplicate-document-ready-references-request-ignored",
                    "document-ready-references",
                    {
                        state:
                            task.state
                    }
                );

                return true;
            }

            return coordinator.signal(
                "document-ready-references-requested",
                "succeeded",
                details
            );
        };

    coordinator.beginInitialInlineSageAttempt =
        function(details) {
            var task =
                coordinator.inspect()
                    .tasks[
                        "sage-inline-initial"
                    ];

            if (!task) {
                return false;
            }

            if (
                task.state === "waiting" &&
                task.operationId !== null
            ) {
                coordinator.record(
                    "initial-inline-sage-attempt-observed",
                    "sage-inline-initial",
                    {
                        attempt: task.attempt,
                        operationId:
                            task.operationId,
                        rearmed: false,
                        placeholders:
                            details &&
                            typeof details
                                .placeholders ===
                                "number"
                                ? details
                                    .placeholders
                                : null
                    }
                );

                return {
                    attempt: task.attempt,
                    operationId:
                        task.operationId,
                    rearmed: false
                };
            }

            if (
                task.state === "degraded" ||
                task.state === "failed" ||
                task.state === "timed-out"
            ) {
                var rearmed =
                    coordinator.rearmExternalTask(
                        "sage-inline-initial",
                        {
                            reason:
                                "initial-inline-sage-retry",
                            placeholders:
                                details &&
                                typeof details
                                    .placeholders ===
                                    "number"
                                    ? details
                                        .placeholders
                                    : null
                        }
                    );

                if (!rearmed) {
                    return false;
                }

                return {
                    attempt: rearmed.attempt,
                    operationId:
                        rearmed.operationId,
                    rearmed: true
                };
            }

            coordinator.record(
                "initial-inline-sage-attempt-begin-rejected",
                "sage-inline-initial",
                {
                    state: task.state,
                    attempt: task.attempt,
                    operationId:
                        task.operationId,
                    reason:
                        "initial-inline-sage-task-not-retryable"
                }
            );

            return false;
        };


    coordinator.beginCanonicalSageAttempt =
        function(details) {
            var task =
                coordinator.inspect()
                    .tasks[
                        "canonical-sage"
                    ];

            if (!task) {
                return false;
            }

            if (
                task.state === "waiting" &&
                task.operationId !== null
            ) {
                coordinator.record(
                    "canonical-sage-attempt-observed",
                    "canonical-sage",
                    {
                        attempt: task.attempt,
                        operationId: task.operationId,
                        rearmed: false,
                        details:
                            canonicalSageSafeDetails(
                                details
                            )
                    }
                );

                return {
                    attempt: task.attempt,
                    operationId: task.operationId,
                    rearmed: false
                };
            }

            if (
                task.state === "degraded" ||
                task.state === "failed" ||
                task.state === "timed-out"
            ) {
                var rearmed =
                    coordinator.rearmExternalTask(
                        "canonical-sage",
                        {
                            reason:
                                "canonical-sage-retry",
                            details:
                                canonicalSageSafeDetails(
                                    details
                                )
                        }
                    );

                if (!rearmed) {
                    return false;
                }

                return {
                    attempt: rearmed.attempt,
                    operationId: rearmed.operationId,
                    rearmed: true
                };
            }

            coordinator.record(
                "canonical-sage-attempt-begin-rejected",
                "canonical-sage",
                {
                    state: task.state,
                    attempt: task.attempt,
                    operationId: task.operationId,
                    reason:
                        "canonical-sage-task-not-retryable"
                }
            );

            return false;
        };

    coordinator.observeCanonicalSageStage =
        function(state, details) {
            var operation;

            if (state === "waiting-for-seed") {
                operation =
                    coordinator
                        .beginCanonicalSageAttempt(
                            details
                        );
            } else {
                var task =
                    coordinator.inspect()
                        .tasks[
                            "canonical-sage"
                        ];

                operation =
                    task
                        ? {
                            attempt: task.attempt,
                            operationId:
                                task.operationId,
                            rearmed: false
                        }
                        : null;
            }

            if (!operation) {
                return false;
            }

            coordinator.record(
                "canonical-sage-stage-observed",
                "canonical-sage",
                {
                    stage: state,
                    attempt: operation.attempt,
                    operationId:
                        operation.operationId,
                    details:
                        canonicalSageSafeDetails(
                            details
                        )
                }
            );

            return true;
        };

    coordinator.start({
        mode:
            "active-activity-bootstrap-trigger"
    });

    return coordinator;
}

function canonicalSageSafeDetails(
    details
) {
    var safe = {};
    var allowed = [
        "expressions",
        "answerKeys",
        "silentBlocks",
        "request",
        "requestCount",
        "compiledCharacters",
        "compiledUtf8Bytes",
        "resultCountExpected",
        "resultCount",
        "expressionFailureCount",
        "requestDurationMilliseconds",
        "errorName",
        "fallbackCode"
    ];

    if (
        !details ||
        typeof details !== "object"
    ) {
        return null;
    }

    allowed.forEach(function(key) {
        if (details[key] !== undefined) {
            safe[key] = details[key];
        }
    });

    return Object.keys(safe).length > 0
        ? safe
        : null;
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
        var canonicalSageValue = {
            observedState: state,
            details:
                canonicalSageSafeDetails(
                    details
                )
        };

        if (state === "results-available") {
            return {
                taskId: "canonical-sage",
                state: "succeeded",
                value: canonicalSageValue
            };
        }

        if (state === "not-required") {
            return {
                taskId: "canonical-sage",
                state: "not-required",
                value: canonicalSageValue
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
                state: "degraded",
                value: canonicalSageValue
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

        if (state === "not-required") {
            return {
                taskId: "activity",
                state: "not-required"
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
    if (
        collectionName === "operations" &&
        name === "sage-initial-request" &&
        typeof coordinator
            .observeCanonicalSageStage ===
                "function"
    ) {
        return coordinator
            .observeCanonicalSageStage(
                state,
                details
            );
    }

    if (
        collectionName === "operations" &&
        name === "mathjax-pass" &&
        state === "ended" &&
        details &&
        details.passType === "process" &&
        typeof coordinator
            .acceptLegacyInitialMathJaxProcessCompletion ===
                "function"
    ) {
        return coordinator
            .acceptLegacyInitialMathJaxProcessCompletion(
                details
            );
    }

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
