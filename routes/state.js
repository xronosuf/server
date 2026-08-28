var winston = require('winston');
var jsondiffpatch = require('jsondiffpatch');
var mdb = require('../mdb');
var util = require('util');
var crypto = require('crypto');
var repositories = require('./repositories');
var config = require('../config');
var initialStateProtocol = require('../public/javascripts/initial-state-protocol');
const Redis = require("ioredis");

var CANON = require('canon');
var XXH = require('xxhashjs');
function checksumObject(object) {
    return XXH.h32( CANON.stringify( object ), 0x1337 ).toString(16);
}

exports.wss = undefined;

var publisher = new Redis({ host: config.redis.url, port: config.redis.port });

class Building {
    constructor(name) {
	var building = this;
	building.name = name;
	building.rooms = {};
	building.client = new Redis ({ host: config.redis.url, port: config.redis.port });
	building.client.on("message", function(channel, message) {
	    if (building.rooms[channel]) {
		building.rooms[channel].forEach( function(socket) {
		    if (socket.readyState == 1) 		    
			socket.send( message );
		    else if (socket.readyState == 3) {
			building.rooms[channel].delete( socket );
			if (building.rooms[channel].size == 0) {
			    building.client.unsubscribe(channel);
			}
		    }
		});
	    }
	});

	// Clean out closed connections every few minutes
	setInterval( function() {
	    building.clean();
	}, 1000*60*10 );
    }

    clean() {
	var building = this;
	
	Object.keys(building.rooms).forEach(function(channel) {
	    var sockets = building.rooms[channel];

	    sockets.forEach( function(socket) {
		if (socket.readyState == 3) {
		    building.rooms[channel].delete( socket );
		    if (building.rooms[channel].size == 0) {
			building.client.unsubscribe(channel);
		    }
		}
	    });
	});
    }
    
    join(room, socket) {
	var channel = this.name + ":" + room;
	
	if (this.rooms[channel] === undefined)
	    this.rooms[channel] = new Set();
	
	this.rooms[channel].add( socket );
	
	this.client.subscribe(channel);
    }

    broadcast(room, sender, ...parameters) {
	var channel = this.name + ":" + room;
	publisher.publish( channel, JSON.stringify( parameters ) );
    }
}

var repositoryRooms = new Building("repository");
var userRooms = new Building("user");
var activityRooms = new Building("activity"); 

exports.push = function(repositoryName) {
    repositoryRooms.broadcast( repositoryName, null, 'push' );
};

function normalizeSupportTrace(value) {
    if (
        typeof value !== "string" ||
        value.length < 8 ||
        value.length > 96 ||
        !/^xr-[A-Za-z0-9-]+$/.test(value)
    ) {
        return null;
    }

    return value;
}


function supportTraceLog(socket, event) {
    console.log(
        "XRONOS SUPPORT TRACE",
        socket &&
        socket.supportTraceId
            ? socket.supportTraceId
            : "-",
        "state",
        event
    );
}


var handlers = {};

handlers.wantCommit = function(repositoryName, filename) {
    var socket = this;
    socket.repositoryName = repositoryName;
    
    repositoryRooms.join( repositoryName, socket );
	
    repositories.activitiesFromRecentCommitsOnMaster( repositoryName, filename ).then( function(activities) {
	socket.sendJSON( 'commit', repositoryName, filename, activities[0].sourceSha, activities[0].hash );
    });
};

handlers.ping = function(sentAt) {
    this.sendJSON(
        'pong',
        sentAt
    );
};

handlers.watch = function(
    userId,
    activityHash,
    supportTraceId
) {
    var socket = this;

    socket.supportTraceId =
        normalizeSupportTrace(
            supportTraceId
        );

    supportTraceLog(
        socket,
        "watch"
    );

    // BADBAD: Need some security here...
    console.log( "BADBAD: no security checks for " + userId );

    if (userId == null) {
	userId = socket.session.guestUserId;
	if (socket.session.passport) {
	    userId = socket.session.passport.user || userId;
	}
    }
    
    mdb.Completion.find({user: userId}, { activityPath: 1, repositoryName: 1, complete: 1 }, function (err, completions) {
	if (!err && completions)
	    socket.sendJSON('completions', completions);
    });
    
    socket.userId = userId;
    userRooms.join( userId, socket );
    
    if (!activityHash) {
        socket.sendJSON(
            'initial-state-result',
            initialStateProtocol.serverResult(
                activityHash,
                null,
                null
            )
        );
        return;
    }

    socket.activityHash = activityHash;

    var roomName =
        `/users/${userId}/state/${activityHash}`;
    socket.activityRoom = roomName;
    activityRooms.join(roomName, socket);

    mdb.State.findOne(
        {
            activityHash: activityHash,
            user: userId
        },
        function(err, state) {
            var result =
                initialStateProtocol.serverResult(
                    activityHash,
                    err,
                    state
                );

            if (result.outcome === 'failed') {
                winston.error(
                    "Initial page-state lookup failed " +
                    "for activity hash. " +
                    "supportTrace=" +
                    (
                        socket.supportTraceId ||
                        "-"
                    )
                );
            }

            if (
                result.outcome === 'found' ||
                result.outcome === 'empty'
            ) {
                socket.shadow = result.data;
            }

            socket.sendJSON(
                'initial-state-result',
                result
            );
        }
    );
};
    
