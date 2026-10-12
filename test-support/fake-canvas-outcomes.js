'use strict';

var http = require('http');

function xmlDecode(value) {
    return String(value || '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

function xmlEscape(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function firstTag(body, tagName) {
    var pattern = new RegExp(
        '<(?:[^>:]+:)?' + tagName + '[^>]*>([\\s\\S]*?)<\\/(?:[^>:]+:)?' + tagName + '>',
        'i'
    );
    var match = pattern.exec(body || '');

    if (!match) {
        return null;
    }

    return xmlDecode(
        match[1]
            .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
            .replace(/<[^>]+>/g, '')
            .trim()
    );
}

function tagBlock(body, tagName) {
    var pattern = new RegExp(
        '<(?:[^>:]+:)?' + tagName + '[^>]*>([\\s\\S]*?)<\\/(?:[^>:]+:)?' + tagName + '>',
        'i'
    );
    var match = pattern.exec(body || '');
    return match ? match[1] : null;
}

function nestedTextString(body, parentTag) {
    var block = tagBlock(body, parentTag);
    return block === null ? null : firstTag(block, 'textString');
}

function responseEnvelope(messageIdentifier, bodyXml) {
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<imsx_POXEnvelopeResponse xmlns="http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0">',
        '  <imsx_POXHeader>',
        '    <imsx_POXResponseHeaderInfo>',
        '      <imsx_version>V1.0</imsx_version>',
        '      <imsx_messageIdentifier>' + xmlEscape(messageIdentifier || 'fake-canvas') + '</imsx_messageIdentifier>',
        '      <imsx_statusInfo>',
        '        <imsx_codeMajor>success</imsx_codeMajor>',
        '        <imsx_severity>status</imsx_severity>',
        '        <imsx_description>Fake Canvas Outcomes service accepted request</imsx_description>',
        '      </imsx_statusInfo>',
        '    </imsx_POXResponseHeaderInfo>',
        '  </imsx_POXHeader>',
        '  <imsx_POXBody>',
        bodyXml || '',
        '  </imsx_POXBody>',
        '</imsx_POXEnvelopeResponse>'
    ].join('\n');
}

function readResultBody(result) {
    var scoreXml = '';

    if (result && result.resultScore !== null && result.resultScore !== undefined) {
        scoreXml = [
            '          <resultScore>',
            '            <language>en</language>',
            '            <textString>' + xmlEscape(result.resultScore) + '</textString>',
            '          </resultScore>'
        ].join('\n');
    }

    return [
        '    <readResultResponse>',
        '      <result>',
        scoreXml,
        '      </result>',
        '    </readResultResponse>'
    ].join('\n');
}

function FakeCanvasOutcomesServer(options) {
    options = options || {};

    this.host = options.host || '127.0.0.1';
    this.port = options.port || 0;
    this.server = null;
    this.boundPort = null;
    this.results = Object.create(null);
    this.requests = [];
    this.failureQueue = [];
}

FakeCanvasOutcomesServer.prototype.url = function() {
    if (!this.boundPort) {
        throw new Error('Fake Canvas Outcomes server is not running.');
    }

    return 'http://' + this.host + ':' + this.boundPort + '/api/lti/v1/tools/outcomes';
};

FakeCanvasOutcomesServer.prototype.result = function(sourcedId) {
    return this.results[String(sourcedId)] || null;
};

FakeCanvasOutcomesServer.prototype.reset = function() {
    this.results = Object.create(null);
    this.requests = [];
    this.failureQueue = [];
};

FakeCanvasOutcomesServer.prototype.failNext = function(statusCode, body) {
    this.failureQueue.push({
        statusCode: statusCode || 500,
        body: body || 'simulated fake Canvas failure'
    });
};

FakeCanvasOutcomesServer.prototype.start = function(callback) {
    var self = this;

    if (self.server) {
        callback(null);
        return;
    }

    self.server = http.createServer(function(req, res) {
        var chunks = [];

        req.on('data', function(chunk) {
            chunks.push(chunk);
        });

        req.on('end', function() {
            var body = Buffer.concat(chunks).toString('utf8');
            var messageIdentifier = firstTag(body, 'imsx_messageIdentifier');
            var sourcedId = firstTag(body, 'sourcedId');
            var operation = /<\s*(?:[^>:]+:)?replaceResultRequest\b/i.test(body)
                ? 'replaceResult'
                : (
                    /<\s*(?:[^>:]+:)?readResultRequest\b/i.test(body)
                        ? 'readResult'
                        : 'unknown'
                );

            self.requests.push({
                method: req.method,
                url: req.url,
                operation: operation,
                sourcedId: sourcedId,
                authorization: req.headers.authorization || null,
                body: body
            });

            if (self.failureQueue.length) {
                var failure = self.failureQueue.shift();
                res.statusCode = failure.statusCode;
                res.setHeader('Content-Type', 'text/plain');
                res.end(failure.body);
                return;
            }

            if (req.method !== 'POST' || operation === 'unknown' || !sourcedId) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'text/plain');
                res.end('Unsupported fake Canvas Outcomes request.');
                return;
            }

            if (operation === 'replaceResult') {
                var scoreText = nestedTextString(body, 'resultScore');
                var totalText = nestedTextString(body, 'resultTotalScore');
                var submittedAt = firstTag(body, 'submittedAt');

                self.results[String(sourcedId)] = {
                    sourcedId: sourcedId,
                    resultScore:
                        scoreText === null || scoreText === ''
                            ? null
                            : Number(scoreText),
                    resultTotalScore:
                        totalText === null || totalText === ''
                            ? null
                            : Number(totalText),
                    submittedAt: submittedAt || null,
                    acceptedAt: new Date(),
                    authorization: req.headers.authorization || null,
                    rawBody: body
                };

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/xml');
                res.end(responseEnvelope(
                    messageIdentifier,
                    '    <replaceResultResponse/>'
                ));
                return;
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/xml');
            res.end(responseEnvelope(
                messageIdentifier,
                readResultBody(self.result(sourcedId))
            ));
        });
    });

    self.server.listen(self.port, self.host, function() {
        self.boundPort = self.server.address().port;
        callback(null);
    });

    self.server.on('error', function(err) {
        if (callback) {
            var cb = callback;
            callback = null;
            cb(err);
        }
    });
};

FakeCanvasOutcomesServer.prototype.stop = function(callback) {
    var self = this;

    callback = callback || function() {};

    if (!self.server) {
        callback(null);
        return;
    }

    self.server.close(function(err) {
        self.server = null;
        self.boundPort = null;
        callback(err);
    });
};

exports.FakeCanvasOutcomesServer = FakeCanvasOutcomesServer;
exports.firstTag = firstTag;
exports.nestedTextString = nestedTextString;
