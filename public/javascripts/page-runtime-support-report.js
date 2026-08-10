"use strict";

/*
 * Privacy-bounded support report.
 *
 * IMPORTANT:
 * This module builds reports from an explicit allowlist. It must never copy a
 * broad runtime object and then attempt to remove secrets afterward.
 */

var REPORT_SCHEMA_VERSION = 1;
var MAX_RECENT_EVENTS = 30;
var MAX_SHORT_TEXT = 160;
var MAX_USER_AGENT = 320;


function boundedText(value, maximumLength) {
    if (
        value === undefined ||
        value === null
    ) {
        return null;
    }

    var text =
        String(value);

    if (
        text.length <= maximumLength
    ) {
        return text;
    }

    return (
        text.slice(
            0,
            maximumLength
        ) +
        "..."
    );
}


function finiteNumber(value) {
    return typeof value === "number" &&
        isFinite(value)
        ? value
        : null;
}


function booleanOrNull(value) {
    return typeof value === "boolean"
        ? value
        : null;
}


function observedEnvelope(value) {
    if (
        !value ||
        typeof value !== "object"
    ) {
        return null;
    }

    return {
        state:
            boundedText(
                value.state,
                MAX_SHORT_TEXT
            ),
        updatedAt:
            boundedText(
                value.updatedAt,
                MAX_SHORT_TEXT
            ),
        elapsedMs:
            finiteNumber(
                value.elapsedMs
            )
    };
}


function observedWithDetails(
    value,
    detailFields
) {
    var result =
        observedEnvelope(value);

    if (!result) {
        return null;
    }

    var details =
        value.details &&
        typeof value.details === "object"
            ? value.details
            : {};

    var safeDetails = {};

    detailFields.forEach(
        function(field) {
            var key =
                field.name;

            var kind =
                field.kind || "text";

            var valueAtKey =
                details[key];

            if (kind === "number") {
                var numeric =
                    finiteNumber(
                        valueAtKey
                    );

                if (numeric !== null) {
                    safeDetails[key] =
                        numeric;
                }
            } else if (
                kind === "boolean"
            ) {
                var booleanValue =
                    booleanOrNull(
                        valueAtKey
                    );

                if (
                    booleanValue !== null
                ) {
                    safeDetails[key] =
                        booleanValue;
                }
            } else {
                var text =
                    boundedText(
                        valueAtKey,
                        MAX_SHORT_TEXT
                    );

                if (text !== null) {
                    safeDetails[key] =
                        text;
                }
            }
        }
    );

    if (
        Object.keys(safeDetails)
            .length > 0
    ) {
        result.details =
            safeDetails;
    }

    return result;
}


function supportIssue(issue) {
    if (
        !issue ||
        typeof issue !== "object"
    ) {
        return null;
    }

    return {
        code:
            boundedText(
                issue.code,
                MAX_SHORT_TEXT
            ),
        subsystem:
            boundedText(
                issue.subsystem,
                MAX_SHORT_TEXT
            ),
        state:
            boundedText(
                issue.state,
                MAX_SHORT_TEXT
            ),
        reason:
            boundedText(
                issue.reason,
                MAX_SHORT_TEXT
            ),
        severity:
            boundedText(
                issue.severity,
                MAX_SHORT_TEXT
            ),
        recoveryAction:
            boundedText(
                issue.recoveryAction,
                MAX_SHORT_TEXT
            ),
        reportable:
            booleanOrNull(
                issue.reportable
            ),
        recoverable:
            booleanOrNull(
                issue.recoverable
            ),
        persistent:
            booleanOrNull(
                issue.persistent
            )
    };
}


