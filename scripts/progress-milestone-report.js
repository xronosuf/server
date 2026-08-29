#!/usr/bin/env node

/*
 * Human-readable read-only audit prototype.
 *
 * Usage:
 *   node scripts/progress-milestone-report.js --bridge BRIDGE_ID --at ISO_TIMESTAMP
 */

var mdb = require('../mdb');

function usage(exitCode) {
    console.log([
        'Usage:',
        '  node scripts/progress-milestone-report.js --bridge BRIDGE_ID --at ISO_TIMESTAMP',
        '',
        'Notes:',
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

function parseDate(value) {
    var date;

    if (!value) {
        return new Date();
    }

    date = new Date(value);

    if (isNaN(date.getTime())) {
        throw new Error('Invalid timestamp: ' + value);
    }

    return date;
}

function objectId(value, label) {
    if (!value || !mdb.ObjectId.isValid(value)) {
        throw new Error(label + ' is not a valid ObjectID: ' + value);
    }

    return new mdb.ObjectId(value);
}

function percent(value) {
    if (value === undefined || value === null || isNaN(value)) {
        return 'unknown';
    }

    return (Math.round(value * 10000) / 100).toString() + '%';
}

function points(value) {
    if (value === undefined || value === null || isNaN(value)) {
        return 'unknown';
    }

    return (Math.round(value * 100) / 100).toString();
}

var REPORT_TIME_ZONE = 'America/New_York';
var REPORT_TIME_ZONE_LABEL = 'ET';

function pad2(value) {
    return value < 10 ? '0' + value : String(value);
}

function timeParts(value) {
    var formatter;
    var parts;
    var result = {};

    if (!value) {
        return null;
    }

    formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: REPORT_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    parts = formatter.formatToParts(new Date(value));

    parts.forEach(function(part) {
        if (part.type !== 'literal') {
            result[part.type] = part.value;
        }
    });

    return result;
}

function humanTime(value) {
    var parts = timeParts(value);
    var dayPeriod;

    if (!parts) {
        return 'unknown';
    }

    dayPeriod = (parts.dayPeriod || '').toLowerCase();

    return parts.hour + ':' + parts.minute + dayPeriod + ', ' +
        parts.month + '/' + parts.day + '/' + parts.year +
        ' ' + REPORT_TIME_ZONE_LABEL;
}

function iso(value) {
    if (!value) {
        return 'unknown';
    }

    return new Date(value).toISOString();
}

function printReport(bridge, asOf, milestone, earliestAfter) {
    console.log('');
    console.log('Xronos Progress Audit Prototype');
    console.log('================================');
    console.log('');
    console.log('Assignment');
    console.log('----------');
    console.log('Repository:       ' + bridge.repository);
    console.log('Path:             ' + bridge.path);
    console.log('Canvas context:   ' + (bridge.contextId || 'unknown'));
    console.log('Canvas resource:  ' + (bridge.resourceLinkId || 'unknown'));
    console.log('Bridge ID:        ' + bridge._id);
    console.log('User ID:          ' + bridge.user);
    console.log('');

    console.log('Requested time');
    console.log('--------------');
    console.log('As of:           ' + humanTime(asOf));
    console.log('As of UTC:       ' + asOf.toISOString());
    console.log('');

    if (!milestone) {
        console.log('Result');
        console.log('------');
        console.log('No recorded progress milestone existed at or before the requested time.');
        if (earliestAfter) {
            console.log('');
            console.log('First later milestone');
            console.log('---------------------');
            console.log('Observed at:      ' + humanTime(earliestAfter.observedAt));
            console.log('Observed UTC:     ' + iso(earliestAfter.observedAt));
            console.log('Progress:         ' + percent(earliestAfter.score));
            console.log('Xronos points:    ' + points(earliestAfter.pointsEarned) + ' / ' + points(earliestAfter.pointsPossible));
            console.log('Canvas points:    ' + points(earliestAfter.canvasScore) + ' / ' + points(earliestAfter.canvasPointsPossible));
        }
        console.log('');
        return;
    }

    console.log('Result');
    console.log('------');
    console.log('Latest milestone: ' + humanTime(milestone.observedAt));
    console.log('Latest UTC:       ' + iso(milestone.observedAt));
    console.log('Window started:   ' + humanTime(milestone.windowStartedAt));
    console.log('Window UTC:       ' + iso(milestone.windowStartedAt));
    console.log('Progress:         ' + percent(milestone.score));
    console.log('Xronos points:    ' + points(milestone.pointsEarned) + ' / ' + points(milestone.pointsPossible));
    console.log('Canvas points:    ' + points(milestone.canvasScore) + ' / ' + points(milestone.canvasPointsPossible));
    console.log('Source:           ' + (milestone.source || 'unknown'));
    console.log('Milestone ID:     ' + milestone._id);
    console.log('');
}

var args = parseArgs(process.argv.slice(2));
var asOf;
var bridgeId;

try {
    if (!args.bridge) {
        throw new Error('Missing --bridge');
    }

    bridgeId = objectId(args.bridge, 'bridge');
    asOf = parseDate(args.at);
} catch (e) {
    console.error(e.message);
    usage(1);
}

mdb.initialize(function(err) {
    if (err) {
        console.error(err);
        process.exit(1);
    }

    mdb.LtiBridge.findById(bridgeId)
        .lean()
        .exec()
        .then(function(bridge) {
            var baseQuery;

            if (!bridge) {
                console.error(
                    'No LtiBridge found for --bridge ' +
                    args.bridge
                );
                mdb.mongoose.disconnect();
                process.exit(1);
                return;
            }

            baseQuery = {
                bridge: bridge._id,
                user: bridge.user,
                repository: bridge.repository,
                path: bridge.path
            };

            if (bridge.contextId) {
                baseQuery.contextId = bridge.contextId;
            }

            if (bridge.resourceLinkId) {
                baseQuery.resourceLinkId = bridge.resourceLinkId;
            }

            mdb.ProgressMilestone.findOne(Object.assign({}, baseQuery, {
                observedAt: { $lte: asOf }
            }))
                .sort({ observedAt: -1 })
                .lean()
                .exec()
                .then(function(milestone) {
                    return mdb.ProgressMilestone
                        .findOne(
                            Object.assign(
                                {},
                                baseQuery,
                                {
                                    observedAt: {
                                        $gt: asOf
                                    }
                                }
                            )
                        )
                        .sort({ observedAt: 1 })
                        .lean()
                        .exec()
                        .then(function(earliestAfter) {
                            printReport(
                                bridge,
                                asOf,
                                milestone,
                                earliestAfter
                            );

                            mdb.mongoose.disconnect();
                        });
                });
        })
        .catch(function(err) {
            console.error(err);
            mdb.mongoose.disconnect();
            process.exit(1);
        });
});
