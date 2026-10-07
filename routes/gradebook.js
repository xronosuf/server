var mdb = require('../mdb');
var legacyHttpClient = require('../lib/legacy-http-client');
var gradebookRetryPolicy = require('../lib/gradebook-retry-policy');
var lateGradePolicy = require('../lib/late-grade-policy');
var ltiOutcomesClient = require('../lib/lti-outcomes-client');
var lateGradeEvidence = require('../lib/late-grade-evidence');
var gradeSyncRuntime = require('../lib/grade-sync-runtime');
var gradeSyncDiagnosticReport = require('../lib/grade-sync-diagnostic-report');
var ltiLaunchReference = require('../lib/lti-launch-reference');
var pug = require('pug');
var path = require('path');
var config = require('../config');
var async = require('async');
var crypto = require('crypto');
var progressMilestones = require('./progress-milestones');
var gradeBoundaryPolicy = require('../lib/grade-boundary-policy');

const Redis = require("ioredis");

// create a new redis client and connect to our local redis instance
var client = new Redis({ host: config.redis.url, port: config.redis.port });

// if an error occurs, print it to the console
client.on('error', function (err) {
    console.log("Error " + err);
});

var passback = pug.compileFile(path.join(__dirname,'../views/lti/passback.pug'));

function canvasPassbackSucceeded(response, body) {
    var statusCode = response && response.statusCode;
    var bodyText = (body || '').toString();

    return statusCode >= 200 && statusCode < 300 &&
        /<imsx_codeMajor>\s*success\s*<\/imsx_codeMajor>/i.test(bodyText);
}

function compactCanvasResponse(body) {
    return (body || '')
        .toString()
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500);
}

function logCanvasPassbackFailure(bridge, response, body) {
    var statusCode = response && response.statusCode;
    var excerpt = compactCanvasResponse(body);

    console.log(
        'Canvas grade passback was not accepted for bridge ' +
        bridge._id +
        ' (' + bridge.repository + '/' + bridge.path + '): HTTP ' +
        (statusCode || 'unknown')
    );

    if (excerpt) {
        console.log('Canvas passback response excerpt: ' + excerpt);
    }
}

function logCanvasPassbackSuccess(bridge) {
    console.log(
        'Canvas grade passback accepted for bridge ' +
        bridge._id +
        ' (' + bridge.repository + '/' + bridge.path + '): ' +
        'resultScore=' + bridge.resultScore +
        ', resultTotalScore=' + bridge.resultTotalScore +
        ', pointsPossible=' + bridge.pointsPossible
    );
}

// We now wait many minutes for grades to settle
var DEBOUNCE = 1000 * 60 * 3;
var FAST_RETRY_DELAY = 1000 * 60;
var FAST_RETRY_WINDOW = 1000 * 60 * 60;
var SLOW_RETRY_DELAY = 1000 * 60 * 60;
var MAX_RETRY_WINDOW = 1000 * 60 * 60 * 24;
var BOUNDARY_QUEUE = 'gradebook-boundaries';

function clearRetryState(bridge) {
    bridge.passbackRetryStartedAt = undefined;
    bridge.passbackRetryAttempts = 0;
    bridge.passbackNextRetryAt = undefined;
    bridge.passbackRetryExhaustedAt = undefined;
}

function retryBridge(bridge, callback) {
    var now = Date.now();
    var startedAt = bridge.passbackRetryStartedAt
        ? new Date(bridge.passbackRetryStartedAt).getTime()
        : now;
    var elapsed = now - startedAt;
    var delay;
    var retryAt;

    if (elapsed >= MAX_RETRY_WINDOW) {
        bridge.passbackRetryStartedAt = new Date(startedAt);
        bridge.passbackRetryExhaustedAt = new Date(now);
        bridge.passbackNextRetryAt = undefined;

        bridge.save()
            .then(function() {
                console.log(
                    'Stopped automatic Canvas passback retries after 24 hours for bridge ' +
                    bridge._id
                );
                callback(null);
            })
            .catch(callback);
        return;
    }

    delay = elapsed < FAST_RETRY_WINDOW
        ? FAST_RETRY_DELAY
        : SLOW_RETRY_DELAY;
    retryAt = Math.min(
        now + delay,
        startedAt + MAX_RETRY_WINDOW
    );

    bridge.passbackRetryStartedAt = new Date(startedAt);
    bridge.passbackRetryAttempts =
        Number(bridge.passbackRetryAttempts || 0) + 1;
    bridge.passbackNextRetryAt = new Date(retryAt);
    bridge.passbackRetryExhaustedAt = undefined;

    bridge.save()
        .then(function() {
            client.zadd(
                'gradebook',
                retryAt,
                bridge._id.toString(),
                function(err) {
                    if (err) {
                        callback(err);
                        return;
                    }

                    console.log(
                        'Requeued Canvas grade passback for bridge ' +
                        bridge._id +
                        ' (' + bridge.repository + '/' + bridge.path + ')' +
                        ' after transient failure; attempt=' +
                        bridge.passbackRetryAttempts +
                        ', next=' + new Date(retryAt).toISOString()
                    );

                    callback(null);
                }
            );
        })
        .catch(callback);
}

