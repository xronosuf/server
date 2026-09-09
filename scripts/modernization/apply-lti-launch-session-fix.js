'use strict';

var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '../..');

function replaceOnce(source, before, after, label) {
    var first = source.indexOf(before);
    var second = first === -1 ? -1 : source.indexOf(before, first + 1);

    if (first === -1) {
        throw new Error('Could not find expected ' + label + ' block.');
    }

    if (second !== -1) {
        throw new Error('Expected exactly one ' + label + ' block.');
    }

    return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceBetweenOnce(source, startMarker, endMarker, replacement, label) {
    var start = source.indexOf(startMarker);
    var secondStart = start === -1 ? -1 : source.indexOf(startMarker, start + 1);
    var end = start === -1 ? -1 : source.indexOf(endMarker, start + startMarker.length);

    if (start === -1 || end === -1) {
        throw new Error('Could not find expected ' + label + ' block.');
    }

    if (secondStart !== -1) {
        throw new Error('Expected exactly one ' + label + ' start marker.');
    }

    return source.slice(0, start) + replacement + source.slice(end);
}

function patchLogin(source) {
    if (source.indexOf('ltiLaunchReference.stage(req, bridge);') !== -1) {
        return source;
    }

    return replaceOnce(
        source,
        '            ltiLaunchReference.record(req, bridge);',
        '            ltiLaunchReference.stage(req, bridge);',
        'pre-login launch-reference recording'
    );
}

function patchApp(source) {
    if (
        source.indexOf("var ltiLaunchReference = require('./lib/lti-launch-reference');") === -1
    ) {
        source = replaceOnce(
            source,
            "  , legacyHttpClient = require('./lib/legacy-http-client')\n",
            "  , legacyHttpClient = require('./lib/legacy-http-client')\n" +
            "  , ltiLaunchReference = require('./lib/lti-launch-reference')\n",
            'app launch-reference import'
        );
    }

    if (
        source.indexOf("app.post('/lms', passport.authenticate('lms', {\n" +
            "            failureRedirect: '/',\n" +
            "            failureFlash: true\n" +
            "        }), function(req, res) {\n" +
            "            ltiLaunchReference.commit(req);") === -1
    ) {
        var lmsStart = "        app.post('/lms', passport.authenticate('lms', {\n";
        var lmsEnd = "        app.post('/:repository/:path(*)/lti',\n";
        var lmsReplacement =
            "        app.post('/lms', passport.authenticate('lms', {\n" +
            "            failureRedirect: '/',\n" +
            "            failureFlash: true\n" +
            "        }), function(req, res) {\n" +
            "            ltiLaunchReference.commit(req);\n" +
            "            res.redirect(config.toValidPath('/just-logged-in'));\n" +
            "        });\n";

        source = replaceBetweenOnce(
            source,
            lmsStart,
            lmsEnd,
            lmsReplacement,
            'legacy /lms authenticate route'
        );
    }

    if (
        source.indexOf("passport.authenticate('lms', { failureRedirect: '/' }),\n" +
            "                 function(req, res, next) {\n" +
            "                     ltiLaunchReference.commit(req);") === -1
    ) {
        source = replaceOnce(
            source,
            "passport.authenticate('lms', { failureRedirect: '/' }),\n" +
            "                 function(req, res, next) {\n" +
            "                     var destination = '/' + req.params.repository;",
            "passport.authenticate('lms', { failureRedirect: '/' }),\n" +
            "                 function(req, res, next) {\n" +
            "                     ltiLaunchReference.commit(req);\n" +
            "                     var destination = '/' + req.params.repository;",
            'assignment LTI post-auth route'
        );
    }

    return source;
}

function patchFile(relativePath, patcher) {
    var filename = path.join(root, relativePath);
    var original = fs.readFileSync(filename, 'utf8');
    var updated = patcher(original);

    if (updated === original) {
        console.log('Already integrated ' + relativePath);
        return;
    }

    fs.writeFileSync(filename, updated, 'utf8');
    console.log('Patched ' + relativePath);
}

exports.patchApp = patchApp;
exports.patchLogin = patchLogin;
exports.replaceBetweenOnce = replaceBetweenOnce;
exports.replaceOnce = replaceOnce;

if (require.main === module) {
    patchFile('login/index.js', patchLogin);
    patchFile('app.js', patchApp);
    console.log('LTI LAUNCH SESSION FIX PATCH APPLIED');
}
