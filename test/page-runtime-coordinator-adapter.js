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
    }
);
