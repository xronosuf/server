'use strict';

function pageApplicationVersion(documentObject, fallbackVersion) {
    var element;
    var value;

    if (!documentObject || typeof documentObject.querySelector !== 'function') {
        return fallbackVersion;
    }

    element = documentObject.querySelector(
        'meta[name="xronos-application-version"]'
    );

    if (!element || typeof element.getAttribute !== 'function') {
        return fallbackVersion;
    }

    value = element.getAttribute('content');

    return value || fallbackVersion;
}

function pageRepairToken(documentObject) {
    var element;
    var value;

    if (!documentObject || typeof documentObject.querySelector !== 'function') {
        return null;
    }

    element = documentObject.querySelector(
        'meta[name="xronos-repair-token"]'
    );

    if (!element || typeof element.getAttribute !== 'function') {
        return null;
    }

    value = element.getAttribute('content');
    return value || null;
}

function appendRepairToken(url, token) {
    if (!token || typeof url !== 'string' || !url) {
        return url;
    }

    return url +
        (url.indexOf('?') === -1 ? '?' : '&') +
        'xronosRepair=' + encodeURIComponent(token);
}

function versionedNodeModulesPath(version, path, repairToken) {
    var suffix = String(path || '').replace(/^\/+/, '');

    return appendRepairToken(
        '/node_modules/v' + version + '/' + suffix,
        repairToken
    );
}

module.exports = {
    pageApplicationVersion: pageApplicationVersion,
    pageRepairToken: pageRepairToken,
    appendRepairToken: appendRepairToken,
    versionedNodeModulesPath: versionedNodeModulesPath
};
