#!/usr/bin/env node

/*
 * Privacy-safe per-answer-box attempt statistics prototype.
 *
 * Usage:
 *   node scripts/answer-attempt-stats.js --repository mac1140test --activity <activityHash>
 *
 * Optional visible page labels:
 *   node scripts/answer-attempt-stats.js --repository mac1140test --activity <activityHash> --page-map-file /tmp/page-map.json
 *
 * The page-map file can be the object returned by the browser diagnostic:
 *   { "pageAnswerMap": [...] }
 *
 * This script groups raw xAPI answered statements by anonymous learner key,
 * activity hash, rendered problem id, and rendered answer id. It does not
 * print names, emails, raw learner ids, or raw submitted responses.
 */

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var config = require('../config');
var learningRecordStore = require('../summarize/read-lrs.js');

var ANSWERED_VERB = 'http://adlnet.gov/expapi/verbs/answered';
var ANSWER_ID_RE = /\/activities\/([^\/]+)\/problems\/([^\/]+)\/answers\/([^\/]+)/;

function readArg(name) {
    var index = process.argv.indexOf(name);

    if (index >= 0 && index + 1 < process.argv.length) {
        return process.argv[index + 1];
    }

    return undefined;
}

function usage() {
    console.log([
        'Usage:',
        '  node scripts/answer-attempt-stats.js --repository <repository> --activity <activityHash>',
        '',
        'Optional:',
        '  --page-map-file <json-file>',
        '',
        'Example:',
        '  node scripts/answer-attempt-stats.js --repository mac1140test --activity 39815efab1977975e8dc9eb3a6eff39f409e16fd'
    ].join('\n'));
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

function answerKey(problemId, answerId) {
    return problemId + '/' + answerId;
}

function ensureAnswer(bucket, problemId, answerId) {
    var key = answerKey(problemId, answerId);

    if (!bucket[key]) {
        bucket[key] = {
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

function normalizePageMap(raw) {
    var rows;
    var map = {};

    if (!raw) {
        return map;
    }

    rows = raw.pageAnswerMap || raw;

    if (!Array.isArray(rows)) {
        return map;
    }

    rows.forEach(function(problemRow, problemIndex) {
        var problemId = problemRow.rawProblemId || problemRow.problemId;
        var pageProblemNumber = problemRow.pageProblemNumber || problemIndex + 1;
        var displayedProblemLabel = problemRow.displayedProblemLabel ||
            ('Page problem ' + pageProblemNumber);
        var answers = problemRow.answers || [];

        if (Array.isArray(problemRow.answerIds)) {
            answers = problemRow.answerIds.map(function(answerId, index) {
                return {
                    answerId: answerId,
                    pageAnswerNumber: index + 1
                };
            });
        }

        map.problems = map.problems || {};
        map.problems[problemId] = {
            pageProblemNumber: pageProblemNumber,
            displayedProblemLabel: displayedProblemLabel,
            rawProblemId: problemId
        };

        answers.forEach(function(answerRow, index) {
            var answerId = answerRow.answerId;
            var pageAnswerNumber = answerRow.pageAnswerNumber || index + 1;

            if (problemId && answerId) {
                map[answerKey(problemId, answerId)] = {
                    pageProblemNumber: pageProblemNumber,
                    displayedProblemLabel: displayedProblemLabel,
                    pageAnswerNumber: pageAnswerNumber,
                    displayedAnswerLabel: 'Answer Box ' + pageAnswerNumber,
                    rawProblemId: problemId,
                    rawAnswerId: answerId
                };
            }
        });
    });

    return map;
}

function loadPageMap(filename) {
    if (!filename) {
        return {};
    }

    return normalizePageMap(JSON.parse(fs.readFileSync(filename, 'utf8')));
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

function summaryAttemptCount(repository, activityHash, problemId, answerId) {
    var summaryFilename = path.join(
        config.repositories.root,
        repository + '.git',
        'summary.json'
    );
    var summary;
    var answer;
    var successes;

    try {
        summary = JSON.parse(fs.readFileSync(summaryFilename, 'utf8'));
        answer = summary.activities &&
            summary.activities[activityHash] &&
            summary.activities[activityHash][problemId] &&
            summary.activities[activityHash][problemId][answerId];

        successes = answer && answer.successes;

        if (!successes) {
            return null;
        }

        return (successes.true || 0) + (successes.false || 0);
    } catch (err) {
        return null;
    }
}

function problemSortKey(problem) {
    if (problem.pageProblemNumber !== null && problem.pageProblemNumber !== undefined) {
        return problem.pageProblemNumber;
    }

    return Number.MAX_SAFE_INTEGER;
}

var repository = readArg('--repository') || readArg('--repo');
var activityHash = readArg('--activity') || readArg('--activityHash');
var pageMapFile = readArg('--page-map-file') || readArg('--pageMapFile');

if (!repository || !activityHash) {
    usage();
    process.exitCode = 1;
} else {
    repository = repository.replace(/\.git$/, '');

    var pageMap = loadPageMap(pageMapFile);
    var lrsFilename = path.join(
        config.repositories.root,
        repository + '.git',
        'learning-record-store'
    );

    var answers = {};
    var sequence = 0;

    learningRecordStore.read(
        lrsFilename,
        0,
        function(entry, callback) {
            sequence += 1;

            try {
                var objectId = entry.object && entry.object.id;
                var matches = objectId && objectId.match(ANSWER_ID_RE);

                if (matches &&
                    matches[1] === activityHash &&
                    entry.verb &&
                    entry.verb.id === ANSWERED_VERB) {
                    var problemId = matches[2];
                    var answerId = matches[3];
                    var answer = ensureAnswer(answers, problemId, answerId);
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

                callback(null);
            } catch (err) {
                callback(err);
            }
        },
        function(err) {
            if (err) {
                console.error(err);
                process.exitCode = 1;
                return;
            }

            var answerKeys = Object.keys(answers);
            var problems = {};
            var report = {
                repository: repository,
                activityHash: activityHash,
                answerCount: answerKeys.length,
                pageMapApplied: pageMapFile ? true : false,
                problems: []
            };

            answerKeys.forEach(function(key) {
                var answer = answers[key];
                var stats = summarizeAnswer(answer);
                var existingSummaryAttempts = summaryAttemptCount(
                    repository,
                    activityHash,
                    answer.problemId,
                    answer.answerId
                );
                var label = pageMap[answerKey(answer.problemId, answer.answerId)] || {};
                var problemId = answer.problemId;

                stats.existingAggregateAttemptCount = existingSummaryAttempts;
                stats.matchesExistingAggregateAttemptCount =
                    existingSummaryAttempts === null ? null : existingSummaryAttempts === stats.totalAttempts;

                if (!problems[problemId]) {
                    problems[problemId] = {
                        displayedProblemLabel: label.displayedProblemLabel ||
                            (pageMap.problems && pageMap.problems[problemId] && pageMap.problems[problemId].displayedProblemLabel) ||
                            ('Raw problem ' + problemId),
                        pageProblemNumber: label.pageProblemNumber ||
                            (pageMap.problems && pageMap.problems[problemId] && pageMap.problems[problemId].pageProblemNumber) ||
                            null,
                        rawProblemId: problemId,
                        answers: []
                    };
                }

                problems[problemId].answers.push({
                    displayedAnswerLabel: label.displayedAnswerLabel || 'Answer Box ' + (problems[problemId].answers.length + 1),
                    pageAnswerNumber: label.pageAnswerNumber || problems[problemId].answers.length + 1,
                    rawAnswerId: answer.answerId,
                    rawProblemId: answer.problemId,
                    stats: stats
                });
            });

            report.problems = Object.keys(problems).map(function(problemId) {
                problems[problemId].answers.sort(function(a, b) {
                    return a.pageAnswerNumber - b.pageAnswerNumber;
                });

                return problems[problemId];
            }).sort(function(a, b) {
                if (problemSortKey(a) !== problemSortKey(b)) {
                    return problemSortKey(a) - problemSortKey(b);
                }

                return a.rawProblemId.localeCompare(b.rawProblemId);
            });

            console.log(JSON.stringify(report, null, 2));
        }
    );
}
