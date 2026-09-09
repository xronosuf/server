#!/usr/bin/env node
'use strict';

var mdb = require('../mdb');
var recovery = require('../routes/grade-sync-recovery');

function usage() {
    return [
        'Usage:',
        '  node scripts/grade-sync-recovery-report.js --event EVENT_ID',
        '  node scripts/grade-sync-recovery-report.js --user USER_OBJECT_ID [--repository REPO] [--path PATH] [--limit N]',
        '',
        'The command is read-only. It reports only the bounded recovery-event',
        'fields stored by Stage 4 and never reads LTI secrets, sourcedids,',
        'outcome URLs, cookies, grades, or answer state.'
    ].join('\n');
}

function parseArgs(argv) {
    var options = {
        eventId: null,
        userId: null,
        repository: null,
        path: null,
        limit: 20
    };
    var i;

    for (i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--event') {
            options.eventId = argv[++i] || null;
        } else if (argv[i] === '--user') {
            options.userId = argv[++i] || null;
        } else if (argv[i] === '--repository') {
            options.repository = argv[++i] || null;
        } else if (argv[i] === '--path') {
            options.path = argv[++i] || null;
        } else if (argv[i] === '--limit') {
            options.limit = parseInt(argv[++i], 10);
        } else if (argv[i] === '--help' || argv[i] === '-h') {
            options.help = true;
        } else {
            throw new Error('Unknown argument: ' + argv[i]);
        }
    }

    if (options.help) {
        return options;
    }

    if (!options.eventId && !options.userId) {
        throw new Error('Specify --event or --user.');
    }

    if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) {
        throw new Error('--limit must be an integer from 1 through 100.');
    }

    return options;
}

function buildQuery(options) {
    var query = {};

    if (options.eventId) {
        query.eventId = options.eventId;
    }

    if (options.userId) {
        if (!mdb.mongoose.Types.ObjectId.isValid(options.userId)) {
            throw new Error('Invalid --user ObjectId.');
        }
        query.user = new mdb.mongoose.Types.ObjectId(options.userId);
    }

    if (options.repository) {
        query.repository = options.repository;
    }

    if (options.path) {
        query.path = options.path;
    }

    return query;
}

function text(value) {
    if (value === undefined || value === null) {
        return null;
    }
    return value.toString();
}

function dateText(value) {
    if (!value) {
        return null;
    }

    var date = value instanceof Date ? value : new Date(value);
    return isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeDocument(document) {
    document = document || {};

    return {
        eventId: text(document.eventId),
        user: text(document.user),
        repository: text(document.repository),
        path: text(document.path),
        action: text(document.action),
        observedAt: dateText(document.observedAt),
        expiresAt: dateText(document.expiresAt),
        gradeSyncState: text(document.gradeSyncState),
        gradeSyncReason: text(document.gradeSyncReason),
        launchPrimary: text(document.launchPrimary),
        launchReferenceRecorded:
            document.launchReferenceRecorded === true,
        bridgeCount: Number(document.bridgeCount) || 0,
        activeGradePassbackBridgeCount:
            Number(document.activeGradePassbackBridgeCount) || 0,
        queueStatusAvailable:
            document.queueStatusAvailable !== false,
        currentLaunchBridgeId: text(document.currentLaunchBridgeId)
    };
}

function closeAndExit(code) {
    Promise.resolve()
        .then(function() {
            if (mdb.mongoose.connection.readyState !== 0) {
                return mdb.mongoose.connection.close();
            }
        })
        .then(function() {
            process.exit(code);
        })
        .catch(function() {
            process.exit(code);
        });
}

function main(argv) {
    var options;

    try {
        options = parseArgs(argv);
    } catch (err) {
        console.error(err.message);
        console.error('');
        console.error(usage());
        process.exitCode = 2;
        return;
    }

    if (options.help) {
        console.log(usage());
        return;
    }

    var query;

    try {
        query = buildQuery(options);
    } catch (err) {
        console.error(err.message);
        process.exitCode = 2;
        return;
    }

    mdb.initialize(function(err) {
        if (err) {
            console.error(err);
            closeAndExit(1);
            return;
        }

        var collection = mdb.mongoose.connection.db.collection(
            recovery.COLLECTION_NAME
        );

        collection
            .find(query, {
                projection: {
                    _id: 0,
                    eventId: 1,
                    user: 1,
                    repository: 1,
                    path: 1,
                    action: 1,
                    observedAt: 1,
                    expiresAt: 1,
                    gradeSyncState: 1,
                    gradeSyncReason: 1,
                    launchPrimary: 1,
                    launchReferenceRecorded: 1,
                    bridgeCount: 1,
                    activeGradePassbackBridgeCount: 1,
                    queueStatusAvailable: 1,
                    currentLaunchBridgeId: 1
                }
            })
            .sort({observedAt: -1})
            .limit(options.limit)
            .toArray()
            .then(function(documents) {
                var result = {
                    reportType: 'xronos-grade-sync-recovery-history',
                    generatedAt: new Date().toISOString(),
                    collection: recovery.COLLECTION_NAME,
                    filters: {
                        eventId: options.eventId,
                        userId: options.userId,
                        repository: options.repository,
                        path: options.path,
                        limit: options.limit
                    },
                    count: documents.length,
                    events: documents.map(normalizeDocument)
                };

                console.log(JSON.stringify(result, null, 2));
                closeAndExit(0);
            })
            .catch(function(queryErr) {
                if (queryErr && queryErr.codeName === 'NamespaceNotFound') {
                    console.log(JSON.stringify({
                        reportType: 'xronos-grade-sync-recovery-history',
                        generatedAt: new Date().toISOString(),
                        collection: recovery.COLLECTION_NAME,
                        filters: {
                            eventId: options.eventId,
                            userId: options.userId,
                            repository: options.repository,
                            path: options.path,
                            limit: options.limit
                        },
                        count: 0,
                        events: []
                    }, null, 2));
                    closeAndExit(0);
                    return;
                }

                console.error(queryErr);
                closeAndExit(1);
            });
    });
}

exports.buildQuery = buildQuery;
exports.normalizeDocument = normalizeDocument;
exports.parseArgs = parseArgs;
exports.usage = usage;

if (require.main === module) {
    main(process.argv.slice(2));
}
