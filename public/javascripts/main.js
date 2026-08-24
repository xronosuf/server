console.log("  ▀██▄   ▄██▀ ██ █████     █████ ▄███████████████████▄    ███");
console.log("    ▀██▄██▀   ██▐██ ▐██   ██▌ ██▌██                 ██▌  ██▀██");
console.log("      ███     ██▐██  ██▌ ▐██  ██▌▐█████████ ▄████████▀  ██▀ ▀██");
console.log("    ▄██▀██▄   ██▐██  ▐██ ██▌  ██▌██        ▐█▌  ▀██▄   ██▀   ▀██");
console.log("  ▄██▀   ▀██▄ ██▐██   ▀███▀   ██▌▀█████████▐█▌    ▀██▄██▀     ▀██");

var pageRuntime = require('./page-runtime');
var pageRuntimeSupportUi =
    require('./page-runtime-support-ui');

pageRuntime.event("bundle-evaluation-started", {
    path: window.location.pathname,
    hasActivity: document.querySelector("main.activity") !== null
});

var ximera_subpath = localStorage.getItem("ximera-subpath");
var http = new XMLHttpRequest();
http.onreadystatechange = function() {
	var res = http.getResponseHeader('X-Ximera-SubPath');
	if (res != null) {
		ximera_subpath = res;
		localStorage.setItem( "ximera-subpath", ximera_subpath );
	}
};
pageRuntime.operation("subpath-discovery", "started", {
    cached: ximera_subpath !== null
});

http.open('HEAD', document.location, false);
http.send();

pageRuntime.operation("subpath-discovery", "completed", {
    subpathAvailable:
        ximera_subpath !== null &&
        ximera_subpath !== undefined
});

window.toValidPath = function (uri) {
	return ximera_subpath + uri
}

require('./version');

/* Definitely not ready for a serviceworker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', {scope: '/'})
	.then(function(reg) {
	    console.log('Registered Service Worker.');

	    window.updateServiceWorker = function() {
		console.log('updating sw');
		reg.update();
	    };
	}).catch(function(error) {
	    console.log('Registration failed: ' + error);
	});
}
*/

// bootstrap is expecting a global jQuery object
var $ = window.$ = window.jQuery = require('jquery');

// jsondiffpatch expects this loaded globally
window.diff_match_patch = require('diff-match-patch');

require('./cache-bust');

var Expression = require('math-expressions');

var jqueryUI = require('jquery-ui');
var jqueryTransit = require('jquery.transit');
var tether = require('tether');
window.Tether = tether;
var bootstrap = require('bootstrap');
var kinetic = require('jquery.kinetic/jquery.kinetic.min.js');


var syntaxHighlighter = require('syntaxhighlighter');
window.sh = syntaxHighlighter;
syntaxHighlighter.registerBrush(require('./brushes/shBrushLatex'));
syntaxHighlighter.registerBrush(require('brush-javascript'));
syntaxHighlighter.registerBrush( require('brush-python'));

var MathJax = require('./mathjax');
var mathJaxInitialFaultProbe =
    require('./mathjax-initial-fault-probe');

var sageInlineFaultProbe =
    require('./sage-inline-fault-probe');

var mathAnswerInitialFaultProbe =
    require('./math-answer-initial-fault-probe');

var mathAnswerInitialFaultController = {
    armed: false,
    reason: "not-installed",
    claim: function() {
        return false;
    }
};

var activity = require('./activity');
var mathAnswer = require('./math-answer');

var mathJaxStartupInvocation = {
    started: false,
    owner: null,
    completed: false
};

function invokeMathJaxStartup(owner) {
    if (mathJaxStartupInvocation.started) {
        pageRuntime.event(
            "mathjax-startup-duplicate-invocation-ignored",
            {
                requestedOwner: owner,
                activeOwner:
                    mathJaxStartupInvocation.owner,
                completed:
                    mathJaxStartupInvocation.completed
            }
        );

        return {
            state: "not-required",
            value: {
                reason: "already-started",
                owner:
                    mathJaxStartupInvocation.owner
            }
        };
    }

    mathJaxStartupInvocation.started = true;
    mathJaxStartupInvocation.owner = owner;

    pageRuntime.operation(
        "mathjax-startup",
        "invoked",
        {
            owner: owner
        }
    );

    try {
        MathJax.Hub.Startup.onload();

        mathJaxStartupInvocation.completed =
            true;

        pageRuntime.operation(
            "mathjax-startup",
            "completed",
            {
                owner: owner
            }
        );

        return {
            state: "succeeded",
            value: {
                owner: owner
            }
        };
    } catch (err) {
        pageRuntime.operation(
            "mathjax-startup",
            "failed",
            {
                owner: owner,
                message:
                    err && err.message
                        ? err.message
                        : String(err)
            }
        );

        throw err;
    }
}

var mathJaxStartupOwnerConfigured =
    pageRuntime.configureMathJaxStartup(
        function() {
            return invokeMathJaxStartup(
                "coordinator"
            );
        }
    );

var activityBootstrapInvocation = {
    started: false,
    owner: null,
    completed: false
};

function invokeActivityBootstrap(owner) {
    var activityCount =
        $(".activity").length;

    if (activityBootstrapInvocation.started) {
        pageRuntime.event(
            "activity-bootstrap-duplicate-invocation-ignored",
            {
                requestedOwner: owner,
                activeOwner:
                    activityBootstrapInvocation.owner,
                completed:
                    activityBootstrapInvocation.completed,
                activityCount:
                    activityCount
            }
        );

        return {
            state: "not-required",
            value: {
                reason:
                    "already-started",
                owner:
                    activityBootstrapInvocation.owner,
                activityCount:
                    activityCount
            }
        };
    }

    activityBootstrapInvocation.started = true;
    activityBootstrapInvocation.owner =
        owner;

    pageRuntime.operation(
        "activity-bootstrap",
        "invoked",
        {
            owner: owner,
            activityCount:
                activityCount
        }
    );

    try {
        $(".activity").activity();

        activityBootstrapInvocation.completed =
            true;

        pageRuntime.operation(
            "activity-bootstrap",
            "completed",
            {
                owner: owner,
                activityCount:
                    activityCount
            }
        );

        /*
         * Xourse/container pages deliberately have no .activity wrapper.
         * They do not participate in the Ximera activity lifecycle, so
         * explicitly settle that runtime component as not required.
         *
         * Ordinary Ximera activity pages still have a .activity wrapper
         * even when they contain no answer boxes or other interactive
         * elements, so they continue through normal activity initialization.
         */
        if (activityCount === 0) {
            pageRuntime.component(
                "activity",
                "not-required",
                {
                    owner: owner,
                    activityCount:
                        activityCount
                }
            );
        }

        return {
            state:
                activityCount > 0
                    ? "succeeded"
                    : "not-required",
            value: {
                owner: owner,
                activityCount:
                    activityCount
            }
        };
    } catch (err) {
        pageRuntime.operation(
            "activity-bootstrap",
            "failed",
            {
                owner: owner,
                activityCount:
                    activityCount,
                message:
                    err && err.message
                        ? err.message
                        : String(err)
            }
        );

        pageRuntime.component(
            "activity",
            "failed",
            {
                owner: owner,
                activityCount:
                    activityCount,
                message:
                    err && err.message
                        ? err.message
                        : String(err)
            }
        );

        throw err;
    }
}

var activityBootstrapOwnerConfigured =
    pageRuntime.configureActivityBootstrap(
        function() {
            return invokeActivityBootstrap(
                "coordinator"
            );
        }
    );
var documentReadyStaticUiInvocation = {
    started: false,
    owner: null,
    completed: false
};

function invokeDocumentReadyStaticUi(owner) {
    var clickableRows;

    if (documentReadyStaticUiInvocation.started) {
        pageRuntime.event(
            "document-ready-static-ui-duplicate-invocation-ignored",
            {
                requestedOwner: owner,
                activeOwner:
                    documentReadyStaticUiInvocation.owner,
                completed:
                    documentReadyStaticUiInvocation.completed
            }
        );

        return {
            state: "not-required",
            value: {
                reason: "already-started",
                owner:
                    documentReadyStaticUiInvocation.owner
            }
        };
    }

    documentReadyStaticUiInvocation.started = true;
    documentReadyStaticUiInvocation.owner = owner;

    pageRuntime.operation(
        "document-ready-static-ui",
        "invoked",
        {
            owner: owner
        }
    );

    try {
        syntaxHighlighter.default.highlight();

        clickableRows =
            rowclick.addClickableTableRows();

        documentReadyStaticUiInvocation.completed =
            true;

        pageRuntime.operation(
            "document-ready-static-ui",
            "completed",
            {
                owner: owner,
                syntaxHighlighted: true,
                clickableRowsMatched:
                    clickableRows.matchedCount,
                clickableRowsInstalled:
                    clickableRows.installedCount
            }
        );

        return {
            state: "succeeded",
            value: {
                owner: owner,
                syntaxHighlighted: true,
                clickableRowsMatched:
                    clickableRows.matchedCount,
                clickableRowsInstalled:
                    clickableRows.installedCount
            }
        };
    } catch (err) {
        pageRuntime.operation(
            "document-ready-static-ui",
            "failed",
            {
                owner: owner,
                message:
                    err && err.message
                        ? err.message
                        : String(err)
            }
        );

        throw err;
    }
}

var documentReadyKineticNavigationInvocation = {
    started: false,
    owner: null,
    completed: false
};

function invokeDocumentReadyKineticNavigation(owner) {
    var horizontalContainers;
    var verticalContainers;
    var activeCards;
    var linkHandlers;

    if (documentReadyKineticNavigationInvocation.started) {
        pageRuntime.event(
            "document-ready-kinetic-navigation-duplicate-invocation-ignored",
            {
                requestedOwner: owner,
                activeOwner:
                    documentReadyKineticNavigationInvocation.owner,
                completed:
                    documentReadyKineticNavigationInvocation.completed
            }
        );

        return {
            state: "not-required",
            value: {
                reason: "already-started",
                owner:
                    documentReadyKineticNavigationInvocation.owner
            }
        };
    }

    documentReadyKineticNavigationInvocation.started =
        true;
    documentReadyKineticNavigationInvocation.owner =
        owner;

    pageRuntime.operation(
        "document-ready-kinetic-navigation",
        "invoked",
        {
            owner: owner
        }
    );

    try {
        horizontalContainers =
            $(".kinetic");
        verticalContainers =
            $(".main-toc");
        activeCards =
            $(".activity-card.active");
        linkHandlers =
            $(".activity-card a");

        horizontalContainers.kinetic({});

        if (activeCards.length > 0) {
            var activeCard =
                activeCards.first();
            var left =
                activeCard.position().left;
            var cardWidth =
                activeCard.width();
            var horizontalWindowWidth =
                horizontalContainers.first().width();

            if (horizontalContainers.length > 0) {
                horizontalContainers.scrollLeft(
                    left -
                    horizontalWindowWidth / 2 +
                    cardWidth / 2
                );
            }
        }

        verticalContainers.kinetic({});

        if (activeCards.length > 0) {
            var verticalActiveCard =
                activeCards.first();
            var top =
                verticalActiveCard.position().top;
            var cardHeight =
                verticalActiveCard.height();
            var verticalWindowHeight =
                verticalContainers.first().height();

            if (verticalContainers.length > 0) {
                verticalContainers.scrollTop(
                    top -
                    verticalWindowHeight / 2 +
                    cardHeight / 2
                );
            }
        }

        linkHandlers
            .off(
                "mouseup.xronosKineticNavigation"
            )
            .on(
                "mouseup.xronosKineticNavigation",
                function(event) {
                    if (
                        $(".kinetic-moving-left").length >
                            0 ||
                        $(".kinetic-moving-right").length >
                            0
                    ) {
                        event.preventDefault();
                    }
                }
            );

        documentReadyKineticNavigationInvocation.completed =
            true;

        pageRuntime.operation(
            "document-ready-kinetic-navigation",
            "completed",
            {
                owner: owner,
                horizontalContainers:
                    horizontalContainers.length,
                verticalContainers:
                    verticalContainers.length,
                activeCards:
                    activeCards.length,
                linkHandlersInstalled:
                    linkHandlers.length
            }
        );

        return {
            state: "succeeded",
            value: {
                owner: owner,
                horizontalContainers:
                    horizontalContainers.length,
                verticalContainers:
                    verticalContainers.length,
                activeCards:
                    activeCards.length,
                linkHandlersInstalled:
                    linkHandlers.length
            }
        };
    } catch (err) {
        pageRuntime.operation(
            "document-ready-kinetic-navigation",
            "failed",
            {
                owner: owner,
                message:
                    err && err.message
                        ? err.message
                        : String(err)
            }
        );

        throw err;
    }
}

