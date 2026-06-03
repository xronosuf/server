var mdb = require('../mdb');
var request = require('request');
var pug = require('pug');
var path = require('path');
var config = require('../config');
var async = require('async');
const uuidv1 = require('uuid/v1');
var mongo = require('mongodb');

const Redis = require("ioredis");

// create a new redis client and connect to our local redis instance
var client = new Redis({ host: config.redis.url, port: config.redis.port });

// if an error occurs, print it to the console
client.on('error', function (err) {
    console.log("Error " + err);
});

var passback = pug.compileFile(path.join(__dirname,'../views/lti/passback.pug'));

// We now wait many minutes for grades to settle
var DEBOUNCE = 1000 * 60 * 3;

function processGradebook(id, callback) {
	console.log('Processing gradebook ' + id)
    mdb.LtiBridge.findOne( {_id: new mongo.ObjectID(id) }, function(err, bridge) {
	if (err) {
	    callback(err);
	    return;
	}
	
	var pox = passback({
	    messageIdentifier: uuidv1(),
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
			    }
			}, function(err, response, body) {
			    if (err) {
					console.log('Error when posting:')
					console.log(err)
				callback(err);
			    } else {
				bridge.submittedScore = true;
				bridge.save(callback);
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

exports.record = function(req, res, next) {
    var repositoryName = req.params.repository;
    var now = Date.now();

    var bridgeHasGradePassback = function(bridge) {
        var pointsPossible = parseInt(bridge.pointsPossible);

        return !!(
            bridge &&
            bridge.lisResultSourcedid &&
            bridge.lisOutcomeServiceUrl &&
            !isNaN(pointsPossible) &&
            pointsPossible > 0
        );
    };

    var bridgeIsOpen = function(bridge) {
        return !(bridge && bridge.dueDate && bridge.dueDate < now);
    };

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
    } else {
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

                        pointsPossible = parseInt(bridge.pointsPossible);

                        // BADBAD: round to a couple decimal places to avoid some weird appearances on canvas
                        resultScore = Math.ceil(100 * parseFloat(req.body.pointsEarned) / parseFloat(req.body.pointsPossible)) / 100.0;
                        resultTotalScore = Math.ceil(100 * parseFloat(req.body.pointsEarned) / parseFloat(req.body.pointsPossible) * pointsPossible)/100.0;

                        // No need to record zeros in the gradebook
                        if (resultScore == 0) {
                            callback(null);
                            return;
                        }

                        better = false;

                        if (((!bridge.resultScore) || (bridge.resultScore < resultScore)) && (!isNaN(resultScore))) {
                            bridge.resultScore = resultScore;
                            better = true;
                        }
                        if (((!bridge.resultTotalScore) || (bridge.resultTotalScore < resultTotalScore)) && (!isNaN(resultTotalScore))) {
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
                            if (!err) {
                                var debouncedTime = Date.now() + DEBOUNCE;
                                if (bridge.dueDate && debouncedTime > bridge.dueDate)
                                    debouncedTime = bridge.dueDate;

                                client.zadd('gradebook', debouncedTime, bridge._id.toString());
                                gradeSync.queuedGradePassbackCount += 1;
                                gradeSync.queuedGradePassback = true;
                            }

                            callback(err);
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

