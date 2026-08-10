"use strict";

var assert = require("assert");

var supportReport = require(
    "../public/javascripts/page-runtime-support-report"
);


function poisonedInspection() {
    var events = [];
    var index;

    for (index = 0; index < 60; index += 1) {
        events.push({
            sequence:
                index + 1,
            at:
                "2026-08-10T22:00:00.000Z",
            elapsedMs:
                index,
            type:
                "event",
            name:
                "event-" + index,
            state:
                "observed",
            details: {
                token:
                    "SECRET-TOKEN-" + index,
                answer:
                    "STUDENT-ANSWER-" + index,
                sageSource:
                    "print('SECRET-SAGE')",
                cookie:
                    "SESSION=SECRET"
            }
        });
    }

    return {
        schemaVersion:
            1,
        supportTraceId:
            "xr-test-support-trace",
        sessionId:
            "safe-session-id",
        startedAt:
            "2026-08-10T22:00:00.000Z",
        cookie:
            "SECRET-COOKIE",
        authenticationToken:
            "SECRET-AUTH-TOKEN",
        studentAnswers: {
            answer0:
                "SECRET-STUDENT-ANSWER"
        },
        sageSource:
            "SECRET-SAGE-SOURCE",
        events:
            events,
        support: {
            snapshot: {
                stateWebsocket: {
                    state:
                        "open",
                    details: {
                        attempt:
                            1,
                        token:
                            "SECRET-SOCKET-TOKEN"
                    }
                },
                websocketLiveness: {
                    state:
                        "healthy",
                    details: {
                        latencyMilliseconds:
                            42
                    }
                },
                initialState: {
                    state:
                        "available",
                    details: {
                        outcome:
                            "found",
                        identifierCount:
                            3,
                        completeState:
                            "SECRET-FULL-STATE"
                    }
                },
                initialMathJax: {
                    state:
                        "failed",
                    details: {
                        errorCount:
                            2,
                        generation:
                            1,
                        rawError:
                            "SECRET-RAW-ERROR"
                    }
                },
                initialSage: {
                    state:
                        "degraded",
                    details: {
                        expected:
                            4,
                        failed:
                            1,
                        retryable:
                            true,
                        category:
                            "transient",
                        sageCode:
                            "SECRET-SAGE-CODE"
                    }
                },
                initialMathAnswers: {
                    state:
                        "settled",
                    details: {
                        expectedAnswers:
                            3,
                        unresolvedAnswerIds: [
                            "SECRET-ANSWER-ID"
                        ],
                        answerContents: [
                            "SECRET-ANSWER-CONTENT"
                        ]
                    }
                },
                activity: {
                    state:
                        "initialized",
                    details: {
                        path:
                            "testSuite/03-basic-sage",
                        ltiSecret:
                            "SECRET-LTI"
                    }
                }
            },
            primaryIssue: {
                code:
                    "XR-SAGE-INLINE-INITIAL-101",
                subsystem:
                    "sage",
                state:
                    "degraded",
                reason:
                    "transient",
                severity:
                    "error",
                recoveryAction:
                    "retry-then-hard-reload",
                reportable:
                    true,
                recoverable:
                    true,
                persistent:
                    true,
                token:
                    "SECRET-ISSUE-TOKEN"
            }
        }
    };
}


