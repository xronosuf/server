/*
  The 'database' provides a mechanism for saving page state to the server.
*/
var $ = require('jquery');
var _ = require('underscore');
var async = require('async');
var jsondiffpatch = require('jsondiffpatch');
var initialStateProtocol = require("./initial-state-protocol");

var debugLog = require('./debug-log');
var pageRuntime = require('./page-runtime');

var CANON = require('canon');
var XXH = require('xxhashjs');

function checksumObject(object) {
    return XXH.h32( CANON.stringify( object ), 0x1337 ).toString(16);
}

var DIFFSYNC_DEBOUNCE = 5003; // milliseconds to wait to save
var socket = undefined;
var connectionAttempt = 0;

var WEBSOCKET_BACKOFF_BASE = 1000;
var WEBSOCKET_HEARTBEAT_INTERVAL = 18000;
var WEBSOCKET_HEARTBEAT_STALE = 45000;

var heartbeatTimer = undefined;
var heartbeatSocket = undefined;
var lastPongAt = undefined;
var heartbeatDegraded = false;

function stopHeartbeat(socketToStop) {
    if (
        socketToStop &&
        heartbeatSocket &&
        socketToStop !== heartbeatSocket
    ) {
        return false;
    }

    if (heartbeatTimer !== undefined) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
    }

    heartbeatSocket = undefined;
    lastPongAt = undefined;
    heartbeatDegraded = false;

    return true;
}

function startHeartbeat(socketForHeartbeat, attempt) {
    stopHeartbeat();

    heartbeatSocket = socketForHeartbeat;
    lastPongAt = Date.now();
    heartbeatDegraded = false;

    pageRuntime.service(
        "state-websocket-liveness",
        "checking",
        {
            attempt: attempt,
            heartbeatIntervalMilliseconds:
                WEBSOCKET_HEARTBEAT_INTERVAL,
            staleAfterMilliseconds:
                WEBSOCKET_HEARTBEAT_STALE
        }
    );

    function sendHeartbeat() {
        var now;
        var elapsed;

        if (
            heartbeatSocket !== socketForHeartbeat ||
            socketForHeartbeat.readyState !== WebSocket.OPEN
        ) {
            return;
        }

        now = Date.now();
        elapsed = now - lastPongAt;

        if (
            elapsed > WEBSOCKET_HEARTBEAT_STALE &&
            !heartbeatDegraded
        ) {
            heartbeatDegraded = true;

            pageRuntime.service(
                "state-websocket-liveness",
                "degraded",
                {
                    attempt: attempt,
                    reason: "pong-stale",
                    millisecondsSinceLastPong: elapsed,
                    staleAfterMilliseconds:
                        WEBSOCKET_HEARTBEAT_STALE
                }
            );
        }

        try {
            socketForHeartbeat.sendJSON(
                "ping",
                now
            );
        } catch (err) {
            if (!heartbeatDegraded) {
                heartbeatDegraded = true;

                pageRuntime.service(
                    "state-websocket-liveness",
                    "degraded",
                    {
                        attempt: attempt,
                        reason: "heartbeat-send-failed"
                    }
                );
            }
        }
    }

    sendHeartbeat();

    heartbeatTimer = window.setInterval(
        sendHeartbeat,
        WEBSOCKET_HEARTBEAT_INTERVAL
    );
}

var SAVE_WORK_BUTTON_ID = '#save-work-button';
var RESET_WORK_BUTTON_ID = '#reset-work-button';    

function saveButtonOnlyGrows() {
  // This is less important when the save button is on the lefthand side
  $(SAVE_WORK_BUTTON_ID).css('min-width', $(SAVE_WORK_BUTTON_ID).css('width') );
}

function saveWorkStatus(status, tooltip) {
    $(SAVE_WORK_BUTTON_ID).children('span').not('#work-' + status).hide();
    $(SAVE_WORK_BUTTON_ID).children('#work-' + status).show();
    saveButtonOnlyGrows();
    
    if (tooltip) {
	$(SAVE_WORK_BUTTON_ID).attr( 'title', tooltip );
    } else {	
	$(SAVE_WORK_BUTTON_ID).attr( 'title', '' );
    }
}

var DATABASE = undefined;
var SHADOW = undefined;
var COMPLETIONS = {};
var completionCallbacks = {};

