'use strict';

var crypto = require('crypto');
var legacyHttpClient = require('./legacy-http-client');
var outcomesRead = require('./lti-outcomes-read');

function readResult(bridge, keyAndSecret, callback) {
    if (!bridge || !bridge.lisOutcomeServiceUrl || !bridge.lisResultSourcedid) {
        callback(new Error('Bridge is not readResult-capable.'));
        return;
    }

    if (!keyAndSecret || !keyAndSecret.ltiKey || !keyAndSecret.ltiSecret) {
        callback(new Error('Missing LTI key or secret.'));
        return;
    }

    var body = outcomesRead.buildReadResultRequest(
        bridge.lisResultSourcedid,
        crypto.randomUUID()
    );

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
                'User-Agent':
                    'Xronos/1.0 ' +
                    '(University of Florida; Canvas readResult)'
            },
            timeout: 15000
        },
        function(err, response, responseBody) {
            if (err) {
                callback(err);
                return;
            }

            callback(
                null,
                outcomesRead.parseReadResultResponse(
                    response,
                    responseBody
                )
            );
        }
    );
}

exports.readResult = readResult;
