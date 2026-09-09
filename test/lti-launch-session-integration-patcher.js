var assert = require('assert');
var fs = require('fs');
var path = require('path');
var patcher = require('../scripts/modernization/apply-lti-launch-session-fix');

var root = path.join(__dirname, '..');

describe('LTI launch session integration patcher', function() {
    it('patches or verifies the login staging call', function() {
        var source = fs.readFileSync(
            path.join(root, 'login/index.js'),
            'utf8'
        );
        var patched = patcher.patchLogin(source);

        assert.ok(
            patched.indexOf('ltiLaunchReference.stage(req, bridge);') !== -1
        );
        assert.strictEqual(
            patcher.patchLogin(patched),
            patched
        );
    });

    it('patches or verifies both post-auth commit routes', function() {
        var source = fs.readFileSync(
            path.join(root, 'app.js'),
            'utf8'
        );
        var patched = patcher.patchApp(source);
        var lmsStart = patched.indexOf("app.post('/lms'");
        var assignmentStart = patched.indexOf(
            "app.post('/:repository/:path(*)/lti'",
            lmsStart
        );
        var lmsRoute = patched.slice(lmsStart, assignmentStart);

        assert.ok(
            patched.indexOf(
                "ltiLaunchReference = require('./lib/lti-launch-reference')"
            ) !== -1
        );
        assert.ok(
            patched.indexOf('ltiLaunchReference.commit(req);') !== -1
        );
        assert.ok(lmsStart !== -1);
        assert.ok(assignmentStart !== -1);
        assert.ok(
            lmsRoute.indexOf(
                "successRedirect: config.toValidPath('/just-logged-in')"
            ) === -1
        );
        assert.ok(
            lmsRoute.indexOf('ltiLaunchReference.commit(req);') !== -1
        );
        assert.strictEqual(
            patcher.patchApp(patched),
            patched
        );
    });
});