function canvasPointsPossible(bridge) {
    return parseFloat(bridge && bridge.pointsPossible);
}

function bridgeHasGradePassback(bridge) {
    var pointsPossible = canvasPointsPossible(bridge);

    return !!(
        bridge &&
        bridge.lisResultSourcedid &&
        bridge.lisOutcomeServiceUrl &&
        !isNaN(pointsPossible) &&
        pointsPossible > 0
    );
}

function bridgeIsOpen(bridge, now) {
    return lateGradePolicy.bridgeIsPassbackWindowOpen(
        bridge,
        now
    );
}

function boundaryMember(bridge, type, boundaryAt) {
    return [
        bridge._id.toString(),
        type,
        new Date(boundaryAt).getTime()
    ].join('|');
}

function scheduleBridgeBoundaries(bridge, callback) {
    var now = Date.now();
    var descriptors = gradeBoundaryPolicy.descriptors(bridge);
    var future = descriptors.filter(function(descriptor) {
        return descriptor.boundaryAt.getTime() > now;
    });

    callback = callback || function() {};

    /*
     * Immediately reconcile already-passed boundaries. This creates an inferred
     * zero for a first launch after a deadline, but deliberately refuses to turn
     * a retroactively moved earlier deadline into authoritative evidence.
     */
    async.eachSeries(
        descriptors,
        function(descriptor, next) {
            if (descriptor.boundaryAt.getTime() > now) {
                next(null);
                return;
            }

            progressMilestones.ensureBoundary(
                bridge,
                descriptor.type,
                new Date(now),
                function(err) {
                    if (err) {
                        console.log(
                            'Error reconciling grade boundary for bridge ' +
                            bridge._id
                        );
                        console.log(err);
                    }
                    next(err);
                }
            );
        },
        function(err) {
            if (err) {
                callback(err);
                return;
            }

            async.each(
                future,
                function(descriptor, next) {
                    client.zadd(
                        BOUNDARY_QUEUE,
                        descriptor.boundaryAt.getTime(),
                        boundaryMember(
                            bridge,
                            descriptor.type,
                            descriptor.boundaryAt
                        ),
                        next
                    );
                },
                callback
            );
        }
    );
}

function queueBridge(bridge, callback) {
    var debouncedTime = Date.now() + DEBOUNCE;
    var windowEnd = lateGradePolicy.passbackWindowEnd(bridge).time;

    /*
     * If the debounce would cross the eligibility boundary, intentionally queue
     * just after it. The worker can then deliver the last server-observed
     * pre-boundary candidate instead of racing the exact closing timestamp.
     */
    if (windowEnd !== null && debouncedTime > windowEnd) {
        debouncedTime = windowEnd + 1000;
    }

    scheduleBridgeBoundaries(bridge, function(boundaryErr) {
        if (boundaryErr) {
            callback(boundaryErr);
            return;
        }

        client.zadd(
            'gradebook',
            debouncedTime,
            bridge._id.toString(),
            callback
        );
    });
}

function queueBridgeAt(bridge, when, reason, callback) {
    client.zadd('gradebook', when, bridge._id.toString(), function(err) {
        if (!err) {
            console.log(
                'Deferred Canvas grade passback for bridge ' +
                bridge._id +
                ' until ' + new Date(when).toISOString() +
                ' (' + reason + ')'
            );
        }

        callback(err);
    });
}

