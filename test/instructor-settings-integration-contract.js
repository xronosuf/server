'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

function source(relativePath) {
    return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function count(haystack, needle) {
    return haystack.split(needle).length - 1;
}

describe('instructor settings server integration contract', function() {
    var app = source('app.js');
    var login = source('login/index.js');
    var mdb = source('mdb.js');
    var policy = source('lib/late-grade-policy.js');

    it('mounts exactly one GET and one PUT current-settings endpoint', function() {
        assert.strictEqual(
            count(app, "app.get('/instructor-settings/current'"),
            1
        );
        assert.strictEqual(
            count(app, "app.put('/instructor-settings/current'"),
            1
        );
    });

    it('ensures shell settings only from the persisted LTI bridge flow', function() {
        assert.strictEqual(
            count(login, 'instructorSettings.ensureGlobalForBridge(bridge)'),
            1
        );
        assert(
            login.indexOf('instructorSettings.ensureGlobalForBridge(bridge)') >
            login.indexOf('bridge\n          .save()')
        );
    });

    it('materializes the shell grade policy on LTI bridges for background work', function() {
        assert(mdb.indexOf('gradeSyncCutoff: String') >= 0);
        assert(mdb.indexOf('fallbackGradeSyncEndAt: Date') >= 0);
    });

    it('resolves both new shell-policy window sources centrally', function() {
        assert(policy.indexOf("source: 'xronos-due-date-setting'") >= 0);
        assert(policy.indexOf("source: 'shell-fallback'") >= 0);
        assert(policy.indexOf("configuredCutoff === 'late-policy'") >= 0);
        assert(policy.indexOf("configuredCutoff === 'due-date'") >= 0);
    });
});
