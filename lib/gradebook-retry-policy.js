'use strict';

function shouldRetry(err, response) {
    if (err) {
        return true;
    }

    var statusCode = response && response.statusCode;

    return statusCode === 429 ||
        (statusCode >= 500 && statusCode < 600);
}

exports.shouldRetry = shouldRetry;
