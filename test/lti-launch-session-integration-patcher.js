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

    it('patches only the two LTI post-auth routes and is idempotent', function() {
        var source = fs.readFileSync(
            path.join(root, 'app.js'),
            'utf8'
        );
        var patched = patcher.patchApp(source);
        var lms = patcher.routeBlock(
            patched,
            "        app.post('/lms',",
            "        app.post('/:repository/:path(*)/lti',",
            '/lms'
        );
        var assignment = patcher.routeBlock(
            patched,
            "        app.post('/:repository/:path(*)/lti',",
            "    }\n    \n    app.get('/logout'",
            'assignment LTI'
        );

        assert.strictEqual(
            patcher.countOccurrences(
                patched,
                "ltiLaunchReference = require('./lib/lti-launch-reference')"
            ),
            1
        );
        assert.strictEqual(
            patcher.countOccurrences(
                patched,
                'ltiLaunchReference.commit(req);'
            ),
            2
        );

        assert.ok(
            lms.text.indexOf('ltiLaunchReference.commit(req);') !== -1
        );
        assert.ok(
            lms.text.indexOf(
                "successRedirect: config.toValidPath('/just-logged-in')"
            ) === -1
        );
        assert.ok(lms.text.indexOf('req.session.save') !== -1);

        assert.ok(
            assignment.text.indexOf('ltiLaunchReference.commit(req);') !== -1
        );
        assert.ok(
            assignment.text.indexOf(
                "var destination = '/' + req.params.repository;"
            ) !== -1
        );
        assert.ok(assignment.text.indexOf('req.session.save') !== -1);

        assert.strictEqual(
            patcher.patchApp(patched),
            patched
        );
    });
});
