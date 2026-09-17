'use strict';

var mdb = require('../mdb');
var instructorSettings = require('../lib/instructor-settings');
var ltiLaunchReference = require('../lib/lti-launch-reference');

function text(value) {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    return value.toString();
}

function referenceMatchesBridge(reference, bridge) {
    return !!(
        reference && bridge &&
        text(reference.bridgeId) === text(bridge._id) &&
        text(reference.toolConsumerInstanceGuid) === text(bridge.toolConsumerInstanceGuid) &&
        text(reference.contextId) === text(bridge.contextId) &&
        text(reference.resourceLinkId) === text(bridge.resourceLinkId) &&
        text(reference.repository) === text(bridge.repository) &&
        text(reference.path) === text(bridge.path)
    );
}

function loadAuthorizedBridge(req) {
    if (!req.user || !req.user._id) {
        return Promise.reject({status: 401, error: 'authentication-required'});
    }

    var reference = ltiLaunchReference.read(req);
    if (!reference || !reference.bridgeId) {
        return Promise.reject({status: 403, error: 'current-lti-launch-required'});
    }

    var bridgeId;
    try {
        bridgeId = new mdb.ObjectId(reference.bridgeId);
    } catch (err) {
        return Promise.reject({status: 403, error: 'invalid-lti-launch-reference'});
    }

    return mdb.LtiBridge.findOne({
        _id: bridgeId,
        user: req.user._id
    }).exec().then(function(bridge) {
        if (!bridge || !referenceMatchesBridge(reference, bridge)) {
            throw {status: 403, error: 'lti-launch-reference-mismatch'};
        }
        if (!instructorSettings.bridgeHasAuthoritativeLtiContext(bridge)) {
            throw {status: 403, error: 'authoritative-lti-context-required'};
        }
        if (bridge.instructionalStaff !== true) {
            throw {status: 403, error: 'instructional-staff-required'};
        }
        return bridge;
    });
}

function sendRouteError(res, next, err) {
    if (err && err.status && err.error) {
        res.status(err.status).json({ok: false, error: err.error});
        return;
    }
    next(err);
}

function responsePayload(bridge, document) {
    return {
        ok: true,
        context: {
            toolConsumerInstanceGuid: bridge.toolConsumerInstanceGuid,
            contextId: bridge.contextId,
            repository: bridge.repository,
            path: bridge.path
        },
        definitions: instructorSettings.DEFINITIONS,
        global: instructorSettings.serializeGlobal(document)
    };
}

exports.getCurrent = function(req, res, next) {
    loadAuthorizedBridge(req)
        .then(function(bridge) {
            return instructorSettings.ensureGlobalForBridge(bridge)
                .then(function(document) {
                    res.json(responsePayload(bridge, document));
                });
        })
        .catch(function(err) {
            sendRouteError(res, next, err);
        });
};

exports.updateCurrent = function(req, res, next) {
    var body = req.body || {};

    if (body.scope !== instructorSettings.GLOBAL_SCOPE) {
        res.status(400).json({
            ok: false,
            error: 'unsupported-setting-scope'
        });
        return;
    }

    loadAuthorizedBridge(req)
        .then(function(bridge) {
            return instructorSettings.updateGlobalSetting(
                bridge,
                body.key,
                body.value,
                req.user._id
            ).then(function(document) {
                res.json(responsePayload(bridge, document));
            });
        })
        .catch(function(err) {
            if (err && err.message) {
                if (err.message === 'invalid-setting-value' ||
                    err.message === 'setting-not-available-at-global-scope') {
                    res.status(400).json({ok: false, error: err.message});
                    return;
                }
            }
            sendRouteError(res, next, err);
        });
};

exports.loadAuthorizedBridge = loadAuthorizedBridge;
exports.referenceMatchesBridge = referenceMatchesBridge;
