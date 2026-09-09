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

function patchLogin(source) {
    source = replaceOnce(
        source,
        'var gradebook = require("../routes/gradebook");\n',
        'var gradebook = require("../routes/gradebook");\n' +
        'var ltiLaunchReference = require("../lib/lti-launch-reference");\n',
        'login launch-reference import'
    );

    source = replaceOnce(
        source,
        '        bridge\n' +
        '          .save()\n' +
        '          .then(function () {\n' +
        '            initializeZeroGradePassback(bridge, function (err) {',
        '        bridge\n' +
        '          .save()\n' +
        '          .then(function () {\n' +
        '            ltiLaunchReference.record(req, bridge);\n' +
        '            initializeZeroGradePassback(bridge, function (err) {',
        'saved-bridge launch-reference recording'
    );

    return source;
}

function removeInlineStatusBuilder(source) {
    var startMarker = '    var buildGradeSyncStatus = function(bridges) {';
    var endMarker = '    if (!req.user) {';
    var start = source.indexOf(startMarker);
    var end = source.indexOf(endMarker, start);

    if (start === -1 || end === -1 || end <= start) {
        throw new Error('Could not locate inline grade-sync status builder.');
    }

    if (source.indexOf(startMarker, start + 1) !== -1) {
        throw new Error('Found more than one inline grade-sync status builder.');
    }

    return source.slice(0, start) + source.slice(end);
}

function patchGradebook(source) {
    source = replaceOnce(
        source,
        "var lateGradeEvidence = require('../lib/late-grade-evidence');\n",
        "var lateGradeEvidence = require('../lib/late-grade-evidence');\n" +
        "var gradeSyncRuntime = require('../lib/grade-sync-runtime');\n" +
        "var gradeSyncDiagnosticReport = require('../lib/grade-sync-diagnostic-report');\n" +
        "var ltiLaunchReference = require('../lib/lti-launch-reference');\n",
        'gradebook grade-sync imports'
    );

    source = removeInlineStatusBuilder(source);

    source = replaceOnce(
        source,
        '            .then(function(bridges) {\n' +
        '                var gradeSync =\n' +
        '                    buildGradeSyncStatus(bridges);\n\n' +
        '                async.each(bridges,',
        '            .then(function(bridges) {\n' +
        '                async.each(bridges,',
        'inline grade-sync initialization'
    );

    source = replaceOnce(
        source,
        '                                    function(err) {\n' +
        '                                        if (!err) {\n' +
        '                                            gradeSync\n' +
        '                                                .queuedGradePassbackCount += 1;\n' +
        '                                            gradeSync\n' +
        '                                                .queuedGradePassback = true;\n' +
        '                                        }\n\n' +
        '                                        callback(err);\n' +
        '                                    }',
        '                                    function(err) {\n' +
        '                                        callback(err);\n' +
        '                                    }',
        'request-local queue counter mutation'
    );

    source = replaceOnce(
        source,
        '                    function(err) {\n' +
        '                        if (err)\n' +
        '                            res.status(500).json(err);\n' +
        '                        else\n' +
        '                            res.json({\n' +
        '                                ok: true,\n' +
        '                                gradeSync: gradeSync\n' +
        '                            });\n' +
        '                    });',
        '                    function(err) {\n' +
        '                        if (err) {\n' +
        '                            res.status(500).json(err);\n' +
        '                            return;\n' +
        '                        }\n\n' +
        '                        gradeSyncRuntime.load(\n' +
        '                            client,\n' +
        '                            bridges,\n' +
        '                            now,\n' +
        '                            function(runtimeErr, runtime) {\n' +
        '                                if (runtimeErr) {\n' +
        '                                    next(runtimeErr);\n' +
        '                                    return;\n' +
        '                                }\n\n' +
        '                                var page = {\n' +
        '                                    repository: repositoryName,\n' +
        '                                    path: req.params.path\n' +
        '                                };\n' +
        '                                var reference =\n' +
        '                                    ltiLaunchReference.read(req);\n' +
        '                                var diagnosticReport =\n' +
        '                                    gradeSyncDiagnosticReport.build({\n' +
        '                                        reference: reference,\n' +
        '                                        allUserBridges: bridges,\n' +
        '                                        page: page,\n' +
        '                                        runtime: runtime\n' +
        '                                    });\n\n' +
        '                                res.json({\n' +
        '                                    ok: true,\n' +
        '                                    gradeSync: runtime.status,\n' +
        '                                    gradeSyncDiagnostics:\n' +
        '                                        diagnosticReport\n' +
        '                                });\n' +
        '                            }\n' +
        '                        );\n' +
        '                    });',
        'gradebook response integration'
    );

    return source;
}

function patchFile(relativePath, patcher) {
    var filename = path.join(root, relativePath);
    var original = fs.readFileSync(filename, 'utf8');
    var updated = patcher(original);

    if (updated === original) {
        throw new Error('Patch made no changes to ' + relativePath + '.');
    }

    fs.writeFileSync(filename, updated, 'utf8');
    console.log('Patched ' + relativePath);
}

function apply() {
    patchFile('login/index.js', patchLogin);
    patchFile('routes/gradebook.js', patchGradebook);
    console.log('GRADE SYNC ROUTE INTEGRATION PATCH APPLIED');
}

if (require.main === module) {
    apply();
}

exports.apply = apply;
exports.patchGradebook = patchGradebook;
exports.patchLogin = patchLogin;
exports.replaceOnce = replaceOnce;
