var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var async = require('async');
var config = require('../config');
var learningRecordStore = require('./read-lrs.js');

var ANSWERED_VERB = 'http://adlnet.gov/expapi/verbs/answered';
var GENERATED_ANOTHER_VERSION_VERB = 'https://xronos.clas.ufl.edu/xapi/verbs/generated-another-version';
var ANSWER_ID_RE = /\/activities\/([^\/]+)\/problems\/([^\/]+)\/answers\/([^\/]+)/;
var TRY_ANOTHER_ID_RE = /\/activities\/([^\/]+)\/try-another/;
var OLD_SEED_EXTENSION = 'https://xronos.clas.ufl.edu/xapi/extensions/old-seed';
var NEW_SEED_EXTENSION = 'https://xronos.clas.ufl.edu/xapi/extensions/new-seed';

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

function activityLearnerKey(activityHash, learnerKey) {
    return activityHash + '/' + learnerKey;
}

function ensureActivityLearnerEvents(bucket, activityHash, learnerKey) {
    var key = activityLearnerKey(activityHash, learnerKey);

    if (!bucket[key]) {
        bucket[key] = [];
    }

    return bucket[key];
}

function sortByTimeAndSequence(a, b) {
    if (a.time !== b.time) {
        return a.time - b.time;
    }

    return a.sequence - b.sequence;
}

function xapiExtension(entry, extensionKey) {
    var extensions = entry &&
        entry.context &&
        entry.context.extensions;

    if (!extensions) {
        return undefined;
    }

    return extensions[extensionKey];
}

function assignEpisodes(activityLearnerEvents) {
    var episodeMetadata = {};

    Object.keys(activityLearnerEvents).forEach(function(key) {
        var events = activityLearnerEvents[key].slice();
        var pieces = key.split('/');
        var episode = 0;
        var generatedVersionEvents = 0;

        events.sort(sortByTimeAndSequence);

        events.forEach(function(event) {
            if (event.type === 'try-another') {
                generatedVersionEvents += 1;
                episode += 1;
                event.episode = episode;
                return;
            }

            if (event.type === 'answer') {
                event.episode = episode;
            }
        });

        episodeMetadata[key] = {
            activityHash: pieces[0],
            learnerKey: pieces[1],
            maxEpisode: episode,
            generatedVersionEvents: generatedVersionEvents
        };
    });

    return episodeMetadata;
}


function episodeEventuallyCorrect(attempts) {
    return attempts.some(function(attempt) {
        return attempt.success === true;
    });
}