var documentReadyReferencesInvocation = {
    started: false,
    owner: null,
    completed: false
};

function invokeDocumentReadyReferences(owner) {
    var result;

    if (documentReadyReferencesInvocation.started) {
        pageRuntime.event(
            "document-ready-references-duplicate-invocation-ignored",
            {
                requestedOwner:
                    owner,
                activeOwner:
                    documentReadyReferencesInvocation.owner,
                completed:
                    documentReadyReferencesInvocation.completed
            }
        );

        return {
            state: "not-required",
            value: {
                reason:
                    "already-started",
                owner:
                    documentReadyReferencesInvocation.owner
            }
        };
    }

    documentReadyReferencesInvocation.started =
        true;
    documentReadyReferencesInvocation.owner =
        owner;

    pageRuntime.operation(
        "document-ready-references",
        "invoked",
        {
            owner: owner
        }
    );

    try {
        result =
            references
                .installDocumentReferences(
                    document
                );

        documentReadyReferencesInvocation.completed =
            true;

        pageRuntime.operation(
            "document-ready-references",
            "completed",
            {
                owner:
                    owner,
                labelsMatched:
                    result.labelsMatched,
                labelsInstalled:
                    result.labelsInstalled,
                referencesMatched:
                    result.referencesMatched,
                referencesInstalled:
                    result.referencesInstalled
            }
        );

        return {
            state: "succeeded",
            value: {
                owner:
                    owner,
                labelsMatched:
                    result.labelsMatched,
                labelsInstalled:
                    result.labelsInstalled,
                referencesMatched:
                    result.referencesMatched,
                referencesInstalled:
                    result.referencesInstalled
            }
        };
    } catch (err) {
        pageRuntime.operation(
            "document-ready-references",
            "failed",
            {
                owner:
                    owner,
                message:
                    err && err.message
                        ? err.message
                        : String(err)
            }
        );

        throw err;
    }
}

var ProgressBar = require('./progress-bar');

var userProfile = require('./profile');
var users = require('./users');

var xourse = require('./xourse');
var imageEnvironment = require('./image-environment');

var instructor = require('./instructor');

var rowclick = require('./rowclick');

var documentReadyKineticNavigationOwnerConfigured =
    pageRuntime.configureDocumentReadyKineticNavigation(
        function() {
            return invokeDocumentReadyKineticNavigation(
                "coordinator"
            );
        }
    );

var documentReadyStaticUiOwnerConfigured =
    pageRuntime.configureDocumentReadyStaticUi(
        function() {
            return invokeDocumentReadyStaticUi(
                "coordinator"
            );
        }
    );

var references = require('./references');
var bootstrapUi = require('./bootstrap-ui');

var documentReadyReferencesOwnerConfigured =
    pageRuntime.configureDocumentReadyReferences(
        function() {
            return invokeDocumentReadyReferences(
                "coordinator"
            );
        }
    );
var Desmos = require('./desmos');

var Javascript = require('./javascript');

var sagemath = require('./sagemath');


/*
 * Aggregate the display lifecycle of immutable initial-manifest Sage calls.
 *
 * The terminal state of this component is a content-ready dependency:
 *
 * - settled and not-required are ready
 * - degraded and failed are degraded
 * - absent or discovered remain waiting
 *
 * The runtime coordinator applies its own diagnostic deadline and permits
 * late recovery when every initial placeholder eventually settles.
 */
var initialInlineSageRuntime = {
    expected: null,
    discovered: 0,
    started: 0,
    mmlApplied: 0,
    rerenderCompleted: 0,
    failed: 0,
    retryableFailed: 0,
    failureCategories: {},
    settled: 0,
    processComplete: false,
    reportedDiscovered: false,
    reportedTerminal: false,
    deadlineExceeded: false,
    deadline: null,
    placeholders: {}
};


function initialInlineSageDetails() {
    return {
        expected:
            initialInlineSageRuntime.expected,
        discovered:
            initialInlineSageRuntime.discovered,
        started:
            initialInlineSageRuntime.started,
        mmlApplied:
            initialInlineSageRuntime.mmlApplied,
        rerenderCompleted:
            initialInlineSageRuntime
                .rerenderCompleted,
        failed:
            initialInlineSageRuntime.failed,
        retryable:
            initialInlineSageRuntime.failed > 0 &&
            initialInlineSageRuntime.retryableFailed ===
                initialInlineSageRuntime.failed,
        category:
            Object.keys(
                initialInlineSageRuntime
                    .failureCategories
            ).length === 1
                ? Object.keys(
                    initialInlineSageRuntime
                        .failureCategories
                )[0]
                : (
                    Object.keys(
                        initialInlineSageRuntime
                            .failureCategories
                    ).length > 1
                        ? "mixed"
                        : null
                ),
        settled:
            initialInlineSageRuntime.settled,
        processComplete:
            initialInlineSageRuntime
                .processComplete,
        deadlineExceeded:
            initialInlineSageRuntime
                .deadlineExceeded,
        deadline:
            initialInlineSageRuntime
                .deadline
    };
}


function reportInitialInlineSageProgress() {
    if (
        initialInlineSageRuntime
            .reportedTerminal
    ) {
        return;
    }

    if (
        initialInlineSageRuntime
            .expected === 0
    ) {
        initialInlineSageRuntime
            .reportedTerminal = true;

        pageRuntime.component(
            "sage-inline-initial",
            "not-required",
            initialInlineSageDetails()
        );

        return;
    }

    if (
        !initialInlineSageRuntime
            .processComplete ||
        initialInlineSageRuntime
            .expected === null
    ) {
        return;
    }

    if (
        initialInlineSageRuntime
            .settled <
        initialInlineSageRuntime
            .expected
    ) {
        if (
            !initialInlineSageRuntime
                .reportedDiscovered
        ) {
            initialInlineSageRuntime
                .reportedDiscovered = true;

            pageRuntime.component(
                "sage-inline-initial",
                "discovered",
                initialInlineSageDetails()
            );
        }

        return;
    }

    initialInlineSageRuntime
        .reportedTerminal = true;

    pageRuntime.component(
        "sage-inline-initial",
        initialInlineSageRuntime.failed > 0
            ? "degraded"
            : "settled",
        initialInlineSageDetails()
    );
}


function discoverInitialInlineSage(
    placeholderId
) {
    if (
        initialInlineSageRuntime
            .placeholders[
                placeholderId
            ]
    ) {
        return;
    }

    initialInlineSageRuntime
        .placeholders[
            placeholderId
        ] = {
            attempt: 1,
            started: false,
            mmlApplied: false,
            terminal: false,
            terminalState: null,
            failed: false,
            failureRetryable: false,
            failureCategory: null,
            terminalHistory: [],
            timeoutHandler: null
        };

    initialInlineSageRuntime
        .discovered += 1;
}


function registerInitialInlineSageTimeoutHandler(
    placeholderId,
    handler
) {
    var placeholder =
        initialInlineSageRuntime
            .placeholders[
                placeholderId
            ];

    if (
        !placeholder ||
        typeof handler !== "function"
    ) {
        return false;
    }

    placeholder.timeoutHandler =
        handler;

    return true;
}


function replaceInitialInlineSageDeadlineFallback(
    placeholderId
) {
    var nodes =
        document.querySelectorAll(
            '[id="' + placeholderId + '"]'
        );

    Array.prototype.forEach.call(
        nodes,
        function(node) {
            while (node.firstChild) {
                node.removeChild(
                    node.firstChild
                );
            }

            var message =
                document.createElement(
                    "span"
                );

            message.className =
                "xronos-sage-error " +
                "xronos-sage-error-transient";

            message.setAttribute(
                "role",
                "alert"
            );

            message.appendChild(
                document.createTextNode(
                    "The computation took too long to display. " +
                    "Reload the page and try again."
                )
            );

            node.appendChild(message);
        }
    );

    return nodes.length;
}


function settleInitialInlineSageDeadline(
    details
) {
    var unresolved = 0;
    var handlersInvoked = 0;
    var directFallbacks = 0;

    initialInlineSageRuntime
        .deadlineExceeded = true;

    initialInlineSageRuntime.deadline =
        details && details.deadline
            ? details.deadline
            : null;

    Object.keys(
        initialInlineSageRuntime
            .placeholders
    ).forEach(function(placeholderId) {
        var placeholder =
            initialInlineSageRuntime
                .placeholders[
                    placeholderId
                ];

        if (
            !placeholder ||
            placeholder.terminal
        ) {
            return;
        }

        unresolved += 1;

        if (
            typeof placeholder
                .timeoutHandler ===
                "function"
        ) {
            handlersInvoked += 1;

            placeholder.timeoutHandler(
                details || null
            );

            return;
        }

        directFallbacks += 1;

        replaceInitialInlineSageDeadlineFallback(
            placeholderId
        );

        settleInitialInlineSage(
            placeholderId,
            "deadline-fallback",
            true
        );
    });

    pageRuntime.operation(
        "sage-inline-initial",
        "deadline-fallback-requested",
        {
            unresolved:
                unresolved,
            handlersInvoked:
                handlersInvoked,
            directFallbacks:
                directFallbacks,
            deadlineCode:
                details &&
                details.deadline &&
                details.deadline.code
                    ? details.deadline.code
                    : null
        }
    );

    return {
        unresolved:
            unresolved,
        handlersInvoked:
            handlersInvoked,
        directFallbacks:
            directFallbacks
    };
}


function updateInitialInlineSage(
    placeholderId,
    state
) {
    var placeholder =
        initialInlineSageRuntime
            .placeholders[
                placeholderId
            ];

    if (!placeholder) {
        return;
    }

    if (
        state === "request-started" &&
        !placeholder.started
    ) {
        placeholder.started = true;

        initialInlineSageRuntime
            .started += 1;
    }

    if (
        state === "mml-applied" &&
        !placeholder.mmlApplied
    ) {
        placeholder.mmlApplied = true;

        initialInlineSageRuntime
            .mmlApplied += 1;
    }

    reportInitialInlineSageProgress();
}


function settleInitialInlineSage(
    placeholderId,
    terminalState,
    failed,
    failureInfo
) {
    var placeholder =
        initialInlineSageRuntime
            .placeholders[
                placeholderId
            ];

    if (
        !placeholder ||
        placeholder.terminal
    ) {
        return;
    }

    placeholder.terminal = true;
    placeholder.terminalState =
        terminalState;
    placeholder.failed = !!failed;
    placeholder.failureRetryable =
        !!failed &&
        !!failureInfo &&
        failureInfo.retryable === true;
    placeholder.failureCategory =
        !!failed &&
        failureInfo &&
        failureInfo.category
            ? failureInfo.category
            : null;

    placeholder.terminalHistory.push({
        attempt: placeholder.attempt,
        terminalState: terminalState,
        failed: !!failed,
        retryable:
            placeholder.failureRetryable,
        category:
            placeholder.failureCategory
    });

    initialInlineSageRuntime
        .settled += 1;

    if (failed) {
        initialInlineSageRuntime
            .failed += 1;

        if (
            placeholder.failureRetryable
        ) {
            initialInlineSageRuntime
                .retryableFailed += 1;
        }

        if (
            placeholder.failureCategory
        ) {
            var categoryCount =
                initialInlineSageRuntime
                    .failureCategories[
                        placeholder
                            .failureCategory
                    ] || 0;

            initialInlineSageRuntime
                .failureCategories[
                    placeholder
                        .failureCategory
                ] =
                categoryCount + 1;
        }
    } else {
        initialInlineSageRuntime
            .rerenderCompleted += 1;
    }

    reportInitialInlineSageProgress();
}


