var mdb = require('../mdb');
var request = require('request');
var pug = require('pug');
var path = require('path');
var config = require('../config');
var async = require('async');
var uuid = require('node-uuid');
var progressMilestones = require('./progress-milestones');

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
    now = now || Date.now();

    return !(bridge && bridge.dueDate && bridge.dueDate < now);
}

function queueBridge(bridge, callback) {
    var debouncedTime = Date.now() + DEBOUNCE;

    if (bridge.dueDate && debouncedTime > bridge.dueDate) {
        debouncedTime = bridge.dueDate;
    }

    client.zadd('gradebook', debouncedTime, bridge._id.toString(), callback);
}

exports.bridgeHasGradePassback = bridgeHasGradePassback;
exports.bridgeIsOpen = bridgeIsOpen;
exports.queueBridge = queueBridge;

function recordProgressMilestoneForBridge(req, repositoryName, bridge) {
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
        source: 'gradebook'
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
	console.log('Processing gradebook ' + id)
    mdb.LtiBridge.findOne( {_id: new mdb.ObjectId(id) }, function(err, bridge) {
	if (err) {
	    callback(err);
	    return;
	}
	
	var pox = passback({
	    messageIdentifier: uuid.v1(),
	    resultDataUrl: config.root + '/users/' + bridge.user._id + '/' + bridge.repository + '/' + bridge.path,
	    resultScore: bridge.resultScore,
	    resultTotalScore: bridge.resultTotalScore,
	    sourcedId: bridge.lisResultSourcedid
	});

	var url = bridge.lisOutcomeServiceUrl;
					
	mdb.KeyAndSecret.findOne(
	    {ltiKey: bridge.oauthConsumerKey},
	    function(err, keyAndSecret) {
		if (err) {
		    callback(err);
		} else {
		    if (!keyAndSecret) {
			callback("Missing LTI secret.");
		    } else {
			var oauth = {
			    callback: "about:blank",
			    body_hash: true,			
			    consumer_key: keyAndSecret.ltiKey,
			    consumer_secret: keyAndSecret.ltiSecret,
			    signature_method: bridge.oauthSignatureMethod
			};
			
			request.post({
			    uri: url,
			    body: pox,
			    oauth: oauth,
			    headers: {
				'Content-Type': 'application/xml',
				'User-Agent': 'Xronos/1.0 (University of Florida; https://xronos.clas.ufl.edu)',
			    }
			}, function(err, response, body) {
                    if (err) {
                        console.log('Error when posting:');
                        console.log(err);
                        callback(err);
                    } else if (canvasPassbackSucceeded(response, body)) {
                        logCanvasPassbackSuccess(bridge);
                        bridge.submittedScore = true;
                        bridge.save(callback);
                    } else {
                        logCanvasPassbackFailure(bridge, response, body);
                        callback(null);
                    }
                });
		    }
		}
	    });
    });
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
	});
    });
}
// Look if there is anything to process every few seconds
setInterval( process, 10000 );

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
    var now = Date.now();
    var requestPayload = gradebookRequestPayload(req);
    var payloadValidation = validateGradebookPayload(requestPayload);

    var buildGradeSyncStatus = function(bridges) {
        var status = {
            bridgeCount: bridges.length,
            gradePassbackBridgeCount: 0,
            activeGradePassbackBridgeCount: 0,
            queuedGradePassbackCount: 0,
            hasGradePassback: false,
            hasActiveGradePassback: false,
            queuedGradePassback: false,
            state: 'not-syncing',
            reason: 'no-bridge'
        };

        bridges.forEach(function(bridge) {
            if (bridgeHasGradePassback(bridge)) {
                status.gradePassbackBridgeCount += 1;

                if (bridgeIsOpen(bridge)) {
                    status.activeGradePassbackBridgeCount += 1;
                }
            }
        });

        status.hasGradePassback = status.gradePassbackBridgeCount > 0;
        status.hasActiveGradePassback = status.activeGradePassbackBridgeCount > 0;

        if (status.hasActiveGradePassback) {
            status.state = 'syncing';
            status.reason = 'active-passback';
        } else if (status.hasGradePassback) {
            status.state = 'not-syncing';
            status.reason = 'grade-passback-closed';
        } else if (status.bridgeCount > 0) {
            status.state = 'not-syncing';
            status.reason = 'missing-passback-fields';
        }

        return status;
    };

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

        mdb.LtiBridge.find( {user: req.user._id, repository: repositoryName, path:req.params.path }, function(err, bridges) {
            var gradeSync;

            if (err) {
                console.log(err);
                next(err);
            } else {
                gradeSync = buildGradeSyncStatus(bridges);

                async.each( bridges,
                    function(bridge, callback) {
                        var pointsPossible;
                        var resultScore;
                        var resultTotalScore;
                        var better;

                        recordProgressMilestoneForBridge(req, repositoryName, bridge);

                        /*
                         * Bridges without passback fields cannot sync to Canvas.
                         * Keep reporting them in gradeSync, but do not queue them.
                         */
                        if (!bridgeHasGradePassback(bridge)) {
                            callback(null);
                            return;
                        }

                        // Silently ignore attempts to submit homework after the due date
                        if (!bridgeIsOpen(bridge)) {
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
                         * resultScore and resultTotalScore describe the same
                         * Xronos progress.  Update them as a pair so a later
                         * pointsPossible or rounding change cannot leave a
                         * bridge with fields from two different calculations.
                         */
                        if ((!isNaN(resultScore)) && (!isNaN(resultTotalScore)) &&
                            ((!bridge.resultTotalScore) || (bridge.resultTotalScore < resultTotalScore))) {
                            bridge.resultScore = resultScore;
                            bridge.resultTotalScore = resultTotalScore;
                            better = true;
                        }

                        if (better == false) {
                            callback(null);
                            return;
                        }

                        console.log('New best score for bridge: '+bridge.resultScore + ' / ' + bridge.resultTotalScore);
                        bridge.submittedScore = false;

                        bridge.save(function(err) {
                            if (err) {
                                callback(err);
                                return;
                            }

                            queueBridge(bridge, function(err) {
                                if (!err) {
                                    gradeSync.queuedGradePassbackCount += 1;
                                    gradeSync.queuedGradePassback = true;
                                }

                                callback(err);
                            });
                        });
                    },
                    function(err) {
                        if (err)
                            res.status(500).json(err);
                        else
                            res.json({ok: true, gradeSync: gradeSync});
                    });
            }
        });
    }
};