describe(
    "page runtime support report",
    function() {
        it(
            "builds a versioned bounded report",
            function() {
                var inspection =
                    poisonedInspection();

                var report =
                    supportReport.build({
                        inspection:
                            inspection,
                        support:
                            inspection.support,
                        path:
                            "/testSuite/03-basic-sage",
                        generatedAt:
                            "2026-08-10T22:30:00.000Z",
                        environment: {
                            userAgent:
                                "Test Browser",
                            platform:
                                "Test Platform",
                            language:
                                "en-US",
                            timezone:
                                "America/New_York",
                            online:
                                true
                        }
                    });

                assert.strictEqual(
                    report.reportType,
                    "xronos-support-report"
                );

                assert.strictEqual(
                    report.schemaVersion,
                    1
                );

                assert.strictEqual(
                    report.support.code,
                    "XR-SAGE-INLINE-INITIAL-101"
                );

                assert.strictEqual(
                    report.subsystems
                        .initialSage
                        .details
                        .retryable,
                    true
                );

                assert.strictEqual(
                    report.recentEvents.length,
                    supportReport.MAX_RECENT_EVENTS
                );

                assert.strictEqual(
                    report.recentEvents[0].sequence,
                    31
                );
            }
        );

        it(
            "includes opaque support correlation identity",
            function() {
                var inspection =
                    poisonedInspection();

                var report =
                    supportReport.build({
                        inspection:
                            inspection,
                        support:
                            inspection.support
                    });

                assert.strictEqual(
                    report.runtime
                        .supportTraceId,
                    "xr-test-support-trace"
                );

                assert.notStrictEqual(
                    supportReport
                        .format(report)
                        .indexOf(
                            "Support trace: " +
                            "xr-test-support-trace"
                        ),
                    -1
                );
            }
        );

        it(
            "never includes runtime event details",
            function() {
                var inspection =
                    poisonedInspection();

                var report =
                    supportReport.build({
                        inspection:
                            inspection,
                        support:
                            inspection.support,
                        path:
                            "/testSuite/03-basic-sage"
                    });

                report.recentEvents.forEach(
                    function(event) {
                        assert.strictEqual(
                            Object.prototype
                                .hasOwnProperty.call(
                                    event,
                                    "details"
                                ),
                            false
                        );
                    }
                );
            }
        );

        it(
            "excludes known sensitive and student-content fields",
            function() {
                var inspection =
                    poisonedInspection();

                var formatted =
                    supportReport.format(
                        supportReport.build({
                            inspection:
                                inspection,
                            support:
                                inspection.support,
                            path:
                                "/testSuite/03-basic-sage"
                        })
                    );

                [
                    "SECRET-TOKEN",
                    "SECRET-AUTH-TOKEN",
                    "SECRET-COOKIE",
                    "SECRET-STUDENT-ANSWER",
                    "SECRET-SAGE-SOURCE",
                    "SECRET-SAGE-CODE",
                    "SECRET-SOCKET-TOKEN",
                    "SECRET-FULL-STATE",
                    "SECRET-ANSWER-ID",
                    "SECRET-ANSWER-CONTENT",
                    "SECRET-LTI",
                    "SECRET-ISSUE-TOKEN"
                ].forEach(
                    function(secret) {
                        assert.strictEqual(
                            formatted.indexOf(
                                secret
                            ),
                            -1,
                            secret +
                                " leaked into support report"
                        );
                    }
                );
            }
        );

        it(
            "preserves only allowlisted math-answer counts",
            function() {
                var inspection =
                    poisonedInspection();

                var report =
                    supportReport.build({
                        inspection:
                            inspection,
                        support:
                            inspection.support
                    });

                assert.strictEqual(
                    report.subsystems
                        .initialMathAnswers
                        .details
                        .expectedAnswers,
                    3
                );

                assert.strictEqual(
                    Object.prototype
                        .hasOwnProperty.call(
                            report.subsystems
                                .initialMathAnswers
                                .details,
                            "unresolvedAnswerIds"
                        ),
                    false
                );
            }
        );

        it(
            "formats a directly pasteable report",
            function() {
                var inspection =
                    poisonedInspection();

                var formatted =
                    supportReport.format(
                        supportReport.build({
                            inspection:
                                inspection,
                            support:
                                inspection.support,
                            path:
                                "/testSuite/03-basic-sage",
                            generatedAt:
                                "2026-08-10T22:30:00.000Z"
                        })
                    );

                assert.notStrictEqual(
                    formatted.indexOf(
                        "Xronos Problem Report"
                    ),
                    -1
                );

                assert.notStrictEqual(
                    formatted.indexOf(
                        "XR-SAGE-INLINE-INITIAL-101"
                    ),
                    -1
                );

                assert.notStrictEqual(
                    formatted.indexOf(
                        "----- XRONOS DIAGNOSTIC INFORMATION -----"
                    ),
                    -1
                );
            }
        );
    }
);