function reopenInitialInlineSage(
    placeholderId
) {
    var placeholder =
        initialInlineSageRuntime
            .placeholders[
                placeholderId
            ];

    if (
        !placeholder ||
        !placeholder.terminal ||
        !placeholder.failed
    ) {
        return false;
    }

    /*
     * These aggregate counters describe the current visible attempt,
     * not cumulative retry history. Remove the prior attempt's current
     * contributions before reopening the placeholder.
     */
    if (placeholder.started) {
        initialInlineSageRuntime
            .started -= 1;
    }

    if (placeholder.mmlApplied) {
        initialInlineSageRuntime
            .mmlApplied -= 1;
    }

    placeholder.attempt += 1;
    placeholder.started = false;
    placeholder.mmlApplied = false;
    if (
        placeholder.failureRetryable
    ) {
        initialInlineSageRuntime
            .retryableFailed -= 1;
    }

    if (
        placeholder.failureCategory
    ) {
        var category =
            placeholder.failureCategory;

        initialInlineSageRuntime
            .failureCategories[
                category
            ] -= 1;

        if (
            initialInlineSageRuntime
                .failureCategories[
                    category
                ] <= 0
        ) {
            delete initialInlineSageRuntime
                .failureCategories[
                    category
                ];
        }
    }

    placeholder.terminal = false;
    placeholder.terminalState = null;
    placeholder.failed = false;
    placeholder.failureRetryable = false;
    placeholder.failureCategory = null;

    initialInlineSageRuntime
        .settled -= 1;
    initialInlineSageRuntime
        .failed -= 1;

    initialInlineSageRuntime
        .reportedTerminal = false;
    initialInlineSageRuntime
        .reportedDiscovered = false;
    initialInlineSageRuntime
        .deadlineExceeded = false;
    initialInlineSageRuntime
        .deadline = null;

    pageRuntime.operation(
        "sage-placeholder",
        "retry-reopened",
        {
            placeholderId:
                placeholderId,
            attempt:
                placeholder.attempt,
            priorTerminalAttempts:
                placeholder
                    .terminalHistory.length
        }
    );

    return true;
}


function reopenInitialInlineSageLateResult(
    placeholderId
) {
    var placeholder =
        initialInlineSageRuntime
            .placeholders[
                placeholderId
            ];

    if (
        !placeholder ||
        !placeholder.terminal ||
        !placeholder.failed ||
        placeholder.terminalState !==
            "deadline-fallback"
    ) {
        return false;
    }

    /*
     * This is not a new request attempt. The original request simply
     * produced its visible result after the display deadline.
     *
     * Preserve:
     *   - placeholder.attempt
     *   - placeholder.started
     *   - deadlineExceeded/deadline
     *   - terminalHistory
     *
     * Only reopen the current terminal accounting so the late result
     * can progress through MathML application and rerender.
     */
    if (
        placeholder.failureRetryable
    ) {
        initialInlineSageRuntime
            .retryableFailed -= 1;
    }

    if (
        placeholder.failureCategory
    ) {
        var category =
            placeholder.failureCategory;

        initialInlineSageRuntime
            .failureCategories[
                category
            ] -= 1;

        if (
            initialInlineSageRuntime
                .failureCategories[
                    category
                ] <= 0
        ) {
            delete initialInlineSageRuntime
                .failureCategories[
                    category
                ];
        }
    }

    placeholder.terminal = false;
    placeholder.terminalState = null;
    placeholder.failed = false;
    placeholder.failureRetryable = false;
    placeholder.failureCategory = null;

    initialInlineSageRuntime
        .settled -= 1;
    initialInlineSageRuntime
        .failed -= 1;

    initialInlineSageRuntime
        .reportedTerminal = false;
    initialInlineSageRuntime
        .reportedDiscovered = false;

    pageRuntime.operation(
        "sage-placeholder",
        "late-result-reopened",
        {
            placeholderId:
                placeholderId,
            attempt:
                placeholder.attempt,
            priorTerminalAttempts:
                placeholder
                    .terminalHistory.length,
            deadlineExceeded:
                initialInlineSageRuntime
                    .deadlineExceeded
        }
    );

    return true;
}


function completeInitialInlineSageDiscovery() {
    var descriptor =
        sagemath.describeMathJaxSageCall
            ? sagemath.describeMathJaxSageCall(
                null
            )
            : null;

    initialInlineSageRuntime.expected =
        descriptor &&
        typeof descriptor
            .manifestExpressions ===
            "number"
            ? descriptor
                .manifestExpressions
            : initialInlineSageRuntime
                .discovered;

    initialInlineSageRuntime
        .processComplete = true;

    reportInitialInlineSageProgress();
}


var initialInlineSageTimeoutOwnerConfigured =
    pageRuntime
        .configureInitialInlineSageTimeoutOwner(
            function(details) {
                return settleInitialInlineSageDeadline(
                    details
                );
            }
        );




function activeInitialMathJaxProcessGeneration() {
    if (
        typeof mathJaxPassRuntime ===
            "undefined" ||
        !mathJaxPassRuntime ||
        !mathJaxPassRuntime.active ||
        !mathJaxPassRuntime.active.process
    ) {
        return null;
    }

    return mathJaxPassRuntime
        .active.process.generation;
}


MathJax.Hub.Register.MessageHook("TeX Jax - parse error",function (message) {
    var generation =
        activeInitialMathJaxProcessGeneration();

    pageRuntime.event("mathjax-tex-parse-error", {
        messageAvailable: message !== undefined,
        generation: generation
    });

    pageRuntime.observeInitialMathJaxProcessError({
        generation: generation,
        errorType: "tex-parse-error",
        messageAvailable:
            message !== undefined
    });

    // do something with the error.  message[1] will contain the data about the error.
    console.log(message);
});

MathJax.Hub.Register.MessageHook("Math Processing Error",function (message) {
    var generation =
        activeInitialMathJaxProcessGeneration();

    pageRuntime.event("mathjax-processing-error", {
        messageAvailable: message !== undefined,
        generation: generation
    });

    pageRuntime.observeInitialMathJaxProcessError({
        generation: generation,
        errorType: "processing-error",
        messageAvailable:
            message !== undefined
    });

    //  do something with the error.  message[2] is the Error object that records the problem.
    console.log(message);
});

// Cervone says this will speed things up
MathJax.Hub.processSectionDelay = 0;
MathJax.Hub.processUpdateTime = 0;

pageRuntime.service(
    "mathjax",
    "startup-hook-registered"
);

var mathJaxStartupUiFinalization = {
    started: false,
    owner: null,
    completed: false
};

/*
 * An initial MathJax processing error makes the mathematical presentation
 * unsafe for coursework interaction for the remainder of this page load.
 */
var initialMathJaxInteractionBlock = {
    active:
        false,
    observer:
        null
};


function disableMathJaxDependentInteraction(root) {
    var scope =
        root && root.nodeType
            ? $(root)
            : $(document);

    var selector =
        [
            ".mathjaxed-input input",
            ".mathjaxed-input textarea",
            ".mathjaxed-input select",
            ".mathjaxed-input button",
            ".validator input",
            ".validator textarea",
            ".validator select",
            ".validator button",
            ".btn-ximera-submit",
            ".btn-ximera-show-answer",
            ".show-answer-small",
            ".show-answer-large"
        ].join(", ");

    scope.find(selector)
        .add(scope.filter(selector))
        .prop("disabled", true)
        .attr("aria-disabled", "true")
        .addClass(
            "xronos-mathjax-render-failure-disabled"
        );
}


function activateInitialMathJaxInteractionBlock(details) {
    if (initialMathJaxInteractionBlock.active) {
        return;
    }

    initialMathJaxInteractionBlock.active =
        true;

    $("body")
        .addClass(
            "xronos-mathjax-render-failure"
        )
        .attr(
            "data-xronos-mathjax-render-failure",
            "true"
        );

    /*
     * Student-facing recovery messaging is owned by
     * page-runtime-support-ui.js. Keep this function responsible only for
     * the safety-critical interaction block.
     */

    disableMathJaxDependentInteraction(
        document
    );

    document.addEventListener(
        "click",
        function(event) {
            var target =
                event.target;

            if (
                !initialMathJaxInteractionBlock.active ||
                !target ||
                typeof target.closest !==
                    "function"
            ) {
                return;
            }

            if (
                target.closest(
                    [
                        ".mathjaxed-input",
                        ".validator",
                        ".btn-ximera-submit",
                        ".btn-ximera-show-answer",
                        ".show-answer-small",
                        ".show-answer-large"
                    ].join(", ")
                )
            ) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        },
        true
    );

    document.addEventListener(
        "keydown",
        function(event) {
            var target =
                event.target;

            if (
                initialMathJaxInteractionBlock.active &&
                target &&
                typeof target.closest ===
                    "function" &&
                target.closest(
                    ".mathjaxed-input, .validator"
                )
            ) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        },
        true
    );

    if (
        typeof window.MutationObserver ===
            "function"
    ) {
        initialMathJaxInteractionBlock
            .observer =
                new window.MutationObserver(
                    function(mutations) {
                        mutations.forEach(
                            function(mutation) {
                                Array.prototype
                                    .forEach.call(
                                        mutation.addedNodes ||
                                            [],
                                        function(node) {
                                            if (
                                                node &&
                                                node.nodeType ===
                                                    1
                                            ) {
                                                disableMathJaxDependentInteraction(
                                                    node
                                                );
                                            }
                                        }
                                    );
                            }
                        );
                    }
                );

        initialMathJaxInteractionBlock
            .observer.observe(
                document.documentElement,
                {
                    childList:
                        true,
                    subtree:
                        true
                }
            );
    }

    pageRuntime.component(
        "mathjax-interaction-block",
        "active",
        details || {}
    );

    pageRuntime.event(
        "initial-mathjax-interaction-block-activated",
        details || {}
    );
}


function invokeMathJaxStartupUiFinalization(owner) {
    if (mathJaxStartupUiFinalization.started) {
        pageRuntime.event(
            "mathjax-startup-ui-duplicate-invocation-ignored",
            {
                requestedOwner: owner,
                activeOwner:
                    mathJaxStartupUiFinalization.owner,
                completed:
                    mathJaxStartupUiFinalization.completed
            }
        );

        return {
            state: "not-required",
            value: {
                reason: "already-started",
                owner:
                    mathJaxStartupUiFinalization.owner
            }
        };
    }

    mathJaxStartupUiFinalization.started = true;
    mathJaxStartupUiFinalization.owner = owner;

    pageRuntime.operation(
        "mathjax-startup-ui",
        "invoked",
        {
            owner: owner
        }
    );

    try {
        $(".accordion").each(function() {
            var accordion = $(this);
            var initiallyOpen =
                accordion.hasClass(
                    "xronos-foldable-accordion"
                );

            accordion.accordion({
                active: initiallyOpen ? 0 : false,
                autoHeight: false,
                collapsible: true,
                heightStyle: "content"
            });
        });

        $(".accordion").removeClass(
            "hidden-out-of-view"
        );

        $("#loadingSpinner").hide();

        references.highlightTarget();

        mathJaxStartupUiFinalization.completed =
            true;

        pageRuntime.operation(
            "mathjax-startup-ui",
            "completed",
            {
                owner: owner,
                accordionCount:
                    $(".accordion").length,
                loadingSpinnerCount:
                    $("#loadingSpinner").length
            }
        );

        return {
            state: "succeeded",
            value: {
                owner: owner,
                accordionCount:
                    $(".accordion").length,
                loadingSpinnerCount:
                    $("#loadingSpinner").length
            }
        };
    } catch (err) {
        pageRuntime.operation(
            "mathjax-startup-ui",
            "failed",
            {
                owner: owner,
                message:
                    err && err.message
                        ? err.message
                        : String(err)
            }
        );

        throw err;
    }
}

var mathJaxStartupUiOwnerConfigured =
    pageRuntime.configureMathJaxStartupUi(
        function() {
            return invokeMathJaxStartupUiFinalization(
                "coordinator"
            );
        }
    );

MathJax.Hub.Register.StartupHook("End", function () {
    pageRuntime.service(
        "mathjax",
        "startup-ended"
    );

    var requested =
        mathJaxStartupUiOwnerConfigured &&
        pageRuntime
            .requestMathJaxStartupUiFinalization(
                {
                    startupEnded: true,
                    requestLocation:
                        "mathjax-startup-end-hook"
                }
            );

    if (!requested) {
        pageRuntime.event(
            "mathjax-startup-ui-legacy-fallback",
            {
                reason:
                    mathJaxStartupUiOwnerConfigured
                        ? "coordinator-request-rejected"
                        : "coordinator-owner-not-configured"
            }
        );

        invokeMathJaxStartupUiFinalization(
            "legacy-fallback"
        );
    }
});

