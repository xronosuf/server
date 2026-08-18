var fs = require("fs");
var config = require("../config");
var path = require("path");

var lrsRoot = config.repositories.root;

function readJsonIfPresent(filename, callback) {
    fs.readFile(filename, "utf8", function(error, data) {
        if (error) {
            if (error.code === "ENOENT") {
                callback(null, null);
                return;
            }

            callback(error);
            return;
        }

        try {
            callback(null, JSON.parse(data));
        } catch (parseError) {
            callback(parseError);
        }
    });
}

function numericCount(value) {
    var count = Number(value);

    if (isNaN(count)) {
        return 0;
    }

    return count;
}

function statisticsForAnswer(attempts) {
    attempts = attempts || {};

    var statistics = {
        responses: attempts.responses || {},
        successes: {
            true: numericCount(attempts.correctAttempts),
            false: numericCount(attempts.incorrectAttempts)
        },
        attempts: attempts
    };

    if (attempts.rawResponses) {
        statistics.rawResponses =
            attempts.rawResponses;
    }

    if (attempts.omittedPostFirstCorrectResponses) {
        statistics.omittedPostFirstCorrectResponses =
            attempts.omittedPostFirstCorrectResponses;
    }

    return statistics;
}

function activityStatistics(attemptActivity, activityStats) {
    var activity = {};

    Object.keys(attemptActivity || {}).forEach(function(problemId) {
        activity[problemId] = {};

        Object.keys(
            attemptActivity[problemId] || {}
        ).forEach(function(answerId) {
            activity[problemId][answerId] =
                statisticsForAnswer(
                    attemptActivity[problemId][answerId]
                );
        });
    });

    if (activityStats) {
        activity._activityStats = activityStats;
    }

    return activity;
}

exports.get = function(req, res, next) {
    var repository = req.params.repository;
    var activityHash = req.params.activityHash;
    var directory = path.join(
        lrsRoot,
        repository + ".git"
    );
    var attemptSummaryFilename = path.join(
        directory,
        "answer-attempt-summary.json"
    );

    readJsonIfPresent(
        attemptSummaryFilename,
        function(error, attemptSummary) {
            if (error) {
                next(error);
                return;
            }

            res.json(
                activityStatistics(
                    attemptSummary &&
                        attemptSummary.activities &&
                        attemptSummary.activities[
                            activityHash
                        ],
                    attemptSummary &&
                        attemptSummary.activityStats &&
                        attemptSummary.activityStats[
                            activityHash
                        ]
                )
            );
        }
    );
};

/*
 * Exported for focused unit tests. These helpers contain no filesystem or
 * request state and define the compatibility shape sent to the browser.
 */
exports.statisticsForAnswer =
    statisticsForAnswer;
exports.activityStatistics =
    activityStatistics;
