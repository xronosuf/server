/*
 * Passive page-runtime diagnostics.
 *
 * This module must not control startup behavior. It records what the existing
 * runtime does so support and later coordinator work can inspect lifecycle
 * ordering without changing successful or failed outcomes.
 */

var MAX_EVENTS = 250;
var nextSequence = 1;

function nowMonotonic() {
    if (
        window.performance &&
        typeof window.performance.now === "function"
    ) {
        return window.performance.now();
    }

    return Date.now();
}

function makeSessionId() {
    return (
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 10)
    );
}

function copyValue(value) {
    if (value === undefined)
        return undefined;

    try {
        return JSON.parse(JSON.stringify(value));
    } catch (err) {
        return {
            serializationError:
                err && err.message
                    ? err.message
                    : String(err)
        };
    }
}

var runtime = {
    schemaVersion: 1,
    sessionId: makeSessionId(),
    startedAt: new Date().toISOString(),
    startedAtMonotonic: nowMonotonic(),
    events: [],
    services: {},
    operations: {},
    components: {}
};

var updatingPageReadiness = false;

function elapsedMs() {
    return (
        Math.round(
            (
                nowMonotonic() -
                runtime.startedAtMonotonic
            ) * 1000
        ) / 1000
    );
}

function record(type, name, state, details) {
    var event = {
        sequence: nextSequence,
        at: new Date().toISOString(),
        elapsedMs: elapsedMs(),
        type: type,
        name: name
    };

    if (state !== undefined)
        event.state = state;

    if (details !== undefined)
        event.details = copyValue(details);

    nextSequence += 1;
    runtime.events.push(event);

    if (runtime.events.length > MAX_EVENTS)
        runtime.events.shift();

    return event;
}

function readinessDependency(
    name,
    observedState,
    readyStates,
    degradedStates
) {
    var status = "waiting";

    if (readyStates.indexOf(observedState) >= 0) {
        status = "ready";
    } else if (
        degradedStates.indexOf(observedState) >= 0
    ) {
        status = "degraded";
    }

    return {
        name: name,
        state:
            observedState || "not-observed",
        status: status
    };
}

function readinessSummary(dependencies) {
    var pending = [];
    var degraded = [];
    var state;

    dependencies.forEach(function(dependency) {
        if (dependency.status === "waiting") {
            pending.push(dependency.name);
        } else if (
            dependency.status === "degraded"
        ) {
            degraded.push(dependency.name);
        }
    });

    if (degraded.length > 0) {
        state = "degraded";
    } else if (pending.length === 0) {
        state = "ready";
    } else {
        state = "waiting";
    }

    return {
        state: state,
        details: {
            dependencies: dependencies,
            pending: pending,
            degraded: degraded
        }
    };
}

function transitionReadinessComponent(
    name,
    state,
    details
) {
    var current =
        runtime.components[name];
    var currentSignature =
        current
            ? JSON.stringify({
                state: current.state,
                details: current.details
            })
            : null;
    var nextSignature =
        JSON.stringify({
            state: state,
            details: details
        });

    if (currentSignature === nextSignature)
        return current;

    return transition(
        "components",
        name,
        state,
        details
    );
}

