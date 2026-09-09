#!/usr/bin/env node

'use strict';

var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '../..');
var mdbPath = path.join(root, 'mdb.js');
var gradebookPath = path.join(root, 'routes/gradebook.js');

function replaceOnce(source, before, after, label) {
    var first = source.indexOf(before);
    var second;

    if (first < 0) {
        throw new Error('Missing expected source fragment: ' + label);
    }

    second = source.indexOf(before, first + before.length);

    if (second >= 0) {
        throw new Error('Expected exactly one source fragment: ' + label);
    }

    return source.slice(0, first) + after + source.slice(first + before.length);
}

function patchMdb(source) {
    var before = [
        '        resultScore: Number,',
        '        resultTotalScore: Number,',
        '        submittedScore: Boolean,'
    ].join('\n');

    var after = [
        '        resultScore: Number,',
        '        resultTotalScore: Number,',
        '        submittedScore: Boolean,',
        '',
        '        // Raw Xronos result last accepted by Canvas.  Keep this',
        '        // separate from resultScore/resultTotalScore, which continue',
        '        // to represent the newest candidate waiting for passback.',
        '        lastSubmittedResultScore: Number,',
        '        lastSubmittedResultTotalScore: Number,',
        '        lastSubmittedAt: Date,'
    ].join('\n');

    return replaceOnce(source, before, after, 'LtiBridge submitted-score fields');
}

