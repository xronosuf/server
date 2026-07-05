var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var async = require('async');
var config = require('../config');
var learningRecordStore = require('./read-lrs.js');

var ANSWERED_VERB = 'http://adlnet.gov/expapi/verbs/answered';
var ANSWER_ID_RE = /\/activities\/([^\/]+)\/problems\/([^\/]+)\/answers\/([^\/]+)/;

var schedulerStarted = false;
var schedulerRunning = false;

function readIntegerEnv(name, defaultValue) {
    var raw = process.env[name];
    var parsed;

    if (raw === undefined || raw === null || raw === '') {
        return defaultValue;
    }

    parsed = parseInt(raw, 10);

    if (isNaN(parsed)) {
        return defaultValue;
    }

    return parsed;
}

function isDisabled() {
    return process.env.XIMERA_ANSWER_ATTEMPT_STATS_DISABLED === 'true';
}

function scheduledHour() {
    var hour = readIntegerEnv('XIMERA_ANSWER_ATTEMPT_STATS_HOUR', 3);

    if (hour < 0) {
        return 0;
    }

    if (hour > 23) {
        return 23;
    }

    return hour;
}

function frequencyHours() {
    var hours = readIntegerEnv('XIMERA_ANSWER_ATTEMPT_STATS_FREQUENCY_HOURS', 24);

    if (hours < 1) {
        return 24;
    }

    return hours;
}

function millisecondsUntilNextRun(now) {
    var hour = scheduledHour();
    var frequency = frequencyHours();
    var next = new Date(now.getTime());

    next.setHours(hour, 0, 0, 0);

    while (next <= now) {
        next = new Date(next.getTime() + frequency * 60 * 60 * 1000);
    }

    return next.getTime() - now.getTime();
}

function answerKey(activityHash, problemId, answerId) {
    return activityHash + '/' + problemId + '/' + answerId;
}