function updatePageReadiness() {
    var initialState =
        runtime.operations["initial-state"];
    var activity =
        runtime.components.activity;
    var mathJaxPasses =
        runtime.components["mathjax-passes"];
    var initialMathAnswers =
        runtime.components[
            "initial-math-answers"
        ];
    var canonicalSage =
        runtime.components["sage-initial"];
    var legacyStandaloneSage =
        runtime.components[
            "sage-visible-initial"
        ];
    var legacyStandaloneSageOutputCount =
        document.querySelectorAll
            ? document.querySelectorAll(
                ".sageOutput"
            ).length
            : null;
    var stateSynchronized =
        readinessSummary([
            readinessDependency(
                "initial-state",
                initialState && initialState.state,
                ["available"],
                [
                    "fallback",
                    "failed",
                    "degraded"
                ]
            )
        ]);
    var contentReady =
        readinessSummary([
            readinessDependency(
                "mathjax-initial-process",
                mathJaxPasses &&
                    mathJaxPasses.state,
                ["completed"],
                ["failed", "degraded"]
            ),
            readinessDependency(
                "canonical-sage",
                canonicalSage &&
                    canonicalSage.state,
                [
                    "results-available",
                    "not-required"
                ],
                [
                    "results-degraded",
                    "fallback",
                    "failed",
                    "degraded"
                ]
            )
        ]);
    var interactionReady =
        readinessSummary([
            readinessDependency(
                "activity",
                activity && activity.state,
                ["initialized"],
                ["failed", "degraded"]
            ),
            readinessDependency(
                "initial-math-answers",
                initialMathAnswers &&
                    initialMathAnswers.state,
                ["settled", "not-required"],
                ["degraded", "failed"]
            )
        ]);
    var dimensions = [
        readinessDependency(
            "state-synchronized",
            stateSynchronized.state,
            ["ready"],
            ["degraded"]
        ),
        readinessDependency(
            "content-ready",
            contentReady.state,
            ["ready"],
            ["degraded"]
        ),
        readinessDependency(
            "interaction-ready",
            interactionReady.state,
            ["ready"],
            ["degraded"]
        )
    ];
    var pageReadiness =
        readinessSummary(dimensions);
    var pageDetails;

    stateSynchronized.details.dimension =
        "state-synchronized";

    contentReady.details.dimension =
        "content-ready";
    contentReady.details
        .legacyStandaloneSageOutputs =
            legacyStandaloneSageOutputCount;
    contentReady.details
        .legacyStandaloneSageState =
            legacyStandaloneSage
                ? legacyStandaloneSage.state
                : legacyStandaloneSageOutputCount === 0
                    ? "not-required"
                    : "not-observed";

    interactionReady.details.dimension =
        "interaction-ready";

    pageDetails = pageReadiness.details;
    pageDetails.dimensions = {
        stateSynchronized:
            stateSynchronized.state,
        contentReady:
            contentReady.state,
        interactionReady:
            interactionReady.state
    };

    updatingPageReadiness = true;

    try {
        transitionReadinessComponent(
            "state-synchronized",
            stateSynchronized.state,
            stateSynchronized.details
        );

        transitionReadinessComponent(
            "content-ready",
            contentReady.state,
            contentReady.details
        );

        transitionReadinessComponent(
            "interaction-ready",
            interactionReady.state,
            interactionReady.details
        );

        transitionReadinessComponent(
            "page-readiness",
            pageReadiness.state,
            pageDetails
        );
    } finally {
        updatingPageReadiness = false;
    }
}

function transition(collectionName, name, state, details) {
    var collection = runtime[collectionName];
    var value = {
        state: state,
        updatedAt: new Date().toISOString(),
        elapsedMs: elapsedMs()
    };

    if (details !== undefined)
        value.details = copyValue(details);

    collection[name] = value;

    record(
        collectionName.slice(0, -1),
        name,
        state,
        details
    );

    if (
        !updatingPageReadiness &&
        !(
            collectionName === "components" &&
            name === "page-readiness"
        )
    ) {
        updatePageReadiness();
    }

    return value;
}

function event(name, details) {
    return record("event", name, undefined, details);
}

function service(name, state, details) {
    return transition("services", name, state, details);
}

function operation(name, state, details) {
    return transition("operations", name, state, details);
}

function component(name, state, details) {
    return transition("components", name, state, details);
}

function inspect() {
    return copyValue(runtime);
}

var BENCHMARK_STORAGE_KEY =
    "xronos-page-benchmarks-v1";
var MAX_BENCHMARK_RECORDS = 200;

function roundedMilliseconds(value) {
    if (
        value === undefined ||
        value === null ||
        isNaN(Number(value))
    ) {
        return null;
    }

    return (
        Math.round(Number(value) * 1000) /
        1000
    );
}