function saveLatePolicyObservation(observation, callback) {
    if (!observation) {
        callback(null);
        return;
    }

    mdb.LateGradePolicyObservation.create(observation)
        .then(function() {
            callback(null);
        })
        .catch(callback);
}

function loadLatePolicyEvidence(bridge, canvasScore, callback) {
    var identity = lateGradeEvidence.contextIdentity(bridge);

    if (!identity) {
        callback(null, {
            localObservation: null,
            contextPolicy: lateGradePolicy.deriveContextPolicy([])
        });
        return;
    }

    mdb.LateGradePolicyObservation.find({
        toolConsumerInstanceGuid: identity.toolConsumerInstanceGuid,
        contextId: identity.contextId
    })
        .sort({observedAt: -1})
        .limit(100)
        .lean()
        .exec()
        .then(function(documents) {
            var currentObservation =
                lateGradeEvidence.observationFromLastSubmission(
                    bridge,
                    canvasScore
                );

            function finish(extraObservation) {
                var all = documents.slice();

                if (extraObservation) {
                    all.unshift(extraObservation);
                }

                var localObservation = all.find(function(document) {
                    return document.bridge &&
                        document.bridge.toString() === bridge._id.toString() &&
                        Math.abs(Number(document.effectiveScore) - Number(canvasScore)) <=
                            lateGradePolicy.EVIDENCE_TOLERANCE;
                }) || null;

                callback(null, {
                    localObservation: localObservation,
                    contextPolicy: lateGradePolicy.deriveContextPolicy(
                        lateGradeEvidence.policyObservations(all)
                    )
                });
            }

            if (!currentObservation) {
                finish(null);
                return;
            }

            saveLatePolicyObservation(currentObservation, function(saveErr) {
                if (saveErr) {
                    callback(saveErr);
                    return;
                }

                finish(currentObservation);
            });
        })
        .catch(callback);
}

exports.bridgeHasGradePassback = bridgeHasGradePassback;
exports.bridgeIsOpen = bridgeIsOpen;
exports.queueBridge = queueBridge;
exports.scheduleBridgeBoundaries = scheduleBridgeBoundaries;

function recordProgressMilestoneForBridge(req, repositoryName, bridge, observedAt) {
    if (bridge && bridge.instructionalStaff) {
        return;
    }

    progressMilestones.record({
        user: req.user && req.user._id,
        repository: repositoryName,
        path: req.params.path,
        pointsEarned: req.body && req.body.pointsEarned,
        pointsPossible: req.body && req.body.pointsPossible,
        bridge: bridge,
        source: 'gradebook',
        observedAt: observedAt
    }, function(err) {
        if (err) {
            console.log(
                'Error recording progress milestone for bridge ' +
                (bridge && bridge._id ? bridge._id : 'unknown')
            );
            console.log(err);
        }
    });
}


