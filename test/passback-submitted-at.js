'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var pug = require('pug');

describe('LTI passback submittedAt extension', function() {
    it('emits submissionDetails only when submittedAt is supplied', function() {
        var template = pug.compile(
            fs.readFileSync(
                path.join(
                    __dirname,
                    '../views/lti/passback.pug'
                ),
                'utf8'
            )
        );

        var withTimestamp = template({
            messageIdentifier: 'message-1',
            sourcedId: 'result-1',
            resultScore: 0.87,
            submittedAt: '2026-10-05T23:58:47.000Z'
        });
        var withoutTimestamp = template({
            messageIdentifier: 'message-2',
            sourcedId: 'result-2',
            resultScore: 0.87
        });

        assert.ok(
            withTimestamp.indexOf('<submissionDetails>') >= 0
        );
        assert.ok(
            withTimestamp.indexOf(
                '<submittedAt>2026-10-05T23:58:47.000Z</submittedAt>'
            ) >= 0
        );
        assert.strictEqual(
            withoutTimestamp.indexOf('<submissionDetails>'),
            -1
        );
    });
});
