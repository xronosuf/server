#!/usr/bin/env node
'use strict';

/*
 * Test-server-only integration coverage for unknown Canvas late-policy
 * probing and compensating recovery.
 *
 * Case 1: Canvas applies no late deduction. Xronos has no policy evidence,
 * probes the newer late score, reads back a non-lowering grade, and advances
 * the last-known-good outbound state.
 *
 * Case 2: Canvas applies a 10%-per-late-interval deduction. The exploratory
 * newer score would lower the effective Canvas grade. Xronos must detect that,
 * replay the exact prior raw Xronos submission with its original submittedAt,
 * verify restoration, and leave the newer candidate unresolved.
 *
 * Usage on the disposable test server:
 *   NODE_ENV=test node scripts/test-fake-canvas-late-probe-recovery.js
 */

var mdb = require('../mdb');
var gradebook = require('../routes/gradebook');
var FakeCanvasOutcomesServer =
    require('../test-support/fake-canvas-outcomes').FakeCanvasOutcomesServer;

var DAY_MS = 24 * 60 * 60 * 1000;
var now = Date.now();
var dueAt = new Date(now - 25 * 60 * 60 * 1000);
var untilAt = new Date(now + 60 * 60 * 1000);
var oldObservedAt =
    new Date(dueAt.getTime() + 60 * 60 * 1000);
var newObservedAt =
    new Date(now - 60 * 1000);
var marker =
    'fake-canvas-late-probe-' +
    now +
    '-' +
    Math.random().toString(16).slice(2);
var ltiKey = marker + '-key';
var bridgeIds = [];

function lateIntervals(submittedAt) {
    var timestamp = new Date(submittedAt).getTime();

    if (!isFinite(timestamp) || timestamp <= dueAt.getTime()) {
        return 0;
    }

    return Math.ceil(
        (timestamp - dueAt.getTime()) / DAY_MS
    );
}

var fakeCanvas = new FakeCanvasOutcomesServer({
    resultTransform: function(result) {
        if (
            result.sourcedId.indexOf('lowering') < 0 ||
            result.resultScore === null
        ) {
            return result;
        }

        result.submittedResultScore = result.resultScore;
        result.resultScore = Math.max(
            0,
            result.resultScore -
                0.10 * lateIntervals(result.submittedAt)
        );
        return result;
    }
});

function fail(message) {
    throw new Error(message);
}

function closeEnough(a, b) {
    return Math.abs(Number(a) - Number(b)) < 1e-6;
}