function processGradebook(id, callback) {
    console.log('Processing gradebook ' + id);

    mdb.LtiBridge.findOne({
        _id: new mdb.ObjectId(id)
    })
        .exec()
        .then(function(bridge) {
            if (!bridge) {
                callback(null);
                return null;
            }

            var passbackWindow = lateGradePolicy.passbackWindowEnd(bridge);
            var deliveryAfterCutoff =
                passbackWindow.time !== null &&
                Date.now() > passbackWindow.time;
            var scoreObservedAt =
                gradeBoundaryPolicy.timeValue(
                    bridge.resultScoreObservedAt
                );
            var boundaryBackedDelivery =
                deliveryAfterCutoff &&
                (
                    passbackWindow.source === 'canvas-until' ||
                    passbackWindow.source === 'xronos-due-date-setting'
                );
            var frozenCandidateEligible =
                boundaryBackedDelivery &&
                scoreObservedAt !== null &&
                scoreObservedAt <= passbackWindow.time;
            var policyNow = deliveryAfterCutoff && scoreObservedAt !== null
                ? scoreObservedAt
                : Date.now();

            if (deliveryAfterCutoff && !frozenCandidateEligible) {
                console.log(
                    'Canvas eligibility boundary passed without a trusted pre-boundary candidate for bridge ' +
                    bridge._id
                );
                callback(null);
                return null;
            }

            if (boundaryBackedDelivery) {
                var controllingType =
                    passbackWindow.source === 'canvas-until'
                        ? gradeBoundaryPolicy.UNTIL_TYPE
                        : gradeBoundaryPolicy.DUE_TYPE;

                progressMilestones.ensureBoundary(
                    bridge,
                    controllingType,
                    new Date(),
                    function(boundaryErr) {
                        if (boundaryErr) {
                            console.log(
                                'Could not finalize controlling boundary before passback for bridge ' +
                                bridge._id
                            );
                            console.log(boundaryErr);
                        }
                    }
                );
            }

            var pox = passback({
                messageIdentifier: crypto.randomUUID(),
                resultDataUrl:
                    config.root +
                    '/users/' +
                    bridge.user._id +
                    '/' +
                    bridge.repository +
                    '/' +
                    bridge.path,
                resultScore:
                    bridge.resultScore,
                resultTotalScore:
                    bridge.resultTotalScore,
                submittedAt:
                    boundaryBackedDelivery &&
                    bridge.submissionSubmittedAtAccepted === true &&
                    scoreObservedAt !== null
                        ? new Date(scoreObservedAt).toISOString()
                        : null,
                sourcedId:
                    bridge.lisResultSourcedid
            });

            var url =
                bridge.lisOutcomeServiceUrl;

            return mdb.KeyAndSecret.findOne({
                ltiKey:
                    bridge.oauthConsumerKey
            })
                .exec()
                .then(function(keyAndSecret) {
                    if (!keyAndSecret) {
                        callback(
                            "Missing LTI secret."
                        );
                        return;
                    }

                    var oauth = {
                        callback:
                            "about:blank",
                        body_hash:
                            true,
                        consumer_key:
                            keyAndSecret.ltiKey,
                        consumer_secret:
                            keyAndSecret.ltiSecret,
                        signature_method:
                            bridge.oauthSignatureMethod
                    };

                    function sendPassback(lateMetadata) {
                        legacyHttpClient.postOAuth1Xml(
                        {
                            url: url,
                            body: pox,
                            callback: oauth.callback,
                            consumerKey:
                                oauth.consumer_key,
                            consumerSecret:
                                oauth.consumer_secret,
                            signatureMethod:
                                oauth.signature_method,
                            headers: {
                                'Content-Type':
                                    'application/xml',
                                'User-Agent':
                                    'Xronos/1.0 ' +
                                    '(University of Florida; ' +
                                    'https://xronos.clas.ufl.edu)'
                            }
                        },
                        function(
                            err,
                            response,
                            body
                        ) {
                            if (err) {
                                console.log(
                                    'Error when posting:'
                                );
                                console.log(err);

                                if (
                                    gradebookRetryPolicy.shouldRetry(
                                        err,
                                        response
                                    )
                                ) {
                                    retryBridge(
                                        bridge,
                                        callback
                                    );
                                } else {
                                    callback(null);
                                }
                            } else if (
                                canvasPassbackSucceeded(
                                    response,
                                    body
                                )
                            ) {
                                logCanvasPassbackSuccess(
                                    bridge
                                );

                                var acceptedAt = new Date();

                                bridge.submittedScore = true;
                                bridge.lastSubmittedResultScore =
                                    bridge.resultScore;
                                bridge.lastSubmittedResultTotalScore =
                                    bridge.resultTotalScore;
                                bridge.lastSubmittedAt = acceptedAt;
                                clearRetryState(bridge);

                                function saveAcceptedBridge() {
                                    bridge
                                        .save()
                                        .then(function() {
                                            callback(null);
                                        })
                                        .catch(function(err) {
                                            callback(err);
                                        });
                                }

                                if (!lateMetadata) {
                                    saveAcceptedBridge();
                                    return;
                                }

                                ltiOutcomesClient.readResult(
                                    bridge,
                                    keyAndSecret,
                                    function(verifyErr, verifiedResult) {
                                        if (
                                            verifyErr ||
                                            !verifiedResult ||
                                            !verifiedResult.ok ||
                                            !verifiedResult.hasResult
                                        ) {
                                            console.log(
                                                'Late Canvas passback accepted but post-write verification failed for bridge ' +
                                                bridge._id
                                            );
                                            if (verifyErr) {
                                                console.log(verifyErr);
                                            }
                                            saveAcceptedBridge();
                                            return;
                                        }

                                        var observation =
                                            lateGradeEvidence.observationFromAcceptedLatePassback(
                                                bridge,
                                                lateMetadata.rawScore,
                                                verifiedResult.score,
                                                lateMetadata.lateIntervals,
                                                acceptedAt
                                            );

                                        saveLatePolicyObservation(
                                            observation,
                                            function(observationErr) {
                                                if (observationErr) {
                                                    console.log(
                                                        'Could not save Canvas late-policy observation for bridge ' +
                                                        bridge._id
                                                    );
                                                    console.log(observationErr);
                                                } else {
                                                    console.log(
                                                        'Recorded Canvas late-policy observation for bridge ' +
                                                        bridge._id +
                                                        ': raw=' + lateMetadata.rawScore +
                                                        ', effective=' + verifiedResult.score +
                                                        ', intervals=' + lateMetadata.lateIntervals
                                                    );
                                                }

                                                saveAcceptedBridge();
                                            }
                                        );
                                    }
                                );
                            } else {
                                logCanvasPassbackFailure(
                                    bridge,
                                    response,
                                    body
                                );

                                if (
                                    gradebookRetryPolicy.shouldRetry(
                                        null,
                                        response
                                    )
                                ) {
                                    retryBridge(
                                        bridge,
                                        callback
                                    );
                                } else {
                                    callback(null);
                                }
                            }
                        }
                    );
                    }

                    if (boundaryBackedDelivery) {
                        console.log(
                            'Delivering trusted pre-boundary Canvas candidate after cutoff for bridge ' +
                            bridge._id +
                            '; observedAt=' +
                            new Date(scoreObservedAt).toISOString() +
                            ', boundary=' +
                            new Date(passbackWindow.time).toISOString()
                        );
                    }

                    if (!lateGradePolicy.bridgeIsLate(bridge, policyNow)) {
                        sendPassback();
                        return;
                    }

                    var boundaryDecision =
                        lateGradePolicy.lateBoundaryDecision(
                            bridge,
                            policyNow
                        );

                    if (!boundaryBackedDelivery && boundaryDecision.defer) {
                        queueBridgeAt(
                            bridge,
                            boundaryDecision.retryAt,
                            boundaryDecision.reason,
                            callback
                        );
                        return;
                    }

                    ltiOutcomesClient.readResult(
                        bridge,
                        keyAndSecret,
                        function(readErr, canvasResult) {
                            if (readErr || !canvasResult || !canvasResult.ok) {
                                console.log(
                                    'Could not verify Canvas grade before late passback for bridge ' +
                                    bridge._id
                                );
                                if (readErr) {
                                    console.log(readErr);
                                }

                                retryBridge(bridge, callback);
                                return;
                            }

                            var candidateRawScore =
                                lateGradeEvidence.candidateRawScore(bridge);
                            var currentLateIntervals =
                                lateGradePolicy.lateIntervalNumber(
                                    bridge,
                                    policyNow
                                );

                            loadLatePolicyEvidence(
                                bridge,
                                canvasResult.score,
                                function(evidenceErr, evidence) {
                                    if (evidenceErr) {
                                        console.log(
                                            'Could not load Canvas late-policy evidence for bridge ' +
                                            bridge._id
                                        );
                                        console.log(evidenceErr);
                                        callback(null);
                                        return;
                                    }

                                    var decision = lateGradePolicy.latePassbackDecision({
                                        canvasHasResult: canvasResult.hasResult,
                                        canvasScore: canvasResult.score,
                                        candidateRawScore: candidateRawScore,
                                        currentLateIntervals: currentLateIntervals,
                                        localObservation: evidence.localObservation,
                                        contextPolicy: evidence.contextPolicy
                                    });

                                    if (!decision.allow) {
                                        console.log(
                                            'Blocked late Canvas passback for bridge ' +
                                            bridge._id +
                                            ': ' + decision.reason
                                        );
                                        callback(null);
                                        return;
                                    }

                                    console.log(
                                        'Verified safe late Canvas passback for bridge ' +
                                        bridge._id +
                                        ': ' + decision.reason +
                                        ', predictedFloorless=' +
                                        decision.predictedFloorlessScore
                                    );
                                    sendPassback({
                                        rawScore: candidateRawScore,
                                        lateIntervals: currentLateIntervals
                                    });
                                }
                            );
                        }
                    );
                });
        })
        .catch(function(err) {
            callback(err);
        });
}

