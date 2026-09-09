#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..', '..');

function countOccurrences(source, needle) {
    return source.split(needle).length - 1;
}

function replaceOnce(source, before, after, label) {
    if (source.indexOf(after) !== -1) {
        return source;
    }

    if (countOccurrences(source, before) !== 1) {
        throw new Error(
            label + ': expected exactly one integration anchor; found ' +
            countOccurrences(source, before)
        );
    }

    return source.replace(before, after);
}

function patchApp(source) {
    var anchor = [
        "    require('./lib/static-asset-routes').install(",
        '        app,',
        '        {',
        '            root: __dirname,',
        '            applicationVersion: app.version',
        '        }',
        '    );',
        '',
        '    // Static requests have already been handled above. Dynamic GET'
    ].join('\n');

    var replacement = [
        "    require('./lib/static-asset-routes').install(",
        '        app,',
        '        {',
        '            root: __dirname,',
        '            applicationVersion: app.version',
        '        }',
        '    );',
        '',
        "    var xronosPageRepair = require('./lib/page-repair');",
        '',
        '    // A one-shot Repair this page request deliberately reaches the',
        '    // dynamic page after static routing has had a chance to serve assets.',
        '    // The response clears only browser cache data, never cookies/storage,',
        '    // and gives rendered versioned assets a unique recovery URL.',
        '    app.use(function(req, res, next) {',
        '        if (req.method === \'GET\') {',
        '            xronosPageRepair.applyRecoveryResponse(',
        '                req,',
        '                res,',
        '                app.locals.versionPath',
        '            );',
        '        }',
        '        next();',
        '    });',
        '',
        '    // Static requests have already been handled above. Dynamic GET'
    ].join('\n');

    return replaceOnce(source, anchor, replacement, 'app.js page repair middleware');
}

function patchLayout(source) {
    var anchor = '    meta(name="xronos-application-version", content=version)\n';
    var replacement = anchor +
        '    meta(name="xronos-repair-token", content=(typeof xronosRepairToken !== "undefined" ? xronosRepairToken : ""))\n';

    return replaceOnce(source, anchor, replacement, 'layout recovery metadata');
}

function patchApplicationVersionPath(source) {
    var oldFunction = [
        'function versionedNodeModulesPath(version, path) {',
        "    var suffix = String(path || '').replace(/^\\/+/, '');",
        '',
        "    return '/node_modules/v' + version + '/' + suffix;",
        '}'
    ].join('\n');

    var newFunction = [
        'function pageRepairToken(documentObject) {',
        '    var element;',
        '    var value;',
        '',
        "    if (!documentObject || typeof documentObject.querySelector !== 'function') {",
        '        return null;',
        '    }',
        '',
        '    element = documentObject.querySelector(',
        "        'meta[name=\"xronos-repair-token\"]'",
        '    );',
        '',
        "    if (!element || typeof element.getAttribute !== 'function') {",
        '        return null;',
        '    }',
        '',
        "    value = element.getAttribute('content');",
        "    return value || null;",
        '}',
        '',
        'function appendRepairToken(url, token) {',
        "    if (!token || typeof url !== 'string' || !url) {",
        '        return url;',
        '    }',
        '',
        '    return url +',
        "        (url.indexOf('?') === -1 ? '?' : '&') +",
        "        'xronosRepair=' + encodeURIComponent(token);",
        '}',
        '',
        'function versionedNodeModulesPath(version, path, repairToken) {',
        "    var suffix = String(path || '').replace(/^\\/+/, '');",
        '',
        '    return appendRepairToken(',
        "        '/node_modules/v' + version + '/' + suffix,",
        '        repairToken',
        '    );',
        '}'
    ].join('\n');

    source = replaceOnce(
        source,
        oldFunction,
        newFunction,
        'application-version-path recovery token'
    );

    var oldExports = [
        '    pageApplicationVersion: pageApplicationVersion,',
        '    versionedNodeModulesPath: versionedNodeModulesPath'
    ].join('\n');

    var newExports = [
        '    pageApplicationVersion: pageApplicationVersion,',
        '    pageRepairToken: pageRepairToken,',
        '    appendRepairToken: appendRepairToken,',
        '    versionedNodeModulesPath: versionedNodeModulesPath'
    ].join('\n');

    return replaceOnce(source, oldExports, newExports, 'application-version-path exports');
}

function patchMathJax(source) {
    var oldCall = [
        '        applicationVersionPath.versionedNodeModulesPath(',
        '            applicationVersion,',
        "            'mathjax/'",
        '        )'
    ].join('\n');

    var newCall = [
        '        applicationVersionPath.versionedNodeModulesPath(',
        '            applicationVersion,',
        "            'mathjax/',",
        '            applicationVersionPath.pageRepairToken(document)',
        '        )'
    ].join('\n');

    return replaceOnce(source, oldCall, newCall, 'MathJax recovery root');
}

function patchSupportReport(source) {
    source = replaceOnce(
        source,
        'var REPORT_SCHEMA_VERSION = 1;',
        'var REPORT_SCHEMA_VERSION = 2;',
        'support report schema version'
    );

    var browserAnchor = 'function browserMetadata(environment) {';
    var repairHelper = [
        'function pageRepairMetadata(value) {',
        "    if (!value || typeof value !== 'object') {",
        '        return null;',
        '    }',
        '',
        '    return {',
        '        token: boundedText(value.token, MAX_SHORT_TEXT),',
        '        requestedAt: boundedText(value.requestedAt, MAX_SHORT_TEXT),',
        '        path: boundedText(value.path, 500)',
        '    };',
        '}',
        '',
        '',
        browserAnchor
    ].join('\n');

    source = replaceOnce(
        source,
        browserAnchor,
        repairHelper,
        'support report page repair metadata helper'
    );

    var buildAnchor = [
        '        browser:',
        '            browserMetadata(',
        '                input.environment',
        '            ),',
        '',
        '        subsystems: {'
    ].join('\n');

    var buildReplacement = [
        '        browser:',
        '            browserMetadata(',
        '                input.environment',
        '            ),',
        '',
        '        pageRepair:',
        '            pageRepairMetadata(',
        '                input.pageRepair',
        '            ),',
        '',
        '        subsystems: {'
    ].join('\n');

    return replaceOnce(source, buildAnchor, buildReplacement, 'support report page repair field');
}