function navigationTiming() {
    var performanceObject =
        window.performance;
    var navigationEntry;
    var legacyTiming;
    var navigationStart;

    if (!performanceObject) {
        return {
            supported: false
        };
    }

    if (
        typeof performanceObject
            .getEntriesByType === "function"
    ) {
        navigationEntry =
            performanceObject
                .getEntriesByType("navigation")[0];
    }

    if (navigationEntry) {
        return {
            supported: true,
            source: "navigation-entry",
            responseStartMs:
                roundedMilliseconds(
                    navigationEntry.responseStart
                ),
            domContentLoadedMs:
                roundedMilliseconds(
                    navigationEntry
                        .domContentLoadedEventEnd
                ),
            loadEventMs:
                navigationEntry.loadEventEnd > 0
                    ? roundedMilliseconds(
                        navigationEntry.loadEventEnd
                    )
                    : null,
            transferSize:
                navigationEntry.transferSize,
            encodedBodySize:
                navigationEntry.encodedBodySize,
            decodedBodySize:
                navigationEntry.decodedBodySize
        };
    }

    legacyTiming = performanceObject.timing;

    if (!legacyTiming) {
        return {
            supported: false
        };
    }

    navigationStart =
        legacyTiming.navigationStart;

    function legacyOffset(value) {
        if (!value || !navigationStart)
            return null;

        return roundedMilliseconds(
            value - navigationStart
        );
    }

    return {
        supported: true,
        source: "performance-timing",
        responseStartMs:
            legacyOffset(
                legacyTiming.responseStart
            ),
        domContentLoadedMs:
            legacyOffset(
                legacyTiming
                    .domContentLoadedEventEnd
            ),
        loadEventMs:
            legacyOffset(
                legacyTiming.loadEventEnd
            )
    };
}

function runtimeStartFromNavigationMs() {
    var performanceObject =
        window.performance;
    var navigationStart;

    if (
        performanceObject &&
        performanceObject.timing &&
        performanceObject.timing.navigationStart
    ) {
        navigationStart =
            performanceObject
                .timing.navigationStart;

        return roundedMilliseconds(
            new Date(runtime.startedAt).getTime() -
                navigationStart
        );
    }

    if (
        performanceObject &&
        typeof performanceObject
            .timeOrigin === "number"
    ) {
        return roundedMilliseconds(
            new Date(runtime.startedAt).getTime() -
                performanceObject.timeOrigin
        );
    }

    return null;
}

function matchingEvents(type, name, state) {
    return runtime.events.filter(
        function(item) {
            return (
                (type === undefined ||
                    item.type === type) &&
                (name === undefined ||
                    item.name === name) &&
                (state === undefined ||
                    item.state === state)
            );
        }
    );
}

function milestoneEvent(
    type,
    name,
    state,
    useLast
) {
    var matches =
        matchingEvents(type, name, state);
    var selected;
    var runtimeStartMs;

    if (matches.length === 0)
        return null;

    selected = useLast
        ? matches[matches.length - 1]
        : matches[0];

    runtimeStartMs =
        runtimeStartFromNavigationMs();

    return {
        sequence: selected.sequence,
        runtimeElapsedMs:
            selected.elapsedMs,
        navigationElapsedMs:
            runtimeStartMs === null
                ? null
                : roundedMilliseconds(
                    runtimeStartMs +
                        selected.elapsedMs
                )
    };
}

