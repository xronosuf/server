'use strict';

var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '../..');

function replaceOnce(source, before, after, label) {
    var first = source.indexOf(before);
    var second = first === -1 ? -1 : source.indexOf(before, first + 1);

    if (first === -1) {
        throw new Error('Could not find expected ' + label + ' block.');
    }

    if (second !== -1) {
        throw new Error('Expected exactly one ' + label + ' block.');
    }

    return source.slice(0, first) + after + source.slice(first + before.length);
}

function countOccurrences(source, needle) {
    var count = 0;
    var position = 0;

    while (true) {
        position = source.indexOf(needle, position);
        if (position === -1) {
            return count;
        }
        count += 1;
        position += needle.length;
    }
}

function patchApp(source) {
    var importNeedle = "gradeSyncRecovery = require('./routes/grade-sync-recovery')";
    var routeNeedle = "app.post( '/:repository/:path(*)/grade-sync-recovery'";

    if (source.indexOf(importNeedle) === -1) {
        source = replaceOnce(
            source,
            "  , gradebook = require('./routes/gradebook')\n",
            "  , gradebook = require('./routes/gradebook')\n" +
            "  , gradeSyncRecovery = require('./routes/grade-sync-recovery')\n",
            'grade sync recovery route import'
        );
    }

    if (source.indexOf(routeNeedle) === -1) {
        source = replaceOnce(
            source,
            "    app.get( '/:repository/:path(*)/gradebook',\n" +
            "     repositories.normalizeName,\n" +
            "     gradebook.record );\n" +
            "    app.put( '/:repository/:path(*)/gradebook',\n" +
            "     repositories.normalizeName,\n" +
            "     gradebook.record );",
            "    app.get( '/:repository/:path(*)/gradebook',\n" +
            "     repositories.normalizeName,\n" +
            "     gradebook.record );\n" +
            "    app.put( '/:repository/:path(*)/gradebook',\n" +
            "     repositories.normalizeName,\n" +
            "     gradebook.record );\n" +
            "    app.post( '/:repository/:path(*)/grade-sync-recovery',\n" +
            "     repositories.normalizeName,\n" +
            "     gradeSyncRecovery.recordAndRecheck );",
            'grade sync recovery route'
        );
    }

    if (countOccurrences(source, importNeedle) !== 1) {
        throw new Error('Expected exactly one grade sync recovery import.');
    }

    if (countOccurrences(source, routeNeedle) !== 1) {
        throw new Error('Expected exactly one grade sync recovery route.');
    }

    return source;
}

function recoveryRequestHelper() {
    return [
        "function xronosRequestGradeSyncRecovery(action, callback) {",
        "    var xourseUrl = $('main').attr('data-xourse-url');",
        "",
        "    if (!xourseUrl) {",
        "        callback(new Error('Missing xourse URL for grade sync recovery.'));",
        "        return;",
        "    }",
        "",
        "    $.ajax({",
        "        url: window.toValidPath('/' + xourseUrl + '/grade-sync-recovery'),",
        "        type: 'POST',",
        "        data: JSON.stringify({action: action}),",
        "        contentType: 'application/json',",
        "        success: function(result) {",
        "            callback(null, result);",
        "        },",
        "        error: function(jqXHR, err, exception) {",
        "            callback(new Error(",
        "                'Grade sync recovery request failed: ' +",
        "                (exception || err || (jqXHR && jqXHR.status) || 'unknown')",
        "            ));",
        "        }",
        "    });",
        "}",
        "",
        "function xronosRememberGradeSyncRecovery(recovery) {",
        "    if (!recovery || typeof recovery !== 'object') {",
        "        return;",
        "    }",
        "",
        "    xronosGradeSyncRecoveries.unshift(recovery);",
        "    xronosGradeSyncRecoveries = xronosGradeSyncRecoveries.slice(",
        "        0,",
        "        gradeSyncSupportReport.MAX_RECOVERY_EVENTS",
        "    );",
        "}",
        "",
        ""
    ].join('\n');
}

