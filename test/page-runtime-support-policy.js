"use strict";

var assert = require("assert");

var policy = require(
    "../public/javascripts/page-runtime-support-policy"
);

describe("page runtime support policy", function() {
    it("returns no issue for a healthy snapshot", function() {
        assert.deepStrictEqual(
            policy.classify({
                initialState: {
                    state: "available"
                },
                stateWebsocket: {
                    state: "open"
                },
                websocketLiveness: {
                    state: "healthy"
                },
                initialMathJax: {
                    state: "succeeded"
                },
                initialSage: {
                    state: "settled"
                },
                initialMathAnswers: {
                    state: "settled"
                },
                activity: {
                    state: "initialized"
                }
            }),
            []
        );
    });

    it("maps initial MathJax failure to hard reload", function() {
        var found =
            policy.primaryIssue({
                initialMathJax: {
                    state: "failed",
                    details: {
                        errorType:
                            "processing-error"
                    }
                }
            });

        assert.strictEqual(
            found.code,
            "XR-MATHJAX-INITIAL-101"
        );
        assert.strictEqual(
            found.subsystem,
            "math-processing"
        );
        assert.strictEqual(
            found.reason,
            "processing-error"
        );
        assert.strictEqual(
            found.recoveryAction,
            policy.RECOVERY_ACTIONS.HARD_RELOAD
        );
        assert.strictEqual(
            found.persistent,
            true
        );
    });

    it("maps retryable Sage failure to retry then hard reload", function() {
        var found =
            policy.primaryIssue({
                initialSage: {
                    state: "degraded",
                    details: {
                        category: "transient",
                        retryable: true
                    }
                }
            });

        assert.strictEqual(
            found.code,
            "XR-SAGE-INLINE-INITIAL-101"
        );
        assert.strictEqual(
            found.reason,
            "transient"
        );
        assert.strictEqual(
            found.recoveryAction,
            policy.RECOVERY_ACTIONS
                .RETRY_THEN_HARD_RELOAD
        );
    });

    it("maps nonretryable Sage failure directly to hard reload", function() {
        var found =
            policy.primaryIssue({
                initialSage: {
                    state: "failed",
                    details: {
                        category: "display",
                        retryable: false
                    }
                }
            });

        assert.strictEqual(
            found.code,
            "XR-SAGE-INLINE-INITIAL-101"
        );
        assert.strictEqual(
            found.recoveryAction,
            policy.RECOVERY_ACTIONS.HARD_RELOAD
        );
    });

    it("maps closed WebSocket to keep-open recovery", function() {
        var found =
            policy.primaryIssue({
                stateWebsocket: {
                    state: "closed",
                    details: {
                        reason: "socket-closed"
                    }
                }
            });

        assert.strictEqual(
            found.code,
            "XR-STATE-CONNECTION-101"
        );
        assert.strictEqual(
            found.severity,
            "warning"
        );
        assert.strictEqual(
            found.recoverable,
            true
        );
        assert.strictEqual(
            found.persistent,
            false
        );
        assert.strictEqual(
            found.recoveryAction,
            policy.RECOVERY_ACTIONS
                .KEEP_OPEN_UNTIL_RECONNECTED
        );
    });

    it("maps stale heartbeat to the same connection support code", function() {
        var found =
            policy.primaryIssue({
                stateWebsocket: {
                    state: "open"
                },
                websocketLiveness: {
                    state: "degraded",
                    details: {
                        reason: "pong-stale"
                    }
                }
            });

        assert.strictEqual(
            found.code,
            "XR-STATE-CONNECTION-101"
        );
        assert.strictEqual(
            found.reason,
            "pong-stale"
        );
    });

    it("clears connection issue after open healthy recovery", function() {
        assert.strictEqual(
            policy.primaryIssue({
                stateWebsocket: {
                    state: "open"
                },
                websocketLiveness: {
                    state: "healthy"
                }
            }),
            null
        );
    });

    it("prioritizes active connection loss over initial-state hard reload", function() {
        var issues =
            policy.classify({
                stateWebsocket: {
                    state: "closed"
                },
                initialState: {
                    state: "failed",
                    details: {
                        reason:
                            "state-query-failed"
                    }
                }
            });

        assert.strictEqual(
            issues.length,
            2
        );
        assert.strictEqual(
            issues[0].code,
            "XR-STATE-CONNECTION-101"
        );
        assert.strictEqual(
            issues[1].code,
            "XR-STATE-INITIAL-101"
        );
    });

    it("maps state differential failure to keep-open-until-safe recovery", function() {
        var found =
            policy.primaryIssue({
                stateDifferentialSync: {
                    state: "failed"
                }
            });

        assert.strictEqual(
            found.code,
            "XR-STATE-DIFF-101"
        );
        assert.strictEqual(
            found.subsystem,
            "state-save"
        );
        assert.strictEqual(
            found.recoveryAction,
            policy.RECOVERY_ACTIONS
                .KEEP_OPEN_UNTIL_SAVE_SAFE
        );
        assert.strictEqual(
            found.recoverable,
            true
        );
        assert.strictEqual(
            found.persistent,
            false
        );
    });

    it("maps initial answer attachment degradation to its stable support code", function() {
        var found =
            policy.primaryIssue({
                initialMathAnswers: {
                    state: "degraded"
                }
            });

        assert.strictEqual(
            found.code,
            "XR-ANSWER-INITIAL-101"
        );
        assert.strictEqual(
            found.recoveryAction,
            policy.RECOVERY_ACTIONS.HARD_RELOAD
        );
    });

    it("maps activity initialization failure to its stable support code", function() {
        var found =
            policy.primaryIssue({
                activity: {
                    state: "failed"
                }
            });

        assert.strictEqual(
            found.code,
            "XR-ACTIVITY-INITIAL-101"
        );
        assert.strictEqual(
            found.recoveryAction,
            policy.RECOVERY_ACTIONS.HARD_RELOAD
        );
    });
});