function benchmark(options) {
    var navigation =
        navigationTiming();
    var mathAnswers =
        runtime.components["math-answers"];
    var initialMathAnswers =
        runtime.components[
            "initial-math-answers"
        ];
    var pageReadiness =
        runtime.components["page-readiness"];
    var stateSynchronized =
        runtime.components[
            "state-synchronized"
        ];
    var contentReady =
        runtime.components["content-ready"];
    var interactionReady =
        runtime.components[
            "interaction-ready"
        ];
    var validators =
        runtime.components.validators;
    var initialState =
        runtime.operations["initial-state"];
    var initialSage =
        runtime.components["sage-initial"];
    var legacyStandaloneSage =
        runtime.components[
            "sage-visible-initial"
        ];
    var legacyStandaloneSageOutputCount =
        document.querySelectorAll
            ? document.querySelectorAll(
                ".sageOutput"
            ).length
            : null;

    options = options || {};

    return {
        schemaVersion: 1,
        capturedAt:
            new Date().toISOString(),
        sessionId:
            runtime.sessionId,
        path:
            window.location.pathname,
        tag:
            options.tag || null,
        cacheState:
            options.cacheState ||
                "unspecified",
        navigation:
            navigation,
        runtimeStartFromNavigationMs:
            runtimeStartFromNavigationMs(),
        milestones: {
            bundleStarted:
                milestoneEvent(
                    "event",
                    "bundle-evaluation-started",
                    undefined,
                    false
                ),
            bundleCompleted:
                milestoneEvent(
                    "event",
                    "bundle-evaluation-completed",
                    undefined,
                    true
                ),
            documentReadyCompleted:
                milestoneEvent(
                    "event",
                    "document-ready-completed",
                    undefined,
                    true
                ),
            websocketOpened:
                milestoneEvent(
                    "service",
                    "state-websocket",
                    "open",
                    false
                ),
            initialStateAvailable:
                milestoneEvent(
                    "operation",
                    "initial-state",
                    "available",
                    true
                ),
            activityInitialized:
                milestoneEvent(
                    "component",
                    "activity",
                    "initialized",
                    true
                ),
            firstMathAnswerConnected:
                milestoneEvent(
                    "component",
                    "math-answers",
                    "connected",
                    false
                ),
            latestMathAnswerConnected:
                milestoneEvent(
                    "component",
                    "math-answers",
                    "connected",
                    true
                ),
            initialMathAnswersSettled:
                milestoneEvent(
                    "component",
                    "initial-math-answers",
                    "settled",
                    true
                ),
            initialMathAnswersDegraded:
                milestoneEvent(
                    "component",
                    "initial-math-answers",
                    "degraded",
                    true
                ),
            initialMathAnswersNotRequired:
                milestoneEvent(
                    "component",
                    "initial-math-answers",
                    "not-required",
                    true
                ),
            pageReady:
                milestoneEvent(
                    "component",
                    "page-readiness",
                    "ready",
                    true
                ),
            pageDegraded:
                milestoneEvent(
                    "component",
                    "page-readiness",
                    "degraded",
                    true
                ),
            stateSynchronized:
                milestoneEvent(
                    "component",
                    "state-synchronized",
                    "ready",
                    true
                ),
            stateSynchronizationDegraded:
                milestoneEvent(
                    "component",
                    "state-synchronized",
                    "degraded",
                    true
                ),
            contentReady:
                milestoneEvent(
                    "component",
                    "content-ready",
                    "ready",
                    true
                ),
            contentDegraded:
                milestoneEvent(
                    "component",
                    "content-ready",
                    "degraded",
                    true
                ),
            interactionReady:
                milestoneEvent(
                    "component",
                    "interaction-ready",
                    "ready",
                    true
                ),
            interactionDegraded:
                milestoneEvent(
                    "component",
                    "interaction-ready",
                    "degraded",
                    true
                ),
            mathJaxStartupEnded:
                milestoneEvent(
                    "service",
                    "mathjax",
                    "startup-ended",
                    true
                ),
            firstMathJaxPassCompleted:
                milestoneEvent(
                    "operation",
                    "mathjax-pass",
                    "ended",
                    false
                ),
            latestMathJaxPassCompleted:
                milestoneEvent(
                    "operation",
                    "mathjax-pass",
                    "ended",
                    true
                ),
            initialSageRequestSubmitted:
                milestoneEvent(
                    "operation",
                    "sage-initial-request",
                    "submitted",
                    false
                ),
            initialSageResponseReceived:
                milestoneEvent(
                    "operation",
                    "sage-initial-request",
                    "response-received",
                    false
                ),
            initialSageResultsAvailable:
                milestoneEvent(
                    "component",
                    "sage-initial",
                    "results-available",
                    true
                ),
            initialSageResultsDegraded:
                milestoneEvent(
                    "component",
                    "sage-initial",
                    "results-degraded",
                    true
                ),
            initialVisibleSageSettled:
                milestoneEvent(
                    "component",
                    "sage-visible-initial",
                    "settled",
                    true
                ),
            initialVisibleSageDegraded:
                milestoneEvent(
                    "component",
                    "sage-visible-initial",
                    "degraded",
                    true
                ),
            browserLoadObserved:
                milestoneEvent(
                    "event",
                    "browser-load-observed",
                    undefined,
                    true
                )
        },
        readiness: {
            state:
                pageReadiness
                    ? pageReadiness.state
                    : "not-observed",
            pending:
                pageReadiness &&
                pageReadiness.details
                    ? pageReadiness.details.pending
                    : [],
            degraded:
                pageReadiness &&
                pageReadiness.details
                    ? pageReadiness.details.degraded
                    : [],
            dimensions: {
                stateSynchronized:
                    stateSynchronized
                        ? stateSynchronized.state
                        : "not-observed",
                contentReady:
                    contentReady
                        ? contentReady.state
                        : "not-observed",
                interactionReady:
                    interactionReady
                        ? interactionReady.state
                        : "not-observed"
            }
        },
        mathAnswers: {
            state:
                initialMathAnswers
                    ? initialMathAnswers.state
                    : "not-observed",
            required:
                initialMathAnswers
                    ? initialMathAnswers.state !==
                        "not-required"
                    : null,
            expected:
                initialMathAnswers &&
                initialMathAnswers.details
                    ? initialMathAnswers.details
                        .expectedAnswers
                    : null,
            connected:
                initialMathAnswers &&
                initialMathAnswers.details
                    ? initialMathAnswers.details
                        .connectedAnswers
                    : null,
            missingModels:
                initialMathAnswers &&
                initialMathAnswers.details
                    ? initialMathAnswers.details
                        .missingAnswerModels
                    : null
        },
        sage: {
            canonical: {
                state:
                    initialSage
                        ? initialSage.state
                        : "not-observed",
                required:
                    initialSage
                        ? initialSage.state !==
                            "not-required"
                        : null
            },
            legacyStandaloneOutput: {
                state:
                    legacyStandaloneSage
                        ? legacyStandaloneSage.state
                        : legacyStandaloneSageOutputCount === 0
                            ? "not-required"
                            : "not-observed",
                required:
                    legacyStandaloneSage
                        ? legacyStandaloneSage.state !==
                            "not-required"
                        : legacyStandaloneSageOutputCount === null
                            ? null
                            : legacyStandaloneSageOutputCount > 0
            }
        },
        counts: {
            legacyStandaloneSageOutputs:
                legacyStandaloneSageOutputCount,
            initialStateConsumers:
                initialState &&
                initialState.details
                    ? initialState.details
                        .callbackCount
                    : null,
            validators:
                validators &&
                validators.details
                    ? validators.details.count
                    : null,
            uniqueMathAnswers:
                mathAnswers &&
                mathAnswers.details
                    ? mathAnswers.details
                        .uniqueConnected
                    : 0,
            mathAnswerConnectionAttempts:
                mathAnswers &&
                mathAnswers.details
                    ? mathAnswers.details
                        .totalConnectionAttempts
                    : 0,
            missingMathAnswerModels:
                mathAnswers &&
                mathAnswers.details
                    ? mathAnswers.details
                        .missingAnswerModels
                    : 0,
            zeroAnswerMathJaxBatches:
                mathAnswers &&
                mathAnswers.details
                    ? mathAnswers.details
                        .zeroAnswerBatches
                    : 0
        }
    };
}

