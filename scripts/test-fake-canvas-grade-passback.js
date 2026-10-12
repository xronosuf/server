#!/usr/bin/env node
'use strict';

/*
 * Test-server-only integration test for Canvas grade passback without Canvas.
 *
 * This starts an in-process fake LTI 1.1 Outcomes endpoint, creates disposable
 * Mongo records, and invokes the real gradebook worker. It reproduces the
 * original deadline race instantly by using trusted historical timestamps:
 *
 *   cutoff       11:59:00
 *   observed     11:58:57 at 87%
 *   worker       after cutoff
 *
 * The fake Canvas must receive 87% with submittedAt=11:58:57.
 *
 * A second case keeps 87% in recent trusted history while the bridge's newest
 * Xronos score is a post-cutoff 95%. The worker must still deliver only 87%.
 *
 * Usage on the disposable test server:
 *   NODE_ENV=test node scripts/test-fake-canvas-grade-passback.js
 */

var mdb = require('../mdb');
var gradebook = require('../routes/gradebook');
var FakeCanvasOutcomesServer =
    require('../test-support/fake-canvas-outcomes').FakeCanvasOutcomesServer;

var marker =
    'fake-canvas-passback-' +
    Date.now() +
    '-' +
    Math.random().toString(16).slice(2);
var fakeCanvas = new FakeCanvasOutcomesServer();
var bridgeIds = [];
var ltiKey = marker + '-key';

function fail(message) {
    throw new Error(message);
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
    var boundary = options.boundary;
    var observed = options.observed;
    var preBoundaryObservation = options.preBoundaryObservation;

    return new mdb.LtiBridge({
        ltiId: marker + '-' + options.name,
        user: new mdb.ObjectId(),
        repository: marker,
        path: options.name,
        toolConsumerInstanceGuid: marker + '-consumer',
        contextId: marker + '-context',
        resourceLinkId: marker + '-' + options.name + '-resource',
        pointsPossible: 10,
        gradeSyncCutoff: 'late-policy',
        dueDate: boundary,
        dueDateObservedAt:
            new Date(boundary.getTime() - 60 * 60 * 1000),
        untilDate: boundary,
        untilDateObservedAt:
            new Date(boundary.getTime() - 60 * 60 * 1000),
        resultScore: options.resultScore,
        resultTotalScore: options.resultTotalScore,
        resultScoreObservedAt: observed,
        resultPointsEarned: options.resultScore * 100,
        resultPointsPossible: 100,
        recentBestScoreObservations:
            preBoundaryObservation
                ? [preBoundaryObservation]
                : [{
                    resultScore: options.resultScore,
                    resultTotalScore: options.resultTotalScore,
                    pointsEarned: options.resultScore * 100,
                    pointsPossible: 100,
                    observedAt: observed
                }],
        submittedScore: false,
        oauthConsumerKey: ltiKey,
        oauthSignatureMethod: 'HMAC-SHA1',
        lisResultSourcedid: marker + '-' + options.name + '-result',
        lisOutcomeServiceUrl: fakeCanvas.url(),
        submissionSubmittedAtAccepted: true
    });
}

