'use strict';

var legacyCacheCleanup = require('./legacy-cache-cleanup');

var QUERY_PARAMETER = 'xronosRepair';

function randomToken(windowObject) {
    var bytes;
    var cryptoObject = windowObject && windowObject.crypto;
    var i;
    var parts = [];

    if (cryptoObject && typeof cryptoObject.getRandomValues === 'function') {
        bytes = new Uint32Array(4);
        cryptoObject.getRandomValues(bytes);

        for (i = 0; i < bytes.length; i += 1) {
            parts.push(bytes[i].toString(36));
        }

        return 'xr-' + parts.join('-');
    }

    return 'xr-' +
        Date.now().toString(36) + '-' +
        Math.random().toString(36).slice(2) + '-' +
        Math.random().toString(36).slice(2);
}

function recoveryUrl(locationObject, token) {
    var pathname = locationObject && locationObject.pathname
        ? locationObject.pathname
        : '/';
    var hash = locationObject && locationObject.hash
        ? locationObject.hash
        : '';

    return pathname + '?' + QUERY_PARAMETER + '=' +
        encodeURIComponent(token) + hash;
}

function repairCurrentPage(environment) {
    environment = environment || {};

    var windowObject = environment.window || window;
    var token = randomToken(windowObject);
    var target = recoveryUrl(windowObject.location, token);

    return legacyCacheCleanup
        .cleanupLegacyBrowserCaches({
            navigator: windowObject.navigator,
            caches: windowObject.caches
        })
        .catch(function() {
            // The one-shot server response still provides HTTP-cache recovery.
            // Do not strand the student because legacy cleanup was unavailable.
        })
        .then(function() {
            windowObject.location.assign(target);
            return {
                token: token,
                url: target
            };
        });
}

module.exports = {
    QUERY_PARAMETER: QUERY_PARAMETER,
    randomToken: randomToken,
    recoveryUrl: recoveryUrl,
    repairCurrentPage: repairCurrentPage
};
