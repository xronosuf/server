'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var patcher = require('../scripts/modernization/apply-page-repair-integration');

var root = path.join(__dirname, '..');

describe('page repair support report contract', function() {
    it('includes only the bounded page repair fields', function() {
        var filename = path.join(
            root,
            'public/javascripts/page-runtime-support-report.js'
        );
        var source = patcher.patchSupportReport(
            fs.readFileSync(filename, 'utf8')
        );
        var moduleObject = {exports: {}};
        var sandbox = {
            module: moduleObject,
            exports: moduleObject.exports,
            require: require,
            console: console,
            Date: Date,
            JSON: JSON,
            isFinite: isFinite
        };

        vm.runInNewContext(source, sandbox, {filename: filename});

        var report = moduleObject.exports.build({
            pageRepair: {
                token: 'xr-token-123456789',
                requestedAt: '2026-09-09T23:00:00.000Z',
                path: '/testsuite/test-suite-xourse/activity',
                cookie: 'SECRET',
                answerState: 'SECRET',
                oauthConsumerKey: 'SECRET'
            }
        });
        var text = JSON.stringify(report);

        assert.strictEqual(report.schemaVersion, 2);
        assert.deepStrictEqual(
            JSON.parse(JSON.stringify(report.pageRepair)),
            {
                token: 'xr-token-123456789',
                requestedAt: '2026-09-09T23:00:00.000Z',
                path: '/testsuite/test-suite-xourse/activity'
            }
        );
        assert.strictEqual(text.indexOf('SECRET'), -1);
        assert.strictEqual(text.indexOf('cookie'), -1);
        assert.strictEqual(text.indexOf('answerState'), -1);
        assert.strictEqual(text.indexOf('oauthConsumerKey'), -1);
    });
});