mdb.initialize(function(initErr) {
    if (initErr) {
        console.error(initErr);
        process.exit(1);
        return;
    }

    var boundary = new Date('2026-10-05T23:59:00.000Z');
    var eligibleObserved =
        new Date(boundary.getTime() - 3 * 1000);
    var postCutoffObserved =
        new Date(boundary.getTime() + 20 * 1000);
    var eligibleObservation = {
        resultScore: 0.87,
        resultTotalScore: 8.7,
        pointsEarned: 87,
        pointsPossible: 100,
        observedAt: eligibleObserved
    };
    var simpleBridge;
    var laterProgressBridge;

    startFakeCanvas()
        .then(function() {
            return mdb.KeyAndSecret.create({
                keyid: marker,
                ltiKey: ltiKey,
                ltiSecret: marker + '-secret'
            });
        })
        .then(function() {
            simpleBridge = bridgeDocument({
                name: 'simple-frozen',
                boundary: boundary,
                observed: eligibleObserved,
                resultScore: 0.87,
                resultTotalScore: 8.7
            });

            laterProgressBridge = bridgeDocument({
                name: 'post-cutoff-progress',
                boundary: boundary,
                observed: postCutoffObserved,
                resultScore: 0.95,
                resultTotalScore: 9.5,
                preBoundaryObservation: eligibleObservation
            });

            return Promise.all([
                simpleBridge.save(),
                laterProgressBridge.save()
            ]);
        })
        .then(function(saved) {
            saved.forEach(function(bridge) {
                bridgeIds.push(bridge._id);
            });

            return processBridge(simpleBridge);
        })
        .then(function() {
            var result =
                fakeCanvas.result(simpleBridge.lisResultSourcedid);

            if (!result) {
                fail(
                    'Fake Canvas did not receive the frozen pre-boundary result.'
                );
            }

            if (
                Number(result.resultScore) !== 0.87 ||
                Number(result.resultTotalScore) !== 8.7
            ) {
                fail(
                    'Expected frozen 87% / 8.7-point result, got ' +
                    result.resultScore + ' / ' +
                    result.resultTotalScore + '.'
                );
            }

            if (
                result.submittedAt !==
                eligibleObserved.toISOString()
            ) {
                fail(
                    'Expected submittedAt ' +
                    eligibleObserved.toISOString() +
                    ', got ' + result.submittedAt + '.'
                );
            }

            console.log(
                'PASS deadline race: worker after cutoff delivered 87% observed at T-3s'
            );
            console.log(
                'PASS submittedAt: fake Canvas received trusted pre-cutoff observation time'
            );

            return mdb.LtiBridge.findById(simpleBridge._id)
                .lean()
                .exec();
        })
        .then(function(savedBridge) {
            if (
                !savedBridge ||
                savedBridge.submittedScore !== true ||
                Number(savedBridge.lastSubmittedResultScore) !== 0.87
            ) {
                fail(
                    'Bridge did not persist the fake Canvas acceptance.'
                );
            }

            console.log(
                'PASS acceptance persistence: bridge records Canvas-accepted 87%'
            );

            return processBridge(laterProgressBridge);
        })
        .then(function() {
            var result =
                fakeCanvas.result(
                    laterProgressBridge.lisResultSourcedid
                );

            if (!result) {
                fail(
                    'Post-cutoff latest progress hid the preserved 87% eligible candidate.'
                );
            }

            if (
                Number(result.resultScore) !== 0.87 ||
                Number(result.resultTotalScore) !== 8.7
            ) {
                fail(
                    'Post-cutoff 95% leaked into Canvas; expected preserved 87%, got ' +
                    result.resultScore + ' / ' +
                    result.resultTotalScore + '.'
                );
            }

            if (
                result.submittedAt !==
                eligibleObserved.toISOString()
            ) {
                fail(
                    'Frozen candidate used the wrong submittedAt after later progress.'
                );
            }

            console.log(
                'PASS post-cutoff isolation: Xronos 95% did not replace Canvas-eligible 87%'
            );
        })
        .then(function() {
            return new Promise(function(resolve) {
                /*
                 * processGradebook defensively asks the milestone layer to
                 * finalize crossed boundaries without blocking the HTTP write.
                 * Give those callbacks a short turn before deleting fixtures.
                 */
                setTimeout(resolve, 100);
            });
        })
        .then(function() {
            return cleanup();
        })
        .then(function() {
            console.log(
                'PASS cleanup: fake Canvas passback fixtures removed'
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
            console.error('FAKE CANVAS GRADE PASSBACK TEST FAILED');
            console.error(testErr);

            cleanup()
                .catch(function(cleanupErr) {
                    console.error('Cleanup also failed:');
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
