#!/usr/bin/env node
'use strict';

/*
 * Test-server-only smoke test for grade boundary snapshots.
 *
 * This script creates disposable fake bridge/milestone records, verifies:
 *   1. an on-time known Due boundary creates an authoritative snapshot;
 *   2. a retroactively moved earlier Due with prior milestone evidence is not
 *      mislabeled authoritative;
 *   3. a first appearance after Due with no earlier evidence creates an
 *      inferred-zero boundary;
 * then removes every record it created.
 *
 * Usage:
 *   NODE_ENV=test node scripts/test-grade-boundaries.js
 */

var mdb = require('../mdb');
var progressMilestones = require('../routes/progress-milestones');

var marker =
    'grade-boundary-smoke-' +
    Date.now() +
    '-' +
    Math.random().toString(16).slice(2);
var userId;
var bridgeIds = [];

function fail(message) {
    throw new Error(message);
}

function cleanup() {
    var bridgeQuery = bridgeIds.length
        ? { _id: { $in: bridgeIds } }
        : { repository: marker };

    return Promise.all([
        mdb.ProgressMilestone.deleteMany({
            repository: marker
        }).exec(),
        mdb.LtiBridge.deleteMany(bridgeQuery).exec()
    ]);
}

function ensureBoundary(bridge, type, now) {
    return new Promise(function(resolve, reject) {
        progressMilestones.ensureBoundary(
            bridge,
            type,
            now,
            function(err, milestone, status) {
                if (err) {
                    reject(err);
                    return;
                }

                resolve({
                    milestone: milestone,
                    status: status
                });
            }
        );
    });
}

mdb.initialize(function(err) {
    if (err) {
        console.error(err);
        process.exit(1);
    }

    userId = new mdb.ObjectId();

    var due = new Date(Date.now() - 60 * 1000);
    var authoritativeObserved =
        new Date(due.getTime() - 15 * 1000);

    var authoritative = new mdb.LtiBridge({
        ltiId: marker + '-authoritative',
        user: userId,
        repository: marker,
        path: 'authoritative',
        contextId: marker + '-context',
        resourceLinkId: marker + '-resource-a',
        pointsPossible: 10,
        dueDate: due,
        dueDateObservedAt:
            new Date(due.getTime() - 60 * 60 * 1000),
        resultScore: 0.87,
        resultTotalScore: 8.7,
        resultScoreObservedAt: authoritativeObserved,
        resultPointsEarned: 87,
        resultPointsPossible: 100,
        recentBestScoreObservations: [{
            resultScore: 0.87,
            resultTotalScore: 8.7,
            pointsEarned: 87,
            pointsPossible: 100,
            observedAt: authoritativeObserved
        }]
    });

    var retroDue = new Date(Date.now() - 20 * 60 * 1000);
    var retroactive = new mdb.LtiBridge({
        ltiId: marker + '-retroactive',
        user: userId,
        repository: marker,
        path: 'retroactive',
        contextId: marker + '-context',
        resourceLinkId: marker + '-resource-b',
        pointsPossible: 10,
        dueDate: retroDue,
        dueDateObservedAt: new Date(),
        resultScore: 0.75,
        resultTotalScore: 7.5,
        resultScoreObservedAt:
            new Date(Date.now() - 5 * 60 * 1000),
        recentBestScoreObservations: []
    });

    var zeroDue = new Date(Date.now() - 10 * 60 * 1000);
    var inferredZero = new mdb.LtiBridge({
        ltiId: marker + '-zero',
        user: userId,
        repository: marker,
        path: 'inferred-zero',
        contextId: marker + '-context',
        resourceLinkId: marker + '-resource-c',
        pointsPossible: 10,
        dueDate: zeroDue,
        dueDateObservedAt: new Date()
    });

    Promise.all([
        authoritative.save(),
        retroactive.save(),
        inferredZero.save()
    ])
        .then(function(saved) {
            saved.forEach(function(bridge) {
                bridgeIds.push(bridge._id);
            });

            return mdb.ProgressMilestone.create({
                user: userId,
                repository: marker,
                path: 'retroactive',
                score: 0.60,
                canvasPointsPossible: 10,
                canvasScore: 6,
                observedAt:
                    new Date(retroDue.getTime() - 2 * 60 * 1000),
                windowStartedAt:
                    new Date(retroDue.getTime() - 4 * 60 * 1000),
                source: 'gradebook',
                bridge: retroactive._id,
                contextId: retroactive.contextId,
                resourceLinkId: retroactive.resourceLinkId
            });
        })
        .then(function() {
            return ensureBoundary(
                authoritative,
                'due',
                new Date()
            );
        })
        .then(function(result) {
            if (
                !result.milestone ||
                result.milestone.boundaryEvidence !== 'authoritative' ||
                Number(result.milestone.score) !== 0.87
            ) {
                fail('Authoritative Due boundary test failed.');
            }

            console.log(
                'PASS authoritative boundary: 87% at trusted pre-Due observation'
            );

            return ensureBoundary(
                retroactive,
                'due',
                new Date()
            );
        })
        .then(function(result) {
            if (
                result.milestone ||
                result.status !==
                    'boundary-requires-reconstruction'
            ) {
                fail(
                    'Retroactive Due boundary should require reconstruction.'
                );
            }

            console.log(
                'PASS retroactive boundary: preserved as approximate/reconstructed'
            );

            return ensureBoundary(
                inferredZero,
                'due',
                new Date()
            );
        })
        .then(function(result) {
            if (
                !result.milestone ||
                result.milestone.boundaryEvidence !==
                    'inferred-zero-no-prior-observation' ||
                Number(result.milestone.score) !== 0
            ) {
                fail('Inferred-zero Due boundary test failed.');
            }

            console.log(
                'PASS inferred-zero boundary: no pre-Due observation recorded'
            );
        })
        .then(function() {
            return cleanup();
        })
        .then(function() {
            console.log(
                'PASS cleanup: disposable smoke-test records removed'
            );
            return mdb.mongoose.disconnect();
        })
        .then(function() {
            process.exit(0);
        })
        .catch(function(testErr) {
            console.error('GRADE BOUNDARY SMOKE TEST FAILED');
            console.error(testErr);

            cleanup()
                .catch(function(cleanupErr) {
                    console.error('Cleanup also failed:');
                    console.error(cleanupErr);
                })
                .then(function() {
                    return mdb.mongoose.disconnect();
                })
                .then(function() {
                    process.exit(1);
                });
        });
});