function loadBenchmarkRecords() {
    var raw;
    var parsed;

    try {
        raw = window.localStorage.getItem(
            BENCHMARK_STORAGE_KEY
        );

        if (!raw)
            return [];

        parsed = JSON.parse(raw);

        if (!Array.isArray(parsed))
            return [];

        return parsed;
    } catch (err) {
        return [];
    }
}

function saveBenchmarkRecords(records) {
    window.localStorage.setItem(
        BENCHMARK_STORAGE_KEY,
        JSON.stringify(records)
    );
}

function recordBenchmark(options) {
    var records =
        loadBenchmarkRecords();
    var current =
        benchmark(options);

    records.push(current);

    if (
        records.length >
        MAX_BENCHMARK_RECORDS
    ) {
        records = records.slice(
            records.length -
                MAX_BENCHMARK_RECORDS
        );
    }

    try {
        saveBenchmarkRecords(records);

        return {
            stored: true,
            recordCount: records.length,
            record: current
        };
    } catch (err) {
        return {
            stored: false,
            error:
                err && err.message
                    ? err.message
                    : String(err),
            record: current
        };
    }
}

function percentile(sorted, fraction) {
    var index;

    if (sorted.length === 0)
        return null;

    index =
        Math.ceil(
            sorted.length * fraction
        ) - 1;

    if (index < 0)
        index = 0;

    if (index >= sorted.length)
        index = sorted.length - 1;

    return sorted[index];
}

