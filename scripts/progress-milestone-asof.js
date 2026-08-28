#!/usr/bin/env node

/*
 * Read-only audit prototype.
 *
 * Finds the latest ProgressMilestone at or before a requested timestamp.
 *
 * Examples:
 *
 *   node scripts/progress-milestone-asof.js \
 *     --bridge 6a46cc7b689dcc0040f0f575 \
 *     --at 2026-07-05T12:16:00Z
 *
 *   node scripts/progress-milestone-asof.js \
 *     --user 6a204e026d489f0040a55977 \
 *     --repository mac1140test \
 *     --path exploreFunctionsTwo \
 *     --at 2026-07-05T12:16:00Z
 */

var mdb = require('../mdb');

function usage(exitCode) {
    console.log([
        'Usage:',
        '',
        '  node scripts/progress-milestone-asof.js --bridge BRIDGE_ID --at ISO_TIMESTAMP',
        '',
        '  node scripts/progress-milestone-asof.js \\',
        '    --user USER_ID --repository REPOSITORY --path PATH --at ISO_TIMESTAMP',
        '',
        'Optional:',
        '  --contextId CONTEXT_ID',
        '  --resourceLinkId RESOURCE_LINK_ID',
        '  --limit N              Number of nearby milestones to show, default 5',
        '',
        'Notes:',
        '  --at defaults to now if omitted.',
        '  This script only reads MongoDB; it does not modify records.'
    ].join('\n'));

    process.exit(exitCode);
}

function parseArgs(argv) {
    var args = {};
    var i;

    for (i = 0; i < argv.length; i += 1) {
        var item = argv[i];
        var key;
        var value;
        var equals;

        if (item === '--help' || item === '-h') {
            usage(0);
        }

        if (item.indexOf('--') !== 0) {
            console.error('Unexpected argument: ' + item);
            usage(1);
        }

        equals = item.indexOf('=');

        if (equals >= 0) {
            key = item.slice(2, equals);
            value = item.slice(equals + 1);
        } else {
            key = item.slice(2);
            value = argv[i + 1];

            if (!value || value.indexOf('--') === 0) {
                console.error('Missing value for --' + key);
                usage(1);
            }

            i += 1;
        }

        args[key] = value;
    }

    return args;
}

function objectId(value, label) {
    if (!value) {
        return undefined;
    }

    if (!mdb.ObjectId.isValid(value)) {
        throw new Error(label + ' is not a valid ObjectID: ' + value);
    }

    return new mdb.ObjectId(value);
}

function parseDate(value) {
    var date;

    if (!value) {
        return new Date();
    }

    date = new Date(value);

    if (isNaN(date.getTime())) {
        throw new Error('Invalid --at timestamp: ' + value);
    }

    return date;
}

function limitValue(value) {
    var n = parseInt(value || '5', 10);

    if (isNaN(n) || n < 1) {
        return 5;
    }

    if (n > 50) {
        return 50;
    }

    return n;
}

function rowSummary(row) {
    if (!row) {
        return null;
    }

    return {
        _id: row._id,
        user: row.user,
        repository: row.repository,
        path: row.path,

        pointsEarned: row.pointsEarned,
        pointsPossible: row.pointsPossible,
        score: row.score,

        canvasPointsPossible: row.canvasPointsPossible,
        canvasScore: row.canvasScore,

        observedAt: row.observedAt,
        windowStartedAt: row.windowStartedAt,
        source: row.source,

        bridge: row.bridge,
        toolConsumerInstanceGuid: row.toolConsumerInstanceGuid,
        contextId: row.contextId,
        resourceLinkId: row.resourceLinkId
    };
}

