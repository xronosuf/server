"use strict";

var assert = require("assert");

var policy = require(
    "../public/javascripts/sage-canonical-replay-policy"
);

function entry(stableId, expression, consumer, scriptIndex) {
    return {
        stableId: stableId,
        expression: expression,
        latexify: true,
        consumer: consumer,
        scriptIndex: scriptIndex
    };
}

describe("canonical Sage replay policy", function() {
    it("keeps a globally unique replay mapping", function() {
        var entries = [
            entry("display-1", "p2c4", "display", 31)
        ];

        assert.strictEqual(
            policy.uniqueReplayEntry(
                entries,
                { expression: "p2c4", latexify: true }
            ).stableId,
            "display-1"
        );
    });

    it("preserves unique answer-key preference", function() {
        var entries = [
            entry("display-1", "same", "display", 10),
            entry("answer-1", "same", "answer-key", 11)
        ];

        assert.strictEqual(
            policy.uniqueReplayEntry(
                entries,
                { expression: "same", latexify: true }
            ).stableId,
            "answer-1"
        );
    });

    it("maps a completed-answer display replay by answer-key sibling", function() {
        var entries = [
            entry("hint-1", "p1c4", "display", 12),
            entry("hint-2", "p1c4", "display", 13),
            entry("equation-display", "p1c4", "display", 16),
            entry("equation-answer", "p1ans1", "answer-key", 16),
            entry("other-1", "p1c4", "display", 42)
        ];

        assert.strictEqual(
            policy.uniqueReplayEntry(
                entries,
                { expression: "p1c4", latexify: true }
            ).stableId,
            "equation-display"
        );
    });

    it("still rejects ambiguous completed-answer display replays", function() {
        var entries = [
            entry("display-1", "same", "display", 16),
            entry("answer-1", "answerA", "answer-key", 16),
            entry("display-2", "same", "display", 31),
            entry("answer-2", "answerB", "answer-key", 31)
        ];

        assert.strictEqual(
            policy.uniqueReplayEntry(
                entries,
                { expression: "same", latexify: true }
            ),
            null
        );
    });
});
