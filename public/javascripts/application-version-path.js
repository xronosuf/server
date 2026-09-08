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

function versionedNodeModulesPath(version, path) {
    var suffix = String(path || '').replace(/^\/+/, '');

    return '/node_modules/v' + version + '/' + suffix;
}

module.exports = {
    pageApplicationVersion: pageApplicationVersion,
    versionedNodeModulesPath: versionedNodeModulesPath
};
