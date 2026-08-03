"use strict";

var assert =
    require("assert");

var probe =
    require(
        "../public/javascripts/mathjax-initial-fault-probe"
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
    "initial MathJax fault probe",
    function() {
        it(
            "does nothing when no one-shot request exists",
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
            "consumes and normalizes a processing-error request",
            function() {
                var storage =
                    createStorage(
                        JSON.stringify({
                            faultType:
                                "processing-error",
                            scriptIndex:
                                4
                        })
                    );

                var consumed =
                    probe.consumeRequest(
                        storage
                    );

                assert.deepStrictEqual(
                    consumed.probe,
                    {
                        faultType:
                            "processing-error",
                        scriptIndex:
                            4
                    }
                );

                assert.strictEqual(
                    consumed.reason,
                    "consumed"
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
            "removes malformed requests without arming",
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
            "defaults an invalid script index to zero",
            function() {
                assert.deepStrictEqual(
                    probe.normalizeRequest({
                        faultType:
                            "processing-error",
                        scriptIndex:
                            -8
                    }),
                    {
                        faultType:
                            "processing-error",
                        scriptIndex:
                            0
                    }
                );
            }
        );

        it(
            "injects once, restores, and consumes the request",
            function() {
                var calls = [];
                var originalCalls = 0;

                var storage =
                    createStorage(
                        JSON.stringify({
                            faultType:
                                "processing-error",
                            scriptIndex:
                                1
                        })
                    );

                var tex = {
                    Process:
                        function() {
                            originalCalls += 1;

                            return "processed";
                        }
                };

                var runtime = {
                    event:
                        function(name, details) {
                            calls.push({
                                name:
                                    name,
                                details:
                                    details
                            });
                        }
                };

                var result =
                    probe.install({
                        MathJax: {
                            InputJax: {
                                TeX:
                                    tex
                            }
                        },
                        pageRuntime:
                            runtime,
                        storage:
                            storage
                    });

                assert.strictEqual(
                    result.armed,
                    true
                );

                assert.strictEqual(
                    storage.has(
                        probe.storageKey
                    ),
                    false
                );

                assert.strictEqual(
                    tex.Process(
                        {
                            id:
                                "first",
                            type:
                                "math/tex",
                            text:
                                "1+1"
                        },
                        {
                            i:
                                0
                        }
                    ),
                    "processed"
                );

                assert.throws(
                    function() {
                        tex.Process(
                            {
                                id:
                                    "second",
                                type:
                                    "math/tex",
                                text:
                                    "2+2"
                            },
                            {
                                i:
                                    1
                            }
                        );
                    },
                    /controlled initial MathJax/
                );

                assert.strictEqual(
                    originalCalls,
                    1
                );

                assert.strictEqual(
                    tex.Process(
                        {
                            id:
                                "third"
                        },
                        {
                            i:
                                2
                        }
                    ),
                    "processed"
                );

                assert.strictEqual(
                    originalCalls,
                    2
                );

                assert.strictEqual(
                    calls.filter(
                        function(entry) {
                            return (
                                entry.name ===
                                "mathjax-initial-fault-probe-armed"
                            );
                        }
                    ).length,
                    1
                );

                assert.strictEqual(
                    calls.filter(
                        function(entry) {
                            return (
                                entry.name ===
                                "mathjax-initial-fault-probe-injected"
                            );
                        }
                    ).length,
                    1
                );

                assert.strictEqual(
                    calls.filter(
                        function(entry) {
                            return (
                                entry.name ===
                                "mathjax-initial-fault-probe-restored"
                            );
                        }
                    ).length,
                    1
                );
            }
        );
    }
);