MathJax.Hub.Register.StartupHook("TeX Jax Ready",function () {
    pageRuntime.service(
        "mathjax-tex",
        "ready"
    );

    // Remove CDATA's from the script tags
    MathJax.InputJax.TeX.prefilterHooks.Add(function (data) {
	data.math = data.math.replace(/<!\[CDATA\[\s*((.|\n)*)\s*\]\]>/m,"$1");
    });

    // Replace "answer" commands with DOM elements
    var VERSION = "1.0";

    var TEX = MathJax.InputJax.TeX,
	TEXDEF = TEX.Definitions,
	MML = MathJax.ElementJax.mml,
	HTML = MathJax.HTML;

    /*
     * Development-only, one-shot initial-load MathJax fault probe.
     *
     * The request is consumed from sessionStorage before initial processing.
     * URL fragments cannot be used because Xronos treats them as authored
     * page targets, while query strings trigger the legacy cache-bust reload.
     */
    mathJaxInitialFaultProbe.install({
        MathJax:
            MathJax,
        pageRuntime:
            pageRuntime,
        storage:
            window.sessionStorage
    });

    var sageInlineFaultController =
        sageInlineFaultProbe.install({
            pageRuntime:
                pageRuntime,
            storage:
                window.sessionStorage
        });

    mathAnswerInitialFaultController =
        mathAnswerInitialFaultProbe.install({
            pageRuntime:
                pageRuntime,
            storage:
                window.sessionStorage
        });

    TEXDEF.macros.answer = "answer";
    TEXDEF.macros.graph = "graph";
    TEXDEF.macros.newlabel = "newlabel";
    TEXDEF.macros.sage = "sage";
    TEXDEF.macros.sagestr = "sagestr";
    TEXDEF.macros.xronosSageById =
        "xronosSageById";
    TEXDEF.macros.xronosSageStrById =
        "xronosSageStrById";
    TEXDEF.macros.delimiter = "delimiter";

    TEXDEF.macros.js = "js";

    var calculatorCount = 0;

    /* Sometimes htlatex generates \relax's which should be ignored */
    MathJax.InputJax.TeX.Definitions.Add({
	macros: {
	    relax: ["Macro", ""],
	    ensuremath: ["Macro", ""],
	    xspace: ["Macro", ""]
	}});

    TEX.Parse.Augment({
	/* sage emits delimiter commands pretty frequently? */
	delimiter: function(name) {
	    var d = this.GetArgument(name);

	    if (d.match(/426830A/)) {
		var mml = TEX.Parse("\\langle",this.stack.env).mml();
		this.Push(mml);
		return;
	    }

	    if (d.match(/526930B/)) {
		var mml = TEX.Parse("\\rangle",this.stack.env).mml();
		this.Push(mml);
		return;
	    }
	},

	// https://stackoverflow.com/questions/38726590/replace-variable-in-mathjax-equation
	sage: function(name) {
	    return this.sagestr(
            name,
            true,
            null
        );
	},

    xronosSageById: function(name) {
        return this.xronosSageStrById(
            name,
            true
        );
    },

    xronosSageStrById:
        function(name, latexify) {
            var stableId =
                this.GetArgument(name);

            return this.sagestr(
                name,
                latexify,
                stableId
            );
        },

    sagestr:
        function(
            name,
            latexify,
            stableId
        ) {
        var rawSageCode =
            this.GetArgument(name);

        var sageCallTrace = null;

        if (
            sagemath.traceMathJaxSageCall
        ) {
            sageCallTrace =
                sagemath.traceMathJaxSageCall(
                    rawSageCode,
                    latexify,
                    this,
                    stableId
                );
        }

        var sageCallRuntime =
            sagemath.describeMathJaxSageCall
                ? sagemath.describeMathJaxSageCall(
                    sageCallTrace
                )
                : {
                    callIndex: null,
                    initialManifestCall: false,
                    manifestExpressions: null,
                    stableId: null,
                    consumer: null,
                    problemId: null,
                    latexify: latexify
                };

        var code = rawSageCode;

        if (latexify)
            code = "latex(" + code + ")";

        var env = this.stack.env;
        var placeholderId =
            "xronos-sage-placeholder-" +
            Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2);

        var controller = {
            groupState: null,
            mathContainer: null,
            originalDisplay: null,
            requestAttempt: 0
        };

        var createSpinner = function() {
            return HTML.Element(
                "i",
                {
                    className: "fa fa-spinner fa-spin",
                    title: "Computing"
                }
            );
        };

        var createPlaceholderElement = function() {
            var element = HTML.Element(
                "span",
                {
                    id: placeholderId,
                    className: "xronos-sage-inline-placeholder"
                }
            );

            element.appendChild(createSpinner());
            return element;
        };

        var placeholderElement = createPlaceholderElement();
        var placeholderMml = MML["annotation-xml"](
            MML.xml(placeholderElement)
        ).With({
            encoding: "application/xhtml+xml",
            isToken: true
        });

        var placeholder = MML.none(
            MML.semantics(placeholderMml)
        );

        this.Push(placeholder);

        pageRuntime.operation(
            "sage-placeholder",
            "discovered",
            {
                placeholderId:
                    placeholderId,
                callIndex:
                    sageCallRuntime.callIndex,
                initialManifestCall:
                    sageCallRuntime
                        .initialManifestCall,
                manifestExpressions:
                    sageCallRuntime
                        .manifestExpressions,
                stableId:
                    sageCallRuntime.stableId,
                consumer:
                    sageCallRuntime.consumer,
                problemId:
                    sageCallRuntime.problemId,
                latexify:
                    sageCallRuntime.latexify
            }
        );

        if (
            sageCallRuntime
                .initialManifestCall
        ) {
            discoverInitialInlineSage(
                placeholderId
            );
        }

        var sagePlaceholderDetails =
            function(extra) {
                var details = {
                    placeholderId:
                        placeholderId,
                    callIndex:
                        sageCallRuntime.callIndex,
                    initialManifestCall:
                        sageCallRuntime
                            .initialManifestCall,
                    stableId:
                        sageCallRuntime.stableId,
                    consumer:
                        sageCallRuntime.consumer,
                    problemId:
                        sageCallRuntime.problemId,
                    latexify:
                        sageCallRuntime.latexify
                };

                Object.keys(
                    extra || {}
                ).forEach(function(key) {
                    details[key] =
                        extra[key];
                });

                return details;
            };

        var claimSageInlineFault =
            function(
                faultType,
                extra
            ) {
                if (
                    !sageInlineFaultController ||
                    typeof sageInlineFaultController
                        .claim !==
                        "function"
                ) {
                    return false;
                }

                return sageInlineFaultController
                    .claim(
                        faultType,
                        sagePlaceholderDetails(
                            extra || {}
                        )
                    );
            };

        var rerenderPlaceholder = function() {
            var parent = placeholder;

            while (parent.parent != undefined)
                parent = parent.parent;

            var missingInputIdFault =
                claimSageInlineFault(
                    "missing-input-id",
                    {
                        attempt:
                            currentRequestAttempt()
                    }
                );

            if (
                missingInputIdFault ||
                !parent.inputID
            ) {
                pageRuntime.operation(
                    "sage-placeholder",
                    "rerender-unavailable",
                    sagePlaceholderDetails({
                        reason:
                            missingInputIdFault
                                ? "controlled-fault-missing-input-id"
                                : "missing-input-id",
                        controlledFault:
                            !!missingInputIdFault
                    })
                );

                showError(
                    {
                        ename:
                            "XronosSageDisplayError",
                        evalue:
                            "The computed Sage result could not be attached to its MathJax source."
                    },
                    currentRequestAttempt()
                );

                return false;
            }

            pageRuntime.operation(
                "sage-placeholder",
                "rerender-queued",
                sagePlaceholderDetails({
                    inputId:
                        parent.inputID
                })
            );

            MathJax.Hub.Queue(
                [
                    "Rerender",
                    MathJax.Hub,
                    parent.inputID
                ],
                function() {
                    pageRuntime.operation(
                        "sage-placeholder",
                        "rerender-completed",
                        sagePlaceholderDetails({
                            inputId:
                                parent.inputID,
                            placeholderPresent:
                                findPlaceholderElements()
                                    .length > 0
                        })
                    );

                    if (
                        sageCallRuntime
                            .initialManifestCall
                    ) {
                        settleInitialInlineSage(
                            placeholderId,
                            "rerender-completed",
                            false
                        );
                    }
                }
            );

            return true;
        };

        var findPlaceholderElements = function() {
            var nodes = document.querySelectorAll(
                '[id="' + placeholderId + '"]'
            );

            return Array.prototype.slice.call(nodes);
        };

        var findVisiblePlaceholderElement = function() {
            var elements = findPlaceholderElements();
            var index;

            for (index = 0; index < elements.length; index += 1) {
                if (
                    $(elements[index]).closest(
                        ".MJX_Assistive_MathML"
                    ).length === 0
                ) {
                    return elements[index];
                }
            }

            return elements.length ? elements[0] : null;
        };

        var clearElement = function(element) {
            while (element.firstChild)
                element.removeChild(element.firstChild);
        };

        var findMathContainer = function(anchor) {
            return (
                $(anchor).closest(
                    "span.MathJax, div.MathJax_Display"
                )[0] ||
                anchor.parentNode ||
                anchor
            );
        };

        var findProblemContainer = function(mathContainer) {
            return (
                $(mathContainer).closest(
                    ".problem-environment"
                )[0] ||
                mathContainer.parentNode ||
                document.body
            );
        };

        var removeGroupPanel = function(state) {
            if (
                state.panel &&
                state.panel.parentNode
            ) {
                state.panel.parentNode.removeChild(
                    state.panel
                );
            }

            state.panel = null;
        };

        var getGroupState = function(problemContainer) {
            if (!problemContainer.xronosSageFailureGroup) {
                problemContainer.xronosSageFailureGroup = {
                    problemContainer: problemContainer,
                    failures: {},
                    panel: null
                };
            }

            return problemContainer.xronosSageFailureGroup;
        };

        var groupFailureEntries = function(state) {
            return Object.keys(state.failures).map(
                function(key) {
                    return state.failures[key];
                }
            );
        };

        var getPageFailureRegistry = function() {
            if (
                !window.xronosSageFailurePageRegistry
            ) {
                window.xronosSageFailurePageRegistry = [];
            }

            return window.xronosSageFailurePageRegistry;
        };

        var registerGroupState = function(state) {
            var registry = getPageFailureRegistry();

            if (registry.indexOf(state) === -1)
                registry.push(state);
        };

        var unregisterGroupState = function(state) {
            var registry = getPageFailureRegistry();
            var index;

            if (
                Object.keys(state.failures).length !== 0
            ) {
                return;
            }

            index = registry.indexOf(state);

            if (index !== -1)
                registry.splice(index, 1);
        };

        var retryAllPageFailures = function() {
            var registry =
                getPageFailureRegistry().slice();
            var retryItems = [];
            var affectedStates = [];

            registry.forEach(function(state) {
                groupFailureEntries(state).forEach(
                    function(entry) {
                        if (!entry.info.retryable)
                            return;

                        retryItems.push({
                            state: state,
                            entry: entry
                        });

                        if (
                            affectedStates.indexOf(state) === -1
                        ) {
                            affectedStates.push(state);
                        }
                    }
                );
            });

            if (!retryItems.length)
                return;

            $(
                ".xronos-sage-page-retry"
            ).prop("disabled", true);

            /*
             * Remove the retryable failures from the current
             * panels before starting the requests. Deterministic
             * failures, if any, remain registered and visible.
             */
            retryItems.forEach(function(item) {
                delete item.state.failures[
                    item.entry.id
                ];
            });

            affectedStates.forEach(function(state) {
                if (
                    Object.keys(
                        state.failures
                    ).length === 0
                ) {
                    removeGroupPanel(state);
                    unregisterGroupState(state);
                } else {
                    renderGroupPanel(state);
                }
            });

            /*
             * Reopen failed initial-placeholder lifecycle records before
             * putting their spinners back. Prior terminal attempts remain
             * preserved in each placeholder's terminalHistory.
             */
            var reopenedInitialPlaceholders = 0;

            retryItems.forEach(function(item) {
                if (
                    reopenInitialInlineSage(
                        item.entry.id
                    )
                ) {
                    reopenedInitialPlaceholders += 1;
                }
            });

            if (
                reopenedInitialPlaceholders > 0
            ) {
                if (
                    pageRuntime
                        .beginInitialInlineSageRetry
                ) {
                    pageRuntime
                        .beginInitialInlineSageRetry({
                            placeholders:
                                reopenedInitialPlaceholders
                        });
                }

                reportInitialInlineSageProgress();
            }

            /*
             * Restore every affected expression and show its
             * spinner before launching the page-wide retry pass.
             */
            retryItems.forEach(function(item) {
                item.entry.showSpinner();
            });

            retryItems.forEach(function(item) {
                item.entry.retry();
            });
        };

        var renderGroupPanel = function(state) {
            var entries = groupFailureEntries(state);
            var allRetryable;
            var hasAuthorization;
            var hasCode;
            var hasDisplay;
            var category;
            var messageText;
            var message;
            var button;

            if (!entries.length) {
                removeGroupPanel(state);
                unregisterGroupState(state);
                return;
            }

            allRetryable = entries.every(
                function(entry) {
                    return entry.info.retryable;
                }
            );

            hasAuthorization = entries.some(
                function(entry) {
                    return (
                        entry.info.category ===
                        "authorization"
                    );
                }
            );

            hasCode = entries.some(
                function(entry) {
                    return entry.info.category === "code";
                }
            );

            hasDisplay = entries.some(
                function(entry) {
                    return (
                        entry.info.category === "display" ||
                        entry.info.category === "unexpected"
                    );
                }
            );

            if (hasCode) {
                category = "code";
                messageText =
                    "This problem's computations encountered an error. " +
                    "Retrying is unlikely to fix it. Please report this " +
                    "page to your instructor.";
            } else if (hasDisplay || !allRetryable) {
                category = "display";
                messageText =
                    "The computations for this problem could not be " +
                    "displayed. Reload the page or report this activity.";
            } else if (hasAuthorization) {
                category = "authorization";
                messageText =
                    "The computation session for this problem could not " +
                    "be refreshed. Reload the page or try again.";
            } else {
                category = "transient";
                messageText =
                    "The computations for this problem could not be " +
                    "loaded. Check your connection and try again.";
            }

            if (!state.panel) {
                state.panel = document.createElement("div");

                state.panel.setAttribute(
                    "role",
                    "alert"
                );

                state.panel.setAttribute(
                    "aria-live",
                    "polite"
                );

                state.problemContainer.appendChild(
                    state.panel
                );
            }

            state.panel.className =
                "xronos-sage-error " +
                "xronos-sage-problem-error " +
                "xronos-sage-error-" +
                category;

            clearElement(state.panel);

            message = document.createElement("div");

            message.className =
                "xronos-sage-error-message";

            message.appendChild(
                document.createTextNode(messageText)
            );

            state.panel.appendChild(message);

            if (allRetryable) {
                button = document.createElement("button");

                button.type = "button";
                button.className =
                    "btn btn-sm btn-secondary " +
                    "xronos-sage-retry " +
                    "xronos-sage-page-retry";

                button.appendChild(
                    document.createTextNode(
                        "Retry all computations on this page"
                    )
                );

                button.addEventListener(
                    "click",
                    function(event) {
                        event.preventDefault();
                        retryAllPageFailures();
                    }
                );

                state.panel.appendChild(button);
            }
        };

        var hideMathContainer = function(mathContainer) {
            if (
                controller.originalDisplay === null
            ) {
                controller.originalDisplay =
                    mathContainer.style.display;
            }

            controller.mathContainer = mathContainer;
            mathContainer.style.display = "none";
        };

        var restoreMathContainer = function() {
            if (!controller.mathContainer)
                return;

            controller.mathContainer.style.display =
                controller.originalDisplay || "";
        };

        var showSpinner = function() {
            var elements = findPlaceholderElements();

            restoreMathContainer();

            elements.forEach(function(element) {
                clearElement(element);
                element.style.display = "";
                element.appendChild(createSpinner());
            });

            return elements.length > 0;
        };

        var currentInitialPlaceholder = function() {
            if (
                !sageCallRuntime
                    .initialManifestCall
            ) {
                return null;
            }

            return initialInlineSageRuntime
                .placeholders[
                    placeholderId
                ] || null;
        };

        var currentRequestAttempt = function() {
            return controller.requestAttempt;
        };

        var requestAttemptIsCurrent = function(
            requestAttempt
        ) {
            return (
                requestAttempt ===
                controller.requestAttempt
            );
        };

        var reportStaleRequestCallback = function(
            stage,
            requestAttempt
        ) {
            pageRuntime.operation(
                "sage-placeholder",
                "stale-attempt-ignored",
                sagePlaceholderDetails({
                    stage:
                        stage,
                    requestAttempt:
                        requestAttempt,
                    currentAttempt:
                        controller.requestAttempt
                })
            );
        };

        var findFallbackFailureContainer = function() {
            var problemContainer = null;

            if (sageCallRuntime.problemId) {
                problemContainer =
                    document.getElementById(
                        sageCallRuntime.problemId
                    );
            }

            if (problemContainer) {
                return {
                    container:
                        problemContainer,
                    target:
                        "problem"
                };
            }

            var activity =
                $("main.activity").first()[0];

            if (activity) {
                return {
                    container:
                        activity,
                    target:
                        "activity"
                };
            }

            var pageContent =
                document.getElementById(
                    "page-content"
                );

            if (pageContent) {
                return {
                    container:
                        pageContent,
                    target:
                        "page-content"
                };
            }

            return {
                container:
                    document.body,
                target:
                    "body"
            };
        };


        var clearRegisteredFailure = function() {
            var state = controller.groupState;

            if (!state)
                return;

            delete state.failures[placeholderId];

            if (
                Object.keys(state.failures).length === 0
            ) {
                removeGroupPanel(state);
                unregisterGroupState(state);
            } else {
                renderGroupPanel(state);
            }

            controller.groupState = null;
        };

        var runSage;

        var showError = function(
            err,
            requestAttempt
        ) {
            console.log("Inline Sage error=", err);

            if (
                !requestAttemptIsCurrent(
                    requestAttempt
                )
            ) {
                reportStaleRequestCallback(
                    "error-before-queue",
                    requestAttempt
                );
                return;
            }

            MathJax.Hub.Queue([
                function() {
                    if (
                        !requestAttemptIsCurrent(
                            requestAttempt
                        )
                    ) {
                        reportStaleRequestCallback(
                            "error-in-mathjax-queue",
                            requestAttempt
                        );
                        return;
                    }

                    if (
                        err &&
                        err.xronosSageInlineFault ===
                            "missing-placeholder"
                    ) {
                        findPlaceholderElements()
                            .forEach(function(element) {
                                if (element.parentNode) {
                                    element.parentNode
                                        .removeChild(
                                            element
                                        );
                                }
                            });
                    }

                    var anchor =
                        findVisiblePlaceholderElement();
                    var mathContainer;
                    var problemContainer;
                    var fallbackTarget;
                    var state;
                    var info;

                    info =
                        sagemath.describeSageError(err);

                    if (!anchor) {
                        fallbackTarget =
                            findFallbackFailureContainer();

                        problemContainer =
                            fallbackTarget.container;

                        state =
                            getGroupState(
                                problemContainer
                            );

                        registerGroupState(state);

                        controller.groupState =
                            state;

                        state.failures[
                            placeholderId
                        ] = {
                            id:
                                placeholderId,
                            info:
                                info,
                            error:
                                err,
                            retry:
                                runSage,
                            showSpinner:
                                showSpinner,
                            mathContainer:
                                null
                        };

                        renderGroupPanel(state);

                        pageRuntime.operation(
                            "sage-placeholder",
                            "fallback-placeholder-missing",
                            sagePlaceholderDetails({
                                errorName:
                                    err &&
                                    err.ename
                                        ? err.ename
                                        : null,
                                errorCategory:
                                    info &&
                                    info.category
                                        ? info.category
                                        : null,
                                visibleFallbackShown:
                                    true,
                                visibleFallbackTarget:
                                    fallbackTarget.target
                            })
                        );

                        if (
                            sageCallRuntime
                                .initialManifestCall
                        ) {
                            settleInitialInlineSage(
                                placeholderId,
                                err &&
                                err.xronosInitialInlineDeadline
                                    ? "deadline-fallback"
                                    : "fallback-placeholder-missing",
                                true,
                                info
                            );
                        }

                        return;
                    }

                    mathContainer =
                        findMathContainer(anchor);

                    problemContainer =
                        findProblemContainer(
                            mathContainer
                        );

                    state =
                        getGroupState(
                            problemContainer
                        );

                    registerGroupState(state);

                    hideMathContainer(mathContainer);

                    controller.groupState = state;

                    state.failures[placeholderId] = {
                        id: placeholderId,
                        info: info,
                        error: err,
                        retry: runSage,
                        showSpinner: showSpinner,
                        mathContainer: mathContainer
                    };

                    renderGroupPanel(state);

                    pageRuntime.operation(
                        "sage-placeholder",
                        "fallback-shown",
                        sagePlaceholderDetails({
                            errorName:
                                err &&
                                err.ename
                                    ? err.ename
                                    : null,
                            errorCategory:
                                info &&
                                info.category
                                    ? info.category
                                    : null
                        })
                    );

                    if (
                        sageCallRuntime
                            .initialManifestCall
                    ) {
                        settleInitialInlineSage(
                            placeholderId,
                            err &&
                            err.xronosInitialInlineDeadline
                                ? "deadline-fallback"
                                : "fallback-shown",
                            true,
                            info
                        );
                    }

                    return;
                }
            ]);
        };


        if (
            sageCallRuntime
                .initialManifestCall
        ) {
            registerInitialInlineSageTimeoutHandler(
                placeholderId,
                function(deadlineDetails) {
                    pageRuntime.operation(
                        "sage-placeholder",
                        "deadline-fallback-requested",
                        sagePlaceholderDetails({
                            deadlineCode:
                                deadlineDetails &&
                                deadlineDetails
                                    .deadline &&
                                deadlineDetails
                                    .deadline.code
                                    ? deadlineDetails
                                        .deadline.code
                                    : null
                        })
                    );

                    showError(
                        {
                            ename:
                                "SageCellRequestError",
                            evalue:
                                "initial inline Sage display deadline exceeded",
                            status:
                                "timeout",
                            httpStatus:
                                0,
                            xronosInitialInlineDeadline:
                                true
                        },
                        currentRequestAttempt()
                    );
                }
            );
        }


        var renderResult = function(
            result,
            requestAttempt
        ) {
            if (
                !requestAttemptIsCurrent(
                    requestAttempt
                )
            ) {
                reportStaleRequestCallback(
                    "result-before-queue",
                    requestAttempt
                );
                return;
            }

            var currentPlaceholder =
                currentInitialPlaceholder();

            if (
                currentPlaceholder &&
                currentPlaceholder
                    .terminal &&
                currentPlaceholder
                    .terminalState ===
                    "deadline-fallback"
            ) {
                if (
                    reopenInitialInlineSageLateResult(
                        placeholderId
                    )
                ) {
                    reportInitialInlineSageProgress();
                }
            }

            pageRuntime.operation(
                "sage-placeholder",
                "result-resolved",
                sagePlaceholderDetails({
                    resultType:
                        typeof result,
                    attempt:
                        requestAttempt
                })
            );

            MathJax.Hub.Queue([
                function() {
                    if (
                        !requestAttemptIsCurrent(
                            requestAttempt
                        )
                    ) {
                        reportStaleRequestCallback(
                            "result-in-mathjax-queue",
                            requestAttempt
                        );
                        return;
                    }

                    try {
                        clearRegisteredFailure();
                        restoreMathContainer();

                        // The SageCell server returns quoted strings.
                        if (latexify != true)
                            result = eval(result);

                        var mml = TEX.Parse(result, env).mml();

                        if (mml.inferred) {
                            mml = MML.apply(
                                MathJax.ElementJax,
                                mml.data
                            );
                        } else {
                            mml = MML(mml);
                        }

                        placeholder.data = mml.root.data;

                        pageRuntime.operation(
                            "sage-placeholder",
                            "mml-applied",
                            sagePlaceholderDetails({
                                placeholderPresent:
                                    findPlaceholderElements()
                                        .length > 0,
                                attempt:
                                    requestAttempt
                            })
                        );

                        if (
                            sageCallRuntime
                                .initialManifestCall
                        ) {
                            updateInitialInlineSage(
                                placeholderId,
                                "mml-applied"
                            );
                        }

                        rerenderPlaceholder();
                    } catch (displayError) {
                        pageRuntime.operation(
                            "sage-placeholder",
                            "display-failed",
                            sagePlaceholderDetails({
                                errorName:
                                    displayError &&
                                    displayError.name
                                        ? displayError.name
                                        : null,
                                errorMessage:
                                    displayError &&
                                    displayError.message
                                        ? displayError.message
                                        : String(
                                            displayError
                                        ),
                                attempt:
                                    requestAttempt
                            })
                        );

                        showError(
                            {
                                ename:
                                    "XronosSageDisplayError",
                                evalue:
                                    displayError &&
                                    displayError.message
                                        ? displayError.message
                                        : String(displayError)
                            },
                            requestAttempt
                        );
                    }

                    return;
                }
            ]);
        };

        runSage = function() {
            controller.requestAttempt += 1;

            var requestAttempt =
                currentRequestAttempt();

            pageRuntime.operation(
                "sage-placeholder",
                "request-started",
                sagePlaceholderDetails({
                    attempt:
                        requestAttempt
                })
            );

            if (
                sageCallRuntime
                    .initialManifestCall
            ) {
                updateInitialInlineSage(
                    placeholderId,
                    "request-started"
                );
            }

            var pageResultErrorFault =
                claimSageInlineFault(
                    "page-result-error",
                    {
                        attempt:
                            requestAttempt
                    }
                );

            var missingPlaceholderFault =
                pageResultErrorFault
                    ? false
                    : claimSageInlineFault(
                        "missing-placeholder",
                        {
                            attempt:
                                requestAttempt
                        }
                    );

            var staleAttemptFault =
                pageResultErrorFault ||
                missingPlaceholderFault
                    ? false
                    : claimSageInlineFault(
                        "stale-attempt",
                        {
                            attempt:
                                requestAttempt
                        }
                    );

            var requestPromise;

            if (pageResultErrorFault) {
                requestPromise =
                    Promise.reject({
                        ename:
                            "XronosSagePageResultError",
                        evalue:
                            "controlled canonical Sage result parsing fault",
                        xronosSageInlineFault:
                            "page-result-error"
                    });
            } else if (missingPlaceholderFault) {
                requestPromise =
                    Promise.reject({
                        ename:
                            "SageCellRequestError",
                        evalue:
                            "controlled missing-placeholder Sage fault",
                        status:
                            "error",
                        httpStatus:
                            0,
                        xronosSageInlineFault:
                            "missing-placeholder"
                    });
            } else {
                requestPromise =
                    sagemath.resolveMathJaxSageCall(
                        sageCallTrace,
                        code
                    );
            }

            if (staleAttemptFault) {
                var underlyingRequestPromise =
                    requestPromise;

                requestPromise =
                    new Promise(
                        function(resolve, reject) {
                            underlyingRequestPromise.then(
                                function(result) {
                                    window.setTimeout(
                                        function() {
                                            resolve(result);
                                        },
                                        staleAttemptFault
                                            .delayMilliseconds
                                    );
                                },
                                function(err) {
                                    window.setTimeout(
                                        function() {
                                            reject(err);
                                        },
                                        staleAttemptFault
                                            .delayMilliseconds
                                    );
                                }
                            );
                        }
                    );

                /*
                 * Make attempt 1 visibly retryable while preserving its real
                 * delayed callback. The explicit Retry starts attempt 2; when
                 * attempt 1 is released later, the request token must reject
                 * it as stale before it touches lifecycle state or the DOM.
                 */
                showError(
                    {
                        ename:
                            "SageCellRequestError",
                        evalue:
                            "controlled stale-attempt Sage fault",
                        status:
                            "timeout",
                        httpStatus:
                            0,
                        xronosSageInlineFault:
                            "stale-attempt"
                    },
                    requestAttempt
                );
            }

            requestPromise.then(
                function(result) {
                    if (
                        !requestAttemptIsCurrent(
                            requestAttempt
                        )
                    ) {
                        reportStaleRequestCallback(
                            "result-promise",
                            requestAttempt
                        );
                        return;
                    }

                    renderResult(
                        result,
                        requestAttempt
                    );
                },
                function(err) {
                    if (
                        !requestAttemptIsCurrent(
                            requestAttempt
                        )
                    ) {
                        reportStaleRequestCallback(
                            "error-promise",
                            requestAttempt
                        );
                        return;
                    }

                    pageRuntime.operation(
                        "sage-placeholder",
                        "request-failed",
                        sagePlaceholderDetails({
                            errorName:
                                err &&
                                err.ename
                                    ? err.ename
                                    : null,
                            attempt:
                                requestAttempt
                        })
                    );

                    showError(
                        err,
                        requestAttempt
                    );
                }
            );
        };

        runSage();

        return;
    },

	/* Implements \graph{y=x^2, r = theta} and the like */
	graph: function(name) {
	    // Load Desmos asynchronously
	    Desmos.loadAsynchronously();

	    var optionalArguments = this.GetBrackets(name);
	    var equations = this.GetArgument(name);

	    var keys = {};
	    if( optionalArguments ) {
	        optionalArguments.split(/,/).forEach( function(kv) {
                    kv = kv.trim().split(/=/);
		    if(kv.length > 1 ) keys[kv[0]] = kv[1];
		    else keys[kv[0]] = true;
	        } );
	    }

            var id = "calculator" + calculatorCount;
            calculatorCount = calculatorCount + 1;
	    var element = HTML.Element("div",
				       {className:"calculator",
                                        id: id,
					style: {width: "30px", height: "300px"}
				       });
	    var mml = MML["annotation-xml"](MML.xml(element)).With({encoding:"application/xhtml+xml",isToken:true});
	    this.Push(MML.semantics(mml));

            MathJax.Hub.Queue( function () {
		var element = document.getElementById(id);
                var parent = $(element).closest( 'div.MathJax_Display' );
		parent.empty();
		element = parent;

		Desmos.onReady( function(Desmos) {
		    var calculator = Desmos.Calculator(element, {
			expressionsCollapsed: !keys.panel
		    });
		    window.calculator = calculator;

		    if (equations.match( /^\(.*\)$/ ))
			calculator.setExpression({id:'graph', latex: equations});
		    else {
			equations.split(',').forEach( function(equation, index) {
			    calculator.setExpression({id:'graph' + index, latex: equation});
			});
		    }
		    if( keys.xmax !== undefined ) {
			calculator.setMathBounds({
			    left: parseFloat(keys.xmin),
			    right: parseFloat(keys.xmax),
			    top: parseFloat(keys.ymax),
			    bottom: parseFloat(keys.ymin) });
		    }
		    if( keys.polar !== undefined ) {
			calculator.setGraphSettings({polarMode:true});
		    }
		    if( keys.hideXAxis ) {
			calculator.setGraphSettings({showXAxis:false});
		    }
		    if( keys.hideYAxis ) {
			calculator.setGraphSettings({showYAxis:false});
		    }
		    if( keys.xAxisLabel ) {
			calculator.setGraphSettings({xAxisLabel:keys.xAxisLabel});
		    }
		    if( keys.yAxisLabel ) {
			calculator.setGraphSettings({yAxisLabel:keys.yAxisLabel});
		    }
		    if( keys.hideXAxisNumbers ) {
			calculator.setGraphSettings({xAxisNumbers:false});
		    }
		    if( keys.hideYAxisNumbers ) {
			calculator.setGraphSettings({yAxisNumbers:false});
		    }

                    // Bart requests that projectorMode be default
	            calculator.setGraphSettings({projectorMode:true});
		    if( keys.projectorMode ) {
			calculator.setGraphSettings({projectorMode:true});
		    }
		    if( keys.thinMode ) {
			calculator.setGraphSettings({projectorMode:false});
		    }
		    var height = keys.height || 300;
		    $(element).height(height);
		    calculator.resize();
		});
            });
	},

	/* Implements \js{code} */
	js: function(name) {
	    var code = this.GetArgument(name);
	    var value = Javascript.evaluateLatex(code);

	    var mml = TEX.Parse(value,this.stack.env).mml();

	    this.Push(mml);

	    var watcher = HTML.Element("span",
				     {className:"mathjax-javascript",
				      style: {display: "none"}
				     });

	    watcher.setAttribute("data-code", code);
	    watcher.setAttribute("data-value", value);

	    var watcherMml = MML["annotation-xml"](MML.xml(watcher)).With({encoding:"application/xhtml+xml",isToken:true});
	    this.Push(MML.semantics(watcherMml));
	},

	/* Implements \answer[key=value]{text} */
	answer: function(name) {
	    var keys = this.GetBrackets(name);

	    var input = HTML.Element("form",
				     {className:"mathjaxed-input",
				      style: {marginBottom: "10px", marginTop: "10px", display: "inline-flex" },
				     });
	    input.setAttribute("xmlns","http://www.w3.org/1999/xhtml");

	    // Parse key=value pairs from optional [bracket] into data- attributes
	    var options = {};
	    if (keys !== undefined) {
		keys.split(",").forEach( function(keyvalue) {
		    var key = keyvalue.split("=")[0];
		    var value = keyvalue.split("=").slice(1).join('=');
		    if (value === undefined)
			value = true;

		    input.setAttribute("data-" + key,value);

		    options[key] = value;
		});
		}
		var showAnswer = options['onlinenoinput'] === '' || options['onlineshowanswerbutton'] === ''
		var showInput = options['onlinenoinput'] !== ''

	    var format = options['format'];
	    var answer;

	    if (format == 'string') {
		answer = this.GetArgument(name);
		answer = MML.mtext(answer);
	    } else if ((format == 'integer') || (format == 'float')) {
		answer = this.GetArgument(name);
		answer = MML.mn(answer);
	    } else {
		// This actually PARSES the content of the \answer command
		// with mathjax; the result will be MathML.  If we had
		// instead used this.GetArgument(name) we could have
		// gotten the raw string passed to \answer, but by using
		// ParseArg, we can invoke \newcommand's from inside an
		// \answer.
		answer = this.ParseArg(name);
	    }
		input.style.width = (155 + ((showAnswer && showInput) ? 25 : 0)).toString() + "px";

		// Attempt to change size if we have a short answer
	    try {
		answer.parent = {inferRow: false};
		var correctAnswerMml = answer.toMathML("");
		var correctAnswer = Expression.fromMml(correctAnswerMml).toString().toString();
		if (correctAnswer.length <= 3) {
		    input.classList.add('narrow'); // to eliminate some padding
			input.style.width = (70 + ((showAnswer && showInput) ? 25 : 0)).toString() + "px";
		}
	    } catch (err) {
	    }

	    this.Push(MML.mpadded(MML.mphantom(answer)).With({height: 0, width: 0}));
		mathAnswer.createMathAnswer(input, showInput, showAnswer);

	    var xml = MML.xml(input);
	    var mml = MML["annotation-xml"](xml).With({encoding:"application/xhtml+xml",isToken:true});
	    var semantics = MML.semantics(mml);
		this.Push(semantics);
		this.Push(MML.mpadded().With({height: "30px", width: 0}));

	    return;
	}
    });
});

