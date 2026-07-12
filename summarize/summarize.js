"use strict";

var fs = require("fs");
var config = require("../config");
var path = require("path");
var learningRecordStore = require("./read-lrs.js");
var async = require("async");

function mergeResponseIntoAnswers(answers, entry) {
    /*
     * Do not log raw learning-record entries by default. These records may
     * include student responses and should not be printed into routine logs.
     */
    if (
        process.env.XIMERA_DEBUG_SUMMARY_RECORDS ===
        "true"
    ) {
        console.log(entry);
    }

    if (!answers.responses) {
        answers.responses = {};
    }

    if (entry.result) {
        var response = entry.result.response;

        if (response) {
            answers.responses[response] =
                (answers.responses[response] || 0) + 1;
        }
    }
}

function mergeSuccessIntoAnswers(answers, entry) {
    if (!answers.successes) {
        answers.successes = {};
    }

    if (entry.result) {
        var success = entry.result.success;

        if (success === true || success === false) {
            answers.successes[success] =
                (answers.successes[success] || 0) + 1;
        }
    }
}

function mergeEntryIntoSummary(summary, entry) {
    if (!summary.activities) {
        summary.activities = {};
    }

    if (
        entry.object &&
        entry.object.objectType === "Activity"
    ) {
        var id = entry.object.id;

        if (id) {
            var matches = id.match(
                /\/activities\/([^/]+)\/problems\/([^/]+)\/answers\/([^/]+)/
            );

            if (matches) {
                var activityHash = matches[1];
                var problemId = matches[2];
                var answerId = matches[3];

                summary.activities[activityHash] =
                    summary.activities[activityHash] || {};

                summary.activities[activityHash][problemId] =
                    summary.activities[activityHash][problemId] || {};

                summary.activities[activityHash][problemId][answerId] =
                    summary.activities[activityHash][problemId][answerId] ||
                    {};

                if (
                    entry.verb &&
                    entry.verb.id ===
                        "http://adlnet.gov/expapi/verbs/answered"
                ) {
                    var answer =
                        summary.activities[activityHash][problemId][answerId];

                    mergeResponseIntoAnswers(answer, entry);
                    mergeSuccessIntoAnswers(answer, entry);
                }
            }
        }
    }
}

function acquireSummaryLock(lockFilename, callback) {
    var startedAt = Date.now();
    var maximumWaitMilliseconds = 2 * 60 * 1000;
    var retryMilliseconds = 500;
    var staleMilliseconds = 30 * 60 * 1000;

    function attempt() {
        fs.open(
            lockFilename,
            "wx",
            0o660,
            function(error, fd) {
                if (!error) {
                    var lockData = JSON.stringify({
                        pid: process.pid,
                        createdAt:
                            new Date().toISOString()
                    });

                    fs.write(
                        fd,
                        lockData,
                        function(writeError) {
                            fs.close(
                                fd,
                                function(closeError) {
                                    callback(
                                        writeError ||
                                        closeError ||
                                        null
                                    );
                                }
                            );
                        }
                    );

                    return;
                }

                if (error.code !== "EEXIST") {
                    callback(error);
                    return;
                }

                fs.stat(
                    lockFilename,
                    function(statError, stat) {
                        if (
                            !statError &&
                            Date.now() -
                                stat.mtimeMs >
                                staleMilliseconds
                        ) {
                            console.warn(
                                "Removing stale summary lock " +
                                lockFilename
                            );

                            fs.unlink(
                                lockFilename,
                                function(unlinkError) {
                                    if (
                                        unlinkError &&
                                        unlinkError.code !==
                                            "ENOENT"
                                    ) {
                                        callback(unlinkError);
                                        return;
                                    }

                                    attempt();
                                }
                            );

                            return;
                        }

                        if (
                            Date.now() - startedAt >=
                            maximumWaitMilliseconds
                        ) {
                            callback(
                                new Error(
                                    "Timed out waiting for summary lock: " +
                                    lockFilename
                                )
                            );

                            return;
                        }

                        setTimeout(
                            attempt,
                            retryMilliseconds
                        );
                    }
                );
            }
        );
    }

    attempt();
}

