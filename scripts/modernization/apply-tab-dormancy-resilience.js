'use strict';

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..', '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function write(relativePath, source) {
    fs.writeFileSync(path.join(root, relativePath), source);
}

function replaceOnce(source, before, after, label) {
    var first = source.indexOf(before);
    if (first < 0) throw new Error('Missing patch anchor: ' + label);
    if (source.indexOf(before, first + before.length) >= 0) {
        throw new Error('Patch anchor is not unique: ' + label);
    }
    return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceCount(source, before, after, expected, label) {
    var count = source.split(before).length - 1;
    if (count !== expected) {
        throw new Error(label + ': expected ' + expected + ' matches, found ' + count);
    }
    return source.split(before).join(after);
}

function patchPageRuntime() {
    var file = 'public/javascripts/page-runtime.js';
    var source = read(file);

    if (source.indexOf('visibilityDeadline') >= 0) return;

    source = replaceOnce(
        source,
        'var supportPolicy = require(\n    "./page-runtime-support-policy"\n);\n',
        'var supportPolicy = require(\n    "./page-runtime-support-policy"\n);\nvar visibilityDeadline =\n    require("./visibility-deadline")\n        .create(window, document);\n',
        'page-runtime visibility require'
    );

    source = replaceCount(
        source,
        'watchdog.timer =\n        window.setTimeout(',
        'watchdog.timer =\n        visibilityDeadline.setTimeout(',
        3,
        'page-runtime watchdog timers'
    );

    source = replaceOnce(
        source,
        'window.clearTimeout(\n            readinessWatchdogs.initialState\n                .timer\n        );',
        'visibilityDeadline.clearTimeout(\n            readinessWatchdogs.initialState\n                .timer\n        );',
        'initial-state watchdog clear'
    );
    source = replaceOnce(
        source,
        'window.clearTimeout(\n                initialMathJaxWatchdog.timer\n            );',
        'visibilityDeadline.clearTimeout(\n                initialMathJaxWatchdog.timer\n            );',
        'mathjax watchdog clear'
    );
    source = replaceOnce(
        source,
        'window.clearTimeout(\n                initialInlineSageWatchdog.timer\n            );',
        'visibilityDeadline.clearTimeout(\n                initialInlineSageWatchdog.timer\n            );',
        'sage watchdog clear'
    );
    source = replaceOnce(
        source,
        'window.clearTimeout(\n            watchdog.timer\n        );',
        'visibilityDeadline.clearTimeout(\n            watchdog.timer\n        );',
        'sage retry watchdog clear'
    );

    write(file, source);
}

function patchSage() {
    var file = 'public/javascripts/sagemath.js';
    var source = read(file);

    if (source.indexOf('sageVisibilityDeadline') >= 0) return;

    source = replaceOnce(
        source,
        "var pageRuntime = require('./page-runtime');\n",
        "var pageRuntime = require('./page-runtime');\nvar sageVisibilityDeadline =\n    require('./visibility-deadline')\n        .create(window, document);\n",
        'sage visibility require'
    );

    source = replaceOnce(
        source,
        '            data: sageRequestAuthData(),\n            dataType: "json",\n            timeout: 15000\n        }).done(function(response) {',
        '            data: sageRequestAuthData(),\n            dataType: "json",\n            timeout: 0,\n            beforeSend: function(jqXHR) {\n                var timeoutHandle =\n                    sageVisibilityDeadline.setTimeout(\n                        function() {\n                            jqXHR.abort("timeout");\n                        },\n                        15000\n                    );\n\n                jqXHR.always(function() {\n                    sageVisibilityDeadline.clearTimeout(\n                        timeoutHandle\n                    );\n                });\n            }\n        }).done(function(response) {',
        'sage request timeout'
    );

    write(file, source);
}

function patchGradebook() {
    var file = 'public/javascripts/gradebook.js';
    var source = read(file);

    if (source.indexOf('xronosGradeSyncWasHidden') >= 0) return;

    source = replaceOnce(
        source,
        "var gradeSyncRecoveryPolicy = require('./grade-sync-recovery-policy');\n",
        "var gradeSyncRecoveryPolicy = require('./grade-sync-recovery-policy');\nvar tabDormancyPolicy = require('./tab-dormancy-policy');\n",
        'gradebook dormancy require'
    );

    source = replaceOnce(
        source,
        'var xronosGradeSyncRecoveries = [];\n',
        'var xronosGradeSyncRecoveries = [];\nvar xronosGradeSyncWasHidden = false;\nvar xronosGradeSyncLastVisibleAt = null;\n\nfunction xronosDocumentHidden() {\n    return !!(\n        typeof document !== "undefined" &&\n        (\n            document.hidden === true ||\n            document.visibilityState === "hidden"\n        )\n    );\n}\n\nfunction xronosGradeSyncFailureIsDormancyAdjacent() {\n    return tabDormancyPolicy.shouldDeferFailure({\n        hidden: xronosDocumentHidden(),\n        lastVisibleAt: xronosGradeSyncLastVisibleAt,\n        now: Date.now()\n    });\n}\n\nfunction xronosScheduleGradeSyncRecheckAfterResume() {\n    var delay = tabDormancyPolicy.retryDelay({\n        hidden: xronosDocumentHidden(),\n        lastVisibleAt: xronosGradeSyncLastVisibleAt,\n        now: Date.now()\n    });\n\n    if (delay === null) return;\n\n    window.setTimeout(function() {\n        if ($("main").attr("data-xourse-url")) {\n            exports.update();\n        }\n    }, Math.max(250, delay));\n}\n\nif (\n    typeof document !== "undefined" &&\n    typeof document.addEventListener === "function"\n) {\n    document.addEventListener("visibilitychange", function() {\n        if (xronosDocumentHidden()) {\n            xronosGradeSyncWasHidden = true;\n            return;\n        }\n\n        if (!xronosGradeSyncWasHidden) return;\n\n        xronosGradeSyncWasHidden = false;\n        xronosGradeSyncLastVisibleAt = Date.now();\n        xronosScheduleGradeSyncRecheckAfterResume();\n    });\n}\n',
        'gradebook visibility state'
    );

    source = replaceOnce(
        source,
        "            xronosLatestGradeSyncDiagnostics = null;\n\t    xronosUpdateGradeSyncStatus({state: 'error'});\n\t    $(\".progress.completion-meter\").attr('title', 'Could not submit grade.' );\n\t    $('.progress-bar', \".progress.completion-meter\").removeClass( 'bg-success' );\n\t    $('.progress-bar', \".progress.completion-meter\").addClass( 'bg-danger' );\n\t    window.setTimeout( exports.update, 1000 );",
        "            if (xronosGradeSyncFailureIsDormancyAdjacent()) {\n                debugLog.log(\n                    'Deferred grade-sync transport failure after tab dormancy; a fresh foreground check will decide status.'\n                );\n                $(\".progress.completion-meter\").attr(\n                    'title',\n                    'Rechecking grade sync after this tab resumes.'\n                );\n                xronosScheduleGradeSyncRecheckAfterResume();\n                return;\n            }\n\n            xronosLatestGradeSyncDiagnostics = null;\n\t    xronosUpdateGradeSyncStatus({state: 'error'});\n\t    $(\".progress.completion-meter\").attr('title', 'Could not submit grade.' );\n\t    $('.progress-bar', \".progress.completion-meter\").removeClass( 'bg-success' );\n\t    $('.progress-bar', \".progress.completion-meter\").addClass( 'bg-danger' );\n\t    window.setTimeout( exports.update, 1000 );",
        'gradebook ajax error policy'
    );

    write(file, source);
}

patchPageRuntime();
patchSage();
patchGradebook();
console.log('Applied tab dormancy resilience patches.');
