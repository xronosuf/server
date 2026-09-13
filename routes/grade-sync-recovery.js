'use strict';

var crypto = require('crypto');
var mdb = require('../mdb');
var config = require('../config');
var gradeSyncRuntime = require('../lib/grade-sync-runtime');
var gradeSyncDiagnosticReport = require('../lib/grade-sync-diagnostic-report');
var ltiLaunchReference = require('../lib/lti-launch-reference');

var Redis = require('ioredis');
var redisClient = null;
var RecoveryEvent = null;
var COLLECTION_NAME = 'gradeSyncRecoveryEvents';
var RETENTION_DAYS = 90;
var ALLOWED_ACTIONS = {
    'recheck-status': true,
    'view-canvas-relaunch-guidance': true
};

function getRedisClient() {
    if (!redisClient) {
        redisClient = new Redis({
            host: config.redis.url,
            port: config.redis.port
        });
        redisClient.on('error', function(err) {
            console.log('Grade sync recovery Redis error');
            console.log(err);
        });
    }

    return redisClient;
}

function recoveryEventModel() {
    if (RecoveryEvent) {
        return RecoveryEvent;
    }

    if (mdb.mongoose.models.GradeSyncRecoveryEvent) {
        RecoveryEvent = mdb.mongoose.models.GradeSyncRecoveryEvent;
        return RecoveryEvent;
    }

    var Schema = mdb.mongoose.Schema;
    var ObjectId = Schema.ObjectId;
    var schema = new Schema({
        eventId: {type: String, index: true, unique: true},
        user: {type: ObjectId, index: true, ref: 'User'},
        repository: {type: String, index: true},
        path: {type: String, index: true},
        action: {type: String, index: true},
        observedAt: {type: Date, index: true},
        expiresAt: {type: Date},
        gradeSyncState: String,
        gradeSyncReason: String,
        launchPrimary: String,
        launchReferenceRecorded: Boolean,
        bridgeCount: Number,
        activeGradePassbackBridgeCount: Number,
        queueStatusAvailable: Boolean,
        currentLaunchBridgeId: String
    }, {
        collection: COLLECTION_NAME,
        minimize: false
    });

    schema.index({expiresAt: 1}, {expireAfterSeconds: 0});
    schema.index({user: 1, observedAt: -1});
    schema.index({repository: 1, path: 1, observedAt: -1});

    RecoveryEvent = mdb.mongoose.model(
        'GradeSyncRecoveryEvent',
        schema
    );

    return RecoveryEvent;
}

function text(value) {
    return value === undefined || value === null || value === ''
        ? null
        : value.toString();
}

function allowedAction(value) {
    value = text(value);
    return value && ALLOWED_ACTIONS[value] ? value : null;
}

function recoveryEvent(options) {
    options = options || {};

    var diagnostics = options.diagnostics || {};
    var passback = diagnostics.passback || {};
    var launchMatch = diagnostics.launchMatch || {};
    var reference = options.reference || null;
    var observedAt = options.observedAt instanceof Date
        ? options.observedAt
        : new Date(options.observedAt || Date.now());

    return {
        eventId: text(options.eventId) || crypto.randomUUID(),
        user: options.user || null,
        repository: text(options.repository),
        path: text(options.path),
        action: allowedAction(options.action),
        observedAt: observedAt,
        expiresAt: new Date(
            observedAt.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000
        ),
        gradeSyncState: text(passback.state),
        gradeSyncReason: text(passback.reason),
        launchPrimary: text(launchMatch.primary),
        launchReferenceRecorded:
            diagnostics.launchReferenceRecorded === true,
        bridgeCount: Number(passback.bridgeCount) || 0,
        activeGradePassbackBridgeCount:
            Number(passback.activeGradePassbackBridgeCount) || 0,
        queueStatusAvailable:
            passback.queueStatusAvailable !== false,
        currentLaunchBridgeId:
            reference ? text(reference.bridgeId) : null
    };
}

function loadSnapshot(req, callback) {
    var repository = req.params.repository;
    var page = {
        repository: repository,
        path: req.params.path
    };
    var reference = ltiLaunchReference.read(req);

    mdb.LtiBridge.find({
        user: req.user._id,
        repository: repository,
        path: req.params.path
    })
        .exec()
        .then(function(bridges) {
            gradeSyncRuntime.load(
                getRedisClient(),
                bridges,
                Date.now(),
                function(runtimeErr, runtime) {
                    if (runtimeErr) {
                        callback(runtimeErr);
                        return;
                    }

                    callback(null, {
                        reference: reference,
                        runtime: runtime,
                        diagnostics: gradeSyncDiagnosticReport.build({
                            reference: reference,
                            allUserBridges: bridges,
                            page: page,
                            runtime: runtime
                        })
                    });
                }
            );
        })
        .catch(callback);
}

function saveRecoveryEvent(event, callback) {
    recoveryEventModel()
        .create(event)
        .then(function() {
            callback(null, true);
        })
        .catch(function(err) {
            console.log(
                'Could not record grade sync recovery event ' +
                event.eventId
            );
            console.log(err);
            callback(null, false);
        });
}

exports.recordAndRecheck = function(req, res, next) {
    if (!req.user || !req.user._id) {
        res.status(401).json({
            ok: false,
            error: 'authentication-required'
        });
        return;
    }

    var action = allowedAction(req.body && req.body.action);

    if (!action) {
        res.status(400).json({
            ok: false,
            error: 'invalid-recovery-action'
        });
        return;
    }

    loadSnapshot(req, function(err, snapshot) {
        if (err) {
            next(err);
            return;
        }

        var event = recoveryEvent({
            user: req.user._id,
            repository: req.params.repository,
            path: req.params.path,
            action: action,
            diagnostics: snapshot.diagnostics,
            reference: snapshot.reference
        });

        saveRecoveryEvent(event, function(saveErr, recorded) {
            if (saveErr) {
                next(saveErr);
                return;
            }

            res.json({
                ok: true,
                recovery: {
                    eventId: event.eventId,
                    action: action,
                    recorded: recorded,
                    observedAt: event.observedAt.toISOString()
                },
                gradeSync: snapshot.runtime.status,
                gradeSyncDiagnostics: snapshot.diagnostics
            });
        });
    });
};

exports.ALLOWED_ACTIONS = ALLOWED_ACTIONS;
exports.COLLECTION_NAME = COLLECTION_NAME;
exports.RETENTION_DAYS = RETENTION_DAYS;
exports.allowedAction = allowedAction;
exports.loadSnapshot = loadSnapshot;
exports.recoveryEvent = recoveryEvent;
exports.recoveryEventModel = recoveryEventModel;
exports.saveRecoveryEvent = saveRecoveryEvent;
