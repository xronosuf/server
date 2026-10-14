"use strict";

var assert = require("assert");
var policy = require("../lib/gradebook-card-policy");

describe("gradebook card policy", function() {
    it("counts each activity identity only once", function() {
        var result = policy.aggregate([
            {repositoryName: "r", activityPath: "a", weight: 1, completion: 1},
            {repositoryName: "r", activityPath: "a", weight: 1, completion: 1},
            {repositoryName: "r", activityPath: "b", weight: 1, completion: 1}
        ]);

        assert.strictEqual(result.pointsEarned, 2);
        assert.strictEqual(result.pointsPossibleFromCards, 2);
        assert.strictEqual(result.domCardCount, 3);
        assert.strictEqual(result.uniqueActivityCount, 2);
        assert.strictEqual(result.duplicateActivityCount, 1);
        assert.deepStrictEqual(result.duplicateKeys, ["r/a"]);
    });

    it("uses the historical maximum completion across duplicate representations", function() {
        var result = policy.aggregate([
            {repositoryName: "r", activityPath: "a", weight: 2, completion: 0.25},
            {repositoryName: "r", activityPath: "a", weight: 2, completion: 0.75}
        ]);

        assert.strictEqual(result.pointsEarned, 1.5);
        assert.strictEqual(result.pointsPossibleFromCards, 2);
        assert.strictEqual(result.contributions[0].completion, 0.75);
    });

    it("does not let duplicate cards inflate the denominator", function() {
        var result = policy.aggregate([
            {repositoryName: "r", activityPath: "a", weight: 1, completion: 1},
            {repositoryName: "r", activityPath: "a", weight: 1, completion: 1},
            {repositoryName: "r", activityPath: "b", weight: 3, completion: 0}
        ]);

        assert.strictEqual(result.pointsPossibleFromCards, 4);
    });

    it("ignores non-weighted structural cards", function() {
        var result = policy.aggregate([
            {repositoryName: null, activityPath: null, weight: undefined, completion: undefined},
            {repositoryName: "r", activityPath: "a", weight: 1, completion: 1}
        ]);

        assert.strictEqual(result.pointsEarned, 1);
        assert.strictEqual(result.uniqueActivityCount, 1);
    });

    it("reports conflicting duplicate weights without summing both copies", function() {
        var result = policy.aggregate([
            {repositoryName: "r", activityPath: "a", weight: 1, completion: 1},
            {repositoryName: "r", activityPath: "a", weight: 2, completion: 1}
        ]);

        assert.strictEqual(result.pointsEarned, 1);
        assert.deepStrictEqual(result.weightConflictKeys, ["r/a"]);
    });
});