function parseBoundaryMember(value) {
    var parts = (value || '').split('|');
    var timestamp;

    if (parts.length !== 3) {
        return null;
    }

    timestamp = Number(parts[2]);

    if (
        !parts[0] ||
        (
            parts[1] !== gradeBoundaryPolicy.DUE_TYPE &&
            parts[1] !== gradeBoundaryPolicy.UNTIL_TYPE
        ) ||
        !isFinite(timestamp)
    ) {
        return null;
    }

    return {
        bridgeId: parts[0],
        type: parts[1],
        boundaryAt: timestamp
    };
}

function processBoundaryMember(value, callback) {
    var parsed = parseBoundaryMember(value);

    if (!parsed) {
        callback(null);
        return;
    }

    mdb.LtiBridge.findOne({
        _id: new mdb.ObjectId(parsed.bridgeId)
    })
        .exec()
        .then(function(bridge) {
            if (!bridge) {
                callback(null);
                return;
            }

            var currentBoundary =
                gradeBoundaryPolicy.boundaryAt(
                    bridge,
                    parsed.type
                );

            /*
             * Stale queue members are expected after an instructor changes a
             * Canvas date. They must never create a snapshot for a boundary
             * that is no longer current on the bridge.
             */
            if (currentBoundary !== parsed.boundaryAt) {
                callback(null);
                return;
            }

            progressMilestones.ensureBoundary(
                bridge,
                parsed.type,
                new Date(),
                function(err, milestone, status) {
                    if (!err && milestone) {
                        console.log(
                            'Finalized ' + parsed.type +
                            ' grade boundary for bridge ' +
                            bridge._id +
                            ' at ' +
                            new Date(parsed.boundaryAt).toISOString() +
                            ' (' + status + ')'
                        );
                    }

                    callback(err);
                }
            );
        })
        .catch(callback);
}