function buildQueryFromBridge(args, callback) {
    var bridgeId;

    try {
        bridgeId = objectId(args.bridge, 'bridge');
    } catch (e) {
        callback(e);
        return;
    }

    mdb.LtiBridge.findById(bridgeId)
        .lean()
        .exec(function(err, bridge) {
            var query;

            if (err) {
                callback(err);
                return;
            }

            if (!bridge) {
                callback(new Error('No LtiBridge found for --bridge ' + args.bridge));
                return;
            }

            query = {
                bridge: bridge._id,
                user: bridge.user,
                repository: bridge.repository,
                path: bridge.path
            };

            if (bridge.contextId) {
                query.contextId = bridge.contextId;
            }

            if (bridge.resourceLinkId) {
                query.resourceLinkId = bridge.resourceLinkId;
            }

            callback(null, query, bridge);
        });
}

function buildQueryFromArgs(args, callback) {
    var query;

    if (!args.user || !args.repository || !args.path) {
        callback(new Error('Provide either --bridge or all of --user, --repository, and --path.'));
        return;
    }

    try {
        query = {
            user: objectId(args.user, 'user'),
            repository: args.repository,
            path: args.path
        };
    } catch (e) {
        callback(e);
        return;
    }

    if (args.contextId) {
        query.contextId = args.contextId;
    }

    if (args.resourceLinkId) {
        query.resourceLinkId = args.resourceLinkId;
    }

    callback(null, query, null);
}

function buildBaseQuery(args, callback) {
    if (args.bridge) {
        buildQueryFromBridge(args, callback);
        return;
    }

    buildQueryFromArgs(args, callback);
}

function findMilestones(query, asOf, limit, callback) {
    var beforeQuery = Object.assign({}, query, {
        observedAt: { $lte: asOf }
    });

    var afterQuery = Object.assign({}, query, {
        observedAt: { $gt: asOf }
    });

    mdb.ProgressMilestone.findOne(beforeQuery)
        .sort({ observedAt: -1 })
        .lean()
        .exec(function(err, latestAtOrBefore) {
            if (err) {
                callback(err);
                return;
            }

            mdb.ProgressMilestone.findOne(afterQuery)
                .sort({ observedAt: 1 })
                .lean()
                .exec(function(err, earliestAfter) {
                    if (err) {
                        callback(err);
                        return;
                    }

                    mdb.ProgressMilestone.find(beforeQuery)
                        .sort({ observedAt: -1 })
                        .limit(limit)
                        .lean()
                        .exec(function(err, nearbyBefore) {
                            if (err) {
                                callback(err);
                                return;
                            }

                            callback(null, {
                                latestAtOrBefore: latestAtOrBefore,
                                earliestAfter: earliestAfter,
                                nearbyBefore: nearbyBefore
                            });
                        });
                });
        });
}

var args = parseArgs(process.argv.slice(2));
var asOf;
var limit;

try {
    asOf = parseDate(args.at);
    limit = limitValue(args.limit);
} catch (e) {
    console.error(e.message);
    usage(1);
}

mdb.initialize(function(err) {
    if (err) {
        console.error(err);
        process.exit(1);
    }

    buildBaseQuery(args, function(err, query, bridge) {
        if (err) {
            console.error(err.message || err);
            mdb.mongoose.disconnect();
            process.exit(1);
            return;
        }

        findMilestones(query, asOf, limit, function(err, result) {
            if (err) {
                console.error(err);
                process.exitCode = 1;
            } else {
                console.log(JSON.stringify({
                    asOf: asOf,
                    query: query,
                    bridge: bridge ? {
                        _id: bridge._id,
                        user: bridge.user,
                        repository: bridge.repository,
                        path: bridge.path,
                        contextId: bridge.contextId,
                        resourceLinkId: bridge.resourceLinkId,
                        pointsPossible: bridge.pointsPossible,
                        resultScore: bridge.resultScore,
                        resultTotalScore: bridge.resultTotalScore,
                        submittedScore: bridge.submittedScore
                    } : null,
                    latestAtOrBefore: rowSummary(result.latestAtOrBefore),
                    earliestAfter: rowSummary(result.earliestAfter),
                    nearbyBefore: result.nearbyBefore.map(rowSummary)
                }, null, 2));
            }

            mdb.mongoose.disconnect();
        });
    });
});
