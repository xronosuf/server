'use strict';

var assert = require('assert');
var path = require('path');
var pug = require('pug');
var crypto = require('crypto');
var legacyHttpClient = require('../lib/legacy-http-client');
var ltiOutcomesClient = require('../lib/lti-outcomes-client');
var FakeCanvasOutcomesServer =
    require('../test-support/fake-canvas-outcomes').FakeCanvasOutcomesServer;

describe('fake Canvas LTI Outcomes service', function() {
    var fakeCanvas;
    var passback;

    before(function(done) {
        fakeCanvas = new FakeCanvasOutcomesServer();

        passback = pug.compileFile(
            path.join(__dirname, '../views/lti/passback.pug')
        );

        fakeCanvas.start(done);
    });

    after(function(done) {
        fakeCanvas.stop(done);
    });

    beforeEach(function() {
        fakeCanvas.reset();
    });

    it('accepts a real OAuth-signed replaceResult and preserves submittedAt', function(done) {
        var submittedAt = '2026-10-05T23:58:57.000Z';
        var body = passback({
            messageIdentifier: crypto.randomUUID(),
            resultDataUrl: 'https://xronos.example/result',
            resultScore: 0.87,
            resultTotalScore: 8.7,
            submittedAt: submittedAt,
            sourcedId: 'fake-result-1'
        });

        legacyHttpClient.postOAuth1Xml(
            {
                url: fakeCanvas.url(),
                body: body,
                callback: 'about:blank',
                consumerKey: 'fake-key',
                consumerSecret: 'fake-secret',
                signatureMethod: 'HMAC-SHA1'
            },
            function(err, response, responseBody) {
                if (err) {
                    done(err);
                    return;
                }

                try {
                    assert.strictEqual(response.statusCode, 200);
                    assert.ok(
                        /<imsx_codeMajor>\s*success\s*<\/imsx_codeMajor>/i
                            .test(responseBody)
                    );

                    var stored = fakeCanvas.result('fake-result-1');

                    assert.ok(stored);
                    assert.strictEqual(stored.resultScore, 0.87);
                    assert.strictEqual(stored.resultTotalScore, 8.7);
                    assert.strictEqual(stored.submittedAt, submittedAt);
                    assert.ok(
                        /^OAuth /.test(stored.authorization || '')
                    );
                    assert.ok(
                        /oauth_body_hash=/.test(stored.authorization || '')
                    );

                    done();
                } catch (assertionErr) {
                    done(assertionErr);
                }
            }
        );
    });

    it('round-trips the stored grade through the real readResult client', function(done) {
        var body = passback({
            messageIdentifier: crypto.randomUUID(),
            resultScore: 0.64,
            resultTotalScore: 6.4,
            sourcedId: 'fake-result-2'
        });

        legacyHttpClient.postOAuth1Xml(
            {
                url: fakeCanvas.url(),
                body: body,
                callback: 'about:blank',
                consumerKey: 'fake-key',
                consumerSecret: 'fake-secret',
                signatureMethod: 'HMAC-SHA1'
            },
            function(writeErr) {
                if (writeErr) {
                    done(writeErr);
                    return;
                }

                ltiOutcomesClient.readResult(
                    {
                        lisOutcomeServiceUrl: fakeCanvas.url(),
                        lisResultSourcedid: 'fake-result-2',
                        oauthSignatureMethod: 'HMAC-SHA1'
                    },
                    {
                        ltiKey: 'fake-key',
                        ltiSecret: 'fake-secret'
                    },
                    function(readErr, result) {
                        if (readErr) {
                            done(readErr);
                            return;
                        }

                        try {
                            assert.ok(result.ok);
                            assert.ok(result.hasResult);
                            assert.strictEqual(result.score, 0.64);

                            assert.strictEqual(
                                fakeCanvas.requests.filter(function(request) {
                                    return request.operation === 'replaceResult';
                                }).length,
                                1
                            );
                            assert.strictEqual(
                                fakeCanvas.requests.filter(function(request) {
                                    return request.operation === 'readResult';
                                }).length,
                                1
                            );

                            done();
                        } catch (assertionErr) {
                            done(assertionErr);
                        }
                    }
                );
            }
        );
    });

    it('can inject a transient Canvas failure for retry tests', function(done) {
        fakeCanvas.failNext(503, 'temporarily unavailable');

        var body = passback({
            messageIdentifier: crypto.randomUUID(),
            resultScore: 0.50,
            sourcedId: 'fake-result-3'
        });

        legacyHttpClient.postOAuth1Xml(
            {
                url: fakeCanvas.url(),
                body: body,
                callback: 'about:blank',
                consumerKey: 'fake-key',
                consumerSecret: 'fake-secret',
                signatureMethod: 'HMAC-SHA1'
            },
            function(err, response, responseBody) {
                if (err) {
                    done(err);
                    return;
                }

                try {
                    assert.strictEqual(response.statusCode, 503);
                    assert.strictEqual(responseBody, 'temporarily unavailable');
                    assert.strictEqual(
                        fakeCanvas.result('fake-result-3'),
                        null
                    );
                    done();
                } catch (assertionErr) {
                    done(assertionErr);
                }
            }
        );
    });
});
