"use strict";

var assert = require("assert");

var serverPolicy =
    require("../sage-reliability-policy");

var browserPolicy =
    require("../public/javascripts/sage-error-policy");

describe("Sage reliability policy", function() {
    it("recognizes canonical page-result parsing failures", function() {
        assert.strictEqual(
            browserPolicy.isCanonicalPageResultError(
                "XronosSagePageResultError"
            ),
            true
        );

        assert.strictEqual(
            browserPolicy.isCanonicalPageResultError(
                "XronosSageExpressionError"
            ),
            false
        );
    });

    it("falls back for local SageCell transport or missing-response failure", function() {
        assert.strictEqual(
            serverPolicy.sagecellProxyShouldFallback(
                new Error("controlled transport failure"),
                null
            ),
            true
        );

        assert.strictEqual(
            serverPolicy.sagecellProxyShouldFallback(
                null,
                null
            ),
            true
        );
    });

    it("falls back for transient local SageCell infrastructure statuses", function() {
        [408, 429, 500, 502, 503, 504].forEach(function(statusCode) {
            assert.strictEqual(
                serverPolicy.sagecellProxyShouldFallback(
                    null,
                    {
                        statusCode: statusCode
                    }
                ),
                true,
                "expected fallback for HTTP " + statusCode
            );
        });
    });

    it("does not fall back for normal or non-infrastructure statuses", function() {
        [200, 400, 401, 403, 404, 409, 422].forEach(function(statusCode) {
            assert.strictEqual(
                serverPolicy.sagecellProxyShouldFallback(
                    null,
                    {
                        statusCode: statusCode
                    }
                ),
                false,
                "did not expect fallback for HTTP " + statusCode
            );
        });
    });
});
