var assert = require('assert');
var outcomesRead = require('../lib/lti-outcomes-read');

describe('LTI Outcomes readResult helpers', function() {
    it('builds a readResult request with sourcedId', function() {
        var xml = outcomesRead.buildReadResultRequest(
            'result<&>id',
            'message-1'
        );

        assert(xml.indexOf('<readResultRequest>') !== -1);
        assert(xml.indexOf('<imsx_messageIdentifier>message-1</imsx_messageIdentifier>') !== -1);
        assert(xml.indexOf('<sourcedId>result&lt;&amp;&gt;id</sourcedId>') !== -1);
    });

    it('parses a successful numeric result', function() {
        var parsed = outcomesRead.parseReadResultResponse(
            {statusCode: 200},
            '<imsx_codeMajor>success</imsx_codeMajor>' +
            '<textString>0.28</textString>'
        );

        assert.strictEqual(parsed.ok, true);
        assert.strictEqual(parsed.hasResult, true);
        assert.strictEqual(parsed.score, 0.28);
    });

    it('distinguishes an empty result from zero', function() {
        var empty = outcomesRead.parseReadResultResponse(
            {statusCode: 200},
            '<imsx_codeMajor>success</imsx_codeMajor>' +
            '<textString></textString>'
        );
        var zero = outcomesRead.parseReadResultResponse(
            {statusCode: 200},
            '<imsx_codeMajor>success</imsx_codeMajor>' +
            '<textString>0</textString>'
        );

        assert.strictEqual(empty.ok, true);
        assert.strictEqual(empty.hasResult, false);
        assert.strictEqual(empty.score, null);

        assert.strictEqual(zero.ok, true);
        assert.strictEqual(zero.hasResult, true);
        assert.strictEqual(zero.score, 0);
    });

    it('rejects non-success LTI responses', function() {
        var parsed = outcomesRead.parseReadResultResponse(
            {statusCode: 200},
            '<imsx_codeMajor>failure</imsx_codeMajor>'
        );

        assert.strictEqual(parsed.ok, false);
        assert.strictEqual(parsed.error, 'lti-outcomes-error');
    });

    it('rejects non-2xx HTTP responses', function() {
        var parsed = outcomesRead.parseReadResultResponse(
            {statusCode: 500},
            '<imsx_codeMajor>success</imsx_codeMajor>' +
            '<textString>0.5</textString>'
        );

        assert.strictEqual(parsed.ok, false);
        assert.strictEqual(parsed.error, 'http-error');
    });

    it('rejects malformed result scores', function() {
        var parsed = outcomesRead.parseReadResultResponse(
            {statusCode: 200},
            '<imsx_codeMajor>success</imsx_codeMajor>' +
            '<textString>not-a-number</textString>'
        );

        assert.strictEqual(parsed.ok, false);
        assert.strictEqual(parsed.error, 'invalid-result-score');
    });
});
