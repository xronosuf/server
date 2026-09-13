'use strict';

var crypto = require('crypto');

function xmlEscape(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function buildReadResultRequest(sourcedId, messageIdentifier) {
    messageIdentifier = messageIdentifier || crypto.randomUUID();

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<imsx_POXEnvelopeRequest xmlns="http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0">',
        '  <imsx_POXHeader>',
        '    <imsx_POXRequestHeaderInfo>',
        '      <imsx_version>V1.0</imsx_version>',
        '      <imsx_messageIdentifier>' + xmlEscape(messageIdentifier) + '</imsx_messageIdentifier>',
        '    </imsx_POXRequestHeaderInfo>',
        '  </imsx_POXHeader>',
        '  <imsx_POXBody>',
        '    <readResultRequest>',
        '      <resultRecord>',
        '        <sourcedGUID>',
        '          <sourcedId>' + xmlEscape(sourcedId) + '</sourcedId>',
        '        </sourcedGUID>',
        '      </resultRecord>',
        '    </readResultRequest>',
        '  </imsx_POXBody>',
        '</imsx_POXEnvelopeRequest>'
    ].join('\n');
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

    return match[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .trim();
}

function parseReadResultResponse(response, body) {
    var statusCode = response && response.statusCode;
    var codeMajor = firstTag(body, 'imsx_codeMajor');
    var textString = firstTag(body, 'textString');
    var score;

    if (!(statusCode >= 200 && statusCode < 300)) {
        return {
            ok: false,
            statusCode: statusCode,
            codeMajor: codeMajor,
            error: 'http-error'
        };
    }

    if (!codeMajor || codeMajor.toLowerCase() !== 'success') {
        return {
            ok: false,
            statusCode: statusCode,
            codeMajor: codeMajor,
            error: 'lti-outcomes-error'
        };
    }

    if (textString === null || textString === '') {
        return {
            ok: true,
            statusCode: statusCode,
            codeMajor: codeMajor,
            hasResult: false,
            score: null,
            rawText: textString
        };
    }

    score = Number(textString);

    if (!isFinite(score)) {
        return {
            ok: false,
            statusCode: statusCode,
            codeMajor: codeMajor,
            error: 'invalid-result-score',
            rawText: textString
        };
    }

    return {
        ok: true,
        statusCode: statusCode,
        codeMajor: codeMajor,
        hasResult: true,
        score: score,
        rawText: textString
    };
}

exports.buildReadResultRequest = buildReadResultRequest;
exports.parseReadResultResponse = parseReadResultResponse;