function recentEvents(events) {
    if (!Array.isArray(events)) {
        return [];
    }

    return events
        .slice(-MAX_RECENT_EVENTS)
        .map(function(event) {
            /*
             * Deliberately omit event.details. Event details are useful for
             * developer inspection, but their contents are not part of the
             * support-report privacy contract.
             */
            var result = {
                sequence:
                    finiteNumber(
                        event &&
                        event.sequence
                    ),
                at:
                    boundedText(
                        event &&
                        event.at,
                        MAX_SHORT_TEXT
                    ),
                elapsedMs:
                    finiteNumber(
                        event &&
                        event.elapsedMs
                    ),
                type:
                    boundedText(
                        event &&
                        event.type,
                        MAX_SHORT_TEXT
                    ),
                name:
                    boundedText(
                        event &&
                        event.name,
                        MAX_SHORT_TEXT
                    )
            };

            var state =
                boundedText(
                    event &&
                    event.state,
                    MAX_SHORT_TEXT
                );

            if (state !== null) {
                result.state =
                    state;
            }

            return result;
        });
}


function browserMetadata(environment) {
    environment =
        environment || {};

    return {
        userAgent:
            boundedText(
                environment.userAgent,
                MAX_USER_AGENT
            ),
        platform:
            boundedText(
                environment.platform,
                MAX_SHORT_TEXT
            ),
        language:
            boundedText(
                environment.language,
                MAX_SHORT_TEXT
            ),
        timezone:
            boundedText(
                environment.timezone,
                MAX_SHORT_TEXT
            ),
        online:
            booleanOrNull(
                environment.online
            )
    };
}


function build(input) {
    input =
        input || {};

    var inspection =
        input.inspection || {};

    var support =
        input.support ||
        inspection.support ||
        {};

    var snapshot =
        support.snapshot || {};

    var primary =
        support.primaryIssue ||
        input.issue ||
        null;

    return {
        reportType:
            "xronos-support-report",
        schemaVersion:
            REPORT_SCHEMA_VERSION,
        generatedAt:
            boundedText(
                input.generatedAt ||
                    new Date().toISOString(),
                MAX_SHORT_TEXT
            ),

        support:
            supportIssue(primary),

        page: {
            path:
                boundedText(
                    input.path,
                    500
                ),
            activityPath:
                boundedText(
                    snapshot.activity &&
                    snapshot.activity.details &&
                    snapshot.activity
                        .details.path,
                    500
                )
        },

        runtime: {
            supportTraceId:
                boundedText(
                    inspection.supportTraceId,
                    MAX_SHORT_TEXT
                ),
            sessionId:
                boundedText(
                    inspection.sessionId,
                    MAX_SHORT_TEXT
                ),
            startedAt:
                boundedText(
                    inspection.startedAt,
                    MAX_SHORT_TEXT
                )
        },

        browser:
            browserMetadata(
                input.environment
            ),

        subsystems: {
            stateWebsocket:
                observedWithDetails(
                    snapshot.stateWebsocket,
                    [
                        {
                            name: "attempt",
                            kind: "number"
                        },
                        {
                            name:
                                "reconnectBackoffMilliseconds",
                            kind: "number"
                        },
                        {
                            name: "reason"
                        }
                    ]
                ),

            websocketLiveness:
                observedWithDetails(
                    snapshot.websocketLiveness,
                    [
                        {
                            name:
                                "latencyMilliseconds",
                            kind: "number"
                        },
                        {
                            name: "lastPongAt"
                        },
                        {
                            name: "reason"
                        }
                    ]
                ),

            stateDifferentialSync:
                observedWithDetails(
                    snapshot.stateDifferentialSync,
                    [
                        {
                            name: "reason"
                        }
                    ]
                ),

            initialState:
                observedWithDetails(
                    snapshot.initialState,
                    [
                        {
                            name: "outcome"
                        },
                        {
                            name: "source"
                        },
                        {
                            name: "delivery"
                        },
                        {
                            name:
                                "identifierCount",
                            kind: "number"
                        },
                        {
                            name:
                                "deadlineExceeded",
                            kind: "boolean"
                        }
                    ]
                ),

            initialMathJax:
                observedWithDetails(
                    snapshot.initialMathJax,
                    [
                        {
                            name:
                                "deadlineExceeded",
                            kind: "boolean"
                        },
                        {
                            name:
                                "deadlineMilliseconds",
                            kind: "number"
                        },
                        {
                            name:
                                "timedOutAtElapsedMs",
                            kind: "number"
                        },
                        {
                            name: "completed",
                            kind: "boolean"
                        },
                        {
                            name:
                                "completedAtElapsedMs",
                            kind: "number"
                        },
                        {
                            name: "generation",
                            kind: "number"
                        },
                        {
                            name: "errorCount",
                            kind: "number"
                        },
                        {
                            name: "reason"
                        },
                        {
                            name: "errorType"
                        }
                    ]
                ),

            initialSage:
                observedWithDetails(
                    snapshot.initialSage,
                    [
                        {
                            name: "expected",
                            kind: "number"
                        },
                        {
                            name: "discovered",
                            kind: "number"
                        },
                        {
                            name: "started",
                            kind: "number"
                        },
                        {
                            name: "mmlApplied",
                            kind: "number"
                        },
                        {
                            name:
                                "rerenderCompleted",
                            kind: "number"
                        },
                        {
                            name: "failed",
                            kind: "number"
                        },
                        {
                            name: "retryable",
                            kind: "boolean"
                        },
                        {
                            name: "category"
                        },
                        {
                            name: "settled",
                            kind: "number"
                        },
                        {
                            name:
                                "processComplete",
                            kind: "boolean"
                        },
                        {
                            name:
                                "deadlineExceeded",
                            kind: "boolean"
                        }
                    ]
                ),

            initialMathAnswers:
                observedWithDetails(
                    snapshot.initialMathAnswers,
                    [
                        {
                            name: "generation",
                            kind: "number"
                        },
                        {
                            name:
                                "expectedAnswers",
                            kind: "number"
                        },
                        {
                            name:
                                "modelResolvedAnswers",
                            kind: "number"
                        },
                        {
                            name:
                                "attachedAnswers",
                            kind: "number"
                        },
                        {
                            name:
                                "unresolvedAnswers",
                            kind: "number"
                        },
                        {
                            name:
                                "connectionAttempts",
                            kind: "number"
                        },
                        {
                            name:
                                "processDurationMilliseconds",
                            kind: "number"
                        },
                        {
                            name:
                                "processComplete",
                            kind: "boolean"
                        },
                        {
                            name: "reason"
                        }
                    ]
                ),

            activity:
                observedWithDetails(
                    snapshot.activity,
                    [
                        {
                            name: "path"
                        },
                        {
                            name: "reason"
                        }
                    ]
                )
        },

        recentEvents:
            recentEvents(
                inspection.events
            ),

        limits: {
            recentEventLimit:
                MAX_RECENT_EVENTS,
            eventDetailsIncluded:
                false
        }
    };
}