function summarizeAttemptCollections(collections) {
    var attemptedUnits = collections.length;
    var eventuallyCorrect = 0;
    var correctOnFirst = 0;
    var correctOnSecond = 0;
    var correctAfterThreePlus = 0;
    var neverCorrect = 0;
    var attemptsToFirstCorrect = [];
    var attemptsToOutcomeAmongAttempted = [];
    var totalSubmissionsPerAttemptedUnit = [];
    var totalAttempts = 0;
    var totalAttemptsRaw = 0;
    var correctAttempts = 0;
    var incorrectAttempts = 0;
    var postFirstCorrectSubmissions = 0;
    var responses = {};
    var rawResponses = {};
    var omittedPostFirstCorrectResponses = {};

    function addResponseCount(target, attempt) {
        var response = attempt && attempt.response;

        if (response) {
            target[response] = (target[response] || 0) + 1;
        }
    }

    collections.forEach(function(collection) {
        var attempts = collection.slice();
        var countedAttempts;
        var omittedAttempts;
        var firstCorrectIndex = null;

        attempts.sort(sortByTimeAndSequence);

        attempts.forEach(function(attempt) {
            addResponseCount(rawResponses, attempt);
        });

        attempts.some(function(attempt, index) {
            if (attempt.success === true) {
                firstCorrectIndex = index + 1;
                return true;
            }

            return false;
        });

        if (firstCorrectIndex === null) {
            countedAttempts = attempts;
            omittedAttempts = [];
        } else {
            countedAttempts = attempts.slice(0, firstCorrectIndex);
            omittedAttempts = attempts.slice(firstCorrectIndex);
        }

        totalAttemptsRaw += attempts.length;
        totalAttempts += countedAttempts.length;
        totalSubmissionsPerAttemptedUnit.push(countedAttempts.length);
        postFirstCorrectSubmissions += omittedAttempts.length;

        countedAttempts.forEach(function(attempt) {
            addResponseCount(responses, attempt);

            if (attempt.success === true) {
                correctAttempts += 1;
            } else if (attempt.success === false) {
                incorrectAttempts += 1;
            }
        });

        omittedAttempts.forEach(function(attempt) {
            addResponseCount(omittedPostFirstCorrectResponses, attempt);
        });

        if (firstCorrectIndex === null) {
            neverCorrect += 1;
            attemptsToOutcomeAmongAttempted.push(countedAttempts.length);
        } else {
            eventuallyCorrect += 1;
            attemptsToFirstCorrect.push(firstCorrectIndex);
            attemptsToOutcomeAmongAttempted.push(firstCorrectIndex);

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
        attemptedUnits: attemptedUnits,
        eventuallyCorrect: eventuallyCorrect,
        correctOnFirstAttempt: correctOnFirst,
        correctOnSecondAttempt: correctOnSecond,
        correctAfterThreeOrMoreAttempts: correctAfterThreePlus,
        neverCorrect: neverCorrect,
        meanAttemptsToFirstCorrectAmongEventuallyCorrect: round(mean(attemptsToFirstCorrect)),
        meanAttemptsToOutcomeAmongAttemptedUnits: round(mean(attemptsToOutcomeAmongAttempted)),
        meanTotalSubmissionsPerAttemptedUnit: round(mean(totalSubmissionsPerAttemptedUnit)),
        postFirstCorrectSubmissions: postFirstCorrectSubmissions,
        totalAttempts: totalAttempts,
        totalAttemptsRaw: totalAttemptsRaw,
        correctAttempts: correctAttempts,
        incorrectAttempts: incorrectAttempts,
        responses: responses,
        rawResponses: rawResponses,
        omittedPostFirstCorrectResponses: omittedPostFirstCorrectResponses
    };
}

function attemptsGroupedByEpisode(attempts) {
    var grouped = {};

    attempts.forEach(function(attempt) {
        var episode = attempt.episode || 0;

        if (!grouped[episode]) {
            grouped[episode] = [];
        }

        grouped[episode].push(attempt);
    });

    return grouped;
}

function attemptCollectionsByLearnerAndEpisode(answer) {
    var collections = [];

    Object.keys(answer.learners).forEach(function(learnerKey) {
        var grouped = attemptsGroupedByEpisode(answer.learners[learnerKey]);

        Object.keys(grouped).forEach(function(episode) {
            if (grouped[episode].length > 0) {
                collections.push(grouped[episode]);
            }
        });
    });

    return collections;
}

function learnerMetadataForActivity(activityHash, episodeMetadata) {
    return Object.keys(episodeMetadata).filter(function(key) {
        return episodeMetadata[key].activityHash === activityHash;
    }).map(function(key) {
        return episodeMetadata[key];
    });
}

function maxEpisodeForActivity(activityHash, episodeMetadata) {
    var maxEpisode = 0;

    learnerMetadataForActivity(activityHash, episodeMetadata).forEach(function(metadata) {
        if (metadata.maxEpisode > maxEpisode) {
            maxEpisode = metadata.maxEpisode;
        }
    });

    return maxEpisode;
}

function summarizeAnswerVersionStats(answer, episodeMetadata) {
    var metadataForActivity = learnerMetadataForActivity(answer.activityHash, episodeMetadata);
    var maxEpisode = maxEpisodeForActivity(answer.activityHash, episodeMetadata);
    var groupedByLearner = {};
    var versions = {};
    var version;

    Object.keys(answer.learners).forEach(function(learnerKey) {
        groupedByLearner[learnerKey] = attemptsGroupedByEpisode(answer.learners[learnerKey]);
    });

    for (version = 0; version <= maxEpisode; version += 1) {
        (function(currentVersion) {
            var collections = [];
            var studentsReachedVersion = 0;
            var studentsAttempted = 0;
            var studentsGeneratedNextVersion = 0;
            var studentsGeneratedNextVersionBeforeCorrect = 0;
            var studentsGeneratedNextVersionWithoutAttempt = 0;
            var collectionStats;

            metadataForActivity.forEach(function(metadata) {
                var learnerAttemptsByEpisode = groupedByLearner[metadata.learnerKey] || {};
                var attempts = learnerAttemptsByEpisode[currentVersion] || [];
                var eventuallyCorrect = episodeEventuallyCorrect(attempts);

                if (metadata.maxEpisode < currentVersion) {
                    return;
                }

                studentsReachedVersion += 1;

                if (attempts.length > 0) {
                    studentsAttempted += 1;
                    collections.push(attempts);
                }

                if (metadata.maxEpisode > currentVersion) {
                    studentsGeneratedNextVersion += 1;

                    if (!eventuallyCorrect) {
                        studentsGeneratedNextVersionBeforeCorrect += 1;
                    }

                    if (attempts.length === 0) {
                        studentsGeneratedNextVersionWithoutAttempt += 1;
                    }
                }
            });

            collectionStats = summarizeAttemptCollections(collections);

            versions[currentVersion] = {
                version: currentVersion,
                label: currentVersion === 0 ? 'Original Version' : 'Generated Version ' + currentVersion,
                studentsReachedVersion: studentsReachedVersion,
                studentsAttempted: studentsAttempted,
                studentsGeneratedNextVersion: studentsGeneratedNextVersion,
                studentsGeneratedNextVersionBeforeCorrect: studentsGeneratedNextVersionBeforeCorrect,
                studentsGeneratedNextVersionWithoutAttempt: studentsGeneratedNextVersionWithoutAttempt,
                eventuallyCorrect: collectionStats.eventuallyCorrect,
                correctOnFirstAttempt: collectionStats.correctOnFirstAttempt,
                correctOnSecondAttempt: collectionStats.correctOnSecondAttempt,
                correctAfterThreeOrMoreAttempts: collectionStats.correctAfterThreeOrMoreAttempts,
                neverCorrect: collectionStats.neverCorrect,
                meanAttemptsToFirstCorrectAmongEventuallyCorrect: collectionStats.meanAttemptsToFirstCorrectAmongEventuallyCorrect,
                meanAttemptsToOutcomeAmongAttemptedUnits: collectionStats.meanAttemptsToOutcomeAmongAttemptedUnits,
                meanTotalSubmissionsPerAttemptedUnit: collectionStats.meanTotalSubmissionsPerAttemptedUnit,
                postFirstCorrectSubmissions: collectionStats.postFirstCorrectSubmissions,
                totalAttempts: collectionStats.totalAttempts,
                totalAttemptsRaw: collectionStats.totalAttemptsRaw,
                correctAttempts: collectionStats.correctAttempts,
                incorrectAttempts: collectionStats.incorrectAttempts
            };
        })(version);
    }

    return versions;
}

function summarizeEpisodeStats(answer, episodeMetadata) {
    var learnerKeys = Object.keys(answer.learners);
    var firstEpisodeCollections = [];
    var generatedEpisodeCollections = [];
    var activityLearnerMetadata = learnerMetadataForActivity(answer.activityHash, episodeMetadata);
    var learnersWithGeneratedVersions = 0;
    var totalGeneratedEpisodes = 0;
    var generatedEpisodesWithAttempts = 0;
    var generatedEpisodesWithoutAttempts = 0;
    var generatedEpisodesAfterPriorCorrect = 0;
    var generatedEpisodesAfterPriorCorrectWithAttempts = 0;
    var generatedEpisodesAfterPriorCorrectWithoutAttempts = 0;
    var correctOnFirstGeneratedEpisodeAfterPriorCorrect = 0;

    activityLearnerMetadata.forEach(function(metadata) {
        if (metadata.maxEpisode > 0) {
            learnersWithGeneratedVersions += 1;
        }
    });

    learnerKeys.forEach(function(learnerKey) {
        var attempts = answer.learners[learnerKey].slice();
        var grouped = attemptsGroupedByEpisode(attempts);
        var metadata = episodeMetadata[activityLearnerKey(answer.activityHash, learnerKey)] || {
            maxEpisode: 0,
            generatedVersionEvents: 0
        };
        var hadPriorCorrect = false;
        var episode;
        var episodeAttempts;

        if (grouped[0] && grouped[0].length > 0) {
            firstEpisodeCollections.push(grouped[0]);
        }

        hadPriorCorrect = episodeEventuallyCorrect(grouped[0] || []);

        for (episode = 1; episode <= metadata.maxEpisode; episode += 1) {
            episodeAttempts = grouped[episode] || [];
            totalGeneratedEpisodes += 1;

            if (episodeAttempts.length > 0) {
                generatedEpisodesWithAttempts += 1;
                generatedEpisodeCollections.push(episodeAttempts);
            } else {
                generatedEpisodesWithoutAttempts += 1;
            }

            if (hadPriorCorrect) {
                generatedEpisodesAfterPriorCorrect += 1;

                if (episodeAttempts.length > 0) {
                    generatedEpisodesAfterPriorCorrectWithAttempts += 1;

                    episodeAttempts.sort(sortByTimeAndSequence);

                    if (episodeAttempts[0].success === true) {
                        correctOnFirstGeneratedEpisodeAfterPriorCorrect += 1;
                    }
                } else {
                    generatedEpisodesAfterPriorCorrectWithoutAttempts += 1;
                }
            }

            if (episodeEventuallyCorrect(episodeAttempts)) {
                hadPriorCorrect = true;
            }
        }
    });

    return {
        learnersWithGeneratedVersions: learnersWithGeneratedVersions,
        firstEpisode: summarizeAttemptCollections(firstEpisodeCollections),
        generatedEpisodes: Object.assign(
            {
                totalEpisodes: totalGeneratedEpisodes,
                episodesWithAttempts: generatedEpisodesWithAttempts,
                episodesWithoutAttempts: generatedEpisodesWithoutAttempts
            },
            summarizeAttemptCollections(generatedEpisodeCollections)
        ),
        afterPriorCorrect: {
            generatedEpisodesAfterPriorCorrect: generatedEpisodesAfterPriorCorrect,
            episodesWithAttempts: generatedEpisodesAfterPriorCorrectWithAttempts,
            episodesWithoutAttempts: generatedEpisodesAfterPriorCorrectWithoutAttempts,
            correctOnFirstAttempt: correctOnFirstGeneratedEpisodeAfterPriorCorrect
        },
        versions: summarizeAnswerVersionStats(answer, episodeMetadata)
    };
}

function summarizeActivityTryAnotherStats(activityLearnerEvents, episodeMetadata) {
    var activities = {};

    Object.keys(activityLearnerEvents).forEach(function(key) {
        var events = activityLearnerEvents[key].slice();
        var metadata = episodeMetadata[key];
        var activityHash;
        var versionAttempts = {};
        var versionAnswerBoxes = {};
        var version;
        var totalAttempts;
        var answerBoxCount;

        if (!metadata) {
            return;
        }

        activityHash = metadata.activityHash;

        if (!activities[activityHash]) {
            activities[activityHash] = {
                observedStudents: 0,
                studentsGeneratedZeroVersions: 0,
                studentsGeneratedAtLeastOneVersion: 0,
                studentsGeneratedAtLeastTwoVersions: 0,
                studentsGeneratedAtLeastThreeVersions: 0,
                totalGeneratedVersions: 0,
                versions: {}
            };
        }

        events.sort(sortByTimeAndSequence);

        events.forEach(function(event) {
            var answerBoxKey;

            if (event.type !== 'answer') {
                return;
            }

            version = event.episode || 0;
            answerBoxKey = event.problemId + '/' + event.answerId;

            versionAttempts[version] = versionAttempts[version] || 0;
            versionAnswerBoxes[version] = versionAnswerBoxes[version] || {};

            versionAttempts[version] += 1;
            versionAnswerBoxes[version][answerBoxKey] = true;
        });

        activities[activityHash].observedStudents += 1;
        activities[activityHash].totalGeneratedVersions += metadata.generatedVersionEvents;

        if (metadata.generatedVersionEvents === 0) {
            activities[activityHash].studentsGeneratedZeroVersions += 1;
        }

        if (metadata.generatedVersionEvents >= 1) {
            activities[activityHash].studentsGeneratedAtLeastOneVersion += 1;
        }

        if (metadata.generatedVersionEvents >= 2) {
            activities[activityHash].studentsGeneratedAtLeastTwoVersions += 1;
        }

        if (metadata.generatedVersionEvents >= 3) {
            activities[activityHash].studentsGeneratedAtLeastThreeVersions += 1;
        }

        for (version = 1; version <= metadata.maxEpisode; version += 1) {
            if (!activities[activityHash].versions[version]) {
                activities[activityHash].versions[version] = {
                    version: version,
                    label: 'Generated Version ' + version,
                    studentsGenerated: 0,
                    studentsWithAnyAnswer: 0,
                    studentsGeneratedNextVersionWithoutAnyAnswer: 0,
                    totalAnswerAttempts: 0,
                    answerBoxesAttempted: 0
                };
            }

            totalAttempts = versionAttempts[version] || 0;
            answerBoxCount = Object.keys(versionAnswerBoxes[version] || {}).length;

            activities[activityHash].versions[version].studentsGenerated += 1;
            activities[activityHash].versions[version].totalAnswerAttempts += totalAttempts;
            activities[activityHash].versions[version].answerBoxesAttempted += answerBoxCount;

            if (totalAttempts > 0) {
                activities[activityHash].versions[version].studentsWithAnyAnswer += 1;
            }

            if (version < metadata.maxEpisode && totalAttempts === 0) {
                activities[activityHash].versions[version].studentsGeneratedNextVersionWithoutAnyAnswer += 1;
            }
        }
    });

    Object.keys(activities).forEach(function(activityHash) {
        var activity = activities[activityHash];

        activity.percentGeneratedZeroVersions = percentage(
            activity.studentsGeneratedZeroVersions,
            activity.observedStudents
        );
        activity.percentGeneratedAtLeastOneVersion = percentage(
            activity.studentsGeneratedAtLeastOneVersion,
            activity.observedStudents
        );
        activity.percentGeneratedAtLeastTwoVersions = percentage(
            activity.studentsGeneratedAtLeastTwoVersions,
            activity.observedStudents
        );
        activity.percentGeneratedAtLeastThreeVersions = percentage(
            activity.studentsGeneratedAtLeastThreeVersions,
            activity.observedStudents
        );
    });

    return activities;
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

function percentage(numerator, denominator) {
    if (!denominator) {
        return null;
    }

    return round((numerator / denominator) * 100);
}

function summarizeAnswer(answer, episodeMetadata) {
    var learnerKeys = Object.keys(answer.learners);
    var attemptedStudents = learnerKeys.length;
    var studentCollections = learnerKeys.map(function(learnerKey) {
        return answer.learners[learnerKey];
    });
    var versionCollections = attemptCollectionsByLearnerAndEpisode(answer);
    var collectionStats = summarizeAttemptCollections(studentCollections);
    var versionCollectionStats = summarizeAttemptCollections(versionCollections);

    return {
        attemptedStudents: attemptedStudents,
        eventuallyCorrect: collectionStats.eventuallyCorrect,
        correctOnFirstAttempt: collectionStats.correctOnFirstAttempt,
        correctOnSecondAttempt: collectionStats.correctOnSecondAttempt,
        correctAfterThreeOrMoreAttempts: collectionStats.correctAfterThreeOrMoreAttempts,
        neverCorrect: collectionStats.neverCorrect,
        meanAttemptsToFirstCorrectAmongEventuallyCorrect: collectionStats.meanAttemptsToFirstCorrectAmongEventuallyCorrect,
        meanAttemptsToOutcomeAmongAllAttemptedStudents: collectionStats.meanAttemptsToOutcomeAmongAttemptedUnits,
        meanTotalSubmissionsPerAttemptedStudent: collectionStats.meanTotalSubmissionsPerAttemptedUnit,
        postFirstCorrectSubmissions: versionCollectionStats.postFirstCorrectSubmissions,
        totalAttempts: versionCollectionStats.totalAttempts,
        totalAttemptsRaw: versionCollectionStats.totalAttemptsRaw,
        correctAttempts: versionCollectionStats.correctAttempts,
        incorrectAttempts: versionCollectionStats.incorrectAttempts,
        responses: versionCollectionStats.responses,
        rawResponses: versionCollectionStats.rawResponses,
        omittedPostFirstCorrectResponses: versionCollectionStats.omittedPostFirstCorrectResponses,
        episodes: summarizeEpisodeStats(answer, episodeMetadata || {})
    };
}

function summarizeAnswersByActivity(answers, episodeMetadata, activityLearnerEvents) {
    var tryAnotherStats = summarizeActivityTryAnotherStats(activityLearnerEvents || {}, episodeMetadata || {});
    var summary = {
        generatedAt: new Date().toISOString(),
        activities: {},
        activityStats: {}
    };

    Object.keys(tryAnotherStats).forEach(function(activityHash) {
        summary.activityStats[activityHash] = {
            tryAnother: tryAnotherStats[activityHash]
        };
    });

    Object.keys(answers).forEach(function(key) {
        var answer = answers[key];
        var stats = summarizeAnswer(answer, episodeMetadata);

        summary.activities[answer.activityHash] = summary.activities[answer.activityHash] || {};
        summary.activities[answer.activityHash][answer.problemId] =
            summary.activities[answer.activityHash][answer.problemId] || {};
        summary.activities[answer.activityHash][answer.problemId][answer.answerId] = stats;
    });

    return summary;
}

function buildFromLrs(lrsFilename, callback) {
    var answers = {};
    var activityLearnerEvents = {};
    var sequence = 0;

    learningRecordStore.read(
        lrsFilename,
        0,
        function(entry, next) {
            sequence += 1;

            try {
                var objectId = entry.object && entry.object.id;
                var answeredMatches = objectId && objectId.match(ANSWER_ID_RE);
                var tryAnotherMatches = objectId && objectId.match(TRY_ANOTHER_ID_RE);
                var learnerKey = stableActorKey(entry);
                var activityHash;
                var events;
                var answer;
                var attempt;

                if (answeredMatches &&
                    entry.verb &&
                    entry.verb.id === ANSWERED_VERB) {
                    activityHash = answeredMatches[1];
                    answer = ensureAnswer(
                        answers,
                        activityHash,
                        answeredMatches[2],
                        answeredMatches[3]
                    );

                    if (!answer.learners[learnerKey]) {
                        answer.learners[learnerKey] = [];
                    }

                    attempt = {
                        type: 'answer',
                        problemId: answeredMatches[2],
                        answerId: answeredMatches[3],
                        success: entry.result && entry.result.success,
                        response: entry.result && entry.result.response,
                        time: parseTime(entry, sequence),
                        sequence: sequence,
                        episode: 0
                    };

                    answer.learners[learnerKey].push(attempt);

                    events = ensureActivityLearnerEvents(
                        activityLearnerEvents,
                        activityHash,
                        learnerKey
                    );
                    events.push(attempt);
                } else if (tryAnotherMatches &&
                    entry.verb &&
                    entry.verb.id === GENERATED_ANOTHER_VERSION_VERB) {
                    activityHash = tryAnotherMatches[1];

                    events = ensureActivityLearnerEvents(
                        activityLearnerEvents,
                        activityHash,
                        learnerKey
                    );

                    events.push({
                        type: 'try-another',
                        oldSeed: xapiExtension(entry, OLD_SEED_EXTENSION),
                        newSeed: xapiExtension(entry, NEW_SEED_EXTENSION),
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
            var episodeMetadata;

            if (err) {
                callback(err);
                return;
            }

            episodeMetadata = assignEpisodes(activityLearnerEvents);
            callback(null, summarizeAnswersByActivity(answers, episodeMetadata, activityLearnerEvents));
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
