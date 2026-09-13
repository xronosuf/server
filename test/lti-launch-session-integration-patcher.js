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

        assert.strictEqual(
            patcher.countOccurrences(
                patched,
                'ltiLaunchReference.stage(req, bridge);'
            ),
            1
        );
        assert.strictEqual(
            patcher.patchLogin(patched),
            patched
        );
    });

    it('applies only the three exact app integration edits and is idempotent', function() {
        var source = fs.readFileSync(
            path.join(root, 'app.js'),
            'utf8'
        );
        var patched = patcher.patchApp(source);

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
            patched.indexOf(
                "        app.post('/lms',\n" +
                "                 passport.authenticate('lms', {"
            ) !== -1
        );
        assert.ok(
            patched.indexOf(
                "config.toValidPath('/just-logged-in')"
            ) !== -1
        );
        assert.ok(
            patched.indexOf(
                "        app.post('/:repository/:path(*)/lti',"
            ) !== -1
        );
        assert.ok(
            patched.indexOf(
                "                 function(req, res, next) {\n" +
                "                     ltiLaunchReference.commit(req);\n" +
                "                     var destination = '/' + req.params.repository;"
            ) !== -1
        );
        assert.ok(
            patched.indexOf('req.session.save(function(err) {') !== -1
        );

        assert.strictEqual(
            patcher.patchApp(patched),
            patched
        );
    });
});
