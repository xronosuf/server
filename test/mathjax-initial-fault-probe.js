"use strict";

var assert =
    require("assert");

var probe =
    require(
        "../public/javascripts/mathjax-initial-fault-probe"
    );


describe(
    "initial MathJax fault probe",
    function() {
        it(
            "ignores an unrelated fragment",
            function() {
                assert.strictEqual(
                    probe.requestedProbe(
                        "#other=value"
                    ),
                    null
                );
            }
        );

        it(
            "parses the controlled processing-error request",
            function() {
                assert.deepStrictEqual(
                    probe.requestedProbe(
                        "#xronosMathJaxInitialFault=processing-error&scriptIndex=4"
                    ),
                    {
                        faultType:
                            "processing-error",
                        scriptIndex:
                            4
                    }
                );
            }
        );

        it(
            "defaults an invalid script index to zero",
            function() {
                assert.deepStrictEqual(
                    probe.requestedProbe(
                        "#xronosMathJaxInitialFault=processing-error&scriptIndex=-8"
                    ),
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
            "injects once and restores before throwing",
            function() {
                var calls = [];
                var originalCalls = 0;

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
                        fragment:
                            "#xronosMathJaxInitialFault=processing-error&scriptIndex=1"
                    });

                assert.strictEqual(
                    result.armed,
                    true
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
