'use strict';

var QUERY_PARAMETER = 'xronosRepair';
var TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,96}$/;

function normalizeToken(value) {
    if (Array.isArray(value)) {
        value = value.length === 1 ? value[0] : null;
    }

    if (typeof value !== 'string' || !TOKEN_PATTERN.test(value)) {
        return null;
    }

    return value;
}

function appendToken(url, token) {
    token = normalizeToken(token);

    if (!token || typeof url !== 'string' || !url) {
        return url;
    }

    return url +
        (url.indexOf('?') === -1 ? '?' : '&') +
        QUERY_PARAMETER + '=' + encodeURIComponent(token);
}

function applyRecoveryResponse(req, res, baseVersionPath) {
    var token = normalizeToken(
        req && req.query ? req.query[QUERY_PARAMETER] : null
    );

    if (!token) {
        return null;
    }

    res.set('Clear-Site-Data', '"cache"');
    res.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    res.locals.xronosRepairToken = token;

    if (typeof baseVersionPath === 'function') {
        res.locals.versionPath = function(url) {
            return appendToken(baseVersionPath(url), token);
        };
    }

    return token;
}

module.exports = {
    QUERY_PARAMETER: QUERY_PARAMETER,
    TOKEN_PATTERN: TOKEN_PATTERN,
    normalizeToken: normalizeToken,
    appendToken: appendToken,
    applyRecoveryResponse: applyRecoveryResponse
};
