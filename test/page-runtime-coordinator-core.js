"use strict";

var assert = require("assert");
var coordinatorCore = require(
    "../public/javascripts/page-runtime-coordinator-core"
);

function delay(milliseconds, value) {
    return new Promise(function(resolve) {
        setTimeout(function() {
            resolve(value);
        }, milliseconds);
    });
}

describe("page runtime coordinator core", function() {
    it("runs independent tasks without artificial serialization", function() {
        var coordinator =
            coordinatorCore.create();
        var started = [];
        var firstResolve;
        var secondResolve;

        coordinator.register({
            id: "first",
            run: function() {
                started.push("first");

                return new Promise(function(resolve) {
                    firstResolve = resolve;
                });
            }
        });

        coordinator.register({
            id: "second",
            run: function() {
                started.push("second");

                return new Promise(function(resolve) {
                    secondResolve = resolve;
                });
            }
        });

        coordinator.start();

        assert.deepStrictEqual(
            started.sort(),
            ["first", "second"]
        );

        firstResolve();
        secondResolve();
    });

    it("waits for every prerequisite", async function() {
        var coordinator =
            coordinatorCore.create();
        var dependentStarted = false;
        var resolveFirst;
        var resolveSecond;

        coordinator.register({
            id: "first",
            run: function() {
                return new Promise(function(resolve) {
                    resolveFirst = resolve;
                });
            }
        });

        coordinator.register({
            id: "second",
            run: function() {
                return new Promise(function(resolve) {
                    resolveSecond = resolve;
                });
            }
        });

        coordinator.register({
            id: "joined",
            dependsOn: [
                "first",
                "second"
            ],
            run: function() {
                dependentStarted = true;
            }
        });

        coordinator.start();

        assert.strictEqual(
            dependentStarted,
            false
        );

        resolveFirst();
        await Promise.resolve();

        assert.strictEqual(
            dependentStarted,
            false
        );

        resolveSecond();
        await Promise.resolve();
        await Promise.resolve();

        assert.strictEqual(
            dependentStarted,
            true
        );
    });

    it("accepts several valid completion orders", async function() {
        var coordinator =
            coordinatorCore.create();
        var order = [];

        coordinator.register({
            id: "state",
            run: function() {
                return delay(8).then(function() {
                    order.push("state");
                });
            }
        });

        coordinator.register({
            id: "mathjax",
            run: function() {
                return delay(1).then(function() {
                    order.push("mathjax");
                });
            }
        });

        coordinator.register({
            id: "ready",
            dependsOn: [
                "state",
                "mathjax"
            ],
            run: function() {
                order.push("ready");
            }
        });

        coordinator.start();
        await delay(15);

        assert.deepStrictEqual(
            order,
            [
                "mathjax",
                "state",
                "ready"
            ]
        );
    });

    it("rejects missing dependencies", function() {
        var coordinator =
            coordinatorCore.create();

        coordinator.register({
            id: "dependent",
            dependsOn: ["missing"]
        });

        assert.throws(
            function() {
                coordinator.start();
            },
            /Missing coordinator dependency/
        );
    });

    it("rejects dependency cycles", function() {
        var coordinator =
            coordinatorCore.create();

        coordinator.register({
            id: "a",
            dependsOn: ["b"]
        });

        coordinator.register({
            id: "b",
            dependsOn: ["a"]
        });

        assert.throws(
            function() {
                coordinator.start();
            },
            /dependency cycle/
        );
    });

    it("rejects duplicate task registration", function() {
        var coordinator =
            coordinatorCore.create();

        coordinator.register({
            id: "same"
        });

        assert.throws(
            function() {
                coordinator.register({
                    id: "same"
                });
            },
            /Duplicate coordinator task/
        );
    });

    it("ignores duplicate coordinator starts", function() {
        var coordinator =
            coordinatorCore.create();
        var count = 0;

        coordinator.register({
            id: "once",
            run: function() {
                count += 1;
            }
        });

        coordinator.start();
        coordinator.start();

        assert.strictEqual(count, 1);

        assert.strictEqual(
            coordinator.inspect().events.filter(
                function(event) {
                    return (
                        event.type ===
                        "duplicate-start-ignored"
                    );
                }
            ).length,
            1
        );
    });

    it("supports synchronous success", async function() {
        var coordinator =
            coordinatorCore.create();

        coordinator.register({
            id: "sync",
            run: function() {
                return 42;
            }
        });

        coordinator.start();
        await Promise.resolve();

        assert.strictEqual(
            coordinator.inspect()
                .tasks.sync.state,
            "succeeded"
        );

        assert.strictEqual(
            coordinator.inspect()
                .tasks.sync.result,
            42
        );
    });

    it("supports Promise rejection", async function() {
        var coordinator =
            coordinatorCore.create();

        coordinator.register({
            id: "rejected",
            run: function() {
                return Promise.reject(
                    new Error("broken")
                );
            }
        });

        coordinator.start();
        await Promise.resolve();
        await Promise.resolve();

        assert.strictEqual(
            coordinator.inspect()
                .tasks.rejected.state,
            "failed"
        );

        assert.strictEqual(
            coordinator.inspect()
                .tasks.rejected.error,
            "broken"
        );
    });

    it("observes timeouts and blocks strict descendants", async function() {
        var coordinator =
            coordinatorCore.create();

        coordinator.register({
            id: "slow",
            timeoutMs: 5,
            run: function() {
                return delay(20);
            }
        });

        coordinator.register({
            id: "strict-dependent",
            dependsOn: ["slow"]
        });

        coordinator.start();
        await delay(10);

        assert.strictEqual(
            coordinator.inspect()
                .tasks.slow.state,
            "timed-out"
        );

        assert.strictEqual(
            coordinator.inspect()
                .tasks["strict-dependent"].state,
            "blocked"
        );

        assert.deepStrictEqual(
            coordinator.inspect()
                .tasks["strict-dependent"]
                .blockedBy,
            ["slow"]
        );
    });

    it("allows a degradable dependency when configured", async function() {
        var coordinator =
            coordinatorCore.create();

        coordinator.register({
            id: "optional-content",
            run: function() {
                return {
                    state: "degraded",
                    value: "fallback-visible"
                };
            }
        });

        coordinator.register({
            id: "page",
            dependsOn: [
                "optional-content"
            ],
            accepts: {
                "optional-content": [
                    "succeeded",
                    "not-required",
                    "degraded"
                ]
            }
        });

        coordinator.start();
        await Promise.resolve();
        await Promise.resolve();

        assert.strictEqual(
            coordinator.inspect()
                .tasks.page.state,
            "succeeded"
        );
    });

    it("treats not-required as an accepted terminal state", async function() {
        var coordinator =
            coordinatorCore.create();

        coordinator.register({
            id: "sage",
            run: function() {
                return {
                    state: "not-required"
                };
            }
        });

        coordinator.register({
            id: "content-ready",
            dependsOn: ["sage"]
        });

        coordinator.start();
        await Promise.resolve();
        await Promise.resolve();

        assert.strictEqual(
            coordinator.inspect()
                .tasks["content-ready"].state,
            "succeeded"
        );
    });

    it("records stale completion after timeout", async function() {
        var coordinator =
            coordinatorCore.create();

        coordinator.register({
            id: "late",
            timeoutMs: 2,
            run: function() {
                return delay(10, "late-result");
            }
        });

        coordinator.start();
        await delay(15);

        assert.strictEqual(
            coordinator.inspect()
                .tasks.late.state,
            "timed-out"
        );

        assert.strictEqual(
            coordinator.inspect().events.some(
                function(event) {
                    return (
                        event.type ===
                            "stale-task-completion" &&
                        event.taskId === "late"
                    );
                }
            ),
            true
        );
    });

    it("bounds diagnostic history", function() {
        var coordinator =
            coordinatorCore.create({
                maxEvents: 3
            });

        coordinator.register({
            id: "one"
        });
        coordinator.register({
            id: "two"
        });
        coordinator.register({
            id: "three"
        });
        coordinator.register({
            id: "four"
        });

        assert.strictEqual(
            coordinator.inspect()
                .events.length,
            3
        );
    });

    it("returns deterministic task reports", async function() {
        var coordinator =
            coordinatorCore.create();

        coordinator.register({
            id: "root",
            run: function() {
                return "done";
            }
        });

        coordinator.register({
            id: "child",
            dependsOn: ["root"]
        });

        coordinator.start();
        await Promise.resolve();
        await Promise.resolve();

        assert.deepStrictEqual(
            Object.keys(
                coordinator.inspect().tasks
            ),
            ["root", "child"]
        );

        assert.strictEqual(
            coordinator.inspect()
                .tasks.root.result,
            "done"
        );

        assert.strictEqual(
            coordinator.inspect()
                .tasks.child.state,
            "succeeded"
        );
    });
    it("assigns a distinct operation ID to each started task", async function() {
        var coordinator =
            coordinatorCore.create();
        var observed = [];

        coordinator.register({
            id: "first-operation",
            run: function(context, metadata) {
                observed.push(
                    metadata.operationId
                );
            }
        });

        coordinator.register({
            id: "second-operation",
            run: function(context, metadata) {
                observed.push(
                    metadata.operationId
                );
            }
        });

        coordinator.start();
        await Promise.resolve();

        assert.strictEqual(
            observed.length,
            2
        );

        assert.notStrictEqual(
            observed[0],
            observed[1]
        );

        assert.strictEqual(
            coordinator.inspect()
                .tasks["first-operation"]
                .operationId,
            observed[0]
        );

        assert.strictEqual(
            coordinator.inspect()
                .tasks["second-operation"]
                .operationId,
            observed[1]
        );
    });

    it("allows explicitly configured late success after timeout", async function() {
        var coordinator =
            coordinatorCore.create();

        coordinator.register({
            id: "recoverable-late",
            timeoutMs: 2,
            recoveryPolicy:
                "allow-late-success",
            run: function() {
                return delay(
                    10,
                    "late-success"
                );
            }
        });

        coordinator.start();
        await delay(5);

        assert.strictEqual(
            coordinator.inspect()
                .tasks["recoverable-late"]
                .state,
            "timed-out"
        );

        await delay(10);

        assert.strictEqual(
            coordinator.inspect()
                .tasks["recoverable-late"]
                .state,
            "succeeded"
        );

        assert.strictEqual(
            coordinator.inspect()
                .tasks["recoverable-late"]
                .result,
            "late-success"
        );

        assert.strictEqual(
            coordinator.inspect().events.some(
                function(event) {
                    return (
                        event.type ===
                            "task-recovered" &&
                        event.taskId ===
                            "recoverable-late"
                    );
                }
            ),
            true
        );
    });

    it("rejects unsupported recovery policies", function() {
        var coordinator =
            coordinatorCore.create();

        assert.throws(
            function() {
                coordinator.register({
                    id: "invalid-recovery",
                    recoveryPolicy:
                        "always-accept"
                });
            },
            /Unsupported recoveryPolicy/
        );
    });

    it("unblocks a strict descendant after allowed late recovery", async function() {
        var coordinator =
            coordinatorCore.create();
        var descendantRuns = 0;

        coordinator.register({
            id: "recovering-parent",
            timeoutMs: 2,
            recoveryPolicy:
                "allow-late-success",
            run: function() {
                return delay(
                    10,
                    "recovered"
                );
            }
        });

        coordinator.register({
            id: "strict-child",
            dependsOn: [
                "recovering-parent"
            ],
            run: function() {
                descendantRuns += 1;
            }
        });

        coordinator.start();
        await delay(5);

        assert.strictEqual(
            coordinator.inspect()
                .tasks["recovering-parent"]
                .state,
            "timed-out"
        );

        assert.strictEqual(
            coordinator.inspect()
                .tasks["strict-child"]
                .state,
            "blocked"
        );

        await delay(10);
        await Promise.resolve();

        assert.strictEqual(
            coordinator.inspect()
                .tasks["recovering-parent"]
                .state,
            "succeeded"
        );

        assert.strictEqual(
            coordinator.inspect()
                .tasks["strict-child"]
                .state,
            "succeeded"
        );

        assert.strictEqual(
            descendantRuns,
            1
        );

        assert.strictEqual(
            coordinator.inspect().events.some(
                function(event) {
                    return (
                        event.type ===
                            "task-unblocked" &&
                        event.taskId ===
                            "strict-child"
                    );
                }
            ),
            true
        );
    });

    it("reconsiders transitively blocked descendants after recovery", async function() {
        var coordinator =
            coordinatorCore.create();
        var order = [];

        coordinator.register({
            id: "recovering-root",
            timeoutMs: 2,
            recoveryPolicy:
                "allow-late-success",
            run: function() {
                return delay(10);
            }
        });

        coordinator.register({
            id: "middle",
            dependsOn: [
                "recovering-root"
            ],
            run: function() {
                order.push("middle");
            }
        });

        coordinator.register({
            id: "leaf",
            dependsOn: [
                "middle"
            ],
            run: function() {
                order.push("leaf");
            }
        });

        coordinator.start();
        await delay(5);

        assert.strictEqual(
            coordinator.inspect()
                .tasks.middle.state,
            "blocked"
        );

        assert.strictEqual(
            coordinator.inspect()
                .tasks.leaf.state,
            "blocked"
        );

        await delay(10);
        await Promise.resolve();
        await Promise.resolve();

        assert.deepStrictEqual(
            order,
            [
                "middle",
                "leaf"
            ]
        );

        assert.strictEqual(
            coordinator.inspect()
                .tasks.leaf.state,
            "succeeded"
        );
    });

});