function recoveryModalBlock() {
    return [
        "    if (recovery.kind !== 'none') {",
        "        body.append(",
        "            $('<h5/>').text(recovery.title),",
        "            $('<p/>').text(recovery.message)",
        "        );",
        "",
        "        recoveryStatus = $('<p/>', {",
        "            'class': 'help-block',",
        "            role: 'status',",
        "            'aria-live': 'polite'",
        "        });",
        "",
        "        if (recovery.kind === 'recheck-status') {",
        "            recoveryButton = $('<button/>', {",
        "                type: 'button',",
        "                'class': 'btn btn-default btn-sm'",
        "            }).text('Recheck grade sync');",
        "",
        "            recoveryButton.on('click', function(event) {",
        "                event.preventDefault();",
        "                recoveryButton.prop('disabled', true).text('Checking...');",
        "",
        "                xronosRequestGradeSyncRecovery(",
        "                    'recheck-status',",
        "                    function(err, result) {",
        "                        recoveryButton.prop('disabled', false).text('Recheck grade sync');",
        "",
        "                        if (err || !result || !result.ok) {",
        "                            recoveryStatus.text(",
        "                                'Xronos could not recheck the grade-sync connection. You can still generate a diagnostic report below.'",
        "                            );",
        "                            return;",
        "                        }",
        "",
        "                        xronosRememberGradeSyncRecovery(result.recovery);",
        "                        xronosLatestGradeSyncDiagnostics =",
        "                            result.gradeSyncDiagnostics || null;",
        "                        xronosUpdateGradeSyncStatus(result.gradeSync || null);",
        "",
        "                        recoveryStatus.text(",
        "                            'Grade sync rechecked: ' +",
        "                            gradeSyncPresentation.presentation(result.gradeSync).label +",
        "                            '.'",
        "                        );",
        "                    }",
        "                );",
        "            });",
        "",
        "            body.append($('<p/>').append(recoveryButton));",
        "        } else if (recovery.kind === 'relaunch-from-canvas') {",
        "            recoveryButton = $('<button/>', {",
        "                type: 'button',",
        "                'class': 'btn btn-default btn-sm'",
        "            }).text('Show Canvas reconnect steps');",
        "",
        "            recoveryButton.on('click', function(event) {",
        "                event.preventDefault();",
        "                recoveryButton.prop('disabled', true);",
        "",
        "                xronosRequestGradeSyncRecovery(",
        "                    'view-canvas-relaunch-guidance',",
        "                    function(err, result) {",
        "                        recoveryButton.prop('disabled', false);",
        "",
        "                        if (result && result.ok) {",
        "                            xronosRememberGradeSyncRecovery(result.recovery);",
        "                            xronosLatestGradeSyncDiagnostics =",
        "                                result.gradeSyncDiagnostics || null;",
        "                            xronosUpdateGradeSyncStatus(result.gradeSync || null);",
        "                        }",
        "",
        "                        recoveryStatus.text(",
        "                            'Return to Canvas, open this exact assignment from its Canvas link, and use the Xronos page opened by that launch. Refreshing only this existing Xronos page does not create a new Canvas assignment launch.' +",
        "                            (err ? ' If the problem continues, generate the diagnostic report below.' : '')",
        "                        );",
        "                    }",
        "                );",
        "            });",
        "",
        "            body.append($('<p/>').append(recoveryButton));",
        "        }",
        "",
        "        body.append(recoveryStatus);",
        "    }",
        "",
        ""
    ].join('\n');
}