function releaseSummaryLock(lockFilename, callback) {
    fs.unlink(
        lockFilename,
        function(error) {
            if (error && error.code !== "ENOENT") {
                callback(error);
                return;
            }

            callback(null);
        }
    );
}

function summarizeRepository(repositoryName, callback) {
    var directory = path.join(
        config.repositories.root,
        repositoryName
    );

    var lrsFilename = path.join(
        directory,
        "learning-record-store"
    );

    var summaryFilename = path.join(
        directory,
        "summary.json"
    );

    var lockFilename = path.join(
        directory,
        "summary.json.lock"
    );

    acquireSummaryLock(
        lockFilename,
        function(lockError) {
            if (lockError) {
                callback(lockError);
                return;
            }

            console.log(
                "Summarizing " + summaryFilename
            );

            async.waterfall(
                [
                    function(readCallback) {
                        fs.readFile(
                            summaryFilename,
                            "utf8",
                            function(error, data) {
                                if (error) {
                                    readCallback(
                                        null,
                                        { position: 0 }
                                    );

                                    return;
                                }

                                try {
                                    readCallback(
                                        null,
                                        JSON.parse(data)
                                    );
                                } catch (
                                    parseError
                                ) {
                                    console.error(
                                        "JSON.parse " +
                                        summaryFilename +
                                        ": " +
                                        parseError.message
                                    );

                                    fs.renameSync(
                                        summaryFilename,
                                        summaryFilename +
                                            ".err"
                                    );

                                    readCallback(
                                        null,
                                        { position: 0 }
                                    );
                                }
                            }
                        );
                    },

                    function(
                        summary,
                        readCallback
                    ) {
                        learningRecordStore.read(
                            lrsFilename,
                            summary.position || 0,

                            function(
                                entry,
                                entryCallback
                            ) {
                                mergeEntryIntoSummary(
                                    summary,
                                    entry
                                );

                                entryCallback(null);
                            },

                            function(
                                error,
                                position
                            ) {
                                if (error) {
                                    if (
                                        error.code ===
                                        "ENOENT"
                                    ) {
                                        readCallback(
                                            null,
                                            summary
                                        );
                                    } else {
                                        readCallback(
                                            error
                                        );
                                    }

                                    return;
                                }

                                summary.position =
                                    position;

                                readCallback(
                                    null,
                                    summary
                                );
                            }
                        );
                    },

                    function(
                        summary,
                        writeCallback
                    ) {
                        var temporaryFilename =
                            summaryFilename +
                            ".tmp." +
                            process.pid;

                        fs.writeFile(
                            temporaryFilename,
                            JSON.stringify(
                                summary
                            ),
                            function(error) {
                                if (error) {
                                    writeCallback(
                                        error
                                    );

                                    return;
                                }

                                fs.rename(
                                    temporaryFilename,
                                    summaryFilename,
                                    function(
                                        renameError
                                    ) {
                                        writeCallback(
                                            renameError,
                                            summary
                                        );
                                    }
                                );
                            }
                        );
                    }
                ],

                function(
                    summaryError,
                    summary
                ) {
                    releaseSummaryLock(
                        lockFilename,
                        function(
                            releaseError
                        ) {
                            callback(
                                summaryError ||
                                    releaseError ||
                                    null,
                                summary
                            );
                        }
                    );
                }
            );
        }
    );
}

function summarizeAllRepositories(callback) {
    console.log("Summarizing learning records");

    fs.readdir(
        config.repositories.root,
        function(error, items) {
            if (error) {
                if (callback) {
                    callback(error);
                } else {
                    console.error(error);
                }

                return;
            }

            async.each(
                items.filter(function(item) {
                    return item.endsWith(".git");
                }),

                summarizeRepository,

                function(summaryError) {
                    if (summaryError) {
                        console.error(summaryError);
                    }

                    if (callback) {
                        callback(summaryError);
                    }
                }
            );
        }
    );
}

module.exports = {
    summarizeRepository: summarizeRepository,
    summarizeAllRepositories:
        summarizeAllRepositories
};

if (
    process.env.XIMERA_SUMMARY_NO_SCHEDULER !==
    "true"
) {
    summarizeAllRepositories();

    setInterval(
        summarizeAllRepositories,
        1000 * 60 * 15
    );
}