function summarizeValues(values) {
    var sorted =
        values
            .filter(function(value) {
                return (
                    value !== null &&
                    value !== undefined &&
                    !isNaN(Number(value))
                );
            })
            .map(Number)
            .sort(function(a, b) {
                return a - b;
            });
    var total;

    if (sorted.length === 0) {
        return {
            sampleCount: 0
        };
    }

    total = sorted.reduce(
        function(sum, value) {
            return sum + value;
        },
        0
    );

    return {
        sampleCount:
            sorted.length,
        minimumMs:
            roundedMilliseconds(
                sorted[0]
            ),
        p10Ms:
            roundedMilliseconds(
                percentile(sorted, 0.10)
            ),
        medianMs:
            roundedMilliseconds(
                percentile(sorted, 0.50)
            ),
        meanMs:
            roundedMilliseconds(
                total / sorted.length
            ),
        p90Ms:
            roundedMilliseconds(
                percentile(sorted, 0.90)
            ),
        p95Ms:
            roundedMilliseconds(
                percentile(sorted, 0.95)
            ),
        maximumMs:
            roundedMilliseconds(
                sorted[
                    sorted.length - 1
                ]
            )
    };
}

var BENCHMARK_METRICS = {
    responseStart:
        function(record) {
            return record.navigation
                .responseStartMs;
        },
    domContentLoaded:
        function(record) {
            return record.navigation
                .domContentLoadedMs;
        },
    browserLoad:
        function(record) {
            return record.navigation
                .loadEventMs;
        },
    bundleStarted:
        function(record) {
            return record.milestones
                .bundleStarted &&
                record.milestones
                    .bundleStarted
                    .navigationElapsedMs;
        },
    documentReadyCompleted:
        function(record) {
            return record.milestones
                .documentReadyCompleted &&
                record.milestones
                    .documentReadyCompleted
                    .navigationElapsedMs;
        },
    websocketOpened:
        function(record) {
            return record.milestones
                .websocketOpened &&
                record.milestones
                    .websocketOpened
                    .navigationElapsedMs;
        },
    initialStateAvailable:
        function(record) {
            return record.milestones
                .initialStateAvailable &&
                record.milestones
                    .initialStateAvailable
                    .navigationElapsedMs;
        },
    activityInitialized:
        function(record) {
            return record.milestones
                .activityInitialized &&
                record.milestones
                    .activityInitialized
                    .navigationElapsedMs;
        },
    firstMathAnswerConnected:
        function(record) {
            return record.milestones
                .firstMathAnswerConnected &&
                record.milestones
                    .firstMathAnswerConnected
                    .navigationElapsedMs;
        },
    latestMathAnswerConnected:
        function(record) {
            return record.milestones
                .latestMathAnswerConnected &&
                record.milestones
                    .latestMathAnswerConnected
                    .navigationElapsedMs;
        },
    initialMathAnswersSettled:
        function(record) {
            var milestone =
                record.milestones
                    .initialMathAnswersSettled ||
                record.milestones
                    .initialMathAnswersDegraded ||
                record.milestones
                    .initialMathAnswersNotRequired;

            return milestone &&
                milestone.navigationElapsedMs;
        },
    pageReadinessSettled:
        function(record) {
            var milestone =
                record.milestones.pageReady ||
                record.milestones.pageDegraded;

            return milestone &&
                milestone.navigationElapsedMs;
        },
    stateSynchronizationSettled:
        function(record) {
            var milestone =
                record.milestones
                    .stateSynchronized ||
                record.milestones
                    .stateSynchronizationDegraded;

            return milestone &&
                milestone.navigationElapsedMs;
        },
    contentReadinessSettled:
        function(record) {
            var milestone =
                record.milestones.contentReady ||
                record.milestones
                    .contentDegraded;

            return milestone &&
                milestone.navigationElapsedMs;
        },
    interactionReadinessSettled:
        function(record) {
            var milestone =
                record.milestones
                    .interactionReady ||
                record.milestones
                    .interactionDegraded;

            return milestone &&
                milestone.navigationElapsedMs;
        },
    mathJaxStartupEnded:
        function(record) {
            return record.milestones
                .mathJaxStartupEnded &&
                record.milestones
                    .mathJaxStartupEnded
                    .navigationElapsedMs;
        },
    firstMathJaxPassCompleted:
        function(record) {
            return record.milestones
                .firstMathJaxPassCompleted &&
                record.milestones
                    .firstMathJaxPassCompleted
                    .navigationElapsedMs;
        },
    latestMathJaxPassCompleted:
        function(record) {
            return record.milestones
                .latestMathJaxPassCompleted &&
                record.milestones
                    .latestMathJaxPassCompleted
                    .navigationElapsedMs;
        },
    initialSageRequestSubmitted:
        function(record) {
            return record.milestones
                .initialSageRequestSubmitted &&
                record.milestones
                    .initialSageRequestSubmitted
                    .navigationElapsedMs;
        },
    initialSageResponseReceived:
        function(record) {
            return record.milestones
                .initialSageResponseReceived &&
                record.milestones
                    .initialSageResponseReceived
                    .navigationElapsedMs;
        },
    initialSageResultsAvailable:
        function(record) {
            var milestone =
                record.milestones
                    .initialSageResultsAvailable ||
                record.milestones
                    .initialSageResultsDegraded;

            return milestone &&
                milestone.navigationElapsedMs;
        },
    initialVisibleSageSettled:
        function(record) {
            var milestone =
                record.milestones
                    .initialVisibleSageSettled ||
                record.milestones
                    .initialVisibleSageDegraded;

            return milestone &&
                milestone.navigationElapsedMs;
        }
};

