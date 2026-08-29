#!/usr/bin/env node

/*
 * Prototype student-side audit-token generator.
 *
 * Stores only a SHA-256 hash of the token. The raw token is printed once.
 *
 * Usage:
 *   node scripts/progress-audit-token-create.js --bridge BRIDGE_ID
 *   node scripts/progress-audit-token-create.js --bridge BRIDGE_ID --hours 168
 */

var mdb = require('../mdb');
var progressAudit = require('../routes/progress-audit');

function usage(exitCode) {
    console.log([
        'Usage:',
        '  node scripts/progress-audit-token-create.js --bridge BRIDGE_ID [--hours HOURS]',
        '',
        'Notes:',
        '  The token is printed once. Only its hash is stored in MongoDB.',
        '  Default expiration is 168 hours, i.e. 7 days.'
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
    if (!value || !mdb.ObjectId.isValid(value)) {
        throw new Error(label + ' is not a valid ObjectID: ' + value);
    }

    return new mdb.ObjectId(value);
}

var args = parseArgs(process.argv.slice(2));
var bridgeId;
var hours;

try {
    if (!args.bridge) {
        throw new Error('Missing --bridge');
    }

    bridgeId = objectId(args.bridge, 'bridge');
    hours = progressAudit.expirationHours(args.hours);
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
            if (!bridge) {
                console.error(
                    'No LtiBridge found for --bridge ' +
                    args.bridge
                );
                mdb.mongoose.disconnect();
                process.exit(1);
                return;
            }

            progressAudit.createTokenForBridge(
                bridge,
                hours,
                function(err, token, saved) {
                    if (err) {
                        console.error(err);
                        process.exitCode = 1;
                    } else {
                        console.log('');
                        console.log(
                            'Progress Audit Token Created'
                        );
                        console.log(
                            '============================'
                        );
                        console.log('');
                        console.log(
                            'Repository:   ' +
                            saved.repository
                        );
                        console.log(
                            'Path:         ' +
                            saved.path
                        );
                        console.log(
                            'Bridge ID:    ' +
                            saved.bridge
                        );
                        console.log(
                            'User ID:      ' +
                            saved.user
                        );
                        console.log(
                            'Created:      ' +
                            progressAudit.humanTime(
                                saved.createdAt
                            )
                        );
                        console.log(
                            'Created UTC:  ' +
                            progressAudit.iso(
                                saved.createdAt
                            )
                        );
                        console.log(
                            'Expires:      ' +
                            progressAudit.humanTime(
                                saved.expiresAt
                            )
                        );
                        console.log(
                            'Expires UTC:  ' +
                            progressAudit.iso(
                                saved.expiresAt
                            )
                        );
                        console.log('');
                        console.log('Token:');
                        console.log(token);
                        console.log('');
                        console.log(
                            'Store/share this token carefully. ' +
                            'It cannot be recovered from the database.'
                        );
                        console.log('');
                    }

                    mdb.mongoose.disconnect();
                }
            );
        })
        .catch(function(err) {
            console.error(err);
            mdb.mongoose.disconnect();
            process.exit(1);
        });
});
