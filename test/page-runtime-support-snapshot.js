"use strict";

var should = require("should");

var snapshotAdapter = require(
    "../public/javascripts/page-runtime-support-snapshot"
);
var supportPolicy = require(
    "../public/javascripts/page-runtime-support-policy"
);

function runtime() {
    return {
        services: {},
        operations: {},
        components: {}
    };
}

function watchdogs() {
    return {
        initialState: {
            deadlineMilliseconds: 15000,
            timedOut: false,
            timedOutAtElapsedMs: null
        },
        initialMathJax: {
            deadlineMilliseconds: 15000,
            timedOut: false,
            timedOutAtElapsedMs: null,
            completed: false,
            completedAtElapsedMs: null,
            generation: null,
            errorCount: 0
        }
    };
}

describe(
    "page runtime support snapshot",
    function() {
        it(
            "does not mutate a sparse runtime input",
            function() {
                var observed = {};
                var snapshot;

                snapshot =
                    snapshotAdapter.fromRuntime(
                        observed,
                        {}
                    );

                Object.keys(observed)
                    .should.deepEqual([]);

                should(
                    snapshot.stateWebsocket
                ).equal(undefined);

                should(
                    snapshot.stateDifferentialSync
                ).equal(undefined);

                should(
                    snapshot.activity
                ).equal(undefined);
            }
        );

        it(
            "maps live runtime observations into support policy names",
            function() {
                var observed = runtime();
                var snapshot;

                observed.services[
                    "state-websocket"
                ] = {
                    state: "closed",
                    details: {
                        reason: "connection-lost"
                    }
                };

                observed.services[
                    "state-websocket-liveness"
                ] = {
                    state: "degraded"
                };

                observed.operations[
                    "state-differential-sync"
                ] = {
                    state: "failed"
                };

                observed.components[
                    "sage-inline-initial"
                ] = {
                    state: "degraded",
                    details: {
                        retryable: true
                    }
                };

                observed.components[
                    "initial-math-answers"
                ] = {
                    state: "settled"
                };

                observed.components.activity = {
                    state: "initialized"
                };

                snapshot =
                    snapshotAdapter.fromRuntime(
                        observed,
                        watchdogs()
                    );

                snapshot.stateWebsocket
                    .state.should.equal("closed");
                snapshot.websocketLiveness
                    .state.should.equal("degraded");
                snapshot.stateDifferentialSync
                    .state.should.equal("failed");
                snapshot.initialSage
                    .state.should.equal("degraded");
                snapshot.initialMathAnswers
                    .state.should.equal("settled");
                snapshot.activity
                    .state.should.equal("initialized");
            }
        );

        it(
            "normalizes an initial-state watchdog deadline",
            function() {
                var observed = runtime();
                var readiness = watchdogs();
                var snapshot;
                var issue;

                observed.operations[
                    "initial-state"
                ] = {
                    state: "requested",
                    details: {
                        attempt: 1
                    }
                };

                readiness.initialState.timedOut =
                    true;
                readiness.initialState
                    .timedOutAtElapsedMs =
                    15001;

                snapshot =
                    snapshotAdapter.fromRuntime(
                        observed,
                        readiness
                    );

                snapshot.initialState
                    .state.should.equal("timed-out");
                snapshot.initialState.details
                    .attempt.should.equal(1);
                snapshot.initialState.details
                    .deadlineExceeded
                    .should.equal(true);

                issue =
                    supportPolicy.primaryIssue(
                        snapshot
                    );

                issue.code.should.equal(
                    "XR-STATE-INITIAL-101"
                );
            }
        );

        it(
            "does not report an initial-state timeout after availability",
            function() {
                var observed = runtime();
                var readiness = watchdogs();
                var snapshot;

                observed.operations[
                    "initial-state"
                ] = {
                    state: "available"
                };

                readiness.initialState.timedOut =
                    true;

                snapshot =
                    snapshotAdapter.fromRuntime(
                        observed,
                        readiness
                    );

                snapshot.initialState
                    .state.should.equal("available");
                should(
                    supportPolicy.primaryIssue(
                        snapshot
                    )
                ).equal(null);
            }
        );

        it(
            "normalizes initial MathJax timeout",
            function() {
                var readiness = watchdogs();
                var snapshot;
                var issue;

                readiness.initialMathJax.timedOut =
                    true;
                readiness.initialMathJax
                    .timedOutAtElapsedMs =
                    15003;

                snapshot =
                    snapshotAdapter.fromRuntime(
                        runtime(),
                        readiness
                    );

                snapshot.initialMathJax
                    .state.should.equal("timed-out");

                issue =
                    supportPolicy.primaryIssue(
                        snapshot
                    );

                issue.code.should.equal(
                    "XR-MATHJAX-INITIAL-101"
                );
            }
        );

        it(
            "keeps completed MathJax with only parse errors nonfatal",
            function() {
                var readiness = watchdogs();
                var snapshot;

                readiness.initialMathJax.completed =
                    true;
                readiness.initialMathJax
                    .errorCount =
                    1;
                readiness.initialMathJax
                    .processingErrorCount =
                    0;
                readiness.initialMathJax.generation =
                    7;

                snapshot =
                    snapshotAdapter.fromRuntime(
                        runtime(),
                        readiness
                    );

                snapshot.initialMathJax
                    .state.should.equal("completed");
                snapshot.initialMathJax.details
                    .errorCount.should.equal(1);
                snapshot.initialMathJax.details
                    .processingErrorCount.should.equal(0);
                snapshot.initialMathJax.details
                    .generation.should.equal(7);
                should(
                    supportPolicy.primaryIssue(
                        snapshot
                    )
                ).equal(null);
            }
        );

        it(
            "normalizes completed MathJax processing errors as failed",
            function() {
                var readiness = watchdogs();
                var snapshot;

                readiness.initialMathJax.completed =
                    true;
                readiness.initialMathJax
                    .errorCount =
                    2;
                readiness.initialMathJax
                    .processingErrorCount =
                    1;
                readiness.initialMathJax.generation =
                    8;

                snapshot =
                    snapshotAdapter.fromRuntime(
                        runtime(),
                        readiness
                    );

                snapshot.initialMathJax
                    .state.should.equal("failed");
                snapshot.initialMathJax.details
                    .errorCount.should.equal(2);
                snapshot.initialMathJax.details
                    .processingErrorCount.should.equal(1);
                snapshot.initialMathJax.details
                    .generation.should.equal(8);

                supportPolicy.primaryIssue(
                    snapshot
                ).code.should.equal(
                    "XR-MATHJAX-INITIAL-101"
                );
            }
        );

        it(
            "clears the state-save issue after confirmed success",
            function() {
                var observed = runtime();
                var snapshot;
                var issue;

                observed.operations[
                    "state-differential-sync"
                ] = {
                    state: "failed",
                    details: {
                        reason:
                            "unsupported-data"
                    }
                };

                snapshot =
                    snapshotAdapter.fromRuntime(
                        observed,
                        watchdogs()
                    );

                issue =
                    supportPolicy.primaryIssue(
                        snapshot
                    );

                issue.code.should.equal(
                    "XR-STATE-DIFF-101"
                );

                observed.operations[
                    "state-differential-sync"
                ] = {
                    state: "succeeded",
                    details: {
                        reason:
                            "server-accepted"
                    }
                };

                snapshot =
                    snapshotAdapter.fromRuntime(
                        observed,
                        watchdogs()
                    );

                should(
                    supportPolicy.primaryIssue(
                        snapshot
                    )
                ).equal(null);
            }
        );

        it(
            "preserves retryable Sage degradation for policy classification",
            function() {
                var observed = runtime();
                var snapshot;
                var issue;

                observed.components[
                    "sage-inline-initial"
                ] = {
                    state: "degraded",
                    details: {
                        retryable: true,
                        category:
                            "request-timeout"
                    }
                };

                snapshot =
                    snapshotAdapter.fromRuntime(
                        observed,
                        watchdogs()
                    );

                issue =
                    supportPolicy.primaryIssue(
                        snapshot
                    );

                issue.code.should.equal(
                    "XR-SAGE-INLINE-INITIAL-101"
                );
                issue.recoveryAction.should.equal(
                    "retry-then-hard-reload"
                );
            }
        );
    }
);
