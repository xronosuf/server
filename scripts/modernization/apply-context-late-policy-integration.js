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
        '  );',
        '',
        '  exports.State = mongoose.model('
    ].join('\n');

    var after = [
        '  );',
        '',
        '  var LateGradePolicyObservationSchema = new mongoose.Schema(',
        '    {',
        '      toolConsumerInstanceGuid: { type: String, index: true },',
        '      contextId: { type: String, index: true },',
        '      bridge: { type: ObjectId, index: true, ref: "LtiBridge" },',
        '      rawScore: Number,',
        '      effectiveScore: Number,',
        '      lateIntervals: Number,',
        '      observedAt: { type: Date, index: true },',
        '      source: { type: String, index: true },',
        '    },',
        '    {',
        '      minimize: false,',
        '    }',
        '  );',
        '',
        '  LateGradePolicyObservationSchema.index({',
        '    toolConsumerInstanceGuid: 1,',
        '    contextId: 1,',
        '    observedAt: -1,',
        '  });',
        '',
        '  exports.LateGradePolicyObservation = mongoose.model(',
        '    "LateGradePolicyObservation",',
        '    LateGradePolicyObservationSchema',
        '  );',
        '',
        '  exports.State = mongoose.model('
    ].join('\n');

    return replaceOnce(source, before, after, 'late policy observation model');
}

