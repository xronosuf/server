#!/usr/bin/env node

/*
 * Prototype token-based progress audit report.
 *
 * This is intentionally command-line only. It verifies the token and prints
 * the progress milestone report, but it does not yet perform web-session
 * instructor authorization.
 *
 * Usage:
 *   node scripts/progress-audit-token-report.js --token TOKEN --at ISO_TIMESTAMP
 */

var crypto = require('crypto');
var mdb = require('../mdb');

var REPORT_TIME_ZONE = 'America/New_York';
var REPORT_TIME_ZONE_LABEL = 'ET';

function usage(exitCode) {
    console.log([
        'Usage:',
        '  node scripts/progress-audit-token-report.js --token TOKEN --at ISO_TIMESTAMP',
        '',
        'Notes:',
        '  --at defaults to now if omitted.',
        '  This prototype does not modify records.'
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

function tokenHash(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
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

    return parts.hour + ':' + parts.minute + dayPeriod + ' ' +
        REPORT_TIME_ZONE_LABEL + ', ' +
        parts.month + '/' + parts.day + '/' + parts.year;
}

function iso(value) {
    if (!value) {
        return 'unknown';
    }

    return new Date(value).toISOString();
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

function tokenIsUsable(auditToken, now) {
    if (!auditToken) {
        return 'Token not found.';
    }

    if (auditToken.revokedAt) {
        return 'Token has been revoked.';
    }

    if (auditToken.expiresAt && new Date(auditToken.expiresAt).getTime() < now.getTime()) {
        return 'Token has expired.';
    }

    return null;
}

function printReport(auditToken, asOf, milestone, earliestAfter) {
    console.log('');
    console.log('Xronos Progress Audit Token Report');
    console.log('==================================');
    console.log('');
    console.log('Token scope');
    console.log('-----------');
    console.log('Repository:       ' + auditToken.repository);
    console.log('Path:             ' + auditToken.path);
    console.log('Canvas context:   ' + (auditToken.contextId || 'unknown'));
    console.log('Canvas resource:  ' + (auditToken.resourceLinkId || 'unknown'));
    console.log('Bridge ID:        ' + auditToken.bridge);
    console.log('User ID:          ' + auditToken.user);
    console.log('Created:          ' + humanTime(auditToken.createdAt));
    console.log('Created UTC:      ' + iso(auditToken.createdAt));
    console.log('Expires:          ' + humanTime(auditToken.expiresAt));
    console.log('Expires UTC:      ' + iso(auditToken.expiresAt));
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

function findMilestones(auditToken, asOf, callback) {
    var baseQuery = {
        bridge: auditToken.bridge,
        user: auditToken.user,
        repository: auditToken.repository,
        path: auditToken.path
    };

    if (auditToken.contextId) {
        baseQuery.contextId = auditToken.contextId;
    }

    if (auditToken.resourceLinkId) {
        baseQuery.resourceLinkId = auditToken.resourceLinkId;
    }

    mdb.ProgressMilestone.findOne(Object.assign({}, baseQuery, {
        observedAt: { $lte: asOf }
    }))
        .sort({ observedAt: -1 })
        .lean()
        .exec(function(err, milestone) {
            if (err) {
                callback(err);
                return;
            }

            mdb.ProgressMilestone.findOne(Object.assign({}, baseQuery, {
                observedAt: { $gt: asOf }
            }))
                .sort({ observedAt: 1 })
                .lean()
                .exec(function(err, earliestAfter) {
                    if (err) {
                        callback(err);
                        return;
                    }

                    callback(null, milestone, earliestAfter);
                });
        });
}

var args = parseArgs(process.argv.slice(2));
var asOf;

try {
    if (!args.token) {
        throw new Error('Missing --token');
    }

    asOf = parseDate(args.at);
} catch (e) {
    console.error(e.message);
    usage(1);
}

mdb.initialize(function(err) {
    var hash;
    var now = new Date();

    if (err) {
        console.error(err);
        process.exit(1);
    }

    hash = tokenHash(args.token);

    mdb.AuditToken.findOne({ tokenHash: hash })
        .lean()
        .exec(function(err, auditToken) {
            var problem;

            if (err) {
                console.error(err);
                mdb.mongoose.disconnect();
                process.exit(1);
                return;
            }

            problem = tokenIsUsable(auditToken, now);

            if (problem) {
                console.error(problem);
                mdb.mongoose.disconnect();
                process.exit(1);
                return;
            }

            findMilestones(auditToken, asOf, function(err, milestone, earliestAfter) {
                if (err) {
                    console.error(err);
                    process.exitCode = 1;
                } else {
                    printReport(auditToken, asOf, milestone, earliestAfter);
                }

                mdb.mongoose.disconnect();
            });
        });
});
