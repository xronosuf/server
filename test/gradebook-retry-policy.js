'use strict';

var assert = require('assert');
var retryPolicy = require('../lib/gradebook-retry-policy');

describe('gradebook Canvas retry policy', function() {
    it('retries network errors', function() {
        assert.strictEqual(
            retryPolicy.shouldRetry(
                new Error('synthetic network failure'),
                null
            ),
            true
        );
    });

    it('retries HTTP 429', function() {
        assert.strictEqual(
            retryPolicy.shouldRetry(null, { statusCode: 429 }),
            true
        );
    });

    [500, 502, 503, 504].forEach(function(statusCode) {
        it('retries HTTP ' + statusCode, function() {
            assert.strictEqual(
                retryPolicy.shouldRetry(
                    null,
                    { statusCode: statusCode }
                ),
                true
            );
        });
    });

    [400, 401, 403, 404, 422].forEach(function(statusCode) {
        it('does not retry HTTP ' + statusCode, function() {
            assert.strictEqual(
                retryPolicy.shouldRetry(
                    null,
                    { statusCode: statusCode }
                ),
                false
            );
        });
    });

    it('does not retry HTTP 200', function() {
        assert.strictEqual(
            retryPolicy.shouldRetry(null, { statusCode: 200 }),
            false
        );
    });
});