function patchGradebook(source) {
    source = replaceOnce(
        source,
        "var gradebookRetryPolicy = require('../lib/gradebook-retry-policy');",
        [
            "var gradebookRetryPolicy = require('../lib/gradebook-retry-policy');",
            "var lateGradePolicy = require('../lib/late-grade-policy');",
            "var ltiOutcomesClient = require('../lib/lti-outcomes-client');"
        ].join('\n'),
        'late policy requires'
    );

    source = replaceOnce(
        source,
        [
            'function bridgeIsOpen(bridge, now) {',
            '    now = now || Date.now();',
            '',
            '    return !(bridge && bridge.dueDate && bridge.dueDate < now);',
            '}'
        ].join('\n'),
        [
            'function bridgeIsOpen(bridge, now) {',
            '    return lateGradePolicy.bridgeIsPassbackWindowOpen(',
            '        bridge,',
            '        now',
            '    );',
            '}'
        ].join('\n'),
        'bridgeIsOpen due-date cutoff'
    );

    source = replaceOnce(
        source,
        [
            'function queueBridge(bridge, callback) {',
            '    var debouncedTime = Date.now() + DEBOUNCE;',
            '',
            '    if (bridge.dueDate && debouncedTime > bridge.dueDate) {',
            '        debouncedTime = bridge.dueDate;',
            '    }',
            '',
            "    client.zadd('gradebook', debouncedTime, bridge._id.toString(), callback);",
            '}'
        ].join('\n'),
        [
            'function queueBridge(bridge, callback) {',
            '    var debouncedTime = Date.now() + DEBOUNCE;',
            '    var windowEnd = lateGradePolicy.passbackWindowEnd(bridge).time;',
            '',
            '    if (windowEnd !== null && debouncedTime > windowEnd) {',
            '        debouncedTime = windowEnd;',
            '    }',
            '',
            "    client.zadd('gradebook', debouncedTime, bridge._id.toString(), callback);",
            '}',
            '',
            'function queueBridgeAt(bridge, when, reason, callback) {',
            "    client.zadd('gradebook', when, bridge._id.toString(), function(err) {",
            '        if (!err) {',
            '            console.log(',
            "                'Deferred Canvas grade passback for bridge ' +",
            '                bridge._id +',
            "                ' until ' + new Date(when).toISOString() +",
            "                ' (' + reason + ')'",
            '            );',
            '        }',
            '',
            '        callback(err);',
            '    });',
            '}'
        ].join('\n'),
        'queueBridge due-date clamp'
    );

    source = replaceOnce(
        source,
        [
            '                            } else if (',
            '                                canvasPassbackSucceeded(',
            '                                    response,',
            '                                    body',
            '                                )',
            '                            ) {',
            '                                logCanvasPassbackSuccess(',
            '                                    bridge',
            '                                );',
            '',
            '                                bridge.submittedScore =',
            '                                    true;',
            '',
            '                                bridge',
            '                                    .save()'
        ].join('\n'),
        [
            '                            } else if (',
            '                                canvasPassbackSucceeded(',
            '                                    response,',
            '                                    body',
            '                                )',
            '                            ) {',
            '                                logCanvasPassbackSuccess(',
            '                                    bridge',
            '                                );',
            '',
            '                                bridge.submittedScore = true;',
            '                                bridge.lastSubmittedResultScore =',
            '                                    bridge.resultScore;',
            '                                bridge.lastSubmittedResultTotalScore =',
            '                                    bridge.resultTotalScore;',
            '                                bridge.lastSubmittedAt = new Date();',
            '',
            '                                bridge',
            '                                    .save()'
        ].join('\n'),
        'successful passback bookkeeping'
    );

    source = replaceOnce(
        source,
        [
            '                    legacyHttpClient.postOAuth1Xml(',
            '                        {',
            '                            url: url,'
        ].join('\n'),
        [
            '                    function sendPassback() {',
            '                        legacyHttpClient.postOAuth1Xml(',
            '                        {',
            '                            url: url,'
        ].join('\n'),
        'start passback post wrapper'
    );

    source = replaceOnce(
        source,
        [
            '                            }',
            '                        }',
            '                    );',
            '                });',
            '        })'
        ].join('\n'),
        [
            '                            }',
            '                        }',
            '                    );',
            '                    }',
            '',
            '                    if (!lateGradePolicy.bridgeIsPassbackWindowOpen(bridge)) {',
            '                        console.log(',
            "                            'Canvas passback window closed for bridge ' + bridge._id",
            '                        );',
            '                        callback(null);',
            '                        return;',
            '                    }',
            '',
            '                    if (!lateGradePolicy.bridgeIsLate(bridge)) {',
            '                        sendPassback();',
            '                        return;',
            '                    }',
            '',
            '                    var boundaryDecision =',
            '                        lateGradePolicy.lateBoundaryDecision(bridge);',
            '',
            '                    if (boundaryDecision.defer) {',
            '                        queueBridgeAt(',
            '                            bridge,',
            '                            boundaryDecision.retryAt,',
            '                            boundaryDecision.reason,',
            '                            callback',
            '                        );',
            '                        return;',
            '                    }',
            '',
            '                    ltiOutcomesClient.readResult(',
            '                        bridge,',
            '                        keyAndSecret,',
            '                        function(readErr, canvasResult) {',
            '                            if (readErr || !canvasResult || !canvasResult.ok) {',
            '                                console.log(',
            "                                    'Could not verify Canvas grade before late passback for bridge ' +",
            '                                    bridge._id',
            '                                );',
            '                                if (readErr) {',
            '                                    console.log(readErr);',
            '                                }',
            '',
            '                                retryBridge(bridge, callback);',
            '                                return;',
            '                            }',
            '',
            '                            var decision = lateGradePolicy.latePassbackDecision({',
            '                                canvasHasResult: canvasResult.hasResult,',
            '                                canvasScore: canvasResult.score,',
            '                                lastSubmittedRawScore:',
            '                                    bridge.lastSubmittedResultScore,',
            '                                candidateRawScore: bridge.resultScore',
            '                            });',
            '',
            '                            if (!decision.allow) {',
            '                                console.log(',
            "                                    'Blocked late Canvas passback for bridge ' +",
            '                                    bridge._id +',
            "                                    ': ' + decision.reason",
            '                                );',
            '                                callback(null);',
            '                                return;',
            '                            }',
            '',
            '                            console.log(',
            "                                'Verified safe late Canvas passback for bridge ' +",
            '                                bridge._id +',
            "                                ': ' + decision.reason",
            '                            );',
            '                            sendPassback();',
            '                        }',
            '                    );',
            '                });',
            '        })'
        ].join('\n'),
        'finish passback post wrapper'
    );

    source = replaceOnce(
        source,
        [
            '                        // Silently ignore attempts to submit homework after the due date',
            '                        if (!bridgeIsOpen(bridge)) {',
            '                            callback(null);',
            '                            return;',
            '                        }'
        ].join('\n'),
        [
            '                        // Permit late work while the Canvas availability/passback',
            '                        // window remains open.  processGradebook performs the',
            '                        // readResult safety check immediately before a late write.',
            '                        if (!bridgeIsOpen(bridge)) {',
            '                            callback(null);',
            '                            return;',
            '                        }'
        ].join('\n'),
        'record due-date comment'
    );

    source = replaceOnce(
        source,
        [
            '                        better = false;',
            '',
            '                        /*',
            '                         * resultScore and resultTotalScore describe the same'
        ].join('\n'),
        [
            '                        better = false;',
            '',
            '                        /*',
            '                         * Older bridges predate explicit last-submitted fields.',
            '                         * If the legacy submittedScore flag still proves that the',
            '                         * current stored result was accepted, preserve that raw',
            '                         * score before replacing resultScore with a better candidate.',
            '                         */',
            '                        if (',
            '                            bridge.submittedScore === true &&',
            '                            bridge.lastSubmittedResultScore === undefined &&',
            '                            bridge.resultScore !== undefined',
            '                        ) {',
            '                            bridge.lastSubmittedResultScore = bridge.resultScore;',
            '                            bridge.lastSubmittedResultTotalScore =',
            '                                bridge.resultTotalScore;',
            '                        }',
            '',
            '                        /*',
            '                         * resultScore and resultTotalScore describe the same'
        ].join('\n'),
        'legacy submitted-score baseline capture'
    );

    return source;
}

function main() {
    var mdb = fs.readFileSync(mdbPath, 'utf8');
    var gradebook = fs.readFileSync(gradebookPath, 'utf8');
    var patchedMdb = patchMdb(mdb);
    var patchedGradebook = patchGradebook(gradebook);

    if (patchedMdb === mdb || patchedGradebook === gradebook) {
        throw new Error('Patch unexpectedly made no changes.');
    }

    fs.writeFileSync(mdbPath, patchedMdb);
    fs.writeFileSync(gradebookPath, patchedGradebook);

    console.log('Late grade passback integration applied.');
    console.log('Modified: mdb.js');
    console.log('Modified: routes/gradebook.js');
}

try {
    main();
} catch (err) {
    console.error('Late grade passback integration NOT applied.');
    console.error(err.message);
    process.exit(1);
}