function processBoundaries(done) {
    done = done || function() {};

    client.zrangebyscore(
        BOUNDARY_QUEUE,
        -Infinity,
        Date.now(),
        function(err, responses) {
            if (err) {
                console.log('Boundary processing error:');
                console.log(err);
                done(err);
                return;
            }

            async.each(
                responses,
                function(response, callback) {
                    client.zrem(
                        BOUNDARY_QUEUE,
                        response,
                        function(removeErr, count) {
                            if (removeErr || count !== 1) {
                                callback(removeErr);
                                return;
                            }

                            processBoundaryMember(
                                response,
                                callback
                            );
                        }
                    );
                },
                function(batchErr) {
                    if (batchErr) {
                        console.log(
                            'Grade boundary batch processing error:'
                        );
                        console.log(batchErr);
                    }

                    done(batchErr);
                }
            );
        }
    );
}

function process() {
	// console.log('Running process')
    client.zrangebyscore('gradebook', -Infinity, Date.now(), function(err, responses) {
		//console.log('Responses ')
		//console.log(responses)
	if (err){
		console.log('Processing error:')
		console.log(err)
		return;
	}
	async.each( responses, function(response, callback) {
		
	    client.zrem( 'gradebook', response, function(err, count) {
		if ((!err) && (count == 1)) {
		    processGradebook(response, callback);
		} else {
			console.log(err)
		    callback(err);
		}
	    });
	}, function(err) {
        if (err) {
            console.log('Gradebook batch processing error:');
            console.log(err);
        }
    });
    });
}
// Finalize any crossed boundary before processing passback work from
// the same polling cycle. processGradebook also performs a defensive boundary
// finalization, so correctness does not depend on exact timer ordering.
setInterval(function() {
    processBoundaries(function() {
        process();
    });
}, 10000);

function gradebookRequestPayload(req) {
    var body = (req && req.body) || {};
    var query = (req && req.query) || {};

    return {
        pointsEarned:
            body.pointsEarned !== undefined
                ? body.pointsEarned
                : query.pointsEarned,
        pointsPossible:
            body.pointsPossible !== undefined
                ? body.pointsPossible
                : query.pointsPossible
    };
}