module.exports.DATABASE = DATABASE;

var wantPageUpdates = [];
module.exports.onPageUpdate = function(callback) {
    wantPageUpdates.unshift(callback);
};

/****************************************************************/
// At various points in storing page state, we want to refer to the
// activity by its hash
var activityHash = undefined;

var findActivityHash = _.memoize( function( ) {
    return $('main').attr( 'data-hash' );
});

$.fn.extend({ activityHash: function() {
    return findActivityHash();
}});

var findActivityPath = _.memoize( function( ) {
    return $('main.activity').attr( 'data-path' );
});

$.fn.extend({ activityPath: function() {
    return findActivityPath( this );
}});

window.addEventListener('online', connectToServer );
			
window.addEventListener('offline', function () {
    saveWorkStatus( 'error', "No internet available" );
});

function differentialSynchronization() {
    var delta;
    var nextShadow;

    if ((!socket) || (!(socket.readyState == WebSocket.OPEN))) {
	saveWorkStatus( 'error', "Synchronization failed" );
	connectToServer();
	window.setTimeout(differentialSynchronizationDebounced, DIFFSYNC_DEBOUNCE );
	return;
    }

    /*
     * Build both the outgoing delta and the next local shadow before sending
     * anything.  jsondiffpatch rejects unsupported values such as functions.
     * Contain that failure so one malformed consumer cannot throw out of the
     * save loop without a visible status or runtime diagnostic.
     */
    try {
	delta = jsondiffpatch.diff( SHADOW, DATABASE );

	if (delta !== undefined) {
	    nextShadow = jsondiffpatch.clone(DATABASE);
	}
    } catch(err) {
	saveWorkStatus(
	    'error',
	    'Page state could not be saved because it contains unsupported data.'
	);

	debugLog.log(
	    'Page state differential synchronization failed.',
	    {
		code: 'XR-STATE-DIFF-101',
		errorName:
		    err && err.name
			? err.name
			: undefined,
		errorMessage:
		    err && err.message
			? err.message
			: String(err)
	    }
	);

	pageRuntime.operation(
	    'state-differential-sync',
	    'failed',
	    {
		code: 'XR-STATE-DIFF-101',
		errorName:
		    err && err.name
			? err.name
			: undefined,
		errorMessage:
		    err && err.message
			? err.message
			: String(err)
	    }
	);

	console.error(
	    'Page state differential synchronization failed.',
	    err
	);

	return;
    }

    if (delta !== undefined) {
	saveWorkStatus( 'saving' );
	socket.sendJSON( 'patch', delta, checksumObject(SHADOW) );
	debugLog.log('Sent page state update to Xronos server.');
	SHADOW = nextShadow;
    }
}

var differentialSynchronizationDebounced = _.debounce( differentialSynchronization, DIFFSYNC_DEBOUNCE );

function shouldSynchronizeSubmittedAnswerStateImmediately(key) {
    /*
     * Ordinary edits can use the normal debounce, but once a student actually
     * checks/submits an answer, save the page-state database promptly.  Without
     * this, xAPI/gradebook events can reach the server before the page-state
     * diff, and a quick refresh can lose the visible submitted response.
     */
    return key === 'correct' || key === 'attempt' || key === 'checked';
}

var findRepositoryName = _.memoize( function( element ) {
    if ($(element).hasClass('activity'))
	return $(element).attr( 'data-repository-name' );
    
    return $(element).parents( "[data-hash]" ).attr( 'data-repository-name' );
});

$.fn.extend({ repositoryName: function() {
    return findRepositoryName( this );
}});

// Return the database hash associated to the given element
module.exports.get = function(element) {
    if (DATABASE === undefined) {
	throw "Database not loaded.";
    }
    
    var identifier = $(element).attr('id');
    
    if (!(identifier in DATABASE))
	DATABASE[identifier] = {};
    
    return DATABASE[identifier];
};

// Commit some changes to the database (which will propagate them to other instances)
module.exports.commit = _.throttle( function() {
    // After making a change, the "save work" button should be shown, as opposed to the "work saved!" button
    $(SAVE_WORK_BUTTON_ID).children('span').not('#work-save').hide();
    $(SAVE_WORK_BUTTON_ID).children('#work-save').show();
    saveButtonOnlyGrows();
}, 50 );