function summarizeRecords(records) {
    var metrics = {};

    Object.keys(
        BENCHMARK_METRICS
    ).forEach(function(name) {
        metrics[name] =
            summarizeValues(
                records.map(
                    BENCHMARK_METRICS[name]
                )
            );
    });

    return {
        recordCount:
            records.length,
        metrics:
            metrics
    };
}

function addGroupedRecord(
    groups,
    key,
    record
) {
    if (!groups[key])
        groups[key] = [];

    groups[key].push(record);
}

function summarizeGroups(groups) {
    var summarized = {};

    Object.keys(groups)
        .forEach(function(key) {
            summarized[key] =
                summarizeRecords(
                    groups[key]
                );
        });

    return summarized;
}

function benchmarkReport() {
    var records =
        loadBenchmarkRecords();
    var cacheStates = {};
    var paths = {};
    var tags = {};
    var pathAndCacheStates = {};

    records.forEach(function(record) {
        var cacheState =
            record.cacheState ||
            "unspecified";
        var path =
            record.path ||
            "unknown-path";
        var tag =
            record.tag ||
            "untagged";

        addGroupedRecord(
            cacheStates,
            cacheState,
            record
        );

        addGroupedRecord(
            paths,
            path,
            record
        );

        addGroupedRecord(
            tags,
            tag,
            record
        );

        if (!pathAndCacheStates[path])
            pathAndCacheStates[path] = {};

        addGroupedRecord(
            pathAndCacheStates[path],
            cacheState,
            record
        );
    });

    Object.keys(pathAndCacheStates)
        .forEach(function(path) {
            pathAndCacheStates[path] =
                summarizeGroups(
                    pathAndCacheStates[path]
                );
        });

    return {
        schemaVersion: 1,
        storageKey:
            BENCHMARK_STORAGE_KEY,
        overall:
            summarizeRecords(records),
        byCacheState:
            summarizeGroups(cacheStates),
        byPath:
            summarizeGroups(paths),
        byTag:
            summarizeGroups(tags),
        byPathAndCacheState:
            pathAndCacheStates
    };
}

function clearBenchmarks() {
    try {
        window.localStorage.removeItem(
            BENCHMARK_STORAGE_KEY
        );

        return true;
    } catch (err) {
        return false;
    }
}

if (
    document.readyState === "complete"
) {
    event(
        "browser-load-observed",
        {
            delivery:
                "already-complete"
        }
    );
} else {
    window.addEventListener(
        "load",
        function() {
            event(
                "browser-load-observed"
            );
        }
    );
}

var api = {
    event: event,
    service: service,
    operation: operation,
    component: component,
    inspect: inspect,
    benchmark: benchmark,
    recordBenchmark: recordBenchmark,
    benchmarkReport: benchmarkReport,
    clearBenchmarks: clearBenchmarks
};

window.xronosPageRuntime = api;
window.xronosRuntimeEvent = event;
window.xronosInspectPageRuntime = inspect;
window.xronosPageBenchmark = benchmark;
window.xronosRecordPageBenchmark =
    recordBenchmark;
window.xronosBenchmarkReport =
    benchmarkReport;
window.xronosClearBenchmarks =
    clearBenchmarks;

module.exports = api;