function finiteGradebookNumber(value) {
    var number;

    if (
        value === undefined ||
        value === null ||
        value === '' ||
        typeof value === 'boolean'
    ) {
        return undefined;
    }

    number = Number(value);

    if (!isFinite(number)) {
        return undefined;
    }

    return number;
}

function validateGradebookPayload(payload) {
    var pointsEarned = finiteGradebookNumber(
        payload && payload.pointsEarned
    );
    var pointsPossible = finiteGradebookNumber(
        payload && payload.pointsPossible
    );
    var normalizedScore;

    if (pointsEarned === undefined) {
        return {
            valid: false,
            field: 'pointsEarned',
            message: 'pointsEarned must be a finite number.'
        };
    }

    if (pointsPossible === undefined || pointsPossible <= 0) {
        return {
            valid: false,
            field: 'pointsPossible',
            message: 'pointsPossible must be a finite number greater than zero.'
        };
    }

    normalizedScore = pointsEarned / pointsPossible;

    if (!isFinite(normalizedScore)) {
        return {
            valid: false,
            field: 'score',
            message: 'The normalized grade must be finite.'
        };
    }

    return {
        valid: true,
        pointsEarned: pointsEarned,
        pointsPossible: pointsPossible,
        normalizedScore: normalizedScore
    };
}

exports.validateGradebookPayload = validateGradebookPayload;