// Register a listener to be called whenever the database changes
module.exports.listen = function(element, callback) {
    var identifier = $(element).attr('id');
    
    $(element).on('ximera:database', $(element).database(),
		  function( event ) {
		      return callback.bind(this)(event);
		      
		      // BADBAD: Do I need to return true, so I don't prevent this from bubbling?
		  });
    
    // Because we might register our listener AFTER we download
    // the database for the first time, let's just let our
    // listener know about what's currently in the database
    $(element).trigger( 'ximera:database' );
    
    return;
};

// Call $(element).database() to get the database hash associated
// to the given element
$.fn.extend({
    database: function() {
	var element = $(this);
	var db = module.exports.get(this);
	var originalDatabase = jsondiffpatch.clone(db);
	
	// If we change the database...
	_.defer( function() {
	    if (jsondiffpatch.diff(db, originalDatabase) !== undefined) {
		// Trigger a remote update
		module.exports.commit();
		element.trigger( 'ximera:database' );
		differentialSynchronizationDebounced();
	    }
	});
	
	return module.exports.get(this);
    },
    
    persistentData: function( key, value ) {
	if (typeof key == 'function') {
	    var callback = key;
	    module.exports.listen( this, callback );
	    return this;
	}
	
	if (value === undefined) {
	    return module.exports.get(this)[key];
	}
	
	module.exports.get(this)[key] = value;
	
	var element = this;
	
	// Trigger a remote update
	_.defer( function() {    
	    if (key === 'response') {
		debugLog.log('Saved local response.');
	    }
	    module.exports.commit();
	    element.trigger( 'ximera:database' );

	    if (shouldSynchronizeSubmittedAnswerStateImmediately(key)) {
		debugLog.log('Saving submitted answer state to Xronos server immediately.', { key: key });
		differentialSynchronization();
	    } else {
		differentialSynchronizationDebounced();
	    }
	});
	
	return this;
    }
});

var fetcherCallbacks = [];

// Consumers use this to wait for the initial database from the server.
$.fn.extend({ fetchData: function(callback, consumer) {
    consumer = consumer || "unlabeled";

    if (DATABASE !== undefined) {
        pageRuntime.operation(
            "initial-state-consumer:" + consumer,
            "available",
            {
                delivery: "immediate"
            }
        );

	callback(DATABASE);
    } else {
        pageRuntime.operation(
            "initial-state-consumer:" + consumer,
            "waiting",
            {
                queuePosition:
                    fetcherCallbacks.length + 1
            }
        );

        pageRuntime.operation(
            "initial-state",
            "waiting",
            {
                queuedCallbackCount:
                    fetcherCallbacks.length + 1,
                latestConsumer: consumer
            }
        );

	fetcherCallbacks.unshift({
            callback: callback,
            consumer: consumer
        });
    }
}});

function synchronizePageWithDatabase() {
    _.each( DATABASE,
	    function( database, identifier, list ) {
		$( "#" + identifier ).trigger( 'ximera:database' );
	    });
}

var backOff = WEBSOCKET_BACKOFF_BASE;

