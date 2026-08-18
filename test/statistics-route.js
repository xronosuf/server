"use strict";

var assert = require("assert");
var statistics = require("../routes/statistics");

describe("statistics route compatibility shape", function() {
    it("derives successes from filtered modern attempt counts", function() {
        var attempts = {
            attemptedStudents: 4,
            totalAttempts: 7,
            totalAttemptsRaw: 9,
            correctAttempts: 3,
            incorrectAttempts: 4,
            postFirstCorrectSubmissions: 2,
            responses: {
                "2": 3,
                "3": 4
            },
            rawResponses: {
                "2": 4,
                "3": 5
            },
            omittedPostFirstCorrectResponses: {
                "2": 1,
                "3": 1
            }
        };

        var result =
            statistics.statisticsForAnswer(attempts);

        assert.deepStrictEqual(
            result.successes,
            {
                true: 3,
                false: 4
            }
        );

        assert.deepStrictEqual(
            result.responses,
            attempts.responses
        );

        assert.deepStrictEqual(
            result.rawResponses,
            attempts.rawResponses
        );

        assert.deepStrictEqual(
            result.omittedPostFirstCorrectResponses,
            attempts.omittedPostFirstCorrectResponses
        );

        assert.strictEqual(
            result.attempts,
            attempts
        );
    });

    it("uses the modern summary as the answer-box structure", function() {
        var answer = {
            correctAttempts: 2,
            incorrectAttempts: 1,
            responses: {
                "x": 1,
                "2-x": 2
            }
        };

        var activity =
            statistics.activityStatistics(
                {
                    problemOne: {
                        answerOne: answer
                    }
                },
                {
                    tryAnother: {
                        attemptedStudents: 3
                    }
                }
            );

        assert.ok(activity.problemOne);
        assert.ok(
            activity.problemOne.answerOne
        );

        assert.deepStrictEqual(
            activity.problemOne.answerOne.successes,
            {
                true: 2,
                false: 1
            }
        );

        assert.deepStrictEqual(
            activity._activityStats,
            {
                tryAnother: {
                    attemptedStudents: 3
                }
            }
        );
    });

    it("returns an empty activity when no modern summary exists", function() {
        assert.deepStrictEqual(
            statistics.activityStatistics(
                null,
                null
            ),
            {}
        );
    });
});
