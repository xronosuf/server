"use strict";

var assert = require("assert");
var adapter = require(
    "../public/javascripts/page-runtime-coordinator-adapter"
);

function flush() {
    return Promise.resolve().then(
        function() {
            return Promise.resolve();
        }
    );
}

describe(
    "page runtime coordinator adapter",
    function() {
        it("starts with all passive leaves waiting", function() {
            var coordinator =
                adapter.create();
            var report =
                coordinator.inspect();

            adapter.leafTasks.forEach(
                function(taskId) {
                    assert.strictEqual(
                        report.tasks[taskId]
                            .state,
                        "waiting"
                    );
                }
            );

            assert.strictEqual(
                adapter.readinessSnapshot(
                    coordinator
                ).pageReadiness,
                "waiting"
            );
        });

        it("binds and completes the initial MathJax Process generation", async function() {
            var coordinator =
                adapter.create();

            assert.strictEqual(
                coordinator
                    .beginInitialMathJaxProcess(
                        {
                            generation: 7,
                            passType: "process"
                        }
                    ),
                true
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "mathjax-initial-process"
                    ].state,
                "waiting"
            );

            assert.strictEqual(
                coordinator
                    .completeInitialMathJaxProcess(
                        {
                            generation: 7,
                            durationMilliseconds:
                                125,
                            pass: {
                                newMathMessages: 3,
                                discoveredAnswerInstances: 4
                            },
                            answers: {
                                expectedAnswers: 2,
                                attachedAnswers: 1,
                                unresolvedAnswers: 1
                            },
                            inlineSage: {
                                expected: 2,
                                discovered: 2,
                                settled: 1
                            }
                        }
                    ),
                true
            );

            await flush();

            var task =
                coordinator.inspect()
                    .tasks[
                        "mathjax-initial-process"
                    ];

            assert.strictEqual(
                task.state,
                "succeeded"
            );

            assert.strictEqual(
                task.result.generation,
                7
            );

            assert.strictEqual(
                task.result.details
                    .durationMilliseconds,
                125
            );

            assert.deepStrictEqual(
                task.result.details.pass,
                {
                    newMathMessages: 3,
                    discoveredAnswerInstances: 4
                }
            );

            assert.deepStrictEqual(
                task.result.details.answers,
                {
                    expectedAnswers: 2,
                    attachedAnswers: 1,
                    unresolvedAnswers: 1
                }
            );

            assert.deepStrictEqual(
                task.result.details.inlineSage,
                {
                    expected: 2,
                    discovered: 2,
                    settled: 1
                }
            );
        });

        it("rejects a mismatched initial MathJax Process completion", async function() {
            var coordinator =
                adapter.create();

            assert.strictEqual(
                coordinator
                    .beginInitialMathJaxProcess(
                        {
                            generation: 3
                        }
                    ),
                true
            );

            assert.strictEqual(
                coordinator
                    .completeInitialMathJaxProcess(
                        {
                            generation: 4
                        }
                    ),
                false
            );

            await flush();

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "mathjax-initial-process"
                    ].state,
                "waiting"
            );

            assert.strictEqual(
                coordinator.inspect()
                    .events.some(
                        function(event) {
                            return (
                                event.type ===
                                    "initial-mathjax-process-completion-rejected" &&
                                event.taskId ===
                                    "mathjax-initial-process" &&
                                event.details &&
                                event.details.reason ===
                                    "generation-mismatch"
                            );
                        }
                    ),
                true
            );
        });

        it("associates observed MathJax errors with the bound initial generation", async function() {
            var coordinator =
                adapter.create();

            coordinator
                .beginInitialMathJaxProcess(
                    {
                        generation: 11
                    }
                );

            assert.strictEqual(
                coordinator
                    .observeInitialMathJaxProcessError(
                        {
                            generation: 11,
                            errorType:
                                "tex-parse-error"
                        }
                    ),
                true
            );

            assert.strictEqual(
                coordinator
                    .observeInitialMathJaxProcessError(
                        {
                            generation: 12,
                            errorType:
                                "processing-error"
                        }
                    ),
                false
            );

            assert.strictEqual(
                coordinator
                    .completeInitialMathJaxProcess(
                        {
                            generation: 11
                        }
                    ),
                true
            );

            await flush();

            var task =
                coordinator.inspect()
                    .tasks[
                        "mathjax-initial-process"
                    ];

            assert.strictEqual(
                task.state,
                "failed"
            );

            var result =
                task.result;

            assert.strictEqual(
                result.errorCount,
                1
            );

            assert.strictEqual(
                result.errors[0]
                    .errorType,
                "tex-parse-error"
            );

            adapter.signalTransition(
                coordinator,
                "operations",
                "initial-state",
                "available"
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "sage-initial",
                "not-required"
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "sage-inline-initial",
                "not-required"
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "activity",
                "initialized"
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "initial-math-answers",
                "not-required"
            );

            await flush();

            assert.strictEqual(
                adapter.readinessSnapshot(
                    coordinator
                ).contentReady,
                "degraded"
            );

            assert.strictEqual(
                adapter.readinessSnapshot(
                    coordinator
                ).interactionReady,
                "degraded"
            );

            assert.strictEqual(
                adapter.readinessSnapshot(
                    coordinator
                ).pageReadiness,
                "degraded"
            );
        });

        it("keeps the legacy MathJax completion path compatible when no generation is bound", async function() {
            var coordinator =
                adapter.create();

            assert.strictEqual(
                adapter.signalTransition(
                    coordinator,
                    "operations",
                    "mathjax-pass",
                    "ended",
                    {
                        passType:
                            "process",
                        generation:
                            5
                    }
                ),
                true
            );

            await flush();

            var task =
                coordinator.inspect()
                    .tasks[
                        "mathjax-initial-process"
                    ];

            assert.strictEqual(
                task.state,
                "succeeded"
            );

            assert.strictEqual(
                task.result.generation,
                5
            );

            assert.strictEqual(
                task.result.source,
                "legacy-mathjax-pass-ended"
            );
        });

        it("prevents a legacy MathJax completion from bypassing the bound generation", async function() {
            var coordinator =
                adapter.create();

            coordinator
                .beginInitialMathJaxProcess(
                    {
                        generation: 3
                    }
                );

            assert.strictEqual(
                adapter.signalTransition(
                    coordinator,
                    "operations",
                    "mathjax-pass",
                    "ended",
                    {
                        passType:
                            "process",
                        generation:
                            4
                    }
                ),
                false
            );

            await flush();

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "mathjax-initial-process"
                    ].state,
                "waiting"
            );

            assert.strictEqual(
                coordinator.inspect()
                    .events.some(
                        function(event) {
                            return (
                                event.type ===
                                    "legacy-initial-mathjax-process-completion-ignored" &&
                                event.taskId ===
                                    "mathjax-initial-process" &&
                                event.details &&
                                event.details.reason ===
                                    "explicit-generation-bound" &&
                                event.details.boundGeneration ===
                                    3 &&
                                event.details.attemptedGeneration ===
                                    4
                            );
                        }
                    ),
                true
            );
        });

        it("maps the successful legacy readiness path", async function() {
            var coordinator =
                adapter.create();

            adapter.signalTransition(
                coordinator,
                "operations",
                "initial-state",
                "available"
            );

            adapter.signalTransition(
                coordinator,
                "operations",
                "mathjax-pass",
                "ended",
                {
                    passType:
                        "process",
                    generation:
                        1
                }
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "sage-initial",
                "not-required"
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "sage-inline-initial",
                "not-required"
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "activity",
                "initialized"
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "initial-math-answers",
                "not-required"
            );

            await flush();

            assert.deepStrictEqual(
                adapter.readinessSnapshot(
                    coordinator
                ),
                {
                    stateSynchronized:
                        "ready",
                    contentReady:
                        "ready",
                    interactionReady:
                        "ready",
                    pageReadiness:
                        "ready"
                }
            );
        });

        it("maps degraded outcomes into degraded readiness", async function() {
            var coordinator =
                adapter.create();

            adapter.signalTransition(
                coordinator,
                "operations",
                "initial-state",
                "failed"
            );

            adapter.signalTransition(
                coordinator,
                "operations",
                "mathjax-pass",
                "ended",
                {
                    passType:
                        "process"
                }
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "sage-initial",
                "results-degraded"
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "sage-inline-initial",
                "settled"
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "activity",
                "initialized"
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "initial-math-answers",
                "degraded"
            );

            await flush();

            assert.deepStrictEqual(
                adapter.readinessSnapshot(
                    coordinator
                ),
                {
                    stateSynchronized:
                        "degraded",
                    contentReady:
                        "degraded",
                    interactionReady:
                        "degraded",
                    pageReadiness:
                        "degraded"
                }
            );
        });

        it("supports timeout followed by late recovery", async function() {
            var coordinator =
                adapter.create();

            adapter.signalDeadline(
                coordinator,
                "initial-state"
            );

            await flush();

            assert.strictEqual(
                adapter.readinessSnapshot(
                    coordinator
                ).stateSynchronized,
                "degraded"
            );

            adapter.signalTransition(
                coordinator,
                "operations",
                "initial-state",
                "available"
            );

            await flush();

            assert.strictEqual(
                adapter.readinessSnapshot(
                    coordinator
                ).stateSynchronized,
                "ready"
            );

            assert.strictEqual(
                coordinator.inspect().events.some(
                    function(event) {
                        return (
                            event.type ===
                                "task-recovered" &&
                            event.taskId ===
                                "initial-state"
                        );
                    }
                ),
                true
            );
        });

        it("compares coordinator and legacy readiness", async function() {
            var coordinator =
                adapter.create();

            adapter.signalTransition(
                coordinator,
                "operations",
                "initial-state",
                "available"
            );

            adapter.signalTransition(
                coordinator,
                "operations",
                "mathjax-pass",
                "ended",
                {
                    passType:
                        "process"
                }
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "sage-initial",
                "not-required"
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "sage-inline-initial",
                "not-required"
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "activity",
                "initialized"
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "initial-math-answers",
                "not-required"
            );

            await flush();

            assert.strictEqual(
                adapter.compareReadiness(
                    coordinator,
                    {
                        stateSynchronized:
                            "ready",
                        contentReady:
                            "ready",
                        interactionReady:
                            "ready",
                        pageReadiness:
                            "ready"
                    }
                ).matches,
                true
            );

            assert.strictEqual(
                adapter.compareReadiness(
                    coordinator,
                    {
                        stateSynchronized:
                            "ready",
                        contentReady:
                            "degraded",
                        interactionReady:
                            "ready",
                        pageReadiness:
                            "degraded"
                    }
                ).matches,
                false
            );
        });

        it("runs the configured activity bootstrap exactly once", async function() {
            var coordinator =
                adapter.create();
            var calls = 0;

            coordinator
                .setActivityBootstrapRunner(
                    function() {
                        calls += 1;

                        return {
                            state:
                                "succeeded",
                            value: {
                                owner:
                                    "coordinator"
                            }
                        };
                    }
                );

            assert.strictEqual(
                coordinator
                    .requestActivityBootstrap(
                        {
                            activityCount:
                                1
                        }
                    ),
                true
            );

            await flush();

            assert.strictEqual(
                calls,
                1
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "activity-bootstrap-trigger"
                    ].state,
                "succeeded"
            );

            assert.strictEqual(
                coordinator
                    .requestActivityBootstrap(
                        {
                            activityCount:
                                1
                        }
                    ),
                true
            );

            await flush();

            assert.strictEqual(
                calls,
                1
            );
        });

        it("keeps activity completion separate from bootstrap invocation", async function() {
            var coordinator =
                adapter.create();

            coordinator
                .setActivityBootstrapRunner(
                    function() {
                        return {
                            state:
                                "succeeded"
                        };
                    }
                );

            coordinator
                .requestActivityBootstrap(
                    {
                        activityCount:
                            1
                    }
                );

            await flush();

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "activity-bootstrap-trigger"
                    ].state,
                "succeeded"
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks.activity.state,
                "waiting"
            );

            assert.strictEqual(
                adapter.readinessSnapshot(
                    coordinator
                ).interactionReady,
                "waiting"
            );
        });

        it("fails the active trigger when no runner is configured", async function() {
            var coordinator =
                adapter.create();

            assert.strictEqual(
                coordinator
                    .requestActivityBootstrap(
                        {
                            activityCount:
                                1
                        }
                    ),
                true
            );

            await flush();

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "activity-bootstrap-trigger"
                    ].state,
                "failed"
            );
        });


        it("waits for both initial state and an activity initialization request", async function() {
            var coordinator =
                adapter.create();
            var calls = 0;

            coordinator
                .setActivityInitializationRunner(
                    function() {
                        calls += 1;

                        return {
                            state:
                                "succeeded",
                            value: {
                                owner:
                                    "coordinator"
                            }
                        };
                    }
                );

            coordinator
                .requestActivityInitialization(
                    {
                        activityCount:
                            1
                    }
                );

            await flush();

            assert.strictEqual(
                calls,
                0
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "activity-initialization-release"
                    ].state,
                "waiting"
            );

            adapter.signalTransition(
                coordinator,
                "operations",
                "initial-state",
                "available"
            );

            await flush();

            assert.strictEqual(
                calls,
                1
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "activity-initialization-release"
                    ].state,
                "succeeded"
            );
        });

        it("releases activity initialization when initial state arrived first", async function() {
            var coordinator =
                adapter.create();
            var calls = 0;

            coordinator
                .setActivityInitializationRunner(
                    function() {
                        calls += 1;

                        return {
                            state:
                                "succeeded"
                        };
                    }
                );

            adapter.signalTransition(
                coordinator,
                "operations",
                "initial-state",
                "available"
            );

            await flush();

            assert.strictEqual(
                calls,
                0
            );

            coordinator
                .requestActivityInitialization(
                    {
                        activityCount:
                            1
                    }
                );

            await flush();

            assert.strictEqual(
                calls,
                1
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "activity-initialization-release"
                    ].state,
                "succeeded"
            );

            coordinator
                .requestActivityInitialization(
                    {
                        activityCount:
                            1
                    }
                );

            await flush();

            assert.strictEqual(
                calls,
                1
            );
        });

        it("fails activity initialization release when no runner is configured", async function() {
            var coordinator =
                adapter.create();

            coordinator
                .requestActivityInitialization(
                    {
                        activityCount:
                            1
                    }
                );

            adapter.signalTransition(
                coordinator,
                "operations",
                "initial-state",
                "available"
            );

            await flush();

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "activity-initialization-release"
                    ].state,
                "failed"
            );
        });


        it("runs the configured MathJax startup trigger exactly once", async function() {
            var coordinator =
                adapter.create();
            var calls = 0;

            coordinator
                .setMathJaxStartupRunner(
                    function() {
                        calls += 1;

                        return {
                            state:
                                "succeeded",
                            value: {
                                owner:
                                    "coordinator"
                            }
                        };
                    }
                );

            assert.strictEqual(
                coordinator
                    .requestMathJaxStartup(
                        {
                            documentReady:
                                true
                        }
                    ),
                true
            );

            await flush();

            assert.strictEqual(
                calls,
                1
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "mathjax-startup-trigger"
                    ].state,
                "succeeded"
            );

            assert.deepStrictEqual(
                coordinator.inspect()
                    .tasks[
                        "mathjax-startup-trigger"
                    ].result,
                {
                    owner:
                        "coordinator"
                }
            );

            coordinator
                .requestMathJaxStartup(
                    {
                        documentReady:
                            true
                    }
                );

            await flush();

            assert.strictEqual(
                calls,
                1
            );
        });

        it("does not release activity bootstrap when MathJax startup is requested", async function() {
            var coordinator =
                adapter.create();
            var mathJaxCalls = 0;
            var activityCalls = 0;

            coordinator
                .setMathJaxStartupRunner(
                    function() {
                        mathJaxCalls += 1;

                        return {
                            state:
                                "succeeded"
                        };
                    }
                );

            coordinator
                .setActivityBootstrapRunner(
                    function() {
                        activityCalls += 1;

                        return {
                            state:
                                "succeeded"
                        };
                    }
                );

            coordinator
                .requestMathJaxStartup(
                    {
                        requestLocation:
                            "document-ready-mathjax-seam"
                    }
                );

            await flush();

            assert.strictEqual(
                mathJaxCalls,
                1
            );

            assert.strictEqual(
                activityCalls,
                0
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "mathjax-startup-trigger"
                    ].state,
                "succeeded"
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "document-ready"
                    ].state,
                "waiting"
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "activity-bootstrap-trigger"
                    ].state,
                "waiting"
            );
        });


        it("keeps initial MathJax processing separate from startup invocation", async function() {
            var coordinator =
                adapter.create();

            coordinator
                .setMathJaxStartupRunner(
                    function() {
                        return {
                            state:
                                "succeeded"
                        };
                    }
                );

            coordinator
                .requestMathJaxStartup(
                    {
                        documentReady:
                            true
                    }
                );

            await flush();

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "mathjax-startup-trigger"
                    ].state,
                "succeeded"
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "mathjax-initial-process"
                    ].state,
                "waiting"
            );

            assert.strictEqual(
                adapter.readinessSnapshot(
                    coordinator
                ).contentReady,
                "waiting"
            );
        });

        it("fails the MathJax startup trigger when no runner is configured", async function() {
            var coordinator =
                adapter.create();

            coordinator
                .requestMathJaxStartup(
                    {
                        documentReady:
                            true
                    }
                );

            await flush();

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "mathjax-startup-trigger"
                    ].state,
                "failed"
            );
        });

        it("runs the configured MathJax startup UI finalizer exactly once", async function() {
            var coordinator =
                adapter.create();
            var calls = 0;

            coordinator
                .setMathJaxStartupUiRunner(
                    function() {
                        calls += 1;

                        return {
                            state:
                                "succeeded",
                            value: {
                                owner:
                                    "coordinator"
                            }
                        };
                    }
                );

            assert.strictEqual(
                coordinator
                    .requestMathJaxStartupUiFinalization(
                        {
                            startupEnded:
                                true
                        }
                    ),
                true
            );

            await flush();

            assert.strictEqual(
                calls,
                1
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "mathjax-startup-ended"
                    ].state,
                "succeeded"
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "mathjax-startup-ui-finalization"
                    ].state,
                "succeeded"
            );

            assert.deepStrictEqual(
                coordinator.inspect()
                    .tasks[
                        "mathjax-startup-ui-finalization"
                    ].result,
                {
                    owner:
                        "coordinator"
                }
            );

            coordinator
                .requestMathJaxStartupUiFinalization(
                    {
                        startupEnded:
                            true
                    }
                );

            await flush();

            assert.strictEqual(
                calls,
                1
            );
        });

        it("keeps Startup End UI finalization separate from initial Process readiness", async function() {
            var coordinator =
                adapter.create();

            coordinator
                .setMathJaxStartupUiRunner(
                    function() {
                        return {
                            state:
                                "succeeded"
                        };
                    }
                );

            coordinator
                .requestMathJaxStartupUiFinalization(
                    {
                        startupEnded:
                            true
                    }
                );

            await flush();

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "mathjax-startup-ui-finalization"
                    ].state,
                "succeeded"
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "mathjax-initial-process"
                    ].state,
                "waiting"
            );

            assert.strictEqual(
                adapter.readinessSnapshot(
                    coordinator
                ).contentReady,
                "waiting"
            );
        });

        it("fails Startup End UI finalization when no runner is configured", async function() {
            var coordinator =
                adapter.create();

            coordinator
                .requestMathJaxStartupUiFinalization(
                    {
                        startupEnded:
                            true
                    }
                );

            await flush();

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "mathjax-startup-ui-finalization"
                    ].state,
                "failed"
            );
        });


        it("runs the configured document-ready static UI owner exactly once", async function() {
            var coordinator =
                adapter.create();
            var calls = 0;

            coordinator
                .setDocumentReadyStaticUiRunner(
                    function() {
                        calls += 1;

                        return {
                            state:
                                "succeeded",
                            value: {
                                owner:
                                    "coordinator",
                                syntaxHighlighted:
                                    true,
                                clickableRowsInstalled:
                                    2
                            }
                        };
                    }
                );

            assert.strictEqual(
                coordinator
                    .requestDocumentReadyStaticUi(
                        {
                            documentReady:
                                true
                        }
                    ),
                true
            );

            await flush();

            assert.strictEqual(
                calls,
                1
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "document-ready-static-ui-requested"
                    ].state,
                "succeeded"
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "document-ready-static-ui"
                    ].state,
                "succeeded"
            );

            assert.deepStrictEqual(
                coordinator.inspect()
                    .tasks[
                        "document-ready-static-ui"
                    ].result,
                {
                    owner:
                        "coordinator",
                    syntaxHighlighted:
                        true,
                    clickableRowsInstalled:
                        2
                }
            );

            coordinator
                .requestDocumentReadyStaticUi(
                    {
                        documentReady:
                            true
                    }
                );

            await flush();

            assert.strictEqual(
                calls,
                1
            );
        });

        it("does not release activity bootstrap from the static UI request", async function() {
            var coordinator =
                adapter.create();
            var staticCalls = 0;
            var activityCalls = 0;

            coordinator
                .setDocumentReadyStaticUiRunner(
                    function() {
                        staticCalls += 1;

                        return {
                            state:
                                "succeeded"
                        };
                    }
                );

            coordinator
                .setActivityBootstrapRunner(
                    function() {
                        activityCalls += 1;

                        return {
                            state:
                                "succeeded"
                        };
                    }
                );

            coordinator
                .requestDocumentReadyStaticUi(
                    {
                        documentReady:
                            true
                    }
                );

            await flush();

            assert.strictEqual(
                staticCalls,
                1
            );

            assert.strictEqual(
                activityCalls,
                0
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "document-ready"
                    ].state,
                "waiting"
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "activity-bootstrap-trigger"
                    ].state,
                "waiting"
            );
        });

        it("fails the static UI task when no runner is configured", async function() {
            var coordinator =
                adapter.create();

            coordinator
                .requestDocumentReadyStaticUi(
                    {
                        documentReady:
                            true
                    }
                );

            await flush();

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "document-ready-static-ui"
                    ].state,
                "failed"
            );
        });


        it("runs the configured kinetic navigation owner exactly once", async function() {
            var coordinator =
                adapter.create();
            var calls = 0;

            coordinator
                .setDocumentReadyKineticNavigationRunner(
                    function() {
                        calls += 1;

                        return {
                            state:
                                "succeeded",
                            value: {
                                owner:
                                    "coordinator",
                                horizontalContainers:
                                    1,
                                verticalContainers:
                                    1,
                                activeCards:
                                    1,
                                linkHandlersInstalled:
                                    12
                            }
                        };
                    }
                );

            assert.strictEqual(
                coordinator
                    .requestDocumentReadyKineticNavigation(
                        {
                            documentReady:
                                true
                        }
                    ),
                true
            );

            await flush();

            assert.strictEqual(
                calls,
                1
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "document-ready-kinetic-navigation-requested"
                    ].state,
                "succeeded"
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "document-ready-kinetic-navigation"
                    ].state,
                "succeeded"
            );

            assert.deepStrictEqual(
                coordinator.inspect()
                    .tasks[
                        "document-ready-kinetic-navigation"
                    ].result,
                {
                    owner:
                        "coordinator",
                    horizontalContainers:
                        1,
                    verticalContainers:
                        1,
                    activeCards:
                        1,
                    linkHandlersInstalled:
                        12
                }
            );

            coordinator
                .requestDocumentReadyKineticNavigation(
                    {
                        documentReady:
                            true
                    }
                );

            await flush();

            assert.strictEqual(
                calls,
                1
            );
        });

        it("keeps kinetic navigation separate from static UI and activity bootstrap", async function() {
            var coordinator =
                adapter.create();
            var kineticCalls = 0;
            var staticCalls = 0;
            var activityCalls = 0;

            coordinator
                .setDocumentReadyKineticNavigationRunner(
                    function() {
                        kineticCalls += 1;

                        return {
                            state:
                                "succeeded"
                        };
                    }
                );

            coordinator
                .setDocumentReadyStaticUiRunner(
                    function() {
                        staticCalls += 1;

                        return {
                            state:
                                "succeeded"
                        };
                    }
                );

            coordinator
                .setActivityBootstrapRunner(
                    function() {
                        activityCalls += 1;

                        return {
                            state:
                                "succeeded"
                        };
                    }
                );

            coordinator
                .requestDocumentReadyKineticNavigation(
                    {
                        documentReady:
                            true
                    }
                );

            await flush();

            assert.strictEqual(
                kineticCalls,
                1
            );

            assert.strictEqual(
                staticCalls,
                0
            );

            assert.strictEqual(
                activityCalls,
                0
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "document-ready-static-ui"
                    ].state,
                "waiting"
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "activity-bootstrap-trigger"
                    ].state,
                "waiting"
            );
        });

        it("fails kinetic navigation when no runner is configured", async function() {
            var coordinator =
                adapter.create();

            coordinator
                .requestDocumentReadyKineticNavigation(
                    {
                        documentReady:
                            true
                    }
                );

            await flush();

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "document-ready-kinetic-navigation"
                    ].state,
                "failed"
            );
        });


        it("runs the configured reference owner exactly once", async function() {
            var coordinator =
                adapter.create();
            var calls = 0;

            coordinator
                .setDocumentReadyReferencesRunner(
                    function() {
                        calls += 1;

                        return {
                            state:
                                "succeeded",
                            value: {
                                owner:
                                    "coordinator",
                                labelsMatched:
                                    2,
                                labelsInstalled:
                                    2,
                                referencesMatched:
                                    3,
                                referencesInstalled:
                                    3
                            }
                        };
                    }
                );

            assert.strictEqual(
                coordinator
                    .requestDocumentReadyReferences(
                        {
                            documentReady:
                                true
                        }
                    ),
                true
            );

            await flush();

            assert.strictEqual(
                calls,
                1
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "document-ready-references"
                    ].state,
                "succeeded"
            );

            coordinator
                .requestDocumentReadyReferences(
                    {
                        documentReady:
                            true
                    }
                );

            await flush();

            assert.strictEqual(
                calls,
                1
            );
        });

        it("keeps references separate from MathJax startup and activity bootstrap", async function() {
            var coordinator =
                adapter.create();
            var calls = 0;

            coordinator
                .setDocumentReadyReferencesRunner(
                    function() {
                        calls += 1;

                        return {
                            state:
                                "succeeded"
                        };
                    }
                );

            coordinator
                .requestDocumentReadyReferences(
                    {
                        documentReady:
                            true
                    }
                );

            await flush();

            assert.strictEqual(
                calls,
                1
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "mathjax-startup-trigger"
                    ].state,
                "waiting"
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "activity-bootstrap-trigger"
                    ].state,
                "waiting"
            );
        });

        it("fails references when no runner is configured", async function() {
            var coordinator =
                adapter.create();

            coordinator
                .requestDocumentReadyReferences(
                    {
                        documentReady:
                            true
                    }
                );

            await flush();

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "document-ready-references"
                    ].state,
                "failed"
            );
        });


        it("owns the initial MathJax timeout before Process begin", async function() {
            var coordinator =
                adapter.create({
                    initialMathJaxTimeoutMs: 2
                });

            await new Promise(
                function(resolve) {
                    setTimeout(resolve, 5);
                }
            );

            var report =
                coordinator.inspect();
            var task =
                report.tasks[
                    "mathjax-initial-process"
                ];

            assert.strictEqual(
                task.state,
                "timed-out"
            );

            assert.strictEqual(
                task.result.code,
                "XR-MATHJAX-INITIAL-101"
            );

            assert.strictEqual(
                task.result.deadlineMilliseconds,
                2
            );

            assert.strictEqual(
                task.result.phase,
                "waiting-for-process"
            );

            assert.strictEqual(
                task.result.generation,
                null
            );

            assert.strictEqual(
                task.result.begun,
                false
            );

            assert.strictEqual(
                task.result.completed,
                false
            );

            assert.strictEqual(
                task.result.operationId,
                task.operationId
            );
        });

        it("records bound generation metadata when initial MathJax times out", async function() {
            var coordinator =
                adapter.create({
                    initialMathJaxTimeoutMs: 2
                });

            assert.strictEqual(
                coordinator
                    .beginInitialMathJaxProcess({
                        generation: 7
                    }),
                true
            );

            await new Promise(
                function(resolve) {
                    setTimeout(resolve, 5);
                }
            );

            var task =
                coordinator.inspect()
                    .tasks[
                        "mathjax-initial-process"
                    ];

            assert.strictEqual(
                task.state,
                "timed-out"
            );

            assert.strictEqual(
                task.result.phase,
                "process-running"
            );

            assert.strictEqual(
                task.result.generation,
                7
            );

            assert.strictEqual(
                task.result.begun,
                true
            );

            assert.strictEqual(
                task.result.observedErrorCount,
                0
            );
        });

        it("recovers a timed-out initial MathJax task for the bound generation", async function() {
            var coordinator =
                adapter.create({
                    initialMathJaxTimeoutMs: 2
                });

            coordinator
                .beginInitialMathJaxProcess({
                    generation: 8
                });

            await new Promise(
                function(resolve) {
                    setTimeout(resolve, 5);
                }
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "mathjax-initial-process"
                    ].state,
                "timed-out"
            );

            assert.strictEqual(
                coordinator
                    .completeInitialMathJaxProcess({
                        generation: 8
                    }),
                true
            );

            await flush();

            var recoveredTask =
                coordinator.inspect()
                    .tasks[
                        "mathjax-initial-process"
                    ];

            assert.strictEqual(
                recoveredTask.state,
                "succeeded"
            );

            assert.strictEqual(
                recoveredTask.error,
                null
            );

            assert.strictEqual(
                recoveredTask.result.generation,
                8
            );

            assert.strictEqual(
                recoveredTask
                    .lastTimeout
                    .result
                    .code,
                "XR-MATHJAX-INITIAL-101"
            );

            assert.strictEqual(
                recoveredTask
                    .lastTimeout
                    .result
                    .generation,
                8
            );

            assert.strictEqual(
                recoveredTask
                    .lastTimeout
                    .result
                    .phase,
                "process-running"
            );

            assert.strictEqual(
                coordinator.inspect().events.some(
                    function(event) {
                        return (
                            event.type ===
                                "task-recovered" &&
                            event.taskId ===
                                "mathjax-initial-process"
                        );
                    }
                ),
                true
            );

            assert.strictEqual(
                coordinator.inspect().events.some(
                    function(event) {
                        return (
                            event.type ===
                                "task-state" &&
                            event.taskId ===
                                "mathjax-initial-process" &&
                            event.details.state ===
                                "timed-out"
                        );
                    }
                ),
                true
            );
        });

        it("rejects mismatched completion after initial MathJax timeout", async function() {
            var coordinator =
                adapter.create({
                    initialMathJaxTimeoutMs: 2
                });

            coordinator
                .beginInitialMathJaxProcess({
                    generation: 11
                });

            await new Promise(
                function(resolve) {
                    setTimeout(resolve, 5);
                }
            );

            assert.strictEqual(
                coordinator
                    .completeInitialMathJaxProcess({
                        generation: 12
                    }),
                false
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "mathjax-initial-process"
                    ].state,
                "timed-out"
            );

            assert.strictEqual(
                coordinator.inspect().events.some(
                    function(event) {
                        return (
                            event.type ===
                                "initial-mathjax-process-completion-rejected" &&
                            event.taskId ===
                                "mathjax-initial-process" &&
                            event.details.reason ===
                                "generation-mismatch"
                        );
                    }
                ),
                true
            );
        });

        it("recovers derived readiness after late initial MathJax completion", async function() {
            var coordinator =
                adapter.create({
                    initialMathJaxTimeoutMs: 2
                });

            adapter.signalTransition(
                coordinator,
                "operations",
                "initial-state",
                "available"
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "sage-initial",
                "not-required"
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "sage-inline-initial",
                "not-required"
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "activity",
                "initialized"
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "initial-math-answers",
                "not-required"
            );

            coordinator
                .beginInitialMathJaxProcess({
                    generation: 15
                });

            await new Promise(
                function(resolve) {
                    setTimeout(resolve, 5);
                }
            );

            await flush();

            assert.strictEqual(
                adapter.readinessSnapshot(
                    coordinator
                ).contentReady,
                "degraded"
            );

            assert.strictEqual(
                adapter.readinessSnapshot(
                    coordinator
                ).pageReadiness,
                "degraded"
            );

            assert.strictEqual(
                coordinator
                    .completeInitialMathJaxProcess({
                        generation: 15
                    }),
                true
            );

            await flush();

            assert.strictEqual(
                adapter.readinessSnapshot(
                    coordinator
                ).contentReady,
                "ready"
            );

            assert.strictEqual(
                adapter.readinessSnapshot(
                    coordinator
                ).pageReadiness,
                "ready"
            );
        });

        it("rejects an initial MathJax error without the bound generation", function() {
            var coordinator =
                adapter.create({
                    initialMathJaxTimeoutMs: 1000
                });

            coordinator
                .beginInitialMathJaxProcess({
                    generation: 13
                });

            assert.strictEqual(
                coordinator
                    .observeInitialMathJaxProcessError({
                        message:
                            "missing generation"
                    }),
                false
            );

            assert.strictEqual(
                coordinator.inspect().events.some(
                    function(event) {
                        return (
                            event.type ===
                                "initial-mathjax-process-error-rejected" &&
                            event.taskId ===
                                "mathjax-initial-process" &&
                            event.details.reason ===
                                "missing-generation"
                        );
                    }
                ),
                true
            );

            assert.strictEqual(
                coordinator
                    .completeInitialMathJaxProcess({
                        generation: 13
                    }),
                true
            );
        });


        it("rearms degraded initial inline Sage for visible retry", function() {
            var coordinator =
                adapter.create();

            adapter.signalTransition(
                coordinator,
                "components",
                "sage-inline-initial",
                "degraded",
                {
                    expected: 2,
                    failed: 1,
                    settled: 2
                }
            );

            var failedTask =
                coordinator.inspect()
                    .tasks[
                        "sage-inline-initial"
                    ];

            assert.strictEqual(
                failedTask.state,
                "degraded"
            );

            var previousAttempt =
                failedTask.attempt;
            var previousOperationId =
                failedTask.operationId;

            var retry =
                coordinator
                    .beginInitialInlineSageAttempt({
                        placeholders: 1
                    });

            assert.strictEqual(
                retry.rearmed,
                true
            );

            assert.strictEqual(
                retry.attempt,
                previousAttempt + 1
            );

            assert.notStrictEqual(
                retry.operationId,
                previousOperationId
            );

            assert.strictEqual(
                coordinator.inspect()
                    .tasks[
                        "sage-inline-initial"
                    ].state,
                "waiting"
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "sage-inline-initial",
                "settled",
                {
                    expected: 2,
                    failed: 0,
                    settled: 2
                }
            );

            var recoveredTask =
                coordinator.inspect()
                    .tasks[
                        "sage-inline-initial"
                    ];

            assert.strictEqual(
                recoveredTask.state,
                "succeeded"
            );

            assert.strictEqual(
                recoveredTask.operationId,
                retry.operationId
            );

            assert.strictEqual(
                coordinator.inspect().events.some(
                    function(event) {
                        return (
                            event.type ===
                                "external-task-rearmed" &&
                            event.taskId ===
                                "sage-inline-initial" &&
                            event.details
                                .previousOperationId ===
                                previousOperationId
                        );
                    }
                ),
                true
            );
        });


        it("preserves canonical Sage terminal metadata", function() {
            var coordinator =
                adapter.create();

            adapter.signalTransition(
                coordinator,
                "components",
                "sage-initial",
                "failed",
                {
                    requestCount:
                        1,
                    errorName:
                        "NetworkError",
                    authorizationToken:
                        "must-not-survive",
                    expression:
                        "must-not-survive",
                    studentAnswer:
                        "must-not-survive"
                }
            );

            var task =
                coordinator.inspect()
                    .tasks[
                        "canonical-sage"
                    ];

            assert.strictEqual(
                task.state,
                "degraded"
            );

            assert.strictEqual(
                task.result.observedState,
                "failed"
            );

            assert.strictEqual(
                task.result.details.errorName,
                "NetworkError"
            );

            assert.strictEqual(
                task.result.details
                    .authorizationToken,
                undefined
            );

            assert.strictEqual(
                task.result.details.expression,
                undefined
            );

            assert.strictEqual(
                task.result.details.studentAnswer,
                undefined
            );
        });

        it("creates a new canonical Sage operation for retry", function() {
            var coordinator =
                adapter.create();

            adapter.signalTransition(
                coordinator,
                "operations",
                "sage-initial-request",
                "waiting-for-seed",
                {
                    expressions:
                        3
                }
            );

            var first =
                coordinator.inspect()
                    .tasks[
                        "canonical-sage"
                    ];

            assert.strictEqual(
                first.state,
                "waiting"
            );

            assert.strictEqual(
                typeof first.operationId,
                "number"
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "sage-initial",
                "failed",
                {
                    requestCount:
                        1,
                    errorName:
                        "NetworkError"
                }
            );

            var failed =
                coordinator.inspect()
                    .tasks[
                        "canonical-sage"
                    ];

            assert.strictEqual(
                failed.state,
                "degraded"
            );

            assert.strictEqual(
                failed.operationId,
                first.operationId
            );

            adapter.signalTransition(
                coordinator,
                "operations",
                "sage-initial-request",
                "waiting-for-seed",
                {
                    expressions:
                        3
                }
            );

            var retry =
                coordinator.inspect()
                    .tasks[
                        "canonical-sage"
                    ];

            assert.strictEqual(
                retry.state,
                "waiting"
            );

            assert.strictEqual(
                retry.attempt,
                first.attempt + 1
            );

            assert.notStrictEqual(
                retry.operationId,
                first.operationId
            );

            adapter.signalTransition(
                coordinator,
                "operations",
                "sage-initial-request",
                "submitted",
                {
                    request:
                        2
                }
            );

            adapter.signalTransition(
                coordinator,
                "operations",
                "sage-initial-request",
                "response-received",
                {
                    requestDurationMilliseconds:
                        25
                }
            );

            adapter.signalTransition(
                coordinator,
                "components",
                "sage-initial",
                "results-available",
                {
                    resultCount:
                        3,
                    expressionFailureCount:
                        0
                }
            );

            var recovered =
                coordinator.inspect()
                    .tasks[
                        "canonical-sage"
                    ];

            assert.strictEqual(
                recovered.state,
                "succeeded"
            );

            assert.strictEqual(
                recovered.operationId,
                retry.operationId
            );

            assert.strictEqual(
                recovered.result
                    .observedState,
                "results-available"
            );

            assert.strictEqual(
                recovered.result
                    .details
                    .resultCount,
                3
            );

            var events =
                coordinator.inspect()
                    .events;

            assert.strictEqual(
                events.some(
                    function(event) {
                        return (
                            event.type ===
                                "external-task-rearmed" &&
                            event.taskId ===
                                "canonical-sage" &&
                            event.details
                                .previousOperationId ===
                                first.operationId &&
                            event.details
                                .operationId ===
                                retry.operationId
                        );
                    }
                ),
                true
            );

            assert.strictEqual(
                events.some(
                    function(event) {
                        return (
                            event.type ===
                                "canonical-sage-stage-observed" &&
                            event.taskId ===
                                "canonical-sage" &&
                            event.details.stage ===
                                "submitted" &&
                            event.details
                                .operationId ===
                                retry.operationId
                        );
                    }
                ),
                true
            );

            assert.strictEqual(
                events.some(
                    function(event) {
                        return (
                            event.type ===
                                "canonical-sage-stage-observed" &&
                            event.taskId ===
                                "canonical-sage" &&
                            event.details.stage ===
                                "response-received" &&
                            event.details
                                .operationId ===
                                retry.operationId
                        );
                    }
                ),
                true
            );
        });

    }
);