function connectToServer() {
    var attempt;

    connectionAttempt += 1;
    attempt = connectionAttempt;

    pageRuntime.service(
        "state-websocket",
        "connect-requested",
        {
            attempt: attempt,
            online: navigator.onLine
        }
    );

    // If we're currently connected...
    if (socket) {
	if (socket.readyState == WebSocket.OPEN) {
            pageRuntime.service(
                "state-websocket",
                "already-open",
                {
                    attempt: attempt
                }
            );

	    // just ignore the request to reconnect
	    return;
	}
	if (socket.readyState == WebSocket.CONNECTING) {
            pageRuntime.service(
                "state-websocket",
                "already-connecting",
                {
                    attempt: attempt
                }
            );

	    console.log("Still connecting...");
	    return;
	}
    }

    // Build an appropriate URL based on the page URL
    var websocketUrl = "ws:";
    if (window.location.protocol === "https:") {
	websocketUrl = "wss:";
    }
    websocketUrl += "//" + window.location.host + window.toValidPath("/ws");

    saveWorkStatus( 'error', "Connecting..." );
    
    try {
        pageRuntime.service(
            "state-websocket",
            "connecting",
            {
                attempt: attempt
            }
        );

	console.log( "Attempting websocket connection...");
	socket = new WebSocket(	websocketUrl );

	// It would be nicer to use ...parameters, and I can't just
	// use arguments because it's not actually an array
	socket.sendJSON = function() {
	    var parameters = [];
	    var i;
	    for( i=0; i<arguments.length; i++ )
		parameters[i] = arguments[i];
	    socket.send( JSON.stringify( parameters ) );
	};
    } catch (err) {
        pageRuntime.service(
            "state-websocket",
            "construction-failed",
            {
                attempt: attempt,
                errorName:
                    err && err.name
                        ? err.name
                        : undefined,
                errorMessage:
                    err && err.message
                        ? err.message
                        : String(err)
            }
        );

	saveWorkStatus( 'error', "Could not connect.  Your work is not being saved." );
    }

    socket.addEventListener('error', function (event) {
        pageRuntime.service(
            "state-websocket",
            "error",
            {
                attempt: attempt
            }
        );

	saveWorkStatus( 'error', "There was an error with the WebSocket" );
    });

    socket.addEventListener('close', function (event) {
        pageRuntime.service(
            "state-websocket",
            "closed",
            {
                attempt: attempt,
                code: event.code,
                clean: event.wasClean
            }
        );

        if (stopHeartbeat(event.currentTarget)) {
            pageRuntime.service(
                "state-websocket-liveness",
                "stopped",
                {
                    attempt: attempt,
                    reason: "socket-closed"
                }
            );
        }

	backOff = backOff * 2.0;
	if (backOff > 15000) backOff = 15000;

	saveWorkStatus( 'error', "You have been disconnected.  Reconnecting in " + Math.round(backOff/1000).toString() + " seconds" );
	console.log( "You have been disconnected.  Reconnecting in " + Math.round(backOff/1000).toString() + " seconds" );
	window.setTimeout(connectToServer, backOff);
    });

    var learnerId = $('main').attr( 'data-learner' );
    var repositoryName = $('main').attr('data-repository-name');
    var filename = $('main').attr('data-path');

    socket.addEventListener('open', function (event) {
        backOff = WEBSOCKET_BACKOFF_BASE;

        pageRuntime.service(
            "state-websocket",
            "open",
            {
                attempt: attempt,
                reconnectBackoffMilliseconds: backOff
            }
        );

        if (DATABASE === undefined) {
            pageRuntime.operation(
                "initial-state",
                "requested",
                {
                    attempt: attempt,
                    activityHashAvailable:
                        findActivityHash() !== undefined
                }
            );
        } else {
            pageRuntime.operation(
                "state-resynchronization",
                "requested",
                {
                    attempt: attempt,
                    activityHashAvailable:
                        findActivityHash() !== undefined
                }
            );
        }

	console.log( "WebSocket open!");
	saveWorkStatus( 'save' );	
	socket.sendJSON(
        'watch',
        learnerId,
        findActivityHash(),
        pageRuntime.supportTraceId()
    );
	socket.sendJSON( 'want-commit', repositoryName, filename );

        startHeartbeat(
            event.currentTarget,
            attempt
        );
    });

    var handlers = {};
    
    handlers.push = function() {
	socket.sendJSON( 'want-commit', repositoryName, filename );	
    };

    handlers.commit = function (remoteRepositoryName, remoteFilename, commitHash, remoteContentHash) {
	if (remoteContentHash != activityHash) {
	    $('#update-version-button').attr('href', window.location.pathname + "?" + commitHash );
	    $('#pageUpdate').show();
	}
    };

    function releaseInitialState(
        remoteDatabase,
        outcome,
        source
    ) {
        SHADOW = jsondiffpatch.clone(remoteDatabase);
        DATABASE = {};

        _.each(
            remoteDatabase,
            function(database, identifier) {
                if (identifier in DATABASE) {
                    _.extend(
                        DATABASE[identifier],
                        database
                    );
                } else {
                    DATABASE[identifier] = database;
                }
            }
        );

        synchronizePageWithDatabase();

        pageRuntime.operation(
            "initial-state",
            "available",
            {
                outcome: outcome,
                source: source,
                delivery: "queued-callbacks",
                callbackCount: fetcherCallbacks.length,
                identifierCount:
                    initialStateProtocol.stateIdentifierCount(remoteDatabase)
            }
        );

        pageRuntime.operation(
            "initial-state-delivery",
            "releasing-callbacks",
            {
                callbackCount: fetcherCallbacks.length,
                outcome: outcome
            }
        );

        _.each(fetcherCallbacks, function(fetcher) {
            pageRuntime.operation(
                "initial-state-consumer:" +
                    fetcher.consumer,
                "releasing"
            );

            fetcher.callback(DATABASE);

            pageRuntime.operation(
                "initial-state-consumer:" +
                    fetcher.consumer,
                "available",
                {
                    delivery: "queued-callback",
                    outcome: outcome
                }
            );
        });
    }

    function recordStateResynchronization(
        state,
        outcome,
        remoteDatabase,
        reason,
        source
    ) {
        pageRuntime.operation(
            "state-resynchronization",
            state,
            {
                outcome: outcome,
                reason: reason,
                source: source,
                identifierCount:
                    initialStateProtocol.stateIdentifierCount(remoteDatabase)
            }
        );
    }

    handlers.initialStateResult = function(result) {
        result =
            initialStateProtocol.normalizeClientResult(
                result
            );

        var outcome = result.outcome;
        var remoteDatabase = result.data;
        var reason = result.reason;

        if (
            outcome === "found" ||
            outcome === "empty"
        ) {
            if (DATABASE === undefined) {
                pageRuntime.operation(
                    "initial-state",
                    "result-received",
                    {
                        outcome: outcome,
                        identifierCount:
                            initialStateProtocol.stateIdentifierCount(
                                remoteDatabase
                            )
                    }
                );

                releaseInitialState(
                    remoteDatabase,
                    outcome,
                    "initial-state-result"
                );
                return;
            }

            SHADOW = jsondiffpatch.clone(remoteDatabase);

            recordStateResynchronization(
                "available",
                outcome,
                remoteDatabase,
                undefined,
                "initial-state-result"
            );
            return;
        }

        if (DATABASE === undefined) {
            pageRuntime.operation(
                "initial-state",
                "failed",
                {
                    outcome: outcome,
                    reason: reason
                }
            );
            return;
        }

        recordStateResynchronization(
            "failed",
            outcome,
            undefined,
            reason,
            "initial-state-result"
        );
    };

    /*
     * `sync` remains the ordinary differential/resynchronization
     * protocol. The first-state path now uses
     * `initial-state-result`.
     *
     * Keep a compatibility path for an older server so initial
     * fetchData() consumers cannot be stranded during a mixed deploy.
     */
    handlers.sync = function(remoteDatabase) {
        if (DATABASE === undefined) {
            handlers.initialStateResult({
                outcome:
                    initialStateProtocol.stateIdentifierCount(remoteDatabase) > 0
                        ? "found"
                        : "empty",
                data: remoteDatabase
            });
            return;
        }

        SHADOW = jsondiffpatch.clone(remoteDatabase);

        recordStateResynchronization(
            "available",
            "sync",
            remoteDatabase,
            undefined,
            "sync"
        );
    };

    handlers.outOfSync = function() {
	socket.sendJSON( 'sync', SHADOW );
    };

    handlers.haveDifferential = _.debounce( function(checksum) {
	if (checksumObject(SHADOW) != checksum) {	
	    socket.sendJSON( 'want-differential' );
	} else {
	    saveWorkStatus( 'saved', 'Uploaded at ' + (new Date()).toLocaleTimeString() );
	    debugLog.log('Xronos server accepted page state update.');

	    pageRuntime.operation(
		'state-differential-sync',
		'succeeded',
		{
		    reason: 'server-accepted'
		}
	    );
	}
    }, 100 );

    handlers.patched = function(err) {
	if (err) {
	    saveWorkStatus( 'error', err );
	    console.log(err);	    
	}
    };

    handlers.patch = function( delta, checksum ) {
	// Apply patch to the client state...
	jsondiffpatch.patch( DATABASE, delta);
	
	synchronizePageWithDatabase();	
	
	// Confirm that our shadow now matches their shadow
	if (checksumObject(SHADOW) != checksum) {
	    // We are out of sync, and should request synchronization
	    socket.sendJSON( 'out-of-sync' );
	} else {
	    jsondiffpatch.patch(SHADOW, delta);
	}
    };

    handlers.completions = function(completions) {
	_.each( completions, function(c) {
	    var url = c.repositoryName + '/' + c.activityPath;
	    var changed = false;
	    if (url in COMPLETIONS) {
		if (COMPLETIONS[url] < c.complete) {
		    COMPLETIONS[url] = c.complete;
		    changed = true;
		}
	    } else {
		COMPLETIONS[url] = c.complete;
		changed = true;		
	    }
	    
	    if ((changed) && (completionCallbacks[url])) {
		_.each( completionCallbacks[url], function(callback) {
		    callback(c.complete);
		});
	    }
	});
    };

    handlers.pong = function(sentAt) {
        var now;
        var sentAtNumber;
        var latency;

        if (this !== heartbeatSocket) {
            return;
        }

        now = Date.now();
        sentAtNumber = Number(sentAt);
        latency = undefined;

        if (
            isFinite(sentAtNumber) &&
            sentAtNumber >= 0 &&
            sentAtNumber <= now
        ) {
            latency = now - sentAtNumber;
        }

        lastPongAt = now;
        heartbeatDegraded = false;

        pageRuntime.service(
            "state-websocket-liveness",
            "healthy",
            {
                latencyMilliseconds: latency,
                lastPongAt: new Date(now).toISOString()
            }
        );
    };

    socket.addEventListener('message', function (event) {
	var payload = JSON.parse( event.data );

	if (! Array.isArray(payload)) {
	    console.log("WebSocket message is not an array.");
	    return;
	}

	if (payload.length == 0) {
	    console.log("WebSocket message is empty.");
	    return;
	}
	    
	var message = payload[0];
	var camelCased = message.replace(/-([a-z])/g, function (g) { return g[1].toUpperCase(); });

	if (handlers[camelCased]) {
	    handlers[camelCased].apply( socket, payload.slice(1) );
	} else {
	    console.log( "Do not know how to handle " + message );
	}
    });
    
}

