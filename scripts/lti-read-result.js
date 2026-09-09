#!/usr/bin/env node

/*
 * Read-only LTI 1.1 Basic Outcomes readResult probe.
 *
 * This script reads one existing LtiBridge, signs a readResult request with
 * the server-side LTI secret, and prints only safe diagnostic fields plus the
 * normalized result returned by the LMS. It does not modify MongoDB, Redis,
 * Xronos state, or Canvas grades.
 *
 * Usage:
 *   node scripts/lti-read-result.js --bridge BRIDGE_ID
 */

'use strict';

var mdb = require('../mdb');
var legacyHttpClient = require('../lib/legacy-http-client');
var outcomesRead = require('../lib/lti-outcomes-read');
var crypto = require('crypto');

function fail(message) {
    console.error(message);
    process.exitCode = 1;
}

function parseArgs(argv) {
    var args = {};
    var i;

    for (i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--help' || argv[i] === '-h') {
            console.log('Usage: node scripts/lti-read-result.js --bridge BRIDGE_ID');
            process.exit(0);
        }

        if (argv[i] === '--bridge') {
            args.bridge = argv[i + 1];
            i += 1;
            continue;
        }

        if (argv[i].indexOf('--bridge=') === 0) {
            args.bridge = argv[i].slice('--bridge='.length);
            continue;
        }

        throw new Error('Unexpected argument: ' + argv[i]);
    }

    return args;
}

function closeAndExit(code) {
    Promise.resolve()
        .then(function() {
            return mdb.mongoose.connection.close();
        })
        .then(function() {
            process.exit(code);
        })
        .catch(function() {
            process.exit(code);
        });
}

var args;

try {
    args = parseArgs(process.argv.slice(2));
} catch (err) {
    fail(err.message);
    process.exit();
}

if (!args.bridge || !mdb.ObjectId.isValid(args.bridge)) {
    fail('A valid --bridge ObjectID is required.');
    process.exit();
}

mdb.initialize(function(err) {
    if (err) {
        fail('Mongo initialization failed: ' + err.message);
        return;
    }

    mdb.LtiBridge.findOne({_id: new mdb.ObjectId(args.bridge)})
        .lean()
        .exec()
        .then(function(bridge) {
            if (!bridge) {
                throw new Error('Bridge not found.');
            }

            console.log('');
            console.log('Xronos LTI readResult probe');
            console.log('===========================');
            console.log('Bridge ID:        ' + bridge._id);
            console.log('Repository:       ' + (bridge.repository || 'unknown'));
            console.log('Path:             ' + (bridge.path || 'unknown'));
            console.log('Canvas context:   ' + (bridge.contextId || 'unknown'));
            console.log('Canvas resource:  ' + (bridge.resourceLinkId || 'unknown'));
            console.log('Due date:         ' + (bridge.dueDate ? new Date(bridge.dueDate).toISOString() : 'none'));
            console.log('Until date:       ' + (bridge.untilDate ? new Date(bridge.untilDate).toISOString() : 'none'));
            console.log('Points possible:  ' + (bridge.pointsPossible === undefined ? 'unknown' : bridge.pointsPossible));
            console.log('Has sourcedId:    ' + (!!bridge.lisResultSourcedid));
            console.log('Has outcome URL:  ' + (!!bridge.lisOutcomeServiceUrl));
            console.log('');

            if (!bridge.lisResultSourcedid || !bridge.lisOutcomeServiceUrl) {
                throw new Error('Bridge is not passback-capable.');
            }

            return mdb.KeyAndSecret.findOne({
                ltiKey: bridge.oauthConsumerKey
            })
                .lean()
                .exec()
                .then(function(keyAndSecret) {
                    var body;

                    if (!keyAndSecret || !keyAndSecret.ltiSecret) {
                        throw new Error('Missing LTI secret for bridge consumer key.');
                    }

                    body = outcomesRead.buildReadResultRequest(
                        bridge.lisResultSourcedid,
                        crypto.randomUUID()
                    );

                    return new Promise(function(resolve, reject) {
                        legacyHttpClient.postOAuth1Xml(
                            {
                                url: bridge.lisOutcomeServiceUrl,
                                body: body,
                                callback: 'about:blank',
                                consumerKey: keyAndSecret.ltiKey,
                                consumerSecret: keyAndSecret.ltiSecret,
                                signatureMethod: bridge.oauthSignatureMethod,
                                headers: {
                                    'Content-Type': 'application/xml',
                                    'User-Agent': 'Xronos/1.0 (University of Florida; readResult diagnostic probe)'
                                },
                                timeout: 15000
                            },
                            function(requestErr, response, responseBody) {
                                if (requestErr) {
                                    reject(requestErr);
                                    return;
                                }

                                resolve({
                                    parsed: outcomesRead.parseReadResultResponse(
                                        response,
                                        responseBody
                                    )
                                });
                            }
                        );
                    });
                });
        })
        .then(function(result) {
            var parsed = result.parsed;

            console.log('LMS response');
            console.log('------------');
            console.log('HTTP status:      ' + (parsed.statusCode || 'unknown'));
            console.log('LTI codeMajor:    ' + (parsed.codeMajor || 'unknown'));
            console.log('Probe success:    ' + parsed.ok);

            if (parsed.ok) {
                console.log('Has result:       ' + parsed.hasResult);
                console.log('Result fraction:  ' + (parsed.hasResult ? parsed.score : 'none'));
            } else {
                console.log('Probe error:      ' + parsed.error);
            }

            console.log('');
            console.log('Read-only probe complete. No grade was written.');
            closeAndExit(parsed.ok ? 0 : 2);
        })
        .catch(function(probeErr) {
            fail('Probe failed: ' + probeErr.message);
            closeAndExit(1);
        });
});