handlers.wantDifferential = function() {
    var socket = this;
    
    var userId = socket.userId;
    var activityHash = socket.activityHash;
	
    if ( (!activityHash) || (!userId) )
	return;
	
    mdb.State.findOne({activityHash: activityHash, user: userId} , function(err, state) {
	if (err || (!state))
	    return;
	
	var data = state.data;
	
	// Send a diff if needed
	var delta = jsondiffpatch.diff(socket.shadow, data);
	
	if (delta !== undefined) {
	    socket.sendJSON('patch', delta, checksumObject( socket.shadow ) );
	    socket.shadow = jsondiffpatch.clone(data);		    
	}
    });
};
    
handlers.sync = function(data) {
    var socket = this;    
    var userId = socket.userId;
    var activityHash = socket.activityHash;
	
    if ( (!activityHash) || (!userId) )
	return;
    
    socket.shadow = data;
};
    
handlers.outOfSync = function() {
    var socket = this;        
    var userId = socket.userId;
    var activityHash = socket.activityHash;
	
    if ( (!activityHash) || (!userId) )
	return;
    
    socket.sendJSON('sync', socket.shadow);
};
    
handlers.patch = function(delta, checksum, truth) {
    var socket = this;            
    var userId = socket.userId;
    var activityHash = socket.activityHash;
	
    if ( (!activityHash) || (!userId) )
	return;

    // Apply the patch to the shadow
    if (checksumObject(socket.shadow) != checksum) {
	socket.sendJSON( 'out-of-sync' );
	return;
    }
	
    // Frankly this should never fail
    try {
	jsondiffpatch.patch(socket.shadow, delta);
    } catch (e) {
	winston.error('could not patch a shadow that passed a checksum test');
	winston.error(e);
    }
    
    // Apply patch to the server state
    mdb.State.findOne({activityHash: activityHash, user: userId} , function(err, state) {
	var data;
	
	if (err || (!state))
	    data = {};
	else
	    data = state.data;
	
	// fuzzypatch the object, which can fail
	try {
	    jsondiffpatch.patch(data, delta);
	} catch (e) {
	}
	
	mdb.State.update({activityHash: activityHash, user: userId}, {$set: {data: data}}, {upsert: true}, function (err, affected, raw) {
	    if (err) {
        supportTraceLog(
            socket,
            "state-patch-failed"
        );
		socket.sendJSON('patched', err);
	    } else {
		// tell other people in the room that we have a differential if they want it
		activityRooms.broadcast( socket.activityRoom, null, 'have-differential', checksumObject( data ) );
	    }
	});
    });
};
    
handlers.completion = function(c) {
    var socket = this;                
    var userId = socket.userId;
    var activityHash = socket.activityHash;
	
    if ( (!activityHash) || (!userId) )
	return;
	
    var query = {activityHash: activityHash,
		 user: userId};
	
    if (c.activityPath) {
	query = {activityHash: activityHash,
		 activityPath: c.activityPath,
		 repositoryName: c.repositoryName,
		 user: userId};
    }
	
    mdb.Completion.update(query, {$set: {complete: c.complete, date: new Date()}}, {upsert: true}, function (err, affected, raw) {
	var payload = [{activityPath: c.activityPath,
			userId: userId,
			repositoryName: c.repositoryName,
			complete: c.complete}];
	
	// Tell other browsers viewing this user
	userRooms.broadcast( socket.userId, null, 'completions', payload );
	
	// And tell any instructors what this student is doing
	
	socket.activityPath = c.activityPath;
	socket.repositoryName = c.repositoryName;
    });
};


exports.connection = function( socket ) {
    socket.sendJSON = function(...parameters) {
	if (socket.readyState == 1) 
	    socket.send( JSON.stringify( parameters ) );
    };
    
    socket.on('message', function(data) {
	var payload;

	try {
	    payload = JSON.parse( data );
	} catch (err) {
	    var messageLength =
		data && typeof data.length === 'number'
		    ? data.length
		    : 0;

	    winston.error(
		"Rejected malformed WebSocket message (" +
		messageLength +
		" bytes)."
	    );

	    if (socket.readyState == 1) {
		try {
		    socket.close(1003, "Invalid JSON");
		} catch (closeError) {
		    winston.error(
			"Could not close malformed WebSocket connection."
		    );
		}
	    }

	    return;
	}

	if (! Array.isArray(payload)) {
	    winston.error("WebSocket message is not an array.");
	    return;
	}

	if (payload.length == 0) {
	    winston.error("WebSocket message is empty.");
	    return;
	}

	var message = payload[0];

	if (typeof message !== 'string') {
	    winston.error(
		"WebSocket message name is not a string."
	    );

	    if (socket.readyState == 1) {
		try {
		    socket.close(1003, "Invalid message type");
		} catch (closeError) {
		    winston.error(
			"Could not close invalid WebSocket connection."
		    );
		}
	    }

	    return;
	}

	var camelCased = message.replace(/-([a-z])/g, function (g) { return g[1].toUpperCase(); });

	if (handlers[camelCased]) {
	    handlers[camelCased].apply( socket, payload.slice(1) );
	} else {
	    winston.error( "Do not know how to handle " + message );
	}
    });
};