$(document).ready(function() {
    var activityHash = findActivityHash();
    
    if (!activityHash) {
        pageRuntime.service(
            "state-websocket",
            "not-required"
        );

	return;
    }

    pageRuntime.service(
        "state-websocket",
        "required",
        {
            activityHashAvailable: true
        }
    );

    connectToServer();
});

module.exports.setCompletion = function(repositoryName, activityPath, complete) {
    if (!socket) {
	saveWorkStatus( 'error', "No socket for progress bar" );	
	return;
    }

    if (socket.readyState !== WebSocket.OPEN) {
	saveWorkStatus( 'error', "Socket not open for progress bar" );	
	return;
    }

    socket.sendJSON( 'completion', {repositoryName: repositoryName, activityPath: activityPath, complete: complete} );
    debugLog.log('Sent page progress update to Xronos server.', {
	repositoryName: repositoryName,
	activityPath: activityPath,
	complete: complete
    });
};

module.exports.onCompletion = function(repositoryName, activityPath, callback) {
    var url = repositoryName + '/' + activityPath;
    
    if (!(url in completionCallbacks))
	completionCallbacks[url] = [];

    completionCallbacks[url].unshift(callback);

    if (COMPLETIONS[url]) {
	callback(COMPLETIONS[url]);
    }
};

var resetWork = function(options) {
    var keys = _.keys( DATABASE );
    var preserve = options && options.preserve ? options.preserve : {};

    _.each( keys,
	    function( identifier ) {
		// Want to empty the object but can't throw away the reference
		var hash = DATABASE[identifier];
		for( var i in hash ) {
		    delete hash[i];
		}

		if (preserve[identifier]) {
		    _.extend(hash, preserve[identifier]);
		}
	    });

    _.each( preserve, function(value, identifier) {
	if (!(identifier in DATABASE)) {
	    DATABASE[identifier] = {};
	}

	_.extend(DATABASE[identifier], value);
    });

    synchronizePageWithDatabase();
    differentialSynchronization();
};

// No need to confirm with the user to delete work---that happens via a Bootstrap Modal
var clickResetWorkButton = function() {
    resetWork();
};

module.exports.resetWork = resetWork;
module.exports.synchronizeNow = differentialSynchronization;

// After the document loads, every few seconds, make sure the database is saved.
$(document).ready(function() {
    activityHash = findActivityHash();
    
    $(SAVE_WORK_BUTTON_ID).click( differentialSynchronization );
    $(RESET_WORK_BUTTON_ID).click( clickResetWorkButton );
});

