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

function patchLogin(source) {
    var staged = '            ltiLaunchReference.stage(req, bridge);';

    if (source.indexOf(staged) !== -1) {
        if (countOccurrences(source, staged) !== 1) {
            throw new Error('Expected exactly one staged LTI launch reference.');
        }
        return source;
    }

    return replaceOnce(
        source,
        '            ltiLaunchReference.record(req, bridge);',
        staged,
        'pre-login launch-reference recording'
    );
}

function patchApp(source) {
    var importNeedle =
        "ltiLaunchReference = require('./lib/lti-launch-reference')";
    var legacyImport =
        "  , legacyHttpClient = require('./lib/legacy-http-client')\n";
    var imported =
        legacyImport +
        "  , ltiLaunchReference = require('./lib/lti-launch-reference')\n";

    var legacyLms =
        "        app.post('/lms', passport.authenticate('lms', {\n" +
        "            successRedirect: config.toValidPath('/just-logged-in'),\n" +
        "\t\t\t\t\t\t\tfailureRedirect: '/',\n" +
        "\t\t\t\t\t\t\tfailureFlash: true}));";

    var integratedLms =
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
        "                 });";

    var legacyAssignmentHandler =
        "                 function(req, res, next) {\n" +
        "                     var destination = '/' + req.params.repository;";
    var integratedAssignmentHandler =
        "                 function(req, res, next) {\n" +
        "                     ltiLaunchReference.commit(req);\n" +
        "                     var destination = '/' + req.params.repository;";

    if (source.indexOf(importNeedle) === -1) {
        source = replaceOnce(
            source,
            legacyImport,
            imported,
            'app launch-reference import'
        );
    }

    if (countOccurrences(source, importNeedle) !== 1) {
        throw new Error('Expected exactly one LTI launch-reference import.');
    }

    if (source.indexOf(integratedLms) === -1) {
        source = replaceOnce(
            source,
            legacyLms,
            integratedLms,
            'legacy /lms authenticate route'
        );
    }

    if (countOccurrences(source, integratedLms) !== 1) {
        throw new Error('Expected exactly one integrated /lms route.');
    }

    if (source.indexOf(integratedAssignmentHandler) === -1) {
        source = replaceOnce(
            source,
            legacyAssignmentHandler,
            integratedAssignmentHandler,
            'assignment LTI post-auth handler'
        );
    }

    if (countOccurrences(source, integratedAssignmentHandler) !== 1) {
        throw new Error('Expected exactly one integrated assignment LTI handler.');
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

if (require.main === module) {
    patchFile('login/index.js', patchLogin);
    patchFile('app.js', patchApp);
    console.log('LTI LAUNCH SESSION FIX PATCH APPLIED');
}