function stableActorKey(entry) {
    var actor = entry.actor || {};
    var account = actor.account || {};
    var raw;

    if (account.homePage || account.name) {
        raw = String(account.homePage || '') + '|' + String(account.name || '');
    } else if (actor.mbox) {
        raw = String(actor.mbox);
    } else if (actor.name) {
        raw = String(actor.name);
    } else {
        raw = 'unknown-actor';
    }

    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

function parseTime(entry, sequence) {
    var raw = entry.timestamp || entry.stored;
    var parsed = Date.parse(raw);

    if (isNaN(parsed)) {
        return sequence;
    }

    return parsed;
}

function ensureAnswer(bucket, activityHash, problemId, answerId) {
    var key = answerKey(activityHash, problemId, answerId);

    if (!bucket[key]) {
        bucket[key] = {
            activityHash: activityHash,
            problemId: problemId,
            answerId: answerId,
            learners: {}
        };
    }

    return bucket[key];
}

function mean(values) {
    var total = 0;

    if (values.length === 0) {
        return null;
    }

    values.forEach(function(value) {
        total += value;
    });

    return total / values.length;
}

function round(value) {
    if (value === null || value === undefined) {
        return null;
    }

    return Math.round(value * 100) / 100;
}

function summarizeAnswer(answer) {
    var learnerKeys = Object.keys(answer.learners);
    var attemptedStudents = learnerKeys.length;
    var eventuallyCorrect = 0;
    var correctOnFirst = 0;
    var correctOnSecond = 0;
    var correctAfterThreePlus = 0;
    var neverCorrect = 0;
    var attemptsToFirstCorrect = [];
    var attemptsToOutcomeAmongAllAttempted = [];
    var totalSubmissionsPerAttemptedStudent = [];
    var totalAttempts = 0;
    var correctAttempts = 0;
    var incorrectAttempts = 0;
    var postFirstCorrectSubmissions = 0;

    learnerKeys.forEach(function(learnerKey) {
        var attempts = answer.learners[learnerKey].slice();

        attempts.sort(function(a, b) {
            if (a.time !== b.time) {
                return a.time - b.time;
            }

            return a.sequence - b.sequence;
        });

        totalAttempts += attempts.length;
        totalSubmissionsPerAttemptedStudent.push(attempts.length);

        attempts.forEach(function(attempt) {
            if (attempt.success === true) {
                correctAttempts += 1;
            } else if (attempt.success === false) {
                incorrectAttempts += 1;
            }
        });

        var firstCorrectIndex = null;

        attempts.some(function(attempt, index) {
            if (attempt.success === true) {
                firstCorrectIndex = index + 1;
                return true;
            }

            return false;
        });

        if (firstCorrectIndex === null) {
            neverCorrect += 1;
            attemptsToOutcomeAmongAllAttempted.push(attempts.length);
        } else {
            eventuallyCorrect += 1;
            attemptsToFirstCorrect.push(firstCorrectIndex);
            attemptsToOutcomeAmongAllAttempted.push(firstCorrectIndex);
            postFirstCorrectSubmissions += Math.max(0, attempts.length - firstCorrectIndex);

            if (firstCorrectIndex === 1) {
                correctOnFirst += 1;
            } else if (firstCorrectIndex === 2) {
                correctOnSecond += 1;
            } else {
                correctAfterThreePlus += 1;
            }
        }
    });

    return {
        attemptedStudents: attemptedStudents,
        eventuallyCorrect: eventuallyCorrect,
        correctOnFirstAttempt: correctOnFirst,
        correctOnSecondAttempt: correctOnSecond,
        correctAfterThreeOrMoreAttempts: correctAfterThreePlus,
        neverCorrect: neverCorrect,
        meanAttemptsToFirstCorrectAmongEventuallyCorrect: round(mean(attemptsToFirstCorrect)),
        meanAttemptsToOutcomeAmongAllAttemptedStudents: round(mean(attemptsToOutcomeAmongAllAttempted)),
        meanTotalSubmissionsPerAttemptedStudent: round(mean(totalSubmissionsPerAttemptedStudent)),
        postFirstCorrectSubmissions: postFirstCorrectSubmissions,
        totalAttempts: totalAttempts,
        correctAttempts: correctAttempts,
        incorrectAttempts: incorrectAttempts
    };
}

function summarizeAnswersByActivity(answers) {
    var summary = {
        generatedAt: new Date().toISOString(),
        activities: {}
    };

    Object.keys(answers).forEach(function(key) {
        var answer = answers[key];
        var stats = summarizeAnswer(answer);

        summary.activities[answer.activityHash] = summary.activities[answer.activityHash] || {};
        summary.activities[answer.activityHash][answer.problemId] =
            summary.activities[answer.activityHash][answer.problemId] || {};
        summary.activities[answer.activityHash][answer.problemId][answer.answerId] = stats;
    });

    return summary;
}

function buildFromLrs(lrsFilename, callback) {
    var answers = {};
    var sequence = 0;

    learningRecordStore.read(
        lrsFilename,
        0,
        function(entry, next) {
            sequence += 1;

            try {
                var objectId = entry.object && entry.object.id;
                var matches = objectId && objectId.match(ANSWER_ID_RE);

                if (matches &&
                    entry.verb &&
                    entry.verb.id === ANSWERED_VERB) {
                    var activityHash = matches[1];
                    var problemId = matches[2];
                    var answerId = matches[3];
                    var answer = ensureAnswer(answers, activityHash, problemId, answerId);
                    var learnerKey = stableActorKey(entry);

                    if (!answer.learners[learnerKey]) {
                        answer.learners[learnerKey] = [];
                    }

                    answer.learners[learnerKey].push({
                        success: entry.result && entry.result.success,
                        time: parseTime(entry, sequence),
                        sequence: sequence
                    });
                }

                next(null);
            } catch (err) {
                next(err);
            }
        },
        function(err) {
            if (err) {
                callback(err);
                return;
            }

            callback(null, summarizeAnswersByActivity(answers));
        }
    );
}

function rebuildRepository(repository, callback) {
    repository = repository.replace(/\.git$/, '');

    var directory = path.join(config.repositories.root, repository + '.git');
    var lrsFilename = path.join(directory, 'learning-record-store');
    var outputFilename = path.join(directory, 'answer-attempt-summary.json');
    var temporaryFilename = outputFilename + '.tmp';

    fs.stat(lrsFilename, function(err) {
        if (err) {
            callback(null, {
                repository: repository,
                skipped: true,
                reason: 'missing learning-record-store'
            });
            return;
        }

        console.log('Building answer attempt summary for ' + repository);

        buildFromLrs(lrsFilename, function(buildErr, summary) {
            if (buildErr) {
                callback(buildErr);
                return;
            }

            fs.writeFile(temporaryFilename, JSON.stringify(summary), function(writeErr) {
                if (writeErr) {
                    callback(writeErr);
                    return;
                }

                fs.rename(temporaryFilename, outputFilename, function(renameErr) {
                    if (renameErr) {
                        callback(renameErr);
                        return;
                    }

                    callback(null, {
                        repository: repository,
                        skipped: false,
                        outputFilename: outputFilename,
                        activityCount: Object.keys(summary.activities || {}).length
                    });
                });
            });
        });
    });
}

function repositoryNames(callback) {
    fs.readdir(config.repositories.root, function(err, files) {
        if (err) {
            callback(err);
            return;
        }

        callback(null, files.filter(function(file) {
            return /\.git$/.test(file);
        }).map(function(file) {
            return file.replace(/\.git$/, '');
        }));
    });
}

function rebuildAllRepositories(callback) {
    repositoryNames(function(err, repositories) {
        if (err) {
            callback(err);
            return;
        }

        async.mapSeries(repositories, rebuildRepository, callback);
    });
}

function scheduleNextRun() {
    var delay = millisecondsUntilNextRun(new Date());

    setTimeout(function() {
        if (isDisabled()) {
            console.log('Answer attempt summary scheduler is disabled.');
            scheduleNextRun();
            return;
        }

        if (schedulerRunning) {
            console.log('Answer attempt summary build already running; skipping this scheduled run.');
            scheduleNextRun();
            return;
        }

        schedulerRunning = true;
        rebuildAllRepositories(function(err, results) {
            schedulerRunning = false;

            if (err) {
                console.error('Answer attempt summary build failed:', err);
            } else {
                console.log('Answer attempt summary build finished:', JSON.stringify(results));
            }

            scheduleNextRun();
        });
    }, delay);
}

function startScheduler() {
    if (schedulerStarted) {
        return;
    }

    schedulerStarted = true;

    if (isDisabled()) {
        console.log('Answer attempt summary scheduler is disabled.');
        return;
    }

    console.log(
        'Answer attempt summary scheduler enabled. Local hour=' +
        scheduledHour() +
        ', frequencyHours=' +
        frequencyHours()
    );

    scheduleNextRun();
}

module.exports = {
    buildFromLrs: buildFromLrs,
    rebuildRepository: rebuildRepository,
    rebuildAllRepositories: rebuildAllRepositories,
    startScheduler: startScheduler,
    _millisecondsUntilNextRun: millisecondsUntilNextRun
};
