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

var mdb = require('../mdb');
var progressAudit = require('../routes/progress-audit');

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

    hash = progressAudit.tokenHash(args.token);

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

            problem = progressAudit.tokenIsUsable(auditToken, now);

            if (problem) {
                console.error(problem);
                mdb.mongoose.disconnect();
                process.exit(1);
                return;
            }

            progressAudit.findMilestones(auditToken, asOf, function(err, milestone, earliestAfter) {
                if (err) {
                    console.error(err);
                    process.exitCode = 1;
                } else {
                    console.log(
                        progressAudit.tokenReportLines(
                            auditToken,
                            asOf,
                            milestone,
                            earliestAfter
                        ).join('\n')
                    );
                }

                mdb.mongoose.disconnect();
            });
        });
});
