var express = require('express');
var path = require('path');

function reservedStaticNotFound(req, res) {
    res.status(404).send('Static asset not found.');
}

function versionedStatic(directory) {
    return express.static(
        directory,
        {
            maxAge: '1y',
            immutable: true
        }
    );
}

function revalidatingStatic(directory) {
    return express.static(
        directory,
        {
            maxAge: 0,
            setHeaders: function(res) {
                res.setHeader(
                    'Cache-Control',
                    'public, no-cache'
                );
            }
        }
    );
}

function repairTokenIsValid(value) {
    return typeof value === 'string' &&
        /^[A-Za-z0-9_-]{16,96}$/.test(value);
}

function installRepairNamespace(app, mountPath, directory) {
    app.use(mountPath + '/:repairToken', function(req, res, next) {
        if (!repairTokenIsValid(req.params.repairToken)) {
            return res.status(404).send('Static asset not found.');
        }

        res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        next();
    });

    app.use(mountPath + '/:repairToken', express.static(directory, {maxAge: 0}));
    app.use(mountPath + '/:repairToken', reservedStaticNotFound);
}

function installVersionedNamespace(
    app,
    mountPath,
    directory,
    applicationVersion
) {
    var versionMount =
        mountPath + '/v' + applicationVersion;

    app.use(
        versionMount,
        versionedStatic(directory)
    );
    app.use(
        versionMount,
        reservedStaticNotFound
    );

    app.use(
        mountPath,
        revalidatingStatic(directory)
    );
    app.use(
        mountPath,
        reservedStaticNotFound
    );
}

function install(app, options) {
    var root = options.root;
    var applicationVersion =
        options.applicationVersion;

    installVersionedNamespace(
        app,
        '/public',
        path.join(root, 'public'),
        applicationVersion
    );

    installRepairNamespace(
        app,
        '/node_modules/v' + applicationVersion + '/repair',
        path.join(root, 'node_modules')
    );

    installVersionedNamespace(
        app,
        '/node_modules',
        path.join(root, 'node_modules'),
        applicationVersion
    );

    // Historical clients can still request the old Guppy mount. Keep it
    // available during migration, but never give this mutable URL a long
    // freshness lifetime. New code uses the versioned node_modules namespace.
    app.use(
        '/lib/guppy',
        revalidatingStatic(
            path.join(
                root,
                'node_modules/guppy-dev/lib'
            )
        )
    );
    app.use(
        '/lib/guppy',
        reservedStaticNotFound
    );
}

module.exports = {
    install: install,
    reservedStaticNotFound:
        reservedStaticNotFound
};
