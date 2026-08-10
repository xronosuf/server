"use strict";

var assert =
    require("assert");

var probe =
    require(
        "../public/javascripts/math-answer-initial-fault-probe"
    );

function createStorage(initialValue) {
    var values = {};

    if (initialValue !== undefined) {
        values[
            probe.storageKey
        ] = initialValue;
    }

    return {
        getItem:
            function(key) {
                return Object.prototype
                    .hasOwnProperty.call(
                        values,
                        key
                    )
                    ? values[key]
                    : null;
            },

        removeItem:
            function(key) {
                delete values[key];
            },

        has:
            function(key) {
                return Object.prototype
                    .hasOwnProperty.call(
                        values,
                        key
                    );
            }
    };
}

describe(
    "initial math-answer fault probe",
    function() {
        it(
            "does nothing when no request exists",
            function() {
                var consumed =
                    probe.consumeRequest(
                        createStorage()
                    );

                assert.strictEqual(
                    consumed.probe,
                    null
                );

                assert.strictEqual(
                    consumed.reason,
                    "not-requested"
                );
            }
        );

        it(
            "normalizes a targeted missing-model request",
            function() {
                var normalized =
                    probe.normalizeRequest({
                        faultType:
                            "missing-answer-model",
                        authoredId:
                            " runtimeInteger "
                    });

                assert.deepStrictEqual(
                    normalized,
                    {
                        faultType:
                            "missing-answer-model",
                        authoredId:
                            "runtimeInteger"
                    }
                );
            }
        );

        it(
            "rejects unsupported or untargeted requests",
            function() {
                assert.strictEqual(
                    probe.normalizeRequest({
                        faultType:
                            "not-real",
                        authoredId:
                            "runtimeInteger"
                    }),
                    null
                );

                assert.strictEqual(
                    probe.normalizeRequest({
                        faultType:
                            "missing-answer-model"
                    }),
                    null
                );

                assert.strictEqual(
                    probe.normalizeRequest({
                        faultType:
                            "missing-answer-model",
                        authoredId:
                            "   "
                    }),
                    null
                );
            }
        );

        it(
            "consumes malformed storage without arming",
            function() {
                var storage =
                    createStorage(
                        "{not-json"
                    );

                var consumed =
                    probe.consumeRequest(
                        storage
                    );

                assert.strictEqual(
                    consumed.probe,
                    null
                );

                assert.strictEqual(
                    consumed.reason,
                    "invalid-json"
                );

                assert.strictEqual(
                    storage.has(
                        probe.storageKey
                    ),
                    false
                );
            }
        );

        it(
            "claims exactly one matching initial answer",
            function() {
                var events = [];

                var storage =
                    createStorage(
                        JSON.stringify({
                            faultType:
                                "missing-answer-model",
                            authoredId:
                                "runtimeInteger"
                        })
                    );

                var controller =
                    probe.install({
                        storage:
                            storage,

                        pageRuntime: {
                            event:
                                function(name, details) {
                                    events.push({
                                        name:
                                            name,
                                        details:
                                            details
                                    });
                                }
                        }
                    });

                assert.strictEqual(
                    controller.armed,
                    true
                );

                assert.strictEqual(
                    storage.has(
                        probe.storageKey
                    ),
                    false
                );

                assert.strictEqual(
                    controller.claim(
                        "missing-answer-model",
                        {
                            initialProcessActive:
                                false,
                            authoredId:
                                "runtimeInteger"
                        }
                    ),
                    false
                );

                assert.strictEqual(
                    controller.claim(
                        "missing-answer-model",
                        {
                            initialProcessActive:
                                true,
                            authoredId:
                                "runtimeExpression"
                        }
                    ),
                    false
                );

                var claimed =
                    controller.claim(
                        "missing-answer-model",
                        {
                            initialProcessActive:
                                true,
                            authoredId:
                                "runtimeInteger",
                            answerId:
                                "answer0problem2",
                            mathJaxInputId:
                                "MathJax-Element-3"
                        }
                    );

                assert.deepStrictEqual(
                    claimed,
                    {
                        faultType:
                            "missing-answer-model",
                        authoredId:
                            "runtimeInteger"
                    }
                );

                assert.strictEqual(
                    controller.claim(
                        "missing-answer-model",
                        {
                            initialProcessActive:
                                true,
                            authoredId:
                                "runtimeInteger"
                        }
                    ),
                    false
                );

                assert.strictEqual(
                    events.filter(
                        function(entry) {
                            return (
                                entry.name ===
                                "math-answer-initial-fault-probe-armed"
                            );
                        }
                    ).length,
                    1
                );

                assert.strictEqual(
                    events.filter(
                        function(entry) {
                            return (
                                entry.name ===
                                "math-answer-initial-fault-probe-injected"
                            );
                        }
                    ).length,
                    1
                );

                assert.strictEqual(
                    events.filter(
                        function(entry) {
                            return (
                                entry.name ===
                                "math-answer-initial-fault-probe-consumed"
                            );
                        }
                    ).length,
                    1
                );

                assert.strictEqual(
                    events.filter(
                        function(entry) {
                            return (
                                entry.name ===
                                "math-answer-initial-fault-probe-injected"
                            );
                        }
                    )[0].details.answerId,
                    "answer0problem2"
                );
            }
        );
    }
);