function patchSupportUi(source) {
    var importAnchor = [
        'var supportReport =',
        '    require("./page-runtime-support-report");'
    ].join('\n');

    var importReplacement = importAnchor + '\nvar pageRepair =\n    require("./page-repair");';

    source = replaceOnce(source, importAnchor, importReplacement, 'support UI page repair import');

    source = replaceOnce(
        source,
        '        showSageRetry: false,\n        showHardReloadHelp: false',
        '        showSageRetry: false,\n        showHardReloadHelp: false,\n        showPageRepair: true',
        'support UI repair presentation default'
    );

    var keepOpenOne = [
        '        presentation.recovery =',
        '            "Keep this page open while Xronos reconnects. " +',
        '            "Do not reload while you may have unsaved work.";',
        '        break;'
    ].join('\n');

    source = replaceOnce(
        source,
        keepOpenOne,
        keepOpenOne.replace('        break;', '        presentation.showPageRepair = false;\n        break;'),
        'support UI reconnect repair suppression'
    );

    var keepOpenTwo = [
        '        presentation.recovery =',
        '            "Keep this page open until saving recovers. " +',
        '            "Do not reload while your work may still be unsaved.";',
        '        break;'
    ].join('\n');

    source = replaceOnce(
        source,
        keepOpenTwo,
        keepOpenTwo.replace('        break;', '        presentation.showPageRepair = false;\n        break;'),
        'support UI save-safe repair suppression'
    );

    source = replaceOnce(
        source,
        '            "Try the computations again. If they still fail, " +\n            "hard reload the page.";',
        '            "Try the computations again. If they still fail, " +\n            "use Repair this page.";',
        'support UI Sage repair wording'
    );

    source = source.replace(
        /        presentation\.showHardReloadHelp = true;/g,
        '        presentation.showHardReloadHelp = false;'
    );

    source = replaceOnce(
        source,
        '        presentation.recovery =\n            "Hard reload the page. This is different from an ordinary Refresh.";',
        '        presentation.recovery =\n            "Use Repair this page to reload this activity with fresh Xronos resources.";',
        'support UI hard-reload wording'
    );

    var reportBuildAnchor = [
        '                    path:',
        '                        window.location.pathname,',
        '                    environment:',
        '                        currentBrowserEnvironment()'
    ].join('\n');

    var reportBuildReplacement = [
        '                    path:',
        '                        window.location.pathname,',
        '                    pageRepair:',
        '                        pageRepair.lastRepair(window),',
        '                    environment:',
        '                        currentBrowserEnvironment()'
    ].join('\n');

    source = replaceOnce(source, reportBuildAnchor, reportBuildReplacement, 'support report repair context');

    var reportAnchor = '        var report =\n            $("<button/>", {';
    var repairControl = [
        '        if (presentation.showPageRepair) {',
        '            var repair =',
        '                $("<button/>", {',
        '                    type:',
        '                        "button",',
        '                    "class":',
        '                        "btn btn-primary btn-sm"',
        '                }).text(',
        '                    "Repair this page"',
        '                );',
        '',
        '            repair.on(',
        '                "click",',
        '                function(event) {',
        '                    event.preventDefault();',
        '                    repair',
        '                        .prop("disabled", true)',
        '                        .text("Preparing clean reload...");',
        '',
        '                    pageRepair.repairCurrentPage()',
        '                        .catch(function() {',
        '                            repair',
        '                                .prop("disabled", false)',
        '                                .text("Repair this page");',
        '                        });',
        '                }',
        '            );',
        '',
        '            controls.append(repair);',
        '        }',
        '',
        reportAnchor
    ].join('\n');

    return replaceOnce(source, reportAnchor, repairControl, 'support banner repair button');
}

function patchFile(relativePath, patcher) {
    var filename = path.join(ROOT, relativePath);
    var original = fs.readFileSync(filename, 'utf8');
    var patched = patcher(original);

    if (patched === original) {
        console.log('Already integrated:', relativePath);
        return false;
    }

    fs.writeFileSync(filename, patched);
    console.log('Patched:', relativePath);
    return true;
}

function main() {
    patchFile('app.js', patchApp);
    patchFile('views/layouts/main.pug', patchLayout);
    patchFile('views/layouts/grid.pug', patchLayout);
    patchFile('public/javascripts/application-version-path.js', patchApplicationVersionPath);
    patchFile('public/javascripts/mathjax.js', patchMathJax);
    patchFile('public/javascripts/page-runtime-support-report.js', patchSupportReport);
    patchFile('public/javascripts/page-runtime-support-ui.js', patchSupportUi);
    console.log('PAGE REPAIR INTEGRATION APPLIED');
}

module.exports = {
    countOccurrences: countOccurrences,
    patchApp: patchApp,
    patchLayout: patchLayout,
    patchApplicationVersionPath: patchApplicationVersionPath,
    patchMathJax: patchMathJax,
    patchSupportReport: patchSupportReport,
    patchSupportUi: patchSupportUi
};

if (require.main === module) {
    main();
}
