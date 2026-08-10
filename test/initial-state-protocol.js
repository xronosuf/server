"use strict";

var assert = require("assert");
var protocol = require(
    "../public/javascripts/initial-state-protocol"
);

describe("initial-state protocol", function() {
    it("reports invalid-request without an activity hash", function() {
        assert.deepStrictEqual(
            protocol.serverResult(null, null, null),
            {
                outcome: "invalid-request",
                reason: "missing-activity-hash"
            }
        );
    });

    it("reports failed for a lookup error", function() {
        assert.deepStrictEqual(
            protocol.serverResult(
                "activity-hash",
                new Error("lookup failed"),
                null
            ),
            {
                outcome: "failed",
                reason: "state-query-failed"
            }
        );
    });

    it("reports empty when no State exists", function() {
        assert.deepStrictEqual(
            protocol.serverResult(
                "activity-hash",
                null,
                null
            ),
            {
                outcome: "empty",
                data: {}
            }
        );
    });

    it("reports found with persisted data", function() {
        var data = {
            one: { correct: true },
            two: { attempt: "2" }
        };

        assert.deepStrictEqual(
            protocol.serverResult(
                "activity-hash",
                null,
                { data: data }
            ),
            {
                outcome: "found",
                data: data
            }
        );
    });

    it("preserves valid client results", function() {
        assert.deepStrictEqual(
            protocol.normalizeClientResult({
                outcome: "empty",
                data: {}
            }),
            {
                outcome: "empty",
                data: {}
            }
        );

        assert.deepStrictEqual(
            protocol.normalizeClientResult({
                outcome: "failed",
                reason: "state-query-failed"
            }),
            {
                outcome: "failed",
                reason: "state-query-failed"
            }
        );

        assert.deepStrictEqual(
            protocol.normalizeClientResult({
                outcome: "invalid-request",
                reason: "missing-activity-hash"
            }),
            {
                outcome: "invalid-request",
                reason: "missing-activity-hash"
            }
        );
    });

    it("rejects an unknown client outcome", function() {
        assert.deepStrictEqual(
            protocol.normalizeClientResult({
                outcome: "surprise"
            }),
            {
                outcome: "failed",
                reason: "invalid-initial-state-result"
            }
        );
    });

    it("normalizes missing successful data to {}", function() {
        assert.deepStrictEqual(
            protocol.normalizeClientResult({
                outcome: "found"
            }),
            {
                outcome: "found",
                data: {}
            }
        );
    });

    it("counts state identifiers", function() {
        assert.strictEqual(
            protocol.stateIdentifierCount({
                one: {},
                two: {},
                three: {}
            }),
            3
        );

        assert.strictEqual(
            protocol.stateIdentifierCount({}),
            0
        );
    });
});