function searchJax(jax, spanID){
    // Sometimes the jax is null?  I don't really know why.
    if (jax === null)
	return null;

     if(jax.spanID == spanID){
          return jax;
     } else if (jax.data != null){
          var i;
         var result = null;
         for(i=0; result == null && i < jax.data.length; i++){
             result = searchJax(jax.data[i], spanID);
         }
         return result;
     }
     return null;
}

var answerIdBindings = {};
var mathAnswerRuntime = {
    newMathMessages: 0,
    discoveredInstances: 0,
    connectionAttempts: 0,
    connectedAnswerIds: {},
    missingAnswerModels: 0,
    attachmentFailures: 0,
    zeroAnswerBatches: 0
};

/*
 * Track logical answers discovered during the initial MathJax Process pass.
 *
 * Successful attachment is retained permanently. Current DOM presence is not
 * used because MathJax may replace answer elements and completed answers may
 * be rendered as blue submitted-answer TeX without an input form.
 */
var initialMathAnswerRuntime = {
    processComplete: false,
    generation: null,
    processDurationMilliseconds: null,
    answers: {}
};

function initialMathAnswerEntry(answerId) {
    if (!initialMathAnswerRuntime.answers[answerId]) {
        initialMathAnswerRuntime.answers[answerId] = {
            answerId: answerId,
            discoveredDuringInitialProcess: true,
            connectionAttempts: 0,
            modelResolved: false,
            attachedAtLeastOnce: false,
            pendingDatabase: false,
            latestFailure: null
        };
    }

    return initialMathAnswerRuntime.answers[answerId];
}