function patchGradebook(source) {
    source = replaceOnce(
        source,
        "var ltiOutcomesClient = require('../lib/lti-outcomes-client');",
        [
            "var ltiOutcomesClient = require('../lib/lti-outcomes-client');",
            "var lateGradeEvidence = require('../lib/late-grade-evidence');"
        ].join('\n'),
        'late evidence require'
    );

    source = replaceOnce(
        source,
        [
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
            '}',
            '',
            'exports.bridgeHasGradePassback = bridgeHasGradePassback;'
        ].join('\n'),
        [
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
            '}',
            '',
            'function saveLatePolicyObservation(observation, callback) {',
            '    if (!observation) {',
            '        callback(null);',
            '        return;',
            '    }',
            '',
            '    mdb.LateGradePolicyObservation.create(observation)',
            '        .then(function() {',
            '            callback(null);',
            '        })',
            '        .catch(callback);',
            '}',
            '',
            'function loadLatePolicyEvidence(bridge, canvasScore, callback) {',
            '    var identity = lateGradeEvidence.contextIdentity(bridge);',
            '',
            '    if (!identity) {',
            '        callback(null, {',
            '            localObservation: null,',
            '            contextPolicy: lateGradePolicy.deriveContextPolicy([])',
            '        });',
            '        return;',
            '    }',
            '',
            '    mdb.LateGradePolicyObservation.find({',
            '        toolConsumerInstanceGuid: identity.toolConsumerInstanceGuid,',
            '        contextId: identity.contextId',
            '    })',
            '        .sort({observedAt: -1})',
            '        .limit(100)',
            '        .lean()',
            '        .exec()',
            '        .then(function(documents) {',
            '            var currentObservation =',
            '                lateGradeEvidence.observationFromLastSubmission(',
            '                    bridge,',
            '                    canvasScore',
            '                );',
            '',
            '            function finish(extraObservation) {',
            '                var all = documents.slice();',
            '',
            '                if (extraObservation) {',
            '                    all.unshift(extraObservation);',
            '                }',
            '',
            '                var localObservation = all.find(function(document) {',
            '                    return document.bridge &&',
            '                        document.bridge.toString() === bridge._id.toString() &&',
            '                        Math.abs(Number(document.effectiveScore) - Number(canvasScore)) <=',
            '                            lateGradePolicy.EVIDENCE_TOLERANCE;',
            '                }) || null;',
            '',
            '                callback(null, {',
            '                    localObservation: localObservation,',
            '                    contextPolicy: lateGradePolicy.deriveContextPolicy(',
            '                        lateGradeEvidence.policyObservations(all)',
            '                    )',
            '                });',
            '            }',
            '',
            '            if (!currentObservation) {',
            '                finish(null);',
            '                return;',
            '            }',
            '',
            '            saveLatePolicyObservation(currentObservation, function(saveErr) {',
            '                if (saveErr) {',
            '                    callback(saveErr);',
            '                    return;',
            '                }',
            '',
            '                finish(currentObservation);',
            '            });',
            '        })',
            '        .catch(callback);',
            '}',
            '',
            'exports.bridgeHasGradePassback = bridgeHasGradePassback;'
        ].join('\n'),
        'late evidence helpers'
    );

    var oldSend = [
        '                    function sendPassback() {',
        '                        legacyHttpClient.postOAuth1Xml('
    ].join('\n');
    var newSend = [
        '                    function sendPassback(lateMetadata) {',
        '                        legacyHttpClient.postOAuth1Xml('
    ].join('\n');
    source = replaceOnce(source, oldSend, newSend, 'sendPassback metadata');

    var oldSuccess = [
        '                                bridge.submittedScore = true;',
        '                                bridge.lastSubmittedResultScore =',
        '                                    bridge.resultScore;',
        '                                bridge.lastSubmittedResultTotalScore =',
        '                                    bridge.resultTotalScore;',
        '                                bridge.lastSubmittedAt = new Date();',
        '',
        '                                bridge',
        '                                    .save()',
        '                                    .then(function() {',
        '                                        callback(null);',
        '                                    })',
        '                                    .catch(function(err) {',
        '                                        callback(err);',
        '                                    });'
    ].join('\n');

    var newSuccess = [
        '                                var acceptedAt = new Date();',
        '',
        '                                bridge.submittedScore = true;',
        '                                bridge.lastSubmittedResultScore =',
        '                                    bridge.resultScore;',
        '                                bridge.lastSubmittedResultTotalScore =',
        '                                    bridge.resultTotalScore;',
        '                                bridge.lastSubmittedAt = acceptedAt;',
        '',
        '                                function saveAcceptedBridge() {',
        '                                    bridge',
        '                                        .save()',
        '                                        .then(function() {',
        '                                            callback(null);',
        '                                        })',
        '                                        .catch(function(err) {',
        '                                            callback(err);',
        '                                        });',
        '                                }',
        '',
        '                                if (!lateMetadata) {',
        '                                    saveAcceptedBridge();',
        '                                    return;',
        '                                }',
        '',
        '                                ltiOutcomesClient.readResult(',
        '                                    bridge,',
        '                                    keyAndSecret,',
        '                                    function(verifyErr, verifiedResult) {',
        '                                        if (',
        '                                            verifyErr ||',
        '                                            !verifiedResult ||',
        '                                            !verifiedResult.ok ||',
        '                                            !verifiedResult.hasResult',
        '                                        ) {',
        '                                            console.log(',
        "                                                'Late Canvas passback accepted but post-write verification failed for bridge ' +",
        '                                                bridge._id',
        '                                            );',
        '                                            if (verifyErr) {',
        '                                                console.log(verifyErr);',
        '                                            }',
        '                                            saveAcceptedBridge();',
        '                                            return;',
        '                                        }',
        '',
        '                                        var observation =',
        '                                            lateGradeEvidence.observationFromAcceptedLatePassback(',
        '                                                bridge,',
        '                                                lateMetadata.rawScore,',
        '                                                verifiedResult.score,',
        '                                                lateMetadata.lateIntervals,',
        '                                                acceptedAt',
        '                                            );',
        '',
        '                                        saveLatePolicyObservation(',
        '                                            observation,',
        '                                            function(observationErr) {',
        '                                                if (observationErr) {',
        '                                                    console.log(',
        "                                                        'Could not save Canvas late-policy observation for bridge ' +",
        '                                                        bridge._id',
        '                                                    );',
        '                                                    console.log(observationErr);',
        '                                                } else {',
        '                                                    console.log(',
        "                                                        'Recorded Canvas late-policy observation for bridge ' +",
        '                                                        bridge._id +',
        "                                                        ': raw=' + lateMetadata.rawScore +",
        "                                                        ', effective=' + verifiedResult.score +",
        "                                                        ', intervals=' + lateMetadata.lateIntervals",
        '                                                    );',
        '                                                }',
        '',
        '                                                saveAcceptedBridge();',
        '                                            }',
        '                                        );',
        '                                    }',
        '                                );'
    ].join('\n');

    source = replaceOnce(source, oldSuccess, newSuccess, 'post-write verification');

    var oldDecision = [
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
        '                            sendPassback();'
    ].join('\n');

    var newDecision = [
        '                            var candidateRawScore =',
        '                                lateGradeEvidence.candidateRawScore(bridge);',
        '                            var currentLateIntervals =',
        '                                lateGradePolicy.lateIntervalNumber(bridge);',
        '',
        '                            loadLatePolicyEvidence(',
        '                                bridge,',
        '                                canvasResult.score,',
        '                                function(evidenceErr, evidence) {',
        '                                    if (evidenceErr) {',
        '                                        console.log(',
        "                                            'Could not load Canvas late-policy evidence for bridge ' +",
        '                                            bridge._id',
        '                                        );',
        '                                        console.log(evidenceErr);',
        '                                        callback(null);',
        '                                        return;',
        '                                    }',
        '',
        '                                    var decision = lateGradePolicy.latePassbackDecision({',
        '                                        canvasHasResult: canvasResult.hasResult,',
        '                                        canvasScore: canvasResult.score,',
        '                                        candidateRawScore: candidateRawScore,',
        '                                        currentLateIntervals: currentLateIntervals,',
        '                                        localObservation: evidence.localObservation,',
        '                                        contextPolicy: evidence.contextPolicy',
        '                                    });',
        '',
        '                                    if (!decision.allow) {',
        '                                        console.log(',
        "                                            'Blocked late Canvas passback for bridge ' +",
        '                                            bridge._id +',
        "                                            ': ' + decision.reason",
        '                                        );',
        '                                        callback(null);',
        '                                        return;',
        '                                    }',
        '',
        '                                    console.log(',
        "                                        'Verified safe late Canvas passback for bridge ' +",
        '                                        bridge._id +',
        "                                        ': ' + decision.reason +",
        "                                        ', predictedFloorless=' +",
        '                                        decision.predictedFloorlessScore',
        '                                    );',
        '                                    sendPassback({',
        '                                        rawScore: candidateRawScore,',
        '                                        lateIntervals: currentLateIntervals',
        '                                    });',
        '                                }',
        '                            );'
    ].join('\n');

    source = replaceOnce(source, oldDecision, newDecision, 'context late decision');

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

    console.log('Context late-policy integration applied.');
    console.log('Modified: mdb.js');
    console.log('Modified: routes/gradebook.js');
}

try {
    main();
} catch (err) {
    console.error('Context late-policy integration NOT applied.');
    console.error(err.message);
    process.exit(1);
}
