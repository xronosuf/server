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

    }
);