exports.record = function(req, res, next) {
    var repositoryName = req.params.repository;
    var observedAt = new Date();
    var now = observedAt.getTime();
    var requestPayload = gradebookRequestPayload(req);
    var payloadValidation = validateGradebookPayload(requestPayload);

    if (!req.user) {
        next('No user logged in.');
    } else if (!payloadValidation.valid) {
        console.log(
            'Rejected invalid gradebook payload for ' +
            req.user._id +
            ' (' + repositoryName + '/' + req.params.path + '): ' +
            payloadValidation.message
        );

        res.status(400).json({
            ok: false,
            error: 'invalid-gradebook-payload',
            field: payloadValidation.field,
            message: payloadValidation.message
        });
    } else {
        /*
         * Normalize the accepted values once so milestone recording and bridge
         * calculations use the same validated numbers. This also preserves
         * compatibility with the legacy GET route, where values may arrive
         * through req.query instead of req.body.
         */
        req.body = req.body || {};
        req.body.pointsEarned = payloadValidation.pointsEarned;
        req.body.pointsPossible = payloadValidation.pointsPossible;

        console.log('gradebook.record for ' + req.user._id + ' (' + repositoryName +'/'+ req.params.path +')');

        mdb.LtiBridge.find({
            user: req.user._id,
            repository: repositoryName,
            path: req.params.path
        })
            .exec()
            .then(function(bridges) {
                async.each(bridges,
                    function(bridge, callback) {
                        var pointsPossible;
                        var resultScore;
                        var resultTotalScore;
                        var better;

                        /*
                         * Preserve the server receipt time as the trusted score
                         * observation clock. Reconcile any boundary crossed
                         * since the previous request before this request can
                         * replace the bridge candidate.
                         */
                        bridge.recentBestScoreObservations =
                            gradeBoundaryPolicy.appendRecentBest(
                                bridge.recentBestScoreObservations,
                                gradeBoundaryPolicy.observationFromBridge(bridge)
                            );

                        gradeBoundaryPolicy.descriptors(bridge)
                            .forEach(function(descriptor) {
                                if (descriptor.boundaryAt.getTime() <= now) {
                                    progressMilestones.ensureBoundary(
                                        bridge,
                                        descriptor.type,
                                        observedAt,
                                        function(boundaryErr) {
                                            if (boundaryErr) {
                                                console.log(
                                                    'Error finalizing crossed grade boundary for bridge ' +
                                                    bridge._id
                                                );
                                                console.log(boundaryErr);
                                            }
                                        }
                                    );
                                }
                            });

                        recordProgressMilestoneForBridge(
                            req,
                            repositoryName,
                            bridge,
                            observedAt
                        );

                        /*
                         * Bridges without passback fields cannot sync to Canvas.
                         * Keep reporting them in gradeSync, but do not queue them.
                         */
                        if (!bridgeHasGradePassback(bridge)) {
                            callback(null);
                            return;
                        }

                        // Permit late work while the Canvas availability/passback
                        // window remains open.  processGradebook performs the
                        // readResult safety check immediately before a late write.
                        if (!bridgeIsOpen(bridge, now)) {
                            callback(null);
                            return;
                        }

                        pointsPossible = parseFloat(bridge.pointsPossible);

                        // BADBAD: round to a couple decimal places to avoid some weird appearances on canvas
                        resultScore = Math.ceil(100 * parseFloat(req.body.pointsEarned) / parseFloat(req.body.pointsPossible)) / 100.0;
                        resultTotalScore = Math.ceil(100 * parseFloat(req.body.pointsEarned) / parseFloat(req.body.pointsPossible) * pointsPossible)/100.0;

                        // No need to record zeros in the gradebook
                        if (resultScore == 0) {
                            callback(null);
                            return;
                        }

                        better = false;

                        /*
                         * Older bridges predate explicit last-submitted fields.
                         * If the legacy submittedScore flag still proves that the
                         * current stored result was accepted, preserve that raw
                         * score before replacing resultScore with a better candidate.
                         */
                        if (
                            bridge.submittedScore === true &&
                            bridge.lastSubmittedResultScore === undefined &&
                            bridge.resultScore !== undefined
                        ) {
                            bridge.lastSubmittedResultScore = bridge.resultScore;
                            bridge.lastSubmittedResultTotalScore =
                                bridge.resultTotalScore;
                        }

                        /*
                         * resultScore and resultTotalScore describe the same
                         * Xronos progress.  Update them as a pair so a later
                         * pointsPossible or rounding change cannot leave a
                         * bridge with fields from two different calculations.
                         */
                        if ((!isNaN(resultScore)) && (!isNaN(resultTotalScore)) &&
                            ((!bridge.resultTotalScore) || (bridge.resultTotalScore < resultTotalScore))) {
                            bridge.resultScore = resultScore;
                            bridge.resultTotalScore = resultTotalScore;
                            bridge.resultScoreObservedAt = observedAt;
                            bridge.resultPointsEarned =
                                parseFloat(req.body.pointsEarned);
                            bridge.resultPointsPossible =
                                parseFloat(req.body.pointsPossible);
                            bridge.recentBestScoreObservations =
                                gradeBoundaryPolicy.appendRecentBest(
                                    bridge.recentBestScoreObservations,
                                    {
                                        resultScore: resultScore,
                                        resultTotalScore: resultTotalScore,
                                        pointsEarned:
                                            bridge.resultPointsEarned,
                                        pointsPossible:
                                            bridge.resultPointsPossible,
                                        observedAt: observedAt
                                    }
                                );
                            clearRetryState(bridge);
                            better = true;
                        }

                        if (better == false) {
                            callback(null);
                            return;
                        }

                        console.log('New best score for bridge: '+bridge.resultScore + ' / ' + bridge.resultTotalScore);
                        bridge.submittedScore = false;

                        bridge
                            .save()
                            .then(function() {
                                queueBridge(
                                    bridge,
                                    function(err) {
                                        callback(err);
                                    }
                                );
                            })
                            .catch(function(err) {
                                callback(err);
                            });
                    },
                    function(err) {
                        if (err) {
                            res.status(500).json(err);
                            return;
                        }

                        gradeSyncRuntime.load(
                            client,
                            bridges,
                            now,
                            function(runtimeErr, runtime) {
                                if (runtimeErr) {
                                    next(runtimeErr);
                                    return;
                                }

                                var page = {
                                    repository: repositoryName,
                                    path: req.params.path
                                };
                                var reference =
                                    ltiLaunchReference.read(req);
                                var diagnosticReport =
                                    gradeSyncDiagnosticReport.build({
                                        reference: reference,
                                        allUserBridges: bridges,
                                        page: page,
                                        runtime: runtime
                                    });

                                res.json({
                                    ok: true,
                                    gradeSync: runtime.status,
                                    gradeSyncDiagnostics:
                                        diagnosticReport
                                });
                            }
                        );
                    });
            })
            .catch(function(err) {
                console.log(err);
                next(err);
            });
    }
};

