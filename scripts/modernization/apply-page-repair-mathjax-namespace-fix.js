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

    if (countOccurrences(source, before) !== 1) {
        throw new Error(
            label + ': expected exactly one integration anchor; found ' +
            countOccurrences(source, before)
        );
    }

    return source.replace(before, after);
}

function patchStaticAssetRoutes(source) {
    var anchor = [
        'function revalidatingStatic(directory) {',
        '    return express.static(',
        '        directory,',
        '        {',
        '            maxAge: 0,',
        '            setHeaders: function(res) {',
        "                res.setHeader(",
        "                    'Cache-Control',",
        "                    'public, no-cache'",
        '                );',
        '            }',
        '        }',
        '    );',
        '}',
        '',
        'function installVersionedNamespace('
    ].join('\n');

    var replacement = [
        'function revalidatingStatic(directory) {',
        '    return express.static(',
        '        directory,',
        '        {',
        '            maxAge: 0,',
        '            setHeaders: function(res) {',
        "                res.setHeader(",
        "                    'Cache-Control',",
        "                    'public, no-cache'",
        '                );',
        '            }',
        '        }',
        '    );',
        '}',
        '',
        'function repairTokenIsValid(value) {',
        "    return typeof value === 'string' &&",
        '        /^[A-Za-z0-9_-]{16,96}$/.test(value);',
        '}',
        '',
        'function installRepairNamespace(app, mountPath, directory) {',
        "    app.use(mountPath + '/:repairToken', function(req, res, next) {",
        '        if (!repairTokenIsValid(req.params.repairToken)) {',
        "            return res.status(404).send('Static asset not found.');",
        '        }',
        '',
        "        res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');",
        "        res.setHeader('Pragma', 'no-cache');",
        "        res.setHeader('Expires', '0');",
        '        next();',
        '    });',
        '',
        "    app.use(mountPath + '/:repairToken', express.static(directory, {maxAge: 0}));",
        "    app.use(mountPath + '/:repairToken', reservedStaticNotFound);",
        '}',
        '',
        'function installVersionedNamespace('
    ].join('\n');

    source = replaceOnce(
        source,
        anchor,
        replacement,
        'static asset repair namespace helpers'
    );

    var installAnchor = [
        '    installVersionedNamespace(',
        '        app,',
        "        '/node_modules',",
        "        path.join(root, 'node_modules'),",
        '        applicationVersion',
        '    );'
    ].join('\n');

    var installReplacement = [
        '    installRepairNamespace(',
        '        app,',
        "        '/node_modules/v' + applicationVersion + '/repair',",
        "        path.join(root, 'node_modules')",
        '    );',
        '',
        installAnchor
    ].join('\n');

    return replaceOnce(
        source,
        installAnchor,
        installReplacement,
        'node_modules repair namespace mount'
    );
}

function patchApplicationVersionPath(source) {
    var before = [
        'function versionedNodeModulesPath(version, path, repairToken) {',
        "    var suffix = String(path || '').replace(/^\\/+/, '');",
        '',
        '    return appendRepairToken(',
        "        '/node_modules/v' + version + '/' + suffix,",
        '        repairToken',
        '    );',
        '}'
    ].join('\n');

    var after = [
        'function versionedNodeModulesPath(version, path, repairToken) {',
        "    var suffix = String(path || '').replace(/^\\/+/, '');",
        "    var prefix = '/node_modules/v' + version + '/';",
        '',
        '    if (repairToken) {',
        "        prefix += 'repair/' + encodeURIComponent(repairToken) + '/';",
        '    }',
        '',
        '    return prefix + suffix;',
        '}'
    ].join('\n');

    return replaceOnce(
        source,
        before,
        after,
        'node_modules repair path namespace'
    );
}

function patchIntegrationPatcher(source) {
    var before = [
        '        \'function versionedNodeModulesPath(version, path, repairToken) {\',',
        '        "    var suffix = String(path || \'\').replace(/^\\\\/+/, \'\');",',
        "        '',",
        "        '    return appendRepairToken(',",
        '        "        \'/node_modules/v\' + version + \'/\' + suffix,",',
        "        '        repairToken',",
        "        '    );',",
        "        '}'"
    ].join('\n');

    var after = [
        '        \'function versionedNodeModulesPath(version, path, repairToken) {\',',
        '        "    var suffix = String(path || \'\').replace(/^\\\\/+/, \'\');",',
        '        "    var prefix = \'/node_modules/v\' + version + \'/\';",',
        "        '',",
        "        '    if (repairToken) {',",
        '        "        prefix += \'repair/\' + encodeURIComponent(repairToken) + \'/\';",',
        "        '    }',",
        "        '',",
        "        '    return prefix + suffix;',",
        "        '}'"
    ].join('\n');

    return replaceOnce(
        source,
        before,
        after,
        'integration patcher node_modules repair namespace'
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
    patchFile('lib/static-asset-routes.js', patchStaticAssetRoutes);
    patchFile('public/javascripts/application-version-path.js', patchApplicationVersionPath);
    patchFile('scripts/modernization/apply-page-repair-integration.js', patchIntegrationPatcher);
    console.log('PAGE REPAIR MATHJAX NAMESPACE FIX APPLIED');
}

module.exports = {
    countOccurrences: countOccurrences,
    patchStaticAssetRoutes: patchStaticAssetRoutes,
    patchApplicationVersionPath: patchApplicationVersionPath,
    patchIntegrationPatcher: patchIntegrationPatcher
};

if (require.main === module) {
    main();
}