function initialMathAnswerDetails() {
    var answerIds =
        Object.keys(initialMathAnswerRuntime.answers);
    var attachedAnswers = 0;
    var modelResolvedAnswers = 0;
    var pendingDatabaseAnswers = 0;
    var unresolvedAnswerIds = [];
    var totalConnectionAttempts = 0;

    answerIds.forEach(function(answerId) {
        var entry =
            initialMathAnswerRuntime.answers[answerId];

        totalConnectionAttempts +=
            entry.connectionAttempts;

        if (entry.modelResolved)
            modelResolvedAnswers += 1;

        if (entry.pendingDatabase)
            pendingDatabaseAnswers += 1;

        if (entry.attachedAtLeastOnce) {
            attachedAnswers += 1;
        } else {
            unresolvedAnswerIds.push(answerId);
        }
    });

    return {
        generation:
            initialMathAnswerRuntime.generation,
        expectedAnswers:
            answerIds.length,
        modelResolvedAnswers:
            modelResolvedAnswers,
        attachedAnswers:
            attachedAnswers,
        pendingDatabaseAnswers:
            pendingDatabaseAnswers,
        unresolvedAnswers:
            unresolvedAnswerIds.length,
        unresolvedAnswerIds:
            unresolvedAnswerIds,
        connectionAttempts:
            totalConnectionAttempts,
        processDurationMilliseconds:
            initialMathAnswerRuntime
                .processDurationMilliseconds,
        processComplete:
            initialMathAnswerRuntime.processComplete
    };
}

