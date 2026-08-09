var coordinatorAdapter = require(
    "./page-runtime-coordinator-adapter"
);

/*
 * Passive page-runtime diagnostics.
 *
 * This module must not control startup behavior. It records what the existing
 * runtime does so support and later coordinator work can inspect lifecycle
 * ordering without changing successful or failed outcomes.
 */

var MAX_EVENTS = 250;
var nextSequence = 1;

var INITIAL_STATE_READINESS_DEADLINE_MS =
    15000;

var INITIAL_STATE_TIMEOUT_CODE =
    "XR-STATE-INITIAL-101";

var INITIAL_MATHJAX_READINESS_DEADLINE_MS =
    15000;

var INITIAL_MATHJAX_TIMEOUT_CODE =
    "XR-MATHJAX-INITIAL-101";

var INITIAL_INLINE_SAGE_READINESS_DEADLINE_MS =
    15000;

var INITIAL_INLINE_SAGE_TIMEOUT_CODE =
    "XR-SAGE-INLINE-INITIAL-101";

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
var passiveCoordinator =
    coordinatorAdapter.create({
        maxEvents: MAX_EVENTS
    });
var lastReadinessComparisonSignature =
    null;

var readinessWatchdogs = {
    initialState: {
        deadlineMilliseconds:
            INITIAL_STATE_READINESS_DEADLINE_MS,
        timer: null,
        timedOut: false,
        timedOutAtElapsedMs: null
    },
    initialMathJax: {
        deadlineMilliseconds:
            INITIAL_MATHJAX_READINESS_DEADLINE_MS,
        timer: null,
        timedOut: false,
        timedOutAtElapsedMs: null,
        completed: false,
        errorCount: 0,
        completedAtElapsedMs: null,
        generation: null
    },
    initialInlineSage: {
        deadlineMilliseconds:
            INITIAL_INLINE_SAGE_READINESS_DEADLINE_MS,
        timer: null,
        timedOut: false,
        timedOutAtElapsedMs: null,
        completed: false,
        completedAtElapsedMs: null,
        terminalState: null
    }
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

function currentLegacyReadiness() {
    return {
        stateSynchronized:
            runtime.components[
                "state-synchronized"
            ]
                ? runtime.components[
                    "state-synchronized"
                ].state
                : "waiting",
        contentReady:
            runtime.components[
                "content-ready"
            ]
                ? runtime.components[
                    "content-ready"
                ].state
                : "waiting",
        interactionReady:
            runtime.components[
                "interaction-ready"
            ]
                ? runtime.components[
                    "interaction-ready"
                ].state
                : "waiting",
        pageReadiness:
            runtime.components[
                "page-readiness"
            ]
                ? runtime.components[
                    "page-readiness"
                ].state
                : "waiting"
    };
}

function updateReadinessComparison() {
    var comparison =
        coordinatorAdapter
            .compareReadiness(
                passiveCoordinator,
                currentLegacyReadiness()
            );
    var signature =
        JSON.stringify(comparison);

    runtime.coordinatorReadiness =
        copyValue(
            comparison.coordinator
        );
    runtime.readinessComparison =
        copyValue(comparison);

    if (
        !comparison.matches &&
        signature !==
            lastReadinessComparisonSignature
    ) {
        record(
            "event",
            "coordinator-readiness-mismatch",
            undefined,
            comparison
        );
    }

    lastReadinessComparisonSignature =
        signature;

    return comparison;
}

function updatePageReadiness() {
    var initialState =
        runtime.operations["initial-state"];
    var activity =
        runtime.components.activity;
    var initialMathAnswers =
        runtime.components[
            "initial-math-answers"
        ];
    var canonicalSage =
        runtime.components["sage-initial"];
    var initialInlineSage =
        runtime.components[
            "sage-inline-initial"
        ];
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
    var initialStateObservedState =
        initialState && initialState.state;
    var initialStateWatchdog =
        readinessWatchdogs.initialState;
    var initialMathJaxWatchdog =
        readinessWatchdogs.initialMathJax;
    var initialMathJaxObservedState =
        initialMathJaxWatchdog.completed
            ? (
                initialMathJaxWatchdog
                    .errorCount > 0
                    ? "failed"
                    : "completed"
            )
            : null;

    if (
        initialStateObservedState !==
            "available" &&
        initialStateWatchdog.timedOut
    ) {
        initialStateObservedState =
            "timed-out";
    }

    if (
        !initialMathJaxWatchdog.completed &&
        initialMathJaxWatchdog.timedOut
    ) {
        initialMathJaxObservedState =
            "timed-out";
    }

    var stateSynchronized =
        readinessSummary([
            readinessDependency(
                "initial-state",
                initialStateObservedState,
                ["available"],
                [
                    "fallback",
                    "failed",
                    "degraded",
                    "timed-out"
                ]
            )
        ]);
    var contentReady =
        readinessSummary([
            readinessDependency(
                "mathjax-initial-process",
                initialMathJaxObservedState,
                ["completed"],
                [
                    "failed",
                    "degraded",
                    "timed-out"
                ]
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
            ),
            readinessDependency(
                "sage-inline-initial",
                initialInlineSage &&
                    initialInlineSage.state,
                [
                    "settled",
                    "not-required"
                ],
                [
                    "degraded",
                    "failed"
                ]
            )
        ]);
    var interactionReady =
        readinessSummary([
            /*
             * Do not report interaction readiness when the initial
             * mathematical rendering failed.
             */
            readinessDependency(
                "mathjax-initial-process",
                initialMathJaxObservedState,
                ["completed"],
                [
                    "failed",
                    "degraded",
                    "timed-out"
                ]
            ),
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
    stateSynchronized.details.deadline = {
        code:
            INITIAL_STATE_TIMEOUT_CODE,
        deadlineMilliseconds:
            initialStateWatchdog
                .deadlineMilliseconds,
        timedOut:
            initialStateWatchdog.timedOut,
        timedOutAtElapsedMs:
            initialStateWatchdog
                .timedOutAtElapsedMs
    };

    contentReady.details.dimension =
        "content-ready";
    contentReady.details.deadline = {
        code:
            INITIAL_MATHJAX_TIMEOUT_CODE,
        deadlineMilliseconds:
            initialMathJaxWatchdog
                .deadlineMilliseconds,
        timedOut:
            initialMathJaxWatchdog.timedOut,
        timedOutAtElapsedMs:
            initialMathJaxWatchdog
                .timedOutAtElapsedMs,
        completed:
            initialMathJaxWatchdog.completed,
        completedAtElapsedMs:
            initialMathJaxWatchdog
                .completedAtElapsedMs,
        generation:
            initialMathJaxWatchdog.generation,
        errorCount:
            initialMathJaxWatchdog.errorCount
    };
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

    updateReadinessComparison();
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

    coordinatorAdapter.signalTransition(
        passiveCoordinator,
        collectionName,
        name,
        state,
        details
    );

    if (
        collectionName === "operations" &&
        name === "initial-state" &&
        state === "available" &&
        readinessWatchdogs.initialState
            .timer !== null
    ) {
        window.clearTimeout(
            readinessWatchdogs.initialState
                .timer
        );

        readinessWatchdogs.initialState
            .timer = null;
    }

    if (
        collectionName === "operations" &&
        name === "mathjax-pass" &&
        state === "ended" &&
        details &&
        details.passType === "process"
    ) {
        var initialMathJaxWatchdog =
            readinessWatchdogs.initialMathJax;

        initialMathJaxWatchdog.completed =
            true;
        initialMathJaxWatchdog
            .completedAtElapsedMs =
                elapsedMs();
        initialMathJaxWatchdog.generation =
            details.generation === undefined
                ? null
                : details.generation;

        if (
            initialMathJaxWatchdog.timer !==
                null
        ) {
            window.clearTimeout(
                initialMathJaxWatchdog.timer
            );

            initialMathJaxWatchdog.timer =
                null;
        }
    }

    if (
        collectionName === "components" &&
        name === "sage-inline-initial" &&
        (
            state === "settled" ||
            state === "not-required" ||
            (
                state === "degraded" &&
                !(
                    details &&
                    details.deadlineExceeded ===
                        true
                )
            )
        )
    ) {
        var initialInlineSageWatchdog =
            readinessWatchdogs
                .initialInlineSage;

        initialInlineSageWatchdog.completed =
            true;
        initialInlineSageWatchdog
            .completedAtElapsedMs =
                elapsedMs();
        initialInlineSageWatchdog
            .terminalState = state;

        if (
            initialInlineSageWatchdog.timer !==
                null
        ) {
            window.clearTimeout(
                initialInlineSageWatchdog.timer
            );

            initialInlineSageWatchdog.timer =
                null;
        }
    }

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

function initialStateAvailable() {
    return !!(
        runtime.operations["initial-state"] &&
        runtime.operations["initial-state"]
            .state === "available"
    );
}


function startInitialStateReadinessWatchdog() {
    var watchdog =
        readinessWatchdogs.initialState;

    if (
        watchdog.timer !== null ||
        watchdog.timedOut ||
        initialStateAvailable()
    ) {
        return;
    }

    watchdog.timer =
        window.setTimeout(
            function() {
                var websocket =
                    runtime.services[
                        "state-websocket"
                    ];
                var initialState =
                    runtime.operations[
                        "initial-state"
                    ];

                watchdog.timer = null;

                if (initialStateAvailable())
                    return;

                watchdog.timedOut = true;
                watchdog.timedOutAtElapsedMs =
                    elapsedMs();

                coordinatorAdapter.signalDeadline(
                    passiveCoordinator,
                    "initial-state"
                );

                record(
                    "event",
                    "readiness-deadline-exceeded",
                    undefined,
                    {
                        dependency:
                            "initial-state",
                        code:
                            INITIAL_STATE_TIMEOUT_CODE,
                        deadlineMilliseconds:
                            watchdog
                                .deadlineMilliseconds,
                        observedInitialState:
                            initialState
                                ? initialState.state
                                : "not-observed",
                        observedWebsocket:
                            websocket
                                ? websocket.state
                                : "not-observed"
                    }
                );

                updatePageReadiness();
            },
            watchdog.deadlineMilliseconds
        );
}


function initialMathJaxProcessCompleted() {
    return readinessWatchdogs
        .initialMathJax.completed;
}


function startInitialMathJaxReadinessWatchdog() {
    var watchdog =
        readinessWatchdogs.initialMathJax;

    if (
        watchdog.timer !== null ||
        watchdog.timedOut ||
        initialMathJaxProcessCompleted()
    ) {
        return;
    }

    watchdog.timer =
        window.setTimeout(
            function() {
                var mathJaxService =
                    runtime.services.mathjax;
                var mathJaxPass =
                    runtime.operations[
                        "mathjax-pass"
                    ];
                var mathJaxPasses =
                    runtime.components[
                        "mathjax-passes"
                    ];

                watchdog.timer = null;

                if (
                    initialMathJaxProcessCompleted()
                ) {
                    return;
                }

                watchdog.timedOut = true;
                watchdog.timedOutAtElapsedMs =
                    elapsedMs();

                passiveCoordinator.record(
                    "legacy-mathjax-readiness-deadline-observed",
                    "mathjax-initial-process",
                    {
                        deadlineMilliseconds:
                            watchdog
                                .deadlineMilliseconds,
                        timedOutAtElapsedMs:
                            watchdog
                                .timedOutAtElapsedMs,
                        coordinatorState:
                            passiveCoordinator
                                .inspect()
                                .tasks[
                                    "mathjax-initial-process"
                                ].state
                    }
                );

                record(
                    "event",
                    "readiness-deadline-exceeded",
                    undefined,
                    {
                        dependency:
                            "mathjax-initial-process",
                        code:
                            INITIAL_MATHJAX_TIMEOUT_CODE,
                        deadlineMilliseconds:
                            watchdog
                                .deadlineMilliseconds,
                        observedMathJaxService:
                            mathJaxService
                                ? mathJaxService.state
                                : "not-observed",
                        observedMathJaxPass:
                            mathJaxPass
                                ? mathJaxPass.state
                                : "not-observed",
                        observedMathJaxPassType:
                            mathJaxPass &&
                            mathJaxPass.details
                                ? mathJaxPass
                                    .details
                                    .passType ||
                                    null
                                : null,
                        observedMathJaxPasses:
                            mathJaxPasses
                                ? mathJaxPasses
                                    .state
                                : "not-observed"
                    }
                );

                updatePageReadiness();
            },
            watchdog.deadlineMilliseconds
        );
}


var initialInlineSageTimeoutOwner =
    null;


function configureInitialInlineSageTimeoutOwner(
    runner
) {
    if (typeof runner !== "function") {
        record(
            "event",
            "initial-inline-sage-timeout-owner-configuration-failed",
            undefined,
            {
                reason:
                    "runner-not-function"
            }
        );

        return false;
    }

    initialInlineSageTimeoutOwner =
        runner;

    record(
        "event",
        "initial-inline-sage-timeout-owner-configured",
        undefined,
        {
            owner:
                "main-visible-sage"
        }
    );

    return true;
}


function initialInlineSageCompleted() {
    return readinessWatchdogs
        .initialInlineSage.completed;
}


function startInitialInlineSageReadinessWatchdog() {
    var watchdog =
        readinessWatchdogs.initialInlineSage;

    if (
        watchdog.timer !== null ||
        watchdog.timedOut ||
        initialInlineSageCompleted()
    ) {
        return;
    }

    watchdog.timer =
        window.setTimeout(
            function() {
                var observed =
                    runtime.components[
                        "sage-inline-initial"
                    ];
                var timeoutDetails;

                watchdog.timer = null;

                if (
                    initialInlineSageCompleted()
                ) {
                    return;
                }

                watchdog.timedOut = true;
                watchdog.timedOutAtElapsedMs =
                    elapsedMs();

                coordinatorAdapter.signalDeadline(
                    passiveCoordinator,
                    "sage-inline-initial"
                );

                record(
                    "event",
                    "readiness-deadline-exceeded",
                    undefined,
                    {
                        dependency:
                            "sage-inline-initial",
                        code:
                            INITIAL_INLINE_SAGE_TIMEOUT_CODE,
                        deadlineMilliseconds:
                            watchdog
                                .deadlineMilliseconds,
                        observedState:
                            observed
                                ? observed.state
                                : "not-observed",
                        observedDetails:
                            observed &&
                            observed.details
                                ? observed.details
                                : null
                    }
                );

                timeoutDetails =
                    observed &&
                    observed.details
                        ? copyValue(
                            observed.details
                        )
                        : {};

                timeoutDetails.deadlineExceeded =
                    true;
                timeoutDetails.deadline = {
                    code:
                        INITIAL_INLINE_SAGE_TIMEOUT_CODE,
                    deadlineMilliseconds:
                        watchdog
                            .deadlineMilliseconds,
                    timedOut: true,
                    timedOutAtElapsedMs:
                        watchdog
                            .timedOutAtElapsedMs
                };

                transition(
                    "components",
                    "sage-inline-initial",
                    "degraded",
                    timeoutDetails
                );

                if (
                    typeof initialInlineSageTimeoutOwner ===
                        "function"
                ) {
                    try {
                        var settlement =
                            initialInlineSageTimeoutOwner(
                                copyValue(
                                    timeoutDetails
                                )
                            );

                        record(
                            "event",
                            "initial-inline-sage-timeout-owner-invoked",
                            undefined,
                            {
                                owner:
                                    "main-visible-sage",
                                settlement:
                                    settlement ||
                                    null
                            }
                        );
                    } catch (err) {
                        record(
                            "event",
                            "initial-inline-sage-timeout-owner-failed",
                            undefined,
                            {
                                owner:
                                    "main-visible-sage",
                                message:
                                    err &&
                                    err.message
                                        ? err.message
                                        : String(err)
                            }
                        );
                    }
                } else {
                    record(
                        "event",
                        "initial-inline-sage-timeout-owner-missing",
                        undefined,
                        {
                            owner:
                                "main-visible-sage"
                        }
                    );
                }
            },
            watchdog.deadlineMilliseconds
        );
}


function beginInitialInlineSageRetry(
    details
) {
    var watchdog =
        readinessWatchdogs.initialInlineSage;
    var operation = false;

    if (
        passiveCoordinator &&
        typeof passiveCoordinator
            .beginInitialInlineSageAttempt ===
            "function"
    ) {
        operation =
            passiveCoordinator
                .beginInitialInlineSageAttempt(
                    details || null
                );
    }

    if (!operation) {
        return false;
    }

    if (watchdog.timer !== null) {
        window.clearTimeout(
            watchdog.timer
        );
        watchdog.timer = null;
    }

    watchdog.completed = false;
    watchdog.completedAtElapsedMs = null;
    watchdog.terminalState = null;
    watchdog.timedOut = false;
    watchdog.timedOutAtElapsedMs = null;

    record(
        "event",
        "initial-inline-sage-retry-begun",
        undefined,
        {
            attempt:
                operation.attempt,
            operationId:
                operation.operationId,
            rearmed:
                operation.rearmed === true,
            placeholders:
                details &&
                typeof details.placeholders ===
                    "number"
                    ? details.placeholders
                    : null
        }
    );

    startInitialInlineSageReadinessWatchdog();

    return operation;
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

startInitialStateReadinessWatchdog();
startInitialMathJaxReadinessWatchdog();
startInitialInlineSageReadinessWatchdog();

function inspect() {
    var report =
        copyValue(runtime);

    report.coordinator =
        passiveCoordinator.inspect();

    report.coordinatorReadiness =
        coordinatorAdapter
            .readinessSnapshot(
                passiveCoordinator
            );

    report.readinessComparison =
        coordinatorAdapter
            .compareReadiness(
                passiveCoordinator,
                currentLegacyReadiness()
            );

    return report;
}

function inspectCoordinator() {
    return passiveCoordinator.inspect();
}

function configureActivityBootstrap(runner) {
    try {
        passiveCoordinator
            .setActivityBootstrapRunner(
                runner
            );

        record(
            "event",
            "activity-bootstrap-owner-configured",
            undefined,
            {
                owner: "coordinator"
            }
        );

        return true;
    } catch (err) {
        record(
            "event",
            "activity-bootstrap-owner-configuration-failed",
            undefined,
            {
                message:
                    err && err.message
                        ? err.message
                        : String(err)
            }
        );

        return false;
    }
}

function requestActivityBootstrap(details) {
    try {
        var accepted =
            passiveCoordinator
                .requestActivityBootstrap(
                    details
                );

        record(
            "event",
            accepted
                ? "activity-bootstrap-owner-requested"
                : "activity-bootstrap-owner-request-rejected",
            undefined,
            {
                owner: "coordinator",
                details:
                    details || null
            }
        );

        return accepted;
    } catch (err) {
        record(
            "event",
            "activity-bootstrap-owner-request-failed",
            undefined,
            {
                owner: "coordinator",
                message:
                    err && err.message
                        ? err.message
                        : String(err)
            }
        );

        return false;
    }
}

function configureActivityInitialization(runner) {
    try {
        passiveCoordinator
            .setActivityInitializationRunner(
                runner
            );

        record(
            "event",
            "activity-initialization-owner-configured",
            undefined,
            {
                owner: "coordinator"
            }
        );

        return true;
    } catch (err) {
        record(
            "event",
            "activity-initialization-owner-configuration-failed",
            undefined,
            {
                message:
                    err && err.message
                        ? err.message
                        : String(err)
            }
        );

        return false;
    }
}

function requestActivityInitialization(details) {
    try {
        var accepted =
            passiveCoordinator
                .requestActivityInitialization(
                    details
                );

        record(
            "event",
            accepted
                ? "activity-initialization-owner-requested"
                : "activity-initialization-owner-request-rejected",
            undefined,
            {
                owner: "coordinator",
                details:
                    details || null
            }
        );

        return accepted;
    } catch (err) {
        record(
            "event",
            "activity-initialization-owner-request-failed",
            undefined,
            {
                owner: "coordinator",
                message:
                    err && err.message
                        ? err.message
                        : String(err)
            }
        );

        return false;
    }
}

function configureMathJaxStartup(runner) {
    try {
        passiveCoordinator
            .setMathJaxStartupRunner(
                runner
            );

        record(
            "event",
            "mathjax-startup-owner-configured",
            undefined,
            {
                owner: "coordinator"
            }
        );

        return true;
    } catch (err) {
        record(
            "event",
            "mathjax-startup-owner-configuration-failed",
            undefined,
            {
                message:
                    err && err.message
                        ? err.message
                        : String(err)
            }
        );

        return false;
    }
}

function requestMathJaxStartup(details) {
    try {
        var accepted =
            passiveCoordinator
                .requestMathJaxStartup(
                    details
                );

        record(
            "event",
            accepted
                ? "mathjax-startup-owner-requested"
                : "mathjax-startup-owner-request-rejected",
            undefined,
            {
                owner: "coordinator",
                details:
                    details || null
            }
        );

        return accepted;
    } catch (err) {
        record(
            "event",
            "mathjax-startup-owner-request-failed",
            undefined,
            {
                owner: "coordinator",
                message:
                    err && err.message
                        ? err.message
                        : String(err)
            }
        );

        return false;
    }
}

function beginInitialMathJaxProcess(details) {
    try {
        var accepted =
            passiveCoordinator
                .beginInitialMathJaxProcess(
                    details
                );

        record(
            "event",
            accepted
                ? "initial-mathjax-process-begin-accepted"
                : "initial-mathjax-process-begin-rejected",
            undefined,
            {
                owner:
                    "coordinator",
                details:
                    details || null
            }
        );

        return accepted;
    } catch (err) {
        record(
            "event",
            "initial-mathjax-process-begin-failed",
            undefined,
            {
                owner:
                    "coordinator",
                message:
                    err && err.message
                        ? err.message
                        : String(err),
                details:
                    details || null
            }
        );

        return false;
    }
}


function observeInitialMathJaxProcessError(
    details
) {
    try {
        var accepted =
            passiveCoordinator
                .observeInitialMathJaxProcessError(
                    details
                );

        if (accepted) {
            readinessWatchdogs
                .initialMathJax
                .errorCount += 1;

            updatePageReadiness();
        }

        record(
            "event",
            accepted
                ? "initial-mathjax-process-error-bound"
                : "initial-mathjax-process-error-unbound",
            undefined,
            {
                owner:
                    "coordinator",
                details:
                    details || null
            }
        );

        return accepted;
    } catch (err) {
        record(
            "event",
            "initial-mathjax-process-error-observation-failed",
            undefined,
            {
                owner:
                    "coordinator",
                message:
                    err && err.message
                        ? err.message
                        : String(err),
                details:
                    details || null
            }
        );

        return false;
    }
}


function completeInitialMathJaxProcess(
    details
) {
    try {
        var accepted =
            passiveCoordinator
                .completeInitialMathJaxProcess(
                    details
                );

        record(
            "event",
            accepted
                ? "initial-mathjax-process-completion-accepted"
                : "initial-mathjax-process-completion-rejected",
            undefined,
            {
                owner:
                    "coordinator",
                details:
                    details || null
            }
        );

        return accepted;
    } catch (err) {
        record(
            "event",
            "initial-mathjax-process-completion-failed",
            undefined,
            {
                owner:
                    "coordinator",
                message:
                    err && err.message
                        ? err.message
                        : String(err),
                details:
                    details || null
            }
        );

        return false;
    }
}


function configureMathJaxStartupUi(runner) {
    try {
        passiveCoordinator
            .setMathJaxStartupUiRunner(
                runner
            );

        record(
            "event",
            "mathjax-startup-ui-owner-configured",
            undefined,
            {
                owner: "coordinator"
            }
        );

        return true;
    } catch (err) {
        record(
            "event",
            "mathjax-startup-ui-owner-configuration-failed",
            undefined,
            {
                message:
                    err && err.message
                        ? err.message
                        : String(err)
            }
        );

        return false;
    }
}

function requestMathJaxStartupUiFinalization(details) {
    try {
        var accepted =
            passiveCoordinator
                .requestMathJaxStartupUiFinalization(
                    details
                );

        record(
            "event",
            accepted
                ? "mathjax-startup-ui-owner-requested"
                : "mathjax-startup-ui-owner-request-rejected",
            undefined,
            {
                owner: "coordinator",
                details:
                    details || null
            }
        );

        return accepted;
    } catch (err) {
        record(
            "event",
            "mathjax-startup-ui-owner-request-failed",
            undefined,
            {
                owner: "coordinator",
                message:
                    err && err.message
                        ? err.message
                        : String(err)
            }
        );

        return false;
    }
}

function configureDocumentReadyStaticUi(runner) {
    try {
        passiveCoordinator
            .setDocumentReadyStaticUiRunner(
                runner
            );

        record(
            "event",
            "document-ready-static-ui-owner-configured",
            undefined,
            {
                owner: "coordinator"
            }
        );

        return true;
    } catch (err) {
        record(
            "event",
            "document-ready-static-ui-owner-configuration-failed",
            undefined,
            {
                message:
                    err && err.message
                        ? err.message
                        : String(err)
            }
        );

        return false;
    }
}

function requestDocumentReadyStaticUi(details) {
    try {
        var accepted =
            passiveCoordinator
                .requestDocumentReadyStaticUi(
                    details
                );

        record(
            "event",
            accepted
                ? "document-ready-static-ui-owner-requested"
                : "document-ready-static-ui-owner-request-rejected",
            undefined,
            {
                owner: "coordinator",
                details:
                    details || null
            }
        );

        return accepted;
    } catch (err) {
        record(
            "event",
            "document-ready-static-ui-owner-request-failed",
            undefined,
            {
                owner: "coordinator",
                message:
                    err && err.message
                        ? err.message
                        : String(err)
            }
        );

        return false;
    }
}

function configureDocumentReadyKineticNavigation(runner) {
    try {
        passiveCoordinator
            .setDocumentReadyKineticNavigationRunner(
                runner
            );

        record(
            "event",
            "document-ready-kinetic-navigation-owner-configured",
            undefined,
            {
                owner: "coordinator"
            }
        );

        return true;
    } catch (err) {
        record(
            "event",
            "document-ready-kinetic-navigation-owner-configuration-failed",
            undefined,
            {
                message:
                    err && err.message
                        ? err.message
                        : String(err)
            }
        );

        return false;
    }
}

function requestDocumentReadyKineticNavigation(details) {
    try {
        var accepted =
            passiveCoordinator
                .requestDocumentReadyKineticNavigation(
                    details
                );

        record(
            "event",
            accepted
                ? "document-ready-kinetic-navigation-owner-requested"
                : "document-ready-kinetic-navigation-owner-request-rejected",
            undefined,
            {
                owner: "coordinator",
                details:
                    details || null
            }
        );

        return accepted;
    } catch (err) {
        record(
            "event",
            "document-ready-kinetic-navigation-owner-request-failed",
            undefined,
            {
                owner: "coordinator",
                message:
                    err && err.message
                        ? err.message
                        : String(err)
            }
        );

        return false;
    }
}

function configureDocumentReadyReferences(runner) {
    try {
        passiveCoordinator
            .setDocumentReadyReferencesRunner(
                runner
            );

        record(
            "event",
            "document-ready-references-owner-configured",
            undefined,
            {
                owner: "coordinator"
            }
        );

        return true;
    } catch (err) {
        record(
            "event",
            "document-ready-references-owner-configuration-failed",
            undefined,
            {
                message:
                    err && err.message
                        ? err.message
                        : String(err)
            }
        );

        return false;
    }
}

function requestDocumentReadyReferences(details) {
    try {
        var accepted =
            passiveCoordinator
                .requestDocumentReadyReferences(
                    details
                );

        record(
            "event",
            accepted
                ? "document-ready-references-owner-requested"
                : "document-ready-references-owner-request-rejected",
            undefined,
            {
                owner: "coordinator",
                details:
                    details || null
            }
        );

        return accepted;
    } catch (err) {
        record(
            "event",
            "document-ready-references-owner-request-failed",
            undefined,
            {
                owner: "coordinator",
                message:
                    err && err.message
                        ? err.message
                        : String(err)
            }
        );

        return false;
    }
}

function compareCoordinatorReadiness() {
    return coordinatorAdapter
        .compareReadiness(
            passiveCoordinator,
            currentLegacyReadiness()
        );
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

function classifyDocumentDelivery(navigation) {
    if (
        !navigation ||
        navigation.supported !== true
    ) {
        return {
            state: "unknown",
            reason: "navigation-timing-unavailable"
        };
    }

    if (
        navigation.source !==
            "navigation-entry"
    ) {
        return {
            state: "unknown",
            reason: "transfer-sizes-unavailable"
        };
    }

    if (
        typeof navigation.transferSize !==
            "number"
    ) {
        return {
            state: "unknown",
            reason: "transfer-size-unavailable"
        };
    }

    if (
        navigation.transferSize > 0 &&
        typeof navigation.encodedBodySize ===
            "number" &&
        navigation.encodedBodySize > 0 &&
        navigation.transferSize <
            navigation.encodedBodySize
    ) {
        return {
            state: "revalidated-cache",
            reason: "partial-transfer-cached-body"
        };
    }

    if (navigation.transferSize > 0) {
        return {
            state: "network-transfer",
            reason: "positive-full-transfer"
        };
    }

    if (
        navigation.transferSize === 0 &&
        typeof navigation.encodedBodySize ===
            "number" &&
        navigation.encodedBodySize > 0
    ) {
        return {
            state: "cached-or-local",
            reason: "zero-transfer-positive-body"
        };
    }

    if (
        navigation.transferSize === 0 &&
        navigation.encodedBodySize === 0 &&
        navigation.decodedBodySize === 0
    ) {
        return {
            state: "empty-or-opaque",
            reason: "zero-transfer-zero-body"
        };
    }

    return {
        state: "unknown",
        reason: "insufficient-transfer-evidence"
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
    useLast,
    predicate
) {
    var matches =
        matchingEvents(type, name, state);
    var selected;

    if (predicate) {
        matches = matches.filter(
            predicate
        );
    }
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
    var documentDelivery =
        classifyDocumentDelivery(
            navigation
        );
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
    var initialStateWatchdog =
        readinessWatchdogs.initialState;
    var initialMathJaxWatchdog =
        readinessWatchdogs.initialMathJax;
    var initialInlineSageWatchdog =
        readinessWatchdogs
            .initialInlineSage;
    var initialSage =
        runtime.components["sage-initial"];
    var initialInlineSage =
        runtime.components[
            "sage-inline-initial"
        ];
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
        documentDelivery:
            documentDelivery,
        navigation:
            navigation,
        runtimeStartFromNavigationMs:
            runtimeStartFromNavigationMs(),
        deadlines: {
            initialState: {
                code:
                    INITIAL_STATE_TIMEOUT_CODE,
                deadlineMilliseconds:
                    initialStateWatchdog
                        .deadlineMilliseconds,
                timedOut:
                    initialStateWatchdog
                        .timedOut,
                timedOutAtElapsedMs:
                    initialStateWatchdog
                        .timedOutAtElapsedMs
            },
            initialMathJax: {
                code:
                    INITIAL_MATHJAX_TIMEOUT_CODE,
                deadlineMilliseconds:
                    initialMathJaxWatchdog
                        .deadlineMilliseconds,
                timedOut:
                    initialMathJaxWatchdog
                        .timedOut,
                timedOutAtElapsedMs:
                    initialMathJaxWatchdog
                        .timedOutAtElapsedMs,
                completed:
                    initialMathJaxWatchdog
                        .completed,
                completedAtElapsedMs:
                    initialMathJaxWatchdog
                        .completedAtElapsedMs,
                generation:
                    initialMathJaxWatchdog
                        .generation
            },
            initialInlineSage: {
                code:
                    INITIAL_INLINE_SAGE_TIMEOUT_CODE,
                deadlineMilliseconds:
                    initialInlineSageWatchdog
                        .deadlineMilliseconds,
                timedOut:
                    initialInlineSageWatchdog
                        .timedOut,
                timedOutAtElapsedMs:
                    initialInlineSageWatchdog
                        .timedOutAtElapsedMs,
                completed:
                    initialInlineSageWatchdog
                        .completed,
                completedAtElapsedMs:
                    initialInlineSageWatchdog
                        .completedAtElapsedMs,
                terminalState:
                    initialInlineSageWatchdog
                        .terminalState,
                observedState:
                    initialInlineSage
                        ? initialInlineSage.state
                        : "not-observed"
            }
        },
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
            initialStateTimedOut:
                milestoneEvent(
                    "event",
                    "readiness-deadline-exceeded",
                    undefined,
                    true,
                    function(event) {
                        return !!(
                            event.details &&
                            event.details
                                .dependency ===
                                "initial-state"
                        );
                    }
                ),
            initialMathJaxTimedOut:
                milestoneEvent(
                    "event",
                    "readiness-deadline-exceeded",
                    undefined,
                    true,
                    function(event) {
                        return !!(
                            event.details &&
                            event.details
                                .dependency ===
                                "mathjax-initial-process"
                        );
                    }
                ),
            initialInlineSageTimedOut:
                milestoneEvent(
                    "event",
                    "readiness-deadline-exceeded",
                    undefined,
                    true,
                    function(event) {
                        return !!(
                            event.details &&
                            event.details
                                .dependency ===
                                "sage-inline-initial"
                        );
                    }
                ),
            initialInlineSageSettled:
                milestoneEvent(
                    "component",
                    "sage-inline-initial",
                    "settled",
                    true
                ),
            initialInlineSageDegraded:
                milestoneEvent(
                    "component",
                    "sage-inline-initial",
                    "degraded",
                    true
                ),
            initialInlineSageNotRequired:
                milestoneEvent(
                    "component",
                    "sage-inline-initial",
                    "not-required",
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
    inspectCoordinator:
        inspectCoordinator,
    configureActivityBootstrap:
        configureActivityBootstrap,
    requestActivityBootstrap:
        requestActivityBootstrap,
    configureActivityInitialization:
        configureActivityInitialization,
    requestActivityInitialization:
        requestActivityInitialization,
    configureMathJaxStartup:
        configureMathJaxStartup,
    requestMathJaxStartup:
        requestMathJaxStartup,
    beginInitialMathJaxProcess:
        beginInitialMathJaxProcess,
    observeInitialMathJaxProcessError:
        observeInitialMathJaxProcessError,
    completeInitialMathJaxProcess:
        completeInitialMathJaxProcess,
    beginInitialInlineSageRetry:
        beginInitialInlineSageRetry,
    configureInitialInlineSageTimeoutOwner:
        configureInitialInlineSageTimeoutOwner,
    configureMathJaxStartupUi:
        configureMathJaxStartupUi,
    requestMathJaxStartupUiFinalization:
        requestMathJaxStartupUiFinalization,
    configureDocumentReadyStaticUi:
        configureDocumentReadyStaticUi,
    requestDocumentReadyStaticUi:
        requestDocumentReadyStaticUi,
    configureDocumentReadyKineticNavigation:
        configureDocumentReadyKineticNavigation,
    requestDocumentReadyKineticNavigation:
        requestDocumentReadyKineticNavigation,
    configureDocumentReadyReferences:
        configureDocumentReadyReferences,
    requestDocumentReadyReferences:
        requestDocumentReadyReferences,
    compareCoordinatorReadiness:
        compareCoordinatorReadiness,
    benchmark: benchmark,
    recordBenchmark: recordBenchmark,
    benchmarkReport: benchmarkReport,
    clearBenchmarks: clearBenchmarks
};

window.xronosPageRuntime = api;
window.xronosRuntimeEvent = event;
window.xronosInspectPageRuntime = inspect;
window.xronosInspectPageRuntimeCoordinator =
    inspectCoordinator;
window.xronosConfigureActivityBootstrap =
    configureActivityBootstrap;
window.xronosRequestActivityBootstrap =
    requestActivityBootstrap;
window.xronosConfigureActivityInitialization =
    configureActivityInitialization;
window.xronosRequestActivityInitialization =
    requestActivityInitialization;
window.xronosConfigureMathJaxStartup =
    configureMathJaxStartup;
window.xronosRequestMathJaxStartup =
    requestMathJaxStartup;
window.xronosBeginInitialMathJaxProcess =
    beginInitialMathJaxProcess;
window.xronosObserveInitialMathJaxProcessError =
    observeInitialMathJaxProcessError;
window.xronosCompleteInitialMathJaxProcess =
    completeInitialMathJaxProcess;
window.xronosBeginInitialInlineSageRetry =
    beginInitialInlineSageRetry;
window.xronosConfigureInitialInlineSageTimeoutOwner =
    configureInitialInlineSageTimeoutOwner;
window.xronosConfigureMathJaxStartupUi =
    configureMathJaxStartupUi;
window.xronosRequestMathJaxStartupUiFinalization =
    requestMathJaxStartupUiFinalization;
window.xronosConfigureDocumentReadyStaticUi =
    configureDocumentReadyStaticUi;
window.xronosRequestDocumentReadyStaticUi =
    requestDocumentReadyStaticUi;
window.xronosConfigureDocumentReadyKineticNavigation =
    configureDocumentReadyKineticNavigation;
window.xronosRequestDocumentReadyKineticNavigation =
    requestDocumentReadyKineticNavigation;
window.xronosConfigureDocumentReadyReferences =
    configureDocumentReadyReferences;
window.xronosRequestDocumentReadyReferences =
    requestDocumentReadyReferences;
window.xronosComparePageRuntimeReadiness =
    compareCoordinatorReadiness;
window.xronosPageBenchmark = benchmark;
window.xronosRecordPageBenchmark =
    recordBenchmark;
window.xronosBenchmarkReport =
    benchmarkReport;
window.xronosClearBenchmarks =
    clearBenchmarks;

module.exports = api;
