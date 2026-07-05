var fs = require("fs");
var config = require('../config');
var path = require('path');

var lrsRoot = config.repositories.root;

function readJsonIfPresent(filename, callback) {
    fs.readFile(filename, 'utf8', function(err, data) {
        if (err) {
            if (err.code === 'ENOENT') {
                callback(null, null);
                return;
            }

            callback(err);
            return;
        }

        try {
            callback(null, JSON.parse(data));
        } catch (parseErr) {
            callback(parseErr);
        }
    });
}

function cloneActivity(activity) {
    if (!activity) {
        return {};
    }

    return JSON.parse(JSON.stringify(activity));
}

function mergeAttemptStats(activity, attemptActivity) {
    if (!activity || !attemptActivity) {
        return activity;
    }

    Object.keys(attemptActivity).forEach(function(problemId) {
        Object.keys(attemptActivity[problemId] || {}).forEach(function(answerId) {
            if (activity[problemId] && activity[problemId][answerId]) {
                activity[problemId][answerId].attempts = attemptActivity[problemId][answerId];
            }
        });
    });

    return activity;
}

// BADBAD: This is horribly slow.
exports.get = function(req, res, next) {
    var repository = req.params.repository;
    var activityHash = req.params.activityHash;
    var directory = path.join(lrsRoot, repository + ".git");
    var summaryFilename = path.join(directory, "summary.json");
    var attemptSummaryFilename = path.join(directory, "answer-attempt-summary.json");

    readJsonIfPresent(summaryFilename, function(summaryErr, summary) {
        if (summaryErr) {
            next(summaryErr);
            return;
        }

        readJsonIfPresent(attemptSummaryFilename, function(attemptErr, attemptSummary) {
            var activity;

            if (attemptErr) {
                next(attemptErr);
                return;
            }

            activity = cloneActivity(summary && summary.activities && summary.activities[activityHash]);
            mergeAttemptStats(
                activity,
                attemptSummary && attemptSummary.activities && attemptSummary.activities[activityHash]
            );

            res.json(activity);
        });
    });
};
