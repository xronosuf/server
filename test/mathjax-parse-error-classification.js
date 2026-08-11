"use strict";

var assert = require("assert");

var coordinatorAdapter = require(
    "../public/javascripts/page-runtime-coordinator-adapter"
);

describe(
    "initial MathJax parse-error classification",
    function() {
        it(
            "keeps a completed Process successful after a localized TeX parse error",
            function() {
                var coordinator =
                    coordinatorAdapter.create();
                var task;

                assert.strictEqual(
                    coordinator.beginInitialMathJaxProcess({
                        generation: 101
                    }),
                    true
                );

                assert.strictEqual(
                    coordinator.observeInitialMathJaxProcessError({
                        generation: 101,
                        errorType: "tex-parse-error",
                        messageAvailable: true
                    }),
                    true
                );

                assert.strictEqual(
                    coordinator.completeInitialMathJaxProcess({
                        generation: 101
                    }),
                    true
                );

                task =
                    coordinator.inspect()
                        .tasks[
                            "mathjax-initial-process"
                        ];

                assert.strictEqual(
                    task.state,
                    "succeeded"
                );
                assert.strictEqual(
                    task.result.errorCount,
                    1
                );
                assert.strictEqual(
                    task.result.processingErrorCount,
                    0
                );
                assert.strictEqual(
                    task.result.errors[0].errorType,
                    "tex-parse-error"
                );
            }
        );

        it(
            "fails a completed Process after Math Processing Error",
            function() {
                var coordinator =
                    coordinatorAdapter.create();
                var task;

                assert.strictEqual(
                    coordinator.beginInitialMathJaxProcess({
                        generation: 102
                    }),
                    true
                );

                assert.strictEqual(
                    coordinator.observeInitialMathJaxProcessError({
                        generation: 102,
                        errorType: "processing-error",
                        messageAvailable: true
                    }),
                    true
                );

                assert.strictEqual(
                    coordinator.completeInitialMathJaxProcess({
                        generation: 102
                    }),
                    true
                );

                task =
                    coordinator.inspect()
                        .tasks[
                            "mathjax-initial-process"
                        ];

                assert.strictEqual(
                    task.state,
                    "failed"
                );
                assert.strictEqual(
                    task.result.errorCount,
                    1
                );
                assert.strictEqual(
                    task.result.processingErrorCount,
                    1
                );
                assert.strictEqual(
                    task.result.errors[0].errorType,
                    "processing-error"
                );
            }
        );
    }
);
