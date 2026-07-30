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
    var validators =
        runtime.components.validators;
    var initialState =
        runtime.operations["initial-state"];
    var initialSage =
        runtime.components["sage-initial"];
    var initialVisibleSage =
        runtime.components[
            "sage-visible-initial"
        ];
    var visibleSageOutputCount =
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
            visible: {
                state:
                    initialVisibleSage
                        ? initialVisibleSage.state
                        : visibleSageOutputCount === 0
                            ? "not-required"
                            : "not-observed",
                required:
                    initialVisibleSage
                        ? initialVisibleSage.state !==
                            "not-required"
                        : visibleSageOutputCount === null
                            ? null
                            : visibleSageOutputCount > 0
            }
        },
        counts: {
            visibleSageOutputs:
                visibleSageOutputCount,
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