function reportInitialMathAnswerReadiness() {
    var details;
    var state;

    if (!initialMathAnswerRuntime.processComplete)
        return;

    details = initialMathAnswerDetails();

    /*
     * MathJax may discover and resolve an answer before the initial page-state
     * database is available. Those answers are valid but cannot yet be bound
     * through persistentData(). Keep initial-answer readiness nonterminal until
     * the existing fetchData() database barrier releases the queued attachment.
     */
    if (details.pendingDatabaseAnswers > 0)
        return;

    if (details.expectedAnswers === 0) {
        state = "not-required";
    } else if (
        details.attachedAnswers ===
            details.expectedAnswers
    ) {
        state = "settled";
    } else {
        state = "degraded";
    }

    pageRuntime.component(
        "initial-math-answers",
        state,
        details
    );
}

function recordInitialMathAnswerAttempt(
    answerId,
    modelResolved,
    attached,
    failure
) {
    var entry =
        initialMathAnswerRuntime.answers[answerId];
    var changed = false;

    if (!entry)
        return;

    /*
     * Once an initial logical answer has attached successfully, preserve that
     * terminal success without counting ordinary MathJax recreation or
     * rebinding as another initial-readiness attempt.
     */
    if (entry.attachedAtLeastOnce)
        return;

    entry.connectionAttempts += 1;
    changed = true;

    if (modelResolved && !entry.modelResolved) {
        entry.modelResolved = true;
        changed = true;
    }

    if (attached) {
        entry.attachedAtLeastOnce = true;
        entry.latestFailure = null;
        changed = true;
    } else if (
        failure &&
        entry.latestFailure !== failure
    ) {
        entry.latestFailure = failure;
        changed = true;
    }

    if (changed)
        reportInitialMathAnswerReadiness();
}

var mathJaxPassRuntime = {
    nextGeneration: 1,
    active: {},
    completed: [],
    orphanEnds: 0,
    rerenderSummary: {
        passCount: 0,
        totalDurationMilliseconds: 0,
        maximumDurationMilliseconds: 0,
        newMathMessages: 0,
        answerConnectionAttempts: 0,
        uniqueAnswersAdded: 0,
        firstGeneration: null,
        latestGeneration: null
    }
};

function mathJaxPassKey(passType) {
    return String(passType).toLowerCase();
}

function beginMathJaxPass(passType, message) {
    var key =
        mathJaxPassKey(passType);
    var generation =
        mathJaxPassRuntime.nextGeneration;
    var pass = {
        generation:
            generation,
        passType:
            key,
        startedAtMilliseconds:
            Date.now(),
        newMathMessagesAtStart:
            mathAnswerRuntime
                .newMathMessages,
        discoveredAnswerInstancesAtStart:
            mathAnswerRuntime
                .discoveredInstances,
        answerConnectionAttemptsAtStart:
            mathAnswerRuntime
                .connectionAttempts,
        missingAnswerModelsAtStart:
            mathAnswerRuntime
                .missingAnswerModels,
        uniqueAnswersAtStart:
            Object.keys(
                mathAnswerRuntime
                    .connectedAnswerIds
            ).length
    };

    mathJaxPassRuntime.nextGeneration += 1;
    mathJaxPassRuntime.active[key] = pass;

    if (key === "process") {
        pageRuntime.beginInitialMathJaxProcess({
            generation:
                generation,
            passType:
                key,
            signal:
                message &&
                message[0]
                    ? message[0]
                    : null
        });
    }

    if (key !== "rerender") {
        pageRuntime.operation(
            "mathjax-pass",
            "started",
            {
                generation:
                    generation,
                passType:
                    key,
                signal:
                    message &&
                    message[0]
                        ? message[0]
                        : null,
                newMathMessagesAtStart:
                    pass.newMathMessagesAtStart,
                answerConnectionAttemptsAtStart:
                    pass
                        .answerConnectionAttemptsAtStart,
                uniqueAnswersAtStart:
                    pass.uniqueAnswersAtStart
            }
        );
    }
}

function endMathJaxPass(passType, message) {
    var key =
        mathJaxPassKey(passType);
    var pass =
        mathJaxPassRuntime.active[key];
    var completedAtMilliseconds =
        Date.now();

    if (!pass) {
        mathJaxPassRuntime.orphanEnds += 1;

        pageRuntime.operation(
            "mathjax-pass",
            "ended-without-start",
            {
                passType:
                    key,
                signal:
                    message &&
                    message[0]
                        ? message[0]
                        : null,
                orphanEnds:
                    mathJaxPassRuntime
                        .orphanEnds
            }
        );

        return;
    }

    delete mathJaxPassRuntime.active[key];

    pass.completedAtMilliseconds =
        completedAtMilliseconds;
    pass.durationMilliseconds =
        completedAtMilliseconds -
        pass.startedAtMilliseconds;
    pass.newMathMessages =
        mathAnswerRuntime.newMathMessages -
        pass.newMathMessagesAtStart;
    pass.discoveredAnswerInstances =
        mathAnswerRuntime.discoveredInstances -
        pass.discoveredAnswerInstancesAtStart;
    pass.answerConnectionAttempts =
        mathAnswerRuntime.connectionAttempts -
        pass.answerConnectionAttemptsAtStart;
    pass.missingAnswerModels =
        mathAnswerRuntime.missingAnswerModels -
        pass.missingAnswerModelsAtStart;
    pass.uniqueAnswersAdded =
        Object.keys(
            mathAnswerRuntime
                .connectedAnswerIds
        ).length -
        pass.uniqueAnswersAtStart;

    mathJaxPassRuntime.completed.push(pass);

    if (mathJaxPassRuntime.completed.length > 50) {
        mathJaxPassRuntime.completed.shift();
    }

    if (
        pass.passType === "process" &&
        !initialMathAnswerRuntime.processComplete
    ) {
        /*
         * Only the first completed MathJax Process defines the initial answer
         * and inline-Sage manifests. Later full Process passes may repair an
         * unresolved registered answer through New Math, but must not replace
         * the original generation metadata or emit another initial terminal
         * event merely because the page was processed again.
         */
        initialMathAnswerRuntime.processComplete =
            true;
        initialMathAnswerRuntime.generation =
            pass.generation;
        initialMathAnswerRuntime
            .processDurationMilliseconds =
            pass.durationMilliseconds;

        reportInitialMathAnswerReadiness();
        completeInitialInlineSageDiscovery();

        var initialAnswerDetails =
            initialMathAnswerDetails();
        var inlineSageDetails =
            initialInlineSageDetails();

        var initialMathJaxCompletionAccepted =
            pageRuntime.completeInitialMathJaxProcess({
            generation:
                pass.generation,
            passType:
                pass.passType,
            durationMilliseconds:
                pass.durationMilliseconds,

            /*
             * Preserve the existing flat pass counters for compatibility while
             * also exposing an explicit pass summary beside the richer
             * answer-readiness and inline-Sage discovery summaries.
             */
            newMathMessages:
                pass.newMathMessages,
            discoveredAnswerInstances:
                pass.discoveredAnswerInstances,
            answerConnectionAttempts:
                pass.answerConnectionAttempts,
            missingAnswerModels:
                pass.missingAnswerModels,
            uniqueAnswersAdded:
                pass.uniqueAnswersAdded,

            pass: {
                newMathMessages:
                    pass.newMathMessages,
                discoveredAnswerInstances:
                    pass.discoveredAnswerInstances,
                answerConnectionAttempts:
                    pass.answerConnectionAttempts,
                missingAnswerModels:
                    pass.missingAnswerModels,
                uniqueAnswersAdded:
                    pass.uniqueAnswersAdded
            },

            answers:
                initialAnswerDetails,
            inlineSage:
                inlineSageDetails
        });

        if (initialMathJaxCompletionAccepted) {
            var initialMathJaxTask =
                pageRuntime
                    .inspectCoordinator()
                    .tasks[
                        "mathjax-initial-process"
                    ];

            if (
                initialMathJaxTask &&
                initialMathJaxTask.state ===
                    "failed"
            ) {
                activateInitialMathJaxInteractionBlock({
                    generation:
                        pass.generation,
                    errorCount:
                        initialMathJaxTask.result
                            .errorCount,
                    policy:
                        "block-math-dependent-interaction-until-reload"
                });
            }
        }
    }

    if (pass.passType === "rerender") {
        var rerenderSummary =
            mathJaxPassRuntime.rerenderSummary;

        rerenderSummary.passCount += 1;
        rerenderSummary.totalDurationMilliseconds +=
            pass.durationMilliseconds;
        rerenderSummary.maximumDurationMilliseconds =
            Math.max(
                rerenderSummary
                    .maximumDurationMilliseconds,
                pass.durationMilliseconds
            );
        rerenderSummary.newMathMessages +=
            pass.newMathMessages;
        rerenderSummary.answerConnectionAttempts +=
            pass.answerConnectionAttempts;
        rerenderSummary.uniqueAnswersAdded +=
            pass.uniqueAnswersAdded;

        if (rerenderSummary.firstGeneration === null) {
            rerenderSummary.firstGeneration =
                pass.generation;
        }

        rerenderSummary.latestGeneration =
            pass.generation;

        pageRuntime.component(
            "mathjax-rerenders",
            "observed",
            {
                passCount:
                    rerenderSummary.passCount,
                totalDurationMilliseconds:
                    rerenderSummary
                        .totalDurationMilliseconds,
                maximumDurationMilliseconds:
                    rerenderSummary
                        .maximumDurationMilliseconds,
                newMathMessages:
                    rerenderSummary.newMathMessages,
                answerConnectionAttempts:
                    rerenderSummary
                        .answerConnectionAttempts,
                uniqueAnswersAdded:
                    rerenderSummary
                        .uniqueAnswersAdded,
                firstGeneration:
                    rerenderSummary.firstGeneration,
                latestGeneration:
                    rerenderSummary.latestGeneration
            }
        );

        return;
    }

    pageRuntime.operation(
        "mathjax-pass",
        "ended",
        {
            generation:
                pass.generation,
            passType:
                pass.passType,
            signal:
                message &&
                message[0]
                    ? message[0]
                    : null,
            durationMilliseconds:
                pass.durationMilliseconds,
            newMathMessages:
                pass.newMathMessages,
            discoveredAnswerInstances:
                pass.discoveredAnswerInstances,
            answerConnectionAttempts:
                pass.answerConnectionAttempts,
            missingAnswerModels:
                pass.missingAnswerModels,
            uniqueAnswersAdded:
                pass.uniqueAnswersAdded,
            completedPasses:
                mathJaxPassRuntime
                    .completed.length
        }
    );

    pageRuntime.component(
        "mathjax-passes",
        "completed",
        {
            latestGeneration:
                pass.generation,
            latestPassType:
                pass.passType,
            latestDurationMilliseconds:
                pass.durationMilliseconds,
            completedPasses:
                mathJaxPassRuntime
                    .completed.length,
            rerenderPasses:
                mathJaxPassRuntime
                    .rerenderSummary
                    .passCount,
            activePassTypes:
                Object.keys(
                    mathJaxPassRuntime.active
                ),
            orphanEnds:
                mathJaxPassRuntime
                    .orphanEnds
        }
    );
}

