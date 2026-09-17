'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

function source(relativePath) {
    return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

describe('tab dormancy browser integration', function() {
    var runtime = source('public/javascripts/page-runtime.js');
    var sage = source('public/javascripts/sagemath.js');
    var gradebook = source('public/javascripts/gradebook.js');

    it('uses visibility-aware deadlines for all three initial runtime watchdogs', function() {
        assert(runtime.indexOf('require("./visibility-deadline")') >= 0);
        assert.strictEqual(
            (runtime.match(/visibilityDeadline\.setTimeout\(/g) || []).length,
            3
        );
    });

    it('uses a visibility-aware Sage request timeout instead of jQuery wall-clock timeout', function() {
        assert(sage.indexOf("require('./visibility-deadline')") >= 0);
        assert(sage.indexOf('timeout: 0') >= 0);
        assert(sage.indexOf('sageVisibilityDeadline.setTimeout(') >= 0);
        assert(sage.indexOf('jqXHR.abort("timeout")') >= 0);
    });

    it('rechecks grade sync on resume and does not promote dormancy-adjacent transport errors', function() {
        assert(gradebook.indexOf("require('./tab-dormancy-policy')") >= 0);
        assert(gradebook.indexOf('document.addEventListener("visibilitychange"') >= 0);
        assert(gradebook.indexOf('xronosGradeSyncFailureIsDormancyAdjacent()') >= 0);
        assert(gradebook.indexOf('Deferred grade-sync transport failure after tab dormancy') >= 0);
        assert(gradebook.indexOf('xronosScheduleGradeSyncRecheckAfterResume();') >= 0);
    });
});