function startFakeCanvas() {
    return new Promise(function(resolve, reject) {
        fakeCanvas.start(function(err) {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });
}

function stopFakeCanvas() {
    return new Promise(function(resolve) {
        fakeCanvas.stop(function() {
            resolve();
        });
    });
}

function processBridge(bridge) {
    return new Promise(function(resolve, reject) {
        gradebook.processGradebookForTest(
            bridge._id.toString(),
            function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            }
        );
    });
}

function cleanup() {
    return Promise.all([
        mdb.ProgressMilestone.deleteMany({
            repository: marker
        }).exec(),
        mdb.LateGradePolicyObservation.deleteMany({
            bridge: { $in: bridgeIds }
        }).exec(),
        mdb.LtiBridge.deleteMany({
            _id: { $in: bridgeIds }
        }).exec(),
        mdb.KeyAndSecret.deleteMany({
            ltiKey: ltiKey
        }).exec()
    ]);
}

function bridgeDocument(options) {
    return new mdb.LtiBridge({
        ltiId: marker + '-' + options.name,
        user: new mdb.ObjectId(),
        repository: marker,
        path: options.name,
        toolConsumerInstanceGuid:
            marker + '-consumer',
        contextId:
            marker + '-context-' + options.name,
        resourceLinkId:
            marker + '-' + options.name + '-resource',
        pointsPossible: 10,
        gradeSyncCutoff: 'late-policy',
        dueDate: dueAt,
        dueDateObservedAt:
            new Date(dueAt.getTime() - 60 * 60 * 1000),
        untilDate: untilAt,
        untilDateObservedAt:
            new Date(dueAt.getTime() - 60 * 60 * 1000),
        resultScore: options.newScore,
        resultTotalScore:
            options.newScore * 10,
        resultScoreObservedAt: newObservedAt,
        resultPointsEarned:
            options.newScore * 100,
        resultPointsPossible: 100,
        recentBestScoreObservations: [{
            resultScore: options.newScore,
            resultTotalScore:
                options.newScore * 10,
            pointsEarned:
                options.newScore * 100,
            pointsPossible: 100,
            observedAt: newObservedAt
        }],
        submittedScore: false,

        lastSubmittedResultScore:
            options.oldRawScore,
        lastSubmittedResultTotalScore:
            options.oldRawScore * 10,
        lastSubmittedAt:
            new Date(oldObservedAt.getTime() + 5000),

        lastSuccessfulSubmittedResultScore:
            options.oldRawScore,
        lastSuccessfulSubmittedResultTotalScore:
            options.oldRawScore * 10,
        lastSuccessfulSubmittedObservedAt:
            oldObservedAt,

        oauthConsumerKey: ltiKey,
        oauthSignatureMethod: 'HMAC-SHA1',
        lisResultSourcedid:
            marker + '-' + options.name + '-result',
        lisOutcomeServiceUrl:
            fakeCanvas.url(),
        submissionSubmittedAtAccepted: true
    });
}

function seedCanvas(bridge, effectiveScore) {
    fakeCanvas.results[
        String(bridge.lisResultSourcedid)
    ] = {
        sourcedId:
            bridge.lisResultSourcedid,
        resultScore: effectiveScore,
        resultTotalScore:
            effectiveScore * 10,
        submittedAt:
            oldObservedAt.toISOString(),
        acceptedAt: new Date()
    };
}

function replaceRequestsFor(bridge) {
    return fakeCanvas.requests.filter(function(request) {
        return request.operation === 'replaceResult' &&
            request.sourcedId ===
                bridge.lisResultSourcedid;
    });
}

function requestContains(request, text) {
    return request &&
        request.body &&
        request.body.indexOf(text) >= 0;
}

mdb.initialize(function(initErr) {
    if (initErr) {
        console.error(initErr);
        process.exit(1);
        return;
    }

    var noPenaltyBridge;
    var loweringBridge;

    startFakeCanvas()
        .then(function() {
            return mdb.KeyAndSecret.create({
                keyid: marker,
                ltiKey: ltiKey,
                ltiSecret: marker + '-secret'
            });
        })
        .then(function() {
            noPenaltyBridge = bridgeDocument({
                name: 'zero-penalty',
                oldRawScore: 0.35,
                newScore: 0.54
            });
            loweringBridge = bridgeDocument({
                name: 'lowering',
                oldRawScore: 0.80,
                newScore: 0.85
            });

            return Promise.all([
                noPenaltyBridge.save(),
                loweringBridge.save()
            ]);
        })
        .then(function(saved) {
            saved.forEach(function(bridge) {
                bridgeIds.push(bridge._id);
            });

            seedCanvas(noPenaltyBridge, 0.35);
            seedCanvas(loweringBridge, 0.70);

            return processBridge(noPenaltyBridge);
        })
        .then(function() {
            var result =
                fakeCanvas.result(
                    noPenaltyBridge.lisResultSourcedid
                );

            if (!result || !closeEnough(result.resultScore, 0.54)) {
                fail(
                    'Zero-penalty probe did not leave Canvas at 54%.'
                );
            }

            return mdb.LtiBridge.findById(
                noPenaltyBridge._id
            ).lean().exec();
        })
        .then(function(savedBridge) {
            if (
                !savedBridge ||
                savedBridge.submittedScore !== true ||
                !closeEnough(
                    savedBridge
                        .lastSuccessfulSubmittedResultScore,
                    0.54
                ) ||
                !savedBridge
                    .lastSuccessfulSubmittedObservedAt ||
                new Date(
                    savedBridge
                        .lastSuccessfulSubmittedObservedAt
                ).toISOString() !==
                    newObservedAt.toISOString()
            ) {
                fail(
                    'Zero-penalty probe did not advance verified last-successful state.'
                );
            }

            var writes =
                replaceRequestsFor(noPenaltyBridge);

            if (
                writes.length !== 1 ||
                !requestContains(
                    writes[0],
                    newObservedAt.toISOString()
                )
            ) {
                fail(
                    'Zero-penalty probe did not send the trusted candidate submittedAt.'
                );
            }

            console.log(
                'PASS zero-penalty probe: unknown policy accepted and verified without lowering'
            );

            return processBridge(loweringBridge);
        })
        .then(function() {
            var result =
                fakeCanvas.result(
                    loweringBridge.lisResultSourcedid
                );

            if (!result || !closeEnough(result.resultScore, 0.70)) {
                fail(
                    'Lowering probe did not restore Canvas to the prior effective 70%.'
                );
            }

            var writes =
                replaceRequestsFor(loweringBridge);

            if (writes.length !== 2) {
                fail(
                    'Expected one probe write and one compensating recovery write; got ' +
                    writes.length + '.'
                );
            }

            if (
                !requestContains(
                    writes[0],
                    newObservedAt.toISOString()
                ) ||
                !requestContains(
                    writes[0],
                    '<textString>0.85</textString>'
                )
            ) {
                fail(
                    'Lowering probe did not send the newer raw 85% with its trusted submittedAt.'
                );
            }

            if (
                !requestContains(
                    writes[1],
                    oldObservedAt.toISOString()
                ) ||
                !requestContains(
                    writes[1],
                    '<textString>0.8</textString>'
                )
            ) {
                fail(
                    'Recovery did not replay the prior raw 80% with its original submittedAt.'
                );
            }

            return mdb.LtiBridge.findById(
                loweringBridge._id
            ).lean().exec();
        })
        .then(function(savedBridge) {
            if (
                !savedBridge ||
                savedBridge.submittedScore !== false ||
                !closeEnough(
                    savedBridge
                        .lastSuccessfulSubmittedResultScore,
                    0.80
                ) ||
                savedBridge.passbackRecoverySubmission
            ) {
                fail(
                    'Lowering probe corrupted last-successful state or left recovery pending.'
                );
            }

            console.log(
                'PASS lowering probe: effective grade drop detected and exact prior raw submission restored'
            );
            console.log(
                'PASS rollback anchor: prior 80% + original submittedAt remained authoritative after recovery'
            );

            return new Promise(function(resolve) {
                setTimeout(resolve, 100);
            });
        })
        .then(cleanup)
        .then(function() {
            console.log(
                'PASS cleanup: late probe/recovery fixtures removed'
            );
            return stopFakeCanvas();
        })
        .then(function() {
            return mdb.mongoose.disconnect();
        })
        .then(function() {
            process.exit(0);
        })
        .catch(function(testErr) {
            console.error(
                'FAKE CANVAS LATE PROBE/RECOVERY TEST FAILED'
            );
            console.error(testErr);

            cleanup()
                .catch(function(cleanupErr) {
                    console.error(
                        'Cleanup also failed:'
                    );
                    console.error(cleanupErr);
                })
                .then(stopFakeCanvas)
                .then(function() {
                    return mdb.mongoose.disconnect();
                })
                .then(function() {
                    process.exit(1);
                });
        });
});