function format(report) {
    report =
        report || {};

    var support =
        report.support || {};

    var lines = [
        "Xronos Problem Report",
        "",
        "Support code: " +
            (
                support.code ||
                "XR-UNKNOWN"
            ),
        "Subsystem: " +
            (
                support.subsystem ||
                "unknown"
            ),
        "State: " +
            (
                support.state ||
                "unknown"
            ),
        "Reason: " +
            (
                support.reason ||
                "unknown"
            ),
        "Recovery: " +
            (
                support.recoveryAction ||
                "unknown"
            ),
        "Support trace: " +
            (
                report.runtime &&
                report.runtime.supportTraceId
                    ? report.runtime.supportTraceId
                    : "unknown"
            ),
        "Page: " +
            (
                report.page &&
                report.page.path
                    ? report.page.path
                    : "unknown"
            ),
        "Generated: " +
            (
                report.generatedAt ||
                "unknown"
            ),
        "",
        "Please paste this report into your normal email or webmail when contacting your instructor or Xronos support.",
        "",
        "----- XRONOS DIAGNOSTIC INFORMATION -----",
        JSON.stringify(
            report,
            null,
            2
        ),
        "----- END XRONOS DIAGNOSTIC INFORMATION -----"
    ];

    return lines.join("\n");
}


module.exports = {
    REPORT_SCHEMA_VERSION:
        REPORT_SCHEMA_VERSION,
    MAX_RECENT_EVENTS:
        MAX_RECENT_EVENTS,
    build:
        build,
    format:
        format
};
