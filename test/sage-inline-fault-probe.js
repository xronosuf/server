"use strict";

var assert =
    require("assert");

var probe =
    require(
        "../public/javascripts/sage-inline-fault-probe"
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
    "inline Sage fault probe",
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
            "normalizes the supported fault types",
            function() {
                [
                    "missing-input-id",
                    "missing-placeholder",
                    "stale-attempt",
                    "page-result-error"
                ].forEach(function(faultType) {
                    var normalized =
                        probe.normalizeRequest({
                            faultType:
                                faultType,
                            callIndex:
                                3,
                            delayMilliseconds:
                                7000
                        });

                    assert.strictEqual(
                        normalized.faultType,
                        faultType
                    );

                    assert.strictEqual(
                        normalized.callIndex,
                        3
                    );
                });

                assert.strictEqual(
                    probe.normalizeRequest({
                        faultType:
                            "not-a-real-fault"
                    }),
                    null
                );
            }
        );

        it(
            "defaults invalid call indexes to zero",
            function() {
                assert.strictEqual(
                    probe.normalizeRequest({
                        faultType:
                            "missing-placeholder",
                        callIndex:
                            -4
                    }).callIndex,
                    0
                );
            }
        );

        it(
            "normalizes stale-attempt delay bounds",
            function() {
                assert.strictEqual(
                    probe.normalizeRequest({
                        faultType:
                            "stale-attempt",
                        delayMilliseconds:
                            5
                    }).delayMilliseconds,
                    6000
                );

                assert.strictEqual(
                    probe.normalizeRequest({
                        faultType:
                            "stale-attempt",
                        delayMilliseconds:
                            999999
                    }).delayMilliseconds,
                    30000
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
            "claims exactly one matching Sage call",
            function() {
                var events = [];

                var storage =
                    createStorage(
                        JSON.stringify({
                            faultType:
                                "missing-input-id",
                            callIndex:
                                2
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
                        "missing-input-id",
                        {
                            callIndex:
                                1
                        }
                    ),
                    false
                );

                var claimed =
                    controller.claim(
                        "missing-input-id",
                        {
                            callIndex:
                                2,
                            placeholderId:
                                "placeholder",
                            attempt:
                                1
                        }
                    );

                assert.strictEqual(
                    claimed.faultType,
                    "missing-input-id"
                );

                assert.strictEqual(
                    controller.claim(
                        "missing-input-id",
                        {
                            callIndex:
                                2
                        }
                    ),
                    false
                );

                assert.strictEqual(
                    events.filter(
                        function(entry) {
                            return (
                                entry.name ===
                                "sage-inline-fault-probe-armed"
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
                                "sage-inline-fault-probe-injected"
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
                                "sage-inline-fault-probe-consumed"
                            );
                        }
                    ).length,
                    1
                );
            }
        );
    }
);
