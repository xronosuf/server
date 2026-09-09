'use strict';

var SESSION_KEY = 'xronosLtiLaunchReference';

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

function record(req, bridge, observedAt) {
    if (!req || !req.session) {
        return null;
    }

    var reference = fromBridge(bridge, observedAt);

    if (!reference) {
        return null;
    }

    req.session[SESSION_KEY] = reference;
    return reference;
}

function read(req) {
    if (!req || !req.session) {
        return null;
    }

    var value = req.session[SESSION_KEY];

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

exports.SESSION_KEY = SESSION_KEY;
exports.fromBridge = fromBridge;
exports.read = read;
exports.record = record;
