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

function countOccurrences(source, needle) {
    var count = 0;
    var position = 0;

    while (true) {
        position = source.indexOf(needle, position);
        if (position === -1) {
            return count;
        }
        count += 1;
        position += needle.length;
    }
}

function routeBlock(source, startMarker, endMarker, label) {
    var start = source.indexOf(startMarker);
    var secondStart = start === -1
        ? -1
        : source.indexOf(startMarker, start + 1);
    var end = start === -1
        ? -1
        : source.indexOf(endMarker, start + startMarker.length);

    if (start === -1 || end === -1 || end <= start) {
        throw new Error('Could not locate expected ' + label + ' route.');
    }

    if (secondStart !== -1) {
        throw new Error('Expected exactly one ' + label + ' route.');
    }

    return {
        start: start,
        end: end,
        text: source.slice(start, end)
    };
}

function replaceRouteBlock(source, block, replacement) {
    return source.slice(0, block.start) + replacement + source.slice(block.end);
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
    var importNeedle =
        "ltiLaunchReference = require('./lib/lti-launch-reference')";
    var lmsStart =
        "        app.post('/lms', passport.authenticate('lms', {";
    var assignmentStart =
        "        app.post('/:repository/:path(*)/lti',";
    var afterLtiRoutes = "    }\n    \n    app.get('/logout'";
    var lms;
    var assignment;

    if (source.indexOf(importNeedle) === -1) {
        source = replaceOnce(
            source,
            "  , legacyHttpClient = require('./lib/legacy-http-client')\n",
            "  , legacyHttpClient = require('./lib/legacy-http-client')\n" +
            "  , ltiLaunchReference = require('./lib/lti-launch-reference')\n",
            'app launch-reference import'
        );
    }

    if (countOccurrences(source, importNeedle) !== 1) {
        throw new Error('Expected exactly one LTI launch-reference import.');
    }

    lms = routeBlock(
        source,
        lmsStart,
        assignmentStart,
        '/lms'
    );

    if (lms.text.indexOf('ltiLaunchReference.commit(req);') === -1) {
        if (
            lms.text.indexOf(
                "successRedirect: config.toValidPath('/just-logged-in')"
            ) === -1 ||
            lms.text.indexOf("failureRedirect: '/'") === -1
        ) {
            throw new Error('Legacy /lms route shape is not recognized.');
        }

        source = replaceRouteBlock(
            source,
            lms,
            "        app.post('/lms',\n" +
            "                 passport.authenticate('lms', {\n" +
            "                     failureRedirect: '/',\n" +
            "                     failureFlash: true\n" +
            "                 }),\n" +
            "                 function(req, res, next) {\n" +
            "                     ltiLaunchReference.commit(req);\n\n" +
            "                     if (req.session) {\n" +
            "                         req.session.save(function(err) {\n" +
            "                             if (err) {\n" +
            "                                 return next(err);\n" +
            "                             }\n" +
            "                             res.redirect(\n" +
            "                                 config.toValidPath('/just-logged-in')\n" +
            "                             );\n" +
            "                         });\n" +
            "                     } else {\n" +
            "                         res.redirect(\n" +
            "                             config.toValidPath('/just-logged-in')\n" +
            "                         );\n" +
            "                     }\n" +
            "                 });\n"
        );
    }

    assignment = routeBlock(
        source,
        assignmentStart,
        afterLtiRoutes,
        'assignment LTI'
    );

    if (assignment.text.indexOf('ltiLaunchReference.commit(req);') === -1) {
        source = replaceOnce(
            source,
            "                 function(req, res, next) {\n" +
            "                     var destination = '/' + req.params.repository;",
            "                 function(req, res, next) {\n" +
            "                     ltiLaunchReference.commit(req);\n" +
            "                     var destination = '/' + req.params.repository;",
            'assignment LTI post-auth handler'
        );
    }

    if (countOccurrences(source, 'ltiLaunchReference.commit(req);') !== 2) {
        throw new Error(
            'Expected exactly two post-auth launch-reference commits.'
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

exports.countOccurrences = countOccurrences;
exports.patchApp = patchApp;
exports.patchLogin = patchLogin;
exports.replaceOnce = replaceOnce;
exports.routeBlock = routeBlock;

if (require.main === module) {
    patchFile('login/index.js', patchLogin);
    patchFile('app.js', patchApp);
    console.log('LTI LAUNCH SESSION FIX PATCH APPLIED');
}
