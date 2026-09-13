#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..', '..');

function countOccurrences(source, needle) {
    return source.split(needle).length - 1;
}

function replaceOnce(source, before, after, label) {
    if (source.indexOf(after) !== -1) {
        return source;
    }

    var count = countOccurrences(source, before);
    if (count !== 1) {
        throw new Error(label + ': expected exactly one anchor; found ' + count);
    }

    return source.replace(before, after);
}

function patchApp(source) {
    var before = [
        "    app.use(function(req, res, next) {",
        "        if (req.method === 'GET') {",
        "            res.set(",
        "                'Cache-Control',",
        "                'private, no-cache'",
        "            );",
        "        }",
        "        next();",
        "    });"
    ].join('\n');

    var after = [
        "    app.use(function(req, res, next) {",
        "        if (",
        "            req.method === 'GET' &&",
        "            !res.locals.xronosRepairToken",
        "        ) {",
        "            res.set(",
        "                'Cache-Control',",
        "                'private, no-cache'",
        "            );",
        "        }",
        "        next();",
        "    });"
    ].join('\n');

    return replaceOnce(
        source,
        before,
        after,
        'app.js repair cache-policy guard'
    );
}

function patchIntegrationPatcher(source) {
    var before = [
        "    var anchor = [",
        "        \"    require('./lib/static-asset-routes').install(\","
    ].join('\n');

    if (source.indexOf('repair cache-policy guard') !== -1) {
        return source;
    }

    if (source.indexOf(before) === -1) {
        throw new Error('integration patcher: expected patchApp anchor not found');
    }

    var functionEnd = "    return replaceOnce(source, anchor, replacement, 'app.js page repair middleware');\n}" ;
    var replacementEnd = [
        "    source = replaceOnce(source, anchor, replacement, 'app.js page repair middleware');",
        "",
        "    var cacheBefore = [",
        "        \"    app.use(function(req, res, next) {\",",
        "        \"        if (req.method === 'GET') {\",",
        "        \"            res.set(\",",
        "        \"                'Cache-Control',\",",
        "        \"                'private, no-cache'\",",
        "        \"            );\",",
        "        \"        }\",",
        "        \"        next();\",",
        "        \"    });\"",
        "    ].join('\\n');",
        "",
        "    var cacheAfter = [",
        "        \"    app.use(function(req, res, next) {\",",
        "        \"        if (\",",
        "        \"            req.method === 'GET' &&\",",
        "        \"            !res.locals.xronosRepairToken\",",
        "        \"        ) {\",",
        "        \"            res.set(\",",
        "        \"                'Cache-Control',\",",
        "        \"                'private, no-cache'\",",
        "        \"            );\",",
        "        \"        }\",",
        "        \"        next();\",",
        "        \"    });\"",
        "    ].join('\\n');",
        "",
        "    return replaceOnce(",
        "        source,",
        "        cacheBefore,",
        "        cacheAfter,",
        "        'app.js repair cache-policy guard'",
        "    );",
        "}"
    ].join('\n');

    return replaceOnce(
        source,
        functionEnd,
        replacementEnd,
        'integration patcher repair cache-policy guard'
    );
}

function patchFile(relativePath, patcher) {
    var filename = path.join(ROOT, relativePath);
    var original = fs.readFileSync(filename, 'utf8');
    var patched = patcher(original);

    if (patched === original) {
        console.log('Already fixed:', relativePath);
        return false;
    }

    fs.writeFileSync(filename, patched);
    console.log('Patched:', relativePath);
    return true;
}

function main() {
    patchFile('app.js', patchApp);
    patchFile(
        'scripts/modernization/apply-page-repair-integration.js',
        patchIntegrationPatcher
    );
    console.log('PAGE REPAIR CACHE POLICY FIX APPLIED');
}

module.exports = {
    countOccurrences: countOccurrences,
    patchApp: patchApp,
    patchIntegrationPatcher: patchIntegrationPatcher
};

if (require.main === module) {
    main();
}
