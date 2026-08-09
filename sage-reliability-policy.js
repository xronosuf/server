"use strict";

function sagecellProxyShouldFallbackStatus(statusCode) {
    return statusCode === 408 ||
        statusCode === 429 ||
        statusCode === 500 ||
        statusCode === 502 ||
        statusCode === 503 ||
        statusCode === 504;
}

function sagecellProxyShouldFallback(err, response) {
    if (err) {
        return true;
    }

    if (!response) {
        return true;
    }

    return sagecellProxyShouldFallbackStatus(
        response.statusCode || 0
    );
}

module.exports = {
    sagecellProxyShouldFallbackStatus:
        sagecellProxyShouldFallbackStatus,

    sagecellProxyShouldFallback:
        sagecellProxyShouldFallback
};
