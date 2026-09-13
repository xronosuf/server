'use strict';

var legacyCacheCleanup = require('./legacy-cache-cleanup');

var QUERY_PARAMETER = 'xronosRepair';
var STORAGE_KEY = 'xronosPageRepair';

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

function repairRecord(windowObject, token) {
    return {
        token: token,
        requestedAt: new Date().toISOString(),
        path: windowObject && windowObject.location
            ? windowObject.location.pathname
            : null
    };
}

function rememberRepair(windowObject, record) {
    try {
        if (windowObject && windowObject.sessionStorage) {
            windowObject.sessionStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(record)
            );
        }
    } catch (err) {
        // Recovery must still proceed when browser storage is unavailable.
    }
}

function lastRepair(windowObject) {
    var raw;
    var parsed;

    try {
        raw = windowObject && windowObject.sessionStorage
            ? windowObject.sessionStorage.getItem(STORAGE_KEY)
            : null;
        parsed = raw ? JSON.parse(raw) : null;
    } catch (err) {
        return null;
    }

    if (!parsed || typeof parsed !== 'object') {
        return null;
    }

    return {
        token: typeof parsed.token === 'string' ? parsed.token : null,
        requestedAt: typeof parsed.requestedAt === 'string'
            ? parsed.requestedAt
            : null,
        path: typeof parsed.path === 'string' ? parsed.path : null
    };
}

function repairCurrentPage(environment) {
    environment = environment || {};

    var windowObject = environment.window || window;
    var token = randomToken(windowObject);
    var target = recoveryUrl(windowObject.location, token);
    var record = repairRecord(windowObject, token);

    rememberRepair(windowObject, record);

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
                url: target,
                record: record
            };
        });
}

module.exports = {
    QUERY_PARAMETER: QUERY_PARAMETER,
    STORAGE_KEY: STORAGE_KEY,
    randomToken: randomToken,
    recoveryUrl: recoveryUrl,
    repairRecord: repairRecord,
    rememberRepair: rememberRepair,
    lastRepair: lastRepair,
    repairCurrentPage: repairCurrentPage
};
