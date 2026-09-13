'use strict';

var gradeSyncStatus = require('./grade-sync-status');
var lateGradePolicy = require('./late-grade-policy');

function bridgeId(bridge) {
    if (!bridge || bridge._id === undefined || bridge._id === null) {
        return null;
    }

    return bridge._id.toString();
}

function queuedIdsFromScores(bridges, scores) {
    var queued = [];

    (bridges || []).forEach(function(bridge, index) {
        var id = bridgeId(bridge);
        var score = scores && scores[index];

        if (id && score !== null && score !== undefined) {
            queued.push(id);
        }
    });

    return queued;
}

function loadQueuedBridgeIds(redisClient, bridges, callback) {
    bridges = bridges || [];

    var ids = bridges.map(bridgeId);

    if (ids.length === 0) {
        callback(null, []);
        return;
    }

    if (!redisClient || typeof redisClient.pipeline !== 'function') {
        callback(new Error('Redis client does not support pipeline().'));
        return;
    }

    var pipeline = redisClient.pipeline();

    ids.forEach(function(id) {
        pipeline.zscore('gradebook', id);
    });

    pipeline.exec(function(err, results) {
        if (err) {
            callback(err);
            return;
        }

        var scores = (results || []).map(function(result) {
            if (!result || result[0]) {
                return null;
            }

            return result[1];
        });

        callback(null, queuedIdsFromScores(bridges, scores));
    });
}

function passbackWindow(bridge) {
    var end = lateGradePolicy.passbackWindowEnd(bridge);

    return {
        dueDate: bridge && bridge.dueDate || null,
        untilDate: bridge && bridge.untilDate || null,
        end: end.time === null ? null : new Date(end.time),
        source: end.source
    };
}

function bridgeDiagnostic(bridge, queuedLookup, now) {
    var id = bridgeId(bridge);
    var hasPassback = gradeSyncStatus.bridgeHasGradePassback(bridge);
    var open = hasPassback && gradeSyncStatus.bridgeIsOpen(bridge, now);
    var queued = !!(id && queuedLookup[id]);
    var accepted = bridge && bridge.submittedScore === true;
    var state;

    if (!hasPassback) {
        state = 'missing-passback-fields';
    } else if (!open) {
        state = 'grade-passback-closed';
    } else if (queued) {
        state = 'passback-pending';
    } else if (accepted) {
        state = 'passback-accepted';
    } else {
        state = 'passback-ready';
    }

    return {
        bridgeId: id,
        state: state,
        repository: bridge && bridge.repository || null,
        path: bridge && bridge.path || null,
        hasPassback: hasPassback,
        passbackOpen: open,
        queued: queued,
        accepted: accepted,
        submittedScore: accepted,
        hasLastAcceptedScore: !!(
            bridge &&
            bridge.lastSubmittedAt &&
            bridge.lastSubmittedResultTotalScore !== undefined &&
            bridge.lastSubmittedResultTotalScore !== null
        ),
        passbackWindow: passbackWindow(bridge)
    };
}

function build(bridges, queuedBridgeIds, now, options) {
    bridges = bridges || [];
    options = options || {};

    var queuedLookup = {};

    (queuedBridgeIds || []).forEach(function(id) {
        if (id !== undefined && id !== null) {
            queuedLookup[id.toString()] = true;
        }
    });

    var status = gradeSyncStatus.build(bridges, queuedBridgeIds, now);

    status.queueStatusAvailable = options.queueStatusAvailable !== false;

    return {
        status: status,
        diagnostics: {
            queueStatusAvailable: status.queueStatusAvailable,
            bridgeCount: bridges.length,
            bridges: bridges.map(function(bridge) {
                return bridgeDiagnostic(bridge, queuedLookup, now);
            })
        }
    };
}

function load(redisClient, bridges, now, callback) {
    loadQueuedBridgeIds(redisClient, bridges, function(err, queuedIds) {
        if (err) {
            callback(null, build(bridges, [], now, {
                queueStatusAvailable: false
            }));
            return;
        }

        callback(null, build(bridges, queuedIds, now, {
            queueStatusAvailable: true
        }));
    });
}

exports.bridgeDiagnostic = bridgeDiagnostic;
exports.build = build;
exports.load = load;
exports.loadQueuedBridgeIds = loadQueuedBridgeIds;
exports.queuedIdsFromScores = queuedIdsFromScores;
