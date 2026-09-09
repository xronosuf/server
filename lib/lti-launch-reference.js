'use strict';

var SESSION_KEY = 'xronosLtiLaunchReference';
var REQUEST_KEY = 'xronosPendingLtiLaunchReference';

function text(value) {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    return value.toString();
}

function fromBridge(bridge, observedAt) {
    if (!bridge) {
        return null;
    }

    return {
        bridgeId: text(bridge._id),
        toolConsumerInstanceGuid: text(bridge.toolConsumerInstanceGuid),
        contextId: text(bridge.contextId),
        resourceLinkId: text(bridge.resourceLinkId),
        repository: text(bridge.repository),
        path: text(bridge.path),
        observedAt: new Date(observedAt || Date.now()).toISOString()
    };
}

function normalize(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    return {
        bridgeId: text(value.bridgeId),
        toolConsumerInstanceGuid: text(value.toolConsumerInstanceGuid),
        contextId: text(value.contextId),
        resourceLinkId: text(value.resourceLinkId),
        repository: text(value.repository),
        path: text(value.path),
        observedAt: text(value.observedAt)
    };
}

function recordReference(req, reference) {
    if (!req || !req.session) {
        return null;
    }

    reference = normalize(reference);

    if (!reference) {
        return null;
    }

    req.session[SESSION_KEY] = reference;
    return reference;
}

function record(req, bridge, observedAt) {
    return recordReference(
        req,
        fromBridge(bridge, observedAt)
    );
}

/*
 * Passport 0.6 regenerates the session after successful authentication.  LTI
 * bridge creation happens inside the verify callback, before that regeneration,
 * so writing directly to req.session there loses custom session fields.
 * Stage the minimal privacy-safe reference on the request object instead; the
 * authenticated route commits it into the new session after Passport returns.
 */
function stage(req, bridge, observedAt) {
    if (!req) {
        return null;
    }

    var reference = fromBridge(bridge, observedAt);

    if (!reference) {
        return null;
    }

    req[REQUEST_KEY] = reference;
    return reference;
}

function commit(req) {
    if (!req) {
        return null;
    }

    var reference = req[REQUEST_KEY];
    var committed = recordReference(req, reference);

    if (committed) {
        delete req[REQUEST_KEY];
    }

    return committed;
}

function read(req) {
    if (!req || !req.session) {
        return null;
    }

    return normalize(req.session[SESSION_KEY]);
}

exports.REQUEST_KEY = REQUEST_KEY;
exports.SESSION_KEY = SESSION_KEY;
exports.commit = commit;
exports.fromBridge = fromBridge;
exports.read = read;
exports.record = record;
exports.recordReference = recordReference;
exports.stage = stage;