function patchGradebook(source) {
    var importNeedle =
        "var gradeSyncRecoveryPolicy = require('./grade-sync-recovery-policy');";
    var helperNeedle = 'function xronosRequestGradeSyncRecovery(action, callback) {';
    var rememberNeedle = 'function xronosRememberGradeSyncRecovery(recovery) {';
    var recoveryNeedle = "if (recovery.kind !== 'none') {";
    var historyNeedle = 'var xronosGradeSyncRecoveries = [];';
    var reportHistoryNeedle = 'recoveries: xronosGradeSyncRecoveries,';

    if (source.indexOf(importNeedle) === -1) {
        source = replaceOnce(
            source,
            "var gradeSyncSupportReport = require('./grade-sync-support-report');\n",
            "var gradeSyncSupportReport = require('./grade-sync-support-report');\n" +
            importNeedle + "\n",
            'grade sync recovery policy import'
        );
    }

    if (source.indexOf(historyNeedle) === -1) {
        source = replaceOnce(
            source,
            'var xronosLatestGradeSyncDiagnostics = null;\n',
            'var xronosLatestGradeSyncDiagnostics = null;\n' +
            historyNeedle + '\n',
            'grade sync recovery history state'
        );
    }

    if (source.indexOf(helperNeedle) === -1) {
        source = replaceOnce(
            source,
            'function xronosShowGradeSyncHelp(indicator, checking) {',
            recoveryRequestHelper() +
            'function xronosShowGradeSyncHelp(indicator, checking) {',
            'grade sync recovery request helper'
        );
    }

    if (source.indexOf('    var recovery;\n') === -1) {
        source = replaceOnce(
            source,
            "    var reportPreview;\n    var state = xronosLatestGradeSync;",
            "    var reportPreview;\n" +
            "    var recovery;\n" +
            "    var recoveryButton;\n" +
            "    var recoveryStatus;\n" +
            "    var state = xronosLatestGradeSync;",
            'grade sync recovery modal variables'
        );
    }

    if (source.indexOf(
        '    recovery = gradeSyncRecoveryPolicy.recovery('
    ) === -1) {
        source = replaceOnce(
            source,
            '    rendered = gradeSyncPresentation.presentation(state);',
            '    rendered = gradeSyncPresentation.presentation(state);\n' +
            '    recovery = gradeSyncRecoveryPolicy.recovery(\n' +
            '        state,\n' +
            '        xronosLatestGradeSyncDiagnostics\n' +
            '    );',
            'grade sync recovery classification'
        );
    }

    if (source.indexOf(recoveryNeedle) === -1) {
        source = replaceOnce(
            source,
            "    body.append(\n" +
            "        $('<p/>').text(\n" +
            "            xronosSupportContactLead(window.xronosSupportEmail)\n" +
            "        )\n" +
            "    );",
            recoveryModalBlock() +
            "    body.append(\n" +
            "        $('<p/>').text(\n" +
            "            xronosSupportContactLead(window.xronosSupportEmail)\n" +
            "        )\n" +
            "    );",
            'grade sync recovery modal controls'
        );
    }

    if (source.indexOf(reportHistoryNeedle) === -1) {
        source = replaceOnce(
            source,
            '            gradeSyncDiagnostics: xronosLatestGradeSyncDiagnostics,\n' +
            '            environment: xronosCurrentBrowserEnvironment()',
            '            gradeSyncDiagnostics: xronosLatestGradeSyncDiagnostics,\n' +
            '            recoveries: xronosGradeSyncRecoveries,\n' +
            '            environment: xronosCurrentBrowserEnvironment()',
            'grade sync recovery support-report context'
        );
    }

    if (countOccurrences(source, importNeedle) !== 1) {
        throw new Error('Expected exactly one grade sync recovery policy import.');
    }
    if (countOccurrences(source, helperNeedle) !== 1) {
        throw new Error('Expected exactly one grade sync recovery request helper.');
    }
    if (countOccurrences(source, rememberNeedle) !== 1) {
        throw new Error('Expected exactly one grade sync recovery history helper.');
    }
    if (countOccurrences(source, recoveryNeedle) !== 1) {
        throw new Error('Expected exactly one grade sync recovery modal block.');
    }
    if (countOccurrences(source, historyNeedle) !== 1) {
        throw new Error('Expected exactly one grade sync recovery history state.');
    }
    if (countOccurrences(source, reportHistoryNeedle) !== 1) {
        throw new Error('Expected exactly one grade sync recovery report context.');
    }

    return source;
}

function patchFile(relativePath, patcher) {
    var filename = path.join(root, relativePath);
    var original = fs.readFileSync(filename, 'utf8');
    var updated = patcher(original);

    if (updated === original) {
        console.log('Already integrated ' + relativePath);
        return;
    }

    fs.writeFileSync(filename, updated, 'utf8');
    console.log('Patched ' + relativePath);
}

exports.countOccurrences = countOccurrences;
exports.patchApp = patchApp;
exports.patchGradebook = patchGradebook;
exports.replaceOnce = replaceOnce;

if (require.main === module) {
    patchFile('app.js', patchApp);
    patchFile('public/javascripts/gradebook.js', patchGradebook);
    console.log('GRADE SYNC RECOVERY INTEGRATION PATCH APPLIED');
}
