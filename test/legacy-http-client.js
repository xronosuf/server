'use strict';

var assert = require('assert');
var http = require('http');
var client = require('../lib/legacy-http-client');

function withServer(handler, callback) {
    var server = http.createServer(handler);

    server.listen(0, '127.0.0.1', function() {
        var address = server.address();
        var url = 'http://127.0.0.1:' + address.port;

        callback(url, function(done) {
            server.close(done);
        });
    });
}

describe('legacy HTTP client replacement', function() {
    it('builds a deterministic OAuth 1 HMAC-SHA1 header with body hash', function() {
        var header = client.oauthAuthorizationHeader({
            method: 'POST',
            url: 'https://canvas.example.edu/api/lti/v1/tools/grade_passback?foo=bar',
            body: '<xml>grade</xml>',
            bodyHash: true,
            callback: 'about:blank',
            consumerKey: 'consumer-key',
            consumerSecret: 'consumer-secret',
            signatureMethod: 'HMAC-SHA1',
            timestamp: 1700000000,
            nonce: 'fixed-nonce'
        });

        assert.strictEqual(
            header,
            'OAuth oauth_body_hash="3MQmtVusRholzPal91rdBh9kFxU%3D", ' +
            'oauth_callback="about%3Ablank", ' +
            'oauth_consumer_key="consumer-key", ' +
            'oauth_nonce="fixed-nonce", ' +
            'oauth_signature="BKQ7ZvVmMryqlsCuAc4kB6dfY%2Fw%3D", ' +
            'oauth_signature_method="HMAC-SHA1", ' +
            'oauth_timestamp="1700000000", ' +
            'oauth_version="1.0"'
        );
    });

    it('posts application/x-www-form-urlencoded data', function(done) {
        withServer(
            function(req, res) {
                var chunks = [];

                req.on('data', function(chunk) {
                    chunks.push(chunk);
                });

                req.on('end', function() {
                    assert.strictEqual(req.method, 'POST');
                    assert.strictEqual(
                        req.headers['content-type'],
                        'application/x-www-form-urlencoded'
                    );
                    assert.strictEqual(
                        Buffer.concat(chunks).toString('utf8'),
                        'code=2%2B2&foo=bar'
                    );
                    assert.strictEqual(
                        req.headers['x-xronos-support-trace'],
                        'trace-123'
                    );

                    res.statusCode = 201;
                    res.setHeader('Content-Type', 'text/plain');
                    res.end('ok');
                });
            },
            function(url, close) {
                client.postForm(
                    url + '/service',
                    { code: '2+2', foo: 'bar' },
                    {
                        headers: {
                            'X-Xronos-Support-Trace': 'trace-123'
                        },
                        timeout: 1000
                    },
                    function(err, response, body) {
                        assert.ifError(err);
                        assert.strictEqual(response.statusCode, 201);
                        assert.strictEqual(body, 'ok');
                        close(done);
                    }
                );
            }
        );
    });

    it('posts JSON using HTTP Basic authentication', function(done) {
        withServer(
            function(req, res) {
                var chunks = [];

                req.on('data', function(chunk) {
                    chunks.push(chunk);
                });

                req.on('end', function() {
                    assert.strictEqual(
                        req.headers.authorization,
                        'Basic dXNlcjpwYXNz'
                    );
                    assert.strictEqual(
                        req.headers['content-type'],
                        'application/json'
                    );
                    assert.strictEqual(
                        req.headers['x-experience-api-version'],
                        '1.0.3'
                    );
                    assert.deepStrictEqual(
                        JSON.parse(Buffer.concat(chunks).toString('utf8')),
                        { verb: 'answered' }
                    );

                    res.statusCode = 200;
                    res.end('stored');
                });
            },
            function(url, close) {
                client.postJsonBasic(
                    url + '/xapi/statements',
                    { verb: 'answered' },
                    'user',
                    'pass',
                    {
                        'X-Experience-API-Version': '1.0.3'
                    },
                    function(err, response, body) {
                        assert.ifError(err);
                        assert.strictEqual(response.statusCode, 200);
                        assert.strictEqual(body, 'stored');
                        close(done);
                    }
                );
            }
        );
    });
});