MathJax.Hub.signal.Interest(function(message) {
    var signalName =
        message && message[0]
            ? message[0]
            : null;
    var beginMatch;
    var endMatch;

    if (typeof signalName === "string") {
        beginMatch =
            signalName.match(
                /^Begin (Process|Reprocess|Rerender)$/
            );

        endMatch =
            signalName.match(
                /^End (Process|Reprocess|Rerender)$/
            );

        if (beginMatch) {
            beginMathJaxPass(
                beginMatch[1],
                message
            );
        } else if (endMatch) {
            endMathJaxPass(
                endMatch[1],
                message
            );
        }
    }

    if (message[0] == "New Math") {
	var id = message[1];
        var batchConnected = 0;
        var batchFailed = 0;
        var batchDiscovered;
        var initialProcessActive =
            !!mathJaxPassRuntime.active.process;

        mathAnswerRuntime.newMathMessages += 1;

	if (answerIdBindings[id] === undefined) {
	    answerIdBindings[id] = {};
	}

	var element = $('#' + id + "-Frame");
	var jax = MathJax.Hub.getAllJax(id);
        var answers = $(".mathjaxed-input", element);

        batchDiscovered = answers.length;
        mathAnswerRuntime.discoveredInstances +=
            batchDiscovered;

        if (batchDiscovered === 0) {
            mathAnswerRuntime.zeroAnswerBatches += 1;
            return;
        }

        pageRuntime.operation(
            "math-answer-connection",
            "batch-started",
            {
                batch: mathAnswerRuntime.newMathMessages,
                discovered: batchDiscovered,
                jaxAvailable:
                    jax.length > 0
            }
        );

	var internalCount = 0;

	answers.each( function() {
	    var result = $(this);

	    if (answerIdBindings[id][internalCount] === undefined) {
		// Number the answer boxes in order
		var problem = result.parents( ".problem-environment" ).first();
		var count = problem.attr( "data-answer-count" );
		if (typeof count === typeof undefined || count === false) {
		    count = 0;
		}

		problem.attr( "data-answer-count", parseInt(count) + 1 );
		var problemIdentifier = problem.attr( "id" );

		// Store the answer index as an id
		answerIdBindings[id][internalCount] = "answer" + count + problemIdentifier;
	    }

	    result.attr('id', answerIdBindings[id][internalCount] );
	    internalCount = internalCount + 1;

            var stableAnswerId =
                result.attr("id");
	    var answerDom = result.closest('.semantics').prev('.mpadded').find('.mphantom').first();
            var answerDomId =
                answerDom.attr('id');
            var answerId =
                answerDomId
                    ? parseInt(
                        answerDomId.replace(
                            'MathJax-Span-',
                            ''
                        )
                    )
                    : null;
            var answer =
                jax.length > 0 &&
                jax[0] &&
                jax[0].root &&
                answerId !== null &&
                !isNaN(answerId)
                    ? searchJax(
                        jax[0].root,
                        answerId
                    )
                    : null;

            if (initialProcessActive)
                initialMathAnswerEntry(stableAnswerId);

            /*
             * Development-only one-shot probe for the real initial-answer
             * degraded -> repaired lifecycle. The authored data-id is used only
             * to target a known fixture answer; production identity semantics
             * remain unchanged.
             */
            if (
                mathAnswerInitialFaultController.claim(
                    "missing-answer-model",
                    {
                        initialProcessActive:
                            initialProcessActive,
                        authoredId:
                            result.attr("data-id") ||
                            null,
                        answerId:
                            stableAnswerId,
                        mathJaxInputId:
                            id
                    }
                )
            ) {
                answer = null;
            }

            if (answer === null ||
                answer === undefined) {
                mathAnswerRuntime.connectionAttempts += 1;
                mathAnswerRuntime.missingAnswerModels +=
                    1;
                batchFailed += 1;

                recordInitialMathAnswerAttempt(
                    stableAnswerId,
                    false,
                    false,
                    "missing-answer-model"
                );

                pageRuntime.operation(
                    "math-answer-connection",
                    "model-missing",
                    {
                        answerId: stableAnswerId,
                        mathJaxInputId: id,
                        answerSpanId: answerId
                    }
                );

                return;
            }

            /*
             * Binding an answer installs persistentData() listeners and reads
             * the initial persisted response. That requires DATABASE to have
             * been initialized. fetchData() already provides the exact barrier
             * we need: immediate delivery when loaded, queued delivery before
             * initial state arrives.
             *
             * Only initial-process answers need this startup gate. Later
             * rerenders occur in the ordinary live page lifecycle and retain
             * the existing direct attachment behavior.
             */
            function connectResolvedMathAnswer() {
                var currentResult =
                    $("#" + stableAnswerId);

                if (currentResult.length === 0)
                    currentResult = result;

                if (initialProcessActive) {
                    initialMathAnswerEntry(
                        stableAnswerId
                    ).pendingDatabase = false;
                }

                mathAnswerRuntime.connectionAttempts += 1;

                try {
                    mathAnswer.connectMathAnswer(
                        currentResult,
                        answer
                    );
                } catch (attachmentError) {
                    mathAnswerRuntime.attachmentFailures +=
                        1;

                    recordInitialMathAnswerAttempt(
                        stableAnswerId,
                        true,
                        false,
                        "attachment-exception"
                    );

                    pageRuntime.operation(
                        "math-answer-connection",
                        "attachment-failed",
                        {
                            answerId: stableAnswerId,
                            mathJaxInputId: id,
                            errorName:
                                attachmentError &&
                                attachmentError.name
                                    ? attachmentError.name
                                    : null,
                            errorMessage:
                                attachmentError &&
                                attachmentError.message
                                    ? attachmentError.message
                                    : String(
                                        attachmentError
                                    )
                        }
                    );

                    return false;
                }

                mathAnswerRuntime.connectedAnswerIds[
                    stableAnswerId
                ] = true;

                recordInitialMathAnswerAttempt(
                    stableAnswerId,
                    true,
                    true,
                    null
                );

                return true;
            }

            if (initialProcessActive) {
                var initialEntry =
                    initialMathAnswerEntry(
                        stableAnswerId
                    );

                initialEntry.modelResolved = true;
                initialEntry.pendingDatabase = true;

                result.fetchData(
                    function() {
                        var connected =
                            connectResolvedMathAnswer();

                        pageRuntime.operation(
                            "math-answer-connection",
                            connected
                                ? "database-gated-attached"
                                : "database-gated-attachment-failed",
                            {
                                answerId:
                                    stableAnswerId,
                                mathJaxInputId:
                                    id
                            }
                        );
                    },
                    "math-answer:" +
                        stableAnswerId
                );

                /*
                 * fetchData() invokes synchronously when DATABASE is already
                 * available. Reflect that immediate result in the current
                 * MathJax batch counters, but do not classify a queued database
                 * wait as an attachment failure.
                 */
                if (initialEntry.attachedAtLeastOnce) {
                    batchConnected += 1;
                } else if (
                    !initialEntry.pendingDatabase &&
                    initialEntry.latestFailure
                ) {
                    batchFailed += 1;
                }

                return;
            }

            if (connectResolvedMathAnswer()) {
                batchConnected += 1;
            } else {
                batchFailed += 1;
            }
	});

        pageRuntime.operation(
            "math-answer-connection",
            "batch-completed",
            {
                batch: mathAnswerRuntime.newMathMessages,
                discovered: batchDiscovered,
                connected: batchConnected,
                failed: batchFailed,
                totalConnectionAttempts:
                    mathAnswerRuntime.connectionAttempts,
                uniqueConnected:
                    Object.keys(
                        mathAnswerRuntime
                            .connectedAnswerIds
                    ).length,
                missingAnswerModels:
                    mathAnswerRuntime
                        .missingAnswerModels,
                attachmentFailures:
                    mathAnswerRuntime
                        .attachmentFailures,
                zeroAnswerBatches:
                    mathAnswerRuntime
                        .zeroAnswerBatches
            }
        );

        if (batchDiscovered > 0) {
            pageRuntime.component(
                "math-answers",
                "connected",
                {
                    latestBatchDiscovered:
                        batchDiscovered,
                    latestBatchConnected:
                        batchConnected,
                    latestBatchFailed:
                        batchFailed,
                    uniqueConnected:
                        Object.keys(
                            mathAnswerRuntime
                                .connectedAnswerIds
                        ).length,
                    totalConnectionAttempts:
                        mathAnswerRuntime
                            .connectionAttempts,
                    missingAnswerModels:
                        mathAnswerRuntime
                            .missingAnswerModels,
                    attachmentFailures:
                        mathAnswerRuntime
                            .attachmentFailures,
                    zeroAnswerBatches:
                        mathAnswerRuntime
                            .zeroAnswerBatches
                }
            );
        }
    }
});


pageRuntime.service(
    "mathjax",
    "configured"
);

MathJax.Hub.Configured();

$(document).ready(function() {
    pageRuntime.event("document-ready-started");

    var documentReadyReferencesRequested =
        documentReadyReferencesOwnerConfigured &&
        pageRuntime
            .requestDocumentReadyReferences(
                {
                    documentReady:
                        true,
                    requestLocation:
                        "main-document-ready"
                }
            );

    if (!documentReadyReferencesRequested) {
        pageRuntime.event(
            "document-ready-references-legacy-fallback",
            {
                reason:
                    documentReadyReferencesOwnerConfigured
                        ? "coordinator-request-rejected"
                        : "coordinator-owner-not-configured"
            }
        );

        invokeDocumentReadyReferences(
            "legacy-fallback"
        );
    }

	// This could go in "init" above, but it needs to be after the end process hook
    /*
     * Capture the complete author-delivered activity source before MathJax
     * parsing and saved-answer restoration modify or replace source nodes.
     */
    sagemath.captureInitialSagePageManifestSnapshot();

    sagemath.annotateInitialSagePageSourceStableIds();

    var mathJaxStartupRequested =
        mathJaxStartupOwnerConfigured &&
        pageRuntime.requestMathJaxStartup(
            {
                requestLocation:
                    "document-ready-after-sage-manifest",
                documentReady:
                    true
            }
        );

    if (!mathJaxStartupRequested) {
        pageRuntime.event(
            "mathjax-startup-legacy-fallback",
            {
                reason:
                    mathJaxStartupOwnerConfigured
                        ? "coordinator-request-rejected"
                        : "coordinator-owner-not-configured"
            }
        );

        invokeMathJaxStartup(
            "legacy-fallback"
        );
    }

    var documentReadyStaticUiRequested =
        documentReadyStaticUiOwnerConfigured &&
        pageRuntime.requestDocumentReadyStaticUi(
            {
                documentReady: true,
                requestLocation:
                    "main-document-ready"
            }
        );

    if (!documentReadyStaticUiRequested) {
        pageRuntime.event(
            "document-ready-static-ui-legacy-fallback",
            {
                reason:
                    documentReadyStaticUiOwnerConfigured
                        ? "coordinator-request-rejected"
                        : "coordinator-owner-not-configured"
            }
        );

        invokeDocumentReadyStaticUi(
            "legacy-fallback"
        );
    }

    var documentReadyKineticNavigationRequested =
        documentReadyKineticNavigationOwnerConfigured &&
        pageRuntime
            .requestDocumentReadyKineticNavigation(
                {
                    documentReady: true,
                    requestLocation:
                        "main-document-ready"
                }
            );

    if (!documentReadyKineticNavigationRequested) {
        pageRuntime.event(
            "document-ready-kinetic-navigation-legacy-fallback",
            {
                reason:
                    documentReadyKineticNavigationOwnerConfigured
                        ? "coordinator-request-rejected"
                        : "coordinator-owner-not-configured"
            }
        );

        invokeDocumentReadyKineticNavigation(
            "legacy-fallback"
        );
    }

    var bootstrapUiResult =
        bootstrapUi.install(
            document
        );

    pageRuntime.operation(
        "document-ready-bootstrap-ui",
        "completed",
        bootstrapUiResult
    );

    pageRuntimeSupportUi.install(
        pageRuntime,
        $
    );

    var activityBootstrapRequested =
        activityBootstrapOwnerConfigured &&
        pageRuntime.requestActivityBootstrap(
            {
                activityCount:
                    $(".activity").length,
                documentReady:
                    true
            }
        );

    if (!activityBootstrapRequested) {
        pageRuntime.event(
            "activity-bootstrap-legacy-fallback",
            {
                reason:
                    activityBootstrapOwnerConfigured
                        ? "coordinator-request-rejected"
                        : "coordinator-owner-not-configured",
                activityCount:
                    $(".activity").length
            }
        );

        invokeActivityBootstrap(
            "legacy-fallback"
        );
    }

    pageRuntime.event("document-ready-completed");
});

pageRuntime.event("bundle-evaluation-completed");

console.log("done.");

