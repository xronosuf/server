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

var crypto = require('crypto');
var mdb = require('../mdb');
var mongo = require('mongodb');

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
    if (!value || !mongo.ObjectID.isValid(value)) {
        throw new Error(label + ' is not a valid ObjectID: ' + value);
    }

    return new mongo.ObjectID(value);
}

function expirationHours(value) {
    var hours = parseInt(value || '168', 10);

    if (isNaN(hours) || hours < 1) {
        return 168;
    }

    if (hours > 2160) {
        return 2160;
    }

    return hours;
}

function randomToken() {
    return crypto.randomBytes(32)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function tokenHash(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function createTokenForBridge(bridge, hours, callback) {
    var token = randomToken();
    var hash = tokenHash(token);
    var createdAt = new Date();
    var expiresAt = new Date(createdAt.getTime() + hours * 60 * 60 * 1000);

    var auditToken = new mdb.AuditToken({
        tokenHash: hash,
        user: bridge.user,
        repository: bridge.repository,
        path: bridge.path,

        bridge: bridge._id,
        toolConsumerInstanceGuid: bridge.toolConsumerInstanceGuid,
        contextId: bridge.contextId,
        resourceLinkId: bridge.resourceLinkId,

        createdAt: createdAt,
        expiresAt: expiresAt
    });

    auditToken.save(function(err, saved) {
        if (err && err.code === 11000) {
            createTokenForBridge(bridge, hours, callback);
            return;
        }

        callback(err, token, saved);
    });
}

var args = parseArgs(process.argv.slice(2));
var bridgeId;
var hours;

try {
    if (!args.bridge) {
        throw new Error('Missing --bridge');
    }

    bridgeId = objectId(args.bridge, 'bridge');
    hours = expirationHours(args.hours);
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
        .exec(function(err, bridge) {
            if (err) {
                console.error(err);
                mdb.mongoose.disconnect();
                process.exit(1);
                return;
            }

            if (!bridge) {
                console.error('No LtiBridge found for --bridge ' + args.bridge);
                mdb.mongoose.disconnect();
                process.exit(1);
                return;
            }

            createTokenForBridge(bridge, hours, function(err, token, saved) {
                if (err) {
                    console.error(err);
                    process.exitCode = 1;
                } else {
                    console.log('');
                    console.log('Progress Audit Token Created');
                    console.log('============================');
                    console.log('');
                    console.log('Repository:   ' + saved.repository);
                    console.log('Path:         ' + saved.path);
                    console.log('Bridge ID:    ' + saved.bridge);
                    console.log('User ID:      ' + saved.user);
                    console.log('Created UTC:  ' + saved.createdAt.toISOString());
                    console.log('Expires UTC:  ' + saved.expiresAt.toISOString());
                    console.log('');
                    console.log('Token:');
                    console.log(token);
                    console.log('');
                    console.log('Store/share this token carefully. It cannot be recovered from the database.');
                    console.log('');
                }

                mdb.mongoose.disconnect();
            });
        });
});
